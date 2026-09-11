import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  KafkaTopic,
  CompiledFile,
  CompiledKafkaResult,
  Endpoint,
  AnyMessagingResource,
} from "@workspace/canvas/types";
import { toVarName } from "../utils";
import { toFolderName, toTopicKey } from "./utils";
import {
  generatePackageJson,
  generateTsConfig,
  generateConfigFile,
  generateClientFile,
  generateAdminFile,
  generateIndexFile,
  generateDockerComposeFile,
} from "./generators/packageFiles";
import { generateTopicFile, generateTopicsIndexFile } from "./generators/topics";
import { generatePublisherFile, generatePublishersIndexFile } from "./generators/publishers";
import { generateConsumerFile, generateConsumersIndexFile } from "./generators/consumers";
import { generateReusableFunctions } from "./generators/reusableFunctions";

export { toTopicKey } from "./utils";
export * from "./generators/packageFiles";
export * from "./generators/topics";
export * from "./generators/publishers";
export * from "./generators/consumers";
export * from "./generators/reusableFunctions";

/**
 * Checks if a given node is a Kafka-compatible messaging broker.
 */
export function isKafkaNode(n: BackendNode): boolean {
  return (
    n.type === "kafka" ||
    n.type === "eventstream" ||
    (n.type === "queue" &&
      n.data?.implementation?.toLowerCase() === "kafka")
  );
}

/**
 * Determines whether a specific service node is actively connected to any Kafka broker.
 */
export function isServiceConnectedToKafka(
  serviceNode: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  endpoints: (Endpoint & { nodeId?: string })[] = [],
  events: (AnyMessagingResource & { nodeId?: string })[] = [],
): boolean {
  const kafkaNodes = allNodes.filter(isKafkaNode);
  if (kafkaNodes.length === 0) return false;

  const kafkaNodeIds = new Set(kafkaNodes.map((k) => k.id));
  const kafkaTopicIds = new Set(
    kafkaNodes.flatMap((k) => (k.data?.topics || []).map((t) => t.id)),
  );

  // 1. Direct or handle-based edges between service and kafka
  const serviceEndpoints = [
    ...(serviceNode.data?.endpoints || []),
    ...(serviceNode.data?.routeGroups?.flatMap((rg) => rg.endpoints || []) || []),
    ...endpoints.filter((ep) => ep.nodeId === serviceNode.id),
  ];
  const serviceEndpointIds = new Set(serviceEndpoints.map((ep) => ep.id));

  const serviceEvents = [
    ...(serviceNode.data?.publishedEvents || []),
    ...(serviceNode.data?.consumedEvents || []),
    ...events.filter((ev) => ev.nodeId === serviceNode.id),
  ];
  const serviceEventIds = new Set(serviceEvents.map((ev) => ev.id));

  const hasConnectedEdge = allEdges.some((edge) => {
    if (!edge) return false;
    const isSourceService = edge.source === serviceNode.id;
    const isTargetService = edge.target === serviceNode.id;
    const isSourceKafka = kafkaNodeIds.has(edge.source);
    const isTargetKafka = kafkaNodeIds.has(edge.target);

    // Direct edge between service node and kafka node
    if ((isSourceService && isTargetKafka) || (isTargetService && isSourceKafka)) {
      return true;
    }

    // Endpoint -> Kafka edge
    if (edge.sourceHandle?.startsWith("endpoint-out-")) {
      const epId = edge.sourceHandle.replace("endpoint-out-", "");
      if (serviceEndpointIds.has(epId) && isTargetKafka) return true;
    }

    // Published event -> Kafka edge
    if (edge.sourceHandle?.startsWith("publishedEvents-out-")) {
      const evId = edge.sourceHandle.replace("publishedEvents-out-", "");
      if (
        (serviceEventIds.has(evId) || serviceEndpoints.some((ep) => ep.publishedEvents?.some((pe) => pe.id === evId))) &&
        isTargetKafka
      ) {
        return true;
      }
    }

    // Kafka -> Consumed event edge
    if (edge.targetHandle?.startsWith("consumedEvents-in-")) {
      const evId = edge.targetHandle.replace("consumedEvents-in-", "");
      if (serviceEventIds.has(evId) && isSourceKafka) return true;
    }

    // Check if targetHandle or sourceHandle references a Kafka topic ID
    if (isSourceService && edge.targetHandle) {
      for (const topicId of kafkaTopicIds) {
        if (edge.targetHandle.includes(topicId)) return true;
      }
    }
    if (isTargetService && edge.sourceHandle) {
      for (const topicId of kafkaTopicIds) {
        if (edge.sourceHandle.includes(topicId)) return true;
      }
    }

    return false;
  });

  if (hasConnectedEdge) return true;

  // 2. Published events configured to target a Kafka broker or topic
  const allPublished = [
    ...(serviceNode.data?.publishedEvents || []),
    ...serviceEndpoints.flatMap((ep) => ep.publishedEvents || []),
    ...events.filter((ev) => ev.nodeId === serviceNode.id && "variant" in ev && ev.variant === "publish"),
  ];

  const hasPublishedKafkaRef = allPublished.some((ev) => {
    const brokerId = "brokerNodeId" in ev && typeof ev.brokerNodeId === "string" ? ev.brokerNodeId : "";
    const resId = "messagingResourceId" in ev && typeof ev.messagingResourceId === "string" ? ev.messagingResourceId : "";
    if (brokerId && kafkaNodeIds.has(brokerId)) return true;
    if (resId && kafkaTopicIds.has(resId)) return true;
    return false;
  });
  if (hasPublishedKafkaRef) return true;

  // 3. Consumed events configured to target a Kafka broker or topic
  const allConsumed = [
    ...(serviceNode.data?.consumedEvents || []),
    ...events.filter((ev) => ev.nodeId === serviceNode.id && "variant" in ev && ev.variant === "consume"),
  ];

  const hasConsumedKafkaRef = allConsumed.some((ev) => {
    const brokerId = "brokerNodeId" in ev && typeof ev.brokerNodeId === "string" ? ev.brokerNodeId : "";
    const resId = "messagingResourceId" in ev && typeof ev.messagingResourceId === "string" ? ev.messagingResourceId : "";
    if (brokerId && kafkaNodeIds.has(brokerId)) return true;
    if (resId && kafkaTopicIds.has(resId)) return true;
    return false;
  });
  if (hasConsumedKafkaRef) return true;

  return false;
}

/**
 * Compiles Kafka nodes into a structured shared package under packages/<nodeLabel>.
 */
export function compileKafkaNodes(
  allNodes: BackendNode[],
  allEdges: BackendEdge[] = [],
): CompiledKafkaResult {
  const files: CompiledFile[] = [];

  const kafkaNodes = allNodes.filter(isKafkaNode);

  // Derive package name from first node label
  const firstKafkaNode = kafkaNodes[0];
  const nodeLabel = firstKafkaNode?.data?.label || "Kafka Broker";
  const packageFolder = toFolderName(nodeLabel) || "kafka";
  const packageName = `@workspace/${packageFolder}`;

  if (kafkaNodes.length === 0) {
    return { files: [], reusableFunctions: [], packageFolder: "kafka", packageName: "@workspace/kafka" };
  }

  // If there are other service/app nodes present on canvas, verify that Kafka is actually connected
  const nonKafkaAppNodes = allNodes.filter(
    (n) => n.type === "service" || n.type === "webApp" || n.type === "webPage" || n.type === "langgraph",
  );

  if (nonKafkaAppNodes.length > 0) {
    const isAnyKafkaConnected = nonKafkaAppNodes.some((srv) =>
      isServiceConnectedToKafka(srv, allNodes, allEdges),
    );
    if (!isAnyKafkaConnected) {
      return { files: [], reusableFunctions: [], packageFolder, packageName };
    }
  }

  // Gather all topics across all Kafka nodes (de-duped by name)
  const seenTopicNames = new Set<string>();
  const allTopics: (KafkaTopic & { nodeId: string; nodeLabel: string })[] = [];

  kafkaNodes.forEach((node) => {
    const label = node.data?.label || "Kafka Broker";
    const topics = node.data?.topics;
    if (topics && Array.isArray(topics)) {
      topics.forEach((t) => {
        if (t.name && !seenTopicNames.has(t.name)) {
          seenTopicNames.add(t.name);
          let payloadSchema = t.payloadSchema;

          if (!payloadSchema) {
            for (const n of allNodes) {
              const nodeEndpoints = n.data?.endpoints;
              if (nodeEndpoints && Array.isArray(nodeEndpoints)) {
                const matchedEp = nodeEndpoints.find((ep) => {
                  const epPubs = ep.publishedEvents;
                  return (
                    epPubs &&
                    Array.isArray(epPubs) &&
                    epPubs.some(
                      (p) =>
                        p.messagingResourceId === t.id ||
                        (p.name && p.name.toLowerCase() === t.name.toLowerCase()),
                    )
                  );
                });
                if (matchedEp?.requestBody) {
                  payloadSchema = matchedEp.requestBody;
                  break;
                }
              }
            }
          }

          allTopics.push({ ...t, payloadSchema, nodeId: node.id, nodeLabel: label });
        }
      });
    }
  });

  const brokerConfig = firstKafkaNode?.data?.kafkaBroker ?? {};
  const defaultPartitions = brokerConfig.partitions ?? 3;
  const defaultReplication = brokerConfig.replication ?? 1;

  // Package configuration files
  files.push(generatePackageJson(packageName, nodeLabel));
  files.push(generateTsConfig());
  files.push(generateConfigFile(nodeLabel, packageFolder, defaultPartitions, defaultReplication));
  files.push(generateClientFile(nodeLabel));
  files.push(generateAdminFile(nodeLabel));

  // Topics
  const topicList: (KafkaTopic & { nodeId: string; nodeLabel: string })[] = allTopics.length > 0
    ? allTopics
    : [{ id: "topic-system-events", name: "system-events", nodeId: "", nodeLabel }];

  const topicBarrelExports: string[] = [];
  const topicImports: string[] = [];
  const kafkaTopicsEntries: string[] = [];
  const seenTopicKeys = new Set<string>();

  topicList.forEach((t) => {
    const varName = toVarName(t.name) || "topic";
    const key = toTopicKey(t.name);
    if (seenTopicKeys.has(key)) return;
    seenTopicKeys.add(key);

    files.push({
      filename: `src/topics/${varName}.ts`,
      language: "typescript",
      content: generateTopicFile(t.name),
    });

    topicImports.push(`import { ${key}_TOPIC } from "./${varName}";`);
    topicBarrelExports.push(`export * from "./${varName}";`);
    kafkaTopicsEntries.push(`  ${key}: ${key}_TOPIC,`);
  });

  files.push(generateTopicsIndexFile(topicBarrelExports, kafkaTopicsEntries, topicImports));

  // Publishers
  const publisherBarrelExports: string[] = [];

  topicList.forEach((t) => {
    const varName = toVarName(t.name) || "topic";
    const key = toTopicKey(t.name);
    if (!seenTopicKeys.has(key)) return;

    files.push({
      filename: `src/publishers/${varName}.ts`,
      language: "typescript",
      content: generatePublisherFile(t.name, nodeLabel, t.payloadSchema),
    });

    publisherBarrelExports.push(`export * from "./${varName}";`);
  });

  files.push(generatePublishersIndexFile(publisherBarrelExports, nodeLabel, topicList));

  // Consumers
  const consumerBarrelExports: string[] = [];

  topicList.forEach((t) => {
    const varName = toVarName(t.name) || "topic";

    files.push({
      filename: `src/consumers/${varName}.ts`,
      language: "typescript",
      content: generateConsumerFile(t.name, nodeLabel),
    });

    consumerBarrelExports.push(`export * from "./${varName}";`);
  });

  files.push(generateConsumersIndexFile(consumerBarrelExports, nodeLabel));

  // Master barrel index & docker compose
  files.push(generateIndexFile(packageName, nodeLabel));
  files.push(generateDockerComposeFile(packageFolder));

  const reusableFunctions = generateReusableFunctions(packageName, packageFolder, topicList);

  return { files, reusableFunctions, packageFolder, packageName };
}
