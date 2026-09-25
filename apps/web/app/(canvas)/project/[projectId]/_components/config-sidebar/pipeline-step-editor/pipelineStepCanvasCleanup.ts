import {
  Endpoint,
  BackendNode,
} from "@workspace/canvas/types";
import { ConnectedTransformer } from "@/types/canvas";
import { PipelineStepDraft } from "./types";
import {
  cleanupRedisCacheConnection,
  ensureRedisCacheConnection,
  cleanupDatabaseRefConnection,
  ensureDatabaseRefConnection,
  cleanupPageRefConnection,
  ensurePageRefConnection,
  cleanupStorageOperationRefConnection,
  ensureStorageOperationRefConnection,
} from "./utils";
import { removeDerivedConnection } from "./PushToClientStepSection";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

export interface HandleStepUpdateCanvasEffectsParams {
  prevStep: PipelineStepDraft;
  updatedStep: PipelineStepDraft;
  remainingSteps: PipelineStepDraft[];
  serviceNodeId?: string;
  endpointId?: string;
  consumedEventId?: string;
  allNodes: BackendNode[];
  isNested: boolean;
}

export function handleStepUpdateCanvasEffects({
  prevStep,
  updatedStep,
  remainingSteps,
  serviceNodeId,
  endpointId,
  consumedEventId,
  allNodes,
  isNested,
}: HandleStepUpdateCanvasEffectsParams): void {
  if (isNested) return;

  if (prevStep.type === "redis_operation" && updatedStep.type !== "redis_operation") {
    cleanupRedisCacheConnection({
      tableNodeId: prevStep.tableNodeId,
      databaseId: prevStep.databaseId,
      serviceNodeId,
      endpointId,
      consumedEventId,
      remainingSteps,
    });
  } else if (
    prevStep.type === "redis_operation" &&
    updatedStep.type === "redis_operation" &&
    prevStep.tableNodeId &&
    prevStep.tableNodeId !== updatedStep.tableNodeId
  ) {
    cleanupRedisCacheConnection({
      tableNodeId: prevStep.tableNodeId,
      databaseId: prevStep.databaseId,
      serviceNodeId,
      endpointId,
      consumedEventId,
      remainingSteps,
    });
    if (updatedStep.tableNodeId) {
      ensureRedisCacheConnection({
        schemaId: updatedStep.tableNodeId,
        instanceId: updatedStep.databaseId,
        serviceNodeId,
        endpointId,
        consumedEventId,
      });
    }
  }

  if (prevStep.type === "db_operation" && updatedStep.type !== "db_operation") {
    cleanupDatabaseRefConnection({
      tableNodeId: prevStep.tableNodeId,
      databaseId: prevStep.databaseId,
      serviceNodeId,
      endpointId,
      consumedEventId,
      functionName: prevStep.functionRef?.name || prevStep.operationId,
      remainingSteps,
    });
  } else if (
    prevStep.type === "db_operation" &&
    updatedStep.type === "db_operation" &&
    (prevStep.tableNodeId !== updatedStep.tableNodeId ||
      prevStep.databaseId !== updatedStep.databaseId ||
      prevStep.functionRef?.name !== updatedStep.functionRef?.name ||
      prevStep.operationId !== updatedStep.operationId)
  ) {
    cleanupDatabaseRefConnection({
      tableNodeId: prevStep.tableNodeId,
      databaseId: prevStep.databaseId,
      serviceNodeId,
      endpointId,
      consumedEventId,
      functionName: prevStep.functionRef?.name || prevStep.operationId,
      remainingSteps,
    });
    if (updatedStep.tableNodeId || updatedStep.databaseId) {
      ensureDatabaseRefConnection({
        tableNodeId: updatedStep.tableNodeId,
        databaseId: updatedStep.databaseId,
        serviceNodeId,
        endpointId,
        consumedEventId,
        functionName: updatedStep.functionRef?.name || updatedStep.operationId,
      });
    }
  }

  if (prevStep.type === "push_to_client" && updatedStep.type !== "push_to_client") {
    cleanupPageRefConnection({
      pageRefNodeId: prevStep.clientDeliveryPageRefNodeId,
      serviceNodeId,
      endpointId,
      consumedEventId,
      remainingSteps,
    });
    if (prevStep.clientDeliveryTargetPageId) {
      const store = useBackendCanvasStore.getState();
      removeDerivedConnection(store, prevStep.clientDeliveryTargetPageId, prevStep.id);
    }
  } else if (prevStep.type !== "push_to_client" && updatedStep.type === "push_to_client") {
    const allWebPageNodes = allNodes.filter((n) => n.type === "webPage");
    const targetPageId = updatedStep.clientDeliveryTargetPageId || allWebPageNodes[0]?.id;
    const connectionResult = ensurePageRefConnection({
      targetPageId,
      serviceNodeId,
      endpointId,
      consumedEventId,
      stepId: updatedStep.id,
    });
    if (connectionResult) {
      updatedStep.clientDeliveryPageRefNodeId = connectionResult.pageRefNodeId;
      if (!updatedStep.clientDeliveryTargetPageId && connectionResult.targetPageId) {
        updatedStep.clientDeliveryTargetPageId = connectionResult.targetPageId;
      }
    }
  }

  if (prevStep.type === "storage_operation" && updatedStep.type !== "storage_operation") {
    cleanupStorageOperationRefConnection({
      storageNodeId: prevStep.storageNodeId || prevStep.brokerNodeId,
      bucketId: prevStep.bucketId,
      serviceNodeId,
      endpointId,
      consumedEventId,
      functionName: prevStep.functionRef?.name || prevStep.operationId,
      remainingSteps,
    });
  } else if (
    (prevStep.type === "storage_operation" && updatedStep.type === "storage_operation") ||
    (prevStep.type !== "storage_operation" && updatedStep.type === "storage_operation")
  ) {
    if (
      prevStep.type === "storage_operation" &&
      (prevStep.storageNodeId !== updatedStep.storageNodeId ||
        prevStep.bucketId !== updatedStep.bucketId ||
        prevStep.functionRef?.name !== updatedStep.functionRef?.name ||
        prevStep.operationId !== updatedStep.operationId)
    ) {
      cleanupStorageOperationRefConnection({
        storageNodeId: prevStep.storageNodeId || prevStep.brokerNodeId,
        bucketId: prevStep.bucketId,
        serviceNodeId,
        endpointId,
        consumedEventId,
        functionName: prevStep.functionRef?.name || prevStep.operationId,
        remainingSteps,
      });
    }

    if (updatedStep.type === "storage_operation") {
      ensureStorageOperationRefConnection({
        storageNodeId: updatedStep.storageNodeId || updatedStep.brokerNodeId,
        bucketId: updatedStep.bucketId,
        serviceNodeId,
        endpointId,
        consumedEventId,
        functionName: updatedStep.functionRef?.name || updatedStep.operationId,
      });
    }
  }
}

export interface HandleStepDeleteCanvasEffectsParams {
  stepToDelete: PipelineStepDraft;
  remainingSteps: PipelineStepDraft[];
  serviceNodeId?: string;
  targetId?: string;
  endpoint?: Endpoint;
  consumedEventId?: string;
  connectedTransformers: ConnectedTransformer[];
  isNested: boolean;
}

export function handleStepDeleteCanvasEffects({
  stepToDelete,
  remainingSteps,
  serviceNodeId,
  targetId,
  endpoint,
  consumedEventId,
  connectedTransformers,
  isNested,
}: HandleStepDeleteCanvasEffectsParams): void {
  if (isNested) return;

  if (stepToDelete.type === "push_to_client") {
    cleanupPageRefConnection({
      pageRefNodeId: stepToDelete.clientDeliveryPageRefNodeId,
      serviceNodeId,
      endpointId: endpoint?.id,
      consumedEventId,
      remainingSteps,
    });
    if (stepToDelete.clientDeliveryTargetPageId) {
      const store = useBackendCanvasStore.getState();
      removeDerivedConnection(store, stepToDelete.clientDeliveryTargetPageId, stepToDelete.id);
    }
  }

  if (stepToDelete.type === "redis_operation") {
    cleanupRedisCacheConnection({
      tableNodeId: stepToDelete.tableNodeId,
      databaseId: stepToDelete.databaseId,
      serviceNodeId,
      endpointId: endpoint?.id,
      consumedEventId,
      remainingSteps,
    });
  }

  if (stepToDelete.type === "db_operation") {
    cleanupDatabaseRefConnection({
      tableNodeId: stepToDelete.tableNodeId,
      databaseId: stepToDelete.databaseId,
      serviceNodeId,
      endpointId: endpoint?.id,
      consumedEventId,
      functionName: stepToDelete.functionRef?.name || stepToDelete.operationId,
      remainingSteps,
    });
  }

  if (stepToDelete.type === "storage_operation") {
    cleanupStorageOperationRefConnection({
      storageNodeId: stepToDelete.storageNodeId || stepToDelete.brokerNodeId,
      bucketId: stepToDelete.bucketId,
      serviceNodeId,
      endpointId: endpoint?.id,
      consumedEventId,
      functionName: stepToDelete.functionRef?.name || stepToDelete.operationId,
      remainingSteps,
    });
  }

  if (stepToDelete.type === "transform") {
    const store = useBackendCanvasStore.getState();
    const fnName = stepToDelete.functionRef?.name;
    const tNodeId = stepToDelete.transformerNodeId;

    const matchingTransformerNodes = store.nodes.filter(
      (n) =>
        (n.type === "transformer" || n.type === "transformer_ref") &&
        (n.id === tNodeId ||
          n.id === fnName ||
          n.data?.functionName === fnName ||
          n.data?.label === fnName ||
          (n.type === "transformer_ref" && n.data?.transformerRef === fnName)),
    );

    const matchingNodeIds = new Set<string>(matchingTransformerNodes.map((n) => n.id));

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
}
