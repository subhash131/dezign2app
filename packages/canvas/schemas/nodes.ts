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
  ttl: z.string().optional(),
  cacheEviction: z.string().optional(),
  cacheDataType: z.string().optional(),
  keyPrefix: z.string().optional(),
  description: z.string().optional(),
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
  redisPubSubBroker: z.object({}).passthrough().optional(),
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
};
