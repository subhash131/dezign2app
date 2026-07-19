import { z } from "zod";
import { PublishedEventInputType, ConsumedEventInputType } from "../types";
import {
  schemaVersionEnum,
  eventCategoryEnum,
  deliveryGuaranteeEnum,
  eventOrderingEnum,
  retryPolicyEnum,
} from "./primitives";
import { schemaModelSchema, architectureMetadataSchema } from "./shared";

export const publishedEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  publishedWhen: z.string().default("after-processing"),
  brokerNodeId: z.string().default(""),
  messagingResourceId: z.string().default(""),
  payloadSchema: schemaModelSchema.default({ id: "dummy", fields: [] }),
  version: schemaVersionEnum.default("v1"),
  category: eventCategoryEnum.default("DOMAIN"),
  delivery: deliveryGuaranteeEnum.default("AT_LEAST_ONCE"),
  ordering: eventOrderingEnum.default("NONE"),
  correlationId: z.string().optional(),
  deprecated: z.boolean().default(false),
  replacementEventId: z.string().optional(),
  targetNodeId: z.string().optional(),
  metadata: architectureMetadataSchema.optional(),
});

export const publishedEventInputSchema: z.ZodType<PublishedEventInputType> = z.object({
  id: z.string().optional(),
  name: z.string(),
  kind: z.string().optional(),
  schema: z.string().optional(),
  targetNodeId: z.string().optional(),
  targetResourceId: z.string().optional(),
  brokerNodeId: z.string().optional(),
}).passthrough();

export const consumedEventSchema = z.object({
  id: z.string(),
  eventId: z.string().default(""),
  brokerNodeId: z.string().default(""),
  messagingResourceId: z.string().default(""),
  retryPolicy: retryPolicyEnum.default("NONE"),
  maxRetries: z.number().optional(),
  deadLetterQueue: z.string().optional(),
  isIdempotent: z.boolean().default(false),
  targetNodeId: z.string().optional(),
  metadata: architectureMetadataSchema.optional(),
});

export const consumedEventInputSchema: z.ZodType<ConsumedEventInputType> = z.object({
  id: z.string().optional(),
  name: z.string(),
  kind: z.string().optional(),
  schema: z.string().optional(),
  handlerLogic: z.string().optional(),
  targetNodeId: z.string().optional(),
  targetResourceId: z.string().optional(),
  brokerNodeId: z.string().optional(),
}).passthrough();
