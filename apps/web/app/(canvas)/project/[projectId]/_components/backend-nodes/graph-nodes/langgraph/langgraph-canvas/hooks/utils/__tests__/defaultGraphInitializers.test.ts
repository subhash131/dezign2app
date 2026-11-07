import { describe, it, expect } from "vitest";
import {
  createDefaultLangGraphNodeData,
  DEFAULT_LANGGRAPH_AGENT_NODE_ID,
  DEFAULT_LANGGRAPH_INPUT_CHANNELS,
  DEFAULT_LANGGRAPH_STATE_CHANNELS,
  DEFAULT_LANGGRAPH_GRAPH_EDGES,
  LANGGRAPH_CANVAS_NODE_START,
  LANGGRAPH_CANVAS_NODE_END,
  LANGGRAPH_CANVAS_NODE_NODE,
  LANGGRAPH_CANVAS_NODE_STATE_GLOBAL,
  LANGGRAPH_CANVAS_NODE_MEMORY,
  type MemoryNode,
} from "@workspace/canvas";
import {
  NODE_ID_START,
  NODE_ID_END,
  NODE_ID_STATE_GLOBAL,
  NODE_ID_CHECKPOINTER,
} from "../../../constants";
import {
  buildInitialNodes,
  buildInitialEdges,
} from "../initializers";
import { prepareNodeForAddition } from "@/lib/stores/backendCanvas/node/nodeCreation";
import type { BackendNode, BackendNodeData } from "@/types/canvas";

describe("LangGraph Studio Default Graph (START -> agentNode -> END)", () => {
  it("generates default LangGraph node data with start, agentNode, and end connections", () => {
    const defaultData = createDefaultLangGraphNodeData("Customer Support Agent");

    expect(defaultData.label).toBe("Customer Support Agent");

    // Input channels: 1 request variable "message" mapped to "messages"
    expect(defaultData.inputChannels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "message",
          type: "string",
          required: true,
          source: "request",
          stateChannelKey: "messages",
        }),
      ]),
    );

    // State channels: 1 state field "messages"
    expect(defaultData.stateChannels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "messages",
          type: "messages",
          reducer: "add_messages",
        }),
      ]),
    );

    // Agent definition: agentNode with model off, tools 0, middleware off
    expect(defaultData.agentDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "agentNode",
          name: "agentNode",
          llmConfig: expect.objectContaining({ enabled: false }),
          middlewareConfig: expect.objectContaining({ enabled: false }),
        }),
      ]),
    );

    // Graph edges: START -> agentNode, agentNode -> END
    expect(defaultData.graphEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "START",
          targets: [expect.objectContaining({ id: "agentNode", kind: "step" })],
        }),
        expect.objectContaining({
          source: "agentNode",
          targets: [expect.objectContaining({ id: "END", kind: "end" })],
        }),
      ]),
    );

    // Memory / Checkpointer disabled by default
    expect(defaultData.memoryConfig).toEqual(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  it("buildInitialNodes and buildInitialEdges automatically construct START -> agentNode -> END for empty/new graphs", () => {
    const rawData: BackendNodeData = { label: "LangGraph Agent" };
    const nodes = buildInitialNodes(rawData);

    // Check all required nodes exist
    const stateNode = nodes.find((n) => n.id === NODE_ID_STATE_GLOBAL);
    const checkpointerNode = nodes.find(
      (n): n is MemoryNode => n.id === NODE_ID_CHECKPOINTER,
    );
    const startNode = nodes.find((n) => n.id === NODE_ID_START);
    const agentNode = nodes.find(
      (n) => n.id === "agentNode" && n.type === LANGGRAPH_CANVAS_NODE_NODE,
    );
    const endNode = nodes.find((n) => n.id === NODE_ID_END);

    expect(stateNode).toBeDefined();
    expect(stateNode?.type).toBe(LANGGRAPH_CANVAS_NODE_STATE_GLOBAL);

    expect(checkpointerNode).toBeDefined();
    expect(checkpointerNode?.type).toBe(LANGGRAPH_CANVAS_NODE_MEMORY);
    expect((checkpointerNode?.data as { enabled?: boolean })?.enabled).toBe(false);

    expect(startNode).toBeDefined();
    expect(startNode?.type).toBe(LANGGRAPH_CANVAS_NODE_START);
    expect((startNode?.data as { inputChannels?: unknown[] })?.inputChannels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "message",
          stateChannelKey: "messages",
        }),
      ]),
    );

    expect(agentNode).toBeDefined();
    const agentData = agentNode?.data as { name?: string; llmConfig?: { enabled?: boolean } };
    expect(agentData?.name).toBe("agentNode");
    expect(agentData?.llmConfig?.enabled).toBe(false);

    expect(endNode).toBeDefined();
    expect(endNode?.type).toBe(LANGGRAPH_CANVAS_NODE_END);

    // Build edges
    const edges = buildInitialEdges(rawData, nodes);
    expect(edges).toHaveLength(2);

    const startToAgentEdge = edges.find(
      (e) => e.source === NODE_ID_START && e.target === "agentNode",
    );
    expect(startToAgentEdge).toBeDefined();
    expect(startToAgentEdge?.animated).toBe(true);

    const agentToEndEdge = edges.find(
      (e) => e.source === "agentNode" && e.target === NODE_ID_END,
    );
    expect(agentToEndEdge).toBeDefined();
    expect(agentToEndEdge?.animated).toBe(true);
  });

  it("prepareNodeForAddition populates default graph when a langgraph node is added", () => {
    const rawNode: Omit<BackendNode, "fractionalIndex"> = {
      id: "lg-1",
      type: "langgraph",
      position: { x: 200, y: 150 },
      data: {
        label: "AI Chat Agent",
      },
    };

    const result = prepareNodeForAddition(rawNode, {
      nodes: [],
      edges: [],
      endpoints: [],
      pendingNodeUpserts: [],
      pendingEdgeUpserts: [],
      pendingEndpointUpserts: [],
    });

    const addedNode = result.nodes.find((n) => n.id === "lg-1");
    expect(addedNode).toBeDefined();
    expect(addedNode?.data?.agentDefinitions).toHaveLength(1);
    expect(addedNode?.data?.agentDefinitions?.[0]?.name).toBe("agentNode");
    expect(addedNode?.data?.graphEdges).toHaveLength(2);
    expect(addedNode?.data?.inputChannels?.[0]?.key).toBe("message");
    expect(addedNode?.data?.stateChannels?.[0]?.key).toBe("messages");
  });
});
