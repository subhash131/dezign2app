import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphAnnotation } from "../state";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { getConvexClient } from "../utils";
import { dbRefDataSchema, entityColumnInputSchema } from "../schemas";

export const addSchemaGroupTool = tool(
  async (input, config) => {
    const { groupLabel, description, schemas } = input;
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    const groupId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const fractionalIndex = "a0" + Date.now() + Math.random().toString(36).slice(2, 6);
    
    const offsetX = Math.floor(Math.random() * 600) - 300;
    const offsetY = Math.floor(Math.random() * 600) - 300;
    const position = state.viewportCenter
      ? { x: state.viewportCenter.x + offsetX, y: state.viewportCenter.y + offsetY }
      : { x: 100 + offsetX, y: 100 + offsetY };

    try {
      await convex.mutation(api.canvas.upsertBackendNode, {
        projectId: state.projectId as Id<"projects">,
        nodeId: groupId,
        type: "group",
        position,
        data: { label: groupLabel, description },
        fractionalIndex,
      });

      let resultStr = `Added schema group '${groupLabel}' with ID ${groupId}\n`;

      if (schemas && schemas.length > 0) {
        const createdEntities: Record<string, { id: string; columns: any[] }> = {};
        for (let i = 0; i < schemas.length; i++) {
          const schema = schemas[i];
          if (!schema) continue;
          const entityId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const entityFractionalIndex = fractionalIndex + "a" + i;
          
          await convex.mutation(api.canvas.upsertBackendNode, {
            projectId: state.projectId as Id<"projects">,
            nodeId: entityId,
            type: "entity",
            position: { x: position.x + 20 + i * 250, y: position.y + 60 },
            data: { 
              label: schema.label, 
              description: schema.description, 
              columns: schema.columns, 
              parentId: groupId 
            },
            fractionalIndex: entityFractionalIndex,
          });
          createdEntities[schema.label] = { id: entityId, columns: schema.columns };
          resultStr += `- Added entity '${schema.label}' with ID ${entityId} inside group ${groupId}\n`;
        }

        // Create foreign key edges
        for (let i = 0; i < schemas.length; i++) {
          const schema = schemas[i];
          if (!schema) continue;
          const srcEntity = createdEntities[schema.label];
          if (!srcEntity) continue;
          
          for (let j = 0; j < schema.columns.length; j++) {
            const col = schema.columns[j];
            if (col?.references) {
              const targetEntity = createdEntities[col.references.table];
              if (targetEntity) {
                const targetColIndex = targetEntity.columns.findIndex(c => c.name === col.references?.column);
                if (targetColIndex !== -1) {
                  const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                  const edgeFractionalIndex = "a0" + Date.now() + Math.random().toString(36).slice(2, 6);
                  
                  await convex.mutation(api.canvas.upsertBackendEdge, {
                    projectId: state.projectId as Id<"projects">,
                    edgeId,
                    source: srcEntity.id,
                    target: targetEntity.id,
                    type: "foreign-key",
                    sourceHandle: `source-${j}`,
                    targetHandle: `target-${targetColIndex}`,
                    data: { sourceCardinality: "N", targetCardinality: "1" },
                    fractionalIndex: edgeFractionalIndex,
                  });
                  resultStr += `- Added foreign-key edge from ${schema.label}.${col.name} to ${col.references.table}.${col.references.column}\n`;
                }
              }
            }
          }
        }
      }
      return resultStr;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to add schema group: ${e.message || String(error)}`;
    }
  },
  {
    name: "add_schema_group",
    description: "Add a database Schema Group with one or more entity (table) schemas inside it. Use this instead of adding individual 'group' and 'entity' nodes when designing a database schema.",
    schema: z.object({
      groupLabel: z.string().describe("Name of the schema group (e.g. 'Core Database' or 'User Service Schema')"),
      description: z.string().optional(),
      schemas: z.array(z.object({
        label: z.string().describe("Name of the table/entity (e.g. 'Users')"),
        description: z.string().optional(),
        columns: z.array(entityColumnInputSchema).describe("The columns/fields of the table"),
      })).optional().describe("The tables/entities that belong to this group"),
    })
  }
);

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
    description: "Add a single database schema (table/entity) to the canvas. DO NOT use this if you want to add a group of schemas with 'groupLabel' and 'schemas', use 'add_schema_group' for that.",
    schema: z.object({
      label: z.string().describe("Name of the table/entity (e.g. 'Users')"),
      description: z.string().optional(),
      groupId: z.string().optional().describe("Optional ID of the schema group to place this schema inside"),
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
