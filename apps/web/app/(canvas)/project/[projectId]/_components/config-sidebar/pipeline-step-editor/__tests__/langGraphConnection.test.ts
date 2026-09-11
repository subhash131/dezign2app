import { describe, it, expect, beforeEach } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode } from "@/types/canvas";
import type { EndpointWithNode, EventWithNode } from "@workspace/canvas";
import { getConnectedLangGraphForEndpoint } from "@/lib/utils/pipelineValidation";

describe("pipeline-step-editor: LangGraph Node and Edge Synchronization", () => {
  const serviceNodeId = "service-1";
  const endpointId = "ep-chat";
  const eventId = "ev-chat";
  const langGraphNodeId = "langgraph-agent-1";

  const serviceNode: BackendNode = {
    id: serviceNodeId,
    type: "service",
    position: { x: 100, y: 100 },
    fractionalIndex: "a0",
    data: { label: "Chat Service" },
  };

  const langGraphNode: BackendNode = {
    id: langGraphNodeId,
    type: "langgraph",
    position: { x: 500, y: 100 },
    fractionalIndex: "a1",
    data: {
      label: "Support Agent",
      stateChannels: [
        { key: "messages", type: "messages", reducer: "add_messages" },
        { key: "userId", type: "string", reducer: "replace" },
      ],
    },
  };

  const endpoint: EndpointWithNode = {
    id: endpointId,
    nodeId: serviceNodeId,
    name: "/api/chat",
    type: "POST",
    pipelineSteps: [
      {
        id: "return-step",
        name: "Return Response",
        type: "return_response",
        enabled: true,
        statusCode: 200,
        inputBindings: [],
        outputVariable: "",
      },
    ],
  };

  const consumedEvent: EventWithNode = {
    id: eventId,
    nodeId: serviceNodeId,
    name: "user_message_received",
    variant: "consume",
    pipelineSteps: [],
  };

  beforeEach(() => {
    useBackendCanvasStore.getState().reset("proj-langgraph-test");
    useBackendCanvasStore
      .getState()
      .setNodesAndEdges(
        [serviceNode, langGraphNode],
        [],
        [endpoint],
        [consumedEvent],
        [],
        "proj-langgraph-test",
      );
  });

  it("auto-adds langgraph_invoke step to endpoint pipelineSteps when edge is drawn from endpoint to LangGraph node", () => {
    useBackendCanvasStore.getState().onConnect({
      source: serviceNodeId,
      target: langGraphNodeId,
      sourceHandle: `endpoint-out-${endpointId}`,
      targetHandle: "input-start",
    });

    const state = useBackendCanvasStore.getState();
    const updatedEp = state.endpoints.find((e) => e.id === endpointId);

    // Verify langgraph_invoke step was added
    expect(updatedEp?.pipelineSteps).toHaveLength(2);
    const lgStep = updatedEp?.pipelineSteps?.[0];
    expect(lgStep?.type).toBe("langgraph_invoke");
    expect(lgStep?.langGraphTargetNodeId).toBe(langGraphNodeId);
    expect(lgStep?.name).toBe("Support Agent");
    expect(lgStep?.outputVariable).toBe("supportAgentResult");
    expect(lgStep?.langGraphStateMapping).toEqual({
      messages: "body.message",
      userId: "body.userId",
    });

    // Pinned return_response step should remain at the end
    expect(updatedEp?.pipelineSteps?.[1]?.type).toBe("return_response");

    // The canvas edge should remain intact for route wiring
    const edge = state.edges.find(
      (e) => e.source === serviceNodeId && e.target === langGraphNodeId,
    );
    expect(edge).toBeDefined();
  });

  it("auto-adds langgraph_invoke step to consumer event pipelineSteps when edge is drawn from consumedEvent to LangGraph node", () => {
    useBackendCanvasStore.getState().onConnect({
      source: serviceNodeId,
      target: langGraphNodeId,
      sourceHandle: `consumedEvents-out-${eventId}`,
      targetHandle: "input-start",
    });

    const state = useBackendCanvasStore.getState();
    const updatedEv = state.events.find((e) => e.id === eventId);

    expect(updatedEv?.pipelineSteps).toHaveLength(1);
    const lgStep = updatedEv?.pipelineSteps?.[0];
    expect(lgStep?.type).toBe("langgraph_invoke");
    expect(lgStep?.langGraphTargetNodeId).toBe(langGraphNodeId);
    expect(lgStep?.name).toBe("Support Agent");
    expect(lgStep?.langGraphStateMapping).toEqual({
      messages: "event.message",
      userId: "event.userId",
    });
  });

  it("getConnectedLangGraphForEndpoint identifies LangGraph agent connected to endpoint", () => {
    const edges = [
      {
        id: "edge-1",
        source: serviceNodeId,
        target: langGraphNodeId,
        sourceHandle: `endpoint-out-${endpointId}`,
        targetHandle: "input-start",
        fractionalIndex: "a0",
      },
    ];

    const connected = getConnectedLangGraphForEndpoint(
      endpointId,
      serviceNodeId,
      [serviceNode, langGraphNode],
      edges as any,
    );

    expect(connected).toHaveLength(1);
    expect(connected[0]?.id).toBe(langGraphNodeId);
    expect(connected[0]?.label).toBe("Support Agent");
  });

  it("removes langgraph_invoke step when the connecting edge is deleted", () => {
    // 1. Connect
    useBackendCanvasStore.getState().onConnect({
      source: serviceNodeId,
      target: langGraphNodeId,
      sourceHandle: `endpoint-out-${endpointId}`,
      targetHandle: "input-start",
    });

    const stateAfterConnect = useBackendCanvasStore.getState();
    const addedEdge = stateAfterConnect.edges.find(
      (e) => e.source === serviceNodeId && e.target === langGraphNodeId,
    );
    expect(addedEdge).toBeDefined();
    expect(
      stateAfterConnect.endpoints.find((e) => e.id === endpointId)?.pipelineSteps,
    ).toHaveLength(2);

    // 2. Delete edge
    useBackendCanvasStore.getState().deleteEdge(addedEdge!.id);

    const stateAfterDelete = useBackendCanvasStore.getState();
    const updatedEp = stateAfterDelete.endpoints.find((e) => e.id === endpointId);

    // langgraph_invoke step should be cleaned up
    expect(updatedEp?.pipelineSteps).toHaveLength(1);
    expect(updatedEp?.pipelineSteps?.[0]?.type).toBe("return_response");
  });

  it("removes langgraph_invoke step when the LangGraph node itself is deleted", () => {
    // 1. Connect
    useBackendCanvasStore.getState().onConnect({
      source: serviceNodeId,
      target: langGraphNodeId,
      sourceHandle: `endpoint-out-${endpointId}`,
      targetHandle: "input-start",
    });

    expect(
      useBackendCanvasStore.getState().endpoints.find((e) => e.id === endpointId)
        ?.pipelineSteps,
    ).toHaveLength(2);

    // 2. Delete LangGraph node
    useBackendCanvasStore.getState().deleteNode(langGraphNodeId);

    const stateAfterDelete = useBackendCanvasStore.getState();
    const updatedEp = stateAfterDelete.endpoints.find((e) => e.id === endpointId);

    expect(updatedEp?.pipelineSteps).toHaveLength(1);
    expect(updatedEp?.pipelineSteps?.[0]?.type).toBe("return_response");
  });
});
