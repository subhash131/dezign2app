import { PipelineStep } from "@workspace/canvas/types";
import { DeletedNodesMeta } from "../types";

/**
 * Filters out pipeline steps referencing deleted nodes, brokers, transformers,
 * langgraph nodes, redis instances, db_refs, or target services/endpoints.
 */
export function filterPipelineStepsOnNodeDeletion(
  steps: PipelineStep[],
  meta: DeletedNodesMeta,
  deletedEndpointIds: Set<string>,
): PipelineStep[] {
  if (!steps || steps.length === 0) return steps;

  return steps.filter((step) => {
    if (step.type === "kafka_publish" && meta.deletedBrokerIds.size > 0) {
      if (
        step.brokerNodeId &&
        (meta.allIdsSet.has(step.brokerNodeId) ||
          meta.deletedBrokerIds.has(step.brokerNodeId))
      ) {
        return false;
      }
      if (
        step.messagingResourceId &&
        meta.deletedBrokerTopicIds.has(step.messagingResourceId)
      ) {
        return false;
      }
      if (
        step.functionRef?.importPath &&
        Array.from(meta.deletedBrokerPackageNames).some((pkg) =>
          step.functionRef!.importPath!.startsWith(pkg),
        )
      ) {
        return false;
      }
      if (
        step.functionRef?.name &&
        Array.from(meta.deletedBrokerTopicNames).some((tn) =>
          step
            .functionRef!.name!.toLowerCase()
            .includes(tn.replace(/[^a-z0-9]/g, "")),
        )
      ) {
        return false;
      }
      return true;
    }

    if (step.type === "transform" && meta.deletedTransformerNodes.length > 0) {
      if (
        step.transformerNodeId &&
        meta.allIdsSet.has(step.transformerNodeId)
      ) {
        return false;
      }
      if (
        step.transformerRefNodeId &&
        meta.allIdsSet.has(step.transformerRefNodeId)
      ) {
        return false;
      }
      if (
        step.functionRef?.name &&
        (meta.allIdsSet.has(step.functionRef.name) ||
          meta.deletedTransformerNames.has(step.functionRef.name))
      ) {
        return false;
      }
      if (
        step.transformerName &&
        (meta.allIdsSet.has(step.transformerName) ||
          meta.deletedTransformerNames.has(step.transformerName))
      ) {
        return false;
      }
      return true;
    }

    if (step.type === "langgraph_invoke" && meta.deletedLangGraphIds.size > 0) {
      if (
        step.langGraphTargetNodeId &&
        meta.deletedLangGraphIds.has(step.langGraphTargetNodeId)
      ) {
        return false;
      }
      return true;
    }

    if (step.type === "redis_operation" && meta.deletedRedisIds.size > 0) {
      if (step.tableNodeId && meta.deletedRedisIds.has(step.tableNodeId)) {
        return false;
      }
      if (step.databaseId && meta.deletedRedisIds.has(step.databaseId)) {
        return false;
      }
      return true;
    }

    if (
      step.type === "db_operation" &&
      (meta.allIdsSet.size > 0 ||
        meta.deletedDbRefIds.size > 0 ||
        meta.deletedDbRefStepIds.size > 0)
    ) {
      if (step.tableNodeId && meta.allIdsSet.has(step.tableNodeId)) {
        return false;
      }
      if (step.databaseId && meta.allIdsSet.has(step.databaseId)) {
        return false;
      }
      if (
        step.dbRefNodeId &&
        (meta.allIdsSet.has(step.dbRefNodeId) ||
          meta.deletedDbRefIds.has(step.dbRefNodeId))
      ) {
        return false;
      }
      if (step.id && meta.deletedDbRefStepIds.has(step.id)) {
        return false;
      }
      return true;
    }

    if (step.type === "service_call" && meta.allIdsSet.size > 0) {
      const s = step as any;
      if (step.databaseId && meta.allIdsSet.has(step.databaseId)) {
        return false;
      }
      if (s.serviceId && meta.allIdsSet.has(s.serviceId)) {
        return false;
      }
      if (
        step.tableNodeId &&
        (meta.allIdsSet.has(step.tableNodeId) ||
          deletedEndpointIds.has(step.tableNodeId))
      ) {
        return false;
      }
      if (
        s.endpointId &&
        (meta.allIdsSet.has(s.endpointId) ||
          deletedEndpointIds.has(s.endpointId))
      ) {
        return false;
      }
      return true;
    }

    return true;
  });
}
