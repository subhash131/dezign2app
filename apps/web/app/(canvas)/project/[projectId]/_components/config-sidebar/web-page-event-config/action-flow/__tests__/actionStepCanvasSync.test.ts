import { describe, it, expect, beforeEach } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import type { BackendNode, BackendEdge } from "@workspace/canvas";
import {
  ensureActionServiceConnection,
  ensureActionStorageConnection,
  ensureActionStateStoreConnection,
  cleanupActionStepEdge,
} from "../actionStepCanvasSync";

describe("actionStepCanvasSync - previous edge update and removal", () => {
  beforeEach(() => {
    useBackendCanvasStore.getState().reset("test-proj");
  });

  const setupCanvas = () => {
    const webPageNode: BackendNode = {
      id: "page-1",
      type: "webPage",
      position: { x: 50, y: 100 },
      fractionalIndex: "a0",
      data: {
        label: "Home Page",
        sections: [
          {
            id: "sec-1",
            name: "Main",
            renderMode: "client",
            actions: [
              {
                id: "act-load",
                name: "pageLoad",
                event: "pageLoad",
              },
            ],
          },
        ],
      },
    };

    const usersServiceNode: BackendNode = {
      id: "srv-users",
      type: "service",
      position: { x: 500, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "UsersService",
        endpoints: [
          { id: "ep-health", name: "health", type: "GET" },
          { id: "ep-users-list", name: "listUsers", type: "GET" },
        ],
      },
    };

    const ordersServiceNode: BackendNode = {
      id: "srv-orders",
      type: "service",
      position: { x: 500, y: 300 },
      fractionalIndex: "a2",
      data: {
        label: "OrdersService",
        endpoints: [
          { id: "ep-orders-list", name: "listOrders", type: "GET" },
        ],
      },
    };

    const storageNode: BackendNode = {
      id: "storage-node-1",
      type: "storage",
      position: { x: 500, y: 500 },
      fractionalIndex: "a3",
      data: {
        label: "Main Storage",
        buckets: [
          { id: "bucket-avatars", name: "avatars" },
          { id: "bucket-documents", name: "documents" },
        ],
      },
    };

    const stateStoreNode: BackendNode = {
      id: "store-node-1",
      type: "state_store",
      position: { x: 500, y: 700 },
      fractionalIndex: "a4",
      data: {
        label: "AppStore",
        storeName: "AppStore",
        fields: [
          { id: "f-user", name: "currentUser", type: "string", reducer: "replace" },
          { id: "f-count", name: "count", type: "number", reducer: "counterActions" },
        ],
      },
    };

    const store = useBackendCanvasStore.getState();
    store.addNode(webPageNode);
    store.addNode(usersServiceNode);
    store.addNode(ordersServiceNode);
    store.addNode(storageNode);
    store.addNode(stateStoreNode);
    // Clear companion type-reference edges auto-created with services so tests isolate action edges
    useBackendCanvasStore.setState({ edges: [] });

    return { webPageNode, usersServiceNode, ordersServiceNode, storageNode, stateStoreNode };
  };

  it("updates existing edge and does NOT leave previous edge when endpoint is changed", () => {
    setupCanvas();

    // Initial connection to users /health
    const initialEdgeId = ensureActionServiceConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      serviceNodeId: "srv-users",
      endpointId: "ep-health",
      stepOrder: 1,
    });

    expect(initialEdgeId).toBeDefined();
    let edges = useBackendCanvasStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe("srv-users");
    expect(edges[0]?.targetHandle).toBe("endpoint-in-ep-health");
    expect(edges[0]?.data?.sequenceOrder).toBe(1);

    // Now change endpoint to /listUsers on the same service
    const updatedEdgeId = ensureActionServiceConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      serviceNodeId: "srv-users",
      endpointId: "ep-users-list",
      stepOrder: 1,
      previousEdgeId: initialEdgeId,
    });

    edges = useBackendCanvasStore.getState().edges;
    // Exactly 1 edge should remain (no duplicate or previous edge left behind)
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe("srv-users");
    expect(edges[0]?.targetHandle).toBe("endpoint-in-ep-users-list");
    expect(edges[0]?.id).toBe(initialEdgeId);
    expect(updatedEdgeId).toBe(initialEdgeId);
  });

  it("updates existing edge target to new service and does NOT leave previous edge when service is changed", () => {
    setupCanvas();

    // Initial connection to users /health
    const initialEdgeId = ensureActionServiceConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      serviceNodeId: "srv-users",
      endpointId: "ep-health",
      stepOrder: 1,
    });

    expect(useBackendCanvasStore.getState().edges).toHaveLength(1);

    // Change service to orders /listOrders
    const updatedEdgeId = ensureActionServiceConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      serviceNodeId: "srv-orders",
      endpointId: "ep-orders-list",
      stepOrder: 1,
      previousEdgeId: initialEdgeId,
    });

    const edges = useBackendCanvasStore.getState().edges;
    // The previous edge to users is gone, only the edge to orders exists
    expect(edges).toHaveLength(1);
    expect(edges[0]?.target).toBe("srv-orders");
    expect(edges[0]?.targetHandle).toBe("endpoint-in-ep-orders-list");
    expect(edges.some((e) => e.target === "srv-users")).toBe(false);
  });

  it("deletes previous edge if an edge to the target already exists", () => {
    setupCanvas();

    // Step 1: connects to users
    const edge1Id = ensureActionServiceConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      serviceNodeId: "srv-users",
      endpointId: "ep-health",
      stepOrder: 1,
    });

    // Step 2: connects to orders
    const edge2Id = ensureActionServiceConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      serviceNodeId: "srv-orders",
      endpointId: "ep-orders-list",
      stepOrder: 2,
    });

    expect(useBackendCanvasStore.getState().edges).toHaveLength(2);

    // User changes Step 1 to also point to orders ep-orders-list (which already has edge2Id)
    const resultEdgeId = ensureActionServiceConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      serviceNodeId: "srv-orders",
      endpointId: "ep-orders-list",
      stepOrder: 1,
      previousEdgeId: edge1Id,
    });

    const edges = useBackendCanvasStore.getState().edges;
    // edge1Id was removed, only edge2 remains (now renumbered to step 1)
    expect(edges).toHaveLength(1);
    expect(edges[0]?.id).toBe(edge2Id);
    expect(edges[0]?.data?.sequenceOrder).toBe(1);
    expect(resultEdgeId).toBe(edge2Id);
  });

  it("cleans up previous edge and ref node when storage bucket target changes", () => {
    setupCanvas();

    // Connect to avatars bucket
    const res1 = ensureActionStorageConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      storageNodeId: "storage-node-1",
      bucketId: "bucket-avatars",
      stepOrder: 1,
    });

    expect(res1).toBeDefined();
    let edges = useBackendCanvasStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]?.data?.bucketId).toBe("bucket-avatars");

    // Change to documents bucket
    const res2 = ensureActionStorageConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      storageNodeId: "storage-node-1",
      bucketId: "bucket-documents",
      stepOrder: 1,
      previousEdgeId: res1?.edgeId,
    });

    expect(res2).toBeDefined();
    edges = useBackendCanvasStore.getState().edges;
    // Exactly 1 edge remains, pointing to documents
    expect(edges).toHaveLength(1);
    expect(edges[0]?.data?.bucketId).toBe("bucket-documents");
    expect(edges.some((e) => e.data?.bucketId === "bucket-avatars")).toBe(false);

    // The old orphaned avatars ref node was deleted
    const nodes = useBackendCanvasStore.getState().nodes;
    expect(nodes.some((n) => n.id === res1?.refNodeId)).toBe(false);
  });

  it("creates and updates state_store connection edge with isStateMutation and targetFieldId", () => {
    setupCanvas();

    // 1. Connect to currentUser field
    const edge1Id = ensureActionStateStoreConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      stateStoreNodeId: "store-node-1",
      targetFieldId: "f-user",
      stepOrder: 1,
    });

    expect(edge1Id).toBeDefined();
    let edges = useBackendCanvasStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]?.source).toBe("store-node-1");
    expect(edges[0]?.target).toBe("page-1");
    expect(edges[0]?.sourceHandle).toBe("store-field-out-f-user");
    expect(edges[0]?.targetHandle).toBe("pageload-in-act-load");
    expect(edges[0]?.data?.targetFieldId).toBe("f-user");
    expect(edges[0]?.data?.isStateMutation).toBe(true);
    expect(edges[0]?.data?.sequenceOrder).toBe(1);

    // 2. Change target field to count
    const edge2Id = ensureActionStateStoreConnection({
      webPageNodeId: "page-1",
      actionId: "act-load",
      stateStoreNodeId: "store-node-1",
      targetFieldId: "f-count",
      stepOrder: 1,
      previousEdgeId: edge1Id,
    });

    expect(edge2Id).toBe(edge1Id);
    edges = useBackendCanvasStore.getState().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]?.source).toBe("store-node-1");
    expect(edges[0]?.target).toBe("page-1");
    expect(edges[0]?.sourceHandle).toBe("store-field-out-f-count");
    expect(edges[0]?.targetHandle).toBe("pageload-in-act-load");
    expect(edges[0]?.data?.targetFieldId).toBe("f-count");
    expect(edges[0]?.data?.isStateMutation).toBe(true);

    // 3. Cleanup edge
    if (edge2Id) {
      cleanupActionStepEdge(edge2Id);
    }
    edges = useBackendCanvasStore.getState().edges;
    expect(edges).toHaveLength(0);
  });
});
