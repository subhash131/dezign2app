import { create } from "zustand";
import { BackendNode, BackendEdge, BackendCanvasView } from "@/types/canvas";
import {
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  addEdge,
  Connection,
  Node,
  Edge
} from "@xyflow/react";
import { PublishedEventInputType, ConsumedEventInputType, BackendNodeType, Endpoint, AnyMessagingResource } from "@workspace/canvas/types";
import { generateKeyBetween } from "fractional-indexing";
import { isValidConnection } from "@workspace/canvas";

// Helper: get the last fractional index from a sorted list
function getLastIndex(items: { fractionalIndex?: string }[]): string | null {
  if (items.length === 0) return null;
  return items[items.length - 1]?.fractionalIndex ?? null;
}

type MessagingResourceType = "topics" | "streams" | "queues" | "channels" | "caches";

function getMessagingResourceType(node: BackendNode): MessagingResourceType | null {
  switch (node.type) {
    case "kafka":
      return "topics";
    case "eventstream":
    case "redis-streams":
      return "streams";
    case "queue":
    case "sqs":
      return "queues";
    case "pubsub":
    case "redis-pubsub":
      return "channels";
    case "redis-cache":
      return "caches";
    default:
      return null;
  }
}

function syncConfiguredEventEdge(
  event: AnyMessagingResource,
  ownerNodeId: string,
  variant: "publish" | "consume",
  nodes: BackendNode[],
  edges: BackendEdge[],
): { edges: BackendEdge[]; added: BackendEdge[]; removed: string[] } {
  const handlePrefix = variant === "publish" ? "publishedEvents-out-" : "consumedEvents-in-";
  const eventHandle = `${handlePrefix}${event.id}`;
  const existing = edges.filter((edge) =>
    variant === "publish"
      ? edge.source === ownerNodeId && edge.sourceHandle === eventHandle
      : edge.target === ownerNodeId && edge.targetHandle === eventHandle,
  );

  const broker = nodes.find((node) => node.id === event.brokerNodeId);
  const resourceType = broker ? getMessagingResourceType(broker) : null;
  const hasSelection = Boolean(
    broker && resourceType && event.messagingResourceId && event.messagingResourceId !== "none",
  );

  let nextEdges = edges;
  const removed = existing
    .filter((edge) => {
      if (!hasSelection) return true;
      const expectedSource = variant === "publish" ? ownerNodeId : broker!.id;
      const expectedTarget = variant === "publish" ? broker!.id : ownerNodeId;
      const expectedSourceHandle = variant === "publish"
        ? eventHandle
        : `${resourceType}:out:${event.messagingResourceId}`;
      const expectedTargetHandle = variant === "publish"
        ? `${resourceType}:in:${event.messagingResourceId}`
        : eventHandle;
      return edge.source !== expectedSource ||
        edge.target !== expectedTarget ||
        edge.sourceHandle !== expectedSourceHandle ||
        edge.targetHandle !== expectedTargetHandle;
    })
    .map((edge) => edge.id);

  if (removed.length > 0) {
    nextEdges = nextEdges.filter((edge) => !removed.includes(edge.id));
  }

  const hasExpectedEdge = hasSelection && nextEdges.some((edge) => {
    if (variant === "publish") {
      return edge.source === ownerNodeId &&
        edge.target === broker!.id &&
        edge.sourceHandle === eventHandle &&
        edge.targetHandle === `${resourceType}:in:${event.messagingResourceId}`;
    }
    return edge.source === broker!.id &&
      edge.target === ownerNodeId &&
      edge.sourceHandle === `${resourceType}:out:${event.messagingResourceId}` &&
      edge.targetHandle === eventHandle;
  });

  if (!hasExpectedEdge && hasSelection) {
    const source = variant === "publish" ? ownerNodeId : broker!.id;
    const target = variant === "publish" ? broker!.id : ownerNodeId;
    const sourceHandle = variant === "publish"
      ? eventHandle
      : `${resourceType}:out:${event.messagingResourceId}`;
    const targetHandle = variant === "publish"
      ? `${resourceType}:in:${event.messagingResourceId}`
      : eventHandle;
    const edge: BackendEdge = {
      id: `edge-${Date.now()}-${event.id}`,
      source,
      target,
      type: "message",
      sourceHandle,
      targetHandle,
      sourceResourceId: variant === "publish" ? undefined : event.messagingResourceId,
      targetResourceId: variant === "publish" ? event.messagingResourceId : undefined,
      resourceType: resourceType ?? undefined,
      fractionalIndex: getLastIndex(nextEdges) === null
        ? generateKeyBetween(null, null)
        : generateKeyBetween(getLastIndex(nextEdges), null),
    };
    nextEdges = [...nextEdges, edge];
    return { edges: nextEdges, added: [edge], removed };
  }

  return { edges: nextEdges, added: [], removed };
}

export function parseResourceHandle(handleId: string | null | undefined): {
  resourceType: "topics" | "streams" | "queues" | "channels" | "caches";
  direction: "in" | "out";
  resourceId: string;
} | null {
  if (!handleId) return null;
  const parts = handleId.split(":");
  if (parts.length === 3) {
    const [resourceType, direction, resourceId] = parts;
    if (
      (resourceType === "topics" || resourceType === "streams" || resourceType === "queues" || resourceType === "channels" || resourceType === "caches") &&
      (direction === "in" || direction === "out")
    ) {
      return {
        resourceType: resourceType,
        direction: direction,
        resourceId: resourceId!
      };
    }
  }
  return null;
}

interface BackendCanvasState {
  nodes: BackendNode[];
  edges: BackendEdge[];
  canvasView: BackendCanvasView;

  endpoints: (Endpoint & { nodeId: string })[];
  events: (AnyMessagingResource & { nodeId: string, variant: 'publish' | 'consume' })[];
  activeConfigItem: { type: 'endpoint' | 'event', id: string, nodeId: string } | null;
  setActiveConfigItem: (item: { type: 'endpoint' | 'event', id: string, nodeId: string } | null) => void;

  // Pending Convex sync ops
  pendingNodeUpserts: BackendNode[];
  pendingNodeRemovals: string[];
  pendingEdgeUpserts: BackendEdge[];
  pendingEdgeRemovals: string[];
  pendingEndpointUpserts: (Endpoint & { nodeId: string })[];
  pendingEndpointRemovals: { nodeId: string, endpointId: string }[];
  pendingEventUpserts: (AnyMessagingResource & { nodeId: string, variant: 'publish' | 'consume' })[];
  pendingEventRemovals: { nodeId: string, eventId: string }[];

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
  
  addEndpoint: (nodeId: string, endpoint: Endpoint) => void;
  updateEndpoint: (id: string, changes: Partial<Endpoint>) => void;
  deleteEndpoint: (id: string) => void;

  addEvent: (nodeId: string, variant: 'publish' | 'consume', event: AnyMessagingResource) => void;
  updateEvent: (id: string, changes: Partial<AnyMessagingResource>) => void;
  deleteEvent: (id: string) => void;

  // Bulk load from Convex (no pending ops)
  setNodesAndEdges: (
    nodes: BackendNode[], 
    edges: BackendEdge[], 
    endpoints?: (Endpoint & { nodeId: string })[], 
    events?: (AnyMessagingResource & { nodeId: string, variant: 'publish' | 'consume' })[]
  ) => void;
  setView: (view: BackendCanvasView) => void;

  // Called after Convex sync succeeds
  clearPending: (
    syncedNodeUpserts: BackendNode[],
    syncedNodeRemovals: string[],
    syncedEdgeUpserts: BackendEdge[],
    syncedEdgeRemovals: string[],
    syncedEndpointUpserts?: (Endpoint & { nodeId: string })[],
    syncedEndpointRemovals?: { nodeId: string, endpointId: string }[],
    syncedEventUpserts?: (AnyMessagingResource & { nodeId: string, variant: 'publish' | 'consume' })[],
    syncedEventRemovals?: { nodeId: string, eventId: string }[]
  ) => void;
  reset: () => void;
}

export const useBackendCanvasStore = create<BackendCanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  endpoints: [],
  events: [],
  canvasView: "graph",
  activeConfigItem: null,
  setActiveConfigItem: (item) => set({ activeConfigItem: item }),
  pendingNodeUpserts: [],
  pendingNodeRemovals: [],
  pendingEdgeUpserts: [],
  pendingEdgeRemovals: [],
  pendingEndpointUpserts: [],
  pendingEndpointRemovals: [],
  pendingEventUpserts: [],
  pendingEventRemovals: [],
  nodesPendingDeletion: [],
  setNodesPendingDeletion: (nodes) => set({ nodesPendingDeletion: nodes }),

  onNodesChange: (changes) => {
    const next = applyNodeChanges<BackendNode>(changes, get().nodes);

    const removedIds: string[] = changes
      .filter((c) => c.type === "remove")
      .map((c) => c.id);

    const upserts = next.filter((n) =>
      changes.some((c) => c.id === n.id && c.type !== "remove")
    );

    set({
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, ...upserts],
      pendingNodeRemovals: [...get().pendingNodeRemovals, ...removedIds],
    });
  },

  onEdgesChange: (changes) => {
    const next = applyEdgeChanges<BackendEdge>(changes, get().edges);
    const removedIds: string[] = changes
      .filter((c) => c.type === "remove")
      .map((c) => c.id);

    const upserts = next.filter((e) =>
      changes.some((c) => c.id === e.id && c.type !== "remove")
    );

    // Sync edge deletion back to node event dropdowns
    const removedEdges = get().edges.filter(e => removedIds.includes(e.id));
    
    removedEdges.forEach((edge) => {
      if (edge.sourceHandle?.startsWith("publishedEvents-out-")) {
        const eventId = edge.sourceHandle.replace("publishedEvents-out-", "");
        get().updateEvent(eventId, { brokerNodeId: "" });
      }
      
      if (edge.targetHandle?.startsWith("consumedEvents-in-")) {
        const eventId = edge.targetHandle.replace("consumedEvents-in-", "");
        get().updateEvent(eventId, { brokerNodeId: "" });
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
      sourceNode.type, connection.sourceHandle,
      targetNode.type, connection.targetHandle,
      { sourceNodeId: connection.source!, targetNodeId: connection.target!, existingEdges: get().edges }
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
      type: edgeType as BackendEdge["type"],
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
      get().updateEvent(eventId, { brokerNodeId: connection.target ?? undefined });
    }

    if (isConsumedConnect && connection.targetHandle) {
      const eventId = connection.targetHandle.replace('consumedEvents-in-', '');
      get().updateEvent(eventId, { brokerNodeId: connection.source ?? undefined });
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

    const next = addEdge(newEdge, get().edges);
    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, newEdge],
    });
  },

  addNode: (nodeWithoutIndex) => {
    const lastNodeIndex = getLastIndex(get().nodes);
    const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
    const node = { ...nodeWithoutIndex, fractionalIndex, selected: true };
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
        const ev = currentEvents.find((e) => e.id === eventId);
        if (!ev || ev.targetNodeId !== edge.target || ev.targetNodeId === "none") {
          nextEdges = nextEdges.filter((e) => e.id !== edge.id);
          edgesChanged = true;
          set({ pendingEdgeRemovals: [...get().pendingEdgeRemovals, edge.id] });
        }
      });

      // 2. Add edges for newly selected targetNodeId
      currentEvents.forEach((ev: { id?: string; targetNodeId?: string }) => {
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
        const ev = currentEvents.find((e) => e.id === eventId);
        if (!ev || ev.targetNodeId !== edge.source || ev.targetNodeId === "none") {
          nextEdges = nextEdges.filter((e) => e.id !== edge.id);
          edgesChanged = true;
          set({ pendingEdgeRemovals: [...get().pendingEdgeRemovals, edge.id] });
        }
      });

      // 2. Add edges for newly selected targetNodeId
      currentEvents.forEach((ev: { id?: string; targetNodeId?: string }) => {
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

    const update: Partial<BackendCanvasState> = {
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
    const edge = { ...edgeWithoutIndex, fractionalIndex };
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

  addEndpoint: (nodeId, endpoint) => {
    const newEndpoint = { ...endpoint, nodeId };
    set({
      endpoints: [...get().endpoints, newEndpoint],
      pendingEndpointUpserts: [...get().pendingEndpointUpserts, newEndpoint]
    });
  },

  updateEndpoint: (id, changes) => {
    const next = get().endpoints.map(e => e.id === id ? { ...e, ...changes } : e);
    const updated = next.find(e => e.id === id);
    if (updated) {
      let nextEdges = get().edges;
      const addedEdges: BackendEdge[] = [];
      const removedEdgeIds: string[] = [];

      if (updated.publishedEvents) {
        for (const event of updated.publishedEvents) {
          const synced = syncConfiguredEventEdge(event, updated.nodeId, "publish", get().nodes, nextEdges);
          nextEdges = synced.edges;
          addedEdges.push(...synced.added);
          removedEdgeIds.push(...synced.removed);
        }
      }

      set({
        endpoints: next,
        edges: nextEdges,
        pendingEndpointUpserts: [...get().pendingEndpointUpserts, updated],
        pendingEdgeUpserts: [...get().pendingEdgeUpserts, ...addedEdges],
        pendingEdgeRemovals: [...get().pendingEdgeRemovals, ...removedEdgeIds],
      });
    }
  },

  deleteEndpoint: (id) => {
    const endpoint = get().endpoints.find(e => e.id === id);
    if (endpoint) {
      set({
        endpoints: get().endpoints.filter(e => e.id !== id),
        pendingEndpointRemovals: [...get().pendingEndpointRemovals, { nodeId: endpoint.nodeId, endpointId: id }]
      });
    }
  },

  addEvent: (nodeId, variant, event) => {
    const newEvent = { ...event, nodeId, variant };
    set({
      events: [...get().events, newEvent],
      pendingEventUpserts: [...get().pendingEventUpserts, newEvent]
    });
  },

  updateEvent: (id, changes) => {
    const next = get().events.map(e => e.id === id ? { ...e, ...changes } : e);
    const updated = next.find(e => e.id === id);
    if (updated) {
      const synced = syncConfiguredEventEdge(
        updated,
        updated.nodeId,
        updated.variant,
        get().nodes,
        get().edges,
      );
      set({
        events: next,
        edges: synced.edges,
        pendingEventUpserts: [...get().pendingEventUpserts, updated],
        pendingEdgeUpserts: [...get().pendingEdgeUpserts, ...synced.added],
        pendingEdgeRemovals: [...get().pendingEdgeRemovals, ...synced.removed],
      });
    }
  },

  deleteEvent: (id) => {
    const event = get().events.find(e => e.id === id);
    if (event) {
      set({
        events: get().events.filter(e => e.id !== id),
        pendingEventRemovals: [...get().pendingEventRemovals, { nodeId: event.nodeId, eventId: id }]
      });
    }
  },

  deleteEdge: (id) => {
    set({
      edges: get().edges.filter((e) => e.id !== id),
      pendingEdgeRemovals: [...get().pendingEdgeRemovals, id],
    });
  },

  setNodesAndEdges: (nodes, edges, endpoints = [], events = []) =>
    set({
      nodes,
      edges,
      endpoints,
      events,
      pendingNodeUpserts: [],
      pendingNodeRemovals: [],
      pendingEdgeUpserts: [],
      pendingEdgeRemovals: [],
      pendingEndpointUpserts: [],
      pendingEndpointRemovals: [],
      pendingEventUpserts: [],
      pendingEventRemovals: [],
    }),

  setView: (view) => set({ canvasView: view }),

  clearPending: (syncedNodes, syncedNodeRemovals, syncedEdges, syncedEdgeRemovals, syncedEndpointUpserts = [], syncedEndpointRemovals = [], syncedEventUpserts = [], syncedEventRemovals = []) =>
    set((state) => ({
      pendingNodeUpserts: state.pendingNodeUpserts.filter(n => !syncedNodes.includes(n)),
      pendingNodeRemovals: state.pendingNodeRemovals.filter(id => !syncedNodeRemovals.includes(id)),
      pendingEdgeUpserts: state.pendingEdgeUpserts.filter(e => !syncedEdges.includes(e)),
      pendingEdgeRemovals: state.pendingEdgeRemovals.filter(id => !syncedEdgeRemovals.includes(id)),
      pendingEndpointUpserts: state.pendingEndpointUpserts.filter(e => !syncedEndpointUpserts.includes(e)),
      pendingEndpointRemovals: state.pendingEndpointRemovals.filter(r => !syncedEndpointRemovals.some(sr => sr.endpointId === r.endpointId)),
      pendingEventUpserts: state.pendingEventUpserts.filter(e => !syncedEventUpserts.includes(e)),
      pendingEventRemovals: state.pendingEventRemovals.filter(r => !syncedEventRemovals.some(sr => sr.eventId === r.eventId)),
    })),

  reset: () =>
    set({
      nodes: [],
      edges: [],
      endpoints: [],
      events: [],
      pendingNodeUpserts: [],
      pendingNodeRemovals: [],
      pendingEdgeUpserts: [],
      pendingEdgeRemovals: [],
      pendingEndpointUpserts: [],
      pendingEndpointRemovals: [],
      pendingEventUpserts: [],
      pendingEventRemovals: [],
      activeConfigItem: null,
    }),
}));
