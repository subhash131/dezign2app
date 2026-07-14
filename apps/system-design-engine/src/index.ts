import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { createGraph } from './ai/agent';
import { formatToolCallLog } from './ai/utils';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { ConvexHttpClient } from 'convex/browser';
import { api } from "@workspace/backend/_generated/api";

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
    let backendCanvasState = "Canvas is empty.";
    if (elements && elements.nodes && elements.nodes.length > 0) {
      let output = "Backend Canvas Nodes:\n";
      elements.nodes.forEach((n) => {
        let extra = "";
        if (n.type === "entity" && n.data.columns) {
          extra += `\n  Columns (use for 'sourceHandle'/'targetHandle'): ` + (n.data.columns as any[]).map((c) => `${c.name} (ID: ${c.id})`).join(", ");
        }
        if (n.type === "service" && n.data.endpoints) {
          extra += `\n  Endpoints: ` + (n.data.endpoints as any[]).map((ep) => `${ep.type} ${ep.name} (targetHandle="endpoints-in-${ep.id}", sourceHandle="endpoints-out-${ep.id}")`).join("\n    ");
        }
        if (n.type === "webClient" && n.data.events) {
          extra += `\n  Events: ` + (n.data.events as any[]).map((ev) => `${ev.name} (sourceHandle="events-${ev.id}")`).join("\n    ");
        }
        if (n.type === "kafka" && n.data.topics) {
          extra += `\n  Topics: ` + (n.data.topics as any[]).map((t) => `${t.name} (targetHandle="topics:in:${t.id}", sourceHandle="topics:out:${t.id}")`).join("\n    ");
        }
        output += `- [${n.type}] id: ${n.nodeId}, label: "${n.data.label}"${extra}\n`;
      });

      if (elements.edges && elements.edges.length > 0) {
        output += "\nConnections:\n";
        elements.edges.forEach((e) => {
          const sourceNode = elements.nodes.find((n) => n.nodeId === e.source)?.data.label || e.source;
          const targetNode = elements.nodes.find((n) => n.nodeId === e.target)?.data.label || e.target;
          const label = e.data?.label ? ` (label: ${e.data.label})` : "";
          output += `- ${sourceNode} -> ${targetNode} [${e.type}]${label}\n`;
        });
      }
      backendCanvasState = output;
    }
    
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

const port = 3002;
console.log(`System Design Engine is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
