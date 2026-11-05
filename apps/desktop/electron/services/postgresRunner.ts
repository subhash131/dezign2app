import { Client, PoolClient } from "pg";
import fs from "fs";
import path from "path";
import {
  CanvasEntityColumn,
  TestDbOperationPayload,
  TestDbOperationResult,
  CheckDbConnectionResult,
  JsonValue,
} from "./dbRunner";

export interface PostgresConnectionConfig {
  host?: string;
  port?: number | string;
  database?: string;
  user?: string;
  username?: string;
  password?: string;
  connectionString?: string;
  connectionStringEnv?: string;
  connectionStringPooled?: string;
  connectionStringPooledEnv?: string;
  sslMode?: string;
  provider?: string;
  dbFilePath?: string;
  dbFilePathEnv?: string;
}

export interface CanvasColumnDefinition {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isNotNull?: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface CanvasIndexDefinition {
  name: string;
  columns: string;
  isUnique?: boolean;
}

export interface CanvasForeignKeyDefinition {
  name?: string;
  column: string;
  foreignTable: string;
  foreignColumn: string;
  foreignSchema?: string;
  onDelete?: string;
  onUpdate?: string;
}

export interface AlteredColumnDefinition {
  name: string;
  oldType: string;
  newType: string;
}

export interface PrerequisiteTableDefinition {
  tableName: string;
  schema?: string;
  columns: CanvasColumnDefinition[];
  indexes?: CanvasIndexDefinition[];
}

export interface CheckDbTableSyncPayload {
  engine?: string;
  connection?: PostgresConnectionConfig;
  tableName: string;
  schema?: string;
  columns?: CanvasColumnDefinition[];
  indexes?: CanvasIndexDefinition[];
  foreignKeys?: CanvasForeignKeyDefinition[];
}

export interface CheckDbTableSyncResult {
  success: boolean;
  serverReachable: boolean;
  tableExists: boolean;
  inSync: boolean;
  missingColumns: Array<{ name: string; type: string }>;
  alteredColumns: AlteredColumnDefinition[];
  extraColumns: Array<{ name: string; type: string }>;
  existingColumns: Array<{ name: string; type: string }>;
  missingIndexes: CanvasIndexDefinition[];
  extraIndexes: CanvasIndexDefinition[];
  existingIndexes: CanvasIndexDefinition[];
  missingForeignKeys: CanvasForeignKeyDefinition[];
  extraForeignKeys: CanvasForeignKeyDefinition[];
  existingForeignKeys: CanvasForeignKeyDefinition[];
  missingPrerequisiteTables: string[];
  error?: string;
  tip?: string;
}

export interface ApplyDbTableSyncPayload {
  engine?: string;
  connection?: PostgresConnectionConfig;
  tableName: string;
  schema?: string;
  columns?: CanvasColumnDefinition[];
  indexes?: CanvasIndexDefinition[];
  foreignKeys?: CanvasForeignKeyDefinition[];
  prerequisiteTables?: PrerequisiteTableDefinition[];
}

export interface ApplyDbTableSyncResult {
  success: boolean;
  createdTable: boolean;
  appliedColumns: string[];
  alteredColumns?: AlteredColumnDefinition[];
  appliedIndexes?: string[];
  appliedForeignKeys?: string[];
  appliedPrerequisiteTables?: string[];
  droppedColumns?: string[];
  droppedIndexes?: string[];
  droppedForeignKeys?: string[];
  error?: string;
}

export interface DropDbTablePayload {
  engine?: string;
  connection?: PostgresConnectionConfig;
  tableName: string;
  schema?: string;
}

export interface DropDbTableResult {
  success: boolean;
  droppedTable: string;
  error?: string;
}

export interface RenameDbTablePayload {
  engine?: string;
  connection?: PostgresConnectionConfig;
  oldTableName: string;
  newTableName: string;
  schema?: string;
}

export interface RenameDbTableResult {
  success: boolean;
  oldTableName: string;
  newTableName: string;
  error?: string;
}

export interface RenameDbColumnPayload {
  engine?: string;
  connection?: PostgresConnectionConfig;
  tableName: string;
  oldColumnName: string;
  newColumnName: string;
  schema?: string;
}

export interface RenameDbColumnResult {
  success: boolean;
  tableName: string;
  oldColumnName: string;
  newColumnName: string;
  error?: string;
}

export interface ExecutePostgresOptions {
  connection: PostgresConnectionConfig;
  entity?: {
    name?: string;
    columns?: CanvasEntityColumn[];
  };
  operation: TestDbOperationPayload["operation"];
  args: Record<string, JsonValue>;
  mode?: "live" | "sandbox";
}

function findEnvFiles(projectDir?: string): string[] {
  const dirs = [
    projectDir,
    process.cwd(),
    path.join(process.cwd(), "apps", "web"),
  ].filter(Boolean) as string[];
  const filenames = [".env.local", ".env"];
  const found: string[] = [];
  for (const d of dirs) {
    for (const f of filenames) {
      const full = path.join(d, f);
      if (fs.existsSync(full) && !found.includes(full)) {
        found.push(full);
      }
    }
  }
  return found;
}

export function resolveEnvValue(envKey: string, projectDir?: string): string | undefined {
  if (!envKey) return undefined;
  if (process.env[envKey]) return process.env[envKey];
  for (const envFile of findEnvFiles(projectDir)) {
    try {
      const content = fs.readFileSync(envFile, "utf-8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const idx = trimmed.indexOf("=");
        const key = trimmed.substring(0, idx).trim();
        if (key === envKey) {
          let val = trimmed.substring(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          return val;
        }
      }
    } catch {}
  }
  return undefined;
}

export function resolveConnectionString(config: PostgresConnectionConfig, projectDir?: string): string {
  // 1. Explicit connection string takes highest precedence
  if (config.connectionString) return config.connectionString;
  if (config.connectionStringPooled) return config.connectionStringPooled;

  // 2. From environment variable if specified
  if (config.connectionStringEnv) {
    const envVal = resolveEnvValue(config.connectionStringEnv, projectDir);
    if (envVal) return envVal;
  }
  if (config.connectionStringPooledEnv) {
    const envVal = resolveEnvValue(config.connectionStringPooledEnv, projectDir);
    if (envVal) return envVal;
  }

  // 3. Fallback to DATABASE_URL if no explicit host/database
  const hasExplicit = Boolean(config.database || config.user || config.username || config.password);
  if (!hasExplicit) {
    const dbUrl = resolveEnvValue("DATABASE_URL", projectDir) || resolveEnvValue("DATABASE_URL_POOLED", projectDir);
    if (dbUrl) return dbUrl;
  }

  // 4. Build from constituent parts
  const host = config.host || "127.0.0.1";
  const port = Number(config.port) || 5432;
  const db = config.database || "postgres";
  const user = config.user || config.username || "postgres";
  const pass = config.password !== undefined && config.password !== null ? String(config.password) : "";

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

export function createPostgresClient(
  config?: PostgresConnectionConfig,
  projectDir?: string,
): { client: Client; connectionString: string } {
  const connectionString = resolveConnectionString(config || {}, projectDir);
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const requiresSsl =
    !isLocal ||
    config?.sslMode === "require" ||
    config?.provider === "supabase" ||
    config?.provider === "neon" ||
    config?.provider === "aws_rds" ||
    connectionString.includes("sslmode=require") ||
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com") ||
    connectionString.includes("neon.tech");

  const client = new Client({
    connectionString,
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  });
  return { client, connectionString };
}

export function mapToPgType(typeStr: string, isSinglePk = false): string {
  const t = typeStr.toLowerCase().trim();
  if (isSinglePk) {
    if (t === "number" || t === "int" || t === "integer" || t === "serial") return "SERIAL";
    if (t === "bigint" || t === "bigserial") return "BIGSERIAL";
    if (t === "uuid") return "UUID";
    return "TEXT";
  }
  if (t === "string" || t === "text" || t === "varchar") return "TEXT";
  if (t === "number" || t === "int" || t === "integer") return "INTEGER";
  if (t === "smallint") return "SMALLINT";
  if (t === "bigint") return "BIGINT";
  if (t === "serial") return "SERIAL";
  if (t === "bigserial") return "BIGSERIAL";
  if (t === "float" || t === "double" || t === "decimal" || t === "double precision") return "DOUBLE PRECISION";
  if (t === "real") return "REAL";
  if (t === "numeric") return "NUMERIC";
  if (t === "boolean" || t === "bool") return "BOOLEAN";
  if (t === "timestamp" || t === "datetime") return "TIMESTAMPTZ";
  if (t === "timestamptz") return "TIMESTAMPTZ";
  if (t === "date") return "DATE";
  if (t === "time") return "TIME";
  if (t === "bytea" || t === "blob") return "BYTEA";
  if (t === "json" || t === "jsonb" || t === "object") return "JSONB";
  if (t === "uuid") return "UUID";
  return "TEXT";
}

export function areTypesEquivalent(cType: string, dbType: string): boolean {
  const normC = mapToPgType(cType);
  const normDb = dbType.toUpperCase().trim();
  if (normC === normDb) return true;
  if (normC === "BOOLEAN" && (normDb === "BOOL" || normDb === "BOOLEAN")) return true;
  if (normC === "SMALLINT" && (normDb === "INT2" || normDb === "SMALLINT")) return true;
  if (normC === "REAL" && (normDb === "FLOAT4" || normDb === "REAL")) return true;
  if (normC === "NUMERIC" && (normDb === "NUMERIC" || normDb === "DECIMAL")) return true;
  if (normC === "TEXT" && (normDb.includes("VARCHAR") || normDb.includes("CHAR") || normDb === "TEXT")) return true;
  if (normC === "INTEGER" && (normDb === "INT4" || normDb === "INT" || normDb === "INTEGER" || normDb.includes("SERIAL"))) return true;
  if (normC === "BIGINT" && (normDb === "INT8" || normDb === "BIGINT" || normDb.includes("BIGSERIAL"))) return true;
  if (normC === "DOUBLE PRECISION" && (normDb === "FLOAT8" || normDb === "DOUBLE PRECISION" || normDb === "NUMERIC")) return true;
  if (normC === "TIMESTAMPTZ" && (normDb.includes("TIMESTAMP") || normDb.includes("TIMESTAMPTZ"))) return true;
  if (normC === "JSONB" && (normDb === "JSON" || normDb === "JSONB")) return true;
  return false;
}

export async function ensurePostgresTable(
  client: Client | PoolClient,
  tableName: string,
  columns?: CanvasEntityColumn[],
): Promise<void> {
  const safeTable = (tableName || "records").replace(/[^a-zA-Z0-9_]/g, "") || "records";

  const checkRes = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
    [safeTable],
  );
  const exists = checkRes.rows[0]?.exists;

  if (!exists) {
    const colDefs: string[] = [];
    if (columns && columns.length > 0) {
      for (const col of columns) {
        const colName = (col.name || "col").replace(/[^a-zA-Z0-9_]/g, "");
        const isPk = col.isPrimaryKey || col.isPrimary || col.primaryKey || colName.toLowerCase() === "id";
        const t = (col.type || "string").toLowerCase();
        let pgType = "TEXT";
        if (t === "number" || t === "int" || t === "integer") pgType = "INTEGER";
        else if (t === "bigint") pgType = "BIGINT";
        else if (t === "float" || t === "double" || t === "decimal") pgType = "DOUBLE PRECISION";
        else if (t === "boolean" || t === "bool") pgType = "BOOLEAN";
        else if (t === "timestamp" || t === "datetime") pgType = "TIMESTAMPTZ";
        else if (t === "json" || t === "object" || t === "jsonb") pgType = "JSONB";

        colDefs.push(isPk ? `"${colName}" ${pgType} PRIMARY KEY` : `"${colName}" ${pgType}`);
      }
    }
    if (!colDefs.some((d) => d.includes("PRIMARY KEY"))) {
      colDefs.unshift(`"id" TEXT PRIMARY KEY`);
    }
    if (!colDefs.some((d) => d.startsWith('"created_at"'))) {
      colDefs.push(`"created_at" TIMESTAMPTZ DEFAULT NOW()`);
    }
    if (!colDefs.some((d) => d.startsWith('"updated_at"'))) {
      colDefs.push(`"updated_at" TIMESTAMPTZ DEFAULT NOW()`);
    }
    await client.query(`CREATE TABLE IF NOT EXISTS "${safeTable}" (${colDefs.join(", ")});`);
  } else if (columns && columns.length > 0) {
    const infoRes = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [safeTable],
    );
    const existingCols = new Set(infoRes.rows.map((r) => r.column_name.toLowerCase()));
    for (const col of columns) {
      const colName = (col.name || "").replace(/[^a-zA-Z0-9_]/g, "");
      if (!colName || existingCols.has(colName.toLowerCase())) continue;
      const t = (col.type || "string").toLowerCase();
      let pgType = "TEXT";
      if (t === "number" || t === "int" || t === "integer") pgType = "INTEGER";
      else if (t === "bigint") pgType = "BIGINT";
      else if (t === "boolean" || t === "bool") pgType = "BOOLEAN";
      else if (t === "timestamp" || t === "datetime") pgType = "TIMESTAMPTZ";
      else if (t === "json" || t === "object" || t === "jsonb") pgType = "JSONB";
      try {
        await client.query(
          `ALTER TABLE "${safeTable}" ADD COLUMN IF NOT EXISTS "${colName}" ${pgType}`,
        );
      } catch {}
    }
  }
}

function planPostgresQuery(
  operation: TestDbOperationPayload["operation"],
  args: Record<string, JsonValue>,
  tableName: string,
): { rawSql: string; params: unknown[] } {
  const name = operation.name || "";
  const kind = operation.kind || "";
  const code = (operation.code || "").trim();
  const query = (operation.query || "").trim();

  // 1. Check if op.query has direct SQL
  if (
    query &&
    !query.startsWith("Query function for") &&
    !query.startsWith("Auto-generated")
  ) {
    return { rawSql: query, params: [] };
  }

  // 2. Check if op.code is direct SQL
  if (
    code &&
    /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP)\b/i.test(code)
  ) {
    return { rawSql: code, params: [] };
  }

  // 3. Check if op.code has an embedded query('SQL...', [...]) call
  const queryMatch = code.match(
    /query(?:<[^>]+>)?\s*\(\s*(['"`])([\s\S]*?)\1\s*(?:,\s*\[([\s\S]*?)\])?\s*\)/m,
  );

  if (queryMatch && queryMatch[2] && /^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(queryMatch[2].trim())) {
    const sql = queryMatch[2].trim();
    let payloadObj: Record<string, unknown> = {};
    Object.keys(args).forEach((k) => {
      const val = args[k];
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        payloadObj = { ...payloadObj, ...(val as Record<string, unknown>) };
      } else {
        payloadObj[k] = val;
      }
    });

    const colMatch = sql.match(/\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    const params: unknown[] = [];

    if (colMatch && colMatch[1]) {
      const cols = colMatch[1]
        .split(",")
        .map((c) => c.replace(/["`\s]/g, ""));
      for (const colName of cols) {
        if (colName.toLowerCase() === "id") {
          const idVal =
            payloadObj["id"] ??
            args["id"] ??
            payloadObj["_id"] ??
            args["_id"] ??
            `test-${Date.now().toString(36)}`;
          params.push(idVal);
        } else {
          params.push(payloadObj[colName] ?? args[colName] ?? null);
        }
      }
      return { rawSql: sql, params };
    }
  }

  // 4. Fallback inference by operation kind
  const isFindById = kind === "findById" || name.toLowerCase().includes("byid");
  const isCreate = kind === "create" || name.toLowerCase().startsWith("create");
  const isUpdate = kind === "update" || name.toLowerCase().startsWith("update");
  const isDelete = kind === "delete" || name.toLowerCase().startsWith("delete");

  if (isFindById) {
    const idVal = String(args.id ?? "1");
    return {
      rawSql: `SELECT * FROM "${tableName}" WHERE "id" = $1 LIMIT 1;`,
      params: [idVal],
    };
  }

  if (isCreate) {
    const keys = Object.keys(args).filter((k) => k !== "id");
    if (keys.length === 0) {
      return {
        rawSql: `INSERT INTO "${tableName}" DEFAULT VALUES RETURNING *;`,
        params: [],
      };
    }
    const cols = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const vals = keys.map((k) => args[k]);
    return {
      rawSql: `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders}) RETURNING *;`,
      params: vals,
    };
  }

  if (isUpdate) {
    const idVal = String(args.id ?? "1");
    return {
      rawSql: `UPDATE "${tableName}" SET "updated_at" = NOW() WHERE "id" = $1 RETURNING *;`,
      params: [idVal],
    };
  }

  if (isDelete) {
    const idVal = String(args.id ?? "1");
    return {
      rawSql: `DELETE FROM "${tableName}" WHERE "id" = $1;`,
      params: [idVal],
    };
  }

  // Default: SELECT all from table
  return {
    rawSql: `SELECT * FROM "${tableName}" LIMIT 20;`,
    params: [],
  };
}

export async function executePostgresLiveOperation(
  opts: ExecutePostgresOptions,
): Promise<TestDbOperationResult> {
  const { client, connectionString } = createPostgresClient(opts.connection);
  const tableName = (opts.entity?.name || "records").replace(/[^a-zA-Z0-9_]/g, "") || "records";
  const start = performance.now();

  try {
    await client.connect();

    // 1. Auto-ensure table structure exists
    await ensurePostgresTable(client, tableName, opts.entity?.columns);

    // 2. Plan and execute query
    const { rawSql, params } = planPostgresQuery(opts.operation, opts.args, tableName);

    const queryRes = await client.query(rawSql, params as any[]);
    const durationMs = Math.round((performance.now() - start) * 10) / 10;

    const kind = opts.operation.kind || "";
    const name = opts.operation.name || "";
    const isFindAllLike =
      kind === "findAll" ||
      kind === "fetchByIndex" ||
      name.toLowerCase().startsWith("findall") ||
      name.toLowerCase().startsWith("getall") ||
      name.toLowerCase().startsWith("list");

    let output: JsonValue;
    if (kind === "delete") {
      output = {
        success: true,
        message: "Record deleted successfully",
        deletedCount: queryRes.rowCount ?? 0,
      };
    } else if (
      queryRes.rows.length === 1 &&
      (kind === "findById" || kind === "create" || kind === "update" || kind === "upsert") &&
      !isFindAllLike
    ) {
      output = queryRes.rows[0] as JsonValue;
    } else if (isFindAllLike) {
      output = queryRes.rows as JsonValue[];
    } else {
      output = queryRes.rows.length > 0 ? (queryRes.rows as JsonValue[]) : (queryRes.rows as JsonValue[]);
    }

    return {
      success: true,
      serverActive: true,
      output,
      durationMs: Math.max(0.5, durationMs),
      rawCommand: rawSql,
      mode: "live",
      connection: connectionString.replace(/:([^:@]+)@/, ":***@"),
    };
  } catch (err) {
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    const errMsg = err instanceof Error ? err.message : String(err);
    const isConnErr =
      errMsg.includes("ECONNREFUSED") ||
      errMsg.includes("connect ETIMEDOUT") ||
      errMsg.includes("Connection refused") ||
      errMsg.includes("connection timeout") ||
      errMsg.includes("getaddrinfo ENOTFOUND") ||
      errMsg.includes("password authentication failed");

    return {
      success: false,
      serverActive: !isConnErr,
      error: `PostgreSQL error: ${errMsg}`,
      durationMs: Math.max(0.5, durationMs),
      rawCommand: opts.operation.query || `${opts.operation.name}(${Object.keys(opts.args).join(", ")})`,
      mode: "live",
      connection: connectionString.replace(/:([^:@]+)@/, ":***@"),
      tip: isConnErr
        ? "Ensure your PostgreSQL server is running and credentials match, or switch to Sandbox mode."
        : undefined,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function checkPostgresConnection(
  connection: PostgresConnectionConfig,
): Promise<CheckDbConnectionResult> {
  const start = performance.now();
  const { client, connectionString } = createPostgresClient(connection);

  try {
    await client.connect();
    const res = await client.query<{
      version: string;
      current_database: string;
      pg_database_size?: string;
    }>(
      `SELECT version(), current_database(), pg_database_size(current_database())`,
    );
    const row = res.rows[0];
    const latencyMs = Math.round(performance.now() - start);

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
        database: row?.current_database,
        status: "Connected (PostgreSQL Active)",
        reachable: true,
      },
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      engine: "postgres",
      latencyMs,
      error: errMsg,
      connectionUri: connectionString.replace(/:([^:@]+)@/, ":***@"),
      info: { reachable: false, status: "unreachable" },
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function checkPostgresTableSync(
  payload: CheckDbTableSyncPayload,
): Promise<CheckDbTableSyncResult> {
  const { tableName, schema = "public", columns = [], indexes = [], foreignKeys = [] } = payload;
  const safeTable = tableName.trim();
  const targetSchema = schema.trim() || "public";
  const { client } = createPostgresClient(payload.connection);

  try {
    await client.connect();

    const tableCheckRes = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE LOWER(table_name) = LOWER($1) AND table_schema = $2
      ) AS exists`,
      [safeTable, targetSchema],
    );
    const tableExists = Boolean(tableCheckRes.rows[0]?.exists);

    if (!tableExists) {
      return {
        success: true,
        serverReachable: true,
        tableExists: false,
        inSync: false,
        missingColumns: columns.map((c) => ({ name: c.name, type: c.type })),
        alteredColumns: [],
        extraColumns: [],
        existingColumns: [],
        missingIndexes: indexes,
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: foreignKeys,
        extraForeignKeys: [],
        existingForeignKeys: [],
        missingPrerequisiteTables: [],
      };
    }

    const colRes = await client.query<{ column_name: string; data_type: string; udt_name: string }>(
      `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
       WHERE LOWER(table_name) = LOWER($1) AND table_schema = $2`,
      [safeTable, targetSchema],
    );
    const dbCols = colRes.rows.map((r) => ({
      name: r.column_name,
      type: r.udt_name || r.data_type,
    }));
    const dbColMap = new Map(dbCols.map((c) => [c.name.toLowerCase(), c.type]));

    const missingColumns: Array<{ name: string; type: string }> = [];
    const alteredColumns: AlteredColumnDefinition[] = [];
    const existingColumns: Array<{ name: string; type: string }> = [];

    for (const c of columns) {
      const dbType = dbColMap.get(c.name.toLowerCase());
      if (dbType === undefined) {
        missingColumns.push({ name: c.name, type: c.type });
      } else {
        existingColumns.push({ name: c.name, type: dbType });
        if (!areTypesEquivalent(c.type, dbType)) {
          alteredColumns.push({
            name: c.name,
            oldType: dbType,
            newType: mapToPgType(c.type),
          });
        }
      }
    }

    const canvasColSet = new Set(columns.map((c) => c.name.toLowerCase()));
    const extraColumns: Array<{ name: string; type: string }> = dbCols
      .filter((c) => !canvasColSet.has(c.name.toLowerCase()))
      .map((c) => ({ name: c.name, type: c.type }));

    const idxRes = await client.query<{ index_name: string; is_unique: boolean; column_names: string }>(
      `SELECT i.relname AS index_name,
              ix.indisunique AS is_unique,
              ARRAY_TO_STRING(ARRAY_AGG(a.attname ORDER BY array_position(ix.indkey, a.attnum)), ', ') AS column_names
       FROM pg_class t
       JOIN pg_index ix ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
       WHERE LOWER(t.relname) = LOWER($1)
         AND n.nspname = $2
         AND NOT ix.indisprimary
       GROUP BY i.relname, ix.indisunique`,
      [safeTable, targetSchema],
    );
    const dbIndexes = idxRes.rows.map((r) => ({
      name: r.index_name,
      columns: r.column_names,
      isUnique: Boolean(r.is_unique),
    }));

    const missingIndexes = indexes.filter(
      (cIdx) => !dbIndexes.some((dIdx) => dIdx.columns.toLowerCase() === cIdx.columns.toLowerCase()),
    );
    const extraIndexes = dbIndexes.filter(
      (dIdx) => !indexes.some((cIdx) => cIdx.columns.toLowerCase() === dIdx.columns.toLowerCase()),
    );
    const existingIndexes = dbIndexes.filter(
      (dIdx) => indexes.some((cIdx) => cIdx.columns.toLowerCase() === dIdx.columns.toLowerCase()),
    );

    const fkRes = await client.query<{
      constraint_name: string;
      column_name: string;
      foreign_table: string;
      foreign_column: string;
    }>(
      `SELECT c.conname AS constraint_name,
              att.attname AS column_name,
              cl_ref.relname AS foreign_table,
              att_ref.attname AS foreign_column
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = ANY(c.conkey)
       JOIN pg_class cl_ref ON cl_ref.oid = c.confrelid
       JOIN pg_attribute att_ref ON att_ref.attrelid = c.confrelid AND att_ref.attnum = ANY(c.confkey)
       WHERE c.contype = 'f'
         AND LOWER(cl.relname) = LOWER($1)
         AND n.nspname = $2`,
      [safeTable, targetSchema],
    );
    const dbFks = fkRes.rows.map((r) => ({
      name: r.constraint_name,
      column: r.column_name,
      foreignTable: r.foreign_table,
      foreignColumn: r.foreign_column,
    }));

    const missingForeignKeys = foreignKeys.filter(
      (cFk) =>
        !dbFks.some(
          (dFk) =>
            dFk.column.toLowerCase() === cFk.column.toLowerCase() &&
            dFk.foreignTable.toLowerCase() === cFk.foreignTable.toLowerCase(),
        ),
    );
    const extraForeignKeys = dbFks.filter(
      (dFk) =>
        !foreignKeys.some(
          (cFk) =>
            cFk.column.toLowerCase() === dFk.column.toLowerCase() &&
            cFk.foreignTable.toLowerCase() === dFk.foreignTable.toLowerCase(),
        ),
    );
    const existingForeignKeys = dbFks.filter(
      (dFk) =>
        foreignKeys.some(
          (cFk) =>
            cFk.column.toLowerCase() === dFk.column.toLowerCase() &&
            cFk.foreignTable.toLowerCase() === dFk.foreignTable.toLowerCase(),
        ),
    );

    const inSync =
      missingColumns.length === 0 &&
      alteredColumns.length === 0 &&
      extraColumns.length === 0 &&
      missingIndexes.length === 0 &&
      missingForeignKeys.length === 0;

    return {
      success: true,
      serverReachable: true,
      tableExists: true,
      inSync,
      missingColumns,
      alteredColumns,
      extraColumns,
      existingColumns,
      missingIndexes,
      extraIndexes,
      existingIndexes,
      missingForeignKeys,
      extraForeignKeys,
      existingForeignKeys,
      missingPrerequisiteTables: [],
    };
  } catch (err) {
    return {
      success: false,
      serverReachable: false,
      tableExists: false,
      inSync: false,
      missingColumns: columns.map((c) => ({ name: c.name, type: c.type })),
      alteredColumns: [],
      extraColumns: [],
      existingColumns: [],
      missingIndexes: indexes,
      extraIndexes: [],
      existingIndexes: [],
      missingForeignKeys: foreignKeys,
      extraForeignKeys: [],
      existingForeignKeys: [],
      missingPrerequisiteTables: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function applyPostgresTableSync(
  payload: ApplyDbTableSyncPayload,
): Promise<ApplyDbTableSyncResult> {
  const {
    tableName,
    schema = "public",
    columns = [],
    indexes = [],
    foreignKeys = [],
    prerequisiteTables = [],
  } = payload;
  const safeTable = tableName.trim();
  const targetSchema = schema.trim() || "public";
  const { client } = createPostgresClient(payload.connection);

  const appliedColumns: string[] = [];
  const alteredColumns: AlteredColumnDefinition[] = [];
  const droppedColumns: string[] = [];
  const appliedIndexes: string[] = [];
  const droppedIndexes: string[] = [];
  const appliedForeignKeys: string[] = [];
  const droppedForeignKeys: string[] = [];
  const appliedPrerequisiteTables: string[] = [];
  let createdTable = false;

  try {
    await client.connect();

    // 0. Ensure schema exists
    if (targetSchema && targetSchema !== "public") {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${targetSchema}"`);
    }

    // 1. Create prerequisite tables if needed
    for (const prereq of prerequisiteTables) {
      const pTable = prereq.tableName.trim();
      const pSchema = prereq.schema?.trim() || targetSchema;
      if (pSchema && pSchema !== "public") {
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${pSchema}"`);
      }
      const chk = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE LOWER(table_name) = LOWER($1) AND table_schema = $2
        ) AS exists`,
        [pTable, pSchema],
      );
      if (!chk.rows[0]?.exists) {
        const pExplicitPks = (prereq.columns || []).filter((c) => c.isPrimaryKey || c.name.toLowerCase() === "id");
        const pColDefs: string[] = [];
        const pPkNames: string[] = [];

        for (const c of prereq.columns || []) {
          const isPk = Boolean(c.isPrimaryKey || (pExplicitPks.length === 0 && c.name.toLowerCase() === "id"));
          if (isPk) pPkNames.push(c.name);
          const pgType = mapToPgType(c.type, isPk && pExplicitPks.length <= 1);
          let def = `"${c.name}" ${pgType}`;
          if (isPk && pExplicitPks.length <= 1) {
            def += " PRIMARY KEY";
          } else if (c.isNotNull || isPk) {
            def += " NOT NULL";
          }
          if (c.isUnique) def += " UNIQUE";
          pColDefs.push(def);
        }

        if (pPkNames.length === 0) {
          pColDefs.unshift('"id" TEXT PRIMARY KEY');
        } else if (pPkNames.length > 1) {
          pColDefs.push(`PRIMARY KEY (${pPkNames.map((n) => `"${n}"`).join(", ")})`);
        }

        await client.query(`CREATE TABLE IF NOT EXISTS "${pSchema}"."${pTable}" (${pColDefs.join(", ")})`);
        appliedPrerequisiteTables.push(pTable);
      }
    }

    // 2. Check main table existence
    const tableChk = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE LOWER(table_name) = LOWER($1) AND table_schema = $2
      ) AS exists`,
      [safeTable, targetSchema],
    );

    if (!tableChk.rows[0]?.exists) {
      const explicitPks = (columns || []).filter((c) => c.isPrimaryKey || c.name.toLowerCase() === "id");
      const colDefs: string[] = [];
      const pkNames: string[] = [];

      for (const c of columns || []) {
        const isPk = Boolean(c.isPrimaryKey || (explicitPks.length === 0 && c.name.toLowerCase() === "id"));
        if (isPk) pkNames.push(c.name);
        const pgType = mapToPgType(c.type, isPk && explicitPks.length <= 1);
        let def = `"${c.name}" ${pgType}`;
        if (isPk && explicitPks.length <= 1) {
          def += " PRIMARY KEY";
        } else if (c.isNotNull || isPk) {
          def += " NOT NULL";
        }
        if (c.isUnique) def += " UNIQUE";
        colDefs.push(def);
      }

      if (pkNames.length === 0) {
        colDefs.unshift('"id" TEXT PRIMARY KEY');
      } else if (pkNames.length > 1) {
        colDefs.push(`PRIMARY KEY (${pkNames.map((n) => `"${n}"`).join(", ")})`);
      }

      await client.query(`CREATE TABLE IF NOT EXISTS "${targetSchema}"."${safeTable}" (${colDefs.join(", ")})`);
      createdTable = true;
    } else {
      // Table exists: ALTER TABLE operations (ADD COLUMN, ALTER COLUMN TYPE, DROP COLUMN)
      const dbColRes = await client.query<{ column_name: string; udt_name: string }>(
        `SELECT column_name, udt_name FROM information_schema.columns
         WHERE LOWER(table_name) = LOWER($1) AND table_schema = $2`,
        [safeTable, targetSchema],
      );
      const dbColMap = new Map(dbColRes.rows.map((r) => [r.column_name.toLowerCase(), r.udt_name]));
      const canvasColNames = new Set(columns.map((c) => c.name.toLowerCase()));

      // A. Add missing columns and alter existing types
      for (const col of columns) {
        const dbType = dbColMap.get(col.name.toLowerCase());
        const targetType = mapToPgType(col.type);

        if (dbType === undefined) {
          let addDef = `ADD COLUMN IF NOT EXISTS "${col.name}" ${targetType}`;
          if (col.isNotNull && !col.isPrimaryKey) {
            const defVal =
              targetType === "INTEGER" || targetType === "BIGINT"
                ? "0"
                : targetType === "BOOLEAN"
                  ? "FALSE"
                  : targetType === "JSONB"
                    ? "'{}'::jsonb"
                    : "''";
            addDef += ` NOT NULL DEFAULT ${defVal}`;
          }
          if (col.isUnique) addDef += " UNIQUE";
          await client.query(`ALTER TABLE "${targetSchema}"."${safeTable}" ${addDef}`);
          appliedColumns.push(col.name);
        } else if (!areTypesEquivalent(col.type, dbType)) {
          try {
            await client.query(`ALTER TABLE "${targetSchema}"."${safeTable}" ALTER COLUMN "${col.name}" DROP DEFAULT`);
          } catch {}

          await client.query(
            `ALTER TABLE "${targetSchema}"."${safeTable}" ALTER COLUMN "${col.name}" TYPE ${targetType} USING "${col.name}"::text::${targetType}`,
          );

          alteredColumns.push({
            name: col.name,
            oldType: dbType,
            newType: targetType,
          });
        }
      }

      // B. Drop removed columns that are no longer on the canvas
      for (const row of dbColRes.rows) {
        const lowerName = row.column_name.toLowerCase();
        if (!canvasColNames.has(lowerName) && lowerName !== "id") {
          try {
            await client.query(`ALTER TABLE "${targetSchema}"."${safeTable}" DROP COLUMN IF EXISTS "${row.column_name}" CASCADE`);
            droppedColumns.push(row.column_name);
          } catch {}
        }
      }
    }

    // 3. Sync indexes (CREATE missing, DROP removed)
    const idxRes = await client.query<{ index_name: string; is_unique: boolean; column_names: string }>(
      `SELECT i.relname AS index_name,
              ix.indisunique AS is_unique,
              ARRAY_TO_STRING(ARRAY_AGG(a.attname ORDER BY array_position(ix.indkey, a.attnum)), ', ') AS column_names
       FROM pg_class t
       JOIN pg_index ix ON t.oid = ix.indrelid
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
       WHERE LOWER(t.relname) = LOWER($1)
         AND n.nspname = $2
         AND NOT ix.indisprimary
       GROUP BY i.relname, ix.indisunique`,
      [safeTable, targetSchema],
    );
    const existingDbIndexes = idxRes.rows.map((r) => ({
      name: r.index_name,
      columns: r.column_names,
      isUnique: Boolean(r.is_unique),
    }));

    for (const idx of indexes) {
      if (!idx.columns) continue;
      const safeIdxName = idx.name || `idx_${safeTable}_${idx.columns.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      const uniqueKeyword = idx.isUnique ? "UNIQUE " : "";
      const colList = idx.columns
        .split(",")
        .map((c) => `"${c.trim()}"`)
        .join(", ");
      await client.query(
        `CREATE ${uniqueKeyword}INDEX IF NOT EXISTS "${safeIdxName}" ON "${targetSchema}"."${safeTable}" (${colList})`,
      );
      appliedIndexes.push(safeIdxName);
    }

    const canvasIdxNames = new Set(indexes.map((i) => i.name.toLowerCase()));
    for (const dIdx of existingDbIndexes) {
      if (!canvasIdxNames.has(dIdx.name.toLowerCase())) {
        try {
          await client.query(`DROP INDEX IF EXISTS "${targetSchema}"."${dIdx.name}" CASCADE`);
          droppedIndexes.push(dIdx.name);
        } catch {}
      }
    }

    // 4. Sync foreign keys (ADD missing, DROP removed)
    const fkRes = await client.query<{
      constraint_name: string;
      column_name: string;
      foreign_table: string;
      foreign_column: string;
    }>(
      `SELECT c.conname AS constraint_name,
              att.attname AS column_name,
              cl_ref.relname AS foreign_table,
              att_ref.attname AS foreign_column
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = ANY(c.conkey)
       JOIN pg_class cl_ref ON cl_ref.oid = c.confrelid
       JOIN pg_attribute att_ref ON att_ref.attrelid = c.confrelid AND att_ref.attnum = ANY(c.confkey)
       WHERE c.contype = 'f'
         AND LOWER(cl.relname) = LOWER($1)
         AND n.nspname = $2`,
      [safeTable, targetSchema],
    );
    const existingDbFks = fkRes.rows.map((r) => ({
      name: r.constraint_name,
      column: r.column_name,
      foreignTable: r.foreign_table,
      foreignColumn: r.foreign_column,
    }));

    for (const fk of foreignKeys) {
      if (!fk.column || !fk.foreignTable || !fk.foreignColumn) continue;
      const safeFkName = fk.name || `fk_${safeTable}_${fk.column}`;
      const fSchema = fk.foreignSchema || targetSchema;
      const onDelete = fk.onDelete || "CASCADE";
      try {
        await client.query(
          `ALTER TABLE "${targetSchema}"."${safeTable}"
           ADD CONSTRAINT "${safeFkName}"
           FOREIGN KEY ("${fk.column}")
           REFERENCES "${fSchema}"."${fk.foreignTable}" ("${fk.foreignColumn}")
           ON DELETE ${onDelete}`,
        );
        appliedForeignKeys.push(safeFkName);
      } catch {
        // Continue if constraint already exists
      }
    }

    const canvasFkCols = new Set(foreignKeys.map((f) => f.column.toLowerCase()));
    for (const dFk of existingDbFks) {
      if (!canvasFkCols.has(dFk.column.toLowerCase())) {
        try {
          await client.query(`ALTER TABLE "${targetSchema}"."${safeTable}" DROP CONSTRAINT IF EXISTS "${dFk.name}" CASCADE`);
          droppedForeignKeys.push(dFk.name);
        } catch {}
      }
    }

    return {
      success: true,
      createdTable,
      appliedColumns,
      alteredColumns,
      droppedColumns,
      appliedIndexes,
      droppedIndexes,
      appliedForeignKeys,
      droppedForeignKeys,
      appliedPrerequisiteTables,
    };
  } catch (err) {
    return {
      success: false,
      createdTable: false,
      appliedColumns: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function dropPostgresTable(
  payload: DropDbTablePayload,
): Promise<DropDbTableResult> {
  const safeTable = payload.tableName.trim();
  const { schema = "public" } = payload;
  const targetSchema = schema.trim() || "public";
  const { client } = createPostgresClient(payload.connection);

  try {
    await client.connect();
    await client.query(`DROP TABLE IF EXISTS "${targetSchema}"."${safeTable}" CASCADE`);
    return { success: true, droppedTable: safeTable };
  } catch (err) {
    return {
      success: false,
      droppedTable: safeTable,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function renamePostgresTable(
  payload: RenameDbTablePayload,
): Promise<RenameDbTableResult> {
  const oldName = payload.oldTableName.trim();
  const newName = payload.newTableName.trim();
  const { schema = "public" } = payload;
  const targetSchema = schema.trim() || "public";
  const { client } = createPostgresClient(payload.connection);

  try {
    await client.connect();
    await client.query(
      `ALTER TABLE "${targetSchema}"."${oldName}" RENAME TO "${newName}"`,
    );
    return { success: true, oldTableName: oldName, newTableName: newName };
  } catch (err) {
    return {
      success: false,
      oldTableName: oldName,
      newTableName: newName,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function renamePostgresColumn(
  payload: RenameDbColumnPayload,
): Promise<RenameDbColumnResult> {
  const table = payload.tableName.trim();
  const oldCol = payload.oldColumnName.trim();
  const newCol = payload.newColumnName.trim();
  const { schema = "public" } = payload;
  const targetSchema = schema.trim() || "public";
  const { client } = createPostgresClient(payload.connection);

  try {
    await client.connect();
    await client.query(
      `ALTER TABLE "${targetSchema}"."${table}" RENAME COLUMN "${oldCol}" TO "${newCol}"`,
    );
    return { success: true, tableName: table, oldColumnName: oldCol, newColumnName: newCol };
  } catch (err) {
    return {
      success: false,
      tableName: table,
      oldColumnName: oldCol,
      newColumnName: newCol,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await client.end().catch(() => {});
  }
}
