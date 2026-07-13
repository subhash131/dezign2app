import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GraphTraverser } from "../graph/traverser";
import { GraphRepository } from "../graph/repository";

export function createMcpServer(repo: GraphRepository) {
  const server = new McpServer({
    name: "System Design Engine",
    version: "1.0.0",
  });

  const traverser = new GraphTraverser(repo);

  server.tool(
    "trace_upstream",
    "Find all upstream dependencies of a node",
    {
      projectId: z.string(),
      targetId: z.string()
    },
    async ({ projectId, targetId }) => {
      const dependencies = await traverser.traceUpstream(projectId, targetId);
      return {
        content: [{ type: "text", text: JSON.stringify(dependencies, null, 2) }]
      };
    }
  );

  server.tool(
    "trace_downstream",
    "Find all downstream dependencies of a node",
    {
      projectId: z.string(),
      sourceId: z.string()
    },
    async ({ projectId, sourceId }) => {
      const dependencies = await traverser.traceDownstream(projectId, sourceId);
      return {
        content: [{ type: "text", text: JSON.stringify(dependencies, null, 2) }]
      };
    }
  );

  return server;
}

export async function startStdioServer(repo: GraphRepository) {
  const server = createMcpServer(repo);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
