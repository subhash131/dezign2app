import { BackendEdge, FrontendActionStepDraft } from "@/types/canvas";
import { isValidConnection, normalizePageRoute, isBackendEdgeType } from "@workspace/canvas";
import { toast } from "sonner";
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
  handleDatabaseRefConnect,
  handleEventBrokerConnect,
  handleTransformerConnect,
  handleFrontendConnect,
  handleEndpointConnect,
  handleForeignKeyConnect,
  handleLangGraphConnect,
  handleRedisCacheConnect,
  handleStorageConnect,
  handleWebPageActionConnect,
  syncServiceBaseUrlToWebApp,
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

    // Enforce at most 1 layout node per WebApp section
    const webApp = sourceNode.type === "webApp" ? sourceNode : targetNode.type === "webApp" ? targetNode : null;
    const pageNode = sourceNode.type === "webPage" ? sourceNode : targetNode.type === "webPage" ? targetNode : null;
    if (webApp && pageNode) {
      const isLayout = Boolean(pageNode.data?.isLayout) || pageNode.data?.label?.trim().toLowerCase() === "layout";
      if (isLayout) {
        const zoneHandle = sourceNode.type === "webApp" ? connection.sourceHandle : connection.targetHandle;
        const existingEdges = get().edges.filter(
          (e) =>
            (e.source === webApp.id && e.sourceHandle === zoneHandle) ||
            (e.target === webApp.id && e.targetHandle === zoneHandle)
        );
        const alreadyHasLayout = existingEdges.some((e) => {
          const connectedPageId = e.source === webApp.id ? e.target : e.source;
          const otherNode = get().nodes.find((n) => n.id === connectedPageId);
          return otherNode?.id !== pageNode.id && (Boolean(otherNode?.data?.isLayout) || otherNode?.data?.label?.trim().toLowerCase() === "layout");
        });

        if (alreadyHasLayout) {
          toast.error("This section already has a layout node. Only 1 layout per section is allowed.");
          return;
        }
      } else {
        const normalizedTarget = normalizePageRoute(pageNode.data?.label || pageNode.data?.path || "");
        const connectedEdges = get().edges.filter(
          (e) => e.source === webApp.id || e.target === webApp.id,
        );
        const duplicatePage = connectedEdges
          .map((e) => get().nodes.find((n) => n.id === (e.source === webApp.id ? e.target : e.source)))
          .find((other) => {
            if (!other || other.id === pageNode.id || other.type !== "webPage") return false;
            if (other.data?.isLayout || other.data?.label?.trim().toLowerCase() === "layout") return false;
            return normalizePageRoute(other.data?.label || other.data?.path || "") === normalizedTarget;
          });

        if (duplicatePage) {
          toast.error(
            `A page with route "${normalizedTarget}" is already connected to this Web App (node "${duplicatePage.data?.label || "Page"}"). Route names must be unique.`,
          );
          return;
        }
      }
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

    const isActionHandle = connection.sourceHandle?.startsWith("events-");
    type ConnectionWithData = Connection & { data?: BackendEdge["data"] };
    const hasConnectionData = (conn: Connection): conn is ConnectionWithData =>
      "data" in conn && typeof conn === "object" && conn !== null;
    let initialData: BackendEdge["data"] = hasConnectionData(connection)
      ? connection.data
      : undefined;

    if (isActionHandle && sourceNode?.type === "webPage") {
      const existingActionEdges = get().edges.filter(
        (e) =>
          e.source === connection.source &&
          e.sourceHandle === connection.sourceHandle,
      );
      const stepNumber = existingActionEdges.length + 1;
      initialData = {
        ...initialData,
        label: String(stepNumber),
        sequenceOrder: stepNumber,
      };

      // Also ensure previous existing edges have sequenceOrder and label if missing
      if (
        existingActionEdges.some(
          (e) => !e.data?.label || e.data?.sequenceOrder === undefined,
        )
      ) {
        const sorted = [...existingActionEdges].sort(
          (a, b) => (a.data?.sequenceOrder ?? 0) - (b.data?.sequenceOrder ?? 0),
        );
        const map = new Map<string, number>();
        sorted.forEach((e, idx) => {
          map.set(e.id, idx + 1);
        });
        set({
          edges: get().edges.map((e) => {
            const ord = map.get(e.id);
            if (ord !== undefined) {
              return {
                ...e,
                data: {
                  ...e.data,
                  label: String(ord),
                  sequenceOrder: ord,
                },
              };
            }
            return e;
          }),
        });
      }
    }

    const newEdge: BackendEdge = {
      id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: connection.source!,
      target: connection.target!,
      type: isBackendEdgeType(edgeType) ? edgeType : "connection",
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      fractionalIndex,
      targetResourceId,
      sourceResourceId,
      resourceType,
      data: initialData,
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

    // 1.5. Handle DatabaseTableRefNode (db_ref) -> ServiceNode connections
    handleDatabaseRefConnect(context);

    // 2. Synchronize Event Broker IDs
    handleEventBrokerConnect(context);

    // 3. Handle Transformer connections (returns true if intercepted & direct edge removed)
    if (handleTransformerConnect(context)) {
      return;
    }

    // 3.5. Handle WebPage Action -> Endpoint / Storage request step auto-configuration
    handleWebPageActionConnect(context);

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

    // 7. Handle Redis Cache connections
    handleRedisCacheConnect(context);

    // 8. Handle Foreign Key column-to-column metadata updates
    handleForeignKeyConnect(context);

    // 9. Handle Storage bucket to StorageBucketRefNode reference connections
    handleStorageConnect(context);

    // 10. Sync Service base URL env vars if connecting WebApp <-> Service or WebApp <-> WebPage
    if (
      (sourceNode.type === "webApp" && (targetNode.type === "service" || targetNode.type === "serverless" || targetNode.type === "langgraph")) ||
      (targetNode.type === "webApp" && (sourceNode.type === "service" || sourceNode.type === "serverless" || sourceNode.type === "langgraph"))
    ) {
      const webApp = sourceNode.type === "webApp" ? sourceNode : targetNode;
      const srv = sourceNode.type === "webApp" ? targetNode : sourceNode;
      syncServiceBaseUrlToWebApp({
        webAppNode: webApp,
        serviceNode: srv,
        updateNode: get().updateNode,
      });
    } else if (
      (sourceNode.type === "webApp" && targetNode.type === "webPage") ||
      (targetNode.type === "webApp" && sourceNode.type === "webPage")
    ) {
      const webApp = sourceNode.type === "webApp" ? sourceNode : targetNode;
      const pageNode = sourceNode.type === "webApp" ? targetNode : sourceNode;
      const allSteps: FrontendActionStepDraft[] = [
        ...(pageNode.data?.sections || []).flatMap((s) => (s.actions || []).flatMap((a) => a.actionSteps || [])),
        ...(pageNode.data?.events || []).flatMap((e) => e.actionSteps || []),
        ...(pageNode.data?.realtimeConnections || []).flatMap((c) => c.actionSteps || []),
      ];
      const allNodes = get().nodes;
      for (const step of allSteps) {
        if (step?.type === "api_call" && step?.serviceNodeId) {
          const srvNode = allNodes.find((n) => n.id === step.serviceNodeId);
          if (srvNode) {
            syncServiceBaseUrlToWebApp({
              webAppNode: webApp,
              serviceNode: srvNode,
              updateNode: get().updateNode,
            });
          }
        }
      }
    }
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

    // Prevent duplicate edges between the exact same handles in edges
    const isDuplicate = get().edges.some(
      (e) =>
        e.id === edge.id ||
        (e.source === edge.source &&
          e.target === edge.target &&
          (e.sourceHandle ?? null) === (edge.sourceHandle ?? null) &&
          (e.targetHandle ?? null) === (edge.targetHandle ?? null)) ||
        (e.source === edge.target &&
          e.target === edge.source &&
          (e.sourceHandle ?? null) === (edge.targetHandle ?? null) &&
          (e.targetHandle ?? null) === (edge.sourceHandle ?? null)),
    );

    if (isDuplicate) {
      return;
    }

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
      const connContext = {
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
      };
      handleLangGraphConnect(connContext);
      handleRedisCacheConnect(connContext);
      handleWebPageActionConnect(connContext);
      handleDatabaseRefConnect(connContext);

      // Sync Service base URL env vars if connecting WebApp <-> Service or WebApp <-> WebPage
      if (
        (sourceNode.type === "webApp" && (targetNode.type === "service" || targetNode.type === "serverless" || targetNode.type === "langgraph")) ||
        (targetNode.type === "webApp" && (sourceNode.type === "service" || sourceNode.type === "serverless" || sourceNode.type === "langgraph"))
      ) {
        const webApp = sourceNode.type === "webApp" ? sourceNode : targetNode;
        const srv = sourceNode.type === "webApp" ? targetNode : sourceNode;
        syncServiceBaseUrlToWebApp({
          webAppNode: webApp,
          serviceNode: srv,
          updateNode: get().updateNode,
        });
      } else if (
        (sourceNode.type === "webApp" && targetNode.type === "webPage") ||
        (targetNode.type === "webApp" && sourceNode.type === "webPage")
      ) {
        const webApp = sourceNode.type === "webApp" ? sourceNode : targetNode;
        const pageNode = sourceNode.type === "webApp" ? targetNode : sourceNode;
        const allSteps: FrontendActionStepDraft[] = [
          ...(pageNode.data?.sections || []).flatMap((s) => (s.actions || []).flatMap((a) => a.actionSteps || [])),
          ...(pageNode.data?.events || []).flatMap((e) => e.actionSteps || []),
          ...(pageNode.data?.realtimeConnections || []).flatMap((c) => c.actionSteps || []),
        ];
        const allNodes = get().nodes;
        for (const step of allSteps) {
          if (step?.type === "api_call" && step?.serviceNodeId) {
            const srvNode = allNodes.find((n) => n.id === step.serviceNodeId);
            if (srvNode) {
              syncServiceBaseUrlToWebApp({
                webAppNode: webApp,
                serviceNode: srvNode,
                updateNode: get().updateNode,
              });
            }
          }
        }
      }
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
