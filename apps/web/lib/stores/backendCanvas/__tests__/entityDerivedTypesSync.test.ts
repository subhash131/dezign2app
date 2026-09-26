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
    expect(typesNode?.data?.label).toBe("Users Types");
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
    expect(initialTypesNode?.data?.label).toBe("OrderItems Types");
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
    expect(updatedTypesNode?.data?.label).toBe("CustomerOrders Types");
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
});
