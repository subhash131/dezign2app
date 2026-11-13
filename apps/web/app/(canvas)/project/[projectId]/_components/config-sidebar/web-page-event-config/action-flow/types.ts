import type {
  BindingSlot,
  FrontendActionStepType,
  FrontendFieldSource,
  FrontendRequestFieldBinding,
  FrontendTransformBinding,
  NavigationPathParamBinding,
  NavigationQueryParamBinding,
  NavigationMethod,
  FrontendActionStepDraft,
  QueryParamUpdateItem,
  BackendNode,
  Endpoint,
  UIEventItem,
} from "@workspace/canvas";
import type { ActionStepItem } from "../TargetEndpointSection";
import type { AvailablePath } from "../../pipeline-step-editor/types";
import type { ComboboxOption } from "./ActionFlowCombobox";

export type {
  BindingSlot,
  FrontendActionStepType,
  FrontendFieldSource,
  FrontendRequestFieldBinding,
  FrontendTransformBinding,
  NavigationPathParamBinding,
  NavigationQueryParamBinding,
  NavigationMethod,
  FrontendActionStepDraft,
  QueryParamUpdateItem,
  BackendNode,
  Endpoint,
  UIEventItem,
  AvailablePath,
};

export interface ActionFlowEditorProps {
  item?: UIEventItem;
  canvasSteps: ActionStepItem[];
  serviceNodes: BackendNode[];
  allNodes: BackendNode[];
  endpoints: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  isProtected?: boolean;
  isRealtime?: boolean;
  realtimeEventName?: string;
  realtimeProtocol?: string;
  realtimeSourceLabel?: string;
  realtimeSourceItemName?: string;
  incomingPaths?: AvailablePath[];
  isItemScoped?: boolean;
  itemKeyField?: string;
  itemSourceStateName?: string;
  itemPropSuggestions?: ComboboxOption[];
  isLangGraph?: boolean;
  langGraphStreamModes?: string[];
  payloadTypeName?: string;
  onSave: (drafts: FrontendActionStepDraft[]) => void;
  onDeleteStep?: (edgeId: string) => void;
}

export interface ActionFlowStepProps {
  stepDraft: FrontendActionStepDraft;
  canvasStep?: ActionStepItem;
  stepIndex: number;
  allSteps: FrontendActionStepDraft[];
  allCanvasSteps: ActionStepItem[];
  allNodes: BackendNode[];
  serviceNodes: BackendNode[];
  endpoints: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  isProtected?: boolean;
  isRealtime?: boolean;
  incomingPaths?: AvailablePath[];
  isItemScoped?: boolean;
  itemKeyField?: string;
  itemSourceStateName?: string;
  itemPropSuggestions?: ComboboxOption[];
  onChange: (updated: FrontendActionStepDraft) => void;
  onDelete: () => void;
}

export interface ApiCallStepProps {
  draft: FrontendActionStepDraft;
  canvasStep?: ActionStepItem;
  stepIndex: number;
  allSteps: FrontendActionStepDraft[];
  allCanvasSteps: ActionStepItem[];
  serviceNodes?: BackendNode[];
  allNodes?: BackendNode[];
  endpoints?: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  isProtected?: boolean;
  incomingPaths?: AvailablePath[];
  isItemScoped?: boolean;
  itemKeyField?: string;
  itemSourceStateName?: string;
  itemPropSuggestions?: ComboboxOption[];
  onChange: (updated: FrontendActionStepDraft) => void;
}

export interface StoragePutStepProps {
  draft: FrontendActionStepDraft;
  canvasStep?: ActionStepItem;
  stepIndex: number;
  allSteps: FrontendActionStepDraft[];
  allCanvasSteps: ActionStepItem[];
  allNodes?: BackendNode[];
  endpoints?: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  onChange: (updated: FrontendActionStepDraft) => void;
}

export interface ResponseFieldPickerProps {
  value: string;
  onChange: (val: string) => void;
  endpoint?: Endpoint;
  step?: FrontendActionStepDraft;
  allNodes?: BackendNode[];
  endpoints?: (Endpoint & { nodeId?: string })[];
  placeholder?: string;
  disabled?: boolean;
  isStorage?: boolean;
  customSuggestions?: ComboboxOption[];
  className?: string;
}

export interface QueryParamsStepProps {
  draft: FrontendActionStepDraft;
  allSteps: FrontendActionStepDraft[];
  stepIndex: number;
  allNodes: BackendNode[];
  webPageNodeId?: string;
  onChange: (updated: FrontendActionStepDraft) => void;
}

export interface BrowserStorageStepProps {
  draft: FrontendActionStepDraft;
  allSteps: FrontendActionStepDraft[];
  stepIndex: number;
  allNodes: BackendNode[];
  endpoints?: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  onChange: (updated: FrontendActionStepDraft) => void;
}

export interface AuthStepProps {
  draft: FrontendActionStepDraft;
  allSteps?: FrontendActionStepDraft[];
  stepIndex?: number;
  allNodes?: BackendNode[];
  endpoints?: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  onChange: (updated: FrontendActionStepDraft) => void;
}

