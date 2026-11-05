/**
 * local-db-bridge.ts
 *
 * Lightweight local database bridge daemon for dezign2app.
 * Runs on the developer's local machine (http://127.0.0.1:9000).
 *
 * Executes live schema introspection, table sync validation, DDL migrations
 * (CREATE TABLE, ALTER TABLE, DROP TABLE, RENAME TABLE/COLUMN),
 * and operation tests directly via Node.js 'pg' and 'node:sqlite' clients.
 */
import "dotenv/config";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "pg";
import { DatabaseSync } from "node:sqlite";

const PORT = 9000;

const currentDir = typeof __dirname !== "undefined"
  ? __dirname
  : path.resolve(process.cwd(), "scripts");

function findEnvFiles(): string[] {
  const dirs = [
    process.cwd(),
    path.join(process.cwd(), "apps", "web"),
    path.resolve(currentDir),
    path.resolve(currentDir, ".."),
    path.resolve(currentDir, "..", "apps", "web"),
  ];
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

function parseEnvFile(filePath: string): Record<string, string> {
  const res: Record<string, string> = {};
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      res[key] = val;
    }
  } catch {}
  return res;
}

// Initial populate of process.env from found env files
for (const envFile of findEnvFiles()) {
  const vars = parseEnvFile(envFile);
  for (const [k, v] of Object.entries(vars)) {
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}

function resolveEnvKey(key?: string): string | undefined {
  if (!key) return undefined;
  if (process.env[key]) return process.env[key];
  for (const envFile of findEnvFiles()) {
    const vars = parseEnvFile(envFile);
    if (vars[key]) {
      process.env[key] = vars[key];
      return vars[key];
    }
  }
  return undefined;
}

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

export interface PrerequisiteTableDefinition {
  tableName: string;
  schema?: string;
  columns: CanvasColumnDefinition[];
  indexes?: CanvasIndexDefinition[];
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

export interface CheckDbConnectionPayload {
  engine?: string;
  connection?: PostgresConnectionConfig;
  projectId?: string;
}

export interface CheckDbConnectionResult {
  success: boolean;
  engine: string;
  latencyMs?: number;
  connectionUri?: string;
  info?: {
    version?: string;
    rawVersion?: string;
    database?: string;
    status?: string;
    reachable?: boolean;
  };
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

export interface TestDbOperationPayload {
  engine?: string;
  connection?: PostgresConnectionConfig;
  tableName?: string;
  operation?: {
    name?: string;
    query?: string;
    code?: string;
  };
  args?: Record<string, string | number | boolean | null>;
}

export interface TestDbOperationResult {
  success: boolean;
  output?: Record<string, string | number | boolean | null>[] | Record<string, string | number | boolean | null> | null;
  durationMs?: number;
  rawCommand?: string;
  mode?: "live" | "sandbox";
  connection?: string;
  serverActive?: boolean;
  error?: string;
}

function resolveSqliteFilePath(config?: PostgresConnectionConfig): string {
  let file = config?.dbFilePath || "dev.db";
  if (config?.dbFilePathEnv) {
    const envVal = resolveEnvKey(config.dbFilePathEnv);
    if (envVal) file = envVal;
  }
  if (path.isAbsolute(file)) return file;
  return path.resolve(process.cwd(), file);
}

function resolveConnectionString(config?: PostgresConnectionConfig): string {
  if (config?.connectionString) return config.connectionString;
  if (config?.connectionStringPooled) return config.connectionStringPooled;

  if (config?.connectionStringEnv) {
    const val = resolveEnvKey(config.connectionStringEnv);
    if (val) return val;
  }
  if (config?.connectionStringPooledEnv) {
    const val = resolveEnvKey(config.connectionStringPooledEnv);
    if (val) return val;
  }

  // Fallback to DATABASE_URL or DATABASE_URL_POOLED
  const hasExplicitCredentials = Boolean(
    config?.database || config?.user || config?.username || config?.password
  );
  if (!hasExplicitCredentials) {
    const dbUrl = resolveEnvKey("DATABASE_URL") || resolveEnvKey("DATABASE_URL_POOLED");
    if (dbUrl) return dbUrl;
  }

  const host = config?.host || "127.0.0.1";
  const port = config?.port || 5432;
  const db = config?.database || "postgres";
  const user = config?.user || config?.username || "postgres";
  const pass = config?.password || "";
  const authPart = pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}` : encodeURIComponent(user);
  let url = `postgresql://${authPart}@${host}:${port}/${encodeURIComponent(db)}`;
  if (
    config?.sslMode === "require" ||
    config?.provider === "supabase" ||
    config?.provider === "neon"
  ) {
    url += "?sslmode=require";
  }
  return url;
}

function createPostgresClient(config?: PostgresConnectionConfig): { client: Client; connectionString: string } {
  const connectionString = resolveConnectionString(config);
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

function mapToPgType(typeStr: string, isSinglePk = false): string {
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
  if (t === "json" || t === "jsonb" || t === "object") return "JSONB";
  if (t === "uuid") return "UUID";
  if (t === "bytea" || t === "blob") return "BYTEA";
  return "TEXT";
}

function areTypesEquivalent(cType: string, dbType: string): boolean {
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
  if (normC === "DOUBLE PRECISION" && (normDb.includes("DOUBLE") || normDb.includes("FLOAT") || normDb.includes("NUMERIC"))) return true;
  if (normC === "TIMESTAMPTZ" && (normDb.includes("TIMESTAMP") || normDb.includes("DATE"))) return true;
  if (normC === "JSONB" && (normDb === "JSON" || normDb === "JSONB")) return true;
  return false;
}

async function handleCheckConnection(payload: CheckDbConnectionPayload): Promise<CheckDbConnectionResult> {
  const engine = (payload.engine || "postgres").toLowerCase();

  if (engine === "sqlite") {
    const start = Date.now();
    try {
      const dbPath = resolveSqliteFilePath(payload.connection);
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const db = new DatabaseSync(dbPath);
      db.exec("SELECT 1;");
      db.close();
      const latencyMs = Date.now() - start;
      return {
        success: true,
        engine: "sqlite",
        latencyMs,
        connectionUri: `sqlite:${dbPath}`,
        info: {
          version: "SQLite 3",
          status: "Ready",
          reachable: true,
        },
      };
    } catch (err) {
      return {
        success: false,
        engine: "sqlite",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const start = Date.now();
  const { client, connectionString } = createPostgresClient(payload.connection);
  try {
    await client.connect();
    const res = await client.query<{ version: string; current_database: string }>(
      "SELECT version(), current_database()"
    );
    const latencyMs = Date.now() - start;
    const row = res.rows[0];
    const maskedUri = connectionString.replace(/:([^:@]+)@/, ":••••@");
    return {
      success: true,
      engine: "postgres",
      latencyMs,
      connectionUri: maskedUri,
      info: {
        version: row?.version || "PostgreSQL",
        rawVersion: row?.version,
        database: row?.current_database,
        status: "Connected (Local Bridge)",
        reachable: true,
      },
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const maskedUri = connectionString.replace(/:([^:@]+)@/, ":••••@");
    return {
      success: false,
      engine: "postgres",
      latencyMs,
      connectionUri: maskedUri,
      error: err instanceof Error ? err.message : String(err),
      info: {
        reachable: false,
        status: "unreachable",
      },
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function handleCheckTableSync(payload: CheckDbTableSyncPayload): Promise<CheckDbTableSyncResult> {
  const engine = (payload.engine || "postgres").toLowerCase();

  if (engine === "sqlite") {
    try {
      const dbPath = resolveSqliteFilePath(payload.connection);
      const db = new DatabaseSync(dbPath);
      const safeTable = payload.tableName.trim();
      const chk = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND LOWER(name) = LOWER(?)"
      ).get(safeTable) as { name?: string } | undefined;

      if (!chk) {
        db.close();
        return {
          success: true,
          serverReachable: true,
          tableExists: false,
          inSync: false,
          missingColumns: (payload.columns || []).map((c) => ({ name: c.name, type: c.type })),
          alteredColumns: [],
          extraColumns: [],
          existingColumns: [],
          missingIndexes: payload.indexes || [],
          extraIndexes: [],
          existingIndexes: [],
          missingForeignKeys: payload.foreignKeys || [],
          extraForeignKeys: [],
          existingForeignKeys: [],
          missingPrerequisiteTables: [],
        };
      }

      const colRows = db.prepare(`PRAGMA table_info("${safeTable}")`).all() as Array<{ name: string; type: string }>;
      db.close();

      const dbColMap = new Map(colRows.map((r) => [r.name.toLowerCase(), r.type]));
      const missingColumns: Array<{ name: string; type: string }> = [];
      const existingColumns: Array<{ name: string; type: string }> = [];

      for (const c of payload.columns || []) {
        if (!dbColMap.has(c.name.toLowerCase())) {
          missingColumns.push({ name: c.name, type: c.type });
        } else {
          existingColumns.push({ name: c.name, type: dbColMap.get(c.name.toLowerCase()) || c.type });
        }
      }

      const canvasColSet = new Set((payload.columns || []).map((c) => c.name.toLowerCase()));
      const extraColumns = colRows
        .filter((r) => !canvasColSet.has(r.name.toLowerCase()))
        .map((r) => ({ name: r.name, type: r.type }));

      const inSync = missingColumns.length === 0;
      return {
        success: true,
        serverReachable: true,
        tableExists: true,
        inSync,
        missingColumns,
        alteredColumns: [],
        extraColumns,
        existingColumns,
        missingIndexes: [],
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: [],
        extraForeignKeys: [],
        existingForeignKeys: [],
        missingPrerequisiteTables: [],
      };
    } catch (err) {
      return {
        success: false,
        serverReachable: false,
        tableExists: false,
        inSync: false,
        missingColumns: (payload.columns || []).map((c) => ({ name: c.name, type: c.type })),
        alteredColumns: [],
        extraColumns: [],
        existingColumns: [],
        missingIndexes: payload.indexes || [],
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: payload.foreignKeys || [],
        extraForeignKeys: [],
        existingForeignKeys: [],
        missingPrerequisiteTables: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

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
      [safeTable, targetSchema]
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
      [safeTable, targetSchema]
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
      [safeTable, targetSchema]
    );
    const dbIndexes = idxRes.rows.map((r) => ({
      name: r.index_name,
      columns: r.column_names,
      isUnique: Boolean(r.is_unique),
    }));

    const missingIndexes = indexes.filter(
      (cIdx) => !dbIndexes.some((dIdx) => dIdx.columns.toLowerCase() === cIdx.columns.toLowerCase())
    );
    const extraIndexes = dbIndexes.filter(
      (dIdx) => !indexes.some((cIdx) => cIdx.columns.toLowerCase() === dIdx.columns.toLowerCase())
    );
    const existingIndexes = dbIndexes.filter(
      (dIdx) => indexes.some((cIdx) => cIdx.columns.toLowerCase() === dIdx.columns.toLowerCase())
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
      [safeTable, targetSchema]
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
            dFk.foreignTable.toLowerCase() === cFk.foreignTable.toLowerCase()
        )
    );
    const extraForeignKeys = dbFks.filter(
      (dFk) =>
        !foreignKeys.some(
          (cFk) =>
            cFk.column.toLowerCase() === dFk.column.toLowerCase() &&
            cFk.foreignTable.toLowerCase() === dFk.foreignTable.toLowerCase()
        )
    );
    const existingForeignKeys = dbFks.filter(
      (dFk) =>
        foreignKeys.some(
          (cFk) =>
            cFk.column.toLowerCase() === dFk.column.toLowerCase() &&
            cFk.foreignTable.toLowerCase() === dFk.foreignTable.toLowerCase()
        )
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

async function handleApplyTableSync(payload: ApplyDbTableSyncPayload): Promise<ApplyDbTableSyncResult> {
  const engine = (payload.engine || "postgres").toLowerCase();

  if (engine === "sqlite") {
    try {
      const dbPath = resolveSqliteFilePath(payload.connection);
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const db = new DatabaseSync(dbPath);
      const safeTable = payload.tableName.trim();

      const chk = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND LOWER(name) = LOWER(?)"
      ).get(safeTable);

      const appliedColumns: string[] = [];
      const droppedColumns: string[] = [];
      let createdTable = false;

      if (!chk) {
        const colDefs = (payload.columns || []).map((c) => {
          let def = `"${c.name}" ${c.type.toUpperCase() === "INTEGER" || c.type.toUpperCase() === "NUMBER" ? "INTEGER" : "TEXT"}`;
          if (c.isPrimaryKey || c.name.toLowerCase() === "id") def += " PRIMARY KEY";
          if (c.isNotNull) def += " NOT NULL";
          return def;
        });
        if (!colDefs.some((d) => d.includes("PRIMARY KEY"))) {
          colDefs.unshift('"id" TEXT PRIMARY KEY');
        }
        db.exec(`CREATE TABLE IF NOT EXISTS "${safeTable}" (${colDefs.join(", ")});`);
        createdTable = true;
      } else {
        // Table exists, add missing columns
        const colRows = db.prepare(`PRAGMA table_info("${safeTable}")`).all() as Array<{ name: string; type: string }>;
        const existingNames = new Set(colRows.map((r) => r.name.toLowerCase()));
        for (const col of payload.columns || []) {
          if (!existingNames.has(col.name.toLowerCase())) {
            db.exec(`ALTER TABLE "${safeTable}" ADD COLUMN "${col.name}" ${col.type.toUpperCase() === "INTEGER" ? "INTEGER" : "TEXT"};`);
            appliedColumns.push(col.name);
          }
        }
      }
      db.close();

      return {
        success: true,
        createdTable,
        appliedColumns,
        droppedColumns,
      };
    } catch (err) {
      return {
        success: false,
        createdTable: false,
        appliedColumns: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

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
        [pTable, pSchema]
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
      [safeTable, targetSchema]
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
        [safeTable, targetSchema]
      );
      const dbColMap = new Map(dbColRes.rows.map((r) => [r.column_name.toLowerCase(), r.udt_name]));
      const canvasColNames = new Set(columns.map((c) => c.name.toLowerCase()));

      // A. Add missing columns and alter existing types
      for (const col of columns) {
        const dbType = dbColMap.get(col.name.toLowerCase());
        const targetType = mapToPgType(col.type);

        if (dbType === undefined) {
          // Add column with safe default if not null
          let addDef = `ADD COLUMN IF NOT EXISTS "${col.name}" ${targetType}`;
          if (col.isNotNull && !col.isPrimaryKey) {
            const defVal = targetType === "INTEGER" || targetType === "BIGINT" ? "0"
              : targetType === "BOOLEAN" ? "FALSE"
              : targetType === "JSONB" ? "'{}'::jsonb"
              : "''";
            addDef += ` NOT NULL DEFAULT ${defVal}`;
          }
          if (col.isUnique) addDef += " UNIQUE";
          await client.query(`ALTER TABLE "${targetSchema}"."${safeTable}" ${addDef}`);
          appliedColumns.push(col.name);
        } else if (!areTypesEquivalent(col.type, dbType)) {
          // Safely alter type: drop default first to prevent "cannot alter type of a column used in a default expression"
          try {
            await client.query(`ALTER TABLE "${targetSchema}"."${safeTable}" ALTER COLUMN "${col.name}" DROP DEFAULT`);
          } catch {}

          await client.query(
            `ALTER TABLE "${targetSchema}"."${safeTable}" ALTER COLUMN "${col.name}" TYPE ${targetType} USING "${col.name}"::text::${targetType}`
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
        // Do not auto-drop standard audit columns or id if implicit
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
      [safeTable, targetSchema]
    );
    const existingDbIndexes = idxRes.rows.map((r) => ({
      name: r.index_name,
      columns: r.column_names,
      isUnique: Boolean(r.is_unique),
    }));

    // Create missing indexes
    for (const idx of indexes) {
      if (!idx.columns) continue;
      const safeIdxName = idx.name || `idx_${safeTable}_${idx.columns.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      const uniqueKeyword = idx.isUnique ? "UNIQUE " : "";
      const colList = idx.columns
        .split(",")
        .map((c) => `"${c.trim()}"`)
        .join(", ");
      await client.query(
        `CREATE ${uniqueKeyword}INDEX IF NOT EXISTS "${safeIdxName}" ON "${targetSchema}"."${safeTable}" (${colList})`
      );
      appliedIndexes.push(safeIdxName);
    }

    // Drop removed indexes
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
      [safeTable, targetSchema]
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
           ON DELETE ${onDelete}`
        );
        appliedForeignKeys.push(safeFkName);
      } catch {
        // Continue if constraint already exists
      }
    }

    // Drop removed foreign keys
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

async function handleDropTable(payload: DropDbTablePayload): Promise<DropDbTableResult> {
  const engine = (payload.engine || "postgres").toLowerCase();
  const safeTable = payload.tableName.trim();

  if (engine === "sqlite") {
    try {
      const dbPath = resolveSqliteFilePath(payload.connection);
      const db = new DatabaseSync(dbPath);
      db.exec(`DROP TABLE IF EXISTS "${safeTable}";`);
      db.close();
      return { success: true, droppedTable: safeTable };
    } catch (err) {
      return {
        success: false,
        droppedTable: safeTable,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

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

async function handleRenameTable(payload: RenameDbTablePayload): Promise<RenameDbTableResult> {
  const engine = (payload.engine || "postgres").toLowerCase();
  const oldName = payload.oldTableName.trim();
  const newName = payload.newTableName.trim();

  if (engine === "sqlite") {
    try {
      const dbPath = resolveSqliteFilePath(payload.connection);
      const db = new DatabaseSync(dbPath);
      db.exec(`ALTER TABLE "${oldName}" RENAME TO "${newName}";`);
      db.close();
      return { success: true, oldTableName: oldName, newTableName: newName };
    } catch (err) {
      return {
        success: false,
        oldTableName: oldName,
        newTableName: newName,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const { schema = "public" } = payload;
  const targetSchema = schema.trim() || "public";
  const { client } = createPostgresClient(payload.connection);
  try {
    await client.connect();
    await client.query(
      `ALTER TABLE "${targetSchema}"."${oldName}" RENAME TO "${newName}"`
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

async function handleRenameColumn(payload: RenameDbColumnPayload): Promise<RenameDbColumnResult> {
  const engine = (payload.engine || "postgres").toLowerCase();
  const table = payload.tableName.trim();
  const oldCol = payload.oldColumnName.trim();
  const newCol = payload.newColumnName.trim();

  if (engine === "sqlite") {
    try {
      const dbPath = resolveSqliteFilePath(payload.connection);
      const db = new DatabaseSync(dbPath);
      db.exec(`ALTER TABLE "${table}" RENAME COLUMN "${oldCol}" TO "${newCol}";`);
      db.close();
      return { success: true, tableName: table, oldColumnName: oldCol, newColumnName: newCol };
    } catch (err) {
      return {
        success: false,
        tableName: table,
        oldColumnName: oldCol,
        newColumnName: newCol,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const { schema = "public" } = payload;
  const targetSchema = schema.trim() || "public";
  const { client } = createPostgresClient(payload.connection);
  try {
    await client.connect();
    await client.query(
      `ALTER TABLE "${targetSchema}"."${table}" RENAME COLUMN "${oldCol}" TO "${newCol}"`
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

async function handleExecuteOperation(payload: TestDbOperationPayload): Promise<TestDbOperationResult> {
  const engine = (payload.engine || "postgres").toLowerCase();

  if (engine === "sqlite") {
    const start = Date.now();
    try {
      const dbPath = resolveSqliteFilePath(payload.connection);
      const db = new DatabaseSync(dbPath);
      const querySql = payload.operation?.query || payload.operation?.code || `SELECT * FROM "${payload.tableName || "records"}" LIMIT 20`;
      const rows = db.prepare(querySql).all() as Record<string, string | number | boolean | null>[];
      db.close();
      const durationMs = Date.now() - start;
      return {
        success: true,
        output: rows,
        durationMs,
        rawCommand: querySql,
        mode: "live",
        connection: `sqlite:${dbPath}`,
        serverActive: true,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
        mode: "live",
        serverActive: false,
      };
    }
  }

  const { operation, tableName = "records" } = payload;
  const start = Date.now();
  const { client, connectionString } = createPostgresClient(payload.connection);
  const querySql = operation?.query || operation?.code || `SELECT * FROM "${tableName}" LIMIT 20`;
  try {
    await client.connect();
    const res = await client.query(querySql);
    const durationMs = Date.now() - start;
    const maskedUri = connectionString.replace(/:([^:@]+)@/, ":••••@");
    return {
      success: true,
      output: res.rows,
      durationMs,
      rawCommand: querySql,
      mode: "live",
      connection: maskedUri,
      serverActive: true,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const maskedUri = connectionString.replace(/:([^:@]+)@/, ":••••@");
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs,
      rawCommand: querySql,
      mode: "live",
      connection: maskedUri,
      serverActive: false,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

function sendJson(res: http.ServerResponse, statusCode: number, data: object): void {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(payload);
}

function parseConnection(raw: Record<string, string | number | boolean | null | undefined | object>): PostgresConnectionConfig | undefined {
  if (typeof raw.connection === "object" && raw.connection !== null && !Array.isArray(raw.connection)) {
    return raw.connection;
  }
  return undefined;
}

function parseCheckConnectionPayload(raw: Record<string, string | number | boolean | null | undefined | object>): CheckDbConnectionPayload {
  return {
    engine: typeof raw.engine === "string" ? raw.engine : undefined,
    connection: parseConnection(raw),
    projectId: typeof raw.projectId === "string" ? raw.projectId : undefined,
  };
}

function parseCheckTableSyncPayload(raw: Record<string, string | number | boolean | null | undefined | object>): CheckDbTableSyncPayload {
  const tableName = typeof raw.tableName === "string" ? raw.tableName : "";
  const schema = typeof raw.schema === "string" ? raw.schema : undefined;
  const columns = Array.isArray(raw.columns) ? raw.columns : undefined;
  const indexes = Array.isArray(raw.indexes) ? raw.indexes : undefined;
  const foreignKeys = Array.isArray(raw.foreignKeys) ? raw.foreignKeys : undefined;
  return {
    engine: typeof raw.engine === "string" ? raw.engine : undefined,
    connection: parseConnection(raw),
    tableName,
    schema,
    columns,
    indexes,
    foreignKeys,
  };
}

function parseApplyTableSyncPayload(raw: Record<string, string | number | boolean | null | undefined | object>): ApplyDbTableSyncPayload {
  const tableName = typeof raw.tableName === "string" ? raw.tableName : "";
  const schema = typeof raw.schema === "string" ? raw.schema : undefined;
  const columns = Array.isArray(raw.columns) ? raw.columns : undefined;
  const indexes = Array.isArray(raw.indexes) ? raw.indexes : undefined;
  const foreignKeys = Array.isArray(raw.foreignKeys) ? raw.foreignKeys : undefined;
  const prerequisiteTables = Array.isArray(raw.prerequisiteTables) ? raw.prerequisiteTables : undefined;
  return {
    engine: typeof raw.engine === "string" ? raw.engine : undefined,
    connection: parseConnection(raw),
    tableName,
    schema,
    columns,
    indexes,
    foreignKeys,
    prerequisiteTables,
  };
}

function parseDropTablePayload(raw: Record<string, string | number | boolean | null | undefined | object>): DropDbTablePayload {
  return {
    engine: typeof raw.engine === "string" ? raw.engine : undefined,
    connection: parseConnection(raw),
    tableName: typeof raw.tableName === "string" ? raw.tableName : "",
    schema: typeof raw.schema === "string" ? raw.schema : undefined,
  };
}

function parseRenameTablePayload(raw: Record<string, string | number | boolean | null | undefined | object>): RenameDbTablePayload {
  return {
    engine: typeof raw.engine === "string" ? raw.engine : undefined,
    connection: parseConnection(raw),
    oldTableName: typeof raw.oldTableName === "string" ? raw.oldTableName : "",
    newTableName: typeof raw.newTableName === "string" ? raw.newTableName : "",
    schema: typeof raw.schema === "string" ? raw.schema : undefined,
  };
}

function parseRenameColumnPayload(raw: Record<string, string | number | boolean | null | undefined | object>): RenameDbColumnPayload {
  return {
    engine: typeof raw.engine === "string" ? raw.engine : undefined,
    connection: parseConnection(raw),
    tableName: typeof raw.tableName === "string" ? raw.tableName : "",
    oldColumnName: typeof raw.oldColumnName === "string" ? raw.oldColumnName : "",
    newColumnName: typeof raw.newColumnName === "string" ? raw.newColumnName : "",
    schema: typeof raw.schema === "string" ? raw.schema : undefined,
  };
}

function parseTestOperationPayload(raw: Record<string, string | number | boolean | null | undefined | object>): TestDbOperationPayload {
  let operation: { name?: string; query?: string; code?: string } | undefined;
  if (typeof raw.operation === "object" && raw.operation !== null && !Array.isArray(raw.operation)) {
    const rawOp = raw.operation;
    operation = {
      name: "name" in rawOp && typeof rawOp.name === "string" ? rawOp.name : undefined,
      query: "query" in rawOp && typeof rawOp.query === "string" ? rawOp.query : undefined,
      code: "code" in rawOp && typeof rawOp.code === "string" ? rawOp.code : undefined,
    };
  }
  let args: Record<string, string | number | boolean | null> | undefined;
  if (typeof raw.args === "object" && raw.args !== null && !Array.isArray(raw.args)) {
    args = {};
    for (const [k, v] of Object.entries(raw.args)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
        args[k] = v;
      }
    }
  }
  return {
    engine: typeof raw.engine === "string" ? raw.engine : undefined,
    connection: parseConnection(raw),
    tableName: typeof raw.tableName === "string" ? raw.tableName : undefined,
    operation,
    args,
  };
}

export function startLocalBridgeServer(): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    const url = req.url || "/";

    if (req.method === "GET" && (url === "/health" || url === "/")) {
      sendJson(res, 200, {
        status: "ok",
        runner: "dezign2app-local-db-bridge",
        port: PORT,
      });
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const parsed: Record<string, string | number | boolean | null | undefined | object> = body ? JSON.parse(body) : {};

          if (url === "/api/check-connection") {
            const result = await handleCheckConnection(parseCheckConnectionPayload(parsed));
            sendJson(res, 200, result);
            return;
          }

          if (url === "/api/check-table-sync") {
            const result = await handleCheckTableSync(parseCheckTableSyncPayload(parsed));
            sendJson(res, 200, result);
            return;
          }

          if (url === "/api/apply-table-sync") {
            const result = await handleApplyTableSync(parseApplyTableSyncPayload(parsed));
            sendJson(res, 200, result);
            return;
          }

          if (url === "/api/drop-table") {
            const result = await handleDropTable(parseDropTablePayload(parsed));
            sendJson(res, 200, result);
            return;
          }

          if (url === "/api/rename-table") {
            const result = await handleRenameTable(parseRenameTablePayload(parsed));
            sendJson(res, 200, result);
            return;
          }

          if (url === "/api/rename-column") {
            const result = await handleRenameColumn(parseRenameColumnPayload(parsed));
            sendJson(res, 200, result);
            return;
          }

          if (url === "/api/execute-operation") {
            const result = await handleExecuteOperation(parseTestOperationPayload(parsed));
            sendJson(res, 200, result);
            return;
          }

          sendJson(res, 404, { error: `Endpoint not found: ${url}` });
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`🔌 dezign2app local DB bridge listening on http://127.0.0.1:${PORT}`);
    console.log("   Ready to execute database sync and live validation requests from the canvas.");
  });

  return server;
}

if (process.argv[1]?.includes("local-db-bridge")) {
  startLocalBridgeServer();
}

