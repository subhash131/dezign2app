import { describe, it, expect } from "vitest";
import { computeNodeDeletionDiff } from "../nodeDeletionDiff";
import { computeNodeArchitectureImpact } from "../nodeArchitectureImpact";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, AnyMessagingResource } from "@workspace/canvas/types";

describe("Canvas Node Deletion File Diff Engine", () => {
  it("correctly identifies deleted and modified files when a Service node is deleted", () => {
    const authServiceNode: BackendNode = {
      id: "node-auth-service",
      type: "service",
      position: { x: 100, y: 100 },
      fractionalIndex: "a0",
      data: {
        label: "Auth Service",
        port: "8081",
      },
    };

    const orderPaymentNode: BackendNode = {
      id: "node-order-service",
      type: "service",
      position: { x: 300, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "Order Service",
        port: "8082",
      },
    };

    const nodes = [authServiceNode, orderPaymentNode];
    const edges: BackendEdge[] = [];
    const endpoints: (Endpoint & { nodeId: string })[] = [];
    const events: (AnyMessagingResource & { nodeId: string; variant: "publish" | "consume" })[] = [];

    const diff = computeNodeDeletionDiff(
      nodes,
      endpoints,
      events,
      edges,
      [],
      "Test Monorepo",
      ["node-auth-service"],
    );

    // 1. Deleted node metadata
    expect(diff.deletedNodes.length).toBe(1);
    expect(diff.deletedNodes[0]?.id).toBe("node-auth-service");
    expect(diff.deletedNodes[0]?.label).toBe("Auth Service");
    expect(diff.deletedNodes[0]?.type).toBe("service");

    // 2. Deleted files should contain all files inside apps/auth-service/
    expect(diff.deletedFiles.length).toBeGreaterThan(0);
    expect(diff.deletedFiles.some((f) => f.startsWith("apps/auth-service/"))).toBe(true);
    expect(diff.deletedFiles.some((f) => f === "apps/auth-service/package.json")).toBe(true);

    // 3. Modified files should include root configuration / types / docker-compose
    expect(diff.modifiedFiles.length).toBeGreaterThan(0);
    expect(
      diff.modifiedFiles.some((f) => f === "docker-compose.yml" || f === "package.json" || f.includes("types")),
    ).toBe(true);

    // 4. Order service files must still exist in filesAfter
    expect(diff.filesAfter.some((f) => f.filename.startsWith("apps/order-service/"))).toBe(true);
    expect(diff.filesAfter.some((f) => f.filename.startsWith("apps/auth-service/"))).toBe(false);
  });

  it("correctly identifies deleted files when a WebPage node is deleted", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp",
      type: "webApp",
      position: { x: 100, y: 100 },
      fractionalIndex: "a0",
      data: {
        label: "Store Frontend",
        appSlug: "store-app",
      },
    };

    const checkoutPageNode: BackendNode = {
      id: "node-page-checkout",
      type: "webPage",
      position: { x: 200, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "Checkout Page",
        pageSlug: "checkout",
      },
    };

    const edge: BackendEdge = {
      id: "edge-app-page",
      source: "node-webapp",
      target: "node-page-checkout",
      type: "connection",
      sourceHandle: "public-out-1",
      targetHandle: "input-1",
      fractionalIndex: "e0",
    };

    const nodes = [webAppNode, checkoutPageNode];
    const edges = [edge];

    const diff = computeNodeDeletionDiff(
      nodes,
      [],
      [],
      edges,
      [],
      "Store Project",
      ["node-page-checkout"],
    );

    expect(diff.deletedNodes.length).toBe(1);
    expect(diff.deletedNodes[0]?.label).toBe("Checkout Page");
    expect(diff.deletedFiles.some((f) => f.includes("checkout"))).toBe(true);
  });

  it("correctly identifies deleted redis packages when a Redis instance is deleted", () => {
    const redisNode: BackendNode = {
      id: "node-redis",
      type: "redis_instance",
      position: { x: 100, y: 100 },
      fractionalIndex: "a0",
      data: {
        label: "Cache Redis",
        port: "6379",
      },
    };

    const diff = computeNodeDeletionDiff(
      [redisNode],
      [],
      [],
      [],
      [],
      "Redis Project",
      ["node-redis"],
    );

    expect(diff.deletedNodes.length).toBe(1);
    expect(diff.deletedNodes[0]?.label).toBe("Cache Redis");
    expect(diff.deletedFiles.some((f) => f.includes("redis"))).toBe(true);
  });

  it("returns zero changes when deleting non-existent node IDs", () => {
    const serviceNode: BackendNode = {
      id: "node-1",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: { label: "Test Service" },
    };

    const diff = computeNodeDeletionDiff(
      [serviceNode],
      [],
      [],
      [],
      [],
      "Test Project",
      ["non-existent-id"],
    );

    expect(diff.deletedNodes.length).toBe(0);
    expect(diff.deletedFiles.length).toBe(0);
    expect(diff.modifiedFiles.length).toBe(0);
    expect(diff.totalAffectedCount).toBe(0);
  });

  it("correctly identifies deleted files when a Database node is deleted", () => {
    const dbNode: BackendNode = {
      id: "node-postgres",
      type: "database",
      position: { x: 100, y: 100 },
      fractionalIndex: "a0",
      data: {
        label: "Main Postgres",
        dbEngine: "postgres",
        port: "5432",
      },
    };

    const tableNode: BackendNode = {
      id: "node-users-table",
      type: "entity",
      parentId: "node-postgres",
      position: { x: 120, y: 120 },
      fractionalIndex: "a1",
      data: {
        label: "users",
        columns: [
          { name: "id", type: "UUID", isPrimaryKey: true },
          { name: "email", type: "TEXT" },
        ],
      },
    };

    const diff = computeNodeDeletionDiff(
      [dbNode, tableNode],
      [],
      [],
      [],
      [],
      "DB Project",
      ["node-postgres"],
    );

    expect(diff.deletedNodes.length).toBe(2);
    expect(diff.deletedFiles.length + diff.modifiedFiles.length).toBeGreaterThan(0);
    expect(diff.filesAfter.some((f) => f.filename.includes("users"))).toBe(false);
  });

  it("correctly identifies deleted files when a LangGraph node is deleted", () => {
    const langgraphNode: BackendNode = {
      id: "node-lg-agent",
      type: "langgraph",
      position: { x: 100, y: 100 },
      fractionalIndex: "a0",
      data: {
        label: "AI Support Agent",
      },
    };

    const diff = computeNodeDeletionDiff(
      [langgraphNode],
      [],
      [],
      [],
      [],
      "AI Project",
      ["node-lg-agent"],
    );

    expect(diff.deletedNodes.length).toBe(1);
    expect(diff.deletedNodes[0]?.label).toBe("AI Support Agent");
    expect(diff.deletedFiles.some((f) => f.startsWith("apps/ai-support-agent/"))).toBe(true);
  });
});

describe("Canvas Node Architecture Impact Engine", () => {
  it("correctly identifies target nodes, severed connections, and cascade-deleted child elements", () => {
    const dbNode: BackendNode = {
      id: "node-db-1",
      type: "database",
      position: { x: 100, y: 100 },
      fractionalIndex: "a0",
      data: { label: "Main Postgres", dbEngine: "postgres" },
    };

    const serviceNode: BackendNode = {
      id: "node-svc-1",
      type: "service",
      position: { x: 300, y: 100 },
      fractionalIndex: "a1",
      data: { label: "User Service", techStack: "express" },
    };

    const tableNode: BackendNode = {
      id: "node-table-1",
      type: "entity",
      position: { x: 100, y: 300 },
      fractionalIndex: "a2",
      data: { label: "users", databaseId: "node-db-1" },
    };

    const edge: BackendEdge = {
      id: "edge-1",
      source: "node-svc-1",
      target: "node-db-1",
      type: "database-connection",
      fractionalIndex: "a0",
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-1",
        nodeId: "node-svc-1",
        name: "getUsers",
        type: "GET",
      },
    ];

    // Compute impact of deleting the database
    const dbImpact = computeNodeArchitectureImpact(
      [dbNode, serviceNode, tableNode],
      [edge],
      endpoints,
      [],
      ["node-db-1"],
    );

    expect(dbImpact.targetNodes.length).toBe(1);
    expect(dbImpact.targetNodes[0]?.label).toBe("Main Postgres");

    // Severed connection to User Service
    expect(dbImpact.severedConnections.length).toBe(1);
    expect(dbImpact.severedConnections[0]?.otherNodeLabel).toBe("User Service");

    // Cascade deleted table schema
    expect(dbImpact.cascadeElements.length).toBe(1);
    expect(dbImpact.cascadeElements[0]?.label).toBe("users");
    expect(dbImpact.cascadeElements[0]?.category).toBe("schema");

    // Compute impact of deleting the service
    const svcImpact = computeNodeArchitectureImpact(
      [dbNode, serviceNode, tableNode],
      [edge],
      endpoints,
      [],
      ["node-svc-1"],
    );

    expect(svcImpact.targetNodes.length).toBe(1);
    expect(svcImpact.targetNodes[0]?.label).toBe("User Service");
    expect(svcImpact.severedConnections.length).toBe(1);
    expect(svcImpact.cascadeElements.some((e) => e.label === "getUsers")).toBe(true);
  });

  it("correctly identifies deleted table helper files and test files when an entity node is deleted", () => {
    const dbNode: BackendNode = {
      id: "node-db-1",
      type: "database",
      position: { x: 100, y: 100 },
      fractionalIndex: "a0",
      data: { label: "Main DB", dbEngine: "sqlite" },
    };

    const usersTableNode: BackendNode = {
      id: "node-table-users",
      type: "entity",
      position: { x: 100, y: 250 },
      fractionalIndex: "a1",
      data: {
        label: "users",
        databaseId: "node-db-1",
        columns: [{ name: "id", type: "string", isPrimaryKey: true }],
      },
    };

    const ordersTableNode: BackendNode = {
      id: "node-table-orders",
      type: "entity",
      position: { x: 300, y: 250 },
      fractionalIndex: "a2",
      data: {
        label: "orders",
        databaseId: "node-db-1",
        columns: [{ name: "id", type: "string", isPrimaryKey: true }],
      },
    };

    const diff = computeNodeDeletionDiff(
      [dbNode, usersTableNode, ordersTableNode],
      [],
      [],
      [],
      [],
      "Test Monorepo",
      ["node-table-users"],
    );

    expect(diff.deletedNodes.length).toBe(1);
    expect(diff.deletedNodes[0]?.id).toBe("node-table-users");

    // Deleted files should include the users helper in isolated DB, its unit test, and central forwarder
    expect(diff.deletedFiles).toContain("packages/db/main-db/helpers/users.ts");
    expect(diff.deletedFiles).toContain("packages/db/main-db/tests/helpers/users.test.ts");
    expect(diff.deletedFiles).toContain("packages/db/helpers/users.ts");

    // Orders helper and test must still remain in filesAfter
    expect(diff.filesAfter.some((f) => f.filename === "packages/db/main-db/helpers/orders.ts")).toBe(true);
    expect(diff.filesAfter.some((f) => f.filename === "packages/db/main-db/tests/helpers/orders.test.ts")).toBe(true);
    expect(diff.filesAfter.some((f) => f.filename === "packages/db/helpers/orders.ts")).toBe(true);
  });

  it("filters testCases referencing deleted nodes and includes their test files in deletedFiles", () => {
    const svcNode: BackendNode = {
      id: "node-svc-1",
      type: "service",
      position: { x: 100, y: 100 },
      fractionalIndex: "a0",
      data: { label: "Auth Service", port: "8080" },
    };

    const testCase = {
      id: "tc-1",
      name: "should verify token",
      targetNodeId: "node-svc-1",
      method: "POST",
      endpoint: "/api/token",
      expectedStatus: 200,
    };

    const diff = computeNodeDeletionDiff(
      [svcNode],
      [],
      [],
      [],
      [testCase as any],
      "Test Monorepo",
      ["node-svc-1"],
    );

    // Test file generated for Auth Service should be in deletedFiles
    expect(diff.deletedFiles.some((f) => f.includes("apps/auth-service/tests/"))).toBe(true);
    expect(diff.filesAfter.some((f) => f.filename.includes("apps/auth-service/tests/"))).toBe(false);
  });
});

