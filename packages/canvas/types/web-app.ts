import type { UIEventItem, PageSection, Parameter, Schema, StateVariableType, PageStateObject } from "./simulation";
import type { WebAppZone, ProtectionRule, PaymentsPlanConfig } from "./auth";
import type { ClientDeliveryProtocol } from "./messaging";
import type { RealtimeProtocol, JsonValue } from "./realtime";
import type { NodeDependencyItem } from "./services";

export type SectionIconName =
  | "layout-grid"
  | "table"
  | "form-input"
  | "message-square"
  | "bar-chart-3"
  | "box"
  | "sparkles"
  | "package";

export interface SectionPreset {
  id?: string;
  label: string;
  iconName?: SectionIconName;
  desc: string;
  renderMode: "server" | "client";
  loadStrategy: "eager" | "dynamic" | "dynamic-no-ssr";
  libraries: string[];
  defaultActions: {
    name: string;
    event: string;
    description?: string;
    requestBody?: Schema;
    requestBodyMode?: "field_builder" | "raw_json";
    queryParams?: Parameter[];
  }[];
  defaultDesc: string;
  defaultUiPrompt: string;
}

export interface CategorizedLibrary {
  category: string;
  iconName?: SectionIconName;
  libs: string[];
}

export interface PresetTriggerOption {
  value: string;
  label: string;
  defaultRoute: string;
}

export type StoreActionType =
  | "set"
  | "append"
  | "remove"
  | "toggle"
  | "increment"
  | "reset"
  | "populate"
  | "custom"
  | "mutate";

/**
 * A real-time connection that a WebPageNode listens on.
 * Connections can be manually declared OR derived from a `push_to_client` pipeline step.
 */
export interface RealtimeConnection {
  id: string;
  protocol: RealtimeProtocol;
  /** SSE event name or WebSocket message type to listen for (e.g. "order.updated") */
  eventName?: string;
  /** WebSocket / WebRTC broadcast room or signaling channel key */
  room?: string;
  /** WebRTC media streaming mode (computed / legacy compatibility) */
  mediaMode?: "data" | "audio" | "video" | "audio-video";
  /** WebRTC granular media & data capabilities */
  enableDataChannel?: boolean;
  enableAudio?: boolean; // legacy alias for enableMic
  enableMic?: boolean;
  enableSpeaker?: boolean;
  enableVideo?: boolean; // legacy alias for enableCamera
  enableCamera?: boolean;
  enableScreenShare?: boolean;
  enableRemoteVideo?: boolean;
  /** WebRTC peer role (defaults to "peer") */
  peerRole?: "peer" | "initiator" | "responder";
  /** Optional custom STUN/TURN server URL for WebRTC */
  iceServerUrl?: string;
  /** Polling interval in ms (for POLLING protocol) */
  pollingIntervalMs?: number;
  /** Stream URL override (SSE/WebSocket/WebRTC) */
  streamUrl?: string;
  /** Human-readable description */
  description?: string;
  /**
   * Derived fields — set automatically by the `push_to_client` pipeline step.
   * These are read-only in the UI; deleting the step clears them.
   */
  sourceServiceNodeId?: string;
  sourceServiceLabel?: string;
  sourceEventId?: string;
  sourceItemName?: string;
  sourceItemType?: "endpoint" | "event";
  /** State Store binding to update when realtime messages arrive */
  storeActionBinding?: {
    storeNodeId?: string;
    storeName?: string;
    actionId?: string;
    actionName?: string;
    actionType?: StoreActionType;
    targetFieldId?: string;
    targetFieldName?: string;
    updateSource?: "full_message" | "nested_property" | "static";
    valuePath?: string;
    customValue?: string;
    parameterMappings?: Record<string, string>;
  };
}

export interface GlobalStoreField {
  id: string;
  name: string;
  type: StateVariableType;
  isArray?: boolean;
  required?: boolean;
  defaultValue?: JsonValue;
  description?: string;
}

export interface GlobalStoreAction {
  id: string;
  name: string;
  targetFieldId?: string;
  targetFieldName?: string;
  actionType: StoreActionType;
  code?: string;
  parameters?: Parameter[];
  connectedEndpointId?: string;
  responseMappingMode?: "replace" | "merge" | "custom";
  description?: string;
  prompt?: string;
  defaultManipulatorType?: "populate" | "reset" | "setter" | "mutate" | "append" | "pop";
}

export interface StateStoreTestCase {
  id: string;
  name: string;
  manipulatorName: string;
  payload?: JsonValue;
  expectedField?: string;
  expectedValue?: JsonValue;
  status?: "passed" | "failed" | "idle";
  lastRunAt?: string;
  error?: string;
}

export interface GlobalStoreDefinition {
  id: string;
  name: string;
  description?: string;
  fields: GlobalStoreField[];
  actions?: GlobalStoreAction[];
  testCases?: StateStoreTestCase[];
  storage?: "memory" | "localStorage" | "sessionStorage";
  scope?: "global" | "local";
  targetPageId?: string;
  disabledDefaultManipulators?: string[];
  deletedDefaultManipulators?: string[];
}

/** WebApp node fields (canvas type). */
export interface CanvasWebAppNodeData {
  appSlug?: string;
  framework?: string;
  port?: string | number;
  skipDefaultPages?: boolean;
  routes?: Array<{
    id: string;
    name: string;
    path: string;
    accessType?: "public" | "private" | "role-gated" | "payment-gated" | "org-gated";
    allowedRoles?: string[];
    requiredPlans?: string[];
    allowedOrgRoles?: string[];
    redirectTo?: string;
    isAuthPage?: boolean;
    events?: UIEventItem[];
  }>;
  zones?: WebAppZone[];
  authMode?: "none" | "connected_auth_node" | "custom_jwt" | "better_auth";
  authNodeId?: string;
  paymentsNodeId?: string;
  defaultLoginRoute?: string;
  corsOrigins?: string;
  showNav?: boolean;
  customDependencies?: NodeDependencyItem[];
  envVars?: Array<{ id: string; name: string; description?: string }>;
  globalStores?: GlobalStoreDefinition[];
  expandedZones?: string[];
}

export type { PageStateObject };

/** Web Page node fields (canvas type). */
export interface CanvasWebPageNodeData {
  appName?: string;
  appSlug?: string;
  showNav?: boolean;
  accessType?: "public" | "private" | "role-gated" | "payment-gated" | "org-gated";
  allowedRoles?: string[];
  requiredPlans?: string[];
  allowedOrgRoles?: string[];
  redirectTo?: string;
  isAuthPage?: boolean;
  isRoot?: boolean;
  isLayout?: boolean;
  authNodeId?: string;
  zoneId?: string;
  useZoneDefault?: boolean;
  protectionOverride?: ProtectionRule;
  events?: UIEventItem[];
  sections?: PageSection[];
  stateObjects?: PageStateObject[];
  uiPrompt?: string;
  renderMode?: "server" | "client";
  headers?: Parameter[];
  pathParams?: Parameter[];
  queryParams?: Parameter[];
  requestBody?: Schema;
  requestBodyMode?: "field_builder" | "raw_json";
  summary?: string;
  requireAuth?: boolean;
  /** Real-time push connections (SSE, WebSocket, WebRTC, Polling) for this page */
  realtimeConnections?: RealtimeConnection[];
  customDependencies?: NodeDependencyItem[];
  pageStores?: GlobalStoreDefinition[];
  stackOrder?: number;
}

/** Payments node fields (canvas type). */
export interface CanvasPaymentsNodeData {
  provider?: "creem" | string;
  plans?: PaymentsPlanConfig[];
  eventMapping?: Record<string, "active" | "trialing" | "past_due" | "canceled" | "expired">;
  apiKeyEnv?: string;
  webhookSecretEnv?: string;
}

/** Page Reference node fields (canvas type). */
export interface CanvasPageRefNodeData {
  pageRefId?: string;
  targetPageId?: string;
  targetPageLabel?: string;
  targetPageSlug?: string;
}

/** Hook node fields for canvas graph view. */
export interface CanvasHookNodeData {
  hookName?: string;
  scope?: "global" | "local";
  targetWebAppId?: string;
  targetPageId?: string;
  targetEndpointId?: string;
  targetEventId?: string;
  hookRef?: string;
  hookType?: "query" | "mutation" | "subscription" | "custom";
  inputParams?: Parameter[];
  returnSchema?: Parameter[];
  logicMode?: "natural_language" | "code";
  prompt?: string;
  code?: string;
}

/** Hook reference node fields (canvas type). */
export interface CanvasHookRefNodeData {
  hookRef?: string;
  targetWebAppId?: string;
  targetPageId?: string;
  targetPageIds?: string[];
}

/** State Store node fields for canvas graph view (modeled after TransformerNode). */
export interface CanvasStateStoreNodeData {
  storeName?: string;
  description?: string;
  scope?: "global" | "local";
  storage?: "memory" | "localStorage" | "sessionStorage";
  targetWebAppId?: string;
  targetPageId?: string;
  fields?: GlobalStoreField[];
  actions?: GlobalStoreAction[];
  testCases?: StateStoreTestCase[];
  disabledDefaultManipulators?: string[];
  deletedDefaultManipulators?: string[];
}
