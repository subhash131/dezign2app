import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import {
  checkDbTableSyncAction,
  applyDbTableSyncAction,
  dropDbTableAction,
  renameDbTableAction,
  renameDbColumnAction,
} from "@/app/actions/databaseActions";
import { resolveSqlitePath } from "../sqliteRunner";
import { resolveTableAndSchema } from "../postgresRunner";

const TEST_ACTION_DB = "test-action-sync.db";

describe("databaseActions Table Sync Actions", () => {
  afterEach(() => {
    const resolved = resolveSqlitePath(TEST_ACTION_DB);
    if (fs.existsSync(resolved)) {
      try {
        fs.unlinkSync(resolved);
      } catch {}
    }
    try {
      fs.unlinkSync(`${resolved}-wal`);
    } catch {}
    try {
      fs.unlinkSync(`${resolved}-shm`);
    } catch {}
  });

  it("should check sync and apply schema through server actions", async () => {
    // 1. Check sync on uncreated table
    const initialCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Product",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "title", type: "TEXT" },
      ],
    });

    expect(initialCheck.success).toBe(true);
    expect(initialCheck.tableExists).toBe(false);
    expect(initialCheck.inSync).toBe(false);
    expect(initialCheck.missingColumns).toHaveLength(2);

    // 2. Apply table creation
    const applyRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Product",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "title", type: "TEXT" },
      ],
    });

    expect(applyRes.success).toBe(true);
    expect(applyRes.createdTable).toBe(true);

    // 3. Re-check: now in sync
    const syncedCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Product",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "title", type: "TEXT" },
      ],
    });

    expect(syncedCheck.inSync).toBe(true);
    expect(syncedCheck.tableExists).toBe(true);
    expect(syncedCheck.missingColumns).toHaveLength(0);

    // 4. Add new column 'price'
    const driftCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Product",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "title", type: "TEXT" },
        { name: "price", type: "REAL" },
      ],
    });

    expect(driftCheck.inSync).toBe(false);
    expect(driftCheck.missingColumns.map((c) => c.name)).toEqual(["price"]);

    // 5. Apply column migration
    const columnApplyRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Product",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "title", type: "TEXT" },
        { name: "price", type: "REAL" },
      ],
    });

    expect(columnApplyRes.success).toBe(true);
    expect(columnApplyRes.createdTable).toBe(false);
    expect(columnApplyRes.appliedColumns).toEqual(["price"]);

    // 6. Delete column 'price' on canvas
    const deleteDriftCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Product",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "title", type: "TEXT" },
      ],
    });

    expect(deleteDriftCheck.inSync).toBe(false);
    expect(deleteDriftCheck.missingColumns).toHaveLength(0);
    expect(deleteDriftCheck.extraColumns.map((c) => c.name)).toEqual(["price"]);

    // 7. Apply deletion
    const deleteApplyRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Product",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "title", type: "TEXT" },
      ],
    });

    expect(deleteApplyRes.success).toBe(true);
    expect(deleteApplyRes.droppedColumns).toEqual(["price"]);

    // 8. Re-check: now in sync
    const finalCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Product",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "title", type: "TEXT" },
      ],
    });

    expect(finalCheck.inSync).toBe(true);
    expect(finalCheck.extraColumns).toHaveLength(0);
    expect(finalCheck.missingColumns).toHaveLength(0);
  });

  it("should drop physical table from live database", async () => {
    // 1. Create table first
    const applyRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "TemporaryLogs",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "message", type: "TEXT" },
      ],
    });
    expect(applyRes.success).toBe(true);

    // 2. Verify table exists
    const check1 = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "TemporaryLogs",
      columns: [{ name: "id", type: "TEXT", isPrimaryKey: true }],
    });
    expect(check1.tableExists).toBe(true);

    // 3. Drop table
    const dropRes = await dropDbTableAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "TemporaryLogs",
    });
    expect(dropRes.success).toBe(true);
    expect(dropRes.droppedTable).toBe("TemporaryLogs");

    // 4. Verify table no longer exists
    const check2 = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "TemporaryLogs",
      columns: [{ name: "id", type: "TEXT", isPrimaryKey: true }],
    });
    expect(check2.tableExists).toBe(false);
  });

  it("should rename physical table and column in live database", async () => {
    // 1. Create initial table "Orders" with column "customer_name"
    const applyRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Orders",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "customer_name", type: "TEXT" },
      ],
    });
    expect(applyRes.success).toBe(true);

    // 2. Rename column "customer_name" to "client_name"
    const colRenameRes = await renameDbColumnAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Orders",
      oldColumnName: "customer_name",
      newColumnName: "client_name",
    });
    expect(colRenameRes.success).toBe(true);
    expect(colRenameRes.newColumnName).toBe("client_name");

    // Verify column renamed in live DB
    const colCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Orders",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "client_name", type: "TEXT" },
      ],
    });
    expect(colCheck.inSync).toBe(true);
    expect(colCheck.existingColumns.map((c) => c.name)).toContain("client_name");

    // 3. Rename table "Orders" to "SalesOrders"
    const tableRenameRes = await renameDbTableAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      oldTableName: "Orders",
      newTableName: "SalesOrders",
    });
    expect(tableRenameRes.success).toBe(true);
    expect(tableRenameRes.newTableName).toBe("SalesOrders");

    // Verify old table doesn't exist
    const oldCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Orders",
      columns: [{ name: "id", type: "TEXT", isPrimaryKey: true }],
    });
    expect(oldCheck.tableExists).toBe(false);

    // Verify new table exists and has client_name column
    const newCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "SalesOrders",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "client_name", type: "TEXT" },
      ],
    });
    expect(newCheck.tableExists).toBe(true);
    expect(newCheck.inSync).toBe(true);
  });

  it("should accurately resolve schema and table names", () => {
    // 1. Unqualified table defaults to 'public'
    expect(resolveTableAndSchema("users")).toEqual({
      safeTable: "users",
      targetSchema: "public",
    });

    // 2. Explicit schema argument overrides default
    expect(resolveTableAndSchema("users", "billing")).toEqual({
      safeTable: "users",
      targetSchema: "billing",
    });

    // 3. Dot-separated table name parses schema automatically
    expect(resolveTableAndSchema("billing.users")).toEqual({
      safeTable: "users",
      targetSchema: "billing",
    });

    // 4. Dot-separated public prefix
    expect(resolveTableAndSchema("public.users")).toEqual({
      safeTable: "users",
      targetSchema: "public",
    });

    // 5. Normalizes schema case and strips illegal characters
    expect(resolveTableAndSchema("CUSTOM_SCHEMA.My_Table")).toEqual({
      safeTable: "My_Table",
      targetSchema: "custom_schema",
    });

    // 6. Normalizes spaces in table names to underscores so live DB matches compiled DB helpers
    expect(resolveTableAndSchema("test table")).toEqual({
      safeTable: "test_table",
      targetSchema: "public",
    });
  });

  it('should normalize table names with spaces (e.g. "test table" -> "test_table") in SQLite sync actions', async () => {
    const applyRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "test table",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "name", type: "TEXT" },
      ],
    });
    expect(applyRes.success).toBe(true);
    expect(applyRes.createdTable).toBe(true);

    const checkNormalized = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "test_table",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "name", type: "TEXT" },
      ],
    });
    expect(checkNormalized.tableExists).toBe(true);
    expect(checkNormalized.inSync).toBe(true);

    const checkWithSpace = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "test table",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "name", type: "TEXT" },
      ],
    });
    expect(checkWithSpace.tableExists).toBe(true);
    expect(checkWithSpace.inSync).toBe(true);
  });

  it("should sync table indexes via server actions", async () => {
    // 1. Create table with columns and an index
    const createRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Account",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "userId", type: "TEXT" },
      ],
      indexes: [{ name: "idx_account_userId", columns: "userId" }],
    });

    expect(createRes.success).toBe(true);
    expect(createRes.createdTable).toBe(true);
    expect(createRes.appliedIndexes).toEqual(["idx_account_userId"]);

    // 2. Check sync status
    const check1 = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Account",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "userId", type: "TEXT" },
      ],
      indexes: [{ name: "idx_account_userId", columns: "userId" }],
    });

    expect(check1.inSync).toBe(true);
    expect(check1.missingIndexes).toHaveLength(0);

    // 3. User adds another index on canvas
    const check2 = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Account",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "userId", type: "TEXT" },
      ],
      indexes: [
        { name: "idx_account_userId", columns: "userId" },
        { name: "idx_account_composite", columns: "id, userId", isUnique: true },
      ],
    });

    expect(check2.inSync).toBe(false);
    expect(check2.missingIndexes?.map((i) => i.name)).toEqual(["idx_account_composite"]);

    // 4. Apply sync
    const apply2 = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Account",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "userId", type: "TEXT" },
      ],
      indexes: [
        { name: "idx_account_userId", columns: "userId" },
        { name: "idx_account_composite", columns: "id, userId", isUnique: true },
      ],
    });

    expect(apply2.success).toBe(true);
    expect(apply2.appliedIndexes).toEqual(["idx_account_composite"]);

    // 5. Verify in sync
    const check3 = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Account",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "userId", type: "TEXT" },
      ],
      indexes: [
        { name: "idx_account_userId", columns: "userId" },
        { name: "idx_account_composite", columns: "id, userId", isUnique: true },
      ],
    });

    expect(check3.inSync).toBe(true);
    expect(check3.missingIndexes).toHaveLength(0);
  });

  it("should handle index name colliding with existing index via fallback", async () => {
    // 1. Create table 'User' with an existing index 'user_idx'
    await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "User",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "name", type: "TEXT" },
      ],
      indexes: [{ name: "user_idx", columns: "name" }],
    });

    // 2. Create table 'Conversation' with an index also named 'user_idx' (colliding index name)
    const applyConv = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Conversation",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "created_by", type: "TEXT" },
      ],
      indexes: [{ name: "user_idx", columns: "created_by" }],
    });

    expect(applyConv.success).toBe(true);
    // Fallback idx_Conversation_user_idx is applied
    expect(applyConv.appliedIndexes).toContain("idx_Conversation_user_idx");

    // 3. Check table sync verifies that the index is recognized as in sync
    const checkConv = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Conversation",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "created_by", type: "TEXT" },
      ],
      indexes: [{ name: "user_idx", columns: "created_by" }],
    });

    expect(checkConv.inSync).toBe(true);
    expect(checkConv.missingIndexes).toHaveLength(0);
  });

  it("should detect missing foreign keys and missing prerequisite tables", async () => {
    // 1. Check sync for 'Order' with FK to non-existent 'Customer'
    const checkRes = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Order",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "customer_id", type: "TEXT" },
      ],
      foreignKeys: [
        {
          column: "customer_id",
          foreignTable: "Customer",
          foreignColumn: "id",
        },
      ],
    });

    expect(checkRes.success).toBe(true);
    expect(checkRes.inSync).toBe(false);
    expect(checkRes.missingForeignKeys).toHaveLength(1);
    expect(checkRes.missingForeignKeys?.[0]?.foreignTable).toBe("Customer");
    expect(checkRes.missingPrerequisiteTables).toContain("Customer");
  });

  it("should auto-create prerequisite tables and apply foreign keys seamlessly", async () => {
    // 1. Apply 'Order' with prerequisite table 'Customer'
    const applyRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Order",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "customer_id", type: "TEXT" },
        { name: "total", type: "REAL" },
      ],
      foreignKeys: [
        {
          column: "customer_id",
          foreignTable: "Customer",
          foreignColumn: "id",
        },
      ],
      prerequisiteTables: [
        {
          tableName: "Customer",
          columns: [
            { name: "id", type: "TEXT", isPrimaryKey: true },
            { name: "email", type: "TEXT", isUnique: true },
          ],
        },
      ],
    });

    expect(applyRes.success).toBe(true);
    expect(applyRes.createdTable).toBe(true);
    expect(applyRes.appliedPrerequisiteTables).toContain("Customer");
    expect(applyRes.appliedForeignKeys).toContain("customer_id");

    // 2. Verify 'Order' is now in sync with Customer in the database
    const syncedCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "Order",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "customer_id", type: "TEXT" },
        { name: "total", type: "REAL" },
      ],
      foreignKeys: [
        {
          column: "customer_id",
          foreignTable: "Customer",
          foreignColumn: "id",
        },
      ],
    });

    expect(syncedCheck.inSync).toBe(true);
    expect(syncedCheck.tableExists).toBe(true);
    expect(syncedCheck.missingForeignKeys).toHaveLength(0);
    expect(syncedCheck.existingForeignKeys).toHaveLength(1);
    expect(syncedCheck.existingForeignKeys?.[0]?.foreignTable.toLowerCase()).toBe("customer");
    expect(syncedCheck.missingPrerequisiteTables).toHaveLength(0);
  });

  it("should detect field type changes and migrate them via checkDbTableSyncAction and applyDbTableSyncAction", async () => {
    // 1. Create table with string 'score'
    await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "ScoreCard",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "score", type: "TEXT" },
      ],
    });

    // 2. Check sync when canvas changes 'score' to INTEGER
    const driftCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "ScoreCard",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "score", type: "INTEGER" },
      ],
    });

    expect(driftCheck.inSync).toBe(false);
    expect(driftCheck.alteredColumns).toHaveLength(1);
    expect(driftCheck.alteredColumns?.[0]).toEqual({
      name: "score",
      oldType: "TEXT",
      newType: "INTEGER",
    });

    // 3. Apply sync
    const applyRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "ScoreCard",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "score", type: "INTEGER" },
      ],
    });

    expect(applyRes.success).toBe(true);
    expect(applyRes.alteredColumns).toHaveLength(1);
    expect(applyRes.alteredColumns?.[0]?.name).toBe("score");

    // 4. Verify in sync after apply
    const afterCheck = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "ScoreCard",
      columns: [
        { name: "id", type: "TEXT", isPrimaryKey: true },
        { name: "score", type: "INTEGER" },
      ],
    });

    expect(afterCheck.inSync).toBe(true);
    expect(afterCheck.alteredColumns).toHaveLength(0);
  });

  it("should create composite primary key table via applyDbTableSyncAction", async () => {
    const applyRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "langgraph_checkpoints",
      columns: [
        { name: "thread_id", type: "TEXT", isPrimaryKey: true },
        { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true },
        { name: "checkpoint_id", type: "TEXT", isPrimaryKey: true },
        { name: "type", type: "TEXT" },
        { name: "checkpoint", type: "JSON", isNotNull: true },
      ],
    });

    expect(applyRes.success).toBe(true);
    expect(applyRes.createdTable).toBe(true);

    const checkRes = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "langgraph_checkpoints",
      columns: [
        { name: "thread_id", type: "TEXT", isPrimaryKey: true },
        { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true },
        { name: "checkpoint_id", type: "TEXT", isPrimaryKey: true },
        { name: "type", type: "TEXT" },
        { name: "checkpoint", type: "JSON", isNotNull: true },
      ],
    });

    expect(checkRes.tableExists).toBe(true);
    expect(checkRes.inSync).toBe(true);
  });

  it("should create dependent table with composite PK and logical reference to checkpoints", async () => {
    // 1. Create checkpoints table first
    await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "checkpoints",
      columns: [
        { name: "thread_id", type: "TEXT", isPrimaryKey: true },
        { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true },
        { name: "checkpoint_id", type: "TEXT", isPrimaryKey: true },
        { name: "checkpoint", type: "JSON", isNotNull: true },
      ],
    });

    // 2. Create checkpoint_blobs table with FK referencing checkpoints.thread_id
    const applyBlobsRes = await applyDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "checkpoint_blobs",
      columns: [
        {
          name: "thread_id",
          type: "TEXT",
          isPrimaryKey: true,
          isForeignKey: true,
          references: { table: "checkpoints", column: "thread_id" },
        },
        { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true },
        { name: "channel", type: "TEXT", isPrimaryKey: true },
        { name: "version", type: "TEXT", isPrimaryKey: true },
        { name: "type", type: "TEXT" },
        { name: "blob", type: "BLOB" },
      ],
      foreignKeys: [
        {
          column: "thread_id",
          foreignTable: "checkpoints",
          foreignColumn: "thread_id",
        },
      ],
    });

    expect(applyBlobsRes.success).toBe(true);
    expect(applyBlobsRes.createdTable).toBe(true);

    const checkBlobsRes = await checkDbTableSyncAction({
      engine: "sqlite",
      connection: { dbFilePath: TEST_ACTION_DB },
      tableName: "checkpoint_blobs",
      columns: [
        {
          name: "thread_id",
          type: "TEXT",
          isPrimaryKey: true,
          isForeignKey: true,
          references: { table: "checkpoints", column: "thread_id" },
        },
        { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true },
        { name: "channel", type: "TEXT", isPrimaryKey: true },
        { name: "version", type: "TEXT", isPrimaryKey: true },
        { name: "type", type: "TEXT" },
        { name: "blob", type: "BLOB" },
      ],
      foreignKeys: [
        {
          column: "thread_id",
          foreignTable: "checkpoints",
          foreignColumn: "thread_id",
        },
      ],
    });

    expect(checkBlobsRes.tableExists).toBe(true);
    expect(checkBlobsRes.inSync).toBe(true);
  });
});
