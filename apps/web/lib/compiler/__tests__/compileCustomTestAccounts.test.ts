import { describe, it, expect } from "vitest";
import { compileDatabaseNodes } from "../compileDatabaseNodes";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { PersonaSeed } from "../types/testPersona";
import { toValidUuid } from "../utils";

describe("Custom Test Accounts Seeding Integration", () => {
  const authNode: BackendNode = {
    id: "auth-1",
    type: "auth",
    fractionalIndex: "a0",
    position: { x: 0, y: 0 },
    data: {
      label: "Better Auth",
      provider: "better-auth",
      databaseId: "db-1",
      plugins: ["bearer", "admin", "organization", "jwt"],
    },
  };

  const sqliteDbNode: BackendNode = {
    id: "db-1",
    type: "database",
    fractionalIndex: "a1",
    position: { x: 200, y: 0 },
    data: {
      label: "SqliteDB",
      dbEngine: "sqlite",
    },
  };

  const postgresDbNode: BackendNode = {
    id: "db-2",
    type: "database",
    fractionalIndex: "a2",
    position: { x: 200, y: 0 },
    data: {
      label: "PostgresDB",
      dbEngine: "postgres",
    },
  };

  const edge: BackendEdge = {
    id: "e-auth-db",
    source: "auth-1",
    target: "db-1",
    type: "connection",
    fractionalIndex: "e0",
  };

  const customPersonas: PersonaSeed[] = [
    {
      id: "persona_manager",
      name: "Manager Jane",
      activeAuthToken: "eyJhbGciOiJIUzI1NiJ9.custom_manager_jwt.sig",
      records: [
        {
          id: "mgr_123",
          tableName: "user",
          fields: {
            id: "mgr_123",
            name: "Manager Jane",
            email: "jane@company.com",
            role: "manager",
          },
        },
        {
          id: "sess_mgr_123",
          tableName: "session",
          fields: {
            id: "sess_mgr_123",
            userId: "mgr_123",
            token: "temp_token",
          },
        },
      ],
    },
  ];

  it("seeds SQLite database with custom test personas and real JWTs", () => {
    const dbResult = compileDatabaseNodes([authNode, sqliteDbNode], [edge], customPersonas);

    const connectionFile = dbResult.files.find((f) => f.filename.endsWith("connection.ts"));
    expect(connectionFile).toBeDefined();

    // Check that custom persona is seeded
    expect(connectionFile!.content).toContain("mgr_123");
    expect(connectionFile!.content).toContain("Manager Jane");
    expect(connectionFile!.content).toContain("jane@company.com");
    expect(connectionFile!.content).toContain("manager");
    expect(connectionFile!.content).toContain("eyJhbGciOiJIUzI1NiJ9.custom_manager_jwt.sig");

    // Check that old hardcoded fake users are NOT seeded
    expect(connectionFile!.content).not.toContain("fake_admin_1");
    expect(connectionFile!.content).not.toContain("fake_user_1");
    expect(connectionFile!.content).not.toContain("fake_superadmin_1");
  });

  it("seeds PostgreSQL schema.sql with custom test personas", () => {
    const pgEdge: BackendEdge = {
      id: "e-auth-pg",
      source: "auth-1",
      target: "db-2",
      type: "connection",
      fractionalIndex: "e1",
    };

    const dbResult = compileDatabaseNodes([authNode, postgresDbNode], [pgEdge], customPersonas);

    const schemaFile = dbResult.files.find((f) => f.filename.endsWith("schema.sql"));
    expect(schemaFile).toBeDefined();

    // Check custom persona in schema.sql (converted to valid UUID for Postgres)
    expect(schemaFile!.content).toContain('INSERT INTO "user"');
    expect(schemaFile!.content).toContain(toValidUuid("mgr_123"));
    expect(schemaFile!.content).toContain("jane@company.com");
    expect(schemaFile!.content).toContain("manager");
    expect(schemaFile!.content).toContain('ON CONFLICT ("id") DO NOTHING');

    // Check session token synced
    expect(schemaFile!.content).toContain('INSERT INTO "session"');
    expect(schemaFile!.content).toContain("eyJhbGciOiJIUzI1NiJ9.custom_manager_jwt.sig");

    // Check old hardcoded fake users are NOT seeded
    expect(schemaFile!.content).not.toContain("fake_admin_1");
    expect(schemaFile!.content).not.toContain("fake_user_1");
    expect(schemaFile!.content).not.toContain("fake_superadmin_1");
  });

  it("threads custom personas through compileMonorepo", () => {
    const monorepo = compileMonorepo(
      [authNode, sqliteDbNode],
      [],
      [],
      [edge],
      [],
      "TestProject",
      customPersonas,
    );

    const dbConn = monorepo.files.find((f) => f.filename.endsWith("sqlitedb/connection.ts"));
    expect(dbConn).toBeDefined();
    expect(dbConn!.content).toContain("Manager Jane");
    expect(dbConn!.content).toContain("jane@company.com");
    expect(dbConn!.content).toContain("eyJhbGciOiJIUzI1NiJ9.custom_manager_jwt.sig");
    expect(dbConn!.content).toContain("export async function findAuthSessionByToken");
    expect(dbConn!.content).toContain("export async function findAuthUserById");
  });

  it("generates type-safe requireAuth middleware with timingSafeEqual and valid variable scoping", async () => {
    const { generateRequireAuthMiddleware } = await import(
      "../generators/auth-providers/better-auth/v1.6/generateRequireAuthMiddleware"
    );

    const middlewareCode = generateRequireAuthMiddleware("db");

    // Verify string typing on base64 parts
    expect(middlewareCode).toContain("const headerB64: string = parts[0];");
    expect(middlewareCode).toContain("const payloadB64: string = parts[1];");
    expect(middlewareCode).toContain("const signatureB64: string = parts[2];");

    // Verify constant-time comparison & HS256 algorithm enforcement
    expect(middlewareCode).toContain("crypto.timingSafeEqual(sigBuf, expBuf)");
    expect(middlewareCode).toContain('header.alg === "HS256"');

    // Verify stateless fast-path does NOT execute write operations to "user" table
    expect(middlewareCode).not.toContain('INSERT INTO "user"');

    // Verify engine-agnostic DB auth helpers and complete elimination of 'any'
    expect(middlewareCode).toContain('import { findAuthSessionByToken, findAuthUserById } from "@workspace/db";');
    expect(middlewareCode).toContain("const session = await findAuthSessionByToken(token);");
    expect(middlewareCode).toContain("resolvedUserRecord = await findAuthUserById(resolvedUserId);");
    expect(middlewareCode).not.toContain("as any");
    expect(middlewareCode).not.toContain("dbAny");
  });
});
