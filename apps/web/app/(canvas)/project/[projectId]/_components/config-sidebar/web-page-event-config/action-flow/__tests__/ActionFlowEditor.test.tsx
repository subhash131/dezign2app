import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { BackendEdge, BackendNode, Endpoint, UIEventItem } from "@workspace/canvas";
import type { ActionStepItem } from "../../TargetEndpointSection";
import { ActionFlowEditor } from "../ActionFlowEditor";

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
    <div data-testid="mock-select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: MockSelectValueProps) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => (
    <div data-value={value}>{children}</div>
  ),
}));

describe("ActionFlowEditor component", () => {
  const dummyEdge1: BackendEdge = {
    id: "edge-1",
    fractionalIndex:"a0",
    source: "web-1",
    target: "srv-1",
    sourceHandle: "events-btn",
    targetHandle: "func-in-presign",
    type: "connection",
    data: { sequenceOrder: 1, label: "1" },
  };

  const dummyEdge2: BackendEdge = {
    id: "edge-2",
    fractionalIndex:"a1",
    source: "web-1",
    target: "storage-ref-1",
    sourceHandle: "events-btn",
    targetHandle: "func-in-uploadObject",
    type: "connection",
    data: {
      sequenceOrder: 2,
      label: "2",
      operationName: "uploadObject",
      bucketId: "photos-bucket",
    },
  };

  const serviceNode: BackendNode = {
    id: "srv-1",
    type: "service",
    position: { x: 100, y: 100 },
    fractionalIndex: "a0",
    data: { label: "Photo Service" },
  };

  const storageRefNode: BackendNode = {
    id: "storage-ref-1",
    type: "storage_operation_ref",
    position: { x: 100, y: 300 },
    fractionalIndex: "a1",
    data: { label: "Storage Bucket Ref", bucketId: "photos-bucket" },
  };

  const endpoint: Endpoint = {
    id: "ep-presign",
    name: "/api/photos/presign",
    type: "POST",
  };

  const canvasSteps: ActionStepItem[] = [
    {
      step: 1,
      label: "1",
      edgeId: dummyEdge1.id,
      targetNodeId: serviceNode.id,
      targetNode: serviceNode,
      endpointId: endpoint.id,
      endpoint,
      edge: dummyEdge1,
    },
    {
      step: 2,
      label: "2",
      edgeId: dummyEdge2.id,
      targetNodeId: storageRefNode.id,
      targetNode: storageRefNode,
      isStorageRef: true,
      operationName: "uploadObject",
      bucketName: "photos-bucket",
      edge: dummyEdge2,
    },
  ];

  const item: UIEventItem = {
    id: "btn-upload",
    name: "Upload Photo Button",
    event: "click",
  };

  it("renders pipeline header, step badges, and toolbar buttons", () => {
    const handleSave = vi.fn();

    render(
      <ActionFlowEditor
        item={item}
        canvasSteps={canvasSteps}
        serviceNodes={[serviceNode]}
        allNodes={[serviceNode, storageRefNode]}
        endpoints={[{ ...endpoint, nodeId: serviceNode.id }]}
        onSave={handleSave}
      />,
    );

    expect(screen.getByText("Pipeline Steps")).toBeDefined();
    expect(screen.getByText("2 steps")).toBeDefined();

    // Step 1: Request
    expect(screen.getAllByText("Request").length).toBeGreaterThan(0);

    // Step 2: Storage
    expect(screen.getAllByText("Storage").length).toBeGreaterThan(0);

    // Add Step Toolbar
    expect(screen.getByText("Mutate State")).toBeDefined();
    expect(screen.getByText("Navigate")).toBeDefined();
    expect(screen.getByText("Transformer")).toBeDefined();
    expect(screen.queryByText("Custom Code")).toBeNull();
  });

  it("renders empty state message when canvasSteps is empty", () => {
    const handleSave = vi.fn();

    render(
      <ActionFlowEditor
        item={item}
        canvasSteps={[]}
        serviceNodes={[]}
        allNodes={[]}
        endpoints={[]}
        onSave={handleSave}
      />,
    );

    expect(screen.getByText("No action steps configured.")).toBeDefined();
  });

  it("allows adding steps via toolbar and notifies onSave", () => {
    const handleSave = vi.fn();

    render(
      <ActionFlowEditor
        item={item}
        canvasSteps={canvasSteps}
        serviceNodes={[serviceNode]}
        allNodes={[serviceNode, storageRefNode]}
        endpoints={[{ ...endpoint, nodeId: serviceNode.id }]}
        onSave={handleSave}
      />,
    );

    const addMutateStateBtn = screen.getByText("Mutate State");
    fireEvent.click(addMutateStateBtn);

    expect(handleSave).toHaveBeenCalled();
    const savedDrafts = handleSave.mock.lastCall?.[0];
    expect(savedDrafts).toBeDefined();
    expect(savedDrafts).toHaveLength(3);
    expect(savedDrafts?.[2]?.type).toBe("state_mutation");
  });

  it("allows adding a Transformer step via toolbar and links TransformerNode", () => {
    const handleSave = vi.fn();
    const transformerNode: BackendNode = {
      id: "transformer-1",
      type: "transformer",
      position: { x: 400, y: 200 },
      fractionalIndex: "a2",
      data: {
        label: "formatPayload",
        functionName: "formatPayload",
        scope: "global",
        inputSchema: [{ id: "arg1", name: "raw", type: "string", required: true }],
        returnSchema: [{ id: "ret1", name: "formatted", type: "string", required: true }],
      },
    };

    render(
      <ActionFlowEditor
        item={item}
        canvasSteps={canvasSteps}
        serviceNodes={[serviceNode]}
        allNodes={[serviceNode, storageRefNode, transformerNode]}
        endpoints={[{ ...endpoint, nodeId: serviceNode.id }]}
        webPageNodeId="webpage-1"
        actionId="act-1"
        onSave={handleSave}
      />,
    );

    const addTransformerBtn = screen.getByText("Transformer");
    fireEvent.click(addTransformerBtn);

    expect(handleSave).toHaveBeenCalled();
    const savedDrafts = handleSave.mock.lastCall?.[0];
    expect(savedDrafts).toBeDefined();
    expect(savedDrafts).toHaveLength(3);
    expect(savedDrafts?.[2]?.type).toBe("transform");
    expect(savedDrafts?.[2]?.transformerNodeId).toBe("transformer-1");
    expect(savedDrafts?.[2]?.transformerName).toBe("formatPayload");
  });
});
