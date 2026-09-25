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

  it("renders node-level handles for ingress and egress", () => {
    render(
      <StorageNode
        id={mockNode.id}
        data={mockNode.data}
        selected={false}
      />,
    );

    // Node-level ingress handle
    const ingressHandle = screen.getByTestId("handle-storage-target");
    expect(ingressHandle).toBeDefined();
    expect(ingressHandle.getAttribute("data-position")).toBe("left");

    // Node-level egress handle
    const egressHandle = screen.getByTestId("handle-storage-source");
    expect(egressHandle).toBeDefined();
    expect(egressHandle.getAttribute("data-position")).toBe("right");
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

  it("renders the Buckets list section with bucket items and handles", () => {
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
    // Ingress handle for the avatars bucket
    expect(screen.getByTestId("handle-buckets:in:bucket-avatars")).toBeDefined();
    // Egress handle for the avatars bucket
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
});
