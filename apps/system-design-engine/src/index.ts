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

    const convexUrl = bodyConvexUrl || process.env.CONVEX_URL;
    if (!convexUrl) {
      return c.text("Missing CONVEX_URL environment variable", 500);
    }

    const client = new ConvexHttpClient(convexUrl);
    if (token) client.setAuth(token);

    // Fetch canvas state
    const elements = await client.query(api.canvas.getBackendElements, { projectId });
    
    const nodes = (elements?.nodes || []).map((n: any) => {
      let facts: string[] = [];
      if (n.data?.description) facts.push(`Description: ${n.data.description}`);
      if (n.type === "entity" && n.data.columns) {
        facts.push(`Columns: ` + (n.data.columns as any[]).map(c => `${c.name}`).join(", "));
      }
      if (n.type === "service" && n.data.endpoints) {
        facts.push(`Endpoints: ` + (n.data.endpoints as any[]).map(ep => `${ep.type} ${ep.name}`).join(", "));
      }
      if (n.type === "webClient" && n.data.events) {
        facts.push(`Events: ` + (n.data.events as any[]).map(ev => `${ev.name}`).join(", "));
      }
      if (n.type === "kafka" && n.data.topics) {
        facts.push(`Topics: ` + (n.data.topics as any[]).map(t => `${t.name}`).join(", "));
      }

      return {
        projectId,
        nodeId: n.nodeId,
        type: n.type,
        name: n.data?.label || n.nodeId,
        facts,
        version: 1
      };
    });

    const edges = (elements?.edges || []).map((e: any) => {
      return {
        projectId,
        edgeId: e.edgeId,
        sourceId: e.source,
        targetId: e.target,
        relationType: e.type || 'connects',
        version: 1
      };
    });

    const supermemorySync = new SupermemorySync();
    await supermemorySync.syncGraph(projectId, nodes, edges);

    return c.json({ success: true });
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
    const result = await supermemorySync.searchProjectContext(projectId, query);

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
