import { describe, it, expect, vi } from "vitest";
import { isPathMatch } from "../utils";
import { renderHook, act } from "@testing-library/react";
import { useStepRowState } from "../useStepRowState";
import { PipelineStepDraft } from "../types";
import { Endpoint, BackendNode } from "@workspace/canvas/types";
import { computeDbOpBindings } from "@/lib/utils/entityOperationsHelper";

describe("pipeline-step-editor: isPathMatch", () => {
  it("matches exact path and argument name", () => {
    expect(isPathMatch("name", "name")).toBe(true);
    expect(isPathMatch("email", "email")).toBe(true);
  });

  it("matches dot-delimited nested paths with matching property name", () => {
    expect(isPathMatch("user.email", "email")).toBe(true);
    expect(isPathMatch("data.items.price", "price")).toBe(true);
    expect(isPathMatch("payload.data.userId", "userId")).toBe(true);
  });

  it("matches snake_case paths with camelCase argument names and vice versa", () => {
    expect(isPathMatch("user_id", "userId")).toBe(true);
    expect(isPathMatch("userId", "user_id")).toBe(true);
    expect(isPathMatch("first_name", "firstName")).toBe(true);
    expect(isPathMatch("created_at", "createdAt")).toBe(true);
  });

  it("does not match non-existent or unrelated fields", () => {
    expect(isPathMatch("description", "id")).toBe(false);
    expect(isPathMatch("title", "price")).toBe(false);
    expect(isPathMatch("user_id", "name")).toBe(false);
    expect(isPathMatch("", "field")).toBe(false);
    expect(isPathMatch("field", "")).toBe(false);
  });
});

describe("pipeline-step-editor: useStepRowState handleAutoMapArguments", () => {
  const mockEndpoint: Endpoint = {
    id: "ep-1",
    name: "Create Product",
    type: "POST",
    pathParams: [{ id: "p-1", name: "categoryId", type: "string", required: true }],
    queryParams: [{ id: "q-1", name: "dryRun", type: "boolean", required: false }],
    requestBody: {
      id: "rb-1",
      fields: [
        { id: "f-1", name: "title", type: "string", required: true },
        { id: "f-2", name: "price", type: "number", required: true },
      ],
    },
  };

  const mockTableNode: BackendNode = {
    id: "table-products",
    type: "entity",
    position: { x: 0, y: 0 },
    fractionalIndex: "a0",
    data: {
      label: "Product",
      tableRef: "Product",
      columns: [
        { name: "id", type: "string", isPrimaryKey: true },
        { name: "title", type: "string", isNotNull: true },
        { name: "price", type: "number", isNotNull: true },
        { name: "category_id", type: "string", isNotNull: true },
        { name: "description", type: "string", isNotNull: false },
        { name: "image_url", type: "string", isNotNull: false },
        { name: "in_stock", type: "boolean", isNotNull: false },
        { name: "created_at", type: "string", isNotNull: false },
      ],
    },
  };

  it("only adds fields that exist in request body, params, query, headers, or prior steps", () => {
    const step: PipelineStepDraft = {
      id: "step-db-1",
      name: "createProductResult",
      type: "db_operation",
      enabled: true,
      outputVariable: "createProductResult",
      tableNodeId: "table-products",
      operationId: "createProduct",
      functionRef: { name: "createProduct", importPath: "@workspace/db/helpers/Product" },
      inputBindings: [],
    };

    let updatedStep: PipelineStepDraft = step;
    const onChange = vi.fn((updated) => {
      updatedStep = updated;
    });

    const { result } = renderHook(() =>
      useStepRowState({
        step,
        index: 0,
        priorSteps: [],
        endpoint: mockEndpoint,
        allNodes: [mockTableNode],
        allEdges: [],
        onChange,
      }),
    );

    act(() => {
      result.current.handleAutoMapArguments();
    });

    expect(onChange).toHaveBeenCalled();
    const mappedArgNames = (updatedStep.inputBindings || []).map((b) => b.argName);

    // Should include existing matched fields:
    // 1. title (matched from req_body.title)
    // 2. price (matched from req_body.price)
    // 3. categoryId (matched from req_params.categoryId)
    expect(mappedArgNames).toContain("title");
    expect(mappedArgNames).toContain("price");
    expect(mappedArgNames).toContain("categoryId");

    // Should NOT include fields that do NOT exist in available sources:
    expect(mappedArgNames).not.toContain("description");
    expect(mappedArgNames).not.toContain("imageUrl");
    expect(mappedArgNames).not.toContain("inStock");
    expect(mappedArgNames).not.toContain("createdAt");

    // Verify correct source bindings
    const titleBinding = (updatedStep.inputBindings || []).find((b) => b.argName === "title");
    expect(titleBinding?.source).toEqual({ kind: "req_body", field: "title" });

    const categoryIdBinding = (updatedStep.inputBindings || []).find((b) => b.argName === "categoryId");
    expect(categoryIdBinding?.source).toEqual({ kind: "req_params", field: "categoryId" });
  });

  it("preserves existing configured bindings and custom bindings", () => {
    const step: PipelineStepDraft = {
      id: "step-db-1",
      name: "createProductResult",
      type: "db_operation",
      enabled: true,
      outputVariable: "createProductResult",
      tableNodeId: "table-products",
      operationId: "createProduct",
      functionRef: { name: "createProduct", importPath: "@workspace/db/helpers/Product" },
      inputBindings: [
        {
          argName: "description",
          source: { kind: "inline", value: "Default description" },
        },
        {
          argName: "customExtraField",
          source: { kind: "inline", value: "custom-val" },
        },
      ],
    };

    let updatedStep: PipelineStepDraft = step;
    const onChange = vi.fn((updated) => {
      updatedStep = updated;
    });

    const { result } = renderHook(() =>
      useStepRowState({
        step,
        index: 0,
        priorSteps: [],
        endpoint: mockEndpoint,
        allNodes: [mockTableNode],
        allEdges: [],
        onChange,
      }),
    );

    act(() => {
      result.current.handleAutoMapArguments();
    });

    expect(onChange).toHaveBeenCalled();
    const mappedArgNames = (updatedStep.inputBindings || []).map((b) => b.argName);

    // Existing configured description should be preserved
    expect(mappedArgNames).toContain("description");
    const descBinding = (updatedStep.inputBindings || []).find((b) => b.argName === "description");
    expect(descBinding?.source).toEqual({ kind: "inline", value: "Default description" });

    // Custom extra field should be preserved
    expect(mappedArgNames).toContain("customExtraField");
    const extraBinding = (updatedStep.inputBindings || []).find((b) => b.argName === "customExtraField");
    expect(extraBinding?.source).toEqual({ kind: "inline", value: "custom-val" });

    // Matched fields should still be added
    expect(mappedArgNames).toContain("title");
    expect(mappedArgNames).toContain("price");

    // Non-existent and unconfigured fields should NOT be added
    expect(mappedArgNames).not.toContain("imageUrl");
    expect(mappedArgNames).not.toContain("inStock");
  });

  it("unpacks kafka topic schema fields into expectedArgs and auto-maps them from request body", () => {
    const kafkaBrokerNode: BackendNode = {
      id: "node-kafka",
      type: "kafka",
      position: { x: 0, y: 0 },
      fractionalIndex: "b0",
      data: {
        label: "kafka",
        topics: [
          {
            id: "topic-message-sent",
            name: "Message Sent",
            payloadSchema: {
              id: "ps-1",
              fields: [
                { id: "f-1", name: "title", type: "string", required: true },
                { id: "f-2", name: "price", type: "number", required: true },
                { id: "f-3", name: "author", type: "string", required: false },
              ],
            },
          },
        ],
      },
    };

    const kafkaStep: PipelineStepDraft = {
      id: "step-kafka-1",
      name: "publishMessageSentResult",
      type: "kafka_publish",
      enabled: true,
      brokerNodeId: "node-kafka",
      messagingResourceId: "topic-message-sent",
      functionRef: {
        name: "publishMessageSent",
        importPath: "@workspace/kafka/publishers",
      },
      inputBindings: [],
    };

    let updatedStep: PipelineStepDraft = kafkaStep;
    const onChange = vi.fn((updated) => {
      updatedStep = updated;
    });

    const { result } = renderHook(() =>
      useStepRowState({
        step: kafkaStep,
        index: 0,
        priorSteps: [],
        endpoint: mockEndpoint,
        allNodes: [kafkaBrokerNode],
        allEdges: [],
        onChange,
      }),
    );

    // 1. Verify expectedArgs unpacked topic schema fields
    const argNames = result.current.expectedArgs.map((a) => a.name);
    expect(argNames).toContain("title");
    expect(argNames).toContain("price");
    expect(argNames).toContain("author");
    expect(argNames).toContain("key");
    expect(argNames).toContain("payload");

    // 2. Run handleAutoMapArguments
    act(() => {
      result.current.handleAutoMapArguments();
    });

    expect(onChange).toHaveBeenCalled();
    const mappedArgNames = (updatedStep.inputBindings || []).map((b) => b.argName);

    // title and price exist in mockEndpoint.requestBody
    expect(mappedArgNames).toContain("title");
    expect(mappedArgNames).toContain("price");

    const titleBinding = (updatedStep.inputBindings || []).find((b) => b.argName === "title");
    expect(titleBinding?.source).toEqual({ kind: "req_body", field: "title" });

    const priceBinding = (updatedStep.inputBindings || []).find((b) => b.argName === "price");
    expect(priceBinding?.source).toEqual({ kind: "req_body", field: "price" });

    // author does not exist in mockEndpoint, so it should not be mapped
    expect(mappedArgNames).not.toContain("author");

    // Redundant whole-object payload should not be auto-mapped when schema fields are mapped
    expect(mappedArgNames).not.toContain("payload");
  });

  it("unpacks consumedEvent schema fields into expectedArgs and auto-maps them for push_to_client", () => {
    const mockConsumedEvent: any = {
      id: "ev-kafka-message-sent",
      name: "message.sent",
      variant: "consume",
      payloadSchema: {
        fields: [
          { name: "message", type: "string", required: true },
          { name: "sender", type: "string", required: true },
          { name: "conversation_id", type: "string", required: true },
        ],
      },
    };

    const pushStep: PipelineStepDraft = {
      id: "step-push-1",
      name: "pushToClientResult",
      type: "push_to_client",
      enabled: true,
      clientDeliveryTargetPageId: "webpage-root",
      clientDeliveryProtocol: "SSE",
      clientDeliveryEventName: "message.sent.notification",
      inputBindings: [],
    };

    let updatedStep: PipelineStepDraft = pushStep;
    const onChange = vi.fn((updated) => {
      updatedStep = updated;
    });

    const { result } = renderHook(() =>
      useStepRowState({
        step: pushStep,
        index: 0,
        priorSteps: [],
        consumedEvent: mockConsumedEvent,
        allNodes: [],
        allEdges: [],
        onChange,
      }),
    );

    // 1. Verify expectedArgs unpacked topic schema fields
    const argNames = result.current.expectedArgs.map((a) => a.name);
    expect(argNames).toContain("payload");
    expect(argNames).toContain("message");
    expect(argNames).toContain("sender");
    expect(argNames).toContain("conversation_id");

    // 2. Run handleAutoMapArguments
    act(() => {
      result.current.handleAutoMapArguments();
    });

    expect(onChange).toHaveBeenCalled();
    const mappedArgNames = (updatedStep.inputBindings || []).map((b) => b.argName);
    expect(mappedArgNames).toContain("message");
    expect(mappedArgNames).toContain("sender");
    expect(mappedArgNames).toContain("conversation_id");

    const msgBinding = (updatedStep.inputBindings || []).find((b) => b.argName === "message");
    expect(msgBinding?.source).toEqual({ kind: "req_body", field: "message" });

    const senderBinding = (updatedStep.inputBindings || []).find((b) => b.argName === "sender");
    expect(senderBinding?.source).toEqual({ kind: "req_body", field: "sender" });

    const convBinding = (updatedStep.inputBindings || []).find((b) => b.argName === "conversation_id");
    expect(convBinding?.source).toEqual({ kind: "req_body", field: "conversation_id" });
  });

  it("introspects .env variables configured on service node and auto-maps matching arguments", () => {
    const serviceNode: BackendNode = {
      id: "service-main",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Main Service",
        envVars: [
          { id: "env-1", name: "STRIPE_SECRET_KEY", description: "Stripe API Key" },
          { id: "env-2", name: "APP_PORT", description: "Port" },
        ],
      },
    };

    const externalStep: PipelineStepDraft = {
      id: "step-ext-1",
      name: "stripeCharge",
      type: "transform",
      enabled: true,
      functionRef: {
        name: "stripeCharge",
        importPath: "@workspace/transformers",
        inputSchema: [
          { name: "stripe_secret_key", type: "string", required: true },
          { name: "amount", type: "number", required: true },
        ],
      },
      inputBindings: [],
    };

    let updatedStep: PipelineStepDraft = externalStep;
    const onChange = vi.fn((updated) => {
      updatedStep = updated;
    });

    const { result } = renderHook(() =>
      useStepRowState({
        step: externalStep,
        index: 0,
        priorSteps: [],
        endpoint: mockEndpoint,
        allNodes: [serviceNode],
        allEdges: [],
        serviceNodeId: "service-main",
        onChange,
      }),
    );

    // 1. Verify .env source is available with configured envVars
    const envSource = result.current.availableSources.find(
      (s) => s.id === "env" || s.kind === "env",
    );
    expect(envSource).toBeDefined();
    expect(envSource?.kind).toBe("env");
    expect(envSource?.paths.map((p) => p.path)).toContain("STRIPE_SECRET_KEY");
    expect(envSource?.paths.map((p) => p.path)).toContain("APP_PORT");

    // 2. Run handleAutoMapArguments
    act(() => {
      result.current.handleAutoMapArguments();
    });

    expect(onChange).toHaveBeenCalled();
    const stripeBinding = (updatedStep.inputBindings || []).find(
      (b) => b.argName === "stripe_secret_key",
    );
    expect(stripeBinding?.source).toEqual({
      kind: "env",
      field: "STRIPE_SECRET_KEY",
    });
  });

  it("ignores id, created_at, createdAt, updated_at, and updatedAt during automapping while mapping other fields and preserving manual bindings", () => {
    const endpointWithTimestampsAndId: Endpoint = {
      id: "ep-ts",
      name: "Update Item",
      type: "POST",
      pathParams: [{ id: "p-id", name: "id", type: "string", required: true }],
      queryParams: [],
      requestBody: {
        id: "rb-ts",
        fields: [
          { id: "f-id", name: "id", type: "string", required: true },
          { id: "f-title", name: "title", type: "string", required: true },
          { id: "f-user-id", name: "user_id", type: "string", required: true },
          { id: "f-ca", name: "created_at", type: "string", required: false },
          { id: "f-ua", name: "updated_at", type: "string", required: false },
        ],
      },
    };

    const step: PipelineStepDraft = {
      id: "step-transform-ts",
      name: "transformItem",
      type: "transform",
      enabled: true,
      functionRef: {
        name: "transformItem",
        importPath: "@workspace/transformers",
        inputSchema: [
          { name: "id", type: "string", required: false },
          { name: "title", type: "string", required: true },
          { name: "user_id", type: "string", required: true },
          { name: "created_at", type: "string", required: false },
          { name: "createdAt", type: "string", required: false },
          { name: "updated_at", type: "string", required: false },
          { name: "updatedAt", type: "string", required: false },
        ],
      },
      inputBindings: [],
    };

    let updatedStep: PipelineStepDraft = step;
    const onChange = vi.fn((updated) => {
      updatedStep = updated;
    });

    const { result, rerender } = renderHook(
      ({ currentStep }) =>
        useStepRowState({
          step: currentStep,
          index: 0,
          priorSteps: [],
          endpoint: endpointWithTimestampsAndId,
          allNodes: [],
          allEdges: [],
          onChange,
        }),
      { initialProps: { currentStep: step } },
    );

    act(() => {
      result.current.handleAutoMapArguments();
    });

    expect(onChange).toHaveBeenCalled();
    const mappedNames = (updatedStep.inputBindings || []).map((b) => b.argName);
    expect(mappedNames).toEqual(["title", "user_id"]);
    expect(mappedNames).not.toContain("id");
    expect(mappedNames).not.toContain("created_at");
    expect(mappedNames).not.toContain("createdAt");
    expect(mappedNames).not.toContain("updated_at");
    expect(mappedNames).not.toContain("updatedAt");

    // Manual configuration of id / created_at must still be preserved on re-run
    const manuallyConfiguredStep: PipelineStepDraft = {
      ...step,
      inputBindings: [
        { argName: "id", source: { kind: "req_params", field: "id" } },
        { argName: "created_at", source: { kind: "inline", value: "2026-01-01" } },
      ],
    };
    rerender({ currentStep: manuallyConfiguredStep });

    act(() => {
      result.current.handleAutoMapArguments();
    });

    expect(updatedStep.inputBindings).toEqual([
      { argName: "id", source: { kind: "req_params", field: "id" } },
      { argName: "title", source: { kind: "req_body", field: "title" } },
      { argName: "user_id", source: { kind: "req_body", field: "user_id" } },
      { argName: "created_at", source: { kind: "inline", value: "2026-01-01" } },
    ]);
  });

  it("computeDbOpBindings ignores id, created_at, and updated_at while mapping other DB columns", () => {
    const entityNode: BackendNode = {
      id: "table-items",
      type: "entity",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "items",
        tableRef: "items",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true },
          { name: "title", type: "string", isNotNull: true },
          { name: "created_at", type: "timestamptz", isNotNull: false },
          { name: "updated_at", type: "timestamptz", isNotNull: false },
        ],
      },
    };

    const availableSources = [
      {
        id: "req_params",
        kind: "req_params",
        paths: [{ path: "id", type: "string" }],
      },
      {
        id: "req_body",
        kind: "req_body",
        paths: [
          { path: "id", type: "string" },
          { path: "title", type: "string" },
          { path: "created_at", type: "string" },
          { path: "updated_at", type: "string" },
        ],
      },
    ];

    const createBindings = computeDbOpBindings(
      { id: "op-create", name: "createItem", kind: "create" } as any,
      entityNode,
      [],
      availableSources,
    );
    expect(createBindings).toEqual([
      { argName: "title", source: { kind: "req_body", field: "title" } },
    ]);

    const updateBindings = computeDbOpBindings(
      { id: "op-update", name: "updateItem", kind: "update" } as any,
      entityNode,
      [],
      availableSources,
    );
    expect(updateBindings).toEqual([
      { argName: "title", source: { kind: "req_body", field: "title" } },
    ]);
  });
});
