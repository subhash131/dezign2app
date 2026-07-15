import { ChatGroq } from "@langchain/groq";
import { RunnableConfig } from "@langchain/core/runnables";
import { StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { SystemMessage, AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";

import { GraphAnnotation, DEFAULT_REQUIREMENTS, DEFAULT_PLAN, requirementsSchema, ImplementationPlanState } from "./state";
import { tools } from "./tools";
import { systemPromptTemplate } from "./prompts";
import { getConvexClient, formatCanvasState } from "./utils";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
// ----------------------------------------------------------------------------
// AGENT NODES
// ----------------------------------------------------------------------------

let apiKeyIndex = 0;

export function createGraph() {
  const apiKeyStr = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_LLM_MODEL;
  if (!apiKeyStr || !model) {
    throw new Error("Missing environment variables: GROQ_API_KEY or GROQ_LLM_MODEL");
  }

  const apiKeys = apiKeyStr.split(',').map(k => k.trim()).filter(k => k.length > 0);
  if (apiKeys.length === 0) {
    throw new Error("GROQ_API_KEY is empty or invalid");
  }
  
  const apiKey = apiKeys[apiKeyIndex];
  apiKeyIndex = (apiKeyIndex + 1) % apiKeys.length;

  const llm = new ChatGroq({ apiKey, model, temperature: 0, maxTokens: 4000 });
  const modelWithTools = llm.bindTools(tools);

  // Custom tool node: injects state into tool config and tracks how many
  // tool calls have been made this turn (used to cap the retry loop).
  const customToolNode = async (state: typeof GraphAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (
      !lastMessage ||
      !("tool_calls" in lastMessage) ||
      !Array.isArray((lastMessage as AIMessage).tool_calls) ||
      (lastMessage as AIMessage).tool_calls!.length === 0
    ) {
      return { messages: [] };
    }

    const numCalls = (lastMessage as AIMessage).tool_calls!.length;
    const toolNode = new ToolNode(tools);
    const result = await toolNode.invoke(
      { messages: [lastMessage] },
      { configurable: { state } }
    );
    return { ...result, toolCallCount: numCalls };
  };

  // Node: Intent Identifier — writes to state.intent, never touches message history.
  // Also detects three things via one classification call:
  // 1. affectsRequirements — does this message introduce something new on top of an
  //    already-confirmed baseline? If so, reopen the requirements gate AND invalidate
  //    any approved plan (assumptions may no longer hold).
  // 2. readyForRequirementsSync — has the user given enough info to lock requirements in
  //    (relevant only while requirements.status === "pending").
  // 3. planDecision — did the user approve or ask to revise the proposed plan (relevant
  //    only while implementationPlan.status === "proposed").
  const intentIdentifier = async (state: typeof GraphAnnotation.State, config: RunnableConfig) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage || lastMessage.type !== "human") return {};

    const conversationContext = state.messages
      .slice(-6)
      .map((m: BaseMessage) => `${m.type.toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
      .join("\n\n");

    const existing = state.requirements ?? DEFAULT_REQUIREMENTS;
    const plan = state.implementationPlan ?? DEFAULT_PLAN;

    const gateContext =
      existing.status !== "confirmed"
        ? `The assistant is currently gathering requirements and may have just asked clarifying
questions. Determine "readyForRequirementsSync": true if the user's latest message
sufficiently answers those questions, or explicitly says to proceed / use assumptions.
Otherwise false.`
        : plan.status === "proposed"
        ? `The assistant just proposed an implementation plan and is awaiting approval.
Determine "planDecision": "approve" if the user accepts it (e.g. "looks good", "proceed",
"build it"), "revise" if they want changes to the plan, or "not_applicable" if their message
doesn't address the plan at all.`
        : "";

    const intentPrompt = new SystemMessage(
      `Analyze the user's latest message in the context of the recent conversation and determine the intent.
Available Intents:
- CREATE_SYSTEM: The user wants to build a new system architecture from scratch.
- EDIT_SYSTEM: The user wants to modify the existing system (add nodes, delete nodes, connect nodes, update schema, add services, add Kafka topics, add edges, or describes any system changes in any format including diagrams, tables, or specs).
- CHAT: The user is ONLY asking a pure question or making a trivial comment that does NOT involve any system change whatsoever.

Also determine "affectsRequirements": true only if the message introduces a NEW capability,
feature, scale target, or constraint that is NOT already covered by the confirmed requirements
below. Cosmetic/structural canvas edits (renames, repositioning, styling) are always false.
Answers to clarifying questions or plan-approval replies are also false (handled separately).

${gateContext}

Confirmed Requirements So Far:
Functional: ${existing.functional.join("; ") || "none yet"}
Non-Functional: ${existing.nonFunctional.join("; ") || "none yet"}

Return ONLY JSON, no prose, no markdown fences:
{
  "intent": "CREATE_SYSTEM" | "EDIT_SYSTEM" | "CHAT",
  "affectsRequirements": boolean,
  "readyForRequirementsSync": boolean,
  "planDecision": "approve" | "revise" | "not_applicable"
}

Recent Conversation Context:
${conversationContext}`
    );

    console.log("[DEBUG] Node: intentIdentifier invoking LLM");
    const response = await llm.invoke([intentPrompt], config);

    let intent = "CHAT";
    let affectsRequirements = false;
    let readyForRequirementsSync = false;
    let planDecision: "approve" | "revise" | "not_applicable" = "not_applicable";
    try {
      const cleaned = response.content.toString().replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      intent = parsed.intent ?? "CHAT";
      affectsRequirements = Boolean(parsed.affectsRequirements);
      readyForRequirementsSync = Boolean(parsed.readyForRequirementsSync);
      if (parsed.planDecision === "approve" || parsed.planDecision === "revise") {
        planDecision = parsed.planDecision;
      }
    } catch {
      // Fallback: treat the raw response as the intent string so a formatting slip
      // doesn't break routing entirely.
      intent = response.content.toString().trim();
    }

    const update: Partial<typeof GraphAnnotation.State> = {
      intent,
      readyForRequirementsSync,
      planDecision,
    };

    // Only reopen the gate if we currently have a confirmed baseline — if we're
    // already mid-clarification (status "pending"), leave it alone; that's handled
    // by the requirementsAgent -> syncRequirements flow below. Reopening also
    // invalidates any approved plan, since new requirements can change the
    // architecture the plan was built around.
    if (affectsRequirements && existing.status === "confirmed") {
      update.requirements = { ...existing, status: "pending" };
      update.implementationPlan = { ...plan, status: "none" };
    }

    return update;
  };

  // Helper to strip tool calls from history for non-tool agents
  // Prevents Groq API errors when tool calls exist in history but tools are not bound.
  const sanitizeMessages = (messages: BaseMessage[]) => {
    return messages
      .filter((m) => m.type !== "tool")
      .map((m) => {
        if (m.type === "ai" && (m as AIMessage).tool_calls && (m as AIMessage).tool_calls!.length > 0) {
          return new AIMessage(m.content || "(System design updated)");
        }
        return m;
      });
  };

  // Node: Chat Agent (No Tools)
  const chatAgent = async (state: typeof GraphAnnotation.State, config: RunnableConfig) => {
    const systemMsg = new SystemMessage(
      `You are a concise system architecture assistant. The user is asking a quick question — answer in 1-3 sentences max. Do NOT write essays, lists, bullet points, code snippets, or long explanations. Do NOT use tools. Base your answers on the current canvas state: ${state.canvasStateContext ?? "Canvas is empty."}`
    );
    console.log("[DEBUG] Node: chatAgent invoking LLM");
    const response = await llm.invoke([systemMsg, ...sanitizeMessages(state.messages)], config);
    return { messages: [response] };
  };

  // Node: System Creator / Editor (With Tools)
  const canvasAgent = async (state: typeof GraphAnnotation.State, config: RunnableConfig) => {
    const systemMsg = new SystemMessage(
      systemPromptTemplate(state.canvasStateContext ?? "", state.requirements, state.implementationPlan)
    );
    console.log("[DEBUG] Node: canvasAgent invoking modelWithTools");
    const response = await modelWithTools.invoke([systemMsg, ...state.messages], config);
    return { messages: [response] };
  };

  // Node: Reflect — reviews the outcome of tool calls and either retries
  // (emits new tool_calls) or wraps up with a summary.
  const reflectAgent = async (state: typeof GraphAnnotation.State, config: RunnableConfig) => {
    const recentToolMsgs = state.messages.slice(-10).filter((m) => m.type === "tool");
    const hasFailure = recentToolMsgs.some(
      (m) => typeof m.content === "string" && m.content.startsWith("Failed to")
    );

    const plan = state.implementationPlan ?? DEFAULT_PLAN;
    // Tool calls mutate Convex after the initial request snapshot was built.
    // Always reflect against the current backend graph, not stale state from
    // before the tool calls in this turn.
    const convex = getConvexClient(state);
    const currentElements = await convex.query(api.canvas.getBackendElements, {
      projectId: state.projectId as Id<"projects">,
    });
    const currentCanvasState = formatCanvasState(currentElements);

    // Build a stage-specific closing instruction so the LLM explicitly asks for
    // approval at the end of each build stage instead of silently moving on.
    const stageClosingInstruction =
      plan.status === "approved"
        ? `\n\nSTAGE CLOSING: If everything for the schema stage is complete (no more tool calls needed), end your response with a short, friendly question asking the user to approve the schema or request any changes before you proceed to building the service nodes and graph. Example: "Does the schema look good to you, or would you like any changes before I proceed to building the service nodes?"`
        : plan.status === "schema_approved"
        ? `\n\nSTAGE CLOSING: If everything for the nodes stage is complete (no more tool calls needed), end your response with a short, friendly question asking the user to approve the nodes or request any changes before you proceed to connecting them. Example: "Do the service nodes look correct, or would you like any adjustments before I proceed to wiring up the connections?"`
        : plan.status === "nodes_approved"
        ? `\n\nSTAGE CLOSING: If all edges have been added and everything looks connected, end your response with a short summary confirming the architecture is complete and ask if there is anything the user would like to adjust.`
        : "";

    const reflectionPrompt = new HumanMessage(
      hasFailure
        ? `Some of your last tool calls failed. Review the tool error messages below, correct the parameters, and retry ONLY the failed operations using your tools. If the error is DUPLICATE_EDGE, it means the connection already exists and you can ignore it and stop. If a database connection is missing, NEVER use update_node to create it: use add_edge with the existing service node ID, db_ref node ID, sourceHandle="endpoints-out-{endpointId}", targetHandle="database-target", and type="connection". If you cannot fix an error, explain briefly and stop. DO NOT hallucinate tools like 'add_entity' - use 'add_single_schema' or 'add_schema_group' instead. DO NOT hallucinate tools like 'add_external', 'add_sqs', or 'add_redis' - use the general 'add_node' tool for those.\n\nRecent tool results:\n${recentToolMsgs
            .map((m) => m.content)
            .join("\n")}`
        : `Review the tool results below against the user's original request AND the approved
implementation plan (technology choices, services, endpoints, messaging infra it called for).
Ensure you only evaluate what is required for the CURRENT STAGE (as defined in the system prompt).
If everything required for the current stage has been built or already exists on the canvas, respond with a brief confirmation summary and do NOT call any tools. 
If something required for the current stage is still missing from BOTH the recent tool results AND the current canvas state, call the appropriate tool(s) to add it.

CRITICAL: DO NOT hallucinate tools like 'add_entity'. If you need to add a schema/entity, use the 'add_single_schema' or 'add_schema_group' tools. For 'external', 'sqs', 'redis', or 'group' nodes, you MUST use the general 'add_node' tool. DO NOT hallucinate 'add_external', 'add_sqs', etc.

CRITICAL: Make sure nodes are actually connected! If you just created nodes, you must now use their IDs from the tool results below to call the 'add_edge' tool and connect them together. 
- You MUST connect WebClient events to Service endpoints.
- You MUST connect Service endpoints to Database references (db_ref) if the service reads/writes data (use sourceHandle="endpoints-out-{id}" and targetHandle="database-target").
- When the user reports disconnected tables, treat that as a repair operation: inspect every service endpoint and existing connection, then issue one add_edge call for each missing endpoint→db_ref relationship. Do not call update_node just to create an edge.
Pay close attention to the generated IDs for endpoints and events to properly set sourceHandle and targetHandle.
When adding a database reference using 'add_db_ref_node', you MUST provide the 'tableRef' parameter containing the node ID of the target schema/entity it references.

Current Canvas State:
        ${currentCanvasState}

Approved Implementation Plan:
${plan.content || "none"}

Recent tool results:
${recentToolMsgs.map((m) => m.content).join("\n")}${stageClosingInstruction}`
    );

    const systemMsg = new SystemMessage(
      systemPromptTemplate(state.canvasStateContext ?? "", state.requirements, state.implementationPlan)
    );

    console.log("[DEBUG] Node: reflectAgent invoking modelWithTools");
    const response = await modelWithTools.invoke([systemMsg, ...state.messages, reflectionPrompt], config);
    type AgentUpdate = {
      messages: BaseMessage[];
      implementationPlan?: ImplementationPlanState;
    };
    const update: AgentUpdate = { messages: [response] };
    
    const hasNewToolCalls = response.tool_calls && response.tool_calls.length > 0;
    if (!hasNewToolCalls) {
      type ValidStatus = "proposed" | "approved" | "schema_built" | "schema_approved" | "nodes_built" | "nodes_approved" | "edges_built";
      let nextStatus: ValidStatus | "none" = plan.status;
      
      if (plan.status === "approved") {
        nextStatus = "schema_built";
      } else if (plan.status === "schema_approved") {
        nextStatus = "nodes_built";
      } else if (plan.status === "nodes_approved") {
        nextStatus = "edges_built";
      }

      if (nextStatus !== plan.status && nextStatus !== "none") {
        const nextPlan: ImplementationPlanState = { ...plan, status: nextStatus };
        update.implementationPlan = nextPlan;
        
        if (state.projectId && state.convexUrl) {
          try {
            const convex = getConvexClient(state);
            await convex.mutation(api.requirements.upsertPlan, {
              projectId: state.projectId,
              content: nextPlan.content,
              status: nextStatus,
            });
          } catch (error) {
            console.error(`[DEBUG] Error upserting plan (${nextStatus}):`, error);
          }
        }
      }
    }
    
    return update;
  };

  // Helper: ask the LLM for requirements JSON, retrying once on malformed output
  // before giving up (never throws — caller decides the fallback).
  const parseRequirementsWithRetry = async (prompt: string, config: RunnableConfig, maxAttempts = 2) => {
    let lastError = "";
    for (let i = 0; i < maxAttempts; i++) {
      const suffix = lastError
        ? `\n\nYour previous output was invalid: ${lastError}. Return valid JSON only, no prose, no markdown fences.`
        : "";
      console.log(`[DEBUG] Helper: parseRequirementsWithRetry invoking LLM (attempt ${i})`);
      const response = await llm.invoke([new SystemMessage(prompt + suffix)], config);
      try {
        const cleaned = response.content.toString().replace(/```json|```/g, "").trim();
        return requirementsSchema.parse(JSON.parse(cleaned));
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    return null;
  };

  // Node: syncRequirements — runs once the user has given enough info to lock
  // requirements in (readyForRequirementsSync). Covers both the first-ever build
  // (existing requirements empty) and a later addition (existing requirements
  // non-empty, just answered clarifying questions about the new piece) with the
  // same merge-style prompt, so nothing already confirmed gets silently dropped.
  // Always hands off to planAgent next — a confirmed requirement always needs an
  // approved plan before anything gets built.
  const syncRequirements = async (state: typeof GraphAnnotation.State, config: RunnableConfig) => {
    const existing = state.requirements ?? {
      functional: [],
      nonFunctional: [],
      assumptions: [],
      status: "pending" as const,
    };

    const conversation = state.messages
      .slice(-12)
      .map((m: BaseMessage) => `${m.type}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
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
user just confirmed. Only remove or modify an item if the user explicitly contradicted it.

IMPORTANT — EXCLUDE the following categories entirely; do NOT add them to any field:
- Deployment/hosting details (Docker containers, VM specs, CPU/RAM sizing, managed DB config)
- Operational concerns (health-check endpoints, auto-restart policies, HTTPS termination, load-balancer config, rate-limiting at the edge, backup schedules, read replicas, uptime SLA percentages)
These are ops concerns, not architecture requirements.`;

    const parsed = await parseRequirementsWithRetry(prompt, config);

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
        await convex.mutation(api.requirements.upsert, {
          projectId: state.projectId,
          ...requirements,
        });
      } catch (error) {
        console.error("[DEBUG] Error upserting requirements:", error);
        // Non-fatal: this turn's in-memory state is still correct;
        // a reload later will just be stale until the next successful write.
      }
    }

    return { requirements };
  };

  // Node: requirementsAgent — no tools bound. Runs while requirements are not yet
  // confirmed. Purely asks clarifying questions; structurally cannot call tools,
  // so there's no risk of it building prematurely regardless of what it's told.
  const requirementsAgent = async (state: typeof GraphAnnotation.State, config: RunnableConfig) => {
    const req = state.requirements ?? DEFAULT_REQUIREMENTS;
    const hasBaseline = req.functional.length > 0 || req.nonFunctional.length > 0 || req.assumptions.length > 0;

    const prompt = new SystemMessage(
      hasBaseline
        ? `The user just asked for something new on top of an already-built system.

Existing Confirmed Requirements (baseline — do not lose or contradict these):
Functional: ${req.functional.join("; ")}
Non-Functional: ${req.nonFunctional.join("; ") || "none"}
Assumptions: ${req.assumptions.join("; ") || "none"}

Ask 3-4 focused clarifying questions about ONLY the new addition — its scale, how it
interacts with the existing system, and any constraints. Do not re-ask about anything
already confirmed above. Do not propose an implementation plan yet; that happens after
this. Be concise.`
        : `The user wants to design a new system. Ask 2-3 short clarifying questions about ONLY:
- What core features/actions users can perform
- Approximate number of users or expected traffic scale
- Any hard constraints (e.g. must use a specific database, real-time updates needed)
Do NOT ask about read/write ratio, ops, deployment, or infrastructure. Do not propose an implementation plan yet; that happens after this. Be concise.`
    );

    console.log("[DEBUG] Node: requirementsAgent invoking LLM");
    const response = await llm.invoke([prompt, ...sanitizeMessages(state.messages)], config);
    return { messages: [response] };
  };

  // Node: planAgent — no tools bound. Runs once requirements are confirmed but no
  // plan has been approved yet. Proposes (or revises, given feedback) a detailed
  // technology/architecture plan as plain text and asks for approval. Cannot call
  // tools, so the canvas can't be touched until a human explicitly approves.
  const planAgent = async (state: typeof GraphAnnotation.State, config: RunnableConfig) => {
    const req = state.requirements ?? DEFAULT_REQUIREMENTS;
    const priorPlan = state.implementationPlan ?? DEFAULT_PLAN;
    const isRevision = priorPlan.status === "proposed" && priorPlan.content.length > 0;

    const prompt = new SystemMessage(
      `You are a senior software architect. ${
        isRevision
          ? "Revise the previously proposed implementation plan based on the user's latest feedback, keeping everything they did not object to."
          : "Propose an implementation plan for review."
      } This is a chat message a user will skim on their phone before approving — do NOT
call any tools, just describe it.

Confirmed Requirements:
Functional: ${req.functional.join("; ") || "none"}
Non-Functional: ${req.nonFunctional.join("; ") || "none"}
Assumptions: ${req.assumptions.join("; ") || "none"}

${isRevision ? `Previously Proposed Plan:\n${priorPlan.content}` : ""}

SCALE THE ARCHITECTURE TO THE STATED REQUIREMENTS — this overrides any default instinct
toward a "textbook" or "impressive" design:
- Infer an approximate scale tier from the requirements (e.g. DAU/traffic figures, read/write
  ratio, number of features). If no scale is given, assume small/MVP scale rather than defaulting
  to enterprise-scale patterns.
- For small scale (roughly hundreds to low tens-of-thousands of users, or whenever the
  requirements don't call for independent scaling of separate concerns): prefer a single
  monolithic service over microservices. Only split into multiple services if the
  requirements name distinct domains that need to scale, deploy, or fail independently.
- Only introduce container orchestration (Kubernetes) if the stated scale or requirements
  explicitly justify it (e.g. multi-region, elastic autoscaling, many independently-scaled
  services). Otherwise prefer a single container/VM/managed platform deployment.
- Only introduce a caching layer (Redis, CDN edge cache, etc.) if the requirements name a
  latency target or read volume that a plain database query wouldn't satisfy. Do not add
  caching "just in case."
- Only introduce message brokers/queues if the requirements involve asynchronous processing,
  fan-out, or decoupled services. Do not add messaging infra for a simple synchronous CRUD flow.
- If you are unsure whether a piece of infrastructure is justified by the requirements, leave
  it out rather than including it for completeness.

FORMAT — this is as important as the content:
- Target 200-400 words total. Hard cap 500.
- Use bullet points. You may use sub-bullets (up to two levels deep) to detail schemas and fields.
- No "why not X / alternatives considered" discussion, no generic explanations of what a
  pattern or technology is. State the choice, not the reasoning essay behind it.
- Skip any section that isn't needed for these requirements entirely (e.g. no caching
  section if nothing warrants a cache).
- Name real, specific technologies (e.g. "PostgreSQL", "Kafka"), never vague terms like
  "a suitable database".

CONTENT — cover only what applies, each as terse bullets:
- **Architecture**: one line naming the pattern (monolith/microservices/serverless/event-driven).
- **Services**: one line per service — name, tech stack, one-clause responsibility, 2-4
  representative endpoints as "METHOD /path".
- **Data storage & Schemas**: one line per store — engine + what it holds. CRITICAL: Include sub-bullets detailing the specific schemas (tables/entities/collections) and their key fields needed to satisfy the functional requirements. These will be modeled as SchemaGroupNodes and Entity nodes.
- **Messaging** (only if needed): one line — which broker + what flows through it. Mention key event schemas/payloads.
- **Caching** (only if needed): one line — what's cached.
- **Client**: one line — framework + how it talks to the backend.

End with a single short line asking the user to approve or say what to change. Do not
restate the requirements back to them.`
    );

    console.log("[DEBUG] Node: planAgent invoking LLM");
    const response = await llm.invoke([prompt, ...sanitizeMessages(state.messages.slice(-8))], config);
    const content = response.content.toString();
    const implementationPlan: ImplementationPlanState = { content, status: "proposed" };

    if (state.projectId && state.convexUrl) {
      try {
        const convex = getConvexClient(state);
        await convex.mutation(api.requirements.upsertPlan, {
          projectId: state.projectId,
          content,
          status: "proposed",
        });
      } catch (error) {
        console.error("[DEBUG] Error upserting plan (proposed):", error);
        // Non-fatal — this turn's in-memory plan is still correct for the approval check.
      }
    }

    return { messages: [response], implementationPlan };
  };

  // Node: approvePlan — deterministic, no LLM call. Flips the plan to "approved"
  // once the user has signed off, then hands off to canvasAgent to actually build.
  const approvePlan = async (state: typeof GraphAnnotation.State) => {
    const plan = state.implementationPlan ?? DEFAULT_PLAN;
    const approved: ImplementationPlanState = { ...plan, status: "approved" };

    if (state.projectId && state.convexUrl) {
      try {
        const convex = getConvexClient(state);
        await convex.mutation(api.requirements.upsertPlan, {
          projectId: state.projectId,
          content: approved.content,
          status: "approved",
        });
      } catch (error) {
        console.error("[DEBUG] Error upserting plan (approved):", error);
        // Non-fatal
      }
    }

    return { implementationPlan: approved };
  };

  const approveSchema = async (state: typeof GraphAnnotation.State) => {
    const plan = state.implementationPlan ?? DEFAULT_PLAN;
    const approved: ImplementationPlanState = { ...plan, status: "schema_approved" };

    if (state.projectId && state.convexUrl) {
      try {
        const convex = getConvexClient(state);
        await convex.mutation(api.requirements.upsertPlan, {
          projectId: state.projectId,
          content: approved.content,
          status: "schema_approved",
        });
      } catch (error) {
        console.error("[DEBUG] Error upserting plan (schema_approved):", error);
      }
    }

    return { implementationPlan: approved };
  };

  const approveNodes = async (state: typeof GraphAnnotation.State) => {
    const plan = state.implementationPlan ?? DEFAULT_PLAN;
    const approved: ImplementationPlanState = { ...plan, status: "nodes_approved" };

    if (state.projectId && state.convexUrl) {
      try {
        const convex = getConvexClient(state);
        await convex.mutation(api.requirements.upsertPlan, {
          projectId: state.projectId,
          content: approved.content,
          status: "nodes_approved",
        });
      } catch (error) {
        console.error("[DEBUG] Error upserting plan (nodes_approved):", error);
      }
    }

    return { implementationPlan: approved };
  };

  // Router: after intent classification, walk the three gates in order —
  // requirements confirmed? plan approved? only then reach canvasAgent (with tools).
  const routeAfterIntent = (state: typeof GraphAnnotation.State) => {
    const req = state.requirements ?? DEFAULT_REQUIREMENTS;
    if (req.status !== "confirmed") {
      return state.readyForRequirementsSync ? "syncRequirements" : "requirementsAgent";
    }

    const plan = state.implementationPlan ?? DEFAULT_PLAN;
    const isBuildingPhase = 
      plan.status === "approved" || 
      plan.status === "schema_built" || 
      plan.status === "schema_approved" || 
      plan.status === "nodes_built" || 
      plan.status === "nodes_approved" || 
      plan.status === "edges_built";

    if (!isBuildingPhase) {
      if (plan.status === "proposed" && state.planDecision === "approve") {
        return "approvePlan";
      }
      if (state.intent === "CHAT" && state.planDecision === "not_applicable") {
        return "chatAgent";
      }
      return "planAgent";
    }

    if (plan.status === "schema_built") {
      if (state.planDecision === "approve") {
        return "approveSchema";
      }
      if (state.intent === "CHAT" && state.planDecision === "not_applicable") {
        return "chatAgent";
      }
      return "canvasAgent";
    }

    if (plan.status === "nodes_built") {
      if (state.planDecision === "approve") {
        return "approveNodes";
      }
      if (state.intent === "CHAT" && state.planDecision === "not_applicable") {
        return "chatAgent";
      }
      return "canvasAgent";
    }

    if (plan.status === "edges_built") {
      // Nothing left to approve automatically after edges, but we can let them chat or edit manually.
      if (state.intent !== "CREATE_SYSTEM" && state.intent !== "EDIT_SYSTEM") {
        return "chatAgent";
      }
      return "canvasAgent";
    }

    if (state.intent !== "CREATE_SYSTEM" && state.intent !== "EDIT_SYSTEM") {
      return "chatAgent";
    }

    return "canvasAgent";
  };

  // Router: after canvasAgent's first pass. canvasAgent is only ever reached once
  // requirements are confirmed and the plan is approved, so no defensive
  // requirements/plan check is needed here — just the tool-call loop.
  const shouldContinue = (state: typeof GraphAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    const hasToolCalls =
      lastMessage &&
      "tool_calls" in lastMessage &&
      Array.isArray((lastMessage as AIMessage).tool_calls) &&
      (lastMessage as AIMessage).tool_calls!.length > 0;
    return hasToolCalls ? "tools" : "__end__";
  };

  // Router: after tools run, always go reflect (unless capped)
  const afterTools = (state: typeof GraphAnnotation.State) => {
    return "reflectAgent";
  };

  // Router: after reflectAgent decides whether to retry or stop
  const shouldContinueReflect = (state: typeof GraphAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && "tool_calls" in lastMessage && Array.isArray((lastMessage as AIMessage).tool_calls) && (lastMessage as AIMessage).tool_calls!.length > 0) {
      return "tools";
    }
    return "__end__";
  };

  const workflow = new StateGraph(GraphAnnotation)
    .addNode("intentIdentifier", intentIdentifier)
    .addNode("chatAgent", chatAgent)
    .addNode("requirementsAgent", requirementsAgent)
    .addNode("syncRequirements", syncRequirements)
    .addNode("planAgent", planAgent)
    .addNode("approvePlan", approvePlan)
    .addNode("approveSchema", approveSchema)
    .addNode("approveNodes", approveNodes)
    .addNode("canvasAgent", canvasAgent)
    .addNode("tools", customToolNode)
    .addNode("reflectAgent", reflectAgent)

    .addEdge("__start__", "intentIdentifier")
    .addConditionalEdges("intentIdentifier", routeAfterIntent)

    .addEdge("chatAgent", "__end__")
    .addEdge("requirementsAgent", "__end__")
    .addEdge("syncRequirements", "planAgent")
    .addEdge("planAgent", "__end__")
    .addEdge("approvePlan", "canvasAgent")
    .addEdge("approveSchema", "canvasAgent")
    .addEdge("approveNodes", "canvasAgent")

    .addConditionalEdges("canvasAgent", shouldContinue)
    .addConditionalEdges("tools", afterTools)
    .addConditionalEdges("reflectAgent", shouldContinueReflect);

  return workflow.compile();
}
