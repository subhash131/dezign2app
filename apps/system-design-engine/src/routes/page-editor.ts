import { Router, type Router as ExpressRouter } from "express";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@workspace/backend/_generated/api";
import { createUiEditorGraph } from "../ai/ui-agent";
import {
  pageEditorRequestBodySchema,
  type PageEditorStreamEvent,
} from "@workspace/canvas";
import { Id } from "@workspace/backend/_generated/dataModel";

export const pageEditorRouter: ExpressRouter = Router();

/**
 * Type-safe error message extractor for LangGraph event streams
 */
function formatStreamError(error: unknown): string {
  if (!error) return "Pipeline error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

interface EndpointSummaryField {
  name: string;
  type?: string;
}

interface EndpointSummaryItem {
  name?: string;
  route?: string;
  type?: string;
  requestBody?: { fields?: EndpointSummaryField[] };
  responseBody?: { fields?: EndpointSummaryField[] };
}

interface EndpointSourceNode {
  id?: string;
  nodeId?: string;
  type: string;
  data?: {
    label?: string;
    endpoints?: EndpointSummaryItem[];
  };
}

interface EndpointSourceEdge {
  source: string;
  target: string;
}

interface ConnectedEndpointsSource {
  nodes?: EndpointSourceNode[];
  edges?: EndpointSourceEdge[];
}

/**
 * Helper to extract connected service endpoints for the target node
 */
function extractConnectedEndpoints(
  nodeId: string,
  elements: ConnectedEndpointsSource | null | undefined,
): string {
  if (!elements || !Array.isArray(elements.nodes) || !Array.isArray(elements.edges)) {
    return "";
  }

  const { nodes, edges } = elements;
  const targetNode = nodes.find((n) => (n.nodeId || n.id) === nodeId);
  if (!targetNode) return "";

  // Find parent or connected webApp node
  const connectedNodeIds = new Set<string>([nodeId]);
  for (const edge of edges) {
    if (edge.source === nodeId) connectedNodeIds.add(edge.target);
    if (edge.target === nodeId) connectedNodeIds.add(edge.source);
  }

  // Find service nodes directly connected or connected via WebApp
  const serviceNodes = nodes.filter(
    (n) => {
      const currentId = n.nodeId || n.id;
      return (
        n.type === "service" &&
        (
          (currentId ? connectedNodeIds.has(currentId) : false) ||
          edges.some((e) => (currentId ? (e.source === currentId || e.target === currentId) : false))
        )
      );
    }
  );

  if (serviceNodes.length === 0) return "";

  const summaries: string[] = [];
  for (const svc of serviceNodes) {
    const serviceName = svc.data?.label || svc.nodeId || svc.id || "Service";
    const endpoints = svc.data?.endpoints || [];
    if (endpoints.length > 0) {
      const epSummaries = endpoints.map((ep: EndpointSummaryItem) => {
        const method = (ep.type || "GET").toUpperCase();
        const route = ep.route || ep.name || "/";
        const reqFields = ep.requestBody?.fields?.map((f) => `${f.name}: ${f.type || "string"}`).join(", ");
        const resFields = ep.responseBody?.fields?.map((f) => `${f.name}: ${f.type || "string"}`).join(", ");
        return `  - ${method} ${route} ${reqFields ? `(Body: { ${reqFields} })` : ""} ${resFields ? `(Returns: { ${resFields} })` : ""}`;
      }).join("\n");
      summaries.push(`Service "${serviceName}":\n${epSummaries}`);
    }
  }

  return summaries.join("\n\n");
}

interface ActiveEditorSession {
  abortController: AbortController;
  nodeId: string;
  projectId?: string;
  pageRoute?: string;
  markDisconnected: () => void;
}

const activeSessions = new Map<string, ActiveEditorSession>();

/**
 * POST /page-editor/stop
 *
 * Explicitly terminates an in-flight LangGraph UI Editor pipeline for the specified node.
 */
pageEditorRouter.post("/stop", async (req, res) => {
  const { nodeId, projectId } = req.body || {};
  console.log(`\n🛑 [page-editor] >>> STOP REQUEST RECEIVED for node: "${nodeId || "unknown"}" (projectId: "${projectId || "none"}")`);
  console.log(`🛑 [page-editor] Active sessions in registry: ${activeSessions.size} ([${Array.from(activeSessions.keys()).join(", ") || "none"}])`);

  let wasStopped = false;
  if (nodeId && activeSessions.has(nodeId)) {
    const session = activeSessions.get(nodeId);
    if (session) {
      session.markDisconnected();
      session.abortController.abort();
      activeSessions.delete(nodeId);
      wasStopped = true;
      console.log(`🛑 [page-editor] <<< SUCCESS: LangGraph pipeline STOPPED for node: "${nodeId}" (${session.pageRoute || "/"})\n`);
    }
  } else if (!nodeId && activeSessions.size === 1) {
    const firstEntry = activeSessions.entries().next().value;
    if (firstEntry) {
      const [firstNodeId, session] = firstEntry;
      session.markDisconnected();
      session.abortController.abort();
      activeSessions.delete(firstNodeId);
      wasStopped = true;
      console.log(`🛑 [page-editor] <<< SUCCESS: Single active pipeline STOPPED for node: "${firstNodeId}" (${session.pageRoute || "/"})\n`);
    }
  } else {
    console.log(`⚠️ [page-editor] No active in-flight session found to stop for node: "${nodeId}"\n`);
  }

  res.json({ success: true, stopped: wasStopped, message: `Stopped generation for node ${nodeId}` });
});

/**
 * POST /page-editor
 *
 * Runs the dedicated UI Editor LangGraph pipeline to plan, generate, validate, and repair
 * production-ready Next.js TSX components using @workspace/ui components.
 */
pageEditorRouter.post("/", async (req, res) => {
  let isClientDisconnected = false;
  let abortController: AbortController | null = null;
  let targetNodeId = "";

  try {
    const parseResult = pageEditorRequestBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.message });
      return;
    }

    const {
      nodeId,
      projectId,
      currentCode,
      prompt,
      pageName,
      pageRoute,
      convexUrl: bodyConvexUrl,
      token,
      conversationId: bodyConversationId,
      chatHistory: bodyChatHistory,
    } = parseResult.data;

    targetNodeId = nodeId;

    const convexUrl = bodyConvexUrl || process.env.CONVEX_URL;
    if (!convexUrl) {
      res.status(500).json({ error: "Missing CONVEX_URL" });
      return;
    }

    const convexClient = new ConvexHttpClient(convexUrl);
    if (token && typeof token === "string" && token.includes(".") && !token.startsWith("sk_")) {
      convexClient.setAuth(token);
    }

    // Resolve or initialize conversationId for UI design
    let activeConversationId = bodyConversationId || "";
    try {
      if (!activeConversationId && projectId && nodeId) {
        activeConversationId = await convexClient.mutation(api.ai.conversations.getOrCreateNodeConversation, {
          projectId: projectId as Id<"projects">,
          nodeId,
          type: "ui_design",
          title: `UI Design: ${pageName || nodeId}`,
        });
        console.log(`[page-editor] Resolved active conversation ID: ${activeConversationId}`);
      }
    } catch (convErr) {
      console.warn("[page-editor] Could not get or create node conversation:", convErr);
    }

    // Resolve chat history
    let chatHistory: Array<{ role: string; content: string }> = bodyChatHistory || [];
    if (chatHistory.length === 0 && activeConversationId) {
      try {
        const convexMessages = await convexClient.query(api.ai.messages.getConversationMessages, {
          conversationId: activeConversationId as Id<"conversations">,
        });
        if (Array.isArray(convexMessages) && convexMessages.length > 0) {
          chatHistory = convexMessages.map((m) => ({
            role: m.role,
            content: m.content,
          }));
          console.log(`[page-editor] Loaded ${chatHistory.length} previous messages from Convex conversation ${activeConversationId}`);
        }
      } catch (msgErr) {
        console.warn("[page-editor] Could not load previous messages from Convex:", msgErr);
      }
    }

    // Record user message in Convex if activeConversationId is present
    if (activeConversationId && prompt) {
      try {
        // Check if user message is already latest in conversation to avoid duplicates
        const lastMsg = chatHistory[chatHistory.length - 1];
        if (!lastMsg || lastMsg.content !== prompt || (lastMsg.role !== "user" && lastMsg.role !== "USER")) {
          await convexClient.mutation(api.ai.messages.insertMessage, {
            conversationId: activeConversationId as Id<"conversations">,
            content: prompt,
            role: "user",
            createdAt: Date.now(),
          });
        }
      } catch (userMsgErr) {
        console.warn("[page-editor] Could not record user message in Convex:", userMsgErr);
      }
    }

    // Fetch canvas state to extract connected endpoints
    let canvasEndpoints = "";
    try {
      const elements = await convexClient.query(api.canvas.getBackendElements, {
        projectId: projectId as Id<"projects">,
      });
      canvasEndpoints = extractConnectedEndpoints(nodeId, elements);
    } catch (err) {
      console.warn("[page-editor] Failed to fetch canvas backend elements:", err);
    }

    console.log(`[page-editor] === Incoming Request for Node: ${nodeId} (${pageName || "Unnamed"}) ===`);
    console.log(`[page-editor] Route: ${pageRoute}, ProjectId: ${projectId}, ConvId: ${activeConversationId || "none"}`);
    console.log(`[page-editor] Prompt: "${prompt}"`);
    console.log(`[page-editor] Current code length: ${currentCode?.length || 0} chars | Chat history: ${chatHistory.length} msgs`);

    // Set streaming headers
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Initialize LangGraph UI Editor with AbortSignal
    console.log("[page-editor] Creating UI Editor LangGraph pipeline...");
    const graph = createUiEditorGraph();
    abortController = new AbortController();

    const currentSession: ActiveEditorSession = {
      abortController,
      nodeId,
      projectId,
      pageRoute,
      markDisconnected: () => {
        isClientDisconnected = true;
      },
    };
    activeSessions.set(nodeId, currentSession);

    const cleanupSession = () => {
      if (activeSessions.get(nodeId) === currentSession) {
        activeSessions.delete(nodeId);
      }
    };

    const initialState = {
      nodeId,
      projectId,
      convexUrl,
      token: token || "",
      conversationId: activeConversationId,
      chatHistory,
      pageName: pageName || nodeId,
      pageRoute: pageRoute || "/",
      currentCode: currentCode || "",
      prompt,
      canvasEndpoints,
    };

    let generatedCode = "";
    let currentPlan = "";
    let activeNode = "";

    const handleAbort = () => {
      if (!res.writableEnded) {
        isClientDisconnected = true;
        console.log(`\n🛑 [page-editor] Client connection closed -> ABORTING generation for node: "${nodeId}" (${pageRoute || "/"})`);
        abortController?.abort();
        cleanupSession();
      }
    };

    res.on("close", handleAbort);
    req.on("close", handleAbort);
    req.socket.on("close", handleAbort);

    res.write(JSON.stringify({ type: "status", message: "Planning UI architecture & components..." }) + "\n");

    console.log("[page-editor] Starting LangGraph streamEvents (v2)...");
    const graphStream = await graph.streamEvents(initialState, {
      version: "v2",
      signal: abortController.signal,
    });

    for await (const event of graphStream) {
      if (isClientDisconnected || abortController.signal.aborted) {
        console.log(`🛑 [page-editor] LangGraph event stream STOPPED immediately on abort signal (Node: "${nodeId}")`);
        break;
      }
      if (event.event === "on_chain_start") {
        const nodeName = event.metadata?.langgraph_node;
        if (nodeName && nodeName !== activeNode) {
          activeNode = nodeName;
          console.log(`[page-editor] >>> Entering node: ${nodeName}`);
          if (nodeName === "uiPlanner") {
            res.write(JSON.stringify({ type: "status", message: "Formulating UI layout & component tree..." }) + "\n");
          } else if (nodeName === "uiCodeGenerator") {
            res.write(JSON.stringify({ type: "status", message: "Generating React TSX with @workspace/ui..." }) + "\n");
          } else if (nodeName === "uiValidator") {
            res.write(JSON.stringify({ type: "status", message: "Validating TSX structure & design system imports..." }) + "\n");
          } else if (nodeName === "uiRepair") {
            // Reset generatedCode so repaired code tokens supersede broken code
            generatedCode = "";
            res.write(JSON.stringify({ type: "status", message: "Self-correcting detected syntax issues..." }) + "\n");
          }
        }
      }

      if (event.event === "on_chain_end") {
        const nodeName = event.metadata?.langgraph_node;
        if (nodeName) {
          console.log(`[page-editor] <<< Completed node: ${nodeName}`);
          const out = event.data?.output;
          if ((nodeName === "uiCodeGenerator" || nodeName === "uiRepair") && out) {
            if (out.cleanCode) {
              generatedCode = out.cleanCode;
              console.log(`[page-editor] Captured cleanCode directly from ${nodeName} output (${generatedCode.length} chars)`);
            } else if (out.generatedCode) {
              generatedCode = out.generatedCode;
              console.log(`[page-editor] Captured generatedCode directly from ${nodeName} output (${generatedCode.length} chars)`);
            }
          }
          if (nodeName === "uiPlanner" && out?.plan && !currentPlan) {
            currentPlan = out.plan;
          }
        }
      }

      if (event.event === "on_chain_error" || event.event === "on_chat_model_error") {
        const streamErr: unknown = event.data?.error;
        if (abortController.signal.aborted || isClientDisconnected) {
          console.log(`🛑 [page-editor] Stream error suppressed due to user abort.`);
          break;
        }
        console.error(`[page-editor] Pipeline error during ${event.event}:`, streamErr);
        if (streamErr && typeof streamErr === "object" && "stack" in streamErr && streamErr.stack) {
          console.error(`[page-editor] ${event.event} stack:`, streamErr.stack);
        }
        const errMsg = formatStreamError(streamErr);
        res.write(JSON.stringify({ type: "status", message: `Warning: ${errMsg}` }) + "\n");
      }

      if (event.event === "on_chat_model_stream") {
        const nodeName = event.metadata?.langgraph_node;
        const chunk = event.data?.chunk;
        const text = typeof chunk?.content === "string" ? chunk.content : "";

        if (text) {
          if (nodeName === "uiPlanner") {
            currentPlan += text;
            res.write(JSON.stringify({ type: "plan", content: text }) + "\n");
          } else if (nodeName === "uiCodeGenerator" || nodeName === "uiRepair") {
            generatedCode += text;
            res.write(JSON.stringify({ type: "token", content: text }) + "\n");
          }
        }
      }
    }

    if (isClientDisconnected || abortController.signal.aborted) {
      console.log(`🛑 [page-editor] Generation successfully TERMINATED. Skipping persistence for node ${nodeId}.`);
      try {
        await convexClient.mutation(api.canvas.patchNodeData, {
          projectId: projectId as Id<"projects">,
          nodeId,
          patch: { aiEditing: false },
        });
      } catch (e) { /* best effort */ }
      return;
    }

    // Clean generated code
    const cleanCode = generatedCode
      .replace(/^```(tsx?|typescript|jsx?)?[\r\n]*/gi, "")
      .replace(/[\r\n]*```\s*$/g, "")
      .trim();

    console.log(`[page-editor] Stream loop finished. Total clean code length: ${cleanCode.length} chars`);

    if (!cleanCode) {
      console.error("[page-editor] Error: cleanCode is empty after graph execution.");
      res.write(JSON.stringify({ type: "error", message: "UI Generation returned empty output. Check engine logs." }) + "\n");
      res.end();
      try {
        await convexClient.mutation(api.canvas.patchNodeData, {
          projectId: projectId as Id<"projects">,
          nodeId,
          patch: { aiEditing: false },
        });
      } catch (e) { /* best effort */ }
      return;
    }

    console.log(`[page-editor] Persisting generated code to Convex (${cleanCode.length} chars)...`);
    // Persist to Convex (best-effort sync; web page also syncs with authenticated session)
    try {
      await convexClient.mutation(api.canvas.patchNodeData, {
        projectId: projectId as Id<"projects">,
        nodeId,
        patch: {
          pageSourceCode: cleanCode,
          aiEditing: false,
        },
      });
      console.log("[page-editor] Successfully updated Convex node data.");
    } catch (convexErr) {
      const errMsg = convexErr instanceof Error ? convexErr.message : String(convexErr);
      console.warn("[page-editor] Direct Convex persistence skipped/unauthenticated (will be saved by web page ):", errMsg);
    }

    // Persist AI message response to Convex
    if (activeConversationId) {
      try {
        const assistantSummary = `✅ Page updated! The UI for **${pageName || nodeId}** has been generated.`;
        await convexClient.mutation(api.ai.messages.insertMessage, {
          conversationId: activeConversationId as Id<"conversations">,
          content: assistantSummary,
          role: "assistant",
          plan: currentPlan || undefined,
          createdAt: Date.now(),
        });
        console.log(`[page-editor] Persisted assistant message to Convex conversation ${activeConversationId}`);
      } catch (msgPersistErr) {
        console.warn("[page-editor] Could not persist assistant message to Convex:", msgPersistErr);
      }
    }

    console.log("[page-editor] Sending 'done' event to client.");
    res.write(
      JSON.stringify({
        type: "done",
        code: cleanCode,
        plan: currentPlan,
        conversationId: activeConversationId || undefined,
      }) + "\n"
    );
    res.end();
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === "AbortError";
    if (isClientDisconnected || isAbortError) {
      console.log(`🛑 [page-editor] Generation request aborted by user. Exited cleanly.`);
      try {
        if (req.body?.projectId && req.body?.nodeId) {
          const convexUrl = req.body.convexUrl || process.env.CONVEX_URL;
          if (convexUrl) {
            const client = new ConvexHttpClient(convexUrl);
            await client.mutation(api.canvas.patchNodeData, {
              projectId: req.body.projectId as Id<"projects">,
              nodeId: req.body.nodeId,
              patch: { aiEditing: false },
            });
          }
        }
      } catch (e) { /* best effort */ }
      return;
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Internal Server Error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("[page-editor] Critical error:", errorMessage);
    if (errorStack) console.error("[page-editor] Stack:", errorStack);
    try {
      if (req.body?.projectId && req.body?.nodeId) {
        const convexUrl = req.body.convexUrl || process.env.CONVEX_URL;
        if (convexUrl) {
          const client = new ConvexHttpClient(convexUrl);
          if (req.body.token && typeof req.body.token === "string" && req.body.token.includes(".")) {
            client.setAuth(req.body.token);
          }
          await client.mutation(api.canvas.patchNodeData, {
            projectId: req.body.projectId as Id<"projects">,
            nodeId: req.body.nodeId,
            patch: { aiEditing: false },
          });
        }
      }
    } catch (e) {
      /* best effort unlock */
    }

    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage });
    } else {
      res.write(JSON.stringify({ type: "error", message: errorMessage }) + "\n");
      res.end();
    }
  }
});
