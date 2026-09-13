import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";
import { compileServiceNode } from "../compileServiceNode";
import { compileMonorepo } from "../compileMonorepo";

describe("Next.js App Router Service Node Compilation", () => {
  it("compiles ServiceNode with techStack: 'nextjs' into App Router route handlers", () => {
    const serviceNode: BackendNode = {
      id: "srv-api",
      type: "service",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "API Service",
        techStack: "nextjs",
        port: "8080",
        cors: true,
        corsOrigins: "http://localhost:3000",
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-1",
        nodeId: "srv-api",
        name: "/api/users",
        type: "GET",
        summary: "Get all users",
      },
      {
        id: "ep-2",
        nodeId: "srv-api",
        name: "/api/users",
        type: "POST",
        summary: "Create a user",
      },
      {
        id: "ep-3",
        nodeId: "srv-api",
        name: "/api/users/:id",
        type: "GET",
        summary: "Get user by ID",
        pathParams: [
          {
            id: "param-1",
            name: "id",
            type: "string",
            required: true,
          },
        ],
      },
      {
        id: "ep-4",
        nodeId: "srv-api",
        name: "/api/users/:id",
        type: "DELETE",
        summary: "Delete user by ID",
      },
    ];

    const result = compileServiceNode(serviceNode, endpoints, [], [serviceNode], []);

    expect(result.serviceId).toBe("srv-api");
    expect(result.serviceName).toBe("API Service");

    // Check package.json
    const packageJson = result.files.find((f) => f.filename === "package.json");
    expect(packageJson).toBeDefined();
    const pkg = JSON.parse(packageJson!.content);
    expect(pkg.dependencies.next).toBeDefined();
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.scripts.dev).toBe("next dev -p 8080");

    // Check next.config.ts has CORS configuration
    const nextConfig = result.files.find((f) => f.filename === "next.config.ts");
    expect(nextConfig).toBeDefined();
    expect(nextConfig!.content).toContain("Access-Control-Allow-Origin");
    expect(nextConfig!.content).toContain("http://localhost:3000");

    // Check grouped route: app/api/users/route.ts contains both GET and POST
    const usersRoute = result.files.find((f) => f.filename === "app/api/users/route.ts");
    expect(usersRoute).toBeDefined();
    expect(usersRoute!.content).toContain("export async function GET(");
    expect(usersRoute!.content).toContain("export async function POST(");
    expect(usersRoute!.content).toContain("export async function OPTIONS(");
    expect(usersRoute!.content).toContain('export const dynamic = "force-dynamic";');

    // Check dynamic param route: app/api/users/[id]/route.ts contains GET, DELETE, and await context.params
    const userByIdRoute = result.files.find((f) => f.filename === "app/api/users/[id]/route.ts");
    expect(userByIdRoute).toBeDefined();
    expect(userByIdRoute!.content).toContain("export async function GET(");
    expect(userByIdRoute!.content).toContain("export async function DELETE(");
    expect(userByIdRoute!.content).toContain("await context.params");
  });

  it("generates fallback health check route when no endpoints are defined", () => {
    const serviceNode: BackendNode = {
      id: "srv-empty",
      type: "service",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "Empty API",
        techStack: "nextjs",
        port: "4000",
      },
    };

    const result = compileServiceNode(serviceNode, [], [], [serviceNode], []);
    const healthRoute = result.files.find((f) => f.filename === "app/api/health/route.ts");
    expect(healthRoute).toBeDefined();
    expect(healthRoute!.content).toContain("export async function GET()");
    expect(healthRoute!.content).toContain("healthy");
  });

  it("integrates seamlessly into compileMonorepo", () => {
    const serviceNode: BackendNode = {
      id: "srv-monorepo",
      type: "service",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "Backend API",
        techStack: "nextjs",
        port: "8080",
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-1",
        nodeId: "srv-monorepo",
        name: "/api/items",
        type: "GET",
      },
    ];

    const monorepo = compileMonorepo([serviceNode], endpoints, [], []);
    const itemsRoute = monorepo.files.find((f) =>
      f.filename.endsWith("app/api/items/route.ts"),
    );
    expect(itemsRoute).toBeDefined();
    expect(itemsRoute!.filename).toMatch(/^apps\/backend-api\/app\/api\/items\/route\.ts$/);
  });

  it("colocates Next.js API routes inside the connected WebApp instead of creating a standalone app", () => {
    const webAppNode: BackendNode = {
      id: "web-1",
      type: "webApp",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "web",
        appSlug: "web-app-1",
      },
    };

    const webPageNode: BackendNode = {
      id: "page-1",
      type: "webPage",
      fractionalIndex: "a1",
      position: { x: 100, y: 0 },
      data: {
        label: "/",
        isRoot: true,
      },
    };

    const serviceNode: BackendNode = {
      id: "srv-demo",
      type: "service",
      fractionalIndex: "a2",
      position: { x: 200, y: 0 },
      data: {
        label: "demo",
        techStack: "nextjs",
        port: "8082",
      },
    };

    const edgeToPage: BackendEdge = {
      id: "edge-web-page",
      type: "connection",
      source: "web-1",
      target: "page-1",
      sourceHandle: "public-in",
      targetHandle: "page-in",
      fractionalIndex: "a0",
    };

    const edgeToService: BackendEdge = {
      id: "edge-page-service",
      type: "connection",
      source: "page-1",
      target: "srv-demo",
      sourceHandle: "events-action-1",
      targetHandle: "endpoint-in-ep-health",
      fractionalIndex: "a1",
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-health",
        nodeId: "srv-demo",
        name: "/health",
        type: "GET",
      },
    ];

    const monorepo = compileMonorepo(
      [webAppNode, webPageNode, serviceNode],
      endpoints,
      [],
      [edgeToPage, edgeToService],
    );

    // 1. Should NOT generate a dedicated standalone app apps/demo/
    const standaloneDemoFile = monorepo.files.find((f) =>
      f.filename.startsWith("apps/demo/"),
    );
    expect(standaloneDemoFile).toBeUndefined();

    // 2. Should generate route directly inside the connected WebApp: apps/web-app-1/app/api/health/route.ts
    const healthRouteInWebApp = monorepo.files.find(
      (f) => f.filename === "apps/web-app-1/app/api/health/route.ts",
    );
    expect(healthRouteInWebApp).toBeDefined();
    expect(healthRouteInWebApp!.content).toContain("export async function GET(");
  });
});
