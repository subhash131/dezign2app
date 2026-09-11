import { describe, it, expect } from "vitest";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";

describe("compileMonorepo Docker generator and local runner manifests", () => {
  it("should generate PostgreSQL container only when Postgres database is configured", () => {
    const expressServiceNode: BackendNode = {
      id: "node-express-srv",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "OrderService",
        techStack: "express",
        port: "8080",
      },
    };

    const fastApiServiceNode: BackendNode = {
      id: "node-fastapi-srv",
      type: "service",
      position: { x: 300, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "PaymentService",
        techStack: "fastapi",
        port: "8000",
      },
    };

    const webClientNode: BackendNode = {
      id: "node-web-client",
      type: "webPage",
      position: { x: 150, y: -200 },
      fractionalIndex: "a2",
      data: {
        label: "/dashboard",
        appSlug: "customer-app",
        appName: "Customer App",
        routeGroup: "public",
        accessType: "public",
      },
    };

    const postgresDbNode: BackendNode = {
      id: "node-pg-db",
      type: "database",
      position: { x: 0, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "Primary Database",
        dbEngine: "postgres",
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-orders",
        nodeId: "node-express-srv",
        name: "/api/orders",
        type: "GET",
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-web-order",
        source: "node-web-client",
        target: "node-express-srv",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "edge-order-payment",
        source: "node-express-srv",
        target: "node-fastapi-srv",
        type: "connection",
        fractionalIndex: "a1",
      },
    ];

    const result = compileMonorepo(
      [expressServiceNode, fastApiServiceNode, webClientNode, postgresDbNode],
      endpoints,
      [],
      edges,
      [],
      "ShopApp",
    );

    // 1. Verify Express service Dockerfile and .dockerignore
    const expressDockerfile = result.files.find(
      (f) => f.filename === "apps/orderservice/Dockerfile",
    );
    expect(expressDockerfile).toBeDefined();
    expect(expressDockerfile?.content).toContain("FROM node:20-alpine AS base");
    expect(expressDockerfile?.content).toContain("pnpm --filter @workspace/orderservice... build");
    expect(expressDockerfile?.content).toContain("EXPOSE 8080");
    expect(expressDockerfile?.content).toContain("http://localhost:8080/health");

    const expressDockerignore = result.files.find(
      (f) => f.filename === "apps/orderservice/.dockerignore",
    );
    expect(expressDockerignore).toBeDefined();
    expect(expressDockerignore?.content).toContain("node_modules");

    // 2. Verify FastAPI service Dockerfile and .dockerignore
    const fastApiDockerfile = result.files.find(
      (f) => f.filename === "apps/paymentservice/Dockerfile",
    );
    expect(fastApiDockerfile).toBeDefined();
    expect(fastApiDockerfile?.content).toContain("FROM python:3.11-slim");
    expect(fastApiDockerfile?.content).toContain("requirements.txt");
    expect(fastApiDockerfile?.content).toContain("uvicorn main:app");
    expect(fastApiDockerfile?.content).toContain("EXPOSE 8000");

    const fastApiDockerignore = result.files.find(
      (f) => f.filename === "apps/paymentservice/.dockerignore",
    );
    expect(fastApiDockerignore).toBeDefined();
    expect(fastApiDockerignore?.content).toContain("__pycache__");

    // 3. Verify Next.js Web App Dockerfile (internal port is always 3000)
    const webDockerfile = result.files.find(
      (f) => f.filename === "apps/customer-app/Dockerfile",
    );
    expect(webDockerfile).toBeDefined();
    expect(webDockerfile?.content).toContain("FROM node:20-alpine AS base");
    expect(webDockerfile?.content).toContain("pnpm --filter @workspace/customer-app... build");
    expect(webDockerfile?.content).toContain("EXPOSE 3000");

    // 4. Verify Root docker-compose.yml has Postgres when Postgres is configured
    const dockerComposeFile = result.files.find(
      (f) => f.filename === "docker-compose.yml",
    );
    expect(dockerComposeFile).toBeDefined();
    expect(dockerComposeFile?.content).toContain("orderservice:");
    expect(dockerComposeFile?.content).toContain("paymentservice:");
    expect(dockerComposeFile?.content).toContain("customer-app:");
    expect(dockerComposeFile?.content).toContain("postgres:");
    expect(dockerComposeFile?.content).toContain("dezign2app-network");
    expect(dockerComposeFile?.content).toContain("postgres_data:");
    expect(dockerComposeFile?.content).toContain("PAYMENT_SERVICE_BASE_URL=http://paymentservice:8000");

    // 5. Verify root .dockerignore and prod start scripts
    const rootDockerignore = result.files.find((f) => f.filename === ".dockerignore");
    expect(rootDockerignore).toBeDefined();
    expect(rootDockerignore?.content).toContain("node_modules");
    expect(rootDockerignore?.content).toContain(".turbo");

    const startProdSh = result.files.find((f) => f.filename === "start-prod.sh");
    expect(startProdSh).toBeDefined();
    expect(startProdSh?.content).toContain("docker compose up --build");

    const startProdBat = result.files.find((f) => f.filename === "start-prod.bat");
    expect(startProdBat).toBeDefined();
    expect(startProdBat?.content).toContain("docker compose up --build");

    // 6. Verify dev-setup scripts
    const devSetupSh = result.files.find((f) => f.filename === "dev-setup.sh");
    expect(devSetupSh).toBeDefined();
    expect(devSetupSh?.content).toContain("pnpm dev");
    expect(devSetupSh?.content).toContain("sync-env.mjs");

    const devSetupBat = result.files.find((f) => f.filename === "dev-setup.bat");
    expect(devSetupBat).toBeDefined();
    expect(devSetupBat?.content).toContain("pnpm dev");

    // 7. Verify docker-compose.infra.yml has Postgres when Postgres is configured
    const infraCompose = result.files.find((f) => f.filename === "docker-compose.infra.yml");
    expect(infraCompose).toBeDefined();
    expect(infraCompose?.content).toContain("postgres:");
    expect(infraCompose?.content).not.toContain("orderservice:");
    expect(infraCompose?.content).not.toContain("customer-app:");
    expect(infraCompose?.content).toContain("postgres_dev_data:");

    // 8. Verify root .env.example has PostgreSQL URL
    const rootEnvExample = result.files.find((f) => f.filename === ".env.example");
    expect(rootEnvExample).toBeDefined();
    expect(rootEnvExample?.content).toContain("DATABASE_URL=");
    expect(rootEnvExample?.content).toContain("localhost:5432");

    // 9. Verify per-service .env.example files
    const expressEnvExample = result.files.find((f) => f.filename === "apps/orderservice/.env.example");
    expect(expressEnvExample).toBeDefined();
    expect(expressEnvExample?.content).toContain("PORT=8080");
    expect(expressEnvExample?.content).toContain("DATABASE_URL=");

    const fastApiEnvExample = result.files.find((f) => f.filename === "apps/paymentservice/.env.example");
    expect(fastApiEnvExample).toBeDefined();
    expect(fastApiEnvExample?.content).toContain("PORT=8000");

    const webEnvExample = result.files.find((f) => f.filename === "apps/customer-app/.env.example");
    expect(webEnvExample).toBeDefined();
    expect(webEnvExample?.content).toContain("NEXT_PUBLIC_API_URL=");

    // 10. Verify scripts/sync-env.mjs
    const syncEnvScript = result.files.find((f) => f.filename === "scripts/sync-env.mjs");
    expect(syncEnvScript).toBeDefined();
    expect(syncEnvScript?.content).toContain("syncEnv");
    expect(syncEnvScript?.content).toContain(".env.example");

    // 11. Verify root package.json has docker scripts
    const rootPackageJsonFile = result.files.find((f) => f.filename === "package.json");
    expect(rootPackageJsonFile).toBeDefined();
    const pkg = JSON.parse(rootPackageJsonFile!.content);
    expect(pkg.scripts["docker:build"]).toBe("docker compose build");
    expect(pkg.scripts["docker:up"]).toBe("docker compose up -d");
    expect(pkg.scripts["docker:down"]).toBe("docker compose down");
    expect(pkg.scripts["docker:logs"]).toBe("docker compose logs -f");
  });

  it("should NOT generate PostgreSQL container or expose port 5432 when using SQLite embedded database", () => {
    const serviceNode: BackendNode = {
      id: "node-srv-1",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "UserService",
        techStack: "express",
        port: "8080",
      },
    };

    const entityNode: BackendNode = {
      id: "node-entity-user",
      type: "entity",
      position: { x: 0, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "User",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "email", type: "string", isNotNull: true },
        ],
      },
    };

    const result = compileMonorepo(
      [serviceNode, entityNode],
      [],
      [],
      [],
      [],
      "SqliteOnlyApp",
    );

    // Root docker-compose should NOT contain a postgres container
    const dockerComposeFile = result.files.find((f) => f.filename === "docker-compose.yml");
    expect(dockerComposeFile).toBeDefined();
    expect(dockerComposeFile?.content).not.toContain("postgres:");
    expect(dockerComposeFile?.content).not.toContain("5432:5432");
    expect(dockerComposeFile?.content).toContain("DATABASE_PATH=/app/packages/db/sqlite.db");

    // docker-compose.infra.yml should NOT be generated if no redis/kafka/postgres are present
    const infraCompose = result.files.find((f) => f.filename === "docker-compose.infra.yml");
    expect(infraCompose).toBeUndefined();

    // Service .env.example should point to local sqlite.db
    const srvEnvExample = result.files.find((f) => f.filename === "apps/userservice/.env.example");
    expect(srvEnvExample).toBeDefined();
    expect(srvEnvExample?.content).toContain("DATABASE_PATH=../../packages/db/sqlite.db");
    expect(srvEnvExample?.content).not.toContain("5432");
  });
});
