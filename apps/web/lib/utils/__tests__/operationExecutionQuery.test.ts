import { describe, it, expect, afterEach } from "vitest";
import { planSqlCommand } from "@/lib/database-runner/sqlPlanner";
import { testDatabaseOperation } from "@/lib/services/databaseService";
import { getEntityDbConnectionInfo } from "@/lib/stores/dbSyncStore";
import { BackendNode } from "@/types/canvas";
import { resolveSqlitePath } from "../sqliteRunner";
import fs from "fs";

const TEST_DB = "test-query-op.db";

describe("Database Operation Query and Configuration", () => {
  afterEach(() => {
    const resolved = resolveSqlitePath(TEST_DB);
    if (fs.existsSync(resolved)) {
      try {
        fs.unlinkSync(resolved);
      } catch {}
    }
  });

  describe("planSqlCommand", () => {
    it("ignores comment-polluted query strings starting with //", () => {
      const plan = planSqlCommand(
        {
          id: "op-1",
          name: "findAllConversationsByCreator",
          kind: "fetchByIndex",
          query: "// Database Engine: POSTGRES\n// Table: conversations",
          params: [
            { name: "createdBy", type: "string" },
            { name: "limit", type: "number" },
            { name: "offset", type: "number" },
          ],
        },
        { createdBy: "user-123", limit: 20, offset: 0 },
        "postgres",
      );

      expect(plan.rawSql).not.toContain("//");
      expect(plan.rawSql).toContain('SELECT * FROM "conversations" WHERE "created_by" = \'user-123\' LIMIT 20 OFFSET 0;');
    });

    it("extracts parameterized query from code when available", () => {
      const plan = planSqlCommand(
        {
          id: "op-1",
          name: "findAllConversationsByCreator",
          kind: "fetchByIndex",
          query: "// Database Engine: POSTGRES",
          code: `export async function findAllConversationsByCreator(createdBy: string, limit = 20, offset = 0) {
  const res = await query<Conversations>('SELECT * FROM "conversations" WHERE "created_by" = $1 LIMIT $2 OFFSET $3', [createdBy, limit, offset]);
  return res.rows;
}`,
          params: [
            { name: "createdBy", type: "string" },
            { name: "limit", type: "number" },
            { name: "offset", type: "number" },
          ],
        },
        { createdBy: "user-abc", limit: 10, offset: 5 },
        "postgres",
      );

      expect(plan.rawSql).not.toContain("//");
      expect(plan.rawSql).toBe('SELECT * FROM "conversations" WHERE "created_by" = \'user-abc\' LIMIT 10 OFFSET 5');
    });
  });

  describe("testDatabaseOperation resilience against // comments in query", () => {
    it("safely executes operation even if operation.query contains // comments", async () => {
      const res = await testDatabaseOperation({
        engine: "sqlite",
        connection: { dbFilePath: TEST_DB },
        operation: {
          id: "auto-find-all-convs",
          name: "findAllConversations",
          kind: "findAll",
          query: "// Database Engine: SQLITE\n// Table: conversations",
          params: [
            { name: "limit", type: "number", defaultValue: "20" },
            { name: "offset", type: "number", defaultValue: "0" },
          ],
        },
        args: { limit: 20, offset: 0 },
        mode: "live",
      });

      expect(res.success).toBe(true);
      expect(res.rawCommand).not.toContain("//");
      expect(Array.isArray(res.output)).toBe(true);
    });
  });

  describe("getEntityDbConnectionInfo", () => {
    it("returns identical database configuration and schema for connected entity nodes", () => {
      const dbNode: BackendNode = {
        id: "db-supabase",
        fractionalIndex:"a7",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          label: "Supabase DB",
          dbEngine: "postgres",
          schema: "public",
          connectionString: "postgresql://postgres:secret@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
          connectionStringPooled: "postgresql://postgres:secret@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres",
          host: "aws-1-ap-northeast-2.pooler.supabase.com",
          port: 6543,
          sslMode: "require",
          provider: "supabase",
        },
      };

      const entityNode: BackendNode = {
        id: "ent-conv",
        fractionalIndex:"a4",
        type: "entity",
        position: { x: 100, y: 100 },
        data: {
          label: "conversations",
          databaseId: "db-supabase",
          columns: [
            { name: "id", type: "UUID", isPrimaryKey: true },
            { name: "created_by", type: "UUID" },
          ],
        },
      };

      const info = getEntityDbConnectionInfo(entityNode, [dbNode, entityNode]);
      expect(info).not.toBeNull();
      expect(info?.engine).toBe("postgres");
      expect(info?.schema).toBe("public");
      expect(info?.connection.connectionString).toBe(dbNode.data.connectionString);
      expect(info?.connection.host).toBe("aws-1-ap-northeast-2.pooler.supabase.com");
      expect(info?.connection.port).toBe(6543);
      expect(info?.connection.provider).toBe("supabase");
    });
  });
});

