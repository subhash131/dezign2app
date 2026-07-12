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
    description: z.string().optional(),
  })
  .strict();

export const serviceDataSchema = z
  .object({
    description: z.string().optional(),
    techStack: z.string().optional(),
    port: z.string().optional(),
    cors: z.boolean().optional(),
    corsOrigins: z.string().optional(),
    rateLimit: z.string().optional(),
    baseUrl: z.string().optional(),
    endpoints: z.array(z.any()).optional(),
    consumedEvents: z.array(z.any()).optional(),
    publishedEvents: z.array(z.any()).optional(),
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
  database: simpleDataSchema,
  webClient: simpleDataSchema,
  external: simpleDataSchema,
  group: simpleDataSchema,
};

export function assignResourceIds(data: Record<string, any>) {
  const resourceKeys = ["topics", "queues", "channels", "streams"];
  for (const key of resourceKeys) {
    if (Array.isArray(data[key])) {
      data[key] = data[key].map((item: any, i: number) => ({
        ...item,
        id: item.id || `res-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
      }));
    }
  }
  return data;
}
