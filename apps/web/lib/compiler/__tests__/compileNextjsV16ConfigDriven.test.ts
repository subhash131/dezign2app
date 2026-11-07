import { describe, it, expect } from "vitest";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";
import { compileWebPageNode } from "../compileWebPageNode";
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
    expect(pageFile?.content).toContain("requestBody?: Record<string, string | number | boolean | null | undefined>");
    expect(pageFile?.content).not.toContain("requestBody?: unknown");
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

  it("compiles navigation action with dynamic route parameters and pathParamBindings via compileWebPageNode", () => {
    const pageNode: BackendNode = {
      id: "node-page-dynamic-nav",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Chat Overview",
        appSlug: "chat-app",
        sections: [
          {
            id: "sec-chat-nav",
            name: "Chat Navigation Section",
            renderMode: "server",
            loadStrategy: "eager",
            actions: [
              {
                id: "act-open-chat",
                name: "Open Chat",
                event: "navigateToPage",
                targetRoute: "/chat/[id]",
                pathParamBindings: [
                  {
                    paramName: "id",
                    source: {
                      kind: "route_param",
                      paramName: "id",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const result = compileWebPageNode(pageNode);
    const actionFile = result.files.find((f: CompiledFile) =>
      f.filename.endsWith("OpenChatAction.tsx"),
    );
    expect(actionFile).toBeDefined();
    expect(actionFile?.content).toContain("useParams");
    expect(actionFile?.content).toContain("targetHref");
    expect(actionFile?.content).toContain("/chat/");
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

    const endpoint: Endpoint & { nodeId: string } = {
      id: "ep-1",
      name: "getUsers",
      type: "GET",
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

    const userEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-user",
      name: "getData",
      type: "GET",
      nodeId: userServiceNode.id,
    };

    const analyticsEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-analytics",
      name: "getData",
      type: "GET",
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

  it("should generate interactive form for GET action with query parameters passing undefined for requestBody", () => {
    const pageNode: BackendNode = {
      id: "node-page-conversations",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversations",
        appSlug: "web-app",
        sections: [
          {
            id: "sec-main",
            name: "Main",
            renderMode: "client",
            loadStrategy: "eager",
            actions: [
              {
                id: "evt-get-conv",
                name: "Get Conversations",
                event: "click",
              },
            ],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-conv",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "ConversationService",
        port: "8082",
        endpoints: [],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-get-conversations",
        nodeId: "node-service-conv",
        name: "/api/conversations",
        type: "GET",
        queryParams: [
          { id: "q1", name: "limit", type: "number", required: false },
          { id: "q2", name: "cursor", type: "string", required: false },
        ],
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-get-conv",
        source: "node-page-conversations",
        target: "node-service-conv",
        sourceHandle: "events-evt-get-conv",
        targetHandle: "endpoint-in-ep-get-conversations",
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
      "ConversationsApp",
    );

    const actionFile = result.files.find((f: CompiledFile) =>
      f.filename.includes("GetConversationsAction.tsx"),
    );
    expect(actionFile).toBeDefined();
    const content = actionFile?.content || "";

    // 1. Should be an interactive form since query parameters are configured
    expect(content).toContain("queryParams");
    expect(content).toContain("setQueryParams");

    // 2. Should export canonical endpoint body type and strongly type onTrigger requestBody
    expect(content).toContain("export type GetConversationsActionRequestBody = ConversationServiceGetApiConversationsBody;");
    expect(content).toContain("requestBody?: Record<string, string | number | boolean | null | undefined>");
    expect(content).not.toContain("requestBody?: unknown");

    // 3. Should NOT declare payloadBody as unknown or pass unknown payloadBody to onTrigger
    expect(content).not.toContain("let payloadBody");
    expect(content).not.toContain("payloadBody,");

    // 4. Should pass undefined for the requestBody argument in onTrigger
    expect(content).toContain("undefined,");
    expect(content).toMatch(/await onTrigger\?\.[\s\S]*undefined,\s*\);/);
  });

  it("derives package.json name from appSlug or webAppNode label", () => {
    const webAppNode: BackendNode = {
      id: "web-app-demo",
      type: "webApp",
      position: { x: 0, y: 0 },
      data: {
        label: "demo",
        appSlug: "demo",
        port: "3000",
      },
      fractionalIndex: "a0",
    };
    const pageNode: BackendNode = {
      id: "page-1",
      type: "webPage",
      position: { x: 100, y: 100 },
      data: {
        label: "/",
        appSlug: "demo",
      },
      fractionalIndex: "a1",
    };

    const result = compileNextjsV16WebClient(
      [pageNode],
      [],
      [],
      [webAppNode, pageNode],
      [],
      "DemoProject",
      [],
      undefined,
      webAppNode,
    );

    const pkgJsonFile = result.files.find((f: CompiledFile) => f.filename === "package.json");
    expect(pkgJsonFile).toBeDefined();
    const pkgJson = JSON.parse(pkgJsonFile!.content);
    expect(pkgJson.name).toBe("@workspace/demo");
  });

  it("falls back to webAppNode.data.label when appSlug is not provided", () => {
    const webAppNode: BackendNode = {
      id: "web-app-demo-fallback",
      type: "webApp",
      position: { x: 0, y: 0 },
      data: {
        label: "demo",
        port: "3000",
      },
      fractionalIndex: "a0",
    };
    const pageNode: BackendNode = {
      id: "page-1",
      type: "webPage",
      position: { x: 100, y: 100 },
      data: {
        label: "/",
      },
      fractionalIndex: "a1",
    };

    const result = compileNextjsV16WebClient(
      [pageNode],
      [],
      [],
      [webAppNode, pageNode],
      [],
      "DemoProject",
      [],
      undefined,
      webAppNode,
    );

    const pkgJsonFile = result.files.find((f: CompiledFile) => f.filename === "package.json");
    expect(pkgJsonFile).toBeDefined();
    const pkgJson = JSON.parse(pkgJsonFile!.content);
    expect(pkgJson.name).toBe("@workspace/demo");
  });

  it("generates server guard layout when zone protectionMode is server-guard with dbFunction", () => {
    const webAppNode: BackendNode = {
      id: "web-app-sg",
      type: "webApp",
      position: { x: 0, y: 0 },
      data: {
        label: "portal",
        appSlug: "portal",
        zones: [
          {
            id: "zone-public",
            name: "Public",
            handleId: "public-in",
            accessType: "public",
          },
          {
            id: "zone-private",
            name: "Private",
            handleId: "private-in",
            accessType: "protected",
            protectionMode: "server-guard",
            serverGuard: {
              entityNodeId: "node-user-entity",
              entityLabel: "User",
              checkMode: "dbFunction",
              dbFunctionName: "validateSubscription",
              param: "userId",
              requireSession: true,
              failRedirect: "/unauthorized",
            },
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const protectedPage: BackendNode = {
      id: "page-protected",
      type: "webPage",
      position: { x: 100, y: 100 },
      data: {
        label: "dashboard",
        accessType: "private",
        routeGroup: "private",
      },
      fractionalIndex: "a1",
    };

    const edge: BackendEdge = {
      id: "edge-1",
      source: "web-app-sg",
      sourceHandle: "private-in",
      target: "page-protected",
      targetHandle: "page-in",
      type: "connection",
      fractionalIndex: "e0",
    };

    const result = compileNextjsV16WebClient(
      [protectedPage],
      [],
      [],
      [webAppNode, protectedPage],
      [edge],
      "PortalApp",
      [],
      "portal",
      webAppNode,
    );

    const privateLayout = result.files.find(
      (f: CompiledFile) => f.filename === "app/(private)/layout.tsx",
    );
    expect(privateLayout).toBeDefined();
    expect(privateLayout?.content).toContain("Next.js Server Guard Layout");
    expect(privateLayout?.content).toContain('import { db } from "@workspace/db";');
    expect(privateLayout?.content).toContain('import { auth } from "@/lib/auth";');
    expect(privateLayout?.content).toContain("await db.User.validateSubscription(session.user.id)");
    expect(privateLayout?.content).toContain('redirect("/unauthorized")');
    expect(privateLayout?.content).not.toContain("requireSession(");
  });

  it("generates server guard layout with columnValue check and header param without session", () => {
    const webAppNode: BackendNode = {
      id: "web-app-api-gate",
      type: "webApp",
      position: { x: 0, y: 0 },
      data: {
        label: "api-portal",
        appSlug: "api-portal",
        zones: [
          {
            id: "zone-private",
            name: "Private",
            handleId: "private-in",
            accessType: "protected",
            protectionMode: "server-guard",
            serverGuard: {
              entityNodeId: "node-account-entity",
              entityLabel: "Account",
              checkMode: "columnValue",
              entityField: "tier",
              entityFieldExpectedValue: "vip",
              param: "header",
              headerName: "x-custom-token",
              requireSession: false,
              failRedirect: "/upgrade",
            },
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const page: BackendNode = {
      id: "page-vip",
      type: "webPage",
      position: { x: 100, y: 100 },
      data: {
        label: "vip-area",
        accessType: "private",
        routeGroup: "private",
      },
      fractionalIndex: "a1",
    };

    const edge: BackendEdge = {
      id: "edge-2",
      source: "web-app-api-gate",
      sourceHandle: "private-in",
      target: "page-vip",
      targetHandle: "page-in",
      type: "connection",
      fractionalIndex: "e0",
    };

    const result = compileNextjsV16WebClient(
      [page],
      [],
      [],
      [webAppNode, page],
      [edge],
      "ApiPortalApp",
      [],
      "api-portal",
      webAppNode,
    );

    const privateLayout = result.files.find(
      (f: CompiledFile) => f.filename === "app/(private)/layout.tsx",
    );
    expect(privateLayout).toBeDefined();
    expect(privateLayout?.content).toContain("Next.js Server Guard Layout");
    expect(privateLayout?.content).not.toContain('import { auth } from "@/lib/auth";');
    expect(privateLayout?.content).toContain('(await headers()).get("x-custom-token")');
    expect(privateLayout?.content).toContain("record?.tier !== \"vip\"");
    expect(privateLayout?.content).toContain('redirect("/upgrade")');
  });

  it("generates nested route groups, cascaded layouts, and child pages for hierarchical sub-sections", () => {
    const webAppNode: BackendNode = {
      id: "web-app-hierarchical",
      type: "webApp",
      position: { x: 0, y: 0 },
      data: {
        label: "saas-app",
        appSlug: "saas-app",
        zones: [
          {
            id: "zone-public",
            name: "Public",
            handleId: "public-in",
            accessType: "public",
          },
          {
            id: "zone-private",
            name: "Private",
            handleId: "private-in",
            accessType: "protected",
            rule: {
              id: "rule-private",
              scope: "zone",
              conditions: { kind: "leaf", condition: { type: "auth", op: "signedIn" } },
              redirects: { default: "/login" },
            },
          },
          {
            id: "zone-subscribed",
            parentId: "zone-private",
            name: "Subscribed",
            handleId: "subscribed-in",
            accessType: "protected",
            rule: {
              id: "rule-subscribed",
              scope: "zone",
              conditions: {
                kind: "leaf",
                condition: { type: "subscriptionStatus", op: "statusIn", values: ["active"] },
              },
              redirects: { "wrong-plan": "/pricing", default: "/pricing" },
            },
          },
          {
            id: "zone-admin",
            parentId: "zone-subscribed",
            name: "Admin",
            handleId: "admin-in",
            accessType: "protected",
            rule: {
              id: "rule-admin",
              scope: "zone",
              conditions: {
                kind: "leaf",
                condition: { type: "orgRole", op: "in", values: ["admin"] },
              },
              redirects: { "wrong-role": "/unauthorized", default: "/unauthorized" },
            },
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const dashboardPage: BackendNode = {
      id: "page-dashboard",
      type: "webPage",
      position: { x: 100, y: 0 },
      data: { label: "dashboard" },
      fractionalIndex: "a1",
    };

    const proToolsPage: BackendNode = {
      id: "page-pro-tools",
      type: "webPage",
      position: { x: 100, y: 150 },
      data: { label: "pro-tools" },
      fractionalIndex: "a2",
    };

    const teamPage: BackendNode = {
      id: "page-team",
      type: "webPage",
      position: { x: 100, y: 300 },
      data: { label: "team" },
      fractionalIndex: "a3",
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-priv",
        source: "web-app-hierarchical",
        sourceHandle: "private-in",
        target: "page-dashboard",
        targetHandle: "page-in",
        type: "connection",
        fractionalIndex: "e0",
      },
      {
        id: "edge-sub",
        source: "web-app-hierarchical",
        sourceHandle: "subscribed-in",
        target: "page-pro-tools",
        targetHandle: "page-in",
        type: "connection",
        fractionalIndex: "e1",
      },
      {
        id: "edge-admin",
        source: "web-app-hierarchical",
        sourceHandle: "admin-in",
        target: "page-team",
        targetHandle: "page-in",
        type: "connection",
        fractionalIndex: "e2",
      },
    ];

    const authNode: BackendNode = {
      id: "node-auth",
      type: "auth",
      position: { x: -200, y: 0 },
      data: { label: "better-auth", framework: "better_auth" },
      fractionalIndex: "a00",
    };

    const authEdge: BackendEdge = {
      id: "edge-auth",
      source: "node-auth",
      target: "web-app-hierarchical",
      type: "connection",
      fractionalIndex: "ea",
    };

    const allEdges = [authEdge, ...edges];

    const result = compileNextjsV16WebClient(
      [dashboardPage, proToolsPage, teamPage],
      [],
      [],
      [authNode, webAppNode, dashboardPage, proToolsPage, teamPage],
      allEdges,
      "SaasApp",
      [],
      "saas-app",
      webAppNode,
    );

    // 1. Verify Layouts at all 3 tiers
    const privateLayout = result.files.find(
      (f: CompiledFile) => f.filename === "app/(private)/layout.tsx",
    );
    expect(privateLayout).toBeDefined();
    expect(privateLayout?.content).toContain("PrivateLayout");

    const subscribedLayout = result.files.find(
      (f: CompiledFile) => f.filename === "app/(private)/(subscribed)/layout.tsx",
    );
    expect(subscribedLayout).toBeDefined();
    expect(subscribedLayout?.content).toContain("SubscribedLayout");
    expect(subscribedLayout?.content).toContain('await requireSession("/pricing")');

    const adminLayout = result.files.find(
      (f: CompiledFile) => f.filename === "app/(private)/(subscribed)/(admin)/layout.tsx",
    );
    expect(adminLayout).toBeDefined();
    expect(adminLayout?.content).toContain("AdminLayout");
    expect(adminLayout?.content).toContain('await requireSession("/unauthorized")');

    // 2. Verify Page placement inside nested route group folders
    const dashboardPageFile = result.files.find(
      (f: CompiledFile) => f.filename === "app/(private)/dashboard/page.tsx",
    );
    expect(dashboardPageFile).toBeDefined();

    const proToolsPageFile = result.files.find(
      (f: CompiledFile) => f.filename === "app/(private)/(subscribed)/pro-tools/page.tsx",
    );
    expect(proToolsPageFile).toBeDefined();

    const teamPageFile = result.files.find(
      (f: CompiledFile) => f.filename === "app/(private)/(subscribed)/(admin)/team/page.tsx",
    );
    expect(teamPageFile).toBeDefined();

    // 3. Verify Proxy / Middleware includes accumulated rules
    const proxyFile = result.files.find(
      (f: CompiledFile) => f.filename === "proxy.ts" || f.filename === "middleware.ts",
    );
    expect(proxyFile).toBeDefined();
    expect(proxyFile?.content).toContain('path: "/pro-tools"');
    expect(proxyFile?.content).toContain('path: "/team"');
    expect(proxyFile?.content).toContain('requiredPlans: ["active"]');
    expect(proxyFile?.content).toContain('allowedOrgRoles: ["admin"]');
  });

  it("renders red asterisk and HTML5 required attribute for required headers in interactive form", () => {
    const pageNode: BackendNode = {
      id: "page-with-headers",
      type: "webPage",
      position: { x: 0, y: 0 },
      data: {
        label: "/api-tester",
        sections: [
          {
            id: "sec-test",
            name: "Test Section",
            actions: [
              {
                id: "act-reset",
                name: "reset",
                event: "click",
                headers: [
                  {
                    id: "h-demo",
                    name: "demo",
                    type: "string",
                    required: false,
                  },
                  {
                    id: "h-test",
                    name: "test",
                    type: "string",
                    required: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      fractionalIndex: "a0",
    };

    const result = compileNextjsV16WebClient(
      [pageNode],
      [],
      [],
      [pageNode],
      [],
      "TestApp",
    );

    const actionFile = result.files.find((f: CompiledFile) => f.filename.endsWith("ResetAction.tsx"));
    expect(actionFile).toBeDefined();
    const content = actionFile?.content || "";

    // Required header 'test' should display red asterisk and required prop
    expect(content).toContain('test <span className="text-destructive font-sans">*</span>');
    expect(content).toContain("required={true}");

    // Optional header 'demo' should not have asterisk
    expect(content).toContain("demo");
    expect(content).not.toContain('demo <span className="text-destructive font-sans">*</span>');
    expect(content).toContain("required={false}");
  });
});



