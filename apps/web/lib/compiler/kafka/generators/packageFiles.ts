import { CompiledFile } from "@workspace/canvas/types";

export function generatePackageJson(packageName: string, nodeLabel: string): CompiledFile {
  return {
    filename: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: packageName,
        version: "0.0.0",
        private: true,
        description: `Kafka client, publishers, consumers and admin helpers for ${nodeLabel}`,
        main: "src/index.ts",
        types: "src/index.ts",
        exports: {
          ".": "./src/index.ts",
          "./topics": "./src/topics/index.ts",
          "./publishers": "./src/publishers/index.ts",
          "./consumers": "./src/consumers/index.ts",
        },
        scripts: { build: "tsc", "check-types": "tsc --noEmit" },
        dependencies: {
          kafkajs: "^2.2.4",
          "@workspace/logger": "workspace:*",
        },
        devDependencies: {
          "@workspace/typescript-config": "workspace:*",
          typescript: "^5.3.3",
        },
      },
      null,
      2,
    ),
  };
}

export function generateTsConfig(): CompiledFile {
  return {
    filename: "tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        extends: "@workspace/typescript-config/base.json",
        compilerOptions: { outDir: "./dist", rootDir: "./src" },
        include: ["src/**/*"],
      },
      null,
      2,
    ),
  };
}

export function generateConfigFile(
  nodeLabel: string,
  packageFolder: string,
  defaultPartitions: number,
  defaultReplication: number,
): CompiledFile {
  return {
    filename: "src/config.ts",
    language: "typescript",
    content: [
      `/** Kafka broker configuration for ${nodeLabel} */`,
      `export interface KafkaClientConfig {`,
      `  brokers: string[];`,
      `  clientId: string;`,
      `  defaultPartitions: number;`,
      `  defaultReplicationFactor: number;`,
      `}`,
      ``,
      `export function getKafkaConfig(): KafkaClientConfig {`,
      `  const brokersEnv = process.env.KAFKA_BROKERS ?? "localhost:9092";`,
      `  return {`,
      `    brokers: brokersEnv.split(",").map((b) => b.trim()),`,
      `    clientId: process.env.KAFKA_CLIENT_ID ?? "${packageFolder}-client",`,
      `    defaultPartitions: Number(process.env.KAFKA_DEFAULT_PARTITIONS) || ${defaultPartitions},`,
      `    defaultReplicationFactor: Number(process.env.KAFKA_DEFAULT_REPLICATION) || ${defaultReplication},`,
      `  };`,
      `}`,
      ``,
    ].join("\n"),
  };
}

export function generateClientFile(nodeLabel: string): CompiledFile {
  return {
    filename: "src/client.ts",
    language: "typescript",
    content: [
      `import { Kafka, KafkaConfig, Producer } from "kafkajs";`,
      `import { getKafkaConfig } from "./config";`,
      `import { createLogger } from "@workspace/logger";`,
      ``,
      `const logger = createLogger("${nodeLabel}:Client");`,
      ``,
      `let globalKafkaInstance: Kafka | null = null;`,
      `let sharedProducer: Producer | null = null;`,
      ``,
      `export function createKafkaClient(overrides?: Partial<KafkaConfig>): Kafka {`,
      `  if (globalKafkaInstance && !overrides) return globalKafkaInstance;`,
      `  const config = getKafkaConfig();`,
      `  const kafka = new Kafka({`,
      `    clientId: overrides?.clientId ?? config.clientId,`,
      `    brokers: overrides?.brokers ?? config.brokers,`,
      `    retry: { initialRetryTime: 300, retries: 8, ...overrides?.retry },`,
      `    logLevel: 2,`,
      `    ...overrides,`,
      `  });`,
      `  if (!overrides) globalKafkaInstance = kafka;`,
      `  logger.info(\`Kafka client [\${config.clientId}] → brokers: \${config.brokers.join(", ")}\`);`,
      `  return kafka;`,
      `}`,
      ``,
      `export async function getKafkaProducer(): Promise<Producer> {`,
      `  if (!sharedProducer) {`,
      `    sharedProducer = createKafkaClient().producer();`,
      `    await sharedProducer.connect();`,
      `    logger.info("Shared producer connected");`,
      `  }`,
      `  return sharedProducer;`,
      `}`,
      ``,
    ].join("\n"),
  };
}

export function generateAdminFile(nodeLabel: string): CompiledFile {
  return {
    filename: "src/admin.ts",
    language: "typescript",
    content: [
      `import { createKafkaClient } from "./client";`,
      `import { getKafkaConfig } from "./config";`,
      `import { createLogger } from "@workspace/logger";`,
      ``,
      `const logger = createLogger("${nodeLabel}:Admin");`,
      ``,
      `export interface TopicCreationSpec {`,
      `  name: string;`,
      `  numPartitions?: number;`,
      `  replicationFactor?: number;`,
      `}`,
      ``,
      `export async function ensureKafkaTopics(topics: TopicCreationSpec[]): Promise<void> {`,
      `  const kafka = createKafkaClient();`,
      `  const admin = kafka.admin();`,
      `  try {`,
      `    await admin.connect();`,
      `    const existing = await admin.listTopics();`,
      `    const config = getKafkaConfig();`,
      `    const toCreate = topics`,
      `      .filter((t) => !existing.includes(t.name))`,
      `      .map((t) => ({`,
      `        topic: t.name,`,
      `        numPartitions: t.numPartitions ?? config.defaultPartitions,`,
      `        replicationFactor: t.replicationFactor ?? config.defaultReplicationFactor,`,
      `      }));`,
      `    if (toCreate.length > 0) {`,
      `      await admin.createTopics({ topics: toCreate, waitForLeaders: true });`,
      `      logger.info(\`Created \${toCreate.length} topic(s): \${toCreate.map((t) => t.topic).join(", ")}\`);`,
      `    } else {`,
      `      logger.info("All configured topics already exist");`,
      `    }`,
      `  } catch (err) {`,
      `    logger.error("Topic initialization error", err);`,
      `  } finally {`,
      `    await admin.disconnect();`,
      `  }`,
      `}`,
      ``,
    ].join("\n"),
  };
}

export function generateIndexFile(packageName: string, nodeLabel: string): CompiledFile {
  return {
    filename: "src/index.ts",
    language: "typescript",
    content: [
      `/**`,
      ` * ${packageName} — Kafka package for ${nodeLabel}`,
      ` *`,
      ` * Prefer the sub-path imports for tree-shaking:`,
      ` *   import { ... } from "${packageName}/topics";`,
      ` *   import { ... } from "${packageName}/publishers";`,
      ` *   import { ... } from "${packageName}/consumers";`,
      ` */`,
      `export * from "./config";`,
      `export * from "./client";`,
      `export * from "./admin";`,
      `export * from "./topics";`,
      `export * from "./publishers";`,
      `export * from "./consumers";`,
      ``,
    ].join("\n"),
  };
}

export function generateDockerComposeFile(packageFolder: string): CompiledFile {
  return {
    filename: "docker-compose.yml",
    language: "yaml",
    content: [
      `version: "3.8"`,
      ``,
      `services:`,
      `  zookeeper:`,
      `    image: confluentinc/cp-zookeeper:7.5.0`,
      `    container_name: ${packageFolder}-zookeeper`,
      `    ports:`,
      `      - "2181:2181"`,
      `    environment:`,
      `      ZOOKEEPER_CLIENT_PORT: 2181`,
      `      ZOOKEEPER_TICK_TIME: 2000`,
      ``,
      `  kafka:`,
      `    image: confluentinc/cp-kafka:7.5.0`,
      `    container_name: ${packageFolder}-broker`,
      `    depends_on:`,
      `      - zookeeper`,
      `    ports:`,
      `      - "9092:9092"`,
      `      - "29092:29092"`,
      `    environment:`,
      `      KAFKA_BROKER_ID: 1`,
      `      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181`,
      `      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092,PLAINTEXT_HOST://kafka:29092`,
      `      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT`,
      `      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT`,
      `      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1`,
      `      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0`,
      ``,
    ].join("\n"),
  };
}
