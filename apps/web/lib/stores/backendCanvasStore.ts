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

// Helper: get the last fractional index from a sorted list
function getLastIndex(items: { fractionalIndex?: string }[]): string | null {
  if (items.length === 0) return null;
  return items[items.length - 1]?.fractionalIndex ?? null;
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

  // React Flow handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Manual actions
  addNode: (node: Omit<BackendNode, "fractionalIndex">) => void;
  addTableNode: (parentId?: string) => void;
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

    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, ...upserts],
      pendingEdgeRemovals: [...get().pendingEdgeRemovals, ...removedIds],
    });
  },

  onConnect: (connection) => {
    const lastEdgeIndex = getLastIndex(get().edges);
    const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);

    const newEdge: BackendEdge = {
      id: `edge-${Date.now()}`,
      source: connection.source!,
      target: connection.target!,
      type: "connection",
      fractionalIndex,
    };
    const next = addEdge(newEdge as any, get().edges as any) as any as BackendEdge[];
    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, newEdge],
    });
  },

  addNode: (nodeWithoutIndex) => {
    const lastNodeIndex = getLastIndex(get().nodes);
    const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
    const node: BackendNode = { ...nodeWithoutIndex, fractionalIndex } as BackendNode;
    const next = [...get().nodes, node];
    set({
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, node],
    });
  },

  addTableNode: (parentId) => {
    const lastNodeIndex = getLastIndex(get().nodes);
    const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
    const node: BackendNode = {
      id: crypto.randomUUID(),
      type: "entity",
      position: { x: 100, y: 100 },
      parentId,
      fractionalIndex,
      data: {
        label: "",
        columns: [{ name: "_id", type: "UUID", isPrimaryKey: true }] 
      }
    };
    const next = [...get().nodes, node];
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
    set({
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, updated],
    });
  },

  deleteNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      pendingNodeRemovals: [...get().pendingNodeRemovals, id],
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
