import {
  Brain,
  Cpu,
  GitBranch,
  Wrench,
  Shield,
  Bot,
  Database,
  CheckCircle2,
  Radio,
  Link2,
  Braces,
} from "lucide-react";
import type { LangGraphCanvasNodeAddType } from "@workspace/canvas";

import {
  STEP_TYPE_LLM_CALL,
  STEP_TYPE_TOOL_NODE,
  STEP_TYPE_EVALUATOR,
  STEP_TYPE_SUMMARIZER,
  STEP_TYPE_CUSTOM_CODE,
  STEP_TYPE_HUMAN_GATE,
  STEP_TYPE_INTERRUPT,
  STEP_TYPE_VECTOR_SEARCH,
  STEP_TYPE_ROUTER,
  TARGET_KIND_STEP,
  TARGET_KIND_PORT,
  TARGET_KIND_END,
  HANDLE_LLM_IN,
  HANDLE_LLM_OUT,
  HANDLE_TOOL_IN,
  HANDLE_TOOL_OUT,
  TOOL_SOURCE_INLINE,
  TOOL_SOURCE_MCP_SERVER,
  TOOL_SOURCE_API_ENDPOINT,
  LLM_PROVIDERS,
  LLM_PROVIDER_MAP,
  LLM_PROVIDER_GROQ,
  LLM_PROVIDER_OPENAI,
  LLM_PROVIDER_ANTHROPIC,
  LLM_PROVIDER_GOOGLE,
  LLM_PROVIDER_CUSTOM,
  LLM_PROVIDER_OTHER,
  LLM_PROVIDER_OPTIONS,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_API_KEY_ENV,
  DEFAULT_LLM_TEMPERATURE,
  MIDDLEWARE_TYPE_HUMAN_IN_THE_LOOP,
  MIDDLEWARE_TYPE_RATE_LIMIT,
  MIDDLEWARE_TYPE_LOGGING_TRACING,
  MIDDLEWARE_TYPE_SUMMARIZATION,
  MIDDLEWARE_TYPE_MODEL_CALL_LIMIT,
  MIDDLEWARE_TYPE_TOOL_CALL_LIMIT,
  MIDDLEWARE_TYPE_MODEL_FALLBACK,
  MIDDLEWARE_TYPE_PII_DETECTION,
  MIDDLEWARE_TYPE_TODO_LIST,
  MIDDLEWARE_TYPE_LLM_TOOL_SELECTOR,
  MIDDLEWARE_TYPE_TOOL_RETRY,
  MIDDLEWARE_TYPE_MODEL_RETRY,
  MIDDLEWARE_TYPE_LLM_TOOL_EMULATOR,
  MIDDLEWARE_TYPE_CONTEXT_EDITING,
  MIDDLEWARE_TYPE_PROVIDER_TOOL_SEARCH,
  MIDDLEWARE_TYPE_FILESYSTEM,
  MIDDLEWARE_TYPE_SUBAGENT,
  MIDDLEWARE_TYPE_CUSTOM,
  DEFAULT_MIDDLEWARE_TYPE,
  DEFAULT_LANGGRAPH_AGENT_NODE_ID,
  DEFAULT_LANGGRAPH_STATE_CHANNELS,
  DEFAULT_LANGGRAPH_INPUT_CHANNELS,
  DEFAULT_LANGGRAPH_AGENT_DEFINITION,
  DEFAULT_LANGGRAPH_GRAPH_EDGES,
  DEFAULT_LANGGRAPH_MEMORY_CONFIG,
  DEFAULT_LANGGRAPH_NODE_POSITIONS,
  DEFAULT_LANGGRAPH_AGENT_NODE_POSITION,
  createDefaultLangGraphNodeData,
} from "@workspace/canvas/constants";

import { LLM_PROVIDER_PRESETS } from "./components/inspector/constants";

// ─── LangGraph Canvas React Flow Node Types ──────────────────────────────────────────
export const LANGGRAPH_CANVAS_NODE_STEP = "step" as const;
export const LANGGRAPH_CANVAS_NODE_START = "start" as const;
export const LANGGRAPH_CANVAS_NODE_END = "end" as const;
export const LANGGRAPH_CANVAS_NODE_PORT = "port" as const;
export const LANGGRAPH_CANVAS_NODE_STATE_GLOBAL = "state_global" as const;
export const LANGGRAPH_CANVAS_NODE_LLM = "langgraph_llm" as const;
export const LANGGRAPH_CANVAS_NODE_LLM_REF = "langgraph_llm_ref" as const;
export const LANGGRAPH_CANVAS_NODE_TOOL = "langgraph_tool" as const;
export const LANGGRAPH_CANVAS_NODE_TOOL_REF = "langgraph_tool_ref" as const;
export const LANGGRAPH_CANVAS_NODE_MIDDLEWARE = "langgraph_middleware" as const;
export const LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF = "langgraph_middleware_ref" as const;
export const LANGGRAPH_CANVAS_NODE_NODE = "langgraph_node" as const;
export const LANGGRAPH_CANVAS_NODE_AGENT = "langgraph_agent" as const;
export const LANGGRAPH_CANVAS_NODE_AGENT_REF = "langgraph_agent_ref" as const;
export const LANGGRAPH_CANVAS_NODE_NODE_REF = "langgraph_node_ref" as const;
export const LANGGRAPH_CANVAS_NODE_MEMORY = "langgraph_memory" as const;
export const LANGGRAPH_CANVAS_NODE_MEMORY_REF = "langgraph_memory_ref" as const;
export const LANGGRAPH_CANVAS_NODE_OUTPUT = "langgraph_output" as const;
export const LANGGRAPH_CANVAS_NODE_STATE_REDUCER_REF = "langgraph_state_reducer_ref" as const;
export const LANGGRAPH_CANVAS_NODE_TRANSFORMER = "transformer" as const;
export const LANGGRAPH_CANVAS_NODE_TRANSFORMER_REF = "transformer_ref" as const;
export const LANGGRAPH_CANVAS_NODE_TYPES = "langgraph_types" as const;
export const LANGGRAPH_CANVAS_NODE_TYPES_REF = "langgraph_types_ref" as const;

export const HANDLE_MIDDLEWARE_IN = "middleware_in" as const;
export const HANDLE_MIDDLEWARE_OUT = "middleware_out" as const;

export const HANDLE_MEMORY_IN = "memory_in" as const;
export const HANDLE_MEMORY_OUT = "memory_out" as const;

export const HANDLE_OUTPUT_IN = "output_in" as const;
export const HANDLE_OUTPUT_OUT = "output_out" as const;

export const HANDLE_STATE_IN = "state_in" as const;
export const HANDLE_STATE_OUT = "state_out" as const;

export const HANDLE_TRANSFORMER_IN = "transformer_in" as const;
export const HANDLE_TRANSFORMER_OUT = "transformer-out" as const;

export const HANDLE_TYPES_IN = "types_in" as const;
export const HANDLE_TYPES_OUT = "types_out" as const;

// ─── Reserved LangGraph Canvas Node IDs ─────────────────────────────────────────────
export const NODE_ID_START = "START" as const;
export const NODE_ID_END = "END" as const;
export const NODE_ID_STATE_GLOBAL = "STATE_GLOBAL" as const;
export const NODE_ID_CHECKPOINTER = "CHECKPOINTER" as const;

// ─── ID Prefixes ──────────────────────────────────────────────────────────────
export const NODE_ID_PREFIX_PORT = "port_" as const;

// ─── Helper Functions ─────────────────────────────────────────────────────────
export function isReservedNodeId(id: string | null | undefined): boolean {
  if (!id) return false;
  return (
    id === NODE_ID_START ||
    id === NODE_ID_STATE_GLOBAL ||
    id === NODE_ID_CHECKPOINTER ||
    id.startsWith(NODE_ID_PREFIX_PORT)
  );
}

export function makePortNodeId(portId: string): string {
  return `${NODE_ID_PREFIX_PORT}${portId}`;
}

export function stripPortPrefix(id: string): string {
  return id.startsWith(NODE_ID_PREFIX_PORT)
    ? id.replace(NODE_ID_PREFIX_PORT, "")
    : id;
}

export {
  STEP_TYPE_LLM_CALL,
  STEP_TYPE_TOOL_NODE,
  STEP_TYPE_EVALUATOR,
  STEP_TYPE_SUMMARIZER,
  STEP_TYPE_CUSTOM_CODE,
  STEP_TYPE_HUMAN_GATE,
  STEP_TYPE_INTERRUPT,
  STEP_TYPE_VECTOR_SEARCH,
  STEP_TYPE_ROUTER,
  MIDDLEWARE_TYPE_HUMAN_IN_THE_LOOP,
  MIDDLEWARE_TYPE_RATE_LIMIT,
  MIDDLEWARE_TYPE_LOGGING_TRACING,
  MIDDLEWARE_TYPE_SUMMARIZATION,
  MIDDLEWARE_TYPE_MODEL_CALL_LIMIT,
  MIDDLEWARE_TYPE_TOOL_CALL_LIMIT,
  MIDDLEWARE_TYPE_MODEL_FALLBACK,
  MIDDLEWARE_TYPE_PII_DETECTION,
  MIDDLEWARE_TYPE_TODO_LIST,
  MIDDLEWARE_TYPE_LLM_TOOL_SELECTOR,
  MIDDLEWARE_TYPE_TOOL_RETRY,
  MIDDLEWARE_TYPE_MODEL_RETRY,
  MIDDLEWARE_TYPE_LLM_TOOL_EMULATOR,
  MIDDLEWARE_TYPE_CONTEXT_EDITING,
  MIDDLEWARE_TYPE_PROVIDER_TOOL_SEARCH,
  MIDDLEWARE_TYPE_FILESYSTEM,
  MIDDLEWARE_TYPE_SUBAGENT,
  MIDDLEWARE_TYPE_CUSTOM,
  DEFAULT_MIDDLEWARE_TYPE,
  TARGET_KIND_STEP,
  TARGET_KIND_PORT,
  TARGET_KIND_END,
  HANDLE_LLM_IN,
  HANDLE_LLM_OUT,
  HANDLE_TOOL_IN,
  HANDLE_TOOL_OUT,
  TOOL_SOURCE_INLINE,
  TOOL_SOURCE_MCP_SERVER,
  TOOL_SOURCE_API_ENDPOINT,
  LLM_PROVIDERS,
  LLM_PROVIDER_MAP,
  LLM_PROVIDER_GROQ,
  LLM_PROVIDER_OPENAI,
  LLM_PROVIDER_ANTHROPIC,
  LLM_PROVIDER_GOOGLE,
  LLM_PROVIDER_CUSTOM,
  LLM_PROVIDER_OTHER,
  LLM_PROVIDER_OPTIONS,
  LLM_PROVIDER_PRESETS,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_API_KEY_ENV,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_LANGGRAPH_AGENT_NODE_ID,
  DEFAULT_LANGGRAPH_STATE_CHANNELS,
  DEFAULT_LANGGRAPH_INPUT_CHANNELS,
  DEFAULT_LANGGRAPH_AGENT_DEFINITION,
  DEFAULT_LANGGRAPH_GRAPH_EDGES,
  DEFAULT_LANGGRAPH_MEMORY_CONFIG,
  DEFAULT_LANGGRAPH_NODE_POSITIONS,
  DEFAULT_LANGGRAPH_AGENT_NODE_POSITION,
  createDefaultLangGraphNodeData,
};

// ─── Event Stream Defaults & Constants ─────────────────────────────────────────
export const DEFAULT_STREAM_ENVELOPE = {
  includeEvent: true,
  includeAgent: true,
  includeRunId: true,
  includeTimestamp: true,
  includeDelta: true,
  includeContent: true,
  includeTool: true,
  includeInputs: false,
  includeOutput: true,
  includeUsage: true,
  flattenPayload: false,
  stripEmptyDeltas: true,
};

export const DEFAULT_STREAM_TRANSFORMER_MODE = "standard_sse" as const;

export const DEFAULT_CUSTOM_TRANSFORMER_CODE = `// Custom LangChain streamEvents (v3) transformer
export async function* customEventStreamTransformer(eventStream) {
  for await (const event of eventStream) {
    yield {
      event: event.event,
      timestamp: new Date().toISOString(),
      payload: event.data,
    };
  }
}`;

export const STREAM_TRANSFORMER_PRESETS = [
  {
    id: "standard_sse" as const,
    label: "Standard SSE",
    badge: "Recommended",
    description: "Standard Server-Sent Events with event envelope and structured payload",
  },
  {
    id: "ai_sdk" as const,
    label: "Vercel AI SDK",
    badge: "AI SDK UI",
    description: "Data-stream protocol compatible with useChat and useCompletion hooks",
  },
  {
    id: "openai_chunk" as const,
    label: "OpenAI Delta Format",
    badge: "OpenAI Chunk",
    description: "Mirrors chat completion chunks with choices[].delta structure",
  },
  {
    id: "minimal" as const,
    label: "Minimal Token Delta",
    badge: "High Throughput",
    description: "Ultra-lean payload with only token text deltas and tool updates",
  },
  {
    id: "full_trace" as const,
    label: "Full Trace & Telemetry",
    badge: "Observability",
    description: "Complete execution lifecycle with node IDs, tool I/O, and token usage metrics",
  },
  {
    id: "custom" as const,
    label: "Custom Generator",
    badge: "Advanced",
    description: "Define a bespoke async generator stream transformer in TypeScript/Python",
  },
] as const;

export const STREAM_EVENT_TYPES = [
  {
    id: "stream.messages",
    label: "stream.messages",
    description: "LLM Model message streams (one stream per LLM call)",
    badge: "LLM Streams",
  },
  {
    id: "message.text",
    label: "message.text",
    description: "Text token deltas & final message text chunks",
    badge: "Text Deltas",
  },
  {
    id: "message.reasoning",
    label: "message.reasoning",
    description: "Reasoning / thinking deltas for CoT models",
    badge: "Reasoning",
  },
  {
    id: "message.toolCalls",
    label: "message.toolCalls",
    description: "Live tool-call argument deltas while model streams",
    badge: "Tool Call Chunks",
  },
  {
    id: "stream.toolCalls",
    label: "stream.toolCalls",
    description: "Tool execution lifecycle (start, inputs, outputs, errors)",
    badge: "Tool Execution",
  },
  {
    id: "stream.values",
    label: "stream.values",
    description: "Agent state snapshots emitted after graph node steps",
    badge: "State Snapshots",
  },
  {
    id: "stream.output",
    label: "stream.output",
    description: "Final agent state output once graph run completes",
    badge: "Final Output",
  },
  {
    id: "stream.subagents",
    label: "stream.subagents",
    description: "Nested sub-agent event streams & execution",
    badge: "Sub-Agents",
  },
  {
    id: "stream.extensions",
    label: "stream.extensions",
    description: "Custom stream transformer projections & custom updates",
    badge: "Custom Extensions",
  },
];

export const DEFAULT_SELECTED_STREAM_EVENTS = [
  "stream.messages",
  "message.text",
  "message.reasoning",
  "message.toolCalls",
  "stream.toolCalls",
  "stream.values",
  "stream.output",
];

// ─── Response Format / Structured Output Presets & Defaults ─────────────────────
export const DEFAULT_RESPONSE_FORMAT_JSON_SCHEMA = JSON.stringify(
  {
    type: "object",
    description: "Structured agent response output",
    properties: {
      summary: {
        type: "string",
        description: "Concise summary of findings or result",
      },
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "negative"],
        description: "Overall sentiment classification",
      },
      keyPoints: {
        type: "array",
        items: { type: "string" },
        description: "Key bullet points extracted from analysis",
      },
    },
    required: ["summary", "sentiment", "keyPoints"],
  },
  null,
  2,
);

export const DEFAULT_RESPONSE_FORMAT_ZOD_SCHEMA = `import { z } from "zod";

export const AgentResponseFormat = z.object({
  summary: z.string().describe("Concise summary of findings or result"),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("Overall sentiment classification"),
  keyPoints: z.array(z.string()).describe("Key bullet points extracted from analysis")
});`;

export const RESPONSE_FORMAT_PRESETS = [
  {
    id: "contact_info",
    label: "Contact Info Extraction",
    description: "Extract name, email, phone from user text",
    jsonSchema: JSON.stringify(
      {
        type: "object",
        description: "Contact information for a person",
        properties: {
          name: { type: "string", description: "Full name of person" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
        },
        required: ["name", "email", "phone"],
      },
      null,
      2,
    ),
    zodSchema: `import { z } from "zod";

export const ContactInfo = z.object({
  name: z.string().describe("Full name of person"),
  email: z.string().describe("Email address"),
  phone: z.string().describe("Phone number")
});`,
  },
  {
    id: "product_review",
    label: "Product Review Analysis",
    description: "Extract rating, sentiment, and key points",
    jsonSchema: JSON.stringify(
      {
        type: "object",
        description: "Analysis of product review",
        properties: {
          rating: {
            type: "number",
            minimum: 1,
            maximum: 5,
            description: "Rating from 1-5",
          },
          sentiment: {
            type: "string",
            enum: ["positive", "negative"],
            description: "Overall sentiment",
          },
          keyPoints: {
            type: "array",
            items: { type: "string" },
            description: "Key points extracted",
          },
        },
        required: ["sentiment", "keyPoints"],
      },
      null,
      2,
    ),
    zodSchema: `import { z } from "zod";

export const ProductReview = z.object({
  rating: z.number().min(1).max(5).optional(),
  sentiment: z.enum(["positive", "negative"]),
  keyPoints: z.array(z.string()).describe("Key points extracted")
});`,
  },
  {
    id: "meeting_action",
    label: "Meeting Action Item",
    description: "Extract task, assignee, and priority",
    jsonSchema: JSON.stringify(
      {
        type: "object",
        description: "Captured action item from meeting",
        properties: {
          task: { type: "string", description: "Specific task description" },
          assignee: { type: "string", description: "Person assigned to task" },
          priority: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Task priority level",
          },
        },
        required: ["task", "assignee", "priority"],
      },
      null,
      2,
    ),
    zodSchema: `import { z } from "zod";

export const MeetingAction = z.object({
  task: z.string().describe("Specific task description"),
  assignee: z.string().describe("Person assigned to task"),
  priority: z.enum(["low", "medium", "high"]).describe("Task priority level")
});`,
  },
];

export type ToolPaletteItem = {
  type: LangGraphCanvasNodeAddType;
  label: string;
  desc: string;
  icon: typeof Brain;
};

export const TOOL_PALETTE_ITEMS: ToolPaletteItem[] = [
  {
    type: LANGGRAPH_CANVAS_NODE_NODE,
    label: "Agent Node",
    desc: "LangGraph node with optional LLM, tools, middleware & memory",
    icon: Bot,
  },
  {
    type: STEP_TYPE_ROUTER,
    label: "Conditional Router",
    desc: "Routes execution dynamically based on comparison rules",
    icon: GitBranch,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_END,
    label: "END Node",
    desc: "Terminal graph node representing __end__ execution",
    icon: CheckCircle2,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_LLM,
    label: "LLM config",
    desc: "Configure an LLM provider (configure once)",
    icon: Cpu,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_LLM_REF,
    label: "LLM Ref",
    desc: "Reference an existing LLM configuration across nodes",
    icon: Brain,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_TOOL,
    label: "Tool",
    desc: "Configure an executable tool for LLMs",
    icon: Wrench,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_TOOL_REF,
    label: "Tool Ref",
    desc: "Reference an existing Tool configuration across nodes",
    icon: Link2,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_MIDDLEWARE,
    label: "Middleware",
    desc: "Interceptors for Human-in-the-loop, rate limit & tracing",
    icon: Shield,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_MIDDLEWARE_REF,
    label: "Middleware Ref",
    desc: "Reference an existing Middleware configuration across nodes",
    icon: Link2,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_MEMORY,
    label: "Memory / DB Config",
    desc: "Save chat history & state checkpoints per session",
    icon: Database,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_MEMORY_REF,
    label: "Memory / DB Ref",
    desc: "Reference an existing Memory configuration across nodes",
    icon: Link2,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_OUTPUT,
    label: "Output Channel",
    desc: "Emit SSE, WebSocket, Event, or Webhook output",
    icon: Radio,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_TYPES,
    label: "Types / Schemas",
    desc: "Define custom TypeScript interfaces, types & schemas",
    icon: Braces,
  },
  {
    type: LANGGRAPH_CANVAS_NODE_TYPES_REF,
    label: "Types Ref",
    desc: "Reference existing Types & Schemas across nodes",
    icon: Link2,
  },
];
