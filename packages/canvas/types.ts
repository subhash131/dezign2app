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

  // --- Messaging resource definitions ---
  | "resource-def-in"
  | "resource-def-out"

  // --- Database (Table Reference) ---
  | "database-target"
  | "database-source"

  // --- External API actions ---
  | "action-target"

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

export type KafkaTopic = {
  id: string;
  kind: "topic";
  name: string;
  description?: string;
  schema?: string;
  version?: string;
};

export type RedisStream = {
  id: string;
  kind: "stream";
  name: string;
  description?: string;
  schema?: string;
  version?: string;
};

export type SQSQueue = {
  id: string;
  kind: "queue";
  name: string;
  description?: string;
  schema?: string;
  version?: string;
};

export type KafkaBrokerConfig = {
  partitions?: string;
  replication?: string;
  compression?: string;
  ttl?: string;
  batchSize?: string;
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
  schema?: string;
  version?: string;
};

export type RedisPubSubBrokerConfig = {
  // Future Redis Pub/Sub configuration.
  // Reserved for cluster/sharding-specific options if needed.
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
  | "entity"
  | "webClient"
  | "external"
  | "group";

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
    }[];
    indexes?: {
      name: string;
      columns: string;
      isUnique?: boolean;
    }[];
    isWebClient?: boolean;
    parentId?: string;
    graphPosition?: { x: number; y: number };
    schemaPosition?: { x: number; y: number };
    // New fields for Graph tab detailed nodes
    events?: { id: string; name: string; event?: string }[];
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
    techStack?: string;
    dbType?: string;
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
  };
  fractionalIndex: string; // For Z-order
  parentId?: string;
  style?: Record<string, unknown>;
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
  resourceType?: "topics" | "streams" | "queues" | "channels";
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
  | { op: "add_node"; type: BackendNodeType; label: string; position?: { x: number; y: number }; data?: Record<string, unknown> }
  | { op: "update_node"; id: string; changes: Record<string, unknown> }
  | { op: "delete_node"; id: string }
  | { op: "add_edge"; source: string; target: string; type: BackendEdgeType; data?: Record<string, unknown> }
  | { op: "update_edge"; id: string; changes: Record<string, unknown> }
  | { op: "delete_edge"; id: string }
  | { op: "run_auto_layout" }
  | { op: "add_shape"; type: string; x: number; y: number; props: Record<string, unknown> }
  | { op: "update_shape"; id: string; props: Record<string, unknown> }
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

export type ProcessingStep = {
  id: string;
  text: string;
};

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

export type Endpoint = {
  id: string;
  name: string;
  type: string;
  
  headers: Parameter[];
  pathParams: Parameter[];
  queryParams: Parameter[];
  
  requestBody: Schema;
  responseBody: Schema;
  
  processingSteps: ProcessingStep[];
  publishedEvents: PublishedEvent[];
  
  metadata?: ArchitectureMetadata;
  
  // Frontend specific fields
  params?: Parameter[];
  body?: string;
  businessLogic?: string;
  output?: string;
};

