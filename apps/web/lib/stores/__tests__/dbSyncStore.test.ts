import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useDbSyncStore,
  deriveEntityForeignKeys,
  getEntityDbConnectionInfo,
} from "../dbSyncStore";
import { useBackendCanvasStore } from "../backendCanvasStore";
import { BackendNode } from "@/types/canvas";
import * as databaseService from "@/lib/services/databaseService";

vi.mock("@/lib/services/databaseService", async () => {
  const actual = await vi.importActual<typeof databaseService>(
    "@/lib/services/databaseService",
  );
  return {
    ...actual,
    checkDbTableSync: vi.fn(),
  };
});

describe("dbSyncStore", () => {
  beforeEach(() => {
    useDbSyncStore.getState().clearStatus();
    useBackendCanvasStore.setState({ nodes: [], edges: [] });
    vi.clearAllMocks();
  });

  describe("deriveEntityForeignKeys", () => {
    it("should extract foreign keys correctly from entity columns", () => {
      const node: BackendNode = {
        id: "ent-1",
        fractionalIndex:"a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "Order",
          columns: [
            { name: "id", type: "TEXT", isPrimaryKey: true },
            {
              name: "user_id",
              type: "TEXT",
              isForeignKey: true,
              references: { table: "User", column: "id" },
            },
            {
              name: "product_id",
              type: "TEXT",
              isForeignKey: true,
              references: { table: "Product", column: "id" },
            },
          ],
        },
      };

      const fks = deriveEntityForeignKeys(node);
      expect(fks).toHaveLength(2);
      expect(fks[0]).toEqual({
        column: "user_id",
        foreignTable: "User",
        foreignColumn: "id",
        onDelete: "CASCADE",
      });
      expect(fks[1]).toEqual({
        column: "product_id",
        foreignTable: "Product",
        foreignColumn: "id",
        onDelete: "CASCADE",
      });
    });
  });

  describe("getEntityDbConnectionInfo", () => {
    it("should return null if entity has no databaseId", () => {
      const entity: BackendNode = {
        id: "ent-1",
        fractionalIndex:"a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: { label: "User" },
      };
      expect(getEntityDbConnectionInfo(entity, [entity])).toBeNull();
    });

    it("should return connection info if connected database node has valid connection config", () => {
      const dbNode: BackendNode = {
        id: "db-1",
        fractionalIndex:"a0",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          label: "Main Postgres",
          dbEngine: "postgres",
          host: "localhost",
          port: 5432,
          database: "mydb",
          username: "postgres",
          password: "secret",
        },
      };
      const entity: BackendNode = {
        id: "ent-1",
        fractionalIndex:"a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: { label: "User", databaseId: "db-1" },
      };

      const info = getEntityDbConnectionInfo(entity, [dbNode, entity]);
      expect(info).not.toBeNull();
      expect(info?.engine).toBe("postgres");
      expect(info?.connection.database).toBe("mydb");
      expect(info?.connection.host).toBe("localhost");
    });
  });

  describe("validateEntity and validateAll", () => {
    it("should not validate automatically on store creation", () => {
      const state = useDbSyncStore.getState();
      expect(state.entitySyncStatus).toEqual({});
      expect(state.isValidatingAll).toBe(false);
      expect(databaseService.checkDbTableSync).not.toHaveBeenCalled();
    });

    it("should validate an entity on-demand when validateEntity is called", async () => {
      const dbNode: BackendNode = {
        id: "db-1",
        fractionalIndex:"a0",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          label: "Dev SQLite",
          dbEngine: "sqlite",
          dbFilePath: "dev.db",
        },
      };
      const entity: BackendNode = {
        id: "ent-1",
        fractionalIndex:"a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "User",
          tableName: "User",
          databaseId: "db-1",
          columns: [{ name: "id", type: "TEXT", isPrimaryKey: true }],
        },
      };

      useBackendCanvasStore.setState({ nodes: [dbNode, entity] });

      const mockResult = {
        success: true,
        serverReachable: true,
        tableExists: true,
        inSync: true,
        missingColumns: [],
        extraColumns: [],
        existingColumns: [{ name: "id", type: "TEXT" }],
        missingIndexes: [],
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: [],
        extraForeignKeys: [],
      };

      vi.mocked(databaseService.checkDbTableSync).mockResolvedValueOnce(
        mockResult,
      );

      const res = await useDbSyncStore.getState().validateEntity("ent-1");
      expect(res).toEqual(mockResult);
      expect(databaseService.checkDbTableSync).toHaveBeenCalledTimes(1);

      const stored = useDbSyncStore.getState().entitySyncStatus["ent-1"];
      expect(stored?.status?.inSync).toBe(true);
      expect(stored?.isChecking).toBe(false);
    });

    it("should validate all connected tables on-demand with validateAll", async () => {
      const dbNode: BackendNode = {
        id: "db-1",
        fractionalIndex:"a0",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          label: "Dev SQLite",
          dbEngine: "sqlite",
          dbFilePath: "dev.db",
        },
      };
      const entity1: BackendNode = {
        id: "ent-1",
        fractionalIndex:"a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "User",
          databaseId: "db-1",
          columns: [{ name: "id", type: "TEXT" }],
        },
      };
      const entity2: BackendNode = {
        id: "ent-2",
        fractionalIndex:"a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "Order",
          databaseId: "db-1",
          columns: [{ name: "id", type: "TEXT" }],
        },
      };

      useBackendCanvasStore.setState({ nodes: [dbNode, entity1, entity2] });

      vi.mocked(databaseService.checkDbTableSync).mockResolvedValue({
        success: true,
        serverReachable: true,
        tableExists: true,
        inSync: true,
        missingColumns: [],
        extraColumns: [],
        existingColumns: [],
        missingIndexes: [],
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: [],
        extraForeignKeys: [],
      });

      const summary = await useDbSyncStore.getState().validateAll();
      expect(summary.total).toBe(2);
      expect(summary.inSync).toBe(2);
      expect(databaseService.checkDbTableSync).toHaveBeenCalledTimes(2);
    });

    it("should validate all tables attached to a specific database with validateDatabase", async () => {
      const dbNode1: BackendNode = {
        id: "db-1",
        fractionalIndex: "a0",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          label: "Dev SQLite",
          dbEngine: "sqlite",
          dbFilePath: "dev.db",
        },
      };
      const dbNode2: BackendNode = {
        id: "db-2",
        fractionalIndex: "a1",
        type: "database",
        position: { x: 100, y: 0 },
        data: {
          label: "Other DB",
          dbEngine: "sqlite",
          dbFilePath: "other.db",
        },
      };
      const entity1: BackendNode = {
        id: "ent-1",
        fractionalIndex: "a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "User",
          databaseId: "db-1",
          columns: [{ name: "id", type: "TEXT" }],
        },
      };
      const entity2: BackendNode = {
        id: "ent-2",
        fractionalIndex: "a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "Product",
          databaseId: "db-2",
          columns: [{ name: "id", type: "TEXT" }],
        },
      };

      useBackendCanvasStore.setState({ nodes: [dbNode1, dbNode2, entity1, entity2] });

      vi.mocked(databaseService.checkDbTableSync).mockResolvedValue({
        success: true,
        serverReachable: true,
        tableExists: true,
        inSync: true,
        missingColumns: [],
        extraColumns: [],
        existingColumns: [],
        missingIndexes: [],
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: [],
        extraForeignKeys: [],
      });

      const summary = await useDbSyncStore.getState().validateDatabase("db-1");
      expect(summary.total).toBe(1);
      expect(summary.inSync).toBe(1);
      // Only ent-1 attached to db-1 should have been checked
      expect(databaseService.checkDbTableSync).toHaveBeenCalledTimes(1);
    });

    it("should cancel remaining requests when the first request fails", async () => {
      const dbNode: BackendNode = {
        id: "db-1",
        fractionalIndex: "a0",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          label: "Dev SQLite",
          dbEngine: "sqlite",
          dbFilePath: "dev.db",
        },
      };
      const entity1: BackendNode = {
        id: "ent-1",
        fractionalIndex: "a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "User",
          databaseId: "db-1",
          columns: [{ name: "id", type: "TEXT" }],
        },
      };
      const entity2: BackendNode = {
        id: "ent-2",
        fractionalIndex: "a1",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "Order",
          databaseId: "db-1",
          columns: [{ name: "id", type: "TEXT" }],
        },
      };
      const entity3: BackendNode = {
        id: "ent-3",
        fractionalIndex: "a2",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "Product",
          databaseId: "db-1",
          columns: [{ name: "id", type: "TEXT" }],
        },
      };

      useBackendCanvasStore.setState({ nodes: [dbNode, entity1, entity2, entity3] });

      // First table fails (e.g. server unreachable or error)
      vi.mocked(databaseService.checkDbTableSync).mockResolvedValueOnce({
        success: false,
        serverReachable: false,
        tableExists: false,
        inSync: false,
        missingColumns: [],
        extraColumns: [],
        existingColumns: [],
        missingIndexes: [],
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: [],
        extraForeignKeys: [],
        error: "Connection refused",
      });

      const summary = await useDbSyncStore.getState().validateDatabase("db-1");

      // Only the first table should have been checked; ent-2 and ent-3 must be cancelled / never called
      expect(databaseService.checkDbTableSync).toHaveBeenCalledTimes(1);
      expect(summary.total).toBe(3);
      expect(summary.errors).toBe(1);
      expect(summary.inSync).toBe(0);
      expect(summary.cancelled).toBe(true);

      // Remaining entities should not be in checking state
      const state = useDbSyncStore.getState();
      expect(state.entitySyncStatus["ent-2"]?.isChecking).toBeFalsy();
      expect(state.entitySyncStatus["ent-3"]?.isChecking).toBeFalsy();
      expect(state.validatingDatabases["db-1"]).toBeUndefined();
    });

    it("should allow manual cancellation via cancelDatabaseValidation", async () => {
      const dbNode: BackendNode = {
        id: "db-1",
        fractionalIndex: "a0",
        type: "database",
        position: { x: 0, y: 0 },
        data: {
          label: "Dev SQLite",
          dbEngine: "sqlite",
          dbFilePath: "dev.db",
        },
      };
      const entity1: BackendNode = {
        id: "ent-1",
        fractionalIndex: "a0",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "User",
          databaseId: "db-1",
          columns: [{ name: "id", type: "TEXT" }],
        },
      };
      const entity2: BackendNode = {
        id: "ent-2",
        fractionalIndex: "a1",
        type: "entity",
        position: { x: 0, y: 0 },
        data: {
          label: "Order",
          databaseId: "db-1",
          columns: [{ name: "id", type: "TEXT" }],
        },
      };

      useBackendCanvasStore.setState({ nodes: [dbNode, entity1, entity2] });

      vi.mocked(databaseService.checkDbTableSync).mockImplementation(async () => {
        // Cancel while first request is in-flight
        useDbSyncStore.getState().cancelDatabaseValidation("db-1");
        return {
          success: true,
          serverReachable: true,
          tableExists: true,
          inSync: true,
          missingColumns: [],
          extraColumns: [],
          existingColumns: [],
          missingIndexes: [],
          extraIndexes: [],
          existingIndexes: [],
          missingForeignKeys: [],
          extraForeignKeys: [],
        };
      });

      const summary = await useDbSyncStore.getState().validateDatabase("db-1");
      expect(summary.cancelled).toBe(true);
      // The second table should not have been called
      expect(databaseService.checkDbTableSync).toHaveBeenCalledTimes(1);
      expect(useDbSyncStore.getState().validatingDatabases["db-1"]).toBeUndefined();
    });
  });
});
