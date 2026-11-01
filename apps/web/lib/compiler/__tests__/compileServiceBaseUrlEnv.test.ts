import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint, CompiledFile } from "@workspace/canvas/types";
import { resolveBaseUrlInfo } from "../webClients/nextjs/v16/event-generators/paramUtils";
import { generateSimpleButtonEventTemplate } from "../webClients/nextjs/v16/event-generators/templates/simpleButtonEventTemplate";
import { generateInteractiveFormEventTemplate } from "../webClients/nextjs/v16/event-generators/templates/interactiveFormEventTemplate";
import { resolveEventParameters } from "../webClients/nextjs/v16/event-generators/resolveEventParameters";
import { generateEnvFilesForNode } from "../generators/generateEnvFile";
import { compileNextjsV16WebClient } from "../webClients/nextjs/v16";

describe("Base URL as Environment Variable for Connected Services", () => {
  it("resolveBaseUrlInfo correctly extracts origin, env names, and expressions", () => {
    const info = resolveBaseUrlInfo("http://localhost:8081/test-route", "DemoService");

    expect(info.hasBaseUrl).toBe(true);
    expect(info.origin).toBe("http://localhost:8081");
    expect(info.routePath).toBe("/test-route");
    expect(info.envVarName).toBe("DEMO_SERVICE_BASE_URL");
    expect(info.publicEnvVarName).toBe("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL");
    expect(info.baseUrlDeclaration).toContain("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL");
    expect(info.baseUrlDeclaration).toContain("DEMO_SERVICE_BASE_URL");
    expect(info.baseUrlDeclaration).toContain("http://localhost:8081");
    expect(info.urlExpression).toBe("`${baseUrl}/test-route`");
  });

  it("resolveBaseUrlInfo gracefully handles relative or hash URLs", () => {
    const hashInfo = resolveBaseUrlInfo("#");
    expect(hashInfo.hasBaseUrl).toBe(false);
    expect(hashInfo.urlExpression).toBe('"#"');

    const relativeInfo = resolveBaseUrlInfo("/api/local");
    expect(relativeInfo.hasBaseUrl).toBe(false);
    expect(relativeInfo.urlExpression).toBe('"/api/local"');
  });

  it("generateSimpleButtonEventTemplate emits baseUrl env var resolution in handleClick", () => {
    const code = generateSimpleButtonEventTemplate({
      componentName: "TestAction",
      eventName: "test",
      eventType: "click",
      url: "http://localhost:8081/test-route",
      upperMethod: "GET",
      requireAuth: true,
      typeDefs: [],
      serviceName: "DemoService",
    });

    expect(code).toContain("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL");
    expect(code).toContain("DEMO_SERVICE_BASE_URL");
    expect(code).toContain("http://localhost:8081");
    expect(code).toContain("`${baseUrl}/test-route`");
    expect(code).not.toContain('"http://localhost:8081/test-route"');
  });

  it("generateInteractiveFormEventTemplate resolves origin with baseUrl env var", () => {
    const params = resolveEventParameters({
      url: "http://localhost:8081/test-route",
      method: "GET",
      customQueryParams: { search: "test" },
    });

    const code = generateInteractiveFormEventTemplate({
      componentName: "TestFormAction",
      eventName: "test",
      eventType: "click",
      url: "http://localhost:8081/test-route",
      upperMethod: "GET",
      requireAuth: true,
      typeDefs: [],
      params,
      serviceName: "DemoService",
    });

    expect(code).toContain("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL");
    expect(code).toContain("DEMO_SERVICE_BASE_URL");
    expect(code).toContain("computeFinalUrl");
  });

  it("generateEnvFilesForNode creates both NEXT_PUBLIC_<SERVICE>_BASE_URL and <SERVICE>_BASE_URL for webApp", () => {
    const webAppNode: BackendNode = {
      id: "node-app",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "My Web App",
        appSlug: "my-app",
        envVars: [],
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page",
      type: "webPage",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Home Page",
        appSlug: "my-app",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "DemoService",
        port: "8081",
        endpoints: [],
      },
    };

    const edge: BackendEdge = {
      id: "e-page-service",
      source: "node-page",
      target: "node-service",
      type: "connection",
      fractionalIndex: "a0",
    };

    const { env, envExample } = generateEnvFilesForNode(
      webAppNode,
      [webAppNode, webPageNode, serviceNode],
      [edge],
      [webPageNode],
    );

    expect(env).toContain("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL=http://localhost:8081");
    expect(env).not.toContain("\nDEMO_SERVICE_BASE_URL=");
    expect(envExample).toContain("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL=<http://localhost:8081>");
    expect(envExample).not.toContain("\nDEMO_SERVICE_BASE_URL=");
  });

  it("compileNextjsV16WebClient end-to-end creates .env with base URL and Action component with env expression", () => {
    const pageNode: BackendNode = {
      id: "node-page-test",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Test Page",
        appSlug: "test-app",
        sections: [
          {
            id: "sec-test",
            name: "Test Section",
            renderMode: "client",
            actions: [
              {
                id: "act-test",
                name: "test",
                event: "click",
              },
            ],
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-demo-service",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "DemoService",
        port: "8081",
        endpoints: [],
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-test",
        nodeId: "node-demo-service",
        name: "/test-route",
        type: "GET",
      },
    ];

    const edges: BackendEdge[] = [
      {
        id: "edge-test",
        source: "node-page-test",
        target: "node-demo-service",
        sourceHandle: "events-act-test",
        targetHandle: "endpoint-in-ep-test",
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
      "TestApp",
    );

    // Verify .env file
    const envFile = result.files.find((f: CompiledFile) => f.filename === ".env");
    expect(envFile).toBeDefined();
    expect(envFile?.content).toContain("NEXT_PUBLIC_DEMO_SERVICE_BASE_URL=http://localhost:8081");
    expect(envFile?.content).toContain("DEMO_SERVICE_BASE_URL=http://localhost:8081");

    // Verify Action component file
    const actionFile = result.files.find((f: CompiledFile) => f.filename.endsWith("TestAction.tsx"));
    expect(actionFile).toBeDefined();
    const actionCode = actionFile?.content || "";
    expect(actionCode).toContain("process.env.NEXT_PUBLIC_DEMO_SERVICE_BASE_URL");
    expect(actionCode).toContain("process.env.DEMO_SERVICE_BASE_URL");
    expect(actionCode).toContain("http://localhost:8081");
    expect(actionCode).toContain("`${baseUrl}/test-route`");
    expect(actionCode).not.toContain('"http://localhost:8081/test-route"');
  });
});
