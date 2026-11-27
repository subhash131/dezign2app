import { describe, it, expect } from "vitest";
import {
  generateRedisOperations,
  getEntityDbOperations,
} from "../entityOperationsHelper";
import { BackendNode, DbOperationFunction } from "@/types/canvas";

describe("entityOperationsHelper - Redis Operations Generator", () => {
  describe("generateRedisOperations", () => {
    it("generates native Redis List operations for structure === 'list'", () => {
      const ops = generateRedisOperations("ChatMessage", {
        label: "ChatMessage",
        redisDataStructure: "list",
      });

      const opNames = ops.map((o) => o.name);
      expect(opNames).toEqual([
        "pushChatMessage",
        "popChatMessage",
        "getChatMessageList",
        "getChatMessageLength",
        "deleteChatMessage",
      ]);

      const pushOp = ops.find((o) => o.name === "pushChatMessage")!;
      expect(pushOp.code).toContain("redis.rpush(key, ...items)");
      expect(pushOp.kind).toBe("create");

      const popOp = ops.find((o) => o.name === "popChatMessage")!;
      expect(popOp.code).toContain("redis.lpop(key)");
      expect(popOp.kind).toBe("delete");

      const getListOp = ops.find((o) => o.name === "getChatMessageList")!;
      expect(getListOp.code).toContain("redis.lrange(key, start, stop)");
      expect(getListOp.kind).toBe("findAll");

      const getLenOp = ops.find((o) => o.name === "getChatMessageLength")!;
      expect(getLenOp.code).toContain("redis.llen(key)");
      expect(getLenOp.kind).toBe("findById");

      const delOp = ops.find((o) => o.name === "deleteChatMessage")!;
      expect(delOp.code).toContain("redis.del(key)");
      expect(delOp.kind).toBe("delete");
    });

    it("generates RedisJSON Array operations for structure === 'json' and jsonRootType === 'array'", () => {
      const ops = generateRedisOperations("Conversation", {
        label: "Conversation",
        redisDataStructure: "json",
        jsonRootType: "array",
      });

      const opNames = ops.map((o) => o.name);
      expect(opNames).toEqual([
        "appendConversationItem",
        "popConversationItem",
        "getRecentConversationItems",
        "getConversationLength",
        "getConversation",
        "setConversation",
        "deleteConversation",
      ]);

      const appendOp = ops.find((o) => o.name === "appendConversationItem")!;
      expect(appendOp.code).toContain('JSON.ARRAPPEND');
      expect(appendOp.kind).toBe("create");

      const popOp = ops.find((o) => o.name === "popConversationItem")!;
      expect(popOp.code).toContain('JSON.ARRPOP');
      expect(popOp.kind).toBe("delete");

      const recentOp = ops.find((o) => o.name === "getRecentConversationItems")!;
      expect(recentOp.code).toContain('JSON.GET');
      expect(recentOp.code).toContain("PATH");
      expect(recentOp.kind).toBe("findAll");

      const lenOp = ops.find((o) => o.name === "getConversationLength")!;
      expect(lenOp.code).toContain('JSON.ARRLEN');
      expect(lenOp.kind).toBe("findById");

      const getDocOp = ops.find((o) => o.name === "getConversation")!;
      expect(getDocOp.code).toContain('JSON.GET');

      const setDocOp = ops.find((o) => o.name === "setConversation")!;
      expect(setDocOp.code).toContain('JSON.SET');

      const delOp = ops.find((o) => o.name === "deleteConversation")!;
      expect(delOp.code).toContain("redis.del(key)");
    });

    it("generates standard Redis operations for structure === 'json' with jsonRootType === 'object'", () => {
      const ops = generateRedisOperations("UserSession", {
        label: "UserSession",
        redisDataStructure: "json",
        jsonRootType: "object",
      });

      const opNames = ops.map((o) => o.name);
      expect(opNames).toEqual([
        "getUserSession",
        "setUserSession",
        "deleteUserSession",
      ]);
    });

    it("generates Hash operations for structure === 'hash'", () => {
      const ops = generateRedisOperations("UserProfile", {
        label: "UserProfile",
        redisDataStructure: "hash",
      });

      const opNames = ops.map((o) => o.name);
      expect(opNames).toEqual([
        "getAllUserProfileFields",
        "getUserProfileField",
        "setUserProfileFields",
        "expireUserProfileField",
        "deleteUserProfile",
      ]);
    });
  });

  describe("getEntityDbOperations - Auto-refresh & Cleansing", () => {
    it("auto-generates List operations when node has no dbOperations", () => {
      const node: BackendNode = {
        id: "redis-node-1",
        type: "redis_schema",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "TasksQueue",
          dbType: "redis",
          redisDataStructure: "list",
        },
      };

      const ops = getEntityDbOperations(node);
      expect(ops.map((o) => o.name)).toContain("pushTasksQueue");
      expect(ops.map((o) => o.name)).toContain("popTasksQueue");
      expect(ops.map((o) => o.name)).toContain("getTasksQueueList");
    });

    it("auto-cleanses stale auto-generated Hash operations when structure was changed to List", () => {
      const node: BackendNode = {
        id: "redis-node-1",
        type: "redis_schema",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "Queue",
          dbType: "redis",
          redisDataStructure: "list", // switched to list!
          dbOperations: [
            {
              id: "redis-hgetall-queue",
              name: "getAllQueueFields",
              kind: "findAll",
              description: "Stale Hash op",
              signature: "getAllQueueFields(key: string): Promise<Record<string, string>>",
              params: [{ name: "key", type: "string", required: true }],
              returnType: "Promise<Record<string, string>>",
              code: "...",
              enabled: true,
              isAutoGenerated: true,
            },
          ],
        },
      };

      const ops = getEntityDbOperations(node);
      const opNames = ops.map((o) => o.name);
      // Stale hash operation should be replaced with native list operations
      expect(opNames).not.toContain("getAllQueueFields");
      expect(opNames).toContain("pushQueue");
      expect(opNames).toContain("popQueue");
      expect(opNames).toContain("getQueueList");
      expect(opNames).toContain("getQueueLength");
    });

    it("preserves custom operations while replacing stale auto-generated operations", () => {
      const customOp: DbOperationFunction = {
        id: "custom-my-op",
        name: "myCustomQueueProcessor",
        kind: "custom",
        description: "User written custom Redis op",
        signature: "myCustomQueueProcessor(key: string): Promise<void>",
        params: [{ name: "key", type: "string", required: true }],
        returnType: "Promise<void>",
        code: "export async function myCustomQueueProcessor() {}",
        enabled: true,
        isAutoGenerated: false,
      };

      const staleAutoOp: DbOperationFunction = {
        id: "redis-hgetall-queue",
        name: "getAllQueueFields",
        kind: "findAll",
        description: "Stale Hash op",
        signature: "getAllQueueFields(key: string): Promise<Record<string, string>>",
        params: [{ name: "key", type: "string", required: true }],
        returnType: "Promise<Record<string, string>>",
        code: "...",
        enabled: true,
        isAutoGenerated: true,
      };

      const node: BackendNode = {
        id: "redis-node-1",
        type: "redis_schema",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "Queue",
          dbType: "redis",
          redisDataStructure: "list",
          dbOperations: [staleAutoOp, customOp],
        },
      };

      const ops = getEntityDbOperations(node);
      const opNames = ops.map((o) => o.name);
      expect(opNames).not.toContain("getAllQueueFields");
      expect(opNames).toContain("pushQueue");
      expect(opNames).toContain("myCustomQueueProcessor");
    });

    it("cleanses stale operations when toggling JSON object to JSON array", () => {
      const staleGenericGet: DbOperationFunction = {
        id: "redis-get-chat",
        name: "getChat",
        kind: "findById",
        description: "Generic string get",
        signature: "getChat(key: string): Promise<any>",
        params: [{ name: "key", type: "string", required: true }],
        returnType: "Promise<any>",
        code: "...",
        enabled: true,
        isAutoGenerated: true,
      };

      const node: BackendNode = {
        id: "redis-node-1",
        type: "redis_schema",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "Chat",
          dbType: "redis",
          redisDataStructure: "json",
          jsonRootType: "array", // Toggled to array!
          dbOperations: [staleGenericGet],
        },
      };

      const ops = getEntityDbOperations(node);
      const opNames = ops.map((o) => o.name);
      expect(opNames).toContain("appendChatItem");
      expect(opNames).toContain("popChatItem");
      expect(opNames).toContain("getRecentChatItems");
      expect(opNames).toContain("getChatLength");
    });

    it("automatically cleanses stale generic operations (<T>) and replaces with typed Result envelopes", () => {
      const staleGenericConversationOp: DbOperationFunction = {
        id: "redis-json-get-conversation",
        name: "getConversation",
        kind: "findById",
        description: "Retrieve entire RedisJSON array document [Conversation] (JSON.GET)",
        signature: "getConversation<T = ConversationItem[]>(key: string): Promise<T | null>",
        params: [{ name: "key", type: "string", required: true }],
        returnType: "Promise<ConversationItem[] | null>",
        logicMode: "code",
        code: `export async function getConversation<T = ConversationItem[]>(key: string): Promise<T | null> {\n  const redis = await getRedisClient();\n  const res = await redis.call("JSON.GET", key);\n  if (!res) return null;\n  try { return JSON.parse(res as string) as T; } catch { return null; }\n}`,
        enabled: true,
        isAutoGenerated: true,
      };

      const node: BackendNode = {
        id: "redis-node-conv",
        type: "redis_schema",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "Conversation",
          dbType: "redis",
          redisDataStructure: "json",
          jsonRootType: "array",
          dbOperations: [staleGenericConversationOp],
        },
      };

      const ops = getEntityDbOperations(node);
      const getConv = ops.find((o) => o.name === "getConversation");
      expect(getConv).toBeDefined();

      // Verify zero generic parameters remain in signature, code, or returnType
      expect(getConv!.signature).not.toContain("<T");
      expect(getConv!.code).not.toContain("<T");
      expect(getConv!.returnType).not.toContain("<T");

      // Verify it returns the concrete Promise<GetConversationResult>
      expect(getConv!.signature).toBe("getConversation(key: string): Promise<GetConversationResult>");
      expect(getConv!.returnType).toBe("Promise<GetConversationResult>");
      expect(getConv!.code).toContain("success: true");
      expect(getConv!.code).toContain("success: false");

      // Verify node.data.dbOperations was also updated in place
      expect(node.data.dbOperations).toBe(ops);
      expect(node.data.dbOperations!.some((o) => o.code?.includes("<T"))).toBe(false);

      // Verify zero any, unknown, or 'as <Type>' casts across all regenerated operations
      for (const op of ops) {
        if (!op.code) continue;
        expect(op.code).not.toMatch(/:\s*any\b/);
        expect(op.code).not.toMatch(/<any>/);
        expect(op.code).not.toMatch(/:\s*unknown\b/);
        expect(op.code).not.toMatch(/<unknown>/);
        expect(op.code).not.toMatch(/\bas\s+[A-Za-z0-9_]+/);
      }
    });
  });

  describe("upsert<TableName> operations", () => {
    it("generates default upsert operation for SQLite", async () => {
      const { generateDefaultDbOperations } = await import("../entityOperationsHelper");
      const ops = generateDefaultDbOperations("User", [
        { name: "id", type: "string", isPrimaryKey: true },
        { name: "name", type: "string" },
        { name: "email", type: "string" },
      ]);

      const upsertOp = ops.find((o) => o.kind === "upsert");
      expect(upsertOp).toBeDefined();
      expect(upsertOp?.name).toBe("upsertUser");
      expect(upsertOp?.signature).toContain("upsertUser(data: UpsertUserData): User");
      expect(upsertOp?.code).toContain("stmtUpsert.run");
    });

    it("generates default upsert operation for PostgreSQL with ON CONFLICT", async () => {
      const { generateDefaultDbOperationsForEngine } = await import("../entityOperationsHelper");
      const ops = generateDefaultDbOperationsForEngine(
        "User",
        [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "name", type: "string" },
          { name: "email", type: "string" },
        ],
        [],
        [],
        "postgres",
      );

      const upsertOp = ops.find((o) => o.kind === "upsert");
      expect(upsertOp).toBeDefined();
      expect(upsertOp?.name).toBe("upsertUser");
      expect(upsertOp?.code).toContain('ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "email" = EXCLUDED."email" RETURNING *');
    });

    it("automatically injects upsert operation into existing entity nodes missing upsert", () => {
      const node: BackendNode = {
        id: "node-user-1",
        type: "entity",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "User",
          columns: [
            { name: "id", type: "string", isPrimaryKey: true },
            { name: "name", type: "string" },
          ],
          dbOperations: [
            { id: "auto-find-all-user", name: "findAllUsers", kind: "findAll" },
            { id: "auto-create-user", name: "createUser", kind: "create" },
            { id: "auto-update-user", name: "updateUser", kind: "update" },
            { id: "auto-delete-user", name: "deleteUserById", kind: "delete" },
          ],
        },
      };

      const ops = getEntityDbOperations(node, [], "postgres");
      const upsertOp = ops.find((o) => o.kind === "upsert");
      expect(upsertOp).toBeDefined();
      expect(upsertOp?.name).toBe("upsertUser");
    });
  });

  describe("Index rename synchronization for helper functions", () => {
    it("generates findAllConversationsByUser when index is named 'user' on createdBy column in PostgreSQL", async () => {
      const { generateDefaultDbOperationsForEngine } = await import("../entityOperationsHelper");
      const ops = generateDefaultDbOperationsForEngine(
        "conversations",
        [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string" },
          { name: "createdBy", type: "string", isForeignKey: true },
        ],
        [
          { name: "user", columns: "createdBy", isUnique: false },
        ],
        [],
        "postgres",
      );

      const indexOp = ops.find((o) => o.kind === "fetchByIndex");
      expect(indexOp).toBeDefined();
      expect(indexOp?.name).toBe("findAllConversationsByUser");
      expect(indexOp?.indexName).toBe("user");
      expect(indexOp?.signature).toContain("findAllConversationsByUser(createdBy: string");
      expect(indexOp?.code).toContain('export async function findAllConversationsByUser');
    });

    it("automatically synchronizes existing dbOperations when index was renamed from createdBy to user", () => {
      const node: BackendNode = {
        id: "node-conversations",
        type: "entity",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "conversations",
          columns: [
            { name: "id", type: "string", isPrimaryKey: true },
            { name: "title", type: "string" },
            { name: "createdBy", type: "string", isForeignKey: true },
          ],
          // Index was renamed from 'createdBy' to 'user'
          indexes: [
            { name: "user", columns: "createdBy", isUnique: false },
          ],
          // Stale dbOperations that previously had findAllConversationsByCreatedBy
          dbOperations: [
            { id: "auto-find-all-conversations", name: "findAllConversations", kind: "findAll", isAutoGenerated: true },
            { id: "auto-find-by-id-conversations", name: "findConversationById", kind: "findById", isAutoGenerated: true },
            { id: "auto-create-conversations", name: "createConversation", kind: "create", isAutoGenerated: true },
            { id: "auto-update-conversations", name: "updateConversation", kind: "update", isAutoGenerated: true },
            { id: "auto-upsert-conversations", name: "upsertConversation", kind: "upsert", isAutoGenerated: true },
            { id: "auto-delete-conversations", name: "deleteConversationById", kind: "delete", isAutoGenerated: true },
            {
              id: "auto-index-conversations-createdBy-0",
              name: "findAllConversationsByCreatedBy",
              kind: "fetchByIndex",
              indexName: "createdBy",
              isAutoGenerated: true,
              enabled: true,
            },
          ],
        },
      };

      const ops = getEntityDbOperations(node, [], "postgres");
      const indexOp = ops.find((o) => o.kind === "fetchByIndex");
      expect(indexOp).toBeDefined();
      expect(indexOp?.name).toBe("findAllConversationsByUser");
      expect(indexOp?.indexName).toBe("user");
      // Verify node.data.dbOperations was also synchronized in place
      expect(node.data.dbOperations?.some((o) => o.name === "findAllConversationsByUser")).toBe(true);
      expect(node.data.dbOperations?.some((o) => o.name === "findAllConversationsByCreatedBy")).toBe(false);
    });

    it("automatically synchronizes createUser, updateUser, and upsertUser signatures and params when a field name is renamed", () => {
      const node: BackendNode = {
        id: "node-user-1",
        type: "entity",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "user",
          columns: [
            { name: "id", type: "string", isPrimaryKey: true },
            { name: "namede", type: "string" }, // Renamed from 'name'
            { name: "test", type: "string" },
          ],
          indexes: [],
          // Old dbOperations with previous field name 'name'
          dbOperations: [
            { id: "auto-find-all-user", name: "findAllUsers", kind: "findAll", isAutoGenerated: true },
            { id: "auto-find-by-id-user", name: "findUserById", kind: "findById", isAutoGenerated: true },
            {
              id: "auto-create-user",
              name: "createUser",
              kind: "create",
              signature: "createUser({ id, name, test }: CreateUserData): Promise<User>",
              params: [{ name: "{ id, name, test }", type: "CreateUserData", required: true }],
              isAutoGenerated: true,
            },
            {
              id: "auto-update-user",
              name: "updateUser",
              kind: "update",
              signature: "updateUser(id: string, { name, test }: UpdateUserData): Promise<User | null>",
              params: [
                { name: "id", type: "string", required: true },
                { name: "{ name, test }", type: "UpdateUserData", required: true },
              ],
              isAutoGenerated: true,
            },
            {
              id: "auto-upsert-user",
              name: "upsertUser",
              kind: "upsert",
              signature: "upsertUser({ id, name, test }: UpsertUserData): Promise<User>",
              params: [{ name: "{ id, name, test }", type: "UpsertUserData", required: true }],
              isAutoGenerated: true,
            },
            { id: "auto-delete-user", name: "deleteUserById", kind: "delete", isAutoGenerated: true },
          ],
        },
      };

      const ops = getEntityDbOperations(node, [], "postgres");
      const createOp = ops.find((o) => o.kind === "create");
      const updateOp = ops.find((o) => o.kind === "update");
      const upsertOp = ops.find((o) => o.kind === "upsert");

      expect(createOp?.signature).toContain("namede");
      expect(createOp?.signature).not.toMatch(/\bname\b/);
      expect(createOp?.params?.[0]?.name).toContain("namede");

      expect(updateOp?.signature).toContain("namede");
      expect(updateOp?.signature).not.toMatch(/\bname\b/);

      expect(upsertOp?.signature).toContain("namede");
      expect(upsertOp?.signature).not.toMatch(/\bname\b/);

      // Verify node.data.dbOperations was updated in place
      const updatedNodeCreate = node.data.dbOperations?.find((o) => o.kind === "create");
      expect(updatedNodeCreate?.signature).toContain("namede");
    });

    it('disambiguates operations when both "user" and "users" tables exist on the canvas', () => {
      const userNode: BackendNode = {
        id: "entity-user",
        type: "entity",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "user",
          columns: [
            { name: "id", type: "UUID", isPrimaryKey: true },
            { name: "email", type: "TEXT" },
          ],
        },
      };

      const usersNode: BackendNode = {
        id: "entity-users",
        type: "entity",
        position: { x: 200, y: 0 },
        fractionalIndex: "a1",
        data: {
          label: "users",
          columns: [
            { name: "id", type: "UUID", isPrimaryKey: true },
            { name: "handle", type: "TEXT" },
          ],
        },
      };

      const allNodes = [userNode, usersNode];

      const pgUserOps = getEntityDbOperations(userNode, allNodes, "postgres").map((o) => o.name);
      const pgUsersOps = getEntityDbOperations(usersNode, allNodes, "postgres").map((o) => o.name);

      expect(pgUserOps).toContain("findAllUser");
      expect(pgUserOps).toContain("createUser");
      expect(pgUserOps).not.toContain("findAllUsers");

      expect(pgUsersOps).toContain("findAllUsers");
      expect(pgUsersOps).toContain("createUsers");
      expect(pgUsersOps).not.toContain("createUser");

      const sqliteUserOps = getEntityDbOperations(userNode, allNodes, "sqlite").map((o) => o.name);
      const sqliteUsersOps = getEntityDbOperations(usersNode, allNodes, "sqlite").map((o) => o.name);

      expect(sqliteUserOps).toContain("findAllUser");
      expect(sqliteUserOps).toContain("createUser");
      expect(sqliteUsersOps).toContain("findAllUsers");
      expect(sqliteUsersOps).toContain("createUsers");
    });
  });
});
