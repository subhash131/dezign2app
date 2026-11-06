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

  it("defines nullable createdAt and updatedAt for core tables and nullable createdAt-only for org/passkey tables", () => {
    const coreTableNames = ["user", "session", "account", "verification"];
    for (const name of coreTableNames) {
      const def = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === name);
      expect(def).toBeDefined();
      const createdAt = def!.defaultColumns.find((c) => c.name === "createdAt");
      const updatedAt = def!.defaultColumns.find((c) => c.name === "updatedAt");
      expect(createdAt).toBeDefined();
      expect(createdAt?.isNotNull).toBeFalsy();
      expect(updatedAt).toBeDefined();
      expect(updatedAt?.isNotNull).toBeFalsy();
    }

    const pluginTableNames = ["organization", "member", "invitation", "passkey"];
    for (const name of pluginTableNames) {
      const def = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === name);
      expect(def).toBeDefined();
      const createdAt = def!.defaultColumns.find((c) => c.name === "createdAt");
      const updatedAt = def!.defaultColumns.find((c) => c.name === "updatedAt");
      expect(createdAt).toBeDefined();
      expect(createdAt?.isNotNull).toBeFalsy();
      // Plugin tables never define updatedAt
      expect(updatedAt).toBeUndefined();
    }

    // No Better Auth table definition should have isNotNull: true on timestamp columns
    for (const def of BETTER_AUTH_TABLE_DEFINITIONS) {
      const tsCols = def.defaultColumns.filter((c) => c.name === "createdAt" || c.name === "updatedAt");
      for (const col of tsCols) {
        expect(col.isNotNull).toBeFalsy();
      }
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

  it("repairEntityColumns strips rogue timestamp columns from Better Auth tables (such as snake_case created_at and unsupported updated_at on organization)", () => {
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
    expect(result.cols.some((c) => c.name === "created_at")).toBe(false);
    expect(result.cols.some((c) => c.name === "updated_at" || c.name === "updatedAt")).toBe(false);
    const createdAtCol = result.cols.find((c) => c.name === "createdAt");
    expect(createdAtCol).toBeDefined();
    expect(createdAtCol?.isNotNull).toBeFalsy();
    expect(result.cols.map((c) => c.name)).toEqual(["id", "name", "slug", "logo", "metadata", "createdAt"]);
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

  it("checkEntitySchemaDiscrepancies marks organization valid when it has canonical nullable createdAt and no updatedAt", () => {
    const orgDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "organization")!;
    const entityNode: BackendNode = {
      id: "node-org-valid",
      type: "entity",
      fractionalIndex: "a0",
      data: {
        label: "organization",
        columns: [
          { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
          { name: "name", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
          { name: "slug", type: DB_COLUMN_TYPES.TEXT, isNotNull: true, isUnique: true },
          { name: "logo", type: DB_COLUMN_TYPES.TEXT },
          { name: "metadata", type: DB_COLUMN_TYPES.TEXT },
          { name: "createdAt", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: false },
        ],
        indexes: orgDef.defaultIndexes ? [...orgDef.defaultIndexes] : [],
      },
      position: { x: 0, y: 0 },
    };

    const check = checkEntitySchemaDiscrepancies(entityNode, orgDef, "postgres");
    expect(check.isValid).toBe(true);
  });
});
