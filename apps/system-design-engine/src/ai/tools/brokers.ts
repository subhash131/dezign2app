import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphAnnotation } from "../state";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { getConvexClient } from "../utils";
import { kafkaDataSchema, assignResourceIds } from "../schemas";

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
    schema: kafkaDataSchema.extend({
      label: z.string().describe("Name of the Kafka broker (e.g., 'Main Kafka Cluster')"),
    })
  }
);
