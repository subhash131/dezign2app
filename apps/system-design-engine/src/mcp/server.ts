import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SupermemorySync } from "../knowledge/sync.js";

export function createMcpServer() {
  const server = new McpServer({
    name: "System Design Engine",
    version: "1.0.0",
  });

  const syncEngine = new SupermemorySync();

  server.registerTool(
    "get_system_design_context",
    {
      description: "Retrieve semantic architectural context (services, entities, clients, architecture plan) for a given project. Use this to understand the system design before writing code.",
      inputSchema: {
        projectId: z.string().describe("The ID of the project to retrieve context for"),
        query: z.string().describe("The specific query to search the architecture for (e.g. 'How does authentication work?' or 'What databases exist?')")
      }
    },
    async ({ projectId, query }) => {
      try {
        const context = await syncEngine.buildCodingContext(projectId, query);
        return {
          content: [{ type: "text", text: JSON.stringify(context, null, 2) }]
        };
      } catch (error: any) {
         return {
            content: [{ type: "text", text: `Error retrieving context: ${error.message}` }],
            isError: true
         }
      }
    }
  );

  server.registerTool(
    "search_system_design_memories",
    {
      description: "Perform a raw search against the architecture knowledge base for a project. Returns raw matching chunks and metadata.",
      inputSchema: {
        projectId: z.string().describe("The ID of the project to search"),
        query: z.string().describe("The search query string")
      }
    },
    async ({ projectId, query }) => {
      try {
        const results = await syncEngine.searchMemories(projectId, query);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
        };
      } catch (error: any) {
         return {
            content: [{ type: "text", text: `Error searching memories: ${error.message}` }],
            isError: true
         }
      }
    }
  );

  return server;
}

export async function startStdioServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("System Design Engine MCP Server running on stdio");
}
