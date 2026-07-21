import { v } from "convex/values";
import { zodToConvex } from "convex-helpers/server/zod";
import { 
  serviceDataSchema,
  dbRefDataSchema,
  webClientDataSchema,
  externalDataSchema,
  simpleDataSchema,
  entityDataSchema,
  kafkaDataSchema,
  sqsDataSchema,
  redisPubSubDataSchema,
  redisStreamsDataSchema,
  redisCacheDataSchema,
  storageDataSchema,
  edgeDataSchema,
  simulationTestCaseSchema,
  // New nodes
  workerDataSchema,
  serverlessDataSchema,
  searchIndexDataSchema,
  apiGatewayDataSchema,
  loadBalancerDataSchema,
  webhookDataSchema,
  llmDataSchema,
  mcpServerDataSchema,
  vectorDbRefDataSchema,
  endpointSchema,
  identityProviderDataSchema,
  identityProviderSchema,
  publishedEventSchema,
  consumedEventSchema,
} from "@workspace/canvas/schemas";

// Test Case Data Validator
export const backendTestCaseDataValidator = zodToConvex(simulationTestCaseSchema);

// Edge Data Validator
export const backendEdgeDataValidator = zodToConvex(edgeDataSchema);

// Node Data Validator
// Using zodToConvex to keep database schemas in sync with frontend/AI Zod schemas
export const backendNodeDataValidator = v.union(
  zodToConvex(serviceDataSchema),
  zodToConvex(dbRefDataSchema),
  zodToConvex(webClientDataSchema),
  zodToConvex(externalDataSchema),
  zodToConvex(simpleDataSchema),
  zodToConvex(entityDataSchema),
  zodToConvex(kafkaDataSchema),
  zodToConvex(sqsDataSchema),
  zodToConvex(redisPubSubDataSchema),
  zodToConvex(redisStreamsDataSchema),
  zodToConvex(redisCacheDataSchema),
  zodToConvex(storageDataSchema),
  // New nodes
  zodToConvex(workerDataSchema),
  zodToConvex(serverlessDataSchema),
  zodToConvex(searchIndexDataSchema),
  zodToConvex(apiGatewayDataSchema),
  zodToConvex(loadBalancerDataSchema),
  zodToConvex(webhookDataSchema),
  zodToConvex(llmDataSchema),
  zodToConvex(mcpServerDataSchema),
  zodToConvex(vectorDbRefDataSchema),
  zodToConvex(identityProviderDataSchema),
  // Fallback for completely empty data (allowable in some updates)
  v.object({
    label: v.optional(v.string()),
    parentId: v.optional(v.string()),
    position: v.optional(v.object({ x: v.number(), y: v.number() })),
    style: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  })
);

import { z } from "zod";

export const backendEndpointDataValidator = zodToConvex(endpointSchema);
export const backendIdentityProviderDataValidator = zodToConvex(identityProviderSchema);
export const backendEventDataValidator = zodToConvex(z.union([publishedEventSchema, consumedEventSchema]));
