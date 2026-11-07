import { z } from "zod";
import { baseNodeDataSchema } from "../base";
import { graphEdgeSchema } from "./conditionsAndEdges";
import {
  toolDefinitionSchema,
  middlewareDefinitionSchema,
} from "./toolsAndMiddleware";
import {
  memoryDefinitionSchema,
  agentDefinitionSchema,
  vectorStoreConfigSchema,
} from "./memoryAndAgents";
import {
  inputChannelSchema,
  outputChannelSchema,
  outputPortSchema,
  graphStepSchema,
} from "./stepsAndChannels";
import { validateLangGraphTopology } from "./topologyValidator";

export const langgraphDataSchema = baseNodeDataSchema
  .extend({
    version: z.number().default(2),
    recursionLimit: z.number().default(25),
    stepTimeoutMs: z.number().default(30000),

    inputChannels: z.array(inputChannelSchema).default([]),
    outputChannels: z.array(outputChannelSchema).optional().default([]),

    stateChannels: z
      .array(
        z.object({
          key: z.string(),
          type: z.enum([
            "messages",
            "string",
            "number",
            "boolean",
            "array",
            "object",
          ]),
          reducer: z.string(),
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
          customReducerCode: z.string().optional(),
          customTypeId: z.string().optional(),
          customTypeName: z.string().optional(),
          customTypeSchema: z.record(z.unknown()).optional(),
        }),
      )
      .default([
        {
          key: "messages",
          type: "messages",
          reducer: "add_messages",
          defaultValue: [],
        },
        {
          key: "summary",
          type: "string",
          reducer: "replace",
          defaultValue: "",
        },
        { key: "intent", type: "string", reducer: "replace", defaultValue: "" },
      ]),

    outputPorts: z.array(outputPortSchema).default([
      { id: "tool_call", label: "Tool Output Port" },
      { id: "human_gate", label: "Human Approval Port" },
      { id: "completed", label: "Completed Output Port" },
      { id: "error", label: "Error Output Port" },
    ]),

    toolDefinitions: z.array(toolDefinitionSchema).default([]),
    middlewareDefinitions: z.array(middlewareDefinitionSchema).default([]),
    agentDefinitions: z.array(agentDefinitionSchema).default([]),
    memoryDefinitions: z.array(memoryDefinitionSchema).default([]),
    tools: z.array(z.union([z.string(), toolDefinitionSchema])).default([]),
    graphSteps: z.array(graphStepSchema).default([]),
    graphEdges: z.array(graphEdgeSchema).default([]),
    memoryConfig: z
      .object({
        checkpointer: z.string().default("memory"),
        checkpointerConnectionId: z.string().optional(),
        checkpointerNodeId: z.string().optional(),
        checkpointerEnvVar: z.string().optional(),
        connectionString: z.string().optional(),
        threadScope: z.enum(["session", "user", "global"]).default("session"),
        autoSummarize: z.boolean().default(true),
        maxWindowMessages: z.number().default(10),
        vectorStore: vectorStoreConfigSchema.optional(),
      })
      .default({}),
    customLlmNodes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          provider: z.string().optional(),
          url: z.string().optional(),
          baseUrl: z.string().optional(),
          method: z.string().optional(),
          headersJson: z.string().optional(),
          bodyJson: z.string().optional(),
          model: z.string().optional(),
          apiKey: z.string().optional(),
          apiKeyHeader: z.string().optional(),
          temperature: z.number().optional(),
          maxTokens: z.number().optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .optional()
      .default([]),
    customLlmRefNodes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          llmRef: z.string().optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .optional()
      .default([]),
    customToolRefNodes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          toolRef: z.string().optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .optional()
      .default([]),
    customMiddlewareRefNodes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          middlewareRef: z.string().optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .optional()
      .default([]),
    customMemoryRefNodes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          memoryRef: z.string().optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .optional()
      .default([]),
    customAgentRefNodes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          agentRef: z.string().optional(),
          nodeRef: z.string().optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .optional()
      .default([]),
    customNodeRefNodes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          nodeRef: z.string().optional(),
          agentRef: z.string().optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .optional()
      .default([]),
    customReducers: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          code: z.string(),
          description: z.string().optional(),
        }),
      )
      .optional()
      .default([]),
    customStateReducerRefNodes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          reducerRef: z.string().optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .optional()
      .default([]),
    customTransformerNodes: z.array(z.any()).optional().default([]),
    customTransformerRefNodes: z.array(z.any()).optional().default([]),
    transformerDefinitions: z.array(z.any()).optional().default([]),
    customTypesNodes: z.array(z.any()).optional().default([]),
    customTypesRefNodes: z.array(z.any()).optional().default([]),
    typesDefinitions: z.array(z.any()).optional().default([]),
    startNodePosition: z.object({ x: z.number(), y: z.number() }).optional(),
    stateNodePosition: z.object({ x: z.number(), y: z.number() }).optional(),
    checkpointerNodePosition: z
      .object({ x: z.number(), y: z.number() })
      .optional(),
    endNodePosition: z.object({ x: z.number(), y: z.number() }).optional(),
    agentNodePosition: z.object({ x: z.number(), y: z.number() }).optional(),
    endNodes: z
      .array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          position: z.object({ x: z.number(), y: z.number() }).optional(),
        }),
      )
      .optional()
      .default([]),
  })
  .superRefine(validateLangGraphTopology);

export type LangGraphNodeData = z.infer<typeof langgraphDataSchema>;

export const langgraphStepDataSchema = baseNodeDataSchema.extend({
  stepId: z.string().optional(),
  stepType: z.string().optional(),
  modelConfig: z.record(z.unknown()).optional(),
  humanGateConfig: z.record(z.unknown()).optional(),
  interruptConfig: z.record(z.unknown()).optional(),
  customCode: z.record(z.unknown()).optional(),
});
