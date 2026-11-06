import { describe, it, expect } from "vitest";
import { compilePostgresDatabase } from "../databases/postgres";
import type { BackendNode } from "@/types/canvas";
import type { CanvasEntityColumn } from "@workspace/canvas/types";



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
});
