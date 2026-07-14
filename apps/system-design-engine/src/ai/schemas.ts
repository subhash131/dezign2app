import { z } from "zod";

export const resourceItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
});

export const kafkaDataSchema = z
  .object({
    topics: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string(),
          schema: z.string().optional(),
          version: z.string().optional(),
        })
      )
      .optional(),
    kafkaBroker: z
      .object({
        partitions: z.number().optional(),
        replication: z.number().optional(),
        batchSize: z.number().optional(),
        compression: z.string().optional(),
        ttl: z.string().optional(),
      })
      .optional(),
    delivery: z.string().optional(),
    ordering: z.string().optional(),
    retention: z.string().optional(),
  })
  .strict();

export const sqsDataSchema = z
  .object({
    queues: z.array(resourceItemSchema).optional(),
    sqsBroker: z
      .object({
        visibilityTimeout: z.number().optional(),
        delay: z.number().optional(),
        fifo: z.boolean().optional(),
      })
      .optional(),
    delivery: z.string().optional(),
    failureHandling: z.string().optional(),
  })
  .strict();

export const redisPubSubDataSchema = z
  .object({
    channels: z.array(resourceItemSchema).optional(),
    redisPubSubBroker: z.object({}).passthrough().optional(),
    delivery: z.string().optional(),
  })
  .strict();

export const redisStreamsDataSchema = z
  .object({
    streams: z.array(resourceItemSchema).optional(),
    redisBroker: z
      .object({
        consumerGroup: z.string().optional(),
      })
      .optional(),
    delivery: z.string().optional(),
    ordering: z.string().optional(),
    retention: z.string().optional(),
  })
  .strict();

export const entityDataSchema = z
  .object({
    columns: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        isPrimaryKey: z.boolean().optional(),
        isForeignKey: z.boolean().optional(),
        isNotNull: z.boolean().optional(),
        isUnique: z.boolean().optional(),
      })
    ),
  })
  .strict();

export const simpleDataSchema = z
  .object({
    label: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

export const dbRefDataSchema = z
  .object({
    label: z.string().optional(),
    description: z.string().optional(),
    tableRef: z.string().optional(),
  })
  .strict();

export const externalDataSchema = simpleDataSchema.extend({
  baseUrl: z.string().optional(),
  actions: z.array(resourceItemSchema).optional(),
});

export const parameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
});

export const schemaModelSchema = z.object({
  id: z.string(),
  fields: z.array(parameterSchema),
});

export const processingStepSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const architectureMetadataSchema = z.object({
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  createdByAI: z.boolean().optional(),
});

export const publishedEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  publishedWhen: z.string(),
  brokerNodeId: z.string(),
  messagingResourceId: z.string(),
  payloadSchema: schemaModelSchema,
  version: z.enum(["v1", "v2", "v3"]),
  category: z.enum(["DOMAIN", "INTEGRATION", "INTERNAL", "NOTIFICATION"]),
  delivery: z.enum(["EXACTLY_ONCE", "AT_LEAST_ONCE", "AT_MOST_ONCE", "FIRE_AND_FORGET"]),
  ordering: z.enum(["NONE", "GLOBAL", "PER_ENTITY", "PER_AGGREGATE"]),
  correlationId: z.string().optional(),
  deprecated: z.boolean(),
  replacementEventId: z.string().optional(),
  metadata: architectureMetadataSchema.optional(),
});

export const consumedEventSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  brokerNodeId: z.string(),
  messagingResourceId: z.string(),
  retryPolicy: z.enum(["NONE", "IMMEDIATE", "EXPONENTIAL"]),
  maxRetries: z.number().optional(),
  deadLetterQueue: z.string().optional(),
  isIdempotent: z.boolean(),
  metadata: architectureMetadataSchema.optional(),
});

export const endpointSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  headers: z.array(parameterSchema),
  pathParams: z.array(parameterSchema),
  queryParams: z.array(parameterSchema),
  requestBody: schemaModelSchema,
  responseBody: schemaModelSchema,
  processingSteps: z.array(processingStepSchema),
  publishedEvents: z.array(publishedEventSchema),
  metadata: architectureMetadataSchema.optional(),
});

export const serviceDataSchema = z
  .object({
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
    inputs: z.array(z.any()).optional(),
    outputs: z.array(z.any()).optional(),
    logic: z.array(z.any()).optional(),
    routeGroups: z.array(z.any()).optional(),
  })
  .strict();

export const nodeDataSchemas: Record<string, z.ZodTypeAny> = {
  kafka: kafkaDataSchema,
  sqs: sqsDataSchema,
  "redis-pubsub": redisPubSubDataSchema,
  "redis-streams": redisStreamsDataSchema,
  entity: entityDataSchema,
  service: serviceDataSchema,
  db_ref: dbRefDataSchema,
  webClient: simpleDataSchema,
  external: externalDataSchema,
  group: simpleDataSchema,
};

export function assignResourceIds<T extends Record<string, unknown>>(data: T): T {
  const resourceKeys = ["topics", "queues", "channels", "streams", "actions"];
  const result = { ...data };
  for (const key of resourceKeys) {
    const list = result[key];
    if (Array.isArray(list)) {
      (result as Record<string, unknown>)[key] = list.map((item: Record<string, unknown>, i: number) => ({
        ...item,
        id: item.id || `res-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
      }));
    }
  }
  return result;
}
