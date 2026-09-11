import { describe, it, expect, beforeEach } from "vitest";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { ensurePageRefConnection, cleanupPageRefConnection } from "../utils";
import { PipelineStepDraft } from "../types";

describe("pipeline-step-editor: PageRefNode and Edge Synchronization", () => {
  const serviceNodeId = "service-test-1";
  const endpointId = "ep-test-push";
  const consumedEventId = "consumer-test-push";
  const webPageId = "webpage-dashboard";
  const otherWebPageId = "webpage-profile";

  beforeEach(() => {
    useBackendCanvasStore.setState({
      nodes: [
        {
          id: serviceNodeId,
          type: "service",
          position: { x: 100, y: 100 },
          fractionalIndex: "a0",
          data: { label: "Order Service" },
        },
        {
          id: webPageId,
          type: "webPage",
          position: { x: 600, y: 100 },
          fractionalIndex: "a1",
          data: { label: "/dashboard", isRoot: false },
        },
        {
          id: otherWebPageId,
          type: "webPage",
          position: { x: 600, y: 300 },
          fractionalIndex: "a2",
          data: { label: "/profile", isRoot: false },
        },
      ],
      edges: [],
      endpoints: [
        {
          id: endpointId,
          nodeId: serviceNodeId,
          name: "Push Notifications",
          type: "POST",
          pipelineSteps: [],
        },
      ],
      events: [
        {
          id: consumedEventId,
          nodeId: serviceNodeId,
          name: "Order Updated Consumer",
          type: "consume",
          pipelineSteps: [],
        },
      ],
    });
  });

  it("creates a page_ref node and connects an edge from endpoint-out to page-ref-in", () => {
    const result = ensurePageRefConnection({
      targetPageId: webPageId,
      serviceNodeId,
      endpointId,
    });

    expect(result).toBeDefined();
    expect(result?.pageRefNodeId).toBeDefined();
    expect(result?.targetPageId).toBe(webPageId);

    const state = useBackendCanvasStore.getState();
    const createdPageRefNode = state.nodes.find((n) => n.id === result!.pageRefNodeId);
    expect(createdPageRefNode).toBeDefined();
    expect(createdPageRefNode?.type).toBe("page_ref");
    expect(createdPageRefNode?.data?.targetPageId).toBe(webPageId);
    expect(createdPageRefNode?.data?.label).toBe("Ref: /dashboard");

    const edge = state.edges.find(
      (e) =>
        e.source === serviceNodeId &&
        e.target === result!.pageRefNodeId &&
        e.sourceHandle === `endpoint-out-${endpointId}` &&
        e.targetHandle === "page-ref-in",
    );
    expect(edge).toBeDefined();
    expect(edge?.type).toBe("connection");
  });

  it("connects an edge from consumedEvents-out for consumed events", () => {
    const result = ensurePageRefConnection({
      targetPageId: webPageId,
      serviceNodeId,
      consumedEventId,
    });

    expect(result).toBeDefined();

    const state = useBackendCanvasStore.getState();
    const edge = state.edges.find(
      (e) =>
        e.source === serviceNodeId &&
        e.target === result!.pageRefNodeId &&
        e.sourceHandle === `consumedEvents-out-${consumedEventId}` &&
        e.targetHandle === "page-ref-in",
    );
    expect(edge).toBeDefined();
    expect(edge?.type).toBe("connection");
  });

  it("reuses existing page_ref node and updates its target page if changed", () => {
    const firstResult = ensurePageRefConnection({
      targetPageId: webPageId,
      serviceNodeId,
      endpointId,
    });

    expect(firstResult).toBeDefined();
    const pageRefId = firstResult!.pageRefNodeId;

    // Update target page to otherWebPageId
    const updatedResult = ensurePageRefConnection({
      targetPageId: otherWebPageId,
      pageRefNodeId: pageRefId,
      serviceNodeId,
      endpointId,
    });

    expect(updatedResult?.pageRefNodeId).toBe(pageRefId);
    expect(updatedResult?.targetPageId).toBe(otherWebPageId);

    const state = useBackendCanvasStore.getState();
    const pageRefNode = state.nodes.find((n) => n.id === pageRefId);
    expect(pageRefNode?.data?.targetPageId).toBe(otherWebPageId);
    expect(pageRefNode?.data?.label).toBe("Ref: /profile");

    // Only 1 edge should exist
    const edges = state.edges.filter(
      (e) => e.source === serviceNodeId && e.target === pageRefId,
    );
    expect(edges.length).toBe(1);
  });

  it("cleans up the edge and cascades orphaned page_ref node upon step deletion", () => {
    const result = ensurePageRefConnection({
      targetPageId: webPageId,
      serviceNodeId,
      endpointId,
    });

    const pageRefId = result!.pageRefNodeId;

    cleanupPageRefConnection({
      pageRefNodeId: pageRefId,
      serviceNodeId,
      endpointId,
      remainingSteps: [], // No remaining push_to_client steps
    });

    const state = useBackendCanvasStore.getState();
    // Edge should be removed
    const edge = state.edges.find(
      (e) => e.source === serviceNodeId && e.target === pageRefId,
    );
    expect(edge).toBeUndefined();

    // Orphaned page_ref node should be deleted
    const pageRefNode = state.nodes.find((n) => n.id === pageRefId);
    expect(pageRefNode).toBeUndefined();
  });

  it("does not delete page_ref node if another service still connects to it", () => {
    const otherServiceId = "service-test-2";
    useBackendCanvasStore.getState().addNode({
      id: otherServiceId,
      type: "service",
      position: { x: 100, y: 300 },
      data: { label: "Notification Service" },
    });

    const result = ensurePageRefConnection({
      targetPageId: webPageId,
      serviceNodeId,
      endpointId,
    });

    const pageRefId = result!.pageRefNodeId;

    // Connect second edge from other service
    useBackendCanvasStore.getState().addEdge({
      id: "edge-other-service",
      source: otherServiceId,
      target: pageRefId,
      sourceHandle: `endpoint-out-other`,
      targetHandle: "page-ref-in",
      type: "connection",
    });

    // Cleanup first service connection
    cleanupPageRefConnection({
      pageRefNodeId: pageRefId,
      serviceNodeId,
      endpointId,
      remainingSteps: [],
    });

    const state = useBackendCanvasStore.getState();
    // First edge is gone
    const edge = state.edges.find(
      (e) => e.source === serviceNodeId && e.target === pageRefId,
    );
    expect(edge).toBeUndefined();

    // Node is NOT deleted because second edge still points to it
    const pageRefNode = state.nodes.find((n) => n.id === pageRefId);
    expect(pageRefNode).toBeDefined();
  });
});
