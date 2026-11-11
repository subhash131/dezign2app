import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockSetNodes = vi.fn();
vi.mock("@xyflow/react", () => ({
  Handle: ({ id, className }: { id?: string; className?: string }) => (
    <div data-testid={`handle-${id}`} className={className} />
  ),
  Position: { Right: "right" },
  useReactFlow: () => ({
    setNodes: mockSetNodes,
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
      <button
        data-testid="select-custom-trigger"
        onClick={() => onValueChange?.("__custom__")}
      >
        Trigger Custom
      </button>
      <button
        data-testid="select-preset-trigger"
        onClick={() => onValueChange?.("openai/gpt-oss-20b")}
      >
        Trigger 20b
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`item-${value}`}>{children}</div>
  ),
  SelectSeparator: () => <hr />,
}));

vi.mock("@/lib/utils/localEnvSync", () => ({
  saveLocalEnvVariable: vi.fn().mockResolvedValue({ success: true }),
  getLocalEnvVariable: vi.fn().mockReturnValue(""),
  fetchLocalEnvVariable: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/lib/stores/backendCanvasStore", () => ({
  useBackendCanvasStore: {
    getState: () => ({
      nodes: [],
      edges: [],
      updateNode: vi.fn(),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { LangGraphCanvasLLMNode } from "../LangGraphCanvasLLMNode";
import { LLMNodeInspector } from "../../components/inspector/LLMNodeInspector";
import { LANGGRAPH_CANVAS_NODE_LLM } from "../../constants";
import type { LangGraphLLMNodeData } from "@workspace/canvas";

describe("LangGraphCanvasLLMNode - Custom LLM Model Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createProps = (data: Partial<LangGraphLLMNodeData> = {}): React.ComponentProps<typeof LangGraphCanvasLLMNode> => ({
    id: "llm_1",
    data: {
      label: "LLM Config",
      llmId: "llm_1",
      provider: "groq",
      model: "openai/gpt-oss-120b",
      ...data,
    },
    selected: false,
    zIndex: 1,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
  } as unknown as React.ComponentProps<typeof LangGraphCanvasLLMNode>);

  it("renders preset model selection by default for Groq", () => {
    render(<LangGraphCanvasLLMNode {...createProps()} />);

    expect(screen.getByText("Model Identifier")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.getAllByTitle("Configure custom model").length).toBeGreaterThan(0);
  });

  it("switches to custom model input when clicking the Custom button", () => {
    render(<LangGraphCanvasLLMNode {...createProps()} />);

    const customBtn = screen.getByText("Custom");
    fireEvent.click(customBtn);

    const input = screen.getByPlaceholderText(/custom-model/i);
    expect(input).toBeInTheDocument();
    expect(screen.getAllByText("Presets").length).toBeGreaterThan(0);
  });

  it("switches to custom model mode when selecting Custom Model... in dropdown", () => {
    render(<LangGraphCanvasLLMNode {...createProps()} />);

    const triggerBtns = screen.getAllByTestId("select-custom-trigger");
    const targetBtn = triggerBtns[triggerBtns.length - 1];
    if (!targetBtn) throw new Error("Trigger button not found");
    fireEvent.click(targetBtn);

    const input = screen.getByPlaceholderText(/custom-model/i);
    expect(input).toBeInTheDocument();
  });

  it("updates model when typing into the custom model input", () => {
    render(<LangGraphCanvasLLMNode {...createProps({ model: "openai/gpt-oss-120b" })} />);

    const customBtn = screen.getByText("Custom");
    fireEvent.click(customBtn);

    const input = screen.getByPlaceholderText(/custom-model/i);
    fireEvent.change(input, { target: { value: "llama-3.3-70b-versatile" } });
    fireEvent.blur(input);

    expect(mockSetNodes).toHaveBeenCalled();
    const updater = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1]?.[0];
    const updated = updater?.([
      { id: "llm_1", type: LANGGRAPH_CANVAS_NODE_LLM, data: { model: "openai/gpt-oss-120b" } },
    ]);
    expect(updated?.[0]?.data.model).toBe("llama-3.3-70b-versatile");
  });

  it("automatically enters custom mode if the model is not in provider presets", () => {
    render(<LangGraphCanvasLLMNode {...createProps({ model: "deepseek-r1-distill-llama-70b" })} />);

    const input = screen.getByDisplayValue("deepseek-r1-distill-llama-70b");
    expect(input).toBeInTheDocument();
    expect(screen.getAllByText("Presets").length).toBeGreaterThan(0);
  });

  it("switches back to preset mode when clicking Presets button", () => {
    render(<LangGraphCanvasLLMNode {...createProps({ model: "deepseek-r1-distill-llama-70b" })} />);

    const presetsBtn = screen.getByTitle("Switch back to preset models");
    fireEvent.click(presetsBtn);

    expect(mockSetNodes).toHaveBeenCalled();
    const updater = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1]?.[0];
    const updated = updater?.([
      { id: "llm_1", type: LANGGRAPH_CANVAS_NODE_LLM, data: { model: "deepseek-r1-distill-llama-70b" } },
    ]);
    expect(updated?.[0]?.data.model).toBe("openai/gpt-oss-120b");
  });
});

describe("LLMNodeInspector - Custom LLM Model Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultData: LangGraphLLMNodeData = {
    label: "LLM Config",
    llmId: "llm_1",
    provider: "groq",
    model: "openai/gpt-oss-120b",
  };

  it("renders custom model toggle button in inspector", () => {
    render(
      <LLMNodeInspector
        selectedLLMData={defaultData}
        onDeleteStep={vi.fn()}
        onUpdateLLM={vi.fn()}
      />
    );

    expect(screen.getByText("Model Identifier")).toBeInTheDocument();
    expect(screen.getByText("Custom model")).toBeInTheDocument();
  });

  it("switches to custom model input and updates model in inspector", () => {
    const onUpdateLLM = vi.fn();
    render(
      <LLMNodeInspector
        selectedLLMData={defaultData}
        onDeleteStep={vi.fn()}
        onUpdateLLM={onUpdateLLM}
      />
    );

    const customBtn = screen.getByText("Custom model");
    fireEvent.click(customBtn);

    const input = screen.getByPlaceholderText(/custom-model/i);
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "qwen/qwen3.8-27b" } });
    fireEvent.blur(input);

    expect(onUpdateLLM).toHaveBeenCalledWith(
      expect.objectContaining({ model: "qwen/qwen3.8-27b" })
    );
  });
});
