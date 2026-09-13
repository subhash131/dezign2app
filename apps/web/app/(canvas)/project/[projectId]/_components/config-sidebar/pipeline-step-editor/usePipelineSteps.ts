import { useMemo, useEffect } from "react";
import { DropResult } from "@hello-pangea/dnd";
import {
  Endpoint,
  BackendNode,
  BackendEdge,
  AnyMessagingResource,
} from "@workspace/canvas/types";
import {
  StepType,
  PipelineStepDraft,
  StepBinding,
  AvailableSource,
} from "./types";
import {
  generateId,
  ensureRedisCacheConnection,
  cleanupRedisCacheConnection,
  ensureDatabaseRefConnection,
  cleanupDatabaseRefConnection,
  ensurePageRefConnection,
  cleanupPageRefConnection,
} from "./utils";
import {
  upsertDerivedConnection,
  removeDerivedConnection,
} from "./PushToClientStepSection";
import {
  getConnectedTransformersForEndpoint,
  getConnectedKafkaForEndpoint,
  getConnectedLangGraphForEndpoint,
  isStepInputUnconfigured,
} from "@/lib/utils/pipelineValidation";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";
import { toTableName, toVarName } from "@/lib/compiler/utils";

export interface UsePipelineStepsProps {
  steps: PipelineStepDraft[];
  onChange: (steps: PipelineStepDraft[]) => void;
  endpoint?: Endpoint;
  consumedEvent?: AnyMessagingResource;
  allNodes?: BackendNode[];
  allEdges?: BackendEdge[];
  serviceNodeId?: string;
  isNested?: boolean;
}

export function usePipelineSteps({
  steps,
  onChange,
  endpoint,
  consumedEvent,
  allNodes = [],
  allEdges = [],
  serviceNodeId,
  isNested = false,
}: UsePipelineStepsProps) {
  const isConsumer = Boolean(consumedEvent);

  // Separate draggable executable steps from the mandatory pinned return step
  const executableSteps = useMemo(
    () => steps.filter((s) => s.type !== "return_response"),
    [steps],
  );

  const targetId = endpoint?.id || consumedEvent?.id;
  const connectedTransformers = useMemo(() => {
    if (!targetId || !serviceNodeId) return [];
    return getConnectedTransformersForEndpoint(
      targetId,
      serviceNodeId,
      allNodes,
      allEdges,
    );
  }, [targetId, serviceNodeId, allNodes, allEdges]);

  // Auto-synchronize connected transformers into the pipeline steps
  useEffect(() => {
    if (connectedTransformers.length === 0) return;

    const missingTransformers = connectedTransformers.filter(
      (ct) =>
        !executableSteps.some(
          (s) =>
            s.type === "transform" &&
            (s.functionRef?.name === ct.functionName ||
              s.transformerNodeId === ct.id),
        ),
    );

    if (missingTransformers.length > 0) {
      const newSteps: PipelineStepDraft[] = missingTransformers.map(
        (ct, idx) => {
          const stepNum = executableSteps.length + idx + 1;
          const outputVar = `transformedData${stepNum}`;
          return {
            id: generateId(),
            name: outputVar,
            type: "transform",
            enabled: true,
            outputVariable: outputVar,
            functionRef: {
              name: ct.functionName,
              importPath: ct.isGlobal
                ? "@workspace/transformers"
                : `@/services/${serviceNodeId}/transformers/${ct.functionName}`,
              isGlobal: ct.isGlobal,
              inputSchema: ct.inputSchema,
              returnSchema: ct.returnSchema,
            },
            transformerNodeId: ct.id,
            inputBindings: [],
          };
        },
      );

      if (isConsumer) {
        onChange([...executableSteps, ...newSteps]);
      } else {
        const foundReturn = steps.find((s) => s.type === "return_response");
        onChange([
          ...executableSteps,
          ...newSteps,
          foundReturn || {
            id: "return-response-step",
            name: "Return Response",
            type: "return_response",
            enabled: true,
            statusCode: endpoint?.type === "POST" ? 201 : 200,
            inputBindings: [],
            outputVariable: "",
          },
        ]);
      }
    }
  }, [
    connectedTransformers,
    executableSteps,
    isConsumer,
    onChange,
    serviceNodeId,
    endpoint?.type,
    steps,
  ]);

  const connectedKafka = useMemo(() => {
    if (!targetId || !serviceNodeId) return [];
    return getConnectedKafkaForEndpoint(
      targetId,
      serviceNodeId,
      allNodes,
      allEdges,
      endpoint,
    );
  }, [targetId, serviceNodeId, allNodes, allEdges, endpoint]);

  // Auto-synchronize connected Kafka topics into the pipeline steps
  useEffect(() => {
    if (connectedKafka.length === 0) return;

    const missingKafka = connectedKafka.filter(
      (ck) =>
        !executableSteps.some(
          (s) =>
            s.type === "kafka_publish" &&
            (s.functionRef?.name === ck.functionName ||
              s.brokerNodeId === ck.brokerNodeId ||
              s.messagingResourceId === ck.topicId),
        ),
    );

    if (missingKafka.length > 0) {
      const newKafkaSteps: PipelineStepDraft[] = missingKafka.map(
        (ck, idx) => {
          const stepNum = executableSteps.length + idx + 1;
          const outputVar = `kafkaPublishResult${stepNum > 1 ? stepNum : ""}`;
          const inputBindings: StepBinding[] = [];
          if (ck.functionName === "publishKafkaEvent") {
            inputBindings.push({
              argName: "topic",
              source: {
                kind: "inline",
                value: ck.topicName || "events",
              },
            });
          }
          inputBindings.push({
            argName: ck.functionName === "publishKafkaEvent" ? "payload" : "message",
            source: { kind: "req_body", field: "" },
          });

          return {
            id: generateId(),
            name: ck.publisherName || `Publish ${ck.topicName}`,
            type: "kafka_publish",
            enabled: true,
            outputVariable: outputVar,
            functionRef: {
              name: ck.functionName,
              importPath: ck.importPath,
            },
            inputBindings,
            brokerNodeId: ck.brokerNodeId,
            messagingResourceId: ck.topicId,
          };
        },
      );

      if (isConsumer) {
        onChange([...executableSteps, ...newKafkaSteps]);
      } else {
        const foundReturn = steps.find((s) => s.type === "return_response");
        onChange([
          ...executableSteps,
          ...newKafkaSteps,
          foundReturn || {
            id: "return-response-step",
            name: "Return Response",
            type: "return_response",
            enabled: true,
            statusCode: endpoint?.type === "POST" ? 201 : 200,
            inputBindings: [],
            outputVariable: "",
          },
        ]);
      }
    }
  }, [
    connectedKafka,
    executableSteps,
    isConsumer,
    onChange,
    serviceNodeId,
    endpoint?.type,
    steps,
  ]);

  const connectedLangGraph = useMemo(() => {
    if (!targetId || !serviceNodeId) return [];
    return getConnectedLangGraphForEndpoint(
      targetId,
      serviceNodeId,
      allNodes,
      allEdges,
    );
  }, [targetId, serviceNodeId, allNodes, allEdges]);

  // Auto-synchronize connected LangGraph agents into the pipeline steps
  useEffect(() => {
    if (connectedLangGraph.length === 0) return;

    const missingLangGraph = connectedLangGraph.filter(
      (clg) =>
        !executableSteps.some(
          (s) =>
            s.type === "langgraph_invoke" &&
            (s.langGraphTargetNodeId === clg.id || s.name === clg.label),
        ),
    );

    if (missingLangGraph.length > 0) {
      const newLangGraphSteps: PipelineStepDraft[] = missingLangGraph.map(
        (clg, idx) => {
          const stepNum = executableSteps.length + idx + 1;
          const agentLabel = clg.label || "LangGraph Agent";
          const outputVar = `${toVarName(agentLabel)}Result${stepNum > 1 ? stepNum : ""}`;
          const defaultMapping: Record<string, string> = {};
          if (clg.stateChannels && clg.stateChannels.length > 0) {
            clg.stateChannels.forEach((ch: any) => {
              if (ch.key === "messages") {
                defaultMapping[ch.key] = isConsumer ? "event.message" : "body.message";
              } else {
                defaultMapping[ch.key] = isConsumer ? `event.${ch.key}` : `body.${ch.key}`;
              }
            });
          } else {
            defaultMapping["messages"] = isConsumer ? "event.message" : "body.message";
          }

          return {
            id: generateId(),
            name: agentLabel,
            type: "langgraph_invoke",
            enabled: true,
            outputVariable: outputVar,
            langGraphTargetNodeId: clg.id,
            langGraphStreamingEnabled: false,
            langGraphStreamingProtocol: "sse",
            langGraphOutputMode: "full_state",
            langGraphStateMapping: defaultMapping,
            inputBindings: [],
          };
        },
      );

      if (isConsumer) {
        onChange([...executableSteps, ...newLangGraphSteps]);
      } else {
        const foundReturn = steps.find((s) => s.type === "return_response");
        onChange([
          ...executableSteps,
          ...newLangGraphSteps,
          foundReturn || {
            id: "return-response-step",
            name: "Return Response",
            type: "return_response",
            enabled: true,
            statusCode: endpoint?.type === "POST" ? 201 : 200,
            inputBindings: [],
            outputVariable: "",
          },
        ]);
      }
    }
  }, [
    connectedLangGraph,
    executableSteps,
    isConsumer,
    onChange,
    serviceNodeId,
    endpoint?.type,
    steps,
  ]);

  // Stable synchronization keys to prevent re-running connection effects on internal step property changes (e.g. checkbox toggles)
  const redisStepsKey = useMemo(
    () =>
      executableSteps
        .filter((s) => s.type === "redis_operation" && s.tableNodeId && s.tableNodeId !== "__none__")
        .map((s) => `${s.id}:${s.tableNodeId}:${s.databaseId}`)
        .join("|"),
    [executableSteps],
  );

  const dbStepsKey = useMemo(
    () =>
      executableSteps
        .filter((s) => s.type === "db_operation" && (s.tableNodeId || s.databaseId))
        .map((s) => `${s.id}:${s.tableNodeId}:${s.databaseId}:${s.functionRef?.name || s.operationId}`)
        .join("|"),
    [executableSteps],
  );

  const pushStepsKey = useMemo(
    () =>
      executableSteps
        .filter((s) => s.type === "push_to_client")
        .map((s) => `${s.id}:${s.clientDeliveryTargetPageId}:${s.clientDeliveryPageRefNodeId}`)
        .join("|"),
    [executableSteps],
  );

  // Auto-synchronize connected Redis cache nodes and edges for configured redis_operation steps
  useEffect(() => {
    if (!serviceNodeId) return;
    const redisSteps = executableSteps.filter(
      (s) => s.type === "redis_operation" && s.tableNodeId && s.tableNodeId !== "__none__",
    );
    if (redisSteps.length === 0) return;

    redisSteps.forEach((s) => {
      ensureRedisCacheConnection({
        schemaId: s.tableNodeId,
        instanceId: s.databaseId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redisStepsKey, serviceNodeId, endpoint?.id, consumedEvent?.id]);

  // Auto-synchronize connected Database ref nodes and function edges for configured db_operation steps
  useEffect(() => {
    if (!serviceNodeId) return;
    const dbSteps = executableSteps.filter(
      (s) => s.type === "db_operation" && (s.tableNodeId || s.databaseId),
    );
    if (dbSteps.length === 0) return;

    dbSteps.forEach((s) => {
      ensureDatabaseRefConnection({
        tableNodeId: s.tableNodeId,
        databaseId: s.databaseId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        functionName: s.functionRef?.name || s.operationId,
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbStepsKey, serviceNodeId, endpoint?.id, consumedEvent?.id]);

  // Auto-synchronize connected PageRef nodes and edges for configured push_to_client steps
  useEffect(() => {
    if (!serviceNodeId) return;
    const pushSteps = executableSteps.filter((s) => s.type === "push_to_client");
    if (pushSteps.length === 0) return;

    pushSteps.forEach((s) => {
      ensurePageRefConnection({
        targetPageId: s.clientDeliveryTargetPageId,
        pageRefNodeId: s.clientDeliveryPageRefNodeId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        stepId: s.id,
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushStepsKey, serviceNodeId, endpoint?.id, consumedEvent?.id]);

  const hasUnconfiguredInputs = useMemo(
    () => executableSteps.some((s) => isStepInputUnconfigured(s, allNodes)),
    [executableSteps, allNodes],
  );

  const returnStep: PipelineStepDraft = useMemo(() => {
    if (isConsumer) {
      return {
        id: "return-event-step",
        name: "Acknowledge Event",
        type: "return_response",
        enabled: true,
        statusCode: 200,
        inputBindings: [],
        outputVariable: "",
      };
    }
    const found = steps.find((s) => s.type === "return_response");
    if (found) return found;
    return {
      id: "return-response-step",
      name: "Return Response",
      type: "return_response",
      enabled: true,
      statusCode: endpoint?.type === "POST" ? 201 : 200,
      inputBindings: [],
      outputVariable: "",
    };
  }, [steps, endpoint?.type, isConsumer]);

  const addStep = (type: StepType) => {
    const id = generateId();
    const stepNum = executableSteps.length + 1;
    const defaultVar =
      type === "transform"
        ? `transformedData${stepNum}`
        : type === "db_operation"
        ? `dbResult${stepNum}`
        : type === "redis_operation"
        ? `cachedResult${stepNum}`
        : type === "kafka_publish"
        ? `publishResult${stepNum}`
        : type === "service_call"
        ? `serviceResponse${stepNum}`
        : type === "external_call"
        ? `externalResult${stepNum}`
        : type === "condition"
        ? `condition${stepNum}Result`
        : type === "try_catch"
        ? `tryCatch${stepNum}Result`
        : type === "switch"
        ? `switch${stepNum}Result`
        : type === "parallel"
        ? `parallel${stepNum}Results`
        : type === "loop"
        ? `loop${stepNum}Results`
        : type === "early_return"
        ? `earlyReturn${stepNum}`
        : type === "langgraph_invoke"
        ? `agentResult${stepNum}`
        : `step${stepNum}Result`;

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

      const connectionResult = ensureDatabaseRefConnection({
        tableNodeId: firstEntity?.id,
        databaseId: targetDbId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        functionName: defaultOp?.name,
      });

      initialFields = {
        databaseId: targetDbId,
        tableNodeId: firstEntity?.id || connectionResult?.dbRefNodeId,
        operationId: defaultOp?.id,
        functionRef: defaultOp && importPath
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
    } else if (type === "external_call") {
      const extNodes = allNodes.filter((n) => n.type === "external");
      const firstExt = extNodes[0];
      const fnName = toVarName(firstExt?.data?.functionName || firstExt?.data?.label || "callExternalApi");
      const varName = `${fnName}Response`;
      const allStoreEndpoints = useBackendCanvasStore.getState().endpoints;
      const extEndpoints = firstExt ? allStoreEndpoints.filter((e) => e.nodeId === firstExt.id) : [];
      const firstEp = extEndpoints[0] || firstExt?.data?.endpoints?.[0];
      const inputBindings = (firstExt?.data?.inputVariables || []).map((v) => ({
        argName: v.name,
        source: { kind: "req_body" as const, field: v.name },
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
        stateChannels.forEach((ch: any) => {
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

      const varName = `pushToClient${stepNum}`;
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
        upsertDerivedConnection(
          store,
          firstPage.id,
          { id, type: "push_to_client", ...initialFields } as PipelineStepDraft,
          serviceNodeId,
          sourceItemName,
          sourceItemId,
          sourceItemType,
        );
      }
    }

    const newStep: PipelineStepDraft = {
      id,
      name: defaultVar,
      type,
      enabled: true,
      inputBindings: [],
      outputVariable: defaultVar,
      ...initialFields,
    };
    if (isConsumer || isNested) {
      onChange([...executableSteps, newStep]);
    } else {
      onChange([...executableSteps, newStep, returnStep]);
    }
  };

  const updateStep = (index: number, updated: PipelineStepDraft) => {
    const prevStep = executableSteps[index];
    if (prevStep?.type === "redis_operation" && updated.type !== "redis_operation") {
      const remainingSteps = executableSteps.filter((_, i) => i !== index);
      cleanupRedisCacheConnection({
        tableNodeId: prevStep.tableNodeId,
        databaseId: prevStep.databaseId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        remainingSteps,
      });
    } else if (
      prevStep?.type === "redis_operation" &&
      updated.type === "redis_operation" &&
      prevStep.tableNodeId &&
      prevStep.tableNodeId !== updated.tableNodeId
    ) {
      const otherSteps = executableSteps.filter((_, i) => i !== index);
      cleanupRedisCacheConnection({
        tableNodeId: prevStep.tableNodeId,
        databaseId: prevStep.databaseId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        remainingSteps: otherSteps,
      });
      if (updated.tableNodeId) {
        ensureRedisCacheConnection({
          schemaId: updated.tableNodeId,
          instanceId: updated.databaseId,
          serviceNodeId,
          endpointId: endpoint?.id,
          consumedEventId: consumedEvent?.id,
        });
      }
    }

    if (prevStep?.type === "db_operation" && updated.type !== "db_operation") {
      const remainingSteps = executableSteps.filter((_, i) => i !== index);
      cleanupDatabaseRefConnection({
        tableNodeId: prevStep.tableNodeId,
        databaseId: prevStep.databaseId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        functionName: prevStep.functionRef?.name || prevStep.operationId,
        remainingSteps,
      });
    } else if (
      prevStep?.type === "db_operation" &&
      updated.type === "db_operation" &&
      (prevStep.tableNodeId !== updated.tableNodeId ||
        prevStep.databaseId !== updated.databaseId ||
        prevStep.functionRef?.name !== updated.functionRef?.name ||
        prevStep.operationId !== updated.operationId)
    ) {
      const otherSteps = executableSteps.filter((_, i) => i !== index);
      cleanupDatabaseRefConnection({
        tableNodeId: prevStep.tableNodeId,
        databaseId: prevStep.databaseId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        functionName: prevStep.functionRef?.name || prevStep.operationId,
        remainingSteps: otherSteps,
      });
      if (updated.tableNodeId || updated.databaseId) {
        ensureDatabaseRefConnection({
          tableNodeId: updated.tableNodeId,
          databaseId: updated.databaseId,
          serviceNodeId,
          endpointId: endpoint?.id,
          consumedEventId: consumedEvent?.id,
          functionName: updated.functionRef?.name || updated.operationId,
        });
      }
    }

    if (prevStep?.type === "push_to_client" && updated.type !== "push_to_client") {
      const remainingSteps = executableSteps.filter((_, i) => i !== index);
      cleanupPageRefConnection({
        pageRefNodeId: prevStep.clientDeliveryPageRefNodeId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        remainingSteps,
      });
      if (prevStep.clientDeliveryTargetPageId) {
        const store = useBackendCanvasStore.getState();
        removeDerivedConnection(store, prevStep.clientDeliveryTargetPageId, prevStep.id);
      }
    } else if (prevStep?.type !== "push_to_client" && updated.type === "push_to_client") {
      const allWebPageNodes = allNodes.filter((n) => n.type === "webPage");
      const targetPageId = updated.clientDeliveryTargetPageId || allWebPageNodes[0]?.id;
      const connectionResult = ensurePageRefConnection({
        targetPageId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        stepId: updated.id,
      });
      if (connectionResult) {
        updated.clientDeliveryPageRefNodeId = connectionResult.pageRefNodeId;
        if (!updated.clientDeliveryTargetPageId && connectionResult.targetPageId) {
          updated.clientDeliveryTargetPageId = connectionResult.targetPageId;
        }
      }
    }

    const next = [...executableSteps];
    next[index] = updated;
    if (isConsumer || isNested) {
      onChange(next);
    } else {
      onChange([...next, returnStep]);
    }
  };

  const deleteStep = (index: number) => {
    const stepToDelete = executableSteps[index];
    if (!stepToDelete) return;

    if (stepToDelete.type === "push_to_client") {
      const remainingSteps = executableSteps.filter((_, i) => i !== index);
      cleanupPageRefConnection({
        pageRefNodeId: stepToDelete.clientDeliveryPageRefNodeId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        remainingSteps,
      });
      if (stepToDelete.clientDeliveryTargetPageId) {
        const store = useBackendCanvasStore.getState();
        removeDerivedConnection(store, stepToDelete.clientDeliveryTargetPageId, stepToDelete.id);
      }
    }

    if (stepToDelete.type === "redis_operation") {
      const remainingSteps = executableSteps.filter((_, i) => i !== index);
      cleanupRedisCacheConnection({
        tableNodeId: stepToDelete.tableNodeId,
        databaseId: stepToDelete.databaseId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        remainingSteps,
      });
    }

    if (stepToDelete.type === "db_operation") {
      const remainingSteps = executableSteps.filter((_, i) => i !== index);
      cleanupDatabaseRefConnection({
        tableNodeId: stepToDelete.tableNodeId,
        databaseId: stepToDelete.databaseId,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        functionName: stepToDelete.functionRef?.name || stepToDelete.operationId,
        remainingSteps,
      });
    }

    if (stepToDelete.type === "transform") {
      const store = useBackendCanvasStore.getState();
      const fnName = stepToDelete.functionRef?.name;
      const tNodeId = stepToDelete.transformerNodeId;

      // Find matching transformer or transformer_ref nodes
      const matchingTransformerNodes = store.nodes.filter(
        (n) =>
          (n.type === "transformer" || n.type === "transformer_ref") &&
          (n.id === tNodeId ||
            n.id === fnName ||
            n.data?.functionName === fnName ||
            n.data?.label === fnName ||
            (n.type === "transformer_ref" && n.data?.transformerRef === fnName)),
      );

      const matchingNodeIds = new Set(matchingTransformerNodes.map((n) => n.id));

      // Also check connectedTransformers for this endpoint/consumer
      connectedTransformers.forEach((ct) => {
        if (
          ct.functionName === fnName ||
          ct.id === tNodeId ||
          ct.nodeId === tNodeId
        ) {
          matchingNodeIds.add(ct.id);
          matchingNodeIds.add(ct.nodeId);
          if (ct.masterId) matchingNodeIds.add(ct.masterId);
        }
      });

      // 1. Delete matching canvas edges connecting this transformer to this service endpoint/event
      const edgesToDelete = store.edges.filter((e) => {
        if (!e) return false;
        const isFromTransformer =
          matchingNodeIds.has(e.source) || matchingNodeIds.has(e.target);
        if (!isFromTransformer) return false;

        const isToThisService =
          Boolean(serviceNodeId) &&
          (e.target === serviceNodeId || e.source === serviceNodeId);

        const isToThisTargetHandle =
          Boolean(targetId) &&
          (e.targetHandle === `endpoint-in-${targetId}` ||
            e.targetHandle === `consumedEvents-in-${targetId}` ||
            e.targetHandle === targetId ||
            e.sourceHandle === `endpoint-in-${targetId}` ||
            e.sourceHandle === `consumedEvents-in-${targetId}`);

        return isToThisService && isToThisTargetHandle;
      });

      edgesToDelete.forEach((e) => store.deleteEdge(e.id));

      // 2. Clean up targetEndpointIds / targetEventIds on the transformer node(s)
      matchingTransformerNodes.forEach((tNode) => {
        if (tNode.data) {
          const currentEpIds: string[] =
            tNode.data.targetEndpointIds ||
            (tNode.data.targetEndpointId ? [tNode.data.targetEndpointId] : []);
          const currentEvIds: string[] =
            tNode.data.targetEventIds ||
            (tNode.data.targetEventId ? [tNode.data.targetEventId] : []);

          const nextEpIds = targetId
            ? currentEpIds.filter((id) => id !== targetId)
            : currentEpIds;
          const nextEvIds = targetId
            ? currentEvIds.filter((id) => id !== targetId)
            : currentEvIds;

          const hasRemainingTargets =
            nextEpIds.length > 0 || nextEvIds.length > 0;

          store.updateNode(tNode.id, {
            data: {
              ...tNode.data,
              targetEndpointIds: nextEpIds,
              targetEndpointId: nextEpIds[0] || undefined,
              targetEventIds: nextEvIds,
              targetEventId: nextEvIds[0] || undefined,
              targetServiceId: hasRemainingTargets
                ? tNode.data.targetServiceId
                : undefined,
            },
          });
        }
      });
    }

    if (stepToDelete.type === "kafka_publish") {
      const store = useBackendCanvasStore.getState();
      const brokerNodeId = stepToDelete.brokerNodeId;
      const messagingResourceId = stepToDelete.messagingResourceId;

      // Clean up matching publishedEvents on the endpoint if found
      if (endpoint && endpoint.publishedEvents && (brokerNodeId || messagingResourceId)) {
        const remainingPubs = endpoint.publishedEvents.filter(
          (pe) =>
            (brokerNodeId && pe.brokerNodeId === brokerNodeId) ||
            (messagingResourceId && pe.messagingResourceId === messagingResourceId)
              ? false
              : true,
        );
        if (remainingPubs.length !== endpoint.publishedEvents.length) {
          store.updateEndpoint(endpoint.id, {
            publishedEvents: remainingPubs,
          });
        }
      }
    }

    if (stepToDelete.type === "langgraph_invoke") {
      const store = useBackendCanvasStore.getState();
      const targetAgentId = stepToDelete.langGraphTargetNodeId;
      if (targetAgentId) {
        const edgesToDelete = store.edges.filter((e) => {
          if (!e) return false;
          const isWithAgent =
            e.source === targetAgentId || e.target === targetAgentId;
          if (!isWithAgent) return false;
          const isWithService =
            Boolean(serviceNodeId) &&
            (e.source === serviceNodeId || e.target === serviceNodeId);
          if (!isWithService) return false;

          const isToThisTargetHandle =
            Boolean(targetId) &&
            (e.targetHandle === `endpoint-in-${targetId}` ||
              e.targetHandle === `endpoint-out-${targetId}` ||
              e.targetHandle === `consumedEvents-in-${targetId}` ||
              e.targetHandle === `consumedEvents-out-${targetId}` ||
              e.targetHandle === targetId ||
              e.sourceHandle === `endpoint-out-${targetId}` ||
              e.sourceHandle === `endpoint-in-${targetId}` ||
              e.sourceHandle === `consumedEvents-out-${targetId}` ||
              e.sourceHandle === `consumedEvents-in-${targetId}` ||
              e.sourceHandle === targetId);

          return isToThisTargetHandle;
        });

        edgesToDelete.forEach((e) => store.deleteEdge(e.id));
      }
    }

    const next = executableSteps.filter((_, i) => i !== index);
    if (isConsumer || isNested) {
      onChange(next);
    } else {
      onChange([...next, returnStep]);
    }
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= executableSteps.length) return;
    const reordered = Array.from(executableSteps);
    const [moved] = reordered.splice(fromIndex, 1);
    if (!moved) return;
    reordered.splice(toIndex, 0, moved);
    if (isConsumer || isNested) {
      onChange(reordered);
    } else {
      onChange([...reordered, returnStep]);
    }
  };

  const updateReturnStep = (updated: PipelineStepDraft) => {
    if (isConsumer || isNested) return;
    onChange([...executableSteps, updated]);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    moveStep(result.source.index, result.destination.index);
  };

  return {
    isConsumer,
    executableSteps,
    returnStep,
    hasUnconfiguredInputs,
    addStep,
    updateStep,
    deleteStep,
    moveStep,
    updateReturnStep,
    handleDragEnd,
  };
}
