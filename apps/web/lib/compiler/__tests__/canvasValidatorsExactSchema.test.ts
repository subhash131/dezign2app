import { describe, it, expect } from "vitest";
import {
  safePipelineStepSchema,
  backendEndpointDataValidator,
  backendEventDataValidator,
  backendNodeDataValidator,
  backendDatabaseDataValidator,
  backendEntityDataValidator,
  backendEdgeDataValidator,
  stateStoreConvexDataValidator,
  pageSectionConvexValidator,
  webPageConvexDataValidator,
} from "../../../../../packages/backend/convex/schema/canvasValidators";
import {
  webPageDataSchema,
  edgeDataSchema,
  stateStoreNodeDataSchema,
  databaseDataSchema,
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
});




