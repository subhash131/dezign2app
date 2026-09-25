import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StorageNode } from "../StorageNode";
import { BackendNode } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

interface MockHandleProps {
  id?: string;
  position?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  type?: string;
}

// Mock @xyflow/react
vi.mock("@xyflow/react", () => ({
  Handle: ({ id, position, title, ...props }: MockHandleProps) => (
    <div data-testid={`handle-${id}`} data-position={position} title={title} {...props} />
  ),
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  useUpdateNodeInternals: () => vi.fn(),
}));

// Mock simulation state
vi.mock("../../../common", async () => {
  const actual = await vi.importActual("../../../common");
  return {
    ...actual,
    useSimulationNodeState: () => ({ status: "idle" }),
    getSimulationNodeBorderClass: () => "",
  };
});

describe("StorageNode component", () => {
  const mockNode: BackendNode = {
    id: "node-storage-1",
    type: "storage",
    position: { x: 100, y: 100 },
    fractionalIndex: "a0",
    data: {
      label: "User Media Storage",
      description: "S3 storage for profile pictures and documents",
      storageProvider: "s3",
      defaultRegion: "us-east-1",
      buckets: [
        {
          id: "bucket-avatars",
          name: "avatars",
          storageType: "s3",
          accessPolicy: "public-read",
        },
      ],
    },
  };

  it("does not render header handles (storage-target and storage-source have been removed)", () => {
    render(
      <StorageNode
        id={mockNode.id}
        data={mockNode.data}
        selected={false}
      />,
    );

    // Header handles are removed per architecture specification
    expect(screen.queryByTestId("handle-storage-target")).toBeNull();
    expect(screen.queryByTestId("handle-storage-source")).toBeNull();
  });

  it("renders provider and bucket count badges in the header", () => {
    render(
      <StorageNode
        id={mockNode.id}
        data={mockNode.data}
        selected={false}
      />,
    );

    expect(screen.getByText("Storage")).toBeDefined();
    expect(screen.getByText("User Media Storage")).toBeDefined();
    expect(screen.getByText("s3")).toBeDefined();
    expect(screen.getByText("1 bucket")).toBeDefined();
  });

  it("renders the Buckets list section with bucket items and right egress handle only (left handle removed)", () => {
    render(
      <StorageNode
        id={mockNode.id}
        data={mockNode.data}
        selected={false}
      />,
    );

    // Buckets section header
    expect(screen.getByText("Buckets")).toBeDefined();
    // Bucket name item
    expect(screen.getByText("avatars")).toBeDefined();
    // Left ingress handle for bucket is removed
    expect(screen.queryByTestId("handle-buckets:in:bucket-avatars")).toBeNull();
    // Egress handle for bucket notifications remains
    expect(screen.getByTestId("handle-buckets:out:bucket-avatars")).toBeDefined();
  });

  it("does not render operations on the node (they belong to bucket config sidebar)", () => {
    render(
      <StorageNode
        id={mockNode.id}
        data={mockNode.data}
        selected={false}
      />,
    );

    // Node only has Buckets section; operations are managed in bucket sidebar
    expect(screen.queryByText("Storage Operations")).toBeNull();
    expect(screen.queryByText("getUploadPresignedUrl")).toBeNull();
    expect(screen.queryByText("uploadObject")).toBeNull();
  });

  it("opens storage node config in sidebar when clicking configure button in header", () => {
    const setActiveConfigItemSpy = vi.fn();
    useBackendCanvasStore.setState({
      setActiveConfigItem: setActiveConfigItemSpy,
    });

    render(
      <StorageNode
        id={mockNode.id}
        data={mockNode.data}
        selected={false}
      />,
    );

    const configureBtn = screen.getByTitle("Configure Storage Node in Sidebar");
    expect(configureBtn).toBeDefined();

    fireEvent.click(configureBtn);
    expect(setActiveConfigItemSpy).toHaveBeenCalledWith({
      type: "storage",
      id: "node-storage-1",
      nodeId: "node-storage-1",
    });
  });

  it("draws an invisible edge from the bucket to the header of the StorageBucketRefNode", () => {
    const mockRefNode: BackendNode = {
      id: "ref-bucket-avatars-1",
      type: "StorageBucketRefNode",
      position: { x: 500, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "avatars",
        storageNodeId: "node-storage-1",
        bucketId: "avatars",
        bucketName: "avatars",
        storageProvider: "s3",
      },
    };

    useBackendCanvasStore.setState({
      nodes: [mockNode, mockRefNode],
      edges: [],
    });

    render(
      <StorageNode
        id={mockNode.id}
        data={mockNode.data}
        selected={false}
      />,
    );

    const edges = useBackendCanvasStore.getState().edges;
    const refEdge = edges.find(
      (e) =>
        e.source === "node-storage-1" &&
        e.target === "ref-bucket-avatars-1" &&
        e.type === "storage-reference",
    );

    expect(refEdge).toBeDefined();
    expect(refEdge?.sourceHandle).toBe("buckets:out:bucket-avatars");
    expect(refEdge?.targetHandle).toBe("storage-ref-header");
  });

  it("draws an invisible edge to storage_operation_ref when matching bucket by name or id", () => {
    const mockOpRefNode: BackendNode = {
      id: "ref-op-node-1",
      type: "storage_operation_ref",
      position: { x: 500, y: 250 },
      fractionalIndex: "a2",
      data: {
        label: "avatars",
        storageNodeId: "node-storage-1",
        bucketId: "bucket-avatars",
        storageProvider: "s3",
      },
    };

    useBackendCanvasStore.setState({
      nodes: [mockNode, mockOpRefNode],
      edges: [],
    });

    render(
      <StorageNode
        id={mockNode.id}
        data={mockNode.data}
        selected={false}
      />,
    );

    const edges = useBackendCanvasStore.getState().edges;
    const refEdge = edges.find(
      (e) =>
        e.source === "node-storage-1" &&
        e.target === "ref-op-node-1" &&
        e.type === "storage-reference",
    );

    expect(refEdge).toBeDefined();
    expect(refEdge?.sourceHandle).toBe("buckets:out:bucket-avatars");
    expect(refEdge?.targetHandle).toBe("storage-ref-header");
  });
});
