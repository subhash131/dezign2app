import { z } from "zod";
import { processingOperationEnum } from "./primitives";

export const parameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  key: z.string().optional(),
  value: z.string().optional(),
  enabled: z.boolean().optional(),
  enumValues: z.array(z.string()).optional(),
  isArray: z.boolean().optional(),
});

export const parameterInputSchema = parameterSchema.extend({
  id: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  required: z.boolean().optional(),
});

export const responseFieldSchema = parameterSchema.extend({
  selectedColumns: z.array(z.string()).optional(),
});

export const responseFieldInputSchema = responseFieldSchema.extend({
  id: z.string().optional(),
});

export const schemaModelSchema = z.object({
  id: z.string(),
  fields: z.array(parameterSchema).optional(),
  rawJson: z.string().optional(),
  mode: z.enum(["field_builder", "raw_json"]).optional(),
  requestBodyMode: z.enum(["field_builder", "raw_json"]).optional(),
});

export const schemaModelInputSchema = z.object({
  id: z.string().optional(),
  fields: z.array(parameterInputSchema).optional(),
  rawJson: z.string().optional(),
  mode: z.enum(["field_builder", "raw_json"]).optional(),
  requestBodyMode: z.enum(["field_builder", "raw_json"]).optional(),
});

export const processingStepSchema = z.object({
  id: z.string(),
  text: z.string(),
  operation: processingOperationEnum.optional(),
  config: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});
export type ProcessingStep = z.infer<typeof processingStepSchema>;

export const processingStepInputSchema = processingStepSchema.extend({
  id: z.string().optional(),
});

export const architectureMetadataSchema = z.object({
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  createdByAI: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Pipeline Step Input Binding
// Describes where a single function argument value comes from
// ---------------------------------------------------------------------------
export const pipelineStepInputSourceSchema = z.discriminatedUnion("kind", [
  /** A field from req.body */
  z.object({ kind: z.literal("req_body"), field: z.string().optional() }),
  /** A field from req.params */
  z.object({ kind: z.literal("req_params"), field: z.string().optional() }),
  /** A field from req.query */
  z.object({ kind: z.literal("req_query"), field: z.string().optional() }),
  /** A field from req.headers */
  z.object({ kind: z.literal("req_headers"), field: z.string().optional() }),
  /** A field (or the whole object) from a prior step's output variable */
  z.object({
    kind: z.literal("step_output"),
    stepId: z.string(),
    /** If omitted, the entire step output object is passed */
    field: z.string().optional(),
  }),
  /** An inline value: plain literal (e.g. "gpt-4o", 100) or mixed text + ${...} tokens */
  z.object({
    kind: z.literal("inline"),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
]);
export type PipelineStepInputSource = z.infer<typeof pipelineStepInputSourceSchema>;

export const pipelineStepInputBindingSchema = z.object({
  /** Name of the argument in the called function's signature */
  argName: z.string(),
  source: pipelineStepInputSourceSchema,
});
export type PipelineStepInputBinding = z.infer<typeof pipelineStepInputBindingSchema>;

// ---------------------------------------------------------------------------
// Step Condition Expression
// Supports single clauses, cross-source comparisons, and AND / OR / NOT chains
// ---------------------------------------------------------------------------
export const conditionOperatorEnum = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "truthy",
  "falsy",
  "exists",
  "not_exists",
  "contains",
  "starts_with",
  "ends_with",
]);
export type ConditionOperator = z.infer<typeof conditionOperatorEnum>;

export const conditionClauseSchema = z.object({
  left: pipelineStepInputSourceSchema,
  operator: conditionOperatorEnum,
  right: pipelineStepInputSourceSchema.optional(),
});
export type ConditionClause = z.infer<typeof conditionClauseSchema>;

export type ConditionExpr =
  | ConditionClause
  | { and: ConditionExpr[] }
  | { or: ConditionExpr[] }
  | { not: ConditionExpr };

export const conditionExprSchema: z.ZodType<ConditionExpr> = z.lazy(() =>
  z.union([
    conditionClauseSchema,
    z.object({
      and: z.array(conditionExprSchema),
    }),
    z.object({
      or: z.array(conditionExprSchema),
    }),
    z.object({
      not: conditionExprSchema,
    }),
  ])
);

// ---------------------------------------------------------------------------
// Pipeline Step
// One ordered step in an endpoint or event handler
// ---------------------------------------------------------------------------
export const pipelineStepTypeEnum = z.enum([
  "transform",        // call a transformer helper function
  "db_operation",     // call a DB helper (createX, findById, etc.)
  "redis_operation",  // call a Redis cache helper
  "kafka_publish",    // publishKafkaEvent
  "service_call",     // HTTP / gRPC call to another service
  "external_call",    // HTTP call to an external 3rd-party API
  "custom_code",      // raw TypeScript block
  "return_response",  // explicit return response step
  "condition",        // if / else branching
  "try_catch",        // try / catch outcome branching
  "switch",           // multi-way switch routing
  "parallel",         // concurrent fan-out (Promise.all / allSettled)
  "loop",             // collection iteration (forEach / map)
  "early_return",     // mid-pipeline short circuit response
  "push_to_client",   // deliver processed result to a web-page client via SSE / WS / WebRTC / Webhook
]);
export type PipelineStepType = z.infer<typeof pipelineStepTypeEnum>;

export const pipelineStepOutputSchemaFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  description: z.string().optional(),
});

export const stepSchemaFieldSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
});

export interface SwitchCase {
  id?: string;
  value: string | number | boolean;
  label?: string;
  steps: PipelineStep[];
}

export const switchCaseSchema: z.ZodType<SwitchCase> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    label: z.string().optional(),
    steps: z.array(pipelineStepSchema),
  })
);

export interface ParallelBranch {
  id?: string;
  label?: string;
  steps: PipelineStep[];
}

export const parallelBranchSchema: z.ZodType<ParallelBranch> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    label: z.string().optional(),
    steps: z.array(pipelineStepSchema),
  })
);

export const pipelineStepOnErrorSchema = z.object({
  action: z.enum(["throw", "fallback", "early_return", "ignore"]),
  statusCode: z.number().optional(),
  errorMessage: z.string().optional(),
  fallbackValue: z.string().optional(),
  retries: z.number().optional(),
});
export type PipelineStepOnError = z.infer<typeof pipelineStepOnErrorSchema>;

export interface PipelineStep {
  id: string;
  name: string;
  /** Optional human-readable description or note for the step */
  description?: string;
  type: PipelineStepType;
  enabled?: boolean;
  /** Optional single-step skip guard */
  runIf?: ConditionExpr;
  /** Optional step-level error handling policy */
  onError?: PipelineStepOnError;
  /** HTTP status code for return_response / early_return step (e.g. 200, 201, 204, 400, 404, 500) */
  statusCode?: number;
  /** Mode for return_response step */
  responseMode?: string;
  /** For DB/Redis operation steps: ID of the selected database node */
  databaseId?: string;
  /** For DB/Redis operation steps: ID of the selected table/entity node */
  tableNodeId?: string;
  /** For external_call steps: ID of the selected external node */
  externalNodeId?: string;
  /** For external_call steps: ID of the selected external endpoint */
  externalEndpointId?: string;
  /** For DB/Redis operation steps: ID of the selected operation */
  operationId?: string;
  /** For Kafka/messaging publish steps: ID of the broker node */
  brokerNodeId?: string;
  /** For Kafka/messaging publish steps: ID of the topic / messaging resource */
  messagingResourceId?: string;
  /** Reference to the function being called (name + importPath from ReusableFunction / transformer) */
  functionRef?: {
    name: string;
    importPath: string;
    signature?: string;
    isGlobal?: boolean;
    inputSchema?: z.infer<typeof stepSchemaFieldSchema>[];
    returnSchema?: z.infer<typeof stepSchemaFieldSchema>[];
  };
  /** Optional reference to the canvas transformer node ID */
  transformerNodeId?: string;
  /** Explicit per-argument input bindings - user decides where every arg comes from */
  inputBindings?: PipelineStepInputBinding[];
  /** Variable name assigned to this step's return value (usable by subsequent steps) */
  outputVariable?: string;
  /** Declared output schema - fields available to downstream steps and response builder */
  outputSchema?: z.infer<typeof pipelineStepOutputSchemaFieldSchema>[];
  /** For custom_code steps: raw TypeScript to inline */
  customCode?: string;

  // ─── Control Flow: condition step (if / else) ───
  conditionExpr?: ConditionExpr;
  thenSteps?: PipelineStep[];
  elseSteps?: PipelineStep[];

  // ─── Control Flow: try_catch step ───
  trySteps?: PipelineStep[];
  catchSteps?: PipelineStep[];

  // ─── Control Flow: switch step ───
  switchSource?: PipelineStepInputSource;
  switchCases?: SwitchCase[];
  switchDefault?: PipelineStep[];

  // ─── Control Flow: parallel step ───
  parallelBranches?: ParallelBranch[];
  failureMode?: "all" | "any";

  // ─── Control Flow: loop step ───
  loopKind?: "for" | "for_each" | "while" | "do_while";
  loopSource?: PipelineStepInputSource;
  iteratorVariable?: string;
  loopForStart?: number;
  loopForEnd?: number;
  loopForStep?: number;
  loopConditionExpr?: ConditionExpr;
  loopMaxIterations?: number;
  loopBody?: PipelineStep[];

  // ─── push_to_client step ───
  /** Delivery protocol used to push data to the connected web-page client */
  clientDeliveryProtocol?: "SSE" | "WEBSOCKET" | "WEBRTC" | "API_PUSH";
  /** Optional ID of the WebAppNode containing the target page */
  clientDeliveryTargetWebAppId?: string;
  /** ID of the WebPageNode this step targets (stored as a reference, no graph edge drawn) */
  clientDeliveryTargetPageId?: string;
  /** SSE event name or WebSocket message type (e.g. "order.updated") */
  clientDeliveryEventName?: string;
  /** WebSocket broadcast room / channel key */
  clientDeliveryRoom?: string;
  /** API_PUSH: target webhook URL */
  clientDeliveryWebhookUrl?: string;
  /** API_PUSH: HTTP method */
  clientDeliveryWebhookMethod?: "POST" | "PUT" | "PATCH";
  /** Optional filter expression — only push when this evaluates to truthy */
  clientDeliveryFilterExpr?: string;
  /** Optional payload mapping — reshape the data object before pushing */
  clientDeliveryPayloadMapping?: string;
}

export const pipelineStepSchema: z.ZodType<PipelineStep> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    type: pipelineStepTypeEnum,
    enabled: z.boolean().optional().default(true),
    runIf: conditionExprSchema.optional(),
    onError: pipelineStepOnErrorSchema.optional(),
    statusCode: z.number().optional(),
    responseMode: z.string().optional(),
    databaseId: z.string().optional(),
    tableNodeId: z.string().optional(),
    externalNodeId: z.string().optional(),
    externalEndpointId: z.string().optional(),
    operationId: z.string().optional(),
    brokerNodeId: z.string().optional(),
    messagingResourceId: z.string().optional(),
    functionRef: z
      .object({
        name: z.string(),
        importPath: z.string(),
        signature: z.string().optional(),
        isGlobal: z.boolean().optional(),
        inputSchema: z.array(stepSchemaFieldSchema).optional(),
        returnSchema: z.array(stepSchemaFieldSchema).optional(),
      })
      .optional(),
    transformerNodeId: z.string().optional(),
    inputBindings: z.array(pipelineStepInputBindingSchema).optional().default([]),
    outputVariable: z.string().optional().default(""),
    outputSchema: z.array(pipelineStepOutputSchemaFieldSchema).optional(),
    customCode: z.string().optional(),

    conditionExpr: conditionExprSchema.optional(),
    thenSteps: z.array(pipelineStepSchema).optional(),
    elseSteps: z.array(pipelineStepSchema).optional(),

    trySteps: z.array(pipelineStepSchema).optional(),
    catchSteps: z.array(pipelineStepSchema).optional(),

    switchSource: pipelineStepInputSourceSchema.optional(),
    switchCases: z.array(switchCaseSchema).optional(),
    switchDefault: z.array(pipelineStepSchema).optional(),

    parallelBranches: z.array(parallelBranchSchema).optional(),
    failureMode: z.enum(["all", "any"]).optional(),

    loopKind: z.enum(["for_each", "while", "do_while", "for"]).optional(),
    loopSource: pipelineStepInputSourceSchema.optional(),
    iteratorVariable: z.string().optional(),
    loopForStart: z.number().optional(),
    loopForEnd: z.number().optional(),
    loopForStep: z.number().optional(),
    loopConditionExpr: conditionExprSchema.optional(),
    loopMaxIterations: z.number().optional(),
    loopBody: z.array(pipelineStepSchema).optional(),

    // push_to_client fields
    clientDeliveryProtocol: z.enum(["SSE", "WEBSOCKET", "WEBRTC", "API_PUSH"]).optional(),
    clientDeliveryTargetWebAppId: z.string().optional(),
    clientDeliveryTargetPageId: z.string().optional(),
    clientDeliveryEventName: z.string().optional(),
    clientDeliveryRoom: z.string().optional(),
    clientDeliveryWebhookUrl: z.string().optional(),
    clientDeliveryWebhookMethod: z.enum(["POST", "PUT", "PATCH"]).optional(),
    clientDeliveryFilterExpr: z.string().optional(),
    clientDeliveryPayloadMapping: z.string().optional(),
  })
);

export const pipelineStepInputSchema = z.lazy(() =>
  pipelineStepSchema.and(
    z.object({
      id: z.string().optional(),
    })
  )
);

// ---------------------------------------------------------------------------
// Transformer Helper Definition
// A small, pure data-transformation function (3 sections: Input | Logic | Return)
// Lives either as a global shared package or attached locally to a service node
// ---------------------------------------------------------------------------
export const transformerHelperSchema = z.object({
  id: z.string(),
  name: z.string().describe("camelCase function name, e.g. slugifyProductInput"),
  description: z.string().optional(),
  /** global = compiled into packages/transformers | local = compiled into service src/helpers */
  scope: z.enum(["global", "local"]),
  /** For local scope: which service node this helper belongs to */
  targetServiceId: z.string().optional(),
  /** Section 1: Input - typed fields this function accepts */
  inputSchema: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().optional().default(true),
    description: z.string().optional(),
  })),
  /** Section 2: Logic - how the transformation is defined */
  logicMode: z.enum(["natural_language", "code"]),
  prompt: z.string().optional().describe("Natural language description of the transformation"),
  code: z.string().optional().describe("TypeScript function body (return statement only, no function signature)"),
  /** Section 3: Return - typed fields this function returns */
  returnSchema: z.array(z.object({
    name: z.string(),
    type: z.string(),
    required: z.boolean().optional().default(true),
    description: z.string().optional(),
  })),
  isAsync: z.boolean().optional().default(false),
});
export type TransformerHelperDefinition = z.infer<typeof transformerHelperSchema>;

export const transformerHelperInputSchema = transformerHelperSchema.extend({
  id: z.string().optional(),
});
