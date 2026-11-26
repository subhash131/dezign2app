import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { NodeHeader } from "../NodeHeader";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode } from "@/types/canvas";

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value }: any) => (
    <div data-testid="mock-select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-value={value}>{children}</div>
  ),
}));

describe("NodeHeader", () => {
  const baseNode: BackendNode = {
    id: "node-service-1",
    type: "service",
    position: { x: 0, y: 0 },
    fractionalIndex: "a0",
    data: {
      label: "",
    },
  };

  beforeEach(() => {
    vi.useRealTimers();
    useBackendCanvasStore.setState({
      nodes: [baseNode],
      edges: [],
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      deleteNodes: vi.fn(),
      requestDeleteNode: vi.fn(),
    });
  });

  it("saves the full entered name when pressing Enter immediately after typing", () => {
    const updateNodeSpy = vi.fn();
    useBackendCanvasStore.setState({ updateNode: updateNodeSpy });

    const { getByRole } = render(
      <NodeHeader
        id="node-service-1"
        data={{ label: "" }}
        nodeType="service"
        title="Service"
      />,
    );

    const input = getByRole("textbox") as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: "Authentication" } });
      fireEvent.change(input, { target: { value: "AuthenticationService" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(updateNodeSpy).toHaveBeenCalledTimes(1);
    expect(updateNodeSpy).toHaveBeenCalledWith("node-service-1", {
      data: expect.objectContaining({
        label: "AuthenticationService",
      }),
    });
  });

  it("saves the full entered name when blurring immediately after typing", () => {
    const updateNodeSpy = vi.fn();
    useBackendCanvasStore.setState({ updateNode: updateNodeSpy });

    const { getByRole } = render(
      <NodeHeader
        id="node-service-1"
        data={{ label: "" }}
        nodeType="service"
        title="Service"
      />,
    );

    const input = getByRole("textbox") as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: "Orders" } });
      fireEvent.change(input, { target: { value: "OrdersService" } });
      fireEvent.blur(input);
    });

    expect(updateNodeSpy).toHaveBeenCalledTimes(1);
    expect(updateNodeSpy).toHaveBeenCalledWith("node-service-1", {
      data: expect.objectContaining({
        label: "OrdersService",
      }),
    });
  });

  it("normalizes webPage routes when pressing Enter immediately", () => {
    const onSaveSpy = vi.fn();
    useBackendCanvasStore.setState({
      nodes: [
        {
          ...baseNode,
          id: "node-page-1",
          type: "webPage",
          data: { label: "" },
        },
      ],
    });

    const { getByRole } = render(
      <NodeHeader
        id="node-page-1"
        data={{ label: "" }}
        nodeType="webPage"
        title="Web Page"
        onSave={onSaveSpy}
      />,
    );

    const input = getByRole("textbox") as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: "user profile" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onSaveSpy).toHaveBeenCalledTimes(1);
    expect(onSaveSpy).toHaveBeenCalledWith("user-profile");
  });

  it("does not save cancelled text if blur fires after Escape", () => {
    const updateNodeSpy = vi.fn();
    useBackendCanvasStore.setState({
      nodes: [
        {
          ...baseNode,
          data: { label: "ExistingService" },
        },
      ],
      updateNode: updateNodeSpy,
    });

    const { getByText, getByRole, queryByRole } = render(
      <NodeHeader
        id="node-service-1"
        data={{ label: "ExistingService" }}
        nodeType="service"
        title="Service"
      />,
    );

    act(() => {
      fireEvent.click(getByText("ExistingService"));
    });

    const input = getByRole("textbox") as HTMLInputElement;

    act(() => {
      fireEvent.change(input, { target: { value: "PartialTemp" } });
      fireEvent.keyDown(input, { key: "Escape" });
      fireEvent.blur(input);
    });

    expect(updateNodeSpy).not.toHaveBeenCalled();
    expect(queryByRole("textbox")).toBeNull();
    expect(getByText("ExistingService")).toBeTruthy();
  });

  it("displays and saves parsed snake_case table names for entity nodes", () => {
    const onSaveSpy = vi.fn();
    useBackendCanvasStore.setState({
      nodes: [
        {
          ...baseNode,
          id: "node-entity-1",
          type: "entity",
          data: { label: "test conversations" },
        },
      ],
    });

    const { getByText, getByRole, rerender } = render(
      <NodeHeader
        id="node-entity-1"
        data={{ label: "test conversations" }}
        nodeType="entity"
        title="Table"
        onSave={onSaveSpy}
      />,
    );

    // Existing unparsed label is displayed as parsed SQL table name in the header
    expect(getByText("test_conversations")).toBeTruthy();

    rerender(
      <NodeHeader
        id="node-entity-1"
        data={{ label: "" }}
        nodeType="entity"
        title="Table"
        onSave={onSaveSpy}
      />,
    );

    const input = getByRole("textbox") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "test conversations" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });

    expect(onSaveSpy).toHaveBeenCalledTimes(1);
    expect(onSaveSpy).toHaveBeenCalledWith("test_conversations");
  });
});
