import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { createGraph } from './ai/agent.js';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ConvexHttpClient } from 'convex/browser';

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

    const messages = await client.query("project_chat:getMessages" as any, { chatId });

    const agent = createGraph();
    
    const existingRequirements = await client.query("requirements:get" as any, { projectId });
    const existingPlan = await client.query("requirements:getPlan" as any, { projectId });
    
    // Fetch canvas state directly from backend
    const elements: any = await client.query("canvas:getBackendElements" as any, { projectId });
    let backendCanvasState = "Canvas is empty.";
    if (elements && elements.nodes && elements.nodes.length > 0) {
      let output = "Backend Canvas Nodes:\n";
      elements.nodes.forEach((n: any) => {
        let extra = "";
        if (n.type === "entity" && n.data.columns) {
          extra = ` (Columns: ${n.data.columns.map((c: any) => c.name).join(", ")})`;
        }
        output += `- [${n.type}] id: ${n.nodeId}, label: "${n.data.label}"${extra}\n`;
      });

      if (elements.edges && elements.edges.length > 0) {
        output += "\nConnections:\n";
        elements.edges.forEach((e: any) => {
          const sourceNode = elements.nodes.find((n: any) => n.nodeId === e.source)?.data.label || e.source;
          const targetNode = elements.nodes.find((n: any) => n.nodeId === e.target)?.data.label || e.target;
          const label = e.data?.label ? ` (label: ${e.data.label})` : "";
          output += `- ${sourceNode} -> ${targetNode} [${e.type}]${label}\n`;
        });
      }
      backendCanvasState = output;
    }
    
    // Prepare initial state
    const formattedMessages = messages.map((m: any) => 
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

    return stream(c, async (streamWriter: any) => {
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
               // We no longer need to translate and send CanvasOperation
               // because the tools apply mutations directly to Convex.
               // We just stream a notification to the frontend that a tool was used.
               await streamWriter.write(JSON.stringify({ type: 'tool_call', name }) + '\n');
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
