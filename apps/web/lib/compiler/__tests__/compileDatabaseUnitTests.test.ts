import { describe, it, expect } from "vitest";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";

describe("compileDatabaseUnitTests — Automated Unit Test Generation for Databases", () => {
  it("should generate connection and table helper unit tests for single SQLite database", () => {
    const dbNode: BackendNode = {
      id: "node-db-sqlite",
      type: "database",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Primary SQLite",
        dbEngine: "sqlite",
      },
    };

    const userTable: BackendNode = {
      id: "node-entity-users",
      type: "entity",
      position: { x: 100, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "users",
        databaseId: "node-db-sqlite",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "email", type: "string", isUnique: true, isNotNull: true },
          { name: "name", type: "string" },
        ],
      },
    };

    const orderTable: BackendNode = {
      id: "node-entity-orders",
      type: "entity",
      position: { x: 200, y: 100 },
      fractionalIndex: "a2",
      data: {
        label: "orders",
        databaseId: "node-db-sqlite",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "amount", type: "number", isNotNull: true },
        ],
      },
    };

    const result = compileMonorepo(
      [dbNode, userTable, orderTable],
      [],
      [],
      [],
      [],
      "TestProject",
    );

    // 1. Connection test generated inside isolated database folder
    const connTest = result.files.find(
      (f) => f.filename === "packages/db/primary-sqlite/tests/connection.test.ts",
    );
    expect(connTest).toBeDefined();
    expect(connTest?.content).toContain('describe("@workspace/db-primary-sqlite — SQLite Connection"');
    expect(connTest?.content).toContain('import { db } from "../connection"');
    expect(connTest?.content).toContain("SELECT 1 AS ping");

    // 2. Table helper tests generated inside isolated database folder
    const userHelperTest = result.files.find(
      (f) => f.filename === "packages/db/primary-sqlite/tests/helpers/users.test.ts",
    );
    expect(userHelperTest).toBeDefined();
    expect(userHelperTest?.content).toContain('describe("Table Helper: users (Users)"');
    expect(userHelperTest?.content).toContain('import * as helper from "../../helpers/users"');
    expect(userHelperTest?.content).toContain("findAllUsers");
    expect(userHelperTest?.content).toContain("findUserById");

    const orderHelperTest = result.files.find(
      (f) => f.filename === "packages/db/primary-sqlite/tests/helpers/orders.test.ts",
    );
    expect(orderHelperTest).toBeDefined();
    expect(orderHelperTest?.content).toContain('describe("Table Helper: orders (Orders)"');
    expect(orderHelperTest?.content).toContain('import * as helper from "../../helpers/orders"');
    expect(orderHelperTest?.content).toContain("findAllOrders");

    // 3. Central @workspace/db package has smoke test and re-exports
    const centralDbTest = result.files.find(
      (f) => f.filename === "packages/db/tests/db.test.ts",
    );
    expect(centralDbTest).toBeDefined();
    expect(centralDbTest?.content).toContain("@workspace/db — Central Database Package");
    expect(centralDbTest?.content).toContain("primarySqlite");

    // 4. Central package.json & tsconfig.json
    const pkgJson = result.files.find(
      (f) => f.filename === "packages/db/package.json",
    );
    expect(pkgJson).toBeDefined();
    const parsedPkg = JSON.parse(pkgJson!.content);
    expect(parsedPkg.scripts?.test).toBe("vitest run");
    expect(parsedPkg.devDependencies?.vitest).toBeDefined();
    expect(parsedPkg.dependencies?.["@workspace/db-primary-sqlite"]).toBe("workspace:*");

    const tsconfig = result.files.find(
      (f) => f.filename === "packages/db/tsconfig.json",
    );
    expect(tsconfig).toBeDefined();
    const parsedTsConfig = JSON.parse(tsconfig!.content);
    expect(parsedTsConfig.include).toContain("tests/**/*");

    // 5. Central helpers/index.ts and connection.ts forward to isolated package
    const centralConn = result.files.find(
      (f) => f.filename === "packages/db/connection.ts",
    );
    expect(centralConn?.content).toContain('export * from "./primary-sqlite/connection"');
  });

  it("should generate async connection and table helper tests for PostgreSQL database", () => {
    const dbNode: BackendNode = {
      id: "node-db-pg",
      type: "database",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Main Postgres",
        dbEngine: "postgres",
      },
    };

    const productTable: BackendNode = {
      id: "node-entity-products",
      type: "entity",
      position: { x: 100, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "products",
        databaseId: "node-db-pg",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string", isNotNull: true },
          { name: "price", type: "number" },
        ],
      },
    };

    const result = compileMonorepo(
      [dbNode, productTable],
      [],
      [],
      [],
      [],
      "TestProject",
    );

    const connTest = result.files.find(
      (f) => f.filename === "packages/db/main-postgres/tests/connection.test.ts",
    );
    expect(connTest).toBeDefined();
    expect(connTest?.content).toContain('describe("@workspace/db-main-postgres — PostgreSQL Connection"');
    expect(connTest?.content).toContain('import * as connection from "../connection"');

    // Helper test for Postgres singularized helper
    const productHelperTest = result.files.find(
      (f) => f.filename === "packages/db/main-postgres/tests/helpers/product.test.ts",
    );
    expect(productHelperTest).toBeDefined();
    expect(productHelperTest?.content).toContain('describe("Table Helper: products (Products)"');
    expect(productHelperTest?.content).toContain('import * as helper from "../../helpers/product"');

    const pkgJson = result.files.find(
      (f) => f.filename === "packages/db/package.json",
    );
    const parsedPkg = JSON.parse(pkgJson!.content);
    expect(parsedPkg.scripts?.test).toBe("vitest run");
    expect(parsedPkg.devDependencies?.vitest).toBeDefined();
    expect(parsedPkg.dependencies?.["@workspace/db-main-postgres"]).toBe("workspace:*");
  });

  it("should generate tests for multi-engine databases and central @workspace/db smoke test", () => {
    const pgNode: BackendNode = {
      id: "node-db-pg",
      type: "database",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Primary PG",
        dbEngine: "postgres",
      },
    };

    const sqliteNode: BackendNode = {
      id: "node-db-sqlite",
      type: "database",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Cache DB",
        dbEngine: "sqlite",
      },
    };

    const userTable: BackendNode = {
      id: "node-entity-users",
      type: "entity",
      position: { x: 0, y: 200 },
      fractionalIndex: "a2",
      data: {
        label: "users",
        databaseId: "node-db-pg",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
        ],
      },
    };

    const sessionTable: BackendNode = {
      id: "node-entity-sessions",
      type: "entity",
      position: { x: 300, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "sessions",
        databaseId: "node-db-sqlite",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
        ],
      },
    };

    const result = compileMonorepo(
      [pgNode, sqliteNode, userTable, sessionTable],
      [],
      [],
      [],
      [],
      "TestProject",
    );

    // Isolated PG database package tests
    const pgConnTest = result.files.find(
      (f) => f.filename.includes("tests/connection.test.ts") && f.filename.includes("primary-pg"),
    );
    expect(pgConnTest).toBeDefined();

    // Isolated SQLite database package tests
    const sqliteConnTest = result.files.find(
      (f) => f.filename.includes("tests/connection.test.ts") && f.filename.includes("cache-db"),
    );
    expect(sqliteConnTest).toBeDefined();

    // Central @workspace/db package tests/db.test.ts
    const centralDbTest = result.files.find(
      (f) => f.filename === "packages/db/tests/db.test.ts",
    );
    expect(centralDbTest).toBeDefined();
    expect(centralDbTest?.content).toContain("@workspace/db — Central Database Package");
    expect(centralDbTest?.content).toContain("primaryPg");
    expect(centralDbTest?.content).toContain("cacheDb");

    // Central package.json & tsconfig.json test configs
    const centralPkgJson = result.files.find(
      (f) => f.filename === "packages/db/package.json",
    );
    expect(centralPkgJson).toBeDefined();
    const parsedPkg = JSON.parse(centralPkgJson!.content);
    expect(parsedPkg.scripts?.test).toBe("vitest run");
    expect(parsedPkg.devDependencies?.vitest).toBeDefined();

    const centralTsConfig = result.files.find(
      (f) => f.filename === "packages/db/tsconfig.json",
    );
    expect(centralTsConfig).toBeDefined();
    const parsedTsConfig = JSON.parse(centralTsConfig!.content);
    expect(parsedTsConfig.include).toContain("tests/**/*");
  });
});
