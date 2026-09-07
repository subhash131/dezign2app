import { describe, it, expect } from "vitest";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, CompiledFile } from "@workspace/canvas/types";

describe("compileNextjsV16WebClient - Configuration-Driven Output", () => {
  it("should not generate nav bar for single page unless showNav is explicitly true", () => {
    const singlePageNode: BackendNode = {
      id: "node-page-1",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Landing Page",
        appSlug: "web-app",
        sections: [
          {
            id: "sec-1",
            name: "Hero Section",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [],
          },
        ],
      },
    };

    const webAppNode: BackendNode = {
      id: "node-app",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "My Web App",
        appSlug: "web-app",
        showNav: false,
      },
    };

    const result = compileNextjsV16WebClient(
      [singlePageNode],
      [],
      [],
      [singlePageNode, webAppNode],
      [],
      "My Custom App",
      [],
      "web-app",
      webAppNode,
    );

    const rootLayout = result.files.find((f: CompiledFile) => f.filename === "app/layout.tsx");
    expect(rootLayout).toBeDefined();
    expect(rootLayout?.content).not.toContain("<nav");
    expect(rootLayout?.content).not.toContain("Web Application");

    // Route group layout should not have debug badge banner
    const groupLayout = result.files.find((f: CompiledFile) => f.filename === "app/(public)/layout.tsx");
    expect(groupLayout).toBeDefined();
    expect(groupLayout?.content).not.toContain("Unprotected Public Route Group Layout");
    expect(groupLayout?.content).not.toContain("Badge");

    // Page should not have triggerLogs or Output Log
    const pageFile = result.files.find((f: CompiledFile) => f.filename.endsWith("page.tsx"));
    expect(pageFile).toBeDefined();
    expect(pageFile?.content).not.toContain("triggerLogs");
    expect(pageFile?.content).not.toContain("Output Log");
    expect(pageFile?.content).not.toContain("No actions triggered yet");
    expect(pageFile?.content).not.toContain("No sections configured");

    // Section should not have placeholder description or placeholder text
    const sectionFile = result.files.find((f: CompiledFile) => f.filename.endsWith("HeroSection.tsx"));
    expect(sectionFile).toBeDefined();
    expect(sectionFile?.content).not.toContain("Interactive section component");
    expect(sectionFile?.content).not.toContain("No actions configured in this section");
  });

  it("should generate nav bar only when showNav is explicitly true on webAppNode", () => {
    const page1: BackendNode = {
      id: "node-p1",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Home",
        appSlug: "multi-app",
      },
    };

    const page2: BackendNode = {
      id: "node-p2",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "About",
        appSlug: "multi-app",
      },
    };

    const webAppNodeWithNav: BackendNode = {
      id: "node-app",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Multi Page App",
        appSlug: "multi-app",
        showNav: true,
      },
    };

    const resultWithNav = compileNextjsV16WebClient(
      [page1, page2],
      [],
      [],
      [page1, page2, webAppNodeWithNav],
      [],
      "Multi Page App",
      [],
      "multi-app",
      webAppNodeWithNav,
    );

    const rootLayoutWithNav = resultWithNav.files.find((f: CompiledFile) => f.filename === "app/layout.tsx");
    expect(rootLayoutWithNav).toBeDefined();
    expect(rootLayoutWithNav?.content).toContain("<nav");
    expect(rootLayoutWithNav?.content).toContain('href="/about"');

    // Without showNav: true, no nav should be generated even with multiple pages
    const resultNoNav = compileNextjsV16WebClient(
      [page1, page2],
      [],
      [],
      [page1, page2],
      [],
      "Multi Page App",
    );
    const rootLayoutNoNav = resultNoNav.files.find((f: CompiledFile) => f.filename === "app/layout.tsx");
    expect(rootLayoutNoNav?.content).not.toContain("<nav");
  });

  it("should not generate a fallback root index page listing all routes when no explicit root page exists", () => {
    const page1: BackendNode = {
      id: "node-p1",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Dashboard",
        appSlug: "store",
      },
    };

    const page2: BackendNode = {
      id: "node-p2",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Settings",
        appSlug: "store",
      },
    };

    const result = compileNextjsV16WebClient(
      [page1, page2],
      [],
      [],
      [page1, page2],
      [],
      "Store App",
    );

    // Dashboard and Settings pages must exist
    expect(result.files.some((f) => f.filename === "app/(public)/dashboard/page.tsx")).toBe(true);
    expect(result.files.some((f) => f.filename === "app/(public)/settings/page.tsx")).toBe(true);

    // No root page / should be generated
    expect(result.files.some((f) => f.filename === "app/(public)/page.tsx")).toBe(false);
    expect(result.files.some((f) => f.filename.includes("WebClientIndexHeader"))).toBe(false);
  });

  it("should only treat '/' as root page, and create distinct pages for 'home' or 'index'", () => {
    const homePage: BackendNode = {
      id: "node-home",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Home",
        appSlug: "portal",
      },
    };

    const rootPage: BackendNode = {
      id: "node-root",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/",
        appSlug: "portal",
      },
    };

    const resultHome = compileNextjsV16WebClient(
      [homePage],
      [],
      [],
      [homePage],
      [],
      "Portal",
    );
    expect(resultHome.files.some((f) => f.filename === "app/(public)/home/page.tsx")).toBe(true);
    expect(resultHome.files.some((f) => f.filename === "app/(public)/page.tsx")).toBe(false);

    const resultRoot = compileNextjsV16WebClient(
      [rootPage],
      [],
      [],
      [rootPage],
      [],
      "Portal",
    );
    expect(resultRoot.files.some((f) => f.filename === "app/(public)/page.tsx")).toBe(true);
  });

  it("should generate clean action Button for actions with no form fields", () => {
    const pageNode: BackendNode = {
      id: "node-page-action",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Dashboard",
        appSlug: "dashboard-app",
        sections: [
          {
            id: "sec-actions",
            name: "Controls",
            renderMode: "client",
            loadStrategy: "eager",
            actions: [
              {
                id: "act-sync",
                name: "Sync Data",
                event: "click",
              },
            ],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "SyncService",
        port: "8000",
        endpoints: [],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-sync",
        nodeId: "node-service",
        name: "/api/sync",
        type: "POST",
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-1",
        source: "node-page-action",
        target: "node-service",
        sourceHandle: "events-act-sync",
        targetHandle: "endpoint-in-ep-sync",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileNextjsV16WebClient(
      [pageNode],
      endpoints,
      [],
      [pageNode, serviceNode],
      edges,
      "SyncApp",
    );

    const actionFile = result.files.find((f: CompiledFile) => f.filename.endsWith("SyncDataAction.tsx"));
    expect(actionFile).toBeDefined();
    const actionContent = actionFile?.content || "";

    // Should NOT have Swagger debug inputs
    expect(actionContent).not.toContain("Endpoint URL");
    expect(actionContent).not.toContain("Reset to default");
    expect(actionContent).not.toContain("Target:");

    // Should render a direct Button
    expect(actionContent).toContain("<Button");
    expect(actionContent).toContain("Sync Data");

    // Page should include trigger handler and Output Log since there is an active API endpoint
    const pageFile = result.files.find((f: CompiledFile) => f.filename.endsWith("page.tsx"));
    expect(pageFile?.content).toContain("handleTriggerAction");
    expect(pageFile?.content).toContain("requestBody?: unknown");
    expect(pageFile?.content).not.toContain("requestBody?: JSONValue");
    expect(pageFile?.content).toContain("Output Log");
    expect(pageFile?.content).toContain('import { executeApiAction } from "@/lib/api-client";');

    // Action component should reuse canonical types from @workspace/types
    expect(actionContent).toContain('from "@workspace/types";');
    expect(actionContent).toContain("SyncServicePostApiSyncResponse");

    // Client utility file lib/api-client.ts should be generated
    const apiClientFile = result.files.find((f: CompiledFile) => f.filename === "lib/api-client.ts");
    expect(apiClientFile).toBeDefined();
    expect(apiClientFile?.content).toContain("export async function executeApiAction");
  });

  it("should not generate Output Log when page only has navigation actions", () => {
    const pageNode: BackendNode = {
      id: "node-page-nav",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Landing",
        appSlug: "landing-app",
        sections: [
          {
            id: "sec-nav",
            name: "Nav Section",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [
              {
                id: "act-goto-dash",
                name: "Go to Dashboard",
                event: "navigateToPage",
                targetRoute: "/dashboard",
              },
            ],
          },
        ],
      },
    };

    const result = compileNextjsV16WebClient(
      [pageNode],
      [],
      [],
      [pageNode],
      [],
      "LandingApp",
    );

    const actionFile = result.files.find((f: CompiledFile) => f.filename.endsWith("GoToDashboardAction.tsx"));
    expect(actionFile).toBeDefined();
    expect(actionFile?.content).toContain("<Link");
    expect(actionFile?.content).toContain("Go to Dashboard");
    expect(actionFile?.content).not.toContain("&rarr;");

    const pageFile = result.files.find((f: CompiledFile) => f.filename.endsWith("page.tsx"));
    expect(pageFile?.content).not.toContain("triggerLogs");
    expect(pageFile?.content).not.toContain("Output Log");
  });

  it("should NOT generate any frontend app in compileMonorepo if no WebApp node exists", () => {

    const lonelyWebPage: BackendNode = {
      id: "node-lonely-page",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/orphan-page",
        appSlug: "web-app",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "BillingService",
        port: "8000",
      },
    };

    const result = compileMonorepo(
      [lonelyWebPage, serviceNode],
      [],
      [],
      [],
      [],
      "BackendOnlyMonorepo",
    );

    // Should NOT compile any web-app files
    const webAppFiles = result.files.filter((f) => f.filename.startsWith("apps/web-app"));
    expect(webAppFiles.length).toBe(0);

    // Should compile the service in apps/
    const serviceFiles = result.files.filter((f) => f.filename.startsWith("apps/billingservice"));
    expect(serviceFiles.length).toBeGreaterThan(0);
  });

  it("should generate valid JavaScript identifier variable names in pageLoad fetch code", () => {
    const webAppNode: BackendNode = {
      id: "web-app-1",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "Portal",
        appSlug: "customer-portal",
        techStack: "nextjs",
        techVersion: "16.x",
      },
    };

    const serviceNode: BackendNode = {
      id: "service-46c47d39-9f6e-4f7f-a66c-1a94034ac01e",
      type: "service",
      fractionalIndex: "a1",
      position: { x: 500, y: 0 },
      data: {
        label: "UserService",
        port: "8080",
      },
    };

    const pageNode: BackendNode = {
      id: "page-1",
      type: "webPage",
      fractionalIndex: "a2",
      position: { x: 200, y: 0 },
      data: {
        label: "/",
        appSlug: "customer-portal",
        events: [
          {
            id: "evt-load-1",
            name: "fetchUsers",
            event: "pageLoad",
          },
        ],
      },
    };

    const edgeToWeb: BackendEdge = {
      id: "edge-web",
      type: "connection",
      fractionalIndex: "a0",
      source: "web-app-1",
      target: "page-1",
    };

    const edgeToService: BackendEdge = {
      id: "edge-srv",
      type: "connection",
      fractionalIndex: "a1",
      source: "page-1",
      sourceHandle: "events-evt-load-1",
      target: serviceNode.id,
    };

    const endpoint = {
      id: "ep-1",
      name: "getUsers",
      type: "GET" as const,
      path: "/users",
      nodeId: serviceNode.id,
    };

    const result = compileMonorepo(
      [webAppNode, pageNode, serviceNode],
      [endpoint],
      [],
      [edgeToWeb, edgeToService],
      [],
      "TestProject",
    );

    const pageFile = result.files.find((f) => f.filename.includes("app/(public)/page.tsx"));
    expect(pageFile).toBeDefined();
    // Must NOT contain headers_46c47d39-... (UUID with hyphens in identifier)
    expect(pageFile?.content).not.toMatch(/headers_[a-f0-9-]+/);
    expect(pageFile?.content).toContain("const headers: Record<string, string>");
    expect(pageFile?.content).toContain("const res = await fetch");
  });

  it("should generate ServiceNameEndpointName variable suffixes for multiple pageLoad events", () => {
    const webAppNode: BackendNode = {
      id: "web-app-1",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "Portal",
        appSlug: "customer-portal",
        techStack: "nextjs",
        techVersion: "16.x",
      },
    };

    const userServiceNode: BackendNode = {
      id: "service-user",
      type: "service",
      fractionalIndex: "a1",
      position: { x: 500, y: 0 },
      data: {
        label: "UserService",
        port: "8080",
      },
    };

    const analyticsServiceNode: BackendNode = {
      id: "service-analytics",
      type: "service",
      fractionalIndex: "a2",
      position: { x: 500, y: 200 },
      data: {
        label: "AnalyticsService",
        port: "8081",
      },
    };

    const pageNode: BackendNode = {
      id: "page-1",
      type: "webPage",
      fractionalIndex: "a3",
      position: { x: 200, y: 0 },
      data: {
        label: "/",
        appSlug: "customer-portal",
        events: [
          {
            id: "evt-user-data",
            name: "getData",
            event: "pageLoad",
          },
          {
            id: "evt-analytics-data",
            name: "getData",
            event: "pageLoad",
          },
        ],
      },
    };

    const edgeToWeb: BackendEdge = {
      id: "edge-web",
      type: "connection",
      fractionalIndex: "a0",
      source: "web-app-1",
      target: "page-1",
    };

    const edgeToUserSrv: BackendEdge = {
      id: "edge-user",
      type: "connection",
      fractionalIndex: "a1",
      source: "page-1",
      sourceHandle: "events-evt-user-data",
      target: userServiceNode.id,
    };

    const edgeToAnalyticsSrv: BackendEdge = {
      id: "edge-analytics",
      type: "connection",
      fractionalIndex: "a2",
      source: "page-1",
      sourceHandle: "events-evt-analytics-data",
      target: analyticsServiceNode.id,
    };

    const userEndpoint = {
      id: "ep-user",
      name: "getData",
      type: "GET" as const,
      path: "/data",
      nodeId: userServiceNode.id,
    };

    const analyticsEndpoint = {
      id: "ep-analytics",
      name: "getData",
      type: "GET" as const,
      path: "/data",
      nodeId: analyticsServiceNode.id,
    };

    const result = compileMonorepo(
      [webAppNode, pageNode, userServiceNode, analyticsServiceNode],
      [userEndpoint, analyticsEndpoint],
      [],
      [edgeToWeb, edgeToUserSrv, edgeToAnalyticsSrv],
      [],
      "TestProject",
    );

    const pageFile = result.files.find((f) => f.filename.includes("app/(public)/page.tsx"));
    expect(pageFile).toBeDefined();
    expect(pageFile?.content).toContain("const headers_UserServiceGetData");
    expect(pageFile?.content).toContain("const res_UserServiceGetData");
    expect(pageFile?.content).toContain("const headers_AnalyticsServiceGetData");
    expect(pageFile?.content).toContain("const res_AnalyticsServiceGetData");
  });

  it("should reuse canonical Response type from @workspace/types for connected pageLoad event", () => {
    const pageNode: BackendNode = {
      id: "node-page-load",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Dashboard",
        appSlug: "dashboard-app",
        events: [
          {
            id: "evt-load",
            name: "pageLoad",
            event: "pageLoad",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-load",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "AnalyticsService",
        port: "8000",
        endpoints: [],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-metrics",
        nodeId: "node-service-load",
        name: "/api/metrics",
        type: "GET",
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-load",
        source: "node-page-load",
        target: "node-service-load",
        sourceHandle: "events-evt-load",
        targetHandle: "endpoint-in-ep-metrics",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileNextjsV16WebClient(
      [pageNode],
      endpoints,
      [],
      [pageNode, serviceNode],
      edges,
      "DashboardApp",
    );

    const pageFile = result.files.find((f: CompiledFile) => f.filename.endsWith("page.tsx"));
    expect(pageFile).toBeDefined();
    expect(pageFile?.content).toContain('import type { AnalyticsServiceGetApiMetricsResponse } from "@workspace/types";');
    expect(pageFile?.content).toContain("useState<AnalyticsServiceGetApiMetricsResponse | null>(null)");
  });
});

