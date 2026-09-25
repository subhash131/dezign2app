import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StorageOperationRefNode } from "../StorageOperationRefNode";
import { BackendNode } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSectionCollapseStore } from "@/lib/stores/sectionCollapseStore";

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
    <div
      data-testid={`handle-${id}`}
      data-position={position}
      title={title}
      {...props}
    />
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

interface MockSelectProps {
  children?: React.ReactNode;
  value?: string;
  onValueChange?: (val: string) => void;
}

interface MockSelectSubComponentProps {
  children?: React.ReactNode;
}

interface MockSelectValueProps {
  placeholder?: string;
}

interface MockSelectItemProps {
  children?: React.ReactNode;
  value?: string;
}

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value, onValueChange }: MockSelectProps) => (
    <div data-testid="select" data-value={value} onClick={() => onValueChange?.("s3")}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => <button>{children}</button>,
  SelectValue: ({ placeholder }: MockSelectValueProps) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => <div data-value={value}>{children}</div>,
}));

describe("StorageOperationRefNode", () => {
  const mockStorageNode: BackendNode = {
    id: "storage-node-1",
    type: "storage",
    position: { x: 50, y: 50 },
    fractionalIndex: "a0",
    data: {
      label: "Media Storage",
      storageProvider: "s3",
      buckets: [
        {
          id: "bucket-1",
          name: "user-uploads",
          storageType: "s3",
        },
        {
          id: "bucket-2",
          name: "reports",
          storageType: "s3",
        },
      ],
    },
  };

  const mockRefNode: BackendNode = {
    id: "ref-node-1",
    type: "storage_operation_ref",
    position: { x: 450, y: 100 },
    fractionalIndex: "a1",
    data: {
      label: "user-uploads",
      storageNodeId: "storage-node-1",
      storageProvider: "s3",
      bucketId: "user-uploads",
      bucketName: "user-uploads",
      description: "Reference to user-uploads bucket",
      storageOperations: [
        { id: "op-1", name: "uploadObject", kind: "upload" },
        { id: "op-2", name: "downloadObject", kind: "download" },
        { id: "op-3", name: "getUploadPresignedUrl", kind: "presign_upload" },
      ],
    },
  };

  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [mockStorageNode, mockRefNode],
      edges: [],
    });
    useSectionCollapseStore.setState({ collapsedSectionsByNode: {} });
  });

  it("renders bucket reference header with provider and bucket name", () => {
    render(
      <StorageOperationRefNode
        id={mockRefNode.id}
        data={mockRefNode.data}
        selected={false}
      />,
    );

    expect(screen.getByText("Bucket Ref")).toBeDefined();
    expect(screen.getByText("s3")).toBeDefined();
    expect(screen.getAllByText("user-uploads").length).toBeGreaterThan(0);
  });

  it("draws an invisible edge from the bucket to the ref node header", () => {
    render(
      <StorageOperationRefNode
        id={mockRefNode.id}
        data={mockRefNode.data}
        selected={false}
      />,
    );

    // Target handle on header exists with position left
    const headerHandle = screen.getByTestId("handle-storage-ref-header");
    expect(headerHandle).toBeDefined();
    expect(headerHandle.getAttribute("data-position")).toBe("left");

    // Invisible reference edge created in store
    const edges = useBackendCanvasStore.getState().edges;
    const refEdge = edges.find(
      (e) =>
        e.source === "storage-node-1" &&
        e.target === "ref-node-1" &&
        e.type === "storage-reference",
    );
    expect(refEdge).toBeDefined();
    expect(refEdge?.sourceHandle).toBe("buckets:out:bucket-1");
    expect(refEdge?.targetHandle).toBe("storage-ref-header");
  });

  it("renders list of configured bucket operations with handles on the RIGHT side", () => {
    render(
      <StorageOperationRefNode
        id={mockRefNode.id}
        data={mockRefNode.data}
        selected={false}
      />,
    );

    // Header says Bucket Operations
    expect(screen.getByText("Bucket Operations")).toBeDefined();

    // Check configured operations exist
    expect(screen.getByText("uploadObject")).toBeDefined();
    expect(screen.getByText("downloadObject")).toBeDefined();
    expect(screen.getByText("getUploadPresignedUrl")).toBeDefined();

    // Handles for operations are on the RIGHT side
    const uploadHandle = screen.getByTestId("handle-func-uploadObject");
    expect(uploadHandle).toBeDefined();
    expect(uploadHandle.getAttribute("data-position")).toBe("right");

    const downloadHandle = screen.getByTestId("handle-func-downloadObject");
    expect(downloadHandle).toBeDefined();
    expect(downloadHandle.getAttribute("data-position")).toBe("right");
  });

  it("allows adding a new operation with the plus button", () => {
    render(
      <StorageOperationRefNode
        id={mockRefNode.id}
        data={mockRefNode.data}
        selected={false}
      />,
    );

    const addBtn = screen.getByTitle("Add Operation");
    fireEvent.click(addBtn);

    // Unadded operation list appears in popover
    expect(screen.getByText("Add Bucket Operation")).toBeDefined();
    const deleteOpBtn = screen.getByText("deleteObject");
    expect(deleteOpBtn).toBeDefined();

    // Clicking it adds the operation
    fireEvent.click(deleteOpBtn);

    const updatedNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === mockRefNode.id);
    expect(
      updatedNode?.data?.storageOperations?.some((o) => o.name === "deleteObject"),
    ).toBe(true);
  });

  it("allows removing an operation with the delete button", () => {
    render(
      <StorageOperationRefNode
        id={mockRefNode.id}
        data={mockRefNode.data}
        selected={false}
      />,
    );

    const deleteBtns = screen.getAllByTitle("Remove Operation");
    expect(deleteBtns.length).toBe(3);

    fireEvent.click(deleteBtns[0]!);

    const updatedNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === mockRefNode.id);
    expect(
      updatedNode?.data?.storageOperations?.some((o) => o.name === "uploadObject"),
    ).toBe(false);
  });

  it("opens sidebar configuration on double click or settings click", () => {
    const setActiveConfigItemSpy = vi.fn();
    useBackendCanvasStore.setState({
      setActiveConfigItem: setActiveConfigItemSpy,
    });

    render(
      <StorageOperationRefNode
        id={mockRefNode.id}
        data={mockRefNode.data}
        selected={false}
      />,
    );

    const settingsBtn = screen.getByTitle("Configure Bucket Reference");
    fireEvent.click(settingsBtn);

    expect(setActiveConfigItemSpy).toHaveBeenCalledWith({
      id: "ref-node-1",
      nodeId: "ref-node-1",
      type: "storage_ref",
    });
  });

  it("highlights connected operation handle when edge exists", () => {
    useBackendCanvasStore.setState({
      edges: [
        {
          id: "edge-test",
          source: "service-node-1",
          target: "ref-node-1",
          sourceHandle: "endpoint-out-ep-1",
          targetHandle: "func-uploadObject",
          type: "connection",
          fractionalIndex: "a0",
        },
      ],
    });

    render(
      <StorageOperationRefNode
        id={mockRefNode.id}
        data={mockRefNode.data}
        selected={false}
      />,
    );

    const handle = screen.getByTestId("handle-func-uploadObject");
    expect(handle.className).toContain("!bg-amber-500");
  });
});
