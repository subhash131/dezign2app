import { z } from "zod";
import { schemaModelSchema } from "../shared";
import { baseNodeDataSchema, resourceItemSchema } from "./base";

export const kafkaTopicSchema = resourceItemSchema.extend({
  kind: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  schema: z.string().optional(),
  payloadSchema: schemaModelSchema.optional(),
  version: z.string().optional(),
});
export type KafkaTopic = z.infer<typeof kafkaTopicSchema>;

export const kafkaTopicInputSchema = kafkaTopicSchema;

export const kafkaBrokerSchema = z.object({
  partitions: z.number().optional(),
  replication: z.number().optional(),
  batchSize: z.string().optional(),
  compression: z.string().optional(),
  ttl: z.string().optional(),
});
export type KafkaBrokerConfig = z.infer<typeof kafkaBrokerSchema>;

export const kafkaDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    topics: z.array(kafkaTopicSchema).optional(),
    kafkaBroker: kafkaBrokerSchema.optional(),
    delivery: z.string().optional(),
    ordering: z.string().optional(),
    retention: z.string().optional(),
  })
  .strict();
export type KafkaNodeData = z.infer<typeof kafkaDataSchema>;

export const kafkaDataInputSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    topics: z.array(kafkaTopicInputSchema).optional(),
    kafkaBroker: kafkaBrokerSchema.optional(),
    delivery: z.string().optional(),
    ordering: z.string().optional(),
    retention: z.string().optional(),
  })
  .strict();

export const sqsDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
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

export const redisPubSubDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    channels: z.array(resourceItemSchema).optional(),
    redisPubSubBroker: z
      .object({
        db: z.string().optional(),
        namespace: z.string().optional(),
      })
      .passthrough()
      .optional(),
    delivery: z.string().optional(),
  })
  .strict();

export const redisStreamsDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
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

export const redisCacheDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    schemaRef: z.string().optional(),
    databaseId: z.string().optional(),
    caches: z.array(resourceItemSchema).optional(),
  })
  .strict();
