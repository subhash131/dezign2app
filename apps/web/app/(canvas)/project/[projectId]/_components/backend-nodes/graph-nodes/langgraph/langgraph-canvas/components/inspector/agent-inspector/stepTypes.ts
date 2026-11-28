import React from "react";
import {
  Bot,
  Zap,
  FileJson,
  Radio,
  Terminal,
  Wrench,
  Shield,
  Shuffle,
  Database,
  HardDrive,
  Globe,
  Cloud,
  Variable,
  GitBranch,
  ShieldAlert,
  MonitorSmartphone,
  GitFork,
  Layers,
  Repeat,
  Send,
  LogOut,
  Network,
} from "lucide-react";
import type {
  AgentNodeData,
  LangGraphNodeStepType,
  LangGraphNodePipelineStep,
  PipelineStepDraft,
} from "@workspace/canvas";
import { toCamelCase } from "./AgentPromptVariablePicker";

// ─────────────────────────────────────────────────────────────────────────────
// Step Metadata Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface LangGraphStepMeta {
  type: LangGraphNodeStepType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  borderColor: string;
  badgeBg: string;
  description: string;
}

export const LANGGRAPH_STEP_META: Record<LangGraphNodeStepType, LangGraphStepMeta> = {
  state_updates: {
    type: "state_updates",
    label: "State Updates",
    icon: Zap,
    color: "text-amber-400",
    borderColor: "border-amber-500/40",
    badgeBg: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    description: "Commit returned channels, reducers, and expressions to graph state",
  },
  llm_call: {
    type: "llm_call",
    label: "LLM Agent",
    icon: Bot,
    color: "text-sky-400",
    borderColor: "border-sky-500/40",
    badgeBg: "bg-sky-500/10 text-sky-300 border-sky-500/25",
    description: "Model, prompt, tools, structured output & middleware",
  },
  custom_code: {
    type: "custom_code",
    label: "Custom Code",
    icon: Terminal,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/40",
    badgeBg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    description: "Inline TypeScript logic: (state, clone) => Partial<State>",
  },
  streaming: {
    type: "streaming",
    label: "Event Streaming",
    icon: Radio,
    color: "text-cyan-400",
    borderColor: "border-cyan-500/40",
    badgeBg: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
    description: "SSE token streaming presets and custom event deltas",
  },
  tools: {
    type: "tools",
    label: "Attach Tools",
    icon: Wrench,
    color: "text-teal-400",
    borderColor: "border-teal-500/40",
    badgeBg: "bg-teal-500/10 text-teal-300 border-teal-500/25",
    description: "Connect canvas tool references, MCP endpoints, and functions",
  },
  structured_output: {
    type: "structured_output",
    label: "Structured Output",
    icon: FileJson,
    color: "text-fuchsia-400",
    borderColor: "border-fuchsia-500/40",
    badgeBg: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/25",
    description: "JSON Schema response enforcement and formatting",
  },
  middleware: {
    type: "middleware",
    label: "Middleware Pipeline",
    icon: Shield,
    color: "text-purple-400",
    borderColor: "border-purple-500/40",
    badgeBg: "bg-purple-500/10 text-purple-300 border-purple-500/25",
    description: "Guardrails, Human-in-the-Loop approvals, and rate limiting",
  },
  transformer: {
    type: "transformer",
    label: "Transformer",
    icon: Shuffle,
    color: "text-purple-400",
    borderColor: "border-purple-500/40",
    badgeBg: "bg-purple-500/10 text-purple-300 border-purple-500/25",
    description: "Compute node for data transformation & custom TypeScript logic",
  },
  transform: {
    type: "transform",
    label: "Transformer",
    icon: Shuffle,
    color: "text-purple-400",
    borderColor: "border-purple-500/40",
    badgeBg: "bg-purple-500/10 text-purple-300 border-purple-500/25",
    description: "Compute node for data transformation & custom TypeScript logic",
  },
  db_operation: {
    type: "db_operation",
    label: "DB Operation",
    icon: Database,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/40",
    badgeBg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    description: "Execute database query, mutation, or transaction",
  },
  redis_operation: {
    type: "redis_operation",
    label: "Redis",
    icon: Zap,
    color: "text-red-400",
    borderColor: "border-red-500/40",
    badgeBg: "bg-red-500/10 text-red-300 border-red-500/25",
    description: "Read/write cache or Redis streams",
  },
  storage_operation: {
    type: "storage_operation",
    label: "Storage",
    icon: HardDrive,
    color: "text-amber-400",
    borderColor: "border-amber-500/40",
    badgeBg: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    description: "S3 / Blob storage upload, download, or presigned URLs",
  },
  kafka_publish: {
    type: "kafka_publish",
    label: "Kafka Publish",
    icon: Radio,
    color: "text-orange-400",
    borderColor: "border-orange-500/40",
    badgeBg: "bg-orange-500/10 text-orange-300 border-orange-500/25",
    description: "Publish events to Kafka topics or message queues",
  },
  external_call: {
    type: "external_call",
    label: "External API Call",
    icon: Globe,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/40",
    badgeBg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    description: "Send HTTP REST / GraphQL requests to 3rd party APIs",
  },
  service_call: {
    type: "service_call",
    label: "Service Call",
    icon: Cloud,
    color: "text-blue-400",
    borderColor: "border-blue-500/40",
    badgeBg: "bg-blue-500/10 text-blue-300 border-blue-500/25",
    description: "Call another internal microservice endpoint",
  },
  variable: {
    type: "variable",
    label: "Variable",
    icon: Variable,
    color: "text-blue-400",
    borderColor: "border-blue-500/40",
    badgeBg: "bg-blue-500/10 text-blue-300 border-blue-500/25",
    description: "Declare or reassign local execution variable",
  },
  condition: {
    type: "condition",
    label: "If / Else",
    icon: GitBranch,
    color: "text-yellow-400",
    borderColor: "border-yellow-500/40",
    badgeBg: "bg-yellow-500/10 text-yellow-300 border-yellow-500/25",
    description: "Conditional branch based on state or prior step output",
  },
  try_catch: {
    type: "try_catch",
    label: "Try / Catch",
    icon: ShieldAlert,
    color: "text-rose-400",
    borderColor: "border-rose-500/40",
    badgeBg: "bg-rose-500/10 text-rose-300 border-rose-500/25",
    description: "Catch errors and execute fallback steps",
  },
  switch: {
    type: "switch",
    label: "Switch",
    icon: GitFork,
    color: "text-indigo-400",
    borderColor: "border-indigo-500/40",
    badgeBg: "bg-indigo-500/10 text-indigo-300 border-indigo-500/25",
    description: "Multi-way branch on value match",
  },
  parallel: {
    type: "parallel",
    label: "Parallel",
    icon: Layers,
    color: "text-violet-400",
    borderColor: "border-violet-500/40",
    badgeBg: "bg-violet-500/10 text-violet-300 border-violet-500/25",
    description: "Execute branches concurrently with Promise.all",
  },
  loop: {
    type: "loop",
    label: "Loop",
    icon: Repeat,
    color: "text-pink-400",
    borderColor: "border-pink-500/40",
    badgeBg: "bg-pink-500/10 text-pink-300 border-pink-500/25",
    description: "Iterate over collection or repeat execution",
  },
  push_to_client: {
    type: "push_to_client",
    label: "Push to Client",
    icon: MonitorSmartphone,
    color: "text-cyan-400",
    borderColor: "border-cyan-500/40",
    badgeBg: "bg-cyan-500/10 text-cyan-300 border-cyan-500/25",
    description: "Deliver processed result to connected client",
  },
  return_response: {
    type: "return_response",
    label: "Return Response",
    icon: Send,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/40",
    badgeBg: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
    description: "Send HTTP response and terminate pipeline",
  },
  early_return: {
    type: "early_return",
    label: "Early Return",
    icon: LogOut,
    color: "text-amber-400",
    borderColor: "border-amber-500/40",
    badgeBg: "bg-amber-500/10 text-amber-300 border-amber-500/25",
    description: "Conditionally terminate execution early",
  },
  langgraph_invoke: {
    type: "langgraph_invoke",
    label: "Invoke Subgraph",
    icon: Network,
    color: "text-sky-400",
    borderColor: "border-sky-500/40",
    badgeBg: "bg-sky-500/10 text-sky-300 border-sky-500/25",
    description: "Invoke another LangGraph agent or subgraph",
  },
  auth_verify: {
    type: "auth_verify",
    label: "Verify Auth",
    icon: Shield,
    color: "text-indigo-400",
    borderColor: "border-indigo-500/40",
    badgeBg: "bg-indigo-500/10 text-indigo-300 border-indigo-500/25",
    description: "Verify Bearer/JWT token via JWKS or Better Auth session",
  },
};

/**
 * Primary Addable Node Execution Steps
 * Includes all pipeline step operations available in PipelineStepEditor
 */
export const ADDABLE_LANGGRAPH_STEP_TYPES: readonly LangGraphNodeStepType[] = [
  "llm_call",
  "transformer",
  "db_operation",
  "redis_operation",
  "storage_operation",
  "kafka_publish",
  "external_call",
  "service_call",
  "variable",
  "condition",
  "try_catch",
];

// ─────────────────────────────────────────────────────────────────────────────
// Initial Step Derivation for Backwards Compatibility
// ─────────────────────────────────────────────────────────────────────────────

export function deriveInitialPipelineSteps(
  data: AgentNodeData,
  connectedLLMId?: string | null,
  connectedToolIds?: string[],
  connectedMiddlewareIds?: string[],
): LangGraphNodePipelineStep[] {
  // If user already saved pipelineSteps, normalize labels and names to camelCase
  if (Array.isArray(data.pipelineSteps)) {
    return data.pipelineSteps.map((step) => {
      const rawLabel = step.label || step.name || "";
      const camelLabel = toCamelCase(rawLabel) || rawLabel;
      const camelName = toCamelCase(step.name || rawLabel) || camelLabel;
      const camelOutVar = step.outputVariable
        ? toCamelCase(step.outputVariable) || step.outputVariable
        : step.outputVariable;
      return {
        ...step,
        label: camelLabel,
        name: camelName,
        outputVariable: camelOutVar,
      };
    });
  }

  // If user saved legacy nodeSteps, normalize and map to pipeline steps with stable IDs
  if (Array.isArray(data.nodeSteps)) {
    if (data.nodeSteps.length === 0) {
      return [];
    }
    const steps: LangGraphNodePipelineStep[] = [];
    let codeIndex = 0;
    let llmIndex = 0;
    let dbIndex = 0;
    let redisIndex = 0;
    let storageIndex = 0;
    let kafkaIndex = 0;
    let apiIndex = 0;
    let serviceIndex = 0;
    let varIndex = 0;
    let genericIndex = 0;

    for (let i = 0; i < data.nodeSteps.length; i++) {
      const s = data.nodeSteps[i];
      if (s === "transformer" || s === "transform") {
        codeIndex++;
        const name = `transformer${codeIndex}`;
        steps.push({
          id: `step_trans_${codeIndex}`,
          type: "transformer",
          label: name,
          name: name,
          outputVariable: `transformedData${codeIndex}`,
          outputSchema: [{ name: "result", type: "string", required: true }],
          inputBindings: [],
        });
      } else if (s === "custom_code") {
        codeIndex++;
        const name = `customCode${codeIndex}`;
        steps.push({
          id: `step_trans_${codeIndex}`,
          type: "transformer",
          label: name,
          name: name,
          outputVariable: `transformedData${codeIndex}`,
          outputSchema: [{ name: "result", type: "string", required: true }],
          inputBindings: [],
        });
      } else if (
        s === "llm_call" ||
        s === "tools" ||
        s === "structured_output" ||
        s === "middleware" ||
        s === "streaming"
      ) {
        if (!steps.some((st) => st.type === "llm_call")) {
          llmIndex++;
          const name = llmIndex > 1 ? `llmAgent${llmIndex}` : "llmAgent";
          steps.push({
            id: `step_llm_${llmIndex}`,
            type: "llm_call",
            label: name,
            name: name,
            outputVariable: llmIndex > 1 ? `llmResponse${llmIndex}` : "response",
          });
        }
      } else if (s === "db_operation") {
        dbIndex++;
        const name = `dbOperation${dbIndex}`;
        steps.push({
          id: `step_db_${dbIndex}`,
          type: "db_operation",
          label: name,
          name: name,
          outputVariable: `dbResult${dbIndex}`,
          declarationKind: "const",
          inputBindings: [],
        });
      } else if (s === "redis_operation") {
        redisIndex++;
        const name = `redis${redisIndex}`;
        steps.push({
          id: `step_redis_${redisIndex}`,
          type: "redis_operation",
          label: name,
          name: name,
          outputVariable: `cachedData${redisIndex}`,
          declarationKind: "const",
          inputBindings: [],
        });
      } else if (s === "storage_operation") {
        storageIndex++;
        const name = `storage${storageIndex}`;
        steps.push({
          id: `step_storage_${storageIndex}`,
          type: "storage_operation",
          label: name,
          name: name,
          outputVariable: `storageResult${storageIndex}`,
          declarationKind: "const",
          inputBindings: [],
        });
      } else if (s === "kafka_publish") {
        kafkaIndex++;
        const name = `kafkaPublish${kafkaIndex}`;
        steps.push({
          id: `step_kafka_${kafkaIndex}`,
          type: "kafka_publish",
          label: name,
          name: name,
          outputVariable: `publishResult${kafkaIndex}`,
          declarationKind: "const",
          inputBindings: [],
        });
      } else if (s === "external_call") {
        apiIndex++;
        const name = `externalApi${apiIndex}`;
        steps.push({
          id: `step_api_${apiIndex}`,
          type: "external_call",
          label: name,
          name: name,
          outputVariable: `apiResponse${apiIndex}`,
          declarationKind: "const",
          inputBindings: [],
        });
      } else if (s === "service_call") {
        serviceIndex++;
        const name = `serviceCall${serviceIndex}`;
        steps.push({
          id: `step_service_${serviceIndex}`,
          type: "service_call",
          label: name,
          name: name,
          outputVariable: `serviceResponse${serviceIndex}`,
          declarationKind: "const",
          inputBindings: [],
        });
      } else if (s === "variable") {
        varIndex++;
        const name = `variable${varIndex}`;
        steps.push({
          id: `step_var_${varIndex}`,
          type: "variable",
          label: name,
          name: name,
          outputVariable: `myVar${varIndex}`,
          variableOperation: "declare",
          declarationKind: "const",
          variableDataType: "string",
        });
      } else if (s) {
        genericIndex++;
        const name = `step${genericIndex}`;
        steps.push({
          id: `step_gen_${genericIndex}`,
          type: s as LangGraphNodeStepType,
          label: name,
          name: name,
          enabled: true,
        });
      }
    }
    return steps;
  }

  // Otherwise infer initial steps from node properties
  const steps: LangGraphNodePipelineStep[] = [];
  const hasLLM = Boolean(connectedLLMId || data.llmConfig?.enabled);
  const hasPrompt = Boolean(
    data.systemPrompt &&
      data.systemPrompt.trim().length > 0 &&
      data.systemPrompt.trim() !== "System prompt / instructions for this node...",
  );
  const hasTools = Boolean(
    (connectedToolIds && connectedToolIds.length > 0) ||
      (data.tools && data.tools.length > 0),
  );
  const hasStructured = Boolean(data.responseFormat?.enabled);
  const hasMiddleware = Boolean(
    data.middlewareConfig?.enabled ||
      (connectedMiddlewareIds && connectedMiddlewareIds.length > 0),
  );
  const hasStreaming = Boolean(data.streamConfig?.enabled);

  if (
    hasLLM ||
    hasPrompt ||
    hasTools ||
    hasStructured ||
    hasMiddleware ||
    hasStreaming
  ) {
    steps.push({
      id: "step_llm_1",
      type: "llm_call",
      label: "llmAgent",
      name: "llmAgent",
      outputVariable: "response",
    });
  }

  if (data.customCode?.body && data.customCode.body.trim().length > 0) {
    const label = steps.length > 0 ? "responseTransform" : "transformer";
    steps.push({
      id: `step_trans_${steps.length + 1}`,
      type: "transformer",
      label,
      name: label,
      outputVariable: `transformedData${steps.length + 1}`,
      outputSchema: [{ name: "result", type: "string", required: true }],
      inputBindings: [],
    });
  }

  return steps;
}

/**
 * Type guard to check if a LangGraph pipeline step is a standard generic pipeline step.
 * Returns true for DB operations, Redis, Kafka, External call, Service call, Variable,
 * Condition, TryCatch, Switch, Parallel, Loop, PushToClient, etc.
 */
export function isGenericPipelineStep(
  step: LangGraphNodePipelineStep,
): step is PipelineStepDraft {
  return (
    step.type !== "state_updates" &&
    step.type !== "llm_call" &&
    step.type !== "custom_code" &&
    step.type !== "transformer" &&
    step.type !== "transform" &&
    step.type !== "streaming" &&
    step.type !== "tools" &&
    step.type !== "structured_output" &&
    step.type !== "middleware"
  );
}
