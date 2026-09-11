import {
  BackendNode,
  BackendEdge,
  Endpoint,
  EndpointLike,
} from "@/types/canvas";
import { isOutputSchemaMissing } from "../nestedJsonSchema";
import { isStepInputUnconfigured } from "./stepValidation";
import {
  getConnectedTransformersForEndpoint,
  getConnectedKafkaForEndpoint,
  getConnectedLangGraphForEndpoint,
} from "./connectedResources";

/**
 * Checks if an endpoint or event consumer has an unconfigured or incomplete pipeline.
 * Returns true if the pipeline is incomplete/unconfigured (should be rendered in RED).
 */
export function isEndpointPipelineUnconfigured(
  endpointOrConsumer: EndpointLike,
  serviceNodeId: string,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): boolean {
  const currentNode = allNodes.find((n) => n.id === serviceNodeId);
  if (currentNode?.type === "external") {
    if (!currentNode.data?.baseUrl?.trim()) {
      return true;
    }
    return isOutputSchemaMissing(endpointOrConsumer);
  }

  const steps = endpointOrConsumer.pipelineSteps || [];

  // Check 1: Are there any existing steps in the pipeline with unconfigured inputs?
  const hasUnconfiguredStep = steps
    .filter((s) => s.type !== "return_response")
    .some((s) => isStepInputUnconfigured(s, allNodes));

  if (hasUnconfiguredStep) return true;

  // Check 1b: Are there external_call steps calling external endpoints that lack an output schema or Base URL?
  const hasUnconfiguredExternalCall = steps
    .filter((s) => s.type === "external_call")
    .some((s) => {
      const targetNodeId = s.externalNodeId || s.databaseId;
      const targetNode = allNodes.find((n) => n.id === targetNodeId);
      if (!targetNode?.data?.baseUrl?.trim()) {
        return true;
      }
      const targetEpId =
        s.externalEndpointId || s.tableNodeId || s.operationId;
      const targetEndpoints: Endpoint[] = targetNode.data?.endpoints || [];
      const targetEp = targetEndpoints.find(
        (ep) => ep.id === targetEpId || ep.name === targetEpId,
      );
      if (targetEp && isOutputSchemaMissing(targetEp)) {
        return true;
      }
      return false;
    });

  if (hasUnconfiguredExternalCall) return true;

  // Check 2: Are there transformers connected via canvas edges to this endpoint/consumer?
  const connectedTransformers = getConnectedTransformersForEndpoint(
    endpointOrConsumer.id,
    serviceNodeId,
    allNodes,
    allEdges,
  );

  if (connectedTransformers.length > 0) {
    for (const ct of connectedTransformers) {
      const matchingStep = steps.find(
        (s) =>
          s.type === "transform" &&
          (s.functionRef?.name === ct.functionName ||
            s.transformerNodeId === ct.id),
      );

      if (!matchingStep || isStepInputUnconfigured(matchingStep, allNodes)) {
        return true;
      }
    }
  }

  // Check 3: Are there Kafka brokers connected via canvas edges to this endpoint?
  const connectedKafka = getConnectedKafkaForEndpoint(
    endpointOrConsumer.id,
    serviceNodeId,
    allNodes,
    allEdges,
    endpointOrConsumer,
  );

  if (connectedKafka.length > 0) {
    for (const ck of connectedKafka) {
      const matchingStep = steps.find(
        (s) =>
          s.type === "kafka_publish" &&
          (s.functionRef?.name === ck.functionName ||
            s.brokerNodeId === ck.brokerNodeId ||
            s.messagingResourceId === ck.topicId),
      );

      if (!matchingStep || isStepInputUnconfigured(matchingStep, allNodes)) {
        return true;
      }
    }
  }

  // Check 4: Are there LangGraph agents connected via canvas edges to this endpoint?
  const connectedLangGraph = getConnectedLangGraphForEndpoint(
    endpointOrConsumer.id,
    serviceNodeId,
    allNodes,
    allEdges,
  );

  if (connectedLangGraph.length > 0) {
    for (const clg of connectedLangGraph) {
      const matchingStep = steps.find(
        (s) =>
          s.type === "langgraph_invoke" &&
          (s.langGraphTargetNodeId === clg.id || s.name === clg.label),
      );

      if (!matchingStep || isStepInputUnconfigured(matchingStep, allNodes)) {
        return true;
      }
    }
  }

  return false;
}
