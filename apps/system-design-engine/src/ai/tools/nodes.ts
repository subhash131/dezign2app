import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphAnnotation } from "../state";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { getConvexClient } from "../utils";
import { BackendNode } from "@workspace/canvas";
import {
  simpleDataSchema,
  entityDataSchema,
  kafkaDataSchema,
  sqsDataSchema,
  redisPubSubDataSchema,
  redisStreamsDataSchema,
  externalDataSchema,
  dbRefDataSchema,
  nodeDataSchemas,
  assignResourceIds,
  webClientDataSchema,
  serviceDataSchema,
} from "../schemas";

export const addNodeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("service"), label: z.string(), data: serviceDataSchema.optional() }),
  z.object({ type: z.literal("db_ref"), label: z.string(), data: dbRefDataSchema.optional() }),
  z.object({ type: z.literal("webClient"), label: z.string(), data: webClientDataSchema.optional() }),
  z.object({ type: z.literal("external"), label: z.string(), data: externalDataSchema.optional() }),
  z.object({ type: z.literal("group"), label: z.string(), data: simpleDataSchema.optional() }),
  z.object({ type: z.literal("entity"), label: z.string(), data: entityDataSchema }),
  z.object({ type: z.literal("kafka"), label: z.string(), data: kafkaDataSchema.optional() }),
  z.object({ type: z.literal("sqs"), label: z.string(), data: sqsDataSchema.optional() }),
  z.object({ type: z.literal("redis-pubsub"), label: z.string(), data: redisPubSubDataSchema.optional() }),
  z.object({ type: z.literal("redis-streams"), label: z.string(), data: redisStreamsDataSchema.optional() }),
]);

export const addNodeTool = tool(
  async (input, config) => {
    const { type, label, data } = input;
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

    const processedData = assignResourceIds({ label, graphPosition: position, ...(data ?? {}) });

    try {
      await convex.mutation(api.canvas.upsertBackendNode, {
        projectId: state.projectId as Id<"projects">,
        nodeId,
        type,
        position,
        data: processedData,
        fractionalIndex,
      });
      let resultStr = `Added node ${label} of type ${type} with ID ${nodeId}`;
      if (type === "kafka" && "topics" in processedData && Array.isArray(processedData.topics)) {
         resultStr += `\nTopics:\n` + processedData.topics.map((t: {name?: string; id?: string}) => `- ${t.name || 'Untitled'}: targetHandle="topics:in:${t.id}", sourceHandle="topics:out:${t.id}"`).join("\n");
      }
      if (type === "sqs" && "queues" in processedData && Array.isArray(processedData.queues)) {
         resultStr += `\nQueues:\n` + processedData.queues.map((t: {name?: string; id?: string}) => `- ${t.name || 'Untitled'}: targetHandle="queues:in:${t.id}", sourceHandle="queues:out:${t.id}"`).join("\n");
      }
      if (type === "redis-pubsub" && "channels" in processedData && Array.isArray(processedData.channels)) {
         resultStr += `\nChannels:\n` + processedData.channels.map((t: {name?: string; id?: string}) => `- ${t.name || 'Untitled'}: targetHandle="channels:in:${t.id}", sourceHandle="channels:out:${t.id}"`).join("\n");
      }
      if (type === "redis-streams" && "streams" in processedData && Array.isArray(processedData.streams)) {
         resultStr += `\nStreams:\n` + processedData.streams.map((t: {name?: string; id?: string}) => `- ${t.name || 'Untitled'}: targetHandle="streams:in:${t.id}", sourceHandle="streams:out:${t.id}"`).join("\n");
      }
      return resultStr;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to add node: ${e.message || String(error)}`;
    }
  },
  {
    name: "add_node",
    description: `Add a node to the backend canvas. Node types:
- 'service': A backend API / microservice
- 'db_ref': A database table reference node
- 'sqs': Amazon SQS broker (data.queues, data.sqsBroker)
- 'redis-pubsub': Redis Pub/Sub broker (data.channels, data.redisPubSubBroker)
- 'kafka': Apache Kafka broker (data.topics, data.kafkaBroker)
- 'redis-streams': Redis Streams broker (data.streams, data.redisBroker)
- 'entity': A database table/schema entity (data.columns is required)
- 'webClient': A frontend client or page
- 'external': An external third-party API (data.actions, data.baseUrl)
- 'group': A logical grouping node

Each type only accepts its own data fields. Passing fields from another node type (e.g. sqsBroker on a kafka node) will be rejected.`,
    schema: addNodeSchema,
  }
);

export const updateNodeTool = tool(
  async ({ id, changes }, config) => {
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    try {
      const elements = await convex.query(api.canvas.getBackendElements, {
        projectId: state.projectId as Id<"projects">,
      });
      const node = elements.nodes.find((n) => n.nodeId === id);
      if (!node) return `Error: Node ${id} not found`;

      let schema = nodeDataSchemas[node.type];
      if (!schema) return `Error: Unknown node type '${node.type}' for node ${id}`;

      // Validate only the fields being changed, merged onto existing data,
      // so we catch cross-type field leakage at update time too.
      const existingData = node.data as BackendNode["data"];
      const newChanges = changes as Partial<BackendNode["data"]>;
      const merged: BackendNode["data"] = { ...existingData, ...newChanges };
      const { label, graphPosition, parentId, ...dataToValidate } = merged;
      const parsed = schema.safeParse(dataToValidate);
      if (!parsed.success) {
        return `Failed to update node: invalid fields for type '${node.type}': ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`;
      }

      const processedChanges = assignResourceIds({ ...changes });

      await convex.mutation(api.canvas.upsertBackendNode, {
        projectId: state.projectId as Id<"projects">,
        nodeId: id,
        type: node.type,
        position: node.position,
        data: { ...existingData, ...processedChanges },
        fractionalIndex: node.fractionalIndex,
      });
      return `Updated node ${id}`;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to update node: ${e.message || String(error)}`;
    }
  },
  {
    name: "update_node",
    description:
      "Update an existing node on the backend canvas. Only specify the fields you want to change. Changes are validated against the node's existing type — fields belonging to other node types will be rejected.",
    schema: z.object({
      id: z.string(),
      changes: z.record(z.unknown()).describe("Partial data fields to change, matching the node's existing type schema."),
    }),
  }
);

export const deleteNodeTool = tool(
  async ({ id }, config) => {
    const state = config.configurable?.state as typeof GraphAnnotation.State;
    if (!state?.projectId) return "Error: projectId missing";
    const convex = getConvexClient(state);

    try {
      await convex.mutation(api.canvas.removeBackendNode, {
        projectId: state.projectId as Id<"projects">,
        nodeId: id,
      });
      return `Deleted node ${id}`;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to delete node: ${e.message || String(error)}`;
    }
  },
  {
    name: "delete_node",
    description: "Delete a node from the backend canvas.",
    schema: z.object({ id: z.string() }),
  }
);
