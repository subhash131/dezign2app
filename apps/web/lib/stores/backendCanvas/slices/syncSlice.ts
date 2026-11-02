import { BackendNode, BackendEdge, BackendCanvasView } from "@/types/canvas";
import {
  BackendCanvasState,
  ActiveConfigItem,
  EndpointWithNode,
  EventWithNode,
  IdentityProviderWithNode,
  PendingEndpointRemoval,
  PendingEventRemoval,
  PendingIdentityProviderRemoval,
} from "../types";

export interface SyncSlice {
  projectId: string | null;
  canvasView: BackendCanvasView;
  activeConfigItem: ActiveConfigItem | null;
  setActiveConfigItem: (item: ActiveConfigItem | null) => void;
  setNodesAndEdges: (
    nodes: BackendNode[],
    edges: BackendEdge[],
    endpoints?: EndpointWithNode[],
    events?: EventWithNode[],
    identityProviders?: IdentityProviderWithNode[],
    projectId?: string,
  ) => void;
  setView: (view: BackendCanvasView) => void;
  clearPending: (
    syncedNodes: BackendNode[],
    syncedNodeRemovals: string[],
    syncedEdges: BackendEdge[],
    syncedEdgeRemovals: string[],
    syncedEndpointUpserts?: EndpointWithNode[],
    syncedEndpointRemovals?: PendingEndpointRemoval[],
    syncedEventUpserts?: EventWithNode[],
    syncedEventRemovals?: PendingEventRemoval[],
    syncedIdentityProviderUpserts?: IdentityProviderWithNode[],
    syncedIdentityProviderRemovals?: PendingIdentityProviderRemoval[],
  ) => void;
  reset: (projectId?: string | null) => void;
}

function reconcileNodes(incoming: BackendNode[], existing: BackendNode[]): BackendNode[] {
  if (incoming.length === 0 && existing.length === 0) return existing;
  const existingMap = new Map(existing.map((n) => [n.id, n]));
  let hasChange = incoming.length !== existing.length;

  const nextNodes = incoming.map((item, idx) => {
    const prev = existingMap.get(item.id);
    if (!prev) {
      hasChange = true;
      return item;
    }
    const isSame =
      prev.position?.x === item.position?.x &&
      prev.position?.y === item.position?.y &&
      prev.parentId === item.parentId &&
      prev.type === item.type &&
      prev.fractionalIndex === item.fractionalIndex &&
      prev.selected === item.selected &&
      JSON.stringify(prev.data) === JSON.stringify(item.data) &&
      JSON.stringify(prev.style) === JSON.stringify(item.style);

    if (isSame) {
      if (existing[idx]?.id !== item.id) {
        hasChange = true;
      }
      return prev;
    }

    hasChange = true;
    return item;
  });

  return hasChange ? nextNodes : existing;
}

function reconcileEdges(incoming: BackendEdge[], existing: BackendEdge[]): BackendEdge[] {
  if (incoming.length === 0 && existing.length === 0) return existing;
  const existingMap = new Map(existing.map((e) => [e.id, e]));
  let hasChange = incoming.length !== existing.length;

  const nextEdges = incoming.map((item, idx) => {
    const prev = existingMap.get(item.id);
    if (!prev) {
      hasChange = true;
      return item;
    }
    const isSame =
      prev.source === item.source &&
      prev.target === item.target &&
      prev.sourceHandle === item.sourceHandle &&
      prev.targetHandle === item.targetHandle &&
      prev.type === item.type &&
      prev.fractionalIndex === item.fractionalIndex &&
      JSON.stringify(prev.data) === JSON.stringify(item.data);

    if (isSame) {
      if (existing[idx]?.id !== item.id) {
        hasChange = true;
      }
      return prev;
    }

    hasChange = true;
    return item;
  });

  return hasChange ? nextEdges : existing;
}

function reconcileEntities<T extends { id: string }>(incoming: T[], existing: T[]): T[] {
  if (incoming.length === 0 && existing.length === 0) return existing;
  const existingMap = new Map(existing.map((e) => [e.id, e]));
  let hasChange = incoming.length !== existing.length;

  const nextItems = incoming.map((item, idx) => {
    const prev = existingMap.get(item.id);
    if (!prev) {
      hasChange = true;
      return item;
    }
    if (JSON.stringify(prev) === JSON.stringify(item)) {
      if (existing[idx]?.id !== item.id) {
        hasChange = true;
      }
      return prev;
    }
    hasChange = true;
    return item;
  });

  return hasChange ? nextItems : existing;
}

export const createSyncSlice = (
  set: (
    partial:
      | Partial<BackendCanvasState>
      | ((state: BackendCanvasState) => Partial<BackendCanvasState>),
  ) => void,
): SyncSlice => ({
  projectId: null,
  canvasView: "graph",
  activeConfigItem: null,

  setActiveConfigItem: (item) => set({ activeConfigItem: item }),

  setNodesAndEdges: (
    nodes,
    edges,
    endpoints = [],
    events = [],
    identityProviders = [],
    projectId,
  ) =>
    set((state) => {
      const nextNodes = reconcileNodes(nodes, state.nodes);
      const nextEdges = reconcileEdges(edges, state.edges);
      const nextEndpoints = reconcileEntities(endpoints, state.endpoints);
      const nextEvents = reconcileEntities(events, state.events);
      const nextIdps = reconcileEntities(identityProviders, state.identityProviders);

      if (
        nextNodes === state.nodes &&
        nextEdges === state.edges &&
        nextEndpoints === state.endpoints &&
        nextEvents === state.events &&
        nextIdps === state.identityProviders &&
        (projectId === undefined || state.projectId === projectId)
      ) {
        return state;
      }

      return {
        ...(projectId !== undefined && { projectId }),
        nodes: nextNodes,
        edges: nextEdges,
        endpoints: nextEndpoints,
        events: nextEvents,
        identityProviders: nextIdps,
      };
    }),

  setView: (view) =>
    set((state) => {
      if (state.canvasView === view) return state;
      return {
        canvasView: view,
        canUndo:
          (view === "schema" ? state.schemaUndoStack : state.graphUndoStack)
            .length > 0,
        canRedo:
          (view === "schema" ? state.schemaRedoStack : state.graphRedoStack)
            .length > 0,
      };
    }),

  clearPending: (
    syncedNodes,
    syncedNodeRemovals,
    syncedEdges,
    syncedEdgeRemovals,
    syncedEndpointUpserts = [],
    syncedEndpointRemovals = [],
    syncedEventUpserts = [],
    syncedEventRemovals = [],
    syncedIdentityProviderUpserts = [],
    syncedIdentityProviderRemovals = [],
  ) =>
    set((state) => ({
      pendingNodeUpserts: state.pendingNodeUpserts.filter(
        (n) => !syncedNodes.includes(n),
      ),
      pendingNodeRemovals: state.pendingNodeRemovals.filter(
        (id) => !syncedNodeRemovals.includes(id),
      ),
      pendingEdgeUpserts: state.pendingEdgeUpserts.filter(
        (e) => !syncedEdges.includes(e),
      ),
      pendingEdgeRemovals: state.pendingEdgeRemovals.filter(
        (id) => !syncedEdgeRemovals.includes(id),
      ),
      pendingEndpointUpserts: state.pendingEndpointUpserts.filter(
        (e) => !syncedEndpointUpserts.includes(e),
      ),
      pendingEndpointRemovals: state.pendingEndpointRemovals.filter(
        (r) =>
          !syncedEndpointRemovals.some(
            (sr) => sr.nodeId === r.nodeId && sr.endpointId === r.endpointId,
          ),
      ),
      pendingEventUpserts: state.pendingEventUpserts.filter(
        (e) => !syncedEventUpserts.includes(e),
      ),
      pendingEventRemovals: state.pendingEventRemovals.filter(
        (r) =>
          !syncedEventRemovals.some(
            (sr) => sr.nodeId === r.nodeId && sr.eventId === r.eventId,
          ),
      ),
      pendingIdentityProviderUpserts:
        state.pendingIdentityProviderUpserts.filter(
          (p) => !syncedIdentityProviderUpserts.includes(p),
        ),
      pendingIdentityProviderRemovals:
        state.pendingIdentityProviderRemovals.filter(
          (r) =>
            !syncedIdentityProviderRemovals.some(
              (sr) => sr.nodeId === r.nodeId && sr.providerId === r.providerId,
            ),
        ),
    })),

  reset: (projectId = null) =>
    set({
      projectId,
      nodes: [],
      edges: [],
      endpoints: [],
      events: [],
      identityProviders: [],
      graphUndoStack: [],
      graphRedoStack: [],
      schemaUndoStack: [],
      schemaRedoStack: [],
      canUndo: false,
      canRedo: false,
      pendingNodeUpserts: [],
      pendingNodeRemovals: [],
      pendingEdgeUpserts: [],
      pendingEdgeRemovals: [],
      pendingEndpointUpserts: [],
      pendingEndpointRemovals: [],
      pendingEventUpserts: [],
      pendingEventRemovals: [],
      pendingIdentityProviderUpserts: [],
      pendingIdentityProviderRemovals: [],
      activeConfigItem: null,
    }),
});
