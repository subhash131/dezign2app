import { describe, it, expect, beforeEach } from "vitest";
import { useBackendCanvasStore } from "../../backendCanvasStore";
import { healDirectTransformerEdges } from "../edge/handlers/transformerConnect";
import type { BackendNode, BackendEdge } from "@/types/canvas";

describe("healDirectTransformerEdges", () => {
  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [],
      edges: [],
      pendingNodeUpserts: [],
      pendingNodeRemovals: [],
      pendingEdgeUpserts: [],
      pendingEdgeRemovals: [],
    });
  });

  it("heals direct edge between WebPage and global Transformer, creating transformer_ref and wiring correctly", () => {
    const webPageNode: BackendNode = {
      id: "page-chat",
      type: "webPage",
      position: { x: 1200, y: 300 },
      data: {
        label: "/chat/[id]",
        path: "/chat/[id]",
        sections: [
          {
            id: "sec-1",
            name: "Main Section",
            actions: [
              {
                id: "sendMessage",
                name: "sendMessage",
                event: "click",
                actionSteps: [],
              },
            ],
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const globalTransNode: BackendNode = {
      id: "trans-chat-id",
      type: "transformer",
      position: { x: 100, y: 100 },
      data: {
        label: "generateChatId",
        functionName: "generateChatId",
        scope: "global",
      },
      fractionalIndex: "a1",
    };

    // Pre-existing direct edge across canvas (what user currently has)
    const existingDirectEdge: BackendEdge = {
      id: "old-direct-edge",
      source: "page-chat",
      target: "trans-chat-id",
      sourceHandle: "events-sendMessage",
      targetHandle: "transformer-in",
      type: "connection",
      fractionalIndex: "a2",
    };

    const result = healDirectTransformerEdges({
      nodes: [webPageNode, globalTransNode],
      edges: [existingDirectEdge],
      pendingEdgeRemovals: [],
      pendingEdgeUpserts: [],
      pendingNodeUpserts: [],
    });

    expect(result.changed).toBe(true);

    // Direct edge must be removed from edges and added to pendingEdgeRemovals
    expect(result.edges.some((e) => e.id === "old-direct-edge")).toBe(false);
    expect(result.pendingEdgeRemovals).toContain("old-direct-edge");

    // A transformer_ref node must be created
    const refNode = result.nodes.find((n) => n.type === "transformer_ref");
    expect(refNode).toBeDefined();
    expect(refNode?.data?.transformerRef).toBe("trans-chat-id");
    expect(refNode?.data?.targetWebPageId).toBe("page-chat");
    expect(refNode?.data?.targetActionIds).toContain("sendMessage");
    // Positioned to the left of the webPage (1200 - 300 = 900)
    expect(refNode?.position.x).toBe(900);

    // Reference edge: trans-chat-id -> refNode
    const refEdge = result.edges.find((e) => e.type === "transformer-reference");
    expect(refEdge).toBeDefined();
    expect(refEdge?.source).toBe("trans-chat-id");
    expect(refEdge?.target).toBe(refNode?.id);
    expect(refEdge?.sourceHandle).toBe("transformer-out");
    expect(refEdge?.targetHandle).toBe("transformer-in");

    // Connection edge: refNode (transformer-out) -> page-chat (event-in-sendMessage)
    const connEdge = result.edges.find((e) => e.type === "connection");
    expect(connEdge).toBeDefined();
    expect(connEdge?.source).toBe(refNode?.id);
    expect(connEdge?.target).toBe("page-chat");
    expect(connEdge?.sourceHandle).toBe("transformer-out");
    expect(connEdge?.targetHandle).toBe("event-in-sendMessage");

    // WebPage action step must be updated
    const updatedPage = result.nodes.find((n) => n.id === "page-chat");
    const action = updatedPage?.data?.sections?.[0]?.actions?.[0];
    expect(action?.actionSteps).toHaveLength(1);
    expect(action?.actionSteps?.[0]?.type).toBe("transform");
    expect(action?.actionSteps?.[0]?.transformerNodeId).toBe("trans-chat-id");
    expect(action?.actionSteps?.[0]?.transformerRefNodeId).toBe(refNode?.id);
  });

  it("heals inverted edge from WebPage to transformer_ref, rewiring from right side of ref to left side handle of WebPage", () => {
    const webPageNode: BackendNode = {
      id: "page-chat",
      type: "webPage",
      position: { x: 1200, y: 300 },
      data: {
        label: "/chat/[id]",
        path: "/chat/[id]",
        sections: [
          {
            id: "sec-1",
            name: "Main Section",
            actions: [
              {
                id: "sendMessage",
                name: "sendMessage",
                event: "click",
                actionSteps: [
                  {
                    id: "step-1",
                    order: 1,
                    type: "transform",
                    transformerNodeId: "trans-chat-id",
                    transformerRefNodeId: "ref-node-1",
                    edgeId: "inverted-edge-1",
                  },
                ],
              },
            ],
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const refNode: BackendNode = {
      id: "ref-node-1",
      type: "transformer_ref",
      position: { x: 900, y: 340 },
      data: {
        label: "generateChatId (Ref)",
        transformerRef: "trans-chat-id",
        targetWebPageId: "page-chat",
        targetActionId: "sendMessage",
        targetActionIds: ["sendMessage"],
      },
      fractionalIndex: "a1",
    };

    // Inverted edge where WebPage (right handle events-sendMessage) connects to left handle (transformer-in) of ref node
    const invertedEdge: BackendEdge = {
      id: "inverted-edge-1",
      source: "page-chat",
      target: "ref-node-1",
      sourceHandle: "events-sendMessage",
      targetHandle: "transformer-in",
      type: "connection",
      fractionalIndex: "a2",
    };

    const result = healDirectTransformerEdges({
      nodes: [webPageNode, refNode],
      edges: [invertedEdge],
      pendingEdgeRemovals: [],
      pendingEdgeUpserts: [],
      pendingNodeUpserts: [],
    });

    expect(result.changed).toBe(true);

    // Inverted edge removed
    expect(result.edges.some((e) => e.id === "inverted-edge-1")).toBe(false);
    expect(result.pendingEdgeRemovals).toContain("inverted-edge-1");

    // Correct edge wired: refNode (transformer-out, right) -> page-chat (event-in-sendMessage, left)
    const connEdge = result.edges.find((e) => e.type === "connection");
    expect(connEdge).toBeDefined();
    expect(connEdge?.source).toBe("ref-node-1");
    expect(connEdge?.target).toBe("page-chat");
    expect(connEdge?.sourceHandle).toBe("transformer-out");
    expect(connEdge?.targetHandle).toBe("event-in-sendMessage");

    // WebPage action step updated with new edgeId
    const updatedPage = result.nodes.find((n) => n.id === "page-chat");
    const step = updatedPage?.data?.sections?.[0]?.actions?.[0]?.actionSteps?.[0];
    expect(step?.edgeId).toBe(connEdge?.id);
  });
  it("heals unconnected transformer_ref node by creating outgoing connection edge to target WebPage action and syncing action step", () => {
    const webPageNode: BackendNode = {
      id: "page-chat",
      type: "webPage",
      position: { x: 1200, y: 300 },
      data: {
        label: "/chat/[id]",
        path: "/chat/[id]",
        sections: [
          {
            id: "sec-1",
            name: "Main Section",
            actions: [
              {
                id: "sendMessage",
                name: "sendMessage",
                event: "click",
                actionSteps: [],
              },
            ],
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const globalTransNode: BackendNode = {
      id: "trans-chat-id",
      type: "transformer",
      position: { x: 100, y: 100 },
      data: {
        label: "generateChatId",
        functionName: "generateChatId",
        scope: "global",
      },
      fractionalIndex: "a1",
    };

    const refNode: BackendNode = {
      id: "ref-chat-id",
      type: "transformer_ref",
      position: { x: 900, y: 340 },
      data: {
        label: "generateChatId (Ref)",
        transformerRef: "trans-chat-id",
        targetWebPageId: "page-chat",
        targetActionId: "sendMessage",
        targetActionIds: ["sendMessage"],
      },
      fractionalIndex: "a2",
    };

    // Reference edge exists from global transformer to ref node, but NO outgoing connection edge to WebPage
    const refLinkEdge: BackendEdge = {
      id: "edge-ref-link-trans-chat-id-ref-chat-id",
      source: "trans-chat-id",
      target: "ref-chat-id",
      sourceHandle: "transformer-out",
      targetHandle: "transformer-in",
      type: "transformer-reference",
      fractionalIndex: "a3",
    };

    const result = healDirectTransformerEdges({
      nodes: [webPageNode, globalTransNode, refNode],
      edges: [refLinkEdge],
      pendingEdgeRemovals: [],
      pendingEdgeUpserts: [],
      pendingNodeUpserts: [],
    });

    expect(result.changed).toBe(true);

    // Connection edge must be created: refNode (transformer-out, right) -> page-chat (event-in-sendMessage, left)
    const connEdge = result.edges.find((e) => e.type === "connection");
    expect(connEdge).toBeDefined();
    expect(connEdge?.source).toBe("ref-chat-id");
    expect(connEdge?.target).toBe("page-chat");
    expect(connEdge?.sourceHandle).toBe("transformer-out");
    expect(connEdge?.targetHandle).toBe("event-in-sendMessage");
    expect(result.pendingEdgeUpserts).toContainEqual(connEdge);

    // WebPage action step must be updated
    const updatedPage = result.nodes.find((n) => n.id === "page-chat");
    const action = updatedPage?.data?.sections?.[0]?.actions?.[0];
    expect(action?.actionSteps).toHaveLength(1);
    expect(action?.actionSteps?.[0]?.type).toBe("transform");
    expect(action?.actionSteps?.[0]?.transformerNodeId).toBe("trans-chat-id");
    expect(action?.actionSteps?.[0]?.transformerRefNodeId).toBe("ref-chat-id");
    expect(action?.actionSteps?.[0]?.edgeId).toBe(connEdge?.id);
  });

  it("heals unconnected transformer_ref node without targetActionId by resolving WebPage and action", () => {
    const webPageNode: BackendNode = {
      id: "page-chat",
      type: "webPage",
      position: { x: 1200, y: 300 },
      data: {
        label: "/chat/[id]",
        path: "/chat/[id]",
        sections: [
          {
            id: "sec-1",
            name: "Main Section",
            actions: [
              {
                id: "pageLoad",
                name: "pageLoad",
                event: "pageLoad",
                actionSteps: [],
              },
              {
                id: "sendMessage",
                name: "sendMessage",
                event: "click",
                actionSteps: [],
              },
            ],
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const globalTransNode: BackendNode = {
      id: "trans-chat-id",
      type: "transformer",
      position: { x: 100, y: 100 },
      data: {
        label: "generateChatId",
        functionName: "generateChatId",
        scope: "global",
      },
      fractionalIndex: "a1",
    };

    // ref node without targetActionId or targetActionIds
    const refNode: BackendNode = {
      id: "ref-chat-id",
      type: "transformer_ref",
      position: { x: 900, y: 340 },
      data: {
        label: "generateChatId (Ref)",
        transformerRef: "trans-chat-id",
        targetWebPageId: "page-chat",
      },
      fractionalIndex: "a2",
    };

    const result = healDirectTransformerEdges({
      nodes: [webPageNode, globalTransNode, refNode],
      edges: [],
      pendingEdgeRemovals: [],
      pendingEdgeUpserts: [],
      pendingNodeUpserts: [],
    });

    expect(result.changed).toBe(true);

    // Both reference edge and connection edge must be created
    const refEdge = result.edges.find((e) => e.type === "transformer-reference");
    expect(refEdge).toBeDefined();
    expect(refEdge?.source).toBe("trans-chat-id");
    expect(refEdge?.target).toBe("ref-chat-id");

    const connEdge = result.edges.find((e) => e.type === "connection");
    expect(connEdge).toBeDefined();
    expect(connEdge?.source).toBe("ref-chat-id");
    expect(connEdge?.target).toBe("page-chat");
    expect(connEdge?.sourceHandle).toBe("transformer-out");
    expect(connEdge?.targetHandle).toBe("event-in-sendMessage");
  });
  it("heals direct edge from a second transformer to another action without hijacking existing transformer_ref", () => {
    const webPageNode: BackendNode = {
      id: "page-chat",
      type: "webPage",
      position: { x: 1200, y: 300 },
      data: {
        label: "/chat",
        path: "/chat",
        sections: [
          {
            id: "sec-1",
            name: "Main Section",
            actions: [
              {
                id: "act-send",
                name: "sendMessage",
                event: "click",
                actionSteps: [
                  {
                    id: "step-1",
                    order: 1,
                    type: "transform",
                    transformerNodeId: "trans-format",
                    transformerRefNodeId: "ref-format",
                    transformerName: "formatMessage",
                    edgeId: "edge-conn-format",
                  },
                ],
              },
              {
                id: "act-validate",
                name: "validateInput",
                event: "change",
                actionSteps: [],
              },
            ],
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const trans1: BackendNode = {
      id: "trans-format",
      type: "transformer",
      position: { x: 100, y: 100 },
      data: {
        label: "formatMessage",
        functionName: "formatMessage",
        scope: "global",
      },
      fractionalIndex: "a1",
    };

    const ref1: BackendNode = {
      id: "ref-format",
      type: "transformer_ref",
      position: { x: 900, y: 340 },
      data: {
        label: "formatMessage (Ref)",
        transformerRef: "trans-format",
        targetWebPageId: "page-chat",
        targetActionId: "act-send",
        targetActionIds: ["act-send"],
      },
      fractionalIndex: "a2",
    };

    const trans2: BackendNode = {
      id: "trans-validate",
      type: "transformer",
      position: { x: 100, y: 300 },
      data: {
        label: "validateInput",
        functionName: "validateInput",
        scope: "global",
      },
      fractionalIndex: "a3",
    };

    // Existing ref edge & conn edge for trans1
    const refLink1: BackendEdge = {
      id: "edge-ref-link-trans1",
      source: "trans-format",
      target: "ref-format",
      sourceHandle: "transformer-out",
      targetHandle: "transformer-in",
      type: "transformer-reference",
      fractionalIndex: "a4",
    };
    const connLink1: BackendEdge = {
      id: "edge-conn-format",
      source: "ref-format",
      target: "page-chat",
      sourceHandle: "transformer-out",
      targetHandle: "event-in-act-send",
      type: "connection",
      fractionalIndex: "a5",
    };

    // New direct edge from trans2 to act-validate on page-chat
    const directEdge2: BackendEdge = {
      id: "direct-edge-trans2",
      source: "trans-validate",
      target: "page-chat",
      sourceHandle: "transformer-out",
      targetHandle: "event-in-act-validate",
      type: "connection",
      fractionalIndex: "a6",
    };

    const result = healDirectTransformerEdges({
      nodes: [webPageNode, trans1, ref1, trans2],
      edges: [refLink1, connLink1, directEdge2],
      pendingEdgeRemovals: [],
      pendingEdgeUpserts: [],
      pendingNodeUpserts: [],
    });

    expect(result.changed).toBe(true);

    // Direct edge 2 must be removed
    expect(result.edges.some((e) => e.id === "direct-edge-trans2")).toBe(false);
    expect(result.pendingEdgeRemovals).toContain("direct-edge-trans2");

    // Existing ref1 must NOT be mutated or hijacked
    const existingRef = result.nodes.find((n) => n.id === "ref-format");
    expect(existingRef?.data?.transformerRef).toBe("trans-format");
    expect(existingRef?.data?.targetActionIds).toEqual(["act-send"]);

    // A NEW transformer_ref node must be created for trans-validate
    const ref2 = result.nodes.find(
      (n) => n.type === "transformer_ref" && n.id !== "ref-format",
    );
    expect(ref2).toBeDefined();
    expect(ref2?.data?.transformerRef).toBe("trans-validate");
    expect(ref2?.data?.targetWebPageId).toBe("page-chat");
    expect(ref2?.data?.targetActionIds).toContain("act-validate");
    // New ref node is positioned with vertical offset
    expect(ref2?.position.y).toBeGreaterThan(ref1.position.y);

    // Reference edge: trans-validate -> ref2
    const refEdge2 = result.edges.find(
      (e) => e.type === "transformer-reference" && e.source === "trans-validate",
    );
    expect(refEdge2).toBeDefined();
    expect(refEdge2?.target).toBe(ref2?.id);

    // Connection edge: ref2 -> page-chat (event-in-act-validate)
    const connEdge2 = result.edges.find(
      (e) => e.type === "connection" && e.source === ref2?.id,
    );
    expect(connEdge2).toBeDefined();
    expect(connEdge2?.target).toBe("page-chat");
    expect(connEdge2?.targetHandle).toBe("event-in-act-validate");

    // WebPage actions must both have their respective transform steps
    const updatedPage = result.nodes.find((n) => n.id === "page-chat");
    const actions = updatedPage?.data?.sections?.[0]?.actions;
    const actSend = actions?.find((a: any) => a.id === "act-send");
    const actValidate = actions?.find((a: any) => a.id === "act-validate");

    expect(actSend?.actionSteps?.[0]?.transformerNodeId).toBe("trans-format");
    expect(actSend?.actionSteps?.[0]?.transformerRefNodeId).toBe("ref-format");

    expect(actValidate?.actionSteps?.[0]?.transformerNodeId).toBe("trans-validate");
    expect(actValidate?.actionSteps?.[0]?.transformerRefNodeId).toBe(ref2?.id);
  });

  it("is strictly idempotent on already healed multi-transformer / multi-action setup", () => {
    const webPageNode: BackendNode = {
      id: "page-chat",
      type: "webPage",
      position: { x: 1200, y: 300 },
      fractionalIndex: "a0",
      data: {
        label: "/chat",
        path: "/chat",
        sections: [
          {
            id: "sec-1",
            name: "Main Section",
            actions: [
              { id: "act-1", name: "act1", event: "click", actionSteps: [] },
              { id: "act-2", name: "act2", event: "click", actionSteps: [] },
            ],
          },
        ],
      },
    };

    const trans1: BackendNode = {
      id: "trans-1",
      type: "transformer",
      position: { x: 100, y: 100 },
      fractionalIndex: "a1",
      data: { label: "T1", functionName: "t1", scope: "global" },
    };

    const ref1: BackendNode = {
      id: "ref-1",
      type: "transformer_ref",
      position: { x: 900, y: 340 },
      fractionalIndex: "a2",
      data: {
        label: "T1 (Ref)",
        transformerRef: "trans-1",
        targetWebPageId: "page-chat",
        targetActionIds: ["act-1"],
      },
    };

    const trans2: BackendNode = {
      id: "trans-2",
      type: "transformer",
      position: { x: 100, y: 300 },
      fractionalIndex: "a3",
      data: { label: "T2", functionName: "t2", scope: "global" },
    };

    const ref2: BackendNode = {
      id: "ref-2",
      type: "transformer_ref",
      position: { x: 900, y: 420 },
      fractionalIndex: "a4",
      data: {
        label: "T2 (Ref)",
        transformerRef: "trans-2",
        targetWebPageId: "page-chat",
        targetActionIds: ["act-2"],
      },
    };

    const refEdge1: BackendEdge = {
      id: "e-ref-1",
      source: "trans-1",
      target: "ref-1",
      sourceHandle: "transformer-out",
      targetHandle: "transformer-in",
      type: "transformer-reference",
      fractionalIndex: "a5",
    };
    const connEdge1: BackendEdge = {
      id: "e-conn-1",
      source: "ref-1",
      target: "page-chat",
      sourceHandle: "transformer-out",
      targetHandle: "event-in-act-1",
      type: "connection",
      fractionalIndex: "a6",
    };

    const refEdge2: BackendEdge = {
      id: "e-ref-2",
      source: "trans-2",
      target: "ref-2",
      sourceHandle: "transformer-out",
      targetHandle: "transformer-in",
      type: "transformer-reference",
      fractionalIndex: "a7",
    };
    const connEdge2: BackendEdge = {
      id: "e-conn-2",
      source: "ref-2",
      target: "page-chat",
      sourceHandle: "transformer-out",
      targetHandle: "event-in-act-2",
      type: "connection",
      fractionalIndex: "a8",
    };

    const result = healDirectTransformerEdges({
      nodes: [webPageNode, trans1, ref1, trans2, ref2],
      edges: [refEdge1, connEdge1, refEdge2, connEdge2],
      pendingEdgeRemovals: [],
      pendingEdgeUpserts: [],
      pendingNodeUpserts: [],
    });

    // Must NOT mutate state if already healthy
    expect(result.changed).toBe(false);
  });
});
