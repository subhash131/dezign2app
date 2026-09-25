import type { Schema } from "./simulation";
import type { ArchitectureMetadata } from "./canvas-core";
import type { KafkaTopic, KafkaBrokerConfig } from "../schemas";
import type { PipelineStep } from "../schemas/shared";
import type { StorageOperationFunction } from "./storage";


export type {
  KafkaTopic,
  KafkaBrokerConfig,
  Endpoint,
  ProcessingStep,
  WorkerTask,
  SearchIndexItem,
  SearchSource,
  IdentityProvider,
} from "../schemas";

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

export type RetryPolicy = "NONE" | "IMMEDIATE" | "EXPONENTIAL";
export type DeliveryGuarantee =
  | "EXACTLY_ONCE"
  | "AT_LEAST_ONCE"
  | "AT_MOST_ONCE"
  | "FIRE_AND_FORGET";
export type EventOrdering = "NONE" | "GLOBAL" | "PER_ENTITY" | "PER_AGGREGATE";
export type EventCategory =
  | "DOMAIN"
  | "INTEGRATION"
  | "INTERNAL"
  | "NOTIFICATION";
export type SchemaVersion = "v1" | "v2" | "v3";

/** Protocol used to push server-side data to a web-page client. */
export type ClientDeliveryProtocol = "SSE" | "WEBSOCKET" | "WEBRTC" | "API_PUSH";

/** Messaging broker node fields — Kafka, SQS, Redis Streams, PubSub, etc. */
export interface MessagingNodeData {
  // Common broker config
  implementation?: string;
  delivery?: string;
  ordering?: string;
  failureHandling?: string;
  retention?: string;
  durable?: boolean;
  // Resources per broker type
  topics?: KafkaTopic[];
  streams?: RedisStream[];
  queues?: SQSQueue[];
  channels?: RedisPubSubChannel[];
  caches?: AnyMessagingResource[];
  buckets?: AnyMessagingResource[];
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
  // Broker-level configs
  kafkaBroker?: KafkaBrokerConfig;
  redisBroker?: RedisStreamsBrokerConfig;
  sqsBroker?: SQSBrokerConfig;
  redisPubSubBroker?: RedisPubSubBrokerConfig;
  // Kafka topic-level
  kafkaPartitions?: string;
  kafkaReplication?: string;
  kafkaCompression?: string;
  kafkaTTL?: string;
  kafkaBatchSize?: string;
  // RabbitMQ
  rabbitExchange?: string;
  rabbitRoutingKey?: string;
  rabbitBindings?: string;
  // SQS
  sqsVisibilityTimeout?: string;
  sqsDelay?: string;
  sqsFifo?: boolean;
  // Redis Streams
  redisConsumerGroup?: string;
  // GCP Pub/Sub
  gcpTopic?: string;
  gcpSubscription?: string;
  // Azure Service Bus
  azureTopic?: string;
  azureSubscription?: string;
}

// --- Event Models (Producer-Owned Contracts) ---

export type PublishedEvent = {
  id: string; // The canonical Event ID
  name: string; // e.g., chat.message.sent
  publishedWhen: string; // e.g. "Message successfully persisted"

  // Topic Mapping
  brokerNodeId: string;
  messagingResourceId: string;
  resourceType?: string;

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
  pipelineSteps?: PipelineStep[];

  metadata?: ArchitectureMetadata;
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
  pipelineSteps?: PipelineStep[];
  body?: string;
  code?: string;
  prompt?: string;
  functionBody?: string;
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
  accessPolicy?: string;
  allowedOperations?: string[];
  maxFileSize?: string;
  allowedMimeTypes?: string;
  allowedExtensions?: string;
  enablePresignedUrls?: boolean;
  presignedUrlTtl?: string;
  enableDirectUpload?: boolean;
  enableCors?: boolean;
  corsOrigins?: string;
  corsMethods?: string[];
  corsHeaders?: string;
  corsMaxAge?: string;
  enableCdn?: boolean;
  cdnDomain?: string;
  cdnCacheControl?: string;
  enableMetadata?: boolean;
  storageClass?: string;
  region?: string;
  endpointUrl?: string;
  accessKeyIdEnv?: string;
  secretAccessKeyEnv?: string;
  sessionTokenEnv?: string;
  roleArn?: string;
  forcePathStyle?: boolean;
  versioning?: string;
  encryption?: string;
  kmsKeyId?: string;
  lifecycleExpirationDays?: string;
  lifecycleGlacierDays?: string;
  eventTriggers?: string[];
  eventPrefixFilter?: string;
  eventSuffixFilter?: string;

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
  storageOperations?: StorageOperationFunction[];
};

export type ConfigItemData = AnyMessagingResource & {
  variant?: string;
  nodeId?: string;
};

import type { BrokerResourceKey } from "../constants/messaging";

export type ResourceArrayName =
  | BrokerResourceKey
  | "";

export interface EventConfigProps {
  id: string;
  nodeId: string;
}

export const MESSAGING_TYPES = new Set([
  "kafka",
  "queue",
  "eventstream",
  "pubsub",
  "redis-streams",
  "sqs",
  "redis-pubsub",
]);


