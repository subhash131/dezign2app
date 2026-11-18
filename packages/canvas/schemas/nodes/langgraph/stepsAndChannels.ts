import { z } from "zod";
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_TEMPERATURE,
} from "../../../constants";
import { vectorStoreConfigSchema } from "./memoryAndAgents";

export const inputChannelSchema = z.object({
  key: z.string(),
  type: z
    .enum([
      "string",
      "messages",
      "json",
      "number",
      "boolean",
      "object",
      "array",
    ])
    .default("string"),
  required: z.boolean().default(true),
  description: z.string().optional(),
  defaultValue: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.unknown()),
      z.record(z.unknown()),
    ])
    .optional(),
  stateChannelKey: z.string().optional(),
  transition: z
    .enum([
      "direct",
      "as_human_message",
      "append_to_list",
      "merge_object",
      "parse_json",
      "transformer",
    ])
    .optional(),
  transformerRef: z.string().optional(),
});
export type InputChannel = z.infer<typeof inputChannelSchema>;

export const outputPortSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});
export type OutputPort = z.infer<typeof outputPortSchema>;

export const graphStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    "llm_call",
    "tool_node",
    "evaluator",
    "summarizer",
    "custom_code",
    "transformer",
    "transform",
    "human_gate",
    "interrupt",
    "vector_search",
    "router",
  ]),
  modelConfig: z
    .object({
      provider: z.string().optional().default(DEFAULT_LLM_PROVIDER),
      model: z.string().default(DEFAULT_LLM_MODEL),
      temperature: z.number().default(DEFAULT_LLM_TEMPERATURE),
      maxTokens: z.number().default(4000),
      systemPrompt: z.string().optional(),
      baseUrl: z.string().optional(),
      url: z.string().optional(),
      method: z.string().optional(),
      headersJson: z.string().optional(),
      bodyJson: z.string().optional(),
      apiKeyHeader: z.string().optional(),
      customLlmNodeId: z.string().optional(),
    })
    .optional(),
  humanGateConfig: z
    .object({
      approvalPrompt: z.string(),
      timeoutMs: z.number().optional(),
      requiredRole: z.string().optional(),
    })
    .optional(),
  interruptConfig: z
    .object({
      callbackKey: z.string(),
      expectedPayloadSchema: z.record(z.unknown()).optional(),
      timeoutMs: z.number().default(86400000),
    })
    .optional(),
  vectorSearchConfig: vectorStoreConfigSchema.optional(),
  customCode: z
    .object({
      body: z.string(),
      timeoutMs: z.number().default(1000),
      memoryLimitMb: z.number().default(128),
    })
    .optional(),
  routerConfig: z
    .object({
      branches: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          field: z.string(),
          operator: z.enum([
            "eq",
            "neq",
            "gt",
            "gte",
            "lt",
            "lte",
            "contains",
            "is_not_null",
            "has_tool_calls",
            "expression",
          ]),
          value: z.string().optional(),
          isDefault: z.boolean().optional(),
          targetId: z.string().optional(),
        }),
      ),
    })
    .optional(),
  tools: z.array(z.string()).default([]),
  retryPolicy: z
    .object({
      maxAttempts: z.number().default(3),
      backoffFactor: z.number().default(2),
    })
    .optional(),
  stateUpdates: z
    .array(
      z.object({
        channelKey: z.string(),
        value: z.string().optional(),
        mode: z.enum(["set", "append", "expression"]).optional(),
      }),
    )
    .optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
}).passthrough();
export type GraphStep = z.infer<typeof graphStepSchema>;

export const outputChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["sse", "websocket", "event", "webhook", "rest"]).default("sse"),
  topicOrEventName: z.string().optional(),
  targetStateChannel: z.string().optional(),
  description: z.string().optional(),
  streamContentMode: z
    .enum(["ai_node_tokens", "structured_output", "step_output", "full_state"])
    .optional(),
  sourceStepId: z.string().optional(),
  boundRouteIds: z.array(z.string()).optional(),
  schemaJson: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type OutputChannel = z.infer<typeof outputChannelSchema>;
