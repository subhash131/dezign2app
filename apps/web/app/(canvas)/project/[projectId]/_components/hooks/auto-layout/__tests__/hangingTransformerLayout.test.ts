import { describe, it, expect, vi } from "vitest";
import { performGraphLayout } from "../graphLayout";
import { layoutHangingTransformerNodes } from "../hangingTransformerLayout";
import type { LayoutNode, LayoutEdge, PositionNodeChange } from "../types";

describe("hangingTransformerLayout - Auto-Layout for Hanging Transformers", () => {
  it("positions a local transformer in a dedicated column right before the service node it is connected to", () => {
    const nodes: LayoutNode[] = [
      {
        id: "web-app-1",
        type: "webApp",
        position: { x: 0, y: 0 },
        data: { label: "Web App" },
      },
      {
        id: "web-page-1",
        type: "webPage",
        position: { x: 0, y: 0 },
        data: { label: "Web Page" },
      },
      {
        id: "trans-local-1",
        type: "transformer",
        position: { x: 0, y: 0 },
        data: {
          label: "Data Transformer",
          scope: "local",
          functionName: "transformData",
        },
      },
      {
        id: "service-products",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "products",
          endpoints: [{ id: "ep-test", name: "GET test", type: "rest" }],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-web-page",
        source: "web-app-1",
        target: "web-page-1",
        type: "connection",
      },
      {
        id: "e-page-service",
        source: "web-page-1",
        target: "service-products",
        targetHandle: "endpoint-in-ep-test",
        type: "connection",
      },
      {
        id: "e-trans-service",
        source: "trans-local-1",
        target: "service-products",
        sourceHandle: "transformer-out",
        targetHandle: "endpoint-in-ep-test",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      appliedChanges = changes;
    };

    const fitView = vi.fn();

    performGraphLayout({
      nodes,
      edges,
      onNodesChange,
      fitView,
      direction: "LR",
      storeEndpoints: [{ id: "ep-test", nodeId: "service-products", name: "ep-test", type: "GET" }],
    });

    expect(appliedChanges.length).toBe(4);

    const posMap = new Map(
      appliedChanges.map((c) => [c.id, c.position]),
    );

    const webAppPos = posMap.get("web-app-1")!;
    const webPagePos = posMap.get("web-page-1")!;
    const transPos = posMap.get("trans-local-1")!;
    const servicePos = posMap.get("service-products")!;

    // 1. Service is furthest right in this chain
    expect(servicePos.x).toBeGreaterThan(transPos.x);

    // 2. Transformer is in its dedicated column immediately before service
    // Transformer width is 240, gap is 80 -> transformer X should be ~ servicePos.x - 320
    expect(transPos.x).toBeLessThan(servicePos.x);
    expect(servicePos.x - (transPos.x + 260)).toBeCloseTo(80, 0);

    // 3. Web page is upstream to the left of the transformer column
    expect(webPagePos.x).toBeLessThan(transPos.x);
    expect(webAppPos.x).toBeLessThan(webPagePos.x);
  });

  it("positions global transformer_ref right before the service while master transformer remains separate", () => {
    const nodes: LayoutNode[] = [
      {
        id: "master-global-trans",
        type: "transformer",
        position: { x: 0, y: 0 },
        data: {
          label: "global Data Transformer",
          scope: "global",
          functionName: "globalDataTransformer",
        },
      },
      {
        id: "trans-ref-1",
        type: "transformer_ref",
        position: { x: 0, y: 0 },
        data: {
          label: "global Data Tran... (Ref)",
          transformerRef: "master-global-trans",
        },
      },
      {
        id: "service-products",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "products",
          endpoints: [{ id: "ep-demo", name: "GET demo", type: "rest" }],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-ref-link",
        source: "master-global-trans",
        target: "trans-ref-1",
        type: "transformer-reference",
      },
      {
        id: "e-ref-service",
        source: "trans-ref-1",
        target: "service-products",
        sourceHandle: "transformer-out",
        targetHandle: "endpoint-in-ep-demo",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      appliedChanges = changes;
    };

    const fitView = vi.fn();

    performGraphLayout({
      nodes,
      edges,
      onNodesChange,
      fitView,
      direction: "LR",
      storeEndpoints: [{ id: "ep-demo", nodeId: "service-products", name: "ep-demo", type: "GET" }],
    });

    const posMap = new Map(
      appliedChanges.map((c) => [c.id, c.position]),
    );

    const refPos = posMap.get("trans-ref-1")!;
    const servicePos = posMap.get("service-products")!;

    // Transformer ref is positioned right before the service
    expect(refPos.x).toBeLessThan(servicePos.x);
    expect(servicePos.x - (refPos.x + 260)).toBeCloseTo(80, 0);
  });

  it("handles multiple hanging transformers on a single service with non-overlapping Y alignment", () => {
    const nodes: LayoutNode[] = [
      {
        id: "trans-local",
        type: "transformer",
        position: { x: 0, y: 0 },
        data: { label: "Local Transformer", scope: "local" },
      },
      {
        id: "trans-ref",
        type: "transformer_ref",
        position: { x: 0, y: 0 },
        data: { label: "Global Transformer Ref" },
      },
      {
        id: "service-1",
        type: "service",
        position: { x: 0, y: 0 },
        data: {
          label: "products",
          endpoints: [
            { id: "ep-1", name: "GET test", type: "rest" },
            { id: "ep-2", name: "GET demo", type: "rest" },
          ],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-trans-1",
        source: "trans-local",
        target: "service-1",
        sourceHandle: "transformer-out",
        targetHandle: "endpoint-in-ep-1",
        type: "connection",
      },
      {
        id: "e-trans-2",
        source: "trans-ref",
        target: "service-1",
        sourceHandle: "transformer-out",
        targetHandle: "endpoint-in-ep-2",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      appliedChanges = changes;
    };

    const fitView = vi.fn();

    performGraphLayout({
      nodes,
      edges,
      onNodesChange,
      fitView,
      direction: "LR",
      storeEndpoints: [
        { id: "ep-1", nodeId: "service-1", name: "ep-1", type: "GET" },
        { id: "ep-2", nodeId: "service-1", name: "ep-2", type: "GET" },
      ],
    });

    const posMap = new Map(
      appliedChanges.map((c) => [c.id, c.position]),
    );

    const posLocal = posMap.get("trans-local")!;
    const posRef = posMap.get("trans-ref")!;
    const posService = posMap.get("service-1")!;

    // Both transformers share the same X column right before the service
    expect(posLocal.x).toEqual(posRef.x);
    expect(posService.x - (posLocal.x + 260)).toBeCloseTo(80, 0);

    // They must not overlap vertically: distance between their tops >= height (50) + gap (16) = 66
    const verticalDist = Math.abs(posLocal.y - posRef.y);
    expect(verticalDist).toBeGreaterThanOrEqual(66);
  });
  it("positions hanging transformer_ref to the left of a webPage node", () => {
    const nodes: LayoutNode[] = [
      {
        id: "master-global-trans",
        type: "transformer",
        position: { x: 0, y: 0 },
        data: {
          label: "generateChatId",
          scope: "global",
          functionName: "generateChatId",
        },
      },
      {
        id: "trans-ref-page",
        type: "transformer_ref",
        position: { x: 0, y: 0 },
        data: {
          label: "generateChatId (Ref)",
          transformerRef: "master-global-trans",
        },
      },
      {
        id: "web-page-1",
        type: "webPage",
        position: { x: 1000, y: 200 },
        data: {
          label: "/chat/[id]",
          events: [{ id: "act-send", name: "sendMessage" }],
        },
      },
    ];

    const edges: LayoutEdge[] = [
      {
        id: "e-ref-link",
        source: "master-global-trans",
        target: "trans-ref-page",
        type: "transformer-reference",
      },
      {
        id: "e-ref-to-page",
        source: "trans-ref-page",
        target: "web-page-1",
        sourceHandle: "transformer-out",
        targetHandle: "event-in-act-send",
        type: "connection",
      },
    ];

    let appliedChanges: PositionNodeChange[] = [];
    const onNodesChange = (changes: PositionNodeChange[]) => {
      appliedChanges = changes;
    };

    const fitView = vi.fn();

    performGraphLayout({
      nodes,
      edges,
      onNodesChange,
      fitView,
      direction: "LR",
      storeEvents: [{ id: "act-send", name: "act-send", nodeId: "web-page-1", variant: "consume" }],
    });

    const posMap = new Map(
      appliedChanges.map((c) => [c.id, c.position]),
    );

    const refPos = posMap.get("trans-ref-page")!;
    const pagePos = posMap.get("web-page-1")!;

    // Hanging transformer ref MUST sit to the left of the WebPageNode
    expect(refPos.x).toBeLessThan(pagePos.x);
    expect(pagePos.x - (refPos.x + 260)).toBeCloseTo(80, 0);
  });
});
