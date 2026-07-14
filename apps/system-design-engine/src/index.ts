import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { createGraph } from './ai/agent';
import { formatToolCallLog, formatCanvasState } from './ai/utils';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { ConvexHttpClient } from 'convex/browser';
import { api } from "@workspace/backend/_generated/api";
import { SupermemorySync } from './knowledge/sync';

const app = new Hono();

app.get('/', (c) => {
  return c.text('System Design Engine is running!');
});

app.post('/canvas-ai', async (c) => {
  try {
    const body = await c.req.json();
    const { projectId, chatId, convexUrl: bodyConvexUrl, token, viewportCenter } = body;

    if (!chatId || !projectId) {
      return c.text("Missing required fields", 400);
    }

    const convexUrl = bodyConvexUrl || process.env.CONVEX_URL;
    if (!convexUrl) {
      return c.text("Missing CONVEX_URL environment variable", 500);
    }

    const client = new ConvexHttpClient(convexUrl);
    if (token) client.setAuth(token);

    const messages = await client.query(api.project_chat.getMessages, { chatId });

    const agent = createGraph();
    
    const existingRequirements = await client.query(api.requirements.get, { projectId });
    const existingPlan = await client.query(api.requirements.getPlan, { projectId });
    
    // Fetch canvas state directly from backend
    const elements = await client.query(api.canvas.getBackendElements, { projectId });
    const backendCanvasState = formatCanvasState(elements);
    
    // Prepare initial state
    const formattedMessages = messages.map((m) => 
      m.role === 'assistant' ? new AIMessage(m.content) : new HumanMessage(m.content)
    );

    const graphStream = await agent.streamEvents(
      { 
        messages: formattedMessages,
        projectId,
        convexUrl,
        token,
        viewportCenter,
        canvasStateContext: backendCanvasState,
        requirements: existingRequirements ?? { functional: [], nonFunctional: [], assumptions: [], status: "pending" },
        implementationPlan: existingPlan ?? { content: "", status: "none" }
      },
      { version: 'v2' }
    );

    c.header('Content-Type', 'application/x-ndjson');
    c.header('Cache-Control', 'no-cache');

    return stream(c, async (streamWriter) => {
      for await (const event of graphStream) {
        if (event.event === 'on_chat_model_stream') {
          // Only stream output from user-facing agent nodes.
          // This prevents internal nodes like intentIdentifier or syncRequirements
          // from leaking their raw JSON or internal prompts to the UI.
          const nodeName = event.metadata?.langgraph_node;
          if (nodeName && !['chatAgent', 'canvasAgent', 'reflectAgent', 'requirementsAgent', 'planAgent'].includes(nodeName)) {
            continue;
          }

          const chunk = event.data.chunk;
          if (chunk.content) {
            await streamWriter.write(JSON.stringify({ type: 'text', content: chunk.content }) + '\n');
          }
          if (chunk.tool_calls && chunk.tool_calls.length > 0) {
             for (const call of chunk.tool_calls) {
               const name = call.name;
               const message = formatToolCallLog(name, call.args);
               await streamWriter.write(JSON.stringify({ type: 'tool_call', name, message }) + '\n');
             }
          }
        }
      }
    });

  } catch (error) {
    console.error("API error:", error);
    return c.text("Internal Server Error", 500);
  }
});

app.post('/sync-supermemory', async (c) => {
  try {
    const body = await c.req.json();
    const { projectId, convexUrl: bodyConvexUrl, token } = body;

    if (!projectId) {
      return c.text("Missing projectId", 400);
    }
    if (!token) {
      return c.text("Missing authentication token", 401);
    }

    const convexUrl = bodyConvexUrl || process.env.CONVEX_URL;
    if (!convexUrl) {
      return c.text("Missing CONVEX_URL environment variable", 500);
    }

    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(token);

    // Fetch canvas state. If the user doesn't have access to this project,
    // this query should fail or return null, serving as our authz check.
    let elements;
    try {
      elements = await client.query(api.canvas.getBackendElements, { projectId });
    } catch (e) {
      return c.text("Unauthorized or project not found", 403);
    }

    if (!elements) {
      return c.text("Project not found", 404);
    }
    
    // Fetch architecture document
    const existingPlan = await client.query(api.requirements.getPlan, { projectId });
    const architectureContent = existingPlan?.content || "";

    const rawNodes = elements.nodes || [];
    const rawEdges = elements.edges || [];

    const nodeNameMap = new Map<string, string>();
    for (const n of rawNodes) {
      nodeNameMap.set(n.nodeId, n.data?.label || n.nodeId);
    }

    const edgeDeps = new Map<string, string[]>(); // nodeId -> array of dependency nodeIds
    const edgeDepsBy = new Map<string, string[]>(); // nodeId -> array of dependent nodeIds
    
    for (const e of rawEdges) {
       if (!edgeDeps.has(e.source)) edgeDeps.set(e.source, []);
       edgeDeps.get(e.source)!.push(e.target);
       
       if (!edgeDepsBy.has(e.target)) edgeDepsBy.set(e.target, []);
       edgeDepsBy.get(e.target)!.push(e.source);
    }

    const nodes = rawNodes.map((n) => {
      const facts: string[] = [];
      const responsibilities: string[] = [];
      
      if (n.data?.description) {
        responsibilities.push(n.data.description as string);
      }
      
      if (n.type === "entity" && Array.isArray(n.data?.columns)) {
        facts.push(`Columns:\n` + n.data.columns.map((c: { name: string }) => `- ${c.name}`).join("\n"));
      }
      if (n.type === "service" && Array.isArray(n.data?.endpoints)) {
        facts.push(`Endpoints:\n` + n.data.endpoints.map((ep: { type: string; name: string }) => `- ${ep.type} ${ep.name}`).join("\n"));
      }
      if (n.type === "webClient" && Array.isArray(n.data?.events)) {
        facts.push(`Events:\n` + n.data.events.map((ev: { name: string }) => `- ${ev.name}`).join("\n"));
      }
      if (n.type === "kafka" && Array.isArray(n.data?.topics)) {
        facts.push(`Topics:\n` + n.data.topics.map((t: { name: string }) => `- ${t.name}`).join("\n"));
      }

      const dependencies = (edgeDeps.get(n.nodeId) || []).map(id => nodeNameMap.get(id) || id);
      const dependents = (edgeDepsBy.get(n.nodeId) || []).map(id => nodeNameMap.get(id) || id);

      return {
        projectId,
        nodeId: n.nodeId,
        kind: n.type || "unknown",
        name: nodeNameMap.get(n.nodeId)!,
        dependencies,
        dependents,
        responsibilities,
        facts,
        version: 1
      };
    });

    const syncId = Date.now().toString();
    const supermemorySync = new SupermemorySync();
    await supermemorySync.syncGraph(projectId, syncId, nodes, architectureContent);

    return c.json({ success: true, syncId });
  } catch (error) {
    console.error("Sync error:", error);
    return c.text("Internal Server Error", 500);
  }
});

app.post('/test-supermemory-fetch', async (c) => {
  try {
    const body = await c.req.json();
    const { projectId, query } = body;

    if (!projectId || !query) {
      return c.text("Missing projectId or query", 400);
    }

    const supermemorySync = new SupermemorySync();
    const result = await supermemorySync.buildCodingContext(projectId, query);

    return c.json(result);
  } catch (error) {
    console.error("Test fetch error:", error);
    return c.text("Internal Server Error", 500);
  }
});

const port = 3002;
console.log(`System Design Engine is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
