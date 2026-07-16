import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphAnnotation } from "../state";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { getConvexClient } from "../utils";
import { clientEventInputSchema } from "../schemas";

export const addClientNodeTool = tool(
  async (input, config) => {
    const { label, description, events } = input;
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    const nodeId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const offsetX = Math.floor(Math.random() * 600) - 300;
    const offsetY = Math.floor(Math.random() * 600) - 300;
    const position = state.viewportCenter
      ? { x: state.viewportCenter.x + offsetX, y: state.viewportCenter.y + offsetY }
      : { x: 100 + offsetX, y: 100 + offsetY };
    const fractionalIndex = "a0" + Date.now() + Math.random().toString(36).slice(2, 6);

    const processedEvents = (events || []).map((ev) => ({
      ...ev,
      id: (ev as {id?: string}).id || Math.random().toString(36).slice(2, 9),
    }));

    try {
      await convex.mutation(api.canvas.upsertBackendNode, {
        projectId: state.projectId as Id<"projects">,
        nodeId,
        type: "webClient",
        position,
        data: {
          label,
          description,
          events: processedEvents,
          graphPosition: position,
        },
        fractionalIndex,
      });

      const edgesToCreate = [];
      for (const ev of processedEvents) {
        if (ev.targetNodeId && ev.targetEndpointId) {
          edgesToCreate.push({
            source: nodeId,
            target: ev.targetNodeId,
            sourceHandle: `events-${ev.id}`,
            targetHandle: `endpoints-in-${ev.targetEndpointId}`,
            type: "connection",
          });
        } else if (ev.targetNodeId) {
          edgesToCreate.push({
            source: nodeId,
            target: ev.targetNodeId,
            sourceHandle: `events-${ev.id}`,
            targetHandle: undefined,
            type: "connection",
          });
        }
      }

      for (const edge of edgesToCreate) {
        const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const edgeFractionalIndex = "a0" + Date.now() + Math.random().toString(36).slice(2, 6);
        await convex.mutation(api.canvas.upsertBackendEdge, {
          projectId: state.projectId as Id<"projects">,
          edgeId,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          fractionalIndex: edgeFractionalIndex,
        });
      }

      let resultStr = `Added client node ${label} with ID ${nodeId} and ${events?.length || 0} events.`;
      if (processedEvents.length > 0) {
        resultStr += `\nEvents:\n` + processedEvents.map((ev) => `- ${ev.name}: sourceHandle="events-${ev.id}"`).join("\n");
      }
      return resultStr;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to add client node: ${e.message || String(error)}`;
    }
  },
  {
    name: "add_client_node",
    description: "Add a Web Client (frontend) node to the backend canvas, including a collection of user events on the page.",
    schema: z.object({
      label: z.string().describe("Name of the client page/component (e.g., 'Login Page')"),
      description: z.string().optional(),
      events: z.array(clientEventInputSchema).optional(),
    })
  }
);
