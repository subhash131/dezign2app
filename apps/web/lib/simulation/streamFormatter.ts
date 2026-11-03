import type {
  LangGraphAgentStreamConfig,
  LangGraphStreamEnvelopeConfig,
  LangGraphStreamTransformerMode,
} from "@workspace/canvas";

export interface StreamBatchItem {
  index: number;
  delta: string;
  content: string;
  timestamp: string;
  raw?: unknown;
  formatted?: unknown;
}

/**
 * Transforms a raw LLM token stream chunk into the structured event envelope
 * defined by the node's streamConfig. Matches the live inspector response preview.
 */
export function formatStreamingBatch(args: {
  batch: {
    index: number;
    delta: string;
    content: string;
    timestamp: string;
    raw?: unknown;
  };
  nodeName: string;
  runId: string;
  streamConfig?: LangGraphAgentStreamConfig;
}): unknown {
  const { batch, nodeName, runId, streamConfig } = args;

  const envelope: LangGraphStreamEnvelopeConfig = {
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
    ...streamConfig?.envelope,
  };

  const rawUsage = (batch.raw as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })?.usage;
  const promptTokens = rawUsage?.prompt_tokens ?? Math.max(1, Math.round((batch.content?.length || 1) / 4));
  const completionTokens = rawUsage?.completion_tokens ?? (batch.index + 1);
  const totalTokens = rawUsage?.total_tokens ?? (promptTokens + completionTokens);
  const tokenUsage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };

  const mode: LangGraphStreamTransformerMode =
    streamConfig?.transformer?.mode || "standard_sse";

  if (mode === "ai_sdk") {
    // Vercel AI SDK text part protocol: 0:"<delta>"
    return `0:${JSON.stringify(batch.delta)}`;
  }

  if (mode === "openai_chunk") {
    const chunkObj: Record<string, unknown> = {
      object: "chat.completion.chunk",
      choices: [
        {
          index: batch.index,
          delta: {
            content: envelope.includeDelta ? batch.delta : undefined,
          },
          finish_reason: null,
        },
      ],
    };
    if (envelope.includeRunId) {
      chunkObj.id = runId;
    }
    if (envelope.includeTimestamp) {
      chunkObj.created = Math.floor(new Date(batch.timestamp).getTime() / 1000);
    }
    if (envelope.includeUsage !== false) {
      chunkObj.usage = tokenUsage;
    }
    return chunkObj;
  }

  if (mode === "minimal") {
    const minimalObj: Record<string, unknown> = {
      delta: batch.delta,
    };
    if (envelope.includeTimestamp) {
      minimalObj.timestamp = batch.timestamp;
    }
    return minimalObj;
  }

  // Standard SSE / Full Trace / Custom JSON envelope
  const base: Record<string, unknown> = {};

  if (envelope.includeEvent) {
    base.event = "on_chat_model_stream";
  }

  if (envelope.includeAgent) {
    base.agent = nodeName;
  }

  if (envelope.includeRunId) {
    base.run_id = runId;
  }

  if (envelope.includeTimestamp) {
    base.timestamp = batch.timestamp;
  }

  const payload: Record<string, unknown> = {};
  if (envelope.includeDelta) {
    payload.delta = batch.delta;
  }
  if (envelope.includeContent) {
    payload.content = batch.content;
  }
  if (envelope.includeUsage !== false) {
    payload.usage = tokenUsage;
  }

  if (envelope.flattenPayload) {
    Object.assign(base, payload);
  } else if (Object.keys(payload).length > 0) {
    base.data = payload;
  }

  return base;
}
