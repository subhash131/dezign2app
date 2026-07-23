import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createGraph } from './ai/agent';
import { formatToolCallLog, formatCanvasState } from './ai/utils';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { ConvexHttpClient } from 'convex/browser';
import { api } from "@workspace/backend/_generated/api";
import { SupermemorySync } from './knowledge/sync';
import { extractAuthToken, resolveAuth } from './mcp/auth';
import { createSession, cleanupOldSessions, Session } from './mcp/session';

import { TestCaseItem, BackendNodeItem } from '@workspace/canvas';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.send('System Design Engine is running!');
});

app.post('/canvas-ai', async (req, res) => {
  try {
    const body = req.body;
    const { projectId, chatId, convexUrl: bodyConvexUrl, token, viewportCenter } = body;

    if (!chatId || !projectId) {
      res.status(400).send("Missing required fields");
      return;
    }

    const convexUrl = bodyConvexUrl || process.env.CONVEX_URL;
    if (!convexUrl) {
      res.status(500).send("Missing CONVEX_URL environment variable");
      return;
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

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const event of graphStream) {
      if (event.event === 'on_chat_model_stream') {
        const nodeName = event.metadata?.langgraph_node;
        if (nodeName && !['chatAgent', 'canvasAgent', 'reflectAgent', 'requirementsAgent', 'planAgent'].includes(nodeName)) {
          continue;
        }

        const chunk = event.data.chunk;
        if (chunk.content) {
          res.write(JSON.stringify({ type: 'text', content: chunk.content }) + '\n');
        }
        if (chunk.tool_calls && chunk.tool_calls.length > 0) {
           for (const call of chunk.tool_calls) {
             const name = call.name;
             const message = formatToolCallLog(name, call.args);
             res.write(JSON.stringify({ type: 'tool_call', name, message }) + '\n');
           }
        }
      }
    }
    res.end();
  } catch (error: any) {
    console.error("API error:", error);
    if (!res.headersSent) {
      res.status(500).send(`Internal Server Error: ${error?.message || 'Unknown error'}`);
    } else {
      res.write(JSON.stringify({ type: 'error', message: 'Internal Server Error' }) + '\n');
      res.end();
    }
  }
});

app.post('/sync-supermemory', async (req, res) => {
  try {
    const body = req.body;
    const { projectId, convexUrl: bodyConvexUrl, token } = body;

    if (!projectId) { res.status(400).send("Missing projectId"); return; }
    if (!token) { res.status(401).send("Missing authentication token"); return; }

    const convexUrl = bodyConvexUrl || process.env.CONVEX_URL;
    if (!convexUrl) { res.status(500).send("Missing CONVEX_URL environment variable"); return; }

    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(token);

    let elements;
    try {
      elements = await client.query(api.canvas.getBackendElements, { projectId });
    } catch (e) {
      res.status(403).send("Unauthorized or project not found"); return;
    }

    if (!elements) { res.status(404).send("Project not found"); return; }
    
    const existingPlan = await client.query(api.requirements.getPlan, { projectId });
    const architectureContent = existingPlan?.content || "";

    const rawNodes: BackendNodeItem[] = (elements.nodes as BackendNodeItem[]) || [];
    const rawEdges: Array<{ source: string; target: string }> = elements.edges || [];
    const rawTestCases: TestCaseItem[] = (elements.testCases as TestCaseItem[]) || [];

    const nodeNameMap = new Map<string, string>();
    for (const n of rawNodes) {
      nodeNameMap.set(n.nodeId, n.data?.label || n.nodeId);
    }

    const edgeDeps = new Map<string, string[]>();
    const edgeDepsBy = new Map<string, string[]>();
    
    for (const e of rawEdges) {
       if (!edgeDeps.has(e.source)) edgeDeps.set(e.source, []);
       edgeDeps.get(e.source)!.push(e.target);
       
       if (!edgeDepsBy.has(e.target)) edgeDepsBy.set(e.target, []);
       edgeDepsBy.get(e.target)!.push(e.source);
    }

    const nodes = rawNodes.map((n) => {
      const facts: string[] = [];
      const responsibilities: string[] = [];
      
      if (n.data?.description) responsibilities.push(n.data.description);

      const label = n.data?.label || n.nodeId;

      // Entity → DDL-style: "database schema: Slides(_id uuid PK, presentation_id uuid FK refs Presentations._id, ...)"
      if (n.type === "entity" && Array.isArray(n.data?.columns)) {
        type EntityColumn = {
          name: string;
          type?: string;
          isPrimaryKey?: boolean;
          isForeignKey?: boolean;
          isNotNull?: boolean;
          isUnique?: boolean;
          references?: { table: string; column: string };
        };
        const colDefs = n.data.columns.map((c: EntityColumn) => {
          let def = c.name;
          if (c.type) def += ` ${c.type.toLowerCase()}`;
          if (c.isPrimaryKey) def += " PRIMARY KEY";
          if (c.isForeignKey) def += " FOREIGN KEY";
          if (c.isNotNull) def += " NOT NULL";
          if (c.isUnique) def += " UNIQUE";
          if (c.references) def += ` REFERENCES ${c.references.table}(${c.references.column})`;
          return def;
        });
        facts.push(`database schema: ${label}(${colDefs.join(", ")})`);
      }

      // Service → REST definition: "service: Slides Service\n  POST /slides\n  GET /slides/:id"
      if (n.type === "service" && Array.isArray(n.data?.endpoints)) {
        const epLines = n.data.endpoints
          .map((ep: { type: string; name: string }) => `  ${ep.type} ${ep.name}`)
          .join("\n");
        facts.push(`service: ${label}\n${epLines}`);
      }

      // WebClient → page/event definition: "web client: Presentation Editor\n  event: edit slide\n  event: delete slide"
      if (n.type === "webClient" && Array.isArray(n.data?.events)) {
        const evLines = n.data.events
          .map((ev: { name?: string }) => `  event: ${ev.name || '(unnamed)'}`)
          .join("\n");
        facts.push(`web client: ${label}\n${evLines}`);
      }

      // Kafka → topic definition: "kafka topics for Notifications: user-signed-up, order-placed"
      if (n.type === "kafka" && Array.isArray(n.data?.topics)) {
        const topicNames = n.data.topics.map((t: { name: string }) => t.name).join(", ");
        facts.push(`kafka topics for ${label}: ${topicNames}`);
      }

      // Collect test cases associated with this node
      const nodeTestCases: TestCaseItem[] = [];
      const seenTcIds = new Set<string>();

      const addTc = (tc: TestCaseItem) => {
        const id = tc.id || tc.testCaseId || `${tc.name || ''}-${tc.targetEventId || ''}`;
        if (!seenTcIds.has(id)) {
          seenTcIds.add(id);
          nodeTestCases.push(tc);
        }
      };

      for (const tc of rawTestCases) {
        if (tc.targetNodeId === n.nodeId || tc.nodeId === n.nodeId) {
          addTc(tc);
        } else if (tc.targetEventId && Array.isArray(n.data?.events)) {
          if (n.data.events.some((ev) => ev.id === tc.targetEventId)) {
            addTc(tc);
          }
        }
      }

      if (Array.isArray(n.data?.testCases)) {
        for (const tc of n.data.testCases) addTc(tc);
      }

      if (Array.isArray(n.data?.events)) {
        for (const ev of n.data.events) {
          if (Array.isArray(ev.testCases)) {
            for (const tc of ev.testCases) addTc(tc);
          }
        }
      }

      if (nodeTestCases.length > 0) {
        const tcLines = nodeTestCases.map((tc) => {
          let line = `- ${tc.name || 'Unnamed Test Case'}`;
          const details: string[] = [];
          if (tc.expectedStatus !== undefined) details.push(`Expected Status: ${tc.expectedStatus}`);
          if (tc.request?.body !== undefined && tc.request?.body !== null) {
            const bodyStr = typeof tc.request.body === 'string' ? tc.request.body : JSON.stringify(tc.request.body);
            details.push(`Request Body: ${bodyStr}`);
          }
          if (tc.request?.params && Object.keys(tc.request.params).length > 0) {
            details.push(`Params: ${JSON.stringify(tc.request.params)}`);
          }
          if (tc.expectedBody !== undefined && tc.expectedBody !== null) {
            const expStr = typeof tc.expectedBody === 'string' ? tc.expectedBody : JSON.stringify(tc.expectedBody);
            details.push(`Expected Body: ${expStr}`);
          }
          if (details.length > 0) {
            line += ` (${details.join(' | ')})`;
          }
          return line;
        });
        facts.push(`Test Cases:\n` + tcLines.join('\n'));
      }

      const dependencies = (edgeDeps.get(n.nodeId) || []).map((id: string) => nodeNameMap.get(id) || id);
      const dependents = (edgeDepsBy.get(n.nodeId) || []).map((id: string) => nodeNameMap.get(id) || id);

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

    res.json({ success: true, syncId });
  } catch (error) {
    console.error("Sync error:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post('/clear-supermemory', async (req, res) => {
  try {
    const body = req.body;
    const { projectId, token, convexUrl: bodyConvexUrl } = body;

    if (!projectId) { res.status(400).send("Missing projectId"); return; }
    if (!token) { res.status(401).send("Missing authentication token"); return; }

    const convexUrl = bodyConvexUrl || process.env.CONVEX_URL;
    if (!convexUrl) { res.status(500).send("Missing CONVEX_URL environment variable"); return; }

    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(token);

    try {
      await client.query(api.canvas.getBackendElements, { projectId });
    } catch (e) {
      res.status(403).send("Unauthorized or project not found"); return;
    }

    const supermemorySync = new SupermemorySync();
    await supermemorySync.clearProject(projectId);

    res.json({ success: true });
  } catch (error) {
    console.error("Clear error:", error);
    res.status(500).send("Internal Server Error");
  }
});

import { generateCacheConfig } from './ai/cache-generator';

app.post('/test-supermemory-fetch', async (req, res) => {
  try {
    const body = req.body;
    const { projectId, query } = body;

    if (!projectId || !query) { res.status(400).send("Missing projectId or query"); return; }

    const supermemorySync = new SupermemorySync();
    const result = await supermemorySync.buildCodingContext(projectId, query);

    res.json(result);
  } catch (error) {
    console.error("Test fetch error:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post('/generate-cache-config', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) {
      res.status(400).json({ error: "Missing description" });
      return;
    }
    const config = await generateCacheConfig(description);
    res.json(config);
  } catch (error) {
    console.error("Generate cache config error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// MCP Endpoints
const sessions = new Map<string, Session>();
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours
const SESSION_CLEANUP_INTERVAL = 1000 * 60 * 60; // 1 hour

setInterval(() => {
  cleanupOldSessions(sessions, SESSION_MAX_AGE);
}, SESSION_CLEANUP_INTERVAL);

app.options('/mcp', (req, res) => {
  res.sendStatus(204);
});

app.all('/mcp', async (req, res) => {
  try {
    const existingSessionId = req.headers["mcp-session-id"] as string | undefined;

    console.log(`\n[DEBUG] ${req.method} /mcp`);

    const authToken = extractAuthToken(req);

    // Detect if this is an initialize request
    const isInitialize = req.method === "POST" && req.body?.method === "initialize";

    let sessionId: string;

    if (isInitialize || !existingSessionId) {
      // Resolve auth context (optional for local testing)
      const authContext = authToken ? await resolveAuth(authToken) : null;

      if (!authContext) {
        console.warn(`[AUTH] Warning: No valid auth token provided. Allowing unauthenticated session for local testing.`);
      }

      // Create a fresh session for initialize requests
      sessionId = crypto.randomUUID();
      console.log(
        `\n[REQUEST] ${req.method} /mcp | New session=${sessionId} | Auth: user=${authContext?.userId || 'anonymous'}`,
      );

      const session = await createSession(sessionId, authContext);
      sessions.set(sessionId, session);

      res.setHeader("mcp-session-id", sessionId);

      if (req.method === "GET") {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        await session.transport.handleRequest(req, res);
      } else {
        await session.transport.handleRequest(req, res, req.body);
      }
    } else {
      sessionId = existingSessionId;
      const session = sessions.get(sessionId);

      if (!session) {
        console.error(`[REQUEST] Session not found: ${sessionId}`);
        res.status(404).json({ error: "Session not found" });
        return;
      }

      console.log(
        `\n[REQUEST] ${req.method} /mcp | session=${sessionId}${session.userId ? ` | user=${session.userId}` : ""}`,
      );

      // Check for token updates
      if (authToken) {
        const auth = await resolveAuth(authToken);
        if (auth && (!session.userId || session.userId !== auth.userId)) {
           console.log(`[AUTH] Updating session ${sessionId} context for user ${auth.userId}`);
           session.userId = auth.userId;
           session.orgId = auth.orgId;
           session.keyId = auth.keyId;
           session.projectId = auth.projectId;
           session.clerkToken = auth.token;
        }
      }

      res.setHeader("mcp-session-id", sessionId);
      if (req.method === "GET") {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        await session.transport.handleRequest(req, res);
      } else {
        await session.transport.handleRequest(req, res, req.body);
      }
    }

    console.log(`[RESPONSE] Done for session=${sessionId}`);
  } catch (err) {
    console.error("[ERROR]", err);
    res.status(500).json({ error: "Internal MCP server error" });
  }
});


const port = 3002;
app.listen(port, () => {
  console.log(`System Design Engine is running on port ${port} (Express)`);
});

