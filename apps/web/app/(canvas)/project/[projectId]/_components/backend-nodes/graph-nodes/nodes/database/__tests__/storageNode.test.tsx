import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StorageNode } from "../StorageNode";
import { BackendNode } from "@/types/canvas";

interface MockHandleProps {
  id?: string;
  position?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  type?: string;
}

interface MockSelectProps {
  children?: React.ReactNode;
  value?: string;
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

// Mock @xyflow/react
vi.mock("@xyflow/react", () => ({
  Handle: ({ id, position, title, ...props }: MockHandleProps) => (
    <div data-testid={`handle-${id}`} data-position={position} title={title} {...props} />
  ),
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
}));

// Mock @workspace/ui components
vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value }: MockSelectProps) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => <button>{children}</button>,
  SelectValue: ({ placeholder }: MockSelectValueProps) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => <div data-value={value}>{children}</div>,
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
      accessPolicy: "private",
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

  it("renders provider, access, and bucket count badges", () => {
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
    expect(screen.getByText("private")).toBeDefined();
    expect(screen.getByText("1 bucket")).toBeDefined();
  });
});
