import { describe, it, expect } from "vitest";
import { formatStreamingBatch } from "../streamFormatter";

describe("formatStreamingBatch", () => {
  it("formats standard SSE envelope matching live inspector preview", () => {
    const formatted = formatStreamingBatch({
      batch: {
        index: 0,
        delta: " Mahatma",
        content: "Mahatma",
        timestamp: "2026-10-02T00:15:30.124Z",
      },
      nodeName: "Node",
      runId: "run_7c9e12f0",
      streamConfig: {
        enabled: true,
        version: "v3",
        transformer: { mode: "standard_sse" },
        envelope: {
          includeEvent: true,
          includeAgent: true,
          includeRunId: true,
          includeTimestamp: true,
          includeDelta: true,
          includeContent: true,
          flattenPayload: false,
        },
      },
    }) as Record<string, unknown>;

    expect(formatted).toEqual({
      event: "on_chat_model_stream",
      agent: "Node",
      run_id: "run_7c9e12f0",
      timestamp: "2026-10-02T00:15:30.124Z",
      data: {
        delta: " Mahatma",
        content: "Mahatma",
        usage: {
          prompt_tokens: 2,
          completion_tokens: 1,
          total_tokens: 3,
        },
      },
    });
  });

  it("omits usage when includeUsage is false", () => {
    const formatted = formatStreamingBatch({
      batch: {
        index: 0,
        delta: " Mahatma",
        content: "Mahatma",
        timestamp: "2026-10-02T00:15:30.124Z",
      },
      nodeName: "Node",
      runId: "run_7c9e12f0",
      streamConfig: {
        enabled: true,
        envelope: {
          includeEvent: true,
          includeUsage: false,
        },
      },
    }) as Record<string, unknown>;

    expect((formatted.data as Record<string, unknown>).usage).toBeUndefined();
  });

  it("flattens payload when flattenPayload is enabled", () => {
    const formatted = formatStreamingBatch({
      batch: {
        index: 0,
        delta: " Gandhi",
        content: "Mahatma Gandhi",
        timestamp: "2026-10-02T00:15:31.000Z",
      },
      nodeName: "Node",
      runId: "run_123",
      streamConfig: {
        enabled: true,
        transformer: { mode: "standard_sse" },
        envelope: {
          includeEvent: true,
          includeAgent: true,
          includeDelta: true,
          includeContent: true,
          flattenPayload: true,
        },
      },
    }) as Record<string, unknown>;

    expect(formatted.event).toBe("on_chat_model_stream");
    expect(formatted.agent).toBe("Node");
    expect(formatted.delta).toBe(" Gandhi");
    expect(formatted.content).toBe("Mahatma Gandhi");
    expect(formatted.data).toBeUndefined();
    expect(formatted.usage).toEqual({
      prompt_tokens: 4,
      completion_tokens: 1,
      total_tokens: 5,
    });
  });

  it("formats for Vercel AI SDK text part protocol", () => {
    const formatted = formatStreamingBatch({
      batch: {
        index: 0,
        delta: " Hello",
        content: "Hello",
        timestamp: "2026-10-02T00:15:30.000Z",
      },
      nodeName: "AgentNode",
      runId: "run_123",
      streamConfig: {
        transformer: { mode: "ai_sdk" },
      },
    });

    expect(formatted).toBe('0:" Hello"');
  });

  it("formats for OpenAI Delta chunk format", () => {
    const formatted = formatStreamingBatch({
      batch: {
        index: 0,
        delta: " Hello",
        content: "Hello",
        timestamp: "2026-10-02T00:15:30.000Z",
      },
      nodeName: "AgentNode",
      runId: "chatcmpl_abc123",
      streamConfig: {
        transformer: { mode: "openai_chunk" },
      },
    }) as Record<string, unknown>;

    expect(formatted.object).toBe("chat.completion.chunk");
    expect(formatted.id).toBe("chatcmpl_abc123");
    expect(formatted.choices).toEqual([
      {
        index: 0,
        delta: { content: " Hello" },
        finish_reason: null,
      },
    ]);
  });
});
