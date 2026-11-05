import type { Client } from "pg";
import { CheckDbConnectionResult, resolveEnvValue } from "@/lib/database-runner";
import { PostgresConnectionConfig } from "./types";

interface CloudflareHyperdriveBinding {
  connectionString?: string;
}

declare global {
  interface CloudflareEnv {
    HYPERDRIVE?: CloudflareHyperdriveBinding;
  }
}

/**
 * Masks database credentials consistently using standard URL parsing without regex mangling.
 */
export function maskConnectionString(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return uri;
  }
}

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
  const pass =
    config.password !== undefined
      ? config.password
      : process.env.NODE_ENV === "production"
        ? ""
        : "postgres";

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
 * Explicitly excludes blanket production checks so local or Docker databases without TLS succeed.
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
    connStr.includes("pooler.supabase.com")
  );
}

/**
 * Resolves Cloudflare Hyperdrive connection string if running in Cloudflare Workers and binding is present.
 * Uses getCloudflareContext({ async: true }) for compatibility across all OpenNext execution contexts.
 */
export async function getHyperdriveUrl(): Promise<string | undefined> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const hyperdriveBinding = ctx?.env?.HYPERDRIVE;
    if (hyperdriveBinding?.connectionString) {
      return hyperdriveBinding.connectionString;
    }
  } catch (e) {
    console.warn("[getHyperdriveUrl] no Cloudflare context:", e);
  }

  return undefined;
}

/**
 * Creates a configured PostgreSQL Client instance, honoring Cloudflare Hyperdrive bindings when available.
 */
export async function createPostgresClient(
  connection: PostgresConnectionConfig,
  customConnectionString?: string,
): Promise<{ client: Client; connectionString: string; isHyperdrive: boolean }> {
  const { Client: PgClient } = await import("pg");
  const hyperdriveUrl = await getHyperdriveUrl();
  const directConnectionString = customConnectionString || resolveConnectionString(connection);

  const primaryHost = (() => {
    try {
      const dbUrl = process.env.DATABASE_URL || resolveEnvValue("DATABASE_URL");
      return dbUrl ? new URL(dbUrl).hostname : undefined;
    } catch {
      return undefined;
    }
  })();

  const targetHost = (() => {
    try {
      return new URL(directConnectionString).hostname;
    } catch {
      return undefined;
    }
  })();

  const isSupabaseTarget = Boolean(
    targetHost &&
      (targetHost.includes("supabase.co") || targetHost.includes("pooler.supabase.com"))
  );

  const shouldUseHyperdrive =
    Boolean(hyperdriveUrl) &&
    isSupabaseTarget &&
    (!primaryHost || primaryHost === targetHost);

  let connectionString = directConnectionString;
  if (shouldUseHyperdrive && hyperdriveUrl) {
    // Hyperdrive manages pooling and TLS on Cloudflare edge.
    // Strip sslmode so pg doesn't attempt an unnecessary TLS handshake on the local Hyperdrive socket.
    try {
      const parsedUrl = new URL(hyperdriveUrl);
      parsedUrl.searchParams.delete("sslmode");
      connectionString = parsedUrl.toString();
    } catch {
      connectionString = hyperdriveUrl;
    }
  }

  const isHyperdrive = shouldUseHyperdrive;
  console.log("[createPostgresClient] hyperdrive:", isHyperdrive);

  const sslOption = isHyperdrive
    ? undefined
    : isSslRequiredForConfig(connection, connectionString)
      ? { rejectUnauthorized: false }
      : undefined;

  const client: Client = new PgClient({
    connectionString,
    ssl: sslOption,
  });

  return { client, connectionString, isHyperdrive };
}

/**
 * Translates opaque errors into actionable explanations, distinguishing Hyperdrive vs Direct Cloudflare TLS failures.
 */
export function enhancePostgresError(
  error: Error | string | null | undefined,
  connectionString: string,
  isHyperdrive?: boolean,
): string {
  let errMsg = "";
  if (error instanceof Error) {
    errMsg = error.message;
  } else if (typeof error === "string") {
    errMsg = error;
  } else if (error) {
    errMsg = String(error);
  }

  if (isHyperdrive) {
    return (
      `Database connection via Cloudflare Hyperdrive failed: ${errMsg}. ` +
      "Verify your Cloudflare Hyperdrive configuration. Note that Hyperdrive's origin database setting must point to Supabase's " +
      "session pooler or direct connection (port 5432), NOT the transaction pooler (port 6543)."
    );
  }

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

/**
 * Resolves schema and table name, preserving identifier casing and valid characters.
 */
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

  const safeSchema = (schema || "public").replace(/["\0;\\]/g, "").trim() || "public";
  const safeTable = table.replace(/["\0;\\]/g, "").trim();

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
  const maskedUri = maskConnectionString(connectionString);

  try {
    await client.connect();
    console.log(`[checkPostgresConnection] 🔌 Connected to Postgres successfully (${maskedUri}, hyperdrive: ${isHyperdrive})`);
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
      connectionUri: maskedUri,
      info: {
        version: shortVersion,
        rawVersion: row?.version,
        status: "connected",
        reachable: true,
      },
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    const errorInstance = error instanceof Error ? error : new Error(String(error));
    const errMsg = enhancePostgresError(errorInstance, connectionString, isHyperdrive);
    const errorCode = "code" in errorInstance && typeof errorInstance.code === "string" ? errorInstance.code : undefined;
    const errorRoutine = "routine" in errorInstance && typeof errorInstance.routine === "string" ? errorInstance.routine : undefined;

    console.error(`[checkPostgresConnection] ❌ Connection failed:`, {
      message: errMsg,
      code: errorCode,
      routine: errorRoutine,
      stack: errorInstance.stack,
    });
    return {
      success: false,
      engine: "postgres",
      latencyMs,
      connectionUri: maskedUri,
      error: errMsg,
      info: {
        status: "error",
        reachable: false,
      },
    };
  } finally {
    await client.end().catch(() => {});
    console.log(`[checkPostgresConnection] 🔒 Client closed gracefully`);
  }
}
