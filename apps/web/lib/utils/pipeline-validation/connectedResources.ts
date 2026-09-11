import {
  BackendNode,
  BackendEdge,
  Endpoint,
  KafkaTopic,
  PublishedEventItem,
} from "@/types/canvas";
import { toFolderName, toPascalCase } from "@/lib/compiler/utils";
import {
  ConnectedTransformer,
  ConnectedKafka,
  ConnectedLangGraph,
} from "@/types/canvas";

/**
 * Returns all transformers (or transformer refs) connected via canvas edges to an endpoint or consumer.
 */
export function getConnectedTransformersForEndpoint(
  endpointOrConsumerId: string,
  serviceNodeId: string,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): ConnectedTransformer[] {
  const epHandle = `endpoint-in-${endpointOrConsumerId}`;
  const evHandle = `consumedEvents-in-${endpointOrConsumerId}`;

  const connectedEdges = allEdges.filter(
    (e) =>
      e.target === serviceNodeId &&
      (e.targetHandle === epHandle ||
        e.targetHandle === evHandle ||
        e.targetHandle === endpointOrConsumerId),
  );

  const results: ConnectedTransformer[] = [];

  for (const edge of connectedEdges) {
    const sourceNode = allNodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;

    if (sourceNode.type === "transformer") {
      const functionName =
        sourceNode.data?.functionName ||
        sourceNode.data?.label ||
        "transformData";
      results.push({
        id: sourceNode.id,
        nodeId: sourceNode.id,
        functionName,
        isGlobal: sourceNode.data?.scope === "global",
        inputSchema: sourceNode.data?.inputSchema || [],
        returnSchema: sourceNode.data?.returnSchema || [],
        sourceNode,
      });
    } else if (sourceNode.type === "transformer_ref") {
      const refTarget = sourceNode.data?.transformerRef;
      const master = allNodes.find(
        (m) =>
          m.type === "transformer" &&
          (m.id === refTarget ||
            m.data?.functionName === refTarget ||
            m.data?.label === refTarget),
      );
      const functionName =
        master?.data?.functionName ||
        master?.data?.label ||
        sourceNode.data?.label?.replace(/\s*\(Ref\)$/i, "") ||
        "transformData";

      results.push({
        id: sourceNode.id,
        nodeId: sourceNode.id,
        masterId: master?.id,
        functionName,
        isGlobal: true,
        inputSchema: master?.data?.inputSchema || [],
        returnSchema: master?.data?.returnSchema || [],
        sourceNode,
      });
    }
  }

  return results;
}

/**
 * Returns all Kafka messaging nodes / topics connected via canvas edges or published events to an endpoint.
 */
export function getConnectedKafkaForEndpoint(
  endpointId: string,
  serviceNodeId: string,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  endpoint?: Endpoint | { id: string; publishedEvents?: PublishedEventItem[] },
): ConnectedKafka[] {
  const kafkaNodes = allNodes.filter(
    (n) =>
      n.type === "kafka" ||
      n.type === "eventstream" ||
      (n.type === "queue" &&
        n.data?.implementation?.toLowerCase() === "kafka"),
  );
  if (kafkaNodes.length === 0) return [];
  const kafkaNodeIds = new Set(kafkaNodes.map((k) => k.id));

  const results: ConnectedKafka[] = [];
  const seen = new Set<string>();

  // 1. Direct or handle-based edges between endpoint/service and Kafka
  const epOutHandle = `endpoint-out-${endpointId}`;
  for (const edge of allEdges) {
    if (!edge) continue;

    let isFromThisEndpoint = false;
    if (edge.source === serviceNodeId) {
      if (
        edge.sourceHandle === epOutHandle ||
        edge.sourceHandle === endpointId
      ) {
        isFromThisEndpoint = true;
      } else if (edge.sourceHandle?.startsWith("publishedEvents-out-")) {
        const publishedEvents = endpoint?.publishedEvents;
        if (
          publishedEvents &&
          publishedEvents.some((pe) => edge.sourceHandle === `publishedEvents-out-${pe.id}`)
        ) {
          isFromThisEndpoint = true;
        }
      }
    } else if (
      edge.target === serviceNodeId &&
      (edge.targetHandle === epOutHandle || edge.targetHandle === endpointId)
    ) {
      isFromThisEndpoint = true;
    }

    if (!isFromThisEndpoint) continue;

    let kafkaNodeId: string | null = null;
    if (kafkaNodeIds.has(edge.target)) {
      kafkaNodeId = edge.target;
    } else if (kafkaNodeIds.has(edge.source)) {
      kafkaNodeId = edge.source;
    }

    if (!kafkaNodeId) continue;

    const brokerNode = kafkaNodes.find((k) => k.id === kafkaNodeId);
    if (!brokerNode) continue;

    const topics: KafkaTopic[] = brokerNode.data?.topics || [];
    const handle = edge.targetHandle || edge.sourceHandle || "";
    const matchTopicId = handle.match(/^([^:]+):in:(.+)$/)?.[2] || handle;
    const matchedTopic =
      topics.find((t) => t.id === matchTopicId || t.name === matchTopicId) ||
      topics[0];

    const topicName = matchedTopic?.name || "events";
    const topicId = matchedTopic?.id || matchTopicId;
    const packageFolder = toFolderName(brokerNode.data?.label || "kafka");
    const key = `${brokerNode.id}:${topicId || topicName}`;

    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        id: key,
        brokerNodeId: brokerNode.id,
        brokerNode,
        topicId,
        topicName,
        packageFolder,
        functionName: `publish${toPascalCase(topicName)}`,
        importPath: `@workspace/${packageFolder}/publishers`,
        publisherName: `Publish ${topicName}`,
      });
    }
  }

  // 2. Published events configured on this endpoint
  const pubEvents = endpoint?.publishedEvents;
  if (pubEvents) {
    for (const pub of pubEvents) {
      if (!pub.brokerNodeId || !kafkaNodeIds.has(pub.brokerNodeId)) continue;

      const brokerNode = kafkaNodes.find((k) => k.id === pub.brokerNodeId);
      if (!brokerNode) continue;

      const topics: KafkaTopic[] = brokerNode.data?.topics || [];
      const matchedTopic =
        topics.find(
          (t) =>
            t.id === pub.messagingResourceId ||
            t.name === pub.messagingResourceId,
        ) || topics[0];

      const topicName =
        matchedTopic?.name ||
        pub.name?.replace(/^Publish\s+/i, "") ||
        "events";
      const topicId = pub.messagingResourceId || matchedTopic?.id;
      const packageFolder = toFolderName(brokerNode.data?.label || "kafka");
      const key = `${brokerNode.id}:${topicId || topicName}`;

      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          id: key,
          brokerNodeId: brokerNode.id,
          brokerNode,
          topicId,
          topicName,
          packageFolder,
          functionName: `publish${toPascalCase(topicName)}`,
          importPath: `@workspace/${packageFolder}/publishers`,
          publisherName: pub.name || `Publish ${topicName}`,
        });
      }
    }
  }

  return results;
}

/**
 * Returns all LangGraph agent nodes connected via canvas edges to an endpoint or consumer.
 */
export function getConnectedLangGraphForEndpoint(
  endpointOrConsumerId: string,
  serviceNodeId: string,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): ConnectedLangGraph[] {
  const langGraphNodes = allNodes.filter((n) => n.type === "langgraph");
  if (langGraphNodes.length === 0) return [];
  const langGraphNodeIds = new Set(langGraphNodes.map((n) => n.id));

  const epOutHandle = `endpoint-out-${endpointOrConsumerId}`;
  const epInHandle = `endpoint-in-${endpointOrConsumerId}`;
  const evOutHandle = `consumedEvents-out-${endpointOrConsumerId}`;
  const evInHandle = `consumedEvents-in-${endpointOrConsumerId}`;

  const connectedLangGraphIds = new Set<string>();

  for (const edge of allEdges) {
    if (!edge) continue;

    // Service -> LangGraph
    if (edge.source === serviceNodeId && langGraphNodeIds.has(edge.target)) {
      const isForThisHandle =
        edge.sourceHandle === epOutHandle ||
        edge.sourceHandle === epInHandle ||
        edge.sourceHandle === evOutHandle ||
        edge.sourceHandle === evInHandle ||
        edge.sourceHandle === endpointOrConsumerId;

      const isGeneral = !edge.sourceHandle;

      if (isForThisHandle || isGeneral) {
        connectedLangGraphIds.add(edge.target);
      }
    }

    // LangGraph -> Service
    if (edge.target === serviceNodeId && langGraphNodeIds.has(edge.source)) {
      const isForThisHandle =
        edge.targetHandle === epInHandle ||
        edge.targetHandle === epOutHandle ||
        edge.targetHandle === evInHandle ||
        edge.targetHandle === evOutHandle ||
        edge.targetHandle === endpointOrConsumerId;

      const isGeneral = !edge.targetHandle;

      if (isForThisHandle || isGeneral) {
        connectedLangGraphIds.add(edge.source);
      }
    }
  }

  const results: ConnectedLangGraph[] = [];
  for (const id of connectedLangGraphIds) {
    const node = langGraphNodes.find((n) => n.id === id);
    if (!node) continue;

    results.push({
      id: node.id,
      nodeId: node.id,
      label: node.data?.label || "LangGraph Agent",
      stateChannels: node.data?.stateChannels || [],
      inputChannels: node.data?.inputChannels || [],
      graphSteps: node.data?.graphSteps || [],
      node,
    });
  }

  return results;
}
