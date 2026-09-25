import { describe, it, expect, beforeEach } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  ensureStorageOperationRefConnection,
  cleanupStorageOperationRefConnection,
} from "../utils";
import { PipelineStepDraft } from "../types";

describe("pipeline-step-editor: Storage Operation Ref Node and Function Edge Synchronization", () => {
  const serviceNodeId = "service-1";
  const otherServiceNodeId = "service-2";
  const endpointId = "ep-upload-avatar";
  const secondEndpointId = "ep-download-avatar";
  const storageNodeId = "storage-s3-1";
  const bucketId = "avatars-bucket";

  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [
        {
          id: serviceNodeId,
          type: "service",
          position: { x: 100, y: 100 },
          fractionalIndex: "a0",
          data: { label: "User Media Service" },
        },
        {
          id: otherServiceNodeId,
          type: "service",
          position: { x: 100, y: 400 },
          fractionalIndex: "a1",
          data: { label: "Billing Service" },
        },
        {
          id: storageNodeId,
          type: "storage",
          position: { x: 700, y: 100 },
          fractionalIndex: "a2",
          data: {
            label: "S3 Storage",
            storageProvider: "s3",
            buckets: [
              {
                id: bucketId,
                name: "avatars",
                storageType: "s3",
              },
            ],
          },
        },
      ],
      edges: [],
      endpoints: [
        {
          id: endpointId,
          nodeId: serviceNodeId,
          name: "Upload Avatar",
          type: "POST",
        },
        {
          id: secondEndpointId,
          nodeId: serviceNodeId,
          name: "Download Avatar",
          type: "GET",
        },
      ],
    });
  });

  it("creates a storage_operation_ref node when none exists and attaches edge to target function handle", () => {
    const result = ensureStorageOperationRefConnection({
      storageNodeId,
      bucketId: "avatars",
      serviceNodeId,
      endpointId,
      functionName: "uploadObject",
    });

    expect(result).toBeDefined();
    expect(result?.functionName).toBe("uploadObject");

    const state = useBackendCanvasStore.getState();
    const refNode = state.nodes.find((n) => n.id === result?.storageRefNodeId);
    expect(refNode).toBeDefined();
    expect(refNode?.type).toBe("storage_operation_ref");
    expect(refNode?.data?.bucketId).toBe("avatars");
    expect(refNode?.data?.storageNodeId).toBe(storageNodeId);

    // Verify edge connects from endpoint to func-uploadObject
    const edge = state.edges.find(
      (e) => e.target === refNode?.id && e.type === "connection",
    );
    expect(edge).toBeDefined();
    expect(edge?.source).toBe(serviceNodeId);
    expect(edge?.sourceHandle).toBe(`endpoint-out-${endpointId}`);
    expect(edge?.targetHandle).toBe("func-uploadObject");

    // Verify invisible reference edge from bucket to ref header
    const refEdge = state.edges.find(
      (e) => e.target === refNode?.id && e.type === "storage-reference",
    );
    expect(refEdge).toBeDefined();
    expect(refEdge?.source).toBe(storageNodeId);
    expect(refEdge?.targetHandle).toBe("storage-ref-header");
  });

  it("reuses existing storage_operation_ref node for the same service and bucket", () => {
    const firstResult = ensureStorageOperationRefConnection({
      storageNodeId,
      bucketId: "avatars",
      serviceNodeId,
      endpointId,
      functionName: "uploadObject",
    });

    const secondResult = ensureStorageOperationRefConnection({
      storageNodeId,
      bucketId: "avatars",
      serviceNodeId,
      endpointId: secondEndpointId,
      functionName: "downloadObject",
    });

    // Reuses the same storage_operation_ref node
    expect(firstResult?.storageRefNodeId).toBe(secondResult?.storageRefNodeId);

    const state = useBackendCanvasStore.getState();
    const refNodes = state.nodes.filter(
      (n) => n.type === "storage_operation_ref",
    );
    expect(refNodes.length).toBe(1);

    // Two distinct connection edges targeting different function handles (plus reference edge from bucket)
    const connectionEdges = state.edges.filter((e) => e.type === "connection");
    expect(connectionEdges.length).toBe(2);
    expect(
      connectionEdges.some(
        (e) =>
          e.sourceHandle === `endpoint-out-${endpointId}` &&
          e.targetHandle === "func-uploadObject",
      ),
    ).toBe(true);
    expect(
      connectionEdges.some(
        (e) =>
          e.sourceHandle === `endpoint-out-${secondEndpointId}` &&
          e.targetHandle === "func-downloadObject",
      ),
    ).toBe(true);
  });

  it("removes edge when operation function is cleaned up and not used elsewhere", () => {
    ensureStorageOperationRefConnection({
      storageNodeId,
      bucketId: "avatars",
      serviceNodeId,
      endpointId,
      functionName: "uploadObject",
    });

    expect(useBackendCanvasStore.getState().edges.filter((e) => e.type === "connection").length).toBe(1);

    cleanupStorageOperationRefConnection({
      storageNodeId,
      bucketId: "avatars",
      serviceNodeId,
      endpointId,
      functionName: "uploadObject",
      remainingSteps: [],
    });

    expect(useBackendCanvasStore.getState().edges.filter((e) => e.type === "connection").length).toBe(0);
    // Node remains on canvas for the user (matching db_ref behavior)
    const remainingRef = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.type === "storage_operation_ref");
    expect(remainingRef).toBeDefined();
  });
});
