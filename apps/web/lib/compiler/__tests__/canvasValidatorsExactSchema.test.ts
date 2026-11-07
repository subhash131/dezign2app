import { describe, it, expect } from "vitest";
import {
  safePipelineStepSchema,
  backendEndpointDataValidator,
  backendEventDataValidator,
  backendNodeDataValidator,
  backendDatabaseDataValidator,
  backendEntityDataValidator,
  backendGroupDataValidator,
  backendEdgeDataValidator,
  stateStoreConvexDataValidator,
  browserStorageConvexDataValidator,
  backendBrowserStorageDataValidator,
  pageSectionConvexValidator,
  webPageConvexDataValidator,
} from "../../../../../packages/backend/convex/schema/canvasValidators";
import {
  webPageDataSchema,
  edgeDataSchema,
  stateStoreNodeDataSchema,
  browserStorageNodeDataSchema,
  databaseDataSchema,
  entityDataSchema,
  simpleDataSchema,
} from "@workspace/canvas/schemas";

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

  it("successfully parses langgraph_invoke steps with langGraphAction: 'history' and langGraphHistoryFormat", () => {
    const lgHistoryStep = {
      id: "hist-step-1",
      name: "chatHistory",
      type: "langgraph_invoke",
      langGraphAction: "history" as const,
      langGraphHistoryFormat: "chat_messages" as const,
      langGraphHistoryExcludeToolMessages: true,
      langGraphTargetNodeId: "agent-node-1",
      langGraphThreadIdSource: "params.threadId",
      outputVariable: "chatHistory",
    };

    const parsedHistory = safePipelineStepSchema.safeParse(lgHistoryStep);
    expect(parsedHistory.success).toBe(true);
    if (parsedHistory.success) {
      expect((parsedHistory.data as any).langGraphAction).toBe("history");
      expect((parsedHistory.data as any).langGraphHistoryFormat).toBe("chat_messages");
    }
    const parsed = parsedHistory;
    expect(parsed.success).toBe(true);
  });

  it("successfully parses langgraph_invoke steps with pagination fields in safePipelineStepSchema", () => {
    const lgHistoryStep = {
      id: "hist-step-paginated",
      name: "chatHistory",
      type: "langgraph_invoke",
      langGraphAction: "history" as const,
      langGraphHistoryFormat: "chat_messages" as const,
      langGraphHistoryExcludeToolMessages: true,
      langGraphHistoryPaginationEnabled: true,
      langGraphHistoryLimitSource: "query.limit",
      langGraphHistoryLimitDefault: 10,
      langGraphHistoryBeforeSource: "query.before",
      langGraphTargetNodeId: "agent-node-1",
      langGraphThreadIdSource: "params.threadId",
      outputVariable: "chatHistory",
    };

    const parsed = safePipelineStepSchema.safeParse(lgHistoryStep);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as any).langGraphHistoryPaginationEnabled).toBe(true);
      expect((parsed.data as any).langGraphHistoryLimitSource).toBe("query.limit");
      expect((parsed.data as any).langGraphHistoryLimitDefault).toBe(10);
      expect((parsed.data as any).langGraphHistoryBeforeSource).toBe("query.before");
    }
  });

  it("successfully parses push_to_client and langgraph_invoke steps with clientDeliveryPathParamBindings and clientDeliveryQueryParamBindings", async () => {
    const { pipelineStepSchema } = await import("@workspace/canvas/schemas");

    const pushStep = {
      id: "push-step-1",
      name: "pushToChat",
      type: "push_to_client",
      clientDeliveryProtocol: "SSE" as const,
      clientDeliveryTargetPageId: "page-chat-1",
      clientDeliveryPathParamBindings: {
        id: "params.chatId",
      },
      clientDeliveryQueryParamBindings: {
        tab: "query.tab",
      },
    };

    const parsedSafe = safePipelineStepSchema.safeParse(pushStep);
    expect(parsedSafe.success).toBe(true);
    if (parsedSafe.success) {
      expect((parsedSafe.data as any).clientDeliveryPathParamBindings).toEqual({ id: "params.chatId" });
      expect((parsedSafe.data as any).clientDeliveryQueryParamBindings).toEqual({ tab: "query.tab" });
    }

    const parsedCanvas = pipelineStepSchema.safeParse(pushStep);
    expect(parsedCanvas.success).toBe(true);
    if (parsedCanvas.success) {
      expect((parsedCanvas.data as any).clientDeliveryPathParamBindings).toEqual({ id: "params.chatId" });
      expect((parsedCanvas.data as any).clientDeliveryQueryParamBindings).toEqual({ tab: "query.tab" });
    }
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

  it("backendDatabaseDataValidator and backendEntityDataValidator are defined valid Convex validators", () => {
    expect(backendDatabaseDataValidator).toBeDefined();
    expect(backendEntityDataValidator).toBeDefined();
  });

  it("validates database node data with tables and column definitions in databaseDataSchema", async () => {
    const { databaseDataSchema } = await import("@workspace/canvas/schemas");
    const databaseNodeData = {
      label: "Main Postgres DB",
      dbEngine: "postgresql",
      dbType: "relational" as const,
      tables: [
        {
          id: "tbl-users",
          name: "users",
          label: "Users Table",
          columns: [
            { name: "id", type: "uuid", isPrimaryKey: true, required: true },
            { name: "email", type: "text", isNotNull: true, required: true },
          ],
        },
        {
          id: "tbl-orders",
          name: "orders",
          columns: [
            { name: "id", type: "uuid", isPrimaryKey: true },
            { name: "user_id", type: "uuid", required: true },
          ],
        },
      ],
    };

    const parsed = databaseDataSchema.safeParse(databaseNodeData);
    expect(parsed.success).toBe(true);
  });

  it("validates entity node data with dbOperations containing connectedDbIds and columns in entityDataSchema", async () => {
    const { entityDataSchema } = await import("@workspace/canvas/schemas");
    const entityNodeData = {
      label: "users",
      tableName: "users",
      dbType: "relational" as const,
      databaseId: "db-node-1",
      columns: [
        { name: "id", type: "string", isPrimaryKey: true, required: true },
        { name: "name", type: "string", isNotNull: true },
      ],
      dbOperations: [
        {
          id: "op-query-with-connected-dbs",
          name: "getUsersWithInventory",
          kind: "custom" as const,
          connectedDbIds: ["db-warehouse-2", "db-analytics-3"],
          code: "const rows = db.prepare('SELECT * FROM users').all();",
          returnType: "Record<string, string>[]",
        },
      ],
    };

    const parsed = entityDataSchema.safeParse(entityNodeData);
    expect(parsed.success).toBe(true);
  });

  it("validates db_operation pipeline step with functionRef.returnIsArray", () => {
    const dbStep = {
      id: "step-db-fetch",
      name: "Fetch users",
      type: "db_operation" as const,
      enabled: true,
      databaseId: "db-1",
      tableNodeId: "users",
      dbRefNodeId: "ref-node-1",
      operationId: "findAll",
      functionRef: {
        name: "findAllUsers",
        importPath: "@/db/operations",
        signature: "findAllUsers()",
        returnIsArray: true,
      },
      inputBindings: [],
      outputVariable: "usersList",
    };

    const parsed = safePipelineStepSchema.safeParse(dbStep);
    expect(parsed.success).toBe(true);
  });

  it("validates webPage data with section-level stateObjects and page-level stateObjects", async () => {
    const { webPageDataSchema } = await import("@workspace/canvas/schemas");
    const { webPageConvexDataValidator, pageSectionConvexValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    const webPageData = {
      label: "/",
      appSlug: "web-app-1",
      description: "Default landing page",
      isRoot: true,
      sections: [
        {
          id: "sec-1",
          name: "Hero",
          actions: [
            { id: "act-1", name: "click", event: "click" },
          ],
          stateObjects: [
            {
              id: "st-1",
              name: "items",
              type: "array",
              defaultValue: [],
              storeName: "Cart",
            },
          ],
        },
      ],
      stateObjects: [],
    };

    const zodParsed = webPageDataSchema.safeParse(webPageData);
    expect(zodParsed.success).toBe(true);

    // Convex validator structure check
    expect(webPageConvexDataValidator.fields.stateObjects).toBeDefined();
    expect(webPageConvexDataValidator.fields.sections).toBeDefined();
    expect(pageSectionConvexValidator.fields.stateObjects).toBeDefined();
  });

  it("successfully validates edgeDataSchema and stateStoreConvexDataValidator for state subscriptions", () => {
    const edgeData = {
      label: "chats",
      isStateSubscription: true,
      storeName: "conversations",
      fieldName: "chats",
      storeId: "store-1",
      fieldId: "f1",
      sectionId: "sec-1",
      stateObjectId: "st-1",
    };

    const edgeParsed = edgeDataSchema.safeParse(edgeData);
    expect(edgeParsed.success).toBe(true);
    expect(backendEdgeDataValidator).toBeDefined();

    const storeData = {
      label: "conversations",
      storeName: "conversations",
      scope: "global" as const,
      storage: "memory" as const,
      fields: [
        {
          id: "f1",
          name: "chats",
          type: "Chat[]",
          isArray: true,
          required: false,
          defaultValue: [],
        },
      ],
    };

    const storeParsed = stateStoreNodeDataSchema.safeParse(storeData);
    expect(storeParsed.success).toBe(true);
    expect(stateStoreConvexDataValidator.fields.fields).toBeDefined();
  });

  it("validates webPage actions and realtimeConnections with storeActionBinding in Convex & Zod schemas", async () => {
    const { webPageDataSchema, edgeDataSchema } = await import("@workspace/canvas/schemas");
    const { webPageConvexDataValidator, backendEdgeDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    const userConversationsPageData = {
      isLayout: false,
      label: "conversations",
      sections: [
        {
          id: "sec-msg",
          name: "MessagesSection",
          actions: [
            { event: "pageLoad", id: "evt-1790102749230", name: "pageLoad" },
            {
              event: "click",
              id: "9dek2wl",
              name: "test",
              storeActionBinding: {
                actionId: "setter-00ab7b6a-54d0-4424-a9f7-4df83fefcf6a",
                actionName: "setMessages",
                actionType: "set" as const,
                storeName: "conversationStore",
                storeNodeId: "9f4cecc9-5943-40e5-b0a2-a439fdf11b1b",
                targetFieldId: "00ab7b6a-54d0-4424-a9f7-4df83fefcf6a",
                targetFieldName: "messages",
                updateSource: "response" as const,
                valuePath: "data.messages",
              },
            },
          ],
        },
      ],
      realtimeConnections: [
        {
          id: "rtc-1",
          protocol: "SSE" as const,
          eventName: "message.new",
          streamUrl: "http://localhost:3001/events",
          storeActionBinding: {
            storeNodeId: "9f4cecc9-5943-40e5-b0a2-a439fdf11b1b",
            storeName: "conversationStore",
            actionName: "setMessages",
            actionType: "set" as const,
            targetFieldId: "00ab7b6a-54d0-4424-a9f7-4df83fefcf6a",
            targetFieldName: "messages",
            updateSource: "full_message" as const,
          },
        },
      ],
    };

    const parsedWebPage = webPageDataSchema.safeParse(userConversationsPageData);
    expect(parsedWebPage.success).toBe(true);

    const edgeData = {
      label: "bind-store",
      isStoreActionBinding: true,
      storeName: "conversationStore",
      actionName: "setMessages",
    };
    const parsedEdge = edgeDataSchema.safeParse(edgeData);
    expect(parsedEdge.success).toBe(true);

    // Verify Convex validator fields
    expect(webPageConvexDataValidator.fields.realtimeConnections).toBeDefined();
    expect(webPageConvexDataValidator.fields.sections).toBeDefined();
    expect(backendEdgeDataValidator.fields.isStoreActionBinding).toBeDefined();
    expect(backendEdgeDataValidator.fields.actionName).toBeDefined();
  });

  it("validates storeActionBinding with actionType: 'mutate' in webPage and stateStore schemas", async () => {
    const { webPageDataSchema, stateStoreNodeDataSchema } = await import(
      "@workspace/canvas/schemas"
    );
    const { storeActionBindingConvexValidator, stateStoreConvexDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    // Exact payload structure reported in user error
    const pageWithMutateBinding = {
      isLayout: false,
      label: "conversations",
      position: { x: 1754.0, y: 276.5 },
      sections: [
        {
          id: "sec-1",
          name: "Main",
          actions: [
            {
              event: "pageLoad",
              id: "evt-1790102749230",
              name: "pageLoad",
              storeActionBinding: {
                actionName: "populate",
                actionType: "populate" as const,
                storeName: "conversationStore",
                storeNodeId: "9f4cecc9-5943-40e5-b0a2-a439fdf11b1b",
                updateSource: "response" as const,
              },
            },
            {
              event: "click",
              id: "6y5l5cv",
              name: "create conversation",
              storeActionBinding: {
                actionName: "mutate",
                actionType: "mutate" as const,
                storeName: "conversationStore",
                storeNodeId: "9f4cecc9-5943-40e5-b0a2-a439fdf11b1b",
              },
            },
          ],
        },
      ],
    };

    const parsedPage = webPageDataSchema.safeParse(pageWithMutateBinding);
    expect(parsedPage.success).toBe(true);

    // Verify convex validator handles actionType: 'mutate'
    expect(storeActionBindingConvexValidator).toBeDefined();
    expect(stateStoreConvexDataValidator).toBeDefined();

    // Verify state store with default manipulator mutate
    const storeWithMutate = {
      label: "conversationStore",
      storeName: "conversationStore",
      actions: [
        {
          id: "act-mutate",
          name: "mutate",
          actionType: "mutate" as const,
          defaultManipulatorType: "mutate" as const,
        },
      ],
    };
    const parsedStore = stateStoreNodeDataSchema.safeParse(storeWithMutate);
    expect(parsedStore.success).toBe(true);
  });

  it("validates webPage actions with multi-manipulation storeActionBindings (populate, pop, etc.) in Convex & Zod schemas", async () => {
    const { webPageDataSchema } = await import("@workspace/canvas/schemas");
    const { webPageConvexDataValidator, storeActionBindingConvexValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    // Exact payload reported in user's Convex upsertBackendNode error
    const userPayload = {
      isLayout: false,
      label: "conversations",
      position: { x: 1355.0, y: 340.0 },
      sections: [
        {
          id: "sec-1",
          name: "Main",
          actions: [
            {
              event: "pageLoad",
              id: "evt-1790102749230",
              name: "pageLoad",
              storeActionBindings: [
                {
                  actionId: "manipulator-1790168561382",
                  actionName: "populate",
                  actionType: "populate" as const,
                  id: "bnd-evt-1790102749230-0",
                  parameterMappings: { conversations: "data" },
                  storeName: "conversationStore",
                  storeNodeId: "9f4cecc9-5943-40e5-b0a2-a439fdf11b1b",
                  updateSource: "response_property" as const,
                  valuePath: "data",
                },
              ],
            },
            {
              event: "click",
              id: "6y5l5cv",
              name: "create conversation",
              storeActionBindings: [
                {
                  actionId: "manipulator-pop",
                  actionName: "popMessages",
                  actionType: "pop" as const,
                  id: "bnd-6y5l5cv-0",
                  storeName: "conversationStore",
                  storeNodeId: "9f4cecc9-5943-40e5-b0a2-a439fdf11b1b",
                },
              ],
            },
          ],
        },
      ],
    };

    const parsedPage = webPageDataSchema.safeParse(userPayload);
    expect(parsedPage.success).toBe(true);

    // Verify convex validator fields
    expect(webPageConvexDataValidator.fields.sections).toBeDefined();
    expect(storeActionBindingConvexValidator.fields.id).toBeDefined();
    expect(storeActionBindingConvexValidator.fields.actionType).toBeDefined();
    expect(storeActionBindingConvexValidator.fields.parameterMappings).toBeDefined();
  });

  it("validates store action edge data with actionType, bindingId, targetFieldId, targetFieldName in Convex & Zod schemas", async () => {
    const { edgeDataSchema } = await import("@workspace/canvas/schemas");
    const { backendEdgeDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    // Exact edge data reported in user's Convex upsertBackendEdge error
    const edgeData = {
      actionName: "setMessages",
      actionType: "set",
      bindingId: "bnd-1790334765666-a6ds",
      isStoreAction: true,
      isStoreActionBinding: true,
      storeName: "conversationStore",
      targetFieldId: "00ab7b6a-54d0-4424-a9f7-4df83fefcf6a",
      targetFieldName: "messages",
    };

    const parsedEdge = edgeDataSchema.safeParse(edgeData);
    expect(parsedEdge.success).toBe(true);

    // Verify convex validator fields
    expect(backendEdgeDataValidator.fields.actionName).toBeDefined();
    expect(backendEdgeDataValidator.fields.actionType).toBeDefined();
    expect(backendEdgeDataValidator.fields.bindingId).toBeDefined();
    expect(backendEdgeDataValidator.fields.targetFieldId).toBeDefined();
    expect(backendEdgeDataValidator.fields.targetFieldName).toBeDefined();
    expect(backendEdgeDataValidator.fields.isStoreAction).toBeDefined();
    expect(backendEdgeDataValidator.fields.isStoreActionBinding).toBeDefined();
  });

  it("validates state mutation edge data with isStateMutation, label, sequenceOrder, and targetFieldId in Convex & Zod schemas", async () => {
    const { edgeDataSchema } = await import("@workspace/canvas/schemas");
    const { backendEdgeDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    // Exact edge data reported in user's Convex upsertBackendEdge error
    const edgeData = {
      isStateMutation: true,
      label: "1",
      sequenceOrder: 1,
      targetFieldId: "b6f9a896-0242-4c70-ad2d-54f10f5274ae",
    };

    const parsedEdge = edgeDataSchema.safeParse(edgeData);
    expect(parsedEdge.success).toBe(true);

    expect(backendEdgeDataValidator.fields.isStateMutation).toBeDefined();
    expect(backendEdgeDataValidator.fields.label).toBeDefined();
    expect(backendEdgeDataValidator.fields.sequenceOrder).toBeDefined();
    expect(backendEdgeDataValidator.fields.targetFieldId).toBeDefined();
  });

  it("validates StorageBucketRefNode data schema with storageOperations, bucketId, and storageNodeId in Convex & Zod schemas", async () => {
    const {
      storageOperationRefDataSchema,
      storageBucketRefDataSchema,
    } = await import("@workspace/canvas/schemas");
    const {
      backendStorageBucketRefDataValidator,
      backendStorageOperationRefDataValidator,
      backendNodeDataValidator,
    } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    const refNodeData = {
      label: "user-avatars",
      storageNodeId: "storage-node-1",
      storageProvider: "s3",
      bucketId: "user-avatars",
      bucketName: "user-avatars",
      storageOperations: [
        {
          id: "uploadObject",
          name: "uploadObject",
          kind: "upload" as const,
          label: "Upload File",
          enabled: true,
        },
      ],
    };

    const parsedOpRef = storageOperationRefDataSchema.safeParse(refNodeData);
    expect(parsedOpRef.success).toBe(true);

    const parsedBucketRef = storageBucketRefDataSchema.safeParse(refNodeData);
    expect(parsedBucketRef.success).toBe(true);

    // Verify convex validators are defined and match
    expect(backendStorageBucketRefDataValidator).toBeDefined();
    expect(backendStorageOperationRefDataValidator).toBeDefined();
    expect(backendStorageBucketRefDataValidator.fields.bucketId).toBeDefined();
    expect(backendStorageBucketRefDataValidator.fields.storageNodeId).toBeDefined();
    expect(backendStorageBucketRefDataValidator.fields.storageOperations).toBeDefined();
    expect(backendNodeDataValidator.members.length).toBeGreaterThan(10);
  });

  it("validates entity-derived types node payload with sourceEntityId, sourceEntityName, entityUpdatedAt, and entitySyncWarning in Convex & Zod schemas", async () => {
    const { typesNodeDataSchema } = await import("@workspace/canvas/schemas");
    const { backendTypesNodeDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    // Exact payload reported in user's Convex upsertBackendNode error
    const userPayload = {
      entityUpdatedAt: 1790386902884.0,
      label: "User Types",
      position: { x: 1209.0, y: 274.0 },
      scope: "global" as const,
      sourceEntityId: "36a889dc-34c2-4af4-8f7a-cad66d23f624",
      sourceEntityName: "user",
      types: [
        {
          id: "type-entity-36a889dc-34c2-4af4-8f7a-cad66d23f624",
          name: "User",
          kind: "interface" as const,
          description: "Auto-generated TypeScript interface from entity: user",
          fields: [
            {
              id: "f-type-entity-36a889dc-34c2-4af4-8f7a-cad66d23f624-0-id",
              name: "id",
              type: "string",
              required: true,
              isArray: false,
              description: "Column from user",
            },
          ],
        },
      ],
      entitySyncWarning: {
        entityId: "36a889dc-34c2-4af4-8f7a-cad66d23f624",
        entityName: "user",
        updatedAt: 1790386902884.0,
        affectedNodes: [
          {
            id: "node-service-1",
            name: "User Service",
            type: "service",
          },
        ],
        dismissed: false,
      },
    };

    const parsed = typesNodeDataSchema.safeParse(userPayload);
    expect(parsed.success).toBe(true);

    // Verify convex validator fields
    expect(backendTypesNodeDataValidator).toBeDefined();
    expect(backendTypesNodeDataValidator.fields.sourceEntityId).toBeDefined();
    expect(backendTypesNodeDataValidator.fields.sourceEntityName).toBeDefined();
    expect(backendTypesNodeDataValidator.fields.entityUpdatedAt).toBeDefined();
    expect(backendTypesNodeDataValidator.fields.entitySyncWarning).toBeDefined();
  });

  it("successfully parses database node with envVars and connection status", () => {
    const dbPayload = {
      color: "#f59e0b",
      connectionStringEnv: "DATABASE_URL",
      database: "postgres",
      dbCategory: "sql" as const,
      dbConnectionType: "env_var" as const,
      dbEngine: "postgres",
      dbFilePathEnv: "DB_FILE_PATH",
      dbType: "relational" as const,
      envVars: [
        {
          description: "POSTGRES database connection URL",
          id: "db-url",
          name: "DATABASE_URL",
        },
      ],
      isDefault: true,
      label: "postgres",
      lastConnectionStatus: {
        checkedAt: "1:42:59 PM",
        connected: true,
        latencyMs: 4.0,
        serverInfo: {
          exists: true,
          path: "D:\\ai\\dezign2app\\dev.db",
          readable: true,
          sizeBytes: 20480.0,
          status: "Connected (SQLite DB)",
        },
      },
    };

    const parsed = databaseDataSchema.safeParse(dbPayload);
    expect(parsed.success).toBe(true);

    // Also verify backendDatabaseDataValidator has envVars field
    expect(backendDatabaseDataValidator).toBeDefined();
    expect(backendDatabaseDataValidator.fields.envVars).toBeDefined();
  });

  it("validates webPage node with storage upload configuration and storageOperationBinding", async () => {
    const { webPageDataSchema } = await import("@workspace/canvas/schemas");
    const { webPageConvexDataValidator, storageOperationBindingConvexValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    // Exact payload reported in user's Convex upsertBackendNode error
    const failingPayload = {
      appSlug: "web-app-1",
      connectedStorageNodeId: "b4afff7b-290e-4b39-a196-902591b4fc47",
      description: "Default 404 not found page",
      label: "/not-found",
      position: { x: 1120.0, y: 485.75 },
      presignEndpointId: "66miezw",
      sections: [
        {
          id: "sec-404-1",
          name: "Main",
          actions: [
            {
              event: "navigateToPage",
              id: "evt-1790373194002-2",
              name: "Back to Home",
              targetPageId: "9d0d9714-5989-42e8-9418-62a783dddd3a",
              targetRoute: "/",
            },
            {
              event: "click",
              id: "5rgx7x2",
              name: "upload image",
              storageOperationBinding: {
                bucketId: "test",
                endpointId: "66miezw",
                operationName: "getUploadPresignedUrl",
                serviceNodeId: "service-1",
                storageNodeId: "b4afff7b-290e-4b39-a196-902591b4fc47",
              },
            },
          ],
        },
      ],
    };

    const parsed = webPageDataSchema.safeParse(failingPayload);
    expect(parsed.success).toBe(true);

    // Verify convex validator fields
    expect(webPageConvexDataValidator.fields.connectedStorageNodeId).toBeDefined();
    expect(webPageConvexDataValidator.fields.presignEndpointId).toBeDefined();
    expect(webPageConvexDataValidator.fields.uploadBucketId).toBeDefined();
    expect(webPageConvexDataValidator.fields.uploadAcceptedMimeTypes).toBeDefined();
    expect(webPageConvexDataValidator.fields.uploadMaxFileSizeMb).toBeDefined();
    expect(webPageConvexDataValidator.fields.uploadPreviewMode).toBeDefined();
    expect(webPageConvexDataValidator.fields.autoGeneratePresignEndpoint).toBeDefined();
    expect(storageOperationBindingConvexValidator).toBeDefined();
    expect(storageOperationBindingConvexValidator.fields.storageNodeId).toBeDefined();
    expect(storageOperationBindingConvexValidator.fields.bucketId).toBeDefined();
    expect(storageOperationBindingConvexValidator.fields.operationName).toBeDefined();
    expect(storageOperationBindingConvexValidator.fields.endpointId).toBeDefined();
    expect(storageOperationBindingConvexValidator.fields.serviceNodeId).toBeDefined();
  });

  it("validates edge with storage operation fields (bucketId, operationName, etc.) in Convex & Zod schemas", async () => {
    const { edgeDataSchema } = await import("@workspace/canvas/schemas");
    const { backendEdgeDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    // Exact payload reported in user's Convex upsertBackendEdge error
    const edgePayload = {
      bucketId: "9y7nwhr",
      label: "3",
      operationName: "uploadObject",
      sequenceOrder: 3.0,
      isStorageOperationBinding: true,
      storageNodeId: "storage-node-1",
      refNodeId: "ref-node-1",
      actionId: "act-1",
    };

    const parsed = edgeDataSchema.safeParse(edgePayload);
    expect(parsed.success).toBe(true);

    // Verify convex validator fields
    expect(backendEdgeDataValidator.fields.bucketId).toBeDefined();
    expect(backendEdgeDataValidator.fields.operationName).toBeDefined();
    expect(backendEdgeDataValidator.fields.isStorageOperationBinding).toBeDefined();
    expect(backendEdgeDataValidator.fields.actionId).toBeDefined();
    expect(backendEdgeDataValidator.fields.storageNodeId).toBeDefined();
    expect(backendEdgeDataValidator.fields.refNodeId).toBeDefined();
  });

  it("validates LangGraph checkpointer relational entity table with systemBadge and readOnly in Convex & Zod schemas", () => {
    // Exact payload reported in user's Convex upsertBackendNode error
    const userPayload = {
      columns: [
        { isNotNull: true, isPrimaryKey: true, name: "thread_id", type: "TEXT" },
        { isNotNull: true, isPrimaryKey: true, name: "checkpoint_ns", type: "TEXT" },
        { isNotNull: true, isPrimaryKey: true, name: "checkpoint_id", type: "TEXT" },
        { isNotNull: false, name: "parent_checkpoint_id", type: "TEXT" },
        { isNotNull: false, name: "type", type: "TEXT" },
        { isNotNull: true, name: "checkpoint", type: "JSON" },
        { isNotNull: true, name: "metadata", type: "JSON" },
      ],
      databaseId: "5731d649-04ec-4eaf-bb35-f8179a371c1c",
      dbType: "relational" as const,
      description: "LangGraph state checkpoints indexed by thread and run namespace",
      label: "langgraph_checkpoints",
      position: { x: 85.0, y: 320.0 },
      readOnly: true,
      systemBadge: "langgraph",
      tableName: "langgraph_checkpoints",
    };

    const parsed = entityDataSchema.safeParse(userPayload);
    expect(parsed.success).toBe(true);

    // Verify convex validator fields on backendEntityDataValidator
    expect(backendEntityDataValidator.fields.systemBadge).toBeDefined();
    expect(backendEntityDataValidator.fields.readOnly).toBeDefined();
    expect(backendEntityDataValidator.fields.isReadOnly).toBeDefined();
  });

  it("validates entity and group nodes with groupId, group, badge, and description in Convex & Zod schemas", () => {
    const entityPayload = {
      columns: [
        { isForeignKey: false, isNotNull: true, isPrimaryKey: true, isUnique: true, name: "id", type: "UUID" },
        { isNotNull: true, name: "name", type: "TEXT" },
        { isNotNull: true, isPrimaryKey: false, isUnique: true, name: "email", type: "TEXT" },
        { isNotNull: true, name: "emailVerified", type: "BOOLEAN" },
        { name: "image", type: "TEXT" },
        { isNotNull: true, name: "createdAt", type: "TEXT" },
        { isNotNull: true, name: "updatedAt", type: "TEXT" },
        { name: "role", type: "TEXT" },
        { banned: true, name: "banned", type: "BOOLEAN" },
        { name: "banReason", type: "TEXT" },
        { name: "banExpires", type: "TEXT" },
        { name: "plan", type: "TEXT" },
        { name: "creemCustomerId", type: "TEXT" },
        { name: "twoFactorEnabled", type: "BOOLEAN" },
      ],
      databaseId: "fcac98b3-79bf-49b4-a170-76c0e88c651e",
      description: "Core user accounts, emails, display names, and verification flags.",
      group: "Authentication",
      groupId: "group-auth-fcac98b3-79bf-49b4-a170-76c0e88c651e",
      indexes: [{ columns: "email", isUnique: true, name: "idx_user_email" }],
      label: "user",
      position: { x: 546.0, y: 1955.4285714285716 },
    };

    const parsedEntity = entityDataSchema.safeParse(entityPayload);
    expect(parsedEntity.success).toBe(true);

    expect(backendEntityDataValidator.fields.groupId).toBeDefined();
    expect(backendEntityDataValidator.fields.group).toBeDefined();
    expect(backendEntityDataValidator.fields.badge).toBeDefined();
    expect(backendEntityDataValidator.fields.description).toBeDefined();

    const groupPayload = {
      label: "Authentication",
      group: "auth",
      badge: "Authentication",
      description: "User authentication, sessions, accounts, and security tables",
      color: "indigo",
    };

    const parsedGroup = simpleDataSchema.safeParse(groupPayload);
    expect(parsedGroup.success).toBe(true);

    expect(backendGroupDataValidator.fields.groupId).toBeDefined();
    expect(backendGroupDataValidator.fields.group).toBeDefined();
    expect(backendGroupDataValidator.fields.badge).toBeDefined();
    expect(backendGroupDataValidator.fields.description).toBeDefined();
  });

  it("validates LangGraph checkpointer redis_schema node with systemBadge and readOnly", () => {
    const redisSchemaPayload = {
      columns: [
        { name: "checkpoint", type: "JSON", isNotNull: true },
        { name: "metadata", type: "JSON", isNotNull: true },
        { name: "parent_checkpoint_id", type: "TEXT", isNotNull: false },
      ],
      databaseId: "redis-instance-123",
      dbType: "redis" as const,
      redisDataStructure: "hash" as const,
      keyTemplate: "checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}",
      description: "LangGraph state checkpoints hash map indexed by thread and run namespace",
      label: "langgraph_checkpoints",
      position: { x: 85.0, y: 320.0 },
      readOnly: true,
      systemBadge: "langgraph",
      tableName: "langgraph_checkpoints",
    };

    const parsed = entityDataSchema.safeParse(redisSchemaPayload);
    expect(parsed.success).toBe(true);
  });

  it("validates service node with expandedStepStacks from user error payload in Convex & Zod schemas", async () => {
    const { serviceDataSchema } = await import("@workspace/canvas/schemas");
    const { backendNodeDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    // Exact payload reported in user's Convex upsertBackendNode error:
    const userPayload = {
      envVars: [
        { description: "HTTP server port (default: 8080)", id: "srv-port", name: "PORT" },
        { description: "Environment mode (development, production)", id: "srv-node-env", name: "NODE_ENV" },
        { description: "S3 Access Key ID", id: "q9vfqg4p", name: "AWS_ACCESS_KEY_ID" },
        { description: "S3 Secret Access Key", id: "4dfhx7yu", name: "AWS_SECRET_ACCESS_KEY" },
        { description: "Custom S3 endpoint URL (MinIO, R2, SeaweedFS)", id: "wi2ol059", name: "S3_ENDPOINT_URL" },
        { description: "S3 Region (e.g. us-east-1)", id: "ja2v1l66", name: "AWS_REGION" },
        { description: "Bucket name for test", id: "3l72cd0v", name: "STORAGE_BUCKET_TEST" },
        { description: "API key for LLM config (openai/gpt-oss-120b)", id: "n8jl7ps5", name: "GROQ_API_KEY" },
      ],
      expandedStepStacks: ["9lev4yp"],
      grpcPort: "50051",
      inputs: [],
      label: "profile",
      logic: [],
      outputs: [],
      port: "8080",
      position: { x: 1940.0, y: 60.0 },
    };

    const parsed = serviceDataSchema.safeParse(userPayload);
    expect(parsed.success).toBe(true);
  });

  it("validates db_ref and langgraph node with stackOrder in Convex & Zod schemas", async () => {
    const { dbRefDataSchema, langgraphDataSchema } = await import("@workspace/canvas/schemas");
    const { langgraphConvexDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    const dbRefPayload = {
      label: "users",
      tableRef: "entity-1",
      stackOrder: 1,
    };
    expect(dbRefDataSchema.safeParse(dbRefPayload).success).toBe(true);

    const lgPayload = {
      label: "Chatbot Agent",
      stackOrder: 0,
      customAgentRefNodes: [
        {
          id: "agent_ref_1",
          label: "Agent Loop Ref",
          agentRef: "master_agent_1",
          position: { x: 100, y: 200 },
        },
      ],
      customNodeRefNodes: [
        {
          id: "node_ref_1",
          label: "Node Loop Ref",
          nodeRef: "master_node_1",
          position: { x: 300, y: 400 },
        },
      ],
    };
    expect(langgraphDataSchema.safeParse(lgPayload).success).toBe(true);
    expect(langgraphConvexDataValidator.fields.stackOrder).toBeDefined();
    expect(langgraphConvexDataValidator.fields.customAgentRefNodes).toBeDefined();
    expect(langgraphConvexDataValidator.fields.customNodeRefNodes).toBeDefined();
  });

  it("validates langgraph node with agentNodePosition from user error payload in Convex & Zod schemas", async () => {
    const { langgraphDataSchema } = await import("@workspace/canvas/schemas");
    const { langgraphConvexDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    // Exact payload reported in user's Convex upsertBackendNode error:
    const userPayload = {
      agentDefinitions: [
        {
          agentId: "agentNode",
          id: "agentNode",
          llmConfig: { enabled: false },
          memory: [],
          middleware: [],
          middlewareConfig: { enabled: false },
          name: "agentNode",
          position: { x: 880.0, y: 240.0 },
          stateUpdatesConfig: { enabled: false },
          tools: [],
          transformers: [],
        },
      ],
      agentNodePosition: { x: 880.0, y: 240.0 },
      checkpointerNodePosition: { x: 80.0, y: 360.0 },
      endNodePosition: { x: 1300.0, y: 290.0 },
      envVars: [
        {
          description: "API key for Groq LLM provider",
          id: "lg-groq-key",
          name: "GROQ_API_KEY",
        },
      ],
      graphEdges: [
        {
          id: "edge_START_agentNode",
          source: "START",
          sourceHandle: "out",
          targetHandle: "in",
          targets: [{ id: "agentNode", kind: "step", targetHandle: "in" }],
        },
        {
          id: "edge_agentNode_END",
          source: "agentNode",
          sourceHandle: "out",
          targetHandle: "in",
          targets: [{ id: "END", kind: "end", targetHandle: "in" }],
        },
      ],
      graphSteps: [],
      inputChannels: [
        {
          id: "input_message",
          key: "message",
          required: true,
          source: "request",
          stateChannelKey: "messages",
          type: "string",
        },
      ],
      label: "LangGraph Agent",
      memoryConfig: {
        autoSummarize: true,
        checkpointer: "postgres",
        enabled: false,
        maxWindowMessages: 10.0,
        threadScope: "session",
      },
      position: { x: 2972.6153846153848, y: 729.5504807692308 },
      startNodePosition: { x: 460.0, y: 180.0 },
      stateChannels: [
        {
          defaultValue: [],
          key: "messages",
          reducer: "add_messages",
          type: "messages",
        },
      ],
      stateNodePosition: { x: 80.0, y: 120.0 },
    };

    const parsed = langgraphDataSchema.safeParse(userPayload);
    expect(parsed.success).toBe(true);
    expect(langgraphConvexDataValidator.fields.agentNodePosition).toBeDefined();
  });

  it("validates web page node with section componentBindings from user error payload in Convex & Zod schemas", async () => {
    const { webPageDataSchema } = await import("@workspace/canvas/schemas");
    const { pageSectionConvexValidator, webPageConvexDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    const userPayload = {
      connectedStorageNodeId: "b4afff7b-290e-4b39-a196-902591b4fc47",
      isLayout: false,
      label: "/c/[id]/demo",
      pathParams: [{ id: "of0eni6", name: "id", required: true, type: "string" }],
      position: { x: 1734.0, y: 149.0 },
      presignEndpointId: "66miezw",
      queryParams: [
        { defaultValue: "20", description: "Page size", id: "qp-limit-1791475087932", name: "limit", required: false, type: "number" },
        { defaultValue: "0", description: "Offset / skip count", id: "qp-offset-1791475087933", name: "offset", required: false, type: "number" },
      ],
      realtimeConnections: [],
      sections: [
        {
          actions: [
            {
              actionSteps: [
                {
                  edgeId: "edge-action-evt-1790591204692-047b9138-5644-44f9-9532-3e053c13ad7a-488b829c-16ea-4955-ad95-996e4ddbc250-1791519715264",
                  endpointId: "51860e88-b7bc-4e3b-a27c-a3e533529559",
                  id: "step-1791519715273-tkv2e",
                  order: 1.0,
                  requestBindings: [],
                  serviceNodeId: "892b4770-c7c3-4d30-84e7-6b1ec38bad16",
                  type: "api_call",
                },
              ],
              event: "pageLoad",
              id: "evt-1790591204692",
              name: "pageLoad",
            },
            {
              actionSteps: [
                {
                  edgeId: "edge-1790742199177-xngr8",
                  endpointId: "9lev4yp",
                  id: "edge-1790742199177-xngr8",
                  order: 1.0,
                  requestBindings: [],
                  serviceNodeId: "047b9138-5644-44f9-9532-3e053c13ad7a",
                  type: "api_call",
                },
                {
                  id: "step-1791548358770-46s1n",
                  order: 2.0,
                  queryParamKey: "limit",
                  queryParamMode: "set",
                  queryParamNavMode: "replace",
                  queryParamScroll: false,
                  queryParamValueSource: { fieldName: "", kind: "user_input" },
                  queryParamsUpdates: [
                    { key: "limit", mode: "set", valueSource: { fieldName: "", kind: "user_input" } },
                    { key: "offset", mode: "set", valueSource: { kind: "state_var", stateKey: "selectedTab" } },
                  ],
                  type: "update_query_params",
                },
              ],
              event: "click",
              id: "tbs4d4j",
              name: "send message",
            },
          ],
          componentBindings: [
            {
              actionId: "evt-1790591204692",
              actionName: "pageLoad",
              componentType: "button",
              id: "comp-1791730141120-95wv",
              label: "pageLoad",
              name: "pageLoad Button",
              triggerEvent: "click",
              valueSourceType: "store",
              valueStateName: "data",
              valueStoreName: "MainSectionStore",
              variant: "default",
            },
          ],
          id: "sec-1790591204692",
          loadStrategy: "eager",
          name: "Main Section",
          renderMode: "server",
          stateObjects: [
            {
              defaultValue: {},
              fieldId: "f-1791563819191-2",
              id: "state-1791563831198-hpx7",
              name: "data",
              renderConfig: {
                component: "card",
                fallbackText: "adsdas",
                label: "hello",
                prefix: "dads",
                propMappings: { readOnly: true },
                suffix: "dsa",
              },
              storeId: "store-node-1791563819191-lm1i",
              storeName: "MainSectionStore",
              storeNodeId: "store-node-1791563819191-lm1i",
              type: "object",
            },
            {
              defaultValue: false,
              fieldId: "f-1791563819191-1",
              id: "state-1791563845368-lcxw",
              name: "isLoading",
              storeId: "store-node-1791563819191-lm1i",
              storeName: "MainSectionStore",
              storeNodeId: "store-node-1791563819191-lm1i",
              type: "boolean",
            },
          ],
        },
      ],
      stackOrder: 1.0,
      uploadBucketId: "test",
    };

    const parsed = webPageDataSchema.safeParse(userPayload);
    expect(parsed.success).toBe(true);
    expect(pageSectionConvexValidator.fields.componentBindings).toBeDefined();
    expect(webPageConvexDataValidator.fields.sections).toBeDefined();
  });

  it("validates web page node with composite multi-component componentBindings containing elements", async () => {
    const compositePayload = {
      label: "/c/[id]/demo",
      position: { x: 1744.0, y: 462.0 },
      isLayout: false,
      connectedStorageNodeId: "b4afff7b-290e-4b39-a196-902591b4fc47",
      presignEndpointId: "66miezw",
      pathParams: [{ id: "of0eni6", name: "id", required: true, type: "string" }],
      queryParams: [{ defaultValue: "20", id: "qp-1", name: "limit", required: false, type: "number" }],
      realtimeConnections: [],
      sections: [
        {
          id: "sec-composite-1",
          name: "Composite Section",
          actions: [],
          componentBindings: [
            {
              id: "comp-composite-1",
              name: "UserForm",
              componentType: "input",
              label: "User Form",
              elements: [
                {
                  id: "el-1",
                  name: "EmailInput",
                  elementType: "input",
                  label: "Email",
                  placeholder: "Enter email...",
                  valueStateName: "email",
                  valueStoreName: "UserStore",
                  propMappings: { inputType: "email", debounceUpdate: true },
                },
                {
                  id: "el-2",
                  name: "SubmitButton",
                  elementType: "button",
                  label: "Submit",
                  variant: "default",
                  actionId: "act-submit",
                  actionName: "submitAction",
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = webPageDataSchema.safeParse(compositePayload);
    expect(parsed.success).toBe(true);
  });

  it("validates browser_storage node data in Convex and Zod schemas", () => {
    expect(browserStorageConvexDataValidator).toBeDefined();
    expect(backendBrowserStorageDataValidator).toBeDefined();
    expect(backendNodeDataValidator).toBeDefined();

    const userPayload = {
      keys: [
        {
          defaultValue: "",
          description: "Authentication / Session Token",
          id: "0d62870d-42d0-4c4b-a31f-21679ead2222",
          name: "auth_token",
          type: "string",
        },
      ],
      label: "BrowserStorage",
      namespace: "",
      position: { x: 1639.0570302133115, y: 586.3811664967001 },
      storageEngine: "localStorage" as const,
      storageName: "BrowserStorage",
    };

    const parsed = browserStorageNodeDataSchema.safeParse(userPayload);
    expect(parsed.success).toBe(true);
  });

  it("validates webPage node data with LangGraph realtime connections in Zod and Convex schemas", async () => {
    const { webPageDataSchema } = await import("@workspace/canvas/schemas");
    const { realtimeConnectionConvexValidator, webPageConvexDataValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    const langgraphPageData = {
      isLayout: false,
      label: "/chat/[id]",
      pathParams: [
        { id: "param-id", name: "id", required: true, type: "string" },
      ],
      position: { x: 2401.0, y: 216.13888925893298 },
      realtimeConnections: [
        {
          description: "send-message/:id",
          eventName: "message",
          id: "step-langgraph-1792659298445-sb5z",
          isLangGraph: true,
          langGraphStreamModes: ["messages"],
          langGraphStreamingFields: [],
          langGraphTargetNodeId: "e2a2e9a8-dcc1-4422-802e-9b3e0d9eefbe",
          protocol: "SSE" as const,
          sourceEventId: "ubifohs",
          sourceItemName: "send-message/:id",
          sourceItemType: "endpoint" as const,
          sourceServiceLabel: "Conversations",
          sourceServiceNodeId: "c3f60469-228a-4a1e-b5cd-3484a0d8e86b",
        },
      ],
      sections: [
        {
          id: "sec-chat",
          name: "ChatSection",
          actions: [
            {
              id: "evt-1792918032760",
              name: "pageLoad",
              event: "pageLoad",
              actionSteps: [
                {
                  edgeId: "edge-action-evt-1792918032760-3a2f7f5a-79a8-4b4c-8937-73d876fb53b1-1792990642511",
                  id: "step-1792990642516-crlvm",
                  order: 1.0,
                  stateActionName: "set",
                  stateKey: "message",
                  stateReducerName: "message_reducer",
                  stateStoreNodeId: "3a2f7f5a-79a8-4b4c-8937-73d876fb53b1",
                  stateTargetFieldId: "b6f9a896-0242-4c70-ad2d-54f10f5274ae",
                  stateTargetKind: "store",
                  stateUpdateType: "set",
                  stateValueSource: { kind: "literal" as const, value: "" },
                  type: "state_mutation" as const,
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = webPageDataSchema.safeParse(langgraphPageData);
    expect(parsed.success).toBe(true);

    expect(realtimeConnectionConvexValidator.fields.isLangGraph).toBeDefined();
    expect(realtimeConnectionConvexValidator.fields.langGraphStreamModes).toBeDefined();
    expect(realtimeConnectionConvexValidator.fields.langGraphStreamingFields).toBeDefined();
    expect(realtimeConnectionConvexValidator.fields.langGraphStreamIncludeReasoning).toBeDefined();
    expect(realtimeConnectionConvexValidator.fields.langGraphTargetNodeId).toBeDefined();
    expect(realtimeConnectionConvexValidator.fields.sourceServiceName).toBeDefined();
    expect(realtimeConnectionConvexValidator.fields.sourceServicePort).toBeDefined();
    expect(webPageConvexDataValidator.fields.groupId).toBeDefined();
    expect(webPageConvexDataValidator.fields.group).toBeDefined();
    expect(webPageConvexDataValidator.fields.badge).toBeDefined();
    expect(webPageConvexDataValidator.fields.graphPosition).toBeDefined();
    expect(webPageConvexDataValidator.fields.realtimeConnections).toBeDefined();
  });

  it("validates webPage node data with array item actions, itemEvents, and itemContextFields in Zod and Convex validators", async () => {
    const { webPageDataSchema } = await import("@workspace/canvas/schemas");
    const { webPageConvexDataValidator, webPageEventConvexValidator, pageStateObjectConvexValidator, pageSectionConvexValidator } = await import(
      "../../../../../packages/backend/convex/schema/canvasValidators"
    );

    const userPayload = {
      isLayout: false,
      label: "/chat/[id]",
      pathParams: [{ id: "param-id", name: "id", required: true, type: "string" }],
      position: { x: 2401.0, y: 145.13888925893298 },
      realtimeConnections: [
        {
          id: "step-langgraph-1792659298445-sb5z",
          protocol: "SSE" as const,
          description: "send-message/:id",
          eventName: "send-message/:id",
          sourceEventId: "ubifohs",
          sourceItemName: "send-message/:id",
          sourceItemType: "endpoint" as const,
          sourceServiceLabel: "Conversations",
          sourceServiceNodeId: "c3f60469-228a-4a1e-b5cd-3484a0d8e86b",
          actionSteps: [
            {
              id: "step-1792961454450-di5qk",
              order: 1.0,
              stateKey: "stateVar",
              stateTargetKind: "local" as const,
              stateUpdateType: "set",
              stateValueSource: { kind: "literal" as const, value: "" },
              type: "state_mutation" as const,
            },
          ],
        },
      ],
      sections: [
        {
          id: "sec-chat",
          name: "ChatSection",
          actions: [
            {
              id: "evt-item-1792918032760",
              name: "messagesItemClick",
              event: "click",
              scope: "item" as const,
              itemSourceStateId: "state-messages-123",
              itemContextFields: ["id"],
              url: "/api/chat/message",
              method: "POST",
              actionSteps: [
                {
                  edgeId: "edge-action-evt-1792918032760-3a2f7f5a-79a8-4b4c-8937-73d876fb53b1-1792990642511",
                  id: "step-1792990642516-crlvm",
                  order: 1.0,
                  stateActionName: "set",
                  stateKey: "message",
                  stateReducerName: "message_reducer",
                  stateStoreNodeId: "3a2f7f5a-79a8-4b4c-8937-73d876fb53b1",
                  stateTargetFieldId: "b6f9a896-0242-4c70-ad2d-54f10f5274ae",
                  stateTargetKind: "store" as const,
                  stateUpdateType: "set",
                  stateValueSource: { kind: "literal" as const, value: "" },
                  type: "state_mutation" as const,
                },
              ],
            },
          ],
          stateObjects: [
            {
              id: "state-messages-123",
              name: "messages",
              type: "Message[]",
              defaultValue: [],
              itemKeyField: "id",
              itemSchema: [{ name: "id", type: "string" }, { name: "content", type: "string" }],
              itemEvents: [
                {
                  id: "evt-item-1792918032760",
                  name: "messagesItemClick",
                  event: "click",
                  scope: "item" as const,
                  itemSourceStateId: "state-messages-123",
                  itemContextFields: ["id"],
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = webPageDataSchema.safeParse(userPayload);
    expect(parsed.success).toBe(true);

    expect(webPageEventConvexValidator.fields.scope).toBeDefined();
    expect(webPageEventConvexValidator.fields.itemSourceStateId).toBeDefined();
    expect(webPageEventConvexValidator.fields.itemContextFields).toBeDefined();
    expect(webPageEventConvexValidator.fields.url).toBeDefined();
    expect(webPageEventConvexValidator.fields.method).toBeDefined();
    expect(pageStateObjectConvexValidator.fields.itemKeyField).toBeDefined();
    expect(pageStateObjectConvexValidator.fields.itemSchema).toBeDefined();
    expect(pageStateObjectConvexValidator.fields.itemEvents).toBeDefined();
    expect(pageSectionConvexValidator.fields.states).toBeDefined();
  });
});





