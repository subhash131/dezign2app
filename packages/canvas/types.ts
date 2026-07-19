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
import type { KafkaTopic, KafkaBrokerConfig, Endpoint, ServiceNodeData, ProcessingStep, WorkerTask } from "./schemas";
export type { KafkaTopic, KafkaBrokerConfig, Endpoint, ServiceNodeData, ProcessingStep, WorkerTask };

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
  | "vector_db_ref";

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
    graphPosition?: { x: number; y: number };
    techStack?: string;
    baseUrl?: string;
    cors?: boolean;
    corsOrigins?: string;
    rateLimit?: string;
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
    searchIndexes?: { 
      id: string; 
      name: string;
      description?: string;
      schema?: Schema;
      analyzer?: string;
      // Optional Data Source fields
      dataSourceType?: "Database" | "Kafka" | "API" | "Redis" | "File Storage" | "Manual" | string;
      dbName?: string;
      dbTable?: string;
      dbPrimaryKey?: string;
      dbSyncMode?: "Real-time (CDC)" | "Event-driven" | "Batch" | string;
      kafkaTopic?: string;
      kafkaDocumentId?: string;
      apiEndpoint?: string;
      apiPollingInterval?: string;
      redisNodeId?: string;
      fileLink?: string;
      fileDescription?: string;
      manualDetails?: string;
    }[];
    analyzer?: string;
    shards?: number;
    replicas?: number;
    refreshInterval?: string;
    reindexStrategy?: string;
    // --- API Gateway Node ---
    routes?: { id: string; name: string }[];
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
  };
  fractionalIndex: string; // For Z-order
  parentId?: string;
  style?: Record<string, string | number | boolean | null | undefined>;
  width?: number;
  height?: number;
  selected?: boolean;
};

export type BackendEdgeType = "connection" | "foreign-key" | "message";

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
  fields: Parameter[];
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
};

/** A global simulation scenario. */
export type SimulationTestCase = {
  id: string;
  name: string;
  targetNodeId: string;
  targetEventId?: string;
  request?: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    body?: unknown;
  };
  expectedStatus?: number;
  expectedBody?: unknown;
  enabled?: boolean;
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
  databaseNodeIds?: string[];
  databaseNodeId?: string;
  publishedEvents?: PublishedEventInputType[];
}

