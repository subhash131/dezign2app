import { BackendNode } from "@/types/canvas";

export function generateRootEnvExample(
  hasPostgres: boolean,
  hasSqlite: boolean,
  hasRedis: boolean,
  hasKafka: boolean,
  projectSlug: string,
  nodes: BackendNode[] = [],
): string {
  const lines: string[] = [
    "# ==============================================================================",
    "# Root .env.example - copy to .env and fill in your values",
    "# Run: node scripts/sync-env.mjs to sync without overwriting existing values",
    "# ==============================================================================",
    "",
    "NODE_ENV=development",
    "",
  ];

  if (hasPostgres) {
    const dbName = `${projectSlug.replace(/-/g, "_")}_db`;
    lines.push("# PostgreSQL (started by docker-compose.infra.yml)");
    lines.push(
      `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${dbName}`,
    );
    lines.push("");
  } else if (hasSqlite) {
    lines.push("# SQLite Embedded Database");
    lines.push("DATABASE_PATH=packages/db/sqlite.db");
    lines.push("DATABASE_URL=packages/db/sqlite.db");
    lines.push("");
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
    const rHost = primaryRedis?.data?.host || "localhost";
    const envKey = primaryRedis?.data?.connectionStringEnv || "REDIS_URL";
    lines.push("# Redis (started by docker-compose.infra.yml)");
    lines.push(`${envKey}=redis://${rHost}:${rPort}`);
    lines.push(`REDIS_HOST=${rHost}`);
    lines.push(`REDIS_PORT=${rPort}`);
    lines.push("");
  }

  if (hasKafka) {
    lines.push("# Kafka (started by docker-compose.infra.yml)");
    lines.push("KAFKA_BROKERS=localhost:9092");
    lines.push("");
  }

  return lines.join("\n");
}

export function generateServiceEnvExample(
  port: string,
  hasPostgres: boolean,
  hasSqlite: boolean,
  hasRedis: boolean,
  hasKafka: boolean,
  projectSlug: string,
  techStack: string,
  nodes: BackendNode[] = [],
): string {
  const lines: string[] = [
    "# Service .env.example",
    "# Sync with: node ../../scripts/sync-env.mjs .env.example .env",
    "",
    "NODE_ENV=development",
    `PORT=${port}`,
    "",
  ];

  if (hasPostgres) {
    const dbName = `${projectSlug.replace(/-/g, "_")}_db`;
    lines.push(
      `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${dbName}`,
    );
    lines.push("");
  } else if (hasSqlite) {
    lines.push("DATABASE_URL=../../packages/db/sqlite.db");
    if (techStack !== "fastapi") {
      lines.push("DATABASE_PATH=../../packages/db/sqlite.db");
    }
    lines.push("");
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
    const rHost = primaryRedis?.data?.host || "localhost";
    const envKey = primaryRedis?.data?.connectionStringEnv || "REDIS_URL";
    lines.push(`${envKey}=redis://${rHost}:${rPort}`);
    lines.push(`REDIS_HOST=${rHost}`);
    lines.push(`REDIS_PORT=${rPort}`);
    lines.push("");
  }

  if (hasKafka) {
    lines.push("KAFKA_BROKERS=localhost:9092");
    lines.push("");
  }

  const authNode = nodes.find((n) => n.type === "auth");
  if (authNode) {
    const authPort = String(authNode.data?.port || "3000");
    const authUrl = authNode.data?.baseUrl || `http://localhost:${authPort}`;
    lines.push("# Auth Server / JWKS Verification");
    lines.push(`AUTH_SERVER_URL=${authUrl}`);
    lines.push(`BETTER_AUTH_URL=${authUrl}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function generateWebClientEnvExample(
  port: string,
  hasPostgres: boolean,
  hasSqlite: boolean,
  projectSlug: string,
  services: { id: string; name: string; folderName: string }[],
  nodes: BackendNode[],
): string {
  const lines: string[] = [
    "# Web app .env.example",
    "# Sync with: node ../../scripts/sync-env.mjs .env.example .env",
    "",
    "NODE_ENV=development",
    `PORT=${port}`,
    "",
  ];

  if (services.length > 0) {
    lines.push("# Backend API URLs (native dev ports)");
    services.forEach((srv) => {
      const srvNode = nodes.find((n) => n.id === srv.id);
      const srvPort = srvNode?.data?.port ?? "8080";
      lines.push(`NEXT_PUBLIC_API_URL=http://localhost:${srvPort}`);
    });
    lines.push("");
  }

  if (hasPostgres) {
    const dbName = `${projectSlug.replace(/-/g, "_")}_db`;
    lines.push(
      `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${dbName}`,
    );
    lines.push("");
  } else if (hasSqlite) {
    lines.push("DATABASE_URL=../../packages/db/sqlite.db");
    lines.push("DATABASE_PATH=../../packages/db/sqlite.db");
    lines.push("");
  }

  return lines.join("\n");
}

export function generateSyncEnvScript(): string {
  return [
    '#!/usr/bin/env node',
    '// sync-env.mjs - Smart .env sync',
    '//',
    '// Rules:',
    '//   - Keys in .env.example not in .env       => ADDED with example value',
    '//   - Keys in .env with a non-empty value     => KEPT (never overwritten)',
    '//   - Keys in .env with an empty value        => REPLACED with example value',
    '//   - Keys in .env no longer in .env.example  => REMOVED',
    '//',
    '// Usage (single): node scripts/sync-env.mjs .env.example .env',
    '// Usage (all):    node scripts/sync-env.mjs',
    '',
    'import fs from "fs";',
    'import path from "path";',
    '',
    'function parseEnv(content) {',
    '  const values = new Map();',
    '  for (const line of content.split("\\n")) {',
    '    const t = line.trim();',
    '    if (!t || t.startsWith("#")) continue;',
    '    const eq = t.indexOf("=");',
    '    if (eq === -1) continue;',
    '    values.set(t.slice(0, eq).trim(), t.slice(eq + 1).trim());',
    '  }',
    '  return values;',
    '}',
    '',
    'function syncEnv(examplePath, targetPath) {',
    '  if (!fs.existsSync(examplePath)) { console.warn("  skipping: " + examplePath); return; }',
    '  const exContent = fs.readFileSync(examplePath, "utf-8");',
    '  const existing = fs.existsSync(targetPath) ? parseEnv(fs.readFileSync(targetPath, "utf-8")) : new Map();',
    '  const exKeys = new Set();',
    '  const out = [];',
    '  for (const line of exContent.split("\\n")) {',
    '    const t = line.trim();',
    '    if (!t || t.startsWith("#")) { out.push(line); continue; }',
    '    const eq = t.indexOf("=");',
    '    if (eq === -1) { out.push(line); continue; }',
    '    const key = t.slice(0, eq).trim();',
    '    const exVal = t.slice(eq + 1).trim();',
    '    exKeys.add(key);',
    '    const cur = existing.get(key);',
    '    out.push(key + "=" + (cur !== undefined && cur !== "" ? cur : exVal));',
    '  }',
    '  const removed = [...existing.keys()].filter(k => !exKeys.has(k));',
    '  if (removed.length) console.log("  removed: " + removed.join(", "));',
    '  fs.writeFileSync(targetPath, out.join("\\n") + "\\n", "utf-8");',
    '  console.log("  synced: " + path.relative(process.cwd(), targetPath));',
    '}',
    '',
    'if (process.argv[2] && process.argv[3]) {',
    '  syncEnv(process.argv[2], process.argv[3]);',
    '  process.exit(0);',
    '}',
    '',
    'console.log("Syncing .env files...\\n");',
    'const root = process.cwd();',
    'const appsDir = path.join(root, "apps");',
    'const dirs = [root];',
    'if (fs.existsSync(appsDir)) {',
    '  for (const d of fs.readdirSync(appsDir, { withFileTypes: true })) {',
    '    if (d.isDirectory()) dirs.push(path.join(appsDir, d.name));',
    '  }',
    '}',
    'for (const dir of dirs) {',
    '  const ex = path.join(dir, ".env.example");',
    '  if (fs.existsSync(ex)) syncEnv(ex, path.join(dir, ".env"));',
    '}',
    'console.log("\\nDone.");',
  ].join("\n");
}
