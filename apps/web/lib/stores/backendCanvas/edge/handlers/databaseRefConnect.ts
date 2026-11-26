import {
  PipelineStep,
  CanvasEntityColumn,
  StepSchemaField,
  AvailableSource,
  Parameter,
} from "@workspace/canvas/types";
import { toTableName, toVarName } from "@/lib/compiler/utils";
import {
  getEntityDbOperations,
  deriveDbFunctionSignature,
  inferDbOperationReturnType,
  computeDbOpBindings,
} from "@/lib/utils/entityOperationsHelper";
import { isHealthEndpoint } from "@/lib/utils/healthCheckEndpoint";
import { ConnectionContext } from "../types";
import { toast } from "sonner";

/**
 * Handles connections between DatabaseTableRefNode (`db_ref`) and ServiceNode (`service`):
 * 1. db_ref -> service (or service -> db_ref):
 *    - Resolves target endpoint on the service (from handle, active config, or default non-health endpoint)
 *    - Resolves table and operation from db_ref node (or handle func-out-*)
 *    - Auto-adds a `db_operation` pipeline step to the endpoint (before return_response)
 *    - Updates endpoint.databaseNodeIds
 *    - Updates db_ref node data (targetServiceId, endpointId, stepId)
 *    - Enriches the edge data and snaps handles cleanly
 *
 * @returns boolean `false` as direct canvas edge is preserved for visual route wiring.
 */
export function handleDatabaseRefConnect({
  set,
  get,
  connection,
  sourceNode,
  targetNode,
  newEdge,
}: ConnectionContext): boolean {
  const isSourceDbRef = sourceNode.type === "db_ref";
  const isTargetService = targetNode.type === "service";
  const isSourceService = sourceNode.type === "service";
  const isTargetDbRef = targetNode.type === "db_ref";

  if (!((isSourceDbRef && isTargetService) || (isSourceService && isTargetDbRef))) {
    return false;
  }

  const dbRefNode = isSourceDbRef ? sourceNode : targetNode;
  const serviceNode = isTargetService ? targetNode : sourceNode;
  const dbRefHandle = isSourceDbRef ? connection.sourceHandle : connection.targetHandle;
  const serviceHandle = isTargetService ? connection.targetHandle : connection.sourceHandle;

  // 1. Resolve target endpoint or consumed event on the service
  let endpointId: string | null = null;
  let consumedEventId: string | null = null;

  if (serviceHandle?.startsWith("endpoint-in-")) {
    endpointId = serviceHandle.replace("endpoint-in-", "");
  } else if (serviceHandle?.startsWith("endpoint-out-")) {
    endpointId = serviceHandle.replace("endpoint-out-", "");
  } else if (serviceHandle?.startsWith("endpoints-in-")) {
    endpointId = serviceHandle.replace("endpoints-in-", "");
  } else if (serviceHandle?.startsWith("endpoints-out-")) {
    endpointId = serviceHandle.replace("endpoints-out-", "");
  } else if (serviceHandle?.startsWith("routeEndpoints-in-")) {
    endpointId = serviceHandle.replace("routeEndpoints-in-", "");
  } else if (serviceHandle?.startsWith("routeEndpoints-out-")) {
    endpointId = serviceHandle.replace("routeEndpoints-out-", "");
  } else if (serviceHandle?.startsWith("consumedEvents-in-")) {
    consumedEventId = serviceHandle.replace("consumedEvents-in-", "");
  } else if (serviceHandle?.startsWith("consumedEvents-out-")) {
    consumedEventId = serviceHandle.replace("consumedEvents-out-", "");
  } else if (serviceHandle) {
    const matchingEp = get().endpoints.find(
      (e) => e.nodeId === serviceNode.id && e.id === serviceHandle,
    );
    if (matchingEp) {
      endpointId = matchingEp.id;
    } else {
      const matchingEv = (get().events || []).find(
        (e) => e.nodeId === serviceNode.id && e.id === serviceHandle,
      );
      if (matchingEv) {
        consumedEventId = matchingEv.id;
      }
    }
  }

  // Fallback 1: check if activeConfigItem has an endpoint on this service
  if (!endpointId && !consumedEventId) {
    const activeConfig = get().activeConfigItem;
    if (activeConfig?.type === "endpoint" && activeConfig.nodeId === serviceNode.id) {
      endpointId = activeConfig.id;
    }
  }

  // Fallback 2: first non-health endpoint of the service, or first endpoint
  if (!endpointId && !consumedEventId) {
    const serviceEndpoints = get().endpoints.filter((e) => e.nodeId === serviceNode.id);
    const nonHealth = serviceEndpoints.find((e) => !isHealthEndpoint(e) && e.name !== "/health");
    const chosen = nonHealth || serviceEndpoints[0];
    if (chosen) {
      endpointId = chosen.id;
    }
  }

  const allNodes = get().nodes;

  // 2. Resolve table entity node and database
  const allEntities = allNodes.filter(
    (n) => n.type === "entity" && n.data?.dbType !== "vector" && n.data?.dbType !== "redis",
  );
  let selectedTable = allEntities.find((e) => e.id === dbRefNode.data?.tableRef);

  // If dbRefNode doesn't have tableRef yet, try to auto-pick an entity
  if (!selectedTable) {
    if (dbRefNode.data?.databaseId) {
      selectedTable = allEntities.find((e) => e.data?.databaseId === dbRefNode.data?.databaseId);
    }
    if (!selectedTable && allEntities.length > 0) {
      selectedTable = allEntities[0];
    }
    if (selectedTable) {
      get().updateNode(dbRefNode.id, {
        data: {
          ...dbRefNode.data,
          tableRef: selectedTable.id,
          label: selectedTable.data?.label || dbRefNode.data?.label || "Table Ref",
          databaseId: selectedTable.data?.databaseId || dbRefNode.data?.databaseId,
        },
      });
    }
  }

  const targetDbId =
    dbRefNode.data?.databaseId || selectedTable?.data?.databaseId;

  // 3. Resolve operation
  const operations = selectedTable ? getEntityDbOperations(selectedTable, allNodes) : [];
  const rawOpName = (dbRefHandle || "")
    .replace(/^func-out-/, "")
    .replace(/^func-in-/, "")
    .replace(/^func-/, "")
    .trim();

  const cleanRaw = rawOpName.toLowerCase().replace(/[^a-z0-9]/g, "");

  const matchedOp = operations.find((o) => {
    if (o.name === rawOpName || o.id === rawOpName) return true;
    if (o.name.toLowerCase() === rawOpName.toLowerCase() || o.id.toLowerCase() === rawOpName.toLowerCase()) return true;
    if (o.kind && o.kind.toLowerCase() === rawOpName.toLowerCase()) return true;
    const cleanName = o.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanName === cleanRaw) return true;
    // Handle plural/singular difference, e.g. findUsersById vs findUserById or createUsers vs createUser
    if (cleanName.replace(/s(?=byid|$)/g, "") === cleanRaw.replace(/s(?=byid|$)/g, "")) return true;
    return false;
  }) || (cleanRaw.length > 0 ? operations.find((o) => {
    if (cleanRaw.includes("findbyid") || (cleanRaw.includes("find") && cleanRaw.includes("byid"))) return o.kind === "findById";
    if (cleanRaw.includes("findall") || (cleanRaw.includes("find") && cleanRaw.includes("all"))) return o.kind === "findAll";
    if (cleanRaw.includes("create") || cleanRaw.includes("insert")) return o.kind === "create";
    if (cleanRaw.includes("update")) return o.kind === "update";
    if (cleanRaw.includes("upsert")) return o.kind === "upsert";
    if (cleanRaw.includes("delete") || cleanRaw.includes("remove")) return o.kind === "delete";
    return false;
  }) : undefined);

  const targetOp = matchedOp || operations[0];

  // 4. If target is an Endpoint:
  if (endpointId) {
    const endpoint = get().endpoints.find((e) => e.id === endpointId);
    if (!endpoint) return false;

    const existingSteps = endpoint.pipelineSteps || [];
    const hasMatchingStep = existingSteps.some(
      (s) =>
        s.type === "db_operation" &&
        (s.dbRefNodeId === dbRefNode.id || (selectedTable && s.tableNodeId === selectedTable.id)) &&
        (!targetOp || s.operationId === targetOp.id || s.functionRef?.name === targetOp.name),
    );

    let stepId = `step-db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (!hasMatchingStep) {
      const tableLabel = selectedTable?.data?.label || selectedTable?.data?.tableRef || dbRefNode.data?.label || "table";
      const importPath = `@workspace/db/helpers/${toVarName(toTableName(tableLabel))}`;
      const defaultVar = targetOp ? `${toVarName(targetOp.name)}Result` : "dbResult";

      let varName = defaultVar;
      let counter = 1;
      while (existingSteps.some((s) => s.outputVariable === varName)) {
        counter++;
        varName = `${defaultVar}${counter}`;
      }

      const liveSig = targetOp
        ? deriveDbFunctionSignature(targetOp.name, targetOp.params, targetOp.returnType) || targetOp.signature
        : undefined;

      const returnTypeStr = targetOp
        ? (targetOp.code && targetOp.code.trim() ? inferDbOperationReturnType(targetOp.code) : null) ||
        targetOp.returnType ||
        "any"
        : undefined;

      const isArrayOp = Boolean(
        targetOp &&
        (targetOp.kind === "findAll" ||
          (targetOp.name || "").toLowerCase().includes("findall") ||
          (returnTypeStr && (returnTypeStr.includes("[]") || returnTypeStr.includes("Array<")))),
      );

      const schemaFields: StepSchemaField[] = isArrayOp
        ? []
        : targetOp?.kind === "delete"
          ? [
            { name: "success", type: "boolean", required: true },
            { name: "message", type: "string", required: true },
          ]
          : (selectedTable?.data?.columns || []).map((c: CanvasEntityColumn) => ({
            name: c.name,
            type: c.type || "string",
            required: Boolean(c.isPrimaryKey || c.isNotNull),
          }));

      const availableSources: AvailableSource[] = [];
      if (endpoint.pathParams && endpoint.pathParams.length > 0) {
        availableSources.push({
          id: "req_params",
          label: "Route Parameters",
          kind: "req_params",
          paths: endpoint.pathParams.map((p: Parameter) => ({ path: p.name, type: p.type || "string" })),
        });
      }
      if (endpoint.queryParams && endpoint.queryParams.length > 0) {
        availableSources.push({
          id: "req_query",
          label: "Query Parameters",
          kind: "req_query",
          paths: endpoint.queryParams.map((q: Parameter) => ({ path: q.name, type: q.type || "string" })),
        });
      }
      if (endpoint.requestBody?.fields && endpoint.requestBody.fields.length > 0) {
        availableSources.push({
          id: "req_body",
          label: "Request Body",
          kind: "req_body",
          paths: endpoint.requestBody.fields.map((f: Parameter) => ({ path: f.name, type: f.type || "string" })),
        });
      }

      const nextBindings = computeDbOpBindings(
        targetOp,
        selectedTable,
        [],
        availableSources,
        targetOp ? { name: targetOp.name, signature: liveSig } : undefined,
      );

      const newStep: PipelineStep = {
        id: stepId,
        name: varName,
        type: "db_operation",
        enabled: true,
        outputVariable: varName,
        databaseId: targetDbId,
        tableNodeId: selectedTable?.id || dbRefNode.id,
        dbRefNodeId: dbRefNode.id,
        operationId: targetOp?.id,
        functionRef: targetOp
          ? {
            name: targetOp.name,
            importPath,
            signature: liveSig,
            returnIsArray: isArrayOp,
          }
          : undefined,
        outputSchema: schemaFields,
        inputBindings: nextBindings,
      };

      const returnIdx = existingSteps.findIndex((s) => s.type === "return_response");
      const nextPipelineSteps =
        returnIdx !== -1
          ? [
            ...existingSteps.slice(0, returnIdx),
            newStep,
            ...existingSteps.slice(returnIdx),
          ]
          : [...existingSteps, newStep];

      const currentDbIds =
        endpoint.databaseNodeIds ||
        (endpoint.databaseNodeId && endpoint.databaseNodeId !== "none"
          ? [endpoint.databaseNodeId]
          : []);
      const nextDbIds = currentDbIds.includes(dbRefNode.id)
        ? currentDbIds
        : [...currentDbIds, dbRefNode.id];

      get().updateEndpoint(endpoint.id, {
        pipelineSteps: nextPipelineSteps,
        databaseNodeIds: nextDbIds,
        databaseNodeId: nextDbIds[0] || dbRefNode.id,
      });

      toast.success(
        `Added database step "${targetOp?.name || "Operation"}" to endpoint "${endpoint.name || endpoint.type || "endpoint"}"`,
      );
    } else {
      const matchedStep = existingSteps.find(
        (s) =>
          s.type === "db_operation" &&
          (s.dbRefNodeId === dbRefNode.id || (selectedTable && s.tableNodeId === selectedTable.id)),
      );
      if (matchedStep) {
        stepId = matchedStep.id;
      }
    }

    // Update dbRefNode data with link
    get().updateNode(dbRefNode.id, {
      data: {
        ...dbRefNode.data,
        targetServiceId: serviceNode.id,
        endpointId: endpoint.id,
        stepId,
      },
    });

    // Enrich edge with handles and metadata
    const expectedSourceHandle = targetOp ? `func-out-${targetOp.name}` : (dbRefHandle || "database-source");
    const expectedTargetHandle = `endpoint-in-${endpoint.id}`;

    const currentEdges = get().edges;
    set({
      edges: currentEdges.map((e) =>
        e.id === newEdge.id
          ? {
            ...e,
            source: dbRefNode.id,
            target: serviceNode.id,
            sourceHandle: expectedSourceHandle,
            targetHandle: expectedTargetHandle,
            data: {
              ...e.data,
              isDbOperation: true,
              operationName: targetOp?.name,
              tableRef: selectedTable?.id,
              dbRefNodeId: dbRefNode.id,
            },
          }
          : e,
      ),
    });

    return true;
  }

  // 5. If target is a Consumed Event (listener):
  if (consumedEventId) {
    const event = (get().events || []).find((e) => e.id === consumedEventId);
    if (!event) return false;

    const existingSteps = event.pipelineSteps || [];
    const hasMatchingStep = existingSteps.some(
      (s) =>
        s.type === "db_operation" &&
        (s.dbRefNodeId === dbRefNode.id || (selectedTable && s.tableNodeId === selectedTable.id)) &&
        (!targetOp || s.operationId === targetOp.id || s.functionRef?.name === targetOp.name),
    );

    let stepId = `step-db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (!hasMatchingStep) {
      const tableLabel = selectedTable?.data?.label || selectedTable?.data?.tableRef || dbRefNode.data?.label || "table";
      const importPath = `@workspace/db/helpers/${toVarName(toTableName(tableLabel))}`;
      const defaultVar = targetOp ? `${toVarName(targetOp.name)}Result` : "dbResult";

      let varName = defaultVar;
      let counter = 1;
      while (existingSteps.some((s) => s.outputVariable === varName)) {
        counter++;
        varName = `${defaultVar}${counter}`;
      }

      const liveSig = targetOp
        ? deriveDbFunctionSignature(targetOp.name, targetOp.params, targetOp.returnType) || targetOp.signature
        : undefined;

      const returnTypeStr = targetOp
        ? (targetOp.code && targetOp.code.trim() ? inferDbOperationReturnType(targetOp.code) : null) ||
        targetOp.returnType ||
        "any"
        : undefined;

      const isArrayOp = Boolean(
        targetOp &&
        (targetOp.kind === "findAll" ||
          (targetOp.name || "").toLowerCase().includes("findall") ||
          (returnTypeStr && (returnTypeStr.includes("[]") || returnTypeStr.includes("Array<")))),
      );

      const schemaFields: StepSchemaField[] = isArrayOp
        ? []
        : targetOp?.kind === "delete"
          ? [
            { name: "success", type: "boolean", required: true },
            { name: "message", type: "string", required: true },
          ]
          : (selectedTable?.data?.columns || []).map((c: CanvasEntityColumn) => ({
            name: c.name,
            type: c.type || "string",
            required: Boolean(c.isPrimaryKey || c.isNotNull),
          }));

      const newStep: PipelineStep = {
        id: stepId,
        name: varName,
        type: "db_operation",
        enabled: true,
        outputVariable: varName,
        databaseId: targetDbId,
        tableNodeId: selectedTable?.id || dbRefNode.id,
        dbRefNodeId: dbRefNode.id,
        operationId: targetOp?.id,
        functionRef: targetOp
          ? {
            name: targetOp.name,
            importPath,
            signature: liveSig,
            returnIsArray: isArrayOp,
          }
          : undefined,
        outputSchema: schemaFields,
        inputBindings: [],
      };

      const nextPipelineSteps = [...existingSteps, newStep];
      get().updateEvent(event.id, { pipelineSteps: nextPipelineSteps });

      toast.success(
        `Added database step "${targetOp?.name || "Operation"}" to event listener "${event.name || "event"}"`,
      );
    } else {
      const matchedStep = existingSteps.find(
        (s) =>
          s.type === "db_operation" &&
          (s.dbRefNodeId === dbRefNode.id || (selectedTable && s.tableNodeId === selectedTable.id)),
      );
      if (matchedStep) {
        stepId = matchedStep.id;
      }
    }

    get().updateNode(dbRefNode.id, {
      data: {
        ...dbRefNode.data,
        targetServiceId: serviceNode.id,
        consumedEventId: event.id,
        stepId,
      },
    });

    const expectedSourceHandle = targetOp ? `func-out-${targetOp.name}` : (dbRefHandle || "database-source");
    const expectedTargetHandle = `consumedEvents-in-${event.id}`;

    const currentEdges = get().edges;
    set({
      edges: currentEdges.map((e) =>
        e.id === newEdge.id
          ? {
            ...e,
            source: dbRefNode.id,
            target: serviceNode.id,
            sourceHandle: expectedSourceHandle,
            targetHandle: expectedTargetHandle,
            data: {
              ...e.data,
              isDbOperation: true,
              operationName: targetOp?.name,
              tableRef: selectedTable?.id,
              dbRefNodeId: dbRefNode.id,
            },
          }
          : e,
      ),
    });

    return true;
  }

  return false;
}
