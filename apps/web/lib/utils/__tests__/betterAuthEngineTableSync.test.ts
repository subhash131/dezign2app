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

  it("keeps createdAt and updatedAt nullable (not non-nullable) for twoFactor, passkey, organization, member, invitation, and rateLimit tables", () => {
    const twoFactorDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "twoFactor")!;
    expect(twoFactorDef).toBeDefined();
    expect(twoFactorDef.defaultColumns.find((c) => c.name === "createdAt")?.isNotNull).toBeFalsy();
    expect(twoFactorDef.defaultColumns.find((c) => c.name === "updatedAt")?.isNotNull).toBeFalsy();

    const passkeyDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "passkey")!;
    expect(passkeyDef).toBeDefined();
    expect(passkeyDef.defaultColumns.find((c) => c.name === "updatedAt")?.isNotNull).toBeFalsy();

    const orgDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "organization")!;
    expect(orgDef).toBeDefined();
    expect(orgDef.defaultColumns.find((c) => c.name === "updatedAt")?.isNotNull).toBeFalsy();

    const memberDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "member")!;
    expect(memberDef).toBeDefined();
    expect(memberDef.defaultColumns.find((c) => c.name === "updatedAt")?.isNotNull).toBeFalsy();

    const invitationDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "invitation")!;
    expect(invitationDef).toBeDefined();
    expect(invitationDef.defaultColumns.find((c) => c.name === "updatedAt")?.isNotNull).toBeFalsy();

    const rateLimitDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "rateLimit")!;
    expect(rateLimitDef).toBeDefined();
    expect(rateLimitDef.defaultColumns.find((c) => c.name === "createdAt")?.isNotNull).toBeFalsy();
    expect(rateLimitDef.defaultColumns.find((c) => c.name === "updatedAt")?.isNotNull).toBeFalsy();
  });

  it("repairs existing twoFactor entity by removing isNotNull on createdAt and updatedAt", () => {
    const twoFactorDef = BETTER_AUTH_TABLE_DEFINITIONS.find((d) => d.name === "twoFactor")!;
    const existingCols = [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "userId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, isNotNull: true },
      { name: "secret", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "backupCodes", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "createdAt", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: true },
      { name: "updatedAt", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: true },
    ];

    const result = repairEntityColumns(existingCols, twoFactorDef.defaultColumns, "postgres");
    expect(result.changed).toBe(true);
    expect(result.cols.find((c) => c.name === "createdAt")?.isNotNull).toBeUndefined();
    expect(result.cols.find((c) => c.name === "updatedAt")?.isNotNull).toBeUndefined();
  });
});
