import React from "react";
import { toast } from "sonner";
import {
  BetterAuthTableMapping,
  BetterAuthTableDefinition,
  BETTER_AUTH_TABLE_DEFINITIONS,
  BETTER_AUTH_TABLE_KEYS,
  BETTER_AUTH_PLUGINS,
  BETTER_AUTH_CATEGORIES,
  BACKEND_NODE_ENTITY,
  BACKEND_NODE_DATABASE,
  BACKEND_EDGE_FOREIGN_KEY,
  BACKEND_EDGE_DATABASE_CONNECTION,
  DEFAULT_DATABASE_NODE_LABEL,
  DEFAULT_DATABASE_ENGINE,
  DEFAULT_DATABASE_ENV_VARS,
  getUniqueNodeLabel,
  isBetterAuthTableRequired,
  resolveBetterAuthTableColumns,
  CanvasEntityColumn,
  DB_COLUMN_TYPES,
} from "@workspace/canvas";
import { BackendNode, BackendNodeData } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSchemaAutoLayout } from "../../../../hooks/useAutoLayout";
import { toTableName, toSingular, toPlural } from "@/lib/compiler/utils";

export function isEntityMatch(
  entity: BackendNode,
  def: BetterAuthTableDefinition,
): boolean {
  if (entity.type !== BACKEND_NODE_ENTITY) return false;
  const raw = (entity.data?.label || entity.data?.tableRef || "").trim();
  if (!raw) return false;

  const rawLower = raw.toLowerCase();
  const defNameLower = def.name.toLowerCase();
  if (rawLower === defNameLower) return true;

  const normRaw = rawLower.replace(/[-_\s]/g, "");
  const normDef = defNameLower.replace(/[-_\s]/g, "");
  if (normRaw === normDef) return true;

  if (toSingular(normRaw) === normDef || toPlural(normRaw) === normDef) return true;

  const cleanRaw = toTableName(raw).replace(/[-_\s]/g, "");
  const cleanDef = toTableName(def.name).replace(/[-_\s]/g, "");
  return cleanRaw === cleanDef;
}

export type EntityIndexDef = { name: string; columns: string; isUnique?: boolean };

export function repairEntityColumns(
  currentCols: CanvasEntityColumn[],
  defCols: BetterAuthTableDefinition["defaultColumns"],
  engine?: string,
): { cols: CanvasEntityColumn[]; changed: boolean } {
  let changed = false;

  // Filter out any timestamps not matching canonical Better Auth definitions:
  // - Non-canonical names (e.g. snake_case "created_at" / "updated_at") are stripped so missingCols adds canonical "createdAt" / "updatedAt"
  // - Timestamps not defined for this table (e.g. updatedAt on organization, member, invitation, passkey) are stripped
  // - Canonical timestamps with isNotNull: true have isNotNull stripped (Better Auth provides JS defaults)
  const expectedCols = resolveBetterAuthTableColumns(defCols, engine);
  const expectedNames = new Set(expectedCols.map((c) => c.name.toLowerCase()));

  const filteredCols = currentCols
    .filter((c) => {
      const n = (c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (n === "createdat" || n === "updatedat") {
        const canonicalName = n === "createdat" ? "createdAt" : "updatedAt";
        const inDef = expectedNames.has(canonicalName.toLowerCase());
        if (!inDef || c.name !== canonicalName) {
          changed = true;
          return false;
        }
      }
      return true;
    })
    .map((c) => {
      const n = (c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if ((n === "createdat" || n === "updatedat") && c.isNotNull === true) {
        changed = true;
        const { isNotNull: _, ...rest } = c;
        return rest as CanvasEntityColumn;
      }
      return c;
    });

  const repaired = filteredCols.map((c) => {
    const defCol = expectedCols.find(
      (dc) => dc.name.toLowerCase() === c.name.toLowerCase(),
    );
    if (!defCol) return c;
    let colChanged = false;
    const patched: CanvasEntityColumn = { ...c };
    if (defCol.isPrimaryKey && !patched.isPrimaryKey) {
      patched.isPrimaryKey = true;
      colChanged = true;
    }
    if (defCol.isNotNull && !patched.isNotNull) {
      patched.isNotNull = true;
      colChanged = true;
    }
    if (!defCol.isNotNull && !defCol.isPrimaryKey && patched.isNotNull) {
      delete patched.isNotNull;
      colChanged = true;
    }
    if (defCol.isUnique && !patched.isUnique) {
      patched.isUnique = true;
      colChanged = true;
    }
    if (defCol.isForeignKey && !patched.isForeignKey) {
      patched.isForeignKey = true;
      patched.references = defCol.references;
      colChanged = true;
    }
    // Type repair: for primary key 'id' and foreign keys, ensure type matches engine (UUID for postgres, TEXT for sqlite)
    if (
      defCol.type &&
      patched.type !== defCol.type &&
      (defCol.isPrimaryKey ||
        defCol.isForeignKey ||
        defCol.name.toLowerCase() === "id" ||
        defCol.name.toLowerCase().endsWith("id") ||
        defCol.type === DB_COLUMN_TYPES.TIMESTAMPTZ ||
        defCol.type === DB_COLUMN_TYPES.UUID)
    ) {
      patched.type = defCol.type;
      colChanged = true;
    }
    if (colChanged) {
      changed = true;
      return patched;
    }
    return c;
  });

  const missingCols = expectedCols.filter(
    (reqCol) => !repaired.some((c) => c.name.toLowerCase() === reqCol.name.toLowerCase()),
  );
  if (missingCols.length > 0) {
    changed = true;
    return { cols: [...repaired, ...missingCols], changed: true };
  }
  return { cols: repaired, changed };
}

export function repairEntityIndexes(
  currentIdxs: EntityIndexDef[],
  defIdxs: EntityIndexDef[] = [],
): { indexes: EntityIndexDef[]; changed: boolean } {
  const missingIdxs = defIdxs.filter(
    (reqIdx) =>
      !currentIdxs.some(
        (idx) =>
          idx.name.toLowerCase() === reqIdx.name.toLowerCase() ||
          idx.columns.replace(/\s+/g, "").toLowerCase() ===
            reqIdx.columns.replace(/\s+/g, "").toLowerCase(),
      ),
  );
  if (missingIdxs.length > 0) {
    return { indexes: [...currentIdxs, ...missingIdxs], changed: true };
  }
  return { indexes: currentIdxs, changed: false };
}

export function checkEntitySchemaDiscrepancies(
  entity: BackendNode | undefined,
  def: BetterAuthTableDefinition,
  engine?: string,
): {
  isMapped: boolean;
  isValid: boolean;
  missingColumns: BetterAuthTableDefinition["defaultColumns"];
  outdatedColumns: BetterAuthTableDefinition["defaultColumns"];
  missingIndexes: EntityIndexDef[];
} {
  let targetEngine = engine;
  if (!targetEngine && entity?.data?.databaseId) {
    try {
      const storeNodes = useBackendCanvasStore.getState().nodes;
      const dbNode = storeNodes.find((n) => n.id === entity.data?.databaseId);
      if (dbNode?.data?.dbEngine) targetEngine = dbNode.data.dbEngine;
    } catch {
      // ignore
    }
  }

  const expectedCols = resolveBetterAuthTableColumns(def.defaultColumns, targetEngine);

  if (!entity || entity.type !== BACKEND_NODE_ENTITY) {
    return {
      isMapped: false,
      isValid: false,
      missingColumns: expectedCols,
      outdatedColumns: [],
      missingIndexes: def.defaultIndexes || [],
    };
  }

  const existingCols: CanvasEntityColumn[] = entity.data?.columns || [];
  const missingColumns = expectedCols.filter(
    (reqCol) => !existingCols.some((c) => c.name.toLowerCase() === reqCol.name.toLowerCase()),
  );

  const outdatedColumns = expectedCols.filter((reqCol) => {
    const existing = existingCols.find(
      (c) => c.name.toLowerCase() === reqCol.name.toLowerCase(),
    );
    if (!existing) return false;
    if (reqCol.isPrimaryKey && !existing.isPrimaryKey) return true;
    if (reqCol.isNotNull && !existing.isNotNull) return true;
    if (!reqCol.isNotNull && !reqCol.isPrimaryKey && existing.isNotNull) return true;
    if (reqCol.isUnique && !existing.isUnique) return true;
    if (
      reqCol.type &&
      existing.type !== reqCol.type &&
      (reqCol.isPrimaryKey ||
        reqCol.isForeignKey ||
        reqCol.name.toLowerCase() === "id" ||
        reqCol.name.toLowerCase().endsWith("id") ||
        reqCol.type === DB_COLUMN_TYPES.TIMESTAMPTZ ||
        reqCol.type === DB_COLUMN_TYPES.UUID)
    ) {
      return true;
    }
    return false;
  });

  const existingIdxs: EntityIndexDef[] = entity.data?.indexes || [];
  const missingIndexes = (def.defaultIndexes || []).filter(
    (reqIdx) =>
      !existingIdxs.some(
        (idx) =>
          idx.name.toLowerCase() === reqIdx.name.toLowerCase() ||
          idx.columns.replace(/\s+/g, "").toLowerCase() ===
            reqIdx.columns.replace(/\s+/g, "").toLowerCase(),
      ),
  );

  const hasRogueTimestamps = existingCols.some((c) => {
    const n = (c.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (n !== "createdat" && n !== "updatedat") return false;
    const canonicalName = n === "createdat" ? "createdAt" : "updatedAt";
    const inDef = expectedCols.some((ec) => ec.name.toLowerCase() === canonicalName.toLowerCase());
    if (!inDef) return true; // Table should not have this timestamp (e.g. updatedAt on organization)
    if (c.name !== canonicalName) return true; // snake_case (e.g. created_at) is not canonical for Better Auth
    if (c.isNotNull === true) return true; // Better Auth timestamps must be nullable (JS-level defaults)
    return false;
  });

  const isValid =
    missingColumns.length === 0 &&
    outdatedColumns.length === 0 &&
    missingIndexes.length === 0 &&
    !hasRogueTimestamps;

  return {
    isMapped: true,
    isValid,
    missingColumns,
    outdatedColumns,
    missingIndexes,
  };
}

interface UseBetterAuthTableSyncParams {
  data: BackendNodeData;
  updateData: (changes: Partial<BackendNodeData>) => void;
  nodeId: string;
  selectedDatabaseId?: string;
  schemaEntities: BackendNode[];
  isOrgEnabled: boolean;
}

export function useBetterAuthTableSync({
  data,
  updateData,
  nodeId,
  selectedDatabaseId,
  schemaEntities,
  isOrgEnabled,
}: UseBetterAuthTableSyncParams) {
  const { handleLayout: runSchemaAutoLayout } = useSchemaAutoLayout();
  const tableMappings: BetterAuthTableMapping = data.tableMappings || {};

  const addNode = useBackendCanvasStore((s) => s.addNode);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);

  const getTargetEngine = (): string => {
    const storeNodes = useBackendCanvasStore.getState().nodes;
    const dbId = selectedDatabaseId || data.databaseId;
    if (dbId) {
      const dbNode = storeNodes.find((n) => n.id === dbId);
      if (dbNode?.data?.dbEngine) return dbNode.data.dbEngine.toLowerCase();
    }
    const anyDbNode = storeNodes.find((n) => n.type === BACKEND_NODE_DATABASE);
    if (anyDbNode?.data?.dbEngine) return anyDbNode.data.dbEngine.toLowerCase();
    return DEFAULT_DATABASE_ENGINE.toLowerCase();
  };

  const syncForeignKeysForTable = (
    def: BetterAuthTableDefinition,
    currentTableId: string,
    currentMappings: BetterAuthTableMapping,
  ) => {
    const currentNodes = useBackendCanvasStore.getState().nodes;

    def.defaultColumns.forEach((col, colIdx) => {
      if (col.isForeignKey && col.references) {
        const targetTableName = col.references.table;
        const targetDef = BETTER_AUTH_TABLE_DEFINITIONS.find(
          (d) => d.name === targetTableName,
        );
        if (targetDef) {
          const targetNodeId =
            currentMappings[targetDef.key] ||
            (targetDef.key === BETTER_AUTH_TABLE_KEYS.USER
              ? data.userEntityId || data.userSchemaId
              : undefined);
          if (targetNodeId && targetNodeId !== currentTableId) {
            const targetNode = currentNodes.find((n) => n.id === targetNodeId);
            const currentTableNode = currentNodes.find((n) => n.id === currentTableId);

            // Skip edge creation if source or target table node does not exist in store
            if (!targetNode || !currentTableNode) return;

            const currentEdges = useBackendCanvasStore.getState().edges;
            const hasEdge = currentEdges.some(
              (e) =>
                (e.source === targetNodeId && e.target === currentTableId) ||
                (e.source === currentTableId && e.target === targetNodeId),
            );
            if (!hasEdge) {
              const sourceCols: CanvasEntityColumn[] =
                targetNode.data?.columns || targetDef.defaultColumns;
              const sourcePkIdx = sourceCols.findIndex((c) => c.isPrimaryKey);
              const sourceColIdx = sourcePkIdx !== -1 ? sourcePkIdx : 0;

              const targetCols: CanvasEntityColumn[] =
                currentTableNode.data?.columns || def.defaultColumns;
              const targetFkIdx = targetCols.findIndex((c) => c.name === col.name);
              const targetColIdx = targetFkIdx !== -1 ? targetFkIdx : colIdx;

              addEdge({
                id: `edge-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                source: targetNodeId,
                target: currentTableId,
                sourceHandle: `source-${sourceColIdx}`,
                targetHandle: `target-${targetColIdx}`,
                type: BACKEND_EDGE_FOREIGN_KEY,
              });
            }
          }
        }
      }
    });
  };

  const createEntityForTable = (def: BetterAuthTableDefinition) => {
    const storeNodes = useBackendCanvasStore.getState().nodes;
    const authNode = storeNodes.find((n) => n.id === nodeId);
    const baseX = (authNode?.position?.x || 100) + 320;
    const baseY = (authNode?.position?.y || 100) + schemaEntities.length * 90;

    // Check if an entity node with matching label already exists on canvas (filtered to selected DB if set)
    const matchingEntity = storeNodes.find(
      (n) =>
        n.type === BACKEND_NODE_ENTITY &&
        (!selectedDatabaseId || n.data?.databaseId === selectedDatabaseId) &&
        isEntityMatch(n, def),
    );

    let targetEntityId: string;

    let dbId = selectedDatabaseId;
    if (matchingEntity) {
      targetEntityId = matchingEntity.id;
      // Inject missing default columns, repair constraints & add indexes if any
      const currentCols: CanvasEntityColumn[] = matchingEntity.data?.columns ?? [];
      const currentIdxs: EntityIndexDef[] = matchingEntity.data?.indexes ?? [];

      const targetEngine = getTargetEngine();
      const colResult = repairEntityColumns(currentCols, def.defaultColumns, targetEngine);
      const idxResult = repairEntityIndexes(currentIdxs, def.defaultIndexes ?? []);

      if (colResult.changed || idxResult.changed) {
        updateNode(matchingEntity.id, {
          data: {
            ...matchingEntity.data,
            columns: colResult.cols,
            indexes: idxResult.indexes,
          },
        });
      }
    } else {
      // Check if a database node exists; if not, create default SQLite DB node
      if (!dbId) {
        const dbNode = storeNodes.find((n) => n.type === BACKEND_NODE_DATABASE);
        dbId = dbNode?.id;

        if (!dbId) {
          dbId = crypto.randomUUID();
          const dbLabel = getUniqueNodeLabel(storeNodes, DEFAULT_DATABASE_NODE_LABEL, "database");
          addNode({
            id: dbId,
            type: BACKEND_NODE_DATABASE,
            position: { x: baseX - 300, y: baseY - 50 },
            data: {
              label: dbLabel,
              dbEngine: DEFAULT_DATABASE_ENGINE,
              dbType: "relational",
              dbCategory: "sql",
              dbConnectionType: "env_var",
              connectionStringEnv: DEFAULT_DATABASE_ENV_VARS.connectionStringEnv,
              dbFilePathEnv: DEFAULT_DATABASE_ENV_VARS.dbFilePathEnv,
              isDefault: true,
            },
          });
        }
      }

      const targetEngine = getTargetEngine();
      const resolvedCols = resolveBetterAuthTableColumns(def.defaultColumns, targetEngine);

      targetEntityId = `entity-${Date.now()}-${def.name}`;
      addNode({
        id: targetEntityId,
        type: BACKEND_NODE_ENTITY,
        position: { x: baseX, y: baseY },
        data: {
          label: def.name,
          description: def.description,
          columns: resolvedCols,
          indexes: def.defaultIndexes ? [...def.defaultIndexes] : [],
          databaseId: dbId,
        },
      });

      if (dbId) {
        addEdge({
          id: `edge-${dbId}-${targetEntityId}`,
          source: dbId,
          target: targetEntityId,
          sourceHandle: "database-source",
          targetHandle: "database-entity-target",
          type: BACKEND_EDGE_DATABASE_CONNECTION,
        });
      }
    }

    const updatedMappings: BetterAuthTableMapping = {
      ...tableMappings,
      [def.key]: targetEntityId,
    };

    const pluginToAdd =
      def.key === BETTER_AUTH_TABLE_KEYS.TWO_FACTOR
        ? BETTER_AUTH_PLUGINS.TWO_FACTOR
        : def.key === BETTER_AUTH_TABLE_KEYS.PASSKEY
        ? BETTER_AUTH_PLUGINS.PASSKEY
        : undefined;

    const currentPlugins = data.plugins || ["bearer", "admin", "organization", "jwt"];
    const nextPlugins =
      pluginToAdd && !currentPlugins.includes(pluginToAdd)
        ? [...currentPlugins, pluginToAdd]
        : currentPlugins;

    updateData({
      tableMappings: updatedMappings,
      plugins: nextPlugins,
      ...(def.key === BETTER_AUTH_TABLE_KEYS.USER
        ? { userEntityId: targetEntityId, userSchemaId: targetEntityId }
        : {}),
      ...(dbId && !data.databaseId ? { databaseId: dbId } : {}),
    });

    syncForeignKeysForTable(def, targetEntityId, updatedMappings);
    runSchemaAutoLayout("LR");
    setTimeout(() => {
      runSchemaAutoLayout("LR");
    }, 50);
    toast.success(`Table "${def.name}" configured with columns and indexes.`);
  };

  const fixEntitySchema = (
    entityId: string,
    def: BetterAuthTableDefinition,
    _missingColumns: BetterAuthTableDefinition["defaultColumns"] = [],
    _missingIndexes: NonNullable<BetterAuthTableDefinition["defaultIndexes"]> = [],
  ) => {
    const entityNode = schemaEntities.find((e) => e.id === entityId);
    if (!entityNode || entityNode.type !== BACKEND_NODE_ENTITY) return;

    const currentCols: CanvasEntityColumn[] = entityNode.data?.columns || [];
    const currentIdxs: EntityIndexDef[] = entityNode.data?.indexes || [];

    const targetEngine = getTargetEngine();
    const colResult = repairEntityColumns(currentCols, def.defaultColumns, targetEngine);
    const idxResult = repairEntityIndexes(currentIdxs, def.defaultIndexes ?? []);

    updateNode(entityId, {
      data: {
        ...entityNode.data,
        columns: colResult.cols,
        indexes: idxResult.indexes,
      },
    });

    syncForeignKeysForTable(def, entityId, tableMappings);
    runSchemaAutoLayout("LR");
    setTimeout(() => {
      runSchemaAutoLayout("LR");
    }, 50);
    toast.success(`Updated ${def.name} table schema with missing columns and indexes.`);
  };

  const autoCreateAllMissingTables = () => {
    const storeNodes = useBackendCanvasStore.getState().nodes;
    const existingEntities = storeNodes.filter(
      (n) =>
        n.type === BACKEND_NODE_ENTITY &&
        (!selectedDatabaseId || n.data?.databaseId === selectedDatabaseId),
    );
    const enabledPlugins: string[] = data.plugins || ["bearer", "admin", "organization", "jwt"];

    const rawUserMapping = data.userEntityId || data.userSchemaId;
    const activeMappings: BetterAuthTableMapping = {};

    BETTER_AUTH_TABLE_DEFINITIONS.forEach((def) => {
      const rawId =
        tableMappings[def.key] ||
        (def.key === BETTER_AUTH_TABLE_KEYS.USER ? rawUserMapping : undefined);
      if (rawId && existingEntities.some((e) => e.id === rawId)) {
        activeMappings[def.key] = rawId;
      }
    });

    const authNode = storeNodes.find((n) => n.id === nodeId);
    const baseX = (authNode?.position?.x || 100) + 340;
    const baseY = (authNode?.position?.y || 100);

    // Check if a database node exists; if not, create default SQLite DB node
    let dbId = selectedDatabaseId;
    if (!dbId) {
      const dbNode = storeNodes.find((n) => n.type === BACKEND_NODE_DATABASE);
      dbId = dbNode?.id;

      if (!dbId) {
        dbId = crypto.randomUUID();
        const dbLabel = getUniqueNodeLabel(storeNodes, DEFAULT_DATABASE_NODE_LABEL, "database");
        addNode({
          id: dbId,
          type: BACKEND_NODE_DATABASE,
          position: { x: baseX - 300, y: baseY - 50 },
          data: {
            label: dbLabel,
            dbEngine: DEFAULT_DATABASE_ENGINE,
            dbType: "relational",
            dbCategory: "sql",
            dbConnectionType: "env_var",
            connectionStringEnv: DEFAULT_DATABASE_ENV_VARS.connectionStringEnv,
            dbFilePathEnv: DEFAULT_DATABASE_ENV_VARS.dbFilePathEnv,
            isDefault: true,
          },
        });
      }
    }

    let syncedCount = 0;
    let createdCount = 0;

    const nextPlugins = Array.from(
      new Set([
        ...enabledPlugins,
        BETTER_AUTH_PLUGINS.PASSKEY,
        BETTER_AUTH_PLUGINS.TWO_FACTOR,
      ]),
    );

    // Only Better Auth tables that are required for this configuration
    const targetDefs = BETTER_AUTH_TABLE_DEFINITIONS.filter((def) =>
      isBetterAuthTableRequired(def, {
        isOrgEnabled,
        teamsEnabled: Boolean(data.organization?.teams),
        enabledPlugins: nextPlugins,
        tableMappings: activeMappings,
        providers: data.providers,
      }),
    );

    targetDefs.forEach((def) => {
      const mappedId = activeMappings[def.key];
      const matchingEntity = mappedId
        ? existingEntities.find((e) => e.id === mappedId)
        : existingEntities.find((e) => isEntityMatch(e, def));

      if (matchingEntity) {
        activeMappings[def.key] = matchingEntity.id;

        const currentCols: CanvasEntityColumn[] = matchingEntity.data?.columns ?? [];
        const currentIdxs: EntityIndexDef[] = matchingEntity.data?.indexes ?? [];

        const targetEngine = getTargetEngine();
        const colResult = repairEntityColumns(currentCols, def.defaultColumns, targetEngine);
        const idxResult = repairEntityIndexes(currentIdxs, def.defaultIndexes ?? []);

        if (colResult.changed || idxResult.changed) {
          updateNode(matchingEntity.id, {
            data: {
              ...matchingEntity.data,
              columns: colResult.cols,
              indexes: idxResult.indexes,
            },
          });
          syncedCount++;
        }
      } else {
        // Create new entity node
        const posY = baseY + (existingEntities.length + createdCount) * 110;
        createdCount++;

        const targetEngine = getTargetEngine();
        const resolvedCols = resolveBetterAuthTableColumns(def.defaultColumns, targetEngine);

        const newEntityId = `entity-${Date.now()}-${def.name}`;
        addNode({
          id: newEntityId,
          type: BACKEND_NODE_ENTITY,
          position: { x: baseX, y: posY },
          data: {
            label: def.name,
            description: def.description,
            columns: resolvedCols,
            indexes: def.defaultIndexes ? [...def.defaultIndexes] : [],
            databaseId: dbId,
          },
        });

        if (dbId) {
          addEdge({
            id: `edge-${dbId}-${newEntityId}`,
            source: dbId,
            target: newEntityId,
            sourceHandle: "database-source",
            targetHandle: "database-entity-target",
            type: BACKEND_EDGE_DATABASE_CONNECTION,
          });
        }

        activeMappings[def.key] = newEntityId;
      }
    });

    updateData({
      tableMappings: activeMappings,
      plugins: nextPlugins,
      userEntityId: activeMappings.userEntityId || data.userEntityId,
      userSchemaId: activeMappings.userEntityId || data.userSchemaId,
      ...(dbId && !data.databaseId ? { databaseId: dbId } : {}),
    });

    BETTER_AUTH_TABLE_DEFINITIONS.forEach((def) => {
      const mappedId = activeMappings[def.key];
      if (mappedId) {
        syncForeignKeysForTable(def, mappedId, activeMappings);
      }
    });

    // Run auto-layout so all tables and database nodes are cleanly positioned and never overlap
    runSchemaAutoLayout("LR");
    setTimeout(() => {
      runSchemaAutoLayout("LR");
    }, 50);

    if (createdCount > 0 || syncedCount > 0) {
      toast.success(
        `Better Auth tables updated: ${createdCount} created, ${syncedCount} synchronized with indexes & columns.`,
      );
    } else {
      toast.info("All Better Auth tables and indexes are already up to date.");
    }
  };

  const syncAllTableRelationships = () => {
    const storeNodes = useBackendCanvasStore.getState().nodes;
    const existingEntities = storeNodes.filter(
      (n) =>
        n.type === BACKEND_NODE_ENTITY &&
        (!selectedDatabaseId || n.data?.databaseId === selectedDatabaseId),
    );
    const rawUserMapping = data.userEntityId || data.userSchemaId;
    const activeMappings: BetterAuthTableMapping = {};

    BETTER_AUTH_TABLE_DEFINITIONS.forEach((def) => {
      const rawId =
        tableMappings[def.key] ||
        (def.key === BETTER_AUTH_TABLE_KEYS.USER ? rawUserMapping : undefined);
      const matching = rawId
        ? existingEntities.find((e) => e.id === rawId)
        : existingEntities.find((e) => isEntityMatch(e, def));
      if (matching) {
        activeMappings[def.key] = matching.id;
      }
    });

    BETTER_AUTH_TABLE_DEFINITIONS.forEach((def) => {
      const mappedId = activeMappings[def.key];
      if (mappedId) {
        syncForeignKeysForTable(def, mappedId, activeMappings);
      }
    });

    runSchemaAutoLayout("LR");
    setTimeout(() => {
      runSchemaAutoLayout("LR");
    }, 50);
    toast.success("Linked Better Auth foreign keys and arranged schema layout.");
  };

  const handleSelectTableMapping = (
    def: BetterAuthTableDefinition,
    nextEntityId?: string,
  ) => {
    const updated = {
      ...tableMappings,
      [def.key]: nextEntityId,
    };
    const pluginToAdd =
      nextEntityId && def.key === BETTER_AUTH_TABLE_KEYS.TWO_FACTOR
        ? BETTER_AUTH_PLUGINS.TWO_FACTOR
        : nextEntityId && def.key === BETTER_AUTH_TABLE_KEYS.PASSKEY
        ? BETTER_AUTH_PLUGINS.PASSKEY
        : undefined;
    const currentPlugins = data.plugins || ["bearer", "admin", "organization", "jwt"];
    const nextPlugins =
      pluginToAdd && !currentPlugins.includes(pluginToAdd)
        ? [...currentPlugins, pluginToAdd]
        : currentPlugins;

    updateData({
      tableMappings: updated,
      plugins: nextPlugins,
      ...(def.key === "userEntityId"
        ? {
            userEntityId: nextEntityId,
            userSchemaId: nextEntityId,
          }
        : {}),
    });
    if (nextEntityId) {
      syncForeignKeysForTable(def, nextEntityId, updated);
    }
  };

  const enabledPlugins: string[] = data.plugins || ["bearer", "admin", "organization", "jwt"];
  const isTeamsEnabled = Boolean(data.organization?.teams);

  const targetDefs = React.useMemo(() => {
    return BETTER_AUTH_TABLE_DEFINITIONS.filter((def) =>
      isBetterAuthTableRequired(def, {
        isOrgEnabled,
        teamsEnabled: isTeamsEnabled,
        enabledPlugins,
        tableMappings,
        providers: data.providers,
      }),
    );
  }, [isOrgEnabled, isTeamsEnabled, enabledPlugins, tableMappings, data.providers]);
  const totalTables = targetDefs.length;

  const mappedCount = targetDefs.filter((def) => {
    const rawId =
      tableMappings[def.key] ||
      (def.key === "userEntityId" ? data.userEntityId || data.userSchemaId : undefined);
    return Boolean(
      (rawId && schemaEntities.some((e) => e.id === rawId)) ||
      schemaEntities.some((e) => isEntityMatch(e, def))
    );
  }).length;

  return {
    tableMappings,
    mappedCount,
    totalTables,
    targetDefs,
    createEntityForTable,
    fixEntitySchema,
    autoCreateAllMissingTables,
    syncForeignKeysForTable,
    syncAllTableRelationships,
    handleSelectTableMapping,
    runSchemaAutoLayout,
  };
}

