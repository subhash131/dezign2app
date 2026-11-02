import { describe, it, expect, beforeEach } from "vitest";
import {
  useBackendCanvasStore,
  EndpointWithNode,
  EventWithNode,
} from "@/lib/stores/backendCanvasStore";
import { BackendEdge, BackendNode } from "@/types/canvas";

describe("backendCanvasStore - Transformer state cleanup & synchronization", () => {
  beforeEach(() => {
    useBackendCanvasStore.getState().reset("proj-1");
  });

  it("cleans up transformer node targetEndpointIds and endpoint pipelineSteps when edge is deleted", () => {
    const store = useBackendCanvasStore.getState();

    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      position: { x: 0, y: 0 },
      data: { label: "User Service" },
      fractionalIndex: "a0",
    };

    const transformerNode: BackendNode = {
      id: "trans-1",
      type: "transformer",
      position: { x: 300, y: 0 },
      data: {
        label: "formatUser",
        functionName: "formatUser",
        targetServiceId: "service-1",
        targetEndpointIds: ["ep-1"],
        targetEndpointId: "ep-1",
      },
      fractionalIndex: "a1",
    };

    const edge: BackendEdge = {
      id: "edge-trans-ep1",
      source: "trans-1",
      target: "service-1",
      sourceHandle: "transformer-out",
      targetHandle: "endpoint-in-ep-1",
      type: "connection",
      fractionalIndex: "e0",
    };

    const endpoint: EndpointWithNode = {
      id: "ep-1",
      nodeId: "service-1",
      name: "getUser",
      type: "GET",
      pipelineSteps: [
        {
          id: "step-1",
          name: "formattedUser",
          type: "transform",
          enabled: true,
          transformerNodeId: "trans-1",
          functionRef: {
            name: "formatUser",
            importPath: "./transformers/formatUser",
          },
          inputBindings: [],
          outputVariable: "formattedUser",
        },
        {
          id: "return-response-step",
          name: "Return Response",
          type: "return_response",
          enabled: true,
          statusCode: 200,
          inputBindings: [],
          outputVariable: "",
        },
      ],
    };

    store.setNodesAndEdges([serviceNode, transformerNode], [edge], [endpoint], [], [], "proj-1");

    // Delete the edge
    useBackendCanvasStore.getState().deleteEdge("edge-trans-ep1");

    const stateAfterEdgeDelete = useBackendCanvasStore.getState();

    // 1. Edge is deleted
    expect(stateAfterEdgeDelete.edges).toHaveLength(0);

    // 2. Transformer node targetEndpointIds is cleaned up
    const updatedTransNode = stateAfterEdgeDelete.nodes.find((n) => n.id === "trans-1");
    expect(updatedTransNode?.data?.targetEndpointIds).toEqual([]);
    expect(updatedTransNode?.data?.targetEndpointId).toBeUndefined();
    expect(updatedTransNode?.data?.targetServiceId).toBeUndefined();

    // 3. Endpoint pipelineSteps transform step is cleaned up
    const updatedEp = stateAfterEdgeDelete.endpoints.find((e) => e.id === "ep-1");
    expect(updatedEp?.pipelineSteps).toHaveLength(1);
    expect(updatedEp?.pipelineSteps?.[0]?.type).toBe("return_response");
  });

  it("cleans up endpoint and event pipelineSteps when transformer node is deleted", () => {
    const store = useBackendCanvasStore.getState();

    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      position: { x: 0, y: 0 },
      data: { label: "Order Service" },
      fractionalIndex: "a0",
    };

    const transformerNode: BackendNode = {
      id: "trans-2",
      type: "transformer",
      position: { x: 300, y: 0 },
      data: {
        label: "validateOrder",
        functionName: "validateOrder",
      },
      fractionalIndex: "a1",
    };

    const endpoint: EndpointWithNode = {
      id: "ep-2",
      nodeId: "service-1",
      name: "createOrder",
      type: "POST",
      pipelineSteps: [
        {
          id: "step-1",
          name: "validatedOrder",
          type: "transform",
          enabled: true,
          transformerNodeId: "trans-2",
          functionRef: {
            name: "validateOrder",
            importPath: "./transformers/validateOrder",
          },
          inputBindings: [],
          outputVariable: "validatedOrder",
        },
      ],
    };

    const event: EventWithNode = {
      id: "ev-1",
      nodeId: "service-1",
      variant: "consume",
      name: "OrderCreatedConsumer",
      messagingResourceId: "orders",
      brokerNodeId: "kafka-1",
      pipelineSteps: [
        {
          id: "step-2",
          name: "validatedEvent",
          type: "transform",
          enabled: true,
          functionRef: {
            name: "validateOrder",
            importPath: "./transformers/validateOrder",
          },
          inputBindings: [],
          outputVariable: "validatedEvent",
        },
      ],
    };

    store.setNodesAndEdges([serviceNode, transformerNode], [], [endpoint], [event], [], "proj-1");

    // Delete the transformer node
    useBackendCanvasStore.getState().deleteNode("trans-2");

    const state = useBackendCanvasStore.getState();
    expect(state.nodes.find((n) => n.id === "trans-2")).toBeUndefined();

    const updatedEp = state.endpoints.find((e) => e.id === "ep-2");
    expect(updatedEp?.pipelineSteps).toEqual([]);

    const updatedEv = state.events.find((e) => e.id === "ev-1");
    expect(updatedEv?.pipelineSteps).toEqual([]);
  });

  it("synchronizes targetEndpointIds on onConnect for transformer to service handle", () => {
    const store = useBackendCanvasStore.getState();

    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      position: { x: 0, y: 0 },
      data: { label: "Payment Service" },
      fractionalIndex: "a0",
    };

    const transformerNode: BackendNode = {
      id: "trans-3",
      type: "transformer",
      position: { x: 300, y: 0 },
      data: {
        label: "parsePayment",
        functionName: "parsePayment",
      },
      fractionalIndex: "a1",
    };

    store.setNodesAndEdges([serviceNode, transformerNode], [], [], [], [], "proj-1");

    // Connect transformer -> endpoint-in-ep-checkout
    useBackendCanvasStore.getState().onConnect({
      source: "trans-3",
      target: "service-1",
      sourceHandle: "transformer-out",
      targetHandle: "endpoint-in-ep-checkout",
    });

    const updatedTrans = useBackendCanvasStore.getState().nodes.find((n) => n.id === "trans-3");
    expect(updatedTrans?.data?.targetServiceId).toBe("service-1");
    expect(updatedTrans?.data?.targetEndpointIds).toEqual(["ep-checkout"]);
    expect(updatedTrans?.data?.targetEndpointId).toBe("ep-checkout");
  });

  it("automatically creates 1 transformer_ref node per service and routes global transformer edges through it", () => {
    const store = useBackendCanvasStore.getState();

    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      position: { x: 500, y: 100 },
      data: { label: "Billing Service" },
      fractionalIndex: "a0",
    };

    const globalTransNode: BackendNode = {
      id: "trans-global-1",
      type: "transformer",
      position: { x: 0, y: 100 },
      data: {
        label: "formatCurrency",
        functionName: "formatCurrency",
        scope: "global",
      },
      fractionalIndex: "a1",
    };

    store.setNodesAndEdges([serviceNode, globalTransNode], [], [], [], [], "proj-1");

    // 1. Connect global transformer directly to endpoint 1 on service-1
    useBackendCanvasStore.getState().onConnect({
      source: "trans-global-1",
      target: "service-1",
      sourceHandle: "transformer-out",
      targetHandle: "endpoint-in-ep-invoice",
    });

    const state1 = useBackendCanvasStore.getState();

    // Verify exactly 1 transformer_ref node was created for service-1
    const refNodes = state1.nodes.filter((n) => n.type === "transformer_ref");
    expect(refNodes).toHaveLength(1);
    const refNode = refNodes[0]!;
    expect(refNode.data?.transformerRef).toBe("trans-global-1");
    expect(refNode.data?.targetServiceId).toBe("service-1");
    expect(refNode.data?.targetEndpointIds).toEqual(["ep-invoice"]);

    // Verify edges: 1 transformer-reference edge (master -> ref) and 1 connection edge (ref -> service endpoint)
    expect(state1.edges).toHaveLength(2);
    const refLinkEdge = state1.edges.find((e) => e.type === "transformer-reference");
    expect(refLinkEdge).toBeDefined();
    expect(refLinkEdge?.source).toBe("trans-global-1");
    expect(refLinkEdge?.target).toBe(refNode.id);

    const connEdge1 = state1.edges.find((e) => e.type === "connection");
    expect(connEdge1).toBeDefined();
    expect(connEdge1?.source).toBe(refNode.id);
    expect(connEdge1?.target).toBe("service-1");
    expect(connEdge1?.targetHandle).toBe("endpoint-in-ep-invoice");

    // Verify NO direct edge between trans-global-1 and service-1
    const directEdge = state1.edges.find(
      (e) => e.source === "trans-global-1" && e.target === "service-1",
    );
    expect(directEdge).toBeUndefined();

    // 2. Connect the same global transformer to endpoint 2 on the same service-1
    useBackendCanvasStore.getState().onConnect({
      source: "trans-global-1",
      target: "service-1",
      sourceHandle: "transformer-out",
      targetHandle: "endpoint-in-ep-receipt",
    });

    const state2 = useBackendCanvasStore.getState();

    // Verify still exactly 1 transformer_ref node for service-1 (1 ref per service rule)
    const refNodes2 = state2.nodes.filter((n) => n.type === "transformer_ref");
    expect(refNodes2).toHaveLength(1);
    expect(refNodes2[0]?.id).toBe(refNode.id);
    expect(refNodes2[0]?.data?.targetEndpointIds).toEqual(["ep-invoice", "ep-receipt"]);

    // Verify edges: 1 transformer-reference edge and 2 connection edges (both originating from the same ref node)
    expect(state2.edges).toHaveLength(3);
    const connEdges = state2.edges.filter((e) => e.type === "connection");
    expect(connEdges).toHaveLength(2);
    expect(connEdges.every((e) => e.source === refNode.id)).toBe(true);
    expect(connEdges.map((e) => e.targetHandle)).toContain("endpoint-in-ep-invoice");
    expect(connEdges.map((e) => e.targetHandle)).toContain("endpoint-in-ep-receipt");
  });
  it("automatically creates 1 transformer_ref node per webPage and routes global transformer edges through it", () => {
    const store = useBackendCanvasStore.getState();

    const webPageNode: BackendNode = {
      id: "page-chat",
      type: "webPage",
      position: { x: 800, y: 100 },
      data: {
        label: "/chat/[id]",
        sections: [
          {
            id: "sec-main",
            name: "Main",
            renderMode: "client",
            actions: [
              {
                id: "act-send",
                name: "sendMessage",
                event: "click",
              },
            ],
            stateObjects: [],
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const globalTransNode: BackendNode = {
      id: "trans-chat-id",
      type: "transformer",
      position: { x: 0, y: 100 },
      data: {
        label: "generateChatId",
        functionName: "generateChatId",
        scope: "global",
      },
      fractionalIndex: "a1",
    };

    store.setNodesAndEdges([webPageNode, globalTransNode], [], [], [], [], "proj-1");

    // Connect from WebPage action handle events-act-send to transformer-in on global transformer
    useBackendCanvasStore.getState().onConnect({
      source: "page-chat",
      target: "trans-chat-id",
      sourceHandle: "events-act-send",
      targetHandle: "transformer-in",
    });

    const state1 = useBackendCanvasStore.getState();

    // Verify exactly 1 transformer_ref node was created for page-chat
    const refNodes = state1.nodes.filter((n) => n.type === "transformer_ref");
    expect(refNodes).toHaveLength(1);
    const refNode = refNodes[0]!;
    expect(refNode.data?.transformerRef).toBe("trans-chat-id");
    expect(refNode.data?.targetWebPageId).toBe("page-chat");
    expect(refNode.data?.targetActionIds).toEqual(["act-send"]);

    // Verify edges: 1 transformer-reference edge (master -> ref) and 1 connection edge (webPage -> ref)
    expect(state1.edges).toHaveLength(2);
    const refLinkEdge = state1.edges.find((e) => e.type === "transformer-reference");
    expect(refLinkEdge).toBeDefined();
    expect(refLinkEdge?.source).toBe("trans-chat-id");
    expect(refLinkEdge?.target).toBe(refNode.id);
    expect(refLinkEdge?.sourceHandle).toBe("transformer-out");
    expect(refLinkEdge?.targetHandle).toBe("transformer-in");

    const connEdge1 = state1.edges.find((e) => e.type === "connection");
    expect(connEdge1).toBeDefined();
    expect(connEdge1?.source).toBe(refNode.id);
    expect(connEdge1?.target).toBe("page-chat");
    expect(connEdge1?.sourceHandle).toBe("transformer-out");
    expect(connEdge1?.targetHandle).toBe("event-in-act-send");

    // Verify NO direct cross-canvas edge between trans-chat-id and page-chat
    const directEdge = state1.edges.find(
      (e) =>
        (e.source === "trans-chat-id" && e.target === "page-chat") ||
        (e.source === "page-chat" && e.target === "trans-chat-id"),
    );
    expect(directEdge).toBeUndefined();

    // Verify action has transform step auto-configured with transformerRefNodeId
    const updatedPage = state1.nodes.find((n) => n.id === "page-chat");
    const action = updatedPage?.data?.sections?.[0]?.actions?.[0];
    expect(action?.actionSteps).toBeDefined();
    expect(action?.actionSteps).toHaveLength(1);
    expect(action?.actionSteps?.[0]?.type).toBe("transform");
    expect(action?.actionSteps?.[0]?.transformerNodeId).toBe("trans-chat-id");
    expect(action?.actionSteps?.[0]?.transformerRefNodeId).toBe(refNode.id);
  });
});
