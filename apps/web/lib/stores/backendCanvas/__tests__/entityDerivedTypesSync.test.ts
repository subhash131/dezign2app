import { describe, it, expect, beforeEach } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  createTypesNodeFromEntity,
  createExtendedTypeNode,
} from "../packageTypesSync";
import {
  isEntitySyncedWithTypes,
  getOutOfSyncDerivedTypesNodes,
} from "../node/nodeEntitySync";
import { BackendNode } from "@/types/canvas";

describe("Entity to TypesNode Derivation & Out-of-Sync Banner Sync", () => {
  beforeEach(() => {
    useBackendCanvasStore.getState().reset("proj-entity-sync-test");
  });

  it("detects when Entity is out-of-sync and synchronizes when sync is triggered", () => {
    const store = useBackendCanvasStore.getState();

    // 1. Add an Entity Node
    const entityId = "entity-users-1";
    store.addNode({
      id: entityId,
      type: "entity",
      position: { x: 100, y: 100 },
      data: {
        label: "users",
        tableName: "users",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "email", type: "varchar", isNotNull: true },
        ],
      },
    });

    // 2. Generate TypesNode from Entity
    createTypesNodeFromEntity(entityId);

    const stateAfterGen = useBackendCanvasStore.getState();
    const entityAfterGen = stateAfterGen.nodes.find((n) => n.id === entityId)!;
    const typesNode = stateAfterGen.nodes.find(
      (n) => n.type === "types" && n.data?.sourceEntityId === entityId,
    )!;
    expect(typesNode).toBeDefined();
    expect(typesNode?.data?.label).toBe("Entity Types");
    expect(typesNode?.data?.types?.[0]?.name).toBe("Users");
    expect(typesNode?.data?.types?.[0]?.fields).toHaveLength(2);

    // Initial state is fully in sync
    expect(isEntitySyncedWithTypes(entityAfterGen, typesNode)).toBe(true);
    expect(getOutOfSyncDerivedTypesNodes(entityAfterGen, [typesNode])).toHaveLength(0);

    const emailField = typesNode?.data?.types?.[0]?.fields?.find((f) => f.name === "email");
    expect(emailField?.type).toBe("string");
    expect(emailField?.required).toBe(true);

    // 3. Connect a downstream service node to the TypesNode
    store.addNode({
      id: "service-auth-1",
      type: "service",
      position: { x: 600, y: 100 },
      data: { label: "Auth Service" },
    });

    store.addEdge({
      id: "edge-types-service",
      source: typesNode.id,
      target: "service-auth-1",
      sourceHandle: "types-out",
      targetHandle: "types-in",
      type: "type-reference",
    });

    // 4. Update the Entity: Add 'age' column and change 'email' nullability
    store.updateNode(entityId, {
      data: {
        label: "users",
        tableName: "users",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "email", type: "varchar", isNotNull: false },
          { name: "age", type: "integer", isNotNull: true },
        ],
      },
    });

    // Verify out-of-sync state: Entity was updated, but TypesNode requires sync action
    const stateBeforeSync = useBackendCanvasStore.getState();
    const entityBeforeSync = stateBeforeSync.nodes.find((n) => n.id === entityId)!;
    const typesBeforeSync = stateBeforeSync.nodes.find((n) => n.id === typesNode.id)!;
    expect(isEntitySyncedWithTypes(entityBeforeSync, typesBeforeSync)).toBe(false);
    expect(getOutOfSyncDerivedTypesNodes(entityBeforeSync, [typesBeforeSync])).toHaveLength(1);

    // 5. Trigger sync (as performed by the "Sync" button on the Entity banner)
    createTypesNodeFromEntity(entityId);

    const stateAfterUpdate = useBackendCanvasStore.getState();
    const updatedTypesNode = stateAfterUpdate.nodes.find(
      (n) => n.id === typesNode.id,
    )!;
    const updatedEntityNode = stateAfterUpdate.nodes.find((n) => n.id === entityId)!;

    // After sync, isEntitySyncedWithTypes is true, and out-of-sync list is empty (banner disappears)
    expect(isEntitySyncedWithTypes(updatedEntityNode, updatedTypesNode)).toBe(true);
    expect(getOutOfSyncDerivedTypesNodes(updatedEntityNode, [updatedTypesNode])).toHaveLength(0);

    // Derived types should now have 3 fields
    const updatedFields = updatedTypesNode?.data?.types?.[0]?.fields;
    expect(updatedFields).toHaveLength(3);

    const updatedEmail = updatedFields?.find((f) => f.name === "email");
    expect(updatedEmail?.required).toBe(false);

    const ageField = updatedFields?.find((f) => f.name === "age");
    expect(ageField).toBeDefined();
    expect(ageField?.type).toBe("number");
    expect(ageField?.required).toBe(true);

    // Verify warning metadata identifies downstream 'Auth Service'
    expect(updatedTypesNode?.data?.entitySyncWarning).toBeDefined();
    expect(updatedTypesNode?.data?.entitySyncWarning?.entityName).toBe("users");
    expect(updatedTypesNode?.data?.entitySyncWarning?.affectedNodes).toHaveLength(1);
    expect(updatedTypesNode?.data?.entitySyncWarning?.affectedNodes[0]?.name).toBe("Auth Service");
  });

  it("detects entity rename as out-of-sync and updates interface name and label on sync", () => {
    const store = useBackendCanvasStore.getState();

    const entityId = "entity-order-items-1";
    store.addNode({
      id: entityId,
      type: "entity",
      position: { x: 100, y: 100 },
      data: {
        label: "order_items",
        tableName: "order_items",
        columns: [
          { name: "id", type: "varchar", isPrimaryKey: true },
          { name: "quantity", type: "integer" },
        ],
      },
    });

    createTypesNodeFromEntity(entityId);

    const initialTypesNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.data?.sourceEntityId === entityId)!;
    expect(initialTypesNode?.data?.label).toBe("Entity Types");
    expect(initialTypesNode?.data?.types?.[0]?.name).toBe("OrderItems");

    // Rename Entity from 'order_items' to 'customer_orders'
    store.updateNode(entityId, {
      data: {
        label: "customer_orders",
        tableName: "customer_orders",
        columns: [
          { name: "id", type: "varchar", isPrimaryKey: true },
          { name: "quantity", type: "integer" },
        ],
      },
    });

    const entityBeforeSync = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === entityId)!;
    expect(isEntitySyncedWithTypes(entityBeforeSync, initialTypesNode)).toBe(false);

    // Trigger sync
    createTypesNodeFromEntity(entityId);

    const updatedTypesNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === initialTypesNode.id)!;

    expect(isEntitySyncedWithTypes(entityBeforeSync, updatedTypesNode)).toBe(true);
    expect(updatedTypesNode?.data?.label).toBe("Entity Types");
    expect(updatedTypesNode?.data?.types?.[0]?.name).toBe("CustomerOrders");
  });

  it("updates inherited fields in extended TypesNode when base Entity is synced", () => {
    const store = useBackendCanvasStore.getState();

    const entityId = "entity-product-1";
    store.addNode({
      id: entityId,
      type: "entity",
      position: { x: 100, y: 100 },
      data: {
        label: "products",
        tableName: "products",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "title", type: "text" },
        ],
      },
    });

    createTypesNodeFromEntity(entityId);

    const baseTypesNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.data?.sourceEntityId === entityId)!;
    const baseType = baseTypesNode.data.types![0]!;

    // Create an extended custom type node from the base type
    createExtendedTypeNode(baseTypesNode.id, baseType.id);

    const extendedNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.type === "types" && n.data?.isExtended === true)!;
    expect(extendedNode).toBeDefined();

    const initialExtFields = extendedNode.data.types![0]!.fields!;
    // 2 inherited + 1 custom = 3 fields
    expect(initialExtFields).toHaveLength(3);

    // Now update base entity: add 'price' column to products
    store.updateNode(entityId, {
      data: {
        label: "products",
        tableName: "products",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "title", type: "text" },
          { name: "price", type: "float" },
        ],
      },
    });

    const productEntity = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === entityId)!;
    expect(isEntitySyncedWithTypes(productEntity, baseTypesNode)).toBe(false);

    // Trigger sync
    createTypesNodeFromEntity(entityId);

    const updatedBaseNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === baseTypesNode.id)!;
    expect(isEntitySyncedWithTypes(productEntity, updatedBaseNode)).toBe(true);

    const updatedExtNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === extendedNode.id)!;
    const updatedExtFields = updatedExtNode.data.types![0]!.fields!;

    // Should now have 3 inherited + 1 custom = 4 fields
    expect(updatedExtFields).toHaveLength(4);
    const priceExtField = updatedExtFields.find((f) => f.name === "price");
    expect(priceExtField).toBeDefined();
    expect(priceExtField?.type).toBe("number");
    expect(priceExtField?.isInherited).toBe(true);

    // Custom attribute is preserved
    const customAttr = updatedExtFields.find((f) => f.name === "customAttribute");
    expect(customAttr).toBeDefined();
    expect(customAttr?.isInherited).toBeFalsy();
  });

  it("automatically generates companion TypesNode with schema types when table is created", () => {
    const store = useBackendCanvasStore.getState();

    // 1. Create a table via addTableNode
    store.addTableNode();

    const state = useBackendCanvasStore.getState();
    const entityNode = state.nodes.find((n) => n.type === "entity")!;
    expect(entityNode).toBeDefined();

    const typesNode = state.nodes.find(
      (n) => n.type === "types" && n.data?.sourceEntityId === entityNode.id,
    )!;
    expect(typesNode).toBeDefined();
    expect(typesNode.data?.types?.[0]?.name).toBe("Entity");
    expect(typesNode.data?.types?.[0]?.fields?.[0]?.name).toBe("id");

    const edge = state.edges.find(
      (e) => e.source === entityNode.id && e.target === typesNode.id,
    );
    expect(edge).toBeDefined();
    expect(edge?.type).toBe("type-reference");
    expect(edge?.data?.label).toBe("generates");
  });

  it("automatically generates companion TypesNodes for LangGraph checkpointer postgres tables", () => {
    const store = useBackendCanvasStore.getState();

    // Simulate adding langgraph checkpointer tables via store.addNode
    const checkpointerTables = [
      {
        id: "tbl-lg-checkpoints",
        type: "entity" as const,
        position: { x: 200, y: 200 },
        data: {
          label: "langgraph_checkpoints",
          tableName: "langgraph_checkpoints",
          systemBadge: "langgraph" as const,
          readOnly: true,
          columns: [
            { name: "thread_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
            { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true, isNotNull: true },
            { name: "checkpoint_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
            { name: "checkpoint", type: "JSON", isNotNull: true },
            { name: "metadata", type: "JSON", isNotNull: true },
          ],
        },
      },
      {
        id: "tbl-lg-writes",
        type: "entity" as const,
        position: { x: 520, y: 200 },
        data: {
          label: "langgraph_checkpoint_writes",
          tableName: "langgraph_checkpoint_writes",
          systemBadge: "langgraph" as const,
          readOnly: true,
          columns: [
            { name: "thread_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
            { name: "task_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
            { name: "channel", type: "TEXT", isNotNull: true },
            { name: "blob", type: "JSON", isNotNull: true },
          ],
        },
      },
    ];

    for (const tbl of checkpointerTables) {
      store.addNode(tbl);
    }

    const state = useBackendCanvasStore.getState();

    // Verify single consolidated Entity Types node was created
    const entityTypes = state.nodes.find(
      (n) => n.type === "types" && (n.data?.isEntitySchemas || n.id === "types-entity-schemas"),
    );
    expect(entityTypes).toBeDefined();
    expect(entityTypes?.data?.label).toBe("Entity Types");

    const checkpointsType = entityTypes?.data?.types?.find((t) => t.name === "LanggraphCheckpoints");
    expect(checkpointsType).toBeDefined();
    expect(checkpointsType?.fields).toHaveLength(5);

    const writesType = entityTypes?.data?.types?.find((t) => t.name === "LanggraphCheckpointWrites");
    expect(writesType).toBeDefined();
    expect(writesType?.fields).toHaveLength(4);

    // Verify "generates" edges exist
    const checkpointsEdge = state.edges.find(
      (e) => e.source === "tbl-lg-checkpoints" && e.target === entityTypes?.id,
    );
    expect(checkpointsEdge).toBeDefined();
    expect(checkpointsEdge?.type).toBe("type-reference");
    expect(checkpointsEdge?.data?.label).toBe("generates");
  });

  it("automatically generates companion TypesNodes for LangGraph redis_schema nodes", () => {
    const store = useBackendCanvasStore.getState();

    store.addNode({
      id: "schema-lg-redis",
      type: "redis_schema",
      position: { x: 200, y: 200 },
      data: {
        label: "langgraph_checkpoints",
        tableName: "langgraph_checkpoints",
        systemBadge: "langgraph",
        readOnly: true,
        columns: [
          { name: "checkpoint", type: "JSON", isNotNull: true },
          { name: "metadata", type: "JSON", isNotNull: true },
        ],
      },
    });

    const state = useBackendCanvasStore.getState();
    const typesNode = state.nodes.find(
      (n) => n.type === "types" && (n.data?.isEntitySchemas || n.id === "types-entity-schemas"),
    );
    expect(typesNode).toBeDefined();
    expect(typesNode?.data?.label).toBe("Entity Types");
    expect(typesNode?.data?.types?.[0]?.name).toBe("LanggraphCheckpoints");
    expect(typesNode?.data?.types?.[0]?.fields).toHaveLength(2);
  });

  it("automatically generates companion TypesNodes for tables created by authNode (Better Auth)", () => {
    const store = useBackendCanvasStore.getState();

    // 1. Simulate Auth Node creating core Better Auth tables (user, session, account, verification)
    const authTables = [
      {
        id: "tbl-auth-user",
        type: "entity" as const,
        position: { x: 400, y: 100 },
        data: {
          label: "user",
          tableName: "user",
          description: "Better Auth user account identity record",
          columns: [
            { name: "id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
            { name: "name", type: "TEXT", isNotNull: true },
            { name: "email", type: "TEXT", isNotNull: true },
            { name: "emailVerified", type: "BOOLEAN", isNotNull: true },
            { name: "image", type: "TEXT", isNotNull: false },
            { name: "createdAt", type: "TIMESTAMP", isNotNull: true },
            { name: "updatedAt", type: "TIMESTAMP", isNotNull: true },
          ],
        },
      },
      {
        id: "tbl-auth-session",
        type: "entity" as const,
        position: { x: 400, y: 240 },
        data: {
          label: "session",
          tableName: "session",
          description: "Better Auth active session record",
          columns: [
            { name: "id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
            { name: "userId", type: "TEXT", isNotNull: true, isForeignKey: true },
            { name: "token", type: "TEXT", isNotNull: true },
            { name: "expiresAt", type: "TIMESTAMP", isNotNull: true },
            { name: "ipAddress", type: "TEXT", isNotNull: false },
            { name: "userAgent", type: "TEXT", isNotNull: false },
          ],
        },
      },
      {
        id: "tbl-auth-account",
        type: "entity" as const,
        position: { x: 400, y: 380 },
        data: {
          label: "account",
          tableName: "account",
          description: "Better Auth social/credential account mapping",
          columns: [
            { name: "id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
            { name: "userId", type: "TEXT", isNotNull: true, isForeignKey: true },
            { name: "accountId", type: "TEXT", isNotNull: true },
            { name: "providerId", type: "TEXT", isNotNull: true },
            { name: "accessToken", type: "TEXT", isNotNull: false },
          ],
        },
      },
    ];

    for (const tbl of authTables) {
      store.addNode(tbl);
    }

    const state = useBackendCanvasStore.getState();

    // Verify single companion Entity Types node consolidates all Better Auth tables
    const entityTypesNode = state.nodes.find(
      (n) => n.type === "types" && (n.data?.isEntitySchemas || n.id === "types-entity-schemas"),
    );
    expect(entityTypesNode).toBeDefined();
    expect(entityTypesNode?.data?.label).toBe("Entity Types");

    const userType = entityTypesNode?.data?.types?.find((t) => t.name === "User");
    expect(userType).toBeDefined();
    expect(userType?.fields).toHaveLength(7);

    const sessionType = entityTypesNode?.data?.types?.find((t) => t.name === "Session");
    expect(sessionType).toBeDefined();
    expect(sessionType?.fields).toHaveLength(6);

    const accountType = entityTypesNode?.data?.types?.find((t) => t.name === "Account");
    expect(accountType).toBeDefined();
    expect(accountType?.fields).toHaveLength(5);

    // Verify all generated type-reference edges exist with label 'generates'
    for (const tbl of authTables) {
      const edge = state.edges.find(
        (e) => e.source === tbl.id && e.target === entityTypesNode?.id && e.type === "type-reference",
      );
      expect(edge).toBeDefined();
      expect(edge?.data?.label).toBe("generates");
    }
  });

  it("deletes the associated TypesNode and edge when an entity node is deleted", () => {
    const store = useBackendCanvasStore.getState();

    // 1. Add an Entity Node
    const entityId = "entity-delete-test-1";
    store.addNode({
      id: entityId,
      type: "entity",
      position: { x: 100, y: 100 },
      data: {
        label: "customers",
        tableName: "customers",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "name", type: "varchar", isNotNull: true },
        ],
      },
    });

    // 2. Generate TypesNode from Entity
    createTypesNodeFromEntity(entityId);

    const stateWithTypes = useBackendCanvasStore.getState();
    const typesNode = stateWithTypes.nodes.find(
      (n) => n.type === "types" && n.data?.sourceEntityId === entityId,
    );
    expect(typesNode).toBeDefined();

    const edge = stateWithTypes.edges.find(
      (e) => e.source === entityId && e.target === typesNode!.id,
    );
    expect(edge).toBeDefined();

    // Also add an unrelated TypesNode to ensure it is not deleted
    store.addNode({
      id: "unrelated-types",
      type: "types",
      position: { x: 500, y: 500 },
      data: {
        label: "Unrelated Types",
        types: [{ id: "custom-type-1", name: "Custom", fields: [], kind:"type" }],
      },
    });

    // 3. Delete the Entity Node
    store.deleteNode(entityId);

    const stateAfterDelete = useBackendCanvasStore.getState();

    // Verify entity node is deleted
    expect(stateAfterDelete.nodes.find((n) => n.id === entityId)).toBeUndefined();

    // Verify associated TypesNode is deleted
    expect(
      stateAfterDelete.nodes.find((n) => n.id === typesNode!.id),
    ).toBeUndefined();

    // Verify connecting edge is deleted
    expect(
      stateAfterDelete.edges.find((e) => e.source === entityId || e.target === typesNode!.id),
    ).toBeUndefined();

    // Verify unrelated TypesNode is preserved
    expect(
      stateAfterDelete.nodes.find((n) => n.id === "unrelated-types"),
    ).toBeDefined();
  });

  it("deletes associated TypesNode and extended TypesNode when entity is deleted", () => {
    const store = useBackendCanvasStore.getState();

    const entityId = "entity-delete-ext-test";
    store.addNode({
      id: entityId,
      type: "entity",
      position: { x: 100, y: 100 },
      data: {
        label: "products",
        tableName: "products",
        columns: [{ name: "id", type: "uuid", isPrimaryKey: true }],
      },
    });

    createTypesNodeFromEntity(entityId);

    const stateWithBase = useBackendCanvasStore.getState();
    const baseTypesNode = stateWithBase.nodes.find(
      (n) => n.data?.sourceEntityId === entityId,
    )!;
    expect(baseTypesNode).toBeDefined();

    const baseType = baseTypesNode.data.types![0]!;
    createExtendedTypeNode(baseTypesNode.id, baseType.id);

    const stateWithExt = useBackendCanvasStore.getState();
    const extTypesNode = stateWithExt.nodes.find(
      (n) => n.data?.extendedFromNodeId === baseTypesNode.id,
    );
    expect(extTypesNode).toBeDefined();

    // Delete entity
    store.deleteNode(entityId);

    const finalState = useBackendCanvasStore.getState();
    expect(finalState.nodes.find((n) => n.id === entityId)).toBeUndefined();
    expect(finalState.nodes.find((n) => n.id === baseTypesNode.id)).toBeUndefined();
    expect(finalState.nodes.find((n) => n.id === extTypesNode!.id)).toBeUndefined();
  });

  it("deleting an extended TypesNode does NOT delete the base TypesNode", () => {
    const store = useBackendCanvasStore.getState();
    const baseNodeId = "types-custom-app-regression-test";
    store.addNode({
      id: baseNodeId,
      type: "types",
      position: { x: 100, y: 100 },
      data: {
        label: "App Types",
        scope: "global",
        types: [
          {
            id: "type-app-user-1",
            name: "AppUser",
            kind: "interface",
            fields: [
              { id: "f-1", name: "id", type: "string", required: true, isArray: false },
            ],
          },
        ],
      },
    });

    createExtendedTypeNode(baseNodeId, "type-app-user-1");

    const stateWithExt = useBackendCanvasStore.getState();
    const extTypesNode = stateWithExt.nodes.find(
      (n) => n.data?.extendedFromNodeId === baseNodeId,
    )!;
    expect(extTypesNode).toBeDefined();

    // Now delete the extended types node directly
    store.deleteNode(extTypesNode.id);

    const finalState = useBackendCanvasStore.getState();
    // The extended node MUST be deleted
    expect(finalState.nodes.find((n) => n.id === extTypesNode.id)).toBeUndefined();
    // The base types node MUST NOT be deleted!
    expect(finalState.nodes.find((n) => n.id === baseNodeId)).toBeDefined();
  });

  it("allows extending the same base type multiple times with unique auto-incremented names and distinct edges", () => {
    const store = useBackendCanvasStore.getState();
    const baseNodeId = "types-multi-ext-base";
    store.addNode({
      id: baseNodeId,
      type: "types",
      position: { x: 100, y: 100 },
      data: {
        label: "Domain Types",
        scope: "global",
        types: [
          {
            id: "type-base-account",
            name: "Account",
            kind: "interface",
            fields: [
              { id: "f-id", name: "id", type: "string", required: true, isArray: false },
              { id: "f-email", name: "email", type: "string", required: true, isArray: false },
            ],
          },
        ],
      },
    });

    // 1. First extension: CustomAccount
    createExtendedTypeNode(baseNodeId, "type-base-account");

    const state1 = useBackendCanvasStore.getState();
    const extNode1 = state1.nodes.find((n) => n.data?.extendedFromNodeId === baseNodeId)!;
    expect(extNode1).toBeDefined();
    expect(extNode1.data.types).toHaveLength(1);
    expect(extNode1.data.types![0].name).toBe("CustomAccount");

    // 2. Second extension of the same base type: CustomAccount2
    createExtendedTypeNode(baseNodeId, "type-base-account");

    const state2 = useBackendCanvasStore.getState();
    const extNode2 = state2.nodes.find((n) => n.data?.extendedFromNodeId === baseNodeId)!;
    expect(extNode2.data.types).toHaveLength(2);
    expect(extNode2.data.types![1].name).toBe("CustomAccount2");
    expect(extNode2.data.types![1].extendedFrom).toBe("Account");
    expect(extNode2.data.types![1].extendedFromTypeId).toBe("type-base-account");

    // 3. Third extension: CustomAccount3
    createExtendedTypeNode(baseNodeId, "type-base-account");

    const state3 = useBackendCanvasStore.getState();
    const extNode3 = state3.nodes.find((n) => n.data?.extendedFromNodeId === baseNodeId)!;
    expect(extNode3.data.types).toHaveLength(3);
    expect(extNode3.data.types![2].name).toBe("CustomAccount3");

    // Verify 3 distinct extension edges exist
    const extEdges = state3.edges.filter(
      (e) =>
        e.data?.isExtensionEdge === true &&
        e.source === baseNodeId &&
        e.target === extNode3.id &&
        e.sourceHandle === "type-out-type-base-account",
    );
    expect(extEdges).toHaveLength(3);
  });

  it("consolidates multiple entities into 1 Entity Types node, removes only deleted entity type on partial deletion, and removes node on last entity deletion", () => {
    const store = useBackendCanvasStore.getState();

    // 1. Add two entities: users and posts
    const usersEntity = {
      id: "entity-users-multi",
      type: "entity" as const,
      position: { x: 100, y: 100 },
      data: {
        label: "users",
        tableName: "users",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "name", type: "varchar", isNotNull: true },
        ],
      },
    };
    const postsEntity = {
      id: "entity-posts-multi",
      type: "entity" as const,
      position: { x: 100, y: 300 },
      data: {
        label: "posts",
        tableName: "posts",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "title", type: "varchar", isNotNull: true },
        ],
      },
    };

    store.addNode(usersEntity);
    store.addNode(postsEntity);

    // Verify only ONE consolidated Entity Types node exists
    const stateAfterAdd = useBackendCanvasStore.getState();
    const entityTypesNodes = stateAfterAdd.nodes.filter(
      (n) => n.type === "types" && (n.data?.isEntitySchemas || n.id === "types-entity-schemas"),
    );
    expect(entityTypesNodes).toHaveLength(1);
    const consolidatedNode = entityTypesNodes[0]!;
    expect(consolidatedNode.data?.label).toBe("Entity Types");
    expect(consolidatedNode.data?.types).toHaveLength(2);
    expect(consolidatedNode.data?.types?.map((t) => t.name).sort()).toEqual(["Posts", "Users"]);

    // Verify both edges exist
    const userEdge = stateAfterAdd.edges.find((e) => e.source === usersEntity.id && e.target === consolidatedNode.id);
    const postEdge = stateAfterAdd.edges.find((e) => e.source === postsEntity.id && e.target === consolidatedNode.id);
    expect(userEdge).toBeDefined();
    expect(postEdge).toBeDefined();

    // 2. Delete the users entity
    store.deleteNode(usersEntity.id);

    const stateAfterDeleteUser = useBackendCanvasStore.getState();
    // Consolidated node MUST still exist because posts still exists!
    const consolidatedAfterFirstDelete = stateAfterDeleteUser.nodes.find((n) => n.id === consolidatedNode.id);
    expect(consolidatedAfterFirstDelete).toBeDefined();
    // Posts type remains, Users type removed
    expect(consolidatedAfterFirstDelete?.data?.types).toHaveLength(1);
    expect(consolidatedAfterFirstDelete?.data?.types?.[0]?.name).toBe("Posts");

    // User edge should be gone, Post edge preserved
    expect(stateAfterDeleteUser.edges.find((e) => e.source === usersEntity.id)).toBeUndefined();
    expect(stateAfterDeleteUser.edges.find((e) => e.source === postsEntity.id)).toBeDefined();

    // 3. Delete the posts entity (last entity)
    store.deleteNode(postsEntity.id);

    const stateAfterDeleteAll = useBackendCanvasStore.getState();
    // Now that no entities remain, consolidated node should be cleaned up
    expect(stateAfterDeleteAll.nodes.find((n) => n.id === consolidatedNode.id)).toBeUndefined();
    expect(stateAfterDeleteAll.edges.find((e) => e.target === consolidatedNode.id)).toBeUndefined();
  });
});
