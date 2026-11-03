import { describe, it, expect } from "vitest";
import { isBindingSourceConfigured, isStepInputUnconfigured } from "../stepValidation";
import { isNodePipelineUnconfigured } from "../nodeValidation";
import { PipelineStepDraft } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor/types";

describe("pipeline-validation: isBindingSourceConfigured", () => {
  it("treats whole payload (field: '') as configured for req_body", () => {
    expect(
      isBindingSourceConfigured({
        argName: "payload",
        source: { kind: "req_body", field: "" },
      }),
    ).toBe(true);
  });

  it("treats specific field path as configured for req_body", () => {
    expect(
      isBindingSourceConfigured({
        argName: "message",
        source: { kind: "req_body", field: "message" },
      }),
    ).toBe(true);
  });

  it("treats whole step output (field: '') as configured for step_output", () => {
    expect(
      isBindingSourceConfigured({
        argName: "payload",
        source: { kind: "step_output", stepId: "step-1", field: "" },
      }),
    ).toBe(true);
  });

  it("treats empty stepId as unconfigured for step_output", () => {
    expect(
      isBindingSourceConfigured({
        argName: "payload",
        source: { kind: "step_output", stepId: "", field: "" },
      }),
    ).toBe(false);
  });

  it("treats non-empty inline value as configured", () => {
    expect(
      isBindingSourceConfigured({
        argName: "key",
        source: { kind: "inline", value: "custom-value" },
      }),
    ).toBe(true);
  });

  it("treats empty inline value as unconfigured", () => {
    expect(
      isBindingSourceConfigured({
        argName: "key",
        source: { kind: "inline", value: "" },
      }),
    ).toBe(false);
  });
});

describe("pipeline-validation: isStepInputUnconfigured for push_to_client", () => {
  it("returns false (configured) when bound to whole event payload", () => {
    const step: PipelineStepDraft = {
      id: "step-push-1",
      name: "pushDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryTargetPageId: "webpage-root",
      clientDeliveryProtocol: "SSE",
      clientDeliveryEventName: "message.sent.notification",
      inputBindings: [
        {
          argName: "payload",
          source: { kind: "req_body", field: "" },
        },
      ],
    };

    expect(isStepInputUnconfigured(step, [])).toBe(false);
  });

  it("returns false (configured) when bound to individual schema fields", () => {
    const step: PipelineStepDraft = {
      id: "step-push-1",
      name: "pushDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryTargetPageId: "webpage-root",
      clientDeliveryProtocol: "SSE",
      clientDeliveryEventName: "message.sent.notification",
      inputBindings: [
        {
          argName: "message",
          source: { kind: "req_body", field: "message" },
        },
        {
          argName: "sender",
          source: { kind: "req_body", field: "sender" },
        },
        {
          argName: "conversation_id",
          source: { kind: "req_body", field: "conversation_id" },
        },
      ],
    };

    expect(isStepInputUnconfigured(step, [])).toBe(false);
  });

  it("returns true (unconfigured) when no input bindings exist", () => {
    const step: PipelineStepDraft = {
      id: "step-push-1",
      name: "pushDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryTargetPageId: "webpage-root",
      clientDeliveryProtocol: "SSE",
      inputBindings: [],
    };

    expect(isStepInputUnconfigured(step, [])).toBe(true);
  });

  it("returns true (unconfigured) when target page is missing", () => {
    const step: PipelineStepDraft = {
      id: "step-push-1",
      name: "pushDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryProtocol: "SSE",
      inputBindings: [
        {
          argName: "payload",
          source: { kind: "req_body", field: "" },
        },
      ],
    };

    expect(isStepInputUnconfigured(step, [])).toBe(true);
  });
});

describe("pipeline-validation: isStepInputUnconfigured for db_operation", () => {
  const mockTableNode = {
    id: "table-conversations",
    type: "entity",
    data: {
      label: "conversations",
      tableRef: "conversations",
      columns: [
        { name: "id", type: "string", isPrimaryKey: true },
        { name: "title", type: "string", isNotNull: true },
        { name: "description", type: "string", isNotNull: false },
      ],
    },
  } as any;

  it("returns false (configured, no error) for findAll function with zero arguments", () => {
    const step: PipelineStepDraft = {
      id: "step-db-1",
      name: "findAllConversationsResult",
      type: "db_operation",
      enabled: true,
      tableNodeId: "table-conversations",
      operationId: "auto-find-all-conversations",
      functionRef: {
        name: "findAllConversations",
        importPath: "@workspace/db/helpers/conversations",
      },
      inputBindings: [],
    };

    expect(isStepInputUnconfigured(step, [mockTableNode])).toBe(false);
  });

  it("returns false (configured) for findAll function when optional limit/offset are mapped", () => {
    const step: PipelineStepDraft = {
      id: "step-db-1",
      name: "findAllConversationsResult",
      type: "db_operation",
      enabled: true,
      tableNodeId: "table-conversations",
      operationId: "auto-find-all-conversations",
      functionRef: {
        name: "findAllConversations",
        importPath: "@workspace/db/helpers/conversations",
      },
      inputBindings: [
        { argName: "limit", source: { kind: "inline", value: "20" } },
      ],
    };

    expect(isStepInputUnconfigured(step, [mockTableNode])).toBe(false);
  });

  it("returns true (unconfigured error) when create operation has fields with empty map (unconfigured source)", () => {
    const step: PipelineStepDraft = {
      id: "step-db-2",
      name: "createConversationResult",
      type: "db_operation",
      enabled: true,
      tableNodeId: "table-conversations",
      operationId: "auto-create-conversations",
      functionRef: {
        name: "createConversation",
        importPath: "@workspace/db/helpers/conversations",
      },
      // Pre-populated fields with empty map
      inputBindings: [
        { argName: "title", source: { kind: "req_body", field: "" } },
        { argName: "description", source: { kind: "req_body", field: "" } },
      ],
    };

    expect(isStepInputUnconfigured(step, [mockTableNode])).toBe(true);
  });

  it("returns false (configured, no error) when create operation fields are properly mapped", () => {
    const step: PipelineStepDraft = {
      id: "step-db-2",
      name: "createConversationResult",
      type: "db_operation",
      enabled: true,
      tableNodeId: "table-conversations",
      operationId: "auto-create-conversations",
      functionRef: {
        name: "createConversation",
        importPath: "@workspace/db/helpers/conversations",
      },
      inputBindings: [
        { argName: "title", source: { kind: "req_body", field: "title" } },
        { argName: "description", source: { kind: "req_body", field: "description" } },
      ],
    };

    expect(isStepInputUnconfigured(step, [mockTableNode])).toBe(false);
  });

  it("returns true (unconfigured error) when findById has empty map pk binding", () => {
    const step: PipelineStepDraft = {
      id: "step-db-3",
      name: "findConversationByIdResult",
      type: "db_operation",
      enabled: true,
      tableNodeId: "table-conversations",
      operationId: "auto-find-by-id-conversations",
      functionRef: {
        name: "findConversationById",
        importPath: "@workspace/db/helpers/conversations",
      },
      inputBindings: [
        { argName: "id", source: { kind: "req_params", field: "" } },
      ],
    };

    expect(isStepInputUnconfigured(step, [mockTableNode])).toBe(true);
  });

  it("returns false (configured, no error) when findById has properly mapped pk binding", () => {
    const step: PipelineStepDraft = {
      id: "step-db-3",
      name: "findConversationByIdResult",
      type: "db_operation",
      enabled: true,
      tableNodeId: "table-conversations",
      operationId: "auto-find-by-id-conversations",
      functionRef: {
        name: "findConversationById",
        importPath: "@workspace/db/helpers/conversations",
      },
      inputBindings: [
        { argName: "id", source: { kind: "req_params", field: "id" } },
      ],
    };

    expect(isStepInputUnconfigured(step, [mockTableNode])).toBe(false);
  });
});

describe("pipeline-validation: isStepInputUnconfigured for zero-arg transformer & redis", () => {
  it("returns false for transformer with empty inputSchema and zero bindings", () => {
    const step: PipelineStepDraft = {
      id: "step-tr-1",
      name: "transformResult",
      type: "transform",
      enabled: true,
      functionRef: {
        name: "noArgTransformer",
        importPath: "@/lib/transformers/noArgTransformer",
        inputSchema: [],
        returnSchema: [],
      },
      inputBindings: [],
    };

    expect(isStepInputUnconfigured(step, [])).toBe(false);
  });

  it("returns false for redis ping command with zero bindings", () => {
    const step: PipelineStepDraft = {
      id: "step-redis-1",
      name: "pingResult",
      type: "redis_operation",
      enabled: true,
      operationId: "ping",
      functionRef: {
        name: "redis.ping",
        importPath: "@workspace/primary-redis-cache",
      },
      inputBindings: [],
    };

    expect(isStepInputUnconfigured(step, [])).toBe(false);
  });
});

describe("pipeline-validation: isNodePipelineUnconfigured for db_ref vs entity", () => {
  const entityTableNode = {
    id: "table-conversations",
    type: "entity",
    data: {
      label: "conversations",
      columns: [
        { name: "id", type: "string", isPrimaryKey: true },
        { name: "title", type: "string", isNotNull: true },
      ],
    },
  } as any;

  const dbRefNode = {
    id: "db-ref-1",
    type: "db_ref",
    data: {
      tableRef: "table-conversations",
    },
  } as any;

  const endpointWithUnmappedStep = {
    id: "ep-1",
    nodeId: "service-1",
    pipelineSteps: [
      {
        id: "step-1",
        name: "createConversation",
        type: "db_operation",
        enabled: true,
        tableNodeId: "table-conversations",
        operationId: "create",
        inputBindings: [], // Missing required 'title'
      },
    ],
  } as any;

  it("returns false for entity node (table / dbschema node) even when step is unmapped", () => {
    const hasError = isNodePipelineUnconfigured(
      "table-conversations",
      [entityTableNode, dbRefNode],
      [],
      [endpointWithUnmappedStep],
      [],
    );
    expect(hasError).toBe(false);
  });

  it("returns true for db_ref node (DatabaseTableRefNode) when step referencing the table is unmapped", () => {
    const hasError = isNodePipelineUnconfigured(
      "db-ref-1",
      [entityTableNode, dbRefNode],
      [],
      [endpointWithUnmappedStep],
      [],
    );
    expect(hasError).toBe(true);
  });
});

describe("pipeline-validation: transformer with empty / unconfigured input schema", () => {
  const emptyTransformerNode = {
    id: "transformer-empty",
    type: "transformer",
    data: {
      label: "generateUniqueId",
      functionName: "generateUniqueId",
      inputSchema: [],
      returnSchema: [{ name: "slug", type: "string", required: true }],
    },
  } as any;

  const emptyTransformerRefNode = {
    id: "ref-empty",
    type: "transformer_ref",
    data: {
      label: "generateUniqueId (Ref)",
      transformerRef: "transformer-empty",
    },
  } as any;

  const endpointWithEmptyTransformerStep = {
    id: "ep-1",
    nodeId: "service-1",
    pipelineSteps: [
      {
        id: "step-1",
        name: "generateUniqueIdResult",
        type: "transform",
        enabled: true,
        transformerNodeId: "transformer-empty",
        functionRef: {
          name: "generateUniqueId",
          inputSchema: [],
        },
        inputBindings: [],
      },
    ],
  } as any;

  it("returns false (no error) for step with empty input schema", () => {
    const step = endpointWithEmptyTransformerStep.pipelineSteps[0];
    expect(isStepInputUnconfigured(step, [emptyTransformerNode])).toBe(false);
  });

  it("returns false (no error banner) for TransformerNode when input schema is empty", () => {
    const hasError = isNodePipelineUnconfigured(
      "transformer-empty",
      [emptyTransformerNode],
      [],
      [endpointWithEmptyTransformerStep],
      [],
    );
    expect(hasError).toBe(false);
  });

  it("returns false (no error banner) for TransformerRefNode when master transformer input schema is empty", () => {
    const endpointWithRefStep = {
      id: "ep-1",
      nodeId: "service-1",
      pipelineSteps: [
        {
          id: "step-1",
          name: "generateUniqueIdResult",
          type: "transform",
          enabled: true,
          transformerNodeId: "ref-empty",
          functionRef: {
            name: "generateUniqueId",
          },
          inputBindings: [],
        },
      ],
    } as any;

    const hasError = isNodePipelineUnconfigured(
      "ref-empty",
      [emptyTransformerNode, emptyTransformerRefNode],
      [],
      [endpointWithRefStep],
      [],
    );
    expect(hasError).toBe(false);
  });
});

describe("pipeline-validation: isStepInputUnconfigured for langgraph_invoke", () => {
  const mockAgentNode = {
    id: "agent-1",
    type: "langgraph",
    data: {
      label: "Support Agent",
      inputChannels: [
        { key: "query", type: "string", required: true, description: "User query" },
        { key: "session_context", type: "string", required: false },
      ],
      stateChannels: [
        { key: "messages", type: "BaseMessage[]" },
      ],
    },
  } as any;

  it("returns true (unconfigured) when targetNodeId is missing", () => {
    const step: PipelineStepDraft = {
      id: "step-lg-1",
      name: "runAgent",
      type: "langgraph_invoke",
      enabled: true,
      langGraphTargetNodeId: "",
    };
    expect(isStepInputUnconfigured(step, [mockAgentNode])).toBe(true);
  });

  it("returns true (unconfigured) when target node does not exist in allNodes", () => {
    const step: PipelineStepDraft = {
      id: "step-lg-1",
      name: "runAgent",
      type: "langgraph_invoke",
      enabled: true,
      langGraphTargetNodeId: "non-existent-agent",
    };
    expect(isStepInputUnconfigured(step, [mockAgentNode])).toBe(true);
  });

  it("returns true (unconfigured) when required inputChannel is not mapped", () => {
    const step: PipelineStepDraft = {
      id: "step-lg-1",
      name: "runAgent",
      type: "langgraph_invoke",
      enabled: true,
      langGraphTargetNodeId: "agent-1",
      inputBindings: [
        { argName: "session_context", source: { kind: "req_body", field: "ctx" } },
      ],
    };
    expect(isStepInputUnconfigured(step, [mockAgentNode])).toBe(true);
  });

  it("returns false (configured) when required inputChannel is mapped in inputBindings", () => {
    const step: PipelineStepDraft = {
      id: "step-lg-1",
      name: "runAgent",
      type: "langgraph_invoke",
      enabled: true,
      langGraphTargetNodeId: "agent-1",
      inputBindings: [
        { argName: "query", source: { kind: "req_body", field: "userQuery" } },
      ],
    };
    expect(isStepInputUnconfigured(step, [mockAgentNode])).toBe(false);
  });

  it("returns false (configured) when required inputChannel is mapped in langGraphStateMapping", () => {
    const step: PipelineStepDraft = {
      id: "step-lg-1",
      name: "runAgent",
      type: "langgraph_invoke",
      enabled: true,
      langGraphTargetNodeId: "agent-1",
      langGraphStateMapping: {
        query: "body.userQuery",
      },
    };
    expect(isStepInputUnconfigured(step, [mockAgentNode])).toBe(false);
  });

  it("returns false (configured) when required message inputChannel is mapped in langGraphMessagesConfig", () => {
    const agentNodeWithMessageInput = {
      id: "agent-msg-1",
      type: "langgraph",
      data: {
        label: "Chat Agent",
        inputChannels: [
          { key: "message", type: "string", required: true, stateChannelKey: "messages" },
        ],
        stateChannels: [{ key: "messages", type: "messages" }],
      },
    } as any;

    const step: PipelineStepDraft = {
      id: "step-lg-msg",
      name: "runChatAgent",
      type: "langgraph_invoke",
      enabled: true,
      langGraphTargetNodeId: "agent-msg-1",
      langGraphMessagesConfig: {
        mode: "single",
        userMessageSource: "body.message",
      },
    };
    expect(isStepInputUnconfigured(step, [agentNodeWithMessageInput])).toBe(false);
  });

  it("returns false (configured) when required messages inputChannel is mapped in bulk langGraphMessagesConfig", () => {
    const agentNodeWithMessagesInput = {
      id: "agent-msgs-1",
      type: "langgraph",
      data: {
        label: "Chat Agent",
        inputChannels: [
          { key: "messages", type: "messages", required: true },
        ],
        stateChannels: [{ key: "messages", type: "messages" }],
      },
    } as any;

    const step: PipelineStepDraft = {
      id: "step-lg-msgs",
      name: "runChatAgent",
      type: "langgraph_invoke",
      enabled: true,
      langGraphTargetNodeId: "agent-msgs-1",
      langGraphMessagesConfig: {
        mode: "bulk",
        bulkMessagesSource: "body.messages",
      },
    };
    expect(isStepInputUnconfigured(step, [agentNodeWithMessagesInput])).toBe(false);
  });

  it("returns true (unconfigured) in history mode when threadId source is missing", () => {
    const step: PipelineStepDraft = {
      id: "step-lg-history-1",
      name: "getHistory",
      type: "langgraph_invoke",
      langGraphAction: "history",
      enabled: true,
      langGraphTargetNodeId: "agent-1",
      langGraphThreadIdSource: "",
    };
    expect(isStepInputUnconfigured(step, [mockAgentNode])).toBe(true);
  });

  it("returns false (configured) in history mode when target node and threadId source are configured", () => {
    const step: PipelineStepDraft = {
      id: "step-lg-history-2",
      name: "getHistory",
      type: "langgraph_invoke",
      langGraphAction: "history",
      enabled: true,
      langGraphTargetNodeId: "agent-1",
      langGraphThreadIdSource: "params.threadId",
    };
    // Note: mockAgentNode has required inputChannel "query", but in history mode it should NOT be required!
    expect(isStepInputUnconfigured(step, [mockAgentNode])).toBe(false);
  });
});


