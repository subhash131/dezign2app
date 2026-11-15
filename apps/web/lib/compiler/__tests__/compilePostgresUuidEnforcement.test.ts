import { describe, it, expect } from "vitest";
import { isUuid, toValidUuid } from "../utils";
import {
  generateRecordId,
  isUuid as isTypesUuid,
  toValidUuid as toTypesValidUuid,
} from "@/app/(canvas)/project/[projectId]/_components/test-users/types";
import { generatePersonaSeedStatements } from "../databases/shared/generatePersonaSeedSql";
import { generatePostgresTableHelpers } from "../databases/postgres/helpers";
import { generateConnectionFile } from "../databases/postgres/templates";
import { PersonaSeed } from "../types/testPersona";
import { BackendNode } from "@/types/canvas";

describe("PostgreSQL & UUID Engine Enforcement", () => {
  describe("UUID Validation & Deterministic Conversion", () => {
    it("should validate real UUIDs and reject invalid strings like 'user_783apf'", () => {
      expect(isUuid("user_783apf")).toBe(false);
      expect(isTypesUuid("user_783apf")).toBe(false);
      expect(isUuid("sess_user_783apf")).toBe(false);
      expect(isUuid("12345")).toBe(false);
      expect(isUuid(null)).toBe(false);
      expect(isUuid(undefined)).toBe(false);

      const validUuid = "a0000000-0000-4000-8000-000000000001";
      expect(isUuid(validUuid)).toBe(true);
      expect(isTypesUuid(validUuid)).toBe(true);
    });

    it("should deterministically convert 'user_783apf' to a valid RFC4122 UUID", () => {
      const converted1 = toValidUuid("user_783apf");
      const converted2 = toValidUuid("user_783apf");

      expect(isUuid(converted1)).toBe(true);
      expect(converted1).toBe(converted2);
      expect(converted1).not.toBe("user_783apf");

      // Preserves existing valid UUID
      const validUuid = "c0000000-0000-4000-8000-000000000001";
      expect(toValidUuid(validUuid)).toBe(validUuid);
      expect(toTypesValidUuid(validUuid)).toBe(validUuid);
    });

    it("should generate a valid UUID when generateRecordId is called for PostgreSQL or auth tables", () => {
      // Postgres engine
      const pgId = generateRecordId("items", "postgres");
      expect(isUuid(pgId)).toBe(true);

      // isUuidPk flag
      const customId = generateRecordId("products", "sqlite", true);
      expect(isUuid(customId)).toBe(true);

      // Better Auth tables (singular and plural)
      expect(isUuid(generateRecordId("user"))).toBe(true);
      expect(isUuid(generateRecordId("users"))).toBe(true);
      expect(isUuid(generateRecordId("session"))).toBe(true);
      expect(isUuid(generateRecordId("sessions"))).toBe(true);
      expect(isUuid(generateRecordId("account"))).toBe(true);
      expect(isUuid(generateRecordId("accounts"))).toBe(true);
      expect(isUuid(generateRecordId("organization"))).toBe(true);
      expect(isUuid(generateRecordId("member"))).toBe(true);
    });
  });

  describe("Persona Seeding for PostgreSQL with UUIDs", () => {
    it("should sanitize legacy 'user_783apf' into valid UUIDs in PostgreSQL seed SQL", () => {
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
            },
          },
          {
            id: "sess_user_783apf",
            tableName: "session",
            fields: {
              id: "sess_user_783apf",
              userId: "user_783apf",
              token: "sample_token",
            },
          },
        ],
      };

      const stmts = generatePersonaSeedStatements([legacyPersona], "postgres");
      expect(stmts).toHaveLength(2);

      // Must NOT contain raw 'user_783apf' or 'sess_user_783apf' in Postgres SQL
      expect(stmts[0]).not.toContain("'user_783apf'");
      expect(stmts[1]).not.toContain("'user_783apf'");
      expect(stmts[1]).not.toContain("'sess_user_783apf'");

      // Extract the converted UUIDs and verify foreign key consistency
      const userMatch = stmts[0]?.match(/VALUES \('([0-9a-f-]+)'/i);
      expect(userMatch).toBeTruthy();
      const generatedUserId = userMatch![1];
      expect(isUuid(generatedUserId)).toBe(true);

      // Session record's userId must match the user's converted UUID
      expect(stmts[1]).toContain(`'${generatedUserId}'`);
    });
  });

  describe("Postgres Inline CRUD Operations UUID Safety", () => {
    const itemNode: BackendNode = {
      id: "node_item",
      type: "entity",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "items",
        columns: [
          { name: "id", type: "UUID", isPrimaryKey: true },
          { name: "title", type: "text" },
        ],
      },
    };

    it("should import isUuid from connection and guard 'create' operation", () => {
      const { code } = generatePostgresTableHelpers(itemNode, [itemNode], "@workspace/db");

      expect(code).toContain('import { query, withTransaction, isUuid, toValidUuid } from "../connection";');
      expect(code).toContain("const _id = (id && isUuid(id)) ? id : randomUUID();");
    });

    it("should guard 'findById' operation using isUuid returning null", () => {
      const { code } = generatePostgresTableHelpers(itemNode, [itemNode], "@workspace/db");

      expect(code).toContain("if (!isUuid(id)) {");
      expect(code).toContain("return null;");
    });

    it("should guard 'delete' operation using isUuid returning success: false", () => {
      const { code } = generatePostgresTableHelpers(itemNode, [itemNode], "@workspace/db");

      expect(code).toContain("if (!isUuid(id)) {");
      expect(code).toContain("return { success: false, message: \"Record not found (invalid UUID)\" };");
    });

    it("should export isUuid helper in connection.ts", () => {
      const connCode = generateConnectionFile("@workspace/db", "DATABASE_URL", {});

      expect(connCode).toContain("export function isUuid");
      expect(connCode).not.toContain("as any");
      expect(connCode).not.toContain("as unknown");
    });
  });
});
