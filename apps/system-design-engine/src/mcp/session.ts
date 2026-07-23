import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AuthContext } from "./auth.js";
import { SupermemorySync } from "../knowledge/sync.js";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import {
  buildGraph,
  traverse,
  findNodesByKeyword,
  getNeighbours,
  serializeSubgraph,
  formatNodeDataLines,
  formatEdgeLine,
  extractEndpointSummaries,
  extractTestCaseSummaries,
} from "../graph/engine.js";
import type { CanvasElements, GraphNode, RawNodeRecord, RawEdgeRecord } from "../graph/types.js";

export interface Session {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  userId?: string;
  orgId?: string;
  keyId?: string;
  projectId?: string;
  clerkToken?: string;
}

export async function createSession(
  sessionId: string,
  auth?: AuthContext | null,
): Promise<Session> {
  console.log(
    `[SESSION] Creating new session: ${sessionId}${auth ? ` for user ${auth.userId}` : ""}`,
  );

  const server = new McpServer({
    name: "System Design Engine",
    version: "1.0.0",
  });

  const syncEngine = new SupermemorySync();

  // If the API key has a bound projectId, tools are restricted to that project only.
  const boundProjectId = auth?.projectId;
  const boundClerkToken = auth?.token;
  console.log(`[SESSION] boundProjectId for session ${sessionId}: ${boundProjectId ?? "NONE (no project bound — tools will error)"}`);

  // ── Supermemory Tools (existing) ────────────────────────────────────────────

  server.registerTool(
    "get_system_design_context",
    {
      description: "PRIMARY TOOL FOR AI CODING AGENTS. Call this tool FIRST to retrieve structured architectural context (services, database entities, web clients, endpoints, data schemas, and test cases/scenarios) for this project. Use this before writing implementation code or test cases to ensure full alignment with system design specifications and test contracts. The project is determined automatically from your API key.",
      inputSchema: {
        query: z.string().describe("The specific query to search the architecture for (e.g., 'How does authentication work?', 'User service schema', or 'Endpoint test cases')")
      },
    },
    async ({ query }) => {
      if (!boundProjectId) {
        return {
          content: [{ type: "text" as const, text: "Unauthorized: this API key is not bound to a project. Please regenerate your key from the Blueprint dashboard." }],
          isError: true,
        };
      }
      console.log(`[TOOL] get_system_design_context called — project=${boundProjectId}, query="${query}"`);
      try {
        const context = await syncEngine.buildCodingContext(boundProjectId, query);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(context, null, 2) }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error retrieving context: ${message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    "search_system_design_memories",
    {
      description: "Granular search tool for AI coding agents. Call this tool to search the architecture knowledge base for this project for specific endpoints, database entities, messaging topics, or test case requirements. Returns filtered, deduplicated results grouped by kind (architecture, services, entities, clients, resources). The project is determined automatically from your API key.",
      inputSchema: {
        query: z.string().describe("The search query string (e.g., 'Payment endpoint test cases', 'Redis stream config', or 'User table columns')"),
        minSimilarity: z.number().optional().describe("Minimum similarity threshold (0-1). Defaults to 0.15")
      },
    },
    async ({ query, minSimilarity }) => {
      if (!boundProjectId) {
        return {
          content: [{ type: "text" as const, text: "Unauthorized: this API key is not bound to a project. Please regenerate your key from the Blueprint dashboard." }],
          isError: true,
        };
      }
      console.log(`[TOOL] search_system_design_memories called — project=${boundProjectId}, query="${query}", minSimilarity=${minSimilarity ?? 0.15}`);
      try {
        const threshold = minSimilarity ?? 0.15;
        const results = await syncEngine.searchMemories(boundProjectId, query);
        console.log(`[TOOL] Raw results from supermemory: ${results.length}`);

        // Filter by similarity
        const strongMatches = results.filter((r) => ((r as { similarity?: number }).similarity ?? 0) > threshold);
        console.log(`[TOOL] After similarity filter (>${threshold}): ${strongMatches.length}`);

        // Dedup by nodeId (keep highest similarity), separate architecture chunks
        const dedupedByNode = new Map<string, { content: string; similarity: number; kind: string }>();
        const architectureChunks: string[] = [];

        for (const r of strongMatches) {
          const rec = r as { chunk?: string; memory?: string; similarity?: number; metadata?: { kind?: string; nodeId?: string } };
          const content = rec.chunk || rec.memory || "";
          const similarity = rec.similarity ?? 0;
          const kind = rec.metadata?.kind || "unknown";
          const nodeId = rec.metadata?.nodeId;

          if (kind === "architecture") {
            architectureChunks.push(content);
          } else if (nodeId) {
            const existing = dedupedByNode.get(nodeId);
            if (!existing || existing.similarity < similarity) {
              dedupedByNode.set(nodeId, { content, similarity, kind });
            }
          }
        }

        const uniqueChunks = Array.from(dedupedByNode.values());

        const testCaseChunks = uniqueChunks
          .filter(c => c.content.includes("Test Cases:"))
          .map(c => {
            const lines = c.content.split('\n');
            const tcIdx = lines.findIndex(l => l.startsWith("Test Cases:"));
            return tcIdx !== -1 ? `${c.content.split('\n')[0]} - ${lines.slice(tcIdx).join('\n')}` : c.content;
          });

        const grouped = {
          architecture: architectureChunks.join("\n\n") || null,
          services: uniqueChunks.filter(c => c.kind === "service").map(c => c.content).slice(0, 5),
          entities: uniqueChunks.filter(c => c.kind === "entity" || c.kind === "db_ref").map(c => c.content).slice(0, 10),
          clients: uniqueChunks.filter(c => c.kind === "webClient").map(c => c.content).slice(0, 5),
          resources: uniqueChunks.filter(c => c.kind === "kafka" || c.kind === "redis").map(c => c.content).slice(0, 5),
          testCases: testCaseChunks.slice(0, 10),
          totalRawResults: results.length,
          filteredResults: strongMatches.length,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(grouped, null, 2) }]
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error searching memories: ${message}` }],
          isError: true
        };
      }
    }
  );

  // ── Graph-Native Tools (new, no LLM, no Supermemory) ───────────────────────

  /** Fetch the full canvas from Convex and return a typed CanvasElements object. */
  async function fetchElements(): Promise<CanvasElements> {
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) throw new Error("CONVEX_URL environment variable is not set.");
    if (!boundProjectId) throw new Error("No project bound to this session.");

    const client = new ConvexHttpClient(convexUrl);
    if (boundClerkToken && boundClerkToken.includes(".") && !boundClerkToken.startsWith("sk_")) {
      client.setAuth(boundClerkToken);
    }

    const raw = await client.query(api.canvas.getBackendElements, {
      projectId: boundProjectId as Id<"projects">,
    });

    return {
      nodes: (raw.nodes as RawNodeRecord[]) ?? [],
      edges: (raw.edges as RawEdgeRecord[]) ?? [],
      endpoints: (raw.endpoints as CanvasElements["endpoints"]) ?? [],
      events: (raw.events as CanvasElements["events"]) ?? [],
      testCases: (raw.testCases as CanvasElements["testCases"]) ?? [],
    };
  }

  const nodeTypeEnum = z.enum([
    "service", "database", "queue", "pubsub", "eventstream", "kafka",
    "redis-streams", "sqs", "redis-pubsub", "redis-cache",
    "entity", "webClient", "external", "group", "db_ref", "storage",
    "worker", "serverless", "search_index", "api_gateway",
    "load_balancer", "webhook", "llm", "mcp_server", "vector_db_ref",
    "identity_provider", "all",
  ]);

  server.registerTool(
    "traverse_architecture_graph",
    {
      description:
        "Graph-traversal tool (no LLM, no vector search). Reads the live canvas directly from " +
        "Convex, performs keyword matching on node labels/descriptions/types, then BFS-traverses " +
        "the graph from those seed nodes. Returns matched nodes, their connections (edges), " +
        "endpoint summaries, and test case summaries. Use this when you need precise, " +
        "deterministic architectural context. The project is determined automatically from your API key.",
      inputSchema: {
        topic: z
          .string()
          .describe(
            "Topic to search for — matched case-insensitively against node labels, descriptions, " +
            "and types. E.g. 'payment service', 'user auth', 'kafka', 'redis'.",
          ),
        depth: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("BFS traversal depth — how many hops from matching nodes to include. Default: 2."),
      },
    },
    async ({ topic, depth }) => {
      if (!boundProjectId) {
        return {
          content: [{ type: "text" as const, text: "Unauthorized: this API key is not bound to a project. Please regenerate your key from the Blueprint dashboard." }],
          isError: true,
        };
      }
      console.log(`[TOOL] traverse_architecture_graph — project=${boundProjectId}, topic="${topic}", depth=${depth ?? 2}`);

      try {
        const elements = await fetchElements();
        const graph = buildGraph(elements);
        const maxDepth = depth ?? 2;

        // 1. Keyword-match seed nodes
        const seeds = findNodesByKeyword(graph, topic);

        // 2. BFS from each seed, deduplicating by nodeId
        const visitedIds = new Set<string>();
        const reachable: GraphNode[] = [];

        for (const seed of seeds) {
          const hits = traverse(graph, seed.nodeId, "both", maxDepth);
          for (const hit of hits) {
            if (!visitedIds.has(hit.node.nodeId)) {
              visitedIds.add(hit.node.nodeId);
              reachable.push(hit.node);
            }
          }
        }

        // 3. Fall back to full graph if nothing matched
        const relevantNodes = reachable.length > 0 ? reachable : Array.from(graph.nodes.values());

        // 4. Gather associated endpoints and test cases
        const nodeIdSet = new Set<string>(relevantNodes.map((n) => n.nodeId));
        const endpointSummaries = extractEndpointSummaries(elements.endpoints, nodeIdSet);
        const testCaseSummaries = extractTestCaseSummaries(elements.testCases, nodeIdSet);

        // 5. Serialize to structured text
        const text = serializeSubgraph(graph, relevantNodes, endpointSummaries, testCaseSummaries, elements);

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "search_architecture_nodes",
    {
      description:
        "Filtered node catalogue (no LLM, no vector search). Returns all canvas nodes matching " +
        "a specific node type and/or keyword, together with their direct neighbours (1-hop). " +
        "Use this when you need a precise list of e.g. all databases, all kafka brokers, " +
        "or all services containing 'auth'. The project is determined automatically from your API key.",
      inputSchema: {
        nodeType: nodeTypeEnum
          .optional()
          .describe("Filter by canvas node type. Omit or use 'all' to include every type."),
        keyword: z
          .string()
          .optional()
          .describe("Additional keyword filter on label/description (case-insensitive substring match)."),
        includeEdges: z
          .boolean()
          .optional()
          .describe("Whether to include direct neighbour connections in the output. Default: true."),
      },
    },
    async ({ nodeType, keyword, includeEdges }) => {
      if (!boundProjectId) {
        return {
          content: [{ type: "text" as const, text: "Unauthorized: this API key is not bound to a project. Please regenerate your key from the Blueprint dashboard." }],
          isError: true,
        };
      }
      console.log(`[TOOL] search_architecture_nodes — project=${boundProjectId}, nodeType=${nodeType ?? "all"}, keyword=${keyword ?? "(none)"}`);

      try {
        const elements = await fetchElements();
        const graph = buildGraph(elements);

        // 1. Start with all nodes
        let candidates = Array.from(graph.nodes.values());

        // 2. Filter by nodeType
        if (nodeType && nodeType !== "all") {
          candidates = candidates.filter((n) => n.type === nodeType);
        }

        // 3. Filter by keyword
        if (keyword) {
          const lower = keyword.toLowerCase();
          candidates = candidates.filter(
            (n) =>
              n.label.toLowerCase().includes(lower) ||
              n.description.toLowerCase().includes(lower),
          );
        }

        // 4. Build output lines
        const shouldIncludeEdges = includeEdges !== false;
        const lines: string[] = [
          `# Architecture Node Catalogue (${candidates.length} node${candidates.length === 1 ? "" : "s"})`,
          "",
        ];

        for (const node of candidates) {
          lines.push(...formatNodeDataLines(node));

          if (shouldIncludeEdges) {
            const hits = getNeighbours(graph, node.nodeId, "both");
            if (hits.length > 0) {
              lines.push("Connections:");
              for (const { edge } of hits) {
                lines.push(formatEdgeLine(edge, graph, elements));
              }
            }
          }

          lines.push("");
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });

  await server.connect(transport);

  return {
    server,
    transport,
    createdAt: Date.now(),
    userId: auth?.userId,
    orgId: auth?.orgId,
    keyId: auth?.keyId,
    projectId: auth?.projectId,
    clerkToken: auth?.token,
  };
}

export function cleanupOldSessions(
  sessions: Map<string, Session>,
  maxAge: number,
): void {
  const now = Date.now();

  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > maxAge) {
      console.log(`[CLEANUP] Removing session: ${id}`);
      sessions.delete(id);
    }
  }
}
