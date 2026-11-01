import type { JSONValue } from "./canvas-core";
import type { BackendNodeType, BackendNode } from "./nodes";
import type { BackendEdgeType, BackendEdge } from "./edges";


export type Parameter = {
  id: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  key?: string;
  value?: string;
  enabled?: boolean;
  enumValues?: string[];
  isArray?: boolean;
  nestedFields?: Parameter[];
};

export type Schema = {
  id: string;
  fields?: Parameter[];
  rawJson?: string;
  mode?: "field_builder" | "raw_json";
  requestBodyMode?: "field_builder" | "raw_json";
};

import type { processingOperationEnum, parameterTypeEnum } from "../schemas/primitives";
import type { z } from "zod";

export type ProcessingOperation = z.infer<typeof processingOperationEnum>;
export type ParameterType = z.infer<typeof parameterTypeEnum>;



// UI Specific Types
export type StateVariableType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | (string & {});

export interface SectionStateVariable {
  id: string;
  name: string;
  type: StateVariableType;
  defaultValue?: JSONValue;
  description?: string;
}

export type StateRenderComponent =
  | "badge"
  | "card"
  | "button"
  | "switch"
  | "checkbox"
  | "progress"
  | "input"
  | "alert"
  | "avatar"
  | "skeleton"
  | "table"
  | "code"
  | "text"
  | "sidebar"
  | "topbar"
  | "chat";

export interface SidebarStaticItemParam {
  name: string;
  value: string;
  mode?: "static" | "store_var" | "route_param" | "query_param";
  storeName?: string;
  storeId?: string;
  storeVar?: string;
  sourceParamName?: string;
}

export interface SidebarStaticItemQueryParam {
  id: string;
  key: string;
  value: string;
  mode?: "static" | "store_var" | "route_param" | "query_param";
  storeName?: string;
  storeId?: string;
  storeVar?: string;
  sourceParamName?: string;
}

export interface SidebarStaticItem {
  id: string;
  name: string;
  link: string;
  icon?: string;
  badge?: string;
  pathParams?: SidebarStaticItemParam[];
  queryParams?: SidebarStaticItemQueryParam[];
}

export type TopbarStaticItem = SidebarStaticItem;


export interface ComponentPropMappings {
  // Input
  inputType?: "text" | "number" | "password" | "email" | "tel" | "url" | "date" | "search";
  // Input ReadOnly Flag & Dynamic Binding
  readOnlyMode?: "static" | "state_binding" | "expression";
  readOnly?: boolean;
  readOnlyBinding?: string;
  readOnlyInverted?: boolean;
  readOnlyExpression?: string;
  readOnlyStoreId?: string;
  readOnlyStoreName?: string;

  // Disabled Flag & Dynamic Binding
  disabledMode?: "static" | "state_binding" | "expression";
  disabled?: boolean;
  disabledBinding?: string;
  disabledInverted?: boolean;
  disabledExpression?: string;
  disabledStoreId?: string;
  disabledStoreName?: string;

  valueBinding?: string;
  valueMode?: "store_var" | "inline" | "expression";
  valueStoreId?: string;
  valueStoreName?: string;
  defaultValue?: string | number;

  // Switch & Checkbox state bindings
  checkedBinding?: string;
  checkedStoreId?: string;
  checkedStoreName?: string;
  checkedMode?: "store_var" | "inline" | "expression";

  // Input UX, Label & Placeholder
  hasLabel?: boolean;
  labelBinding?: string;
  labelMode?: "store_var" | "inline" | "expression";
  labelStoreId?: string;
  labelStoreName?: string;
  placeholder?: string;
  placeholderMode?: "store_var" | "inline" | "expression";
  placeholderStoreId?: string;
  placeholderStoreName?: string;

  // Card Value & Progress Value
  cardValueBinding?: string;
  cardValueStoreId?: string;
  cardValueStoreName?: string;
  cardValueMode?: "store_var" | "inline" | "expression";
  progressValueBinding?: string;
  progressValueStoreId?: string;
  progressValueStoreName?: string;
  progressValueMode?: "store_var" | "inline" | "expression";

  // Input onChange & Interactivity
  onChangeMode?: "two_way" | "action" | "custom";
  targetSetterName?: string;
  onChangeActionId?: string;
  customOnChange?: string;

  // Input Debounce Configuration
  debounceUpdate?: boolean;
  debounceMs?: number;
  commitOnEnter?: boolean;
  commitOnBlur?: boolean;

  // Input UX
  clearable?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  maxLength?: number;

  // Card
  titleBinding?: string;
  titleMode?: "store_var" | "inline" | "expression";
  titleStoreId?: string;
  titleStoreName?: string;
  descriptionBinding?: string;
  descriptionMode?: "store_var" | "inline" | "expression";
  descriptionStoreId?: string;
  descriptionStoreName?: string;

  // Button
  buttonSize?: "default" | "sm" | "lg" | "icon";

  // Progress
  max?: number;
  showPercent?: boolean;

  // Alert
  alertTitle?: string;
  alertTitleMode?: "store_var" | "inline" | "expression";
  alertTitleStoreId?: string;
  alertTitleStoreName?: string;

  // Avatar
  avatarFallback?: string;
  avatarFallbackMode?: "store_var" | "inline" | "expression";
  avatarFallbackStoreId?: string;
  avatarFallbackStoreName?: string;
  avatarSrc?: string;
  avatarSrcMode?: "store_var" | "inline" | "expression";
  avatarSrcStoreId?: string;
  avatarSrcStoreName?: string;

  // Skeleton
  skeletonWidth?: string;
  skeletonHeight?: string;

  // Sidebar
  sidebarTitle?: string;
  sidebarNavMode?: "static" | "dynamic";
  sidebarNavBinding?: string;
  sidebarNavStoreId?: string;
  sidebarNavStoreName?: string;
  sidebarStaticItems?: Array<SidebarStaticItem>;
  sidebarCollapsible?: "offcanvas" | "icon" | "none";
  sidebarVariant?: "sidebar" | "floating" | "inset";
  sidebarSide?: "left" | "right";

  // Topbar
  topbarTitle?: string;
  topbarNavMode?: "static" | "dynamic";
  topbarNavBinding?: string;
  topbarNavStoreId?: string;
  topbarNavStoreName?: string;
  topbarStaticItems?: Array<SidebarStaticItem>;
  topbarSticky?: boolean;
  showAuthButtons?: boolean;
  signInText?: string;
  signInLink?: string;
  registerText?: string;
  registerLink?: string;

  // Chat (AI Elements)
  chatTitle?: string;
  chatPlaceholder?: string;
  chatAutoScroll?: boolean;
  chatShowScrollButton?: boolean;
  chatEmptyTitle?: string;
  chatEmptyDescription?: string;
  chatShowAvatars?: boolean;
  chatMessagesBinding?: string;
  chatMessagesStoreId?: string;
  chatMessagesStoreName?: string;
  chatInputBinding?: string;
  chatInputStoreId?: string;
  chatInputStoreName?: string;
  chatOnSendActionId?: string;
  chatOnSendActionName?: string;
  chatOnFetchActionId?: string;
  chatOnFetchActionName?: string;
  chatStreamConnectionId?: string;
  chatStreamProtocol?: "SSE" | "WEBSOCKET";
  chatStreamEventName?: string;

  // Custom props
  customProps?: Record<string, string>;
}

export interface StateRenderConfig {
  enabled?: boolean;
  component?: StateRenderComponent;
  variant?: "default" | "secondary" | "outline" | "destructive";
  label?: string;
  labelMode?: "static" | "store_var";
  labelStoreId?: string;
  labelStoreName?: string;
  labelStoreVar?: string;
  fallbackText?: string;
  formatter?: "none" | "currency" | "number" | "json" | "date";
  clickAction?: "none" | "trigger_event" | "copy_to_clipboard" | "navigate" | "toggle_state" | "dispatch_store_action";
  targetActionId?: string;
  targetRoute?: string;
  copyToastMessage?: string;
  copySourceMode?: "current" | "store_var" | "static";
  copyStaticValue?: string;
  copyStoreId?: string;
  copyStoreName?: string;
  copyStoreVar?: string;
  targetStoreId?: string;
  targetStoreActionId?: string;
  targetStoreActionName?: string;
  propMappings?: ComponentPropMappings;
}

export interface PageStateObject {
  id: string;
  name: string;
  type: string;
  defaultValue?: JSONValue;
  storeId?: string;
  storeNodeId?: string;
  storeName?: string;
  fieldId?: string;
  description?: string;
  renderConfig?: StateRenderConfig;
  itemEvents?: UIEventItem[];
  itemKeyField?: string;
  itemSchema?: Array<{ name: string; type: string }>;
}

export type ComponentBindingType =
  | "button"
  | "input"
  | "card"
  | "badge"
  | "switch"
  | "progress"
  | "alert"
  | "table"
  | "form"
  | "select"
  | "sidebar"
  | "topbar"
  | "chat"
  | (string & {});

export interface ComponentElementBinding {
  id: string;
  name: string;
  elementType: ComponentBindingType;
  label?: string;
  placeholder?: string;
  variant?: string;
  
  // State variable mappings
  valueStateName?: string;
  valueStateId?: string;
  valueSourceType?: "store" | "local";
  valueStoreName?: string;
  
  // Guard / status state bindings
  disabledStateName?: string;
  disabledStoreName?: string;
  loadingStateName?: string;
  loadingStoreName?: string;
  
  // Action trigger binding
  triggerEvent?: "click" | "change" | "submit" | "select" | (string & {});
  actionId?: string;
  actionName?: string;

  description?: string;
  propMappings?: ComponentPropMappings;
}

export interface SectionComponentBinding {
  id: string;
  name: string;
  componentType: ComponentBindingType;
  label?: string;
  variant?: string;
  
  // Multiple Shadcn UI elements within this component (e.g. 2 inputs and a button)
  elements?: ComponentElementBinding[];
  
  // State variable mappings
  valueStateName?: string;
  valueStateId?: string;
  valueSourceType?: "store" | "local";
  valueStoreName?: string;
  
  // Guard / status state bindings
  disabledStateName?: string;
  disabledStoreName?: string;
  loadingStateName?: string;
  loadingStoreName?: string;
  
  // Action trigger binding
  triggerEvent?: "click" | "change" | "submit" | "select" | (string & {});
  actionId?: string;
  actionName?: string;

  description?: string;
  propMappings?: ComponentPropMappings;
}

export type PageSection = {
  id: string;
  name: string;
  renderMode?: "server" | "client";
  loadStrategy?: "eager" | "dynamic" | "dynamic-no-ssr";
  actions: UIEventItem[];
  states?: SectionStateVariable[];
  stateObjects?: PageStateObject[];
  componentBindings?: SectionComponentBinding[];
  description?: string;
  uiPrompt?: string;
  libraries?: string[];
  images?: string[];
  primaryImageUrl?: string;
};

export type StoreActionType =
  | "set"
  | "append"
  | "prepend"
  | "pop"
  | "remove"
  | "toggle"
  | "increment"
  | "decrement"
  | "update"
  | "reset"
  | "populate"
  | "custom"
  | "mutate";

export interface StoreActionBinding {
  id?: string;
  storeNodeId?: string;
  storeName?: string;
  actionId?: string;
  actionName?: string;
  actionType?: StoreActionType;
  targetFieldId?: string;
  targetFieldName?: string;
  targetFieldType?: string;
  updateSource?: "response" | "response_property" | "payload" | "direct" | "static" | "full_message" | "nested_property";
  valuePath?: string;
  customValue?: string;
  parameterMappings?: Record<string, string>;
}

export type FrontendActionStepType =
  | "api_call"
  | "storage_put"
  | "state_mutation"
  | "navigation"
  | "custom_code"
  | "condition"
  | "notification"
  | "reset_form"
  | "update_query_params"
  | "transform"
  | "browser_storage";

export type QueryParamUpdateItem = {
  key: string;
  mode: "set" | "remove" | "toggle";
  valueSource?: FrontendFieldSource;
};

export type BindingSlot = "header" | "path_param" | "query_param" | "body";

export type FrontendFieldSource =
  | { kind: "literal"; value: string }
  | {
      kind: "state_var";
      stateKey: string;
      sourceType?: "store" | "local";
      storeNodeId?: string;
      storeName?: string;
      fieldPath?: string;
    }
  | { kind: "prev_response"; stepId: string; fieldPath: string }
  | { kind: "user_input"; fieldName: string }
  | { kind: "route_param"; paramName: string }
  | { kind: "query_param"; paramName: string }
  | { kind: "session_storage"; key: string }
  | { kind: "local_storage"; key: string }
  | { kind: "cookie"; cookieName: string }
  | {
      kind: "auth_token";
      tokenType?: "session" | "cookie" | "local_storage";
    }
  | {
      kind: "realtime_payload";
      fieldPath?: string;
    };

export type FrontendRequestFieldBinding = {
  id: string;
  slot: BindingSlot;
  targetField: string;
  source: FrontendFieldSource;
};

export type FrontendTransformBinding = {
  argName: string;
  source: FrontendFieldSource;
};

export type FrontendActionStepDraft = {
  id: string;
  order: number;
  type: FrontendActionStepType;
  name?: string;
  description?: string;
  edgeId?: string; // canvas edge id if this step is connected to a canvas node

  // --- For type === "api_call" ---
  serviceNodeId?: string;
  endpointId?: string;
  requestBindings?: FrontendRequestFieldBinding[];

  // --- For type === "storage_put" ---
  storageNodeId?: string;
  storageRefNodeId?: string;
  storageServiceNodeId?: string;
  bucketId?: string;
  bucketName?: string; // human-readable bucket name (separate from the raw resource ID)
  presignedUrlSource?: {
    stepId: string;
    fieldPath: string;
  };
  fileSource?: {
    kind: "state_var" | "user_input";
    key: string;
  };
  contentType?: string;

  // --- For type === "state_mutation" ---
  stateTargetKind?: "local" | "store";
  stateStoreNodeId?: string;
  stateKey?: string;
  stateUpdateType?: "set" | "toggle" | "increment" | "reset" | string;
  stateReducerName?: string;
  stateActionName?: string;
  stateTargetFieldId?: string;
  stateValueSource?: FrontendFieldSource;

  // --- For type === "navigation" ---
  navType?: "route" | "page";
  targetRoute?: string;
  targetPageId?: string;
  navCondition?: "direct" | "on_success" | "on_error";

  // --- For type === "custom_code" ---
  code?: string;

  // --- For type === "condition" ---
  conditionExpr?: string;
  thenSteps?: FrontendActionStepDraft[];
  elseSteps?: FrontendActionStepDraft[];

  // --- For type === "notification" ---
  notifyType?: "toast" | "alert";
  notifyMessage?: string;
  notifyLevel?: "success" | "error" | "info" | "warning";

  // --- For type === "reset_form" ---
  formTarget?: string;

  // --- For type === "update_query_params" ---
  queryParamKey?: string;
  queryParamMode?: "set" | "remove" | "toggle";
  queryParamValueSource?: FrontendFieldSource;
  queryParamNavMode?: "replace" | "push";
  queryParamScroll?: boolean;
  queryParamsUpdates?: QueryParamUpdateItem[];

  // --- For type === "transform" ---
  transformerNodeId?: string;
  transformerRefNodeId?: string;
  transformerName?: string;
  outputVariable?: string;
  functionRef?: {
    name: string;
    importPath: string;
    signature?: string;
    isGlobal?: boolean;
    inputSchema?: Array<{ name: string; type: string; required?: boolean }>;
    returnSchema?: Array<{ name: string; type: string; required?: boolean }>;
  };
  transformBindings?: FrontendTransformBinding[];
  responseSource?: {
    stepId: string;
    fieldPath?: string;
  };

  // --- For type === "browser_storage" ---
  browserStorageNodeId?: string;
  storageEngine?: "localStorage" | "sessionStorage";
  storageOperation?: "set" | "remove" | "clear" | "toggle" | "append";
  storageKey?: string;
  storageValueSource?: FrontendFieldSource;
};

export type UIEventItem = {
  id: string;
  name: string;
  event?: string;
  url?: string;
  method?: string;
  schema?: string;
  headers?: Parameter[];
  pathParams?: Parameter[];
  queryParams?: Parameter[];
  requestBody?: Schema;
  requestBodyMode?: "field_builder" | "raw_json";
  navigationType?: "link" | "router";
  navigationCondition?: "direct" | "on_success" | "on_condition" | "on_error";
  targetRoute?: string;
  targetPageId?: string;
  conditionCode?: string;
  testCases?: SimulationTestCase[];
  // AI context
  description?: string;
  uiPrompt?: string;
  libraries?: string[];
  renderMode?: "server" | "client";
  // State Store action binding
  storeActionBinding?: StoreActionBinding;
  storeActionBindings?: StoreActionBinding[];
  // Storage operation binding (when linked to storage_operation_ref)
  storageOperationBinding?: {
    storageNodeId?: string;
    bucketId?: string;
    operationName?: string;
    refNodeId?: string;
    endpointId?: string;
    serviceNodeId?: string;
  };
  // Sequential multi-step flow configuration
  actionSteps?: FrontendActionStepDraft[];
  // SSE config (when event === "sse")
  sseConfig?: {
    reconnectStrategy?: "none" | "exponential" | "linear";
    maxRetries?: number;
    retryDelay?: number;
    eventTypes?: string[];
    withCredentials?: boolean;
    authMode?: "header" | "query" | "cookie" | "none";
  };
  // WebSocket config (when event === "websocket")
  wsConfig?: {
    protocol?: "json" | "binary" | "text";
    reconnectOnDisconnect?: boolean;
    heartbeatInterval?: number;
    authMode?: "query-param" | "header" | "first-message" | "none";
    messageHandlers?: { name: string; description: string }[];
  };
  // WebRTC config (when event === "webrtc")
  webRtcConfig?: {
    signalingServer?: string;
    iceServers?: {
      urls: string;
      username?: string;
      credential?: string;
    }[];
    mediaConstraints?: { audio: boolean; video: boolean };
    hasDataChannel?: boolean;
    role?: "initiator" | "responder" | "both";
    description?: string;
  };
  // Polling config (when event === "polling")
  pollingConfig?: {
    intervalMs?: number;
    stopOnError?: boolean;
    maxRounds?: number;
  };
  // Item-scoped event for array state fields
  scope?: "section" | "item";
  itemSourceStateId?: string;
  itemContextFields?: string[];
};

/** A global simulation scenario. */
export type SimulationTestCase = {
  id: string;
  name: string;
  targetNodeId: string;
  targetEventId?: string;
  isAutoGenerated?: boolean;
  category?: "auto" | "manual";
  /** Incoming route/edge that invokes a LangGraph node. */
  targetRouteId?: string;
  /** Initial values for LangGraph state channels before the graph starts. */
  initialState?: Record<string, JSONValue>;
  /** Explicit branch choice for each router step, keyed by router step id. */
  routerChoices?: Record<string, string>;
  /** Expected final LangGraph state values. */
  expectedState?: Record<string, JSONValue>;
  request?: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    body?: JSONValue;
  };
  expectedStatus?: number;
  expectedBody?: JSONValue;
  enabled?: boolean;
  mocks?: Record<string, { returnData?: JSONValue; status?: number }>;
  expectedPath?: string[];
};

export interface TestCaseItem {
  id?: string;
  testCaseId?: string;
  name?: string;
  targetNodeId?: string;
  nodeId?: string;
  targetEventId?: string;
  request?: {
    headers?: Record<string, string>;
    params?: Record<string, string>;
    body?: JSONValue;
  };
  expectedStatus?: number;
  expectedBody?: JSONValue;
}

// --- AI Adapter Types ---

export type CanvasOperation =
  | {
      op: "add_node";
      type: BackendNodeType;
      label: string;
      position?: { x: number; y: number };
      data?: Partial<BackendNode["data"]>;
    }
  | { op: "update_node"; id: string; changes: Partial<BackendNode> }
  | { op: "delete_node"; id: string }
  | {
      op: "add_edge";
      source: string;
      target: string;
      type: BackendEdgeType;
      data?: Partial<BackendEdge["data"]>;
    }
  | { op: "update_edge"; id: string; changes: Partial<BackendEdge> }
  | { op: "delete_edge"; id: string }
  | { op: "run_auto_layout" }
  | {
      op: "add_shape";
      type: string;
      x: number;
      y: number;
      props: Record<string, string | number | boolean | null>;
    }
  | {
      op: "update_shape";
      id: string;
      props: Record<string, string | number | boolean | null>;
    }
  | { op: "delete_shape"; id: string };

export interface CanvasAdapter<TDoc> {
  getState: () => TDoc;
  applyOperations: (ops: CanvasOperation[]) => void;
  serialize: () => string; // For AI context
}

// --- Input Types (for AI tools & Store operations) ---

export interface ParameterInputType {
  id?: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  key?: string;
  value?: string;
}

export interface PublishedEventInputType {
  id?: string;
  name: string;
  kind?: string;
  schema?: string;
  targetNodeId?: string;
  targetResourceId?: string;
}

export interface ConsumedEventInputType {
  id?: string;
  name: string;
  kind?: string;
  schema?: string;
  handlerLogic?: string;
  targetNodeId?: string;
  targetResourceId?: string;
}

export interface EndpointInputType {
  id?: string;
  name: string;
  type: string;
  headers?: ParameterInputType[];
  pathParams?: ParameterInputType[];
  queryParams?: ParameterInputType[];
  requestBody?: { fields: ParameterInputType[]; rawJson?: string };
  responseBody?: { fields: ParameterInputType[]; rawJson?: string };
  simulationOutput?: JSONValue;
  processingSteps?: {
    id?: string;
    text: string;
    operation?: string;
    config?: Record<string, string | number | boolean | null>;
  }[];
  output?: string;
  businessLogic?: string;
  summary?: string;
  requiredRoles?: string[];
  requiredScopes?: string[];
  audience?: string;
  databaseNodeIds?: string[];
  databaseNodeId?: string;
  publishedEvents?: PublishedEventInputType[];
  requestBodyMode?: "field_builder" | "raw_json";
  responseMode?: "field_builder" | "raw_json" | "custom_expression" | "schema_builder" | "inferred";
  responseExpression?: string;
  requireAuth?: boolean;
  code?: string;
  /** Ordered pipeline steps — explicit field-level bindings per argument */
  pipelineSteps?: EndpointPipelineStepInput[];
}

import type { PipelineStepDraft } from "./pipeline";

export type EndpointPipelineStepInput = PipelineStepDraft;

