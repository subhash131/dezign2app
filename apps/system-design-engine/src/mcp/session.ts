import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AuthContext } from "./auth.js";
import { SupermemorySync } from "../knowledge/sync.js";
import { z } from "zod";

export interface Session {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  userId?: string;
  orgId?: string;
  keyId?: string;
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

  server.tool(
    "get_system_design_context",
    "Retrieve semantic architectural context (services, entities, clients, architecture plan) for a given project. Use this to understand the system design before writing code.",
    {
      projectId: z.string().describe("The ID of the project to retrieve context for"),
      query: z.string().describe("The specific query to search the architecture for (e.g. 'How does authentication work?' or 'What databases exist?')")
    },
    async ({ projectId, query }) => {
      try {
        const context = await syncEngine.buildCodingContext(projectId, query);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(context, null, 2) }]
        };
      } catch (error: any) {
         return {
            content: [{ type: "text" as const, text: `Error retrieving context: ${error.message}` }],
            isError: true
         }
      }
    }
  );

  server.tool(
    "search_system_design_memories",
    "Search the architecture knowledge base for a project. Returns filtered, deduplicated results grouped by kind (architecture, services, entities, clients, resources).",
    {
      projectId: z.string().describe("The ID of the project to search"),
      query: z.string().describe("The search query string"),
      minSimilarity: z.number().optional().describe("Minimum similarity threshold (0-1). Defaults to 0.5")
    },
    async ({ projectId, query, minSimilarity }) => {
      try {
        const threshold = minSimilarity ?? 0.5;
        const results = await syncEngine.searchMemories(projectId, query);

        // Filter by similarity
        const strongMatches = results.filter((r: any) => (r.similarity ?? 0) > threshold);

        // Dedup by nodeId (keep highest similarity), separate architecture chunks
        const dedupedByNode = new Map<string, { content: string; similarity: number; kind: string }>();
        const architectureChunks: string[] = [];

        for (const r of strongMatches) {
          const content = r.memory || r.chunk || "";
          const similarity = r.similarity ?? 0;
          const kind = (r.metadata?.kind as string) || "unknown";
          const nodeId = r.metadata?.nodeId as string | undefined;

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

        // Group by kind
        const grouped = {
          architecture: architectureChunks.join("\n\n") || null,
          services: uniqueChunks.filter(c => c.kind === "service").map(c => c.content).slice(0, 5),
          entities: uniqueChunks.filter(c => c.kind === "entity" || c.kind === "db_ref").map(c => c.content).slice(0, 10),
          clients: uniqueChunks.filter(c => c.kind === "webClient").map(c => c.content).slice(0, 5),
          resources: uniqueChunks.filter(c => c.kind === "kafka" || c.kind === "redis").map(c => c.content).slice(0, 5),
          totalRawResults: results.length,
          filteredResults: strongMatches.length,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(grouped, null, 2) }]
        };
      } catch (error: any) {
         return {
            content: [{ type: "text" as const, text: `Error searching memories: ${error.message}` }],
            isError: true
         }
      }
    }
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
