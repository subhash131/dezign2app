import type {
  LangGraphStepConfig,
  LangGraphEdgeConfig,
  LangGraphTableDefinition,
  LangGraphRedisSchemaDefinition,
  LangGraphStateChannel,
  LangGraphInputChannel,
  LangGraphAgentDefinition,
  LangGraphMemoryConfig,
} from "../types";

// ─── LangGraph Step Execution Types ───────────────────────────────────────────
export const STEP_TYPE_LLM_CALL = "llm_call" as const;
export const STEP_TYPE_TOOL_NODE = "tool_node" as const;
export const STEP_TYPE_EVALUATOR = "evaluator" as const;
export const STEP_TYPE_SUMMARIZER = "summarizer" as const;
export const STEP_TYPE_CUSTOM_CODE = "custom_code" as const;
export const STEP_TYPE_TRANSFORMER = "transformer" as const;
export const STEP_TYPE_TRANSFORM = "transform" as const;
export const STEP_TYPE_HUMAN_GATE = "human_gate" as const;
export const STEP_TYPE_INTERRUPT = "interrupt" as const;
export const STEP_TYPE_VECTOR_SEARCH = "vector_search" as const;
export const STEP_TYPE_ROUTER = "router" as const;

// ─── LangGraph Middleware Types ───────────────────────────────────────────────
export const MIDDLEWARE_TYPE_HUMAN_IN_THE_LOOP = "human_in_the_loop" as const;
export const MIDDLEWARE_TYPE_RATE_LIMIT = "rate_limit" as const;
export const MIDDLEWARE_TYPE_LOGGING_TRACING = "logging_tracing" as const;
export const MIDDLEWARE_TYPE_SUMMARIZATION = "summarization" as const;
export const MIDDLEWARE_TYPE_MODEL_CALL_LIMIT = "model_call_limit" as const;
export const MIDDLEWARE_TYPE_TOOL_CALL_LIMIT = "tool_call_limit" as const;
export const MIDDLEWARE_TYPE_MODEL_FALLBACK = "model_fallback" as const;
export const MIDDLEWARE_TYPE_PII_DETECTION = "pii_detection" as const;
export const MIDDLEWARE_TYPE_TODO_LIST = "todo_list" as const;
export const MIDDLEWARE_TYPE_LLM_TOOL_SELECTOR = "llm_tool_selector" as const;
export const MIDDLEWARE_TYPE_TOOL_RETRY = "tool_retry" as const;
export const MIDDLEWARE_TYPE_MODEL_RETRY = "model_retry" as const;
export const MIDDLEWARE_TYPE_LLM_TOOL_EMULATOR = "llm_tool_emulator" as const;
export const MIDDLEWARE_TYPE_CONTEXT_EDITING = "context_editing" as const;
export const MIDDLEWARE_TYPE_PROVIDER_TOOL_SEARCH =
  "provider_tool_search" as const;
export const MIDDLEWARE_TYPE_FILESYSTEM = "filesystem" as const;
export const MIDDLEWARE_TYPE_SUBAGENT = "subagent" as const;
export const MIDDLEWARE_TYPE_CUSTOM = "custom" as const;

export const DEFAULT_MIDDLEWARE_TYPE = MIDDLEWARE_TYPE_SUMMARIZATION;

// ─── Edge Target & Connection Kinds ───────────────────────────────────────────
export const TARGET_KIND_STEP = "step" as const;
export const TARGET_KIND_PORT = "port" as const;
export const TARGET_KIND_END = "end" as const;

// ─── Sub-Canvas Handle IDs ─────────────────────────────────────────────────────
export const HANDLE_LLM_IN = "llm_in" as const;
export const HANDLE_LLM_OUT = "llm_out" as const;
export const HANDLE_TOOL_IN = "tool_in" as const;
export const HANDLE_TOOL_OUT = "tool_out" as const;
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

// ─── LangGraph Canvas React Flow Node Types ────────────────────────────────────
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

// ─── Tool Sources ─────────────────────────────────────────────────────────────
export const TOOL_SOURCE_INLINE = "inline" as const;
export const TOOL_SOURCE_MCP_SERVER = "mcp_server" as const;
export const TOOL_SOURCE_API_ENDPOINT = "api_endpoint" as const;

export interface LangGraphDataInput {
  graphSteps?: LangGraphStepConfig[];
  graphEdges?: LangGraphEdgeConfig[];
  [key: string]: unknown;
}

export function ensureLangGraphDataReachability<T extends LangGraphDataInput>(
  data: T,
): T {
  return data;
}

// ─── Default LangGraph Architecture ──────────────────────────────────────────
export const DEFAULT_LANGGRAPH_AGENT_NODE_ID = "agentNode" as const;

export const DEFAULT_LANGGRAPH_STATE_CHANNELS: LangGraphStateChannel[] = [
  {
    key: "messages",
    type: "messages",
    reducer: "add_messages",
    defaultValue: [],
  },
];

export const DEFAULT_LANGGRAPH_INPUT_CHANNELS: LangGraphInputChannel[] = [
  {
    id: "input_message",
    key: "message",
    type: "string",
    required: true,
    source: "request",
    stateChannelKey: "messages",
  },
];

export const DEFAULT_LANGGRAPH_AGENT_DEFINITION: LangGraphAgentDefinition = {
  id: "agentNode",
  agentId: "agentNode",
  name: "agentNode",
  llmConfig: {
    enabled: false,
  },
  middlewareConfig: {
    enabled: false,
  },
  stateUpdatesConfig: {
    enabled: false,
  },
  tools: [],
  middleware: [],
  transformers: [],
  memory: [],
  position: { x: 880, y: 240 },
};

export const DEFAULT_LANGGRAPH_GRAPH_EDGES: LangGraphEdgeConfig[] = [
  {
    id: "edge_START_agentNode",
    source: "START",
    sourceHandle: "out",
    targetHandle: "in",
    targets: [
      {
        id: "agentNode",
        kind: "step",
        targetHandle: "in",
      },
    ],
  },
  {
    id: "edge_agentNode_END",
    source: "agentNode",
    sourceHandle: "out",
    targetHandle: "in",
    targets: [
      {
        id: "END",
        kind: "end",
        targetHandle: "in",
      },
    ],
  },
];

export const DEFAULT_LANGGRAPH_MEMORY_CONFIG: LangGraphMemoryConfig = {
  enabled: false,
  checkpointer: "postgres",
  threadScope: "session",
  autoSummarize: true,
  maxWindowMessages: 10,
};

export const DEFAULT_LANGGRAPH_NODE_POSITIONS = {
  stateNodePosition: { x: 80, y: 120 },
  checkpointerNodePosition: { x: 80, y: 360 },
  startNodePosition: { x: 460, y: 180 },
  endNodePosition: { x: 1300, y: 290 },
} as const;

export const DEFAULT_LANGGRAPH_AGENT_NODE_POSITION = {
  x: 880,
  y: 240,
} as const;

export interface DefaultLangGraphNodeData {
  label: string;
  inputChannels: LangGraphInputChannel[];
  stateChannels: LangGraphStateChannel[];
  agentDefinitions: LangGraphAgentDefinition[];
  graphSteps: LangGraphStepConfig[];
  graphEdges: LangGraphEdgeConfig[];
  memoryConfig: LangGraphMemoryConfig;
  stateNodePosition: { x: number; y: number };
  checkpointerNodePosition: { x: number; y: number };
  startNodePosition: { x: number; y: number };
  endNodePosition: { x: number; y: number };
  agentNodePosition?: { x: number; y: number };
}

export function createDefaultLangGraphNodeData(
  label = "LangGraph Agent",
): DefaultLangGraphNodeData {
  return {
    label,
    inputChannels: [...DEFAULT_LANGGRAPH_INPUT_CHANNELS],
    stateChannels: [...DEFAULT_LANGGRAPH_STATE_CHANNELS],
    agentDefinitions: [{ ...DEFAULT_LANGGRAPH_AGENT_DEFINITION }],
    graphSteps: [],
    graphEdges: [...DEFAULT_LANGGRAPH_GRAPH_EDGES],
    memoryConfig: { ...DEFAULT_LANGGRAPH_MEMORY_CONFIG },
    ...DEFAULT_LANGGRAPH_NODE_POSITIONS,
  };
}

// ─── LangGraph Checkpointer Table Definitions ──────────────────────────────────
export const LANGGRAPH_POSTGRES_TABLE_DEFINITIONS: LangGraphTableDefinition[] = [
  {
    name: "checkpoints",
    description: "LangGraph state checkpoints indexed by thread and run namespace",
    columns: [
      { name: "thread_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "checkpoint_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "parent_checkpoint_id", type: "TEXT", isNotNull: false },
      { name: "type", type: "TEXT", isNotNull: false },
      { name: "checkpoint", type: "JSON", isNotNull: true },
      { name: "metadata", type: "JSON", isNotNull: true },
      { name: "created_at", type: "TIMESTAMPTZ" },
      { name: "updated_at", type: "TIMESTAMPTZ" },
    ],
    indexes: [
      { name: "idx_checkpoints_thread_id", columns: "thread_id" },
      { name: "idx_checkpoints_thread_ns", columns: "thread_id, checkpoint_ns" },
      { name: "idx_checkpoints_parent", columns: "parent_checkpoint_id" },
    ],
  },
  {
    name: "checkpoint_blobs",
    description: "Serialized large-state blobs and message buffers",
    columns: [
      {
        name: "thread_id",
        type: "TEXT",
        isPrimaryKey: true,
        isNotNull: true,
        isForeignKey: true,
        references: { table: "checkpoints", column: "thread_id" },
      },
      { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "channel", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "version", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "type", type: "TEXT", isNotNull: true },
      { name: "blob", type: "BYTEA", isNotNull: false },
      { name: "created_at", type: "TIMESTAMPTZ" },
      { name: "updated_at", type: "TIMESTAMPTZ" },
    ],
    indexes: [
      { name: "idx_checkpoint_blobs_thread_id", columns: "thread_id" },
      { name: "idx_checkpoint_blobs_channel", columns: "channel, version" },
    ],
  },
  {
    name: "checkpoint_writes",
    description: "Pending channel writes and delta operations per graph step",
    columns: [
      { name: "thread_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      {
        name: "checkpoint_id",
        type: "TEXT",
        isPrimaryKey: true,
        isNotNull: true,
        isForeignKey: true,
        references: { table: "checkpoints", column: "checkpoint_id" },
      },
      { name: "task_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "idx", type: "INTEGER", isPrimaryKey: true, isNotNull: true },
      { name: "channel", type: "TEXT", isNotNull: true },
      { name: "type", type: "TEXT", isNotNull: false },
      { name: "blob", type: "BYTEA", isNotNull: true },
      { name: "created_at", type: "TIMESTAMPTZ" },
      { name: "updated_at", type: "TIMESTAMPTZ" },
    ],
    indexes: [
      { name: "idx_checkpoint_writes_thread_id", columns: "thread_id" },
      { name: "idx_checkpoint_writes_checkpoint_id", columns: "checkpoint_id" },
      { name: "idx_checkpoint_writes_task", columns: "task_id, idx" },
    ],
  },
  {
    name: "checkpoint_migrations",
    description: "Database migration tracker for LangGraph schema versions",
    columns: [
      { name: "v", type: "INTEGER", isPrimaryKey: true, isNotNull: true },
      { name: "created_at", type: "TIMESTAMPTZ" },
      { name: "updated_at", type: "TIMESTAMPTZ" },
    ],
    indexes: [
      { name: "idx_checkpoint_migrations_v", columns: "v", isUnique: true },
    ],
  },
];

export const LANGGRAPH_SQLITE_TABLE_DEFINITIONS: LangGraphTableDefinition[] = [
  {
    name: "checkpoints",
    description: "LangGraph SQLite state checkpoints indexed by thread and namespace",
    columns: [
      { name: "thread_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "checkpoint_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "parent_checkpoint_id", type: "TEXT", isNotNull: false },
      { name: "type", type: "TEXT", isNotNull: false },
      { name: "checkpoint", type: "BLOB", isNotNull: false },
      { name: "metadata", type: "BLOB", isNotNull: false },
      { name: "created_at", type: "TEXT" },
      { name: "updated_at", type: "TEXT" },
    ],
    indexes: [
      { name: "idx_sqlite_checkpoints_thread_id", columns: "thread_id" },
    ],
  },
  {
    name: "writes",
    description: "LangGraph SQLite task writes channel buffer",
    columns: [
      { name: "thread_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "checkpoint_ns", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      {
        name: "checkpoint_id",
        type: "TEXT",
        isPrimaryKey: true,
        isNotNull: true,
        isForeignKey: true,
        references: { table: "checkpoints", column: "checkpoint_id" },
      },
      { name: "task_id", type: "TEXT", isPrimaryKey: true, isNotNull: true },
      { name: "idx", type: "INTEGER", isPrimaryKey: true, isNotNull: true },
      { name: "channel", type: "TEXT", isNotNull: true },
      { name: "type", type: "TEXT", isNotNull: false },
      { name: "value", type: "BLOB", isNotNull: false },
      { name: "created_at", type: "TEXT" },
      { name: "updated_at", type: "TEXT" },
    ],
    indexes: [
      { name: "idx_sqlite_writes_thread_id", columns: "thread_id" },
    ],
  },
];

export const LANGGRAPH_REDIS_SCHEMA_DEFINITIONS: LangGraphRedisSchemaDefinition[] = [
  {
    name: "langgraph_checkpoints",
    description: "LangGraph state checkpoints hash map indexed by thread and run namespace",
    redisDataStructure: "hash",
    keyTemplate: "checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}",
    columns: [
      { name: "checkpoint", type: "JSON", isNotNull: true },
      { name: "metadata", type: "JSON", isNotNull: true },
      { name: "parent_checkpoint_id", type: "TEXT", isNotNull: false },
    ],
  },
  {
    name: "langgraph_checkpoint_writes",
    description: "LangGraph step writes channel buffer and tasks",
    redisDataStructure: "hash",
    keyTemplate: "writes:{thread_id}:{checkpoint_ns}:{checkpoint_id}:{task_id}",
    columns: [
      { name: "task_id", type: "TEXT", isNotNull: true },
      { name: "channel", type: "TEXT", isNotNull: true },
      { name: "blob", type: "JSON", isNotNull: true },
    ],
  },
  {
    name: "langgraph_checkpoint_blobs",
    description: "Serialized large state binary objects and buffers",
    redisDataStructure: "hash",
    keyTemplate: "blobs:{thread_id}:{checkpoint_ns}:{channel}",
    columns: [
      { name: "blob", type: "JSON", isNotNull: true },
      { name: "version", type: "TEXT", isNotNull: true },
    ],
  },
];
