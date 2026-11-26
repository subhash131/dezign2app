import {
  BackendEdge,
  BackendNode,
  CustomTypeItem,
  Endpoint,
  GlobalStoreAction,
  GlobalStoreDefinition,
  GlobalStoreField,
  StateVariableType,
  UIEventItem,
} from "@workspace/canvas/types";
import { generateCustomTypesModule } from "../../../generators/typesGenerator/customTypesGenerator";
import { generateEntitiesModule } from "../../../generators/typesGenerator/entitiesGenerator";
import { toPascalCase, toPlural, toSingular, toTableName } from "../../../utils";
import { resolveLinkedEndpoint } from "./endpointResolver";

const ENTITY_NODE_TYPES = new Set(["entity", "redis_schema", "redis-cache"]);

const STANDARD_PRIMITIVES = new Set([
  "string",
  "number",
  "boolean",
  "unknown",
  "any",
  "void",
  "null",
  "undefined",
  "never",
  "Date",
  "object",
  "array",
  "unknown[]",
  "any[]",
  "Record<string, unknown>",
  "Record<string, any>",
]);

interface EntityTypeInfo {
  id: string;
  rawName: string;
  tableName: string;
  singularTableName: string;
  canonicalPascal: string;
}

function getEntityRawName(node: BackendNode): string {
  return (node.data?.tableName || node.data?.label || node.data?.tableRef || "Entity").trim();
}

function computeStemOverlapRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 4 || b.length < 4) return 0;
  if (a.startsWith(b) || b.startsWith(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  return 0;
}

function collectEntityTypeRegistry(allNodes: BackendNode[]): {
  entityById: Map<string, EntityTypeInfo>;
  entities: EntityTypeInfo[];
  exportedEntityTypeNames: Set<string>;
  customTypeNames: Set<string>;
  staleTypeAliasToEntityId: Map<string, string>;
} {
  const customTypesRes = generateCustomTypesModule(allNodes);
  const customTypeNames = new Set<string>([
    ...customTypesRes.exportedTypes,
    ...customTypesRes.exportedValues,
  ]);
  const exportedEntityTypeNames = new Set<string>();
  generateEntitiesModule(allNodes, undefined, customTypeNames, exportedEntityTypeNames);

  const entityById = new Map<string, EntityTypeInfo>();
  const entities: EntityTypeInfo[] = [];

  for (const node of allNodes) {
    if (!ENTITY_NODE_TYPES.has(node.type)) continue;
    const rawName = getEntityRawName(node);
    const tableName = toTableName(rawName);
    const info: EntityTypeInfo = {
      id: node.id,
      rawName,
      tableName,
      singularTableName: toSingular(tableName),
      canonicalPascal: toPascalCase(rawName),
    };
    entityById.set(node.id, info);
    entities.push(info);
  }

  for (const node of allNodes) {
    if (node.type !== "database") continue;
    const tables = node.data?.tables || [];
    for (const tbl of tables) {
      const rawName = (tbl.name || tbl.label || tbl.tableRef || "").trim();
      if (!rawName) continue;
      const tableName = toTableName(rawName);
      const id = tbl.id || `db-tbl-${node.id}-${tableName}`;
      const info: EntityTypeInfo = {
        id,
        rawName,
        tableName,
        singularTableName: toSingular(tableName),
        canonicalPascal: toPascalCase(rawName),
      };
      entityById.set(id, info);
      entities.push(info);
    }
  }

  const staleTypeAliasToEntityId = new Map<string, string>();
  for (const node of allNodes) {
    if (node.type !== "types" || !Array.isArray(node.data?.types)) continue;
    for (const item of node.data.types as CustomTypeItem[]) {
      const itemName = item.name?.trim();
      if (!itemName) continue;
      const entityId = item.id?.startsWith("type-entity-")
        ? item.id.slice("type-entity-".length)
        : node.data?.sourceEntityId;
      if (entityId && entityById.has(entityId)) {
        staleTypeAliasToEntityId.set(itemName.toLowerCase(), entityId);
        staleTypeAliasToEntityId.set(toSingular(itemName).toLowerCase(), entityId);
        staleTypeAliasToEntityId.set(toPlural(itemName).toLowerCase(), entityId);
        continue;
      }
      // Preserve non-entity custom types defined on TypesNodes (e.g. Service or LangGraph types)
      if (
        !item.id?.startsWith("type-entity-") &&
        !node.data?.isEntitySchemas &&
        !node.data?.sourceEntityId &&
        node.id !== "types-entity-schemas" &&
        node.data?.label !== "Entity Types"
      ) {
        customTypeNames.add(itemName);
      }
    }
  }

  return {
    entityById,
    entities,
    exportedEntityTypeNames,
    customTypeNames,
    staleTypeAliasToEntityId,
  };
}

function collectActionFieldEntityMap(
  allActionsInApp: UIEventItem[],
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
  endpoints: (Endpoint & { nodeId: string })[],
  entityById: Map<string, EntityTypeInfo>,
): Map<string, EntityTypeInfo> {
  const fieldToEntity = new Map<string, EntityTypeInfo>();
  const dbRefToEntityId = new Map<string, string>();
  for (const node of allNodes) {
    if (node.type === "db_ref" && node.data?.tableRef) {
      dbRefToEntityId.set(node.id, node.data.tableRef);
    }
  }

  for (const action of allActionsInApp) {
    const mutationSteps = (action.actionSteps || []).filter((s) => s.type === "state_mutation");
    if (mutationSteps.length === 0) continue;

    const apiCallEndpointId = (action.actionSteps || []).find(
      (s) => s.type === "api_call" && Boolean(s.endpointId),
    )?.endpointId;
    let linkedEndpoint = apiCallEndpointId
      ? endpoints.find((ep) => ep.id === apiCallEndpointId)
      : undefined;
    if (!linkedEndpoint) {
      for (const page of allNodes) {
        if (page.type !== "webPage") continue;
        const resolved = resolveLinkedEndpoint(page.id, action.id, allNodes, allEdges, endpoints);
        if (resolved?.endpoint) {
          linkedEndpoint = resolved.endpoint as Endpoint & { nodeId: string };
          break;
        }
      }
    }
    if (!linkedEndpoint?.pipelineSteps) continue;

    const entityInfos: EntityTypeInfo[] = [];
    for (const step of linkedEndpoint.pipelineSteps) {
      if (step.type !== "db_operation") continue;
      const directId = step.tableNodeId || (step.dbRefNodeId ? dbRefToEntityId.get(step.dbRefNodeId) : undefined);
      const entInfo = directId ? entityById.get(directId) : undefined;
      if (entInfo) entityInfos.push(entInfo);
    }
    if (entityInfos.length !== 1) continue;

    const targetEntity = entityInfos[0]!;
    for (const mut of mutationSteps) {
      if (mut.stateTargetFieldId) {
        fieldToEntity.set(`id:${mut.stateTargetFieldId}`, targetEntity);
      }
      if (mut.stateKey) {
        fieldToEntity.set(`name:${mut.stateKey.toLowerCase()}`, targetEntity);
      }
    }
  }

  return fieldToEntity;
}

function findBestStemEntityMatch(
  innerBase: string,
  entities: EntityTypeInfo[],
): EntityTypeInfo | undefined {
  const oldTable = toTableName(innerBase);
  const oldSingular = toSingular(oldTable);
  const candidates: Array<{ info: EntityTypeInfo; score: number }> = [];

  for (const ent of entities) {
    const score = Math.max(
      computeStemOverlapRatio(oldTable, ent.tableName),
      computeStemOverlapRatio(oldTable, ent.singularTableName),
      computeStemOverlapRatio(oldSingular, ent.tableName),
      computeStemOverlapRatio(oldSingular, ent.singularTableName),
    );
    if (score >= 0.6) {
      candidates.push({ info: ent, score });
    }
  }

  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0]!;
  // Require unique winner on ties so ambiguous entities are not misassigned
  if (candidates.length > 1 && candidates[1]!.score === top.score) {
    return undefined;
  }
  return top.info;
}

function resolveTypeString(
  rawType: string | undefined,
  customTypeId: string | undefined,
  fieldId: string | undefined,
  fieldName: string | undefined,
  registry: ReturnType<typeof collectEntityTypeRegistry>,
  fieldToEntity: Map<string, EntityTypeInfo>,
): string | undefined {
  if (!rawType) return rawType;
  const trimmed = rawType.trim();
  const isArr = trimmed.endsWith("[]");
  const baseType = isArr ? trimmed.slice(0, -2).trim() : trimmed;
  const suffix = isArr ? "[]" : "";

  if (
    !baseType ||
    STANDARD_PRIMITIVES.has(trimmed) ||
    STANDARD_PRIMITIVES.has(baseType) ||
    /[\s{|&<>()=>]/.test(baseType)
  ) {
    return rawType;
  }

  if (
    registry.exportedEntityTypeNames.has(baseType) ||
    registry.customTypeNames.has(baseType)
  ) {
    return rawType;
  }

  const crudMatch = baseType.match(/^(Create|Update|Upsert)(.+)Data$/);
  const crudPrefix = crudMatch ? crudMatch[1]! : "";
  const crudSuffix = crudMatch ? "Data" : "";
  const innerBase = crudMatch ? crudMatch[2]! : baseType;
  const wrapResolved = (canonicalPascal: string): string =>
    `${crudPrefix}${canonicalPascal}${crudSuffix}${suffix}`;

  // 1. Direct entity link via customTypeId (`type-entity-<entityId>`)
  if (customTypeId?.startsWith("type-entity-")) {
    const linkedEntityId = customTypeId.slice("type-entity-".length);
    const entInfo = registry.entityById.get(linkedEntityId);
    if (entInfo) {
      return wrapResolved(entInfo.canonicalPascal);
    }
    // Entity linked to this field no longer exists; avoid broken @workspace/types import
    if (registry.entities.length > 0) {
      return isArr ? "Record<string, unknown>[]" : "Record<string, unknown>";
    }
  }

  // 2. Un-synced Entity Types item (`type-entity-<entityId>` or `sourceEntityId`)
  const aliasEntityId =
    registry.staleTypeAliasToEntityId.get(innerBase.toLowerCase()) ||
    registry.staleTypeAliasToEntityId.get(toSingular(innerBase).toLowerCase()) ||
    registry.staleTypeAliasToEntityId.get(toPlural(innerBase).toLowerCase());
  if (aliasEntityId) {
    const entInfo = registry.entityById.get(aliasEntityId);
    if (entInfo) {
      return wrapResolved(entInfo.canonicalPascal);
    }
  }

  // 3. Action -> Endpoint -> db_operation trace for this store field
  if (fieldId || fieldName) {
    const tracedEntity =
      (fieldId ? fieldToEntity.get(`id:${fieldId}`) : undefined) ||
      (fieldName ? fieldToEntity.get(`name:${fieldName.toLowerCase()}`) : undefined);
    if (tracedEntity) {
      return wrapResolved(tracedEntity.canonicalPascal);
    }
  }

  // 4. Stem/prefix similarity match against active entity nodes (e.g. Conversations -> Conversati)
  if (registry.entities.length > 0) {
    const stemMatch = findBestStemEntityMatch(innerBase, registry.entities);
    if (stemMatch) {
      return wrapResolved(stemMatch.canonicalPascal);
    }
  }

  return rawType;
}

/**
 * Normalizes stale entity type references inside compiled Zustand store definitions
 * against the active entities & exported types on the canvas so renamed tables
 * (e.g. `conversations` -> `conversati`) never leave broken `@workspace/types` imports.
 */
export function resolveStoresEntityTypeRefs(
  stores: GlobalStoreDefinition[],
  context: {
    allNodes: BackendNode[];
    endpoints?: (Endpoint & { nodeId: string })[];
    allActionsInApp?: UIEventItem[];
    allEdges?: BackendEdge[];
  },
): GlobalStoreDefinition[] {
  if (!stores || stores.length === 0) return stores;
  const {
    allNodes = [],
    endpoints = [],
    allActionsInApp = [],
    allEdges = [],
  } = context;

  const registry = collectEntityTypeRegistry(allNodes);
  if (
    registry.entities.length === 0 &&
    registry.staleTypeAliasToEntityId.size === 0
  ) {
    return stores;
  }

  const fieldToEntity = collectActionFieldEntityMap(
    allActionsInApp,
    allNodes,
    allEdges,
    endpoints,
    registry.entityById,
  );

  return stores.map((store) => {
    let fieldsChanged = false;
    const nextFields: GlobalStoreField[] = (store.fields || []).map((field) => {
      const resolvedType = resolveTypeString(
        field.type,
        field.customTypeId,
        field.id,
        field.name,
        registry,
        fieldToEntity,
      );
      if (resolvedType && resolvedType !== field.type) {
        fieldsChanged = true;
        return {
          ...field,
          type: resolvedType as StateVariableType,
        };
      }
      return field;
    });

    let actionsChanged = false;
    const nextActions: GlobalStoreAction[] = (store.actions || []).map((act) => {
      if (!Array.isArray(act.parameters) || act.parameters.length === 0) {
        return act;
      }
      let paramsChanged = false;
      const targetField = nextFields.find((f) => f.id === act.targetFieldId);
      const nextParams = act.parameters.map((param) => {
        const resolvedType = resolveTypeString(
          param.type,
          targetField?.customTypeId,
          targetField?.id,
          targetField?.name,
          registry,
          fieldToEntity,
        );
        if (resolvedType && resolvedType !== param.type) {
          paramsChanged = true;
          return { ...param, type: resolvedType };
        }
        return param;
      });
      if (paramsChanged) {
        actionsChanged = true;
        return { ...act, parameters: nextParams };
      }
      return act;
    });

    if (!fieldsChanged && !actionsChanged) {
      return store;
    }

    return {
      ...store,
      fields: nextFields,
      actions: nextActions,
    };
  });
}
