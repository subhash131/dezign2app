import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";
import { PipelineStepDraft } from "./types";

// ---------------------------------------------------------------------------
// Redis Cache Node & Edge Synchronization Helpers
// ---------------------------------------------------------------------------

export interface EnsureRedisCacheConnectionParams {
  schemaId?: string;
  instanceId?: string;
  serviceNodeId?: string;
  endpointId?: string;
  consumedEventId?: string;
}

/**
 * Ensures a RedisCacheNode (type="redis-cache") exists on canvas for the given schema/instance
 * and connects the ServiceNode endpoint handle to it.
 */
export function ensureRedisCacheConnection({
  schemaId,
  instanceId,
  serviceNodeId,
  endpointId,
  consumedEventId,
}: EnsureRedisCacheConnectionParams): string | undefined {
  if (!serviceNodeId) return undefined;
  const store = useBackendCanvasStore.getState();
  const allNodes = store.nodes;

  // 1. Look for an existing redis-cache node
  let cacheNode = allNodes.find(
    (n) =>
      n.type === "redis-cache" &&
      ((schemaId && schemaId !== "__direct__" && (n.data?.schemaRef === schemaId || n.id === schemaId)) ||
        (schemaId === "__direct__" && (n.data?.databaseId === instanceId || n.id === instanceId))),
  );

  // If not found by direct match, look by schemaRef
  if (!cacheNode && schemaId && schemaId !== "__direct__" && schemaId !== "__none__") {
    cacheNode = allNodes.find(
      (n) => n.type === "redis-cache" && n.data?.schemaRef === schemaId,
    );
  }

  // 2. If no redis-cache node exists, create one!
  if (!cacheNode) {
    const targetSchemaNode = allNodes.find((n) => n.id === schemaId);
    const serviceNode = allNodes.find((n) => n.id === serviceNodeId);
    const targetInstanceNode = allNodes.find(
      (n) => n.id === (instanceId || targetSchemaNode?.data?.databaseId),
    );

    const schemaLabel =
      targetSchemaNode?.data?.label ||
      (schemaId === "__direct__"
        ? `${targetInstanceNode?.data?.label || "Redis"} Direct`
        : "Redis Cache");

    const newCacheNodeId = crypto.randomUUID();
    const basePos = serviceNode?.position || targetSchemaNode?.position || { x: 300, y: 200 };

    const existingCacheNodes = allNodes.filter((n) => n.type === "redis-cache");
    const yOffset = existingCacheNodes.length * 90;
    const newPos = {
      x: basePos.x + 380,
      y: basePos.y + yOffset,
    };

    store.addNode({
      id: newCacheNodeId,
      type: "redis-cache",
      position: newPos,
      data: {
        label: schemaLabel,
        schemaRef:
          schemaId && schemaId !== "__direct__" && schemaId !== "__none__"
            ? schemaId
            : undefined,
        databaseId: instanceId || targetSchemaNode?.data?.databaseId,
        description: `Reference to ${schemaLabel}`,
      },
    });

    cacheNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === newCacheNodeId);
  }

  if (!cacheNode) return undefined;

  // 3. Draw edge from ServiceNode endpoint/event to RedisCacheNode database-target handle
  const sourceHandle = endpointId
    ? `endpoint-out-${endpointId}`
    : consumedEventId
    ? `consumedEvents-in-${consumedEventId}`
    : `endpoint-out-${serviceNodeId}`;

  const currentEdges = useBackendCanvasStore.getState().edges;
  const existingEdge = currentEdges.find(
    (e) =>
      e.source === serviceNodeId &&
      e.target === cacheNode!.id &&
      (e.sourceHandle === sourceHandle || !e.sourceHandle) &&
      (e.targetHandle === "database-target" || !e.targetHandle),
  );

  if (!existingEdge) {
    store.addEdge({
      id: `edge-rediscache-${serviceNodeId}-${endpointId || consumedEventId || "ep"}-${cacheNode.id}-${Date.now()}`,
      source: serviceNodeId,
      target: cacheNode.id,
      sourceHandle,
      targetHandle: "database-target",
      type: "connection",
    });
  }

  return cacheNode.id;
}

export interface CleanupRedisCacheConnectionParams {
  tableNodeId?: string;
  databaseId?: string;
  serviceNodeId?: string;
  endpointId?: string;
  consumedEventId?: string;
  remainingSteps: PipelineStepDraft[];
}

/**
 * Cleans up edge(s) connecting the service endpoint to a Redis cache node when
 * the step is deleted or no longer references that cache node.
 */
export function cleanupRedisCacheConnection({
  tableNodeId,
  databaseId,
  serviceNodeId,
  endpointId,
  consumedEventId,
  remainingSteps,
}: CleanupRedisCacheConnectionParams) {
  if (!serviceNodeId) return;
  const store = useBackendCanvasStore.getState();

  // Check if any other redis_operation in remainingSteps still uses this tableNodeId / databaseId
  const isStillUsed = remainingSteps.some(
    (s) =>
      s.type === "redis_operation" &&
      ((tableNodeId && s.tableNodeId === tableNodeId) ||
        (!tableNodeId && databaseId && s.databaseId === databaseId)),
  );
  if (isStillUsed) return;

  // Find matching redis-cache nodes
  const matchingCacheNodes = store.nodes.filter(
    (n) =>
      n.type === "redis-cache" &&
      ((tableNodeId && (n.id === tableNodeId || n.data?.schemaRef === tableNodeId)) ||
        (!tableNodeId && databaseId && n.data?.databaseId === databaseId)),
  );

  const matchingCacheNodeIds = new Set(matchingCacheNodes.map((n) => n.id));
  if (tableNodeId) matchingCacheNodeIds.add(tableNodeId);

  const sourceHandle = endpointId
    ? `endpoint-out-${endpointId}`
    : consumedEventId
    ? `consumedEvents-in-${consumedEventId}`
    : undefined;

  const edgesToDelete = store.edges.filter((e) => {
    if (e.source !== serviceNodeId) return false;
    if (!matchingCacheNodeIds.has(e.target)) return false;
    if (sourceHandle && e.sourceHandle && e.sourceHandle !== sourceHandle) return false;
    return true;
  });

  edgesToDelete.forEach((e) => store.deleteEdge(e.id));
}

// ---------------------------------------------------------------------------
// Database Table Ref Node & Function Edge Synchronization Helpers
// ---------------------------------------------------------------------------

export interface DatabaseRefConnectionResult {
  dbRefNodeId: string;
  edgeId?: string;
  functionName?: string;
}

export interface EnsureDatabaseRefConnectionParams {
  tableNodeId?: string;
  databaseId?: string;
  serviceNodeId?: string;
  endpointId?: string;
  consumedEventId?: string;
  functionName?: string;
}

export interface CleanupDatabaseRefConnectionParams {
  tableNodeId?: string;
  databaseId?: string;
  serviceNodeId?: string;
  endpointId?: string;
  consumedEventId?: string;
  functionName?: string;
  remainingSteps: PipelineStepDraft[];
}

/**
 * Ensures a single db_ref node exists for the target table/entity per service,
 * and creates an edge targeting the specific entity function handle (`func-${functionName}`).
 */
export function ensureDatabaseRefConnection({
  tableNodeId,
  databaseId,
  serviceNodeId,
  endpointId,
  consumedEventId,
  functionName,
}: EnsureDatabaseRefConnectionParams): DatabaseRefConnectionResult | undefined {
  if (!serviceNodeId) return undefined;

  const store = useBackendCanvasStore.getState();
  const allNodes = store.nodes;
  const edges = store.edges;

  // 1. Look for existing db_ref node for this entity/table associated with this server (serviceNodeId)
  // "1 db_ref for any entity per server"
  let dbRefNode = allNodes.find((n) => {
    if (n.type !== "db_ref") return false;
    const matchesTable =
      (tableNodeId && (n.data?.tableRef === tableNodeId || n.id === tableNodeId)) ||
      (!tableNodeId && databaseId && n.data?.databaseId === databaseId);
    if (!matchesTable) return false;

    // Check if this db_ref belongs to this server
    const isConnectedToThisService = edges.some(
      (e) => e.source === serviceNodeId && e.target === n.id,
    );
    const isTaggedForService = n.data?.targetServiceId === serviceNodeId;
    return isConnectedToThisService || isTaggedForService;
  });

  // If not found, check if an unattached db_ref (not belonging to any other server) matches tableRef
  if (!dbRefNode && tableNodeId) {
    dbRefNode = allNodes.find((n) => {
      if (n.type !== "db_ref") return false;
      const matchesTable = n.data?.tableRef === tableNodeId || n.id === tableNodeId;
      if (!matchesTable) return false;
      const isClaimedByOther =
        Boolean(n.data?.targetServiceId && n.data?.targetServiceId !== serviceNodeId) ||
        edges.some((e) => e.target === n.id && e.source !== serviceNodeId);
      return !isClaimedByOther;
    });
  }

  // 2. If no db_ref node exists, create one!
  if (!dbRefNode) {
    const targetEntityNode = allNodes.find(
      (n) => n.id === tableNodeId && (n.type === "entity" || n.type === "db_ref"),
    );
    const serviceNode = allNodes.find((n) => n.id === serviceNodeId);
    const targetDbNode = allNodes.find(
      (n) => n.id === (databaseId || targetEntityNode?.data?.databaseId),
    );

    const tableLabel =
      targetEntityNode?.data?.label ||
      (targetEntityNode?.type === "db_ref" ? targetEntityNode?.data?.label : undefined) ||
      "Table Ref";

    const newDbRefId = crypto.randomUUID();
    const basePos = serviceNode?.position || targetEntityNode?.position || { x: 300, y: 200 };

    const existingRefNodes = allNodes.filter(
      (n) => n.type === "db_ref" || n.type === "redis-cache",
    );
    const yOffset = existingRefNodes.length * 110;
    const newPos = {
      x: basePos.x + 380,
      y: basePos.y + yOffset,
    };

    store.addNode({
      id: newDbRefId,
      type: "db_ref",
      position: newPos,
      data: {
        label: tableLabel,
        tableRef: targetEntityNode?.type === "entity" ? targetEntityNode.id : tableNodeId,
        databaseId: databaseId || targetEntityNode?.data?.databaseId || targetDbNode?.id,
        targetServiceId: serviceNodeId,
        description: `Reference to ${tableLabel}`,
      },
    });

    dbRefNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === newDbRefId);
  }

  if (!dbRefNode) return undefined;

  // 3. Determine target handle: connect to specific function
  let resolvedFnName = functionName;
  const effectiveTableRef = dbRefNode.data?.tableRef || tableNodeId;
  if (!resolvedFnName && effectiveTableRef) {
    const refEntity = allNodes.find((n) => n.id === effectiveTableRef);
    if (refEntity) {
      const ops = getEntityDbOperations(refEntity, allNodes);
      if (ops.length > 0) {
        resolvedFnName = ops[0]?.name;
      }
    }
  }

  const targetHandle = resolvedFnName ? `func-${resolvedFnName}` : "database-target";

  // 4. Draw edge from ServiceNode endpoint/event to DatabaseTableRefNode function handle
  const sourceHandle = endpointId
    ? `endpoint-out-${endpointId}`
    : consumedEventId
    ? `consumedEvents-in-${consumedEventId}`
    : `endpoint-out-${serviceNodeId}`;

  const currentEdges = useBackendCanvasStore.getState().edges;
  const existingEdge = currentEdges.find(
    (e) =>
      e.source === serviceNodeId &&
      e.target === dbRefNode!.id &&
      (e.sourceHandle === sourceHandle || !e.sourceHandle) &&
      e.targetHandle === targetHandle,
  );

  if (!existingEdge) {
    store.addEdge({
      id: `edge-dbref-${serviceNodeId}-${endpointId || consumedEventId || "ep"}-${dbRefNode.id}-${resolvedFnName || "fn"}-${Date.now()}`,
      source: serviceNodeId,
      target: dbRefNode.id,
      sourceHandle,
      targetHandle,
      type: "connection",
    });
  }

  // 5. Update endpoint databaseNodeIds if endpointId exists
  if (endpointId) {
    const ep = store.endpoints.find((e) => e.id === endpointId);
    if (ep) {
      const currentDbIds =
        ep.databaseNodeIds ||
        (ep.databaseNodeId && ep.databaseNodeId !== "none"
          ? [ep.databaseNodeId]
          : []);

      if (!currentDbIds.includes(dbRefNode.id)) {
        const nextDbIds = [...currentDbIds, dbRefNode.id];
        store.updateEndpoint(endpointId, {
          databaseNodeIds: nextDbIds,
          databaseNodeId: nextDbIds[0] || dbRefNode.id,
        });
      }
    }
  }

  return {
    dbRefNodeId: dbRefNode.id,
    edgeId: existingEdge?.id,
    functionName: resolvedFnName,
  };
}

/**
 * Cleans up edge(s) connecting the service endpoint to a db_ref node / function when
 * the step is deleted or no longer references that function / table.
 * Strictly isolates matching to THIS specific table and service to avoid touching
 * other db_ref nodes and their edges.
 */
export function cleanupDatabaseRefConnection({
  tableNodeId,
  databaseId,
  serviceNodeId,
  endpointId,
  consumedEventId,
  functionName,
  remainingSteps,
}: CleanupDatabaseRefConnectionParams) {
  if (!serviceNodeId) return;
  const store = useBackendCanvasStore.getState();
  const allNodes = store.nodes;

  // Resolve entity ID if tableNodeId points to a db_ref or entity
  const targetNode = allNodes.find((n) => n.id === tableNodeId);
  const resolvedEntityId =
    targetNode?.type === "entity"
      ? targetNode.id
      : targetNode?.data?.tableRef || tableNodeId;

  const stepMatchesTable = (s: PipelineStepDraft) => {
    if (s.type !== "db_operation" || !s.tableNodeId) return false;
    if (s.tableNodeId === tableNodeId) return true;
    if (resolvedEntityId && s.tableNodeId === resolvedEntityId) return true;
    const sNode = allNodes.find((n) => n.id === s.tableNodeId);
    const sEntityId =
      sNode?.type === "entity" ? sNode.id : sNode?.data?.tableRef || s.tableNodeId;
    return Boolean(resolvedEntityId && sEntityId === resolvedEntityId);
  };

  // Check if any other db_operation in remainingSteps still uses this table & function
  const isFunctionStillUsed = remainingSteps.some((s) => {
    if (!stepMatchesTable(s)) return false;
    if (!functionName) return true;
    const sFnName = s.functionRef?.name || s.operationId;
    return sFnName === functionName;
  });

  const isTableStillUsedAtAll = remainingSteps.some((s) => stepMatchesTable(s));

  // Find matching db_ref node for THIS specific table on THIS service
  const matchingDbRefNodes = allNodes.filter((n) => {
    if (n.type !== "db_ref") return false;
    const matchesTable =
      (tableNodeId && (n.id === tableNodeId || n.data?.tableRef === tableNodeId)) ||
      (resolvedEntityId && (n.id === resolvedEntityId || n.data?.tableRef === resolvedEntityId));
    if (!matchesTable) return false;

    // Check if this db_ref belongs to this service
    return (
      n.data?.targetServiceId === serviceNodeId ||
      store.edges.some((e) => e.source === serviceNodeId && e.target === n.id)
    );
  });

  const matchingDbRefNodeIds = new Set<string>();
  matchingDbRefNodes.forEach((n) => matchingDbRefNodeIds.add(n.id));
  if (tableNodeId) matchingDbRefNodeIds.add(tableNodeId);
  if (resolvedEntityId) matchingDbRefNodeIds.add(resolvedEntityId);

  const sourceHandle = endpointId
    ? `endpoint-out-${endpointId}`
    : consumedEventId
    ? `consumedEvents-in-${consumedEventId}`
    : undefined;

  const targetHandle = functionName ? `func-${functionName}` : undefined;

  // 1. If the specific function is not used anymore, delete the edge targeting that function handle
  if (!isFunctionStillUsed) {
    const edgesToDelete = store.edges.filter((e) => {
      if (e.source !== serviceNodeId) return false;
      if (!matchingDbRefNodeIds.has(e.target)) return false;
      if (sourceHandle && e.sourceHandle && e.sourceHandle !== sourceHandle) return false;
      if (targetHandle) {
        return e.targetHandle === targetHandle;
      }
      return !isTableStillUsedAtAll;
    });

    edgesToDelete.forEach((e) => store.deleteEdge(e.id));
  }

  // 2. If the table is not used at all anymore in this endpoint, update endpoint databaseNodeIds
  // removing ONLY this specific table's db_ref node ID (other db_ref nodes remain untouched)
  if (!isTableStillUsedAtAll && endpointId) {
    const remainingTableEdges = store.edges.filter((e) => {
      if (e.source !== serviceNodeId) return false;
      if (!matchingDbRefNodeIds.has(e.target)) return false;
      if (sourceHandle && e.sourceHandle && e.sourceHandle !== sourceHandle) return false;
      return true;
    });
    remainingTableEdges.forEach((e) => store.deleteEdge(e.id));

    const ep = store.endpoints.find((e) => e.id === endpointId);
    if (ep && ep.databaseNodeIds) {
      const nextDbIds = ep.databaseNodeIds.filter(
        (id) => !matchingDbRefNodeIds.has(id),
      );
      store.updateEndpoint(endpointId, {
        databaseNodeIds: nextDbIds,
        databaseNodeId: nextDbIds[0] || "none",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Web Page Ref Node & Edge Synchronization Helpers
// ---------------------------------------------------------------------------

export interface EnsurePageRefConnectionParams {
  targetPageId?: string;
  pageRefNodeId?: string;
  serviceNodeId?: string;
  endpointId?: string;
  consumedEventId?: string;
  stepId?: string;
}

export interface PageRefConnectionResult {
  pageRefNodeId: string;
  targetPageId?: string;
}

export interface CleanupPageRefConnectionParams {
  pageRefNodeId?: string;
  serviceNodeId?: string;
  endpointId?: string;
  consumedEventId?: string;
  remainingSteps: PipelineStepDraft[];
}

/**
 * Ensures a PageRefNode (type="page_ref") exists on canvas for the given target page
 * and connects the ServiceNode endpoint/consumedEvent handle to it.
 */
export function ensurePageRefConnection({
  targetPageId,
  pageRefNodeId,
  serviceNodeId,
  endpointId,
  consumedEventId,
}: EnsurePageRefConnectionParams): PageRefConnectionResult | undefined {
  if (!serviceNodeId) return undefined;
  const store = useBackendCanvasStore.getState();
  const allNodes = store.nodes;
  const edges = store.edges;

  const sourceHandle = endpointId
    ? `endpoint-out-${endpointId}`
    : consumedEventId
    ? `consumedEvents-out-${consumedEventId}`
    : `endpoint-out-${serviceNodeId}`;

  // 1. Locate target webPage if specified, or pick first webPage on canvas
  const allWebPages = allNodes.filter((n) => n.type === "webPage");
  const targetWebPage = targetPageId
    ? allWebPages.find((p) => p.id === targetPageId)
    : allWebPages[0];

  const resolvedTargetPageId = targetPageId || targetWebPage?.id;

  // 2. Look for existing page_ref node:
  // - By pageRefNodeId if provided
  // - Or already connected to this service & sourceHandle
  let pageRefNode = pageRefNodeId
    ? allNodes.find((n) => n.id === pageRefNodeId && n.type === "page_ref")
    : undefined;

  if (!pageRefNode) {
    const existingEdge = edges.find(
      (e) =>
        e.source === serviceNodeId &&
        (e.sourceHandle === sourceHandle || !e.sourceHandle) &&
        allNodes.some((n) => n.id === e.target && n.type === "page_ref"),
    );
    if (existingEdge) {
      pageRefNode = allNodes.find((n) => n.id === existingEdge.target);
    }
  }

  // 3. If no page_ref node exists, create one!
  if (!pageRefNode) {
    const serviceNode = allNodes.find((n) => n.id === serviceNodeId);
    const basePos = serviceNode?.position || { x: 300, y: 200 };
    const existingPageRefs = allNodes.filter((n) => n.type === "page_ref");
    const yOffset = existingPageRefs.length * 90;
    const newPos = {
      x: basePos.x + 380,
      y: basePos.y + yOffset,
    };

    const newRefId = crypto.randomUUID();
    const pageLabel = targetWebPage?.data?.label || "Page";
    const cleanLabel = pageLabel.trim().toLowerCase();
    const isRoot = targetWebPage?.data?.isRoot === true || cleanLabel === "/";

    store.addNode({
      id: newRefId,
      type: "page_ref",
      position: newPos,
      data: {
        label: targetWebPage ? `Ref: ${isRoot ? "/" : pageLabel}` : "Page Ref",
        targetPageId: resolvedTargetPageId,
        pageRefId: resolvedTargetPageId,
        targetPageLabel: targetWebPage ? pageLabel : undefined,
        description: "Target page reference for real-time delivery",
      },
    });

    pageRefNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === newRefId);
  } else if (
    resolvedTargetPageId &&
    targetWebPage &&
    pageRefNode.data?.targetPageId !== resolvedTargetPageId
  ) {
    // If pageRefNode exists and targetPageId was updated, update pageRefNode details
    const pageLabel = targetWebPage.data?.label || "Page";
    const cleanLabel = pageLabel.trim().toLowerCase();
    const isRoot = targetWebPage.data?.isRoot === true || cleanLabel === "/";

    store.updateNode(pageRefNode.id, {
      data: {
        ...pageRefNode.data,
        targetPageId: resolvedTargetPageId,
        pageRefId: resolvedTargetPageId,
        targetPageLabel: pageLabel,
        label: `Ref: ${isRoot ? "/" : pageLabel}`,
      },
    });
  }

  if (!pageRefNode) return undefined;

  // 4. Ensure canvas edge exists from service to pageRefNode
  const currentEdges = useBackendCanvasStore.getState().edges;
  const existingEdge = currentEdges.find(
    (e) =>
      e.source === serviceNodeId &&
      e.target === pageRefNode!.id &&
      (e.sourceHandle === sourceHandle || !e.sourceHandle) &&
      (e.targetHandle === "page-ref-in" || e.targetHandle === "ref-in" || !e.targetHandle),
  );

  if (!existingEdge) {
    store.addEdge({
      id: `edge-pushclient-${serviceNodeId}-${endpointId || consumedEventId || "ep"}-${pageRefNode.id}-${Date.now()}`,
      source: serviceNodeId,
      target: pageRefNode.id,
      sourceHandle,
      targetHandle: "page-ref-in",
      type: "connection",
    });
  }

  return {
    pageRefNodeId: pageRefNode.id,
    targetPageId: resolvedTargetPageId,
  };
}

/**
 * Cleans up edge(s) connecting the service endpoint to a PageRefNode when
 * the push_to_client step is deleted or changes type.
 * Also cascades deletion of the PageRefNode if it has no remaining incoming edges.
 */
export function cleanupPageRefConnection({
  pageRefNodeId,
  serviceNodeId,
  endpointId,
  consumedEventId,
  remainingSteps,
}: CleanupPageRefConnectionParams) {
  if (!serviceNodeId) return;
  const store = useBackendCanvasStore.getState();

  // Check if any other push_to_client in remainingSteps still uses this pageRefNodeId or endpoint
  const isStillUsed = remainingSteps.some(
    (s) =>
      s.type === "push_to_client" &&
      ((pageRefNodeId && s.clientDeliveryPageRefNodeId === pageRefNodeId) ||
        (!pageRefNodeId && s.type === "push_to_client")),
  );
  if (isStillUsed) return;

  const sourceHandle = endpointId
    ? `endpoint-out-${endpointId}`
    : consumedEventId
    ? `consumedEvents-out-${consumedEventId}`
    : undefined;

  // Find edges connecting this service/handle to page_ref node(s)
  const edgesToDelete = store.edges.filter((e) => {
    if (e.source !== serviceNodeId) return false;
    if (sourceHandle && e.sourceHandle && e.sourceHandle !== sourceHandle) return false;
    if (pageRefNodeId && e.target !== pageRefNodeId) return false;
    const targetNode = store.nodes.find((n) => n.id === e.target);
    return targetNode?.type === "page_ref";
  });

  edgesToDelete.forEach((e) => {
    store.deleteEdge(e.id);
    // Cascade deletion of orphaned page_ref node if no incoming edges remain
    const targetNode = store.nodes.find((n) => n.id === e.target);
    if (targetNode && targetNode.type === "page_ref") {
      const remainingIncoming = store.edges.filter(
        (edge) => edge.target === targetNode.id && edge.id !== e.id,
      );
      if (remainingIncoming.length === 0) {
        store.deleteNode(targetNode.id);
      }
    }
  });
}

