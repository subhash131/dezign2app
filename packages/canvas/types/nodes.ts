import type {
  ServiceTechStack,
  ServiceTechVersion,
  WebClientTechStack,
  WebClientTechVersion,
  DatabaseEngine,
  DatabaseEngineVersion,
} from "../techStack";
import type { MessagingNodeData } from "./messaging";
import type {
  CanvasLangGraphNodeData,
  CanvasLangGraphStepNodeData,
  CanvasAINodeData,
} from "./langgraph";
import type { CanvasDatabaseNodeData, CanvasEntityNodeData } from "./database";
import type {
  CanvasServiceNodeData,
  CanvasTransformerNodeData,
  CanvasTransformerRefNodeData,
} from "./services";
import type {
  CanvasWebAppNodeData,
  CanvasWebPageNodeData,
  CanvasPaymentsNodeData,
  CanvasPageRefNodeData,
  CanvasHookNodeData,
  CanvasHookRefNodeData,
  CanvasStateStoreNodeData,
} from "./web-app";
import type {
  CanvasWorkerNodeData,
  CanvasServerlessNodeData,
  CanvasInfrastructureNodeData,
  CanvasIdentityProviderNodeData,
  CanvasAuthNodeData,
} from "./infrastructure";
import type { Parameter } from "./simulation";
import type { JsonValue, JsonObject } from "./realtime";
import type { CustomTypeItem, CanvasTypesNodeData } from "./custom-types";
export type BackendNodeType =
  | "service"
  | "database"
  | "queue"
  | "pubsub"
  | "eventstream"
  | "kafka"
  | "redis-streams"
  | "sqs"
  | "redis-pubsub"
  | "redis-cache"
  | "entity"
  | "webPage"
  | "external"
  | "group"
  | "db_ref"
  | "storage"
  // Redis Dedicated Schema View Nodes
  | "redis_instance"
  | "redis_schema"
  // New node types
  | "worker"
  | "serverless"
  | "search_index"
  | "api_gateway"
  | "load_balancer"
  | "webhook"
  | "llm"
  | "mcp_server"
  | "vector_db_ref"
  | "identity_provider"
  | "auth"
  | "webApp"
  | "webAppGroup"
  | "payments"
  | "langgraph"
  | "langgraph_step"
  | "page_ref"
  | "transformer"
  | "transformer_ref"
  | "hook"
  | "hook_ref"
  | "types"
  | "state_store";

/** Core fields present on every canvas node. */
export interface BaseNodeData {
  label: string;
  description?: string;
  color?: string;
  isWebClient?: boolean;
  parentId?: string;
  /** Nested position inside a group node. */
  position?: { x: number; y: number };
  /** Position override used in the graph-view layout. */
  graphPosition?: { x: number; y: number };
  // Tech stack & DB engine selection (shared by Service and Database nodes)
  techStack?: ServiceTechStack | WebClientTechStack;
  techVersion?: ServiceTechVersion | WebClientTechVersion;
  dbEngine?: DatabaseEngine;
  dbEngineVersion?: DatabaseEngineVersion;
  // Client & connection properties
  targetServerId?: string;
  targetRouteId?: string;
  pageSlug?: string;
  path?: string;
  route?: string;
  // Shared visual / misc
  authentication?: string;
  tags?: string[];
  // Transformer node properties
  functionName?: string;
  scope?: "global" | "local";
  targetServiceId?: string;
  serviceNodeId?: string;
  targetEndpointId?: string;
  targetEndpointIds?: string[];
  targetEventId?: string;
  targetEventIds?: string[];
  transformerRef?: string;
  inputSchema?: {
    id?: string;
    name: string;
    type: string;
    required?: boolean;
    description?: string;
  }[];
  inputSchemaMode?: "field_builder" | "raw_json";
  inputSchemaRawJson?: string;
  logicMode?: "natural_language" | "code";
  prompt?: string;
  code?: string;
  returnSchema?: Parameter[];
  returnSchemaMode?: "field_builder" | "raw_json";
  returnSchemaRawJson?: string;
  isAsync?: boolean;
  /**
   * Page Visual Editor — AI-edited TSX source for this WebClient page.
   * When present, the compiler emits this directly instead of regenerating.
   * Stored in Convex so it syncs to all collaborators in real-time.
   */
  pageSourceCode?: string;
  /**
   * True while the AI agent is actively streaming a page edit.
   * Blocks concurrent prompts. Cleared automatically when the AI finishes.
   */
  aiEditing?: boolean;
  // Custom Types node properties
  definitionMode?: "visual" | "raw";
  rawTypeScript?: string;
  types?: CustomTypeItem[];
}

export interface ExternalInputVariable {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  defaultValue?: string;
  description?: string;
}

export interface ExternalQueryParam extends Parameter {
  enabled?: boolean;
}

export interface ExternalHeader extends Parameter {
  enabled?: boolean;
}

export type ExternalDataPayload = JsonValue;

export interface ExternalTestResult {
  status?: number;
  statusText?: string;
  timeMs?: number;
  headers?: Record<string, string>;
  data?: ExternalDataPayload;
  error?: string;
  testedAt?: string;
  requestDetails?: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: ExternalDataPayload;
  };
}

export interface CanvasExternalNodeData extends Partial<BaseNodeData> {
  functionName?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url?: string;
  baseUrl?: string;
  endpointPath?: string;
  inputVariables?: ExternalInputVariable[];
  queryParams?: ExternalQueryParam[];
  headers?: ExternalHeader[];
  bodyType?: "json" | "text" | "raw" | "none";
  bodyContent?: string;
  responseSchema?: JsonObject;
  errorResponseSchema?: JsonObject;
  lastTestResult?: ExternalTestResult;
  authType?: "none" | "bearer" | "apiKey" | "basic" | "custom";
  authHeader?: string;
  authQueryParam?: string;
  apiKey?: string;
  apiSecret?: string;
  docsUrl?: string;
  timeout?: string | number;
  rateLimit?: string;
  defaultHeaders?: Array<{
    id?: string;
    name: string;
    type: string;
    required?: boolean;
    description?: string;
    defaultValue?: string;
    key?: string;
    value?: string;
  }>;
  envVars?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
}

/**
 * Composite data payload for every BackendNode.
 * All domain-specific fields are optional; only `BaseNodeData.label` is required.
 * Sub-type interfaces are prefixed with `Canvas` to avoid naming conflicts
 * with the Zod-inferred schema types in `@workspace/canvas/schemas`.
 */
export type BackendNodeData = BaseNodeData &
  Partial<
    CanvasDatabaseNodeData &
      CanvasEntityNodeData &
      CanvasServiceNodeData &
      CanvasExternalNodeData &
      CanvasWebAppNodeData &
      CanvasWebPageNodeData &
      MessagingNodeData &
      CanvasWorkerNodeData &
      CanvasServerlessNodeData &
      CanvasInfrastructureNodeData &
      CanvasAINodeData &
      CanvasIdentityProviderNodeData &
      CanvasAuthNodeData &
      CanvasPaymentsNodeData &
      CanvasLangGraphNodeData &
      CanvasLangGraphStepNodeData &
      CanvasPageRefNodeData &
      CanvasTransformerNodeData &
      CanvasTransformerRefNodeData &
      CanvasHookNodeData &
      CanvasHookRefNodeData &
      CanvasTypesNodeData &
      CanvasStateStoreNodeData
  >;

export type BackendNode = {
  id: string;
  nodeId?: string;
  type: BackendNodeType;
  position: { x: number; y: number };
  data: BackendNodeData;
  fractionalIndex: string; // For Z-order
  parentId?: string;
  style?: Record<string, string | number | boolean | null | undefined>;
  width?: number;
  height?: number;
  selected?: boolean;
};

// BackendNodeData is defined above (composite of all node domain sub-types).
// BackendNodeItem is kept for AI tool / store compatibility.
export interface BackendNodeItem {
  nodeId: string;
  type?: string;
  data?: BackendNodeData;
}

/**
 * Describes a reusable function exported by a shared package (db, kafka, redis, etc.)
 * so service nodes can auto-import and call them in generated route handlers.
 */
export interface ReusableFunction {
  /** Human-readable function name, e.g. "findAllUsers" */
  name: string;
  /** Full import path, e.g. "@workspace/db/helpers/users" */
  importPath: string;
  /** TypeScript signature for documentation, e.g. "findAllUsers(): User[]" */
  signature: string;
  /** The entity/table/topic this function targets, e.g. "users" */
  targetName: string;
  /** CRUD operation kind or category */
  kind: "findAll" | "findById" | "create" | "update" | "delete" | "publish" | "consume" | "custom";
}

/**
 * Represents a database operation target resolved for a generated route endpoint.
 */
export interface TargetDbOperation {
  fn: ReusableFunction;
  callExpr: string;
  operationKind: "read" | "create" | "update" | "delete";
  tableNodeId?: string;
}
