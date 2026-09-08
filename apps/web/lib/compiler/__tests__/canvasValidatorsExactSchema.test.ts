import { describe, it, expect } from "vitest";
import {
  safePipelineStepSchema,
  backendEndpointDataValidator,
  backendEventDataValidator,
  backendNodeDataValidator,
} from "../../../../../packages/backend/convex/schema/canvasValidators";

describe("Convex canvasValidators exact schema", () => {
  it("successfully parses leaf steps (transform, db_operation, kafka_publish, etc.)", () => {
    const leafStep = {
      id: "step-1",
      name: "Fetch user",
      type: "db_operation",
      enabled: true,
      databaseId: "db-1",
      tableNodeId: "users",
      operationId: "findById",
      inputBindings: [
        {
          argName: "id",
          source: { kind: "req_params" as const, field: "userId" },
        },
      ],
      outputVariable: "userRecord",
      outputSchema: [
        { name: "id", type: "string" },
        { name: "email", type: "string" },
      ],
    };

    const parsed = safePipelineStepSchema.safeParse(leafStep);
    expect(parsed.success).toBe(true);
  });

  it("successfully parses nested control flow steps (condition with thenSteps and elseSteps)", () => {
    const conditionStep = {
      id: "cond-1",
      name: "Check admin status",
      type: "condition",
      enabled: true,
      conditionExpr: {
        left: { kind: "req_body" as const, field: "role" },
        operator: "eq" as const,
        right: { kind: "inline" as const, value: "admin" },
      },
      thenSteps: [
        {
          id: "step-then-1",
          name: "Perform Admin Action",
          type: "custom_code",
          customCode: "console.log('admin');",
        },
      ],
      elseSteps: [
        {
          id: "step-else-1",
          name: "Return 403 Forbidden",
          type: "early_return",
          statusCode: 403,
        },
      ],
    };

    const parsed = safePipelineStepSchema.safeParse(conditionStep);
    expect(parsed.success).toBe(true);
  });

  it("successfully parses switch, try_catch, parallel, and loop control flow steps", () => {
    const tryCatchStep = {
      id: "try-1",
      name: "Try payment processing",
      type: "try_catch",
      trySteps: [
        {
          id: "try-step-1",
          name: "Charge card",
          type: "service_call",
        },
      ],
      catchSteps: [
        {
          id: "catch-step-1",
          name: "Handle charge error",
          type: "early_return",
          statusCode: 400,
        },
      ],
    };

    const parsed = safePipelineStepSchema.safeParse(tryCatchStep);
    expect(parsed.success).toBe(true);
  });

  it("successfully parses langgraph_invoke steps with langGraphTargetNodeId and streaming fields", () => {
    const lgStep = {
      id: "r3xth6oj",
      name: "step3Result",
      type: "langgraph_invoke",
      enabled: true,
      inputBindings: [],
      langGraphTargetNodeId: "399b5a18-385d-4aa4-995b-edf965747fc5",
      langGraphStreamingEnabled: true,
      langGraphStreamingProtocol: "sse" as const,
      langGraphStateMapping: {
        messages: "body.message",
      },
      outputVariable: "step3Result",
    };

    const parsed = safePipelineStepSchema.safeParse(lgStep);
    expect(parsed.success).toBe(true);
  });

  it("backendEndpointDataValidator, backendEventDataValidator, backendNodeDataValidator are valid Convex validators", () => {
    expect(backendEndpointDataValidator).toBeDefined();
    expect(backendEventDataValidator).toBeDefined();
    expect(backendNodeDataValidator).toBeDefined();
  });

  it("validates external node data with envVars in externalDataSchema", async () => {
    const { externalDataSchema } = await import("@workspace/canvas/schemas");
    const externalNodeData = {
      label: "Stripe API",
      baseUrl: "https://api.stripe.com/v1",
      authType: "bearer" as const,
      apiKey: "process.env.STRIPE_SECRET_KEY",
      envVars: [
        { id: "env-1", name: "STRIPE_SECRET_KEY", description: "Secret API key" },
        { id: "env-2", name: "STRIPE_WEBHOOK_SECRET" },
      ],
    };

    const parsed = externalDataSchema.safeParse(externalNodeData);
    expect(parsed.success).toBe(true);
  });

  it("validates pipeline step with onError policy in safePipelineStepSchema", () => {
    const stepWithOnError = {
      id: "step-err-1",
      name: "Fetch Weather",
      type: "external_call",
      enabled: true,
      onError: {
        action: "early_return" as const,
        statusCode: 502,
        errorMessage: "Weather API unavailable",
        retries: 2,
      },
    };

    const parsed = safePipelineStepSchema.safeParse(stepWithOnError);
    expect(parsed.success).toBe(true);
  });

  it("validates external node data with responseSchema and errorResponseSchema", async () => {
    const { externalDataSchema } = await import("@workspace/canvas/schemas");
    const externalWithDualSchemas = {
      label: "Payment Gateway",
      baseUrl: "https://api.payment.com",
      responseSchema: {
        type: "object",
        properties: { transactionId: { type: "string" } },
      },
      errorResponseSchema: {
        type: "object",
        properties: { errorCode: { type: "string" }, message: { type: "string" } },
      },
    };

    const parsed = externalDataSchema.safeParse(externalWithDualSchemas);
    expect(parsed.success).toBe(true);
  });

  it("validates types node data with targetWebAppId, packageSources, and CustomTypeItem package metadata", async () => {
    const { typesNodeDataSchema } = await import("@workspace/canvas/schemas");
    const packageTypesData = {
      label: "Web App Package Types",
      scope: "global" as const,
      targetWebAppId: "webApp-123",
      packageSources: ["@tanstack/react-table", "recharts"],
      types: [
        {
          id: "type-1",
          name: "TableState",
          kind: "interface" as const,
          description: "Core table state definition",
          packageSource: "@tanstack/react-table",
          isReadOnly: true,
          isExtendable: true,
          fields: [
            {
              id: "f-1",
              name: "pagination",
              type: "PaginationState",
              required: true,
              isArray: false,
            },
          ],
        },
      ],
    };

    const parsed = typesNodeDataSchema.safeParse(packageTypesData);
    expect(parsed.success).toBe(true);
  });

  it("validates extended types node data with isExtended and extendedFromNodeId", async () => {
    const { typesNodeDataSchema } = await import("@workspace/canvas/schemas");
    const extendedData = {
      label: "TableState (Extended)",
      scope: "global" as const,
      isExtended: true,
      extendedFromNodeId: "types-base-123",
      types: [
        {
          id: "type-ext-1",
          name: "CustomTableState",
          kind: "interface" as const,
          isReadOnly: false,
          isExtendable: true,
          extendedFrom: "TableState",
          fields: [
            {
              id: "f-custom",
              name: "customAttribute",
              type: "string",
              required: false,
            },
          ],
        },
      ],
    };

    const parsed = typesNodeDataSchema.safeParse(extendedData);
    expect(parsed.success).toBe(true);
  });

  it("validates edge data with type reference and extension fields", async () => {
    const { edgeDataSchema } = await import("@workspace/canvas/schemas");
    const edgeData = {
      label: "extends",
      isTypeReference: true,
      isExtensionEdge: true,
      baseTypeName: "TableState",
      extendedTypeName: "CustomTableState",
    };

    const parsed = edgeDataSchema.safeParse(edgeData);
    expect(parsed.success).toBe(true);
  });

  it("validates that type-out can connect to webApp (types-in and web-app-in), service, and types nodes", async () => {
    const { isValidConnection } = await import("@workspace/canvas/validators");

    // 1. types-out to webApp (types-in)
    const res1 = isValidConnection("types", "types-out", "webApp", "types-in");
    expect(res1.valid).toBe(true);
    if (res1.valid) {
      expect(res1.edgeType).toBe("type-reference");
    }

    // 2. types-out to webApp (web-app-in legacy handle)
    const res2 = isValidConnection("types", "types-out", "webApp", "web-app-in");
    expect(res2.valid).toBe(true);
    if (res2.valid) {
      expect(res2.edgeType).toBe("type-reference");
    }

    // 3. types-out to webApp default section handle
    const res3 = isValidConnection("types", "types-out", "webApp", "section-1-in");
    expect(res3.valid).toBe(true);
    if (res3.valid) {
      expect(res3.edgeType).toBe("type-reference");
    }

    // 4. types-out to service (types-in)
    const res4 = isValidConnection("types", "types-out", "service", "types-in");
    expect(res4.valid).toBe(true);
    if (res4.valid) {
      expect(res4.edgeType).toBe("type-reference");
    }

    // 5. types-out to extended types node (types-in)
    const res5 = isValidConnection("types", "types-out", "types", "types-in");
    expect(res5.valid).toBe(true);
    if (res5.valid) {
      expect(res5.edgeType).toBe("type-reference");
    }
  });

  it("validates webPage node data with section action requestBody containing mode: field_builder", async () => {
    const { webPageDataSchema } = await import("@workspace/canvas/schemas");
    const { backendWebPageDataValidator, backendRequestBodyValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    const webPageData = {
      appSlug: "web-app",
      description: "Default landing page",
      isRoot: true,
      label: "/",
      position: { x: 1110.0, y: 585.57 },
      sections: [
        {
          id: "sec-1",
          name: "Interactive Canvas",
          actions: [
            {
              id: "evt-1788536518192-1",
              name: "pageLoad",
              event: "pageLoad",
            },
            {
              id: "fb5a003d-a9d7-4032-a9fd-f0b9eb5de9ef",
              name: "onSelectElement",
              event: "click",
              description: "Selects a node or edge element on the visual canvas graph",
              requestBody: {
                id: "rb-cv-select",
                mode: "field_builder" as const,
                fields: [
                  {
                    id: "f-cv-elem-id",
                    name: "elementId",
                    type: "string",
                    required: true,
                    description: "Selected canvas item ID",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(backendWebPageDataValidator).toBeDefined();
    expect(backendRequestBodyValidator).toBeDefined();

    const parsed = webPageDataSchema.safeParse(webPageData);
    expect(parsed.success).toBe(true);
  });
});


