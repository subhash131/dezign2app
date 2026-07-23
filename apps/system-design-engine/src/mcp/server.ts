import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SupermemorySync } from "../knowledge/sync.js";
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
  generateSystemOverview,
} from "../graph/engine.js";
import type { CanvasElements, GraphNode, RawNodeRecord, RawEdgeRecord } from "../graph/types.js";

export function createMcpServer() {
  const server = new McpServer({
    name: "System Design Engine",
    version: "1.0.0",
  });

  // ── Native DB Tools ─────────────────────────────────────────────────────────

  server.registerTool(
    "get_system_design_context",
    {
      description: "PRIMARY TOOL FOR AI CODING AGENTS. Call this tool FIRST to retrieve structured architectural context (database entity schemas/relations, services, web clients, endpoints, data schemas, and test cases) directly from the project database.",
      inputSchema: {
        projectId: z.string().describe("The ID of the project to retrieve context for"),
        query: z.string().optional().describe("Optional specific query or topic to filter the system design context (e.g., 'auth', 'user', 'kafka')")
      }
    },
    async ({ projectId, query }) => {
      try {
        const elements = await fetchElements(projectId);
        const text = generateSystemOverview(elements, query);
        return {
          content: [{ type: "text" as const, text }]
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

  // ── Graph-Native Tools (new, no LLM, no Supermemory) ───────────────────────

  /** Fetch canvas elements from Convex for a given projectId. */
  async function fetchElements(projectId: string): Promise<CanvasElements> {
    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) throw new Error("CONVEX_URL environment variable is not set.");

    const client = new ConvexHttpClient(convexUrl);

    const raw = await client.query(api.canvas.getBackendElements, {
      projectId: projectId as Id<"projects">,
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
        "deterministic architectural context.",
      inputSchema: {
        projectId: z.string().describe("The ID of the project to traverse"),
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
    async ({ projectId, topic, depth }) => {
      console.log(`[TOOL] traverse_architecture_graph — project=${projectId}, topic="${topic}", depth=${depth ?? 2}`);

      try {
        const elements = await fetchElements(projectId);
        const graph = buildGraph(elements);
        const maxDepth = depth ?? 2;

        const seeds = findNodesByKeyword(graph, topic);

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

        const relevantNodes = reachable.length > 0 ? reachable : Array.from(graph.nodes.values());
        const nodeIdSet = new Set<string>(relevantNodes.map((n) => n.nodeId));
        const endpointSummaries = extractEndpointSummaries(elements.endpoints, nodeIdSet);
        const testCaseSummaries = extractTestCaseSummaries(elements.testCases, nodeIdSet);
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
        "or all services containing 'auth'.",
      inputSchema: {
        projectId: z.string().describe("The ID of the project to query"),
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
    async ({ projectId, nodeType, keyword, includeEdges }) => {
      console.log(`[TOOL] search_architecture_nodes — project=${projectId}, nodeType=${nodeType ?? "all"}, keyword=${keyword ?? "(none)"}`);

      try {
        const elements = await fetchElements(projectId);
        const graph = buildGraph(elements);

        let candidates = Array.from(graph.nodes.values());

        if (nodeType && nodeType !== "all") {
          candidates = candidates.filter((n) => n.type === nodeType);
        }

        if (keyword) {
          const lower = keyword.toLowerCase();
          candidates = candidates.filter(
            (n) =>
              n.label.toLowerCase().includes(lower) ||
              n.description.toLowerCase().includes(lower),
          );
        }

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

  return server;
}

export async function startStdioServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("System Design Engine MCP Server running on stdio");
}
