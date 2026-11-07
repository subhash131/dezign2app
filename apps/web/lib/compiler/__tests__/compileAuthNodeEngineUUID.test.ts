import { describe, it, expect } from "vitest";
import { compileAuth } from "../compileAuth";
import { compileAuthNode } from "../services/fastapi/v0/generators/authGenerator";
import { generateAuthConfig as generateFastApiAuthConfig } from "../services/fastapi/v0/generators/auth/generateAuthConfig";
import { generateAuthConfig as generateMonorepoAuthConfig } from "../auth/better-auth/v1.6/generators/generateAuthConfig";
import { buildTableDDL } from "../databases/postgres/ddl";
import { BackendNode, BackendEdge } from "@/types/canvas";

describe("Better Auth Engine-Aware UUID ID Generation", () => {
  it("should configure advanced.database.generateId function when compileAuthNode is connected to a PostgreSQL database", () => {
    const authNode: BackendNode = {
      id: "auth-node-1",
      type: "auth",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Auth Server",
        framework: "better_auth",
        databaseId: "db-postgres-1",
      },
    };

    const dbNode: BackendNode = {
      id: "db-postgres-1",
      type: "database",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Supabase DB",
        dbEngine: "postgres",
      },
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-auth-db",
        source: "auth-node-1",
        target: "db-postgres-1",
        type: "connection",
        fractionalIndex: "e0",
      },
    ];

    const result = compileAuthNode(authNode, [authNode, dbNode], edges);
    const authFile = result.files.find((f) => f.filename === "auth-server/src/auth.ts");

    expect(authFile).toBeDefined();
    expect(authFile?.content).toContain("advanced: {");
    expect(authFile?.content).toContain("generateId: () => crypto.randomUUID()");
    expect(authFile?.content).toContain("import { Pool } from \"pg\";");
  });

  it("should configure generateId function in generateMonorepoAuthConfig when dbEngine is postgres", () => {
    const code = generateMonorepoAuthConfig({
      framework: "better_auth",
      dbEngine: "postgres",
      dbAdapter: "postgres",
    });

    expect(code).toContain("advanced: {");
    expect(code).toContain("generateId: () => crypto.randomUUID()");
  });

  it("should NOT configure generateId when dbEngine is sqlite", () => {
    const code = generateMonorepoAuthConfig({
      framework: "better_auth",
      dbEngine: "sqlite",
      dbAdapter: "sqlite-raw",
    });

    expect(code).not.toContain("generateId: () => crypto.randomUUID()");
    expect(code).not.toContain('generateId: "uuid"');
  });

  it("should respect explicit generateId = 'uuid' regardless of dbEngine", () => {
    const code = generateFastApiAuthConfig({
      framework: "better_auth",
      dbEngine: "sqlite",
      generateId: "uuid",
    });

    expect(code).toContain("advanced: {");
    expect(code).toContain("generateId: () => crypto.randomUUID()");
  });

  it("should include DEFAULT gen_random_uuid() for UUID primary key in buildTableDDL", () => {
    const ddl = buildTableDDL("user", [
      { name: "id", type: "UUID", isPrimaryKey: true, isNotNull: true },
      { name: "name", type: "TEXT", isNotNull: true },
      { name: "email", type: "TEXT", isUnique: true, isNotNull: true },
    ]);

    expect(ddl.join("\n")).toContain('"id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL');
  });

  it("should configure advanced.database.validateSchema = false by default in compileAuth to avoid SCHEMA_MISMATCH crashes", () => {
    const authNode: BackendNode = {
      id: "auth-1",
      type: "auth",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Better Auth",
        framework: "better_auth",
      },
    };

    const result = compileAuth(authNode);
    const authFile = result.files.find((f) => f.filename === "auth.ts");

    expect(authFile).toBeDefined();
    expect(authFile?.content).toContain("advanced: {");
    expect(authFile?.content).toContain("validateSchema: false");
  });

  it("should allow explicit validateSchema = true override when requested", () => {
    const code = generateMonorepoAuthConfig({
      framework: "better_auth",
      dbEngine: "postgres",
      validateSchema: true,
    });

    expect(code).toContain("advanced: {");
    expect(code).not.toContain("validateSchema: false");
  });
});
