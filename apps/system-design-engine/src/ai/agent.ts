import { ChatGroq } from "@langchain/groq";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { StateGraph, MessagesAnnotation, Annotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { ConvexHttpClient } from "convex/browser";

import { BackendNodeType, BackendEdgeType } from "@workspace/canvas";

const MAX_TOOL_CALLS = 6;

// ----------------------------------------------------------------------------
// GRAPH STATE
// ----------------------------------------------------------------------------

export const GraphAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  projectId: Annotation<string>(),
  convexUrl: Annotation<string>(),
  token: Annotation<string>(),
  viewportCenter: Annotation<{ x: number; y: number }>(),
  intent: Annotation<string>(),
  canvasStateContext: Annotation<string>(),
  toolCallCount: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),
  requirements: Annotation<{
    functional: string[];
    nonFunctional: string[];
    assumptions: string[];
    status: "pending" | "confirmed";
  }>({
    reducer: (_, y) => y, // last-write-wins — this is a snapshot, not something to accumulate
    default: () => ({ functional: [], nonFunctional: [], assumptions: [], status: "pending" }),
  }),
});

const requirementsSchema = z.object({
  functional: z.array(z.string()),
  nonFunctional: z.array(z.string()),
  assumptions: z.array(z.string()),
});

type RequirementsState = typeof GraphAnnotation.State["requirements"];

function getConvexClient(state: typeof GraphAnnotation.State) {
  if (!state.convexUrl) throw new Error("Missing convexUrl in state");
  const client = new ConvexHttpClient(state.convexUrl);
  if (state.token) {
    client.setAuth(state.token);
  }
  return client;
}

// ----------------------------------------------------------------------------
// PER-NODE-TYPE DATA SCHEMAS
// Shared between add_node (discriminated union) and update_node (runtime lookup)
// ----------------------------------------------------------------------------

const resourceItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
});

const kafkaDataSchema = z
  .object({
    topics: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string(),
          schema: z.string().optional(),
          version: z.string().optional(),
        })
      )
      .optional(),
    kafkaBroker: z
      .object({
        partitions: z.number().optional(),
        replication: z.number().optional(),
        batchSize: z.number().optional(),
        compression: z.string().optional(),
        ttl: z.string().optional(),
      })
      .optional(),
    delivery: z.string().optional(),
    ordering: z.string().optional(),
    retention: z.string().optional(),
  })
  .strict();

const sqsDataSchema = z
  .object({
    queues: z.array(resourceItemSchema).optional(),
    sqsBroker: z
      .object({
        visibilityTimeout: z.number().optional(),
        delay: z.number().optional(),
        fifo: z.boolean().optional(),
      })
      .optional(),
    delivery: z.string().optional(),
    failureHandling: z.string().optional(),
  })
  .strict();

const redisPubSubDataSchema = z
  .object({
    channels: z.array(resourceItemSchema).optional(),
    redisPubSubBroker: z.object({}).passthrough().optional(),
    delivery: z.string().optional(),
  })
  .strict();

const redisStreamsDataSchema = z
  .object({
    streams: z.array(resourceItemSchema).optional(),
    redisBroker: z
      .object({
        consumerGroup: z.string().optional(),
      })
      .optional(),
    delivery: z.string().optional(),
    ordering: z.string().optional(),
    retention: z.string().optional(),
  })
  .strict();

const entityDataSchema = z
  .object({
    columns: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        isPrimaryKey: z.boolean().optional(),
        isForeignKey: z.boolean().optional(),
        isNotNull: z.boolean().optional(),
        isUnique: z.boolean().optional(),
      })
    ),
  })
  .strict();

// service / database / webClient / external / group have no special config today.
const simpleDataSchema = z
  .object({
    description: z.string().optional(),
  })
  .strict();

// Lookup used by update_node to validate `changes` against the node's existing type
const nodeDataSchemas: Record<string, z.ZodTypeAny> = {
  kafka: kafkaDataSchema,
  sqs: sqsDataSchema,
  "redis-pubsub": redisPubSubDataSchema,
  "redis-streams": redisStreamsDataSchema,
  entity: entityDataSchema,
  service: simpleDataSchema,
  database: simpleDataSchema,
  webClient: simpleDataSchema,
  external: simpleDataSchema,
  group: simpleDataSchema,
};

function assignResourceIds(data: Record<string, any>) {
  const resourceKeys = ["topics", "queues", "channels", "streams"];
  for (const key of resourceKeys) {
    if (Array.isArray(data[key])) {
      data[key] = data[key].map((item: any, i: number) => ({
        ...item,
        id: item.id || `res-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
      }));
    }
  }
  return data;
}

// ----------------------------------------------------------------------------
// CANVAS TOOLS (Direct Convex Mutations)
// ----------------------------------------------------------------------------

const addNodeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("service"), label: z.string(), data: simpleDataSchema.optional() }),
  z.object({ type: z.literal("database"), label: z.string(), data: simpleDataSchema.optional() }),
  z.object({ type: z.literal("webClient"), label: z.string(), data: simpleDataSchema.optional() }),
  z.object({ type: z.literal("external"), label: z.string(), data: simpleDataSchema.optional() }),
  z.object({ type: z.literal("group"), label: z.string(), data: simpleDataSchema.optional() }),
  z.object({ type: z.literal("entity"), label: z.string(), data: entityDataSchema }),
  z.object({ type: z.literal("kafka"), label: z.string(), data: kafkaDataSchema.optional() }),
  z.object({ type: z.literal("sqs"), label: z.string(), data: sqsDataSchema.optional() }),
  z.object({ type: z.literal("redis-pubsub"), label: z.string(), data: redisPubSubDataSchema.optional() }),
  z.object({ type: z.literal("redis-streams"), label: z.string(), data: redisStreamsDataSchema.optional() }),
]);

const addNodeTool = tool(
  async (input, config) => {
    const { type, label, data } = input;
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    const nodeId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const offsetX = Math.floor(Math.random() * 600) - 300;
    const offsetY = Math.floor(Math.random() * 600) - 300;
    const position = state.viewportCenter
      ? { x: state.viewportCenter.x + offsetX, y: state.viewportCenter.y + offsetY }
      : { x: 100 + offsetX, y: 100 + offsetY };

    const fractionalIndex = "a0" + Date.now() + Math.random().toString(36).slice(2, 6);

    const processedData = assignResourceIds({ label, graphPosition: position, ...(data ?? {}) });

    try {
      await convex.mutation("canvas:upsertBackendNode" as any, {
        projectId: state.projectId as string,
        nodeId,
        type,
        position,
        data: processedData,
        fractionalIndex,
      });
      return `Added node ${label} of type ${type} with ID ${nodeId}`;
    } catch (e: any) {
      return `Failed to add node: ${e.message}`;
    }
  },
  {
    name: "add_node",
    description: `Add a node to the backend canvas. Node types:
- 'service': A backend API / microservice
- 'database': A database reference node
- 'sqs': Amazon SQS broker (data.queues, data.sqsBroker)
- 'redis-pubsub': Redis Pub/Sub broker (data.channels, data.redisPubSubBroker)
- 'kafka': Apache Kafka broker (data.topics, data.kafkaBroker)
- 'redis-streams': Redis Streams broker (data.streams, data.redisBroker)
- 'entity': A database table/schema entity (data.columns is required)
- 'webClient': A frontend client or page
- 'external': An external third-party API
- 'group': A logical grouping node

Each type only accepts its own data fields. Passing fields from another node type (e.g. sqsBroker on a kafka node) will be rejected.`,
    schema: addNodeSchema,
  }
);

const updateNodeTool = tool(
  async ({ id, changes }, config) => {
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    try {
      const elements: any = await convex.query("canvas:getBackendElements" as any, {
        projectId: state.projectId as string,
      });
      const node = elements.nodes.find((n: any) => n.nodeId === id);
      if (!node) return `Error: Node ${id} not found`;

      const schema = nodeDataSchemas[node.type];
      if (!schema) return `Error: Unknown node type '${node.type}' for node ${id}`;

      // Validate only the fields being changed, merged onto existing data,
      // so we catch cross-type field leakage at update time too.
      const merged = { ...node.data, ...changes };
      const { label, graphPosition, ...dataToValidate } = merged;
      const parsed = schema.safeParse(dataToValidate);
      if (!parsed.success) {
        return `Failed to update node: invalid fields for type '${node.type}': ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`;
      }

      const processedChanges = assignResourceIds({ ...changes });

      await convex.mutation("canvas:upsertBackendNode" as any, {
        projectId: state.projectId as string,
        nodeId: id,
        type: node.type,
        position: node.position,
        data: { ...node.data, ...processedChanges },
        fractionalIndex: node.fractionalIndex,
      });
      return `Updated node ${id}`;
    } catch (e: any) {
      return `Failed to update node: ${e.message}`;
    }
  },
  {
    name: "update_node",
    description:
      "Update an existing node on the backend canvas. Only specify the fields you want to change. Changes are validated against the node's existing type — fields belonging to other node types will be rejected.",
    schema: z.object({
      id: z.string(),
      changes: z.record(z.any()).describe("Partial data fields to change, matching the node's existing type schema."),
    }),
  }
);

const deleteNodeTool = tool(
  async ({ id }, config) => {
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    try {
      await convex.mutation("canvas:removeBackendNode" as any, {
        projectId: state.projectId as string,
        nodeId: id,
      });
      return `Deleted node ${id}`;
    } catch (e: any) {
      return `Failed to delete node: ${e.message}`;
    }
  },
  {
    name: "delete_node",
    description: "Delete a node from the backend canvas.",
    schema: z.object({ id: z.string() }),
  }
);

const addEdgeTool = tool(
  async ({ source, target, type, data, sourceHandle, targetHandle }, config) => {
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    try {
      const elements: any = await convex.query("canvas:getBackendElements" as any, {
        projectId: state.projectId as string,
      });
      const sourceExists = elements.nodes.some((n: any) => n.nodeId === source);
      const targetExists = elements.nodes.some((n: any) => n.nodeId === target);
      if (!sourceExists) return `Failed to add edge: source node ${source} does not exist`;
      if (!targetExists) return `Failed to add edge: target node ${target} does not exist`;

      const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const fractionalIndex = "a0" + Date.now() + Math.random().toString(36).slice(2, 6);

      await convex.mutation("canvas:upsertBackendEdge" as any, {
        projectId: state.projectId as string,
        edgeId,
        source,
        target,
        type,
        sourceHandle: sourceHandle || undefined,
        targetHandle: targetHandle || undefined,
        data: data || {},
        fractionalIndex,
      });
      return `Added edge from ${source} to ${target}`;
    } catch (e: any) {
      return `Failed to add edge: ${e.message}`;
    }
  },
  {
    name: "add_edge",
    description: "Connect two nodes on the backend canvas. Both nodes must already exist.",
    schema: z.object({
      source: z.string().describe("Source node ID"),
      target: z.string().describe("Target node ID"),
      type: z.enum(["connection", "foreign-key", "message"]),
      sourceHandle: z.string().optional(),
      targetHandle: z.string().optional(),
      data: z.any().optional(),
    }),
  }
);

const deleteEdgeTool = tool(
  async ({ id }, config) => {
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    try {
      await convex.mutation("canvas:removeBackendEdge" as any, {
        projectId: state.projectId as string,
        edgeId: id,
      });
      return `Deleted edge ${id}`;
    } catch (e: any) {
      return `Failed to delete edge: ${e.message}`;
    }
  },
  {
    name: "delete_edge",
    description: "Delete an edge from the backend canvas.",
    schema: z.object({ id: z.string() }),
  }
);

const tools = [addNodeTool, updateNodeTool, deleteNodeTool, addEdgeTool, deleteEdgeTool];

// ----------------------------------------------------------------------------
// AGENT NODES
// ----------------------------------------------------------------------------

export function createGraph() {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_LLM_MODEL;
  if (!apiKey || !model) {
    throw new Error("Missing environment variables: GROQ_API_KEY or GROQ_LLM_MODEL");
  }

  const llm = new ChatGroq({ apiKey, model, temperature: 0 });
  const modelWithTools = llm.bindTools(tools);

  // Custom tool node: injects state into tool config and tracks how many
  // tool calls have been made this turn (used to cap the retry loop).
  const customToolNode = async (state: typeof GraphAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (
      !lastMessage ||
      !("tool_calls" in lastMessage) ||
      !Array.isArray((lastMessage as any).tool_calls) ||
      (lastMessage as any).tool_calls.length === 0
    ) {
      return { messages: [] };
    }

    const numCalls = (lastMessage as any).tool_calls.length;
    const toolNode = new ToolNode(tools);
    const result = await toolNode.invoke(
      { messages: [lastMessage] },
      { configurable: { state } }
    );
    return { ...result, toolCallCount: numCalls };
  };

  // Node: Intent Identifier — writes to state.intent, never touches message history.
  // Also detects whether the latest message introduces a NEW requirement on top of
  // an already-confirmed baseline. If so, it reopens the requirements gate
  // (status -> "pending") so canvasAgent asks clarifying questions about just the
  // addition before touching the canvas, instead of acting on it immediately.
  const intentIdentifier = async (state: typeof GraphAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || lastMessage.type !== "human") return {};

    const conversationContext = state.messages
      .slice(-6)
      .map((m) => `${m.getType().toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
      .join("\n\n");

    const existing = state.requirements ?? {
      functional: [],
      nonFunctional: [],
      assumptions: [],
      status: "pending" as const,
    };

    const intentPrompt = new SystemMessage(
      `Analyze the user's latest message in the context of the recent conversation and determine the intent.
Available Intents:
- CREATE_SYSTEM: The user wants to build a new system architecture, add nodes, or create a new design from scratch. ALSO use this if the user is providing system requirements for a design.
- EDIT_SYSTEM: The user wants to modify the existing system (update nodes, delete nodes, connect nodes, auto-layout).
- CHAT: The user is just asking a question, making a general comment, or having a conversation that does NOT require modifying the canvas.

Also determine "affectsRequirements": true only if the message introduces a NEW capability,
feature, scale target, or constraint that is NOT already covered by the confirmed requirements
below. Cosmetic/structural canvas edits (renames, repositioning, styling, "make it prettier")
are always false. Answers to clarifying questions the assistant already asked are also false
(that flow is handled separately, not as a "new" requirement).

Confirmed Requirements So Far:
Functional: ${existing.functional.join("; ") || "none yet"}
Non-Functional: ${existing.nonFunctional.join("; ") || "none yet"}

Return ONLY JSON, no prose, no markdown fences:
{ "intent": "CREATE_SYSTEM" | "EDIT_SYSTEM" | "CHAT", "affectsRequirements": boolean }

Recent Conversation Context:
${conversationContext}`
    );

    const response = await llm.invoke([intentPrompt]);

    let intent = "CHAT";
    let affectsRequirements = false;
    try {
      const cleaned = response.content.toString().replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      intent = parsed.intent ?? "CHAT";
      affectsRequirements = Boolean(parsed.affectsRequirements);
    } catch {
      // Fallback: treat the raw response as the intent string so a formatting slip
      // doesn't break routing entirely.
      intent = response.content.toString().trim();
    }

    const update: Partial<typeof GraphAnnotation.State> = { intent };

    // Only reopen the gate if we currently have a confirmed baseline — if we're
    // already mid-clarification (status "pending"), leave it alone; that's handled
    // by the canvasAgent -> syncRequirements flow below.
    if (affectsRequirements && existing.status === "confirmed") {
      update.requirements = { ...existing, status: "pending" };
    }

    return update;
  };

  // Node: Chat Agent (No Tools)
  const chatAgent = async (state: typeof GraphAnnotation.State) => {
    const systemMsg = new SystemMessage(systemPromptTemplate(state.canvasStateContext ?? "", state.requirements));
    const response = await llm.invoke([systemMsg, ...state.messages]);
    return { messages: [response] };
  };

  // Node: System Creator / Editor (With Tools)
  const canvasAgent = async (state: typeof GraphAnnotation.State) => {
    const systemMsg = new SystemMessage(systemPromptTemplate(state.canvasStateContext ?? "", state.requirements));
    const response = await modelWithTools.invoke([systemMsg, ...state.messages]);
    return { messages: [response] };
  };

  // Node: Reflect — reviews the outcome of tool calls and either retries
  // (emits new tool_calls) or wraps up with a summary.
  const reflectAgent = async (state: typeof GraphAnnotation.State) => {
    const recentToolMsgs = state.messages.slice(-10).filter((m) => m.getType() === "tool");
    const hasFailure = recentToolMsgs.some(
      (m) => typeof m.content === "string" && m.content.startsWith("Failed to")
    );

    const reflectionPrompt = new SystemMessage(
      hasFailure
        ? `Some of your last tool calls failed. Review the tool error messages below, correct the parameters, and retry ONLY the failed operations using your tools. If you cannot fix it, explain briefly and stop.\n\nRecent tool results:\n${recentToolMsgs
            .map((m) => m.content)
            .join("\n")}`
        : `Review the tool results below against the user's original request. If everything needed has been done, respond with a brief confirmation summary and do NOT call any tools. If something is still missing, call the appropriate tool(s) to finish it.\n\nRecent tool results:\n${recentToolMsgs
            .map((m) => m.content)
            .join("\n")}`
    );

    const response = await modelWithTools.invoke([...state.messages, reflectionPrompt]);
    return { messages: [response] };
  };

  // Helper: ask the LLM for requirements JSON, retrying once on malformed output
  // before giving up (never throws — caller decides the fallback).
  const parseRequirementsWithRetry = async (prompt: string, maxAttempts = 2) => {
    let lastError = "";
    for (let i = 0; i < maxAttempts; i++) {
      const suffix = lastError
        ? `\n\nYour previous output was invalid: ${lastError}. Return valid JSON only, no prose, no markdown fences.`
        : "";
      const response = await llm.invoke([new SystemMessage(prompt + suffix)]);
      try {
        const cleaned = response.content.toString().replace(/```json|```/g, "").trim();
        return requirementsSchema.parse(JSON.parse(cleaned));
      } catch (e: any) {
        lastError = e.message;
      }
    }
    return null;
  };

  // Node: syncRequirements — runs once canvasAgent has decided to actually act
  // (emitted tool_calls) while requirements are not yet "confirmed". Covers both
  // the first-ever build (existing requirements empty) and a later addition
  // (existing requirements non-empty, just answered clarifying questions about
  // the new piece) with the same merge-style prompt, so nothing already
  // confirmed gets silently dropped.
  const syncRequirements = async (state: typeof GraphAnnotation.State) => {
    const existing = state.requirements ?? {
      functional: [],
      nonFunctional: [],
      assumptions: [],
      status: "pending" as const,
    };

    const conversation = state.messages
      .slice(-12)
      .map((m) => `${m.getType()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
      .join("\n");

    const prompt = `Existing confirmed requirements (may be empty on a first-time build):
${JSON.stringify({
  functional: existing.functional,
  nonFunctional: existing.nonFunctional,
  assumptions: existing.assumptions,
})}

Recent conversation (may include a clarifying Q&A about a new addition):
${conversation}

Return the FULL updated requirements as JSON only:
{ "functional": string[], "nonFunctional": string[], "assumptions": string[] }
Keep everything from the existing requirements that is still valid — do not drop items the
user didn't contradict. Add whatever new functional/non-functional needs or assumptions the
user just confirmed. Only remove or modify an item if the user explicitly contradicted it.`;

    const parsed = await parseRequirementsWithRetry(prompt);

    // If parsing fails, fall back to the existing requirements rather than
    // blocking: canvasAgent already queued legitimate tool_calls this turn, and
    // leaving them unanswered would orphan an assistant message with tool_calls
    // and no tool results on the next request.
    const requirements = parsed
      ? { ...parsed, status: "confirmed" as const }
      : { ...existing, status: "confirmed" as const };

    if (state.projectId && state.convexUrl) {
      try {
        const convex = getConvexClient(state);
        await convex.mutation("requirements:upsert" as any, {
          projectId: state.projectId,
          ...requirements,
        });
      } catch {
        // Non-fatal: this turn's in-memory state is still correct;
        // a reload later will just be stale until the next successful write.
      }
    }

    return { requirements };
  };


  const routeIntent = (state: typeof GraphAnnotation.State) => {
    if (state.intent === "CREATE_SYSTEM" || state.intent === "EDIT_SYSTEM") {
      return "canvasAgent";
    }
    return "chatAgent";
  };

  // Router: after canvasAgent's first pass
  const shouldContinue = (state: typeof GraphAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const hasToolCalls =
      lastMessage &&
      "tool_calls" in lastMessage &&
      Array.isArray((lastMessage as any).tool_calls) &&
      (lastMessage as any).tool_calls.length > 0;

    if (!hasToolCalls) return "__end__";
    // canvasAgent decided to act while requirements aren't confirmed — either the
    // very first build, or the user just answered clarifying questions about a
    // new addition. Sync/merge requirements before letting the tools run.
    if (state.requirements?.status !== "confirmed") return "syncRequirements";
    return "tools";
  };

  // Router: after tools run, always go reflect (unless capped)
  const afterTools = (state: typeof GraphAnnotation.State) => {
    if ((state.toolCallCount ?? 0) >= MAX_TOOL_CALLS) {
      return "capReached";
    }
    return "reflectAgent";
  };

  // Router: after reflectAgent decides whether to retry or stop
  const shouldContinueReflect = (state: typeof GraphAnnotation.State) => {
    if ((state.toolCallCount ?? 0) >= MAX_TOOL_CALLS) {
      return "capReached";
    }
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && "tool_calls" in lastMessage && Array.isArray((lastMessage as any).tool_calls) && (lastMessage as any).tool_calls.length > 0) {
      return "tools";
    }
    return "__end__";
  };

  const capReached = async (_state: typeof GraphAnnotation.State) => {
    return {
      messages: [
        new AIMessage(
          "I hit the retry limit while updating the canvas. Some changes may not have applied — please check the canvas or try rephrasing your request."
        ),
      ],
    };
  };

  const workflow = new StateGraph(GraphAnnotation)
    .addNode("intentIdentifier", intentIdentifier)
    .addNode("chatAgent", chatAgent)
    .addNode("canvasAgent", canvasAgent)
    .addNode("syncRequirements", syncRequirements)
    .addNode("tools", customToolNode)
    .addNode("reflectAgent", reflectAgent)
    .addNode("capReached", capReached)

    .addEdge("__start__", "intentIdentifier")
    .addConditionalEdges("intentIdentifier", routeIntent)

    .addEdge("chatAgent", "__end__")

    .addConditionalEdges("canvasAgent", shouldContinue)
    .addEdge("syncRequirements", "tools")
    .addConditionalEdges("tools", afterTools)
    .addConditionalEdges("reflectAgent", shouldContinueReflect)

    .addEdge("capReached", "__end__");

  return workflow.compile();
}

export const systemPromptTemplate = (canvasStateContext: string, requirements?: RequirementsState) => {
  const req = requirements ?? { functional: [], nonFunctional: [], assumptions: [], status: "pending" as const };
  const hasBaseline = req.functional.length > 0 || req.nonFunctional.length > 0 || req.assumptions.length > 0;

  let requirementsBlock: string;

  if (req.status === "confirmed") {
    requirementsBlock = `Confirmed Requirements:
    Functional: ${req.functional.join("; ") || "none"}
    Non-Functional: ${req.nonFunctional.join("; ") || "none"}
    Assumptions: ${req.assumptions.join("; ") || "none"}`;
  } else if (hasBaseline) {
    // Status flipped back to "pending" by intentIdentifier: the user asked for
    // something new on top of an already-confirmed system.
    requirementsBlock = `Existing Confirmed Requirements (baseline — do not lose or contradict these):
    Functional: ${req.functional.join("; ")}
    Non-Functional: ${req.nonFunctional.join("; ") || "none"}
    Assumptions: ${req.assumptions.join("; ") || "none"}

    NEW REQUEST PENDING CLARIFICATION: the user just asked for something that adds to or
    changes the above. Do NOT modify the canvas yet. Ask 3-4 focused clarifying questions
    about ONLY the new addition (its scale, how it interacts with existing components, any
    constraints) — do not re-ask about things already confirmed above. 
    Format your questions as a clear Markdown numbered list. Proceed with tools
    only after the user answers or explicitly says to proceed with assumptions.`;
  } else {
    requirementsBlock = `Requirements not yet confirmed — this is the first-time design for this
    project. Ask 3-4 clarifying questions about scale, read/write ratio, and key features
    before using any tools. Format your questions as a clear Markdown numbered list. 
    Proceed with tools only after the user answers or says to proceed with assumptions.`;
  }

  return `You are an expert AI software architect and UI designer. 
    Your job is to assist the user in designing their system using the provided tools.
    You are currently viewing the system design canvas.

    If working on a Database Schema, use 'entity' nodes and populate 'data.columns' with an array of { name, type, isPrimaryKey, isForeignKey, isNotNull, isUnique }. Use 'group' nodes to group tables, and 'foreign-key' edges to connect tables, specifying 'sourceCardinality' and 'targetCardinality' (1 or N) in 'data'.

    When adding messaging infrastructure, choose the correct node type based on the messaging pattern:
    - Use 'sqs' for Amazon SQS message queues. Store queues in 'data.queues'. Set broker settings under 'data.sqsBroker'. Valid fields: delivery, failureHandling, and sqsBroker: { visibilityTimeout, delay, fifo: boolean }.
    - Use 'redis-pubsub' for Redis Pub/Sub channels. Store channels in 'data.channels'. Valid fields: delivery, and redisPubSubBroker.
    - Use 'kafka' for Apache Kafka messaging brokers. Store topics in 'data.topics'. Set broker configuration under 'data.kafkaBroker' (partitions, replication, compression, ttl, batchSize). Valid fields: delivery, ordering, retention.
    - Use 'redis-streams' for Redis Streams messaging brokers. Store streams in 'data.streams'. Set broker configuration under 'data.redisBroker' (consumerGroup). Valid fields: delivery, ordering, retention.
    NEVER mix implementation fields across node types. These are now strictly enforced — a tool call with the wrong fields for a type will be rejected.

    ${requirementsBlock}

    Current Canvas State:
    ${canvasStateContext}

    Be concise in your textual responses. Prefer using tools to update the canvas to match the user's intent.`;
};