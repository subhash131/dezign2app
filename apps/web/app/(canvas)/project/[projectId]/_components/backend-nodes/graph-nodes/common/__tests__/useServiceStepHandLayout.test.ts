import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  buildServiceStepHandMap,
  sortServiceStepNodes,
  SERVICE_STEP_NODE_TYPES,
} from "../useServiceStepHandLayout";

describe("buildServiceStepHandMap", () => {
  it("includes langgraph in SERVICE_STEP_NODE_TYPES", () => {
    expect(SERVICE_STEP_NODE_TYPES.has("langgraph")).toBe(true);
  });

  it("builds stacked hand information for multiple LangGraph nodes connected to a service node", () => {
    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      position: { x: 500, y: 200 },
      fractionalIndex: "a0",
      data: {
        label: "Chat Service",
        endpoints: [
          {
            id: "ep-chat",
            name: "/chat",
            type: "POST",
          },
        ],
      },
    };

    const lgNode1: BackendNode = {
      id: "lg-1",
      type: "langgraph",
      position: { x: 100, y: 200 },
      fractionalIndex: "a1",
      data: { label: "Chat Agent" },
    };

    const lgNode2: BackendNode = {
      id: "lg-2",
      type: "langgraph",
      position: { x: 92, y: 244 },
      fractionalIndex: "a2",
      data: { label: "Research Agent" },
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-1",
        source: lgNode1.id,
        target: serviceNode.id,
        sourceHandle: "langgraph-out",
        targetHandle: "endpoint-in-ep-chat",
        type: "connection",
      },
      {
        id: "edge-2",
        source: lgNode2.id,
        target: serviceNode.id,
        sourceHandle: "langgraph-out",
        targetHandle: "endpoint-in-ep-chat",
        type: "connection",
      },
    ];

    const nodes = [serviceNode, lgNode1, lgNode2];
    const handMap = buildServiceStepHandMap(nodes, edges);

    expect(handMap.size).toBe(2);

    const hand1 = handMap.get("lg-1");
    const hand2 = handMap.get("lg-2");

    expect(hand1).toBeDefined();
    expect(hand2).toBeDefined();

    expect(hand1?.isStacked).toBe(true);
    expect(hand2?.isStacked).toBe(true);

    expect(hand1?.totalCards).toBe(2);
    expect(hand2?.totalCards).toBe(2);

    // lg-1 ("Chat Agent") should be cardIndex 0, lg-2 ("Research Agent") should be cardIndex 1
    expect(hand1?.cardIndex).toBe(0);
    expect(hand2?.cardIndex).toBe(1);
  });

  it("marks isStacked as false when the endpoint stack is expanded in service node data", () => {
    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      position: { x: 500, y: 200 },
      fractionalIndex: "a0",
      data: {
        label: "Chat Service",
        expandedStepStacks: ["ep-chat"],
      },
    };

    const lgNode1: BackendNode = {
      id: "lg-1",
      type: "langgraph",
      position: { x: 100, y: 200 },
      fractionalIndex: "a1",
      data: { label: "Agent 1" },
    };

    const lgNode2: BackendNode = {
      id: "lg-2",
      type: "langgraph",
      position: { x: 100, y: 560 },
      fractionalIndex: "a2",
      data: { label: "Agent 2" },
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-1",
        source: lgNode1.id,
        target: serviceNode.id,
        sourceHandle: "langgraph-out",
        targetHandle: "endpoint-in-ep-chat",
        type: "connection",
      },
      {
        id: "edge-2",
        source: lgNode2.id,
        target: serviceNode.id,
        sourceHandle: "langgraph-out",
        targetHandle: "endpoint-in-ep-chat",
        type: "connection",
      },
    ];

    const handMap = buildServiceStepHandMap([serviceNode, lgNode1, lgNode2], edges);
    expect(handMap.get("lg-1")?.isStacked).toBe(false);
    expect(handMap.get("lg-2")?.isStacked).toBe(false);
  });
});
