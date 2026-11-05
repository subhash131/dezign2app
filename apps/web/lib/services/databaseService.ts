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

/**
 * Execute a database operation against live or sandbox data.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.executeOperation`)
 * 2. In Browser cloud mode -> Next.js Server Action (`testDbOperationAction`)
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

  return testDbOperationAction(payload);
}

/**
 * Check database connection status, reachability, and metadata.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.checkConnection`)
 * 2. In Browser cloud mode -> Next.js Server Action (`checkDbConnectionAction`)
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
        engine: payload.engine || "postgres",
        error: `Desktop IPC error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return checkDbConnectionAction(payload);
}

/**
 * Check whether a table and all its columns exist in the connected database.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.checkTableSync`)
 * 2. In Browser cloud mode -> Next.js Server Action (`checkDbTableSyncAction`)
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

  return checkDbTableSyncAction(payload);
}

/**
 * Apply table creation or add missing columns to the connected live database.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.applyTableSync`)
 * 2. In Browser cloud mode -> Next.js Server Action (`applyDbTableSyncAction`)
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

  return applyDbTableSyncAction(payload);
}

/**
 * Drop a physical table from the connected live database.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.dropTable`)
 * 2. In Browser cloud mode -> Next.js Server Action (`dropDbTableAction`)
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

  return dropDbTableAction(payload);
}

/**
 * Rename a physical table in the connected live database.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.renameTable`)
 * 2. In Browser cloud mode -> Next.js Server Action (`renameDbTableAction`)
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

  return renameDbTableAction(payload);
}

/**
 * Rename a physical column in the connected live database.
 *
 * Automatically routes:
 * 1. In Electron desktop app -> Native IPC pipe (`window.electronAPI.db.renameColumn`)
 * 2. In Browser cloud mode -> Next.js Server Action (`renameDbColumnAction`)
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

  return renameDbColumnAction(payload);
}
