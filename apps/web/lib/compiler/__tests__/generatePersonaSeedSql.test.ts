import { describe, it, expect } from "vitest";
import {
  generatePersonaSeedStatements,
  generatePersonaSeedSql,
  escapeSqlValue,
} from "../databases/shared/generatePersonaSeedSql";
import { PersonaSeed } from "../types/testPersona";

describe("generatePersonaSeedSql", () => {
  const samplePersonas: PersonaSeed[] = [
    {
      id: "persona_admin",
      name: "Admin User",
      activeAuthToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.admin",
      records: [
        {
          id: "admin_user_1",
          tableName: "user",
          fields: {
            id: "admin_user_1",
            name: "Admin User",
            email: "admin@example.com",
            role: "admin",
          },
        },
        {
          id: "admin_session_1",
          tableName: "session",
          fields: {
            id: "admin_session_1",
            userId: "admin_user_1",
            token: "legacy_placeholder",
          },
        },
      ],
    },
    {
      id: "persona_tester",
      name: "Tester O'Connor",
      activeAuthToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.tester",
      records: [
        {
          id: "tester_1",
          tableName: "user",
          fields: {
            id: "tester_1",
            name: "Tester O'Connor",
            email: "tester@example.com",
            role: "tester",
          },
        },
      ],
    },
  ];

  it("escapes single quotes correctly for SQL injection prevention", () => {
    expect(escapeSqlValue("O'Connor", "sqlite")).toBe("'O''Connor'");
    expect(escapeSqlValue("Robert'); DROP TABLE Students;--", "postgres")).toBe(
      "'Robert''); DROP TABLE Students;--'",
    );
    expect(escapeSqlValue(true, "sqlite")).toBe("1");
    expect(escapeSqlValue(true, "postgres")).toBe("TRUE");
    expect(escapeSqlValue(false, "postgres")).toBe("FALSE");
    expect(escapeSqlValue(123, "sqlite")).toBe("123");
    expect(escapeSqlValue(null, "sqlite")).toBe("NULL");
  });

  it("generates SQLite INSERT OR IGNORE statements with auto-synced session token", () => {
    const stmts = generatePersonaSeedStatements(samplePersonas, "sqlite");
    expect(stmts).toHaveLength(3);

    // User 1
    expect(stmts[0]).toContain('INSERT OR IGNORE INTO "user"');
    expect(stmts[0]).toContain("'admin_user_1'");
    expect(stmts[0]).toContain("'admin@example.com'");
    expect(stmts[0]).toContain("'admin'");

    // Session 1: token should be overwritten with activeAuthToken
    expect(stmts[1]).toContain('INSERT OR IGNORE INTO "session"');
    expect(stmts[1]).toContain("'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.admin'");
    expect(stmts[1]).not.toContain("'legacy_placeholder'");

    // User 2: Tester O'Connor with escaped quote
    expect(stmts[2]).toContain("'Tester O''Connor'");
    expect(stmts[2]).toContain("'tester'");
  });

  it("generates PostgreSQL ON CONFLICT statements", () => {
    const sql = generatePersonaSeedSql(samplePersonas, "postgres");
    expect(sql).toContain('INSERT INTO "user"');
    expect(sql).toContain('ON CONFLICT ("id") DO NOTHING');
    expect(sql).toContain("'admin@example.com'");
  });

  it("generates PostgreSQL and SQLite UPSERT statements when upsert is true", () => {
    const pgStmts = generatePersonaSeedStatements(samplePersonas, "postgres", { upsert: true });
    expect(pgStmts[0]).toContain('INSERT INTO "user"');
    expect(pgStmts[0]).toContain('ON CONFLICT ("id") DO UPDATE SET');
    expect(pgStmts[0]).toContain('"name" = EXCLUDED."name"');
    expect(pgStmts[0]).toContain('"email" = EXCLUDED."email"');

    const sqliteStmts = generatePersonaSeedStatements(samplePersonas, "sqlite", { upsert: true });
    expect(sqliteStmts[0]).toContain('INSERT INTO "user"');
    expect(sqliteStmts[0]).toContain('ON CONFLICT ("id") DO UPDATE SET');
    expect(sqliteStmts[0]).toContain('"name" = EXCLUDED."name"');
  });

  it("filters unknown tables if knownTableNames is provided", () => {
    const personasWithCustomTable: PersonaSeed[] = [
      {
        id: "p1",
        name: "Custom",
        records: [
          { tableName: "user", fields: { id: "u1", name: "User 1" } },
          { tableName: "non_existent_table", fields: { id: "n1", value: "hello" } },
        ],
      },
    ];

    const stmts = generatePersonaSeedStatements(personasWithCustomTable, "sqlite", {
      knownTableNames: new Set(["user"]),
    });

    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('INSERT OR IGNORE INTO "user"');
  });

  it("filters unknown columns if knownTableColumns is provided", () => {
    const personasWithExtraCol: PersonaSeed[] = [
      {
        id: "p1",
        name: "Custom",
        records: [
          {
            tableName: "user",
            fields: {
              id: "u1",
              name: "User 1",
              unknownField: "malicious_or_dropped",
            },
          },
        ],
      },
    ];

    const stmts = generatePersonaSeedStatements(personasWithExtraCol, "sqlite", {
      knownTableColumns: {
        user: [{ name: "id" }, { name: "name" }, { name: "email" }],
      },
    });

    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('"id"');
    expect(stmts[0]).toContain('"name"');
    expect(stmts[0]).not.toContain("unknownField");
  });
});
