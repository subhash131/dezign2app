import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StorageNodeConfig } from "../StorageNodeConfig";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode } from "@/types/canvas";

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
    <div data-testid="select" data-value={value} onClick={() => onValueChange?.("r2")}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => <button>{children}</button>,
  SelectValue: ({ placeholder }: MockSelectValueProps) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => <div data-value={value}>{children}</div>,
}));

vi.mock("@workspace/ui/components/switch", () => ({
  Switch: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (c: boolean) => void }) => (
    <input
      type="checkbox"
      data-testid="switch"
      checked={Boolean(checked)}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

describe("StorageNodeConfig", () => {
  const mockNode: BackendNode = {
    id: "node-storage-1",
    type: "storage",
    position: { x: 0, y: 0 },
    fractionalIndex: "a0",
    data: {
      label: "Media Storage",
      description: "S3 cluster for user uploads",
      storageProvider: "s3",
      defaultRegion: "us-east-1",
      endpointUrl: "https://s3.amazonaws.com",
      accessKeyIdEnv: "AWS_ACCESS_KEY_ID",
      secretAccessKeyEnv: "AWS_SECRET_ACCESS_KEY",
      buckets: [
        {
          id: "bucket-avatars",
          name: "avatars",
          storageType: "s3",
          accessPolicy: "public-read",
          storageClass: "STANDARD",
        },
      ],
    },
  };

  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [mockNode],
    });
  });

  it("renders storage provider info, node name, and buckets count", () => {
    render(<StorageNodeConfig id="node-storage-1" nodeId="node-storage-1" />);

    expect(screen.getByText("Media Storage")).toBeDefined();
    expect(screen.getByText("Cloud Storage Node Configuration")).toBeDefined();
    expect(screen.getByText("s3")).toBeDefined();
    expect(screen.getByText("1 bucket")).toBeDefined();
    expect(screen.getByText("avatars")).toBeDefined();
  });

  it("updates node label on input change", () => {
    const updateNodeSpy = vi.fn();
    useBackendCanvasStore.setState({ updateNode: updateNodeSpy });

    render(<StorageNodeConfig id="node-storage-1" nodeId="node-storage-1" />);

    const labelInput = screen.getByPlaceholderText("e.g. User Media Storage, Primary Blob Store");
    fireEvent.change(labelInput, { target: { value: "Updated Storage Name" } });

    expect(updateNodeSpy).toHaveBeenCalledWith("node-storage-1", {
      data: expect.objectContaining({
        label: "Updated Storage Name",
      }),
    });
  });

  it("navigates to bucket config in sidebar when clicking Configure on a bucket row", () => {
    const setActiveConfigItemSpy = vi.fn();
    useBackendCanvasStore.setState({ setActiveConfigItem: setActiveConfigItemSpy });

    render(<StorageNodeConfig id="node-storage-1" nodeId="node-storage-1" />);

    const configBtn = screen.getByTitle("Configure Bucket in Sidebar");
    fireEvent.click(configBtn);

    expect(setActiveConfigItemSpy).toHaveBeenCalledWith({
      type: "event",
      id: "bucket-avatars",
      nodeId: "node-storage-1",
    });
  });

  it("adds a new bucket and opens it in sidebar", () => {
    const updateNodeSpy = vi.fn();
    const setActiveConfigItemSpy = vi.fn();
    useBackendCanvasStore.setState({
      updateNode: updateNodeSpy,
      setActiveConfigItem: setActiveConfigItemSpy,
    });

    render(<StorageNodeConfig id="node-storage-1" nodeId="node-storage-1" />);

    // Click Add Bucket
    const addBtn = screen.getByText("Add Bucket");
    fireEvent.click(addBtn);

    const bucketNameInput = screen.getByPlaceholderText("e.g. avatars, invoices, raw-uploads");
    fireEvent.change(bucketNameInput, { target: { value: "invoices" } });

    const createBtn = screen.getByText("Create");
    fireEvent.click(createBtn);

    expect(updateNodeSpy).toHaveBeenCalledWith(
      "node-storage-1",
      expect.objectContaining({
        data: expect.objectContaining({
          buckets: expect.arrayContaining([
            expect.objectContaining({
              name: "invoices",
              accessPolicy: "private",
            }),
          ]),
        }),
      }),
    );

    expect(setActiveConfigItemSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "event",
        nodeId: "node-storage-1",
      }),
    );
  });
});
