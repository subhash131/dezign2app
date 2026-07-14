import { ConvexHttpClient } from "convex/browser";
import { GraphAnnotation } from "./state";

export function getConvexClient(state: typeof GraphAnnotation.State) {
  if (!state.convexUrl) throw new Error("Missing convexUrl in state");
  const client = new ConvexHttpClient(state.convexUrl);
  if (state.token) {
    client.setAuth(state.token);
  }
  return client;
}

export function formatToolCallLog(name: string, args: any): string {
  if (!args || Object.keys(args).length === 0) return "";
  
  if (name === "add_node") {
    const label = args.label || args.data?.label || "Unknown Node";
    return `\nAdded **${label}** (${args.type})`;
  } else if (name === "add_service_node") {
    const label = args.label || "Unknown Service";
    return `\nAdded **${label}** (service)`;
  } else if (name === "add_client_node") {
    const label = args.label || "Unknown Client";
    return `\nAdded **${label}** (client)`;
  } else if (name === "add_schema_group") {
    const label = args.label || "Unknown Schema Group";
    return `\nAdded **${label}** (schema group)`;
  } else if (name === "add_schema") {
    const label = args.label || "Unknown Schema";
    return `\nAdded **${label}** (schema)`;
  } else if (name === "add_kafka_node") {
    const label = args.label || "Unknown Kafka Broker";
    return `\nAdded **${label}** (kafka)`;
  } else if (name === "add_edge") {
    return `\nConnected **${args.source}** → **${args.target}** (${args.type || "edge"})`;
  } else if (name === "update_node") {
    return `\nUpdated node **${args.id}**`;
  } else if (name === "delete_node") {
    return `\nDeleted node **${args.id}**`;
  } else if (name === "delete_edge") {
    return `\nDeleted edge **${args.id}**`;
  } else if (name === "add_table_ref_node") {
    return `\nAdded **${args.label}** (database ref)`;
  }
  return `\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n`;
}
