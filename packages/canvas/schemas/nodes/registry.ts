import { z } from "zod";
import { simpleDataSchema, dbRefDataSchema } from "./base";
import { entityDataSchema } from "./entity";
import {
  kafkaDataSchema,
  sqsDataSchema,
  redisPubSubDataSchema,
  redisStreamsDataSchema,
  redisCacheDataSchema,
} from "./messaging";
import { storageDataSchema } from "./storage";
import {
  externalDataSchema,
  webPageDataSchema,
  pageRefDataSchema,
  serviceDataSchema,
  workerDataSchema,
  serverlessDataSchema,
} from "./services";
import {
  identityProviderDataSchema,
  apiGatewayDataSchema,
  loadBalancerDataSchema,
  webhookDataSchema,
} from "./gateway";
import { authDataSchema } from "./auth";
import {
  llmDataSchema,
  mcpServerDataSchema,
  vectorDbRefDataSchema,
  searchIndexDataSchema,
} from "./ai";
import { databaseDataSchema } from "./database";
import { langgraphDataSchema, langgraphStepDataSchema } from "./langgraph";
import {
  transformerNodeDataSchema,
  transformerRefDataSchema,
} from "./transformer";
import {
  hookNodeDataSchema,
  hookRefDataSchema,
  stateStoreNodeDataSchema,
} from "./frontend";

export const nodeDataSchemas: Record<string, z.ZodSchema> = {
  queue: simpleDataSchema,
  pubsub: simpleDataSchema,
  eventstream: simpleDataSchema,
  kafka: kafkaDataSchema,
  sqs: sqsDataSchema,
  "redis-pubsub": redisPubSubDataSchema,
  "redis-streams": redisStreamsDataSchema,
  "redis-cache": redisCacheDataSchema,
  redis_instance: databaseDataSchema,
  redis_schema: entityDataSchema,
  entity: entityDataSchema,
  database: databaseDataSchema,
  service: serviceDataSchema,
  db_ref: dbRefDataSchema,
  webPage: webPageDataSchema,
  page_ref: pageRefDataSchema,
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
  identity_provider: identityProviderDataSchema,
  auth: authDataSchema,
  langgraph: langgraphDataSchema,
  langgraph_step: langgraphStepDataSchema,
  transformer: transformerNodeDataSchema,
  transformer_ref: transformerRefDataSchema,
  hook: hookNodeDataSchema,
  hook_ref: hookRefDataSchema,
  state_store: stateStoreNodeDataSchema,
};
