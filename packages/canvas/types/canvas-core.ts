import type { Endpoint, IdentityProvider } from "../schemas";
import type { AnyMessagingResource } from "./messaging";
import type { BackendNode } from "./nodes";
import type { BackendEdge } from "./edges";

export type HandleKind =
  // --- Entity (schema view) ---
  | "entity-column-source"
  | "entity-column-target"
  | "entity-top-target"
  | "entity-bottom-source"

  // --- Service endpoints ---
  | "endpoint-in"
  | "endpoint-out"

  // --- WebClient events ---
  | "event-source"
  | "pageload-in"
  | "sse-in"
  | "websocket-in"
  | "webrtc-in"

  // --- Service messaging ---
  | "published-event-out"
  | "consumed-event-in"
  | "consumed-event-out"

  // --- Messaging resource definitions ---
  | "resource-def-in"
  | "resource-def-out"

  // --- Database (Table Reference) ---
  | "database-target"
  | "database-source"

  // --- External API actions ---
  | "action-target"

  // --- Worker Tasks ---
  | "task-in"
  | "task-out"

  // --- Search Indexes ---
  | "index-in"
  | "index-out"

  // --- LangGraph / LLM Nodes ---
  | "llm-in"
  | "llm-out"
  | "step-in"
  | "step-out"

  // --- LangGraph Agent (main canvas) ---
  | "langgraph-in"
  | "langgraph-out"

  // --- Auth, Payments & WebApp handles ---
  | "auth-out"
  | "auth-in"
  | "injects-plugin-out"
  | "payments-plugin-in"
  | "page-out"
  | "page-in"
  | "page-section-in"
  | "page-ref-in"
  | "transformer-out"
  | "transformer-in"
  | "hook-out"
  | "hook-in"
  | "component-out"
  | "component-in"
  | "slot-in"
  | "slot-out"
  | "type-out"
  | "type-in"

  // --- Fallback ---
  | "unknown";

export type RejectionCode =
  | "UNKNOWN_SOURCE_KIND"
  | "UNKNOWN_TARGET_KIND"
  | "INVALID_KIND_PAIR"
  | "SELF_CONNECTION"
  | "DUPLICATE_EDGE"
  | "SOURCE_NODE_NOT_FOUND"
  | "TARGET_NODE_NOT_FOUND";

export type ValidationResult =
  | {
      valid: true;
      edgeType: string;
      rulesVersion: number;
      resourceKind?: string;
    }
  | {
      valid: false;
      code: RejectionCode;
      message: string;
      suggestion?: string;
      rulesVersion: number;
    };

export type BackendCanvasView = "graph" | "sequence" | "schema";

export type ArchitectureMetadata = {
  createdAt?: number;
  updatedAt?: number;
  createdByAI?: boolean;
};

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export interface JSONObject {
  [key: string]: JSONValue;
}
export interface JSONArray extends Array<JSONValue> {}

// --- Canvas Configuration & Store State Types ---

export type ConfigItemType =
  | "service"
  | "external"
  | "endpoint"
  | "event"
  | "task"
  | "searchIndex"
  | "authRule"
  | "identityProvider"
  | "auth"
  | "webApp"
  | "webPage"
  | "pageSection"
  | "pageEvent"
  | "eventTesting"
  | "langgraphRoute"
  | "payments"
  | "zone"
  | "entityFunctions"
  | "database"
  | "testUsers"
  | "redisSchema"
  | "transformer"
  | "transformer_ref"
  | "hook"
  | "hook_ref"
  | "db_ref"
  | "redis_cache"
  | "vector_db_ref"
  | "realtimeConnection"
  | "types";

export interface ActiveConfigItem {
  type: ConfigItemType;
  id: string;
  nodeId: string;
  sectionId?: string;
  selectedTypeId?: string;
  edgeId?: string;
  sourceId?: string;
  targetNodeId?: string;
  endpointId?: string;
  initialTab?: "trigger" | "test-cases" | "sse" | "ws" | "webrtc" | "polling";
}

export type EndpointWithNode = Endpoint & { nodeId: string };
export type EventWithNode = AnyMessagingResource & {
  nodeId: string;
  variant: "publish" | "consume";
};
export type IdentityProviderWithNode = IdentityProvider & { nodeId: string };

export type PendingEndpointRemoval = { nodeId: string; endpointId: string };
export type PendingEventRemoval = { nodeId: string; eventId: string };
export type PendingIdentityProviderRemoval = { nodeId: string; providerId: string };

export interface CanvasSnapshotState {
  nodes: BackendNode[];
  edges: BackendEdge[];
  endpoints: EndpointWithNode[];
  events: EventWithNode[];
  identityProviders: IdentityProviderWithNode[];
}
