/**
 * @module schemas
 *
 * Single source-of-truth Zod schemas for every backend-canvas node data shape.
 *
 * These schemas mirror the TypeScript types in ./types.ts and are consumed by:
 *   1. The AI tool layer (system-design-engine) — for LLM tool parameter validation
 *   2. The frontend (apps/web) — for runtime validation when needed
 *   3. (Future) The Convex backend — to replace `v.any()` in mutations
 *
 * Two "tiers" are exported per domain object:
 *   - **Stored schema** (e.g. `parameterSchema`):   All required IDs present.
 *   - **AI-input schema** (e.g. `parameterInputSchema`): IDs optional — the
 *     `assignResourceIds` helper fills them in before storage.
 */

import { z } from "zod";
import {
  ParameterInputType,
  PublishedEventInputType,
  ConsumedEventInputType,
  EndpointInputType,
} from "./types";


// ---------------------------------------------------------------------------
// Primitives & enums
// ---------------------------------------------------------------------------

export const retryPolicyEnum = z.enum(["NONE", "IMMEDIATE", "EXPONENTIAL"]);
export const deliveryGuaranteeEnum = z.enum(["EXACTLY_ONCE", "AT_LEAST_ONCE", "AT_MOST_ONCE", "FIRE_AND_FORGET"]);
export const eventOrderingEnum = z.enum(["NONE", "GLOBAL", "PER_ENTITY", "PER_AGGREGATE"]);
export const eventCategoryEnum = z.enum(["DOMAIN", "INTEGRATION", "INTERNAL", "NOTIFICATION"]);
export const schemaVersionEnum = z.enum(["v1", "v2", "v3"]);

export const processingOperationEnum = z.enum([
  "passthrough", "validate", "pick", "omit", "rename", "set", "filter", "map",
  "db_get", "db_get_many", "db_insert", "db_update", "db_delete", "return",
]);

// ---------------------------------------------------------------------------
// Shared sub-objects
// ---------------------------------------------------------------------------

/** Stored form — `id` is required. */
export const parameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  key: z.string().optional(),
  value: z.string().optional(),
});

/** AI-input form — `id` is optional (auto-assigned). */
export const parameterInputSchema = parameterSchema.extend({
  id: z.string().optional(),
});

export const schemaModelSchema = z.object({
  id: z.string(),
  fields: z.array(parameterSchema),
});

export const schemaModelInputSchema = z.object({
  id: z.string().optional(),
  fields: z.array(parameterInputSchema),
});

export const processingStepSchema = z.object({
  id: z.string(),
  text: z.string(),
  operation: processingOperationEnum.optional(),
  config: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type ProcessingStep = z.infer<typeof processingStepSchema>;

export const processingStepInputSchema = processingStepSchema.extend({
  id: z.string().optional(),
});

export const architectureMetadataSchema = z.object({
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  createdByAI: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Event models (Producer-Owned Contracts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Endpoint
// ---------------------------------------------------------------------------

export const endpointSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  databaseNodeIds: z.array(z.string()).optional(),
  databaseNodeId: z.string().optional(),
  headers: z.array(parameterSchema).optional(),
  pathParams: z.array(parameterSchema).optional(),
  queryParams: z.array(parameterSchema).optional(),
  requestBody: schemaModelSchema.optional(),
  responseBody: schemaModelSchema.optional(),
  simulationOutput: z.unknown().optional(),
  processingSteps: z.array(processingStepSchema).optional(),
  publishedEvents: z.array(publishedEventSchema).optional(),
  metadata: architectureMetadataSchema.optional(),
  // Frontend-specific legacy fields
  params: z.array(parameterSchema).optional(),
  body: z.string().optional(),
  businessLogic: z.string().optional(),
  output: z.string().optional(),
});
export type Endpoint = z.infer<typeof endpointSchema>;

/** AI-input form: IDs optional, sub-objects use input variants. */
export const endpointInputSchema: z.ZodType<EndpointInputType> = z.object({
  id: z.string().optional(),
  name: z.string().describe("Endpoint path (e.g., /api/users)"),
  type: z.string().describe("HTTP method (GET, POST, etc.)"),
  headers: z.array(z.object({
    id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
    description: z.string().optional(), defaultValue: z.string().optional(),
  })).describe("Request headers. Use [] when none are required."),
  pathParams: z.array(z.object({
    id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
    description: z.string().optional(), defaultValue: z.string().optional(),
  })).describe("Path parameters, such as id in /products/{id}. Use [] when none."),
  queryParams: z.array(z.object({
    id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
    description: z.string().optional(), defaultValue: z.string().optional(),
  })).describe("Query parameters such as page, limit, or q. Use [] when none."),
  requestBody: z.object({
    id: z.string().optional(),
    fields: z.array(z.object({
      id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
      description: z.string().optional(),
    }).passthrough()),
  }).passthrough().describe("Request body schema. Use fields: [] only for endpoints with no body."),
  responseBody: z.object({
    id: z.string().optional(),
    fields: z.array(z.object({
      id: z.string().optional(), name: z.string(), type: z.string(), required: z.boolean(),
      description: z.string().optional(),
    }).passthrough()),
  }).passthrough().describe("Response body schema; define the actual returned fields."),
  simulationOutput: z.unknown().optional().describe("Fixture returned by this endpoint during simulation; passed unchanged to the next connected endpoint."),
  processingSteps: z.array(z.object({
    id: z.string().optional(),
    text: z.string(),
    operation: z.string().optional(),
    config: z.record(z.union([z.string(), z.number(), z.boolean(), z.null(), z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))])).optional(),
  }).passthrough()).describe("Executable request-processing steps in order."),
  output: z.string().optional().describe("Short response description; do not use this instead of responseBody."),
  businessLogic: z.string().optional().describe("Human-readable purpose of the endpoint."),
  databaseNodeIds: z.array(z.string()).optional().describe(
    "IDs of db_ref nodes this endpoint reads from or writes to. REQUIRED whenever this endpoint uses a database; one endpoint may target multiple tables."
  ),
  databaseNodeId: z.string().optional().describe(
    "Single db_ref node ID this endpoint uses; prefer databaseNodeIds when there is more than one."
  ),
  publishedEvents: z.array(publishedEventInputSchema).optional(),
}) as z.ZodType<EndpointInputType>;

// ---------------------------------------------------------------------------
// Node data schemas — per BackendNodeType
// ---------------------------------------------------------------------------

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

/** AI-input variant for entity columns (adds `references` for FK resolution). */
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

// ---------------------------------------------------------------------------
// Node data schemas map — keyed by BackendNodeType
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Utility: assign IDs to resource arrays
// ---------------------------------------------------------------------------

/**
 * Walk known resource-array keys (`topics`, `queues`, `channels`, `streams`,
 * `actions`) and stamp a unique `id` on every item that lacks one.
 */
export function assignResourceIds<T extends Record<string, string | number | boolean | object | null | undefined>>(data: T): T {
  const resourceKeys = ["topics", "queues", "channels", "streams", "actions"];
  const result = { ...data };
  for (const key of resourceKeys) {
    const list = result[key];
    if (Array.isArray(list)) {
      (result as Record<string, string | number | boolean | object | null | undefined>)[key] = list.map(
        (item: string | number | boolean | object | null, i: number) => {
          if (typeof item === 'object' && item !== null) {
            return {
              ...item,
              id:
                ('id' in item && typeof (item as Record<string, string | number | boolean | object | null | undefined>).id === 'string' ? (item as Record<string, string | number | boolean | object | null | undefined>).id : "") ||
                `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            };
          }
          return item;
        }
      );
    }
  }
  return result;
}
// ---------------------------------------------------------------------------
// Edge data schema
// ---------------------------------------------------------------------------

export const edgeDataSchema = z.object({
  label: z.string().optional(),
  sequenceOrder: z.number().optional(),
  sourceCardinality: z.enum(["1", "N"]).optional(),
  targetCardinality: z.enum(["1", "N"]).optional(),
  resourceKind: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Simulation Test Case Schema
// ---------------------------------------------------------------------------

export const simulationTestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetNodeId: z.string(),
  targetEventId: z.string().optional(),
  request: z.object({
    headers: z.record(z.string()).optional(),
    params: z.record(z.string()).optional(),
    body: z.unknown().optional(),
  }).optional(),
  expectedStatus: z.number().optional(),
  expectedBody: z.unknown().optional(),
  enabled: z.boolean().optional(),
});
