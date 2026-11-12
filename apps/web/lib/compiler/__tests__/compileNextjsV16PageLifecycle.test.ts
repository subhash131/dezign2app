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
                  variableMappings: [
                    {
                      id: "vm-1",
                      variableName: "searchQuery",
                      source: "section_state",
                      varType: "string",
                    },
                    {
                      id: "vm-2",
                      variableName: "totalCount",
                      storeName: "MetricsStore",
                      source: "store",
                      varType: "number",
                    },
                  ],
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

    // 3. Verifies reactive state watcher with debounce and variable mappings
    expect(content).toContain("setTimeout");
    expect(content).toContain("clearTimeout(handler)");
    expect(content).toContain("300");
    expect(content).toContain("useMetricsStore((s) => s.totalCount)");
    expect(content).toContain("metricsTotalCount");
    expect(content).toContain("searchQuery");

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

  it("compiles Server-Side Rendering (SSR) mount action into async Server Component and Client View", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-ssr",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "SsrApp",
        appSlug: "ssr-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-ssr",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/products",
        sections: [
          {
            id: "sec-products",
            name: "ProductsSection",
            renderMode: "client",
            actions: [
              {
                id: "act-mount-ssr",
                name: "loadProducts",
                event: "onMount",
                mountConfig: {
                  strategy: "ssr",
                  cacheMode: "revalidate",
                  revalidateSeconds: 60,
                },
                storeActionBinding: {
                  storeName: "ProductsStore",
                  actionName: "populate",
                  actionType: "populate",
                },
              },
            ],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-products",
      type: "service",
      position: { x: 500, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "ProductService",
        port: "4000",
        endpoints: [],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-products",
        nodeId: "node-service-products",
        name: "/api/products",
        type: "GET",
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-webapp-page",
        source: "node-webapp-ssr",
        target: "node-page-ssr",
        sourceHandle: "public-in",
        targetHandle: "page-in",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "edge-mount-service",
        source: "node-page-ssr",
        target: "node-service-products",
        sourceHandle: "events-act-mount-ssr",
        targetHandle: "endpoint-in-ep-products",
        type: "connection",
        fractionalIndex: "a1",
      },
    ];

    const allNodes = [webAppNode, webPageNode, serviceNode];
    const result = compileNextjsV16WebClient(
      [webPageNode],
      endpoints,
      [],
      allNodes,
      edges,
      "SsrApp",
      undefined,
      "ssr-app",
      webAppNode,
    );

    // 1. Verifies Server Component page.tsx
    const serverPageFile = result.files.find(
      (f) => f.filename === "app/(public)/products/page.tsx",
    );
    expect(serverPageFile).toBeDefined();
    const serverContent = serverPageFile!.content;

    expect(serverContent).not.toContain('"use client"');
    expect(serverContent).toContain("export default async function ProductsPage()");
    expect(serverContent).toContain("fetch(");
    expect(serverContent).toContain("/api/products");
    expect(serverContent).not.toContain('cache: "revalidate"');
    expect(serverContent).toContain("next: { revalidate: 60 }");
    expect(serverContent).toContain("<ProductsPageClient initialData={initialData}");

    // 2. Verifies Client View Component ProductsPageClient.tsx
    const clientViewFile = result.files.find(
      (f) => f.filename === "app/(public)/products/_components/ProductsPageClient.tsx",
    );
    expect(clientViewFile).toBeDefined();
    const clientContent = clientViewFile!.content;

    expect(clientContent).toContain('"use client"');
    expect(clientContent).toContain("export default function ProductsPageClient(");
    expect(clientContent).toContain("initialData = null");
    expect(clientContent).toContain("initialData ?? null");
    expect(clientContent).toContain("useProductsStore.getState().populate(initialData);");
  });

  it("compiles clean Server Component without fetch or missing JSONValue when SSR onMount has no connected endpoint", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-chat",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "ChatApp",
        appSlug: "chat-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-chat",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/chat/[id]",
        sections: [
          {
            id: "sec-chat",
            name: "ChatSection",
            renderMode: "client",
            actions: [
              {
                id: "act-mount-chat",
                name: "onMount",
                event: "onMount",
                mountConfig: {
                  strategy: "ssr",
                  cacheMode: "no-store",
                },
              },
            ],
          },
        ],
      },
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-webapp-chat",
        source: "node-webapp-chat",
        target: "node-page-chat",
        sourceHandle: "public-in",
        targetHandle: "page-in",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      [webAppNode, webPageNode],
      edges,
      "ChatApp",
      undefined,
      "chat-app",
      webAppNode,
    );

    const serverPageFile = result.files.find(
      (f) => f.filename === "app/(public)/chat/[id]/page.tsx",
    );
    expect(serverPageFile).toBeDefined();
    const serverContent = serverPageFile!.content;

    // Should be a clean Server Component with NO fetch call and NO unimported JSONValue
    expect(serverContent).not.toContain('"use client"');
    expect(serverContent).not.toContain("fetch(");
    expect(serverContent).not.toContain('"/api"');
    expect(serverContent).not.toContain("JSONValue");
    expect(serverContent).not.toContain("Suspense");
    expect(serverContent).toContain("export default async function ChatIdPage()");
    expect(serverContent).toContain("<ChatIdPageClient initialData={null} initialError={null} />");

    const clientViewFile = result.files.find(
      (f) => f.filename === "app/(public)/chat/[id]/_components/ChatIdPageClient.tsx",
    );
    expect(clientViewFile).toBeDefined();
    const clientContent = clientViewFile!.content;

    expect(clientContent).toContain('"use client"');
    expect(clientContent).toContain("export default function ChatIdPageClient(");
    expect(clientContent).toContain("type JSONValue");
  });

  it("compiles section load strategies (eager, dynamic, and dynamic-no-ssr)", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-split",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "SplitApp",
        appSlug: "split-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-split",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/analytics",
        sections: [
          {
            id: "sec-nav",
            name: "Navigation Header",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [],
          },
          {
            id: "sec-chart",
            name: "Analytics Chart",
            renderMode: "client",
            loadStrategy: "dynamic",
            actions: [],
          },
          {
            id: "sec-canvas",
            name: "Interactive Canvas",
            renderMode: "client",
            loadStrategy: "dynamic-no-ssr",
            actions: [],
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      [webAppNode, webPageNode],
      [],
      "SplitApp",
      undefined,
      "split-app",
      webAppNode,
    );

    const pageFile = result.files.find(
      (f) => f.filename === "app/(public)/analytics/page.tsx",
    );
    expect(pageFile).toBeDefined();
    const content = pageFile!.content;

    // dynamic import statement present
    expect(content).toContain('import dynamic from "next/dynamic";');
    // eager section statically imported
    expect(content).toContain(
      'import { NavigationHeaderSection } from "./_components/navigation-header";',
    );
    // dynamic section code-split
    expect(content).toContain(
      'const AnalyticsChartSection = dynamic(\n  () => import("./_components/analytics-chart").then((mod) => mod.AnalyticsChartSection)\n);',
    );
    // dynamic-no-ssr section with { ssr: false }
    expect(content).toContain(
      'const InteractiveCanvasSection = dynamic(\n  () => import("./_components/interactive-canvas").then((mod) => mod.InteractiveCanvasSection),\n  { ssr: false }\n);',
    );
    expect(content).toContain("export default function AnalyticsPage() {");
  });

  it("compiles section load strategies in SSR mode (PageClient relative paths)", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-split-ssr",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "SplitSsrApp",
        appSlug: "split-ssr-app",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-split-ssr",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/dashboard",
        sections: [
          {
            id: "sec-sidebar",
            name: "App Sidebar",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [
              {
                id: "act-ssr-mount",
                name: "loadDashboard",
                event: "onMount",
                mountConfig: {
                  strategy: "ssr",
                  cacheMode: "no-store",
                },
              },
            ],
          },
          {
            id: "sec-flow",
            name: "Node Flow View",
            renderMode: "client",
            loadStrategy: "dynamic-no-ssr",
            actions: [],
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [webPageNode],
      [],
      [],
      [webAppNode, webPageNode],
      [],
      "SplitSsrApp",
      undefined,
      "split-ssr-app",
      webAppNode,
    );

    const clientViewFile = result.files.find(
      (f) => f.filename === "app/(public)/dashboard/_components/DashboardPageClient.tsx",
    );
    expect(clientViewFile).toBeDefined();
    const clientContent = clientViewFile!.content;

    // Must import dynamic from next/dynamic
    expect(clientContent).toContain('import dynamic from "next/dynamic";');
    // Eager section imported relative to _components
    expect(clientContent).toContain(
      'import { AppSidebarSection } from "./app-sidebar";',
    );
    // Dynamic-no-ssr section with relative path and ssr: false
    expect(clientContent).toContain(
      'const NodeFlowViewSection = dynamic(\n  () => import("./node-flow-view").then((mod) => mod.NodeFlowViewSection),\n  { ssr: false }\n);',
    );
    expect(clientContent).toContain("export default function DashboardPageClient(");
  });
});

