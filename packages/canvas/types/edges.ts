import type { MessagingResourceType, BACKEND_EDGE_TYPES } from "../constants";
import type { BackendNode } from "./nodes";

export type BackendEdgeType = (typeof BACKEND_EDGE_TYPES)[keyof typeof BACKEND_EDGE_TYPES];

export type BackendEdge = {
  id: string;
  source: string;
  target: string;
  type: BackendEdgeType;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  sourceHandleId?: string | null;
  targetHandleId?: string | null;
  zIndex?: number;
  sourceResourceId?: string;
  targetResourceId?: string;
  resourceType?: MessagingResourceType;
  data?: {
    label?: string;
    sequenceOrder?: number;
    sourceCardinality?: "1" | "N";
    targetCardinality?: "1" | "N";
    // --- Type Reference Fields ---
    isTypeReference?: boolean;
    isExtensionEdge?: boolean;
    baseTypeName?: string;
    extendedTypeName?: string;
    packageName?: string;
    // --- State Store Subscription & Action Binding Fields ---
    isStateSubscription?: boolean;
    isStoreAction?: boolean;
    isStoreActionBinding?: boolean;
    storeName?: string;
    fieldName?: string;
    actionName?: string;
    actionType?: string;
    bindingId?: string;
    targetFieldId?: string;
    targetFieldName?: string;
    storeId?: string;
    fieldId?: string;
    sectionId?: string;
    stateObjectId?: string;
    // --- Identity Connection Fields ---
    protocol?: string;
    grantType?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUris?: string[];
    pkce?: boolean;
    scopes?: string[];
    responseType?: string;
    responseMode?: string;
    notes?: string;
    // --- LangGraph Route Invocation ---
    // Maps HTTP body / event payload fields → LangGraph state channel keys.
    // Lives on the edge so the graph itself stays immutable and reusable.
    // e.g. { "messages": "body.message", "userId": "headers.x-user-id" }
    payloadMapping?: Record<string, string>;
    // Pre-invoke business logic (supports natural_language or code mode)
    preInvokeLogicMode?: "natural_language" | "code";
    preInvokePrompt?: string;
    preInvokeCode?: string;
    // Response & Output configuration
    responseExecutionMode?: "sync" | "stream" | "async_ack";
    responseOutputMode?: "full" | "selected";
    responseFields?: string[];
    postInvokeLogicMode?: "natural_language" | "code";
    postInvokePrompt?: string;
    postInvokeCode?: string;
  };
  fractionalIndex: string; // For sequence diagram ordering
};

export type EdgeData = NonNullable<BackendEdge["data"]>;

export type BackendDesignDoc = {
  schemaVersion?: number;
  nodes: BackendNode[];
  edges: BackendEdge[];
};
