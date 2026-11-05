import { getElectronAPI } from "@/lib/electron";
import {
  testDbOperationAction,
  checkDbConnectionAction,
  checkDbTableSyncAction,
  applyDbTableSyncAction,
  dropDbTableAction,
  renameDbTableAction,
  renameDbColumnAction,
  type TestDbOperationPayload,
  type TestDbOperationResult,
  type CheckDbConnectionPayload,
  type CheckDbConnectionResult,
  type CheckDbTableSyncPayload,
  type CheckDbTableSyncResult,
  type ApplyDbTableSyncPayload,
  type ApplyDbTableSyncResult,
  type DropDbTablePayload,
  type DropDbTableResult,
  type RenameDbTablePayload,
  type RenameDbTableResult,
  type RenameDbColumnPayload,
  type RenameDbColumnResult,
  type CanvasForeignKey,
  type PrerequisiteTableDefinition,
  type AlteredColumnDefinition,
  type JsonValue,
  type JsonObject,
  type JsonArray,
} from "@/app/actions/databaseActions";

export type {
  TestDbOperationPayload,
  TestDbOperationResult,
  CheckDbConnectionPayload,
  CheckDbConnectionResult,
  CheckDbTableSyncPayload,
  CheckDbTableSyncResult,
  ApplyDbTableSyncPayload,
  ApplyDbTableSyncResult,
  DropDbTablePayload,
  DropDbTableResult,
  RenameDbTablePayload,
  RenameDbTableResult,
  RenameDbColumnPayload,
  RenameDbColumnResult,
  CanvasForeignKey,
  PrerequisiteTableDefinition,
  AlteredColumnDefinition,
  JsonValue,
  JsonObject,
  JsonArray,
};

const LOCAL_BRIDGE_URL = "http://127.0.0.1:9000";

function isCheckDbConnectionResult(val: object): val is CheckDbConnectionResult {
  return "success" in val && "engine" in val;
}

function isCheckDbTableSyncResult(val: object): val is CheckDbTableSyncResult {
  return "tableExists" in val && "inSync" in val && "success" in val;
}

function isApplyDbTableSyncResult(val: object): val is ApplyDbTableSyncResult {
  return "createdTable" in val && "appliedColumns" in val && "success" in val;
}

function isTestDbOperationResult(val: object): val is TestDbOperationResult {
  return "success" in val && "mode" in val;
}

function isDropDbTableResult(val: object): val is DropDbTableResult {
  return "success" in val && "droppedTable" in val;
}

function isRenameDbTableResult(val: object): val is RenameDbTableResult {
  return "success" in val && "oldTableName" in val && "newTableName" in val;
}

function isRenameDbColumnResult(val: object): val is RenameDbColumnResult {
  return "success" in val && "oldColumnName" in val && "newColumnName" in val;
}

async function postToLocalBridge<TPayload, TResult extends object>(
  endpoint: string,
  payload: TPayload,
  isResultValid: (val: object) => val is TResult,
  timeoutMs = 20000,
): Promise<TResult | null> {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${LOCAL_BRIDGE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      try {
        const errJson = await response.json();
        if (typeof errJson === "object" && errJson !== null && isResultValid(errJson)) {
          return errJson;
        }
      } catch {}
      return null;
    }
    const data = await response.json();
    if (typeof data === "object" && data !== null && isResultValid(data)) {
      return data;
    }
    return null;
  } catch (err) {
    console.warn(`[LocalBridge ${endpoint}] Request failed or timed out:`, err);
    return null;
  }
}

/**
 * Execute a database operation against live or sandbox data.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.executeOperation`)
 * 2. In Browser with local bridge -> Local machine runner (`http://127.0.0.1:9000/api/execute-operation`)
 * 3. In Browser cloud mode -> Next.js Server Action (`testDbOperationAction`)
 */
export async function testDatabaseOperation(
  payload: TestDbOperationPayload,
): Promise<TestDbOperationResult> {
  const electron = getElectronAPI();
  if (electron?.db?.executeOperation) {
    try {
      return await electron.db.executeOperation(payload);
    } catch (err) {
      return {
        success: false,
        error: `Desktop IPC error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const localResult = await postToLocalBridge(
    "/api/execute-operation",
    payload,
    isTestDbOperationResult,
  );
  if (localResult !== null) {
    return localResult;
  }

  return testDbOperationAction(payload);
}

/**
 * Check database connection status, reachability, and metadata.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.checkConnection`)
 * 2. In Browser with local bridge -> Local machine runner (`http://127.0.0.1:9000/api/check-connection`)
 * 3. In Browser cloud mode -> Next.js Server Action (`checkDbConnectionAction`)
 */
export async function checkDatabaseConnection(
  payload: CheckDbConnectionPayload,
): Promise<CheckDbConnectionResult> {
  const electron = getElectronAPI();
  if (electron?.db?.checkConnection) {
    try {
      return await electron.db.checkConnection(payload);
    } catch (err) {
      return {
        success: false,
        error: `Desktop IPC error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const localResult = await postToLocalBridge(
    "/api/check-connection",
    payload,
    isCheckDbConnectionResult,
  );
  if (localResult !== null) {
    return localResult;
  }

  const cloudResult = await checkDbConnectionAction(payload);
  if (
    !cloudResult.success &&
    cloudResult.error &&
    (cloudResult.error.includes("Cloudflare Workers") ||
      cloudResult.error.includes("Supabase poolers") ||
      cloudResult.error.includes("private TLS certificate") ||
      cloudResult.error.includes("ECONNREFUSED"))
  ) {
    return {
      ...cloudResult,
      error:
        "Database is not directly reachable from cloud. Please use the Dezign2App Desktop app or run 'pnpm db:server' in your terminal.",
    };
  }
  return cloudResult;
}

/**
 * Check whether a table and all its columns exist in the connected database.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.checkTableSync`)
 * 2. In Browser with local bridge -> Local machine runner (`http://127.0.0.1:9000/api/check-table-sync`)
 * 3. In Browser cloud mode -> Next.js Server Action (`checkDbTableSyncAction`)
 */
export async function checkDbTableSync(
  payload: CheckDbTableSyncPayload,
): Promise<CheckDbTableSyncResult> {
  const electron = getElectronAPI();
  if (electron?.db?.checkTableSync) {
    try {
      return await electron.db.checkTableSync(payload);
    } catch (err) {
      return {
        success: false,
        serverReachable: false,
        tableExists: false,
        inSync: false,
        missingColumns: [],
        extraColumns: [],
        existingColumns: [],
        missingIndexes: [],
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: [],
        extraForeignKeys: [],
        existingForeignKeys: [],
        missingPrerequisiteTables: [],
        error: `Desktop IPC error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const localResult = await postToLocalBridge(
    "/api/check-table-sync",
    payload,
    isCheckDbTableSyncResult,
  );
  if (localResult !== null) {
    return localResult;
  }

  const cloudResult = await checkDbTableSyncAction(payload);
  if (
    !cloudResult.success &&
    cloudResult.error &&
    (cloudResult.error.includes("Cloudflare Workers") ||
      cloudResult.error.includes("Supabase poolers") ||
      cloudResult.error.includes("private TLS certificate") ||
      cloudResult.error.includes("ECONNREFUSED"))
  ) {
    return {
      ...cloudResult,
      error:
        "Database is not directly reachable from cloud. Please use the Dezign2App Desktop app or run 'pnpm db:server' in your terminal, then click Validate DB again.",
    };
  }
  return cloudResult;
}

/**
 * Apply table creation or add missing columns to the connected live database.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.applyTableSync`)
 * 2. In Browser with local bridge -> Local machine runner (`http://127.0.0.1:9000/api/apply-table-sync`)
 * 3. In Browser cloud mode -> Next.js Server Action (`applyDbTableSyncAction`)
 */
export async function applyDbTableSync(
  payload: ApplyDbTableSyncPayload,
): Promise<ApplyDbTableSyncResult> {
  const electron = getElectronAPI();
  if (electron?.db?.applyTableSync) {
    try {
      return await electron.db.applyTableSync(payload);
    } catch (err) {
      return {
        success: false,
        createdTable: false,
        appliedColumns: [],
        appliedIndexes: [],
        appliedForeignKeys: [],
        error: `Desktop IPC error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const localResult = await postToLocalBridge(
    "/api/apply-table-sync",
    payload,
    isApplyDbTableSyncResult,
  );
  if (localResult !== null) {
    return localResult;
  }

  const cloudResult = await applyDbTableSyncAction(payload);
  if (
    !cloudResult.success &&
    cloudResult.error &&
    (cloudResult.error.includes("Cloudflare Workers") ||
      cloudResult.error.includes("Supabase poolers") ||
      cloudResult.error.includes("private TLS certificate") ||
      cloudResult.error.includes("ECONNREFUSED"))
  ) {
    return {
      ...cloudResult,
      error:
        "Database is not directly reachable from cloud. Please use the Dezign2App Desktop app or run 'pnpm db:server' in your terminal, then click Sync again.",
    };
  }
  return cloudResult;
}

/**
 * Drop a physical table from the connected live database.
 */
export async function dropDbTable(
  payload: DropDbTablePayload,
): Promise<DropDbTableResult> {
  const electron = getElectronAPI();
  if (electron?.db?.dropTable) {
    try {
      return await electron.db.dropTable(payload);
    } catch (err) {
      return {
        success: false,
        droppedTable: payload.tableName,
        error: `Desktop IPC error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const localResult = await postToLocalBridge(
    "/api/drop-table",
    payload,
    isDropDbTableResult,
  );
  if (localResult !== null) {
    return localResult;
  }

  return dropDbTableAction(payload);
}

/**
 * Rename a physical table in the connected live database.
 */
export async function renameDbTable(
  payload: RenameDbTablePayload,
): Promise<RenameDbTableResult> {
  const electron = getElectronAPI();
  if (electron?.db?.renameTable) {
    try {
      return await electron.db.renameTable(payload);
    } catch (err) {
      return {
        success: false,
        oldTableName: payload.oldTableName,
        newTableName: payload.newTableName,
        error: `Desktop IPC error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const localResult = await postToLocalBridge(
    "/api/rename-table",
    payload,
    isRenameDbTableResult,
  );
  if (localResult !== null) {
    return localResult;
  }

  return renameDbTableAction(payload);
}

/**
 * Rename a physical column in the connected live database.
 */
export async function renameDbColumn(
  payload: RenameDbColumnPayload,
): Promise<RenameDbColumnResult> {
  const electron = getElectronAPI();
  if (electron?.db?.renameColumn) {
    try {
      return await electron.db.renameColumn(payload);
    } catch (err) {
      return {
        success: false,
        tableName: payload.tableName,
        oldColumnName: payload.oldColumnName,
        newColumnName: payload.newColumnName,
        error: `Desktop IPC error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const localResult = await postToLocalBridge(
    "/api/rename-column",
    payload,
    isRenameDbColumnResult,
  );
  if (localResult !== null) {
    return localResult;
  }

  return renameDbColumnAction(payload);
}
