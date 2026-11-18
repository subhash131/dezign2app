import type { Edge } from "@xyflow/react";
import type { CustomTypeItem } from "../custom-types";
import type {
  LangGraphStateChannel,
  LangGraphInputChannel,
  OutputChannelConfig,
  LangGraphCustomReducer,
} from "./channels";
import type { StateUpdateMode, LangGraphStateUpdateItem } from "./tools";
import type { LangGraphStepConfig } from "./steps";
import type {
  LangGraphMemoryConfig,
  LangGraphMemoryDefinition,
} from "./memory";
import type { LangGraphMiddlewareDefinition } from "./middleware";
import type {
  LangGraphAgentDefinition,
  LangGraphAgentStreamConfig,
  LangGraphAgentResponseFormatConfig,
  LangGraphAgentMemoryConfig,
} from "./agent";

/** AI / LLM / MCP Server node fields (canvas type). */
export interface CanvasAINodeData {
  // LLM Node
  model?: string;
  temperature?: number;
  maxTokens?: number;
  structuredOutput?: boolean;
  toolCalling?: boolean;
  prompts?: { id: string; name: string }[];
  tools?: { id: string; name: string }[];
  // MCP Server Node
  resources?: { id: string; name: string }[];
  connectionType?: "stdio" | "SSE" | "HTTP";
}

/** LangGraph Step node fields — child step nodes inside a graph (canvas type). */
export interface CanvasLangGraphStepNodeData {
  stepId?: string;
  stepType?:
    | "llm_call"
    | "tool_node"
    | "evaluator"
    | "summarizer"
    | "transformer"
    | "transform"
    | "custom_code"
    | "human_gate"
    | "interrupt"
    | "vector_search"
    | "router";
  modelConfig?: LangGraphStepConfig["modelConfig"];
  humanGateConfig?: {
    approvalPrompt: string;
    timeoutMs?: number;
    requiredRole?: string;
  };
  interruptConfig?: {
    callbackKey: string;
    timeoutMs?: number;
  };
  customCode?: {
    body: string;
    timeoutMs?: number;
    memoryLimitMb?: number;
  };
  routerConfig?: LangGraphStepConfig["routerConfig"];
}

export interface LLMConfigState {
  enabled: boolean;
  provider: string;
  model: string;
  temperature: number;
}

export interface StateUpdatesConfigState {
  enabled: boolean;
}

export interface MiddlewareNodeData
  extends LangGraphMiddlewareDefinition,
    Record<string, unknown> {
  label: string;
  onDeleteMiddleware?: () => void;
  onOpenInspector?: () => void;
  onSelectNode?: () => void;
}

export interface MemoryNodeData
  extends LangGraphMemoryDefinition,
    Record<string, unknown> {
  label: string;
  enabled?: boolean;
  onOpenMemoryTab?: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  onUpdateMemoryConfig?: (changes: Partial<LangGraphMemoryConfig>) => void;
  onDeleteMemory?: () => void;
  onOpenInspector?: () => void;
  onSelectNode?: () => void;
}

export interface CanvasNodeData
  extends LangGraphAgentDefinition,
    Record<string, unknown> {
  label: string;
  isExpanded?: boolean;
  llmConfig?: {
    enabled?: boolean;
    provider?: string;
    model?: string;
    temperature?: number;
  };
  stateUpdatesConfig?: {
    enabled?: boolean;
  };
  middlewareConfig?: {
    enabled?: boolean;
  };
  stateUpdates?: LangGraphStateUpdateItem[];
  availableStateChannels?: LangGraphStateChannel[];
  onDeleteAgent?: () => void;
  onOpenInspector?: () => void;
  onSelectNode?: () => void;
}

export type AgentNodeData = CanvasNodeData;

export interface UseLangGraphCanvasNodeReturn {
  isEditingName: boolean;
  setIsEditingName: (editing: boolean) => void;
  nameValue: string;
  setNameValue: (val: string) => void;
  isExpanded: boolean;
  toggleExpand: () => void;
  handleDelete: () => void;
  handleNameSave: () => void;
  boundLLMs: Edge[];
  boundTools: Edge[];
  boundMiddlewares: Edge[];
  boundMemories?: Edge[];
  boundStateReducers?: Edge[];
  llmConfig: LLMConfigState;
  middlewareConfig?: {
    enabled?: boolean;
  };
  stateUpdatesConfig?: StateUpdatesConfigState;
  streamConfig: LangGraphAgentStreamConfig;
  responseFormat: LangGraphAgentResponseFormatConfig;
  memoryConfig?: LangGraphAgentMemoryConfig;
  stateUpdates: Array<{ channelKey: string; mode?: string; value?: string }>;
  availableFields: string[];
  updateAgentData: (changes: Partial<CanvasNodeData>) => void;
  handleToggleLLMConfig: (enabled: boolean) => void;
  handleToggleMiddlewareConfig?: (enabled: boolean) => void;
  handleRemoveMiddleware?: (sourceId: string) => void;
  handleAddDefaultMiddleware?: () => void;
  handleToggleStateUpdates?: (enabled: boolean) => void;
  handleToggleStreaming: (enabled: boolean) => void;
  handleToggleResponseFormat: (enabled: boolean) => void;
  handleToggleMemory?: (enabled: boolean) => void;
  handleToggleEvent: (eventId: string) => void;
}

export interface LangGraphLLMNodeData extends Record<string, unknown> {
  label: string;
  llmId: string;
  provider?:
    | "openai"
    | "anthropic"
    | "google"
    | "groq"
    | "ollama"
    | "custom"
    | (string & {});
  url?: string;
  baseUrl?: string;
  method?: "POST" | "GET" | "PUT" | string;
  headersJson?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  model?: string;
  systemPrompt?: string;
  bodyJson?: string;
  temperature?: number;
  maxTokens?: number;
  onDeleteLLM?: () => void;
}

export type CustomLLMNodeData = LangGraphLLMNodeData;

export interface LangGraphLLMRefNodeData extends Record<string, unknown> {
  label: string;
  refId: string;
  llmRef?: string;
  onDeleteLLMRef?: () => void;
}

export interface LangGraphToolRefNodeData extends Record<string, unknown> {
  label: string;
  refId: string;
  toolRef?: string;
  onDeleteToolRef?: () => void;
}

export interface LangGraphMiddlewareRefNodeData extends Record<string, unknown> {
  label: string;
  refId: string;
  middlewareRef?: string;
  onDeleteMiddlewareRef?: () => void;
}

export interface LangGraphMemoryRefNodeData extends Record<string, unknown> {
  label: string;
  refId: string;
  memoryRef?: string;
  onDeleteMemoryRef?: () => void;
}

export interface LangGraphAgentRefNodeData extends Record<string, unknown> {
  label: string;
  refId: string;
  agentRef?: string;
  nodeRef?: string;
  onDeleteAgentRef?: () => void;
  onSelectMaster?: (masterId: string) => void;
  loopWarning?: {
    id: string;
    type: "dead_end_cycle" | "unconditional_cycle" | "self_loop";
    message: string;
    severity: "error" | "warning";
    cycleLabels?: string[];
  };
}

export interface LangGraphStateReducerRefNodeData extends Record<string, unknown> {
  label: string;
  refId: string;
  targetChannelKey?: string;
  mode?: "append" | "set" | "overwrite" | "untracked";
  customValue?: string;
  onDeleteStateReducerRef?: () => void;
}

export interface ToolNodeData extends Record<string, unknown> {
  label: string;
  toolId: string;
  name: string;
  description: string;
  inputSchema?: string;

  source: "inline" | "mcp_server" | "api_endpoint";
  endpointUrl?: string;
  mcpConnectionId?: string;
  remoteToolName?: string;

  returnDirect?: boolean;
  returnType?: "string" | "object" | "content_blocks" | "command";
  outputSchema?: string;
  commandConfig?: {
    stateUpdates: {
      channelKey: string;
      mode?: "set" | "append" | "expression";
      value?: string;
    }[];
  };

  functionBody?: string;
  implementationMode?: "natural_language" | "code";
  prompt?: string;
  executionMode?: "sandboxed_vm" | "disabled";
  headless?: boolean;

  contextAccess?: { enabled?: boolean; fields?: string[] };
  storeAccess?: {
    enabled?: boolean;
    namespace?: string;
    operations?: ("get" | "put" | "delete" | "list")[];
  };
  streamWriter?: boolean;

  errorHandling?: {
    enabled?: boolean;
    retryCount?: number;
    customErrorMessage?: string;
  };

  onDeleteTool?: () => void;
  onOpenInspector?: () => void;
  onSelectNode?: () => void;
}

export interface StepNodeData extends Record<string, unknown> {
  label: string;
  stepId: string;
  stepType: LangGraphStepConfig["type"];
  llmConfig?: {
    enabled?: boolean;
    provider?: string;
    model?: string;
    temperature?: number;
  };
  modelConfig?: LangGraphStepConfig["modelConfig"];
  humanGateConfig?: LangGraphStepConfig["humanGateConfig"];
  customCode?: LangGraphStepConfig["customCode"];
  routerConfig?: LangGraphStepConfig["routerConfig"];
  transformerNodeId?: string;
  transformerRef?: string;
  functionRef?: {
    name: string;
    importPath?: string;
  };
  inputBindings?: LangGraphStepConfig["inputBindings"];
  outputVariable?: string;
  outputSchema?: LangGraphStepConfig["outputSchema"];
  pipelineSteps?: LangGraphStepConfig["pipelineSteps"];
  stateUpdates?: LangGraphStepConfig["stateUpdates"];
  availableStateChannels?: LangGraphStateChannel[];
  activeBranchId?: string;
  onDeleteStep?: () => void;
  onOpenInspector?: () => void;
  onOpenInspectorRoute?: (branchId: string) => void;
  onSelectNode?: () => void;
}

export interface StartNodeData extends Record<string, unknown> {
  label: string;
  inputChannels?: LangGraphInputChannel[];
  /** Re-scans and synchronizes configured input fields from connected endpoint pipeline steps */
  onRefreshInputs?: () => void;
  /** Called when user clicks the + button to add a new input field */
  onAddInputChannel?: () => void;
  /** Called to add a pre-filled channel directly (e.g. from suggestions) */
  onAddSuggestedChannel?: (channel: LangGraphInputChannel) => void;
  /** Called when user updates an existing input channel */
  onUpdateInputChannel?: (index: number, changes: Partial<LangGraphInputChannel>) => void;
  /** Called when user deletes an input channel */
  onDeleteInputChannel?: (index: number) => void;
  /** Opens the Inputs tab in the inspector sidebar */
  onOpenInputsTab?: () => void;
  /** Opens the Testing tab in the inspector sidebar */
  onOpenTestingTab?: () => void;
  /** Derived from connected endpoint – shown as "suggested" fields */
  suggestedParams?: Array<{
    key: string;
    type: LangGraphInputChannel["type"];
    description?: string;
    required?: boolean;
    targetStateChannel?: string;
  }>;
  /** Available state channels for mapping dropdowns */
  stateChannels?: LangGraphStateChannel[];
  /** Available transformer nodes for custom transition transformations */
  availableTransformers?: Array<{
    id: string;
    name: string;
    functionName?: string;
    label?: string;
  }>;
  /** Auto-maps inputs to state channels by matching names or common aliases */
  onAutoMapStateChannels?: () => void;
  /** Maps a state channel to a specific input channel (or unmaps if undefined) */
  onMapStateToInput?: (stateKey: string, inputChannelIdOrKey?: string) => void;
  /** Opens the State tab in the inspector sidebar */
  onOpenStateTab?: () => void;
}

export interface EndNodeData extends Record<string, unknown> {
  label: string;
}

export interface PortNodeData extends Record<string, unknown> {
  label: string;
  portId: string;
}

export interface StateGlobalNodeData extends Record<string, unknown> {
  label: string;
  stateChannels: LangGraphStateChannel[];
  customReducers?: LangGraphCustomReducer[];
  onOpenStateTab?: () => void;
  onAddChannel?: () => void;
  onUpdateChannel?: (
    index: number,
    channel: Partial<LangGraphStateChannel>,
  ) => void;
  onDeleteChannel?: (index: number) => void;
  onDuplicateChannel?: (index: number) => void;
  onAddCustomReducer?: (reducer: LangGraphCustomReducer) => void;
  onUpdateCustomReducer?: (
    idOrName: string,
    changes: Partial<LangGraphCustomReducer>,
  ) => void;
  onDeleteCustomReducer?: (id: string) => void;
}

export interface OutputNodeData
  extends OutputChannelConfig,
    Record<string, unknown> {
  label: string;
  onDeleteOutput?: () => void;
  onOpenInspector?: () => void;
  onSelectNode?: () => void;
}

export interface LangGraphTypesNodeData extends Record<string, unknown> {
  label: string;
  typesId?: string;
  types?: CustomTypeItem[];
  rawTypeScript?: string;
  definitionMode?: "visual" | "raw";
  onDeleteTypes?: () => void;
  onOpenInspector?: () => void;
  onSelectNode?: () => void;
}

export interface LangGraphTypesRefNodeData extends Record<string, unknown> {
  label: string;
  refId: string;
  typesRef?: string;
  onDeleteTypesRef?: () => void;
  onOpenInspector?: () => void;
  onSelectNode?: () => void;
}

