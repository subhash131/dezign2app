import { create } from "zustand";
import { BackendNode, BackendEdge, BackendCanvasView } from "@/types/canvas";
import {
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  addEdge,
  Connection,
} from "@xyflow/react";
import { generateKeyBetween } from "fractional-indexing";
import { isValidConnection } from "@workspace/backend/canvas/index";

// Helper: get the last fractional index from a sorted list
function getLastIndex(items: { fractionalIndex?: string }[]): string | null {
  if (items.length === 0) return null;
  return items[items.length - 1]?.fractionalIndex ?? null;
}

export function parseResourceHandle(handleId: string | null | undefined): {
  resourceType: "topics" | "streams" | "queues" | "channels";
  direction: "in" | "out";
  resourceId: string;
} | null {
  if (!handleId) return null;
  const parts = handleId.split(":");
  if (parts.length === 3) {
    const [resourceType, direction, resourceId] = parts;
    if (
      (resourceType === "topics" || resourceType === "streams" || resourceType === "queues" || resourceType === "channels") &&
      (direction === "in" || direction === "out")
    ) {
      return {
        resourceType: resourceType as any,
        direction: direction as any,
        resourceId: resourceId as string
      };
    }
  }
  return null;
}

interface BackendCanvasState {
  nodes: BackendNode[];
  edges: BackendEdge[];
  canvasView: BackendCanvasView;

  // Pending Convex sync ops
  pendingNodeUpserts: BackendNode[];
  pendingNodeRemovals: string[];
  pendingEdgeUpserts: BackendEdge[];
  pendingEdgeRemovals: string[];

  // Deletion confirmation
  nodesPendingDeletion: BackendNode[];
  setNodesPendingDeletion: (nodes: BackendNode[]) => void;

  // React Flow handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Manual actions
  addNode: (node: Omit<BackendNode, "fractionalIndex">) => void;
  addTableNode: (parentId?: string, position?: { x: number; y: number }) => void;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: Omit<BackendEdge, "fractionalIndex">) => void;
  updateEdge: (id: string, changes: Partial<BackendEdge>) => void;
  deleteEdge: (id: string) => void;

  // Bulk load from Convex (no pending ops)
  setNodesAndEdges: (nodes: BackendNode[], edges: BackendEdge[]) => void;
  setView: (view: BackendCanvasView) => void;

  // Called after Convex sync succeeds
  clearPending: (
    syncedNodeUpserts: BackendNode[],
    syncedNodeRemovals: string[],
    syncedEdgeUpserts: BackendEdge[],
    syncedEdgeRemovals: string[]
  ) => void;
  reset: () => void;
}

export const useBackendCanvasStore = create<BackendCanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  canvasView: "graph",
  pendingNodeUpserts: [],
  pendingNodeRemovals: [],
  pendingEdgeUpserts: [],
  pendingEdgeRemovals: [],
  nodesPendingDeletion: [],
  setNodesPendingDeletion: (nodes) => set({ nodesPendingDeletion: nodes }),

  onNodesChange: (changes) => {
    // Clamp negative positions for child nodes before applying changes
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        const node = get().nodes.find(n => n.id === change.id);
        if (node && node.parentId) {
           if (change.position.x < 0) change.position.x = 0;
           // Keep some top padding for the header
           if (change.position.y < 40) change.position.y = 40;
        }
      }
    }

    let next = applyNodeChanges(changes, get().nodes as any) as any as BackendNode[];
    
    // Auto-resize parent nodes if child nodes are dragged
    const positionChanges = changes.filter((c) => c.type === "position" && c.position);
    const autoResizedParentIds = new Set<string>();
    
    if (positionChanges.length > 0) {
      const nextNodesMap = new Map(next.map(n => [n.id, n]));
      const parentIdsToUpdate = new Set<string>();
      
      for (const change of positionChanges) {
        const node = nextNodesMap.get(change.id);
        if (node && node.parentId) {
          parentIdsToUpdate.add(node.parentId);
        }
      }
      
      for (const parentId of parentIdsToUpdate) {
        const parentNode = nextNodesMap.get(parentId);
        if (!parentNode) continue;
        
        const children = next.filter((n) => n.parentId === parentId);
        if (children.length === 0) continue;
        
        let maxX = 0;
        let maxY = 0;
        
        for (const child of children) {
          const childX = child.position.x;
          const childY = child.position.y;
          const childWidth = (child as any).measured?.width ?? child.width ?? 350;
          const childHeight = (child as any).measured?.height ?? child.height ?? 200;
          
          if (childX + childWidth > maxX) maxX = childX + childWidth;
          if (childY + childHeight > maxY) maxY = childY + childHeight;
        }
        
        const padding = 40;
        const currentWidth = (parentNode as any).measured?.width ?? parentNode.width ?? 450;
        const currentHeight = (parentNode as any).measured?.height ?? parentNode.height ?? 300;
        
        const newWidth = Math.max(currentWidth, maxX + padding);
        const newHeight = Math.max(currentHeight, maxY + padding);
        
        if (newWidth !== currentWidth || newHeight !== currentHeight) {
          const updatedParent = {
             ...parentNode,
             width: newWidth,
             height: newHeight,
             style: {
               ...parentNode.style,
               width: newWidth,
               height: newHeight,
             }
          };
          nextNodesMap.set(parentId, updatedParent);
          autoResizedParentIds.add(parentId);
        }
      }
      
      next = Array.from(nextNodesMap.values());
    }

    const removedIds: string[] = changes
      .filter((c) => c.type === "remove")
      .map((c: any) => c.id);

    const upserts = next.filter((n) =>
      changes.some((c: any) => c.id === n.id && c.type !== "remove") ||
      autoResizedParentIds.has(n.id)
    );

    set({
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, ...upserts],
      pendingNodeRemovals: [...get().pendingNodeRemovals, ...removedIds],
    });
  },

  onEdgesChange: (changes) => {
    const next = applyEdgeChanges(changes, get().edges as any) as any as BackendEdge[];
    const removedIds: string[] = changes
      .filter((c) => c.type === "remove")
      .map((c: any) => c.id);

    const upserts = next.filter((e) =>
      changes.some((c: any) => c.id === e.id && c.type !== "remove")
    );

    // Sync edge deletion back to node event dropdowns
    const removedEdges = get().edges.filter(e => removedIds.includes(e.id));
    
    removedEdges.forEach((edge) => {
      // 1. Check if it's a published event edge
      if (edge.sourceHandle?.startsWith("publishedEvents-out-")) {
        const eventId = edge.sourceHandle.replace("publishedEvents-out-", "");
        const sourceNode = get().nodes.find(n => n.id === edge.source);
        if (sourceNode && sourceNode.data.publishedEvents) {
          const updatedEvents = sourceNode.data.publishedEvents.map((ev: any) =>
            ev.id === eventId ? { ...ev, targetNodeId: "none" } : ev
          );
          get().updateNode(sourceNode.id, {
            data: { ...sourceNode.data, publishedEvents: updatedEvents }
          });
        }
      }
      
      // 2. Check if it's a consumed event edge
      if (edge.targetHandle?.startsWith("consumedEvents-in-")) {
        const eventId = edge.targetHandle.replace("consumedEvents-in-", "");
        const targetNode = get().nodes.find(n => n.id === edge.target);
        if (targetNode && targetNode.data.consumedEvents) {
          const updatedEvents = targetNode.data.consumedEvents.map((ev: any) =>
            ev.id === eventId ? { ...ev, targetNodeId: "none" } : ev
          );
          get().updateNode(targetNode.id, {
            data: { ...targetNode.data, consumedEvents: updatedEvents }
          });
        }
      }
    });

    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, ...upserts],
      pendingEdgeRemovals: [...get().pendingEdgeRemovals, ...removedIds],
    });
  },

  onConnect: (connection) => {
    const sourceNode = get().nodes.find(n => n.id === connection.source);
    const targetNode = get().nodes.find(n => n.id === connection.target);
    if (!sourceNode || !targetNode) return;

    const result = isValidConnection(
      sourceNode.type as any, connection.sourceHandle,
      targetNode.type as any, connection.targetHandle,
      { sourceNodeId: connection.source!, targetNodeId: connection.target!, existingEdges: get().edges as any }
    );
    
    if (!result.valid) {
      console.warn("Invalid connection attempted:", result.message);
      return;
    }

    const edgeType = result.edgeType;
    const isColumnToColumn = edgeType === "foreign-key";
    const isPublishedConnect = connection.sourceHandle?.startsWith('publishedEvents-out-');
    const isConsumedConnect = connection.targetHandle?.startsWith('consumedEvents-in-');

    const parsedTarget = parseResourceHandle(connection.targetHandle);
    const parsedSource = parseResourceHandle(connection.sourceHandle);

    const targetResourceId = parsedTarget?.resourceId;
    const sourceResourceId = parsedSource?.resourceId;
    const resourceType = parsedTarget?.resourceType || parsedSource?.resourceType;

    const lastEdgeIndex = getLastIndex(get().edges);
    const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);

    const newEdge: BackendEdge = {
      id: `edge-${Date.now()}`,
      source: connection.source!,
      target: connection.target!,
      type: edgeType as any,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      fractionalIndex,
      targetResourceId,
      sourceResourceId,
      resourceType,
    };
    
    // Update targetNodeId on service events if connected via messaging handles
    if (isPublishedConnect && connection.sourceHandle) {
      const eventId = connection.sourceHandle.replace('publishedEvents-out-', '');
      if (sourceNode.data.publishedEvents) {
        const updatedEvents = sourceNode.data.publishedEvents.map((ev: any) =>
          ev.id === eventId ? { ...ev, targetNodeId: connection.target } : ev
        );
        get().updateNode(sourceNode.id, {
          data: { ...sourceNode.data, publishedEvents: updatedEvents }
        });
      }
    }

    if (isConsumedConnect && connection.targetHandle) {
      const eventId = connection.targetHandle.replace('consumedEvents-in-', '');
      if (targetNode.data.consumedEvents) {
        const updatedEvents = targetNode.data.consumedEvents.map((ev: any) =>
          ev.id === eventId ? { ...ev, targetNodeId: connection.source } : ev
        );
        get().updateNode(targetNode.id, {
          data: { ...targetNode.data, consumedEvents: updatedEvents }
        });
      }
    }

    // Update source node's column to isForeignKey: true if it's a foreign key edge
    if (isColumnToColumn && connection.sourceHandle?.startsWith('source-')) {
       const colIndex = parseInt(connection.sourceHandle.replace('source-', ''), 10);
       if (!isNaN(colIndex) && sourceNode.data.columns) {
           const column = sourceNode.data.columns[colIndex];
           if (column) {
               const newCols = [...sourceNode.data.columns];
               newCols[colIndex] = { ...column, isForeignKey: true };
               get().updateNode(sourceNode.id, { data: { ...sourceNode.data, columns: newCols } });
           }
       }
    }

    const next = addEdge(newEdge as any, get().edges as any) as any as BackendEdge[];
    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, newEdge],
    });
  },

  addNode: (nodeWithoutIndex) => {
    const lastNodeIndex = getLastIndex(get().nodes);
    const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
    const node: BackendNode = { ...nodeWithoutIndex, fractionalIndex, selected: true } as BackendNode;
    const next = [...get().nodes.map(n => ({ ...n, selected: false })), node];
    set({
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, node],
    });
  },

  addTableNode: (parentId, position) => {
    const lastNodeIndex = getLastIndex(get().nodes);
    const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
    const node: BackendNode = {
      id: crypto.randomUUID(),
      type: "entity",
      position: position || { x: 100, y: 100 },
      parentId,
      fractionalIndex,
      data: {
        label: "",
        columns: [{ name: "_id", type: "UUID", isPrimaryKey: true }] 
      },
      selected: true
    };
    const next = [...get().nodes.map(n => ({ ...n, selected: false })), node];
    set({
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, node],
    });
  },

  updateNode: (id, changes) => {
    console.log("backendCanvasStore: updateNode called for id", id, changes);
    const next = get().nodes.map((n) => (n.id === id ? { ...n, ...changes } : n));
    const updated = next.find((n) => n.id === id)!;
    console.log("backendCanvasStore: adding to pendingNodeUpserts", updated);

    // Bidirectional sync: sync dropdown updates to edges
    let nextEdges = [...get().edges];
    let edgesChanged = false;

    if (changes.data?.publishedEvents) {
      const existingPublishEdges = nextEdges.filter(
        (e) => e.source === id && e.sourceHandle?.startsWith("publishedEvents-out-")
      );
      
      const currentEvents = changes.data.publishedEvents;
      
      // 1. Remove edges that are no longer referenced or changed targetNodeId
      existingPublishEdges.forEach((edge) => {
        const eventId = edge.sourceHandle?.replace("publishedEvents-out-", "");
        const ev = currentEvents.find((e: any) => e.id === eventId);
        if (!ev || ev.targetNodeId !== edge.target || ev.targetNodeId === "none") {
          nextEdges = nextEdges.filter((e) => e.id !== edge.id);
          edgesChanged = true;
          set({ pendingEdgeRemovals: [...get().pendingEdgeRemovals, edge.id] });
        }
      });

      // 2. Add edges for newly selected targetNodeId
      currentEvents.forEach((ev: any) => {
        if (ev.targetNodeId && ev.targetNodeId !== "none") {
          const hasEdge = existingPublishEdges.some(
            (e) => e.sourceHandle === `publishedEvents-out-${ev.id}` && e.target === ev.targetNodeId
          );
          if (!hasEdge) {
            const lastEdgeIndex = getLastIndex(nextEdges);
            const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
            const newEdge: BackendEdge = {
              id: `edge-${Date.now()}-${ev.id}`,
              source: id,
              target: ev.targetNodeId,
              type: "message",
              sourceHandle: `publishedEvents-out-${ev.id}`,
              targetHandle: null,
              fractionalIndex,
            };
            nextEdges.push(newEdge);
            edgesChanged = true;
            set({ pendingEdgeUpserts: [...get().pendingEdgeUpserts, newEdge] });
          }
        }
      });
    }

    if (changes.data?.consumedEvents) {
      const existingConsumeEdges = nextEdges.filter(
        (e) => e.target === id && e.targetHandle?.startsWith("consumedEvents-in-")
      );
      
      const currentEvents = changes.data.consumedEvents;

      // 1. Remove edges that are no longer referenced or changed
      existingConsumeEdges.forEach((edge) => {
        const eventId = edge.targetHandle?.replace("consumedEvents-in-", "");
        const ev = currentEvents.find((e: any) => e.id === eventId);
        if (!ev || ev.targetNodeId !== edge.source || ev.targetNodeId === "none") {
          nextEdges = nextEdges.filter((e) => e.id !== edge.id);
          edgesChanged = true;
          set({ pendingEdgeRemovals: [...get().pendingEdgeRemovals, edge.id] });
        }
      });

      // 2. Add edges for newly selected targetNodeId
      currentEvents.forEach((ev: any) => {
        if (ev.targetNodeId && ev.targetNodeId !== "none") {
          const hasEdge = existingConsumeEdges.some(
            (e) => e.targetHandle === `consumedEvents-in-${ev.id}` && e.source === ev.targetNodeId
          );
          if (!hasEdge) {
            const lastEdgeIndex = getLastIndex(nextEdges);
            const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
            const newEdge: BackendEdge = {
              id: `edge-${Date.now()}-${ev.id}`,
              source: ev.targetNodeId,
              target: id,
              type: "message",
              sourceHandle: null,
              targetHandle: `consumedEvents-in-${ev.id}`,
              fractionalIndex,
            };
            nextEdges.push(newEdge);
            edgesChanged = true;
            set({ pendingEdgeUpserts: [...get().pendingEdgeUpserts, newEdge] });
          }
        }
      });
    }

    const update: any = {
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, updated],
    };
    if (edgesChanged) {
      update.edges = nextEdges;
    }
    set(update);
  },


  deleteNode: (id) => {
    const getChildrenIds = (parentId: string): string[] => {
      const children = get().nodes.filter(n => n.parentId === parentId).map(n => n.id);
      let allIds = [...children];
      for (const childId of children) {
         allIds = [...allIds, ...getChildrenIds(childId)];
      }
      return allIds;
    };
    
    const idsToDelete = [id, ...getChildrenIds(id)];
    
    set({
      nodes: get().nodes.filter((n) => !idsToDelete.includes(n.id)),
      edges: get().edges.filter((e) => !idsToDelete.includes(e.source) && !idsToDelete.includes(e.target)),
      pendingNodeRemovals: [...get().pendingNodeRemovals, ...idsToDelete],
    });
  },

  addEdge: (edgeWithoutIndex) => {
    const lastEdgeIndex = getLastIndex(get().edges);
    const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
    const edge: BackendEdge = { ...edgeWithoutIndex, fractionalIndex } as BackendEdge;
    const next = [...get().edges, edge];
    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, edge],
    });
  },

  updateEdge: (id, changes) => {
    const next = get().edges.map((e) => (e.id === id ? { ...e, ...changes } : e));
    const updated = next.find((e) => e.id === id)!;
    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, updated],
    });
  },

  deleteEdge: (id) => {
    set({
      edges: get().edges.filter((e) => e.id !== id),
      pendingEdgeRemovals: [...get().pendingEdgeRemovals, id],
    });
  },

  setNodesAndEdges: (nodes, edges) =>
    set({
      nodes,
      edges,
      pendingNodeUpserts: [],
      pendingNodeRemovals: [],
      pendingEdgeUpserts: [],
      pendingEdgeRemovals: [],
    }),

  setView: (view) => set({ canvasView: view }),

  clearPending: (syncedNodes, syncedNodeRemovals, syncedEdges, syncedEdgeRemovals) =>
    set((state) => ({
      pendingNodeUpserts: state.pendingNodeUpserts.filter(n => !syncedNodes.includes(n)),
      pendingNodeRemovals: state.pendingNodeRemovals.filter(id => !syncedNodeRemovals.includes(id)),
      pendingEdgeUpserts: state.pendingEdgeUpserts.filter(e => !syncedEdges.includes(e)),
      pendingEdgeRemovals: state.pendingEdgeRemovals.filter(id => !syncedEdgeRemovals.includes(id)),
    })),

  reset: () =>
    set({
      nodes: [],
      edges: [],
      pendingNodeUpserts: [],
      pendingNodeRemovals: [],
      pendingEdgeUpserts: [],
      pendingEdgeRemovals: [],
    }),
}));
