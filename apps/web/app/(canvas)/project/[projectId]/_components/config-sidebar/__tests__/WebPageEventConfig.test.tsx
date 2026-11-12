import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WebPageEventConfig } from "../WebPageEventConfig";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import type { BackendNode, BackendEdge } from "@workspace/canvas";

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

interface MockAccordionProps {
  children?: React.ReactNode;
}

vi.mock("../web-page-event-config/action-flow", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    ActionFlowCombobox: ({
      value,
      onChange,
      placeholder,
    }: {
      value?: string;
      onChange: (val: string) => void;
      placeholder?: string;
    }) => (
      <input
        data-testid="mock-action-flow-combobox"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    ),
  };
});

vi.mock("@workspace/ui/components/accordion", () => ({
  Accordion: ({ children }: MockAccordionProps) => <div>{children}</div>,
  AccordionItem: ({ children }: MockAccordionProps) => <div>{children}</div>,
  AccordionTrigger: ({ children }: MockAccordionProps) => <button type="button">{children}</button>,
  AccordionContent: ({ children }: MockAccordionProps) => <div>{children}</div>,
}));

vi.mock("@workspace/ui/components/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, id }: any) => (
    <input
      type="checkbox"
      id={id}
      checked={Boolean(checked)}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock("../web-page-event-config", () => ({
  ActionFlowEditor: () => <div data-testid="mock-action-flow-editor">ActionFlowEditor</div>,
  EventNavigationSection: () => <div data-testid="mock-event-nav">EventNavigationSection</div>,
  ActionSimulator: () => <div data-testid="mock-action-simulator">ActionSimulator</div>,
  EffectVariableMappingSection: () => <div data-testid="mock-effect-variable-mapping">EffectVariableMappingSection</div>,
  MountExecutionStrategySection: () => <div data-testid="mock-mount-execution-strategy">MountExecutionStrategySection</div>,
}));

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value, onValueChange }: MockSelectProps) => (
    <div data-testid="mock-select" data-value={value}>
      <button
        type="button"
        data-testid="mock-select-change-click"
        onClick={() => onValueChange?.("submit")}
      >
        ChangeToSubmit
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: MockSelectValueProps) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectGroup: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectLabel: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => (
    <div data-value={value}>{children}</div>
  ),
}));

describe("WebPageEventConfig component", () => {
  const dummyWebPageNode: BackendNode = {
    id: "web-node-1",
    type: "webPage",
    fractionalIndex: "a0",
    position: { x: 0, y: 0 },
    data: {
      label: "Home Page",
      sections: [
        {
          id: "sec-1",
          name: "Hero Section",
          actions: [
            {
              id: "act-1",
              name: "handleCheckout",
              event: "click",
              actionSteps: [],
            },
          ],
        },
      ],
    },
  };

  const dummyEdge: BackendEdge = {
    id: "edge-1",
    fractionalIndex: "a0",
    source: "web-node-1",
    target: "srv-1",
    sourceHandle: "events-act-1",
    targetHandle: "endpoint-in-ep-1",
    type: "connection",
    data: { sequenceOrder: 1, label: "1" },
  };

  const dummyServiceNode: BackendNode = {
    id: "srv-1",
    type: "service",
    fractionalIndex: "a1",
    position: { x: 400, y: 0 },
    data: {
      label: "Order Service",
      endpoints: [
        {
          id: "ep-1",
          name: "/orders/checkout",
          type: "POST",
        },
      ],
    },
  };

  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [dummyWebPageNode, dummyServiceNode],
      edges: [dummyEdge],
      endpoints: [
        {
          id: "ep-1",
          nodeId: "srv-1",
          name: "/orders/checkout",
          type: "POST",
        },
      ],
    });
  });

  it("renders merged Action Event header with Trigger Event and Action Name", () => {
    render(<WebPageEventConfig id="act-1" nodeId="web-node-1" />);

    // Merged header elements
    expect(screen.getByText("Action Event")).toBeDefined();
    expect(screen.getByText("Trigger Event")).toBeDefined();
    expect(screen.getByText("Action Name")).toBeDefined();

    // Action Name input should reflect current item name
    const input = screen.getByPlaceholderText("e.g. submitOrder, fetchUserProfile");
    if (input instanceof HTMLInputElement) {
      expect(input.value).toBe("handleCheckout");
    } else {
      throw new Error("input is not HTMLInputElement");
    }

    // Pipeline Steps accordion should be rendered
    expect(screen.getByText("Pipeline Steps")).toBeDefined();
  });

  it("does not render obsolete Request Config and Target State Store sections", () => {
    render(<WebPageEventConfig id="act-1" nodeId="web-node-1" />);

    // Removed sections must not be present
    expect(screen.queryByText("Request Configuration")).toBeNull();
    expect(screen.queryByText("Target State Store")).toBeNull();
    expect(screen.queryByText("State Store Binding")).toBeNull();
    expect(screen.queryByText("Event Properties")).toBeNull(); // Merged into top header
  });

  it("allows updating action name on blur", () => {
    render(<WebPageEventConfig id="act-1" nodeId="web-node-1" />);

    const input = screen.getByPlaceholderText("e.g. submitOrder, fetchUserProfile");
    fireEvent.change(input, { target: { value: "submitPayment" } });
    fireEvent.blur(input);

    const updatedNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === "web-node-1");
    const updatedAction = updatedNode?.data?.sections?.[0]?.actions?.[0];
    expect(updatedAction?.name).toBe("submitPayment");
  });
});
