import type {
  PipelineStep,
  PipelineStepType,
  PipelineStepInputBinding,
  PipelineStepInputSource,
  ConditionOperator,
  ConditionClause,
  ConditionExpr,
  SwitchCase,
  ParallelBranch,
} from "../schemas/shared";
import type { BackendNode } from "./nodes";
import type { PublishedEventItem } from "./services";
import type {
  LangGraphStateChannel,
  LangGraphInputChannel,
  LangGraphStepConfig,
} from "./langgraph";

// ─── Step Binding & Source Types ──────────────────────────────────────────────

export type StepSource = PipelineStepInputSource;

export type StepBinding = PipelineStepInputBinding;

export type {
  ConditionOperator,
  ConditionClause,
  ConditionExpr,
  SwitchCase,
  ParallelBranch,
};


// ─── Step Types ───────────────────────────────────────────────────────────────

export type StepType = PipelineStepType;

export interface StepFunctionRef {
  name: string;
  importPath: string;
  signature?: string;
  isGlobal?: boolean;
  inputSchema?: StepSchemaField[];
  returnSchema?: StepSchemaField[];
}

export interface StepSchemaField {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export type PipelineStepDraft = PipelineStep;


// ─── Introspection & Autocomplete Sources ─────────────────────────────────────

export interface AvailablePath {
  path: string;
  type?: string;
  description?: string;
}

export interface AvailableSource {
  id: string;
  label: string;
  kind: "req_body" | "req_params" | "req_query" | "req_headers" | "step_output" | "inline";
  stepId?: string;
  variableName?: string;
  rootVariableName?: string;
  paths: AvailablePath[];
}

export interface TransformerSchemaField {
  id?: string;
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface AvailableTransformer {
  id: string;
  name: string;
  description?: string;
  scope: "global" | "local";
  targetServiceId?: string;
  targetEndpointId?: string;
  targetEndpointIds?: string[];
  targetEventId?: string;
  targetEventIds?: string[];
  sourceType: "service_helper" | "canvas_node";
  importPath: string;
  inputSchema: TransformerSchemaField[];
  returnSchema: TransformerSchemaField[];
  nodeId?: string;
  transformerRefNodeId?: string;
  logicMode?: "code" | "natural_language";
  code?: string;
  prompt?: string;
  isAsync?: boolean;
}


export interface SchemaFieldRow {
  name: string;
  type: string;
  required?: boolean;
}

export interface ExpectedArg {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
}

// ─── Connected Resources & Validation Types ───────────────────────────────────

export interface ConnectedTransformer {
  id: string;
  nodeId: string;
  masterId?: string;
  functionName: string;
  isGlobal: boolean;
  inputSchema: TransformerSchemaField[];
  returnSchema: TransformerSchemaField[];
  sourceNode: BackendNode;
}

export interface ConnectedKafka {
  id: string;
  brokerNodeId: string;
  brokerNode: BackendNode;
  topicId?: string;
  topicName: string;
  packageFolder: string;
  functionName: string;
  importPath: string;
  publisherName: string;
}

export interface ConnectedLangGraph {
  id: string;
  nodeId: string;
  label: string;
  stateChannels: LangGraphStateChannel[];
  inputChannels: LangGraphInputChannel[];
  graphSteps: LangGraphStepConfig[];
  node: BackendNode;
}

export interface BindingCheckSource {
  kind?: string;
  field?: string;
  stepId?: string;
  value?: string | number | boolean | Record<string, string | number | boolean | null>;
}

export interface BindingCheckItem {
  argName?: string;
  source?: BindingCheckSource;
}

export interface EndpointLike {
  id: string;
  pipelineSteps?: PipelineStepDraft[];
  publishedEvents?: PublishedEventItem[];
  responseBody?: {
    fields?: Array<{ name?: string }>;
    rawJson?: string;
  };
  responseMode?: string;
}
