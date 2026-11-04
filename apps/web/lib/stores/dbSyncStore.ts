import { create } from "zustand";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  checkDbTableSync,
  CheckDbTableSyncResult,
  CanvasForeignKey,
} from "@/lib/services/databaseService";
import { BackendNode } from "@/types/canvas";
import { toast } from "sonner";

export interface EntitySyncState {
  status: CheckDbTableSyncResult | null;
  isChecking: boolean;
  lastCheckedAt?: number;
}

export interface DbSyncStore {
  entitySyncStatus: Record<string, EntitySyncState>;
  validatingDatabases: Record<string, boolean>;
  isValidatingAll: boolean;
  lastValidatedAllAt?: number;

  setEntityStatus: (
    entityId: string,
    status: CheckDbTableSyncResult | null,
  ) => void;
  setEntityChecking: (entityId: string, isChecking: boolean) => void;
  clearStatus: (entityId?: string) => void;

  validateEntity: (entityId: string) => Promise<CheckDbTableSyncResult | null>;
  validateDatabase: (databaseId: string) => Promise<{
    total: number;
    inSync: number;
    outOfSync: number;
    errors: number;
  }>;
  validateAll: (providedNodes?: BackendNode[]) => Promise<{
    total: number;
    inSync: number;
    outOfSync: number;
    errors: number;
  }>;
}

export function deriveEntityForeignKeys(node: BackendNode): CanvasForeignKey[] {
  const columns = node.data?.columns || [];
  return columns
    .filter(
      (c) => c.isForeignKey && c.references?.table && c.references?.column,
    )
    .map((c) => ({
      column: c.name,
      foreignTable: c.references!.table,
      foreignColumn: c.references!.column,
      onDelete: "CASCADE",
    }));
}

export function getEntityDbConnectionInfo(
  entityNode: BackendNode,
  allNodes: BackendNode[],
) {
  const databaseId = entityNode.data?.databaseId;
  if (!databaseId) return null;

  const dbNode = allNodes.find((n) => n.id === databaseId);
  if (!dbNode || dbNode.type !== "database") return null;

  const dbData = (dbNode.data || {}) as NonNullable<BackendNode["data"]>;
  const engine = (dbData.dbEngine || "postgres").toLowerCase();
  const isSupportedEngine = engine === "postgres" || engine === "sqlite";
  if (!isSupportedEngine) return null;

  const hasConnectionConfig = Boolean(
    dbData.connectionString ||
      dbData.connectionStringEnv ||
      dbData.connectionStringPooled ||
      dbData.connectionStringPooledEnv ||
      dbData.host ||
      dbData.dbFilePath ||
      dbData.dbFilePathEnv,
  );
  if (!hasConnectionConfig) return null;

  return {
    dbNode,
    engine,
    dbLabel: dbData.label || "Database",
    connection: {
      host: dbData.host,
      port: dbData.port,
      database: dbData.database,
      user: dbData.user || dbData.username,
      password: dbData.password,
      connectionString:
        dbData.connectionString || dbData.connectionStringPooled,
      connectionStringEnv: dbData.connectionStringEnv,
      connectionStringPooled: dbData.connectionStringPooled,
      connectionStringPooledEnv: dbData.connectionStringPooledEnv,
      sslMode: dbData.sslMode,
      provider: dbData.provider,
      dbFilePath: dbData.dbFilePath,
      dbFilePathEnv: dbData.dbFilePathEnv,
    },
    schema: entityNode.data?.schema || dbData.schema || "public",
  };
}

export const useDbSyncStore = create<DbSyncStore>((set, get) => ({
  entitySyncStatus: {},
  validatingDatabases: {},
  isValidatingAll: false,
  lastValidatedAllAt: undefined,

  setEntityStatus: (entityId, status) =>
    set((state) => ({
      entitySyncStatus: {
        ...state.entitySyncStatus,
        [entityId]: {
          status,
          isChecking: false,
          lastCheckedAt: Date.now(),
        },
      },
    })),

  setEntityChecking: (entityId, isChecking) =>
    set((state) => ({
      entitySyncStatus: {
        ...state.entitySyncStatus,
        [entityId]: {
          status: state.entitySyncStatus[entityId]?.status || null,
          isChecking,
          lastCheckedAt: state.entitySyncStatus[entityId]?.lastCheckedAt,
        },
      },
    })),

  clearStatus: (entityId) =>
    set((state) => {
      if (entityId) {
        const next = { ...state.entitySyncStatus };
        delete next[entityId];
        return { entitySyncStatus: next };
      }
      return { entitySyncStatus: {} };
    }),

  validateEntity: async (entityId: string) => {
    const allNodes = useBackendCanvasStore.getState().nodes;
    const entityNode = allNodes.find((n) => n.id === entityId);
    if (!entityNode || entityNode.type !== "entity") return null;

    const dbInfo = getEntityDbConnectionInfo(entityNode, allNodes);
    if (!dbInfo) return null;

    const tableName =
      entityNode.data?.tableName || entityNode.data?.label || "";
    if (!tableName) return null;

    set((state) => ({
      entitySyncStatus: {
        ...state.entitySyncStatus,
        [entityId]: {
          status: state.entitySyncStatus[entityId]?.status || null,
          isChecking: true,
          lastCheckedAt: state.entitySyncStatus[entityId]?.lastCheckedAt,
        },
      },
    }));

    console.log(`[dbSyncStore:validateEntity] Validating table "${tableName}" (${entityId})`, {
      engine: dbInfo.engine,
      dbLabel: dbInfo.dbLabel,
      schema: dbInfo.schema,
      connection: {
        ...dbInfo.connection,
        password: dbInfo.connection.password ? "••••" : undefined,
        connectionString: dbInfo.connection.connectionString
          ? dbInfo.connection.connectionString.replace(/:([^:@]+)@/, ":••••@")
          : undefined,
      },
    });
    try {
      const foreignKeys = deriveEntityForeignKeys(entityNode);
      const result = await checkDbTableSync({
        engine: dbInfo.engine,
        connection: dbInfo.connection,
        tableName,
        schema: dbInfo.schema,
        columns: entityNode.data?.columns || [],
        indexes: entityNode.data?.indexes || [],
        foreignKeys,
      });

      set((state) => ({
        entitySyncStatus: {
          ...state.entitySyncStatus,
          [entityId]: {
            status: result,
            isChecking: false,
            lastCheckedAt: Date.now(),
          },
        },
      }));

      if (!result.success || !result.serverReachable || result.error) {
        console.error(
          `[dbSyncStore:validateEntity] ❌ Table validation failed for "${tableName}":`,
          result.error || "Server unreachable",
          result,
        );
      } else {
        console.log(
          `[dbSyncStore:validateEntity] ✅ Table "${tableName}" validated successfully:`,
          {
            tableExists: result.tableExists,
            inSync: result.inSync,
            missingColumns: result.missingColumns?.length || 0,
          },
        );
      }
      return result;
    } catch (err) {
      const errorResult: CheckDbTableSyncResult = {
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
        error:
          err instanceof Error
            ? err.message
            : "Live database connection check failed",
      };

      set((state) => ({
        entitySyncStatus: {
          ...state.entitySyncStatus,
          [entityId]: {
            status: errorResult,
            isChecking: false,
            lastCheckedAt: Date.now(),
          },
        },
      }));
      return errorResult;
    }
  },

  validateDatabase: async (databaseId: string) => {
    const allNodes = useBackendCanvasStore.getState().nodes;
    const dbNode = allNodes.find((n) => n.id === databaseId);
    const dbLabel = dbNode?.data?.label || "Database";

    const attachedTables = allNodes.filter(
      (n) =>
        n.type === "entity" &&
        n.data?.databaseId === databaseId &&
        n.data?.dbType !== "vector" &&
        n.data?.dbType !== "redis",
    );

    if (attachedTables.length === 0) {
      toast.info(`No tables connected to ${dbLabel}`);
      return { total: 0, inSync: 0, outOfSync: 0, errors: 0 };
    }

    set((state) => ({
      validatingDatabases: {
        ...state.validatingDatabases,
        [databaseId]: true,
      },
    }));

    let inSync = 0;
    let outOfSync = 0;
    let errors = 0;
    let firstError = "";

    console.log(`[dbSyncStore:validateDatabase] 🚀 Starting validation for "${dbLabel}" (${attachedTables.length} tables total)`);
    for (let i = 0; i < attachedTables.length; i++) {
      const table = attachedTables[i];
      if (!table) continue;
      const tableName = table.data?.tableName || table.data?.label || table.id;
      const res = await get().validateEntity(table.id);
      console.log(`[dbSyncStore:validateDatabase] 📊 [${i + 1}/${attachedTables.length}] "${tableName}":`, {
        success: res?.success,
        serverReachable: res?.serverReachable,
        tableExists: res?.tableExists,
        inSync: res?.inSync,
        error: res?.error,
      });
      if (!res || !res.success || !res.serverReachable) {
        errors++;
        if (!firstError && res?.error) firstError = res.error;
      } else if (res.inSync) {
        inSync++;
      } else {
        outOfSync++;
      }
    }
    console.log(`[dbSyncStore:validateDatabase] 🏁 Validation finished for "${dbLabel}":`, {
      total: attachedTables.length,
      inSync,
      outOfSync,
      errors,
      firstError,
    });

    set((state) => {
      const next = { ...state.validatingDatabases };
      delete next[databaseId];
      return { validatingDatabases: next };
    });

    if (errors > 0 && inSync === 0 && outOfSync === 0) {
      toast.error(
        firstError ? `Failed to reach database for ${dbLabel}: ${firstError}` : `Failed to reach database for ${dbLabel}. Check connection settings.`,
      );
    } else if (outOfSync === 0 && errors === 0) {
      toast.success(`All ${inSync} tables in ${dbLabel} are in sync!`);
    } else {
      const summaryParts: string[] = [];
      if (inSync > 0) summaryParts.push(`${inSync} in sync`);
      if (outOfSync > 0) summaryParts.push(`${outOfSync} out of sync`);
      if (errors > 0) summaryParts.push(`${errors} failed`);
      toast.warning(`${dbLabel} validation: ${summaryParts.join(", ")}`);
    }

    return { total: attachedTables.length, inSync, outOfSync, errors };
  },

  validateAll: async (providedNodes?: BackendNode[]) => {
    const allNodes = providedNodes || useBackendCanvasStore.getState().nodes;
    const candidateEntityNodes = allNodes.filter(
      (n) =>
        n.type === "entity" &&
        n.data?.dbType !== "vector" &&
        n.data?.dbType !== "redis" &&
        getEntityDbConnectionInfo(n, allNodes) !== null,
    );

    if (candidateEntityNodes.length === 0) {
      toast.info("No tables connected to an active database found");
      return { total: 0, inSync: 0, outOfSync: 0, errors: 0 };
    }

    set({ isValidatingAll: true });

    let inSync = 0;
    let outOfSync = 0;
    let errors = 0;

    // Validate sequentially to prevent connection exhaustion or rate limits on live DB
    for (const entityNode of candidateEntityNodes) {
      const res = await get().validateEntity(entityNode.id);
      if (!res || !res.success || !res.serverReachable) {
        errors++;
      } else if (res.inSync) {
        inSync++;
      } else {
        outOfSync++;
      }
    }

    set({
      isValidatingAll: false,
      lastValidatedAllAt: Date.now(),
    });

    if (errors > 0 && inSync === 0 && outOfSync === 0) {
      toast.error(
        `Failed to reach database for ${errors} table(s). Check connection details.`,
      );
    } else if (outOfSync === 0 && errors === 0) {
      toast.success(
        `All ${inSync} table${inSync === 1 ? "" : "s"} in sync with live database!`,
      );
    } else {
      const summaryParts: string[] = [];
      if (inSync > 0) summaryParts.push(`${inSync} in sync`);
      if (outOfSync > 0) summaryParts.push(`${outOfSync} out of sync`);
      if (errors > 0) summaryParts.push(`${errors} failed`);
      toast.warning(`Schema check complete: ${summaryParts.join(", ")}`);
    }

    return { total: candidateEntityNodes.length, inSync, outOfSync, errors };
  },
}));
