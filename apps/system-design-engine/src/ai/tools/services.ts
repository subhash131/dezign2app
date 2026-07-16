import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphAnnotation } from "../state";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { getConvexClient } from "../utils";
import { EDGE_TYPE_MAP } from "@workspace/canvas";
import {
  EndpointInputType,
  ConsumedEventInputType,
  PublishedEventInputType
} from "@workspace/canvas/types";
import {
  endpointInputSchema,
  consumedEventInputSchema,
  publishedEventInputSchema,
} from "../schemas";

export interface AddServiceNodeInput {
  label: string;
  description?: string;
  techStack?: string;
  port?: string;
  cors?: boolean;
  corsOrigins?: string;
  rateLimit?: string;
  baseUrl?: string;
  endpoints?: EndpointInputType[];
  consumedEvents?: ConsumedEventInputType[];
  publishedEvents?: PublishedEventInputType[];
  inputs?: { id?: string; name: string }[];
  outputs?: { id?: string; name: string }[];
  logic?: { id?: string; name: string }[];
  routeGroups?: { id?: string; name: string; basePath: string; endpoints: EndpointInputType[] }[];
}

const addServiceNodeSchema: z.ZodType<AddServiceNodeInput> = z.object({
  label: z.string().describe("Name of the service"),
  description: z.string().optional(),
  techStack: z.string().optional(),
  port: z.string().optional(),
  cors: z.boolean().optional(),
  corsOrigins: z.string().optional(),
  rateLimit: z.string().optional(),
  baseUrl: z.string().optional(),
  endpoints: z.array(endpointInputSchema).optional(),
  consumedEvents: z.array(consumedEventInputSchema).optional(),
  publishedEvents: z.array(publishedEventInputSchema).optional(),
  inputs: z.array(z.object({ id: z.string().optional(), name: z.string() })).optional(),
  outputs: z.array(z.object({ id: z.string().optional(), name: z.string() })).optional(),
  logic: z.array(z.object({ id: z.string().optional(), name: z.string() })).optional(),
  routeGroups: z.array(z.object({
    id: z.string().optional(),
    name: z.string(),
    basePath: z.string(),
    endpoints: z.array(endpointInputSchema),
  })).optional(),
}) as unknown as z.ZodType<AddServiceNodeInput>;


export const addServiceNodeTool = tool(
  async (input, config) => {
    const { label, description, techStack, port, cors, baseUrl, endpoints, consumedEvents, publishedEvents, inputs, outputs, logic } = input;
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

    const makeId = () => Math.random().toString(36).slice(2, 9);
    const processedEndpoints = (endpoints || []).map((ep: EndpointInputType) => ({
      ...ep,
      id: (ep as {id?: string}).id || makeId(),
      headers: (ep.headers ?? []).map((item) => ({ ...item, id: item.id || makeId() })),
      pathParams: (ep.pathParams ?? []).map((item) => ({ ...item, id: item.id || makeId() })),
      queryParams: (ep.queryParams ?? []).map((item) => ({ ...item, id: item.id || makeId() })),
      requestBody: {
        id: ep.requestBody?.id || makeId(),
        fields: (ep.requestBody?.fields ?? []).map((item) => ({ ...item, id: item.id || makeId() })),
      },
      responseBody: {
        id: ep.responseBody?.id || makeId(),
        fields: (ep.responseBody?.fields ?? [{ name: "response", type: "object", required: true, description: ep.output || "Endpoint response" }]).map((item) => ({ ...item, id: item.id || makeId() })),
      },
      processingSteps: (ep.processingSteps ?? []).map((step) => ({ ...step, id: step.id || makeId() })),
      publishedEvents: ep.publishedEvents?.map((pe) => ({
        ...pe,
        id: pe.id || makeId(),
      })),
    }));

    const processedConsumedEvents = (consumedEvents || []).map((ce: ConsumedEventInputType) => ({
      ...ce,
      id: ce.id || Math.random().toString(36).slice(2, 9),
    }));

    const processedPublishedEvents = (publishedEvents || []).map((pe: PublishedEventInputType) => ({
      ...pe,
      id: pe.id || Math.random().toString(36).slice(2, 9),
    }));

    try {
      await convex.mutation(api.canvas.upsertBackendNode, {
        projectId: state.projectId as Id<"projects">,
        nodeId,
        type: "service",
        position,
        data: {
          label,
          description,
          techStack,
          port,
          cors,
          baseUrl,
          endpoints: processedEndpoints,
          consumedEvents: processedConsumedEvents,
          publishedEvents: processedPublishedEvents,
          inputs: inputs || [],
          outputs: outputs || [],
          logic: logic || [],
          graphPosition: position,
        },
        fractionalIndex,
      });

      const edgesToCreate = [];
      for (const ep of processedEndpoints) {
        if (ep.publishedEvents) {
          for (const pe of ep.publishedEvents) {
            if (pe.targetNodeId) {
              edgesToCreate.push({
                source: nodeId,
                target: pe.targetNodeId,
                sourceHandle: `publishedEvents-out-${pe.id}`,
                targetHandle: pe.targetResourceId ? `topics:in:${pe.targetResourceId}` : undefined,
                type: EDGE_TYPE_MAP["published-event-out→resource-def-in"] || "message",
              });
            }
          }
        }
      }

      for (const ce of processedConsumedEvents) {
        if (ce.targetNodeId) {
          edgesToCreate.push({
            source: ce.targetNodeId,
            target: nodeId,
            sourceHandle: ce.targetResourceId ? `topics:out:${ce.targetResourceId}` : undefined,
            targetHandle: `consumedEvents-in-${ce.id}`,
            type: EDGE_TYPE_MAP["resource-def-out→consumed-event-in"] || "message",
          });
        }
      }

      for (const pe of processedPublishedEvents) {
        if (pe.targetNodeId) {
          edgesToCreate.push({
            source: nodeId,
            target: pe.targetNodeId,
            sourceHandle: `publishedEvents-out-${pe.id}`,
            targetHandle: pe.targetResourceId ? `topics:in:${pe.targetResourceId}` : undefined,
            type: EDGE_TYPE_MAP["published-event-out→resource-def-in"] || "message",
          });
        }
      }

      // Database usage is endpoint-scoped.  Keep this automatic so a model
      // cannot accidentally leave a declared endpoint disconnected from its
      // table reference while building the service node.
      for (const ep of processedEndpoints) {
        const databaseNodeIds = [
          ...(Array.isArray(ep.databaseNodeIds) ? ep.databaseNodeIds : []),
          ...(ep.databaseNodeId ? [ep.databaseNodeId] : []),
        ];
        for (const databaseNodeId of [...new Set(databaseNodeIds)]) {
          edgesToCreate.push({
            source: nodeId,
            target: databaseNodeId,
            sourceHandle: `endpoints-out-${ep.id}`,
            targetHandle: "database-target",
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

      let resultStr = `Added service node ${label} with ID ${nodeId} and ${edgesToCreate.length} edges.`;
      if (processedEndpoints.length > 0) {
        resultStr += `\nEndpoints:\n` + processedEndpoints.map((ep) => `- ${ep.type} ${ep.name}: targetHandle="endpoints-in-${ep.id}", sourceHandle="endpoints-out-${ep.id}"`).join("\n");
      }
      if (processedConsumedEvents.length > 0) {
        resultStr += `\nConsumed Events:\n` + processedConsumedEvents.map((ce) => `- ${ce.name}: targetHandle="consumedEvents-in-${ce.id}"`).join("\n");
      }
      if (processedPublishedEvents.length > 0) {
        resultStr += `\nPublished Events:\n` + processedPublishedEvents.map((pe) => `- ${pe.name}: sourceHandle="publishedEvents-out-${pe.id}"`).join("\n");
      }
      return resultStr;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to add service node: ${e.message || String(error)}`;
    }
  },
  {
    name: "add_service_node",
    description: "Add a complete microservice node to the backend canvas, including its REST endpoints, business logic, inputs, outputs, and message broker event publications/subscriptions. Automatically creates edges to connected message brokers (targetNodeId).",
    schema: addServiceNodeSchema,
  }
);
