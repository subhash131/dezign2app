import {
  Endpoint,
  BackendNode,
  AnyMessagingResource,
} from "@workspace/canvas/types";
import {
  StepType,
  PipelineStepDraft,
  StepBinding,
} from "./types";
import {
  generateId,
  ensureDatabaseRefConnection,
  ensurePageRefConnection,
  ensureStorageOperationRefConnection,
} from "./utils";
import { upsertDerivedConnection } from "./PushToClientStepSection";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";
import {
  getStorageOperations,
  computeStorageOpBindings,
} from "@/lib/utils/storageOperationsHelper";
import { toFolderName, toTableName, toVarName } from "@/lib/compiler/utils";

export interface CreateDefaultStepDraftParams {
  type: StepType;
  stepNumber: number;
  allNodes: BackendNode[];
  endpoint?: Endpoint;
  consumedEvent?: AnyMessagingResource;
  serviceNodeId?: string;
}

export function getDefaultVariableName(type: StepType, stepNumber: number): string {
  switch (type) {
    case "transform":
      return `transformedData${stepNumber}`;
    case "db_operation":
      return `dbResult${stepNumber}`;
    case "redis_operation":
      return `cachedResult${stepNumber}`;
    case "storage_operation":
      return `storageResult${stepNumber}`;
    case "kafka_publish":
      return `publishResult${stepNumber}`;
    case "service_call":
      return `serviceResponse${stepNumber}`;
    case "external_call":
      return `externalResult${stepNumber}`;
    case "condition":
      return `condition${stepNumber}Result`;
    case "try_catch":
      return `tryCatch${stepNumber}Result`;
    case "switch":
      return `switch${stepNumber}Result`;
    case "parallel":
      return `parallel${stepNumber}Results`;
    case "loop":
      return `loop${stepNumber}Results`;
    case "early_return":
      return `earlyReturn${stepNumber}`;
    case "langgraph_invoke":
      return `agentResult${stepNumber}`;
    case "return_response":
      return "";
    case "push_to_client":
      return `pushToClient${stepNumber}`;
    default:
      return `step${stepNumber}Result`;
  }
}

export function createDefaultStepDraft({
  type,
  stepNumber,
  allNodes,
  endpoint,
  consumedEvent,
  serviceNodeId,
}: CreateDefaultStepDraftParams): PipelineStepDraft {
  const id = generateId();
  const defaultVar = getDefaultVariableName(type, stepNumber);
  const isConsumer = Boolean(consumedEvent);

  let initialFields: Partial<PipelineStepDraft> = {};

  if (type === "db_operation") {
    const allEntityNodes = allNodes.filter(
      (n) => (n.type === "entity" || n.type === "db_ref") && n.data?.dbType !== "redis",
    );
    const dbNodes = allNodes.filter(
      (n) =>
        n.type === "database" &&
        n.data?.dbEngine !== "redis" &&
        n.data?.dbType !== "redis",
    );
    const firstEntity = allEntityNodes[0];
    const targetDbId = firstEntity?.data?.databaseId || dbNodes[0]?.id;

    let defaultOp;
    let importPath: string | undefined;
    let varName = defaultVar;

    if (firstEntity) {
      const ops = getEntityDbOperations(firstEntity, allNodes);
      defaultOp = ops[0];
      const tableLabel = firstEntity.data?.label || firstEntity.data?.tableRef || "table";
      importPath = `@workspace/db/helpers/${toTableName(tableLabel)}`;
      if (defaultOp) {
        varName = `${toVarName(defaultOp.name)}Result`;
      }
    }

    let initialBindings: StepBinding[] = [];
    if (firstEntity && defaultOp) {
      const opName = (defaultOp.name || defaultOp.id || "").toLowerCase();
      if (defaultOp.kind !== "findAll" && !opName.includes("findall")) {
        const columns = firstEntity.data?.columns || [];
        const pkCol = columns.find((c: any) => c.isPrimaryKey) || columns[0];
        const pkName = pkCol?.name || "id";
        const writableCols = columns.filter((c: any) => !c.isPrimaryKey && c.name && c.name.trim());

        let argNames: string[] = [];
        if (opName.includes("create") || opName.includes("insert")) {
          argNames = writableCols.map((c: any) => toVarName(c.name));
        } else if (opName.includes("update")) {
          argNames = [toVarName(pkName), ...writableCols.map((c: any) => toVarName(c.name))];
        } else if (opName.includes("byid") || opName.includes("findone") || opName.includes("delete")) {
          argNames = [toVarName(pkName)];
        } else if (defaultOp.params && defaultOp.params.length > 0) {
          argNames = defaultOp.params.filter((p) => p && p.name && p.name.trim()).map((p) => p.name.trim());
        }

        initialBindings = argNames.map((argName) => ({
          argName,
          source: { kind: "req_body", field: "" },
        }));
      }
    }

    const connectionResult = ensureDatabaseRefConnection({
      tableNodeId: firstEntity?.id,
      databaseId: targetDbId,
      serviceNodeId,
      endpointId: endpoint?.id,
      consumedEventId: consumedEvent?.id,
      functionName: defaultOp?.name,
    });

    const isArrayOp = Boolean(
      defaultOp &&
        (defaultOp.kind === "findAll" ||
          (defaultOp.name || "").toLowerCase().includes("findall") ||
          (defaultOp.returnType && (defaultOp.returnType.includes("[]") || defaultOp.returnType.includes("Array<")))),
    );

    const schemaFields = isArrayOp
      ? []
      : defaultOp?.kind === "delete"
      ? [
          { name: "success", type: "boolean", required: true },
          { name: "message", type: "string", required: true },
        ]
      : (firstEntity?.data?.columns || []).map((c: any) => ({
          name: c.name,
          type: c.type || "string",
          required: Boolean(c.isPrimaryKey || c.isNotNull),
        }));

    initialFields = {
      databaseId: targetDbId,
      tableNodeId: firstEntity?.id || connectionResult?.dbRefNodeId,
      operationId: defaultOp?.id,
      functionRef: defaultOp && importPath
        ? {
            name: defaultOp.name,
            importPath,
            signature: defaultOp.signature,
            returnIsArray: isArrayOp,
          }
        : undefined,
      outputSchema: schemaFields,
      name: varName,
      outputVariable: varName,
      inputBindings: initialBindings,
    };
  } else if (type === "redis_operation") {
    const redisCacheNodes = allNodes.filter((n) => n.type === "redis-cache");
    const firstCache = redisCacheNodes[0];
    const schemaRef = firstCache?.data?.schemaRef;
    const targetSchemaNode = allNodes.find((n) => n.id === schemaRef) || firstCache;
    const instanceId = firstCache?.data?.databaseId || targetSchemaNode?.data?.databaseId;
    const targetInstanceNode = allNodes.find((n) => n.id === instanceId);
    const instanceLabel = targetInstanceNode?.data?.label || "primary-redis-cache";
    const importPath = `@workspace/${toFolderName(instanceLabel)}`;

    const ops = targetSchemaNode ? getEntityDbOperations(targetSchemaNode, allNodes) : [];
    const defaultOp = ops[0];
    const tableNodeId = schemaRef || firstCache?.id;
    const varName = defaultOp
      ? `${toVarName(defaultOp.name)}Result`
      : defaultVar;

    initialFields = {
      databaseId: instanceId,
      tableNodeId: tableNodeId,
      operationId: defaultOp?.id,
      functionRef: defaultOp
        ? {
            name: defaultOp.name,
            importPath,
            signature: defaultOp.signature,
          }
        : undefined,
      name: varName,
      outputVariable: varName,
      inputBindings: [],
    };
  } else if (type === "storage_operation") {
    const storageNodes = allNodes.filter((n) => n.type === "storage");
    const firstStorage = storageNodes[0];
    const targetStorageId = firstStorage?.id;
    const buckets = firstStorage?.data?.buckets || [];
    const firstBucket = buckets[0]?.name || "default-bucket";
    const rawLabel = firstStorage?.data?.label || "storage";
    const packageFolder = toFolderName(rawLabel) || "storage";

    const ops = getStorageOperations(firstStorage);
    const defaultOp = ops[0];
    const varName = defaultOp?.kind === "presign_upload" ? "uploadUrl" : defaultVar;
    const nextBindings = computeStorageOpBindings(defaultOp, [], firstBucket);

    const connectionResult = ensureStorageOperationRefConnection({
      storageNodeId: targetStorageId,
      bucketId: firstBucket,
      serviceNodeId,
      endpointId: endpoint?.id,
      consumedEventId: consumedEvent?.id,
      functionName: defaultOp?.name || "getUploadPresignedUrl",
    });

    initialFields = {
      name: defaultOp?.label || "Storage Operation",
      storageNodeId: targetStorageId || connectionResult?.storageRefNodeId,
      brokerNodeId: targetStorageId || connectionResult?.storageRefNodeId,
      bucketId: firstBucket,
      operationId: defaultOp?.id,
      outputVariable: varName,
      functionRef: {
        name: defaultOp?.name || "getUploadPresignedUrl",
        importPath: `@workspace/${packageFolder}/operations`,
        signature: defaultOp?.signature,
      },
      inputBindings: nextBindings,
    };
  } else if (type === "external_call") {
    const extNodes = allNodes.filter((n) => n.type === "external");
    const firstExt = extNodes[0];
    const fnName = toVarName(firstExt?.data?.functionName || firstExt?.data?.label || "callExternalApi");
    const varName = `${fnName}Response`;
    const allStoreEndpoints = useBackendCanvasStore.getState().endpoints;
    const extEndpoints = firstExt ? allStoreEndpoints.filter((e) => e.nodeId === firstExt.id) : [];
    const firstEp = extEndpoints[0] || firstExt?.data?.endpoints?.[0];
    const inputBindings: StepBinding[] = (firstExt?.data?.inputVariables || []).map((v) => ({
      argName: v.name,
      source: { kind: "req_body", field: v.name },
    }));
    initialFields = {
      databaseId: firstExt?.id,
      externalNodeId: firstExt?.id,
      tableNodeId: firstEp?.id,
      externalEndpointId: firstEp?.id,
      operationId: firstEp ? `${firstEp.type || "POST"}_${firstEp.name}` : undefined,
      name: varName,
      outputVariable: varName,
      functionRef: firstExt
        ? {
            name: fnName,
            importPath: "@workspace/external-apis",
          }
        : undefined,
      inputBindings,
    };
  } else if (type === "condition") {
    initialFields = {
      conditionExpr: {
        left: { kind: "req_body", field: "" },
        operator: "truthy",
      },
      thenSteps: [],
      elseSteps: [],
    };
  } else if (type === "try_catch") {
    initialFields = {
      trySteps: [],
      catchSteps: [],
    };
  } else if (type === "switch") {
    initialFields = {
      switchSource: { kind: "req_body", field: "" },
      switchCases: [
        {
          id: generateId(),
          value: "option_1",
          label: "Option 1",
          steps: [],
        },
      ],
      switchDefault: [],
    };
  } else if (type === "parallel") {
    initialFields = {
      parallelBranches: [
        { id: generateId(), label: "Branch 1", steps: [] },
        { id: generateId(), label: "Branch 2", steps: [] },
      ],
      failureMode: "all",
    };
  } else if (type === "loop") {
    initialFields = {
      loopSource: { kind: "req_body", field: "" },
      iteratorVariable: "item",
      loopBody: [],
    };
  } else if (type === "early_return") {
    initialFields = {
      statusCode: 404,
      inputBindings: [],
    };
  } else if (type === "langgraph_invoke") {
    const allLangGraphNodes = allNodes.filter((n) => n.type === "langgraph");
    const firstAgent = allLangGraphNodes[0];
    const agentLabel = firstAgent?.data?.label || "LangGraph Agent";
    const varName = `${toVarName(agentLabel)}Result`;
    const stateChannels = firstAgent?.data?.stateChannels || [];
    const defaultStateMapping: Record<string, string> = {};
    if (stateChannels.length > 0) {
      stateChannels.forEach((ch) => {
        if (ch.key === "messages") {
          defaultStateMapping[ch.key] = isConsumer ? "event.message" : "body.message";
        } else {
          defaultStateMapping[ch.key] = isConsumer ? `event.${ch.key}` : `body.${ch.key}`;
        }
      });
    } else {
      defaultStateMapping["messages"] = isConsumer ? "event.message" : "body.message";
    }

    initialFields = {
      name: agentLabel,
      outputVariable: varName,
      langGraphTargetNodeId: firstAgent?.id,
      langGraphStreamingEnabled: false,
      langGraphStreamingProtocol: "sse",
      langGraphOutputMode: "full_state",
      langGraphStateMapping: defaultStateMapping,
      inputBindings: [],
    };
  } else if (type === "push_to_client") {
    const allWebPageNodes = allNodes.filter((n) => n.type === "webPage");
    const firstPage = allWebPageNodes[0];
    const connectionResult = ensurePageRefConnection({
      targetPageId: firstPage?.id,
      serviceNodeId,
      endpointId: endpoint?.id,
      consumedEventId: consumedEvent?.id,
      stepId: id,
    });

    const varName = `pushToClient${stepNumber}`;
    initialFields = {
      name: varName,
      outputVariable: varName,
      clientDeliveryProtocol: "SSE",
      clientDeliveryTargetPageId: connectionResult?.targetPageId || firstPage?.id,
      clientDeliveryPageRefNodeId: connectionResult?.pageRefNodeId,
      clientDeliveryTargetWebAppId: firstPage?.data?.appSlug || undefined,
      inputBindings: [],
    };

    if (firstPage) {
      const store = useBackendCanvasStore.getState();
      const sourceItemName = endpoint
        ? endpoint.name || "Endpoint"
        : consumedEvent
        ? consumedEvent.name
        : undefined;
      const sourceItemId = endpoint ? endpoint.id : consumedEvent ? consumedEvent.id : undefined;
      const sourceItemType = endpoint ? "endpoint" : consumedEvent ? "event" : undefined;
      const pushStepToRegister: PipelineStepDraft = {
        id,
        name: varName,
        type: "push_to_client",
        enabled: true,
        inputBindings: [],
        outputVariable: varName,
        ...initialFields,
      };
      upsertDerivedConnection(
        store,
        firstPage.id,
        pushStepToRegister,
        serviceNodeId,
        sourceItemName,
        sourceItemId,
        sourceItemType,
      );
    }
  }

  return {
    id,
    name: defaultVar,
    type,
    enabled: true,
    inputBindings: [],
    outputVariable: defaultVar,
    ...initialFields,
  };
}
