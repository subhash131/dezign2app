import {
  BackendNode,
  BackendEdge,
  CanvasEntityColumn,
  CustomTypeItem,
  CustomTypeField,
} from "@/types/canvas";

/**
 * Converts a snake_case, kebab-case, or space-separated name to PascalCase.
 * e.g. "user_profiles" -> "UserProfiles", "order-items" -> "OrderItems"
 */
export function toPascalCase(str: string): string {
  if (!str) return "Entity";
  return str
    .replace(/[-_\s]+(.)?/g, (_, c: string | undefined) =>
      c ? c.toUpperCase() : "",
    )
    .replace(/^(.)/, (c) => c.toUpperCase());
}

/**
 * Maps a database column type string to the closest TypeScript primitive/type.
 */
export function mapColumnTypeToTS(colType: string): string {
  const t = (colType || "").toLowerCase().trim();

  // String-like
  if (
    t.startsWith("varchar") ||
    t === "text" ||
    t === "char" ||
    t === "string" ||
    t === "uuid" ||
    t === "bpchar" ||
    t === "citext" ||
    t === "tsvector" ||
    t === "bytea"
  ) {
    return "string";
  }

  // Numeric
  if (
    t === "int" ||
    t === "integer" ||
    t === "int2" ||
    t === "int4" ||
    t === "int8" ||
    t === "bigint" ||
    t === "smallint" ||
    t === "serial" ||
    t === "bigserial" ||
    t === "float" ||
    t === "float4" ||
    t === "float8" ||
    t === "double precision" ||
    t === "decimal" ||
    t === "numeric" ||
    t === "real" ||
    t === "number"
  ) {
    return "number";
  }

  // Boolean
  if (t === "bool" || t === "boolean") {
    return "boolean";
  }

  // Binary/Blob
  if (t === "blob") {
    return "Uint8Array | string";
  }

  // JSON
  if (t === "json" || t === "jsonb") {
    return "Record<string, unknown>";
  }

  // Date / time
  if (
    t === "timestamp" ||
    t === "timestamptz" ||
    t === "date" ||
    t === "datetime" ||
    t === "time" ||
    t === "timetz" ||
    t === "interval"
  ) {
    return "Date";
  }

  // Enum hint — caller handles enumValues directly
  if (t === "enum") {
    return "string";
  }

  return "string";
}

/**
 * Maps Entity columns to CustomTypeField items for TypesNode.
 * Reuses existing field IDs if column names match to maintain stability.
 */
export function mapColumnsToTypeFields(
  columns: CanvasEntityColumn[],
  existingFields: CustomTypeField[] = [],
  tableName: string = "Entity",
  typeIdPrefix: string = "f",
): CustomTypeField[] {
  return columns.map((col, index) => {
    const existing = existingFields.find((f) => f.name === col.name);
    const id = existing?.id || `${typeIdPrefix}-${index}-${col.name}`;

    const fieldType =
      col.enumValues && col.enumValues.length > 0
        ? col.enumValues.map((v) => JSON.stringify(v)).join(" | ")
        : mapColumnTypeToTS(col.type);

    const required = Boolean(
      col.isNotNull ||
      col.required ||
      col.isPrimaryKey ||
      col.isPrimary ||
      col.primaryKey,
    );

    return {
      id,
      name: col.name,
      type: fieldType,
      required,
      isArray: false,
      description: col.description || `Column from ${tableName}`,
      enumValues: col.enumValues ? [...col.enumValues] : undefined,
    };
  });
}

/**
 * Determines whether a TypesNode was derived from a specific EntityNode.
 */
export function isNodeDerivedFromEntity(
  node: BackendNode,
  entityId: string,
  edges: BackendEdge[] = [],
): boolean {
  if (node.type !== "types") return false;

  // Explicit sourceEntityId in data
  if (node.data.sourceEntityId === entityId) return true;

  // Contains type with entity-derived ID
  if (node.data.types?.some((t) => t.id === `type-entity-${entityId}`)) {
    return true;
  }

  // Direct edge from entity
  const hasEdge = edges.some(
    (e) =>
      e.source === entityId &&
      e.target === node.id &&
      (e.type === "type-reference" ||
        e.data?.label === "generates" ||
        e.data?.isTypeReference),
  );
  if (hasEdge) return true;

  return false;
}

/**
 * Compares an EntityNode with a derived TypesNode to check if they are in sync.
 * Returns true if the TypesNode has an interface matching the entity name and all column definitions.
 */
export function isEntitySyncedWithTypes(
  entityNode: BackendNode,
  typesNode: BackendNode,
): boolean {
  if (entityNode.type !== "entity" || typesNode.type !== "types") return true;

  const tableName =
    entityNode.data.tableName || entityNode.data.label || "Entity";
  const columns = entityNode.data.columns ?? [];
  const pascalName = toPascalCase(tableName);
  const targetTypeId = `type-entity-${entityNode.id}`;

  const currentTypes = typesNode.data.types ?? [];
  const typeItem =
    currentTypes.find((t) => t.id === targetTypeId) ||
    currentTypes.find(
      (t) =>
        t.id.startsWith("type-entity-") ||
        t.name.toLowerCase() === pascalName.toLowerCase(),
    ) ||
    currentTypes[0];

  // If there's no type definition in the TypesNode yet, it's out of sync
  if (!typeItem) return false;

  // If the interface name doesn't match the current entity table name, it's out of sync
  if (typeItem.name !== pascalName) return false;

  const fields = typeItem.fields ?? [];
  // If column count differs, it's out of sync
  if (columns.length !== fields.length) return false;

  // Check each column against the type fields
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    if (!col) continue;

    const expectedFieldType =
      col.enumValues && col.enumValues.length > 0
        ? col.enumValues.map((v) => JSON.stringify(v)).join(" | ")
        : mapColumnTypeToTS(col.type);

    const expectedRequired = Boolean(
      col.isNotNull ||
      col.required ||
      col.isPrimaryKey ||
      col.isPrimary ||
      col.primaryKey,
    );

    const matchingField = fields.find((f) => f.name === col.name);
    if (!matchingField) return false;
    if (matchingField.type !== expectedFieldType) return false;
    if (Boolean(matchingField.required) !== expectedRequired) return false;
  }

  return true;
}

/**
 * Returns any derived TypesNodes that are currently out of sync with this EntityNode.
 */
export function getOutOfSyncDerivedTypesNodes(
  entityNode: BackendNode,
  derivedTypesNodes: BackendNode[],
): BackendNode[] {
  return derivedTypesNodes.filter(
    (typesNode) => !isEntitySyncedWithTypes(entityNode, typesNode),
  );
}

/**
 * Finds all downstream nodes that consume or extend the given TypesNodes.
 */
export function findDownstreamAffectedNodes(
  allNodes: BackendNode[],
  edges: BackendEdge[],
  typesNodeIds: string[],
): BackendNode[] {
  const typesIdSet = new Set(typesNodeIds);
  const affectedIds = new Set<string>();

  // Outgoing edges from types nodes to consumers (services, endpoints, webApps, etc.)
  for (const edge of edges) {
    if (typesIdSet.has(edge.source) && !typesIdSet.has(edge.target)) {
      affectedIds.add(edge.target);
    }
  }

  // Also check if any TypesNodes extend a type from these types nodes
  for (const node of allNodes) {
    if (
      node.type === "types" &&
      !typesIdSet.has(node.id) &&
      node.data.isExtended &&
      node.data.extendedFromNodeId &&
      typesIdSet.has(node.data.extendedFromNodeId)
    ) {
      affectedIds.add(node.id);
      // And its downstream targets
      for (const edge of edges) {
        if (edge.source === node.id && !typesIdSet.has(edge.target)) {
          affectedIds.add(edge.target);
        }
      }
    }
  }

  return allNodes.filter((n) => affectedIds.has(n.id));
}

export interface EntityDerivedSyncResult {
  nextNodes: BackendNode[];
  updatedTypesNodes: BackendNode[];
  affectedDownstreamNodes: BackendNode[];
}

/**
 * Automatically synchronizes derived TypesNodes and extended types when an EntityNode is updated.
 * Also populates entitySyncWarning metadata listing affected downstream components.
 */
export function syncEntityDerivedTypes(
  currentNodes: BackendNode[],
  entityId: string,
  updatedEntity: BackendNode,
  edges: BackendEdge[],
): EntityDerivedSyncResult {
  const tableName =
    updatedEntity.data.tableName || updatedEntity.data.label || "Entity";
  const columns = updatedEntity.data.columns ?? [];
  const pascalName = toPascalCase(tableName);

  // Identify all TypesNodes derived from this entity
  const derivedTypesNodes = currentNodes.filter((n) =>
    isNodeDerivedFromEntity(n, entityId, edges),
  );

  if (derivedTypesNodes.length === 0) {
    return {
      nextNodes: currentNodes,
      updatedTypesNodes: [],
      affectedDownstreamNodes: [],
    };
  }

  const derivedIds = new Set(derivedTypesNodes.map((n) => n.id));
  const downstreamNodes = findDownstreamAffectedNodes(
    currentNodes,
    edges,
    Array.from(derivedIds),
  );

  const affectedSummary = {
    entityId,
    entityName: tableName,
    updatedAt: Date.now(),
    affectedNodes: downstreamNodes.map((d) => ({
      id: d.id,
      name: d.data.label || d.id,
      type: d.type,
    })),
  };

  const updatedTypesNodes: BackendNode[] = [];

  // Update derived TypesNodes
  let nextNodes = currentNodes.map((node) => {
    if (!derivedIds.has(node.id)) return node;

    const currentTypes = node.data.types ?? [];
    const targetTypeId = `type-entity-${entityId}`;

    // Find the type item derived from this entity
    const existingType =
      currentTypes.find((t) => t.id === targetTypeId) ||
      currentTypes.find(
        (t) =>
          t.name.toLowerCase() === pascalName.toLowerCase() ||
          t.description?.includes(entityId),
      ) ||
      currentTypes[0];

    const existingFields = existingType?.fields ?? [];
    const newFields = mapColumnsToTypeFields(
      columns,
      existingFields,
      tableName,
      `f-${targetTypeId}`,
    );

    const updatedTypeItem: CustomTypeItem = {
      ...(existingType || {}),
      id: existingType?.id || targetTypeId,
      name: pascalName,
      kind: "interface",
      description: `Auto-generated TypeScript interface from entity: ${tableName}`,
      fields: newFields,
    };

    const nextTypes = currentTypes.some((t) => t.id === updatedTypeItem.id)
      ? currentTypes.map((t) => (t.id === updatedTypeItem.id ? updatedTypeItem : t))
      : [...currentTypes, updatedTypeItem];

    // Update node label if it was default/auto-generated
    const currentLabel = node.data.label || "";
    const shouldUpdateLabel =
      !currentLabel ||
      currentLabel.endsWith(" Types") ||
      currentLabel === "Types";
    const nextLabel = shouldUpdateLabel ? `${pascalName} Types` : currentLabel;

    const updatedNode: BackendNode = {
      ...node,
      data: {
        ...node.data,
        label: nextLabel,
        sourceEntityId: entityId,
        sourceEntityName: tableName,
        entityUpdatedAt: Date.now(),
        entitySyncWarning: affectedSummary,
        types: nextTypes,
      },
    };

    updatedTypesNodes.push(updatedNode);
    return updatedNode;
  });

  // Also update any extended types that extend the derived base type
  const baseTypeIds = new Set(
    updatedTypesNodes.flatMap((n) => (n.data.types ?? []).map((t) => t.id)),
  );

  nextNodes = nextNodes.map((node) => {
    if (node.type !== "types" || !node.data.isExtended) return node;

    let extendedChanged = false;
    const currentTypes = node.data.types ?? [];

    const nextTypes = currentTypes.map((extType) => {
      if (
        extType.extendedFromTypeId &&
        baseTypeIds.has(extType.extendedFromTypeId)
      ) {
        const baseNode = updatedTypesNodes.find((bn) =>
          bn.data.types?.some((bt) => bt.id === extType.extendedFromTypeId),
        );
        const baseType = baseNode?.data.types?.find(
          (bt) => bt.id === extType.extendedFromTypeId,
        );

        if (!baseType) return extType;

        extendedChanged = true;
        // Keep custom user-added fields
        const customFields = (extType.fields ?? []).filter(
          (f) => !f.isInherited,
        );
        // Regenerate inherited fields from base type
        const newInheritedFields = (baseType.fields ?? []).map((bf) => ({
          ...bf,
          id: `f-${extType.id}-${bf.name}`,
          description: bf.description || `Inherited from ${baseType.name}`,
          isInherited: true,
        }));

        return {
          ...extType,
          extendedFrom: baseType.name,
          fields: [...newInheritedFields, ...customFields],
        };
      }
      return extType;
    });

    if (extendedChanged) {
      const updatedExtNode: BackendNode = {
        ...node,
        data: {
          ...node.data,
          entitySyncWarning: affectedSummary,
          types: nextTypes,
        },
      };
      updatedTypesNodes.push(updatedExtNode);
      return updatedExtNode;
    }
    return node;
  });

  return {
    nextNodes,
    updatedTypesNodes,
    affectedDownstreamNodes: downstreamNodes,
  };
}

/**
 * If an entity node's label changes, update referencing columns across all other entity tables.
 */
export function syncEntityRenameReferences(
  currentNodes: BackendNode[],
  id: string,
  updatedNode: BackendNode,
  changes: Partial<BackendNode>,
): BackendNode[] {
  if (
    updatedNode.type !== "entity" ||
    changes.data?.label === undefined ||
    changes.data.label === updatedNode.data.label
  ) {
    return currentNodes;
  }

  const oldLabel = updatedNode.data.label;
  const newLabel = changes.data.label;

  if (
    !oldLabel ||
    oldLabel.trim() === "" ||
    !newLabel ||
    newLabel.trim() === ""
  ) {
    return currentNodes;
  }

  return currentNodes.map((node) => {
    if (node.id === id || node.type !== "entity" || !node.data.columns) {
      return node;
    }
    let colsChanged = false;
    const newCols = node.data.columns.map((col) => {
      if (col.references?.table === oldLabel) {
        colsChanged = true;
        return {
          ...col,
          references: {
            ...col.references,
            table: newLabel,
          },
        };
      }
      return col;
    });
    return colsChanged
      ? { ...node, data: { ...node.data, columns: newCols } }
      : node;
  });
}
