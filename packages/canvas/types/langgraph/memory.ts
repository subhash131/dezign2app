export type LangGraphMemoryConfig = {
  checkpointer?: "memory" | "redis" | "postgres" | "convex" | string;
  checkpointerConnectionId?: string;
  threadScope?: "session" | "user" | "global";
  autoSummarize?: boolean;
  maxWindowMessages?: number;
  vectorStore?: {
    enabled?: boolean;
    provider?: "convex" | "pinecone" | "pgvector" | "qdrant";
    embeddingModel?: string;
    collection?: string;
    topK?: number;
    similarityThreshold?: number;
  };
};

export interface LangGraphMemoryDefinition {
  id?: string;
  memoryId?: string;
  name: string;
  checkpointer: string;
  threadIdKey?: string;
  threadScope?: "session" | "user" | "global";
  autoSummarize?: boolean;
  maxWindowMessages?: number;
  saveMessages?: boolean;
  position?: { x: number; y: number };
}
