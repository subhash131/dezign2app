import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { seedTestUsersAction } from "@/app/actions/databaseActions";
import { PersonaSeed } from "@/lib/compiler/types/testPersona";
import { isUuid, toValidUuid } from "@/lib/compiler/utils";

describe("seedTestUsersAction", () => {
  const testDbDir = path.join(process.cwd(), "tmp-test-seed-db");
  const testDbPath = path.join(testDbDir, "test-seed.db");

  beforeEach(() => {
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDbDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
  });

  it("should handle empty personas gracefully", async () => {
    const res = await seedTestUsersAction({
      engine: "sqlite",
      connection: { dbFilePath: testDbPath },
      personas: [],
    });

    expect(res.success).toBe(true);
    expect(res.insertedRecords).toBe(0);
    expect(res.statements).toHaveLength(0);
  });

  it("should create user and session tables and seed test personas in SQLite", async () => {
    const testPersonas: PersonaSeed[] = [
      {
        id: "persona_admin",
        name: "Admin User",
        activeAuthToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.jwt.token",
        records: [
          {
            id: "a0000000-0000-4000-8000-000000000001",
            tableName: "user",
            fields: {
              id: "a0000000-0000-4000-8000-000000000001",
              name: "Admin User",
              email: "admin@example.com",
              role: "admin",
            },
          },
          {
            id: "b0000000-0000-4000-8000-000000000001",
            tableName: "session",
            fields: {
              id: "b0000000-0000-4000-8000-000000000001",
              userId: "a0000000-0000-4000-8000-000000000001",
              token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.jwt.token",
            },
          },
        ],
      },
    ];

    const res = await seedTestUsersAction({
      engine: "sqlite",
      connection: { dbFilePath: testDbPath },
      personas: testPersonas,
    });

    expect(res.success).toBe(true);
    expect(res.insertedRecords).toBe(2);
    expect(res.statements).toHaveLength(2);

    // Verify records exist in SQLite DB
    const db = new DatabaseSync(testDbPath);
    const users = db.prepare('SELECT * FROM "user"').all() as any[];
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe("a0000000-0000-4000-8000-000000000001");
    expect(users[0].name).toBe("Admin User");
    expect(users[0].email).toBe("admin@example.com");
    expect(users[0].role).toBe("admin");

    const sessions = db.prepare('SELECT * FROM "session"').all() as any[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("b0000000-0000-4000-8000-000000000001");
    expect(sessions[0].userId).toBe("a0000000-0000-4000-8000-000000000001");
    expect(sessions[0].token).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.jwt.token");
    db.close();
  });

  it("should sanitize legacy user IDs like user_783apf to valid UUID", async () => {
    const legacyPersona: PersonaSeed = {
      id: "persona_legacy",
      name: "Legacy User",
      records: [
        {
          id: "user_783apf",
          tableName: "user",
          fields: {
            id: "user_783apf",
            name: "Legacy User",
            email: "legacy@example.com",
            role: "user",
          },
        },
      ],
    };

    const expectedUuid = toValidUuid("user_783apf");
    expect(isUuid(expectedUuid)).toBe(true);
    expect(expectedUuid).toBe("de7a57c3-232e-56bb-8db4-839a1e491c68");
  });

  it("should capture and return errors when table record insert fails", async () => {
    const invalidPersona: PersonaSeed = {
      id: "persona_invalid",
      name: "Invalid Persona",
      records: [
        {
          id: "rec_1",
          tableName: "NonExistentTable",
          fields: {
            id: "rec_1",
            data: "test",
          },
        },
      ],
    };

    const res = await seedTestUsersAction({
      engine: "sqlite",
      connection: { dbFilePath: testDbPath },
      personas: [invalidPersona],
    });

    expect(res.success).toBe(false);
    expect(res.insertedRecords).toBe(0);
    expect(res.error).toBeDefined();
    expect(res.errors && res.errors.length > 0).toBe(true);
    expect(res.error).toContain("no such table: NonExistentTable");
  });
});
