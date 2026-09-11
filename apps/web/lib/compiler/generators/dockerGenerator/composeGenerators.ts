import { toEnvVarName } from "../../utils";
import { ComposeGeneratorContext, InfraComposeContext } from "@workspace/canvas/types";

/**
 * Generates the master root docker-compose.yml wiring all services, frontends, and infrastructure
 */
export function generateRootDockerCompose(ctx: ComposeGeneratorContext): string {
  const {
    nodes,
    edges,
    services,
    webApps: propWebApps,
    webClients: propWebClients,
    projectSlug,
    hasPostgres,
    hasSqlite,
    hasKafka,
    hasRedis,
  } = ctx;
  const webApps = propWebApps || propWebClients || [];

  const composeLines: string[] = [
    `# ==============================================================================`,
    `# ${ctx.projectSlug.toUpperCase()} - Complete Local Docker Compose Stack`,
    `# Run: docker compose up --build`,
    `# ==============================================================================`,
    `version: "3.8"`,
    ``,
    `services:`,
  ];

  // Dependencies that apps may rely on
  const commonDependsOn: string[] = [];
  if (hasPostgres) commonDependsOn.push("postgres");
  if (hasRedis) commonDependsOn.push("redis");
  if (hasKafka) commonDependsOn.push("kafka");

  // 1. Backend Microservices
  services.forEach((srv) => {
    const srvNode = nodes.find((n) => n.id === srv.id);
    const port = String(srvNode?.data?.port || "8080");

    composeLines.push(`  ${srv.folderName}:`);
    composeLines.push(`    build:`);
    composeLines.push(`      context: .`);
    composeLines.push(`      dockerfile: apps/${srv.folderName}/Dockerfile`);
    composeLines.push(`    container_name: ${projectSlug}-${srv.folderName}`);
    composeLines.push(`    restart: unless-stopped`);
    composeLines.push(`    ports:`);
    composeLines.push(`      - "${port}:${port}"`);

    // Environment variables
    composeLines.push(`    environment:`);
    composeLines.push(`      - PORT=${port}`);
    composeLines.push(`      - NODE_ENV=production`);

    if (hasPostgres) {
      composeLines.push(
        `      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/${projectSlug.replace(/-/g, "_")}_db`,
      );
    } else if (hasSqlite) {
      composeLines.push(`      - DATABASE_PATH=/app/packages/db/sqlite.db`);
      composeLines.push(`      - DATABASE_URL=/app/packages/db/sqlite.db`);
    }

    if (hasRedis) {
      const redisInstances = nodes.filter(
        (n) =>
          n.type === "redis_instance" ||
          (n.type === "database" &&
            (n.data?.dbEngine === "redis" || n.data?.dbType === "redis")),
      );
      const primaryRedis = redisInstances[0];
      const rPort = primaryRedis?.data?.port
        ? String(primaryRedis.data.port)
        : "6379";
      const envKey = primaryRedis?.data?.connectionStringEnv || "REDIS_URL";
      composeLines.push(`      - ${envKey}=redis://redis:6379`);
      composeLines.push(`      - REDIS_HOST=redis`);
      composeLines.push(`      - REDIS_PORT=${rPort}`);
    }

    if (hasKafka) {
      composeLines.push(`      - KAFKA_BROKERS=kafka:9092`);
    }

    // Inter-service endpoints
    edges.forEach((edge) => {
      if (edge.source === srv.id) {
        const targetNode = nodes.find(
          (n) => n.id === edge.target && n.type === "service",
        );
        if (targetNode) {
          const tgtSrv = services.find((s) => s.id === targetNode.id);
          if (tgtSrv) {
            const tgtLabel = targetNode.data?.label || targetNode.id;
            const tgtPort = String(targetNode.data?.port || "8080");
            const envVarName = `${toEnvVarName(tgtLabel)}_BASE_URL`;
            composeLines.push(
              `      - ${envVarName}=http://${tgtSrv.folderName}:${tgtPort}`,
            );
          }
        }
      }
    });

    if (commonDependsOn.length > 0) {
      composeLines.push(`    depends_on:`);
      commonDependsOn.forEach((dep) => {
        composeLines.push(`      ${dep}:`);
        composeLines.push(`        condition: service_healthy`);
      });
    }

    composeLines.push(`    networks:`);
    composeLines.push(`      - dezign2app-network`);
    composeLines.push(``);
  });

  // 2. Web Applications
  webApps.forEach((client, idx) => {
    const webPort = idx === 0 ? "3000" : `${3000 + idx}`;
    composeLines.push(`  ${client.folderName}:`);
    composeLines.push(`    build:`);
    composeLines.push(`      context: .`);
    composeLines.push(`      dockerfile: apps/${client.folderName}/Dockerfile`);
    composeLines.push(`    container_name: ${projectSlug}-${client.folderName}`);
    composeLines.push(`    restart: unless-stopped`);
    composeLines.push(`    ports:`);
    composeLines.push(`      - "${webPort}:3000"`);
    composeLines.push(`    environment:`);
    composeLines.push(`      - PORT=3000`);
    composeLines.push(`      - NODE_ENV=production`);

    if (hasPostgres) {
      composeLines.push(
        `      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/${projectSlug.replace(/-/g, "_")}_db`,
      );
    } else if (hasSqlite) {
      composeLines.push(`      - DATABASE_PATH=/app/packages/db/sqlite.db`);
      composeLines.push(`      - DATABASE_URL=/app/packages/db/sqlite.db`);
    }

    // Connect to first service by default for Next.js public API proxy
    if (services.length > 0) {
      const firstSrv = services[0]!;
      const srvNode = nodes.find((n) => n.id === firstSrv.id);
      const srvPort = String(srvNode?.data?.port || "8080");
      composeLines.push(
        `      - NEXT_PUBLIC_API_URL=http://localhost:${srvPort}`,
      );
    }

    if (commonDependsOn.length > 0) {
      composeLines.push(`    depends_on:`);
      commonDependsOn.forEach((dep) => {
        composeLines.push(`      ${dep}:`);
        composeLines.push(`        condition: service_healthy`);
      });
    }

    composeLines.push(`    networks:`);
    composeLines.push(`      - dezign2app-network`);
    composeLines.push(``);
  });

  // 3. Infrastructure: PostgreSQL (Only if Postgres is explicitly requested)
  if (hasPostgres) {
    const dbName = `${projectSlug.replace(/-/g, "_")}_db`;
    composeLines.push(`  postgres:`);
    composeLines.push(`    image: postgres:16-alpine`);
    composeLines.push(`    container_name: ${projectSlug}-postgres`);
    composeLines.push(`    restart: unless-stopped`);
    composeLines.push(`    environment:`);
    composeLines.push(`      POSTGRES_USER: postgres`);
    composeLines.push(`      POSTGRES_PASSWORD: postgres`);
    composeLines.push(`      POSTGRES_DB: ${dbName}`);
    composeLines.push(`    ports:`);
    composeLines.push(`      - "5432:5432"`);
    composeLines.push(`    volumes:`);
    composeLines.push(`      - postgres_data:/var/lib/postgresql/data`);
    composeLines.push(`    healthcheck:`);
    composeLines.push(
      `      test: ["CMD-SHELL", "pg_isready -U postgres -d ${dbName}"]`,
    );
    composeLines.push(`      interval: 5s`);
    composeLines.push(`      timeout: 5s`);
    composeLines.push(`      retries: 5`);
    composeLines.push(`    networks:`);
    composeLines.push(`      - dezign2app-network`);
    composeLines.push(``);
  }

  // 4. Infrastructure: Redis
  if (hasRedis) {
    const redisInstances = nodes.filter(
      (n) =>
        n.type === "redis_instance" ||
        (n.type === "database" &&
          (n.data?.dbEngine === "redis" || n.data?.dbType === "redis")),
    );

    if (redisInstances.length <= 1) {
      const primaryRedis = redisInstances[0];
      const rPort = primaryRedis?.data?.port
        ? String(primaryRedis.data.port)
        : "6379";
      composeLines.push(`  redis:`);
      composeLines.push(`    image: redis:7-alpine`);
      composeLines.push(`    container_name: ${projectSlug}-redis`);
      composeLines.push(`    restart: unless-stopped`);
      composeLines.push(`    ports:`);
      composeLines.push(`      - "${rPort}:6379"`);
      composeLines.push(`    volumes:`);
      composeLines.push(`      - redis_data:/data`);
      composeLines.push(`    command: redis-server --appendonly yes`);
      composeLines.push(`    healthcheck:`);
      composeLines.push(`      test: ["CMD", "redis-cli", "ping"]`);
      composeLines.push(`      interval: 5s`);
      composeLines.push(`      timeout: 3s`);
      composeLines.push(`      retries: 5`);
      composeLines.push(`    networks:`);
      composeLines.push(`      - dezign2app-network`);
      composeLines.push(``);
    } else {
      redisInstances.forEach((inst, idx) => {
        const rPort = inst.data?.port
          ? String(inst.data.port)
          : String(6379 + idx);
        const svcName =
          inst.data?.label?.toLowerCase().replace(/[^a-z0-9_-]/g, "-") ||
          `redis-${idx + 1}`;
        composeLines.push(`  ${svcName}:`);
        composeLines.push(`    image: redis:7-alpine`);
        composeLines.push(`    container_name: ${projectSlug}-${svcName}`);
        composeLines.push(`    restart: unless-stopped`);
        composeLines.push(`    ports:`);
        composeLines.push(`      - "${rPort}:6379"`);
        composeLines.push(`    volumes:`);
        composeLines.push(`      - ${svcName.replace(/-/g, "_")}_data:/data`);
        composeLines.push(`    command: redis-server --appendonly yes`);
        composeLines.push(`    healthcheck:`);
        composeLines.push(`      test: ["CMD", "redis-cli", "ping"]`);
        composeLines.push(`      interval: 5s`);
        composeLines.push(`      timeout: 3s`);
        composeLines.push(`      retries: 5`);
        composeLines.push(`    networks:`);
        composeLines.push(`      - dezign2app-network`);
        composeLines.push(``);
      });
    }
  }

  // 5. Infrastructure: Kafka
  if (hasKafka) {
    composeLines.push(`  kafka:`);
    composeLines.push(`    image: apache/kafka:latest`);
    composeLines.push(`    container_name: ${projectSlug}-kafka`);
    composeLines.push(`    restart: unless-stopped`);
    composeLines.push(`    ports:`);
    composeLines.push(`      - "9092:9092"`);
    composeLines.push(`    environment:`);
    composeLines.push(`      KAFKA_NODE_ID: 1`);
    composeLines.push(`      KAFKA_PROCESS_ROLES: broker,controller`);
    composeLines.push(`      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093`);
    composeLines.push(`      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092`);
    composeLines.push(`      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER`);
    composeLines.push(
      `      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT`,
    );
    composeLines.push(`      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093`);
    composeLines.push(`      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1`);
    composeLines.push(`      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1`);
    composeLines.push(`      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1`);
    composeLines.push(`      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0`);
    composeLines.push(`      KAFKA_NUM_PARTITIONS: 3`);
    composeLines.push(`    volumes:`);
    composeLines.push(`      - kafka_data:/var/lib/kafka/data`);
    composeLines.push(`    healthcheck:`);
    composeLines.push(
      `      test: ["CMD-SHELL", "opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list || exit 0"]`,
    );
    composeLines.push(`      interval: 10s`);
    composeLines.push(`      timeout: 5s`);
    composeLines.push(`      retries: 5`);
    composeLines.push(`    networks:`);
    composeLines.push(`      - dezign2app-network`);
    composeLines.push(``);
  }

  // 6. Networks & Volumes
  composeLines.push(`networks:`);
  composeLines.push(`  dezign2app-network:`);
  composeLines.push(`    driver: bridge`);
  composeLines.push(``);

  const volumes: string[] = [];
  if (hasPostgres) volumes.push("postgres_data:");
  if (hasRedis) {
    const redisInstances = nodes.filter(
      (n) =>
        n.type === "redis_instance" ||
        (n.type === "database" &&
          (n.data?.dbEngine === "redis" || n.data?.dbType === "redis")),
    );
    if (redisInstances.length <= 1) {
      volumes.push("redis_data:");
    } else {
      redisInstances.forEach((inst, idx) => {
        const svcName =
          inst.data?.label?.toLowerCase().replace(/[^a-z0-9_-]/g, "-") ||
          `redis-${idx + 1}`;
        volumes.push(`${svcName.replace(/-/g, "_")}_data:`);
      });
    }
  }
  if (hasKafka) volumes.push("kafka_data:");

  if (volumes.length > 0) {
    composeLines.push(`volumes:`);
    volumes.forEach((v) => composeLines.push(`  ${v}`));
  }

  return composeLines.join("\n") + "\n";
}

/**
 * Infra-only docker-compose (dev mode)
 */
export function generateInfraDockerCompose(ctx: InfraComposeContext): string {
  const { projectSlug, hasPostgres, hasKafka, hasRedis, nodes = [] } = ctx;
  const lines: string[] = [
    `# ==============================================================================`,
    `# ${projectSlug.toUpperCase()} - Infrastructure Only (Dev Mode)`,
    `# Starts Postgres / Redis / Kafka in Docker — apps run natively with hot reload`,
    `# Usage: docker compose -f docker-compose.infra.yml up -d`,
    `# ==============================================================================`,
    `version: "3.8"`,
    ``,
    `services:`,
  ];

  if (hasPostgres) {
    const dbName = `${projectSlug.replace(/-/g, "_")}_db`;
    lines.push(`  postgres:`);
    lines.push(`    image: postgres:16-alpine`);
    lines.push(`    container_name: ${projectSlug}-postgres-dev`);
    lines.push(`    restart: unless-stopped`);
    lines.push(`    environment:`);
    lines.push(`      POSTGRES_USER: postgres`);
    lines.push(`      POSTGRES_PASSWORD: postgres`);
    lines.push(`      POSTGRES_DB: ${dbName}`);
    lines.push(`    ports:`);
    lines.push(`      - "5432:5432"`);
    lines.push(`    volumes:`);
    lines.push(`      - postgres_dev_data:/var/lib/postgresql/data`);
    lines.push(`    healthcheck:`);
    lines.push(
      `      test: ["CMD-SHELL", "pg_isready -U postgres -d ${dbName}"]`,
    );
    lines.push(`      interval: 5s`);
    lines.push(`      timeout: 5s`);
    lines.push(`      retries: 5`);
    lines.push(``);
  }

  if (hasRedis) {
    const redisInstances = nodes.filter(
      (n) =>
        n.type === "redis_instance" ||
        (n.type === "database" &&
          (n.data?.dbEngine === "redis" || n.data?.dbType === "redis")),
    );
    if (redisInstances.length <= 1) {
      const primaryRedis = redisInstances[0];
      const rPort = primaryRedis?.data?.port
        ? String(primaryRedis.data.port)
        : "6379";
      lines.push(`  redis:`);
      lines.push(`    image: redis:7-alpine`);
      lines.push(`    container_name: ${projectSlug}-redis-dev`);
      lines.push(`    restart: unless-stopped`);
      lines.push(`    ports:`);
      lines.push(`      - "${rPort}:6379"`);
      lines.push(`    volumes:`);
      lines.push(`      - redis_dev_data:/data`);
      lines.push(`    command: redis-server --appendonly yes`);
      lines.push(`    healthcheck:`);
      lines.push(`      test: ["CMD", "redis-cli", "ping"]`);
      lines.push(`      interval: 5s`);
      lines.push(`      timeout: 3s`);
      lines.push(`      retries: 5`);
      lines.push(``);
    } else {
      redisInstances.forEach((inst, idx) => {
        const rPort = inst.data?.port
          ? String(inst.data.port)
          : String(6379 + idx);
        const svcName =
          inst.data?.label?.toLowerCase().replace(/[^a-z0-9_-]/g, "-") ||
          `redis-${idx + 1}`;
        lines.push(`  ${svcName}:`);
        lines.push(`    image: redis:7-alpine`);
        lines.push(`    container_name: ${projectSlug}-${svcName}-dev`);
        lines.push(`    restart: unless-stopped`);
        lines.push(`    ports:`);
        lines.push(`      - "${rPort}:6379"`);
        lines.push(`    volumes:`);
        lines.push(`      - ${svcName.replace(/-/g, "_")}_dev_data:/data`);
        lines.push(`    command: redis-server --appendonly yes`);
        lines.push(`    healthcheck:`);
        lines.push(`      test: ["CMD", "redis-cli", "ping"]`);
        lines.push(`      interval: 5s`);
        lines.push(`      timeout: 3s`);
        lines.push(`      retries: 5`);
        lines.push(``);
      });
    }
  }

  if (hasKafka) {
    lines.push(`  kafka:`);
    lines.push(`    image: apache/kafka:latest`);
    lines.push(`    container_name: ${projectSlug}-kafka-dev`);
    lines.push(`    restart: unless-stopped`);
    lines.push(`    ports:`);
    lines.push(`      - "9092:9092"`);
    lines.push(`    environment:`);
    lines.push(`      KAFKA_NODE_ID: 1`);
    lines.push(`      KAFKA_PROCESS_ROLES: broker,controller`);
    lines.push(`      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093`);
    lines.push(`      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092`);
    lines.push(`      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER`);
    lines.push(
      `      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT`,
    );
    lines.push(`      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093`);
    lines.push(`      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1`);
    lines.push(`      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1`);
    lines.push(`      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1`);
    lines.push(`      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0`);
    lines.push(`      KAFKA_NUM_PARTITIONS: 3`);
    lines.push(`    volumes:`);
    lines.push(`      - kafka_dev_data:/var/lib/kafka/data`);
    lines.push(`    healthcheck:`);
    lines.push(
      `      test: ["CMD-SHELL", "opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list || exit 0"]`,
    );
    lines.push(`      interval: 10s`);
    lines.push(`      timeout: 5s`);
    lines.push(`      retries: 5`);
    lines.push(``);
  }

  const volumes: string[] = [];
  if (hasPostgres) volumes.push("postgres_dev_data:");
  if (hasRedis) {
    const redisInstances = nodes.filter(
      (n) =>
        n.type === "redis_instance" ||
        (n.type === "database" &&
          (n.data?.dbEngine === "redis" || n.data?.dbType === "redis")),
    );
    if (redisInstances.length <= 1) {
      volumes.push("redis_dev_data:");
    } else {
      redisInstances.forEach((inst, idx) => {
        const svcName =
          inst.data?.label?.toLowerCase().replace(/[^a-z0-9_-]/g, "-") ||
          `redis-${idx + 1}`;
        volumes.push(`${svcName.replace(/-/g, "_")}_dev_data:`);
      });
    }
  }
  if (hasKafka) volumes.push("kafka_dev_data:");

  if (volumes.length > 0) {
    lines.push(`volumes:`);
    lines.push(`  ${volumes.join("\n  ")}`);
  }

  return lines.join("\n") + "\n";
}
