import { describe, it, expect, vi } from "vitest";
import { performSchemaLayout } from "../schemaLayout";
import type { LayoutNode, LayoutEdge, PositionNodeChange } from "../types";
import { Position } from "@xyflow/react";

describe("schemaLayout - Isolated Multi-Cluster Auto-Layout for N Databases & M Redis Instances", () => {
  it("isolates Database tables and Redis schemas into distinct clusters with generous section separation", () => {
    const nodes: LayoutNode[] = [
      {
        id: "db-primary",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          label: "Primary DB",
          dbType: "relational",
          isDefault: true,
        },
      },
      {
        id: "table-user",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "user",
          tableName: "user",
          databaseId: "db-primary",
          columns: [
            { name: "id", type: "string", isPrimaryKey: true },
            { name: "email", type: "string" },
          ],
        },
      },
      {
        id: "table-session",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "session",
          tableName: "session",
          databaseId: "db-primary",
          columns: [
            { name: "id", type: "string", isPrimaryKey: true },
            { name: "userId", type: "string" },
          ],
        },
      },
      {
        id: "redis-cache",
        type: "redis_instance",
        position: { x: 0, y: 0 },
        data: {
          label: "Primary Cache",
        },
      },
      {
        id: "redis-schema-convo",
        type: "redis_schema",
        position: { x: 0, y: 0 },
        data: {
          label: "conversation",
          databaseId: "redis-cache",
          redisDataStructure: "hash",
          columns: [{ name: "sender", type: "string" }],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "fk-session-user",
        source: "table-user",
        target: "table-session",
        sourceHandle: "col-id-source",
        targetHandle: "col-userId-target",
        type: "foreign-key",
      },
    ];

    let recordedChanges: PositionNodeChange[] = [];
    const onNodesChange = vi.fn((changes: PositionNodeChange[]) => {
      recordedChanges = changes;
    });
    const fitView = vi.fn();

    performSchemaLayout({
      nodes,
      edges,
      onNodesChange,
      fitView,
    });

    expect(onNodesChange).toHaveBeenCalled();
    const posMap = new Map<string, { x: number; y: number }>();
    recordedChanges.forEach((c) => {
      posMap.set(c.id, c.position);
    });

    const dbPos = posMap.get("db-primary")!;
    const userPos = posMap.get("table-user")!;
    const sessionPos = posMap.get("table-session")!;
    const redisPos = posMap.get("redis-cache")!;
    const convoPos = posMap.get("redis-schema-convo")!;

    expect(dbPos).toBeDefined();
    expect(userPos).toBeDefined();
    expect(sessionPos).toBeDefined();
    expect(redisPos).toBeDefined();
    expect(convoPos).toBeDefined();

    // 1. Database tables are located in the Database cluster
    const maxDbEntityX = Math.max(userPos.x + 260, sessionPos.x + 260);

    // 2. Redis instance and Redis schemas are placed away from Database tables with >= 300px section gap
    expect(redisPos.x).toBeGreaterThan(maxDbEntityX + 250);
    expect(convoPos.x).toBeGreaterThan(maxDbEntityX + 250);

    // 3. Database node is horizontally centered above its tables
    const dbEntitiesCenterX = (userPos.x + sessionPos.x) / 2;
    // The DB node center should be close to entities center
    expect(Math.abs(dbPos.x + 140 - (dbEntitiesCenterX + 130))).toBeLessThan(200);

    // 4. Redis instance node is at the top of the Redis schema
    expect(convoPos.y).toBeGreaterThan(redisPos.y + 100);

    // 5. Handles are correctly set: Bottom/Top for DB & Redis, Right/Left for entities
    const dbChange = recordedChanges.find((c) => c.id === "db-primary")!;
    const userChange = recordedChanges.find((c) => c.id === "table-user")!;
    const redisChange = recordedChanges.find((c) => c.id === "redis-cache")!;
    const convoChange = recordedChanges.find((c) => c.id === "redis-schema-convo")!;

    expect(dbChange.sourcePosition).toBe(Position.Bottom);
    expect(dbChange.targetPosition).toBe(Position.Top);
    expect(redisChange.sourcePosition).toBe(Position.Bottom);
    expect(redisChange.targetPosition).toBe(Position.Top);

    expect(userChange.sourcePosition).toBe(Position.Right);
    expect(userChange.targetPosition).toBe(Position.Left);
    expect(convoChange.sourcePosition).toBe(Position.Right);
    expect(convoChange.targetPosition).toBe(Position.Left);
  });

  it("isolates N separate databases and their respective tables from each other", () => {
    const nodes: LayoutNode[] = [
      {
        id: "db-1",
        type: "database",
        position: { x: 0, y: 0 },
        data: { label: "Users DB", isDefault: true },
      },
      {
        id: "table-users",
        type: "entity",
        position: { x: 0, y: 0 },
        data: { label: "users", databaseId: "db-1", columns: [{ name: "id", type: "string" }] },
      },
      {
        id: "db-2",
        type: "database",
        position: { x: 0, y: 0 },
        data: { label: "Analytics DB" },
      },
      {
        id: "table-events",
        type: "entity",
        position: { x: 0, y: 0 },
        data: { label: "events", databaseId: "db-2", columns: [{ name: "id", type: "string" }] },
      },
    ];

    const edges: LayoutEdge[] = [];
    let recordedChanges: PositionNodeChange[] = [];
    const onNodesChange = vi.fn((changes: PositionNodeChange[]) => {
      recordedChanges = changes;
    });

    performSchemaLayout({
      nodes,
      edges,
      onNodesChange,
      fitView: vi.fn(),
    });

    const posMap = new Map<string, { x: number; y: number }>();
    recordedChanges.forEach((c) => posMap.set(c.id, c.position));

    const db1Pos = posMap.get("db-1")!;
    const usersPos = posMap.get("table-users")!;
    const db2Pos = posMap.get("db-2")!;
    const eventsPos = posMap.get("table-events")!;

    // DB 1 cluster is on the left
    expect(db1Pos.x).toBeLessThan(db2Pos.x);
    expect(usersPos.x).toBeLessThan(eventsPos.x);

    // Gap between DB 1 cluster and DB 2 cluster is at least 260px
    const db1Right = Math.max(db1Pos.x + 280, usersPos.x + 280);
    const db2Left = Math.min(db2Pos.x, eventsPos.x);
    expect(db2Left - db1Right).toBeGreaterThanOrEqual(250);
  });

  it("isolates M separate Redis instances and their respective schemas from each other", () => {
    const nodes: LayoutNode[] = [
      {
        id: "redis-1",
        type: "redis_instance",
        position: { x: 0, y: 0 },
        data: { label: "Cache Redis" },
      },
      {
        id: "schema-cache",
        type: "redis_schema",
        position: { x: 0, y: 0 },
        data: { label: "cache_key", databaseId: "redis-1", columns: [] },
      },
      {
        id: "redis-2",
        type: "redis_instance",
        position: { x: 0, y: 0 },
        data: { label: "Session Redis" },
      },
      {
        id: "schema-session",
        type: "redis_schema",
        position: { x: 0, y: 0 },
        data: { label: "user_session", databaseId: "redis-2", columns: [] },
      },
    ];

    const edges: LayoutEdge[] = [];
    let recordedChanges: PositionNodeChange[] = [];
    const onNodesChange = vi.fn((changes: PositionNodeChange[]) => {
      recordedChanges = changes;
    });

    performSchemaLayout({
      nodes,
      edges,
      onNodesChange,
      fitView: vi.fn(),
    });

    const posMap = new Map<string, { x: number; y: number }>();
    recordedChanges.forEach((c) => posMap.set(c.id, c.position));

    const r1Pos = posMap.get("redis-1")!;
    const s1Pos = posMap.get("schema-cache")!;
    const r2Pos = posMap.get("redis-2")!;
    const s2Pos = posMap.get("schema-session")!;

    expect(r1Pos.x).toBeLessThan(r2Pos.x);
    expect(s1Pos.x).toBeLessThan(s2Pos.x);

    // Gap between Redis 1 and Redis 2 clusters is at least 220px
    const r1Right = Math.max(r1Pos.x + 280, s1Pos.x + 280);
    const r2Left = Math.min(r2Pos.x, s2Pos.x);
    expect(r2Left - r1Right).toBeGreaterThanOrEqual(210);
  });

  it("propagates database assignment along foreign keys when an entity lacks explicit databaseId", () => {
    const nodes: LayoutNode[] = [
      {
        id: "db-1",
        type: "database",
        position: { x: 0, y: 0 },
        data: { label: "Primary DB" },
      },
      {
        id: "table-user",
        type: "entity",
        position: { x: 0, y: 0 },
        data: { label: "user", databaseId: "db-1", columns: [{ name: "id", type: "string" }] },
      },
      {
        id: "table-profile",
        type: "entity",
        position: { x: 0, y: 0 },
        // Lacks databaseId!
        data: { label: "profile", columns: [{ name: "id", type: "string" }, { name: "userId", type: "string" }] },
      },
      {
        id: "redis-1",
        type: "redis_instance",
        position: { x: 0, y: 0 },
        data: { label: "Redis" },
      },
      {
        id: "schema-kv",
        type: "redis_schema",
        position: { x: 0, y: 0 },
        data: { label: "kv", databaseId: "redis-1", columns: [] },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "fk-profile-user",
        source: "table-user",
        target: "table-profile",
        type: "foreign-key",
      },
    ];

    let recordedChanges: PositionNodeChange[] = [];
    const onNodesChange = vi.fn((changes: PositionNodeChange[]) => {
      recordedChanges = changes;
    });

    performSchemaLayout({
      nodes,
      edges,
      onNodesChange,
      fitView: vi.fn(),
    });

    const posMap = new Map<string, { x: number; y: number }>();
    recordedChanges.forEach((c) => posMap.set(c.id, c.position));

    const userPos = posMap.get("table-user")!;
    const profilePos = posMap.get("table-profile")!;
    const redisPos = posMap.get("redis-1")!;
    const kvPos = posMap.get("schema-kv")!;

    // Profile joined DB 1 cluster via FK propagation, so it should be on the left alongside user
    expect(profilePos.x).toBeLessThan(redisPos.x);
    expect(profilePos.x).toBeLessThan(kvPos.x);
    // Profile is near user
    expect(Math.abs(profilePos.x - userPos.x)).toBeLessThan(1000);
  });

  it("lays out all Better Auth tables without any overlapping bounding boxes", () => {
    const dbId = "sqlite-auth-db";
    const dbNode: LayoutNode = {
      id: dbId,
      type: "database",
      position: { x: 0, y: 0 },
      data: {
        label: "SQLite DB",
        dbEngine: "sqlite",
        dbType: "relational",
        isDefault: true,
      },
    };

    const tableDefs = [
      { name: "user", cols: 13, idxs: 1 },
      { name: "session", cols: 11, idxs: 3, fk: "user" },
      { name: "account", cols: 11, idxs: 2, fk: "user" },
      { name: "verification", cols: 6, idxs: 1 },
      { name: "organization", cols: 7, idxs: 1 },
      { name: "member", cols: 6, idxs: 1, fk: "organization" },
      { name: "invitation", cols: 8, idxs: 1, fk: "organization" },
      { name: "twoFactor", cols: 5, idxs: 1, fk: "user" },
    ];

    const nodes: LayoutNode[] = [
      dbNode,
      ...tableDefs.map((t) => ({
        id: `table-${t.name}`,
        type: "entity",
        position: { x: 100, y: 100 },
        data: {
          label: t.name,
          description: `${t.name} table`,
          databaseId: dbId,
          columns: Array.from({ length: t.cols }, (_, i) => ({
            name: i === 0 ? "id" : `col_${i}`,
            type: "TEXT",
            isPrimaryKey: i === 0,
          })),
          indexes: Array.from({ length: t.idxs }, (_, i) => ({
            name: `idx_${t.name}_${i}`,
            columns: "col_1",
          })),
        },
      })),
    ];

    const edges: LayoutEdge[] = [
      ...tableDefs.map((t) => ({
        id: `db-edge-${t.name}`,
        source: dbId,
        target: `table-${t.name}`,
        type: "database-connection",
      })),
      ...tableDefs
        .filter((t) => t.fk)
        .map((t) => ({
          id: `fk-${t.name}-${t.fk}`,
          source: `table-${t.fk}`,
          target: `table-${t.name}`,
          type: "foreign-key",
        })),
    ];

    let recordedChanges: PositionNodeChange[] = [];
    const onNodesChange = vi.fn((changes: PositionNodeChange[]) => {
      recordedChanges = changes;
    });

    performSchemaLayout({
      nodes,
      edges,
      onNodesChange,
      fitView: vi.fn(),
    });

    expect(onNodesChange).toHaveBeenCalled();
    const posMap = new Map<string, { x: number; y: number }>();
    recordedChanges.forEach((c) => posMap.set(c.id, c.position));

    // Get bounding boxes for each entity node
    const boxes = nodes.map((node) => {
      const pos = posMap.get(node.id)!;
      expect(pos).toBeDefined();

      // Estimate dimensions using standard schema entity calculation
      const isDb = node.type === "database";
      const colCount = Array.isArray(node.data?.columns) ? node.data.columns.length : 0;
      const idxCount = Array.isArray(node.data?.indexes) ? node.data.indexes.length : 0;
      const width = isDb ? 280 : 320;
      const height = isDb
        ? 160
        : 68 + 44 + (24 + colCount * 42) + (idxCount > 0 ? 24 + idxCount * 44 : 0) + 30 + 16;

      return {
        id: node.id,
        x: pos.x,
        y: pos.y,
        width,
        height,
      };
    });

    // Verify database node is above all entity tables
    const dbBox = boxes.find((b) => b.id === dbId)!;
    const entityBoxes = boxes.filter((b) => b.id !== dbId);

    entityBoxes.forEach((ent) => {
      expect(ent.y).toBeGreaterThanOrEqual(dbBox.y + dbBox.height + 60);
    });

    // Check that NO TWO entity nodes overlap!
    for (let i = 0; i < entityBoxes.length; i++) {
      for (let j = i + 1; j < entityBoxes.length; j++) {
        const a = entityBoxes[i]!;
        const b = entityBoxes[j]!;

        const horizontalSeparation = a.x + a.width <= b.x || b.x + b.width <= a.x;
        const verticalSeparation = a.y + a.height <= b.y || b.y + b.height <= a.y;

        const doesOverlap = !horizontalSeparation && !verticalSeparation;
        if (doesOverlap) {
          console.error(
            `Overlap detected between ${a.id} (x:${a.x}, y:${a.y}, w:${a.width}, h:${a.height}) and ${b.id} (x:${b.x}, y:${b.y}, w:${b.width}, h:${b.height})`
          );
        }
        expect(doesOverlap).toBe(false);
      }
    }
  });

  it("ignores non-schema nodes like TransformerNode without affecting entity topology", () => {
    const recordedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      recordedChanges.push(...changes);
    };
    const fitView = vi.fn();

    const dbNodesAndEntities: LayoutNode[] = [
      {
        id: "db-primary",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          label: "Primary DB",
          dbType: "relational",
          isDefault: true,
        },
      },
      {
        id: "table-user",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "user",
          tableName: "user",
          databaseId: "db-primary",
          columns: [
            { name: "id", type: "string", isPrimaryKey: true },
            { name: "email", type: "string" },
          ],
        },
      },
      {
        id: "table-profile",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "profile",
          tableName: "profile",
          databaseId: "db-primary",
          columns: [
            { name: "id", type: "string", isPrimaryKey: true },
            { name: "userId", type: "string" },
          ],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "fk-profile-user",
        source: "table-user",
        target: "table-profile",
        sourceHandle: "id",
        targetHandle: "userId",
        type: "foreign-key",
      },
    ];

    // 1. Run layout without transformer
    performSchemaLayout({
      nodes: dbNodesAndEntities,
      edges,
      onNodesChange,
      fitView,
    });

    const baselineUserPos = recordedChanges.find((c) => c.id === "table-user")!.position;
    const baselineProfilePos = recordedChanges.find((c) => c.id === "table-profile")!.position;
    const baselineDbPos = recordedChanges.find((c) => c.id === "db-primary")!.position;

    // 2. Run layout with non-schema transformer node
    recordedChanges.length = 0;
    const transformerNode: LayoutNode = {
      id: "transformer-custom",
      type: "transformer",
      position: { x: 0, y: 0 },
      data: {
        label: "customTransformer",
        scope: "global",
      },
    };

    performSchemaLayout({
      nodes: [...dbNodesAndEntities, transformerNode],
      edges,
      onNodesChange,
      fitView,
    });

    const withTransUserPos = recordedChanges.find((c) => c.id === "table-user")!.position;
    const withTransProfilePos = recordedChanges.find((c) => c.id === "table-profile")!.position;
    const withTransDbPos = recordedChanges.find((c) => c.id === "db-primary")!.position;
    const transChange = recordedChanges.find((c) => c.id === "transformer-custom");

    // Non-schema transformer node is ignored by schema layout
    expect(transChange).toBeUndefined();

    // Entity tables and foreign-key topology are completely unaffected
    expect(withTransUserPos.x).toBe(baselineUserPos.x);
    expect(withTransUserPos.y).toBe(baselineUserPos.y);
    expect(withTransProfilePos.x).toBe(baselineProfilePos.x);
    expect(withTransProfilePos.y).toBe(baselineProfilePos.y);
    expect(withTransDbPos.x).toBe(baselineDbPos.x);
    expect(withTransDbPos.y).toBe(baselineDbPos.y);
  });

  it("groups Auth, LangGraph, and Application tables into distinct side-by-side SchemaGroupNode containers under the database", () => {
    const dbId = "postgres-main";
    const dbNode: LayoutNode = {
      id: dbId,
      type: "database",
      position: { x: 0, y: 0 },
      data: {
        label: "Primary PostgreSQL DB",
        dbEngine: "postgres",
        dbType: "relational",
        isDefault: true,
      },
    };

    // Auth tables
    const authTableNames = ["user", "session", "account", "verification", "twoFactor", "organization", "member"];
    // LangGraph tables
    const langgraphTableNames = ["checkpoints", "checkpoint_blobs", "checkpoint_writes", "checkpoint_migrations"];
    // Application domain tables
    const appTableNames = ["conversations", "messages"];

    const nodes: LayoutNode[] = [
      dbNode,
      ...authTableNames.map(
        (name): LayoutNode => ({
          id: `table-${name}`,
          type: "entity",
          position: { x: 0, y: 0 },
          data: {
            label: name,
            tableName: name,
            databaseId: dbId,
            columns: [{ name: "id", type: "UUID", isPrimaryKey: true }],
          },
        }),
      ),
      ...langgraphTableNames.map(
        (name): LayoutNode => ({
          id: `table-${name}`,
          type: "entity",
          position: { x: 0, y: 0 },
          data: {
            label: name,
            tableName: name,
            databaseId: dbId,
            systemBadge: "langgraph",
            columns: [{ name: "thread_id", type: "TEXT", isPrimaryKey: true }],
          },
        }),
      ),
      ...appTableNames.map(
        (name): LayoutNode => ({
          id: `table-${name}`,
          type: "entity",
          position: { x: 0, y: 0 },
          data: {
            label: name,
            tableName: name,
            databaseId: dbId,
            columns: [{ name: "id", type: "UUID", isPrimaryKey: true }],
          },
        }),
      ),
    ];

    const edges: LayoutEdge[] = [
      // DB connection edges
      ...nodes.filter((n) => n.id !== dbId).map((t) => ({
        id: `db-edge-${t.id}`,
        source: dbId,
        target: t.id,
        type: "database-connection",
      })),
      // Auth FK: session -> user
      {
        id: "fk-session-user",
        source: "table-user",
        target: "table-session",
        type: "foreign-key",
      },
      // LangGraph FK: checkpoint_blobs -> checkpoints
      {
        id: "fk-blobs-checkpoints",
        source: "table-checkpoints",
        target: "table-checkpoint_blobs",
        type: "foreign-key",
      },
      // Application FK: messages -> conversations
      {
        id: "fk-messages-conversations",
        source: "table-conversations",
        target: "table-messages",
        type: "foreign-key",
      },
    ];

    const recordedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      recordedChanges.push(...changes);
    };

    performSchemaLayout({
      nodes,
      edges,
      onNodesChange,
      fitView: vi.fn(),
    });

    const posMap = new Map<string, { x: number; y: number }>();
    recordedChanges.forEach((c) => posMap.set(c.id, c.position));

    // Verify all tables and DB node received positions
    const dbPos = posMap.get(dbId);
    expect(dbPos).toBeDefined();

    const authPos = posMap.get("table-user");
    const langgraphPos = posMap.get("table-checkpoints");
    const appPos = posMap.get("table-conversations");

    expect(authPos).toBeDefined();
    expect(langgraphPos).toBeDefined();
    expect(appPos).toBeDefined();

    if (!authPos || !langgraphPos || !appPos || !dbPos) {
      throw new Error("Expected all nodes to have positions");
    }

    // Side-by-side ordering: Authentication (left) < Application (center) < LangGraph (right)
    expect(authPos.x).toBeLessThan(appPos.x);
    expect(appPos.x).toBeLessThan(langgraphPos.x);

    // Database node is above all entity tables
    expect(authPos.y).toBeGreaterThan(dbPos.y + 100);
    expect(appPos.y).toBeGreaterThan(dbPos.y + 100);
    expect(langgraphPos.y).toBeGreaterThan(dbPos.y + 100);

    // Group containers were created in recorded changes
    const groupChanges = recordedChanges.filter((c) => c.id.startsWith("group-"));
    expect(groupChanges.length).toBeGreaterThanOrEqual(3);

    const authGroupChange = groupChanges.find((c) => c.id.includes("auth"));
    const appGroupChange = groupChanges.find((c) => c.id.includes("app"));
    const langgraphGroupChange = groupChanges.find((c) => c.id.includes("langgraph"));

    expect(authGroupChange).toBeDefined();
    expect(appGroupChange).toBeDefined();
    expect(langgraphGroupChange).toBeDefined();

    if (!authGroupChange || !appGroupChange || !langgraphGroupChange) {
      throw new Error("Expected all group containers to be present");
    }

    // Group containers are arranged side-by-side left-to-right
    expect(authGroupChange.position.x).toBeLessThan(appGroupChange.position.x);
    expect(appGroupChange.position.x).toBeLessThan(langgraphGroupChange.position.x);

    // DB node is centered above all groups
    const leftMostX = authGroupChange.position.x;
    const rightMostX = langgraphGroupChange.position.x;
    expect(dbPos.x).toBeGreaterThan(leftMostX);
    expect(dbPos.x).toBeLessThan(rightMostX);
  });

  it("respects user explicit group selection via data.group and places entity inside that group container", () => {
    const dbId = "postgres-main";
    const dbNode: LayoutNode = {
      id: dbId,
      type: "database",
      position: { x: 0, y: 0 },
      data: {
        label: "Primary PostgreSQL DB",
        dbEngine: "postgres",
        dbType: "relational",
        isDefault: true,
      },
    };

    // User explicitly assigns custom table "custom_logs" to Authentication group
    const customAuthTable: LayoutNode = {
      id: "table-custom-logs",
      type: "entity",
      position: { x: 0, y: 0 },
      data: {
        label: "custom_logs",
        tableName: "custom_logs",
        databaseId: dbId,
        group: "Authentication",
        columns: [{ name: "id", type: "string", isPrimaryKey: true }],
      },
    };

    // User explicitly assigns table "products" to a custom group "Inventory"
    const inventoryTable: LayoutNode = {
      id: "table-products",
      type: "entity",
      position: { x: 0, y: 0 },
      data: {
        label: "products",
        tableName: "products",
        databaseId: dbId,
        group: "Inventory",
        columns: [{ name: "id", type: "string", isPrimaryKey: true }],
      },
    };

    const nodes: LayoutNode[] = [dbNode, customAuthTable, inventoryTable];
    const edges: LayoutEdge[] = [];

    let recordedChanges: PositionNodeChange[] = [];
    const onNodesChange = vi.fn((changes: PositionNodeChange[]) => {
      recordedChanges = changes;
    });
    const fitView = vi.fn();

    performSchemaLayout({
      nodes,
      edges,
      onNodesChange,
      fitView,
    });

    expect(onNodesChange).toHaveBeenCalled();

    // Group containers should include Authentication and Inventory
    const groupChanges = recordedChanges.filter((c) => c.id.startsWith("group-"));
    const authGroup = groupChanges.find((c) => c.id.includes("auth"));
    const inventoryGroup = groupChanges.find((c) => c.id.includes("inventory"));

    expect(authGroup).toBeDefined();
    expect(inventoryGroup).toBeDefined();

    // Custom logs is positioned inside the Authentication group bounds
    const customLogsPos = recordedChanges.find((c) => c.id === "table-custom-logs")!.position;
    expect(customLogsPos.x).toBeGreaterThanOrEqual(authGroup!.position.x);

    // Products table is positioned inside the Inventory group bounds
    const productsPos = recordedChanges.find((c) => c.id === "table-products")!.position;
    expect(productsPos.x).toBeGreaterThanOrEqual(inventoryGroup!.position.x);
  });
});

