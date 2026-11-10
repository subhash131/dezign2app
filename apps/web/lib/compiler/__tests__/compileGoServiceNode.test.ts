import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";
import { compileServiceNode } from "../compileServiceNode";
import { compileMonorepo } from "../compileMonorepo";

describe("Go (Golang / Gin) Service Node Compilation", () => {
  it("compiles ServiceNode with techStack: 'go' into a Gin microservice with headers, params, body, and returns", () => {
    const serviceNode: BackendNode = {
      id: "srv-orders",
      type: "service",
      fractionalIndex: "a0",
      position: { x: 0, y: 0 },
      data: {
        label: "Order Service",
        techStack: "go",
        port: "8081",
        cors: true,
        corsOrigins: "http://localhost:3000",
      },
    };

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-get-orders",
        nodeId: "srv-orders",
        name: "/api/v1/orders",
        type: "GET",
        summary: "Get list of orders",
        queryParams: [
          {
            id: "qp-status",
            name: "status",
            type: "string",
            required: false,
            defaultValue: "all",
          },
          {
            id: "qp-limit",
            name: "limit",
            type: "int",
            required: false,
          },
        ],
        headers: [
          {
            id: "hdr-tenant",
            name: "X-Tenant-ID",
            type: "string",
            required: true,
          },
        ],
      },
      {
        id: "ep-create-order",
        nodeId: "srv-orders",
        name: "/api/v1/orders",
        type: "POST",
        summary: "Create a new order",
        headers: [
          {
            id: "hdr-auth",
            name: "Authorization",
            type: "string",
            required: true,
          },
        ],
        requestBody: {
          id: "req-create-order",
          rawJson: JSON.stringify({
            customer_id: "cust_123",
            amount: 99.5,
            items: ["item_1", "item_2"],
          }),
        },
        responseBody: {
          id: "res-create-order",
          rawJson: JSON.stringify({
            order_id: "ord_999",
            status: "created",
          }),
        },
      },
      {
        id: "ep-get-order-by-id",
        nodeId: "srv-orders",
        name: "/api/v1/orders/:id",
        type: "GET",
        summary: "Get single order by ID",
        pathParams: [
          {
            id: "pp-id",
            name: "id",
            type: "string",
            required: true,
          },
        ],
      },
    ];

    const result = compileServiceNode(serviceNode, endpoints);

    // 1. Verify service identity
    expect(result.serviceId).toBe("srv-orders");
    expect(result.serviceName).toBe("Order Service");

    // 2. Verify files emitted
    const filenames = result.files.map((f) => f.filename);
    expect(filenames).toContain("main.go");
    expect(filenames).toContain("go.mod");
    expect(filenames).toContain("package.json");
    expect(filenames).toContain(".air.toml");
    expect(filenames).toContain("README.md");
    expect(filenames).toContain("models/models.go");
    expect(filenames).toContain("routes/router.go");
    expect(filenames).toContain("routes/health.go");

    // 3. Verify main.go configuration
    const mainGo = result.files.find((f) => f.filename === "main.go")?.content || "";
    expect(mainGo).toContain('package main');
    expect(mainGo).toContain('port = "8081"');
    expect(mainGo).toContain('"github.com/gin-gonic/gin"');
    expect(mainGo).toContain('"github.com/gin-contrib/cors"');
    expect(mainGo).toContain('"order-service/routes"');
    expect(mainGo).toContain('routes.RegisterRoutes(r)');
    expect(mainGo).toContain('srv.Shutdown(ctx)');

    // 4. Verify go.mod
    const goMod = result.files.find((f) => f.filename === "go.mod")?.content || "";
    expect(goMod).toContain("module order-service");
    expect(goMod).toContain("go 1.23");
    expect(goMod).toContain("github.com/gin-gonic/gin v1.10.0");

    // 5. Verify models.go (structs with json and binding tags)
    const modelsGo = result.files.find((f) => f.filename === "models/models.go")?.content || "";
    expect(modelsGo).toContain("type PostApiV1OrdersRequest struct");
    expect(modelsGo).toContain('json:"customer_id"');
    expect(modelsGo).toContain('json:"amount"');
    expect(modelsGo).toContain('json:"items"');
    expect(modelsGo).toContain("type PostApiV1OrdersResponse struct");
    expect(modelsGo).toContain('json:"order_id"');

    // 6. Verify Router has all endpoints registered
    const routerGo = result.files.find((f) => f.filename === "routes/router.go")?.content || "";
    expect(routerGo).toContain('r.GET("/health", HealthHandler)');
    expect(routerGo).toContain('r.GET("/api/v1/orders", GetApiV1OrdersHandler)');
    expect(routerGo).toContain('r.POST("/api/v1/orders", PostApiV1OrdersHandler)');
    expect(routerGo).toContain('r.GET("/api/v1/orders/:id", GetApiV1OrdersByIdHandler)');

    // 7. Verify GET /api/v1/orders (Query params and Headers extraction)
    const getOrdersGo = result.files.find((f) => f.filename === "routes/get_api_v1_orders.go")?.content || "";
    expect(getOrdersGo).toContain('c.DefaultQuery("status", "all")');
    expect(getOrdersGo).toContain('c.Query("limit")');
    expect(getOrdersGo).toContain('c.GetHeader("X-Tenant-ID")');
    expect(getOrdersGo).toContain('http.StatusBadRequest');
    expect(getOrdersGo).toContain('Header \'X-Tenant-ID\' is required');
    expect(getOrdersGo).toContain('c.JSON(http.StatusOK');

    // 8. Verify POST /api/v1/orders (Request body binding and 201 Created return)
    const postOrdersGo = result.files.find((f) => f.filename === "routes/post_api_v1_orders.go")?.content || "";
    expect(postOrdersGo).toContain('c.GetHeader("Authorization")');
    expect(postOrdersGo).toContain('var req models.PostApiV1OrdersRequest');
    expect(postOrdersGo).toContain('c.ShouldBindJSON(&req)');
    expect(postOrdersGo).toContain('c.JSON(http.StatusCreated');

    // 9. Verify GET /api/v1/orders/:id (Path param extraction)
    const getOrderByIdGo = result.files.find((f) => f.filename === "routes/get_api_v1_orders_by_id.go")?.content || "";
    expect(getOrderByIdGo).toContain('id := c.Param("id")');
    expect(getOrderByIdGo).toContain('Path parameter \'id\' is required');
  });

  it("compiles seamlessly inside compileMonorepo alongside frontends", () => {
    const nodes: BackendNode[] = [
      {
        id: "srv-auth",
        type: "service",
        fractionalIndex: "a0",
        position: { x: 0, y: 0 },
        data: {
          label: "Auth Service",
          techStack: "go",
          port: "8000",
        },
      },
    ];

    const endpoints: (Endpoint & { nodeId: string })[] = [
      {
        id: "ep-login",
        nodeId: "srv-auth",
        name: "/auth/login",
        type: "POST",
        requestBody: {
          id: "req-login",
          rawJson: JSON.stringify({ email: "user@example.com", password: "secretpassword" }),
        },
      },
    ];

    const result = compileMonorepo(nodes, endpoints, [], [], [], "test-project");

    // All files should be placed in apps/auth-service/
    const authFiles = result.files.filter((f) => f.filename.startsWith("apps/auth-service/"));
    expect(authFiles.length).toBeGreaterThan(5);

    const mainGoFile = authFiles.find((f) => f.filename === "apps/auth-service/main.go");
    expect(mainGoFile).toBeDefined();
    expect(mainGoFile?.content).toContain('"auth-service/routes"');

    // Dockerfile for auth-service should be Go multi-stage build
    const dockerfile = result.files.find((f) => f.filename === "apps/auth-service/Dockerfile");
    expect(dockerfile).toBeDefined();
    expect(dockerfile?.content).toContain("FROM golang:1.23-alpine AS builder");
    expect(dockerfile?.content).toContain("FROM alpine:3.20 AS runner");
  });
});

