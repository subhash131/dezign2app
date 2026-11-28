import { CompiledFile } from "@workspace/canvas/types";
import { toVarName, toPascalCase } from "../../utils";
import { toTopicKey } from "../utils";
import { SchemaItem, schemaToTsInterface } from "../../generators/schemaToTypeScript";

/** publishers/<topicVar>.ts — typed publish function for a single topic */
export function generatePublisherFile(
  topicName: string,
  loggerPrefix: string,
  payloadSchema?: SchemaItem,
): string {
  const key = toTopicKey(topicName);
  const Pascal = toPascalCase(topicName);
  const varName = toVarName(topicName) || "topic";
  const fnName = `publish${Pascal}`;

  const schemaRes = schemaToTsInterface(`${Pascal}Payload`, payloadSchema);
  const payloadInterfaceCode = schemaRes.hasContent
    ? schemaRes.code.trim()
    : [
        `export interface ${Pascal}Payload {`,
        `  action?: string;`,
        `  path?: string;`,
        `  payload?: Record<string, string | number | boolean | null | object>;`,
        `  [key: string]: string | number | boolean | null | object | undefined;`,
        `}`,
      ].join("\n");

  const lines: string[] = [];
  lines.push(`import { Producer } from "kafkajs";`);
  lines.push(`import { getKafkaProducer } from "../client";`);
  lines.push(`import { createLogger } from "@workspace/logger";`);
  lines.push(`import { ${key}_TOPIC } from "../topics/${varName}";`);
  lines.push(``);
  lines.push(`const logger = createLogger("${loggerPrefix}:Publisher:${Pascal}");`);
  lines.push(``);
  lines.push(payloadInterfaceCode);
  lines.push(``);
  lines.push(`/**`);
  lines.push(` * Publish a typed message to the "${topicName}" topic.`);
  lines.push(` * @param message - Payload conforming to ${Pascal}Payload`);
  lines.push(` * @param key     - Optional partition key`);
  lines.push(` * @param headers - Optional transport headers (e.g. authorization token)`);
  lines.push(` */`);
  lines.push(`export async function ${fnName}(`);
  lines.push(`  message: ${Pascal}Payload,`);
  lines.push(`  key?: string,`);
  lines.push(`  headers?: Record<string, string>,`);
  lines.push(`): Promise<void> {`);
  lines.push(`  const producer: Producer = await getKafkaProducer();`);
  lines.push(`  try {`);
  lines.push(`    await producer.send({`);
  lines.push(`      topic: ${key}_TOPIC,`);
  lines.push(`      messages: [`);
  lines.push(`        {`);
  lines.push(`          key: key ?? undefined,`);
  lines.push(`          value: JSON.stringify(message),`);
  lines.push(`          ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),`);
  lines.push(`          timestamp: Date.now().toString(),`);
  lines.push(`        },`);
  lines.push(`      ],`);
  lines.push(`    });`);
  lines.push(`    logger.info(\`Published to \${${key}_TOPIC}\`, message);`);
  lines.push(`  } catch (err) {`);
  lines.push(`    const msg = err instanceof Error ? err.message : String(err);`);
  lines.push(`    logger.error(\`Failed to publish to \${${key}_TOPIC}: \${msg}\`);`);
  lines.push(`    throw err;`);
  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  return lines.join("\n");
}

/** publishers/index.ts — barrel + typed KafkaTopicPayloadMap and publishKafkaEvent */
export function generatePublishersIndexFile(
  publisherBarrelExports: string[],
  nodeLabel: string,
  topicList: { name: string }[] = [],
): CompiledFile {
  const payloadImports = topicList.map((t) => {
    const Pascal = toPascalCase(t.name);
    const varName = toVarName(t.name) || "topic";
    return `import { ${Pascal}Payload } from "./${varName}";`;
  });

  const payloadMapEntries = topicList.map((t) => {
    const key = toTopicKey(t.name);
    const Pascal = toPascalCase(t.name);
    return `  [KAFKA_TOPICS.${key}]: ${Pascal}Payload;`;
  });

  return {
    filename: "src/publishers/index.ts",
    language: "typescript",
    content: [
      `/** Barrel export for all typed publisher functions */`,
      ...publisherBarrelExports,
      ``,
      `import { getKafkaProducer } from "../client";`,
      `import { createLogger } from "@workspace/logger";`,
      `import { KAFKA_TOPICS, KafkaTopicName } from "../topics";`,
      ...payloadImports,
      ``,
      `const logger = createLogger("${nodeLabel}:GenericPublisher");`,
      ``,
      `/** Map of Kafka topics to their strongly-typed payloads inferred from architecture */`,
      `export interface KafkaTopicPayloadMap {`,
      ...payloadMapEntries,
      `}`,
      ``,
      `/**`,
      ` * Publish a message to a Kafka topic with payload type inferred from the topic contract.`,
      ` */`,
      `export async function publishKafkaEvent<TTopic extends KafkaTopicName>(`,
      `  topic: TTopic,`,
      `  message: KafkaTopicPayloadMap[TTopic],`,
      `  key?: string,`,
      `  headers?: Record<string, string>,`,
      `): Promise<void>;`,
      `export async function publishKafkaEvent<TPayload extends Record<string, string | number | boolean | null | object | undefined>>(`,
      `  topic: string,`,
      `  message: TPayload,`,
      `  key?: string,`,
      `  headers?: Record<string, string>,`,
      `): Promise<void>;`,
      `export async function publishKafkaEvent(`,
      `  topic: string,`,
      `  message: Record<string, string | number | boolean | null | object | undefined>,`,
      `  key?: string,`,
      `  headers?: Record<string, string>,`,
      `): Promise<void> {`,
      `  const producer = await getKafkaProducer();`,
      `  try {`,
      `    await producer.send({`,
      `      topic,`,
      `      messages: [{ key: key ?? undefined, value: JSON.stringify(message), ...(headers && Object.keys(headers).length > 0 ? { headers } : {}), timestamp: Date.now().toString() }],`,
      `    });`,
      `    logger.info(\`Published to \${topic}\`, message);`,
      `  } catch (err) {`,
      `    const msg = err instanceof Error ? err.message : String(err);`,
      `    logger.error(\`Failed to publish to \${topic}: \${msg}\`);`,
      `    throw err;`,
      `  }`,
      `}`,
      ``,
    ].join("\n"),
  };
}
