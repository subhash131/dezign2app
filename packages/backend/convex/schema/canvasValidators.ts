import { v } from "convex/values";
import { zodToConvex } from "convex-helpers/server/zod";
import {
  serviceDataSchema,
  dbRefDataSchema,
  webPageDataSchema,
  pageRefDataSchema,
  externalDataSchema,
  simpleDataSchema,
  entityDataSchema,
  databaseDataSchema,
  kafkaDataSchema,
  sqsDataSchema,
  redisPubSubDataSchema,
  redisStreamsDataSchema,
  redisCacheDataSchema,
  storageDataSchema,
  edgeDataSchema,
  simulationTestCaseSchema,
  // New nodes
  workerDataSchema,
  serverlessDataSchema,
  searchIndexDataSchema,
  apiGatewayDataSchema,
  loadBalancerDataSchema,
  webhookDataSchema,
  llmDataSchema,
  mcpServerDataSchema,
  vectorDbRefDataSchema,
  endpointSchema,
  identityProviderDataSchema,
  authDataSchema,
  paymentsDataSchema,
  webAppDataSchema,
  langgraphDataSchema,
  langgraphStepDataSchema,
  transformerNodeDataSchema,
  transformerRefDataSchema,
  hookNodeDataSchema,
  hookRefDataSchema,
  typesNodeDataSchema,
  identityProviderSchema,
  publishedEventSchema,
  consumedEventSchema,
  pipelineStepTypeEnum,
  pipelineStepInputSourceSchema,
  pipelineStepInputBindingSchema,
  pipelineStepOnErrorSchema,
  conditionClauseSchema,
  pipelineStepOutputSchemaFieldSchema,
  stepSchemaFieldSchema,
} from "@workspace/canvas/schemas";
import { z } from "zod";

/**
 * Convex-safe non-recursive condition expression schema.
 */
const safeConditionExprLevel1Schema = z.union([
  conditionClauseSchema,
  z.object({ and: z.array(z.any()) }),
  z.object({ or: z.array(z.any()) }),
  z.object({ not: z.any() }),
]);

const safeConditionExprSchema = z.union([
  conditionClauseSchema,
  z.object({
    and: z.array(safeConditionExprLevel1Schema),
  }),
  z.object({
    or: z.array(safeConditionExprLevel1Schema),
  }),
  z.object({
    not: safeConditionExprLevel1Schema,
  }),
]);

const safeSwitchCaseSchema = z.object({
  id: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  label: z.string().optional(),
  steps: z.array(z.any()),
});

const safeParallelBranchSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  steps: z.array(z.any()),
});

/**
 * Full Convex-safe pipeline step schema with all exact field schemas.
 */
export const safePipelineStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: pipelineStepTypeEnum,
  enabled: z.boolean().optional(),
  runIf: safeConditionExprSchema.optional(),
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
  inputBindings: z.array(pipelineStepInputBindingSchema).optional(),
  outputVariable: z.string().optional(),
  outputSchema: z.array(pipelineStepOutputSchemaFieldSchema).optional(),
  customCode: z.string().optional(),

  conditionExpr: safeConditionExprSchema.optional(),
  thenSteps: z.array(z.any()).optional(),
  elseSteps: z.array(z.any()).optional(),
  trySteps: z.array(z.any()).optional(),
  catchSteps: z.array(z.any()).optional(),
  switchSource: pipelineStepInputSourceSchema.optional(),
  switchCases: z.array(safeSwitchCaseSchema).optional(),
  switchDefault: z.array(z.any()).optional(),
  parallelBranches: z.array(safeParallelBranchSchema).optional(),
  failureMode: z.enum(["all", "any"]).optional(),
  loopKind: z.enum(["for", "for_each", "while", "do_while"]).optional(),
  loopSource: pipelineStepInputSourceSchema.optional(),
  iteratorVariable: z.string().optional(),
  loopForStart: z.number().optional(),
  loopForEnd: z.number().optional(),
  loopForStep: z.number().optional(),
  loopConditionExpr: safeConditionExprSchema.optional(),
  loopMaxIterations: z.number().optional(),
  loopBody: z.array(z.any()).optional(),

  // push_to_client fields
  clientDeliveryProtocol: z.enum(["SSE", "WEBSOCKET", "WEBRTC", "API_PUSH"]).optional(),
  clientDeliveryTargetWebAppId: z.string().optional(),
  clientDeliveryTargetPageId: z.string().optional(),
  clientDeliveryPageRefNodeId: z.string().optional(),
  clientDeliveryEventName: z.string().optional(),
  clientDeliveryRoom: z.string().optional(),
  clientDeliveryWebhookUrl: z.string().optional(),
  clientDeliveryWebhookMethod: z.enum(["POST", "PUT", "PATCH"]).optional(),
  clientDeliveryFilterExpr: z.string().optional(),
  clientDeliveryPayloadMapping: z.string().optional(),

  // langgraph_invoke fields
  langGraphTargetNodeId: z.string().optional(),
  langGraphStateMapping: z.record(z.string()).optional(),
  langGraphStreamingEnabled: z.boolean().optional(),
  langGraphStreamingProtocol: z.enum(["sse", "websocket"]).optional(),
  langGraphStreamingFields: z.array(z.string()).optional(),
  langGraphOutputMode: z.enum(["full_state", "specific_fields", "last_message"]).optional(),
  langGraphOutputFields: z.array(z.string()).optional(),
});

/**
 * Convex-safe variants: strip recursive z.lazy() pipelineStepSchema
 * (used in endpoints/events/routeGroups) and z.default() wrappers so
 * zodToConvex can traverse without hitting a call-stack overflow.
 */
const safePublishedEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  publishedWhen: z.string().optional(),
  brokerNodeId: z.string().optional(),
  messagingResourceId: z.string().optional(),
  resourceType: z.string().optional(),
  payloadSchema: z.object({ id: z.string(), fields: z.array(z.any()).optional(), rawJson: z.string().optional(), mode: z.string().optional(), requestBodyMode: z.string().optional() }).optional(),
  version: z.string().optional(),
  category: z.string().optional(),
  delivery: z.string().optional(),
  ordering: z.string().optional(),
  correlationId: z.string().optional(),
  deprecated: z.boolean().optional(),
  replacementEventId: z.string().optional(),
  targetNodeId: z.string().optional(),
  metadata: z.object({ createdAt: z.number().optional(), updatedAt: z.number().optional(), createdByAI: z.boolean().optional() }).optional(),
});

const safeEndpointSchema = endpointSchema
  .omit({ pipelineSteps: true, publishedEvents: true })
  .extend({
    pipelineSteps: z.array(safePipelineStepSchema).optional(),
    publishedEvents: z.array(safePublishedEventSchema).optional(),
  });

const safeConsumedEventSchema = consumedEventSchema
  .omit({
    pipelineSteps: true,
    retryPolicy: true,
    isIdempotent: true,
    name: true,
    eventId: true,
    brokerNodeId: true,
    messagingResourceId: true,
  })
  .extend({
    pipelineSteps: z.array(safePipelineStepSchema).optional(),
    retryPolicy: z.string().optional(),
    isIdempotent: z.boolean().optional(),
    name: z.string().optional(),
    eventId: z.string().optional(),
    brokerNodeId: z.string().optional(),
    messagingResourceId: z.string().optional(),
  });

const safeRouteGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  basePath: z.string(),
  endpoints: z.array(safeEndpointSchema),
});

const safeServiceDataSchema = serviceDataSchema
  .omit({
    endpoints: true,
    consumedEvents: true,
    publishedEvents: true,
    routeGroups: true,
  })
  .extend({
    endpoints: z.array(safeEndpointSchema).optional(),
    consumedEvents: z.array(safeConsumedEventSchema).optional(),
    publishedEvents: z.array(safePublishedEventSchema).optional(),
    routeGroups: z.array(safeRouteGroupSchema).optional(),
  });

const safeServerlessDataSchema = serverlessDataSchema
  .omit({
    endpoints: true,
  })
  .extend({
    endpoints: z.array(safeEndpointSchema).optional(),
  });

const safeApiGatewayDataSchema = apiGatewayDataSchema
  .omit({
    endpoints: true,
    routeGroups: true,
  })
  .extend({
    endpoints: z.array(safeEndpointSchema).optional(),
    routeGroups: z.array(safeRouteGroupSchema).optional(),
  });

// Test Case Data Validator
export const backendTestCaseDataValidator = zodToConvex(
  simulationTestCaseSchema,
);

// Edge Data Validator
export const backendEdgeDataValidator = zodToConvex(edgeDataSchema);

// Parameter Validator (Headers, Query Params, Path Params, Field Builder)
export const backendParameterValidator = v.object({
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  type: v.optional(v.string()),
  required: v.optional(v.boolean()),
  description: v.optional(v.string()),
  defaultValue: v.optional(v.string()),
  key: v.optional(v.string()),
  value: v.optional(v.string()),
  isArray: v.optional(v.boolean()),
});

// Node Dependency Validator
export const nodeDependencyItemConvexValidator = v.object({
  name: v.string(),
  version: v.optional(v.string()),
  isDev: v.optional(v.boolean()),
  description: v.optional(v.string()),
  category: v.optional(v.string()),
  source: v.optional(
    v.union(
      v.literal("manual"),
      v.literal("ai_inferred"),
      v.literal("canvas_inferred"),
    ),
  ),
});

// Request Body / Schema Model Validator
export const backendRequestBodyValidator = v.object({
  id: v.optional(v.string()),
  fields: v.optional(v.array(backendParameterValidator)),
  rawJson: v.optional(v.string()),
  mode: v.optional(
    v.union(v.literal("field_builder"), v.literal("raw_json")),
  ),
  requestBodyMode: v.optional(
    v.union(v.literal("field_builder"), v.literal("raw_json")),
  ),
});

// Simulation Case Validator
export const webPageSimulationCaseValidator = v.object({
  id: v.optional(v.string()),
  name: v.string(),
  request: v.optional(
    v.object({
      headers: v.optional(v.record(v.string(), v.string())),
      params: v.optional(v.record(v.string(), v.string())),
      body: v.optional(
        v.union(v.string(), v.number(), v.boolean(), v.null(), v.record(v.string(), v.string())),
      ),
    }),
  ),
  expectedStatus: v.optional(v.number()),
  expectedBody: v.optional(
    v.union(v.string(), v.number(), v.boolean(), v.null(), v.record(v.string(), v.string())),
  ),
  enabled: v.optional(v.boolean()),
});

// Protocol Validators
export const sseConfigConvexValidator = v.object({
  reconnectStrategy: v.optional(v.string()),
  maxRetries: v.optional(v.number()),
  retryDelayMs: v.optional(v.number()),
  eventFilters: v.optional(v.array(v.string())),
  withCredentials: v.optional(v.boolean()),
});

export const wsConfigConvexValidator = v.object({
  payloadFormat: v.optional(v.string()),
  heartbeatIntervalMs: v.optional(v.number()),
  autoReconnect: v.optional(v.boolean()),
});

export const webRtcConfigConvexValidator = v.object({
  signalingServerUrl: v.optional(v.string()),
  peerRole: v.optional(v.string()),
  audioConstraints: v.optional(v.boolean()),
  videoConstraints: v.optional(v.boolean()),
  dataChannel: v.optional(v.boolean()),
});

export const pollingConfigConvexValidator = v.object({
  intervalMs: v.optional(v.number()),
  maxRounds: v.optional(v.number()),
  stopOnError: v.optional(v.boolean()),
});

// UI Event Item Validator
export const webPageEventConvexValidator = v.object({
  id: v.optional(v.string()),
  name: v.string(),
  event: v.optional(v.string()),
  schema: v.optional(v.string()),
  navigationType: v.optional(v.union(v.literal("link"), v.literal("router"))),
  navigationCondition: v.optional(
    v.union(
      v.literal("direct"),
      v.literal("on_success"),
      v.literal("on_condition"),
      v.literal("on_error"),
    ),
  ),
  targetRoute: v.optional(v.string()),
  targetPageId: v.optional(v.string()),
  conditionCode: v.optional(v.string()),
  targetNodeId: v.optional(v.string()),
  targetEndpointId: v.optional(v.string()),
  headers: v.optional(v.array(backendParameterValidator)),
  pathParams: v.optional(v.array(backendParameterValidator)),
  queryParams: v.optional(v.array(backendParameterValidator)),
  requestBody: v.optional(backendRequestBodyValidator),
  requestBodyMode: v.optional(
    v.union(v.literal("field_builder"), v.literal("raw_json")),
  ),
  simulationCases: v.optional(v.array(webPageSimulationCaseValidator)),
  description: v.optional(v.string()),
  uiPrompt: v.optional(v.string()),
  renderMode: v.optional(v.union(v.literal("server"), v.literal("client"))),
  libraries: v.optional(v.array(v.string())),
  sseConfig: v.optional(sseConfigConvexValidator),
  wsConfig: v.optional(wsConfigConvexValidator),
  webRtcConfig: v.optional(webRtcConfigConvexValidator),
  pollingConfig: v.optional(pollingConfigConvexValidator),
});

// Page Section Validator
export const pageSectionConvexValidator = v.object({
  id: v.string(),
  name: v.string(),
  renderMode: v.optional(v.union(v.literal("server"), v.literal("client"))),
  loadStrategy: v.optional(
    v.union(v.literal("eager"), v.literal("dynamic"), v.literal("dynamic-no-ssr")),
  ),
  actions: v.array(webPageEventConvexValidator),
  description: v.optional(v.string()),
  uiPrompt: v.optional(v.string()),
  libraries: v.optional(v.array(v.string())),
});

// Protection Rule Validator
export const protectionRuleConvexValidator = v.object({
  id: v.optional(v.string()),
  scope: v.optional(v.union(v.literal("zone"), v.literal("page"))),
  conditions: v.optional(
    v.record(
      v.string(),
      v.union(v.string(), v.number(), v.boolean(), v.null()),
    ),
  ),
  redirects: v.optional(v.record(v.string(), v.string())),
  customLogic: v.optional(
    v.object({
      mode: v.union(v.literal("naturalLanguage"), v.literal("code")),
      prompt: v.optional(v.string()),
      code: v.optional(v.string()),
    }),
  ),
});

// Realtime Connection Validator
export const realtimeConnectionConvexValidator = v.object({
  id: v.string(),
  protocol: v.union(
    v.literal("SSE"),
    v.literal("WEBSOCKET"),
    v.literal("WEBRTC"),
    v.literal("POLLING"),
    v.literal("API_PUSH"),
  ),
  eventName: v.optional(v.string()),
  room: v.optional(v.string()),
  pollingIntervalMs: v.optional(v.number()),
  description: v.optional(v.string()),
  sourceServiceNodeId: v.optional(v.string()),
  sourceServiceLabel: v.optional(v.string()),
  sourceEventId: v.optional(v.string()),
  sourceItemName: v.optional(v.string()),
  sourceItemType: v.optional(v.union(v.literal("endpoint"), v.literal("event"))),
});

// Web Page Node Data Validator
export const webPageConvexDataValidator = v.object({
  label: v.optional(v.string()),
  description: v.optional(v.string()),
  summary: v.optional(v.string()),
  appName: v.optional(v.string()),
  appSlug: v.optional(v.string()),
  accessType: v.optional(
    v.union(
      v.literal("public"),
      v.literal("private"),
      v.literal("role-gated"),
      v.literal("payment-gated"),
      v.literal("org-gated"),
    ),
  ),
  allowedRoles: v.optional(v.array(v.string())),
  requiredPlans: v.optional(v.array(v.string())),
  allowedOrgRoles: v.optional(v.array(v.string())),
  redirectTo: v.optional(v.string()),
  isAuthPage: v.optional(v.boolean()),
  authNodeId: v.optional(v.string()),
  zoneId: v.optional(v.string()),
  useZoneDefault: v.optional(v.boolean()),
  requireAuth: v.optional(v.boolean()),
  color: v.optional(v.string()),
  parentId: v.optional(v.string()),
  position: v.optional(v.object({ x: v.number(), y: v.number() })),
  style: v.optional(
    v.record(
      v.string(),
      v.union(v.string(), v.number(), v.boolean(), v.null()),
    ),
  ),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  techStack: v.optional(v.string()),
  techVersion: v.optional(v.string()),
  isWebPage: v.optional(v.boolean()),
  isWebClient: v.optional(v.boolean()),
  isRoot: v.optional(v.boolean()),
  pageSlug: v.optional(v.string()),
  path: v.optional(v.string()),
  route: v.optional(v.string()),
  targetServerId: v.optional(v.string()),
  targetRouteId: v.optional(v.string()),
  pageSourceCode: v.optional(v.string()),
  aiEditing: v.optional(v.boolean()),
  headers: v.optional(v.array(backendParameterValidator)),
  pathParams: v.optional(v.array(backendParameterValidator)),
  queryParams: v.optional(v.array(backendParameterValidator)),
  requestBody: v.optional(backendRequestBodyValidator),
  requestBodyMode: v.optional(
    v.union(v.literal("field_builder"), v.literal("raw_json")),
  ),
  events: v.optional(v.array(webPageEventConvexValidator)),
  sections: v.optional(v.array(pageSectionConvexValidator)),
  realtimeConnections: v.optional(v.array(realtimeConnectionConvexValidator)),
  uiPrompt: v.optional(v.string()),
  renderMode: v.optional(v.union(v.literal("server"), v.literal("client"))),
  protectionOverride: v.optional(protectionRuleConvexValidator),
  customDependencies: v.optional(v.array(nodeDependencyItemConvexValidator)),
});

export const backendWebPageDataValidator = webPageConvexDataValidator;

export const langgraphConvexDataValidator = v.object({
  label: v.optional(v.string()),
  description: v.optional(v.string()),
  parentId: v.optional(v.string()),
  position: v.optional(v.object({ x: v.number(), y: v.number() })),
  style: v.optional(
    v.record(
      v.string(),
      v.union(v.string(), v.number(), v.boolean(), v.null()),
    ),
  ),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  version: v.optional(v.number()),
  recursionLimit: v.optional(v.number()),
  stepTimeoutMs: v.optional(v.number()),
  inputChannels: v.optional(v.array(v.any())),
  outputChannels: v.optional(v.array(v.any())),
  stateChannels: v.optional(v.array(v.any())),
  outputPorts: v.optional(v.array(v.any())),
  tools: v.optional(v.array(v.any())),
  customLlmNodes: v.optional(v.array(v.any())),
  toolDefinitions: v.optional(v.array(v.any())),
  middlewareDefinitions: v.optional(v.array(v.any())),
  agentDefinitions: v.optional(v.array(v.any())),
  memoryDefinitions: v.optional(v.array(v.any())),
  graphSteps: v.optional(v.array(v.any())),
  graphEdges: v.optional(v.array(v.any())),
  memoryConfig: v.optional(v.any()),
  startNodePosition: v.optional(v.object({ x: v.number(), y: v.number() })),
  stateNodePosition: v.optional(v.object({ x: v.number(), y: v.number() })),
  endNodePosition: v.optional(v.object({ x: v.number(), y: v.number() })),
  endNodes: v.optional(v.array(v.any())),
});

// Node Data Validator
// Using zodToConvex & explicit validators to keep database schemas in sync
export const backendNodeDataValidator = v.union(
  zodToConvex(safeServiceDataSchema),
  zodToConvex(dbRefDataSchema),
  webPageConvexDataValidator,
  zodToConvex(pageRefDataSchema),
  zodToConvex(webAppDataSchema),
  zodToConvex(externalDataSchema),
  zodToConvex(simpleDataSchema),
  zodToConvex(entityDataSchema),
  zodToConvex(databaseDataSchema),
  zodToConvex(kafkaDataSchema),
  zodToConvex(sqsDataSchema),
  zodToConvex(redisPubSubDataSchema),
  zodToConvex(redisStreamsDataSchema),
  zodToConvex(redisCacheDataSchema),
  zodToConvex(storageDataSchema),
  zodToConvex(workerDataSchema),
  zodToConvex(safeServerlessDataSchema),
  zodToConvex(searchIndexDataSchema),
  zodToConvex(safeApiGatewayDataSchema),
  zodToConvex(loadBalancerDataSchema),
  zodToConvex(webhookDataSchema),
  zodToConvex(llmDataSchema),
  zodToConvex(mcpServerDataSchema),
  zodToConvex(vectorDbRefDataSchema),
  zodToConvex(identityProviderDataSchema),
  zodToConvex(authDataSchema),
  zodToConvex(paymentsDataSchema),
  langgraphConvexDataValidator,
  zodToConvex(langgraphStepDataSchema),
  zodToConvex(transformerNodeDataSchema),
  zodToConvex(transformerRefDataSchema),
  zodToConvex(hookNodeDataSchema),
  zodToConvex(hookRefDataSchema),
  zodToConvex(typesNodeDataSchema),
  // Fallback for partial updates (label is always present on real nodes)
  v.object({
    label: v.string(),
    color: v.optional(v.string()),
    parentId: v.optional(v.string()),
    targetServiceId: v.optional(v.string()),
    targetWebAppId: v.optional(v.string()),
    serviceNodeId: v.optional(v.string()),
    position: v.optional(v.object({ x: v.number(), y: v.number() })),
    style: v.optional(
      v.record(
        v.string(),
        v.union(v.string(), v.number(), v.boolean(), v.null()),
      ),
    ),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    pageSourceCode: v.optional(v.string()),
    aiEditing: v.optional(v.boolean()),
    isPackageNode: v.optional(v.boolean()),
    packageName: v.optional(v.string()),
    packageVersion: v.optional(v.string()),
    isInstalled: v.optional(v.boolean()),
    installError: v.optional(v.string()),
    isReadOnly: v.optional(v.boolean()),
  }),
);

export const backendEndpointDataValidator = zodToConvex(safeEndpointSchema);

export const backendIdentityProviderDataValidator = zodToConvex(
  identityProviderSchema,
);

export const backendEventDataValidator = zodToConvex(
  z.union([safePublishedEventSchema, safeConsumedEventSchema]),
);
