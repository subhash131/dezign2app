import { describe, it, expect, vi } from "vitest";
import { performGraphLayout } from "../graphLayout";
import type { LayoutNode, LayoutEdge, PositionNodeChange } from "../types";
import { getNodeDimensions } from "../nodeDimensions";

function doNodesOverlap(
  posA: { x: number; y: number },
  dimA: { width: number; height: number },
  posB: { x: number; y: number },
  dimB: { width: number; height: number },
): boolean {
  return !(
    posA.x + dimA.width <= posB.x ||
    posB.x + dimB.width <= posA.x ||
    posA.y + dimA.height <= posB.y ||
    posB.y + dimB.height <= posA.y
  );
}

describe("Storage Node Auto-Layout - No Overlap with WebPageNode", () => {
  it("does not overlap webPage and storage node when both are present", () => {
    const nodes: LayoutNode[] = [
      {
        id: "page-1",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: {
          label: "Profile Page",
          path: "/profile",
          sections: [
            {
              id: "sec-1",
              name: "Main",
              renderMode: "client",
              actions: [{ id: "act-upload-1", name: "upload image", event: "click" }],
              stateObjects: [],
            },
          ],
        },
      },
      {
        id: "storage-node-1",
        type: "storage",
        position: { x: 0, y: 0 },
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
      },
      {
        id: "storage-ref-1",
        type: "StorageBucketRefNode",
        position: { x: 0, y: 0 },
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
      },
      {
        id: "service-1",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "profile-service",
          endpoints: [
            {
              id: "ep-upload-img",
              name: "upload-image",
              type: "POST",
            },
          ],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-page-ref",
        source: "page-1",
        target: "storage-ref-1",
        sourceHandle: "events-act-upload-1",
        targetHandle: "func-getUploadPresignedUrl",
        type: "connection",
      },
      {
        id: "e-ref-service",
        source: "storage-ref-1",
        target: "service-1",
        sourceHandle: "func-out-getUploadPresignedUrl",
        targetHandle: "endpoint-in-ep-upload-img",
        type: "connection",
      },
      {
        id: "edge-storage-ref-storage-node-1-bucket-test-storage-ref-1",
        source: "storage-node-1",
        target: "storage-ref-1",
        sourceHandle: "buckets:out:bucket-test",
        targetHandle: "storage-ref-header",
        type: "storage-reference",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      appliedChanges = changes;
    };

    performGraphLayout({
      nodes,
      edges,
      onNodesChange,
      fitView: vi.fn(),
      direction: "LR",
      storeEndpoints: [
        { id: "ep-upload-img", nodeId: "service-1", name: "upload-image", type: "POST" },
      ],
    });

    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));
    console.log("Positions:", Object.fromEntries(posMap.entries()));

    const pagePos = posMap.get("page-1")!;
    const storagePos = posMap.get("storage-node-1")!;
    const refPos = posMap.get("storage-ref-1")!;
    const servicePos = posMap.get("service-1")!;

    expect(pagePos).toBeDefined();
    expect(storagePos).toBeDefined();
    expect(refPos).toBeDefined();
    expect(servicePos).toBeDefined();

    const pageDim = getNodeDimensions(nodes.find((n) => n.id === "page-1")!);
    const storageDim = getNodeDimensions(nodes.find((n) => n.id === "storage-node-1")!);

    const overlaps = doNodesOverlap(pagePos, pageDim, storagePos, storageDim);
    expect(overlaps).toBe(false);
  });

  it("does not overlap webPage and storage node when webApp is also present", () => {
    const nodes: LayoutNode[] = [
      {
        id: "web-1",
        type: "webApp",
        position: { x: 0, y: 0 },
        data: {
          label: "web",
          zones: [
            { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
          ],
          expandedZones: [],
        },
      },
      {
        id: "page-1",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: {
          label: "/profile",
          sections: [],
        },
      },
      {
        id: "storage-node-1",
        type: "storage",
        position: { x: 0, y: 0 },
        data: {
          label: "Storage",
          storageProvider: "s3",
          buckets: [{ id: "b1", name: "uploads", kind: "bucket" }],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-web-page",
        source: "web-1",
        target: "page-1",
        sourceHandle: "public-in",
        targetHandle: "page-in",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    performGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => { appliedChanges = c; },
      fitView: vi.fn(),
      direction: "LR",
    });

    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));
    console.log("WebApp + WebPage + Storage Positions:", Object.fromEntries(posMap.entries()));

    const pagePos = posMap.get("page-1")!;
    const storagePos = posMap.get("storage-node-1")!;
    const webPos = posMap.get("web-1")!;

    const pageDim = getNodeDimensions(nodes.find((n) => n.id === "page-1")!);
    const storageDim = getNodeDimensions(nodes.find((n) => n.id === "storage-node-1")!);
    const webDim = getNodeDimensions(nodes.find((n) => n.id === "web-1")!);

    expect(doNodesOverlap(pagePos, pageDim, storagePos, storageDim)).toBe(false);
    expect(doNodesOverlap(webPos, webDim, storagePos, storageDim)).toBe(false);
  });

  it("does not overlap when storage_operation_ref is used as reference type", () => {
    const nodes: LayoutNode[] = [
      {
        id: "page-1",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: {
          label: "/profile",
          sections: [{ id: "s1", name: "Main", actions: [{ id: "act1", name: "upload" }] }],
        },
      },
      {
        id: "storage-node-1",
        type: "storage",
        position: { x: 0, y: 0 },
        data: {
          label: "Storage",
          storageProvider: "s3",
          buckets: [{ id: "b1", name: "uploads", kind: "bucket" }],
        },
      },
      {
        id: "ref-1",
        type: "storage_operation_ref",
        position: { x: 0, y: 0 },
        data: {
          label: "uploads",
          storageNodeId: "storage-node-1",
          bucketId: "b1",
        },
      },
      {
        id: "service-1",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "api",
          endpoints: [{ id: "ep1", name: "POST upload" }],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-page-ref",
        source: "page-1",
        target: "ref-1",
        sourceHandle: "events-act1",
        targetHandle: "func-uploadObject",
        type: "connection",
      },
      {
        id: "e-ref-serv",
        source: "ref-1",
        target: "service-1",
        sourceHandle: "func-out-uploadObject",
        targetHandle: "endpoint-in-ep1",
        type: "connection",
      },
      {
        id: "e-stor-ref",
        source: "storage-node-1",
        target: "ref-1",
        type: "storage-reference",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    performGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => { appliedChanges = c; },
      fitView: vi.fn(),
      direction: "LR",
      storeEndpoints: [{ id: "ep1", nodeId: "service-1", name: "POST upload", type: "POST" }],
    });

    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));
    console.log("storage_operation_ref Positions:", Object.fromEntries(posMap.entries()));

    const pagePos = posMap.get("page-1")!;
    const storagePos = posMap.get("storage-node-1")!;
    const refPos = posMap.get("ref-1")!;
    const servicePos = posMap.get("service-1")!;

    const pageDim = getNodeDimensions(nodes.find((n) => n.id === "page-1")!);
    const storageDim = getNodeDimensions(nodes.find((n) => n.id === "storage-node-1")!);
    const refDim = getNodeDimensions(nodes.find((n) => n.id === "ref-1")!);

    expect(doNodesOverlap(pagePos, pageDim, storagePos, storageDim)).toBe(false);
    expect(doNodesOverlap(pagePos, pageDim, refPos, refDim)).toBe(false);
  });

  it("replicates user screenshot: webApp + stacked webPages + storage + storageRef + service", () => {
    const nodes: LayoutNode[] = [
      {
        id: "web-1",
        type: "webApp",
        position: { x: 0, y: 0 },
        data: {
          label: "web",
          zones: [
            { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
            { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
          ],
          expandedZones: [], // Stacked mode
        },
      },
      {
        id: "page-root",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: {
          label: "/",
          isRoot: true,
          sections: [],
        },
      },
      {
        id: "page-not-found",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: {
          label: "/not-found",
          sections: [
            {
              id: "sec-nav",
              name: "Navigation",
              actions: [
                { id: "act-home", name: "Back to Home" },
                { id: "act-upload", name: "upload image" },
              ],
            },
          ],
        },
      },
      {
        id: "storage-node-1",
        type: "storage",
        position: { x: 0, y: 0 },
        data: {
          label: "aws s3",
          storageProvider: "s3",
          buckets: [{ id: "b-test", name: "test", kind: "bucket" }],
        },
      },
      {
        id: "storage-ref-1",
        type: "StorageBucketRefNode",
        position: { x: 0, y: 0 },
        data: {
          label: "test",
          storageNodeId: "storage-node-1",
          bucketId: "b-test",
          storageOperations: [
            { id: "op-presign", name: "upload-image", kind: "presign_upload" },
          ],
        },
      },
      {
        id: "service-profile",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "profile",
          endpoints: [
            { id: "ep-health", name: "/health", type: "GET" },
            { id: "ep-upload", name: "upload-image", type: "POST" },
          ],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-web-root",
        source: "web-1",
        target: "page-root",
        sourceHandle: "public-in",
        targetHandle: "page-in",
        type: "connection",
      },
      {
        id: "e-web-not-found",
        source: "web-1",
        target: "page-not-found",
        sourceHandle: "public-in",
        targetHandle: "page-in",
        type: "connection",
      },
      {
        id: "e-page-ref",
        source: "page-not-found",
        target: "storage-ref-1",
        sourceHandle: "events-act-upload",
        targetHandle: "func-upload-image",
        type: "connection",
      },
      {
        id: "e-ref-serv",
        source: "storage-ref-1",
        target: "service-profile",
        sourceHandle: "func-out-upload-image",
        targetHandle: "endpoint-in-ep-upload",
        type: "connection",
      },
      {
        id: "e-storage-ref",
        source: "storage-node-1",
        target: "storage-ref-1",
        sourceHandle: "buckets:out:b-test",
        targetHandle: "storage-ref-header",
        type: "storage-reference",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    performGraphLayout({
      nodes,
      edges,
      onNodesChange: (c) => { appliedChanges = c; },
      fitView: vi.fn(),
      direction: "LR",
      storeEndpoints: [
        { id: "ep-health", nodeId: "service-profile", name: "/health", type: "GET" },
        { id: "ep-upload", nodeId: "service-profile", name: "upload-image", type: "POST" },
      ],
    });

    const posMap = new Map(appliedChanges.map((c) => [c.id, c.position]));
    console.log("Screenshot Reproduction Positions:", Object.fromEntries(posMap.entries()));

    const pRoot = posMap.get("page-root")!;
    const pNotFound = posMap.get("page-not-found")!;
    const storagePos = posMap.get("storage-node-1")!;
    const refPos = posMap.get("storage-ref-1")!;
    const servicePos = posMap.get("service-profile")!;
    const webPos = posMap.get("web-1")!;

    const pNotFoundDim = getNodeDimensions(nodes.find((n) => n.id === "page-not-found")!);
    const storageDim = getNodeDimensions(nodes.find((n) => n.id === "storage-node-1")!);
    const refDim = getNodeDimensions(nodes.find((n) => n.id === "storage-ref-1")!);
    const serviceDim = getNodeDimensions(nodes.find((n) => n.id === "service-profile")!);

    // Verify no overlaps
    expect(doNodesOverlap(pNotFound, pNotFoundDim, refPos, refDim)).toBe(false);
    expect(doNodesOverlap(pNotFound, pNotFoundDim, storagePos, storageDim)).toBe(false);
    expect(doNodesOverlap(refPos, refDim, servicePos, serviceDim)).toBe(false);

    // Verify topological ordering: WebApp (x) < WebPage (x) < StorageRef (x) < Service (x)
    expect(webPos.x).toBeLessThan(pNotFound.x);
    expect(pNotFound.x).toBeLessThan(refPos.x);
    expect(refPos.x).toBeLessThan(servicePos.x);
  });
});


