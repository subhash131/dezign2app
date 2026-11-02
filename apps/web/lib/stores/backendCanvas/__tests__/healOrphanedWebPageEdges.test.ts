import { describe, it, expect } from "vitest";
import { healOrphanedWebPageEdges } from "../edge/handlers/healOrphanedWebPageEdges";
import type { BackendNode, BackendEdge } from "@/types/canvas";

describe("healOrphanedWebPageEdges", () => {
  const webPageNode: BackendNode = {
    id: "page-1",
    type: "webPage",
    position: { x: 0, y: 0 },
    data: {
      label: "/chat",
      sections: [
        {
          id: "sec-main",
          name: "Main",
          stateObjects: [
            {
              id: "st-valid",
              name: "messages",
              type: "ChatMessage[]",
            },
          ],
          actions: [
            {
              id: "act-valid",
              name: "send",
              event: "click",
            },
          ],
        },
      ],
    },
  };

  const storeNode: BackendNode = {
    id: "store-1",
    type: "state_store",
    position: { x: -300, y: 0 },
    data: {
      label: "ChatStore",
      fields: [
        {
          id: "f-valid",
          name: "messages",
          type: "ChatMessage[]",
        },
      ],
    },
  };

  const typesNode: BackendNode = {
    id: "types-1",
    type: "types",
    position: { x: -300, y: 200 },
    data: {
      types: [{ id: "type-msg", name: "ChatMessage" }],
    },
  };

  it("prunes orphaned section-state-in edges when the stateObject was removed", () => {
    const validStoreEdge: BackendEdge = {
      id: "edge-valid-store",
      source: "store-1",
      target: "page-1",
      sourceHandle: "store-field-out-f-valid",
      targetHandle: "section-state-in-sec-main-st-valid",
    };

    const orphanedStoreEdge: BackendEdge = {
      id: "edge-orphaned-store",
      source: "store-1",
      target: "page-1",
      sourceHandle: "store-field-out-f-valid",
      targetHandle: "section-state-in-sec-main-st-deleted",
    };

    const orphanedTypeEdge: BackendEdge = {
      id: "edge-orphaned-type",
      source: "types-1",
      target: "page-1",
      sourceHandle: "type-out-type-msg",
      targetHandle: "section-state-in-sec-main-st-deleted",
    };

    const result = healOrphanedWebPageEdges({
      nodes: [webPageNode, storeNode, typesNode],
      edges: [validStoreEdge, orphanedStoreEdge, orphanedTypeEdge],
    });

    expect(result.changed).toBe(true);
    expect(result.edges.map((e) => e.id)).toEqual(["edge-valid-store"]);
    expect(result.pendingEdgeRemovals).toContain("edge-orphaned-store");
    expect(result.pendingEdgeRemovals).toContain("edge-orphaned-type");
  });

  it("prunes orphaned store-field-in and store-field-out edges when store field was removed", () => {
    const validStoreInEdge: BackendEdge = {
      id: "edge-valid-store-in",
      source: "types-1",
      target: "store-1",
      sourceHandle: "type-out-type-msg",
      targetHandle: "store-field-in-f-valid",
    };

    const orphanedStoreInEdge1: BackendEdge = {
      id: "edge-orphaned-store-in-1",
      source: "types-1",
      target: "store-1",
      sourceHandle: "type-out-type-msg",
      targetHandle: "store-field-in-f-1793085647114",
    };

    const orphanedStoreInEdge2: BackendEdge = {
      id: "edge-orphaned-store-in-2",
      source: "types-1",
      target: "store-1",
      sourceHandle: "type-out-type-msg",
      targetHandle: "store-field-in-f-1793085695538",
    };

    const orphanedStoreOutEdge: BackendEdge = {
      id: "edge-orphaned-store-out",
      source: "store-1",
      target: "page-1",
      sourceHandle: "store-field-out-f-deleted",
      targetHandle: "section-state-in-sec-main-st-valid",
    };

    const result = healOrphanedWebPageEdges({
      nodes: [webPageNode, storeNode, typesNode],
      edges: [
        validStoreInEdge,
        orphanedStoreInEdge1,
        orphanedStoreInEdge2,
        orphanedStoreOutEdge,
      ],
    });

    expect(result.changed).toBe(true);
    expect(result.edges.map((e) => e.id)).toEqual(["edge-valid-store-in"]);
    expect(result.pendingEdgeRemovals).toContain("edge-orphaned-store-in-1");
    expect(result.pendingEdgeRemovals).toContain("edge-orphaned-store-in-2");
    expect(result.pendingEdgeRemovals).toContain("edge-orphaned-store-out");
  });

  it("prunes orphaned action inbound and outbound edges when action was deleted", () => {
    const serviceNode: BackendNode = {
      id: "service-1",
      type: "service",
      position: { x: 500, y: 0 },
      data: { label: "ChatService" },
    };

    const validActionEdge: BackendEdge = {
      id: "e-valid-action",
      source: "page-1",
      target: "service-1",
      sourceHandle: "events-act-valid",
      targetHandle: "endpoint-in-1",
    };

    const orphanedOutboundEdge: BackendEdge = {
      id: "e-orphaned-out",
      source: "page-1",
      target: "service-1",
      sourceHandle: "events-act-deleted",
      targetHandle: "endpoint-in-1",
    };

    const orphanedInboundEdge: BackendEdge = {
      id: "e-orphaned-in",
      source: "service-1",
      target: "page-1",
      sourceHandle: "events-out-1",
      targetHandle: "pageload-in-act-deleted",
    };

    const result = healOrphanedWebPageEdges({
      nodes: [webPageNode, serviceNode],
      edges: [validActionEdge, orphanedOutboundEdge, orphanedInboundEdge],
    });

    expect(result.changed).toBe(true);
    expect(result.edges.map((e) => e.id)).toEqual(["e-valid-action"]);
    expect(result.pendingEdgeRemovals).toContain("e-orphaned-out");
    expect(result.pendingEdgeRemovals).toContain("e-orphaned-in");
  });

  it("returns changed: false when all edges are valid", () => {
    const validEdge: BackendEdge = {
      id: "edge-valid",
      source: "store-1",
      target: "page-1",
      sourceHandle: "store-field-out-f-valid",
      targetHandle: "section-state-in-sec-main-st-valid",
    };

    const result = healOrphanedWebPageEdges({
      nodes: [webPageNode, storeNode],
      edges: [validEdge],
    });

    expect(result.changed).toBe(false);
    expect(result.edges).toHaveLength(1);
    expect(result.pendingEdgeRemovals).toHaveLength(0);
  });
});
