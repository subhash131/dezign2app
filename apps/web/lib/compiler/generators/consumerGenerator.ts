import { AnyMessagingResource } from "@workspace/canvas/types";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { CompiledFile } from "@workspace/canvas/types";
import { toVarName, toPascalCase } from "../utils";
import { schemaToZodSchema } from "./schemaToTypeScript";
import { resolveConsumerTrace } from "../traceResolver";
import {
  renderPipeline,
  collectPipelineImports,
} from "./routeGenerator/pipelineRenderer";
import { isKafkaNode, isServiceConnectedToKafka } from "../kafka";
import { toFolderName } from "../kafka/utils";

export function generateConsumers(
  serviceName: string,
  nodeConsumedEvents: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[],
  serviceNode?: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): CompiledFile[] {
  const files: CompiledFile[] = [];
  const consumerImports: string[] = [];
  const kafkaConsumerImports: string[] = [];
  const consumerInits: string[] = [];

  const kafkaNodes = allNodes.filter(isKafkaNode);
  const firstKafkaNode = kafkaNodes[0];
  const kafkaPackageFolder = firstKafkaNode
    ? toFolderName(firstKafkaNode.data?.label || "kafka") || "kafka"
    : "kafka";
  const kafkaPackageName = `@workspace/${kafkaPackageFolder}`;
  const serviceHasKafka = serviceNode
    ? isServiceConnectedToKafka(serviceNode, allNodes, allEdges, [], nodeConsumedEvents)
    : kafkaNodes.length > 0;

  if (nodeConsumedEvents.length === 0) {
    files.push({
      filename: "src/consumer/index.ts",
      language: "typescript",
      content: `import { createLogger } from "@workspace/logger";

const logger = createLogger("${serviceName}:Consumer");

/**
 * Event Consumers for ${serviceName}
 */
export async function initConsumers(): Promise<void> {
  logger.debug("No consumed events configured for this service");
}
`,
    });
  } else {
    nodeConsumedEvents.forEach((ev) => {
      let eventName = ev.name;
      let payloadSchema = ev.payloadSchema;
      if (ev.brokerNodeId && ev.messagingResourceId) {
        const brokerNode = allNodes.find((n) => n.id === ev.brokerNodeId);
        const brokerResources = [
          ...(brokerNode?.data?.topics || []),
          ...(brokerNode?.data?.streams || []),
          ...(brokerNode?.data?.queues || []),
          ...(brokerNode?.data?.channels || []),
        ];
        const brokerResource = brokerResources.find((r) => r.id === ev.messagingResourceId);
        if (brokerResource) {
          if (!eventName && brokerResource.name) {
            eventName = brokerResource.name;
          }
          if (brokerResource.payloadSchema) {
            payloadSchema = brokerResource.payloadSchema;
          }
        }
      }

      const effectiveEventName = eventName || "event";
      const consumerFileName = toVarName(effectiveEventName) || "consumer";
      const eventPascalName = toPascalCase(effectiveEventName);
      const handlerName = `handle${eventPascalName}`;
      const payloadInterfaceName = `${eventPascalName}EventPayload`;
      const schemaName = `${consumerFileName}PayloadSchema`;

      const schemaObj = {
        rawJson: payloadSchema?.rawJson,
        fields: payloadSchema?.fields,
        mode: payloadSchema?.mode,
        requestBodyMode: payloadSchema?.requestBodyMode,
      };
      const zodRes = schemaToZodSchema(schemaName, schemaObj);

      const trace = serviceNode
        ? resolveConsumerTrace(serviceNode, { ...ev, name: effectiveEventName }, allNodes, allEdges)
        : { incoming: [], outgoing: [] };

      const typeImportsList = [payloadInterfaceName];
      if (zodRes.hasContent) {
        typeImportsList.push(schemaName);
      }

      const executableSteps = (ev.pipelineSteps || []).filter(
        (s) => s.type !== "return_response",
      );
      const pipelineImports = collectPipelineImports(executableSteps);
      const importStatements: string[] = [];
      pipelineImports.forEach((names, importPath) => {
        if (names.size > 0 && importPath) {
          importStatements.push(
            `import { ${Array.from(names).join(", ")} } from "${importPath}";`,
          );
        }
      });

      let consumerCode = `import { createLogger } from "@workspace/logger";
import {
  ${typeImportsList.join(",\n  ")}
} from "@workspace/types";
${importStatements.length > 0 ? importStatements.join("\n") + "\n" : ""}
const logger = createLogger("${serviceName}:Consumer:${effectiveEventName}");

/**
 * Event Consumer for: "${effectiveEventName}"
 * Description: ${ev.description || "Processes incoming event payload"}
 */
export async function ${handlerName}(payload: ${payloadInterfaceName}): Promise<void> {
  try {
    logger.info(\`Consuming event [${effectiveEventName}]\`, payload);
`;

      if (zodRes.hasContent) {
        consumerCode += `    const parsed = ${schemaName}.safeParse(payload);\n`;
        consumerCode += `    if (!parsed.success) {\n`;
        consumerCode += `      logger.error(\`Invalid payload format for event [${effectiveEventName}]:\`, parsed.error.flatten());\n`;
        consumerCode += `      return;\n`;
        consumerCode += `    }\n`;
        consumerCode += `    const validatedPayload = parsed.data;\n\n`;
      }

      consumerCode += `    // =========================================================================\n`;
      consumerCode += `    // 🤖 AI CODING AGENT DIRECTIVE:\n`;
      if (ev.description && ev.description.trim() !== "Processes incoming event payload") {
        consumerCode += `    // Goal: ${ev.description.trim()}\n`;
      }

      if (trace.incoming.length > 0) {
        consumerCode += `    //\n    // 📥 EVENT SOURCE:\n`;
        trace.incoming.forEach((inc: { nodeType: string; nodeName: string; detail: string; dataContext?: string }) => {
          consumerCode += `    // - ${inc.nodeType}: "${inc.nodeName}" (${inc.detail})\n`;
          if (inc.dataContext)
            consumerCode += `    //   Details: ${inc.dataContext}\n`;
        });
      }

      if (trace.outgoing.length > 0) {
        consumerCode += `    //\n    // 🔗 RESOURCE DEPENDENCIES / SIDE EFFECTS:\n`;
        trace.outgoing.forEach((out: { nodeType: string; nodeName: string; detail: string; dataContext?: string }) => {
          consumerCode += `    // - ${out.nodeType}: "${out.nodeName}" (${out.detail})\n`;
          if (out.dataContext)
            consumerCode += `    //   Details: ${out.dataContext}\n`;
        });
      }

      consumerCode += `    // =========================================================================\n`;

      if (executableSteps.length > 0) {
        consumerCode += `    // --- Step Pipeline Execution ---\n`;
        const pipelineLines = renderPipeline(
          executableSteps,
          zodRes.hasContent ? "validatedPayload" : "payload",
        );
        pipelineLines.forEach((line) => {
          consumerCode += `    ${line}\n`;
        });
        consumerCode += `\n`;
      }

      const promptText = (ev.handlerLogic || ev.description || "").trim();
      const codeBlock = (ev.body || ev.code || ev.functionBody || "").trim();

      if (promptText) {
        consumerCode += `    // --- Natural Language Instructions ---\n`;
        promptText.split("\n").forEach((line: string, idx: number) => {
          if (line.trim())
            consumerCode += `    // STEP ${idx + 1}: ${line.trim()}\n`;
        });
        consumerCode += `\n`;
      } else if (!codeBlock && executableSteps.length === 0) {
        consumerCode += `    // STEP 1: Parse and validate event payload\n`;
        consumerCode += `    // STEP 2: Execute side effects / domain logic\n`;
      }

      if (codeBlock) {
        consumerCode += `    // --- Event Handler Code Execution ---\n`;
        codeBlock.split("\n").forEach((line: string) => {
          consumerCode += `    ${line}\n`;
        });
        consumerCode += `\n`;
      }

      consumerCode += `  } catch (error) {\n`;
      consumerCode += `    logger.error(\`Error processing event [${effectiveEventName}]:\`, error);\n`;
      consumerCode += `  }\n`;
      consumerCode += `}\n`;

      files.push({
        filename: `src/consumer/${consumerFileName}.ts`,
        language: "typescript",
        content: consumerCode,
      });

      consumerImports.push(
        `import { ${handlerName} } from "./${consumerFileName}";`,
      );

      const isKafkaEvent = serviceHasKafka && (
        Boolean(ev.brokerNodeId && kafkaNodes.some((k) => k.id === ev.brokerNodeId)) ||
        trace.incoming.some((inc) => inc.nodeType === "Message Broker" || kafkaNodes.some((k) => k.id === inc.nodeId)) ||
        kafkaNodes.some((k) => (k.data?.topics || []).some((t: { name?: string }) => t.name === effectiveEventName)) ||
        kafkaNodes.length > 0
      );

      if (isKafkaEvent) {
        const consumeFnName = `consume${eventPascalName}`;
        kafkaConsumerImports.push(consumeFnName);
        const sanitizedService = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";
        const groupId = `${sanitizedService}-${consumerFileName}-group`;
        consumerInits.push(
`  try {
    await ${consumeFnName}("${groupId}", async ({ message }) => {
      try {
        const rawValue = message.value?.toString();
        const rawPayload = rawValue ? JSON.parse(rawValue) : {};
        const payload = (rawPayload && typeof rawPayload === "object" && "payload" in rawPayload && Object.keys(rawPayload).length <= 3)
          ? rawPayload.payload
          : rawPayload;
        await ${handlerName}(payload);
      } catch (err) {
        logger.error(\`Error processing message from topic [${effectiveEventName}]:\`, err);
      }
    });
    logger.info(\`Registered Kafka consumer for topic [${effectiveEventName}] on group [${groupId}]\`);
  } catch (err) {
    logger.error(\`Failed to initialize Kafka consumer for topic [${effectiveEventName}]:\`, err);
  }`
        );
      } else {
        consumerInits.push(
          `  logger.info("Registered listener for topic: ${effectiveEventName}");`,
        );
      }
    });

    const uniqueKafkaImports = Array.from(new Set(kafkaConsumerImports));
    const kafkaImportStmt = uniqueKafkaImports.length > 0
      ? `import { ${uniqueKafkaImports.join(", ")} } from "${kafkaPackageName}";\n`
      : "";

    const consumersIndexCode = `import { createLogger } from "@workspace/logger";
${kafkaImportStmt}${consumerImports.join("\n")}

const logger = createLogger("${serviceName}:Consumer");

/**
 * Event Consumers Initialization for ${serviceName}
 */
export async function initConsumers(): Promise<void> {
  logger.info("Initializing event consumers...");
${consumerInits.join("\n")}
}
`;
    files.push({
      filename: "src/consumer/index.ts",
      language: "typescript",
      content: consumersIndexCode,
    });
  }

  return files;
}
