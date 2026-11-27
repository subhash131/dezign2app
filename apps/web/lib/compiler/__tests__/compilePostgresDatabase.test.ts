import { describe, it, expect } from "vitest";
import { compilePostgresDatabase } from "../databases/postgres";
import { compileDatabaseNodes } from "../compileDatabaseNodes";
import { compileServiceNode } from "../compileServiceNode";
import { generateEntitiesModule } from "../generators/typesGenerator/entitiesGenerator";
import type { BackendNode, BackendEdge } from "@/types/canvas";
import type { CanvasEntityColumn, Endpoint } from "@workspace/canvas/types";



const makeEntityNode = (
  id: string,
  label: string,
  columns: CanvasEntityColumn[],
): BackendNode => ({
  id,
  type: "entity",
  position: { x: 0, y: 0 },
  fractionalIndex: "a0",
  data: { label, columns },
});

describe("compilePostgresDatabase", () => {
  const orderEntity = makeEntityNode("ent-order", "Order", [
    { name: "id", type: "string", isPrimaryKey: true },
    { name: "userId", type: "string", isNotNull: true },
    { name: "totalAmount", type: "number" },
    { name: "status", type: "string" },
    { name: "createdAt", type: "timestamp" },
  ]);

  it("should generate all required files", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const filenames = result.files.map((f) => f.filename);
    expect(filenames).toContain("connection.ts");
    expect(filenames).toContain("schema.sql");
    expect(filenames).toContain("sync.ts");
    expect(filenames).toContain("scripts/validate.ts");
    expect(filenames).toContain("scripts/sync.ts");
    expect(filenames).not.toContain("scripts/server.ts");
    expect(filenames).toContain("helpers/order.ts");
    expect(filenames).toContain("helpers/index.ts");
    expect(filenames).toContain("index.ts");
    expect(filenames).toContain("package.json");
    expect(filenames).toContain("tsconfig.json");
  });

  it("should generate programmatic local sync functions in sync.ts matching dbSyncStore", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const syncFile = result.files.find((f) => f.filename === "sync.ts");
    expect(syncFile).toBeDefined();
    const code = syncFile!.content;
    expect(code).toContain("export async function validateTable");
    expect(code).toContain("export async function validateDatabase");
    expect(code).toContain("export async function validateAll");
    expect(code).toContain("export async function applyTableSync");
    expect(code).toContain("export async function syncAll");
    expect(code).toContain("export async function checkConnection");
    expect(code).toContain("export const TABLE_DEFINITIONS");
    expect(code).toContain('"order"');
    expect(code).not.toContain("as any");
    expect(code).not.toContain("as unknown");
  });

  it("should generate async helper functions with $N params", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const helper = result.files.find((f) => f.filename === "helpers/order.ts");
    expect(helper).toBeDefined();
    const code = helper!.content;
    expect(code).toContain("async function findAllOrders");
    expect(code).toContain("async function findOrderById");
    expect(code).toContain("async function createOrder");
    expect(code).toContain("async function updateOrder");
    expect(code).toContain("async function deleteOrderById");
    expect(code).toContain("$1");
    expect(code).toContain("await query");
    expect(code).not.toContain("db.prepare");
    expect(code).not.toContain(".all(");
    expect(code).not.toContain(".get(");
  });

  it("should use RETURNING * in INSERT and UPDATE", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const helper = result.files.find((f) => f.filename === "helpers/order.ts");
    expect(helper!.content).toContain("RETURNING *");
  });

  it("should generate schema.sql with BetterAuth and payment tables", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const schema = result.files.find((f) => f.filename === "schema.sql");
    const sql = schema!.content;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "order"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "user"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "session"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "subscription"');
  });

  it("should generate schema.sql with seed data when personas are provided", () => {
    const result = compilePostgresDatabase([orderEntity], [], {
      personas: [
        {
          id: "persona_admin",
          name: "Admin",
          records: [
            {
              tableName: "user",
              fields: {
                id: "admin_user_1",
                name: "Admin User",
                email: "admin@example.com",
              },
            },
          ],
        },
      ],
    });
    const schema = result.files.find((f) => f.filename === "schema.sql");
    const sql = schema!.content;
    expect(sql).toContain("ON CONFLICT");
  });

  it("should generate connection.ts with Pool and withTransaction", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const conn = result.files.find((f) => f.filename === "connection.ts");
    const code = conn!.content;
    expect(code).toContain("new Pool(");
    expect(code).toContain("export async function query");
    expect(code).toContain("export async function withTransaction");
    expect(code).toContain("export async function checkPostgresHealth");
    expect(code).toContain("export const db = pool;");
    expect(code).not.toContain("as any");
    expect(code).not.toContain("as unknown");
    expect(code).not.toMatch(/\bany\b/);
    expect(code).not.toMatch(/\bunknown\b/);
    expect(code).not.toMatch(/\bas\s+[A-Za-z0-9_]+\b/);
    expect(code).toContain("ADD COLUMN IF NOT EXISTS");
  });

  it("should generate package.json with pg dependency and local sync scripts", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const pkg = result.files.find((f) => f.filename === "package.json");
    const parsed = JSON.parse(pkg!.content);
    expect(parsed.dependencies).toHaveProperty("pg");
    expect(parsed.devDependencies).toHaveProperty("@types/pg");
    expect(parsed.scripts).toHaveProperty("db:push");
    expect(parsed.scripts).toHaveProperty("db:validate");
    expect(parsed.scripts).not.toHaveProperty("db:serve");
    expect(parsed.scripts).not.toHaveProperty("dev");
  });

  it("should generate reusableFunctions with correct metadata", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const fns = result.reusableFunctions;
    expect(fns.length).toBeGreaterThanOrEqual(5);
    const findAll = fns.find((f) => f.kind === "findAll");
    expect(findAll?.name).toBe("findAllOrders");
    expect(findAll?.targetName).toBe("order");
    const create = fns.find((f) => f.kind === "create");
    expect(create?.name).toBe("createOrder");
  });

  it("should use randomUUID for string PK", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const helper = result.files.find((f) => f.filename === "helpers/order.ts");
    expect(helper!.content).toContain("randomUUID");
    expect(helper!.content).toContain('import { randomUUID } from "node:crypto"');
  });

  it("should NOT use randomUUID for numeric PK", () => {
    const numericPkEntity = makeEntityNode("ent-product", "Product", [
      { name: "id", type: "number", isPrimaryKey: true },
      { name: "name", type: "string", isNotNull: true },
    ]);
    const result = compilePostgresDatabase([numericPkEntity], []);
    const helper = result.files.find((f) => f.filename === "helpers/product.ts");
    expect(helper!.content).not.toContain("randomUUID");
  });

  it("should correctly compile tables with single numeric primary key and no writable columns", () => {
    const migrationEntity = makeEntityNode("ent-migration", "langgraph_checkpoint_migrations", [
      { name: "v", type: "number", isPrimaryKey: true },
    ]);
    const result = compilePostgresDatabase([migrationEntity], []);
    const helper = result.files.find((f) => f.filename === "helpers/langgraphCheckpointMigration.ts");
    expect(helper).toBeDefined();
    const code = helper!.content;
    expect(code).not.toContain("{ id }");
    expect(code).toContain("v?: number");
    expect(code).toContain("DEFAULT VALUES");
    expect(code).toContain("const row = res.rows[0];");
    expect(code).toContain("return row;");
  });

  it("should handle multiple entity tables", () => {
    const productEntity = makeEntityNode("ent-product", "Product", [
      { name: "id", type: "string", isPrimaryKey: true },
      { name: "name", type: "string", isNotNull: true },
      { name: "price", type: "number" },
    ]);
    const result = compilePostgresDatabase([orderEntity, productEntity], []);
    const filenames = result.files.map((f) => f.filename);
    expect(filenames).toContain("helpers/order.ts");
    expect(filenames).toContain("helpers/product.ts");
    const barrel = result.files.find((f) => f.filename === "helpers/index.ts");
    expect(barrel!.content).toContain('from "./order"');
    expect(barrel!.content).toContain('from "./product"');
  });

  it("should avoid any, unknown, or as xyz type assertions in generated helpers", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const helper = result.files.find((f) => f.filename === "helpers/order.ts");
    expect(helper).toBeDefined();
    const code = helper!.content;
    expect(code).not.toContain("as unknown as");
    expect(code).not.toContain("as Order");
    expect(code).not.toContain("as any");
    expect(code).toContain("const row = res.rows[0];");
    expect(code).toContain("return row;");
    expect(code).toContain("return res.rows[0] || null;");
  });

  it("should avoid any, unknown, or as xyz type assertions in generated local sync files and scripts", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const syncFile = result.files.find((f) => f.filename === "sync.ts");
    expect(syncFile).toBeDefined();
    const syncCode = syncFile!.content;
    // Check that there are no TS 'as' assertions or any/unknown keywords
    expect(syncCode).not.toMatch(/\bas\s+[A-Za-z0-9_]/);
    expect(syncCode).not.toMatch(/\bany\b/);
    expect(syncCode).not.toMatch(/\bunknown\b/);

    const validateScript = result.files.find((f) => f.filename === "scripts/validate.ts");
    expect(validateScript).toBeDefined();
    expect(validateScript!.content).not.toMatch(/\bas\s+[A-Za-z0-9_]/);
    expect(validateScript!.content).not.toMatch(/\bany\b/);
    expect(validateScript!.content).not.toMatch(/\bunknown\b/);

    const syncScript = result.files.find((f) => f.filename === "scripts/sync.ts");
    expect(syncScript).toBeDefined();
    expect(syncScript!.content).not.toMatch(/\bas\s+[A-Za-z0-9_]/);
    expect(syncScript!.content).not.toMatch(/\bany\b/);
    expect(syncScript!.content).not.toMatch(/\bunknown\b/);
  });

  it("should provide prepare compatibility on postgres connection pool for better-sqlite3 style callers", () => {
    const result = compilePostgresDatabase([orderEntity], []);
    const conn = result.files.find((f) => f.filename === "connection.ts");
    expect(conn).toBeDefined();
    const code = conn!.content;
    expect(code).toContain("export interface PreparedStatement<T extends QueryResultRow = Record<string, SqlParam>>");
    expect(code).toContain('declare module "pg"');
    expect(code).toContain("prepare<T extends QueryResultRow = Record<string, SqlParam>>(sql: string): PreparedStatement<T>;");
    expect(code).toContain(".prepare = function prepare<T extends QueryResultRow = Record<string, SqlParam>>(sql: string): PreparedStatement<T>");
    expect(code).toContain("export const db = pool;");
    expect(code).not.toContain("as any");
    expect(code).not.toContain("as unknown");
    expect(code).not.toMatch(/\bany\b/);
    expect(code).not.toMatch(/\bunknown\b/);
    expect(code).not.toMatch(/\bas\s+[A-Za-z0-9_]+\b/);
  });

  it("should deduplicate columns with duplicate or colliding names in generated helpers", () => {
    const rateLimitEntity: BackendNode = {
      id: "node-rate-limit",
      type: "entity",
      fractionalIndex: "a0",
      data: {
        label: "rateLimit",
        columns: [
          { name: "key", type: "TEXT", isPrimaryKey: true, isNotNull: true },
          { name: "count", type: "INTEGER", isNotNull: true },
          { name: "lastRequest", type: "INTEGER", isNotNull: true },
          { name: "createdAt", type: "TIMESTAMPTZ" },
          { name: "updatedAt", type: "TIMESTAMPTZ" },
          { name: "created_at", type: "TIMESTAMPTZ" },
          { name: "updated_at", type: "TIMESTAMPTZ" },
          { name: "createdAt", type: "TIMESTAMPTZ" },
          { name: "updatedAt", type: "TIMESTAMPTZ" },
        ],
      },
      position: { x: 0, y: 0 },
    };

    const result = compilePostgresDatabase([rateLimitEntity], []);
    const helper = result.files.find((f) => f.filename === "helpers/rateLimit.ts");
    expect(helper).toBeDefined();

    // Verify no duplicate identifiers in RateLimit interface
    const rateLimitInterface = helper!.content.match(/export interface RateLimit\s*\{([^}]+)\}/)?.[1] || "";
    const interfaceCreatedAt = rateLimitInterface.match(/\bcreatedAt\??:/g);
    expect(interfaceCreatedAt?.length).toBe(1);

    const createRateLimitInterface = helper!.content.match(/export interface CreateRateLimitData\s*\{([^}]+)\}/)?.[1] || "";
    const createCreatedAt = createRateLimitInterface.match(/\bcreatedAt\??:/g);
    expect(createCreatedAt?.length).toBe(1);

    const interfaceUpdatedAt = rateLimitInterface.match(/\bupdatedAt\??:/g);
    expect(interfaceUpdatedAt?.length).toBe(1);
  });

  it("should uniformly parse lowercase names with spaces across DDL, types, and CRUD helpers", () => {
    const dbNode: BackendNode = {
      id: "node-db-test",
      type: "database",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "test db",
        dbEngine: "postgres",
      },
    };

    const testUserEntity: BackendNode = {
      id: "node-test-user",
      type: "entity",
      fractionalIndex: "a1",
      position: { x: 0, y: 200 },
      data: {
        label: "test user",
        databaseId: "node-db-test",
        columns: [
          { name: "id", type: "UUID", isPrimaryKey: true, isNotNull: true },
          { name: "created_at", type: "TIMESTAMPTZ" },
          { name: "updated_at", type: "TIMESTAMPTZ" },
          { name: "username", type: "TEXT", isNotNull: true },
        ],
      },
    };

    const edge: BackendEdge = {
      id: "edge-db-entity",
      source: "node-db-test",
      target: "node-test-user",
      type: "database-connection",
      fractionalIndex: "a0",
    };

    const compiled = compileDatabaseNodes([dbNode, testUserEntity], [edge]);
    const dbPkg = compiled.packages?.find((p) => p.packageName === "@workspace/db-test-db");
    expect(dbPkg).toBeDefined();
    expect(dbPkg?.packageFolder).toBe("test-db");

    const schemaFile = dbPkg?.files.find((f) => f.filename === "schema.sql");
    expect(schemaFile?.content).toContain('CREATE TABLE IF NOT EXISTS "test_user"');

    const helperFile = dbPkg?.files.find((f) => f.filename === "helpers/testUser.ts");
    expect(helperFile).toBeDefined();
    const code = helperFile!.content;

    // Interfaces and Data types
    expect(code).toContain("export interface TestUser {");
    expect(code).toContain("export interface CreateTestUserData {");
    expect(code).toContain("export type UpdateTestUserData = Partial<CreateTestUserData>;");
    expect(code).toContain("export type UpsertTestUserData = CreateTestUserData;");

    // CRUD operations use uniform PascalCase and snake_case SQL table name
    expect(code).toContain("export async function findAllTestUsers(limit = 20, offset = 0): Promise<TestUser[]>");
    expect(code).toContain("export async function findTestUserById(id: string): Promise<TestUser | null>");
    expect(code).toContain("CreateTestUserData): Promise<TestUser>");
    expect(code).toContain("UpdateTestUserData): Promise<TestUser | null>");
    expect(code).toContain("UpsertTestUserData): Promise<TestUser>");
    expect(code).toContain("export async function createTestUser(");
    expect(code).toContain("export async function updateTestUser(");
    expect(code).toContain("export async function upsertTestUser(");
    expect(code).toContain("export async function deleteTestUserById(");
    expect(code).toContain('FROM "test_user"');
    expect(code).toContain('INTO "test_user"');
    expect(code).toContain('UPDATE "test_user"');

    // Regression check: must never emit unparsed "Testuser" / "testuser"
    expect(code).not.toContain("Testuser");
    expect(code).not.toContain('"testuser"');
    expect(code).not.toContain("createTestuser");
    expect(code).not.toContain("updateTestuser");
    expect(code).not.toContain("upsertTestuser");

    // Shared @workspace/types entities module matches
    const entitiesCode = generateEntitiesModule([testUserEntity]);
    expect(entitiesCode).toContain("export interface TestUser {");
    expect(entitiesCode).toContain("export type CreateTestUserData =");
  });

  it("should dereference stale db_ref nodes and re-resolve renamed entity pipeline steps (conversations -> conversati)", () => {
    const pgDbNode: BackendNode = {
      id: "db-pg",
      type: "database",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: { label: "Primary PostgreSQL DB", dbEngine: "postgres" },
    };

    const renamedEntity: BackendNode = {
      id: "entity-conv",
      type: "entity",
      fractionalIndex: "a1",
      position: { x: 200, y: 0 },
      data: {
        label: "conversati",
        tableName: "conversati",
        databaseId: "db-pg",
        columns: [
          { name: "id", type: "UUID", isPrimaryKey: true, isNotNull: true },
          { name: "title", type: "TEXT", isNotNull: true },
          { name: "created_by", type: "UUID", isNotNull: true },
        ],
        indexes: [
          { name: "idx_creator", columns: "created_by", isUnique: false },
        ],
      },
    };

    // Stale db_ref left with old label "conversations" and no columns
    const staleDbRef: BackendNode = {
      id: "db-ref-conv",
      type: "db_ref",
      fractionalIndex: "a2",
      position: { x: 200, y: 150 },
      data: {
        label: "conversations",
        tableRef: "entity-conv",
      },
    };

    const serviceNode: BackendNode = {
      id: "srv-ai",
      type: "service",
      fractionalIndex: "a3",
      position: { x: 400, y: 0 },
      data: { label: "ai-service", techStack: "express", port: "8080" },
    };

    const allNodes = [pgDbNode, renamedEntity, staleDbRef, serviceNode];
    const allEdges: BackendEdge[] = [
      { id: "e-db", source: "db-pg", target: "entity-conv", type: "database-connection", fractionalIndex: "a0" },
      { id: "e-srv", source: "srv-ai", target: "db-ref-conv", type: "database-connection", fractionalIndex: "a1" },
    ];

    const compiledDb = compileDatabaseNodes(allNodes, allEdges);
    const dbFilePaths = compiledDb.files.map((f) => f.filename);
    // Must NOT emit ghost helpers/conversation.ts or helpers/conversations.ts from the stale db_ref
    expect(dbFilePaths.some((f) => f.includes("helpers/conversation.ts"))).toBe(false);
    expect(dbFilePaths.some((f) => f.includes("helpers/conversations.ts"))).toBe(false);
    expect(dbFilePaths.some((f) => f.endsWith("helpers/conversati.ts"))).toBe(true);

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-get",
        nodeId: "srv-ai",
        name: "/conversations/user",
        type: "GET",
        pipelineSteps: [
          {
            id: "step-get",
            name: "getByCreator",
            type: "db_operation",
            enabled: true,
            outputVariable: "rows",
            tableNodeId: "entity-conv",
            dbRefNodeId: "db-ref-conv",
            operationId: "auto-index-conversations-idx_creator-0",
            functionRef: {
              name: "findAllConversationsByCreator",
              importPath: "@workspace/db/helpers/conversations",
              signature: "findAllConversationsByCreator(createdBy: string): Promise<Conversations[]>",
            },
            inputBindings: [{ argName: "createdBy", source: { kind: "inline", value: "u1" } }],
          },
        ],
      },
      {
        id: "ep-post",
        nodeId: "srv-ai",
        name: "/create-conversation",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-post",
            name: "createConv",
            type: "db_operation",
            enabled: true,
            outputVariable: "created",
            tableNodeId: "entity-conv",
            operationId: "auto-create-conversations",
            functionRef: {
              name: "createConversation",
              importPath: "@workspace/db/helpers/conversations",
              signature: "createConversation({ title, created_by }: CreateConversationsData): Promise<Conversations>",
            },
            inputBindings: [
              { argName: "title", source: { kind: "req_body", field: "title" } },
              { argName: "created_by", source: { kind: "req_body", field: "created_by" } },
            ],
          },
        ],
      },
    ];

    const compiledSvc = compileServiceNode(
      serviceNode,
      endpoints,
      [],
      allNodes,
      allEdges,
      [],
      compiledDb.reusableFunctions,
    );

    const getRoute = compiledSvc.files.find((f) => f.filename.includes("getConversationsUser.ts"));
    expect(getRoute).toBeDefined();
    expect(getRoute!.content).toContain('@workspace/db/helpers/conversati"');
    expect(getRoute!.content).toContain("findAllConversatisByCreator");
    expect(getRoute!.content).not.toContain("findAllConversationsByCreator");
    expect(getRoute!.content).not.toContain("@workspace/db/helpers/conversations");

    const postRoute = compiledSvc.files.find((f) => f.filename.includes("postCreateConversation.ts"));
    expect(postRoute).toBeDefined();
    expect(postRoute!.content).toContain('@workspace/db/helpers/conversati"');
    expect(postRoute!.content).toContain("createConversati(");
    expect(postRoute!.content).not.toContain("createConversation(");
    expect(postRoute!.content).not.toContain("@workspace/db/helpers/conversations");
  });

  it('should normalize "test table" consistently to "test_table" across DDL, sync, and CRUD helpers for Postgres and SQLite', () => {
    const testTableEntity: BackendNode = {
      id: "ent-test-table",
      type: "entity",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "test table",
        columns: [
          { name: "id", type: "UUID", isPrimaryKey: true, isNotNull: true },
          { name: "title", type: "TEXT", isNotNull: true },
        ],
      },
    };

    // 1. SQLite (no explicit dbNode)
    const sqliteCompiled = compileDatabaseNodes([testTableEntity], []);
    const sqliteConn = sqliteCompiled.files.find((f) => f.filename.endsWith("connection.ts"));
    const sqliteHelper = sqliteCompiled.files.find((f) => f.filename.endsWith("helpers/testTable.ts"));
    expect(sqliteConn?.content).toContain('CREATE TABLE IF NOT EXISTS \\"test_table\\"');
    expect(sqliteConn?.content).not.toContain('\\"test table\\"');
    expect(sqliteHelper?.content).toContain("FROM test_table");
    expect(sqliteHelper?.content).toContain("INTO test_table");
    expect(sqliteHelper?.content).toContain("UPDATE test_table");
    expect(sqliteHelper?.content).not.toContain("test table");

    // 2. Postgres
    const pgDbNode: BackendNode = {
      id: "db-pg",
      type: "database",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: { label: "pg", dbEngine: "postgres" },
    };
    const pgCompiled = compileDatabaseNodes([pgDbNode, { ...testTableEntity, data: { ...testTableEntity.data, databaseId: "db-pg" } }], []);
    const pgSchema = pgCompiled.files.find((f) => f.filename.endsWith("schema.sql"));
    const pgHelper = pgCompiled.files.find((f) => f.filename.endsWith("helpers/testTable.ts"));
    const pgSync = pgCompiled.files.find((f) => f.filename.endsWith("sync.ts"));
    expect(pgSchema?.content).toContain('CREATE TABLE IF NOT EXISTS "test_table"');
    expect(pgSchema?.content).not.toContain('"test table"');
    expect(pgHelper?.content).toContain('FROM "test_table"');
    expect(pgHelper?.content).toContain('INTO "test_table"');
    expect(pgHelper?.content).toContain('UPDATE "test_table"');
    expect(pgSync?.content).toContain("def?.tableName || tableName.trim().replace(/\\s+/g, \"_\")");
  });

  it('should disambiguate "user" and "users" tables without overwriting helpers, types, or DB operations in Postgres and SQLite', () => {
    const userEntity = makeEntityNode("ent-user", "user", [
      { name: "id", type: "UUID", isPrimaryKey: true, isNotNull: true },
      { name: "email", type: "TEXT", isNotNull: true },
    ]);
    const usersEntity = makeEntityNode("ent-users", "users", [
      { name: "id", type: "UUID", isPrimaryKey: true, isNotNull: true },
      { name: "handle", type: "TEXT", isNotNull: true },
    ]);

    // 1. PostgreSQL
    const pgDbNode: BackendNode = {
      id: "db-pg",
      type: "database",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: { label: "Primary DB", dbEngine: "postgres" },
    };
    const pgNodes = [
      pgDbNode,
      { ...userEntity, data: { ...userEntity.data, databaseId: "db-pg" } },
      { ...usersEntity, data: { ...usersEntity.data, databaseId: "db-pg" } },
    ];
    const pgCompiled = compileDatabaseNodes(pgNodes, []);
    const pgPkg = pgCompiled.packages?.find((p) => p.packageName === "@workspace/db-primary-db");
    expect(pgPkg).toBeDefined();

    const pgUserHelper = pgPkg!.files.find((f) => f.filename === "helpers/user.ts");
    const pgUsersHelper = pgPkg!.files.find((f) => f.filename === "helpers/users.ts");
    expect(pgUserHelper).toBeDefined();
    expect(pgUsersHelper).toBeDefined();

    // Each helper file keeps its own table SQL and non-colliding symbols
    expect(pgUserHelper!.content).toContain('FROM "user"');
    expect(pgUserHelper!.content).toContain("export async function findAllUser(");
    expect(pgUserHelper!.content).toContain("export async function createUser(");
    expect(pgUserHelper!.content).not.toContain('FROM "users"');
    expect(pgUserHelper!.content).not.toContain("export type Users = User");

    expect(pgUsersHelper!.content).toContain('FROM "users"');
    expect(pgUsersHelper!.content).toContain("export async function findAllUsers(");
    expect(pgUsersHelper!.content).toContain("export async function createUsers(");
    expect(pgUsersHelper!.content).not.toContain('FROM "user"');
    expect(pgUsersHelper!.content).not.toContain("export type User = Users");

    // Barrel exports both sets without dropping either
    const pgBarrel = pgPkg!.files.find((f) => f.filename === "helpers/index.ts");
    expect(pgBarrel!.content).toContain("findAllUser");
    expect(pgBarrel!.content).toContain("createUser");
    expect(pgBarrel!.content).toContain("findAllUsers");
    expect(pgBarrel!.content).toContain("createUsers");

    // Root @workspace/db forwarders point each path to its own file
    const rootUserForwarder = pgCompiled.files.find((f) => f.filename === "packages/db/helpers/user.ts");
    const rootUsersForwarder = pgCompiled.files.find((f) => f.filename === "packages/db/helpers/users.ts");
    expect(rootUserForwarder?.content).toContain("helpers/user");
    expect(rootUsersForwarder?.content).toContain("helpers/users");

    // Shared @workspace/types emits both interfaces separately
    const entitiesCode = generateEntitiesModule([userEntity, usersEntity]);
    expect(entitiesCode).toContain("export interface User {");
    expect(entitiesCode).toContain("export interface Users {");
    expect(entitiesCode).not.toContain("export type Users = User;");
    expect(entitiesCode).not.toContain("export type User = Users;");

    // Service pipeline resolution keeps user vs users routes pointed at their respective helper & function
    const serviceNode: BackendNode = {
      id: "srv-users",
      type: "service",
      fractionalIndex: "a3",
      position: { x: 400, y: 0 },
      data: { label: "users-service", techStack: "express", port: "8080" },
    };
    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-user",
        nodeId: "srv-users",
        name: "/auth-user",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-user",
            name: "createAuthUser",
            type: "db_operation",
            enabled: true,
            outputVariable: "created",
            tableNodeId: "ent-user",
            operationId: "auto-create-user",
            functionRef: { name: "createUser", importPath: "@workspace/db/helpers/user" },
            inputBindings: [{ argName: "email", source: { kind: "req_body", field: "email" } }],
          },
        ],
      },
      {
        id: "ep-users",
        nodeId: "srv-users",
        name: "/directory-users",
        type: "POST",
        pipelineSteps: [
          {
            id: "step-users",
            name: "createDirUsers",
            type: "db_operation",
            enabled: true,
            outputVariable: "created",
            tableNodeId: "ent-users",
            operationId: "auto-create-users",
            functionRef: { name: "createUsers", importPath: "@workspace/db/helpers/users" },
            inputBindings: [{ argName: "handle", source: { kind: "req_body", field: "handle" } }],
          },
        ],
      },
    ];
    const svcCompiled = compileServiceNode(
      serviceNode,
      endpoints,
      [],
      [...pgNodes, serviceNode],
      [],
      [],
      pgCompiled.reusableFunctions,
    );
    const userRoute = svcCompiled.files.find((f) => f.filename.includes("postAuthUser.ts"));
    const usersRoute = svcCompiled.files.find((f) => f.filename.includes("postDirectoryUsers.ts"));
    expect(userRoute?.content).toContain('@workspace/db/helpers/user"');
    expect(userRoute?.content).toContain("createUser(");
    expect(usersRoute?.content).toContain('@workspace/db/helpers/users"');
    expect(usersRoute?.content).toContain("createUsers(");

    // 2. SQLite (default raw sqlite)
    const sqliteCompiled = compileDatabaseNodes([userEntity, usersEntity], []);
    const sqliteUserHelper = sqliteCompiled.files.find((f) => f.filename === "helpers/user.ts");
    const sqliteUsersHelper = sqliteCompiled.files.find((f) => f.filename === "helpers/users.ts");
    expect(sqliteUserHelper).toBeDefined();
    expect(sqliteUsersHelper).toBeDefined();
    expect(sqliteUserHelper!.content).toContain("FROM user ");
    expect(sqliteUserHelper!.content).toContain("export function findAllUser(");
    expect(sqliteUserHelper!.content).toContain("export function createUser(");
    expect(sqliteUsersHelper!.content).toContain("FROM users ");
    expect(sqliteUsersHelper!.content).toContain("export function findAllUsers(");
    expect(sqliteUsersHelper!.content).toContain("export function createUsers(");
  });
});
