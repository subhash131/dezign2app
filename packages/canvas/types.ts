import type { MessagingResourceType, MessagingNodeType } from "./constants";
export type { MessagingResourceType, MessagingNodeType };

export type HandleKind =
  // --- Entity (schema view) ---
  | "entity-column-source"
  | "entity-column-target"
  | "entity-top-target"
  | "entity-bottom-source"

  // --- Service endpoints ---
  | "endpoint-in"
  | "endpoint-out"

  // --- WebClient events ---
  | "event-source"
  | "pageload-in"
  | "sse-in"
  | "websocket-in"

  // --- Service messaging ---
  | "published-event-out"
  | "consumed-event-in"
  | "consumed-event-out"

  // --- Messaging resource definitions ---
  | "resource-def-in"
  | "resource-def-out"

  // --- Database (Table Reference) ---
  | "database-target"
  | "database-source"

  // --- External API actions ---
  | "action-target"

  // --- Worker Tasks ---
  | "task-in"
  | "task-out"

  // --- Search Indexes ---
  | "index-in"
  | "index-out"

  // --- Fallback ---
  | "unknown";

export type RejectionCode =
  | "UNKNOWN_SOURCE_KIND"
  | "UNKNOWN_TARGET_KIND"
  | "INVALID_KIND_PAIR"
  | "SELF_CONNECTION"
  | "DUPLICATE_EDGE"
  | "SOURCE_NODE_NOT_FOUND"
  | "TARGET_NODE_NOT_FOUND";

export type ValidationResult =
  | { valid: true; edgeType: string; rulesVersion: number; resourceKind?: string }
  | { valid: false; code: RejectionCode; message: string; suggestion?: string; rulesVersion: number };

export type BackendCanvasView = "graph" | "sequence" | "schema";

// --- Backend Canvas Types ---
import type { KafkaTopic, KafkaBrokerConfig, Endpoint, ServiceNodeData, ProcessingStep, WorkerTask, SearchIndexItem, SearchSource, IdentityProvider } from "./schemas";
export type { KafkaTopic, KafkaBrokerConfig, Endpoint, ServiceNodeData, ProcessingStep, WorkerTask, SearchIndexItem, SearchSource, IdentityProvider };

export type RedisStream = {
  id: string;
  kind: "stream";
  name: string;
  description?: string;
  payloadSchema?: Schema;
  version?: string;
};

export type SQSQueue = {
  id: string;
  kind: "queue";
  name: string;
  description?: string;
  payloadSchema?: Schema;
  version?: string;
};



export type RedisStreamsBrokerConfig = {
  consumerGroup?: string;
};

export type SQSBrokerConfig = {
  visibilityTimeout?: string;
  delay?: string;
  fifo?: boolean;
};

export type RedisPubSubChannel = {
  id: string;
  kind: "channel";
  name: string;
  description?: string;
  payloadSchema?: Schema;
  version?: string;
};

export type RedisPubSubBrokerConfig = {
  db?: string;
  namespace?: string;
};

export type BackendNodeType =
  | "service"
  | "database"
  | "queue"
  | "pubsub"
  | "eventstream"
  | "kafka"
  | "redis-streams"
  | "sqs"
  | "redis-pubsub"
  | "redis-cache"
  | "entity"
  | "webClient"
  | "external"
  | "group"
  | "db_ref"
  | "storage"
  // New node types
  | "worker"
  | "serverless"
  | "search_index"
  | "api_gateway"
  | "load_balancer"
  | "webhook"
  | "llm"
  | "mcp_server"
  | "vector_db_ref"
  | "identity_provider";

export type BackendNode = {
  id: string;
  type: BackendNodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    description?: string;
    columns?: {
      name: string;
      type: string;
      isPrimaryKey?: boolean;
      isForeignKey?: boolean;
      isNotNull?: boolean;
      isUnique?: boolean;
      references?: {
        table: string;
        column: string;
      };
    }[];
    indexes?: {
      name: string;
      columns: string;
      isUnique?: boolean;
    }[];
    isWebClient?: boolean;
    parentId?: string;
    position?: { x: number; y: number };
    // New fields for Graph tab detailed nodes
    events?: UIEventItem[] | { id: string; name: string }[];
    inputs?: { id: string; name: string }[];
    logic?: { id: string; name: string }[];
    outputs?: { id: string; name: string }[];
    actions?: { id: string; name: string }[];
    messages?: { 
      id: string; 
      name: string;
      description?: string;
      schema?: string;
      retryPolicy?: string;
      version?: string;
    }[];
    eventChannels?: {
      id: string;
      name: string;
      description?: string;
      schema?: string;
      version?: string;
    }[];
    topics?: KafkaTopic[];
    streams?: RedisStream[];
    queues?: SQSQueue[];
    channels?: RedisPubSubChannel[];
    caches?: AnyMessagingResource[];
    buckets?: AnyMessagingResource[];
    kafkaBroker?: KafkaBrokerConfig;
    redisBroker?: RedisStreamsBrokerConfig;
    sqsBroker?: SQSBrokerConfig;
    redisPubSubBroker?: RedisPubSubBrokerConfig;
    publishedEvents?: { 
      id: string; 
      name: string;
      description?: string;
      schema?: string;
      version?: string;
      targetNodeId?: string;
    }[];
    consumedEvents?: { 
      id: string; 
      name: string;
      description?: string;
      schema?: string;
      retryPolicy?: string;
      version?: string;
      handlerLogic?: string;
      targetNodeId?: string;
    }[];
    tableRef?: string; // Reference to an entity node ID
    seedRows?: Record<string, string | number | boolean | null>[];
    graphPosition?: { x: number; y: number };
    techStack?: string;
    baseUrl?: string;
    cors?: boolean;
    corsOrigins?: string;
    rateLimit?: string;
    timeout?: string;
    port?: string;
    // Messaging/Queue/PubSub/EventStream node fields
    // (implementation is the broker choice; type of node IS the pattern)
    implementation?: string;
    delivery?: string;
    ordering?: string;
    failureHandling?: string;
    retention?: string;
    durable?: boolean;
    // Queue implementation specific fields
    kafkaPartitions?: string;
    kafkaReplication?: string;
    kafkaCompression?: string;
    kafkaTTL?: string;
    kafkaBatchSize?: string;
    rabbitExchange?: string;
    rabbitRoutingKey?: string;
    rabbitBindings?: string;
    sqsVisibilityTimeout?: string;
    sqsDelay?: string;
    sqsFifo?: boolean;
    redisConsumerGroup?: string;
    gcpTopic?: string;
    gcpSubscription?: string;
    azureTopic?: string;
    azureSubscription?: string;
    endpoints?: Endpoint[];
    routeGroups?: {
      id: string;
      name: string;
      basePath: string;
      endpoints: Endpoint[];
    }[];
    // --- Worker Node ---
    tasks?: WorkerTask[];
    queueSources?: string[];
    concurrency?: number;
    retryPolicy?: string;
    maxRetries?: number;
    // --- Entity Node ---
    dbType?: "relational" | "document" | "vector";
    embeddingModel?: string;
    dimensions?: number;
    metric?: "Cosine" | "Dot Product" | "Euclidean";
    // --- Serverless Node ---
    triggerType?: "HTTP" | "Event" | "CRON" | "Queue";
    runtime?: string;
    memoryMb?: number;
    timeoutSec?: number;
    // --- Vector DB Ref Node ---
    collectionRef?: string;
    dbRef?: string;
    // --- Search Index Node ---
    searchSources?: SearchSource[];
    analyzer?: string;
    shards?: number;
    replicas?: number;
    refreshInterval?: string;
    reindexStrategy?: string;
    // --- API Gateway Node ---
    routes?: GatewayRoute[];
    authRules?: AuthRule[];
    authType?: string;
    // --- Load Balancer Node ---
    targetGroups?: { id: string; name: string }[];
    algorithm?: string;
    healthCheckPath?: string;
    // --- Webhook Node ---
    // (events field already declared; authentication below)
    // --- LLM Node ---
    prompts?: { id: string; name: string }[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    structuredOutput?: boolean;
    toolCalling?: boolean;
    tools?: { id: string; name: string }[];
    // --- MCP Server Node ---
    // (tools/prompts declared above)
    resources?: { id: string; name: string }[];
    connectionType?: "stdio" | "SSE" | "HTTP";
    // --- Shared fields for new nodes ---
    authentication?: string;
    tags?: string[];
    // --- Identity Provider Node ---
    provider?: string;
    issuerUrl?: string;
    discoveryUrl?: string;
    jwksUrl?: string;
    audiences?: string[];
    supportedAlgorithms?: string[];
    customCapabilities?: {
      authentication?: boolean;
      userManagement?: boolean;
      identity?: boolean;
      authorization?: boolean;
    };
    customOutputs?: {
      user?: boolean;
      tokens?: boolean;
      claims?: boolean;
    };
  };
  fractionalIndex: string; // For Z-order
  parentId?: string;
  style?: Record<string, string | number | boolean | null | undefined>;
  width?: number;
  height?: number;
  selected?: boolean;
};

export type BackendEdgeType = "connection" | "foreign-key" | "message" | "identity-connection";

export type BackendEdge = {
  id: string;
  source: string;
  target: string;
  type: BackendEdgeType;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  sourceResourceId?: string;
  targetResourceId?: string;
  resourceType?: MessagingResourceType;
  data?: {
    label?: string;
    sequenceOrder?: number;
    sourceCardinality?: "1" | "N";
    targetCardinality?: "1" | "N";
    // --- Identity Connection Fields ---
    protocol?: string;
    grantType?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUris?: string[];
    pkce?: boolean;
    scopes?: string[];
    responseType?: string;
    responseMode?: string;
    notes?: string;
  };
  fractionalIndex: string; // For sequence diagram ordering
};

export type BackendDesignDoc = {
  schemaVersion?: number;
  nodes: BackendNode[];
  edges: BackendEdge[];
};

// --- AI Adapter Types ---

export type CanvasOperation =
  | { op: "add_node"; type: BackendNodeType; label: string; position?: { x: number; y: number }; data?: Partial<BackendNode["data"]> }
  | { op: "update_node"; id: string; changes: Partial<BackendNode> }
  | { op: "delete_node"; id: string }
  | { op: "add_edge"; source: string; target: string; type: BackendEdgeType; data?: Partial<BackendEdge["data"]> }
  | { op: "update_edge"; id: string; changes: Partial<BackendEdge> }
  | { op: "delete_edge"; id: string }
  | { op: "run_auto_layout" }
  | { op: "add_shape"; type: string; x: number; y: number; props: Record<string, string | number | boolean | null> }
  | { op: "update_shape"; id: string; props: Record<string, string | number | boolean | null> }
  | { op: "delete_shape"; id: string };

export interface CanvasAdapter<TDoc> {
  getState: () => TDoc;
  applyOperations: (ops: CanvasOperation[]) => void;
  serialize: () => string; // For AI context
}


// --- Enums & Primitives ---

export type IdPCapabilities = {
  authentication: boolean;
  userManagement: boolean;
  identity: boolean;
  authorization: boolean;
};

export type IdPOutputs = {
  user: boolean;
  tokens: boolean;
  claims: boolean;
};

export type IdentityProviderPreset = {
  provider: string;
  issuerUrl: string;
  discoveryUrl?: string;
  jwksUrl: string;
  supportedAlgorithms: string[];
  capabilities: IdPCapabilities;
  outputs: IdPOutputs;
};

export const IDENTITY_PROVIDER_PRESETS: Record<string, IdentityProviderPreset> = {
  auth0: { 
    provider: "Auth0", 
    issuerUrl: "https://<tenant>.auth0.com/", 
    discoveryUrl: "https://<tenant>.auth0.com/.well-known/openid-configuration",
    jwksUrl: "https://<tenant>.auth0.com/.well-known/jwks.json", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: true, userManagement: true, identity: false, authorization: true },
    outputs: { user: true, tokens: true, claims: true }
  },
  clerk: { 
    provider: "Clerk", 
    issuerUrl: "https://clerk.<your-domain>.com", 
    discoveryUrl: "https://clerk.<your-domain>.com/.well-known/openid-configuration",
    jwksUrl: "https://clerk.<your-domain>.com/.well-known/jwks.json", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: true, userManagement: true, identity: false, authorization: true },
    outputs: { user: true, tokens: true, claims: true }
  },
  keycloak: { 
    provider: "Keycloak", 
    issuerUrl: "https://<domain>/realms/<realm>", 
    discoveryUrl: "https://<domain>/realms/<realm>/.well-known/openid-configuration",
    jwksUrl: "https://<domain>/realms/<realm>/protocol/openid-connect/certs", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: true, userManagement: true, identity: true, authorization: true },
    outputs: { user: true, tokens: true, claims: true }
  },
  okta: { 
    provider: "Okta", 
    issuerUrl: "https://<domain>.okta.com/oauth2/default", 
    discoveryUrl: "https://<domain>.okta.com/oauth2/default/.well-known/openid-configuration",
    jwksUrl: "https://<domain>.okta.com/oauth2/default/v1/keys", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: true, userManagement: true, identity: true, authorization: true },
    outputs: { user: true, tokens: true, claims: true }
  },
  cognito: { 
    provider: "AWS Cognito", 
    issuerUrl: "https://cognito-idp.<region>.amazonaws.com/<pool-id>", 
    discoveryUrl: "https://cognito-idp.<region>.amazonaws.com/<pool-id>/.well-known/openid-configuration",
    jwksUrl: "https://cognito-idp.<region>.amazonaws.com/<pool-id>/.well-known/jwks.json", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: true, userManagement: true, identity: true, authorization: true },
    outputs: { user: true, tokens: true, claims: true }
  },
  firebase: { 
    provider: "Firebase", 
    issuerUrl: "https://securetoken.google.com/<project-id>", 
    discoveryUrl: "https://securetoken.google.com/<project-id>/.well-known/openid-configuration",
    jwksUrl: "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: true, userManagement: true, identity: true, authorization: false },
    outputs: { user: true, tokens: true, claims: true }
  },
  supabase: { 
    provider: "Supabase", 
    issuerUrl: "https://<project-ref>.supabase.co/auth/v1", 
    discoveryUrl: "https://<project-ref>.supabase.co/auth/v1/.well-known/openid-configuration",
    jwksUrl: "https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: true, userManagement: true, identity: true, authorization: true },
    outputs: { user: true, tokens: true, claims: true }
  },
  entraid: { 
    provider: "Azure Entra ID", 
    issuerUrl: "https://login.microsoftonline.com/<tenant-id>/v2.0", 
    discoveryUrl: "https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration",
    jwksUrl: "https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: true, userManagement: true, identity: true, authorization: true },
    outputs: { user: true, tokens: true, claims: true }
  },
  oidc: { 
    provider: "OpenID Connect", 
    issuerUrl: "https://<domain>", 
    discoveryUrl: "https://<domain>/.well-known/openid-configuration",
    jwksUrl: "https://<domain>/.well-known/jwks.json", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: true, userManagement: false, identity: false, authorization: false },
    outputs: { user: true, tokens: true, claims: true }
  },
  custom: { 
    provider: "Custom JWT", 
    issuerUrl: "", 
    discoveryUrl: "",
    jwksUrl: "", 
    supportedAlgorithms: ["RS256"],
    capabilities: { authentication: false, userManagement: false, identity: false, authorization: false },
    outputs: { user: false, tokens: false, claims: false }
  }
} as const;

export type RetryPolicy = "NONE" | "IMMEDIATE" | "EXPONENTIAL";
export type DeliveryGuarantee = "EXACTLY_ONCE" | "AT_LEAST_ONCE" | "AT_MOST_ONCE" | "FIRE_AND_FORGET";
export type EventOrdering = "NONE" | "GLOBAL" | "PER_ENTITY" | "PER_AGGREGATE";
export type EventCategory = "DOMAIN" | "INTEGRATION" | "INTERNAL" | "NOTIFICATION";
export type SchemaVersion = "v1" | "v2" | "v3";

export type ArchitectureMetadata = {
  createdAt?: number;
  updatedAt?: number;
  createdByAI?: boolean;
};

export type GatewayRoute = {
  id: string;
  name: string;
  method?: string;
  service?: string;
  authRuleId?: string;
};



export type AuthRule =
  | { type: "jwt"; id: string; name: string; description?: string; config: { providerId?: string; algorithms?: string[] } }
  | { type: "oauth2"; id: string; name: string; description?: string; config: { providerId?: string; algorithms?: string[] } }
  | { type: "apiKey"; id: string; name: string; description?: string; config: { headerName?: string } }
  | { type: "mtls"; id: string; name: string; description?: string; config: { clientCa?: string } }
  | { type: "basic"; id: string; name: string; description?: string; config?: Record<string, never> }
  | { type: "none"; id: string; name: string; description?: string; config?: Record<string, never> };

export type Parameter = {
  id: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  key?: string;
  value?: string;
};

export type Schema = {
  id: string;
  rawJson?: string;
};



export type ProcessingOperation =
  | "passthrough"
  | "validate"
  | "pick"
  | "omit"
  | "rename"
  | "set"
  | "filter"
  | "map"
  | "db_get"
  | "db_get_many"
  | "db_insert"
  | "db_update"
  | "db_delete"
  | "return";

// --- Event Models (Producer-Owned Contracts) ---

export type PublishedEvent = {
  id: string; // The canonical Event ID
  name: string; // e.g., chat.message.sent
  publishedWhen: string; // e.g. "Message successfully persisted"
  
  // Topic Mapping
  brokerNodeId: string; 
  messagingResourceId: string;
  
  // Contract
  payloadSchema: Schema;
  version: SchemaVersion;
  category: EventCategory;
  delivery: DeliveryGuarantee;
  ordering: EventOrdering;
  correlationId?: string;
  
  // Lifecycle
  deprecated: boolean;
  replacementEventId?: string;
  
  metadata?: ArchitectureMetadata;
};

export type ConsumedEvent = {
  id: string; // Consumer instance ID
  eventId: string; // References the PublishedEvent's canonical ID
  
  // Topic Mapping
  brokerNodeId: string; 
  messagingResourceId: string;
  
  // Consumer Behavior
  retryPolicy: RetryPolicy;
  maxRetries?: number;
  deadLetterQueue?: string; // e.g. "chat.failed.messages"
  isIdempotent: boolean;
  
  metadata?: ArchitectureMetadata;
};

// UI Specific Types
export type UIEventItem = {
  id: string;
  name: string;
  event?: string;
  schema?: string;
  testCases?: SimulationTestCase[];
};

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export interface JSONObject { [key: string]: JSONValue }
export interface JSONArray extends Array<JSONValue> {}

/** A global simulation scenario. */
export type SimulationTestCase = {
  id: string;
  name: string;
  targetNodeId: string;
  targetEventId?: string;
  request?: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    body?: JSONValue;
  };
  expectedStatus?: number;
  expectedBody?: JSONValue;
  enabled?: boolean;
  mocks?: Record<string, { returnData: JSONValue; status: number }>;
  expectedPath?: string[];
};

export type AnyMessagingResource = {
  id: string;
  name: string;
  _legacyName?: string;
  kind?: string;
  description?: string;
  publishedWhen?: string;
  payloadSchema?: Schema;
  handlerLogic?: string;
  retryPolicy?: RetryPolicy | string;
  maxRetries?: number;
  deadLetterQueue?: string;
  isIdempotent?: boolean;
  version?: SchemaVersion | string;
  category?: EventCategory | string;
  delivery?: DeliveryGuarantee | string;
  brokerNodeId?: string;
  messagingResourceId?: string;
  
  // Storage specific fields
  storageType?: string;
  storageTypeOther?: string;
  storedDataTypes?: string[];
  storedDataTypesOther?: string;

  // Cache specific fields
  ttl?: string;
  cacheEviction?: string;
  cacheDataType?: string;
  keyPrefix?: string; // legacy, can keep for compatibility
  namespace?: string;
  keyPattern?: string;
  cacheStrategy?: string;
  sourceOfTruth?: string;
  invalidationRules?: string;
  compression?: string;
  serialization?: string;
  maxObjectSize?: string;
  persistence?: string;
  replication?: string;
};



// --- Input Types (for AI tools & Store operations) ---

export interface ParameterInputType {
  id?: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  key?: string;
  value?: string;
}

export interface PublishedEventInputType {
  id?: string;
  name: string;
  kind?: string;
  schema?: string;
  targetNodeId?: string;
  targetResourceId?: string;
}

export interface ConsumedEventInputType {
  id?: string;
  name: string;
  kind?: string;
  schema?: string;
  handlerLogic?: string;
  targetNodeId?: string;
  targetResourceId?: string;
}

export interface EndpointInputType {
  id?: string;
  name: string;
  type: string;
  headers?: ParameterInputType[];
  pathParams?: ParameterInputType[];
  queryParams?: ParameterInputType[];
  requestBody?: { fields: ParameterInputType[] };
  responseBody?: { fields: ParameterInputType[] };
  simulationOutput?: unknown;
  processingSteps?: { id?: string; text: string; operation?: string; config?: Record<string, string | number | boolean | null> }[];
  output?: string;
  businessLogic?: string;
  summary?: string;
  requiredRoles?: string[];
  requiredScopes?: string[];
  audience?: string;
  databaseNodeIds?: string[];
  databaseNodeId?: string;
  publishedEvents?: PublishedEventInputType[];
}

export interface TestCaseItem {
  id?: string;
  testCaseId?: string;
  name?: string;
  targetNodeId?: string;
  nodeId?: string;
  targetEventId?: string;
  request?: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    body?: unknown;
  };
  expectedStatus?: number;
  expectedBody?: unknown;
}

export interface BackendNodeData {
  label?: string;
  description?: string;
  columns?: Array<{ name: string }>;
  endpoints?: Array<{ type: string; name: string }>;
  events?: UIEventItem[];
  topics?: Array<{ name: string }>;
  testCases?: TestCaseItem[];
  [key: string]: unknown;
}

export interface BackendNodeItem {
  nodeId: string;
  type?: string;
  data?: BackendNodeData;
}

