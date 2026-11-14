import { describe, it, expect } from "vitest";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge } from "@/types/canvas";

describe("Multi-WebApp Auth Isolation & Scoping", () => {
  it("should generate Better Auth ONLY for the WebApp connected to an Auth Node, and not for an unconnected WebApp", () => {
    // 1. WebApp 1 (connected to AuthNode 1)
    const webApp1: BackendNode = {
      id: "node-webapp-1",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Customer Portal",
        appSlug: "customer-portal",
        port: "3000",
      },
    };

    const page1: BackendNode = {
      id: "node-page-1",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Dashboard",
        appSlug: "customer-portal",
      },
    };

    // 2. WebApp 2 (unconnected to any Auth Node)
    const webApp2: BackendNode = {
      id: "node-webapp-2",
      type: "webApp",
      position: { x: 0, y: 400 },
      fractionalIndex: "a2",
      data: {
        label: "Marketing Site",
        appSlug: "marketing-site",
        port: "3001",
      },
    };

    const page2: BackendNode = {
      id: "node-page-2",
      type: "webPage",
      position: { x: 200, y: 400 },
      fractionalIndex: "a3",
      data: {
        label: "Home",
        appSlug: "marketing-site",
      },
    };

    // 3. Auth Node connected ONLY to WebApp 1
    const authNode1: BackendNode = {
      id: "node-auth-1",
      type: "auth",
      position: { x: -300, y: 0 },
      fractionalIndex: "a4",
      data: {
        label: "CustomerAuth",
        framework: "better_auth",
        version: "v1.6",
        port: "3000",
        baseUrl: "http://localhost:3000",
        plugins: ["bearer", "admin", "organization"],
      },
    };

    const edges: BackendEdge[] = [
      // Auth 1 -> WebApp 1
      {
        id: "edge-auth-webapp1",
        source: "node-auth-1",
        sourceHandle: "auth-out",
        target: "node-webapp-1",
        targetHandle: "auth-in",
        type: "connection",
        fractionalIndex: "a0",
      },
      // WebApp 1 -> Page 1
      {
        id: "edge-app1-page1",
        source: "node-webapp-1",
        sourceHandle: "public-in",
        target: "node-page-1",
        type: "connection",
        fractionalIndex: "a1",
      },
      // WebApp 2 -> Page 2
      {
        id: "edge-app2-page2",
        source: "node-webapp-2",
        sourceHandle: "public-in",
        target: "node-page-2",
        type: "connection",
        fractionalIndex: "a2",
      },
    ];

    const result = compileMonorepo(
      [webApp1, page1, webApp2, page2, authNode1],
      [],
      [],
      edges,
      [],
      "MultiAppProject",
    );

    // --- WebApp 1 assertions (Has Auth) ---
    const app1AuthRoute = result.files.find(
      (f) => f.filename === "apps/customer-portal/app/api/auth/[...all]/route.ts",
    );
    expect(app1AuthRoute).toBeDefined();
    expect(app1AuthRoute?.content).toContain("toNextJsHandler");

    const app1AuthLib = result.files.find(
      (f) => f.filename === "apps/customer-portal/lib/auth.ts",
    );
    expect(app1AuthLib).toBeDefined();
    expect(app1AuthLib?.content).toContain("betterAuth");

    const app1AuthClient = result.files.find(
      (f) => f.filename === "apps/customer-portal/lib/auth-client.ts",
    );
    expect(app1AuthClient).toBeDefined();
    expect(app1AuthClient?.content).toContain("createAuthClient");

    const app1AuthToken = result.files.find(
      (f) => f.filename === "apps/customer-portal/lib/auth-token.ts",
    );
    expect(app1AuthToken).toBeDefined();

    const app1Pkg = result.files.find(
      (f) => f.filename === "apps/customer-portal/package.json",
    );
    expect(app1Pkg).toBeDefined();
    const app1PkgJson = JSON.parse(app1Pkg!.content);
    expect(app1PkgJson.dependencies["better-auth"]).toBeDefined();

    // --- WebApp 2 assertions (NO Auth) ---
    const app2AuthRoute = result.files.find(
      (f) => f.filename === "apps/marketing-site/app/api/auth/[...all]/route.ts",
    );
    expect(app2AuthRoute).toBeUndefined();

    const app2AuthLib = result.files.find(
      (f) => f.filename === "apps/marketing-site/lib/auth.ts",
    );
    expect(app2AuthLib).toBeUndefined();

    const app2AuthClient = result.files.find(
      (f) => f.filename === "apps/marketing-site/lib/auth-client.ts",
    );
    expect(app2AuthClient).toBeUndefined();

    const app2AuthToken = result.files.find(
      (f) => f.filename === "apps/marketing-site/lib/auth-token.ts",
    );
    expect(app2AuthToken).toBeUndefined();

    const app2Pkg = result.files.find(
      (f) => f.filename === "apps/marketing-site/package.json",
    );
    expect(app2Pkg).toBeDefined();
    const app2PkgJson = JSON.parse(app2Pkg!.content);
    expect(app2PkgJson.dependencies["better-auth"]).toBeUndefined();

    // --- Auth is NOT a separate service assertion ---
    const authStandalone = result.files.filter(
      (f) => f.filename.startsWith("apps/customerauth/") || f.filename.startsWith("apps/customer-auth/"),
    );
    expect(authStandalone).toHaveLength(0);
  });

  it("should generate isolated Better Auth for multiple Web Apps connected to separate Auth Nodes", () => {
    const webApp1: BackendNode = {
      id: "node-app-admin",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Admin App",
        appSlug: "admin-app",
      },
    };

    const webApp2: BackendNode = {
      id: "node-app-portal",
      type: "webApp",
      position: { x: 0, y: 300 },
      fractionalIndex: "a1",
      data: {
        label: "User Portal",
        appSlug: "user-portal",
      },
    };

    const authNode1: BackendNode = {
      id: "node-auth-admin",
      type: "auth",
      position: { x: -300, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "AdminAuth",
        framework: "better_auth",
        baseUrl: "http://localhost:4000",
        port: "4000",
      },
    };

    const authNode2: BackendNode = {
      id: "node-auth-portal",
      type: "auth",
      position: { x: -300, y: 300 },
      fractionalIndex: "a3",
      data: {
        label: "PortalAuth",
        framework: "better_auth",
        baseUrl: "http://localhost:5000",
        port: "5000",
      },
    };

    const pageAdmin: BackendNode = {
      id: "node-page-admin",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a4",
      data: { label: "AdminOverview" },
    };

    const pagePortal: BackendNode = {
      id: "node-page-portal",
      type: "webPage",
      position: { x: 200, y: 300 },
      fractionalIndex: "a5",
      data: { label: "PortalDashboard" },
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-auth1-app1",
        source: "node-auth-admin",
        target: "node-app-admin",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "edge-auth2-app2",
        source: "node-auth-portal",
        target: "node-app-portal",
        type: "connection",
        fractionalIndex: "a1",
      },
      {
        id: "edge-app1-page1",
        source: "node-app-admin",
        sourceHandle: "public-in",
        target: "node-page-admin",
        type: "connection",
        fractionalIndex: "a2",
      },
      {
        id: "edge-app2-page2",
        source: "node-app-portal",
        sourceHandle: "public-in",
        target: "node-page-portal",
        type: "connection",
        fractionalIndex: "a3",
      },
    ];

    const result = compileMonorepo(
      [webApp1, webApp2, authNode1, authNode2, pageAdmin, pagePortal],
      [],
      [],
      edges,
      [],
      "MultiAuthProject",
    );

    // Verify Admin App auth client uses port 4000
    const adminAuthClient = result.files.find(
      (f) => f.filename === "apps/admin-app/lib/auth-client.ts",
    );
    expect(adminAuthClient).toBeDefined();
    expect(adminAuthClient?.content).toContain("http://localhost:4000");

    // Verify User Portal auth client uses port 5000
    const portalAuthClient = result.files.find(
      (f) => f.filename === "apps/user-portal/lib/auth-client.ts",
    );
    expect(portalAuthClient).toBeDefined();
    expect(portalAuthClient?.content).toContain("http://localhost:5000");

    // Verify neither auth node is compiled as a standalone service app
    const authStandalone = result.files.filter(
      (f) =>
        f.filename.startsWith("apps/adminauth/") ||
        f.filename.startsWith("apps/portalauth/"),
    );
    expect(authStandalone).toHaveLength(0);
  });

  it("should not generate any auth code when an Auth Node is completely disconnected", () => {
    const webApp: BackendNode = {
      id: "node-app",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Public Blog",
        appSlug: "public-blog",
      },
    };

    const page: BackendNode = {
      id: "node-page",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: { label: "Articles" },
    };

    // Disconnected Auth Node
    const disconnectedAuth: BackendNode = {
      id: "node-auth-disconnected",
      type: "auth",
      position: { x: 600, y: 600 },
      fractionalIndex: "a2",
      data: {
        label: "UnusedAuth",
        framework: "better_auth",
      },
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-app-page",
        source: "node-app",
        sourceHandle: "public-in",
        target: "node-page",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileMonorepo(
      [webApp, page, disconnectedAuth],
      [],
      [],
      edges,
      [],
      "DisconnectedAuthProject",
    );

    // WebApp should not have auth files
    expect(result.files.find((f) => f.filename === "apps/public-blog/lib/auth.ts")).toBeUndefined();
    expect(result.files.find((f) => f.filename === "apps/public-blog/lib/auth-client.ts")).toBeUndefined();
    expect(result.files.find((f) => f.filename === "apps/public-blog/lib/auth-token.ts")).toBeUndefined();
    expect(result.files.find((f) => f.filename === "apps/public-blog/app/api/auth/[...all]/route.ts")).toBeUndefined();

    // Disconnected auth node produces no standalone service
    const standaloneFiles = result.files.filter((f) => f.filename.startsWith("apps/unusedauth/"));
    expect(standaloneFiles).toHaveLength(0);
  });

  it("should not import or check auth-token on public pages when Auth Node is not connected", () => {
    const webApp: BackendNode = {
      id: "node-app-public",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Public Store",
        appSlug: "public-store",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-public",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "PublicApi",
        port: "8080",
        endpoints: [],
      },
    };

    const page: BackendNode = {
      id: "node-page-public",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "/",
        events: [
          {
            id: "evt-load-public",
            name: "pageLoad",
            event: "pageLoad",
          },
        ],
      },
    };

    const disconnectedAuth: BackendNode = {
      id: "node-auth-disconnected-2",
      type: "auth",
      position: { x: 600, y: 600 },
      fractionalIndex: "a3",
      data: {
        label: "UnconnectedAuth",
        framework: "better_auth",
      },
    };

    const endpoints = [
      {
        id: "ep-public-items",
        nodeId: "node-service-public",
        name: "/api/items",
        type: "GET" as const,
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-app-page",
        source: "node-app-public",
        sourceHandle: "public-in",
        target: "node-page-public",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "edge-page-ep",
        source: "node-page-public",
        sourceHandle: "events-evt-load-public",
        target: "node-service-public",
        targetHandle: "endpoint-in-ep-public-items",
        type: "connection",
        fractionalIndex: "a1",
      },
    ];

    const result = compileMonorepo(
      [webApp, page, serviceNode, disconnectedAuth],
      endpoints,
      [],
      edges,
      [],
      "PublicStoreProject",
    );

    const publicPage = result.files.find(
      (f) => f.filename === "apps/public-store/app/(public)/page.tsx",
    );
    expect(publicPage).toBeDefined();
    expect(publicPage?.content).not.toContain("auth-token");
    expect(publicPage?.content).not.toContain("getAuthBearerToken");

    expect(result.files.find((f) => f.filename === "apps/public-store/lib/auth-token.ts")).toBeUndefined();
  });
});
