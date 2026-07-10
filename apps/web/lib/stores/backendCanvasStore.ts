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
  return items[items.length - 1].fractionalIndex ?? null;
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
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  deleteNode: (id: string) => void;
  addEdge: (edge: Omit<BackendEdge, "fractionalIndex">) => void;
  updateEdge: (id: string, changes: Partial<BackendEdge>) => void;
  deleteEdge: (id: string) => void;

  // Bulk load from Convex (no pending ops)
  setNodesAndEdges: (nodes: BackendNode[], edges: BackendEdge[]) => void;
  setView: (view: BackendCanvasView) => void;

  // Called after Convex sync succeeds
  clearPending: () => void;
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
    const next = applyNodeChanges(changes, get().nodes as any) as any as BackendNode[];
    const removedIds: string[] = changes
      .filter((c) => c.type === "remove")
      .map((c: any) => c.id);

    const updatedNodes = next;
    const upserts = updatedNodes.filter((n) =>
      changes.some((c: any) => c.id === n.id && c.type !== "remove")
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

  updateNode: (id, changes) => {
    const next = get().nodes.map((n) => (n.id === id ? { ...n, ...changes } : n));
    const updated = next.find((n) => n.id === id)!;
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

  clearPending: () =>
    set({
      pendingNodeUpserts: [],
      pendingNodeRemovals: [],
      pendingEdgeUpserts: [],
      pendingEdgeRemovals: [],
    }),

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
