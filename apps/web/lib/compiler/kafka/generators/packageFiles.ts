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
  brokerCount: number = 1,
  basePort: number = 9092,
): CompiledFile {
  const defaultBrokers = Array.from(
    { length: Math.max(1, brokerCount) },
    (_, i) => `localhost:${basePort + i}`,
  ).join(",");

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
      `  const brokersEnv = process.env.KAFKA_BROKERS ?? "${defaultBrokers}";`,
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

export function generateDockerComposeFile(
  packageFolder: string,
  brokerCount: number = 1,
  clusterMode: "kraft" | "zookeeper" = "kraft",
  basePort: number = 9092,
): CompiledFile {
  const count = Math.max(1, Math.min(9, Math.floor(brokerCount)));

  if (clusterMode === "kraft") {
    const clusterId = "MkU3OEVBNTcwNTJENDM2Qk";
    const controllerQuorumVoters = Array.from(
      { length: count },
      (_, i) => `${i + 1}@kafka-${i + 1}:29093`,
    ).join(",");

    const services = Array.from({ length: count }, (_, i) => {
      const brokerId = i + 1;
      const extPort = basePort + i;
      const intPort = 29092;
      const ctrlPort = 29093;
      return [
        `  kafka-${brokerId}:`,
        `    image: confluentinc/cp-kafka:7.5.0`,
        `    container_name: ${packageFolder}-broker-${brokerId}`,
        `    ports:`,
        `      - "${extPort}:${extPort}"`,
        `    environment:`,
        `      KAFKA_NODE_ID: ${brokerId}`,
        `      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'`,
        `      KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka-${brokerId}:${intPort},PLAINTEXT_HOST://localhost:${extPort}'`,
        `      KAFKA_PROCESS_ROLES: 'broker,controller'`,
        `      KAFKA_CONTROLLER_QUORUM_VOTERS: '${controllerQuorumVoters}'`,
        `      KAFKA_LISTENERS: 'PLAINTEXT://0.0.0.0:${intPort},CONTROLLER://0.0.0.0:${ctrlPort},PLAINTEXT_HOST://0.0.0.0:${extPort}'`,
        `      KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'`,
        `      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER'`,
        `      KAFKA_LOG_DIRS: '/tmp/kraft-combined-logs'`,
        `      CLUSTER_ID: '${clusterId}'`,
      ].join("\n");
    }).join("\n\n");

    return {
      filename: "docker-compose.yml",
      language: "yaml",
      content: [`version: "3.8"`, ``, `services:`, services, ``].join("\n"),
    };
  }

  // ZooKeeper mode
  const services = Array.from({ length: count }, (_, i) => {
    const brokerId = i + 1;
    const extPort = basePort + i;
    const intPort = 29092;
    return [
      `  kafka-${brokerId}:`,
      `    image: confluentinc/cp-kafka:7.5.0`,
      `    container_name: ${packageFolder}-broker-${brokerId}`,
      `    depends_on:`,
      `      - zookeeper`,
      `    ports:`,
      `      - "${extPort}:${extPort}"`,
      `    environment:`,
      `      KAFKA_BROKER_ID: ${brokerId}`,
      `      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181`,
      `      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:${extPort},PLAINTEXT_HOST://kafka-${brokerId}:${intPort}`,
      `      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT`,
      `      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT`,
      `      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1`,
      `      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0`,
    ].join("\n");
  }).join("\n\n");

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
      services,
      ``,
    ].join("\n"),
  };
}
