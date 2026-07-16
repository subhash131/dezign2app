import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphAnnotation } from "../state";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { getConvexClient } from "../utils";

export const addEdgeTool = tool(
  async ({ source, target, type, data, sourceHandle, targetHandle }, config) => {
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    try {
      const elements = await convex.query(api.canvas.getBackendElements, {
        projectId: state.projectId as Id<"projects">,
      });
      const sourceExists = elements.nodes.some((n) => n.nodeId === source);
      const targetExists = elements.nodes.some((n) => n.nodeId === target);
      if (!sourceExists) return `Failed to add edge: source node ${source} does not exist`;
      if (!targetExists) return `Failed to add edge: target node ${target} does not exist`;

      const duplicate = elements.edges.find((edge) =>
        edge.source === source &&
        edge.target === target &&
        edge.type === type &&
        (edge.sourceHandle ?? undefined) === (sourceHandle || undefined) &&
        (edge.targetHandle ?? undefined) === (targetHandle || undefined)
      );
      if (duplicate) {
        return `DUPLICATE_EDGE: edge ${duplicate.edgeId} already connects ${source} to ${target}`;
      }

      const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const fractionalIndex = "a0" + Date.now() + Math.random().toString(36).slice(2, 6);

      await convex.mutation(api.canvas.upsertBackendEdge, {
        projectId: state.projectId as Id<"projects">,
        edgeId,
        source,
        target,
        type,
        sourceHandle: sourceHandle || undefined,
        targetHandle: targetHandle || undefined,
        data: data || {},
        fractionalIndex,
      });
      return `Added edge from ${source} to ${target}`;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to add edge: ${e.message || String(error)}`;
    }
  },
  {
    name: "add_edge",
    description: `Connect two nodes on the backend canvas. Both nodes must already exist.
Important handle rules:
- Client to Service: sourceHandle="events-{id}" -> targetHandle="endpoints-in-{id}" (type: "connection")
- Service to Broker: sourceHandle="publishedEvents-out-{id}" -> targetHandle="topics:in:{topicId}" (or queues:in:{id}, streams:in:{id}, channels:in:{id}) (type: "message")
- Broker to Service: sourceHandle="topics:out:{topicId}" (or queues:out:{id}, streams:out:{id}, channels:out:{id}) -> targetHandle="consumedEvents-in-{id}" (type: "message")
- Service to Service: sourceHandle="endpoints-out-{id}" -> targetHandle="endpoints-in-{id}" (type: "connection")
- Service to External API: sourceHandle="endpoints-out-{id}" -> targetHandle="actions-{id}" (type: "connection")
- DB Entity to DB Entity: sourceHandle="source-{id}" -> targetHandle="target-{id}" (type: "foreign-key")
- DB reference: sourceHandle="endpoints-out-{id}" -> targetHandle="database-target" (type: "connection")`,
    schema: z.object({
      source: z.string().describe("Source node ID"),
      target: z.string().describe("Target node ID"),
      type: z.enum(["connection", "foreign-key", "message"]),
      sourceHandle: z.string().optional().describe("The ID of the source handle. See rules."),
      targetHandle: z.string().optional().describe("The ID of the target handle. See rules."),
      data: z.any().optional(),
    }),
  }
);

export const deleteEdgeTool = tool(
  async ({ id }, config) => {
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    try {
      await convex.mutation(api.canvas.removeBackendEdge, {
        projectId: state.projectId as Id<"projects">,
        edgeId: id,
      });
      return `Deleted edge ${id}`;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to delete edge: ${e.message || String(error)}`;
    }
  },
  {
    name: "delete_edge",
    description: "Delete an edge from the backend canvas.",
    schema: z.object({ id: z.string() }),
  }
);

export const addSchemaEdgeTool = tool(
  async ({ sourceEntityId, targetEntityId, sourceColumnName, targetColumnName }, config) => {
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    try {
      const elements = await convex.query(api.canvas.getBackendElements, {
        projectId: state.projectId as Id<"projects">,
      });
      const sourceEntity = elements.nodes.find((n) => n.nodeId === sourceEntityId && n.type === "entity");
      const targetEntity = elements.nodes.find((n) => n.nodeId === targetEntityId && n.type === "entity");
      if (!sourceEntity) return `Failed: source entity ${sourceEntityId} not found`;
      if (!targetEntity) return `Failed: target entity ${targetEntityId} not found`;

      const sourceColumns = sourceEntity.data?.columns || [];
      const targetColumns = targetEntity.data?.columns || [];

      const sourceIndex = sourceColumns.findIndex((c: any) => c.name === sourceColumnName);
      const targetIndex = targetColumns.findIndex((c: any) => c.name === targetColumnName);

      if (sourceIndex === -1) return `Failed: column ${sourceColumnName} not found in source entity`;
      if (targetIndex === -1) return `Failed: column ${targetColumnName} not found in target entity`;

      const sourceHandle = `source-${sourceIndex}`;
      const targetHandle = `target-${targetIndex}`;

      const duplicate = elements.edges.find((edge) =>
        edge.source === sourceEntityId &&
        edge.target === targetEntityId &&
        edge.type === "foreign-key" &&
        edge.sourceHandle === sourceHandle &&
        edge.targetHandle === targetHandle
      );
      if (duplicate) {
        return `DUPLICATE_EDGE: edge already connects these columns`;
      }

      const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const fractionalIndex = "a0" + Date.now() + Math.random().toString(36).slice(2, 6);

      await convex.mutation(api.canvas.upsertBackendEdge, {
        projectId: state.projectId as Id<"projects">,
        edgeId,
        source: sourceEntityId,
        target: targetEntityId,
        type: "foreign-key",
        sourceHandle,
        targetHandle,
        data: { sourceCardinality: "N", targetCardinality: "1" },
        fractionalIndex,
      });
      return `Added foreign-key edge from ${sourceEntity.data?.label}.${sourceColumnName} to ${targetEntity.data?.label}.${targetColumnName}`;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to add schema edge: ${e.message || String(error)}`;
    }
  },
  {
    name: "add_schema_edge",
    description: `Connect two database entities (schemas) with a foreign key edge. You provide the entity IDs and column names, and this tool will automatically find the correct handle indexes and create the edge.`,
    schema: z.object({
      sourceEntityId: z.string().describe("Source entity node ID (the table that has the foreign key)"),
      targetEntityId: z.string().describe("Target entity node ID (the table that is being referenced)"),
      sourceColumnName: z.string().describe("The name of the column in the source entity (e.g. 'user_id')"),
      targetColumnName: z.string().describe("The name of the column in the target entity (e.g. 'id')"),
    }),
  }
);
