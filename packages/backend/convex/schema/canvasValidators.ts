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
  storageOperationRefDataSchema,
  storageBucketRefDataSchema,
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
  stateStoreNodeDataSchema,
  browserStorageNodeDataSchema,
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

export const safePipelineStepCacheMissSchema = z.object({
  enabled: z.boolean().optional(),
  action: z
    .enum(["fallback_db", "early_return", "fallback_value", "throw_error"])
    .optional(),
  databaseId: z.string().optional(),
  tableNodeId: z.string().optional(),
  dbRefNodeId: z.string().optional(),
  operationId: z.string().optional(),
  functionRef: z
    .object({
      name: z.string(),
      importPath: z.string(),
      signature: z.string().optional(),
      isGlobal: z.boolean().optional(),
      inputSchema: z.array(stepSchemaFieldSchema).optional(),
      returnSchema: z.array(stepSchemaFieldSchema).optional(),
      returnIsArray: z.boolean().optional(),
    })
    .optional(),
  inputBindings: z.array(pipelineStepInputBindingSchema).optional(),
  writeBackToCache: z.boolean().optional(),
  writeBackOperationId: z.string().optional(),
  writeBackFunctionRef: z
    .object({
      name: z.string(),
      importPath: z.string(),
      signature: z.string().optional(),
    })
    .optional(),
  writeBackInputBindings: z.array(pipelineStepInputBindingSchema).optional(),
  reassignVariable: z.string().optional(),
  ttlSeconds: z.number().optional(),
  statusCode: z.number().optional(),
  errorMessage: z.string().optional(),
  fallbackValue: z.string().optional(),
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
  cacheMiss: safePipelineStepCacheMissSchema.optional(),
  statusCode: z.number().optional(),
  responseMode: z.string().optional(),
  databaseId: z.string().optional(),
  tableNodeId: z.string().optional(),
  dbRefNodeId: z.string().optional(),
  externalNodeId: z.string().optional(),
  externalEndpointId: z.string().optional(),
  serviceId: z.string().optional(),
  endpointId: z.string().optional(),
  operationId: z.string().optional(),
  storageNodeId: z.string().optional(),
  bucketId: z.string().optional(),
  brokerNodeId: z.string().optional(),
  messagingResourceId: z.string().optional(),
  functionRef: z
    .object({
      name: z.string(),
      importPath: z.string().optional(),
      path: z.string().optional(),
      signature: z.string().optional(),
      isGlobal: z.boolean().optional(),
      inputSchema: z.array(stepSchemaFieldSchema).optional(),
      returnSchema: z.array(stepSchemaFieldSchema).optional(),
      returnIsArray: z.boolean().optional(),
    })
    .optional(),
  transformerNodeId: z.string().optional(),
  inputBindings: z.array(pipelineStepInputBindingSchema).optional(),
  outputVariable: z.string().optional(),
  declarationKind: z.enum(["const", "let", "reassign"]).optional(),
  variableOperation: z.enum(["declare", "assign"]).optional(),
  variableDataType: z.string().optional(),
  variableSource: pipelineStepInputSourceSchema.optional(),
  variableOperator: z.enum(["=", "+=", "-=", "push"]).optional(),
  variablePropertyPath: z.string().optional(),
  variableMutationKind: z.enum(["variable", "property", "array_push"]).optional(),
  outputSchema: z.array(pipelineStepOutputSchemaFieldSchema).optional(),
  customCode: z.string().optional(),

  conditionExpr: safeConditionExprSchema.optional(),
  thenSteps: z.array(z.any()).optional(),
  elseSteps: z.array(z.any()).optional(),
  trySteps: z.array(z.any()).optional(),
  catchSteps: z.array(z.any()).optional(),
  cacheMissSteps: z.array(z.any()).optional(),
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
  clientDeliveryProtocol: z
    .enum(["SSE", "WEBSOCKET", "WEBRTC", "API_PUSH"])
    .optional(),
  clientDeliveryTargetWebAppId: z.string().optional(),
  clientDeliveryTargetPageId: z.string().optional(),
  clientDeliveryPageRefNodeId: z.string().optional(),
  clientDeliveryEventName: z.string().optional(),
  clientDeliveryRoom: z.string().optional(),
  clientDeliveryMediaMode: z
    .enum(["data", "audio", "video", "audio-video"])
    .optional(),
  clientDeliveryEnableDataChannel: z.boolean().optional(),
  clientDeliveryEnableAudio: z.boolean().optional(),
  clientDeliveryEnableMic: z.boolean().optional(),
  clientDeliveryEnableSpeaker: z.boolean().optional(),
  clientDeliveryEnableVideo: z.boolean().optional(),
  clientDeliveryEnableCamera: z.boolean().optional(),
  clientDeliveryEnableScreenShare: z.boolean().optional(),
  clientDeliveryEnableRemoteVideo: z.boolean().optional(),
  clientDeliveryIceServer: z.string().optional(),
  clientDeliveryWebhookUrl: z.string().optional(),
  clientDeliveryWebhookMethod: z.enum(["POST", "PUT", "PATCH"]).optional(),
  clientDeliveryFilterExpr: z.string().optional(),
  clientDeliveryPayloadMapping: z.string().optional(),

  // langgraph_invoke fields
  langGraphTargetNodeId: z.string().optional(),
  langGraphStateMapping: z.record(z.string()).optional(),
  langGraphThreadIdSource: z.string().optional(),
  langGraphStreamingEnabled: z.boolean().optional(),
  langGraphStreamingProtocol: z
    .enum(["sse", "raw", "websocket", "kafka", "redis_stream"])
    .optional(),
  langGraphStreamingKafkaNodeId: z.string().optional(),
  langGraphStreamingKafkaTopic: z.string().optional(),
  langGraphStreamingKafkaKey: z.string().optional(),
  langGraphStreamingRedisNodeId: z.string().optional(),
  langGraphStreamingRedisKey: z.string().optional(),
  langGraphStreamingRoom: z.string().optional(),
  langGraphStreamingFields: z.array(z.string()).optional(),
  langGraphStreamModes: z
    .array(z.enum(["messages", "updates", "values", "custom"]))
    .optional(),
  langGraphStreamIncludeReasoning: z.boolean().optional(),
  langGraphStreamSubgraphs: z.boolean().optional(),
  langGraphOutputMode: z
    .enum(["full_state", "specific_fields", "last_message"])
    .optional(),
  langGraphOutputFields: z.array(z.string()).optional(),
  langGraphTrackTokenUsage: z.boolean().optional(),
  langGraphMessagesConfig: z
    .object({
      mode: z.enum(["single", "bulk"]).optional(),
      userMessageSource: z.string().optional(),
      systemMessageSource: z.string().optional(),
      aiMessageSource: z.string().optional(),
      bulkMessagesSource: z.string().optional(),
    })
    .optional(),
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
  payloadSchema: z
    .object({
      id: z.string(),
      fields: z.array(z.any()).optional(),
      rawJson: z.string().optional(),
      mode: z.string().optional(),
      requestBodyMode: z.string().optional(),
    })
    .optional(),
  version: z.string().optional(),
  category: z.string().optional(),
  delivery: z.string().optional(),
  ordering: z.string().optional(),
  correlationId: z.string().optional(),
  deprecated: z.boolean().optional(),
  replacementEventId: z.string().optional(),
  targetNodeId: z.string().optional(),
  metadata: z
    .object({
      createdAt: z.number().optional(),
      updatedAt: z.number().optional(),
      createdByAI: z.boolean().optional(),
    })
    .optional(),
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
export const backendEdgeDataValidator = v.object({
  label: v.optional(v.string()),
  sequenceOrder: v.optional(v.number()),
  sourceCardinality: v.optional(v.union(v.literal("1"), v.literal("N"))),
  targetCardinality: v.optional(v.union(v.literal("1"), v.literal("N"))),
  resourceKind: v.optional(v.string()),
  // --- Type Reference Fields ---
  isTypeReference: v.optional(v.boolean()),
  isExtensionEdge: v.optional(v.boolean()),
  baseTypeName: v.optional(v.string()),
  extendedTypeName: v.optional(v.string()),
  packageName: v.optional(v.string()),
  // --- State Store Subscription & Mutation Fields ---
  isStateSubscription: v.optional(v.boolean()),
  isStateMutation: v.optional(v.boolean()),
  storeName: v.optional(v.string()),
  fieldName: v.optional(v.string()),
  storeId: v.optional(v.string()),
  fieldId: v.optional(v.string()),
  sectionId: v.optional(v.string()),
  stateObjectId: v.optional(v.string()),
  // --- State Store Action / Realtime Binding Fields ---
  isStoreActionBinding: v.optional(v.boolean()),
  isStoreAction: v.optional(v.boolean()),
  actionName: v.optional(v.string()),
  actionType: v.optional(v.string()),
  bindingId: v.optional(v.string()),
  targetFieldId: v.optional(v.string()),
  targetFieldName: v.optional(v.string()),
  // --- Identity Connection Fields ---
  protocol: v.optional(v.string()),
  grantType: v.optional(v.string()),
  clientId: v.optional(v.string()),
  clientSecret: v.optional(v.string()),
  redirectUris: v.optional(v.array(v.string())),
  pkce: v.optional(v.boolean()),
  scopes: v.optional(v.array(v.string())),
  responseType: v.optional(v.string()),
  responseMode: v.optional(v.string()),
  notes: v.optional(v.string()),
  // --- Storage Bucket Connection Fields ---
  isStorageOperationBinding: v.optional(v.boolean()),
  actionId: v.optional(v.string()),
  operationName: v.optional(v.string()),
  bucketId: v.optional(v.string()),
  storageNodeId: v.optional(v.string()),
  refNodeId: v.optional(v.string()),
  // --- Service Call Connection Fields ---
  isServiceCall: v.optional(v.boolean()),
  targetServiceId: v.optional(v.string()),
  targetEndpointId: v.optional(v.string()),
  sourceEndpointId: v.optional(v.string()),
  // --- LangGraph Route Invocation ---
  payloadMapping: v.optional(v.record(v.string(), v.string())),
  preInvokeLogicMode: v.optional(
    v.union(v.literal("natural_language"), v.literal("code")),
  ),
  preInvokePrompt: v.optional(v.string()),
  preInvokeCode: v.optional(v.string()),
  responseExecutionMode: v.optional(
    v.union(v.literal("sync"), v.literal("stream"), v.literal("async_ack")),
  ),
  responseOutputMode: v.optional(
    v.union(v.literal("full"), v.literal("selected")),
  ),
  responseFields: v.optional(v.array(v.string())),
  postInvokeLogicMode: v.optional(
    v.union(v.literal("natural_language"), v.literal("code")),
  ),
  postInvokePrompt: v.optional(v.string()),
  postInvokeCode: v.optional(v.string()),
});

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
  mode: v.optional(v.union(v.literal("field_builder"), v.literal("raw_json"))),
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
        v.union(
          v.string(),
          v.number(),
          v.boolean(),
          v.null(),
          v.record(v.string(), v.string()),
        ),
      ),
    }),
  ),
  expectedStatus: v.optional(v.number()),
  expectedBody: v.optional(
    v.union(
      v.string(),
      v.number(),
      v.boolean(),
      v.null(),
      v.record(v.string(), v.string()),
    ),
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

// Store Action Binding Validator (Used in Web Page Actions & Realtime Connections)
export const storeActionBindingConvexValidator = v.object({
  id: v.optional(v.string()),
  storeNodeId: v.optional(v.string()),
  actionId: v.optional(v.string()),
  storeName: v.optional(v.string()),
  actionName: v.optional(v.string()),
  actionType: v.optional(
    v.union(
      v.literal("set"),
      v.literal("append"),
      v.literal("pop"),
      v.literal("remove"),
      v.literal("toggle"),
      v.literal("increment"),
      v.literal("reset"),
      v.literal("populate"),
      v.literal("custom"),
      v.literal("mutate"),
    ),
  ),
  targetFieldId: v.optional(v.string()),
  targetFieldName: v.optional(v.string()),
  updateSource: v.optional(
    v.union(
      v.literal("response"),
      v.literal("response_property"),
      v.literal("payload"),
      v.literal("direct"),
      v.literal("static"),
      v.literal("full_message"),
      v.literal("nested_property"),
    ),
  ),
  valuePath: v.optional(v.string()),
  customValue: v.optional(v.string()),
  payloadExpr: v.optional(v.string()),
  parameterMappings: v.optional(v.any()),
});

// Storage Operation Binding Validator (Used in Web Page Actions connected to storage operation ref)
export const storageOperationBindingConvexValidator = v.object({
  storageNodeId: v.optional(v.string()),
  bucketId: v.optional(v.string()),
  operationName: v.optional(v.string()),
  refNodeId: v.optional(v.string()),
  endpointId: v.optional(v.string()),
  serviceNodeId: v.optional(v.string()),
});

// UI Event Item Validator
export const webPageEventConvexValidator = v.object({
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  event: v.optional(v.string()),
  url: v.optional(v.string()),
  method: v.optional(v.string()),
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
  targetServiceId: v.optional(v.string()),
  serviceNodeId: v.optional(v.string()),
  sourceServiceNodeId: v.optional(v.string()),
  sourceItemName: v.optional(v.string()),
  sourceEventId: v.optional(v.string()),
  sourceServiceLabel: v.optional(v.string()),
  endpointId: v.optional(v.string()),
  targetEventId: v.optional(v.string()),
  eventId: v.optional(v.string()),
  isLangGraph: v.optional(v.boolean()),
  langGraphTargetNodeId: v.optional(v.string()),
  type: v.optional(v.string()),
  order: v.optional(v.number()),
  payloadExpr: v.optional(v.string()),
  headers: v.optional(v.array(backendParameterValidator)),
  pathParams: v.optional(v.array(backendParameterValidator)),
  queryParams: v.optional(v.array(backendParameterValidator)),
  requestBody: v.optional(backendRequestBodyValidator),
  requestBodyMode: v.optional(
    v.union(v.literal("field_builder"), v.literal("raw_json")),
  ),
  simulationCases: v.optional(v.array(webPageSimulationCaseValidator)),
  testCases: v.optional(v.array(v.any())),
  description: v.optional(v.string()),
  uiPrompt: v.optional(v.string()),
  renderMode: v.optional(v.union(v.literal("server"), v.literal("client"))),
  libraries: v.optional(v.array(v.string())),
  sseConfig: v.optional(sseConfigConvexValidator),
  wsConfig: v.optional(wsConfigConvexValidator),
  webRtcConfig: v.optional(webRtcConfigConvexValidator),
  pollingConfig: v.optional(pollingConfigConvexValidator),
  storeActionBinding: v.optional(storeActionBindingConvexValidator),
  storeActionBindings: v.optional(v.array(storeActionBindingConvexValidator)),
  storageOperationBinding: v.optional(storageOperationBindingConvexValidator),
  actionSteps: v.optional(v.array(v.any())),
  scope: v.optional(v.union(v.literal("section"), v.literal("item"))),
  itemSourceStateId: v.optional(v.string()),
  itemContextFields: v.optional(v.array(v.string())),
});

// Page State Object Validator
export const pageStateObjectConvexValidator = v.object({
  id: v.string(),
  name: v.string(),
  type: v.string(),
  defaultValue: v.optional(v.any()),
  storeId: v.optional(v.string()),
  storeNodeId: v.optional(v.string()),
  storeName: v.optional(v.string()),
  fieldId: v.optional(v.string()),
  description: v.optional(v.string()),
  renderConfig: v.optional(v.any()),
  itemKeyField: v.optional(v.string()),
  itemSchema: v.optional(v.array(v.any())),
  itemEvents: v.optional(v.array(v.any())),
  isArray: v.optional(v.boolean()),
  scope: v.optional(v.string()),
  order: v.optional(v.number()),
  suggestedComponent: v.optional(v.string()),
});

// Component Element Binding Validator (Multi-Component Shadcn Support)
export const componentElementBindingConvexValidator = v.object({
  id: v.string(),
  name: v.string(),
  elementType: v.string(),
  label: v.optional(v.string()),
  placeholder: v.optional(v.string()),
  variant: v.optional(v.string()),
  valueStateName: v.optional(v.string()),
  valueStateId: v.optional(v.string()),
  valueSourceType: v.optional(v.union(v.literal("store"), v.literal("local"))),
  valueStoreName: v.optional(v.string()),
  disabledStateName: v.optional(v.string()),
  disabledStoreName: v.optional(v.string()),
  loadingStateName: v.optional(v.string()),
  loadingStoreName: v.optional(v.string()),
  triggerEvent: v.optional(v.string()),
  actionId: v.optional(v.string()),
  actionName: v.optional(v.string()),
  description: v.optional(v.string()),
  propMappings: v.optional(v.any()),
});

// Section Component Binding Validator
export const sectionComponentBindingConvexValidator = v.object({
  id: v.string(),
  name: v.string(),
  componentType: v.string(),
  label: v.optional(v.string()),
  variant: v.optional(v.string()),
  valueStateName: v.optional(v.string()),
  valueStateId: v.optional(v.string()),
  valueSourceType: v.optional(v.union(v.literal("store"), v.literal("local"))),
  valueStoreName: v.optional(v.string()),
  disabledStateName: v.optional(v.string()),
  disabledStoreName: v.optional(v.string()),
  loadingStateName: v.optional(v.string()),
  loadingStoreName: v.optional(v.string()),
  triggerEvent: v.optional(v.string()),
  actionId: v.optional(v.string()),
  actionName: v.optional(v.string()),
  description: v.optional(v.string()),
  propMappings: v.optional(v.any()),
  elements: v.optional(v.array(componentElementBindingConvexValidator)),
});

// Page Section Validator
export const pageSectionConvexValidator = v.object({
  id: v.string(),
  name: v.string(),
  renderMode: v.optional(v.union(v.literal("server"), v.literal("client"))),
  loadStrategy: v.optional(
    v.union(
      v.literal("eager"),
      v.literal("dynamic"),
      v.literal("dynamic-no-ssr"),
    ),
  ),
  actions: v.array(webPageEventConvexValidator),
  states: v.optional(v.array(v.any())),
  stateObjects: v.optional(v.array(pageStateObjectConvexValidator)),
  componentBindings: v.optional(
    v.array(sectionComponentBindingConvexValidator),
  ),
  description: v.optional(v.string()),
  uiPrompt: v.optional(v.string()),
  libraries: v.optional(v.array(v.string())),
  images: v.optional(v.array(v.string())),
  primaryImageUrl: v.optional(v.string()),
  title: v.optional(v.string()),
  order: v.optional(v.number()),
  icon: v.optional(v.string()),
  badge: v.optional(v.string()),
  color: v.optional(v.string()),
  style: v.optional(v.any()),
  position: v.optional(v.any()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  customProps: v.optional(v.any()),
  componentType: v.optional(v.string()),
  components: v.optional(v.any()),
  subSections: v.optional(v.any()),
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
  mediaMode: v.optional(
    v.union(
      v.literal("data"),
      v.literal("audio"),
      v.literal("video"),
      v.literal("audio-video"),
    ),
  ),
  enableDataChannel: v.optional(v.boolean()),
  enableAudio: v.optional(v.boolean()),
  enableMic: v.optional(v.boolean()),
  enableSpeaker: v.optional(v.boolean()),
  enableVideo: v.optional(v.boolean()),
  enableCamera: v.optional(v.boolean()),
  enableScreenShare: v.optional(v.boolean()),
  enableRemoteVideo: v.optional(v.boolean()),
  peerRole: v.optional(
    v.union(v.literal("peer"), v.literal("initiator"), v.literal("responder")),
  ),
  iceServerUrl: v.optional(v.string()),
  pollingIntervalMs: v.optional(v.number()),
  streamUrl: v.optional(v.string()),
  description: v.optional(v.string()),
  sourceServiceNodeId: v.optional(v.string()),
  sourceServiceLabel: v.optional(v.string()),
  sourceServiceName: v.optional(v.string()),
  sourceServicePort: v.optional(v.string()),
  sourceEventId: v.optional(v.string()),
  sourceItemName: v.optional(v.string()),
  sourceItemType: v.optional(
    v.union(v.literal("endpoint"), v.literal("event")),
  ),
  storeActionBinding: v.optional(storeActionBindingConvexValidator),
  storeActionBindings: v.optional(v.array(storeActionBindingConvexValidator)),
  subscriptionBindings: v.optional(v.array(v.any())),
  actionSteps: v.optional(v.array(v.any())),
  isLangGraph: v.optional(v.boolean()),
  langGraphStreamModes: v.optional(v.array(v.string())),
  langGraphStreamingFields: v.optional(v.array(v.string())),
  langGraphStreamIncludeReasoning: v.optional(v.boolean()),
  langGraphTargetNodeId: v.optional(v.string()),
  targetNodeId: v.optional(v.string()),
  targetEndpointId: v.optional(v.string()),
  targetServiceId: v.optional(v.string()),
  serviceNodeId: v.optional(v.string()),
  url: v.optional(v.string()),
  method: v.optional(v.string()),
  name: v.optional(v.string()),
  headers: v.optional(v.array(backendParameterValidator)),
  pathParams: v.optional(v.array(backendParameterValidator)),
  queryParams: v.optional(v.array(backendParameterValidator)),
  requestBody: v.optional(backendRequestBodyValidator),
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
  groupId: v.optional(v.string()),
  group: v.optional(v.string()),
  badge: v.optional(v.string()),
  position: v.optional(v.object({ x: v.number(), y: v.number() })),
  graphPosition: v.optional(v.object({ x: v.number(), y: v.number() })),
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
  isLayout: v.optional(v.boolean()),
  layoutSidebarInitialized: v.optional(v.boolean()),
  layoutTopbarInitialized: v.optional(v.boolean()),
  pageSlug: v.optional(v.string()),
  path: v.optional(v.string()),
  route: v.optional(v.string()),
  targetServerId: v.optional(v.string()),
  targetRouteId: v.optional(v.string()),
  targetServiceId: v.optional(v.string()),
  targetServiceName: v.optional(v.string()),
  serviceNodeId: v.optional(v.string()),
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
  stateObjects: v.optional(v.array(pageStateObjectConvexValidator)),
  pageStores: v.optional(v.array(v.any())),
  realtimeConnections: v.optional(v.array(realtimeConnectionConvexValidator)),
  uiPrompt: v.optional(v.string()),
  renderMode: v.optional(v.union(v.literal("server"), v.literal("client"))),
  protectionOverride: v.optional(protectionRuleConvexValidator),
  customDependencies: v.optional(v.array(nodeDependencyItemConvexValidator)),
  stackOrder: v.optional(v.number()),

  // Storage & Image Upload configuration
  connectedStorageNodeId: v.optional(v.string()),
  uploadBucketId: v.optional(v.string()),
  uploadAcceptedMimeTypes: v.optional(v.array(v.string())),
  uploadMaxFileSizeMb: v.optional(v.number()),
  uploadPreviewMode: v.optional(
    v.union(v.literal("thumbnail"), v.literal("none")),
  ),
  autoGeneratePresignEndpoint: v.optional(v.boolean()),
  presignEndpointId: v.optional(v.string()),

  // UI state tracking & routes
  endpoints: v.optional(v.array(v.any())),
  routeGroups: v.optional(v.array(v.any())),
  routes: v.optional(v.array(v.any())),
  activeSectionId: v.optional(v.string()),
  selectedSectionId: v.optional(v.string()),
  selectedActionId: v.optional(v.string()),
  apiRoutes: v.optional(v.array(v.any())),
  apiEndpoints: v.optional(v.array(v.any())),
  mockData: v.optional(v.any()),
  theme: v.optional(v.any()),
  metadata: v.optional(v.any()),
});

export const backendWebPageDataValidator = webPageConvexDataValidator;

export const envVarConvexValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
});

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
  color: v.optional(v.string()),
  techStack: v.optional(v.string()),
  techVersion: v.optional(v.string()),
  systemBadge: v.optional(v.string()),
  readOnly: v.optional(v.boolean()),
  isReadOnly: v.optional(v.boolean()),
  targetServiceId: v.optional(v.string()),
  serviceNodeId: v.optional(v.string()),
  envVars: v.optional(v.array(envVarConvexValidator)),
  version: v.optional(v.number()),
  recursionLimit: v.optional(v.number()),
  stepTimeoutMs: v.optional(v.number()),
  inputChannels: v.optional(v.array(v.any())),
  outputChannels: v.optional(v.array(v.any())),
  stateChannels: v.optional(v.array(v.any())),
  customReducers: v.optional(v.array(v.any())),
  outputPorts: v.optional(v.array(v.any())),
  tools: v.optional(v.array(v.any())),
  customLlmNodes: v.optional(v.array(v.any())),
  customLlmRefNodes: v.optional(v.array(v.any())),
  customToolRefNodes: v.optional(v.array(v.any())),
  customMiddlewareRefNodes: v.optional(v.array(v.any())),
  customMemoryRefNodes: v.optional(v.array(v.any())),
  customAgentRefNodes: v.optional(v.array(v.any())),
  customNodeRefNodes: v.optional(v.array(v.any())),
  customStateReducerRefNodes: v.optional(v.array(v.any())),
  customTransformerNodes: v.optional(v.array(v.any())),
  customTransformerRefNodes: v.optional(v.array(v.any())),
  transformerDefinitions: v.optional(v.array(v.any())),
  customTypesNodes: v.optional(v.array(v.any())),
  customTypesRefNodes: v.optional(v.array(v.any())),
  typesDefinitions: v.optional(v.array(v.any())),
  toolDefinitions: v.optional(v.array(v.any())),
  middlewareDefinitions: v.optional(v.array(v.any())),
  agentDefinitions: v.optional(v.array(v.any())),
  memoryDefinitions: v.optional(v.array(v.any())),
  graphSteps: v.optional(v.array(v.any())),
  graphEdges: v.optional(v.array(v.any())),
  memoryConfig: v.optional(v.any()),
  startNodePosition: v.optional(v.object({ x: v.number(), y: v.number() })),
  stateNodePosition: v.optional(v.object({ x: v.number(), y: v.number() })),
  checkpointerNodePosition: v.optional(
    v.object({ x: v.number(), y: v.number() }),
  ),
  endNodePosition: v.optional(v.object({ x: v.number(), y: v.number() })),
  endNodes: v.optional(v.array(v.any())),
  stackOrder: v.optional(v.number()),
});

// State Store Node Data Validator
export const stateStoreConvexDataValidator = v.object({
  label: v.optional(v.string()),
  storeName: v.optional(v.string()),
  targetWebAppId: v.optional(v.string()),
  targetPageId: v.optional(v.string()),
  fields: v.optional(
    v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        type: v.string(),
        isArray: v.optional(v.boolean()),
        required: v.optional(v.boolean()),
        defaultValue: v.optional(v.any()),
        description: v.optional(v.string()),
        reducer: v.optional(v.string()),
        customReducerCode: v.optional(v.string()),
        actions: v.optional(v.array(v.string())),
      }),
    ),
  ),
  actions: v.optional(
    v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        targetFieldId: v.optional(v.string()),
        targetFieldName: v.optional(v.string()),
        actionType: v.union(
          v.literal("set"),
          v.literal("append"),
          v.literal("pop"),
          v.literal("remove"),
          v.literal("toggle"),
          v.literal("increment"),
          v.literal("reset"),
          v.literal("populate"),
          v.literal("custom"),
          v.literal("mutate"),
        ),
        code: v.optional(v.string()),
        parameters: v.optional(
          v.array(
            v.object({
              id: v.optional(v.string()),
              name: v.string(),
              type: v.string(),
              required: v.optional(v.boolean()),
              description: v.optional(v.string()),
              defaultValue: v.optional(v.any()),
            }),
          ),
        ),
        connectedEndpointId: v.optional(v.string()),
        responseMappingMode: v.optional(
          v.union(
            v.literal("replace"),
            v.literal("merge"),
            v.literal("custom"),
          ),
        ),
        description: v.optional(v.string()),
        prompt: v.optional(v.string()),
        defaultManipulatorType: v.optional(
          v.union(
            v.literal("populate"),
            v.literal("reset"),
            v.literal("setter"),
            v.literal("mutate"),
            v.literal("append"),
            v.literal("pop"),
          ),
        ),
      }),
    ),
  ),
  testCases: v.optional(v.array(v.any())),
  disabledDefaultManipulators: v.optional(v.array(v.string())),
  deletedDefaultManipulators: v.optional(v.array(v.string())),
  description: v.optional(v.string()),
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
});

// Browser Storage Node Data Validator
export const browserStorageKeyConvexValidator = v.object({
  id: v.string(),
  name: v.string(),
  type: v.string(),
  defaultValue: v.optional(v.any()),
  description: v.optional(v.string()),
});

export const browserStorageConvexDataValidator = v.object({
  label: v.optional(v.string()),
  storageName: v.optional(v.string()),
  description: v.optional(v.string()),
  storageEngine: v.optional(
    v.union(v.literal("localStorage"), v.literal("sessionStorage")),
  ),
  namespace: v.optional(v.string()),
  keys: v.optional(v.array(browserStorageKeyConvexValidator)),
  targetWebAppId: v.optional(v.string()),
  targetPageId: v.optional(v.string()),
  targetPageIds: v.optional(v.array(v.string())),
  color: v.optional(v.string()),
  parentId: v.optional(v.string()),
  groupId: v.optional(v.string()),
  group: v.optional(v.string()),
  badge: v.optional(v.string()),
  position: v.optional(v.object({ x: v.number(), y: v.number() })),
  graphPosition: v.optional(v.object({ x: v.number(), y: v.number() })),
  style: v.optional(
    v.record(
      v.string(),
      v.union(v.string(), v.number(), v.boolean(), v.null()),
    ),
  ),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  aiEditing: v.optional(v.boolean()),
  envVars: v.optional(v.array(envVarConvexValidator)),
  systemBadge: v.optional(v.string()),
  readOnly: v.optional(v.boolean()),
  isReadOnly: v.optional(v.boolean()),
  stackOrder: v.optional(v.number()),
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
  zodToConvex(storageOperationRefDataSchema),
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
  stateStoreConvexDataValidator,
  zodToConvex(stateStoreNodeDataSchema),
  browserStorageConvexDataValidator,
  zodToConvex(browserStorageNodeDataSchema),
  // Fallback for partial updates (label is always present on real nodes)
  v.object({
    label: v.string(),
    color: v.optional(v.string()),
    parentId: v.optional(v.string()),
    groupId: v.optional(v.string()),
    group: v.optional(v.string()),
    badge: v.optional(v.string()),
    description: v.optional(v.string()),
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
    isLayout: v.optional(v.boolean()),
  layoutSidebarInitialized: v.optional(v.boolean()),
  layoutTopbarInitialized: v.optional(v.boolean()),
    isPackageNode: v.optional(v.boolean()),
    packageName: v.optional(v.string()),
    packageVersion: v.optional(v.string()),
    isInstalled: v.optional(v.boolean()),
    installError: v.optional(v.string()),
    isReadOnly: v.optional(v.boolean()),
    readOnly: v.optional(v.boolean()),
    systemBadge: v.optional(v.string()),
    stackOrder: v.optional(v.number()),
    storageNodeId: v.optional(v.string()),
    storageProvider: v.optional(v.string()),
    bucketId: v.optional(v.string()),
    bucketName: v.optional(v.string()),
    operationId: v.optional(v.string()),
    storageOperations: v.optional(v.array(v.any())),
    sourceEntityId: v.optional(v.string()),
    sourceEntityName: v.optional(v.string()),
    entityUpdatedAt: v.optional(v.number()),
    entitySyncWarning: v.optional(v.any()),
    envVars: v.optional(v.array(envVarConvexValidator)),
    expandedStepStacks: v.optional(v.array(v.string())),
    importedTransformerIds: v.optional(v.array(v.string())),
    packageImports: v.optional(v.array(v.any())),
    customDependencies: v.optional(v.array(nodeDependencyItemConvexValidator)),
    storageEngine: v.optional(v.string()),
    storageName: v.optional(v.string()),
    namespace: v.optional(v.string()),
    keys: v.optional(v.array(v.any())),
    targetPageIds: v.optional(v.array(v.string())),
  }),
);

export const backendEndpointDataValidator = zodToConvex(safeEndpointSchema);

export const backendIdentityProviderDataValidator = zodToConvex(
  identityProviderSchema,
);

export const backendEventDataValidator = zodToConvex(
  z.union([safePublishedEventSchema, safeConsumedEventSchema]),
);

export const backendDatabaseDataValidator = zodToConvex(databaseDataSchema);

export const backendEntityDataValidator = zodToConvex(entityDataSchema);

export const backendSimpleDataValidator = zodToConvex(simpleDataSchema);

export const backendGroupDataValidator = zodToConvex(simpleDataSchema);

export const backendTypesNodeDataValidator = zodToConvex(typesNodeDataSchema);

export const backendStorageOperationRefDataValidator = zodToConvex(
  storageOperationRefDataSchema,
);

export const backendStorageBucketRefDataValidator =
  backendStorageOperationRefDataValidator;

export const backendBrowserStorageDataValidator =
  browserStorageConvexDataValidator;
