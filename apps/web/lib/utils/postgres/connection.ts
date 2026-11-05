import { CheckDbConnectionResult, resolveEnvValue } from "@/lib/database-runner";
import { PostgresConnectionConfig } from "./types";

/**
 * Resolves connection string from explicit options, environment variables, or config parts.
 */
export function resolveConnectionString(config: PostgresConnectionConfig): string {
  // 1. Explicit connection string takes highest precedence
  if (config.connectionString) return config.connectionString;
  if (config.connectionStringPooled) return config.connectionStringPooled;

  // 2. From node's explicit env var if set (checks process.env then .env file on disk)
  if (config.connectionStringEnv) {
    const envVal = process.env[config.connectionStringEnv] || resolveEnvValue(config.connectionStringEnv);
    if (envVal) return envVal;
  }
  if (config.connectionStringPooledEnv) {
    const envVal = process.env[config.connectionStringPooledEnv] || resolveEnvValue(config.connectionStringPooledEnv);
    if (envVal) return envVal;
  }

  // 3. Fallback to DATABASE_URL if no explicit credentials were given
  const hasExplicitCredentials = Boolean(
    config.database || config.user || config.username || config.password
  );
  if (!hasExplicitCredentials) {
    const dbUrl = process.env.DATABASE_URL || resolveEnvValue("DATABASE_URL");
    if (dbUrl) return dbUrl;
  }

  // 4. Build from parts
  const host = config.host || "localhost";
  const port = Number(config.port) || 5432;
  const db = config.database || "postgres";
  const user = config.user || config.username || "postgres";
  const pass = config.password !== undefined ? config.password : "postgres";

  const authPart = pass
    ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
    : encodeURIComponent(user);

  let url = `postgresql://${authPart}@${host}:${port}/${encodeURIComponent(db)}`;
  if (
    config.sslMode === "require" ||
    config.provider === "supabase" ||
    config.provider === "neon"
  ) {
    url += "?sslmode=require";
  }
  return url;
}

/**
 * Determines whether SSL is required for the connection.
 */
export function isSslRequiredForConfig(config: PostgresConnectionConfig, connStr: string): boolean {
  return (
    config.sslMode === "require" ||
    config.provider === "supabase" ||
    config.provider === "neon" ||
    config.provider === "aws_rds" ||
    connStr.includes("sslmode=require") ||
    connStr.includes("neon.tech") ||
    connStr.includes("supabase.co") ||
    connStr.includes("pooler.supabase.com") ||
    process.env.NODE_ENV === "production"
  );
}

/**
 * Resolves schema and table name.
 * If tableName includes a dot (e.g. "billing.users"), schema and table are parsed from it.
 * If schema isn't configured, defaults to "public" for backward compatibility.
 */
/**
 * Resolves Cloudflare Hyperdrive connection string if running in Cloudflare Workers and binding is present.
 */
export async function getHyperdriveUrl(): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = getCloudflareContext();
    return (ctx?.env as any)?.HYPERDRIVE?.connectionString;
  } catch {
    return undefined;
  }
}

/**
 * Creates a configured PostgreSQL Client instance, honoring Cloudflare Hyperdrive bindings when available.
 */
export async function createPostgresClient(
  connection: PostgresConnectionConfig,
  customConnectionString?: string,
): Promise<{ client: import("pg").Client; connectionString: string; isHyperdrive: boolean }> {
  const { Client } = await import("pg");
  const hyperdriveUrl = await getHyperdriveUrl();
  const connectionString = hyperdriveUrl || customConnectionString || resolveConnectionString(connection);
  const isHyperdrive = Boolean(hyperdriveUrl);

  const client = new Client({
    connectionString,
    ssl: isHyperdrive
      ? undefined
      : isSslRequiredForConfig(connection, connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
  });

  return { client, connectionString, isHyperdrive };
}

/**
 * Translates opaque errors (like Cloudflare TLS rejection of Supabase private CA) into actionable explanations.
 */
export function enhancePostgresError(error: unknown, connectionString: string): string {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (
    errMsg.includes("Connection terminated unexpectedly") &&
    (connectionString.includes("supabase.co") || connectionString.includes("pooler.supabase.com"))
  ) {
    return (
      "Connection terminated unexpectedly. Supabase poolers use a private TLS certificate that Cloudflare Workers rejects during TLS handshake. " +
      "To connect from Cloudflare Workers, bind a Cloudflare Hyperdrive config or use a provider with public CA (e.g. Neon)."
    );
  }
  return errMsg;
}

export function resolveTableAndSchema(
  rawTableName: string,
  explicitSchema?: string,
): { safeTable: string; targetSchema: string } {
  let table = (rawTableName || "").trim();
  let schema = (explicitSchema || "").trim();

  if (table.includes(".")) {
    const parts = table.split(".");
    if (!schema) {
      schema = parts[0] || "";
    }
    table = parts.slice(1).join(".");
  }

  const safeSchema =
    (schema || "public").replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "public";
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");

  return { safeTable, targetSchema: safeSchema };
}

/**
 * Checks connectivity, latency, and database metadata for a PostgreSQL database.
 */
export async function checkPostgresConnection(
  connection: PostgresConnectionConfig,
): Promise<CheckDbConnectionResult> {
  const start = performance.now();
  const { client, connectionString, isHyperdrive } = await createPostgresClient(connection);
  const maskedUri = connectionString.replace(/:([^:@]+)@/, ':***@');

  try {
    await client.connect();
    console.log(`[checkPostgresConnection] 🔌 Connected to Postgres successfully (${maskedUri})`);
    const res = await client.query<{
      version: string;
      current_database: string;
      pg_database_size: string;
    }>(
      `SELECT version(), current_database(), pg_database_size(current_database())`,
    );
    console.log(`[checkPostgresConnection] ✅ Query executed successfully: SELECT version(), current_database()`, {
      version: res.rows[0]?.version,
      database: res.rows[0]?.current_database,
      size: res.rows[0]?.pg_database_size,
    });
    const row = res.rows[0];
    const latencyMs = Math.round(performance.now() - start);

    // Extract short version string: "PostgreSQL 16.2 on ..."
    const versionMatch = (row?.version || "").match(/PostgreSQL\s+([\d.]+)/i);
    const shortVersion = versionMatch ? `PostgreSQL ${versionMatch[1]}` : row?.version || "PostgreSQL";

    return {
      success: true,
      engine: "postgres",
      latencyMs,
      connectionUri: connectionString.replace(/:([^:@]+)@/, ":***@"),
      info: {
        version: shortVersion,
        rawVersion: row?.version,
        status: "connected",
        reachable: true,
      },
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    const rawErrMsg = error instanceof Error ? error.message : String(error);
    const errMsg = enhancePostgresError(error, connectionString);
    console.error(`[checkPostgresConnection] ❌ Connection failed:`, {
      message: errMsg,
      code: (error as any)?.code,
      routine: (error as any)?.routine,
      stack: (error as any)?.stack,
    });
    return {
      success: false,
      engine: "postgres",
      latencyMs,
      connectionUri: connectionString.replace(/:([^:@]+)@/, ":***@"),
      error: errMsg,
      info: {
        status: "error",
        reachable: false,
      },
    };
  } finally {
    if (client) {
      await client.end().catch(() => {});
      console.log(`[checkPostgresConnection] 🔒 Client closed gracefully`);
    }
  }
}
