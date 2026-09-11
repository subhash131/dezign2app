import { BackendNode } from "@/types/canvas";
import { applyNodeChanges, NodeChange } from "@xyflow/react";
import { BackendCanvasState } from "../types";
import {
  isSchemaNodeType,
  prepareNodeForAddition,
  createTableNode,
  createLangGraphStepNode,
  syncEntityRenameReferences,
  syncNodeDropdownEdges,
  executeNodeDeletion,
} from "../node";

export interface NodeSlice {
  nodes: BackendNode[];
  pendingNodeUpserts: BackendNode[];
  pendingNodeRemovals: string[];
  nodesPendingDeletion: BackendNode[];
  setNodesPendingDeletion: (nodes: BackendNode[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  addNode: (node: Omit<BackendNode, "fractionalIndex">) => void;
  addTableNode: (
    parentId?: string,
    position?: { x: number; y: number },
  ) => void;
  addLangGraphStepNode: (
    parentId: string,
    position?: { x: number; y: number },
    name?: string,
    stepType?: BackendNode["data"]["stepType"],
  ) => void;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  requestDeleteNode: (id: string) => void;
  requestDeleteNodes: (ids: string[]) => void;
}

export const createNodeSlice = (
  set: (
    partial:
      | Partial<BackendCanvasState>
      | ((state: BackendCanvasState) => Partial<BackendCanvasState>),
  ) => void,
  get: () => BackendCanvasState,
): NodeSlice => ({
  nodes: [],
  pendingNodeUpserts: [],
  pendingNodeRemovals: [],
  nodesPendingDeletion: [],

  setNodesPendingDeletion: (nodes) => set({ nodesPendingDeletion: nodes }),

  onNodesChange: (changes) => {
    const removedIds: string[] = changes
      .filter((c) => c.type === "remove")
      .map((c) => c.id);

    const nonRemoveChanges = changes.filter((c) => c.type !== "remove");

    let currentState = get();
    let updates: Partial<BackendCanvasState> = {};

    const persistentChangedNodeIds = new Set(
      nonRemoveChanges
        .filter((c) => {
          if (c.type === "add" || c.type === "replace") return true;
          if (c.type === "position" && !c.dragging && c.position) return true;
          return false;
        })
        .map((c) => c.id),
    );

    if (removedIds.length > 0) {
      updates = executeNodeDeletion(currentState, removedIds);
      currentState = { ...currentState, ...updates };
    }

    if (nonRemoveChanges.length > 0) {
      const rawNext = applyNodeChanges<BackendNode>(
        nonRemoveChanges,
        currentState.nodes,
      );
      const next = rawNext.filter((n): n is BackendNode => Boolean(n?.id));
      const upserts = next.filter((n) => persistentChangedNodeIds.has(n.id));

      updates = {
        ...updates,
        nodes: next,
        pendingNodeUpserts: [...get().pendingNodeUpserts, ...upserts],
      };
    }

    if (Object.keys(updates).length > 0) {
      set(updates);
    }
  },

  addNode: (nodeWithoutIndex) => {
    const isSchema = isSchemaNodeType(nodeWithoutIndex.type);
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");

    const prepared = prepareNodeForAddition(nodeWithoutIndex, get());
    set({
      nodes: prepared.nodes,
      edges: prepared.edges,
      endpoints: prepared.endpoints,
      pendingNodeUpserts: prepared.pendingNodes,
      pendingEdgeUpserts: prepared.pendingEdges,
      pendingEndpointUpserts: prepared.pendingEndpoints,
    });
  },

  addTableNode: (parentId, position) => {
    get().pushHistorySnapshot("schema");
    const { nextNodes, nextPendingNodes } = createTableNode(
      parentId,
      position,
      get(),
    );
    set({
      nodes: nextNodes,
      pendingNodeUpserts: nextPendingNodes,
    });
  },

  addLangGraphStepNode: (parentId, position, name, stepType) => {
    get().pushHistorySnapshot("graph");
    const { nextNodes, nextPendingNodes } = createLangGraphStepNode(
      parentId,
      position,
      name,
      stepType,
      get(),
    );
    set({
      nodes: nextNodes,
      pendingNodeUpserts: nextPendingNodes,
    });
  },

  updateNode: (id, changes) => {
    const updatedNode = get().nodes.find((n) => n.id === id);
    if (!updatedNode) return;

    const isSchema = isSchemaNodeType(updatedNode.type);
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");

    // 1. Sync entity table rename references across referencing columns
    const currentNodes = syncEntityRenameReferences(
      get().nodes,
      id,
      updatedNode,
      changes,
    );

    const nextNodes = currentNodes.map((n) =>
      n.id === id ? { ...n, ...changes } : n,
    );
    const updated = nextNodes.find((n) => n.id === id);
    if (!updated) return;

    // 2. Synchronize dropdown updates to canvas edges
    const edgeSync = syncNodeDropdownEdges(
      id,
      updatedNode,
      changes,
      get().edges,
      nextNodes,
    );

    const update: Partial<BackendCanvasState> = {
      nodes: nextNodes,
      pendingNodeUpserts: [...get().pendingNodeUpserts, updated],
      ...(edgeSync.edgesChanged ? { edges: edgeSync.nextEdges } : {}),
      ...(edgeSync.newPendingEdgeRemovals.length > 0
        ? {
            pendingEdgeRemovals: [
              ...get().pendingEdgeRemovals,
              ...edgeSync.newPendingEdgeRemovals,
            ],
          }
        : {}),
      ...(edgeSync.newPendingEdgeUpserts.length > 0
        ? {
            pendingEdgeUpserts: [
              ...get().pendingEdgeUpserts,
              ...edgeSync.newPendingEdgeUpserts,
            ],
          }
        : {}),
    };
    set(update);
  },

  deleteNode: (id) => {
    const updates = executeNodeDeletion(get(), [id]);
    set(updates);
  },

  deleteNodes: (ids) => {
    if (!ids || ids.length === 0) return;
    const updates = executeNodeDeletion(get(), ids);
    set(updates);
  },

  requestDeleteNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node) {
      set({ nodesPendingDeletion: [node] });
    }
  },

  requestDeleteNodes: (ids) => {
    const nodes = get().nodes.filter((n) => ids.includes(n.id));
    if (nodes.length > 0) {
      set({ nodesPendingDeletion: nodes });
    }
  },
});
