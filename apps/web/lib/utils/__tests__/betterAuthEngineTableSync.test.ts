import { describe, it, expect } from "vitest";
import {
  BETTER_AUTH_TABLE_DEFINITIONS,
  PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION,
  resolveBetterAuthTableColumns,
  DB_COLUMN_TYPES,
} from "@workspace/canvas";
import {
  repairEntityColumns,
  checkEntitySchemaDiscrepancies,
} from "../../../app/(canvas)/project/[projectId]/_components/config-sidebar/auth-config/core-entities/hooks/useBetterAuthTableSync";
import { BackendNode } from "@/types/canvas";

describe("Better Auth Engine-Aware Table Generation & Sync", () => {
  it("defines primary key id and foreign keys as UUID by default in BETTER_AUTH_TABLE_DEFINITIONS", () => {
    const userDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "user");
    expect(userDef).toBeDefined();
    const userIdCol = userDef!.defaultColumns.find((c) => c.name === "id");
    expect(userIdCol?.type).toBe(DB_COLUMN_TYPES.UUID);

    const sessionDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "session");
    expect(sessionDef).toBeDefined();
    const sessionIdCol = sessionDef!.defaultColumns.find((c) => c.name === "id");
    const sessionUserIdCol = sessionDef!.defaultColumns.find((c) => c.name === "userId");
    expect(sessionIdCol?.type).toBe(DB_COLUMN_TYPES.UUID);
    expect(sessionUserIdCol?.type).toBe(DB_COLUMN_TYPES.UUID);

    const subDef = PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION;
    expect(subDef.defaultColumns.find((c) => c.name === "id")?.type).toBe(DB_COLUMN_TYPES.UUID);
    expect(subDef.defaultColumns.find((c) => c.name === "userId")?.type).toBe(DB_COLUMN_TYPES.UUID);
  });

  it("resolves UUID to TEXT when SQLite engine is specified", () => {
    const userDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "user")!;
    const sqliteCols = resolveBetterAuthTableColumns(userDef.defaultColumns, "sqlite");
    expect(sqliteCols.find((c) => c.name === "id")?.type).toBe(DB_COLUMN_TYPES.TEXT);

    const postgresCols = resolveBetterAuthTableColumns(userDef.defaultColumns, "postgres");
    expect(postgresCols.find((c) => c.name === "id")?.type).toBe(DB_COLUMN_TYPES.UUID);
  });

  it("repairEntityColumns repairs TEXT id to UUID for PostgreSQL", () => {
    const userDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "user")!;
    const existingCols = [
      { name: "id", type: DB_COLUMN_TYPES.TEXT, isPrimaryKey: true, isNotNull: true },
      { name: "name", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "email", type: DB_COLUMN_TYPES.TEXT, isNotNull: true, isUnique: true },
    ];

    const result = repairEntityColumns(existingCols, userDef.defaultColumns, "postgres");
    expect(result.changed).toBe(true);
    const idCol = result.cols.find((c) => c.name === "id");
    expect(idCol?.type).toBe(DB_COLUMN_TYPES.UUID);
  });

  it("checkEntitySchemaDiscrepancies flags outdatedColumns when id is TEXT but engine is PostgreSQL", () => {
    const userDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "user")!;
    const entityNode: BackendNode = {
      id: "node-user",
      type: "entity",
      fractionalIndex: "a0",
      data: {
        label: "user",
        columns: [
          { name: "id", type: DB_COLUMN_TYPES.TEXT, isPrimaryKey: true, isNotNull: true },
          ...userDef.defaultColumns.filter((c) => c.name !== "id"),
        ],
        indexes: userDef.defaultIndexes ? [...userDef.defaultIndexes] : [],
      },
      position: { x: 0, y: 0 },
    };

    const postgresCheck = checkEntitySchemaDiscrepancies(entityNode, userDef, "postgres");
    expect(postgresCheck.isValid).toBe(false);
    expect(postgresCheck.outdatedColumns.some((c) => c.name === "id")).toBe(true);

    const sqliteCheck = checkEntitySchemaDiscrepancies(entityNode, userDef, "sqlite");
    expect(sqliteCheck.isValid).toBe(true);
  });

  it("does not include createdAt or updatedAt across BETTER_AUTH_TABLE_DEFINITIONS tables", () => {
    for (const def of BETTER_AUTH_TABLE_DEFINITIONS) {
      expect(def.defaultColumns.some((c) => c.name === "createdAt")).toBe(false);
      expect(def.defaultColumns.some((c) => c.name === "updatedAt")).toBe(false);
    }
  });

  it("repairs existing user entity with primary key id and expected types", () => {
    const userDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "user")!;
    const existingCols = [
      { name: "id", type: DB_COLUMN_TYPES.TEXT, isPrimaryKey: false, isNotNull: true },
      { name: "name", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "email", type: DB_COLUMN_TYPES.TEXT, isUnique: true, isNotNull: true },
      { name: "emailVerified", type: DB_COLUMN_TYPES.BOOLEAN, isNotNull: true },
    ];

    const result = repairEntityColumns(existingCols, userDef.defaultColumns, "postgres");
    expect(result.changed).toBe(true);
    expect(result.cols.find((c) => c.name === "id")?.isPrimaryKey).toBe(true);
    expect(result.cols.find((c) => c.name === "id")?.type).toBe(DB_COLUMN_TYPES.UUID);
  });

  it("repairEntityColumns strips rogue timestamp columns from Better Auth tables (such as organization, passkey, member, invitation)", () => {
    const orgDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "organization")!;
    const existingCols = [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "name", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "slug", type: DB_COLUMN_TYPES.TEXT, isNotNull: true, isUnique: true },
      { name: "logo", type: DB_COLUMN_TYPES.TEXT },
      { name: "metadata", type: DB_COLUMN_TYPES.TEXT },
      { name: "created_at", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: true },
      { name: "updated_at", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: true },
    ];

    const result = repairEntityColumns(existingCols, orgDef.defaultColumns, "postgres");
    expect(result.changed).toBe(true);
    expect(result.cols.some((c) => c.name === "created_at" || c.name === "createdAt")).toBe(false);
    expect(result.cols.some((c) => c.name === "updated_at" || c.name === "updatedAt")).toBe(false);
    expect(result.cols.map((c) => c.name)).toEqual(["id", "name", "slug", "logo", "metadata"]);
  });

  it("checkEntitySchemaDiscrepancies flags schema as invalid when rogue timestamp columns are present", () => {
    const orgDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "organization")!;
    const entityNode: BackendNode = {
      id: "node-org",
      type: "entity",
      fractionalIndex: "a0",
      data: {
        label: "organization",
        columns: [
          { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
          { name: "name", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
          { name: "slug", type: DB_COLUMN_TYPES.TEXT, isNotNull: true, isUnique: true },
          { name: "created_at", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: true },
          { name: "updated_at", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: true },
        ],
      },
      position: { x: 0, y: 0 },
    };

    const check = checkEntitySchemaDiscrepancies(entityNode, orgDef, "postgres");
    expect(check.isValid).toBe(false);
  });
});
