import type { BackendNode, BackendEdge } from "@workspace/canvas";
import {
  LANGGRAPH_POSTGRES_TABLE_DEFINITIONS,
  LANGGRAPH_SQLITE_TABLE_DEFINITIONS,
  LANGGRAPH_REDIS_SCHEMA_DEFINITIONS,
  type LangGraphTableDefinition,
  type LangGraphRedisSchemaDefinition,
} from "@workspace/canvas";

export {
  LANGGRAPH_POSTGRES_TABLE_DEFINITIONS,
  LANGGRAPH_SQLITE_TABLE_DEFINITIONS,
  LANGGRAPH_REDIS_SCHEMA_DEFINITIONS,
  type LangGraphTableDefinition,
  type LangGraphRedisSchemaDefinition,
};

export type ProvisionNodeInput = Omit<BackendNode, "fractionalIndex">;
export type ProvisionEdgeInput = Omit<BackendEdge, "fractionalIndex">;

/**
 * Returns existing LangGraph checkpointer tables or schemas associated with the given connectionId.
 */
export function getExistingCheckpointerTables(
  nodes: BackendNode[],
  edges: BackendEdge[] = [],
  checkpointerType: string,
  connectionId?: string,
): BackendNode[] {
  if (!connectionId) return [];

  const isEdgeConnected = (nodeId: string) =>
    edges.some(
      (e) =>
        (e.source === connectionId && e.target === nodeId) ||
        (e.target === connectionId && e.source === nodeId),
    );

  if (checkpointerType === "postgres") {
    return nodes.filter(
      (n) =>
        n?.type === "entity" &&
        (n.data?.databaseId === connectionId || isEdgeConnected(n.id)) &&
        (n.data?.systemBadge === "langgraph" ||
          LANGGRAPH_POSTGRES_TABLE_DEFINITIONS.some(
            (def) =>
              def.name === n.data?.label ||
              def.name === n.data?.tableName ||
              `langgraph_${def.name}` === n.data?.label ||
              `langgraph_${def.name}` === n.data?.tableName,
          )),
    );
  }

  if (checkpointerType === "redis") {
    return nodes.filter(
      (n) =>
        (n?.type === "redis_schema" || n?.type === "entity") &&
        (n.data?.databaseId === connectionId || isEdgeConnected(n.id)) &&
        (n.data?.systemBadge === "langgraph" ||
          LANGGRAPH_REDIS_SCHEMA_DEFINITIONS.some(
            (def) => def.name === n.data?.label || def.name === n.data?.tableName,
          ) ||
          LANGGRAPH_POSTGRES_TABLE_DEFINITIONS.some(
            (def) => def.name === n.data?.label || def.name === n.data?.tableName,
          )),
    );
  }

  return [];
}

export interface CheckpointerTableItemStatus {
  name: string;
  description: string;
  exists: boolean;
  nodeId?: string;
}

export interface CheckpointerTablesStatus {
  isConfigured: boolean;
  isMissingStorage: boolean;
  configuredNode?: BackendNode;
  configuredNodeId?: string;
  existingTables: BackendNode[];
  expectedCount: number;
  areTablesCreated: boolean;
  missingCount: number;
  errorMessage: string | null;
  tableBreakdown: CheckpointerTableItemStatus[];
}

/**
 * Evaluates whether the checkpointer is properly configured and if all required tables exist in SchemaView.
 */
export function checkCheckpointerTablesStatus(
  nodes: BackendNode[],
  edges: BackendEdge[] = [],
  isEnabled: boolean,
  checkpointerType: string,
  connectionId?: string,
): CheckpointerTablesStatus {
  if (!isEnabled || checkpointerType === "memory") {
    return {
      isConfigured: true,
      isMissingStorage: false,
      existingTables: [],
      expectedCount: 0,
      areTablesCreated: true,
      missingCount: 0,
      errorMessage: null,
      tableBreakdown: [],
    };
  }

  if (checkpointerType === "postgres") {
    const postgresNodes = nodes.filter(
      (n) => n?.type === "database" && n.data?.dbEngine === "postgres",
    );
    const configuredDb =
      postgresNodes.find((p) => p.id === connectionId) || postgresNodes[0];

    if (!configuredDb) {
      const breakdown: CheckpointerTableItemStatus[] =
        LANGGRAPH_POSTGRES_TABLE_DEFINITIONS.map((def) => ({
          name: def.name,
          description: def.description,
          exists: false,
        }));

      return {
        isConfigured: false,
        isMissingStorage: true,
        existingTables: [],
        expectedCount: 4,
        areTablesCreated: false,
        missingCount: 4,
        errorMessage: "No PostgreSQL database found in SchemaView. Please create a Database node in SchemaView.",
        tableBreakdown: breakdown,
      };
    }

    const existing = getExistingCheckpointerTables(nodes, edges, "postgres", configuredDb.id);
    const expectedCount = LANGGRAPH_POSTGRES_TABLE_DEFINITIONS.length;
    const areTablesCreated = existing.length >= expectedCount;
    const missingCount = Math.max(0, expectedCount - existing.length);
    const dbName = configuredDb.data?.label || "PostgreSQL";

    const tableBreakdown: CheckpointerTableItemStatus[] =
      LANGGRAPH_POSTGRES_TABLE_DEFINITIONS.map((def) => {
        const match = existing.find(
          (n) =>
            n.data?.label === def.name ||
            n.data?.tableName === def.name ||
            n.data?.label === `langgraph_${def.name}` ||
            n.data?.tableName === `langgraph_${def.name}`,
        );
        return {
          name: def.name,
          description: def.description,
          exists: Boolean(match),
          nodeId: match?.id,
        };
      });

    let errorMessage: string | null = null;
    if (!areTablesCreated) {
      if (existing.length === 0) {
        errorMessage = `Checkpointer tables have not been created for "${dbName}" in SchemaView.`;
      } else {
        errorMessage = `Only ${existing.length}/${expectedCount} checkpointer tables created for "${dbName}" in SchemaView.`;
      }
    }

    return {
      isConfigured: true,
      isMissingStorage: false,
      configuredNode: configuredDb,
      configuredNodeId: configuredDb.id,
      existingTables: existing,
      expectedCount,
      areTablesCreated,
      missingCount,
      errorMessage,
      tableBreakdown,
    };
  }

  if (checkpointerType === "redis") {
    const redisNodes = nodes.filter(
      (n) =>
        n?.type === "redis_instance" ||
        (n?.type === "database" && n.data?.dbEngine === "redis"),
    );
    const configuredRedis =
      redisNodes.find((r) => r.id === connectionId) || redisNodes[0];

    if (!configuredRedis) {
      const breakdown: CheckpointerTableItemStatus[] =
        LANGGRAPH_REDIS_SCHEMA_DEFINITIONS.map((def) => ({
          name: def.name,
          description: def.description,
          exists: false,
        }));

      return {
        isConfigured: false,
        isMissingStorage: true,
        existingTables: [],
        expectedCount: 3,
        areTablesCreated: false,
        missingCount: 3,
        errorMessage: "No Redis instance found in SchemaView. Please create a Redis instance in SchemaView.",
        tableBreakdown: breakdown,
      };
    }

    const existing = getExistingCheckpointerTables(nodes, edges, "redis", configuredRedis.id);
    const expectedCount = LANGGRAPH_REDIS_SCHEMA_DEFINITIONS.length;
    const areTablesCreated = existing.length >= expectedCount;
    const missingCount = Math.max(0, expectedCount - existing.length);
    const redisName = configuredRedis.data?.label || "Redis";

    const tableBreakdown: CheckpointerTableItemStatus[] =
      LANGGRAPH_REDIS_SCHEMA_DEFINITIONS.map((def) => {
        const match = existing.find(
          (n) => n.data?.label === def.name || n.data?.tableName === def.name,
        );
        return {
          name: def.name,
          description: def.description,
          exists: Boolean(match),
          nodeId: match?.id,
        };
      });

    let errorMessage: string | null = null;
    if (!areTablesCreated) {
      if (existing.length === 0) {
        errorMessage = `Checkpointer schemas have not been created for "${redisName}" in SchemaView.`;
      } else {
        errorMessage = `Only ${existing.length}/${expectedCount} checkpointer schemas created for "${redisName}" in SchemaView.`;
      }
    }

    return {
      isConfigured: true,
      isMissingStorage: false,
      configuredNode: configuredRedis,
      configuredNodeId: configuredRedis.id,
      existingTables: existing,
      expectedCount,
      areTablesCreated,
      missingCount,
      errorMessage,
      tableBreakdown,
    };
  }

  return {
    isConfigured: true,
    isMissingStorage: false,
    existingTables: [],
    expectedCount: 0,
    areTablesCreated: true,
    missingCount: 0,
    errorMessage: null,
    tableBreakdown: [],
  };
}

/**
 * Provisions missing LangGraph checkpointer tables/schemas in SchemaView under the linked storage node,
 * or updates existing ones with schema definitions and indexes (no physical foreign keys per official LangGraph schema).
 */
export function provisionCheckpointerTables({
  linkedNodeId,
  checkpointerType,
  nodes,
  edges: _edges = [],
  addNode,
  updateNode,
  addEdge,
}: {
  linkedNodeId: string;
  checkpointerType: "postgres" | "redis" | string;
  nodes: BackendNode[];
  edges?: BackendEdge[];
  addNode: (node: ProvisionNodeInput) => void;
  updateNode?: (id: string, changes: Partial<BackendNode>) => void;
  addEdge: (edge: ProvisionEdgeInput) => void;
}): number {
  const linkedNode = nodes.find((n) => n.id === linkedNodeId);
  if (!linkedNode) return 0;

  const dbPos = linkedNode.position || { x: 200, y: 200 };
  let createdCount = 0;
  let updatedCount = 0;

  if (checkpointerType === "redis") {
    LANGGRAPH_REDIS_SCHEMA_DEFINITIONS.forEach((schemaDef, idx) => {
      const existingNode = nodes.find(
        (n) =>
          (n.type === "redis_schema" || n.type === "entity") &&
          n.data?.databaseId === linkedNodeId &&
          (n.data?.label === schemaDef.name || n.data?.tableName === schemaDef.name),
      );

      if (existingNode) {
        if (updateNode) {
          updateNode(existingNode.id, {
            data: {
              ...existingNode.data,
              columns: schemaDef.columns,
              indexes: schemaDef.indexes,
            },
          });
          updatedCount++;
        }
        return;
      }

      const schemaId = crypto.randomUUID();
      const colOffset = (idx % 2) * 320;
      const rowOffset = Math.floor(idx / 2) * 260 + 260;

      addNode({
        id: schemaId,
        type: "redis_schema",
        position: { x: dbPos.x + colOffset, y: dbPos.y + rowOffset },
        data: {
          label: schemaDef.name,
          tableName: schemaDef.name,
          description: schemaDef.description,
          dbType: "redis",
          redisDataStructure: schemaDef.redisDataStructure,
          keyTemplate: schemaDef.keyTemplate,
          systemBadge: "langgraph",
          readOnly: true,
          databaseId: linkedNodeId,
          columns: schemaDef.columns,
          indexes: schemaDef.indexes,
        },
      });

      addEdge({
        id: `edge-${linkedNodeId}-${schemaId}`,
        source: linkedNodeId,
        target: schemaId,
        sourceHandle: "database-source",
        targetHandle: "database-entity-target",
        type: "database-connection",
      });

      createdCount++;
    });
  } else {
    // Postgres / Relational
    LANGGRAPH_POSTGRES_TABLE_DEFINITIONS.forEach((tableDef, idx) => {
      const existingNode = nodes.find(
        (n) =>
          n.type === "entity" &&
          n.data?.databaseId === linkedNodeId &&
          (n.data?.label === tableDef.name ||
            n.data?.tableName === tableDef.name ||
            n.data?.label === `langgraph_${tableDef.name}` ||
            n.data?.tableName === `langgraph_${tableDef.name}`),
      );

      if (existingNode) {
        if (updateNode) {
          updateNode(existingNode.id, {
            data: {
              ...existingNode.data,
              columns: tableDef.columns,
              indexes: tableDef.indexes,
            },
          });
          updatedCount++;
        }
        return;
      }

      const tableId = crypto.randomUUID();
      const colOffset = (idx % 2) * 320;
      const rowOffset = Math.floor(idx / 2) * 260 + 260;

      addNode({
        id: tableId,
        type: "entity",
        position: { x: dbPos.x + colOffset, y: dbPos.y + rowOffset },
        data: {
          label: tableDef.name,
          tableName: tableDef.name,
          description: tableDef.description,
          dbType: "relational",
          systemBadge: "langgraph",
          readOnly: true,
          databaseId: linkedNodeId,
          columns: tableDef.columns,
          indexes: tableDef.indexes,
        },
      });

      addEdge({
        id: `edge-${linkedNodeId}-${tableId}`,
        source: linkedNodeId,
        target: tableId,
        sourceHandle: "database-source",
        targetHandle: "database-entity-target",
        type: "database-connection",
      });

      createdCount++;
    });
  }

  return createdCount > 0 ? createdCount : updatedCount;
}

/**
 * Automatically provisions a PostgreSQL database or Redis instance if missing in SchemaView,
 * and creates all required LangGraph checkpointer tables linked to it in 1 click.
 */
export function provisionDatabaseAndCheckpointerTables({
  nodes,
  edges = [],
  addNode,
  updateNode,
  addEdge,
  checkpointerType = "postgres",
}: {
  nodes: BackendNode[];
  edges?: BackendEdge[];
  addNode: (node: ProvisionNodeInput) => void;
  updateNode?: (id: string, changes: Partial<BackendNode>) => void;
  addEdge: (edge: ProvisionEdgeInput) => void;
  checkpointerType?: "postgres" | "redis" | string;
}): { configuredNodeId: string; createdCount: number } {
  if (checkpointerType === "redis") {
    let redisNode = nodes.find(
      (n) =>
        n?.type === "redis_instance" ||
        (n?.type === "database" && n.data?.dbEngine === "redis"),
    );
    let redisId: string;
    if (!redisNode) {
      redisId = crypto.randomUUID();
      const pos = { x: 300, y: 150 };
      const newRedisNode: BackendNode = {
        id: redisId,
        type: "redis_instance",
        position: pos,
        fractionalIndex: "r0",
        data: {
          label: "Redis Instance",
          dbEngine: "redis",
          dbType: "redis",
          color: "#dc2626",
          isDefault: true,
          envVars: [
            {
              id: "redis-url",
              name: "REDIS_URL",
              description: "Redis connection URI (e.g. redis://localhost:6379)",
            },
          ],
        },
      };
      addNode(newRedisNode);
      redisNode = newRedisNode;
    } else {
      redisId = redisNode.id;
    }

    const createdCount = provisionCheckpointerTables({
      linkedNodeId: redisId,
      checkpointerType: "redis",
      nodes: [...nodes, redisNode],
      edges,
      addNode,
      updateNode,
      addEdge,
    });

    return { configuredNodeId: redisId, createdCount };
  }

  // Default: PostgreSQL
  let pgNode = nodes.find(
    (n) => n?.type === "database" && n.data?.dbEngine === "postgres",
  );
  let pgId: string;
  if (!pgNode) {
    pgId = crypto.randomUUID();
    const pos = { x: 300, y: 150 };
    const newPgNode: BackendNode = {
      id: pgId,
      type: "database",
      position: pos,
      fractionalIndex: "d0",
      data: {
        label: "PostgreSQL DB",
        dbEngine: "postgres",
        dbType: "relational",
        dbCategory: "sql",
        dbConnectionType: "env_var",
        connectionStringEnv: "DATABASE_URL",
        color: "#006ddd",
        isDefault: true,
        envVars: [
          {
            id: "db-url",
            name: "DATABASE_URL",
            description: "PostgreSQL connection string (e.g. postgresql://user:pass@localhost:5432/mydb)",
          },
        ],
      },
    };
    addNode(newPgNode);
    pgNode = newPgNode;
  } else {
    pgId = pgNode.id;
  }

  const createdCount = provisionCheckpointerTables({
    linkedNodeId: pgId,
    checkpointerType: "postgres",
    nodes: [...nodes, pgNode],
    edges,
    addNode,
    updateNode,
    addEdge,
  });

  return { configuredNodeId: pgId, createdCount };
}
