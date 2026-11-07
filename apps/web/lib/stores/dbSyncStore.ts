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

  validateEntity: (
    entityId: string,
    signal?: AbortSignal,
  ) => Promise<CheckDbTableSyncResult | null>;
  validateDatabase: (
    databaseId: string,
    options?: { signal?: AbortSignal },
  ) => Promise<{
    total: number;
    inSync: number;
    outOfSync: number;
    errors: number;
    cancelled?: boolean;
  }>;
  validateAll: (
    providedNodes?: BackendNode[],
    options?: { signal?: AbortSignal },
  ) => Promise<{
    total: number;
    inSync: number;
    outOfSync: number;
    errors: number;
    cancelled?: boolean;
  }>;
  cancelDatabaseValidation: (databaseId: string) => void;
  cancelAllValidations: () => void;
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

// Active AbortControllers for ongoing database validations (keyed by databaseId or "all")
const activeControllers = new Map<string, AbortController>();

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
      activeControllers.forEach((controller) => {
        try {
          controller.abort();
        } catch {}
      });
      activeControllers.clear();
      return { entitySyncStatus: {}, validatingDatabases: {}, isValidatingAll: false };
    }),

  cancelDatabaseValidation: (databaseId: string) => {
    const controller = activeControllers.get(databaseId);
    if (controller) {
      try {
        controller.abort();
      } catch {}
      activeControllers.delete(databaseId);
    }
    set((state) => {
      if (!state.validatingDatabases[databaseId]) return state;
      const next = { ...state.validatingDatabases };
      delete next[databaseId];
      return { validatingDatabases: next };
    });
  },

  cancelAllValidations: () => {
    activeControllers.forEach((controller) => {
      try {
        controller.abort();
      } catch {}
    });
    activeControllers.clear();
    set({
      validatingDatabases: {},
      isValidatingAll: false,
    });
  },

  validateEntity: async (entityId: string, signal?: AbortSignal) => {
    if (signal?.aborted) return null;

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
      const checkPromise = checkDbTableSync({
        engine: dbInfo.engine,
        connection: dbInfo.connection,
        tableName,
        schema: dbInfo.schema,
        columns: entityNode.data?.columns || [],
        indexes: entityNode.data?.indexes || [],
        foreignKeys,
      });

      let result: CheckDbTableSyncResult;
      if (signal) {
        const abortPromise = new Promise<never>((_, reject) => {
          if (signal.aborted) {
            reject(new DOMException("Validation aborted", "AbortError"));
          } else {
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Validation aborted", "AbortError")),
              { once: true },
            );
          }
        });
        result = await Promise.race([checkPromise, abortPromise]);
      } else {
        result = await checkPromise;
      }

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
    } catch (err: unknown) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
        set((state) => ({
          entitySyncStatus: {
            ...state.entitySyncStatus,
            [entityId]: {
              status: state.entitySyncStatus[entityId]?.status || null,
              isChecking: false,
              lastCheckedAt: state.entitySyncStatus[entityId]?.lastCheckedAt,
            },
          },
        }));
        throw err;
      }

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

  validateDatabase: async (databaseId: string, options?: { signal?: AbortSignal }) => {
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

    // Cancel existing validation for this database if running
    const existingController = activeControllers.get(databaseId);
    if (existingController) {
      try {
        existingController.abort();
      } catch {}
    }

    const controller = new AbortController();
    activeControllers.set(databaseId, controller);

    // Forward external signal if provided
    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
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
    let wasCancelled = false;

    console.log(`[dbSyncStore:validateDatabase] 🚀 Starting validation for "${dbLabel}" (${attachedTables.length} tables total)`);
    for (let i = 0; i < attachedTables.length; i++) {
      if (controller.signal.aborted) {
        wasCancelled = true;
        break;
      }

      const table = attachedTables[i];
      if (!table) continue;
      const tableName = table.data?.tableName || table.data?.label || table.id;

      try {
        const res = await get().validateEntity(table.id, controller.signal);
        console.log(`[dbSyncStore:validateDatabase] 📊 [${i + 1}/${attachedTables.length}] "${tableName}":`, {
          success: res?.success,
          serverReachable: res?.serverReachable,
          tableExists: res?.tableExists,
          inSync: res?.inSync,
          error: res?.error,
        });

        if (controller.signal.aborted) {
          wasCancelled = true;
          break;
        }

        const hasFailed = !res || !res.success || !res.serverReachable;

        if (hasFailed) {
          errors++;
          if (!firstError && res?.error) firstError = res.error;

          // If the first request fails, or if the database is unreachable, cancel all remaining requests immediately
          if (i === 0 || res?.serverReachable === false) {
            const reason = i === 0 ? "first table check failed" : "database server unreachable";
            console.warn(
              `[dbSyncStore:validateDatabase] ⚠️ Validation aborted: table "${tableName}" failed (${reason}). Cancelling remaining ${attachedTables.length - 1 - i} table(s).`,
            );
            controller.abort();
            wasCancelled = i < attachedTables.length - 1;
            break;
          }
        } else if (res.inSync) {
          inSync++;
        } else {
          outOfSync++;
        }
      } catch (err: unknown) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          wasCancelled = true;
          break;
        }
        errors++;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (!firstError) firstError = errMsg;

        // If the first request throws, cancel all remaining requests immediately
        if (i === 0) {
          console.warn(
            `[dbSyncStore:validateDatabase] ⚠️ Validation aborted: initial table "${tableName}" threw error (${errMsg}). Cancelling remaining ${attachedTables.length - 1 - i} table(s).`,
          );
          controller.abort();
          wasCancelled = i < attachedTables.length - 1;
          break;
        }
      }
    }

    if (activeControllers.get(databaseId) === controller) {
      activeControllers.delete(databaseId);
    }

    set((state) => {
      const next = { ...state.validatingDatabases };
      delete next[databaseId];
      return { validatingDatabases: next };
    });

    console.log(`[dbSyncStore:validateDatabase] 🏁 Validation finished for "${dbLabel}":`, {
      total: attachedTables.length,
      inSync,
      outOfSync,
      errors,
      firstError,
      wasCancelled,
    });

    if (wasCancelled && errors === 0 && inSync === 0 && outOfSync === 0) {
      toast.info(`Validation for ${dbLabel} was cancelled`);
    } else if (errors > 0 && inSync === 0 && outOfSync === 0) {
      const cancelNote = wasCancelled && attachedTables.length > 1 ? " (remaining checks cancelled)" : "";
      toast.error(
        firstError
          ? `Failed to reach database for ${dbLabel}: ${firstError}${cancelNote}`
          : `Failed to reach database for ${dbLabel}. Check connection settings.${cancelNote}`,
      );
    } else if (outOfSync === 0 && errors === 0 && !wasCancelled) {
      toast.success(`All ${inSync} tables in ${dbLabel} are in sync!`);
    } else {
      const summaryParts: string[] = [];
      if (inSync > 0) summaryParts.push(`${inSync} in sync`);
      if (outOfSync > 0) summaryParts.push(`${outOfSync} out of sync`);
      if (errors > 0) summaryParts.push(`${errors} failed`);
      if (wasCancelled) summaryParts.push("remaining cancelled");
      toast.warning(`${dbLabel} validation: ${summaryParts.join(", ")}`);
    }

    return { total: attachedTables.length, inSync, outOfSync, errors, cancelled: wasCancelled };
  },

  validateAll: async (providedNodes?: BackendNode[], options?: { signal?: AbortSignal }) => {
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

    const existingController = activeControllers.get("all");
    if (existingController) {
      try {
        existingController.abort();
      } catch {}
    }

    const controller = new AbortController();
    activeControllers.set("all", controller);

    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    set({ isValidatingAll: true });

    let inSync = 0;
    let outOfSync = 0;
    let errors = 0;
    let wasCancelled = false;

    // Validate sequentially to prevent connection exhaustion or rate limits on live DB
    for (let i = 0; i < candidateEntityNodes.length; i++) {
      if (controller.signal.aborted) {
        wasCancelled = true;
        break;
      }

      const entityNode = candidateEntityNodes[i];
      if (!entityNode) continue;

      try {
        const res = await get().validateEntity(entityNode.id, controller.signal);
        if (controller.signal.aborted) {
          wasCancelled = true;
          break;
        }

        if (!res || !res.success || !res.serverReachable) {
          errors++;
          // If the first request fails, or if server is unreachable, cancel all remaining requests immediately
          if (i === 0 || res?.serverReachable === false) {
            controller.abort();
            wasCancelled = i < candidateEntityNodes.length - 1;
            break;
          }
        } else if (res.inSync) {
          inSync++;
        } else {
          outOfSync++;
        }
      } catch (err: unknown) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          wasCancelled = true;
          break;
        }
        errors++;
        if (i === 0) {
          controller.abort();
          wasCancelled = i < candidateEntityNodes.length - 1;
          break;
        }
      }
    }

    if (activeControllers.get("all") === controller) {
      activeControllers.delete("all");
    }

    set({
      isValidatingAll: false,
      lastValidatedAllAt: Date.now(),
    });

    if (wasCancelled && errors === 0 && inSync === 0 && outOfSync === 0) {
      toast.info("Validation was cancelled");
    } else if (errors > 0 && inSync === 0 && outOfSync === 0) {
      const cancelNote = wasCancelled && candidateEntityNodes.length > 1 ? " (remaining checks cancelled)" : "";
      toast.error(
        `Failed to reach database for ${errors} table(s). Check connection details.${cancelNote}`,
      );
    } else if (outOfSync === 0 && errors === 0 && !wasCancelled) {
      toast.success(
        `All ${inSync} table${inSync === 1 ? "" : "s"} in sync with live database!`,
      );
    } else {
      const summaryParts: string[] = [];
      if (inSync > 0) summaryParts.push(`${inSync} in sync`);
      if (outOfSync > 0) summaryParts.push(`${outOfSync} out of sync`);
      if (errors > 0) summaryParts.push(`${errors} failed`);
      if (wasCancelled) summaryParts.push("remaining cancelled");
      toast.warning(`Schema check complete: ${summaryParts.join(", ")}`);
    }

    return { total: candidateEntityNodes.length, inSync, outOfSync, errors, cancelled: wasCancelled };
  },
}));
