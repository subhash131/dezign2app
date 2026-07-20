import { z } from "zod";
import { schemaModelSchema } from "./shared";
import { endpointSchema, endpointInputSchema } from "./endpoints";
import { consumedEventSchema, consumedEventInputSchema, publishedEventSchema, publishedEventInputSchema } from "./events";

export const baseNodeDataSchema = z.object({
  label: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  parentId: z.string().optional(),
  style: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const resourceItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  payloadSchema: schemaModelSchema.optional(),
  kind: z.string().optional(),
  storageType: z.string().optional(),
  storageTypeOther: z.string().optional(),
  storedDataTypes: z.array(z.string()).optional(),
  storedDataTypesOther: z.string().optional(),
  ttl: z.string().optional(),
  cacheEviction: z.string().optional(),
  cacheDataType: z.string().optional(),
  keyPrefix: z.string().optional(),
  description: z.string().optional(),
  namespace: z.string().optional(),
  keyPattern: z.string().optional(),
  cacheStrategy: z.string().optional(),
  sourceOfTruth: z.string().optional(),
  invalidationRules: z.string().optional(),
  compression: z.string().optional(),
  serialization: z.string().optional(),
  maxObjectSize: z.string().optional(),
  persistence: z.string().optional(),
  replication: z.string().optional(),
});

export const simpleDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
}).strict();

export const dbRefDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  tableRef: z.string().optional(),
  graphPosition: z.object({ x: z.number(), y: z.number() }).optional(),
}).strict();

export const dbRefDataInputSchema = dbRefDataSchema;

export const entityDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  dbType: z.enum(["relational", "vector"]).optional(),
  embeddingModel: z.string().optional(),
  dimensions: z.number().optional(),
  metric: z.enum(["Cosine", "Dot Product", "Euclidean"]).optional(),
  columns: z.array(z.object({
    name: z.string(),
    type: z.string(),
    isPrimaryKey: z.boolean().optional(),
    isForeignKey: z.boolean().optional(),
    isNotNull: z.boolean().optional(),
    isUnique: z.boolean().optional(),
    references: z.object({
      table: z.string(),
      column: z.string(),
    }).optional(),
  })),
  indexes: z.array(z.object({
    name: z.string(),
    columns: z.string(),
    isUnique: z.boolean().optional(),
  })).optional(),
}).strict();

export const entityColumnInputSchema = z.object({
  name: z.string(),
  type: z.string(),
  isPrimaryKey: z.boolean().optional(),
  isForeignKey: z.boolean().optional(),
  isNotNull: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  references: z.object({
    table: z.string(),
    column: z.string(),
  }).optional().describe("If this is a foreign key, which table and column it references in this group"),
});

export const entityDataInputSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  dbType: z.enum(["relational", "vector"]).optional(),
  embeddingModel: z.string().optional(),
  dimensions: z.number().optional(),
  metric: z.enum(["Cosine", "Dot Product", "Euclidean"]).optional(),
  columns: z.array(entityColumnInputSchema),
});

export const kafkaTopicSchema = z.object({
  id: z.string(),
  kind: z.literal("topic").optional(),
  name: z.string(),
  description: z.string().optional(),
  schema: z.string().optional(),
  payloadSchema: schemaModelSchema.optional(),
  version: z.string().optional(),
});
export type KafkaTopic = z.infer<typeof kafkaTopicSchema>;

export const kafkaTopicInputSchema = kafkaTopicSchema.extend({
  id: z.string().optional(),
});

export const kafkaBrokerSchema = z.object({
  partitions: z.number().optional(),
  replication: z.number().optional(),
  batchSize: z.string().optional(),
  compression: z.string().optional(),
  ttl: z.string().optional(),
});
export type KafkaBrokerConfig = z.infer<typeof kafkaBrokerSchema>;

export const kafkaDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  topics: z.array(kafkaTopicSchema).optional(),
  kafkaBroker: kafkaBrokerSchema.optional(),
  delivery: z.string().optional(),
  ordering: z.string().optional(),
  retention: z.string().optional(),
}).strict();
export type KafkaNodeData = z.infer<typeof kafkaDataSchema>;

export const kafkaDataInputSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  topics: z.array(kafkaTopicInputSchema).optional(),
  kafkaBroker: kafkaBrokerSchema.optional(),
  delivery: z.string().optional(),
  ordering: z.string().optional(),
  retention: z.string().optional(),
}).strict();

export const sqsDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  queues: z.array(resourceItemSchema).optional(),
  sqsBroker: z.object({
    visibilityTimeout: z.number().optional(),
    delay: z.number().optional(),
    fifo: z.boolean().optional(),
  }).optional(),
  delivery: z.string().optional(),
  failureHandling: z.string().optional(),
}).strict();

export const redisPubSubDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  channels: z.array(resourceItemSchema).optional(),
  redisPubSubBroker: z.object({
    db: z.string().optional(),
    namespace: z.string().optional(),
  }).passthrough().optional(),
  delivery: z.string().optional(),
}).strict();

export const redisStreamsDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  streams: z.array(resourceItemSchema).optional(),
  redisBroker: z.object({
    consumerGroup: z.string().optional(),
  }).optional(),
  delivery: z.string().optional(),
  ordering: z.string().optional(),
  retention: z.string().optional(),
}).strict();

export const redisCacheDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  caches: z.array(resourceItemSchema).optional(),
}).strict();

export const storageDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  buckets: z.array(resourceItemSchema).optional(),
}).strict();

export const externalDataSchema = simpleDataSchema.extend({
  baseUrl: z.string().optional(),
  actions: z.array(resourceItemSchema).optional(),
});

export const clientEventInputSchema = z.object({
  id: z.string().optional().describe("Unique identifier for this event"),
  name: z.string().describe("Logical name of the action (e.g., 'sendMessage', 'fetchData')"),
  event: z.string().optional().describe("The DOM event that triggers it"),
  targetNodeId: z.string().optional().describe("If this event triggers an API call, specify the target service node ID to AUTOMATICALLY create an edge"),
  targetEndpointId: z.string().optional().describe("If this event triggers an API call, specify the target endpoint ID on the service node to AUTOMATICALLY create an edge"),
  simulationCases: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    request: z.object({
      headers: z.record(z.string()).optional(),
      params: z.record(z.string()).optional(),
      body: z.unknown().optional(),
    }).optional(),
    expectedStatus: z.number().optional(),
    expectedBody: z.unknown().optional(),
    enabled: z.boolean().optional(),
  })).optional().describe("Named repeatable inputs for client-triggered simulations"),
});

export const webClientDataSchema = simpleDataSchema.extend({
  events: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    event: z.string().optional(),
    simulationCases: z.array(z.object({
      id: z.string(),
      name: z.string(),
      request: z.object({
        headers: z.record(z.string()).optional(),
        params: z.record(z.string()).optional(),
        body: z.unknown().optional(),
      }).optional(),
      expectedStatus: z.number().optional(),
      expectedBody: z.unknown().optional(),
      enabled: z.boolean().optional(),
    })).optional(),
  })).optional(),
});

export const webClientDataInputSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  events: z.array(clientEventInputSchema).optional(),
});

export const serviceDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  techStack: z.string().optional(),
  port: z.string().optional(),
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
  routeGroups: z.array(z.object({
    id: z.string(),
    name: z.string(),
    basePath: z.string(),
    endpoints: z.array(endpointSchema),
  })).optional(),
}).strict();
export type ServiceNodeData = z.infer<typeof serviceDataSchema>;

export const serviceDataInputSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  techStack: z.string().optional(),
  port: z.string().optional(),
  cors: z.boolean().optional(),
  corsOrigins: z.string().optional(),
  rateLimit: z.string().optional(),
  baseUrl: z.string().optional(),
  endpoints: z.array(endpointInputSchema).optional(),
  consumedEvents: z.array(consumedEventInputSchema).optional(),
  publishedEvents: z.array(publishedEventInputSchema).optional(),
  inputs: z.array(z.object({ id: z.string().optional(), name: z.string() }).passthrough()).optional(),
  outputs: z.array(z.object({ id: z.string().optional(), name: z.string() }).passthrough()).optional(),
  logic: z.array(z.object({ id: z.string().optional(), name: z.string() }).passthrough()).optional(),
  routeGroups: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    basePath: z.string(),
    endpoints: z.array(endpointInputSchema),
  }).passthrough()).optional(),
}).passthrough();

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
export const workerDataSchema = baseNodeDataSchema.extend({
  description:   z.string().optional(),
  // Core Resources
  tasks:         z.array(workerTaskSchema).optional(),
  // Implementation
  queueSources:  z.array(z.string()).optional(),          // IDs of broker nodes it pulls from
  // Configuration (Advanced)
  concurrency:   z.number().optional(),
  retryPolicy:   z.enum(["NONE", "EXPONENTIAL_BACKOFF", "FIXED_INTERVAL"]).optional(),
  maxRetries:    z.number().optional(),
  // Tags
  tags:          z.array(z.string()).optional(),
}).strict();
export type WorkerNodeData = z.infer<typeof workerDataSchema>;

// --- Serverless Function Node ---
export const serverlessDataSchema = baseNodeDataSchema.extend({
  description:  z.string().optional(),
  // Core Resources
  endpoints:    z.array(endpointSchema).optional(),
  // Implementation
  triggerType:  z.enum(["HTTP", "Event", "CRON", "Queue"]).optional(),
  runtime:      z.string().optional(),                    // "nodejs20.x", "python3.12", "go1.x"
  // Configuration (Advanced)
  memoryMb:     z.number().optional(),
  timeoutSec:   z.number().optional(),
  // Tags
  tags:         z.array(z.string()).optional(),
}).strict();
export type ServerlessNodeData = z.infer<typeof serverlessDataSchema>;

// --- Vector DB Ref Node (Graph View) ---
export const vectorDbRefDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  collectionRef: z.string().optional(),
  dbRef: z.string().optional(),
}).strict();
export type VectorDbRefNodeData = z.infer<typeof vectorDbRefDataSchema>;

// --- Search Index Node ---
export const searchIndexDataSchema = baseNodeDataSchema.extend({
  description:    z.string().optional(),
  // Core Resources
  searchSources: z.array(z.object({
    id: z.string(),
    sourceType: z.literal("Database"),
    dbTable: z.string(),
    dbPrimaryKey: z.string().optional(),
    dbSyncMode: z.string().optional(),
    indexes: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().optional(),
      analyzer: z.string().optional(),
      schema: schemaModelSchema.optional(),
    })),
  })).optional(),
  // Implementation
  implementation: z.enum(["Elasticsearch", "OpenSearch", "Algolia", "Meilisearch", "Typesense", "Other"]).optional(),
  // Configuration (Advanced)
  analyzer:       z.string().optional(),                  // "standard", "english", "icu_analyzer"
  // Tags
  tags:           z.array(z.string()).optional(),
}).strict();
export type SearchIndexNodeData = z.infer<typeof searchIndexDataSchema>;
export type SearchSource = NonNullable<z.infer<typeof searchIndexDataSchema>["searchSources"]>[number];
export type SearchIndexItem = SearchSource["indexes"][number];

// --- API Gateway Node ---
export const apiGatewayDataSchema = baseNodeDataSchema.extend({
  description:    z.string().optional(),
  // Core Resources
  routes:         z.array(resourceItemSchema).optional(),
  // Implementation
  implementation: z.enum(["AWS API Gateway", "Kong", "Nginx", "Traefik", "Custom", "Other"]).optional(),
  // Security
  authType:       z.enum(["None", "JWT", "API Key", "OAuth2", "mTLS"]).optional(),
  // Configuration (Advanced)
  rateLimit:      z.string().optional(),                  // "1000/min", "100/s"
  // Tags
  tags:           z.array(z.string()).optional(),
}).strict();
export type ApiGatewayNodeData = z.infer<typeof apiGatewayDataSchema>;

// --- Load Balancer Node ---
export const loadBalancerDataSchema = baseNodeDataSchema.extend({
  description:     z.string().optional(),
  // Core Resources
  targetGroups:    z.array(resourceItemSchema).optional(),
  // Implementation
  implementation:  z.enum(["AWS ALB", "AWS NLB", "Nginx", "HAProxy", "Cloudflare", "Other"]).optional(),
  // Configuration (Advanced)
  algorithm:       z.enum(["Round Robin", "Least Connections", "IP Hash", "Random"]).optional(),
  healthCheckPath: z.string().optional(),                 // "/health", "/ping"
  // Tags
  tags:            z.array(z.string()).optional(),
}).strict();
export type LoadBalancerNodeData = z.infer<typeof loadBalancerDataSchema>;

// --- Webhook Node ---
export const webhookDataSchema = baseNodeDataSchema.extend({
  description:    z.string().optional(),
  // Core Resources
  events:         z.array(resourceItemSchema).optional(),
  // Security
  authentication: z.enum(["None", "HMAC", "Bearer", "Basic", "Custom"]).optional(),
  // Tags
  tags:           z.array(z.string()).optional(),
}).strict();
export type WebhookNodeData = z.infer<typeof webhookDataSchema>;

// --- LLM Node ---
export const llmDataSchema = baseNodeDataSchema.extend({
  description:     z.string().optional(),
  // Core Resources (Basic)
  prompts:         z.array(resourceItemSchema).optional(),
  // Implementation (Basic)
  implementation:  z.enum(["OpenAI", "Anthropic", "Google Gemini", "Mistral", "Cohere", "Ollama", "Other"]).optional(),
  model:           z.string().optional(),                 // "gpt-4o", "claude-3-5-sonnet", etc.
  // Configuration (Advanced)
  temperature:     z.number().optional(),
  maxTokens:       z.number().optional(),
  structuredOutput: z.boolean().optional(),
  toolCalling:     z.boolean().optional(),
  tools:           z.array(resourceItemSchema).optional(),
  // Tags
  tags:            z.array(z.string()).optional(),
}).strict();
export type LlmNodeData = z.infer<typeof llmDataSchema>;

// --- MCP Server Node ---
export const mcpServerDataSchema = baseNodeDataSchema.extend({
  description:    z.string().optional(),
  // Core Resources (Basic)
  tools:          z.array(resourceItemSchema).optional(),
  resources:      z.array(resourceItemSchema).optional(),
  prompts:        z.array(resourceItemSchema).optional(),
  // Implementation (Advanced)
  connectionType: z.enum(["stdio", "SSE", "HTTP"]).optional(),
  // Security (Advanced)
  authentication: z.enum(["None", "Bearer", "API Key", "OAuth2"]).optional(),
  // Tags
  tags:           z.array(z.string()).optional(),
}).strict();
export type McpServerNodeData = z.infer<typeof mcpServerDataSchema>;

export const nodeDataSchemas: Record<string, z.ZodTypeAny> = {
  kafka: kafkaDataSchema,
  sqs: sqsDataSchema,
  "redis-pubsub": redisPubSubDataSchema,
  "redis-streams": redisStreamsDataSchema,
  "redis-cache": redisCacheDataSchema,
  entity: entityDataSchema,
  service: serviceDataSchema,
  db_ref: dbRefDataSchema,
  webClient: webClientDataSchema,
  external: externalDataSchema,
  group: simpleDataSchema,
  storage: storageDataSchema,
  // New nodes
  worker: workerDataSchema,
  serverless: serverlessDataSchema,
  search_index: searchIndexDataSchema,
  api_gateway: apiGatewayDataSchema,
  load_balancer: loadBalancerDataSchema,
  webhook: webhookDataSchema,
  llm: llmDataSchema,
  mcp_server: mcpServerDataSchema,
  vector_db_ref: vectorDbRefDataSchema,
};
