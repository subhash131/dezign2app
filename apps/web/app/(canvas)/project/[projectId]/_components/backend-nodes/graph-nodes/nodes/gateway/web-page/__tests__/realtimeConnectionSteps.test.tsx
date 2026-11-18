import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RealtimeConnectionList } from "../RealtimeConnectionList";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { handleWebPageActionConnect } from "@/lib/stores/backendCanvas/edge/handlers/webPageActionConnect";
import type { BackendNode, BackendEdge, PipelineStepDraft } from "@workspace/canvas";

import { ReactFlowProvider } from "@xyflow/react";

describe("RealtimeConnectionList and action steps integration", () => {
  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [],
      edges: [],
      endpoints: [],
      events: [],
    });
  });

  it("renders step count badge and simulation button when connection has actionSteps", () => {
    const dummyWebPageNode: BackendNode = {
      id: "web-node-1",
      type: "webPage",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "Home",
        realtimeConnections: [
          {
            id: "rtc-test-1",
            protocol: "WEBSOCKET",
            eventName: "chat.message",
            actionSteps: [
              {
                id: "step-1",
                order: 1,
                type: "state_mutation",
                name: "appendMessage",
              },
              {
                id: "step-2",
                order: 2,
                type: "notification",
                name: "Toast Alert",
              },
            ],
          },
        ],
      },
    };

    useBackendCanvasStore.setState({
      nodes: [dummyWebPageNode],
      edges: [],
    });

    render(
      <ReactFlowProvider>
        <RealtimeConnectionList
          nodeId="web-node-1"
          connections={dummyWebPageNode.data?.realtimeConnections}
          updateNode={vi.fn()}
          data={dummyWebPageNode.data}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("2 steps")).toBeDefined();
    expect(
      screen.getByTitle("Simulate real-time action pipeline (2 steps)"),
    ).toBeDefined();
  });

  it("handleWebPageActionConnect adds a step to realtimeConnections when connected from rtc-out- handle", () => {
    const webNode: BackendNode = {
      id: "web-1",
      type: "webPage",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "Page",
        realtimeConnections: [
          {
            id: "rtc-100",
            protocol: "SSE",
            eventName: "stock.tick",
            actionSteps: [],
          },
        ],
      },
    };

    const transformerNode: BackendNode = {
      id: "tr-1",
      type: "transformer",
      fractionalIndex: "a1",
      position: { x: 300, y: 0 },
      data: {
        label: "PriceFormatter",
        functionName: "formatPrice",
      },
    };

    useBackendCanvasStore.setState({
      nodes: [webNode, transformerNode],
      edges: [],
    });

    const newEdge: BackendEdge = {
      id: "edge-rtc-tr",
      fractionalIndex: "a0",
      source: "web-1",
      target: "tr-1",
      sourceHandle: "rtc-out-rtc-100",
      targetHandle: "transformer-in",
      type: "connection",
    };

    const handled = handleWebPageActionConnect({
      set: useBackendCanvasStore.setState,
      get: useBackendCanvasStore.getState,
      connection: {
        source: "web-1",
        target: "tr-1",
        sourceHandle: "rtc-out-rtc-100",
        targetHandle: "transformer-in",
      },
      sourceNode: webNode,
      targetNode: transformerNode,
      newEdge,
    });

    expect(handled).toBe(true);

    const updatedNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === "web-1");
    const rtc = updatedNode?.data?.realtimeConnections?.find(
      (c) => c.id === "rtc-100",
    );
    expect(rtc?.actionSteps).toBeDefined();
    expect(rtc?.actionSteps?.length).toBe(1);
    expect(rtc?.actionSteps?.[0]?.type).toBe("transform");
    expect(rtc?.actionSteps?.[0]?.transformerNodeId).toBe("tr-1");
  });

  it("renders step name and index badge for derived pipeline steps", () => {
    const lgStep1: PipelineStepDraft = {
      id: "step-lg-1",
      order: 1,
      type: "langgraph_invoke",
      name: "LangGraph Agent",
      langGraphStreamingEnabled: true,
      langGraphStreamingProtocol: "sse",
      clientDeliveryTargetPageId: "web-node-target",
    };

    const lgStep2: PipelineStepDraft = {
      id: "step-lg-2",
      order: 2,
      type: "langgraph_invoke",
      name: "AI Agent",
      langGraphStreamingEnabled: true,
      langGraphStreamingProtocol: "sse",
      clientDeliveryTargetPageId: "web-node-target",
    };

    const webPageNode: BackendNode = {
      id: "web-node-target",
      type: "webPage",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "ChatPage",
      },
    };

    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      fractionalIndex: "a1",
      position: { x: 0, y: 0 },
      data: {
        label: "AI Service",
        endpoints: [
          {
            id: "ep-1",
            name: "send-message",
            type: "POST",
            pipelineSteps: [lgStep1, lgStep2],
          },
        ],
      },
    };

    useBackendCanvasStore.setState({
      nodes: [webPageNode, serviceNode],
      edges: [],
      endpoints: [
        {
          id: "ep-1",
          nodeId: "service-1",
          name: "send-message",
          type: "POST",
          pipelineSteps: [lgStep1, lgStep2],
        },
      ],
      events: [],
    });

    render(
      <ReactFlowProvider>
        <RealtimeConnectionList
          nodeId="web-node-target"
          connections={[]}
          updateNode={vi.fn()}
          data={webPageNode.data}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("Step 1: LangGraph Agent")).toBeDefined();
    expect(screen.getByText("Step 2: AI Agent")).toBeDefined();
  });
});
