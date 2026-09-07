import { describe, it, expect } from "vitest";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";

describe("compileMonorepo centralized SQLite database architecture", () => {
  it("should generate centralized database connection and consistent env configs across web, services, and auth", () => {
    const webNode: BackendNode = {
      id: "node-web-1",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/dashboard",
        appSlug: "customer-portal",
        appName: "Customer Portal",
        routeGroup: "private",
        accessType: "private",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-1",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "OrderService",
        port: "8080",
      },
    };

    const authNode: BackendNode = {
      id: "node-auth-1",
      type: "auth",
      position: { x: 200, y: -200 },
      fractionalIndex: "a2",
      data: {
        label: "AuthServer",
        framework: "better_auth",
        version: "v1.6",
        port: "3001",
        baseUrl: "http://localhost:3001",
      },
    };

    const userEntityNode: BackendNode = {
      id: "node-entity-user",
      type: "entity",
      position: { x: 200, y: 300 },
      fractionalIndex: "a3",
      data: {
        label: "User",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "email", type: "string", isUnique: true, isNotNull: true },
          { name: "name", type: "string" },
        ],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-orders",
        nodeId: "node-service-1",
        name: "/api/orders",
        type: "GET",
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-auth-web",
        source: "node-auth-1",
        target: "node-web-1",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "edge-web-service",
        source: "node-web-1",
        target: "node-service-1",
        type: "connection",
        fractionalIndex: "a1",
      },
    ];

    const result = compileMonorepo(
      [webNode, serviceNode, authNode, userEntityNode],
      endpoints,
      [],
      edges,
      [],
      "TestCentralizedMonorepo",
    );

    // 1. Verify packages/db/connection.ts has centralized resolveDatabasePath
    const dbConnectionFile = result.files.find(
      (f) => f.filename === "packages/db/connection.ts",
    );
    expect(dbConnectionFile).toBeDefined();
    expect(dbConnectionFile?.content).toContain("resolveDatabasePath");
    expect(dbConnectionFile?.content).toContain("pnpm-workspace.yaml");
    expect(dbConnectionFile?.content).toContain("packages");
    expect(dbConnectionFile?.content).toContain("sqlite.db");
    expect(dbConnectionFile?.content).toContain('db.pragma("journal_mode = WAL")');
    expect(dbConnectionFile?.content).toContain('db.pragma("foreign_keys = ON")');

    // 2. Verify Web app .env and .env.example point to centralized packages/db/sqlite.db
    const webEnvFile = result.files.find(
      (f) => f.filename === "apps/customer-portal/.env",
    );
    expect(webEnvFile).toBeDefined();
    expect(webEnvFile?.content).toContain("DATABASE_PATH=../../packages/db/sqlite.db");
    expect(webEnvFile?.content).toContain("DATABASE_URL=../../packages/db/sqlite.db");

    const webEnvExampleFile = result.files.find(
      (f) => f.filename === "apps/customer-portal/.env.example",
    );
    expect(webEnvExampleFile).toBeDefined();
    expect(webEnvExampleFile?.content).toContain("DATABASE_PATH=../../packages/db/sqlite.db");
    expect(webEnvExampleFile?.content).toContain("DATABASE_URL=");

    // 3. Verify Backend Service .env points to centralized packages/db/sqlite.db
    const serviceEnvFile = result.files.find(
      (f) => f.filename === "apps/orderservice/.env",
    );
    expect(serviceEnvFile).toBeDefined();
    expect(serviceEnvFile?.content).toContain("DATABASE_PATH=../../packages/db/sqlite.db");
    expect(serviceEnvFile?.content).toContain("DATABASE_URL=../../packages/db/sqlite.db");

    // 4. Verify Auth is NOT compiled as a separate service app in apps/
    expect(result.services).toHaveLength(1);
    expect(result.services[0]?.name).toBe("OrderService");
    expect(result.services[0]?.folderName).toBe("orderservice");

    const authStandaloneFiles = result.files.filter(
      (f) => f.filename.startsWith("apps/authserver/") || f.filename.startsWith("apps/auth-server/"),
    );
    expect(authStandaloneFiles).toHaveLength(0);

    // 5. Verify root .gitignore ignores sqlite database artifacts
    const gitignoreFile = result.files.find((f) => f.filename === ".gitignore");
    expect(gitignoreFile).toBeDefined();
    expect(gitignoreFile?.content).toContain("*.db");
    expect(gitignoreFile?.content).toContain("*.sqlite");
    expect(gitignoreFile?.content).toContain("*.db-wal");

    // 6. Verify all apps and packages have valid tsconfig.json files
    const rootTsconfigFile = result.files.find(
      (f) => f.filename === "tsconfig.json",
    );
    expect(rootTsconfigFile).toBeDefined();
    const rootTsconfigObj = JSON.parse(rootTsconfigFile!.content);
    const refs: { path: string }[] = rootTsconfigObj.references || [];
    refs.forEach((ref) => {
      const targetTsconfig = result.files.find(
        (f) => f.filename === `${ref.path}/tsconfig.json`,
      );
      expect(targetTsconfig).toBeDefined();
    });

    // 7. Verify Next.js web app has its own integrated auth route handler, auth client, and auth.ts
    const nextAuthRoute = result.files.find(
      (f) => f.filename === "apps/customer-portal/app/api/auth/[...all]/route.ts",
    );
    expect(nextAuthRoute).toBeDefined();
    expect(nextAuthRoute?.content).toContain("toNextJsHandler");

    const nextAuthLib = result.files.find(
      (f) => f.filename === "apps/customer-portal/lib/auth.ts",
    );
    expect(nextAuthLib).toBeDefined();
    expect(nextAuthLib?.content).toContain("betterAuth");

    const nextAuthClient = result.files.find(
      (f) => f.filename === "apps/customer-portal/lib/auth-client.ts",
    );
    expect(nextAuthClient).toBeDefined();
    expect(nextAuthClient?.content).toContain("createAuthClient");
  });

  it("should generate type-compatible create functions for numeric primary keys and untitled tables", () => {
    const numericEntityNode: BackendNode = {
      id: "node-entity-product",
      type: "entity",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Product",
        columns: [
          { name: "id", type: "integer", isPrimaryKey: true },
          { name: "title", type: "string" },
        ],
      },
    };

    const untitledTableNode: BackendNode = {
      id: "node-entity-untitled",
      type: "entity",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Untitled Table",
        columns: [
          { name: "id", type: "number", isPrimaryKey: true },
        ],
      },
    };

    const result = compileMonorepo(
      [numericEntityNode, untitledTableNode],
      [],
      [],
      [],
      [],
      "TestCentralizedMonorepo",
    );

    const productHelper = result.files.find(
      (f) => f.filename === "packages/db/helpers/product.ts",
    );
    expect(productHelper).toBeDefined();
    expect(productHelper?.content).toContain("Number(info.lastInsertRowid)");
    expect(productHelper?.content).not.toContain("info.lastInsertRowid.toString()");

    const untitledHelper = result.files.find(
      (f) => f.filename === "packages/db/helpers/untitledTable.ts",
    );
    expect(untitledHelper?.content).toContain('return { id: _rowId, message: "UntitledTable created successfully" } as unknown as UntitledTableRow;');
  });

  it("should deduplicate duplicate operations and prepared statements in helper files", () => {
    const accountNode: BackendNode = {
      id: "node-entity-account",
      type: "entity",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Account",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "userId", type: "string", isForeignKey: true },
        ],
        indexes: [
          { name: "idx_account_userId", columns: "userId" },
          { name: "idx_account_user_id", columns: "userId" },
        ],
        dbOperations: [
          {
            id: "op-1",
            name: "findAccountsByUserId",
            kind: "fetchByIndex",
            code: `const stmtFindAccountsByUserId = db.prepare<[userId: string, limit?: number, offset?: number], AccountRow>(\n  "SELECT * FROM account WHERE userId = ? LIMIT ? OFFSET ?"\n);\n\nexport function findAccountsByUserId(userId: string, limit: number = 20, offset: number = 0): AccountRow[] {\n  return stmtFindAccountsByUserId.all(userId, limit, offset) as unknown as AccountRow[];\n}`,
            enabled: true,
          },
          {
            id: "op-2",
            name: "findAccountsByUserId",
            kind: "fetchByIndex",
            code: `const stmtFindAccountsByUserId = db.prepare<[userId: string, limit?: number, offset?: number], AccountRow>(\n  "SELECT * FROM account WHERE userId = ? LIMIT ? OFFSET ?"\n);\n\nexport function findAccountsByUserId(userId: string, limit: number = 20, offset: number = 0): AccountRow[] {\n  return stmtFindAccountsByUserId.all(userId, limit, offset) as unknown as AccountRow[];\n}`,
            enabled: true,
          },
          {
            id: "op-3",
            name: "findAccountByIdWithUser",
            kind: "join",
            code: `const stmtFindAccountByIdWithUser = db.prepare<[id: string]>(\n  "SELECT * FROM account WHERE id = ?"\n);\n\nexport function findAccountByIdWithUser(id: string): AccountWithUserRow | undefined {\n  return stmtFindAccountByIdWithUser.get(id) as unknown as AccountWithUserRow | undefined;\n}`,
            enabled: true,
          },
          {
            id: "op-4",
            name: "findAccountByIdWithUser",
            kind: "join",
            code: `const stmtFindAccountByIdWithUser = db.prepare<[id: string]>(\n  "SELECT * FROM account WHERE id = ?"\n);\n\nexport function findAccountByIdWithUser(id: string): AccountWithUserRow | undefined {\n  return stmtFindAccountByIdWithUser.get(id) as unknown as AccountWithUserRow | undefined;\n}`,
            enabled: true,
          },
        ],
      },
    };

    const userNode: BackendNode = {
      id: "node-entity-user",
      type: "entity",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "User",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "email", type: "string" },
        ],
      },
    };

    const result = compileMonorepo(
      [accountNode, userNode],
      [],
      [],
      [],
      [],
      "TestCentralizedMonorepo",
    );

    const accountHelper = result.files.find(
      (f) => f.filename === "packages/db/helpers/account.ts",
    );
    expect(accountHelper).toBeDefined();
    const content = accountHelper?.content || "";

    const stmtMatches = content.match(/stmtFindAccountsByUserId/g) || [];
    // Should be prepared once and called in function
    expect(stmtMatches.length).toBeLessThanOrEqual(2);

    const fnMatches = content.match(/function findAccountsByUserId/g) || [];
    expect(fnMatches.length).toBe(1);

    const joinStmtMatches = content.match(/stmtFindAccountByIdWithUser/g) || [];
    expect(joinStmtMatches.length).toBeLessThanOrEqual(2);

    const joinFnMatches = content.match(/function findAccountByIdWithUser/g) || [];
    expect(joinFnMatches.length).toBe(1);
  });

  it("should sanitize legacy custom dbOperations containing unsafe casts and string rowIds for numeric tables", () => {
    const legacyNode: BackendNode = {
      id: "node-entity-legacy",
      type: "entity",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Legacy Table",
        columns: [
          { name: "id", type: "number", isPrimaryKey: true },
        ],
        dbOperations: [
          {
            id: "legacy-create",
            name: "createLegacyTable",
            kind: "create",
            code: `export function createLegacyTable(): LegacyTableRow {\n  const info = db.prepare("INSERT INTO legacy_table DEFAULT VALUES").run();\n  const _rowId = typeof info.lastInsertRowid === "bigint" ? info.lastInsertRowid.toString() : String(info.lastInsertRowid);\n  return { id: _rowId } as LegacyTableRow;\n}`,
            enabled: true,
          },
        ],
      },
    };

    const result = compileMonorepo(
      [legacyNode],
      [],
      [],
      [],
      [],
      "TestCentralizedMonorepo",
    );

    const legacyHelper = result.files.find(
      (f) => f.filename === "packages/db/helpers/legacyTable.ts",
    );
    expect(legacyHelper?.content).toContain('return { id: _rowId, message: "LegacyTable created successfully" } as unknown as LegacyTableRow;');
  });

  it("should NOT compile packages/db or db helpers on an empty project", () => {
    const result = compileMonorepo([], [], [], [], [], "EmptyMonorepo");

    // 1. Verify NO packages/db files exist
    const dbFiles = result.files.filter((f) => f.filename.startsWith("packages/db/"));
    expect(dbFiles).toHaveLength(0);

    // 2. Verify root tsconfig does NOT reference packages/db
    const rootTsconfig = result.files.find((f) => f.filename === "tsconfig.json");
    expect(rootTsconfig).toBeDefined();
    expect(rootTsconfig?.content).not.toContain('"path": "packages/db"');

    // 3. Verify @workspace/types devDependencies does NOT include @workspace/db
    const typesPkg = result.files.find((f) => f.filename === "packages/types/package.json");
    expect(typesPkg).toBeDefined();
    const parsedTypesPkg = JSON.parse(typesPkg!.content);
    expect(parsedTypesPkg.devDependencies?.["@workspace/db"]).toBeUndefined();

    // 4. Verify README.md does NOT list Database Package
    const readme = result.files.find((f) => f.filename === "README.md");
    expect(readme).toBeDefined();
    expect(readme?.content).not.toContain("Database Package");
  });

  it("should NOT compile packages/db on a service-only project without database nodes", () => {
    const serviceNode: BackendNode = {
      id: "node-service-standalone",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "BillingService",
        port: "8080",
      },
    };

    const result = compileMonorepo([serviceNode], [], [], [], [], "BillingMonorepo");

    // 1. Verify NO packages/db files exist
    const dbFiles = result.files.filter((f) => f.filename.startsWith("packages/db/"));
    expect(dbFiles).toHaveLength(0);

    // 2. Verify service package.json does NOT depend on @workspace/db
    const servicePkg = result.files.find((f) => f.filename === "apps/billingservice/package.json");
    expect(servicePkg).toBeDefined();
    const parsedServicePkg = JSON.parse(servicePkg!.content);
    expect(parsedServicePkg.dependencies?.["@workspace/db"]).toBeUndefined();

    // 3. Verify service src/lib/index.ts does NOT export from @workspace/db/helpers
    const libIndex = result.files.find((f) => f.filename === "apps/billingservice/src/lib/index.ts");
    expect(libIndex).toBeDefined();
    expect(libIndex?.content).not.toContain("@workspace/db/helpers");
  });

  it("should NOT import or transpile @workspace/db in web apps when no database is configured", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-main",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Landing Page App",
        appSlug: "web-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-home",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/home",
        appSlug: "web-app",
        appName: "Landing Page App",
        routeGroup: "public",
        accessType: "public",
      },
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-webapp-page",
        source: "node-page-home",
        target: "node-webapp-main",
        targetHandle: "public-in",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileMonorepo([webAppNode, webPageNode], [], [], edges, [], "NoDbMonorepo");

    // 1. Verify NO packages/db files exist
    const dbFiles = result.files.filter((f) => f.filename.startsWith("packages/db/"));
    expect(dbFiles).toHaveLength(0);

    // 2. Verify web app package.json does NOT depend on @workspace/db
    const webPkg = result.files.find((f) => f.filename === "apps/web-app/package.json");
    expect(webPkg).toBeDefined();
    const parsedWebPkg = JSON.parse(webPkg!.content);
    expect(parsedWebPkg.dependencies?.["@workspace/db"]).toBeUndefined();

    // 3. Verify web app next.config.mjs does NOT transpile @workspace/db
    const nextConfig = result.files.find((f) => f.filename === "apps/web-app/next.config.mjs");
    expect(nextConfig).toBeDefined();
    expect(nextConfig?.content).not.toContain('"@workspace/db"');

    // 4. Verify web app .env does NOT contain DATABASE_PATH
    const webEnv = result.files.find((f) => f.filename === "apps/web-app/.env");
    expect(webEnv).toBeDefined();
    expect(webEnv?.content).not.toContain("DATABASE_PATH");
    expect(webEnv?.content).not.toContain("DATABASE_URL");
  });

  it("should compile packages/db when a standalone SQLite database node is added", () => {
    const dbNode: BackendNode = {
      id: "node-db-primary",
      type: "database",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Primary SQLite DB",
        dbEngine: "sqlite",
      },
    };

    const result = compileMonorepo([dbNode], [], [], [], [], "SqliteDbMonorepo");

    // 1. Verify packages/db files exist
    const dbConnection = result.files.find((f) => f.filename === "packages/db/connection.ts");
    expect(dbConnection).toBeDefined();

    const dbIndex = result.files.find((f) => f.filename === "packages/db/index.ts");
    expect(dbIndex).toBeDefined();

    const dbHelpersIndex = result.files.find((f) => f.filename === "packages/db/helpers/index.ts");
    expect(dbHelpersIndex).toBeDefined();

    // 2. Verify root tsconfig references packages/db
    const rootTsconfig = result.files.find((f) => f.filename === "tsconfig.json");
    expect(rootTsconfig?.content).toContain('"path": "packages/db"');
  });

  it("should generate singular/plural compatibility views and basic/multi CRUD helpers without auto-generated complex joins", () => {
    const productsEntityNode: BackendNode = {
      id: "node-entity-products",
      type: "entity",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Products",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string" },
          { name: "created_by", type: "string", isForeignKey: true },
        ],
      },
    };

    const authNode: BackendNode = {
      id: "node-auth-1",
      type: "auth",
      position: { x: 200, y: -200 },
      fractionalIndex: "a1",
      data: {
        label: "AuthServer",
        framework: "better_auth",
        version: "v1.6",
      },
    };

    const webNode: BackendNode = {
      id: "node-web-1",
      type: "webPage",
      position: { x: 200, y: 200 },
      fractionalIndex: "a2",
      data: {
        label: "Storefront",
        appSlug: "storefront",
      },
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-auth-web",
        source: "node-auth-1",
        target: "node-web-1",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileMonorepo(
      [productsEntityNode, authNode, webNode],
      [],
      [],
      edges,
      [],
      "ProductsAuthMonorepo",
    );

    // 1. Verify packages/db/connection.ts includes table DDLs and compatibility views
    const dbConn = result.files.find((f) => f.filename === "packages/db/connection.ts");
    expect(dbConn).toBeDefined();
    expect(dbConn?.content).toContain('CREATE TABLE IF NOT EXISTS \\"products\\"');
    expect(dbConn?.content).toContain('CREATE TABLE IF NOT EXISTS \\"user\\"');
    expect(dbConn?.content).toContain('CREATE VIEW IF NOT EXISTS \\"users\\" AS SELECT * FROM \\"user\\"');

    // 2. Verify packages/db/helpers/products.ts does NOT generate the complex join helper with user, but contains basic & multi CRUD
    const productsHelper = result.files.find((f) => f.filename === "packages/db/helpers/products.ts");
    expect(productsHelper).toBeDefined();
    expect(productsHelper?.content).not.toContain("findProductByIdWithUser");
    expect(productsHelper?.content).not.toContain("LEFT JOIN");
    expect(productsHelper?.content).toContain("findAllProducts");
    expect(productsHelper?.content).toContain("findProductById");
    expect(productsHelper?.content).toContain("createProduct");
    expect(productsHelper?.content).toContain("updateProduct");
    expect(productsHelper?.content).toContain("deleteProductById");

    // 3. Verify lib/auth.ts imports db from @workspace/db/connection
    const authLib = result.files.find((f) => f.filename === "apps/storefront/lib/auth.ts");
    expect(authLib).toBeDefined();
    expect(authLib?.content).toContain('import { db } from "@workspace/db/connection"');
  });
});


