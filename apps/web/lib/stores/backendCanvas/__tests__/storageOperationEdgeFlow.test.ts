import { describe, it, expect, beforeEach } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas";
import { cleanupDeletedEdgesState } from "../stateCleanup";

describe("StorageOperation Edge Flow: WebPage -> StorageRef -> Service Endpoint", () => {
  beforeEach(() => {
    useBackendCanvasStore.getState().reset("proj-storage-edge-test");
  });

  const createInitialNodes = () => {
    const webPageNode: BackendNode = {
      id: "page-1",
      type: "webPage",
      position: { x: 50, y: 100 },
      fractionalIndex: "a0",
      data: {
        label: "Profile Page",
        path: "/profile",
        sections: [
          {
            id: "sec-1",
            name: "Main",
            renderMode: "client",
            actions: [
              {
                id: "act-upload-1",
                name: "upload image",
                event: "click",
              },
            ],
            stateObjects: [],
          },
        ],
      },
    };

    const storageNode: BackendNode = {
      id: "storage-node-1",
      type: "storage",
      position: { x: 300, y: 500 },
      fractionalIndex: "a1",
      data: {
        label: "Storage",
        storageProvider: "s3",
        buckets: [
          {
            id: "bucket-test",
            name: "test",
            kind: "bucket",
            versioning: "Enabled",
          },
        ],
      },
    };

    const storageRefNode: BackendNode = {
      id: "storage-ref-1",
      type: "StorageBucketRefNode",
      position: { x: 400, y: 100 },
      fractionalIndex: "a2",
      data: {
        label: "test",
        storageNodeId: "storage-node-1",
        bucketId: "test",
        bucketName: "test",
        storageProvider: "s3",
        storageOperations: [
          {
            id: "op-presign",
            name: "getUploadPresignedUrl",
            kind: "presign_upload",
            label: "Presigned Upload URL",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      position: { x: 800, y: 100 },
      fractionalIndex: "a3",
      data: {
        label: "profile-service",
        endpoints: [
          {
            id: "ep-upload-img",
            name: "upload-image",
            type: "POST",
            pipelineSteps: [
              {
                id: "step-return",
                name: "Return Response",
                type: "return_response",
                enabled: true,
              },
            ],
          },
        ],
      },
    };

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-upload-img",
      nodeId: "service-1",
      name: "upload-image",
      type: "POST",
      pipelineSteps: [
        {
          id: "step-return",
          name: "Return Response",
          type: "return_response",
          enabled: true,
        },
      ],
    };

    return { webPageNode, storageNode, storageRefNode, serviceNode, endpoint };
  };

  it("links WebPage action to StorageRef operation, then to Service endpoint", () => {
    const store = useBackendCanvasStore.getState();
    const { webPageNode, storageNode, storageRefNode, serviceNode, endpoint } =
      createInitialNodes();

    store.addNode(webPageNode);
    store.addNode(storageNode);
    store.addNode(storageRefNode);
    store.addNode(serviceNode);
    useBackendCanvasStore.setState({ endpoints: [endpoint] });

    // Step 1: Connect WebPage action -> StorageRef operation (Inbound left handle)
    store.onConnect({
      source: webPageNode.id,
      sourceHandle: "events-act-upload-1",
      target: storageRefNode.id,
      targetHandle: "func-getUploadPresignedUrl",
    });

    const pageAfterFirstConnect = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === webPageNode.id);
    const actAfterFirst = pageAfterFirstConnect?.data?.sections?.[0]?.actions?.[0];

    expect(actAfterFirst?.storageOperationBinding).toBeDefined();
    expect(actAfterFirst?.storageOperationBinding?.operationName).toBe(
      "getUploadPresignedUrl",
    );
    expect(actAfterFirst?.storageOperationBinding?.bucketId).toBe("test");
    expect(actAfterFirst?.storageOperationBinding?.storageNodeId).toBe(
      "storage-node-1",
    );
    expect(pageAfterFirstConnect?.data?.uploadBucketId).toBe("test");

    // Step 2: Connect StorageRef operation (Outbound right handle) -> Service endpoint (Inbound left handle)
    store.onConnect({
      source: storageRefNode.id,
      sourceHandle: "func-out-getUploadPresignedUrl",
      target: serviceNode.id,
      targetHandle: "endpoint-in-ep-upload-img",
    });

    // Check endpoint has storage_operation step
    const endpointsAfter = useBackendCanvasStore.getState().endpoints;
    const uploadEp = endpointsAfter.find((e) => e.id === "ep-upload-img");
    expect(uploadEp).toBeDefined();

    const storageStep = uploadEp?.pipelineSteps?.find(
      (s) => s.type === "storage_operation",
    );
    expect(storageStep).toBeDefined();
    expect(storageStep?.functionRef?.name).toBe("getUploadPresignedUrl");
    expect(storageStep?.outputVariable).toBe("uploadUrl");
    expect(storageStep?.bucketId).toBe("test");

    // Check that WebPage action was also back-referenced to the endpoint
    const pageAfterSecondConnect = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === webPageNode.id);
    const actAfterSecond = pageAfterSecondConnect?.data?.sections?.[0]?.actions?.[0];
    expect(actAfterSecond?.storageOperationBinding?.endpointId).toBe(
      "ep-upload-img",
    );
    expect(actAfterSecond?.storageOperationBinding?.serviceNodeId).toBe(
      serviceNode.id,
    );
  });

  it("links correctly when connecting StorageRef -> Service FIRST, and WebPage -> StorageRef SECOND", () => {
    const store = useBackendCanvasStore.getState();
    const { webPageNode, storageNode, storageRefNode, serviceNode, endpoint } =
      createInitialNodes();

    store.addNode(webPageNode);
    store.addNode(storageNode);
    store.addNode(storageRefNode);
    store.addNode(serviceNode);
    useBackendCanvasStore.setState({ endpoints: [endpoint] });

    // Step 1: StorageRef -> Service endpoint FIRST
    store.onConnect({
      source: storageRefNode.id,
      sourceHandle: "func-out-getUploadPresignedUrl",
      target: serviceNode.id,
      targetHandle: "endpoint-in-ep-upload-img",
    });

    // Step 2: WebPage action -> StorageRef operation SECOND
    store.onConnect({
      source: webPageNode.id,
      sourceHandle: "events-act-upload-1",
      target: storageRefNode.id,
      targetHandle: "func-getUploadPresignedUrl",
    });

    const pageNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === webPageNode.id);
    const act = pageNode?.data?.sections?.[0]?.actions?.[0];

    expect(act?.storageOperationBinding).toBeDefined();
    expect(act?.storageOperationBinding?.operationName).toBe(
      "getUploadPresignedUrl",
    );
    expect(act?.storageOperationBinding?.endpointId).toBe("ep-upload-img");
    expect(act?.storageOperationBinding?.serviceNodeId).toBe(serviceNode.id);
    expect(pageNode?.data?.presignEndpointId).toBe("ep-upload-img");
  });

  it("cleans up storage bindings and pipeline steps when edges are removed", () => {
    const { webPageNode, storageNode, storageRefNode, serviceNode, endpoint } =
      createInitialNodes();

    // Prepare state with connected edges
    const edge1: BackendEdge = {
      id: "edge-page-ref",
      source: webPageNode.id,
      sourceHandle: "events-act-upload-1",
      target: storageRefNode.id,
      targetHandle: "func-getUploadPresignedUrl",
      type: "connection",
      fractionalIndex: "e0",
    };

    const edge2: BackendEdge = {
      id: "edge-ref-svc",
      source: storageRefNode.id,
      sourceHandle: "func-out-getUploadPresignedUrl",
      target: serviceNode.id,
      targetHandle: "endpoint-in-ep-upload-img",
      type: "connection",
      fractionalIndex: "e1",
    };

    const initialSections = webPageNode.data?.sections || [];
    const pageWithBinding: BackendNode = {
      ...webPageNode,
      data: {
        ...webPageNode.data,
        sections: [
          {
            ...initialSections[0]!,
            actions: [
              {
                ...initialSections[0]!.actions[0]!,
                storageOperationBinding: {
                  storageNodeId: "storage-node-1",
                  bucketId: "test",
                  operationName: "getUploadPresignedUrl",
                  refNodeId: "storage-ref-1",
                  endpointId: "ep-upload-img",
                },
              },
            ],
          },
        ],
      },
    };

    const epWithStep: Endpoint & { nodeId: string } = {
      ...endpoint,
      pipelineSteps: [
        {
          id: "step-storage-1",
          name: "Storage Operation",
          type: "storage_operation",
          enabled: true,
          functionRef: {
            name: "getUploadPresignedUrl",
            importPath: "@workspace/storage/operations",
          },
        },
        {
          id: "step-return",
          name: "Return Response",
          type: "return_response",
          enabled: true,
        },
      ],
    };

    const mockState = {
      nodes: [pageWithBinding, storageNode, storageRefNode, serviceNode],
      edges: [edge1, edge2],
      endpoints: [epWithStep],
      events: [],
      pendingNodeUpserts: [],
      pendingEdgeUpserts: [],
      pendingEdgeRemovals: [],
      pendingEndpointUpserts: [],
      pendingEventUpserts: [],
    } as any;

    // 1. Delete edge between StorageRef and Service
    const cleanupStep1 = cleanupDeletedEdgesState(mockState, ["edge-ref-svc"]);
    const cleanedEp = cleanupStep1.endpoints?.find(
      (e) => e.id === "ep-upload-img",
    );
    expect(
      cleanedEp?.pipelineSteps?.some((s) => s.type === "storage_operation"),
    ).toBe(false);

    // 2. Delete edge between WebPage and StorageRef
    const cleanupStep2 = cleanupDeletedEdgesState(mockState, ["edge-page-ref"]);
    const cleanedPage = cleanupStep2.nodes?.find((n) => n.id === pageWithBinding.id);
    const cleanedAct = cleanedPage?.data?.sections?.[0]?.actions?.[0];
    expect(cleanedAct?.storageOperationBinding).toBeUndefined();
  });
});
