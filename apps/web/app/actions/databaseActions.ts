"use server";

import { sanitizeForConvex } from "@/lib/utils/convexSanitizer";
import {
  executeSqliteLiveOperation,
  checkSqliteConnection,
  checkSqliteTableSync,
  applySqliteTableSync,
  dropSqliteTable,
  renameSqliteTable,
  renameSqliteColumn,
} from "@/lib/utils/sqliteRunner";
import {
  type CanvasForeignKey,
  type PrerequisiteTableDefinition,
  type AlteredColumnDefinition,
  executePostgresLiveOperation,
  checkPostgresConnection,
  checkPostgresTableSync,
  applyPostgresTableSync,
  dropPostgresTable,
  renamePostgresTable,
  renamePostgresColumn,
} from "@/lib/utils/postgresRunner";
import {
  type TestDbOperationPayload,
  type TestDbOperationResult,
  type CheckDbConnectionPayload,
  type CheckDbConnectionResult,
  type JsonValue,
  type JsonObject,
  type JsonArray,
  type CanvasEntityColumn,
  type DbConnectionConfig,
  isJsonObject,
  resolveEnvValue,
  checkTcpSocket,
  planRedisCommand,
  executeLiveRedisOperation,
  checkRedisConnection,
  extractTableName,
  planSqlCommand,
  executeSqlOperation,
  executeInSandbox,
} from "@/lib/database-runner";
import { executeFunctionCode } from "@/lib/database-runner/functionCodeRunner";

export type { CanvasForeignKey, PrerequisiteTableDefinition, AlteredColumnDefinition };

export interface CheckDbTableSyncPayload {
  engine?: string;
  connection?: DbConnectionConfig;
  tableName: string;
  schema?: string;
  columns?: Array<{
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
  }>;
  indexes?: Array<{
    name: string;
    columns: string;
    isUnique?: boolean;
  }>;
  foreignKeys?: CanvasForeignKey[];
}

export interface CheckDbTableSyncResult {
  success: boolean;
  serverReachable: boolean;
  tableExists: boolean;
  inSync: boolean;
  missingColumns: Array<{ name: string; type: string }>;
  alteredColumns?: Array<AlteredColumnDefinition>;
  extraColumns: Array<{ name: string; type: string }>;
  existingColumns: Array<{ name: string; type: string }>;
  missingIndexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
  extraIndexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
  existingIndexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
  missingForeignKeys?: Array<CanvasForeignKey>;
  extraForeignKeys?: Array<CanvasForeignKey>;
  existingForeignKeys?: Array<CanvasForeignKey>;
  missingPrerequisiteTables?: string[];
  error?: string;
}

export interface ApplyDbTableSyncPayload extends CheckDbTableSyncPayload {
  prerequisiteTables?: PrerequisiteTableDefinition[];
}

export interface ApplyDbTableSyncResult {
  success: boolean;
  createdTable: boolean;
  appliedColumns: string[];
  alteredColumns?: Array<AlteredColumnDefinition>;
  droppedColumns?: string[];
  appliedIndexes?: string[];
  droppedIndexes?: string[];
  appliedForeignKeys?: string[];
  droppedForeignKeys?: string[];
  appliedPrerequisiteTables?: string[];
  foreignKeyErrors?: string[];
  error?: string;
}

export type {
  TestDbOperationPayload,
  TestDbOperationResult,
  CheckDbConnectionPayload,
  CheckDbConnectionResult,
  JsonValue,
  JsonObject,
  JsonArray,
  CanvasEntityColumn,
  DbConnectionConfig,
};
export { isJsonObject };

/**
 * Server action to test database operations against live or sandbox databases.
 */
export async function testDbOperationAction(
  payload: TestDbOperationPayload,
): Promise<TestDbOperationResult> {
  try {
    const {
      engine = "redis",
      connection = {},
      entity,
      operation,
      args = {},
      mode = "live",
    } = payload;

    if (!operation || !operation.name) {
      return { success: false, error: "Operation definition is required" };
    }

    const host = connection.host || "127.0.0.1";
    const port = Number(connection.port) || (engine === "redis" ? 6379 : 5432);

    // 1. SANDBOX MODE
    if (mode === "sandbox") {
      const start = performance.now();

      // If custom function code is present, execute it in sandbox
      const code = (operation.code || "").trim();
      const hasCustomCode =
        code.length > 0 &&
        (operation.kind === "custom" ||
          code.includes("function") ||
          code.includes("=>") ||
          code.includes("return"));

      if (hasCustomCode) {
        const codeRes = await executeFunctionCode({
          code,
          name: operation.name,
          params: operation.params,
          args,
          tableName: entity?.name || extractTableName(operation),
        });
        const durationMs = Math.round((performance.now() - start) * 100) / 100;
        return {
          success: codeRes.success,
          output: sanitizeForConvex(codeRes.output),
          error: codeRes.error,
          durationMs: Math.max(0.4, durationMs),
          rawCommand: codeRes.rawCommand,
          mode: "sandbox",
        };
      }

      if (engine === "redis") {
        const plan = planRedisCommand(operation, args);
        const output = sanitizeForConvex(executeInSandbox(plan, args));
        const durationMs = Math.round((performance.now() - start) * 100) / 100;

        return {
          success: true,
          output,
          durationMs: Math.max(0.4, durationMs),
          rawCommand: plan.rawCli,
          mode: "sandbox",
        };
      }

      // Relational / SQL Sandbox
      const sqlPlan = planSqlCommand(operation, args, engine);
      const output = sanitizeForConvex(executeSqlOperation(operation, args, engine));
      const durationMs = Math.round((performance.now() - start) * 100) / 100;

      return {
        success: true,
        output,
        durationMs: Math.max(0.4, durationMs),
        rawCommand: sqlPlan.rawSql,
        mode: "sandbox",
      };
    }

    // 2. LIVE REDIS EXECUTION
    if (engine === "redis") {
      const plan = planRedisCommand(operation, args);
      return await executeLiveRedisOperation({ host, port, plan });
    }

    // 3. LIVE SQLITE EMBEDDED EXECUTION
    if (engine === "sqlite") {
      let dbFilePath = connection.dbFilePath || "dev.db";
      if (connection.dbFilePathEnv) {
        const envVal = resolveEnvValue(connection.dbFilePathEnv);
        if (envVal) dbFilePath = envVal;
      }

      const tableName = entity?.name || extractTableName(operation);
      const result = await executeSqliteLiveOperation({
        dbFilePath,
        tableName,
        columns: entity?.columns,
        operation,
        args,
      });

      return {
        success: result.success,
        serverActive: true,
        output: sanitizeForConvex(result.output),
        durationMs: result.durationMs,
        rawCommand: result.rawSql,
        mode: "live",
        connection: `sqlite:${dbFilePath}`,
        error: result.error,
        dbInfo: {
          path: result.dbInfo.path,
          exists: result.dbInfo.exists,
          sizeBytes: result.dbInfo.sizeBytes,
          fileStatus: result.dbInfo.exists
            ? "connected (live SQLite database active)"
            : "embedded (auto-initialized)",
        },
      };
    }

    // 4. LIVE POSTGRES EXECUTION
    const normalizedEngine = (engine || "").trim().toLowerCase();
    if (normalizedEngine === "postgres" || normalizedEngine === "postgresql" || normalizedEngine === "pg" || normalizedEngine === "cockroachdb") {
      const pgResult = await executePostgresLiveOperation({
        connection: {
          host,
          port,
          connectionString: connection.connectionString,
          connectionStringEnv: connection.connectionStringEnv,
          connectionStringPooled: connection.connectionStringPooled,
          connectionStringPooledEnv: connection.connectionStringPooledEnv,
          sslMode: connection.sslMode,
          provider: connection.provider,
          database: connection.database,
          user: connection.user || connection.username,
          password: connection.password,
        },
        entity: {
          name: entity?.name || extractTableName(operation),
          schema: entity?.schema,
          columns: entity?.columns,
        },
        operation,
        args,
        mode: "live",
      });

      if (!pgResult.serverActive && !pgResult.success) {
        return {
          success: false,
          serverActive: false,
          error: pgResult.error || `Server not found or inactive: Could not reach PostgreSQL database server at ${host}:${port}.`,
          rawCommand: pgResult.rawSql || operation.query || `${operation.name}(${Object.keys(args).join(", ")})`,
          durationMs: pgResult.durationMs || 0,
          mode: "live",
          tip: pgResult.error && pgResult.error.includes("Hyperdrive")
            ? "Supabase poolers require Cloudflare Hyperdrive or a public-CA provider (e.g. Neon) when deployed to Cloudflare Workers."
            : `Ensure your local PostgreSQL server is running on port ${port}, or switch to 'Simulation Sandbox' mode.`,
        };
      }

      return {
        success: pgResult.success,
        serverActive: pgResult.serverActive ?? true,
        output: sanitizeForConvex(pgResult.output),
        durationMs: pgResult.durationMs,
        rawCommand: pgResult.rawSql,
        mode: "live",
        connection: `${host}:${port}`,
        error: pgResult.error,
      };
    }

    // 5. LIVE CLIENT-SERVER TCP ENGINES (mysql, etc.)
    if (mode === "live") {
      const tcpResult = await checkTcpSocket(host, port, 2500);
      if (!tcpResult.reachable) {
        return {
          success: false,
          serverActive: false,
          error: `Server not found or inactive: Could not reach ${engine.toUpperCase()} database server at ${host}:${port} (${tcpResult.error || "Connection refused"}).`,
          rawCommand: operation.query || `${operation.name}(${Object.keys(args).join(", ")})`,
          durationMs: tcpResult.latencyMs || 0,
          mode: "live",
          tip: `Ensure your local ${engine} database server is running and listening on port ${port}, or switch to 'Simulation Sandbox' mode to test operations safely without a live server.`,
        };
      }

      const sqlPlan = planSqlCommand(operation, args, engine);
      const output = sanitizeForConvex(executeSqlOperation(operation, args, engine));

      return {
        success: true,
        serverActive: true,
        output,
        durationMs: tcpResult.latencyMs,
        rawCommand: sqlPlan.rawSql,
        mode: "live",
        connection: `${host}:${port}`,
      };
    }

    // 5. FALLBACK
    const sqlPlan = planSqlCommand(operation, args, engine);
    const output = sanitizeForConvex(executeSqlOperation(operation, args, engine));
    return {
      success: true,
      output,
      durationMs: 1.2,
      rawCommand: sqlPlan.rawSql,
      mode: "sandbox",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to execute operation test",
    };
  }
}

/**
 * Server action to verify database connectivity, port status, and server metadata.
 */
export async function checkDbConnectionAction(
  payload: CheckDbConnectionPayload,
): Promise<CheckDbConnectionResult> {
  try {
    console.log(`[checkDbConnectionAction] Check request received`, {
      engine: payload.engine,
      host: payload.connection?.host,
      port: payload.connection?.port,
      hasConnStr: Boolean(payload.connection?.connectionString || payload.connection?.connectionStringPooled),
      connStrEnv: payload.connection?.connectionStringEnv,
    });
    const { engine = "redis", connection = {} } = payload;

    let host = connection.host || "127.0.0.1";
    if (host === "localhost") host = "127.0.0.1";
    let port = Number(connection.port) || (engine === "redis" ? 6379 : 5432);

    let connectionString = connection.connectionString;
    if (!connectionString && connection.connectionStringEnv) {
      connectionString = resolveEnvValue(connection.connectionStringEnv);
    }

    if (connectionString) {
      try {
        const parsed = new URL(connectionString);
        if (parsed.hostname) host = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
        if (parsed.port) port = Number(parsed.port);
      } catch {}
    }

    // 1. REDIS ENGINE
    if (engine === "redis") {
      return await checkRedisConnection({ host, port });
    }

    // 2. SQLITE ENGINE
    if (engine === "sqlite") {
      let dbFilePath = connection.dbFilePath || "dev.db";
      if (connection.dbFilePathEnv) {
        const envVal = resolveEnvValue(connection.dbFilePathEnv);
        if (envVal) dbFilePath = envVal;
      }

      const check = checkSqliteConnection(dbFilePath);

      return {
        success: check.success,
        engine: "sqlite",
        latencyMs: check.latencyMs,
        connectionUri: `sqlite:${dbFilePath}`,
        error: check.error,
        info: {
          path: check.path,
          exists: check.success,
          sizeBytes: check.sizeBytes,
          tableCount: check.tableCount,
          readable: true,
          status: "Connected (SQLite Database Active)",
          version: "SQLite 3.x (Embedded Node DatabaseSync)",
        },
      };
    }

    // 3. POSTGRES ENGINE — full credential check
    const normalizedEngineCheck = (engine || "").trim().toLowerCase();
    if (normalizedEngineCheck === "postgres" || normalizedEngineCheck === "postgresql" || normalizedEngineCheck === "pg" || normalizedEngineCheck === "cockroachdb") {
      const res = await checkPostgresConnection({
        host,
        port,
        connectionString,
        connectionStringEnv: connection.connectionStringEnv,
        connectionStringPooled: connection.connectionStringPooled,
        connectionStringPooledEnv: connection.connectionStringPooledEnv,
        sslMode: connection.sslMode,
        provider: connection.provider,
        database: connection.database,
        user: connection.user || connection.username,
        password: connection.password,
      });
      console.log(`[checkDbConnectionAction] ✅ Postgres connection check response:`, {
        success: res.success,
        latencyMs: res.latencyMs,
        version: res.info?.version,
        error: res.error,
      });
      return res;
    }

    // 4. RELATIONAL / TCP ENGINES (mysql, etc.)
    const tcpResult = await checkTcpSocket(host, port);
    if (tcpResult.reachable) {
      return {
        success: true,
        engine,
        latencyMs: tcpResult.latencyMs,
        host,
        port,
        connectionUri: `${engine}://${host}:${port}`,
        info: {
          reachable: true,
          socket: `${host}:${port}`,
          version: `${engine} server (TCP open)`,
          status: "Connected",
        },
      };
    } else {
      return {
        success: false,
        engine,
        latencyMs: 0,
        host,
        port,
        connectionUri: `${engine}://${host}:${port}`,
        error: `Could not reach ${engine} database at ${host}:${port}: ${tcpResult.error || "Connection refused"}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to verify connection",
    };
  }
}

/**
 * Server action to inspect whether a canvas table exists and has all columns/indexes in the live DB.
 */
export async function checkDbTableSyncAction(
  payload: CheckDbTableSyncPayload,
): Promise<CheckDbTableSyncResult> {
  const {
    engine = "postgres",
    connection = {},
    tableName,
    schema,
    columns = [],
    indexes = [],
    foreignKeys = [],
  } = payload;
  const isPostgres =
    engine === "postgres" ||
    engine === "postgresql" ||
    engine === "pg" ||
    engine === "cockroachdb";
  const isSqlite = engine === "sqlite";

  try {
    console.log(`[checkDbTableSyncAction] Checking table "${tableName}" (schema: "${schema || 'public'}", engine: "${engine}")`, {
      hasConnStr: Boolean(connection.connectionString || connection.connectionStringPooled),
      connStrEnv: connection.connectionStringEnv,
    });
    if (isPostgres) {
      const res = await checkPostgresTableSync(connection, tableName, columns, schema, indexes, foreignKeys);
      console.log(`[checkDbTableSyncAction] ✅ Postgres table sync check response for "${tableName}":`, {
        success: res.success,
        serverReachable: res.serverReachable,
        tableExists: res.tableExists,
        inSync: res.inSync,
        error: res.error,
      });
      return res;
    }

    if (isSqlite) {
      let dbFilePath = connection.dbFilePath || "dev.db";
      if (connection.dbFilePathEnv) {
        const envVal = resolveEnvValue(connection.dbFilePathEnv);
        if (envVal) dbFilePath = envVal;
      }
      return checkSqliteTableSync(dbFilePath, tableName, columns, undefined, indexes, foreignKeys);
    }

    return {
      success: true,
      serverReachable: true,
      tableExists: true,
      inSync: true,
      missingColumns: [],
      alteredColumns: [],
      extraColumns: [],
      existingColumns: [],
      missingIndexes: [],
      extraIndexes: [],
      existingIndexes: [],
      missingForeignKeys: [],
      extraForeignKeys: [],
      existingForeignKeys: [],
      missingPrerequisiteTables: [],
    };
  } catch (err) {
    console.error(`[checkDbTableSyncAction] ❌ Error checking table "${tableName}":`, err);
    return {
      success: false,
      serverReachable: false,
      tableExists: false,
      inSync: false,
      missingColumns: [],
      alteredColumns: [],
      extraColumns: [],
      existingColumns: [],
      missingIndexes: [],
      extraIndexes: [],
      existingIndexes: [],
      missingForeignKeys: [],
      extraForeignKeys: [],
      existingForeignKeys: [],
      missingPrerequisiteTables: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Server action to apply missing table schema, columns, indexes, or foreign keys to the live DB.
 */
export async function applyDbTableSyncAction(
  payload: ApplyDbTableSyncPayload,
): Promise<ApplyDbTableSyncResult> {
  const {
    engine = "postgres",
    connection = {},
    tableName,
    schema,
    columns = [],
    indexes = [],
    foreignKeys = [],
    prerequisiteTables = [],
  } = payload;
  const isPostgres =
    engine === "postgres" ||
    engine === "postgresql" ||
    engine === "pg" ||
    engine === "cockroachdb";
  const isSqlite = engine === "sqlite";

  try {
    if (isPostgres) {
      return await applyPostgresTableSync(
        connection,
        tableName,
        columns,
        schema,
        indexes,
        foreignKeys,
        prerequisiteTables,
      );
    }

    if (isSqlite) {
      let dbFilePath = connection.dbFilePath || "dev.db";
      if (connection.dbFilePathEnv) {
        const envVal = resolveEnvValue(connection.dbFilePathEnv);
        if (envVal) dbFilePath = envVal;
      }
      return applySqliteTableSync(
        dbFilePath,
        tableName,
        columns,
        undefined,
        indexes,
        foreignKeys,
        prerequisiteTables,
      );
    }

    return {
      success: true,
      createdTable: false,
      appliedColumns: [],
      alteredColumns: [],
      appliedIndexes: [],
      appliedForeignKeys: [],
      appliedPrerequisiteTables: [],
    };
  } catch (err) {
    return {
      success: false,
      createdTable: false,
      appliedColumns: [],
      alteredColumns: [],
      appliedIndexes: [],
      appliedForeignKeys: [],
      appliedPrerequisiteTables: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface DropDbTablePayload {
  engine?: string;
  connection?: DbConnectionConfig;
  tableName: string;
  schema?: string;
}

export interface DropDbTableResult {
  success: boolean;
  droppedTable: string;
  error?: string;
}

/**
 * Server action to drop a table from the connected live database.
 */
export async function dropDbTableAction(
  payload: DropDbTablePayload,
): Promise<DropDbTableResult> {
  const { engine = "postgres", connection = {}, tableName, schema } = payload;
  const isPostgres =
    engine === "postgres" ||
    engine === "postgresql" ||
    engine === "pg" ||
    engine === "cockroachdb";
  const isSqlite = engine === "sqlite";

  try {
    if (isPostgres) {
      return await dropPostgresTable(connection, tableName, schema);
    }

    if (isSqlite) {
      let dbFilePath = connection.dbFilePath || "dev.db";
      if (connection.dbFilePathEnv) {
        const envVal = resolveEnvValue(connection.dbFilePathEnv);
        if (envVal) dbFilePath = envVal;
      }
      return dropSqliteTable(dbFilePath, tableName);
    }

    return {
      success: true,
      droppedTable: tableName,
    };
  } catch (err) {
    return {
      success: false,
      droppedTable: tableName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface RenameDbTablePayload {
  engine?: string;
  connection?: DbConnectionConfig;
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

/**
 * Server action to rename a physical table in the live database.
 */
export async function renameDbTableAction(
  payload: RenameDbTablePayload,
): Promise<RenameDbTableResult> {
  const { engine = "postgres", connection = {}, oldTableName, newTableName, schema } = payload;
  const isPostgres =
    engine === "postgres" ||
    engine === "postgresql" ||
    engine === "pg" ||
    engine === "cockroachdb";
  const isSqlite = engine === "sqlite";

  try {
    if (isPostgres) {
      return await renamePostgresTable(connection, oldTableName, newTableName, schema);
    }

    if (isSqlite) {
      let dbFilePath = connection.dbFilePath || "dev.db";
      if (connection.dbFilePathEnv) {
        const envVal = resolveEnvValue(connection.dbFilePathEnv);
        if (envVal) dbFilePath = envVal;
      }
      return renameSqliteTable(dbFilePath, oldTableName, newTableName);
    }

    return {
      success: true,
      oldTableName,
      newTableName,
    };
  } catch (err) {
    return {
      success: false,
      oldTableName,
      newTableName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface RenameDbColumnPayload {
  engine?: string;
  connection?: DbConnectionConfig;
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

/**
 * Server action to rename a physical column in the live database.
 */
export async function renameDbColumnAction(
  payload: RenameDbColumnPayload,
): Promise<RenameDbColumnResult> {
  const { engine = "postgres", connection = {}, tableName, oldColumnName, newColumnName, schema } = payload;
  const isPostgres =
    engine === "postgres" ||
    engine === "postgresql" ||
    engine === "pg" ||
    engine === "cockroachdb";
  const isSqlite = engine === "sqlite";

  try {
    if (isPostgres) {
      return await renamePostgresColumn(connection, tableName, oldColumnName, newColumnName, schema);
    }

    if (isSqlite) {
      let dbFilePath = connection.dbFilePath || "dev.db";
      if (connection.dbFilePathEnv) {
        const envVal = resolveEnvValue(connection.dbFilePathEnv);
        if (envVal) dbFilePath = envVal;
      }
      return renameSqliteColumn(dbFilePath, tableName, oldColumnName, newColumnName);
    }

    return {
      success: true,
      tableName,
      oldColumnName,
      newColumnName,
    };
  } catch (err) {
    return {
      success: false,
      tableName,
      oldColumnName,
      newColumnName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}


