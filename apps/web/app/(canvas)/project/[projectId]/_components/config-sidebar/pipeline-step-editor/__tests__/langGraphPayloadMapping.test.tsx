import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LangGraphInvokeStepSection } from "../LangGraphInvokeStepSection";
import { PipelineStepDraft, AvailableSource, AvailablePath } from "../types";
import { BackendNode, PipelineStep } from "@workspace/canvas/types";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { resolveLangGraphStepPaths } from "../source-paths/step-resolvers/resolveLangGraphStep";
import { resolveRealtimePayloadPaths } from "../../web-page-realtime-config/resolveRealtimePayloadPaths";

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="mock-select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, className }: any) => (
    <button role="combobox" className={className}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder, children }: any) => (
    <span>{children || placeholder}</span>
  ),
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-testid="mock-select-item" data-value={value}>
      {children}
    </div>
  ),
}));

vi.mock("@workspace/ui/components/switch", () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <input
      type="checkbox"
      data-testid="switch"
      checked={Boolean(checked)}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock("../BindingSourceEditor", () => ({
  BindingSourceEditor: ({ binding, onChange }: any) => (
    <div data-testid={`mock-binding-editor-${binding.argName}`}>
      <button
        onClick={() =>
          onChange({
            ...binding,
            source: { kind: "req_body", field: "custom_field" },
          })
        }
      >
        Update Binding
      </button>
    </div>
  ),
}));

describe("LangGraphInvokeStepSection Payload Mapping", () => {
  const mockAgentNode: BackendNode = {
    id: "agent-1",
    type: "langgraph",
    fractionalIndex: "a1",
    position: { x: 0, y: 0 },
    data: {
      label: "Support Agent",
      stateChannels: [
        { key: "messages", type: "messages", reducer: "add_messages" },
        { key: "current_message", type: "string", reducer: "replace" },
      ],
    },
  };

  const mockAvailableSources: AvailableSource[] = [
    {
      id: "req_body",
      label: "Request Body (body)",
      kind: "req_body",
      paths: [
        { path: "message", type: "string" },
        { path: "current_message", type: "string" },
      ],
    },
  ];

  it("renders delete buttons for mapped channels and removes channel on click", () => {
    const step: PipelineStepDraft = {
      id: "step-1",
      name: "Invoke Support Agent",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-1",
      langGraphStateMapping: {
        messages: "body.message",
        current_message: "body.current_message",
      },
      inputBindings: [
        { argName: "messages", source: { kind: "req_body", field: "message" } },
        { argName: "current_message", source: { kind: "req_body", field: "current_message" } },
      ],
    };

    const handleChange = vi.fn();

    render(
      <LangGraphInvokeStepSection
        step={step}
        allNodes={[mockAgentNode]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
      />
    );

    // Both mapped channels should be visible in the table
    expect(screen.getAllByText("messages")[0]).toBeInTheDocument();
    expect(screen.getByText("current_message")).toBeInTheDocument();

    // Click delete on current_message
    const removeButtons = screen.getAllByTitle("Remove mapping");
    expect(removeButtons).toHaveLength(2);

    fireEvent.click(removeButtons[1]!);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updatedStep = handleChange.mock.calls[0]![0]!;

    // current_message should be deleted from both langGraphStateMapping and inputBindings
    expect(updatedStep.langGraphStateMapping).toEqual({
      messages: "body.message",
    });
    expect(updatedStep.inputBindings).toEqual([
      { argName: "messages", source: { kind: "req_body", field: "message" } },
    ]);
  });

  it("does not render unmapped channels as mapped rows, and shows them under available channels", () => {
    const stepWithOnlyMessages: PipelineStepDraft = {
      id: "step-1",
      name: "Invoke Support Agent",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-1",
      langGraphStateMapping: {
        messages: "body.message",
      },
      inputBindings: [
        { argName: "messages", source: { kind: "req_body", field: "message" } },
      ],
    };

    const handleChange = vi.fn();

    render(
      <LangGraphInvokeStepSection
        step={stepWithOnlyMessages}
        allNodes={[mockAgentNode]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
      />
    );

    // Only messages should be in the mapped table with a remove button
    const removeButtons = screen.getAllByTitle("Remove mapping");
    expect(removeButtons).toHaveLength(1);

    // current_message should appear under available channels
    const addChannelButton = screen.getByTitle("Map channel: current_message (string)");
    expect(addChannelButton).toBeInTheDocument();

    // Clicking it maps current_message
    fireEvent.click(addChannelButton);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updatedStep = handleChange.mock.calls[0]![0]!;
    expect(updatedStep.langGraphStateMapping.current_message).toBeDefined();
    expect(updatedStep.inputBindings.some((b: any) => b.argName === "current_message")).toBe(true);
  });

  it("shows empty state when no channels are mapped and allows auto-mapping", () => {
    const emptyStep: PipelineStepDraft = {
      id: "step-1",
      name: "Invoke Support Agent",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-1",
      langGraphStateMapping: {},
      inputBindings: [],
    };

    const handleChange = vi.fn();

    render(
      <LangGraphInvokeStepSection
        step={emptyStep}
        allNodes={[mockAgentNode]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
      />
    );

    expect(screen.getByText("No payload channels mapped yet. The agent will run with its default state.")).toBeInTheDocument();

    const autoMapBtn = screen.getByTitle("Auto-map default payload fields");
    fireEvent.click(autoMapBtn);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updatedStep = handleChange.mock.calls[0]![0]!;
    expect(updatedStep.langGraphStateMapping.messages).toBeDefined();
    expect(updatedStep.langGraphStateMapping.current_message).toBeDefined();
  });

  it("renders Session Thread ID section and auto-maps thread_id when agent has checkpointer memory enabled", () => {
    const memoryAgentNode: BackendNode = {
      id: "agent-mem-1",
      type: "langgraph",
      fractionalIndex: "a2",
      position: { x: 0, y: 0 },
      data: {
        label: "Memory Chatbot",
        memoryConfig: {
          enabled: true,
          checkpointer: "postgres",
        },
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
        ],
      },
    };

    const step: PipelineStepDraft = {
      id: "step-mem-1",
      name: "Invoke Memory Chatbot",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-mem-1",
      langGraphStateMapping: {
        messages: "body.message",
      },
      inputBindings: [
        { argName: "messages", source: { kind: "req_body", field: "message" } },
      ],
    };

    const handleChange = vi.fn();

    render(
      <LangGraphInvokeStepSection
        step={step}
        allNodes={[memoryAgentNode]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
      />
    );

    // Thread ID header and checkpointer badge should be rendered
    expect(screen.getByText("Session Thread ID (Checkpointer Memory)")).toBeInTheDocument();
    expect(screen.getByText("postgres checkpointer")).toBeInTheDocument();
    // Hint for messages channel history loaded from DB
    expect(screen.getByText("new input only (history from DB)")).toBeInTheDocument();

    // Auto-map should include thread_id source
    const autoMapBtn = screen.getByTitle("Auto-map default payload fields");
    fireEvent.click(autoMapBtn);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updatedStep = handleChange.mock.calls[0]![0]!;
    expect(updatedStep.langGraphThreadIdSource).toBe("body.thread_id");
  });

  it("shows quick-action banner when endpoint contract lacks thread_id and provisions it on click", () => {
    const memoryAgentNode: BackendNode = {
      id: "agent-mem-2",
      fractionalIndex:"a0",
      type: "langgraph",
      position: { x: 0, y: 0 },
      data: {
        label: "MemoryChatBot",
        memoryConfig: {
          enabled: true,
          checkpointer: "postgres",
        },
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
        ],
      },
    };

    const endpointWithoutThreadId = {
      id: "ep-1",
      name: "/api/chat",
      type: "POST",
      nodeId: "srv-1",
      requestBody: {
        id: "req_ep-1",
        fields: [
          { id: "f1", name: "message", key: "message", type: "string", required: true },
        ],
      },
    } as any;

    const step: PipelineStep = {
      id: "step-agent-mem-2",
      name: "MemoryChatBot",
      type: "langgraph_invoke",
      outputVariable: "chatResult",
      langGraphTargetNodeId: "agent-mem-2",
      langGraphStateMapping: {
        messages: "body.message",
      },
      inputBindings: [
        { argName: "messages", source: { kind: "req_body", field: "message" } },
      ],
    };

    const handleChange = vi.fn();
    const handleEndpointChange = vi.fn();

    render(
      <LangGraphInvokeStepSection
        step={step}
        allNodes={[memoryAgentNode]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
        endpoint={endpointWithoutThreadId}
        onEndpointChange={handleEndpointChange}
      />
    );

    // Banner and badge should appear
    expect(screen.getAllByText("configurable.thread_id").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Endpoint contract does not define a thread ID field")).toBeInTheDocument();

    const addBtn = screen.getByRole("button", { name: /\+ Add "thread_id" to Request Body/i });
    expect(addBtn).toBeInTheDocument();

    fireEvent.click(addBtn);

    expect(handleEndpointChange).toHaveBeenCalledTimes(1);
    const epChanges = handleEndpointChange.mock.calls[0]![0]!;
    expect(epChanges.requestBody?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "thread_id", key: "thread_id", type: "string" }),
      ])
    );
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        langGraphThreadIdSource: "body.thread_id",
      })
    );
  });

  it("syncs inputChannels to the target LangGraph agent node when payload mapping exists", () => {
    const store = useBackendCanvasStore.getState();
    store.addNode(mockAgentNode);

    const step: PipelineStepDraft = {
      id: "step-agent-sync-1",
      name: "demo",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-1",
      langGraphStateMapping: {
        messages: "body.message",
      },
      inputBindings: [
        { argName: "messages", source: { kind: "req_body", field: "message" } },
      ],
    };

    const handleChange = vi.fn();

    render(
      <LangGraphInvokeStepSection
        step={step}
        allNodes={[mockAgentNode]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
      />
    );

    const agentInStore = useBackendCanvasStore.getState().nodes.find((n) => n.id === "agent-1");
    expect(agentInStore?.data.inputChannels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "message",
          source: "request",
          stateChannelKey: "messages",
        }),
      ])
    );
  });

  it("self-heals and strips legacy thread_id from langGraphStateMapping and inputBindings on mount", () => {
    const legacyStep: PipelineStepDraft = {
      id: "step-legacy-thread-1",
      name: "Invoke Support Agent",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-1",
      langGraphStateMapping: {
        messages: "body.message",
        thread_id: "params.id",
      },
      inputBindings: [
        { argName: "messages", source: { kind: "req_body", field: "message" } },
        { argName: "thread_id", source: { kind: "req_params", field: "id" } },
      ],
    };

    const handleChange = vi.fn();

    render(
      <LangGraphInvokeStepSection
        step={legacyStep}
        allNodes={[mockAgentNode]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
      />
    );

    // Sanitizer effect should have fired
    expect(handleChange).toHaveBeenCalled();
    const updated = handleChange.mock.calls[0]![0]!;
    expect(updated.langGraphStateMapping.thread_id).toBeUndefined();
    expect(updated.inputBindings.some((b: any) => b.argName === "thread_id")).toBe(false);
    expect(updated.langGraphThreadIdSource).toBe("params.id");
  });

  it("never includes thread_id in State Channel Payload Mapping table or available channels even if agent declares it", () => {
    const agentWithThreadChannel: BackendNode = {
      id: "agent-with-thread",
      type: "langgraph",
      fractionalIndex: "a3",
      position: { x: 0, y: 0 },
      data: {
        label: "Agent With Thread Channel",
        stateChannels: [
          { key: "messages", type: "messages", reducer: "add_messages" },
          { key: "thread_id", type: "string", reducer: "replace" },
        ],
      },
    };

    const cleanStep: PipelineStepDraft = {
      id: "step-clean-1",
      name: "Invoke Agent",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-with-thread",
      langGraphThreadIdSource: "params.id",
      langGraphStateMapping: {
        messages: "body.message",
      },
      inputBindings: [
        { argName: "messages", source: { kind: "req_body", field: "message" } },
      ],
    };

    const handleChange = vi.fn();

    render(
      <LangGraphInvokeStepSection
        step={cleanStep}
        allNodes={[agentWithThreadChannel]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
      />
    );

    // thread_id should NOT be rendered in State Channel Payload Mapping as an available channel chip
    expect(screen.queryByTitle(/Map channel: thread_id/i)).toBeNull();

    // Auto-map should NOT add thread_id to state channel mapping
    const autoMapBtn = screen.getByTitle("Auto-map default payload fields");
    fireEvent.click(autoMapBtn);

    const updatedStep = handleChange.mock.calls[handleChange.mock.calls.length - 1]![0]!;
    expect(updatedStep.langGraphStateMapping.thread_id).toBeUndefined();
    expect(updatedStep.inputBindings.some((b: any) => b.argName === "thread_id")).toBe(false);
  });

  it("toggles track token usage switch and updates step draft", () => {
    const cleanStep: PipelineStepDraft = {
      id: "step-token-ui",
      name: "Invoke Agent",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-node-1",
      langGraphTrackTokenUsage: false,
    };

    const handleChange = vi.fn();

    const { rerender } = render(
      <LangGraphInvokeStepSection
        step={cleanStep}
        allNodes={[mockAgentNode]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
      />
    );

    expect(screen.getByText("Track Token Usage")).toBeDefined();
    expect(screen.getByText("Extract input, output, and total tokens per invocation")).toBeDefined();

    const switches = screen.getAllByTestId("switch");
    const tokenUsageSwitch = switches[switches.length - 1]!;
    fireEvent.click(tokenUsageSwitch);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        langGraphTrackTokenUsage: true,
      })
    );

    rerender(
      <LangGraphInvokeStepSection
        step={{ ...cleanStep, langGraphTrackTokenUsage: true }}
        allNodes={[mockAgentNode]}
        availableSources={mockAvailableSources}
        onChange={handleChange}
      />
    );

    expect(screen.getByText("usage.input_tokens")).toBeDefined();
    expect(screen.getByText("usage.output_tokens")).toBeDefined();
    expect(screen.getByText("usage.total_tokens")).toBeDefined();
  });

  it("resolves token usage paths for downstream steps when langGraphTrackTokenUsage is true", () => {
    const step: PipelineStepDraft = {
      id: "step-token-paths",
      name: "Token Agent",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-node-1",
      langGraphTrackTokenUsage: true,
    };
    const stepPaths: AvailablePath[] = [];
    resolveLangGraphStepPaths(step, [mockAgentNode], stepPaths);

    const paths = stepPaths.map((p) => p.path);
    expect(paths).toContain("usage");
    expect(paths).toContain("usage.input_tokens");
    expect(paths).toContain("usage.output_tokens");
    expect(paths).toContain("usage.total_tokens");
    expect(paths).toContain("usage.inputTokens");
  });

  it("resolves streaming lifecycle and content paths when langGraphStreamingEnabled is true", () => {
    const step: PipelineStepDraft = {
      id: "step-stream-paths",
      name: "Streaming Agent",
      type: "langgraph_invoke",
      langGraphTargetNodeId: "agent-node-1",
      langGraphStreamingEnabled: true,
      langGraphStreamingProtocol: "sse",
      langGraphTrackTokenUsage: true,
    };
    const stepPaths: AvailablePath[] = [];
    resolveLangGraphStepPaths(step, [mockAgentNode], stepPaths);

    const paths = stepPaths.map((p) => p.path);
    expect(paths).toContain("response");
    expect(paths).toContain("content");
    expect(paths).toContain("done");
    expect(paths).toContain("streamed");
    expect(paths).toContain("protocol");
    expect(paths).toContain("toolCalls");
    expect(paths).toContain("usage");
  });

  it("resolves realtime stream event paths including stream lifecycle, tool calls, and usage", () => {
    const lgStep: any = {
      id: "step-lg-stream",
      type: "langgraph_invoke",
      name: "Invoke Stream Agent",
      langGraphStreamingEnabled: true,
      langGraphStreamingProtocol: "sse",
      langGraphStreamModes: ["messages"],
      langGraphStreamIncludeReasoning: true,
      langGraphTargetNodeId: "agent-1",
      langGraphTrackTokenUsage: true,
    };

    const conn: any = {
      id: "conn-lg",
      protocol: "SSE",
      eventName: "message",
      isLangGraph: true,
      langGraphStreamModes: ["messages"],
      langGraphStreamIncludeReasoning: true,
      langGraphTargetNodeId: "agent-1",
    };

    const realtimePaths = resolveRealtimePayloadPaths({
      conn,
      derivedInfo: {
        step: lgStep,
        sourceNode: undefined,
        sourceEventId: null,
        sourceEndpointId: "ep-1",
      },
      endpoints: [
        {
          id: "ep-1",
          name: "/api/chat",
          type: "POST",
          pipelineSteps: [lgStep],
          nodeId: "srv-1",
        },
      ],
      events: [],
      nodes: [mockAgentNode],
      edges: [],
    });

    const pathKeys = realtimePaths.map((p) => p.path);
    expect(pathKeys).toContain("type");
    expect(pathKeys).toContain("token");
    expect(pathKeys).toContain("reasoning");
    expect(pathKeys).toContain("tool_call");
    expect(pathKeys).toContain("tool_calls");
    expect(pathKeys).toContain("usage");
    expect(pathKeys).toContain("usage.input_tokens");
    expect(pathKeys).toContain("usage.output_tokens");
    expect(pathKeys).toContain("usage.total_tokens");
    expect(pathKeys).toContain("done");
    expect(pathKeys).toContain("content");
    expect(pathKeys).toContain("response");
    expect(pathKeys).toContain("threadId");
  });
});
