import { BackendEdge } from "@/types/canvas";
import { isValidConnection } from "@workspace/canvas";
import {
  applyEdgeChanges,
  addEdge as addReactFlowEdge,
  EdgeChange,
  Connection,
} from "@xyflow/react";
import { generateKeyBetween } from "fractional-indexing";
import { BackendCanvasState } from "../types";
import { cleanupDeletedEdgesState } from "../stateCleanup";
import { getLastIndex, parseResourceHandle } from "../utils";
import {
  validateDatabaseEngine,
  autoDeriveForeignKeyHandles,
  handleDatabaseConnect,
  handleEventBrokerConnect,
  handleTransformerConnect,
  handleFrontendConnect,
  handleEndpointConnect,
  handleForeignKeyConnect,
  handleLangGraphConnect,
} from "../edge";

export interface EdgeSlice {
  edges: BackendEdge[];
  pendingEdgeUpserts: BackendEdge[];
  pendingEdgeRemovals: string[];
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addEdge: (edge: Omit<BackendEdge, "fractionalIndex">) => void;
  updateEdge: (id: string, changes: Partial<BackendEdge>) => void;
  deleteEdge: (id: string) => void;
}

export const createEdgeSlice = (
  set: (
    partial:
      | Partial<BackendCanvasState>
      | ((state: BackendCanvasState) => Partial<BackendCanvasState>),
  ) => void,
  get: () => BackendCanvasState,
): EdgeSlice => ({
  edges: [],
  pendingEdgeUpserts: [],
  pendingEdgeRemovals: [],

  onEdgesChange: (changes) => {
    const rawEdgesNext = applyEdgeChanges<BackendEdge>(changes, get().edges);
    const next = rawEdgesNext.filter((e): e is BackendEdge => Boolean(e?.id));
    const removedIds: string[] = changes
      .filter((c) => c.type === "remove")
      .map((c) => c.id);

    const persistentChangedEdgeIds = new Set(
      changes
        .filter((c) => c.type === "add" || c.type === "replace")
        .map((c) => c.id),
    );

    if (removedIds.length > 0) {
      const isSchema = get().edges.some(
        (e) =>
          removedIds.includes(e.id) &&
          (e.type === "foreign-key" || e.type === "database-connection"),
      );
      get().pushHistorySnapshot(isSchema ? "schema" : "graph");
    }

    const upserts = next.filter((e) => persistentChangedEdgeIds.has(e.id));

    let updates: Partial<BackendCanvasState> = {
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, ...upserts],
    };

    if (removedIds.length > 0) {
      const edgeCleanupUpdates = cleanupDeletedEdgesState(get(), removedIds);
      updates = { ...updates, ...edgeCleanupUpdates };
    }

    set(updates);
  },

  onConnect: (connection) => {
    const sourceNode = get().nodes.find((n) => n.id === connection.source);
    const targetNode = get().nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return;

    const result = isValidConnection(
      sourceNode.type,
      connection.sourceHandle,
      targetNode.type,
      connection.targetHandle,
      {
        sourceNodeId: connection.source!,
        targetNodeId: connection.target!,
        existingEdges: get().edges,
      },
    );

    if (!result.valid) {
      console.warn("Invalid connection attempted:", result.message);
      return;
    }

    // Enforce matching DB engine (Redis DB -> Redis Entity, SQL DB -> SQL/Doc Entity)
    if (!validateDatabaseEngine(sourceNode, targetNode)) {
      return;
    }

    const edgeType = result.edgeType;
    const isSchema =
      edgeType === "foreign-key" || edgeType === "database-connection";
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");

    const parsedTarget = parseResourceHandle(connection.targetHandle);
    const parsedSource = parseResourceHandle(connection.sourceHandle);

    const targetResourceId = parsedTarget?.resourceId;
    const sourceResourceId = parsedSource?.resourceId;
    const resourceType =
      parsedTarget?.resourceType || parsedSource?.resourceType;

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

    const next = addReactFlowEdge(newEdge, get().edges);
    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, newEdge],
    });

    const context = {
      set,
      get,
      connection,
      sourceNode,
      targetNode,
      newEdge,
    };

    // 1. Synchronize Database, Redis, and Auth nodes
    handleDatabaseConnect(context);

    // 2. Synchronize Event Broker IDs
    handleEventBrokerConnect(context);

    // 3. Handle Transformer connections (returns true if intercepted & direct edge removed)
    if (handleTransformerConnect(context)) {
      return;
    }

    // 4. Handle Frontend Hook & Component connections (returns true if intercepted & direct edge removed)
    if (handleFrontendConnect(context)) {
      return;
    }

    // 5. Handle Endpoint connections (returns true if intercepted & direct edge removed)
    if (handleEndpointConnect(context)) {
      return;
    }

    // 6. Handle LangGraph connections
    handleLangGraphConnect(context);

    // 7. Handle Foreign Key column-to-column metadata updates
    handleForeignKeyConnect(context);
  },

  addEdge: (edgeWithoutIndex) => {
    const nodes = get().nodes;
    const sourceExists = nodes.some((n) => n.id === edgeWithoutIndex.source);
    const targetExists = nodes.some((n) => n.id === edgeWithoutIndex.target);

    if (!sourceExists || !targetExists) {
      console.warn(
        `[addEdge] Aborting edge creation: source node "${edgeWithoutIndex.source}" (exists: ${sourceExists}) or target node "${edgeWithoutIndex.target}" (exists: ${targetExists}) was not found in canvas store.`,
      );
      return;
    }

    if (get().edges.some((e) => e.id === edgeWithoutIndex.id)) {
      return;
    }

    const lastEdgeIndex = getLastIndex(get().edges);
    const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
    let edge = { ...edgeWithoutIndex, fractionalIndex };

    // When AI creates a foreign-key edge (via add_edge) it never sets sourceHandle /
    // targetHandle, so ReactFlow falls back to the first handle it finds — which is
    // `database-entity-target` at the top of the card. Auto-derive column handles here.
    edge = autoDeriveForeignKeyHandles(edge, nodes);

    const isSchema =
      edge.type === "foreign-key" || edge.type === "database-connection";
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");
    const next = [...get().edges, edge];
    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, edge],
    });

    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (sourceNode && targetNode) {
      handleLangGraphConnect({
        set,
        get,
        connection: {
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? null,
          targetHandle: edge.targetHandle ?? null,
        },
        sourceNode,
        targetNode,
        newEdge: edge,
      });
    }
  },

  updateEdge: (id, changes) => {
    const edgeToUpdate = get().edges.find((e) => e.id === id);
    const isSchema =
      edgeToUpdate?.type === "foreign-key" ||
      edgeToUpdate?.type === "database-connection";
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");
    const next = get().edges.map((e) =>
      e.id === id ? { ...e, ...changes } : e,
    );
    const updated = next.find((e) => e.id === id)!;
    set({
      edges: next,
      pendingEdgeUpserts: [...get().pendingEdgeUpserts, updated],
    });
  },

  deleteEdge: (id) => {
    const edgeToDelete = get().edges.find((e) => e.id === id);
    const isSchema =
      edgeToDelete?.type === "foreign-key" ||
      edgeToDelete?.type === "database-connection";
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");
    const updates = cleanupDeletedEdgesState(get(), [id]);
    set(updates);
  },
});
