import { describe, it, expect } from "vitest";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";

describe("compileNextjsV16WebClient - Page Lifecycle and Reactive Effects", () => {
  it("compiles interval timers, route parameter watchers, state watchers, and unmount cleanups", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-lifecycle",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "LifecycleApp",
        appSlug: "lifecycle-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-lifecycle",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/dashboard",
        pathParams: [{ id: "p1", name: "userId", type: "string", required: true }],
        queryParams: [{ id: "q1", name: "filter", type: "string", required: false, value: "active" }],
        sections: [
          {
            id: "sec-main",
            name: "MainSection",
            renderMode: "client",
            stateObjects: [
              {
                id: "st-search",
                name: "searchQuery",
                type: "string",
                defaultValue: "",
              },
            ],
            actions: [
              {
                id: "act-mount",
                name: "fetchInitialData",
                event: "onMount",
              },
              {
                id: "act-unmount",
                name: "cleanupPage",
                event: "unmount",
                storeActionBinding: {
                  storeNodeId: "node-store-metrics",
                  storeName: "Metrics",
                  actionName: "reset",
                  actionType: "reset",
                },
              },
              {
                id: "act-interval",
                name: "pollMetrics",
                event: "interval",
                intervalConfig: {
                  intervalMs: 15000,
                  runImmediately: true,
                },
              },
              {
                id: "act-param-change",
                name: "onUserChange",
                event: "paramChange",
                paramChangeConfig: {
                  watchPathParams: ["userId"],
                  watchQueryParams: ["filter"],
                },
              },
              {
                id: "act-effect",
                name: "onSearchDebounce",
                event: "effect",
                effectConfig: {
                  dependencies: ["searchQuery"],
                  debounceMs: 300,
                },
              },
              {
                id: "act-visibility",
                name: "revalidateOnFocus",
                event: "visibilityChange",
              },
              {
                id: "act-beforeunload",
                name: "warnUnsaved",
                event: "beforeUnload",
              },
            ],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-api",
      type: "service",
      position: { x: 600, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "MetricsService",
        port: "8080",
        endpoints: [],
      },
    };

    const stateStoreNode: BackendNode = {
      id: "node-store-metrics",
      type: "state_store",
      position: { x: 400, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "Metrics",
        storeName: "Metrics",
        fields: [{ id: "f-count", name: "count", type: "number", defaultValue: 0 }],
        actions: [{ id: "a-reset", name: "reset", actionType: "reset" }],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-metrics",
        nodeId: "node-service-api",
        name: "/api/metrics",
        type: "GET",
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-webapp-page",
        source: "node-webapp-lifecycle",
        target: "node-page-lifecycle",
        sourceHandle: "public-in",
        targetHandle: "page-in",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "edge-interval-metrics",
        source: "node-page-lifecycle",
        target: "node-service-api",
        sourceHandle: "events-act-interval",
        targetHandle: "endpoint-in-ep-metrics",
        type: "connection",
        fractionalIndex: "a1",
      },
    ];

    const allNodes = [webAppNode, webPageNode, serviceNode, stateStoreNode];
    const result = compileNextjsV16WebClient(
      [webPageNode],
      endpoints,
      [],
      allNodes,
      edges,
      "LifecycleApp",
      undefined,
      "lifecycle-app",
      webAppNode,
    );

    const pageFile = result.files.find((f) => f.filename === "app/(public)/dashboard/page.tsx");
    expect(pageFile).toBeDefined();
    const content = pageFile!.content;

    // 1. Verifies interval timer generation with auto-cleanup
    expect(content).toContain("setInterval");
    expect(content).toContain("clearInterval(timer)");
    expect(content).toContain("15000");

    // 2. Verifies route parameter watcher with useParams & useSearchParams
    expect(content).toContain("useParams");
    expect(content).toContain("useSearchParams");
    expect(content).toContain("routeParams?.userId");
    expect(content).toContain('routeSearchParams?.get("filter")');

    // 3. Verifies reactive state watcher with debounce
    expect(content).toContain("setTimeout");
    expect(content).toContain("clearTimeout(handler)");
    expect(content).toContain("300");

    // 4. Verifies tab visibility listener & cleanup
    expect(content).toContain("visibilitychange");
    expect(content).toContain('removeEventListener("visibilitychange"');

    // 5. Verifies beforeunload confirmation guard
    expect(content).toContain("beforeunload");
    expect(content).toContain('removeEventListener("beforeunload"');

    // 6. Verifies unmount cleanup calls Zustand store reset
    expect(content).toContain("useMetricsStore.getState().reset();");

    // 7. Verifies onMount lifecycle loads initial data
    expect(content).toContain("fetchInitialData");
  });
});

