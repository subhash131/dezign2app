import {
  DEFAULT_PUBLISH_TRIGGER_CONDITION,
  DEFAULT_PUBLISHED_EVENT_DEFAULTS,
} from "@workspace/canvas";
import { toFolderName, toPascalCase } from "@/lib/compiler/utils";
import { ConnectionContext } from "../types";
import { isMessagingResourceType, MESSAGING_NODE_TYPES } from "../utils";

/**
 * Handles endpoint connections:
 * 1. Endpoint -> Database/DB_ref node: syncs databaseNodeIds on endpoint
 * 2. Endpoint -> Messaging node: auto-creates publisher event and pipeline step,
 *    updates endpoint, and cleans up direct ReactFlow edge.
 *
 * @returns boolean `true` if direct edge was intercepted and rewired (messaging target), `false` otherwise.
 */
export function handleEndpointConnect({
  set,
  get,
  connection,
  targetNode,
  newEdge,
}: ConnectionContext): boolean {
  const isEndpointConnect =
    connection.sourceHandle?.startsWith("endpoint-out-");

  if (!isEndpointConnect || !connection.sourceHandle || !connection.target) {
    return false;
  }

  const endpointId = connection.sourceHandle.replace("endpoint-out-", "");

  // 1. Endpoint → DB / DB_Ref node
  if (targetNode.type === "db_ref" || targetNode.type === "database") {
    const endpoint = get().endpoints.find((e) => e.id === endpointId);
    if (endpoint) {
      const currentDbIds =
        endpoint.databaseNodeIds ||
        (endpoint.databaseNodeId && endpoint.databaseNodeId !== "none"
          ? [endpoint.databaseNodeId]
          : []);
      if (!currentDbIds.includes(connection.target)) {
        const newDbIds = [...currentDbIds, connection.target];
        get().updateEndpoint(endpointId, {
          databaseNodeIds: newDbIds,
          databaseNodeId: newDbIds[0] || "none",
        });
      }
    }
  }

  // 2. Endpoint → Messaging node: auto-create a publisher and rewire edge
  const isMessagingTarget = MESSAGING_NODE_TYPES.some(
    (t) => t === targetNode.type,
  );

  if (isMessagingTarget) {
    const endpoint = get().endpoints.find((e) => e.id === endpointId);
    if (!endpoint) return false;

    // Parse topic/resource ID from targetHandle, e.g. "topics:in:<topicId>"
    const targetHandle = connection.targetHandle ?? "";
    const resourceMatch = targetHandle.match(/^([^:]+):in:(.+)$/);
    const messagingResourceId = resourceMatch?.[2] ?? "";
    const rawResourceType = resourceMatch?.[1] ?? "";
    const resolvedResourceType = isMessagingResourceType(rawResourceType)
      ? rawResourceType
      : undefined;

    // Derive a human-readable publisher name
    const endpointLabel =
      endpoint.name || `${endpoint.type ?? "endpoint"} publisher`;
    const topicNode = targetNode.data as {
      topics?: { id: string; name: string }[];
    };
    const topicName = messagingResourceId
      ? topicNode.topics?.find((t) => t.id === messagingResourceId)?.name ?? ""
      : "";
    const publisherName = topicName
      ? `Publish ${topicName}`
      : `${endpointLabel} publisher`;

    // Build the new publisher
    const newEventId = `pub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newPublisher = {
      id: newEventId,
      name: publisherName,
      publishedWhen: DEFAULT_PUBLISH_TRIGGER_CONDITION,
      brokerNodeId: targetNode.id,
      messagingResourceId,
      ...DEFAULT_PUBLISHED_EVENT_DEFAULTS,
      ...(resolvedResourceType ? { resourceType: resolvedResourceType } : {}),
    };

    // Auto-add Kafka / Messaging publish step to pipelineSteps
    const existingSteps = endpoint.pipelineSteps ?? [];
    const rawLabel = targetNode.data?.label || "kafka";
    const packageFolder = toFolderName(rawLabel) || "kafka";
    const fnName = topicName
      ? `publish${toPascalCase(topicName)}`
      : "publishKafkaEvent";

    const hasMatchingStep = existingSteps.some(
      (s) =>
        s.type === "kafka_publish" &&
        (s.functionRef?.name === fnName ||
          s.brokerNodeId === targetNode.id ||
          s.messagingResourceId === messagingResourceId),
    );

    const targetTopic = topicNode.topics?.find(
      (t: any) => t.id === messagingResourceId || t.name === messagingResourceId,
    );
    const targetTopicSchema = (targetTopic as any)?.payloadSchema;
    const schemaFields: Array<{ name?: string }> = targetTopicSchema?.fields || [];

    const defaultBindings: Array<{ argName: string; source: { kind: any; field?: string; value?: string } }> = [];
    if (!topicName) {
      defaultBindings.push({
        argName: "topic",
        source: {
          kind: "inline" as const,
          value: "default-topic",
        },
      });
    }

    if (schemaFields.length > 0) {
      schemaFields.forEach((f) => {
        if (f.name) {
          const reqBodyMatch = endpoint.requestBody?.fields?.find(
            (rbf) => rbf.name?.toLowerCase() === f.name?.toLowerCase(),
          );
          defaultBindings.push({
            argName: f.name,
            source: {
              kind: "req_body" as const,
              field: reqBodyMatch?.name ? reqBodyMatch.name : f.name,
            },
          });
        }
      });
    } else {
      defaultBindings.push({
        argName: "payload",
        source: { kind: "req_body" as const, field: "" },
      });
    }

    let nextPipelineSteps = existingSteps;
    if (!hasMatchingStep) {
      const outputVar = `kafkaPublishResult`;
      const newKafkaStep = {
        id: `step-kafka-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: publisherName || `Publish to ${topicName || "Kafka"}`,
        type: "kafka_publish" as const,
        enabled: true,
        outputVariable: outputVar,
        functionRef: {
          name: fnName,
          importPath: `@workspace/${packageFolder}/publishers`,
        },
        inputBindings: defaultBindings,
        brokerNodeId: targetNode.id,
        messagingResourceId,
      };

      const returnIdx = existingSteps.findIndex(
        (s) => s.type === "return_response",
      );
      if (returnIdx !== -1) {
        nextPipelineSteps = [
          ...existingSteps.slice(0, returnIdx),
          newKafkaStep,
          ...existingSteps.slice(returnIdx),
        ];
      } else {
        nextPipelineSteps = [...existingSteps, newKafkaStep];
      }
    }

    // Record the direct endpoint→topic edge id so we can remove it
    const directEdgeId = newEdge.id;

    // updateEndpoint handles: endpoint upsert, event upsert, and
    // syncConfiguredEventEdge (creates publishedEvents-out-* → topic edge).
    get().updateEndpoint(endpointId, {
      publishedEvents: [...(endpoint.publishedEvents ?? []), newPublisher],
      pipelineSteps: nextPipelineSteps,
    });

    // Remove the direct endpoint→topic edge that ReactFlow added before our
    // interception. The correct publisher edge was already added by updateEndpoint.
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== directEdgeId),
      pendingEdgeUpserts: state.pendingEdgeUpserts.filter(
        (e) => e.id !== directEdgeId,
      ),
      pendingEdgeRemovals: [...state.pendingEdgeRemovals, directEdgeId],
    }));

    return true;
  }

  return false;
}
