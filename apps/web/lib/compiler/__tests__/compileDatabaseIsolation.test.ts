import { describe, it, expect } from "vitest";
import { compileMonorepo } from "../compileMonorepo";
import { compileDatabaseNodes } from "../compileDatabaseNodes";
import { BackendNode, BackendEdge } from "@/types/canvas";

describe("Database Isolation & Multi-Engine Architecture under packages/db/*", () => {
  it("should compile isolated packages for multiple database nodes with different engines", () => {
    // 1. Database Nodes
    const postgresDbNode: BackendNode = {
      id: "node-db-orders",
      type: "database",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "orders",
        dbEngine: "postgres",
        connectionStringEnv: "ORDERS_DATABASE_URL",
      },
    };

    const convexDbNode: BackendNode = {
      id: "node-db-convex",
      type: "database",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "chat-sync",
        dbEngine: "convex",
      },
    };

    const sqliteDbNode: BackendNode = {
      id: "node-db-auth",
      type: "database",
      position: { x: 600, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "auth",
        dbEngine: "sqlite",
      },
    };

    // 2. Entity Nodes attached to specific DBs
    const orderEntity: BackendNode = {
      id: "node-entity-order",
      type: "entity",
      position: { x: 0, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "Order",
        databaseId: "node-db-orders",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "totalAmount", type: "number", isNotNull: true },
          { name: "status", type: "string" },
        ],
      },
    };

    const chatMessageEntity: BackendNode = {
      id: "node-entity-chat",
      type: "entity",
      position: { x: 300, y: 200 },
      fractionalIndex: "a4",
      data: {
        label: "ChatMessage",
        databaseId: "node-db-convex",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "sender", type: "string", isNotNull: true },
          { name: "content", type: "string", isNotNull: true },
        ],
      },
    };

    const userEntity: BackendNode = {
      id: "node-entity-user",
      type: "entity",
      position: { x: 600, y: 200 },
      fractionalIndex: "a5",
      data: {
        label: "User",
        databaseId: "node-db-auth",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "email", type: "string", isNotNull: true, isUnique: true },
        ],
      },
    };

    const nodes = [
      postgresDbNode,
      convexDbNode,
      sqliteDbNode,
      orderEntity,
      chatMessageEntity,
      userEntity,
    ];

    const edges: BackendEdge[] = [
      {
        id: "e1",
        source: "node-db-orders",
        target: "node-entity-order",
        type: "database-connection",
        fractionalIndex: "a0",
      },
      {
        id: "e2",
        source: "node-db-convex",
        target: "node-entity-chat",
        type: "database-connection",
        fractionalIndex: "a1",
      },
      {
        id: "e3",
        source: "node-db-auth",
        target: "node-entity-user",
        type: "database-connection",
        fractionalIndex: "a2",
      },
    ];

    const compiledDb = compileDatabaseNodes(nodes, edges);

    // Verify isolated packages plus central @workspace/db package were returned
    expect(compiledDb.packages).toBeDefined();
    expect(compiledDb.packages?.length).toBe(4);

    const rootPkg = compiledDb.packages?.find((p) => p.packageName === "@workspace/db");
    expect(rootPkg).toBeDefined();
    expect(rootPkg?.packageFolder).toBe("");

    const ordersPkg = compiledDb.packages?.find((p) => p.dbEngine === "postgres" && p.packageFolder === "orders");
    expect(ordersPkg).toBeDefined();
    expect(ordersPkg?.packageName).toBe("@workspace/db-orders");
    expect(ordersPkg?.files.some((f) => f.filename === "connection.ts")).toBe(true);
    expect(ordersPkg?.files.some((f) => f.filename === "helpers/order.ts")).toBe(true);

    const convexPkg = compiledDb.packages?.find((p) => p.dbEngine === "convex" && p.packageFolder === "chat-sync");
    expect(convexPkg).toBeDefined();
    expect(convexPkg?.packageName).toBe("@workspace/db-chat-sync");
    expect(convexPkg?.files.some((f) => f.filename === "convex/schema.ts")).toBe(true);

    const authPkg = compiledDb.packages?.find((p) => p.dbEngine === "sqlite" && p.packageFolder === "auth");
    expect(authPkg).toBeDefined();
    expect(authPkg?.packageName).toBe("@workspace/db-auth");
    expect(authPkg?.files.some((f) => f.filename === "connection.ts")).toBe(true);

    // Verify monorepo compilation organizes packages into packages/db/<folder> and central packages/db
    const monorepo = compileMonorepo(nodes, [], [], edges, [], "MultiDbApp");

    const pnpmWorkspace = monorepo.files.find((f) => f.filename === "pnpm-workspace.yaml");
    expect(pnpmWorkspace?.content).toContain('- "packages/db/*"');

    // Check central packages/db files in monorepo
    expect(monorepo.files.some((f) => f.filename === "packages/db/package.json")).toBe(true);
    expect(monorepo.files.some((f) => f.filename === "packages/db/connection.ts")).toBe(true);

    // Check Postgres package files in monorepo
    expect(monorepo.files.some((f) => f.filename === "packages/db/orders/package.json")).toBe(true);
    expect(monorepo.files.some((f) => f.filename === "packages/db/orders/connection.ts")).toBe(true);

    // Check Convex package files in monorepo
    expect(monorepo.files.some((f) => f.filename === "packages/db/chat-sync/package.json")).toBe(true);
    expect(monorepo.files.some((f) => f.filename === "packages/db/chat-sync/convex/schema.ts")).toBe(true);

    // Check SQLite package files in monorepo
    expect(monorepo.files.some((f) => f.filename === "packages/db/auth/package.json")).toBe(true);
    expect(monorepo.files.some((f) => f.filename === "packages/db/auth/connection.ts")).toBe(true);
  });

  it("should support single MySQL database node cleanly", () => {
    const mysqlDbNode: BackendNode = {
      id: "node-db-mysql",
      type: "database",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Primary MySQL",
        dbEngine: "mysql",
      },
    };

    const productEntity: BackendNode = {
      id: "node-entity-prod",
      type: "entity",
      position: { x: 0, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "Product",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "name", type: "string", isNotNull: true },
          { name: "price", type: "number" },
        ],
      },
    };

    const monorepo = compileMonorepo([mysqlDbNode, productEntity], [], [], [], [], "MysqlApp");

    const packageJsonFile = monorepo.files.find((f) => f.filename === "packages/db/primary-mysql/package.json");
    expect(packageJsonFile).toBeDefined();
    expect(packageJsonFile?.content).toContain('"mysql2"');
    const parsedPkg = JSON.parse(packageJsonFile!.content);
    expect(parsedPkg.name).toBe("@workspace/db-primary-mysql");

    // Central @workspace/db depends on the isolated package
    const rootPkgFile = monorepo.files.find((f) => f.filename === "packages/db/package.json");
    expect(rootPkgFile).toBeDefined();
    const parsedRootPkg = JSON.parse(rootPkgFile!.content);
    expect(parsedRootPkg.dependencies?.["@workspace/db-primary-mysql"]).toBe("workspace:*");

    const connFile = monorepo.files.find((f) => f.filename === "packages/db/primary-mysql/connection.ts");
    expect(connFile?.content).toContain('import mysql from "mysql2/promise"');

    // Central connection re-exports from isolated package
    const rootConnFile = monorepo.files.find((f) => f.filename === "packages/db/connection.ts");
    expect(rootConnFile?.content).toContain('export * from "./primary-mysql/connection"');
  });

  it("should preserve single SQLite database backward compatibility", () => {
    const userEntity: BackendNode = {
      id: "node-entity-user",
      type: "entity",
      position: { x: 0, y: 200 },
      fractionalIndex: "a0",
      data: {
        label: "User",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "email", type: "string" },
        ],
      },
    };

    const monorepo = compileMonorepo([userEntity], [], [], [], [], "SqliteApp");

    const packageJsonFile = monorepo.files.find((f) => f.filename === "packages/db/package.json");
    expect(packageJsonFile).toBeDefined();
    expect(packageJsonFile?.content).toContain('"better-sqlite3"');

    const connFile = monorepo.files.find((f) => f.filename === "packages/db/connection.ts");
    expect(connFile?.content).toContain('resolveDatabasePath');
  });
});
