import { z } from "zod";
import {
  schemaModelSchema,
  schemaModelInputSchema,
  parameterSchema,
  parameterInputSchema,
  transformerHelperSchema,
  transformerHelperInputSchema,
} from "../shared";
import { endpointSchema, endpointInputSchema } from "../endpoints";
import {
  consumedEventSchema,
  consumedEventInputSchema,
  publishedEventSchema,
  publishedEventInputSchema,
} from "../events";
import {
  baseNodeDataSchema,
  resourceItemSchema,
  simpleDataSchema,
} from "./base";
import {
  INTER_SERVICE_PROTOCOL_HTTP,
  INTER_SERVICE_PROTOCOL_GRPC,
} from "../../constants";


export const nodeDependencyItemSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional().default("latest"),
  isDev: z.boolean().optional().default(false),
  description: z.string().optional(),
  category: z.string().optional(),
  source: z.enum(["manual", "ai_inferred", "canvas_inferred"]).optional().default("manual"),
});
export type NodeDependencyItem = z.input<typeof nodeDependencyItemSchema>;

export const nodeDependencyItemInputSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  isDev: z.boolean().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  source: z.enum(["manual", "ai_inferred", "canvas_inferred"]).optional(),
}).passthrough();

export const externalInputVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "object", "array"]).default("string"),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
  description: z.string().optional(),
});

export const externalQueryParamSchema = z.object({
  id: z.string(),
  key: z.string().optional(),
  value: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const externalHeaderSchema = z.object({
  id: z.string(),
  key: z.string().optional(),
  value: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const externalDataSchema = simpleDataSchema.extend({
  functionName: z.string().optional(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  url: z.string().optional(),
  endpointPath: z.string().optional(),
  inputVariables: z.array(externalInputVariableSchema).optional(),
  queryParams: z.array(externalQueryParamSchema).optional(),
  headers: z.array(externalHeaderSchema).optional(),
  bodyType: z.enum(["json", "text", "raw", "none"]).optional(),
  bodyContent: z.string().optional(),
  responseSchema: z.any().optional(),
  errorResponseSchema: z.any().optional(),
  lastTestResult: z.any().optional(),
  baseUrl: z.string().optional(),
  authType: z.enum(["none", "bearer", "apiKey", "basic", "custom"]).optional(),
  authHeader: z.string().optional(),
  authQueryParam: z.string().optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  docsUrl: z.string().optional(),
  timeout: z.union([z.string(), z.number()]).optional(),
  rateLimit: z.string().optional(),
  defaultHeaders: z.array(parameterSchema).optional(),
  actions: z.array(resourceItemSchema).optional(),
  envVars: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

export const pageRefDataSchema = simpleDataSchema.extend({
  pageRefId: z.string().optional(),
  targetPageId: z.string().optional(),
  targetPageLabel: z.string().optional(),
  targetPageSlug: z.string().optional(),
});
export type PageRefNodeData = z.infer<typeof pageRefDataSchema>;

export const protectionRuleSchema = z.object({
  id: z.string().optional(),
  scope: z.enum(["zone", "page"]).optional(),
  conditions: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
  redirects: z.record(z.string()).optional(),
  customLogic: z
    .object({
      mode: z.enum(["naturalLanguage", "code"]),
      prompt: z.string().optional(),
      code: z.string().optional(),
    })
    .optional(),
});
export type WebPageProtectionRule = z.infer<typeof protectionRuleSchema>;

export const simulationCaseSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  request: z
    .object({
      headers: z.record(z.string()).optional(),
      params: z.record(z.string()).optional(),
      body: z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.string())]).optional(),
    })
    .optional(),
  expectedStatus: z.number().optional(),
  expectedBody: z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.string())]).optional(),
  enabled: z.boolean().optional(),
});

export const sseConfigSchema = z.object({
  reconnectStrategy: z.string().optional(),
  maxRetries: z.number().optional(),
  retryDelayMs: z.number().optional(),
  eventFilters: z.array(z.string()).optional(),
  withCredentials: z.boolean().optional(),
});

export const wsConfigSchema = z.object({
  payloadFormat: z.string().optional(),
  heartbeatIntervalMs: z.number().optional(),
  autoReconnect: z.boolean().optional(),
});

export const webRtcConfigSchema = z.object({
  signalingServerUrl: z.string().optional(),
  peerRole: z.string().optional(),
  audioConstraints: z.boolean().optional(),
  videoConstraints: z.boolean().optional(),
  dataChannel: z.boolean().optional(),
});

export const pollingConfigSchema = z.object({
  intervalMs: z.number().optional(),
  maxRounds: z.number().optional(),
  stopOnError: z.boolean().optional(),
});

export const clientEventInputSchema = z.object({
  id: z.string().optional().describe("Unique identifier for this event"),
  name: z
    .string()
    .describe("Logical name of the action (e.g., 'sendMessage', 'fetchData')"),
  event: z.string().optional().describe("The DOM event that triggers it"),
  schema: z.string().optional().describe("Input schema for the API call"),
  navigationType: z
    .enum(["link", "router"])
    .optional()
    .describe("Whether navigation uses declarative <Link> or programmatic useRouter().push()"),
  navigationCondition: z
    .enum(["direct", "on_success", "on_condition", "on_error"])
    .optional()
    .describe("Routing strategy condition"),
  targetRoute: z.string().optional().describe("Target URL route path"),
  targetPageId: z.string().optional().describe("ID of the target WebClient page node"),
  conditionCode: z.string().optional().describe("Expression or code for conditional router navigation"),
  targetNodeId: z
    .string()
    .optional()
    .describe(
      "If this event triggers an API call, specify the target service node ID to AUTOMATICALLY create an edge",
    ),
  targetEndpointId: z
    .string()
    .optional()
    .describe(
      "If this event triggers an API call, specify the target endpoint ID on the service node to AUTOMATICALLY create an edge",
    ),
  headers: z.array(parameterSchema).optional(),
  pathParams: z.array(parameterSchema).optional(),
  queryParams: z.array(parameterSchema).optional(),
  requestBody: schemaModelSchema.optional(),
  requestBodyMode: z.enum(["field_builder", "raw_json"]).optional(),
  simulationCases: z
    .array(simulationCaseSchema)
    .optional()
    .describe("Named repeatable inputs for client-triggered simulations"),
  description: z.string().optional(),
  uiPrompt: z.string().optional(),
  renderMode: z.enum(["server", "client"]).optional(),
  libraries: z.array(z.string()).optional(),
  sseConfig: sseConfigSchema.optional(),
  wsConfig: wsConfigSchema.optional(),
  webRtcConfig: webRtcConfigSchema.optional(),
  pollingConfig: pollingConfigSchema.optional(),
  storeActionBinding: z
    .object({
      storeNodeId: z.string(),
      actionId: z.string(),
      storeName: z.string().optional(),
      actionName: z.string().optional(),
      actionType: z
        .enum(["set", "append", "remove", "toggle", "custom"])
        .optional(),
      payloadExpr: z.string().optional(),
    })
    .optional(),
});

export const webPageEventSchema = clientEventInputSchema;

export const pageSectionSchema = z.object({
  id: z.string().describe("Unique identifier for this page section / component"),
  name: z.string().describe("Component name / section title"),
  renderMode: z.enum(["server", "client"]).optional().describe("Render mode for this component"),
  loadStrategy: z.enum(["eager", "dynamic", "dynamic-no-ssr"]).optional().describe("Loading strategy"),
  actions: z.array(webPageEventSchema).describe("Interactive actions inside this section"),
  states: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(["string", "number", "boolean", "array", "object"]),
        defaultValue: z
          .union([z.string(), z.number(), z.boolean(), z.null()])
          .optional(),
        description: z.string().optional(),
      }),
    )
    .optional()
    .describe("Local useState variables inside this section"),
  description: z.string().optional().describe("Functional description of what this section does"),
  uiPrompt: z.string().optional().describe("Visual styling and theme prompt for this section"),
  libraries: z.array(z.string()).optional().describe("Third-party libraries used in this section"),
});

export const realtimeConnectionSchema = z.object({
  id: z.string().describe("Unique identifier for this real-time connection"),
  protocol: z
    .enum(["SSE", "WEBSOCKET", "WEBRTC", "POLLING", "API_PUSH"])
    .describe("Delivery protocol for real-time messages"),
  eventName: z.string().optional().describe("Event name or message type to listen for"),
  room: z.string().optional().describe("Broadcast room or channel key for WebSockets"),
  pollingIntervalMs: z.number().optional().describe("Polling interval in milliseconds"),
  description: z.string().optional().describe("Description of real-time listener"),
  sourceServiceNodeId: z.string().optional().describe("ID of service node pushing this stream"),
  sourceServiceLabel: z.string().optional().describe("Label of service node pushing this stream"),
  sourceEventId: z.string().optional().describe("ID of source event or endpoint"),
  sourceItemName: z.string().optional().describe("Name of endpoint or event pushing this stream"),
  sourceItemType: z.enum(["endpoint", "event"]).optional().describe("Type of pipeline owner"),
});

export const webPageDataSchema = simpleDataSchema.extend({
  appName: z.string().optional().describe("Parent web application display name"),
  appSlug: z.string().optional().describe("Parent web application slug (e.g. customer-portal)"),
  accessType: z
    .enum(["public", "private", "role-gated", "payment-gated", "org-gated"])
    .optional()
    .describe("Page access control level"),
  allowedRoles: z.array(z.string()).optional().describe("User roles allowed access"),
  requiredPlans: z.array(z.string()).optional().describe("Subscription plan tiers allowed access"),
  allowedOrgRoles: z.array(z.string()).optional().describe("Organization roles allowed access"),
  redirectTo: z.string().optional().describe("Route path to redirect unauthorized users"),
  isAuthPage: z.boolean().optional().describe("Whether this page is the auth/login page"),
  authNodeId: z.string().optional().describe("Connected AuthNode ID"),
  zoneId: z.string().optional().describe("Connected WebApp zone ID"),
  useZoneDefault: z.boolean().optional().describe("Whether to inherit zone rules or custom override"),
  protectionOverride: protectionRuleSchema.optional().describe("Protection rule override"),
  isWebClient: z.boolean().optional(),
  isRoot: z.boolean().optional(),
  pageSlug: z.string().optional(),
  path: z.string().optional(),
  route: z.string().optional(),
  targetServerId: z.string().optional(),
  targetRouteId: z.string().optional(),
  headers: z.array(parameterSchema).optional().describe("Custom request headers sent by this web page"),
  pathParams: z.array(parameterSchema).optional().describe("URL path parameters for API requests"),
  queryParams: z.array(parameterSchema).optional().describe("URL query parameters for API requests"),
  requestBody: schemaModelSchema.optional().describe("Request body schema for API calls"),
  requestBodyMode: z.enum(["field_builder", "raw_json"]).optional().describe("UI mode for request body schema"),
  summary: z.string().optional().describe("Summary description of client API call"),
  requireAuth: z.boolean().optional().describe("Whether Authorization: Bearer <token> is forwarded automatically (defaults to true)"),
  pageSourceCode: z.string().optional().describe("AI-edited TSX source code for this WebClient page"),
  aiEditing: z.boolean().optional().describe("Whether AI agent is actively streaming page edit"),
  events: z.array(clientEventInputSchema).optional(),
  sections: z.array(pageSectionSchema).optional().describe("Sections hierarchy containing actions"),
  realtimeConnections: z.array(realtimeConnectionSchema).optional().describe("Real-time push streams"),
  uiPrompt: z.string().optional().describe("Page-level AI prompt"),
  renderMode: z.enum(["server", "client"]).optional().describe("Page-level render mode"),
  customDependencies: z.array(nodeDependencyItemSchema).optional(),
});

export const webPageDataInputSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  appName: z.string().optional(),
  appSlug: z.string().optional(),
  accessType: z
    .enum(["public", "private", "role-gated", "payment-gated", "org-gated"])
    .optional(),
  allowedRoles: z.array(z.string()).optional(),
  requiredPlans: z.array(z.string()).optional(),
  allowedOrgRoles: z.array(z.string()).optional(),
  redirectTo: z.string().optional(),
  isAuthPage: z.boolean().optional(),
  authNodeId: z.string().optional(),
  zoneId: z.string().optional(),
  useZoneDefault: z.boolean().optional(),
  headers: z.array(parameterInputSchema).optional(),
  pathParams: z.array(parameterInputSchema).optional(),
  queryParams: z.array(parameterInputSchema).optional(),
  requestBody: schemaModelInputSchema.optional(),
  requestBodyMode: z.enum(["field_builder", "raw_json"]).optional(),
  summary: z.string().optional(),
  requireAuth: z.boolean().optional(),
  pageSourceCode: z.string().optional(),
  aiEditing: z.boolean().optional(),
  events: z.array(clientEventInputSchema).optional(),
  sections: z.array(pageSectionSchema).optional(),
  realtimeConnections: z.array(realtimeConnectionSchema).optional(),
  uiPrompt: z.string().optional(),
  renderMode: z.enum(["server", "client"]).optional(),
  customDependencies: z.array(nodeDependencyItemInputSchema).optional(),
});

// --- WebApp Node ---
export const webAppRouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  method: z.string().optional(),
  service: z.string().optional(),
  authRuleId: z.string().optional(),
  accessType: z
    .enum(["public", "private", "role-gated", "payment-gated", "org-gated"])
    .optional(),
  allowedRoles: z.array(z.string()).optional(),
  requiredPlans: z.array(z.string()).optional(),
  allowedOrgRoles: z.array(z.string()).optional(),
  redirectTo: z.string().optional(),
  isAuthPage: z.boolean().optional(),
  events: z.array(clientEventInputSchema).optional(),
});
export type WebAppRoute = z.infer<typeof webAppRouteSchema>;

export const webAppZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  handleId: z.string(),
  accessType: z.enum(["public", "protected"]),
  rule: z
    .object({
      id: z.string(),
      scope: z.enum(["zone", "page"]),
      conditions: z.record(z.string(), z.unknown()).optional(),
      redirects: z.record(z.string(), z.string()).optional(),
      customLogic: z
        .object({
          mode: z.enum(["naturalLanguage", "code"]),
          prompt: z.string().optional(),
          code: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  hasLayout: z.boolean().optional(),
  layoutDescription: z.string().optional(),
  layoutSourceCode: z.string().optional(),
  layoutImageUrl: z.string().optional(),
  layoutImages: z.array(z.string()).optional(),
});

export const webAppDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    appSlug: z.string().optional(),
    framework: z.string().optional(),
    port: z.string().optional(),
    skipDefaultPages: z.boolean().optional(),
    routes: z.array(webAppRouteSchema).optional(),
    zones: z.array(webAppZoneSchema).optional(),
    authMode: z
      .enum(["none", "connected_auth_node", "custom_jwt", "better_auth"])
      .optional(),
    authNodeId: z.string().optional(),
    defaultLoginRoute: z.string().optional(),
    corsOrigins: z.string().optional(),
    showNav: z.boolean().optional(),
    customDependencies: z.array(nodeDependencyItemSchema).optional(),
    envVars: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();
export type WebAppNodeData = z.infer<typeof webAppDataSchema>;

export const serviceDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    techStack: z.string().optional(),
    port: z.string().optional(),
    grpcPort: z.string().optional(),
    interServiceProtocol: z
      .enum([INTER_SERVICE_PROTOCOL_HTTP, INTER_SERVICE_PROTOCOL_GRPC])
      .optional(),
    cors: z.boolean().optional(),

    corsOrigins: z.string().optional(),
    rateLimit: z.string().optional(),
    baseUrl: z.string().optional(),
    endpoints: z.array(endpointSchema).optional(),
    consumedEvents: z.array(consumedEventSchema).optional(),
    publishedEvents: z.array(publishedEventSchema).optional(),
    inputs: z.array(resourceItemSchema).optional(),
    outputs: z.array(resourceItemSchema).optional(),
    logic: z.array(resourceItemSchema).optional(),
    routeGroups: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          basePath: z.string(),
          endpoints: z.array(endpointSchema),
        }),
      )
      .optional(),
    /** Local data-transformation helper functions attached to this service */
    transformerHelpers: z.array(transformerHelperSchema).optional(),
    customDependencies: z.array(nodeDependencyItemSchema).optional(),
    envVars: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
        }),
      )
      .optional(),
  })
  .strict();
export type ServiceNodeData = z.infer<typeof serviceDataSchema>;

export const serviceDataInputSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    techStack: z.string().optional(),
    port: z.string().optional(),
    grpcPort: z.string().optional(),
    interServiceProtocol: z
      .enum([INTER_SERVICE_PROTOCOL_HTTP, INTER_SERVICE_PROTOCOL_GRPC])
      .optional(),
    cors: z.boolean().optional(),


    corsOrigins: z.string().optional(),
    rateLimit: z.string().optional(),
    baseUrl: z.string().optional(),
    endpoints: z.array(endpointInputSchema).optional(),
    consumedEvents: z.array(consumedEventInputSchema).optional(),
    publishedEvents: z.array(publishedEventInputSchema).optional(),
    inputs: z
      .array(
        z.object({ id: z.string().optional(), name: z.string() }).passthrough(),
      )
      .optional(),
    outputs: z
      .array(
        z.object({ id: z.string().optional(), name: z.string() }).passthrough(),
      )
      .optional(),
    logic: z
      .array(
        z.object({ id: z.string().optional(), name: z.string() }).passthrough(),
      )
      .optional(),
    routeGroups: z
      .array(
        z
          .object({
            id: z.string().optional(),
            name: z.string(),
            basePath: z.string(),
            endpoints: z.array(endpointInputSchema),
          })
          .passthrough(),
      )
      .optional(),
    /** Local data-transformation helper functions attached to this service */
    transformerHelpers: z.array(transformerHelperInputSchema).optional(),
    customDependencies: z.array(nodeDependencyItemInputSchema).optional(),
  })
  .passthrough();

export const workerTaskTriggerSchema = z.object({
  id: z.string(),
  type: z.enum(["event", "cron"]),
  value: z.string().optional(),
});
export type WorkerTaskTrigger = z.infer<typeof workerTaskTriggerSchema>;

export const workerTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  triggers: z.array(workerTaskTriggerSchema).optional(),
  inputSchema: schemaModelSchema.optional(),
  outputSchema: schemaModelSchema.optional(),
  retryPolicy: z.string().optional(),
  timeout: z.string().optional(),
});
export type WorkerTask = z.infer<typeof workerTaskSchema>;

// --- Worker Node ---
export const workerDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    // Core Resources
    tasks: z.array(workerTaskSchema).optional(),
    // Implementation
    queueSources: z.array(z.string()).optional(), // IDs of broker nodes it pulls from
    // Configuration (Advanced)
    concurrency: z.number().optional(),
    retryPolicy: z
      .enum(["NONE", "EXPONENTIAL_BACKOFF", "FIXED_INTERVAL"])
      .optional(),
    maxRetries: z.number().optional(),
    // Tags
    tags: z.array(z.string()).optional(),
  })
  .strict();
export type WorkerNodeData = z.infer<typeof workerDataSchema>;

// --- Serverless Function Node ---
export const serverlessDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    // Core Resources
    endpoints: z.array(endpointSchema).optional(),
    // Implementation
    triggerType: z.enum(["HTTP", "Event", "CRON", "Queue"]).optional(),
    runtime: z.string().optional(), // "nodejs20.x", "python3.12", "go1.x"
    // Configuration (Advanced)
    memoryMb: z.number().optional(),
    timeoutSec: z.number().optional(),
    // Tags
    tags: z.array(z.string()).optional(),
  })
  .strict();
export type ServerlessNodeData = z.infer<typeof serverlessDataSchema>;
