import { AnyMessagingResource } from "@workspace/canvas/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { CompiledFile } from "@workspace/canvas/types";
import { toVarName, toPascalCase } from "../utils";
import { resolveProducerTrace } from "../traceResolver";
import { isKafkaNode, isServiceConnectedToKafka } from "../kafka";
import { toFolderName, toTopicKey } from "../kafka/utils";

export function generateProducers(
  serviceName: string,
  nodePublishedEvents: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[],
  serviceNode?: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): CompiledFile[] {
  const files: CompiledFile[] = [];
  const producerExports: string[] = [];

  const kafkaNodes = allNodes.filter(isKafkaNode);
  const firstKafkaNode = kafkaNodes[0];
  const kafkaPackageFolder = firstKafkaNode
    ? toFolderName(firstKafkaNode.data?.label || "kafka") || "kafka"
    : "kafka";
  const kafkaPackageName = `@workspace/${kafkaPackageFolder}`;
  const serviceHasKafka = serviceNode
    ? isServiceConnectedToKafka(serviceNode, allNodes, allEdges, [], nodePublishedEvents)
    : kafkaNodes.length > 0;

  if (nodePublishedEvents.length === 0) {
    files.push({
      filename: "src/producer/index.ts",
      language: "typescript",
      content: `/**
 * Event Producers for ${serviceName}
 */
// No published events configured for this service
`,
    });
  } else {
    nodePublishedEvents.forEach((ev) => {
      let eventName = ev.name;

      if (ev.brokerNodeId && ev.messagingResourceId) {
        const brokerNode = allNodes.find((n) => n.id === ev.brokerNodeId);
        const brokerResources = [
          ...(brokerNode?.data?.topics || []),
          ...(brokerNode?.data?.streams || []),
          ...(brokerNode?.data?.queues || []),
          ...(brokerNode?.data?.channels || []),
        ];
        const brokerResource = brokerResources.find((r) => r.id === ev.messagingResourceId);
        if (brokerResource && !eventName && brokerResource.name) {
          eventName = brokerResource.name;
        }
      }

      const effectiveEventName = eventName || "event";
      const producerFileName = toVarName(effectiveEventName) || "producer";
      const eventPascalName = toPascalCase(effectiveEventName);
      const funcName = `publish${eventPascalName}`;
      const payloadInterfaceName = `${eventPascalName}EventPayload`;

      const trace = serviceNode
        ? resolveProducerTrace(serviceNode, { ...ev, name: effectiveEventName }, allNodes, allEdges)
        : { incoming: [], outgoing: [] };

      const isKafkaEvent = serviceHasKafka && (
        Boolean(ev.brokerNodeId && kafkaNodes.some((k) => k.id === ev.brokerNodeId)) ||
        trace.outgoing.some((out) => out.nodeType === "Message Broker" || kafkaNodes.some((k) => k.id === out.nodeId)) ||
        kafkaNodes.some((k) => (k.data?.topics || []).some((t: { name?: string }) => t.name === effectiveEventName)) ||
        kafkaNodes.length > 0
      );

      const topicKey = toTopicKey(effectiveEventName);

      let producerCode = `import { createLogger } from "@workspace/logger";
import { ${payloadInterfaceName} } from "@workspace/types";
${isKafkaEvent ? `import { publishKafkaEvent, KAFKA_TOPICS } from "${kafkaPackageName}";\n` : ""}
const logger = createLogger("${serviceName}:Producer:${effectiveEventName}");

/**
 * Event Producer for: "${effectiveEventName}"
 */
export async function ${funcName}(eventData: ${payloadInterfaceName}, key?: string): Promise<void> {
  // =========================================================================
  // 🤖 AI CODING AGENT DIRECTIVE:
`;
      if (trace.outgoing.length > 0) {
        producerCode += `  //\n  // 📤 TARGET DESTINATIONS:\n`;
        trace.outgoing.forEach((out: { nodeType: string; nodeName: string; detail: string; dataContext?: string }) => {
          producerCode += `  // - ${out.nodeType}: "${out.nodeName}" (${out.detail})\n`;
          if (out.dataContext)
            producerCode += `  //   Details: ${out.dataContext}\n`;
        });
      }
      producerCode += `  // =========================================================================\n`;
      producerCode += `  logger.info(\`Publishing event [${effectiveEventName}]\`, eventData);\n`;
      if (isKafkaEvent) {
        producerCode += `  const topic = KAFKA_TOPICS.${topicKey} || "${effectiveEventName}";\n`;
        producerCode += `  await publishKafkaEvent(topic, eventData, key);\n`;
      } else {
        producerCode += `  // TODO: Connect message broker (Kafka / NATS / RabbitMQ / Redis)\n`;
      }
      producerCode += `}\n`;

      files.push({
        filename: `src/producer/${producerFileName}.ts`,
        language: "typescript",
        content: producerCode,
      });

      producerExports.push(`export * from "./${producerFileName}";`);
    });

    const producersIndexCode = `/**
 * Event Producers for ${serviceName}
 */
${producerExports.join("\n")}
`;
    files.push({
      filename: "src/producer/index.ts",
      language: "typescript",
      content: producersIndexCode,
    });
  }

  return files;
}
