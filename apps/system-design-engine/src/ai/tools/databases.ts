import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphAnnotation } from "../state";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { getConvexClient } from "../utils";
import { dbRefDataSchema, entityColumnInputSchema } from "../schemas";

export const addSchemaTool = tool(
  async (input, config) => {
    const { label, description, columns, groupId } = input;
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    const entityId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const fractionalIndex = "a0" + Date.now() + Math.random().toString(36).slice(2, 6);
    
    const offsetX = Math.floor(Math.random() * 600) - 300;
    const offsetY = Math.floor(Math.random() * 600) - 300;
    const position = state.viewportCenter
      ? { x: state.viewportCenter.x + offsetX, y: state.viewportCenter.y + offsetY }
      : { x: 100 + offsetX, y: 100 + offsetY };

    try {
      await convex.mutation(api.canvas.upsertBackendNode, {
        projectId: state.projectId as Id<"projects">,
        nodeId: entityId,
        type: "entity",
        position,
        data: { label, description, columns, parentId: groupId },
        fractionalIndex,
      });

      return `Added schema '${label}' with ID ${entityId}${groupId ? ` inside group ${groupId}` : ''}`;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to add schema: ${e.message || String(error)}`;
    }
  },
  {
    name: "add_single_schema",
    description: "Add a single database schema (table/entity) to the canvas.",
    schema: z.object({
      label: z.string().describe("Name of the table/entity (e.g. 'Users')"),
      description: z.string().optional(),
      // groupId: z.string().optional().describe("Optional ID of the schema group to place this schema inside"),
      columns: z.array(entityColumnInputSchema).describe("The columns/fields of the table"),
    })
  }
);

export const addDbRefNodeTool = tool(
  async (input, config) => {
    const { label, type, data } = input;
    const description = input.description || data?.description;
    const tableRef = input.tableRef || data?.tableRef;
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

    try {
      await convex.mutation(api.canvas.upsertBackendNode, {
        projectId: state.projectId as Id<"projects">,
        nodeId,
        type: "db_ref",
        position,
        data: { label, description, tableRef, graphPosition: position },
        fractionalIndex,
      });

      return `Added table reference node '${label}' with ID ${nodeId}`;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to add table reference node: ${e.message || String(error)}`;
    }
  },
  {
    name: "add_db_ref_node",
    description: "Add a database table reference node to the canvas. Use this to represent a reference to an existing database table (entity) so services can connect to it.",
    schema: dbRefDataSchema.extend({
      label: z.string().describe("Name of the table reference (e.g. 'Users Table')"),
      tableRef: z.string().optional().describe("The ID of the target entity node this references, if known"),
      type: z.string().optional(),
      data: z.any().optional(),
    })
  }
);
