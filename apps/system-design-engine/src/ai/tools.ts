import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphAnnotation } from "./state";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { getConvexClient } from "./utils";
import { EDGE_TYPE_MAP } from "@workspace/canvas";
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
} from "./schemas";

export const addNodeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("service"), label: z.string(), data: simpleDataSchema.optional() }),
  z.object({ type: z.literal("db_ref"), label: z.string(), data: dbRefDataSchema.optional() }),
  z.object({ type: z.literal("webClient"), label: z.string(), data: simpleDataSchema.optional() }),
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

      const schema = nodeDataSchemas[node.type];
      if (!schema) return `Error: Unknown node type '${node.type}' for node ${id}`;

      // Validate only the fields being changed, merged onto existing data,
      // so we catch cross-type field leakage at update time too.
      const merged = { ...node.data, ...changes };
      const { label, graphPosition, ...dataToValidate } = merged;
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
        data: { ...node.data, ...processedChanges },
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
      changes: z.record(z.any()).describe("Partial data fields to change, matching the node's existing type schema."),
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

    const processedEndpoints = (endpoints || []).map((ep) => ({
      ...ep,
      id: (ep as {id?: string}).id || Math.random().toString(36).slice(2, 9),
      publishedEvents: ep.publishedEvents?.map((pe) => ({
        ...pe,
        id: (pe as {id?: string}).id || Math.random().toString(36).slice(2, 9),
      })),
    }));

    const processedConsumedEvents = (consumedEvents || []).map((ce) => ({
      ...ce,
      id: (ce as {id?: string}).id || Math.random().toString(36).slice(2, 9),
    }));

    const processedPublishedEvents = (publishedEvents || []).map((pe) => ({
      ...pe,
      id: (pe as {id?: string}).id || Math.random().toString(36).slice(2, 9),
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
          ...(Array.isArray((ep as any).databaseNodeIds) ? (ep as any).databaseNodeIds : []),
          ...((ep as any).databaseNodeId ? [(ep as any).databaseNodeId] : []),
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
    schema: z.object({
      label: z.string().describe("Name of the service"),
      description: z.string().optional(),
      techStack: z.string().optional(),
      port: z.string().optional(),
      cors: z.boolean().optional(),
      baseUrl: z.string().optional(),
      endpoints: z.array(z.object({
        name: z.string().describe("Endpoint path (e.g., /api/users)"),
        type: z.string().describe("HTTP method (GET, POST, etc.)"),
        output: z.string().optional().describe("JSON response schema"),
        businessLogic: z.string().optional(),
        databaseNodeIds: z.array(z.string()).optional().describe("IDs of db_ref nodes this endpoint reads from or writes to. REQUIRED whenever this endpoint uses a database; one endpoint may target multiple tables."),
        databaseNodeId: z.string().optional().describe("Single db_ref node ID this endpoint uses; prefer databaseNodeIds when there is more than one."),
        publishedEvents: z.array(z.object({
          name: z.string(),
          kind: z.string().optional(),
          schema: z.string().optional(),
          targetNodeId: z.string().optional().describe("Target node ID to automatically connect to (e.g. queue or pubsub node)"),
          targetResourceId: z.string().optional().describe("The specific topic/queue/stream ID on the broker to connect to")
        })).optional()
      })).optional(),
      consumedEvents: z.array(z.object({
        name: z.string(),
        kind: z.string().optional(),
        schema: z.string().optional(),
        handlerLogic: z.string().optional(),
        targetNodeId: z.string().optional().describe("Source node ID to automatically connect from (e.g. queue or pubsub node)"),
        targetResourceId: z.string().optional().describe("The specific topic/queue/stream ID on the broker to connect to")
      })).optional(),
      publishedEvents: z.array(z.object({
        name: z.string(),
        kind: z.string().optional(),
        schema: z.string().optional(),
        targetNodeId: z.string().optional().describe("Target node ID to automatically connect to (e.g. queue or pubsub node)"),
        targetResourceId: z.string().optional().describe("The specific topic/queue/stream ID on the broker to connect to")
      })).optional(),
      inputs: z.array(z.any()).optional(),
      outputs: z.array(z.any()).optional(),
      logic: z.array(z.any()).optional(),
    })
  }
);

export const addKafkaNodeTool = tool(
  async (input, config) => {
    const { label, description, topics, kafkaBroker, delivery, ordering, retention } = input;
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

    const processedData = assignResourceIds({
      label,
      description,
      topics: topics || [],
      kafkaBroker,
      delivery,
      ordering,
      retention,
      graphPosition: position,
    });

    try {
      await convex.mutation(api.canvas.upsertBackendNode, {
        projectId: state.projectId as Id<"projects">,
        nodeId,
        type: "kafka",
        position,
        data: processedData,
        fractionalIndex,
      });

      let resultStr = `Added kafka node ${label} with ID ${nodeId} and ${topics?.length || 0} topics`;
      if ("topics" in processedData && Array.isArray(processedData.topics) && processedData.topics.length) {
         resultStr += `\nTopics:\n` + processedData.topics.map((t: {name?: string; id?: string}) => `- ${t.name || 'Untitled'}: targetHandle="topics:in:${t.id}", sourceHandle="topics:out:${t.id}"`).join("\n");
      }
      return resultStr;
    } catch (error: unknown) {
      const e = error as Error;
      return `Failed to add kafka node: ${e.message || String(error)}`;
    }
  },
  {
    name: "add_kafka_node",
    description: "Add an Apache Kafka message broker node to the backend canvas, including its topics and broker configuration.",
    schema: z.object({
      label: z.string().describe("Name of the Kafka broker (e.g., 'Main Kafka Cluster')"),
      description: z.string().optional(),
      topics: z.array(z.object({
        name: z.string().describe("Name of the topic"),
        schema: z.string().optional(),
        version: z.string().optional()
      })).optional(),
      kafkaBroker: z.object({
        partitions: z.number().optional(),
        replication: z.number().optional(),
        batchSize: z.number().optional(),
        compression: z.string().optional(),
        ttl: z.string().optional(),
      }).optional(),
      delivery: z.string().optional().describe("Message delivery guarantee (e.g., 'At-least-once')"),
      ordering: z.string().optional(),
      retention: z.string().optional(),
    })
  }
);

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
      events: z.array(z.object({
        name: z.string().describe("Logical name of the action (e.g., 'sendMessage', 'fetchData')"),
        event: z.string().optional().describe("The DOM event that triggers it (e.g., 'click', 'submit', 'pageLoad')"),
        targetNodeId: z.string().optional().describe("If this event triggers an API call, specify the target service node ID to AUTOMATICALLY create an edge"),
        targetEndpointId: z.string().optional().describe("If this event triggers an API call, specify the target endpoint ID on the service node to AUTOMATICALLY create an edge"),
      })).optional(),
    })
  }
);

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
        columns: z.array(z.object({
          name: z.string(),
          type: z.string(),
          isPrimaryKey: z.boolean().optional(),
          isForeignKey: z.boolean().optional(),
          isNotNull: z.boolean().optional(),
          isUnique: z.boolean().optional(),
          references: z.object({
            table: z.string(),
            column: z.string()
          }).optional().describe("If this is a foreign key, which table and column it references in this group"),
        })).describe("The columns/fields of the table"),
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
    name: "add_schema",
    description: "Add a single database schema (table/entity) to the canvas.",
    schema: z.object({
      label: z.string().describe("Name of the table/entity (e.g. 'Users')"),
      description: z.string().optional(),
      groupId: z.string().optional().describe("Optional ID of the schema group to place this schema inside"),
      columns: z.array(z.object({
        name: z.string(),
        type: z.string(),
        isPrimaryKey: z.boolean().optional(),
        isForeignKey: z.boolean().optional(),
        isNotNull: z.boolean().optional(),
        isUnique: z.boolean().optional(),
      })).describe("The columns/fields of the table"),
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
    schema: z.object({
      label: z.string().describe("Name of the table reference (e.g. 'Users Table')"),
      description: z.string().optional(),
      tableRef: z.string().optional().describe("The ID of the target entity node this references, if known"),
      type: z.string().optional(),
      data: z.any().optional(),
    })
  }
);

export const tools = [addNodeTool, updateNodeTool, deleteNodeTool, addEdgeTool, deleteEdgeTool, addServiceNodeTool, addKafkaNodeTool, addClientNodeTool, addSchemaGroupTool, addSchemaTool, addDbRefNodeTool];
