import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockSetNodes = vi.fn();
const mockSetEdges = vi.fn();
let mockNodes: any[] = [];
let mockEdges: any[] = [];

vi.mock("@xyflow/react", () => ({
  Handle: ({ id, className }: { id?: string; className?: string }) => (
    <div data-testid={`handle-${id}`} className={className} />
  ),
  Position: { Left: "left", Bottom: "bottom" },
  useReactFlow: () => ({
    setNodes: mockSetNodes,
    setEdges: mockSetEdges,
    getNodes: () => mockNodes,
    getEdges: () => mockEdges,
  }),
}));

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (val: string) => void;
  }) => (
    <div data-testid="mock-select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`item-${value}`}>{children}</div>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { LangGraphCanvasLLMRefNode } from "../LangGraphCanvasLLMRefNode";
import {
  LANGGRAPH_CANVAS_NODE_LLM,
  LANGGRAPH_CANVAS_NODE_LLM_REF,
} from "../../constants";
import type { LangGraphLLMRefNodeData } from "@workspace/canvas";

describe("LangGraphCanvasLLMRefNode - Empty Master LLM Banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNodes = [];
    mockEdges = [];
  });

  const createProps = (data: Partial<LangGraphLLMRefNodeData> = {}): React.ComponentProps<typeof LangGraphCanvasLLMRefNode> => ({
    id: "llm_ref_1",
    data: {
      label: "LLM Ref",
      refId: "llm_ref_1",
      ...data,
    },
    selected: false,
    zIndex: 1,
    isConnectable: true,
    positionAbsoluteX: 100,
    positionAbsoluteY: 100,
    dragging: false,
  } as unknown as React.ComponentProps<typeof LangGraphCanvasLLMRefNode>);

  it("renders the warning banner and Add LLM Node button when no master LLM is on canvas", () => {
    mockNodes = [
      {
        id: "llm_ref_1",
        type: LANGGRAPH_CANVAS_NODE_LLM_REF,
        position: { x: 500, y: 200 },
        data: { label: "LLM Ref", refId: "llm_ref_1" },
      },
    ];

    render(<LangGraphCanvasLLMRefNode {...createProps()} />);

    expect(
      screen.getByText(/No master LLM on canvas/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add LLM Node/i }),
    ).toBeInTheDocument();
  });

  it("adds an LLM node to canvas and binds the ref when clicking Add LLM Node button", () => {
    mockNodes = [
      {
        id: "llm_ref_1",
        type: LANGGRAPH_CANVAS_NODE_LLM_REF,
        position: { x: 500, y: 200 },
        data: { label: "LLM Ref", refId: "llm_ref_1" },
      },
    ];

    render(<LangGraphCanvasLLMRefNode {...createProps()} />);

    const addBtn = screen.getByRole("button", { name: /Add LLM Node/i });
    fireEvent.click(addBtn);

    // Expect setNodes to have been called to add the new master LLM
    expect(mockSetNodes).toHaveBeenCalled();

    // Check that a new master LLM node was created
    const nodeUpdater = mockSetNodes.mock.calls.find((call) => {
      const result = call[0]?.(mockNodes);
      return Array.isArray(result) && result.some((n: any) => n.type === LANGGRAPH_CANVAS_NODE_LLM);
    });
    expect(nodeUpdater).toBeDefined();

    const updatedNodes = nodeUpdater?.[0]?.(mockNodes);
    const createdLlm = updatedNodes?.find((n: any) => n.type === LANGGRAPH_CANVAS_NODE_LLM);
    expect(createdLlm).toBeDefined();
    expect(createdLlm?.data?.provider).toBe("groq");
    expect(createdLlm?.position?.x).toBe(160); // 500 - 340
    expect(createdLlm?.position?.y).toBe(160); // 200 - 40
  });

  it("renders the master LLM select dropdown when master LLMs are present", () => {
    mockNodes = [
      {
        id: "llm_ref_1",
        type: LANGGRAPH_CANVAS_NODE_LLM_REF,
        position: { x: 500, y: 200 },
        data: { label: "LLM Ref", refId: "llm_ref_1", llmRef: "master_1" },
      },
      {
        id: "master_1",
        type: LANGGRAPH_CANVAS_NODE_LLM,
        position: { x: 100, y: 200 },
        data: { label: "Master Groq LLM", provider: "groq", model: "openai/gpt-oss-120b" },
      },
    ];

    render(<LangGraphCanvasLLMRefNode {...createProps({ llmRef: "master_1" })} />);

    expect(screen.queryByText(/No master LLM on canvas/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add LLM Node/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-select")).toBeInTheDocument();
    expect(screen.getByTestId("item-master_1")).toBeInTheDocument();
  });
});

