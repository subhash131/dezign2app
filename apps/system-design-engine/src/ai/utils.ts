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
  } else if (name === "add_db_ref_node") {
    return `\nAdded **${args.label}** (database ref)`;
  }
  return `\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n`;
}

export function formatCanvasState(elements: any): string {
  let output = "Canvas is empty.";
  if (elements && elements.nodes && elements.nodes.length > 0) {
    output = "Backend Canvas Nodes:\n";
    elements.nodes.forEach((n: any) => {
      let extra = "";
      if (n.type === "entity" && n.data.columns) {
        extra += `\n  Columns (use for 'sourceHandle'/'targetHandle'): ` + (n.data.columns as any[]).map((c) => `${c.name} (ID: ${c.id})`).join(", ");
      }
      if (n.type === "service" && n.data.endpoints) {
        extra += `\n  Endpoints: ` + (n.data.endpoints as any[]).map((ep) => {
          const dbTargets = [
            ...(Array.isArray(ep.databaseNodeIds) ? ep.databaseNodeIds : []),
            ...(ep.databaseNodeId ? [ep.databaseNodeId] : []),
          ];
          const db = [...new Set(dbTargets)].length > 0
            ? `, databaseNodeIds=[${[...new Set(dbTargets)].join(", ")}]`
            : "";
          return `${ep.type} ${ep.name} (targetHandle="endpoints-in-${ep.id}", sourceHandle="endpoints-out-${ep.id}"${db})`;
        }).join("\n    ");
      }
      if (n.type === "db_ref") {
        extra += `\n  Database target handle: targetHandle="database-target"${n.data.tableRef ? ` (tableRef=${n.data.tableRef})` : ""}`;
      }
      if (n.type === "webClient" && n.data.events) {
        extra += `\n  Events: ` + (n.data.events as any[]).map((ev) => `${ev.name} (sourceHandle="events-${ev.id}")`).join("\n    ");
      }
      if (n.type === "kafka" && n.data.topics) {
        extra += `\n  Topics: ` + (n.data.topics as any[]).map((t) => `${t.name} (targetHandle="topics:in:${t.id}", sourceHandle="topics:out:${t.id}")`).join("\n    ");
      }
      output += `- [${n.type}] id: ${n.nodeId}, label: "${n.data.label}"${extra}\n`;
    });

    if (elements.edges && elements.edges.length > 0) {
      output += "\nConnections:\n";
      elements.edges.forEach((e: any) => {
        const sourceNode = elements.nodes.find((n: any) => n.nodeId === e.source)?.data.label || e.source;
        const targetNode = elements.nodes.find((n: any) => n.nodeId === e.target)?.data.label || e.target;
        const label = e.data?.label ? ` (label: ${e.data.label})` : "";
        output += `- ${sourceNode} (${e.source}) -> ${targetNode} (${e.target}) [${e.type}]${label} sourceHandle="${e.sourceHandle ?? ""}" targetHandle="${e.targetHandle ?? ""}"\n`;
      });
    }

    // Give the reflection model an explicit, machine-derived audit instead
    // of making it infer completeness from the total edge count. A canvas can
    // have many client/service edges while every database reference remains
    // disconnected.
    const databaseRefs = elements.nodes.filter((n: any) => n.type === "db_ref");
    const databaseEdges = (elements.edges ?? []).filter((e: any) =>
      e.sourceHandle?.startsWith("endpoints-out-") &&
      e.targetHandle === "database-target" &&
      databaseRefs.some((db: any) => db.nodeId === e.target)
    );
    const auditLines: string[] = [];

    for (const service of elements.nodes.filter((n: any) => n.type === "service")) {
      for (const endpoint of service.data?.endpoints ?? []) {
        const endpointEdges = databaseEdges.filter((e: any) =>
          e.source === service.nodeId && e.sourceHandle === `endpoints-out-${endpoint.id}`
        );
        if (endpointEdges.length === 0) {
          auditLines.push(
            `- MISSING endpoint-to-database edge: service=${service.nodeId}, endpoint=${endpoint.id} (${endpoint.type} ${endpoint.name})`
          );
        }
      }
    }

    for (const db of databaseRefs) {
      if (!databaseEdges.some((e: any) => e.target === db.nodeId)) {
        auditLines.push(`- UNCONNECTED db_ref: ${db.nodeId} (label="${db.data?.label ?? ""}")`);
      }
    }

    output += "\nConnection Audit:\n" +
      (auditLines.length > 0
        ? auditLines.join("\n")
        : "- No missing endpoint/database-reference connections detected.") + "\n";
  }
  return output;
}
