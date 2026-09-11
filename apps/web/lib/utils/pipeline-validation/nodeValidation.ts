import { useMemo } from "react";
import {
  BackendNode,
  BackendEdge,
  EndpointWithNode,
  EventWithNode,
  KafkaTopic,
} from "@/types/canvas";
import { PipelineStepDraft } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor/types";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { collectNestedSteps, isStepInputUnconfigured } from "./stepValidation";
import { isEndpointPipelineUnconfigured } from "./endpointValidation";

/**
 * Checks if a specific canvas node has a pipeline error (either as a host node
 * with unconfigured endpoints/consumers, or as a target node with unmapped required inputs).
 */
export function isNodePipelineUnconfigured(
  nodeId: string,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  allEndpoints: EndpointWithNode[] = [],
  allEvents: EventWithNode[] = [],
): boolean {
  const targetNode = allNodes.find((n) => n.id === nodeId);
  if (!targetNode) return false;

  // 1. Host Compute / Gateway Nodes (Service, Serverless, API Gateway)
  if (
    targetNode.type === "service" ||
    targetNode.type === "serverless" ||
    targetNode.type === "api_gateway"
  ) {
    const nodeEndpoints = allEndpoints.filter((e) => e.nodeId === nodeId);
    const hasUnconfiguredEndpoint = nodeEndpoints.some((ep) =>
      isEndpointPipelineUnconfigured(ep, nodeId, allNodes, allEdges),
    );
    if (hasUnconfiguredEndpoint) return true;

    const nodeEvents = allEvents.filter(
      (ev) => ev.nodeId === nodeId && ev.variant === "consume",
    );
    const hasUnconfiguredEvent = nodeEvents.some((ev) =>
      isEndpointPipelineUnconfigured(ev, nodeId, allNodes, allEdges),
    );
    if (hasUnconfiguredEvent) return true;

    return false;
  }

  // 2. Resource / Target Nodes referenced by pipeline steps
  const allSteps: PipelineStepDraft[] = [];
  for (const ep of allEndpoints) {
    const epSteps = ep.pipelineSteps;
    if (epSteps) {
      for (const step of epSteps) {
        allSteps.push(step, ...collectNestedSteps(step));
      }
    }
  }
  for (const ev of allEvents) {
    const evSteps = ev.pipelineSteps;
    if (evSteps) {
      for (const step of evSteps) {
        allSteps.push(step, ...collectNestedSteps(step));
      }
    }
  }

  // A) Kafka Broker Node
  if (
    targetNode.type === "kafka" ||
    targetNode.type === "eventstream" ||
    (targetNode.type === "queue" &&
      targetNode.data?.implementation?.toLowerCase() === "kafka")
  ) {
    const topics: KafkaTopic[] = targetNode.data?.topics || [];
    const topicIds = new Set(topics.map((t) => t.id).filter(Boolean));

    const relevantKafkaSteps = allSteps.filter(
      (s) =>
        s.enabled !== false &&
        s.type === "kafka_publish" &&
        (s.brokerNodeId === nodeId ||
          (s.messagingResourceId && topicIds.has(s.messagingResourceId)) ||
          (s.operationId && topicIds.has(s.operationId)) ||
          (s.functionRef?.name &&
            topics.some(
              (t) =>
                s.functionRef?.name?.toLowerCase() ===
                  `publish${t.name?.toLowerCase()}` ||
                (s.functionRef?.name?.toLowerCase() === "publishkafkaevent" &&
                  s.brokerNodeId === nodeId),
            ))),
    );

    if (
      relevantKafkaSteps.some((step) => isStepInputUnconfigured(step, allNodes))
    ) {
      return true;
    }
  }

  // B) Redis Cache Node
  if (targetNode.type === "redis-cache") {
    const schemaRef = targetNode.data?.schemaRef;
    const dbId = targetNode.data?.databaseId;

    const relevantRedisSteps = allSteps.filter(
      (s) =>
        s.enabled !== false &&
        s.type === "redis_operation" &&
        (s.tableNodeId === nodeId ||
          s.tableNodeId === schemaRef ||
          s.databaseId === nodeId ||
          s.databaseId === dbId),
    );

    if (
      relevantRedisSteps.some((step) => isStepInputUnconfigured(step, allNodes))
    ) {
      return true;
    }
  }

  // C) Database Table Reference Node or Entity Node
  if (targetNode.type === "db_ref" || targetNode.type === "entity") {
    const tableRef = targetNode.data?.tableRef || targetNode.id;

    const relevantDbSteps = allSteps.filter(
      (s) =>
        s.enabled !== false &&
        s.type === "db_operation" &&
        (s.tableNodeId === nodeId ||
          s.tableNodeId === tableRef ||
          s.databaseId === nodeId),
    );

    if (
      relevantDbSteps.some((step) => isStepInputUnconfigured(step, allNodes))
    ) {
      return true;
    }
  }

  // D) Transformer Node or Transformer Ref Node
  if (
    targetNode.type === "transformer" ||
    targetNode.type === "transformer_ref"
  ) {
    const fnName =
      targetNode.data?.functionName || targetNode.data?.label || "";
    const masterRef = targetNode.data?.transformerRef;

    const relevantTransformSteps = allSteps.filter(
      (s) =>
        s.enabled !== false &&
        s.type === "transform" &&
        (s.transformerNodeId === nodeId ||
          (fnName && s.functionRef?.name === fnName) ||
          (masterRef && s.functionRef?.name === masterRef) ||
          (targetNode.data?.label &&
            s.functionRef?.name === targetNode.data.label)),
    );

    if (
      relevantTransformSteps.some((step) =>
        isStepInputUnconfigured(step, allNodes),
      )
    ) {
      return true;
    }
  }

  // E) Page Ref Node (for push_to_client steps)
  if (targetNode.type === "page_ref") {
    const targetPageId = targetNode.data?.targetPageId;

    const relevantPushSteps = allSteps.filter(
      (s) =>
        s.enabled !== false &&
        s.type === "push_to_client" &&
        (s.clientDeliveryPageRefNodeId === nodeId ||
          s.clientDeliveryTargetPageId === nodeId ||
          (targetPageId && s.clientDeliveryTargetPageId === targetPageId)),
    );

    if (
      relevantPushSteps.some((step) => isStepInputUnconfigured(step, allNodes))
    ) {
      return true;
    }
  }

  // F) External Service Node
  if (targetNode.type === "external") {
    const relevantExtSteps = allSteps.filter(
      (s) =>
        s.enabled !== false &&
        s.type === "external_call" &&
        (s.externalNodeId === nodeId || s.databaseId === nodeId),
    );

    if (
      relevantExtSteps.some((step) => isStepInputUnconfigured(step, allNodes))
    ) {
      return true;
    }
  }

  // G) LangGraph Agent Node
  if (targetNode.type === "langgraph") {
    const relevantLgSteps = allSteps.filter(
      (s) =>
        s.enabled !== false &&
        s.type === "langgraph_invoke" &&
        s.langGraphTargetNodeId === nodeId,
    );

    if (
      relevantLgSteps.some((step) => isStepInputUnconfigured(step, allNodes))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * React hook to check if a specific node has a pipeline error.
 */
export function useNodePipelineError(nodeId: string): boolean {
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const allEdges = useBackendCanvasStore((s) => s.edges);
  const allEndpoints = useBackendCanvasStore((s) => s.endpoints);
  const allEvents = useBackendCanvasStore((s) => s.events);

  return useMemo(
    () =>
      isNodePipelineUnconfigured(
        nodeId,
        allNodes,
        allEdges,
        allEndpoints,
        allEvents,
      ),
    [nodeId, allNodes, allEdges, allEndpoints, allEvents],
  );
}
