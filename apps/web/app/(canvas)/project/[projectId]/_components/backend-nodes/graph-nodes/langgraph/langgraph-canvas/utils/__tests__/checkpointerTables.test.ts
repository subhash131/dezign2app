import { describe, it, expect } from "vitest";
import {
  checkCheckpointerTablesStatus,
  provisionCheckpointerTables,
  provisionDatabaseAndCheckpointerTables,
  LANGGRAPH_POSTGRES_TABLE_DEFINITIONS,
  LANGGRAPH_REDIS_SCHEMA_DEFINITIONS,
  type ProvisionNodeInput,
  type ProvisionEdgeInput,
} from "../checkpointerTables";
import type { BackendNode, BackendEdge } from "@workspace/canvas";

describe("checkpointerTables utilities", () => {
  const mockPostgresDb: BackendNode = {
    id: "db-pg-1",
    type: "database",
    position: { x: 100, y: 100 },
    fractionalIndex: "a0",
    data: {
      label: "Main Postgres",
      dbEngine: "postgres",
    },
  };

  const mockRedisInstance: BackendNode = {
    id: "redis-inst-1",
    type: "redis_instance",
    position: { x: 500, y: 100 },
    fractionalIndex: "a1",
    data: {
      label: "Cache Redis",
    },
  };

  describe("checkCheckpointerTablesStatus", () => {
    it("returns areTablesCreated=true when checkpointer is disabled", () => {
      const status = checkCheckpointerTablesStatus([mockPostgresDb], [], false, "postgres", "db-pg-1");
      expect(status.areTablesCreated).toBe(true);
      expect(status.errorMessage).toBeNull();
    });

    it("returns areTablesCreated=true when checkpointer engine is memory", () => {
      const status = checkCheckpointerTablesStatus([mockPostgresDb], [], true, "memory");
      expect(status.areTablesCreated).toBe(true);
      expect(status.errorMessage).toBeNull();
    });

    it("detects missing PostgreSQL database in SchemaView", () => {
      const status = checkCheckpointerTablesStatus([], [], true, "postgres");
      expect(status.isMissingStorage).toBe(true);
      expect(status.areTablesCreated).toBe(false);
      expect(status.errorMessage).toContain("No PostgreSQL database found");
    });

    it("detects missing tables when PostgreSQL database exists but has no tables", () => {
      const status = checkCheckpointerTablesStatus([mockPostgresDb], [], true, "postgres", "db-pg-1");
      expect(status.isMissingStorage).toBe(false);
      expect(status.isConfigured).toBe(true);
      expect(status.areTablesCreated).toBe(false);
      expect(status.existingTables).toHaveLength(0);
      expect(status.missingCount).toBe(4);
      expect(status.errorMessage).toContain('Checkpointer tables have not been created for "Main Postgres"');
    });

    it("detects partially created tables for PostgreSQL", () => {
      const partialTable: BackendNode = {
        id: "tbl-1",
        type: "entity",
        position: { x: 100, y: 300 },
        fractionalIndex: "a2",
        data: {
          label: "checkpoints",
          databaseId: "db-pg-1",
          systemBadge: "langgraph",
        },
      };

      const status = checkCheckpointerTablesStatus([mockPostgresDb, partialTable], [], true, "postgres", "db-pg-1");
      expect(status.areTablesCreated).toBe(false);
      expect(status.existingTables).toHaveLength(1);
      expect(status.missingCount).toBe(3);
      expect(status.errorMessage).toContain('Only 1/4 checkpointer tables created for "Main Postgres"');
    });

    it("returns areTablesCreated=true when all 4 PostgreSQL tables exist", () => {
      const allTables: BackendNode[] = LANGGRAPH_POSTGRES_TABLE_DEFINITIONS.map((def, idx) => ({
        id: `tbl-${idx}`,
        type: "entity",
        position: { x: 100 + idx * 50, y: 300 },
        fractionalIndex: `t${idx}`,
        data: {
          label: def.name,
          databaseId: "db-pg-1",
          systemBadge: "langgraph",
        },
      }));

      const status = checkCheckpointerTablesStatus([mockPostgresDb, ...allTables], [], true, "postgres", "db-pg-1");
      expect(status.areTablesCreated).toBe(true);
      expect(status.existingTables).toHaveLength(4);
      expect(status.missingCount).toBe(0);
      expect(status.errorMessage).toBeNull();
    });

    it("detects missing Redis instance in SchemaView", () => {
      const status = checkCheckpointerTablesStatus([], [], true, "redis");
      expect(status.isMissingStorage).toBe(true);
      expect(status.areTablesCreated).toBe(false);
      expect(status.errorMessage).toContain("No Redis instance found");
    });

    it("detects missing schemas when Redis instance exists without schemas", () => {
      const status = checkCheckpointerTablesStatus([mockRedisInstance], [], true, "redis", "redis-inst-1");
      expect(status.isMissingStorage).toBe(false);
      expect(status.areTablesCreated).toBe(false);
      expect(status.missingCount).toBe(3);
      expect(status.errorMessage).toContain('Checkpointer schemas have not been created for "Cache Redis"');
    });

    it("returns areTablesCreated=true when all 3 Redis schemas exist", () => {
      const allSchemas: BackendNode[] = LANGGRAPH_REDIS_SCHEMA_DEFINITIONS.map((def, idx) => ({
        id: `schema-${idx}`,
        type: "redis_schema",
        position: { x: 500 + idx * 50, y: 300 },
        fractionalIndex: `r${idx}`,
        data: {
          label: def.name,
          databaseId: "redis-inst-1",
          systemBadge: "langgraph",
        },
      }));

      const status = checkCheckpointerTablesStatus([mockRedisInstance, ...allSchemas], [], true, "redis", "redis-inst-1");
      expect(status.areTablesCreated).toBe(true);
      expect(status.existingTables).toHaveLength(3);
      expect(status.missingCount).toBe(0);
      expect(status.errorMessage).toBeNull();
    });
  });

  describe("provisionCheckpointerTables", () => {
    it("provisions all 4 tables for PostgreSQL with indexes and database connection edges (no foreign keys per LangGraph official schema)", () => {
      const addedNodes: ProvisionNodeInput[] = [];
      const addedEdges: ProvisionEdgeInput[] = [];

      const createdCount = provisionCheckpointerTables({
        linkedNodeId: "db-pg-1",
        checkpointerType: "postgres",
        nodes: [mockPostgresDb],
        addNode: (node) => addedNodes.push(node),
        addEdge: (edge) => addedEdges.push(edge),
      });

      expect(createdCount).toBe(4);
      expect(addedNodes).toHaveLength(4);
      // 4 database-connection edges, 0 foreign-key edges (LangGraph has no FK constraints)
      expect(addedEdges).toHaveLength(4);
      expect(addedEdges.every((e) => e.type === "database-connection")).toBe(true);

      // Check checkpoints table
      const checkpointsNode = addedNodes.find((n) => n.data?.label === "checkpoints");
      expect(checkpointsNode).toBeDefined();
      expect(checkpointsNode?.data?.systemBadge).toBe("langgraph");
      expect(checkpointsNode?.data?.databaseId).toBe("db-pg-1");
      expect(checkpointsNode?.data?.indexes).toHaveLength(3);
      expect(checkpointsNode?.data?.indexes?.[0]?.name).toBe("idx_checkpoints_thread_id");

      // Check writes table: BYTEA blob, no FK
      const writesNode = addedNodes.find((n) => n.data?.label === "checkpoint_writes");
      expect(writesNode).toBeDefined();
      expect(writesNode?.data?.indexes).toHaveLength(3);
      const writesBlobCol = writesNode?.data?.columns?.find((c) => c.name === "blob");
      expect(writesBlobCol?.type).toBe("BYTEA");
      expect(writesBlobCol?.isNotNull).toBe(true);

      const writesCheckpointCol = writesNode?.data?.columns?.find((c) => c.name === "checkpoint_id");
      expect(writesCheckpointCol?.isForeignKey).toBeUndefined();
      expect(writesCheckpointCol?.references).toBeUndefined();

      // Check blobs table: type TEXT NOT NULL, blob BYTEA NULL, no FK
      const blobsNode = addedNodes.find((n) => n.data?.label === "checkpoint_blobs");
      expect(blobsNode).toBeDefined();
      const blobsTypeCol = blobsNode?.data?.columns?.find((c) => c.name === "type");
      expect(blobsTypeCol?.isNotNull).toBe(true);
      const blobsBlobCol = blobsNode?.data?.columns?.find((c) => c.name === "blob");
      expect(blobsBlobCol?.type).toBe("BYTEA");
      expect(blobsBlobCol?.isNotNull).toBe(false);

      const blobsThreadCol = blobsNode?.data?.columns?.find((c) => c.name === "thread_id");
      expect(blobsThreadCol?.isForeignKey).toBeUndefined();
      expect(blobsThreadCol?.references).toBeUndefined();

      // Verify no foreign-key edges are created
      const fkEdges = addedEdges.filter((e) => e.type === "foreign-key");
      expect(fkEdges).toHaveLength(0);
    });

    it("provisions all 3 schemas for Redis and creates connection edges", () => {
      const addedNodes: ProvisionNodeInput[] = [];
      const addedEdges: ProvisionEdgeInput[] = [];

      const createdCount = provisionCheckpointerTables({
        linkedNodeId: "redis-inst-1",
        checkpointerType: "redis",
        nodes: [mockRedisInstance],
        addNode: (node) => addedNodes.push(node),
        addEdge: (edge) => addedEdges.push(edge),
      });

      expect(createdCount).toBe(3);
      expect(addedNodes).toHaveLength(3);
      expect(addedEdges).toHaveLength(3);

      expect(addedNodes[0]?.type).toBe("redis_schema");
      expect(addedNodes[0]?.data?.label).toBe("langgraph_checkpoints");
      expect(addedNodes[0]?.data?.dbType).toBe("redis");
      expect(addedNodes[0]?.data?.systemBadge).toBe("langgraph");
      expect(addedNodes[0]?.data?.databaseId).toBe("redis-inst-1");
      expect(addedEdges[0]?.source).toBe("redis-inst-1");
      expect(addedEdges[0]?.type).toBe("database-connection");
    });

    it("updates existing tables with indexes when updateNode is provided", () => {
      const existingTable: BackendNode = {
        id: "tbl-0",
        type: "entity",
        position: { x: 100, y: 300 },
        fractionalIndex: "e0",
        data: {
          label: "checkpoints",
          databaseId: "db-pg-1",
          systemBadge: "langgraph",
        },
      };

      const addedNodes: ProvisionNodeInput[] = [];
      const addedEdges: ProvisionEdgeInput[] = [];
      const updatedNodes: { id: string; changes: Partial<BackendNode> }[] = [];

      const count = provisionCheckpointerTables({
        linkedNodeId: "db-pg-1",
        checkpointerType: "postgres",
        nodes: [mockPostgresDb, existingTable],
        addNode: (node) => addedNodes.push(node),
        updateNode: (id, changes) => updatedNodes.push({ id, changes }),
        addEdge: (edge) => addedEdges.push(edge),
      });

      expect(count).toBe(3); // 3 newly created tables
      expect(addedNodes).toHaveLength(3);
      expect(updatedNodes).toHaveLength(1);
      expect(updatedNodes[0]?.changes?.data?.indexes).toBeDefined();
    });
  });

  describe("tableBreakdown reporting", () => {
    it("reports all tables as missing when no storage node exists", () => {
      const status = checkCheckpointerTablesStatus([], [], true, "postgres");
      expect(status.tableBreakdown).toHaveLength(4);
      expect(status.tableBreakdown.every((t) => !t.exists)).toBe(true);
      expect(status.tableBreakdown.map((t) => t.name)).toContain("checkpoints");
      expect(status.tableBreakdown.map((t) => t.name)).toContain("checkpoint_blobs");
      expect(status.tableBreakdown.map((t) => t.name)).toContain("checkpoint_writes");
      expect(status.tableBreakdown.map((t) => t.name)).toContain("checkpoint_migrations");
    });

    it("correctly identifies which specific tables exist and which are missing", () => {
      const existingTable: BackendNode = {
        id: "tbl-0",
        type: "entity",
        position: { x: 100, y: 300 },
        fractionalIndex: "e0",
        data: {
          label: "checkpoints",
          databaseId: "db-pg-1",
          systemBadge: "langgraph",
        },
      };

      const status = checkCheckpointerTablesStatus([mockPostgresDb, existingTable], [], true, "postgres", "db-pg-1");
      const checkpointsItem = status.tableBreakdown.find((t) => t.name === "checkpoints");
      const blobsItem = status.tableBreakdown.find((t) => t.name === "checkpoint_blobs");
      const writesItem = status.tableBreakdown.find((t) => t.name === "checkpoint_writes");

      expect(checkpointsItem?.exists).toBe(true);
      expect(checkpointsItem?.nodeId).toBe("tbl-0");
      expect(blobsItem?.exists).toBe(false);
      expect(writesItem?.exists).toBe(false);
    });
  });

  describe("provisionDatabaseAndCheckpointerTables", () => {
    it("creates a new PostgreSQL DB and all 4 tables when no DB exists in canvas", () => {
      const addedNodes: ProvisionNodeInput[] = [];
      const addedEdges: ProvisionEdgeInput[] = [];

      const result = provisionDatabaseAndCheckpointerTables({
        nodes: [],
        addNode: (n) => addedNodes.push(n),
        addEdge: (e) => addedEdges.push(e),
        checkpointerType: "postgres",
      });

      expect(result.configuredNodeId).toBeDefined();
      expect(result.createdCount).toBe(4);

      // 1 database node + 4 entity nodes = 5 nodes added
      expect(addedNodes).toHaveLength(5);
      const dbNode = addedNodes.find((n) => n.type === "database");
      expect(dbNode).toBeDefined();
      expect(dbNode?.data?.dbEngine).toBe("postgres");
      expect(dbNode?.data?.label).toBe("PostgreSQL DB");
    });

    it("reuses existing PostgreSQL DB and creates missing tables", () => {
      const addedNodes: ProvisionNodeInput[] = [];
      const addedEdges: ProvisionEdgeInput[] = [];

      const result = provisionDatabaseAndCheckpointerTables({
        nodes: [mockPostgresDb],
        addNode: (n) => addedNodes.push(n),
        addEdge: (e) => addedEdges.push(e),
        checkpointerType: "postgres",
      });

      expect(result.configuredNodeId).toBe("db-pg-1");
      expect(result.createdCount).toBe(4);
      // No extra database node created, only 4 entity nodes
      expect(addedNodes).toHaveLength(4);
      expect(addedNodes.every((n) => n.type === "entity")).toBe(true);
    });
  });
});

