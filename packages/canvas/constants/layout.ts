// ─── Auto-Layout Constants ───────────────────────────────────────────────────
export const HEAD_TARGET_HANDLES = new Set<string>([
  "llm_in",
  "tool_in",
  "middleware_in",
  "memory_in",
  "HANDLE_LLM_IN",
  "HANDLE_TOOL_IN",
  "HANDLE_MIDDLEWARE_IN",
  "HANDLE_MEMORY_IN",
]);

export const HEAD_NODE_TYPES = new Set<string>([
  "langgraph_llm",
  "langgraph_tool",
  "langgraph_middleware",
  "langgraph_memory",
  "db_ref",
  "vector_db_ref",
  "storage_operation_ref",
  "storage_ref",
  "bucket_ref",
  "storage_bucket_ref",
  "StorageBucketRefNode",
  "StorageOperationRefNode",
]);

export const TARGET_NODE_TYPES = new Set<string>([
  "langgraph_agent",
  "langgraph_node",
  "agent",
  "step",
]);
