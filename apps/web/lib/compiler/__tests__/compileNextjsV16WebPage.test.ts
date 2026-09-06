import { describe, it, expect } from "vitest";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, CompiledFile } from "@workspace/canvas/types";

describe("compileNextjsV16WebClient with Bearer token & headers", () => {
  it("should generate lib/auth-token.ts and pass Bearer token to authenticated endpoints", () => {
    const webPageNode: BackendNode = {
      id: "node-client-1",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/dashboard",
        appSlug: "customer-portal",
        requireAuth: true,
        headers: [
          { id: "h1", name: "X-Client-Id", type: "string", required: true, value: "client-123" },
        ],
        queryParams: [
          { id: "q1", name: "source", type: "string", required: true, value: "web" },
        ],
        requestBody: {
          id: "b1",
          rawJson: JSON.stringify({ action: "test-action" }),
        },
        events: [
          {
            id: "evt-load-1",
            name: "pageLoad",
            event: "pageLoad",
          },
          {
            id: "evt-btn-1",
            name: "SubmitOrder",
            event: "click",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-1",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "OrderService",
        port: "8080",
        endpoints: [],
      },
    };

    const authNode: BackendNode = {
      id: "node-auth-1",
      type: "auth",
      position: { x: 200, y: -200 },
      fractionalIndex: "a2",
      data: {
        label: "Auth",
        framework: "better_auth",
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-get-orders",
        nodeId: "node-service-1",
        name: "/api/orders",
        type: "GET",
        requireAuth: true,
      },
      {
        id: "ep-post-order",
        nodeId: "node-service-1",
        name: "/api/orders",
        type: "POST",
        requireAuth: true,
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-1",
        source: "node-client-1",
        target: "node-service-1",
        sourceHandle: "events-evt-load-1",
        targetHandle: "endpoint-in-ep-get-orders",
        type: "connection",
        fractionalIndex: "a0",
      },
      {
        id: "edge-2",
        source: "node-client-1",
        target: "node-service-1",
        sourceHandle: "events-evt-btn-1",
        targetHandle: "endpoint-in-ep-post-order",
        type: "connection",
        fractionalIndex: "a1",
      },
    ];

    const result = compileNextjsV16WebClient(
      [webPageNode],
      endpoints,
      [],
      [webPageNode, serviceNode, authNode],
      edges,
      "TestProject",
    );

    // 1. Verify lib/auth-token.ts was generated
    const authTokenFile = result.files.find((f: CompiledFile) => f.filename === "lib/auth-token.ts");
    expect(authTokenFile).toBeDefined();
    expect(authTokenFile?.content).toContain("export async function getAuthBearerToken()");

    // 2. Verify page.tsx includes Bearer token and headers in pageLoad
    const pageFile = result.files.find((f: CompiledFile) => f.filename.endsWith("page.tsx"));
    expect(pageFile).toBeDefined();
    expect(pageFile?.content).toContain("getAuthBearerToken");
    expect(pageFile?.content).toContain("X-Client-Id");
    expect(pageFile?.content).toContain("Authorization");

    // 3. Verify action button component passes requireAuth = true
    const actionFile = result.files.find((f: CompiledFile) => f.filename.endsWith("Action.tsx"));
    expect(actionFile).toBeDefined();
    expect(actionFile?.content).toContain("true"); // requireAuth boolean
    expect(actionFile?.content).toContain("X-Client-Id");
  });

  it("should handle endpoints with requireAuth: false without requiring token", () => {
    const webPageNode: BackendNode = {
      id: "node-client-2",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/public",
        appSlug: "web-app",
        events: [
          {
            id: "evt-btn-2",
            name: "PublicPing",
            event: "click",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-2",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "PublicService",
        port: "8081",
        endpoints: [],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-ping",
        nodeId: "node-service-2",
        name: "/api/ping",
        type: "GET",
        requireAuth: false,
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-ping",
        source: "node-client-2",
        target: "node-service-2",
        sourceHandle: "events-evt-btn-2",
        targetHandle: "endpoint-in-ep-ping",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileNextjsV16WebClient(
      [webPageNode],
      endpoints,
      [],
      [webPageNode, serviceNode],
      edges,
      "TestProject",
    );

    const actionFile = result.files.find((f: CompiledFile) => f.filename.endsWith("Action.tsx"));
    expect(actionFile).toBeDefined();
    expect(actionFile?.content).toContain("false"); // requireAuth boolean is false

    // Verify page.tsx does NOT contain "Page Load Data" or pageLoad states when no pageLoad event configured
    const pageFile = result.files.find((f: CompiledFile) => f.filename.endsWith("page.tsx"));
    expect(pageFile).toBeDefined();
    expect(pageFile?.content).not.toContain("Page Load Data");
    expect(pageFile?.content).not.toContain("pageLoadData");
    expect(pageFile?.content).not.toContain("setPageLoadData");
    expect(pageFile?.content).not.toContain("pageLoadLoading");
  });

  it("should include Page Load Data section only when pageLoad event is configured", () => {
    const webPageWithLoad: BackendNode = {
      id: "node-client-load",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/products",
        appSlug: "store",
        events: [
          {
            id: "evt-load",
            name: "fetchProducts",
            event: "pageLoad",
          },
        ],
      },
    };

    const webPageWithoutLoad: BackendNode = {
      id: "node-client-noload",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/about",
        appSlug: "store",
        events: [
          {
            id: "evt-click",
            name: "ContactUs",
            event: "click",
          },
        ],
      },
    };

    const resultWithLoad = compileNextjsV16WebClient(
      [webPageWithLoad],
      [],
      [],
      [webPageWithLoad],
      [],
      "TestProject",
    );

    const pageWithLoad = resultWithLoad.files.find((f: CompiledFile) =>
      f.filename.includes("products/page.tsx"),
    );
    expect(pageWithLoad).toBeDefined();
    expect(pageWithLoad?.content).toContain("Page Load Data");
    expect(pageWithLoad?.content).toContain("setPageLoadData");
    expect(pageWithLoad?.content).toContain("useState<JSONValue>(null)");
    expect(pageWithLoad?.content).toContain("const results: Record<string, JSONValue> = {};");
    expect(pageWithLoad?.content).toContain("useEffect");

    const resultWithoutLoad = compileNextjsV16WebClient(
      [webPageWithoutLoad],
      [],
      [],
      [webPageWithoutLoad],
      [],
      "TestProject",
    );

    const pageWithoutLoad = resultWithoutLoad.files.find((f: CompiledFile) =>
      f.filename.includes("about/page.tsx"),
    );
    expect(pageWithoutLoad).toBeDefined();
    expect(pageWithoutLoad?.content).not.toContain("Page Load Data");
    expect(pageWithoutLoad?.content).not.toContain("setPageLoadData");
    expect(pageWithoutLoad?.content).not.toContain("pageLoadData");
  });
});
