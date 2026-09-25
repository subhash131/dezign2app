// ─── Backend Canvas Main Node Types ───────────────────────────────────────────
export const BACKEND_NODE_SERVICE = "service" as const;
export const BACKEND_NODE_DATABASE = "database" as const;
export const BACKEND_NODE_QUEUE = "queue" as const;
export const BACKEND_NODE_PUBSUB = "pubsub" as const;
export const BACKEND_NODE_EVENTSTREAM = "eventstream" as const;
export const BACKEND_NODE_KAFKA = "kafka" as const;
export const BACKEND_NODE_REDIS_STREAMS = "redis-streams" as const;
export const BACKEND_NODE_SQS = "sqs" as const;
export const BACKEND_NODE_REDIS_PUBSUB = "redis-pubsub" as const;
export const BACKEND_NODE_REDIS_CACHE = "redis-cache" as const;
export const BACKEND_NODE_ENTITY = "entity" as const;
export const BACKEND_NODE_WEB_PAGE = "webPage" as const;
export const BACKEND_NODE_EXTERNAL = "external" as const;
export const BACKEND_NODE_GROUP = "group" as const;
export const BACKEND_NODE_DB_REF = "db_ref" as const;
export const BACKEND_NODE_STORAGE = "storage" as const;
export const BACKEND_NODE_STORAGE_OPERATION_REF = "storage_operation_ref" as const;
export const BACKEND_NODE_STORAGE_REF = "storage_ref" as const;
export const BACKEND_NODE_WORKER = "worker" as const;
export const BACKEND_NODE_SERVERLESS = "serverless" as const;
export const BACKEND_NODE_SEARCH_INDEX = "search_index" as const;
export const BACKEND_NODE_API_GATEWAY = "api_gateway" as const;
export const BACKEND_NODE_LOAD_BALANCER = "load_balancer" as const;
export const BACKEND_NODE_WEBHOOK = "webhook" as const;
export const BACKEND_NODE_LLM = "llm" as const;
export const BACKEND_NODE_MCP_SERVER = "mcp_server" as const;
export const BACKEND_NODE_VECTOR_DB_REF = "vector_db_ref" as const;
export const BACKEND_NODE_IDENTITY_PROVIDER = "identity_provider" as const;
export const BACKEND_NODE_AUTH = "auth" as const;
export const BACKEND_NODE_PAYMENTS = "payments" as const;
export const BACKEND_NODE_LANGGRAPH = "langgraph" as const;
export const BACKEND_NODE_LANGGRAPH_STEP = "langgraph_step" as const;
export const BACKEND_NODE_PAGE_REF = "page_ref" as const;
export const BACKEND_NODE_REDIS_INSTANCE = "redis_instance" as const;
export const BACKEND_NODE_REDIS_SCHEMA = "redis_schema" as const;
export const BACKEND_NODE_TRANSFORMER = "transformer" as const;
export const BACKEND_NODE_TRANSFORMER_REF = "transformer_ref" as const;
export const BACKEND_NODE_HOOK = "hook" as const;
export const BACKEND_NODE_HOOK_REF = "hook_ref" as const;
export const BACKEND_NODE_CUSTOM_TYPES = "types" as const;

export const NODE_TYPE_TO_RESOURCE_KIND: Record<string, string | undefined> = {
  kafka: "kafka",
  sqs: "sqs",
  "redis-streams": "redis-stream",
  "redis-pubsub": "redis-pubsub",
  queue: "generic-queue",
  pubsub: "generic-pubsub",
  eventstream: "generic-eventstream",
  storage: "storage",
  worker: "worker",
  serverless: "serverless",
  search_index: "search_index",
  api_gateway: "api_gateway",
  load_balancer: "load_balancer",
  webhook: "webhook",
  llm: "llm",
  mcp_server: "mcp_server",
  langgraph: "langgraph",
  langgraph_step: "langgraph_step",
  hook: "hook",
  hook_ref: "hook_ref",
};

export const BACKEND_NODE_TYPES = {
  SERVICE: BACKEND_NODE_SERVICE,
  DATABASE: BACKEND_NODE_DATABASE,
  REDIS_INSTANCE: BACKEND_NODE_REDIS_INSTANCE,
  REDIS_SCHEMA: BACKEND_NODE_REDIS_SCHEMA,
  QUEUE: BACKEND_NODE_QUEUE,
  PUBSUB: BACKEND_NODE_PUBSUB,
  EVENTSTREAM: BACKEND_NODE_EVENTSTREAM,
  KAFKA: BACKEND_NODE_KAFKA,
  REDIS_STREAMS: BACKEND_NODE_REDIS_STREAMS,
  SQS: BACKEND_NODE_SQS,
  REDIS_PUBSUB: BACKEND_NODE_REDIS_PUBSUB,
  REDIS_CACHE: BACKEND_NODE_REDIS_CACHE,
  ENTITY: BACKEND_NODE_ENTITY,
  WEB_PAGE: BACKEND_NODE_WEB_PAGE,
  EXTERNAL: BACKEND_NODE_EXTERNAL,
  GROUP: BACKEND_NODE_GROUP,
  DB_REF: BACKEND_NODE_DB_REF,
  STORAGE: BACKEND_NODE_STORAGE,
  STORAGE_OPERATION_REF: BACKEND_NODE_STORAGE_OPERATION_REF,
  STORAGE_REF: BACKEND_NODE_STORAGE_REF,
  WORKER: BACKEND_NODE_WORKER,
  SERVERLESS: BACKEND_NODE_SERVERLESS,
  SEARCH_INDEX: BACKEND_NODE_SEARCH_INDEX,
  API_GATEWAY: BACKEND_NODE_API_GATEWAY,
  LOAD_BALANCER: BACKEND_NODE_LOAD_BALANCER,
  WEBHOOK: BACKEND_NODE_WEBHOOK,
  LLM: BACKEND_NODE_LLM,
  MCP_SERVER: BACKEND_NODE_MCP_SERVER,
  VECTOR_DB_REF: BACKEND_NODE_VECTOR_DB_REF,
  IDENTITY_PROVIDER: BACKEND_NODE_IDENTITY_PROVIDER,
  AUTH: BACKEND_NODE_AUTH,
  PAYMENTS: BACKEND_NODE_PAYMENTS,
  LANGGRAPH: BACKEND_NODE_LANGGRAPH,
  LANGGRAPH_STEP: BACKEND_NODE_LANGGRAPH_STEP,
  PAGE_REF: BACKEND_NODE_PAGE_REF,
  TRANSFORMER: BACKEND_NODE_TRANSFORMER,
  TRANSFORMER_REF: BACKEND_NODE_TRANSFORMER_REF,
  HOOK: BACKEND_NODE_HOOK,
  HOOK_REF: BACKEND_NODE_HOOK_REF,
  CUSTOM_TYPES: BACKEND_NODE_CUSTOM_TYPES,
} as const;

// ─── Backend Canvas Main Edge Types ───────────────────────────────────────────
export const BACKEND_EDGE_FOREIGN_KEY = "foreign-key" as const;
export const BACKEND_EDGE_DATABASE_CONNECTION = "database-connection" as const;
export const BACKEND_EDGE_IDENTITY_CONNECTION = "identity-connection" as const;
export const BACKEND_EDGE_MESSAGE = "message" as const;
export const BACKEND_EDGE_CONNECTION = "connection" as const;
export const BACKEND_EDGE_TRANSFORMER_REFERENCE = "transformer-reference" as const;
export const BACKEND_EDGE_STORAGE_REFERENCE = "storage-reference" as const;
export const BACKEND_EDGE_REFERENCE = "reference" as const;
export const BACKEND_EDGE_TYPE_REFERENCE = "type-reference" as const;

export const BACKEND_EDGE_TYPES = {
  FOREIGN_KEY: BACKEND_EDGE_FOREIGN_KEY,
  DATABASE_CONNECTION: BACKEND_EDGE_DATABASE_CONNECTION,
  IDENTITY_CONNECTION: BACKEND_EDGE_IDENTITY_CONNECTION,
  MESSAGE: BACKEND_EDGE_MESSAGE,
  CONNECTION: BACKEND_EDGE_CONNECTION,
  TRANSFORMER_REFERENCE: BACKEND_EDGE_TRANSFORMER_REFERENCE,
  STORAGE_REFERENCE: BACKEND_EDGE_STORAGE_REFERENCE,
  REFERENCE: BACKEND_EDGE_REFERENCE,
  TYPE_REFERENCE: BACKEND_EDGE_TYPE_REFERENCE,
} as const;
