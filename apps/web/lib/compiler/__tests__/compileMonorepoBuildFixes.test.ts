import { describe, it, expect } from "vitest";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";

describe("compileMonorepo Build Fixes & Consistency", () => {
  it("should generate matching type definitions and imports for services with database operations", () => {
    const productsNode: BackendNode = {
      id: "node-products-1",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Products",
        port: "8081",
      },
    };

    const productEntityNode: BackendNode = {
      id: "node-entity-product",
      type: "entity",
      position: { x: 0, y: 200 },
      fractionalIndex: "a1",
      data: {
        label: "Products",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "name", type: "string", isNotNull: true },
          { name: "price", type: "number", isNotNull: true },
        ],
      },
    };

    const createProductEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-create-product",
      nodeId: "node-products-1",
      name: "/create-product",
      type: "POST",
      summary: "Create a new product",
      requestBody: {
        id: "req-1",
        rawJson: JSON.stringify({ name: "Widget", price: 99.99 }),
      },
      responseBody: {
        id: "res-1",
        rawJson: JSON.stringify({
          status: 201,
          message: "Successfully executed POST /create-product",
        }),
      },
      databaseNodeIds: ["node-entity-product"],
      crudOperations: {
        "node-entity-product": ["create"],
      },
    };

    const edges: BackendEdge[] = [
      {
        id: "edge-service-db",
        source: "node-products-1",
        target: "node-entity-product",
        type: "connection",
        fractionalIndex: "a0",
      },
    ];

    const result = compileMonorepo(
      [productsNode, productEntityNode],
      [createProductEndpoint],
      [],
      edges,
      [],
      "TestProductMonorepo",
    );

    // 1. Verify @workspace/types generates ProductsPostCreateProductResponse with strictly typed data?: Products
    const typesRouteFile = result.files.find(
      (f) => f.filename === "packages/types/src/products/postCreateProduct.ts",
    );
    expect(typesRouteFile).toBeDefined();
    expect(typesRouteFile?.content).toContain("export interface ProductsPostCreateProductResponse");
    expect(typesRouteFile?.content).toContain("data?: Products;");
    expect(typesRouteFile?.content).toContain('import type { Products } from "../entities";');
    expect(typesRouteFile?.content).toContain("export const productsPostCreateProductBodySchema");

    // 2. Verify apps/products/src/routes/postCreateProduct.ts imports ProductsPostCreateProductResponse
    const serviceRouteFile = result.files.find(
      (f) => f.filename === "apps/products/src/routes/postCreateProduct.ts",
    );
    expect(serviceRouteFile).toBeDefined();
    expect(serviceRouteFile?.content).toContain("ProductsPostCreateProductResponse");
    expect(serviceRouteFile?.content).toContain("ProductsPostCreateProductParams");
    expect(serviceRouteFile?.content).toContain("productsPostCreateProductBodySchema");
    expect(serviceRouteFile?.content).toContain("createdProducts");
  });

  it("should handle multiple services and maintain synchronized type names without collision", () => {
    const serviceNode1: BackendNode = {
      id: "node-service-1",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Service",
        port: "8080",
      },
    };

    const serviceNode2: BackendNode = {
      id: "node-service-2",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Products",
        port: "8081",
      },
    };

    const ep1: Endpoint & { nodeId: string } = {
      id: "ep-1",
      nodeId: "node-service-1",
      name: "/status",
      type: "GET",
    };

    const ep2: Endpoint & { nodeId: string } = {
      id: "ep-2",
      nodeId: "node-service-2",
      name: "/create-product",
      type: "POST",
    };

    const result = compileMonorepo(
      [serviceNode1, serviceNode2],
      [ep1, ep2],
      [],
      [],
      [],
      "MultiServiceMonorepo",
    );

    // Verify service 1 types and route
    const service1Route = result.files.find(
      (f) => f.filename === "apps/service/src/routes/getStatus.ts",
    );
    expect(service1Route).toBeDefined();
    expect(service1Route?.content).toContain("ServiceGetStatusResponse");

    const typesService1 = result.files.find(
      (f) => f.filename === "packages/types/src/service/getStatus.ts",
    );
    expect(typesService1).toBeDefined();
    expect(typesService1?.content).toContain("ServiceGetStatusResponse");

    // Verify service 2 types and route
    const service2Route = result.files.find(
      (f) => f.filename === "apps/products/src/routes/postCreateProduct.ts",
    );
    expect(service2Route).toBeDefined();
    expect(service2Route?.content).toContain("ProductsPostCreateProductResponse");

    const typesService2 = result.files.find(
      (f) => f.filename === "packages/types/src/products/postCreateProduct.ts",
    );
    expect(typesService2).toBeDefined();
    expect(typesService2?.content).toContain("ProductsPostCreateProductResponse");
  });

  it("should sanitize WebApp and WebClient slugs and clean trailing hyphens", () => {
    const webAppNode: BackendNode = {
      id: "node-webapp-1",
      type: "webApp",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Super App ",
        appSlug: "super-app-",
      },
    };

    const webClientNode: BackendNode = {
      id: "node-page-1",
      type: "webPage",
      position: { x: 0, y: 100 },
      fractionalIndex: "a1",
      data: {
        label: "Dashboard",
        appSlug: "super-app-",
      },
    };

    const result = compileMonorepo(
      [webAppNode, webClientNode],
      [],
      [],
      [],
      [],
      "WebAppSlugTest",
    );

    expect(result.webClients?.length).toBe(1);
    expect(result.webClients?.[0]?.folderName).toBe("super-app");

    const packageJsonFile = result.files.find(
      (f) => f.filename === "apps/super-app/package.json",
    );
    expect(packageJsonFile).toBeDefined();
    const pkg = JSON.parse(packageJsonFile!.content);
    expect(pkg.name).toBe("@workspace/super-app");
    expect(pkg.dependencies.zod).toBe("^3.24.2");
  });

  it("should compile four-service setup (Products, Service, Super, Super App) with full type consistency", () => {
    const serviceNode: BackendNode = {
      id: "node-service",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Service",
        port: "8080",
        endpoints: [
          // Leftover legacy endpoint in data that is NOT in global endpoints
          { id: "stale-ep", name: "/create-product", type: "POST" },
        ],
      },
    };

    const productsNode: BackendNode = {
      id: "node-products",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Products",
        port: "8081",
      },
    };

    const superNode: BackendNode = {
      id: "node-super",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "Super",
        port: "8082",
      },
    };

    const superAppNode: BackendNode = {
      id: "node-super-app",
      type: "webApp",
      position: { x: 600, y: 0 },
      fractionalIndex: "a3",
      data: {
        label: "Super App",
        appSlug: "super-app",
      },
    };

    const createProductEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-create-product",
      nodeId: "node-products",
      name: "/create-product",
      type: "POST",
      summary: "Create product in products service",
      requestBody: {
        id: "req-create-product",
        rawJson: JSON.stringify({ name: "Phone", price: 699 }),
      },
    };

    const result = compileMonorepo(
      [serviceNode, productsNode, superNode, superAppNode],
      [createProductEndpoint],
      [],
      [],
      [],
      "FourAppsMonorepo",
    );

    // 1. Verify types package generates products/postCreateProduct.ts with ProductsPostCreateProduct types
    const productsTypeFile = result.files.find(
      (f) => f.filename === "packages/types/src/products/postCreateProduct.ts",
    );
    expect(productsTypeFile).toBeDefined();
    expect(productsTypeFile?.content).toContain("ProductsPostCreateProductBody");
    expect(productsTypeFile?.content).toContain("ProductsPostCreateProductResponse");
    expect(productsTypeFile?.content).toContain("productsPostCreateProductBodySchema");

    // 2. Verify apps/products has postCreateProduct.ts with matching types and strictly typed error response
    const productsRouteFile = result.files.find(
      (f) => f.filename === "apps/products/src/routes/postCreateProduct.ts",
    );
    expect(productsRouteFile).toBeDefined();
    expect(productsRouteFile?.content).toContain("ProductsPostCreateProductBody");
    expect(productsRouteFile?.content).toContain("ProductsPostCreateProductErrorResponse");
    expect(productsRouteFile?.content).not.toContain("details?: any");

    // 3. Verify apps/service does NOT resurrect stale create-product endpoint and uses healthRoute instead
    const serviceRouteFile = result.files.find(
      (f) => f.filename === "apps/service/src/routes/postCreateProduct.ts",
    );
    expect(serviceRouteFile).toBeUndefined();

    const serviceHealthFile = result.files.find(
      (f) => f.filename === "apps/service/src/routes/healthRoute.ts",
    );
    expect(serviceHealthFile).toBeDefined();

    // 4. Verify apps/super uses healthRoute
    const superHealthFile = result.files.find(
      (f) => f.filename === "apps/super/src/routes/healthRoute.ts",
    );
    expect(superHealthFile).toBeDefined();

    // 5. Verify apps/super-app has package.json with zod ^3.24.2
    const superAppPkg = result.files.find(
      (f) => f.filename === "apps/super-app/package.json",
    );
    expect(superAppPkg).toBeDefined();
    const parsedPkg = JSON.parse(superAppPkg!.content);
    expect(parsedPkg.dependencies.zod).toBe("^3.24.2");
  });

  it("should generate portable ReturnType<typeof betterAuth> in lib/auth.ts to avoid TS2742 error", () => {
    const authNode: BackendNode = {
      id: "node-auth-1",
      type: "auth",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Auth",
        framework: "better_auth",
        version: "v1.6",
      },
    };

    const webAppNode: BackendNode = {
      id: "node-webapp-1",
      type: "webApp",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Super",
        appSlug: "super",
        authNodeId: "node-auth-1",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-web-1",
      type: "webPage",
      position: { x: 200, y: 100 },
      fractionalIndex: "a2",
      data: {
        label: "Super",
        appSlug: "super",
      },
    };

    const dbNode: BackendNode = {
      id: "node-db-1",
      type: "database",
      position: { x: 0, y: 200 },
      fractionalIndex: "a3",
      data: {
        label: "SQLite DB",
        dbEngine: "sqlite",
      },
    };

    const edgeToApp: BackendEdge = {
      id: "edge-web-app",
      source: "node-web-1",
      target: "node-webapp-1",
      sourceHandle: "page-in",
      targetHandle: "public-in",
      type: "connection",
      fractionalIndex: "a0",
    };

    const result = compileMonorepo(
      [authNode, webAppNode, webPageNode, dbNode],
      [],
      [],
      [edgeToApp],
      [],
      "AuthTypeMonorepo",
    );

    // 1. Verify lib/auth.ts contains typed betterAuth instance and Auth type export
    const authFile = result.files.find((f) => f.filename === "apps/super/lib/auth.ts");
    expect(authFile).toBeDefined();
    expect(authFile?.content).toContain("export const auth = betterAuth({");
    expect(authFile?.content).toContain("export type Auth = typeof auth;");

    // 2. Verify packages/db/*/connection.ts contains turbopackIgnore comments
    const dbConnFile = result.files.find((f) => f.filename.includes("packages/db/") && f.filename.endsWith("connection.ts"));
    expect(dbConnFile).toBeDefined();
    expect(dbConnFile?.content).toContain("/* turbopackIgnore: true */");
  });

  it("should never use raw random endpoint IDs in route filenames, handler names, or types, but instead generate meaningful full names", () => {
    const notifNode: BackendNode = {
      id: "node-notif-service",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Notification Service",
        port: "8082",
      },
    };

    const productsNode: BackendNode = {
      id: "node-products-service",
      type: "service",
      position: { x: 200, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Products",
        port: "8083",
      },
    };

    // Endpoints with random database IDs as name / id
    const notifEndpoint: Endpoint & { nodeId: string } = {
      id: "tohz6eq",
      nodeId: "node-notif-service",
      name: "/tohz6eq",
      type: "GET",
      responseBody: {
        id: "res-notif",
        rawJson: JSON.stringify({ notifications: [] }),
      },
    };

    const productsEndpoint: Endpoint & { nodeId: string } = {
      id: "zaz4xx1",
      nodeId: "node-products-service",
      name: "zaz4xx1",
      type: "GET",
      responseBody: {
        id: "res-prod",
        rawJson: JSON.stringify({ items: [] }),
      },
    };

    const result = compileMonorepo(
      [notifNode, productsNode],
      [notifEndpoint, productsEndpoint],
      [],
      [],
      [],
      "RandomIdFixMonorepo",
    );

    // 1. Verify NO random IDs like getTohz6eq or getZaz4xx1 in routes
    const notifRoute = result.files.find((f) =>
      f.filename.startsWith("apps/notification-service/src/routes/") && f.filename !== "apps/notification-service/src/routes/index.ts"
    );
    expect(notifRoute).toBeDefined();
    expect(notifRoute?.filename).not.toContain("tohz6eq");
    expect(notifRoute?.filename).toBe("apps/notification-service/src/routes/getNotificationService.ts");
    expect(notifRoute?.content).not.toContain("Tohz6eq");
    expect(notifRoute?.content).toContain("NotificationServiceGetNotificationServiceResponse");

    const productsRoute = result.files.find((f) =>
      f.filename.startsWith("apps/products/src/routes/") && f.filename !== "apps/products/src/routes/index.ts"
    );
    expect(productsRoute).toBeDefined();
    expect(productsRoute?.filename).not.toContain("zaz4xx1");
    expect(productsRoute?.filename).toBe("apps/products/src/routes/getProducts.ts");
    expect(productsRoute?.content).not.toContain("Zaz4xx1");
    expect(productsRoute?.content).toContain("ProductsGetProductsResponse");

    // 2. Verify @workspace/types generates matching type definitions without random IDs
    const notifTypeFile = result.files.find(
      (f) => f.filename === "packages/types/src/notification_service/getNotificationService.ts" ||
             f.filename === "packages/types/src/notificationService/getNotificationService.ts"
    );
    expect(notifTypeFile).toBeDefined();
    expect(notifTypeFile?.content).toContain("export interface NotificationServiceGetNotificationServiceResponse");
    expect(notifTypeFile?.content).not.toContain("Tohz6eq");

    const productsTypeFile = result.files.find(
      (f) => f.filename === "packages/types/src/products/getProducts.ts"
    );
    expect(productsTypeFile).toBeDefined();
    expect(productsTypeFile?.content).toContain("export interface ProductsGetProductsResponse");
    expect(productsTypeFile?.content).not.toContain("Zaz4xx1");
  });

  it("should generate flexible ResponseContext and response interface that permits returning arbitrary step outputs such as body without TS2345", () => {
    const serviceNode: BackendNode = {
      id: "node-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversations",
        port: "8082",
      },
    };

    const sendMessageEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-message",
      nodeId: "node-conversations",
      name: "/sendMessage",
      type: "POST",
      summary: "Send a message",
      requestBody: {
        id: "req-send-msg",
        rawJson: JSON.stringify({ demo: "hello" }),
      },
      pipelineSteps: [
        {
          id: "step-return",
          type: "return_response",
          name: "Return Body",
          enabled: true,
          statusCode: 201,
          inputBindings: [
            {
              argName: "data",
              source: { kind: "req_body" },
            },
          ],
        },
      ],
    };

    const result = compileMonorepo(
      [serviceNode],
      [sendMessageEndpoint],
      [],
      [],
      [],
      "TestConversationsMonorepo",
    );

    const routeFile = result.files.find(
      (f) => f.filename === "apps/conversations/src/routes/postSendMessage.ts",
    );
    expect(routeFile).toBeDefined();
    expect(routeFile?.content).toContain("return res.status(201).json(body);");
    expect(routeFile?.content).toContain("ConversationsPostSendMessageResponseContext =");
    expect(routeFile?.content).toContain("| Response<");
    // Typed union — must NOT contain any
    expect(routeFile?.content).not.toContain("json: (data?: any) => any;");
    expect(routeFile?.content).not.toContain(": any");

    const typesFile = result.files.find(
      (f) => f.filename === "packages/types/src/conversations/postSendMessage.ts",
    );
    expect(typesFile).toBeDefined();
    expect(typesFile?.content).toMatch(/export (type|interface) ConversationsPostSendMessageResponse/);
    // Typed interface/alias — must NOT contain index signature with any
    expect(typesFile?.content).not.toContain("[key: string]: any;");
  });

  it("should permit returning step output field like createConversationResult.message without TS2345 error", () => {
    const serviceNode: BackendNode = {
      id: "node-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversations",
        port: "8082",
      },
    };

    const entityNode: BackendNode = {
      id: "node-conversation",
      type: "entity",
      position: { x: 100, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "Conversation",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string", isNotNull: true },
        ],
      },
    };

    const sendMessageEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-send-message",
      nodeId: "node-conversations",
      name: "/sendMessage",
      type: "POST",
      summary: "Send a message",
      pipelineSteps: [
        {
          id: "step-create",
          type: "db_operation",
          name: "Create Conversation",
          enabled: true,
          outputVariable: "createConversationResult",
          tableNodeId: "node-conversation",
          functionRef: {
            name: "createConversation",
            importPath: "@workspace/db",
          },
        },
        {
          id: "step-return",
          type: "return_response",
          name: "Return Message",
          enabled: true,
          statusCode: 201,
          inputBindings: [
            {
              argName: "data",
              source: { kind: "step_output", stepId: "step-create", field: "message" },
            },
          ],
        },
      ],
    };

    const result = compileMonorepo(
      [serviceNode, entityNode],
      [sendMessageEndpoint],
      [],
      [],
      [],
      "TestConversationsStepOutputMonorepo",
    );

    const routeFile = result.files.find(
      (f) => f.filename === "apps/conversations/src/routes/postSendMessage.ts",
    );
    expect(routeFile).toBeDefined();
    expect(routeFile?.content).toContain("return res.status(201).json(createConversationResult.message);");
    expect(routeFile?.content).toContain("ConversationsPostSendMessageResponseContext =");
    expect(routeFile?.content).toContain("| Response<");
    expect(routeFile?.content).not.toContain(": any");

    const typesFile = result.files.find(
      (f) => f.filename === "packages/types/src/conversations/postSendMessage.ts",
    );
    expect(typesFile).toBeDefined();
    expect(typesFile?.content).toContain("export type ConversationsPostSendMessageResponse = string | undefined;");
  });

  it("should generate ConversationsGetHealthCheck types and barrel exports in @workspace/types and infer return types from EndpointConfig or ServiceNode", () => {
    const serviceNode: BackendNode = {
      id: "node-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversations",
        port: "8082",
      },
    };

    // Default endpoint initialized by ServiceNode.tsx
    const healthEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-health",
      nodeId: "node-conversations",
      name: "/",
      type: "GET",
      summary: "Health check",
      businessLogic: "Test the health of the server",
    };

    const result = compileMonorepo(
      [serviceNode],
      [healthEndpoint],
      [],
      [],
      [],
      "HealthCheckMonorepo",
    );

    // 1. Verify packages/types generates conversations/getHealthCheck.ts
    const typesFile = result.files.find(
      (f) => f.filename === "packages/types/src/conversations/getHealthCheck.ts",
    );
    expect(typesFile).toBeDefined();
    expect(typesFile?.content).toContain("export type ConversationsGetHealthCheckParams = Record<string, string>;");
    expect(typesFile?.content).toContain("export type ConversationsGetHealthCheckQuery = Record<string, string>;");
    expect(typesFile?.content).toContain("export type ConversationsGetHealthCheckBody = never;");
    expect(typesFile?.content).toContain("export interface ConversationsGetHealthCheckResponse");
    expect(typesFile?.content).toContain("message: string;");
    expect(typesFile?.content).not.toContain("status: number;");

    // 2. Verify packages/types/src/conversations/index.ts exports getHealthCheck
    const serviceBarrel = result.files.find(
      (f) => f.filename === "packages/types/src/conversations/index.ts",
    );
    expect(serviceBarrel).toBeDefined();
    expect(serviceBarrel?.content).toContain('export * from "./getHealthCheck";');

    // 3. Verify packages/types/src/index.ts exports conversations
    const mainBarrel = result.files.find(
      (f) => f.filename === "packages/types/src/index.ts",
    );
    expect(mainBarrel).toBeDefined();
    expect(mainBarrel?.content).toContain('export * from "./conversations";');

    // 4. Verify apps/conversations has getHealthCheck.ts route importing from @workspace/types
    const routeFile = result.files.find(
      (f) => f.filename === "apps/conversations/src/routes/getHealthCheck.ts",
    );
    expect(routeFile).toBeDefined();
    expect(routeFile?.content).toContain("ConversationsGetHealthCheckParams");
    expect(routeFile?.content).toContain("ConversationsGetHealthCheckQuery");
    expect(routeFile?.content).toContain("ConversationsGetHealthCheckBody");
    expect(routeFile?.content).toContain("ConversationsGetHealthCheckResponse");
    expect(routeFile?.content).not.toContain("status: 200,");
    expect(routeFile?.content).toContain('message: "Successfully executed GET /"');
  });

  it("should infer custom return types from EndpointConfig responseBody or pipelineSteps instead of hardcoding health types", () => {
    const serviceNode: BackendNode = {
      id: "node-conversations",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Conversations",
        port: "8082",
      },
    };

    // Endpoint at / with custom schema configured via EndpointConfig
    const customEndpoint: Endpoint & { nodeId: string } = {
      id: "ep-root",
      nodeId: "node-conversations",
      name: "/",
      type: "GET",
      summary: "Get Service Overview",
      responseBody: {
        id: "res-overview",
        fields: [
          { id: "f-1", name: "version", type: "string", required: true, key: "version", value: "" },
          { id: "f-2", name: "activeConnections", type: "number", required: true, key: "activeConnections", value: "" },
          { id: "f-3", name: "healthy", type: "boolean", required: true, key: "healthy", value: "" },
        ],
      },
    };

    const result = compileMonorepo(
      [serviceNode],
      [customEndpoint],
      [],
      [],
      [],
      "CustomOverviewMonorepo",
    );

    const typesFile = result.files.find(
      (f) => f.filename === "packages/types/src/conversations/getServiceOverview.ts" ||
             f.filename === "packages/types/src/conversations/getRoot.ts",
    );
    expect(typesFile).toBeDefined();
    // Must infer custom fields from EndpointConfig, NOT hardcoded status/service/timestamp
    expect(typesFile?.content).toContain("version: string;");
    expect(typesFile?.content).toContain("activeConnections: number;");
    expect(typesFile?.content).toContain("healthy: boolean;");
  });
});


