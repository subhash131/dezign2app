import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { compileDatabaseNodes } from "../compileDatabaseNodes";
import { compileRawSqliteDatabase } from "../databases/sqlite/raw";

describe("Better Auth Database Schema Alignment", () => {
  it("synthesizes all required Better Auth plugin columns when auth & payments nodes are present", () => {
    const authNode: BackendNode = {
      id: "auth-1",
      type: "auth",
      data: {
        label: "Better Auth",
        framework: "better_auth",
        version: "1.6",
        plugins: ["bearer", "admin", "organization", "jwt"],
        paymentsPlugin: {
          provider: "creem",
          apiKeyEnv: "CREEM_API_KEY",
          webhookSecretEnv: "CREEM_WEBHOOK_SECRET",
        },
      },
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
    };

    const paymentsNode: BackendNode = {
      id: "payments-1",
      type: "payments",
      data: {
        label: "Payments",
        provider: "creem",
      },
      fractionalIndex: "a1",
      position: { x: 100, y: 0 },
    };

    const edges: BackendEdge[] = [
      {
        id: "e1",
        source: "auth-1",
        target: "payments-1",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileDatabaseNodes([authNode, paymentsNode], edges);
    const connectionFile = result.files.find((f) => f.filename === "connection.ts");
    expect(connectionFile).toBeDefined();

    // Verify DDL / connection has synthesized plugin columns
    const content = connectionFile!.content;
    expect(content).toContain('"plan"');
    expect(content).toContain('"creemCustomerId"');
    expect(content).toContain('"impersonatedBy"');
    expect(content).toContain('"activeOrganizationId"');
    expect(content).toContain('"expiresAt"');
    expect(content).toContain('"alg"');
    expect(content).toContain('"crv"');
    expect(content).toContain('"publicKey"');
  });

  it("backfills pre-existing user & session canvas entities with missing auth and payments columns", () => {
    const customUserEntity: BackendNode = {
      id: "entity-user",
      type: "entity",
      fractionalIndex: "a0",
      data: {
        label: "user",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "email", type: "string" },
          { name: "customBio", type: "string" },
        ],
      },
      position: { x: 0, y: 0 },
    };

    const customSessionEntity: BackendNode = {
      id: "entity-session",
      type: "entity",
      fractionalIndex: "a1",
      data: {
        label: "session",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "token", type: "string" },
        ],
      },
      position: { x: 50, y: 0 },
    };

    const authNode: BackendNode = {
      id: "auth-1",
      type: "auth",
      fractionalIndex: "a2",
      data: {
        label: "Better Auth",
        plugins: ["bearer", "admin", "organization", "jwt"],
        paymentsPlugin: {
          provider: "creem",
          apiKeyEnv: "CREEM_API_KEY",
          webhookSecretEnv: "CREEM_WEBHOOK_SECRET",
        },
      },
      position: { x: 100, y: 0 },
    };

    const paymentsNode: BackendNode = {
      id: "payments-1",
      type: "payments",
      fractionalIndex: "a3",
      data: { label: "Payments" },
      position: { x: 150, y: 0 },
    };

    const edges: BackendEdge[] = [
      {
        id: "e1",
        source: "auth-1",
        target: "entity-user",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileDatabaseNodes(
      [customUserEntity, customSessionEntity, authNode, paymentsNode],
      edges,
    );

    // Verify helper files exist
    const userHelper = result.files.find((f) => f.filename === "helpers/user.ts");
    expect(userHelper).toBeDefined();

    // Verify custom column was preserved
    expect(userHelper!.content).toContain("customBio");
    // Verify plan and creemCustomerId were backfilled
    expect(userHelper!.content).toContain("plan");
    expect(userHelper!.content).toContain("creemCustomerId");

    const sessionHelper = result.files.find((f) => f.filename === "helpers/session.ts");
    expect(sessionHelper).toBeDefined();
    // Verify impersonatedBy and activeOrganizationId were backfilled
    expect(sessionHelper!.content).toContain("impersonatedBy");
    expect(sessionHelper!.content).toContain("activeOrganizationId");

    // Verify indexes were backfilled on entities
    expect(customUserEntity.data?.indexes).toBeDefined();
    expect(customUserEntity.data?.indexes?.some((i: { name: string }) => i.name === "idx_user_email")).toBe(true);

    expect(customSessionEntity.data?.indexes).toBeDefined();
    expect(customSessionEntity.data?.indexes?.some((i: { name: string }) => i.name === "idx_session_userId")).toBe(true);
    expect(customSessionEntity.data?.indexes?.some((i: { name: string }) => i.name === "idx_session_token")).toBe(true);
  });

  it("compileRawSqliteDatabase generates complete DDL fallbacks, tableSchemas, and indexes for Better Auth", () => {
    const result = compileRawSqliteDatabase([], []);
    const connectionFile = result.files.find((f) => f.filename === "connection.ts");
    expect(connectionFile).toBeDefined();

    const code = connectionFile!.content;

    // Verify user table has payment and admin fields in DDL and tableSchemas
    expect(code).toContain('\\"plan\\" TEXT');
    expect(code).toContain('\\"creemCustomerId\\" TEXT');
    expect(code).toContain('\\"role\\" TEXT');
    expect(code).toContain('\\"banned\\" INTEGER');

    // Verify session table has impersonatedBy and activeOrganizationId
    expect(code).toContain('\\"impersonatedBy\\" TEXT');
    expect(code).toContain('\\"activeOrganizationId\\" TEXT');

    // Verify invitation has status and role
    expect(code).toContain('\\"invitation\\"');
    expect(code).toContain('\\"status\\" TEXT');

    // Verify jwks has expiresAt, alg, crv
    expect(code).toContain('\\"jwks\\"');
    expect(code).toContain('\\"expiresAt\\" TEXT');
    expect(code).toContain('\\"alg\\" TEXT');
    expect(code).toContain('\\"crv\\" TEXT');

    // Verify fallback indexes are generated in DDL
    expect(code).toContain('CREATE UNIQUE INDEX IF NOT EXISTS \\"idx_user_email\\" ON \\"user\\" (\\"email\\")');
    expect(code).toContain('CREATE INDEX IF NOT EXISTS \\"idx_session_userId\\" ON \\"session\\" (\\"userId\\")');
    expect(code).toContain('CREATE UNIQUE INDEX IF NOT EXISTS \\"idx_session_token\\" ON \\"session\\" (\\"token\\")');
    expect(code).toContain('CREATE INDEX IF NOT EXISTS \\"idx_account_userId\\" ON \\"account\\" (\\"userId\\")');
    expect(code).toContain('CREATE INDEX IF NOT EXISTS \\"idx_verification_identifier\\" ON \\"verification\\" (\\"identifier\\")');
    expect(code).toContain('CREATE INDEX IF NOT EXISTS \\"idx_invitation_organizationId\\" ON \\"invitation\\" (\\"organizationId\\")');
    expect(code).toContain('CREATE INDEX IF NOT EXISTS \\"idx_jwks_expiresAt\\" ON \\"jwks\\" (\\"expiresAt\\")');

    // Also verify tableSchemas contains them for auto-migration
    expect(code).toContain('"name": "plan"');
    expect(code).toContain('"name": "creemCustomerId"');
    expect(code).toContain('"name": "impersonatedBy"');
    expect(code).toContain('"name": "activeOrganizationId"');
  });

  it("compileRawSqliteDatabase emits CREATE INDEX statements for canvas table nodes with custom and default indexes", () => {
    const tableNode: BackendNode = {
      id: "node-org",
      type: "entity",
      fractionalIndex: "a0",
      data: {
        label: "organization",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "name", type: "string" },
          { name: "slug", type: "string", isUnique: true },
        ],
        indexes: [
          { name: "idx_organization_slug", columns: "slug", isUnique: true },
        ],
      },
      position: { x: 0, y: 0 },
    };

    const result = compileRawSqliteDatabase([tableNode], []);
    const connectionFile = result.files.find((f) => f.filename === "connection.ts");
    expect(connectionFile).toBeDefined();

    const code = connectionFile!.content;
    expect(code).toContain('CREATE UNIQUE INDEX IF NOT EXISTS \\"idx_organization_slug\\" ON \\"organization\\" (\\"slug\\")');
  });

  it("compileRawSqliteDatabase generates correctly typed pool export and aligned stmtUpdate argument counts for all auth tables", () => {
    const authNode: BackendNode = {
      id: "auth-1",
      type: "auth",
      data: {
        label: "Better Auth",
        framework: "better_auth",
        version: "1.6",
        plugins: ["bearer", "admin", "organization", "passkey"],
      },
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
    };

    const sqliteDbNode: BackendNode = {
      id: "db-1",
      type: "database",
      data: {
        label: "primary-sqlite-db",
        dbEngine: "sqlite",
      },
      fractionalIndex: "a1",
      position: { x: 100, y: 0 },
    };

    const edge: BackendEdge = {
      id: "e1",
      source: "auth-1",
      target: "db-1",
      type: "connection",
      fractionalIndex: "a0",
    };

    const result = compileDatabaseNodes([authNode, sqliteDbNode], [edge]);
    const connectionFile = result.files.find((f) => f.filename.endsWith("connection.ts"));
    expect(connectionFile).toBeDefined();

    // 1. Verify pool export is explicitly typed as Database.Database (avoiding TS4023)
    expect(connectionFile!.content).toContain("export const pool: Database.Database = db;");

    // 2. Check all auth helper files: stmtUpdate prepare args must match stmtUpdate.run args
    const authTables = ["user", "account", "session", "verification", "organization", "member", "invitation", "passkey"];
    for (const table of authTables) {
      const helperFile = result.files.find((f) => f.filename.endsWith(`helpers/${table}.ts`));
      expect(helperFile, `helper file for ${table} must exist`).toBeDefined();
      const content = helperFile!.content;

      // Ensure stmtUpdate doesn't update createdAt
      const prepareMatch = content.match(/const stmtUpdate = db\.prepare<\[([^\]]+)\]>\(\s*"UPDATE [^"]+ SET ([^"]+) WHERE/);
      if (prepareMatch && prepareMatch[1] && prepareMatch[2]) {
        const typeArgsStr = prepareMatch[1];
        const setClause = prepareMatch[2];
        expect(setClause).not.toMatch(/\bcreated_?at\b\s*=\s*\?/i);

        // Count expected parameters in db.prepare type tuple:
        const expectedParamCount = typeArgsStr.split(",").length;

        // Find stmtUpdate.run(...) call
        const runMatch = content.match(/stmtUpdate\.run\(([^)]+)\);/);
        expect(runMatch, `stmtUpdate.run call must exist in ${table}`).toBeDefined();
        if (runMatch && runMatch[1]) {
          const runArgs = runMatch[1].split(",").map((s) => s.trim());
          expect(runArgs.length, `Argument count in stmtUpdate.run for ${table} must match prepared statement type params`).toBe(expectedParamCount);
        }
      }
    }
  });
});
