import type { BackendNodeType, BackendEdgeType } from "@workspace/canvas";
import type {
  CanvasGraph,
  CanvasElements,
  GraphNode,
  GraphEdge,
  NodeId,
  RawNodeRecord,
  RawEdgeRecord,
  TraversalHit,
  NeighbourHit,
  EndpointSummary,
  TestCaseSummary,
} from "./types.js";

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Builds an in-memory typed graph from raw Convex canvas elements.
 * Complexity: O(N + E).
 */
export function buildGraph(elements: CanvasElements): CanvasGraph {
  const nodes = new Map<NodeId, GraphNode>();
  const outgoing = new Map<NodeId, GraphEdge[]>();
  const incoming = new Map<NodeId, GraphEdge[]>();
  const edges: GraphEdge[] = [];

  for (const raw of elements.nodes) {
    const node = rawNodeToGraphNode(raw);
    nodes.set(node.nodeId, node);
    outgoing.set(node.nodeId, []);
    incoming.set(node.nodeId, []);
  }

  for (const raw of elements.edges) {
    const edge = rawEdgeToGraphEdge(raw);
    edges.push(edge);

    const outList = outgoing.get(edge.source);
    if (outList) outList.push(edge);
    else outgoing.set(edge.source, [edge]);

    const incList = incoming.get(edge.target);
    if (incList) incList.push(edge);
    else incoming.set(edge.target, [edge]);
  }

  return { nodes, edges, outgoing, incoming };
}

function rawNodeToGraphNode(raw: RawNodeRecord): GraphNode {
  const nodeId = raw.nodeId ?? raw.id ?? "unknown";
  const type = (raw.type ?? "service") as BackendNodeType;
  const label = raw.data?.label ?? nodeId;
  const description = raw.data?.description ?? "";

  return {
    nodeId,
    type,
    label,
    description,
    data: raw.data ?? { label },
  };
}

function rawEdgeToGraphEdge(raw: RawEdgeRecord): GraphEdge {
  const id = raw.edgeId ?? raw.id ?? `${raw.source}->${raw.target}`;
  const type = (raw.type ?? "connection") as BackendEdgeType;
  const label = raw.data?.label ?? "";

  return {
    id,
    source: raw.source,
    target: raw.target,
    type,
    sourceHandle: raw.sourceHandle ?? null,
    targetHandle: raw.targetHandle ?? null,
    label,
  };
}

// ─── Adjacency Helper ─────────────────────────────────────────────────────────

function getAdjacentEdges(
  graph: CanvasGraph,
  nodeId: NodeId,
  direction: "outgoing" | "incoming" | "both",
): GraphEdge[] {
  if (direction === "outgoing") return graph.outgoing.get(nodeId) ?? [];
  if (direction === "incoming") return graph.incoming.get(nodeId) ?? [];

  const seen = new Set<string>();
  const result: GraphEdge[] = [];
  for (const edge of [...(graph.outgoing.get(nodeId) ?? []), ...(graph.incoming.get(nodeId) ?? [])]) {
    if (!seen.has(edge.id)) {
      seen.add(edge.id);
      result.push(edge);
    }
  }
  return result;
}

function otherEnd(nodeId: NodeId, edge: GraphEdge): NodeId {
  return edge.source === nodeId ? edge.target : edge.source;
}

// ─── Traversal ────────────────────────────────────────────────────────────────

/**
 * BFS traversal from `startId`, up to `maxDepth` hops.
 * The start node is included at depth 0.
 */
export function traverse(
  graph: CanvasGraph,
  startId: NodeId,
  direction: "outgoing" | "incoming" | "both",
  maxDepth: number,
): TraversalHit[] {
  const visited = new Set<NodeId>();
  const result: TraversalHit[] = [];
  const queue: Array<[NodeId, number]> = [[startId, 0]];

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) break;
    const [id, depth] = entry;

    if (visited.has(id)) continue;
    visited.add(id);

    const node = graph.nodes.get(id);
    if (!node) continue;

    result.push({ node, depth });
    if (depth >= maxDepth) continue;

    for (const edge of getAdjacentEdges(graph, id, direction)) {
      const neighbourId = otherEnd(id, edge);
      if (!visited.has(neighbourId)) {
        queue.push([neighbourId, depth + 1]);
      }
    }
  }

  return result;
}

// ─── Keyword Search ───────────────────────────────────────────────────────────

/**
 * Returns all nodes whose label, description, or type contain `keyword`
 * (case-insensitive substring match). No LLM required.
 */
export function findNodesByKeyword(
  graph: CanvasGraph,
  keyword: string,
): GraphNode[] {
  const lower = keyword.toLowerCase();
  const results: GraphNode[] = [];

  for (const node of graph.nodes.values()) {
    if (
      node.label.toLowerCase().includes(lower) ||
      node.description.toLowerCase().includes(lower) ||
      node.type.toLowerCase().includes(lower)
    ) {
      results.push(node);
    }
  }

  return results;
}

// ─── Neighbours ───────────────────────────────────────────────────────────────

/**
 * Returns direct (1-hop) connections of a node together with the connecting edge.
 * Returns an entry for EVERY connecting edge (allowing multiple connections per node pair).
 */
export function getNeighbours(
  graph: CanvasGraph,
  nodeId: NodeId,
  direction: "outgoing" | "incoming" | "both",
): NeighbourHit[] {
  const adjacentEdges = getAdjacentEdges(graph, nodeId, direction);
  const results: NeighbourHit[] = [];

  for (const edge of adjacentEdges) {
    const neighbourId = otherEnd(nodeId, edge);
    const node = graph.nodes.get(neighbourId);
    if (node) results.push({ node, edge });
  }

  return results;
}

// ─── Handle & Edge Label Resolvers ───────────────────────────────────────────

export function resolveHandleLabel(
  node: GraphNode | undefined,
  handleId: string | null | undefined,
  elements?: CanvasElements,
): string | null {
  if (!node || !handleId) return null;

  const data = node.data as Record<string, unknown> | undefined;

  // 1. Endpoint handles: endpoint-in-ID, endpoint-out-ID, etc.
  if (
    handleId.startsWith("endpoint-in-") ||
    handleId.startsWith("endpoint-out-") ||
    handleId.startsWith("endpoints-in-") ||
    handleId.startsWith("endpoints-out-") ||
    handleId.startsWith("routeEndpoints-in-") ||
    handleId.startsWith("routeEndpoints-out-")
  ) {
    const epId = handleId.replace(/^(endpoint|endpoints|routeEndpoints)-(in|out)-/, "");
    const nodeDataEndpoints = (data?.endpoints as Array<{ id: string; type?: string; name?: string }>) ?? [];
    let ep = nodeDataEndpoints.find((e) => e.id === epId);

    if (!ep && elements?.endpoints) {
      const rawEp = elements.endpoints.find((e) => e.id === epId || (e.nodeId === node.nodeId && e.id === epId));
      if (rawEp) ep = rawEp;
    }

    if (ep && ep.name) {
      return ep.type ? `${ep.type} ${ep.name}` : ep.name;
    }
  }

  // 2. Published Event handles: publishedEvents-out-ID, publishedEvents-in-ID
  if (handleId.startsWith("publishedEvents-out-") || handleId.startsWith("publishedEvents-in-")) {
    const evId = handleId.replace(/^publishedEvents-(out|in)-/, "");
    
    // Search elements.events and node.data.publishedEvents
    let evName: string | undefined = undefined;
    if (elements?.events) {
      const rawEv = elements.events.find((e) => e.id === evId);
      if (rawEv) evName = rawEv.name;
    }
    if (!evName && data) {
      const publishedEvents = (data.publishedEvents as Array<{ id: string; name?: string }>) ?? [];
      const ev = publishedEvents.find((e) => e.id === evId);
      if (ev) evName = ev.name;
    }

    // Find associated endpoint on this node
    let allEndpoints: Array<{ id?: string; type?: string; name?: string; publishedEvents?: Array<{ id?: string; name?: string }> }> = [];
    if (data?.endpoints) {
      allEndpoints = data.endpoints as typeof allEndpoints;
    }
    if (elements?.endpoints) {
      const rawEps = elements.endpoints.filter((e) => e.nodeId === node.nodeId);
      allEndpoints = [...allEndpoints, ...rawEps];
    }

    let parentEp = allEndpoints.find((ep) =>
      ep.publishedEvents?.some((pe) => pe.id === evId || (evName && pe.name === evName)),
    );

    // Fallback: if no endpoint explicitly references the event ID in publishedEvents array,
    // match non-GET endpoint on this node (e.g. POST /presentation or POST /slide)
    if (!parentEp && allEndpoints.length > 0) {
      parentEp = allEndpoints.find((ep) => ep.type && ep.type.toUpperCase() !== "GET") ?? allEndpoints[0];
    }

    if (parentEp && parentEp.name) {
      const epStr = parentEp.type ? `${parentEp.type} ${parentEp.name}` : parentEp.name;
      return evName ? `${epStr} (${evName})` : epStr;
    }

    if (evName) return `pub ${evName}`;
  }

  // 3. Consumed Event handles: consumedEvents-in-ID, consumedEvents-out-ID
  if (handleId.startsWith("consumedEvents-in-") || handleId.startsWith("consumedEvents-out-")) {
    const evId = handleId.replace(/^consumedEvents-(in|out)-/, "");
    let evName: string | undefined = undefined;
    if (elements?.events) {
      const rawEv = elements.events.find((e) => e.id === evId);
      if (rawEv) evName = rawEv.name;
    }
    if (!evName && data) {
      const consumedEvents = (data.consumedEvents as Array<{ id: string; name?: string }>) ?? [];
      const ev = consumedEvents.find((e) => e.id === evId);
      if (ev) evName = ev.name;
    }
    if (evName) {
      return `listener: ${evName}`;
    }
  }

  // 4. Messaging Resource handles: topic:in:ID, topics:in:ID, stream:out:ID, etc.
  const resourceMatch = handleId.match(/^(topic|topics|stream|streams|queue|queues|channel|channels|cache|caches|bucket|buckets):(in|out):(.+)$/);
  if (resourceMatch) {
    const resType = resourceMatch[1];
    const resId = resourceMatch[3];

    if (resType.startsWith("topic") && data) {
      const topics = (data.topics as Array<{ id: string; name?: string }>) ?? [];
      const topic = topics.find((t) => t.id === resId);
      if (topic && topic.name) return `topic: ${topic.name}`;
      if (elements?.events) {
        const rawEv = elements.events.find((e) => e.id === resId || e.messagingResourceId === resId);
        if (rawEv) return `topic: ${rawEv.name}`;
      }
    } else if (resType.startsWith("stream") && data) {
      const streams = (data.streams as Array<{ id: string; name?: string }>) ?? [];
      const stream = streams.find((s) => s.id === resId);
      if (stream && stream.name) return `stream: ${stream.name}`;
    } else if (resType.startsWith("queue") && data) {
      const queues = (data.queues as Array<{ id: string; name?: string }>) ?? [];
      const queue = queues.find((q) => q.id === resId);
      if (queue && queue.name) return `queue: ${queue.name}`;
    } else if (resType.startsWith("channel") && data) {
      const channels = (data.channels as Array<{ id: string; name?: string }>) ?? [];
      const channel = channels.find((c) => c.id === resId);
      if (channel && channel.name) return `channel: ${channel.name}`;
    } else if (resType.startsWith("cache") && data) {
      const caches = (data.caches as Array<{ id: string; name?: string }>) ?? [];
      const cache = caches.find((c) => c.id === resId);
      if (cache && cache.name) return `cache: ${cache.name}`;
    } else if (resType.startsWith("bucket") && data) {
      const buckets = (data.buckets as Array<{ id: string; name?: string }>) ?? [];
      const bucket = buckets.find((b) => b.id === resId);
      if (bucket && bucket.name) return `bucket: ${bucket.name}`;
    }
  }

  // 5. UI Events: events-ID
  if (handleId.startsWith("events-")) {
    const evId = handleId.replace("events-", "");
    if (elements?.events) {
      const rawEv = elements.events.find((e) => e.id === evId);
      if (rawEv) return `event: ${rawEv.name}`;
    }
    if (data) {
      const events = (data.events as Array<{ id: string; name?: string }>) ?? [];
      const ev = events.find((e) => e.id === evId);
      if (ev && ev.name) return `event: ${ev.name}`;
    }
  }

  // 6. Worker Tasks: task-in-ID, task-out-ID
  if (handleId.startsWith("task-in-") || handleId.startsWith("task-out-") && data) {
    const taskId = handleId.replace(/^task-(in|out)-/, "");
    const tasks = (data.tasks as Array<{ id: string; name?: string }>) ?? [];
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.name) return `task: ${task.name}`;
  }

  // 7. Search Indexes: index-in-ID, index-out-ID
  if ((handleId.startsWith("index-in-") || handleId.startsWith("index-out-")) && data) {
    const idxId = handleId.replace(/^index-(in|out)-/, "");
    const sources = (data.searchSources as Array<{ id: string; name?: string }>) ?? [];
    const idx = sources.find((s) => s.id === idxId);
    if (idx && idx.name) return `index: ${idx.name}`;
  }

  // 8. External Actions: actions-ID
  if (handleId.startsWith("actions-") && data) {
    const actId = handleId.replace("actions-", "");
    const actions = (data.actions as Array<{ id: string; name?: string }>) ?? [];
    const act = actions.find((a) => a.id === actId);
    if (act && act.name) return `action: ${act.name}`;
  }

  // 9. Columns on entity node: source-colName, target-colName
  if (handleId.startsWith("source-") || handleId.startsWith("target-")) {
    const colName = handleId.replace(/^(source|target)-/, "");
    const columns = (data.columns as Array<{ name: string }>) ?? [];
    const col = columns.find((c) => c.name === colName);
    if (col) return `col: ${col.name}`;
  }

  return null;
}

export function formatEdgeLine(
  edge: GraphEdge,
  graph: CanvasGraph,
  elements?: CanvasElements,
): string {
  const srcNode = graph.nodes.get(edge.source);
  const tgtNode = graph.nodes.get(edge.target);

  const srcLabel = srcNode?.label ?? edge.source;
  const tgtLabel = tgtNode?.label ?? edge.target;

  const srcHandle = resolveHandleLabel(srcNode, edge.sourceHandle, elements);
  const tgtHandle = resolveHandleLabel(tgtNode, edge.targetHandle, elements);

  const srcDetail = srcHandle ? ` (${srcHandle})` : "";
  const tgtDetail = tgtHandle ? ` (${tgtHandle})` : "";
  const edgeLabel = edge.label ? ` "${edge.label}"` : "";

  return `  ${srcLabel}${srcDetail} --[${edge.type}${edgeLabel}]--> ${tgtLabel}${tgtDetail}`;
}

// ─── Data Formatting Helper ───────────────────────────────────────────────────

const STRIPPED_KEYS = new Set<string>([
  "id",
  "nodeId",
  "targetNodeId",
  "brokerNodeId",
  "messagingResourceId",
  "sourceResourceId",
  "targetResourceId",
  "parentId",
  "tableRef",
  "position",
  "graphPosition",
  "fractionalIndex",
]);

export function cleanNodeData(data: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!data) return null;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "label" || key === "description" || STRIPPED_KEYS.has(key)) {
      continue;
    }
    if (value !== undefined && value !== null) {
      if (Array.isArray(value) && value.length === 0) continue;
      clean[key] = value;
    }
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

export function formatNodeDataLines(node: GraphNode): string[] {
  const lines: string[] = [`## [${node.type}] ${node.label}`];
  if (node.description) lines.push(`Description: ${node.description}`);

  const dataClean = cleanNodeData(node.data as Record<string, unknown> | undefined);
  if (dataClean) {
    lines.push("Data:");
    lines.push("```json");
    lines.push(JSON.stringify(dataClean, null, 2));
    lines.push("```");
  }
  return lines;
}

// ─── Serialiser ───────────────────────────────────────────────────────────────

/**
 * Serialises a subgraph (relevant nodes + associated endpoints/test cases)
 * into a structured text block for MCP tool output.
 */
export function serializeSubgraph(
  graph: CanvasGraph,
  relevantNodes: GraphNode[],
  endpoints: EndpointSummary[],
  testCases: TestCaseSummary[],
  elements?: CanvasElements,
): string {
  if (relevantNodes.length === 0) {
    return "No matching nodes found in the architecture graph.";
  }

  const lines: string[] = [
    `# Architecture Subgraph (${relevantNodes.length} node${relevantNodes.length === 1 ? "" : "s"})`,
    "",
  ];

  for (const node of relevantNodes) {
    lines.push(...formatNodeDataLines(node));

    // All edges adjacent to this node
    const allEdges = getAdjacentEdges(graph, node.nodeId, "both");
    if (allEdges.length > 0) {
      lines.push("Connections:");
      for (const edge of allEdges) {
        lines.push(formatEdgeLine(edge, graph, elements));
      }
    }

    // Endpoints
    const nodeEndpoints = endpoints.filter((e) => e.nodeId === node.nodeId);
    if (nodeEndpoints.length > 0) {
      lines.push("Endpoints:");
      for (const ep of nodeEndpoints) {
        const roleStr = ep.requiredRoles.length > 0 ? ` [roles: ${ep.requiredRoles.join(", ")}]` : "";
        lines.push(`  ${ep.type} ${ep.name}${roleStr}`);
        if (ep.summary) lines.push(`    Summary: ${ep.summary}`);
        if (ep.businessLogic) lines.push(`    Logic: ${ep.businessLogic}`);
      }
    }

    // Test cases
    const nodeTestCases = testCases.filter((tc) => tc.nodeId === node.nodeId);
    if (nodeTestCases.length > 0) {
      lines.push("Test Cases:");
      for (const tc of nodeTestCases) {
        const statusStr = tc.expectedStatus !== undefined ? ` → HTTP ${tc.expectedStatus}` : "";
        lines.push(`  - ${tc.name}${statusStr}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ─── MCP Session Helpers ──────────────────────────────────────────────────────

/**
 * Maps raw Convex endpoint records to MCP-friendly summaries,
 * filtered to only nodes within `nodeIds`.
 */
export function extractEndpointSummaries(
  rawEndpoints: CanvasElements["endpoints"],
  nodeIds: Set<NodeId>,
): EndpointSummary[] {
  return rawEndpoints
    .filter((ep) => nodeIds.has(ep.nodeId))
    .map((ep) => ({
      nodeId: ep.nodeId,
      id: ep.id,
      name: ep.name,
      type: ep.type,
      summary: ep.summary ?? "",
      businessLogic: ep.businessLogic ?? "",
      requiredRoles: ep.requiredRoles ?? [],
    }));
}

/**
 * Maps raw Convex test case records to MCP-friendly summaries,
 * filtered to only nodes within `nodeIds`.
 */
export function extractTestCaseSummaries(
  rawTestCases: CanvasElements["testCases"],
  nodeIds: Set<NodeId>,
): TestCaseSummary[] {
  const results: TestCaseSummary[] = [];

  for (const tc of rawTestCases) {
    const targetNodeId = tc.targetNodeId;
    if (targetNodeId !== undefined && nodeIds.has(targetNodeId)) {
      results.push({
        nodeId: targetNodeId,
        name: tc.name ?? "Unnamed",
        expectedStatus: tc.expectedStatus,
      });
    }
  }

  return results;
}

/**
 * Generates a full system overview directly from live database canvas elements.
 * 1. Shows DB Schema & Entity Relations (tables, columns, indexes, foreign keys).
 * 2. Shows Architecture Graph (services, brokers, endpoints, events, connections).
 * 3. Truncates graph nodes if exceeding maxGraphNodes and prompts user to query for details.
 */
export function generateSystemOverview(
  elements: CanvasElements,
  query?: string,
  maxGraphNodes: number = 15,
): string {
  const graph = buildGraph(elements);
  const lines: string[] = ["# System Overview", ""];

  // ───────────────────────────────────────────────────────────────────────────
  // PART 1: Database Schema (Entity Relations)
  // ───────────────────────────────────────────────────────────────────────────

  const entityNodes = Array.from(graph.nodes.values()).filter(
    (n) => n.type === "entity"
  );

  lines.push(`## 1. Database Schema & Entity Relations (${entityNodes.length} table${entityNodes.length === 1 ? "" : "s"})`);
  lines.push("");

  if (entityNodes.length === 0) {
    lines.push("No database entity tables defined.");
    lines.push("");
  } else {
    for (const node of entityNodes) {
      lines.push(`### Table: \`${node.label}\``);
      if (node.description) lines.push(`Description: ${node.description}`);

      const data = node.data as {
        columns?: Array<{
          name: string;
          type: string;
          isPrimaryKey?: boolean;
          isForeignKey?: boolean;
          isNotNull?: boolean;
          isUnique?: boolean;
          references?: { table: string; column: string };
        }>;
        indexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
        dbType?: string;
      };

      if (data.dbType) lines.push(`Database Type: ${data.dbType}`);

      if (data.columns && data.columns.length > 0) {
        lines.push("Columns:");
        for (const col of data.columns) {
          const flags: string[] = [];
          if (col.isPrimaryKey) flags.push("PK");
          if (col.isForeignKey) flags.push("FK");
          if (col.isNotNull) flags.push("NOT NULL");
          if (col.isUnique) flags.push("UNIQUE");
          const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
          const refStr = col.references ? ` -> ${col.references.table}.${col.references.column}` : "";
          lines.push(`  - \`${col.name}\` (${col.type})${flagStr}${refStr}`);
        }
      }

      if (data.indexes && data.indexes.length > 0) {
        lines.push("Indexes:");
        for (const idx of data.indexes) {
          const uStr = idx.isUnique ? " (UNIQUE)" : "";
          lines.push(`  - ${idx.name} (${idx.columns})${uStr}`);
        }
      }

      const fkEdges = graph.edges.filter(
        (e) => (e.source === node.nodeId || e.target === node.nodeId) && e.type === "foreign-key"
      );
      if (fkEdges.length > 0) {
        lines.push("Relationships:");
        for (const edge of fkEdges) {
          lines.push(formatEdgeLine(edge, graph, elements));
        }
      }

      lines.push("");
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PART 2: Architecture Graph (Services, Messaging & Infrastructure)
  // ───────────────────────────────────────────────────────────────────────────

  let archNodes = Array.from(graph.nodes.values()).filter((n) => n.type !== "entity");

  if (query && query.trim()) {
    const lower = query.toLowerCase();
    const matched = archNodes.filter(
      (n) =>
        n.label.toLowerCase().includes(lower) ||
        n.description.toLowerCase().includes(lower) ||
        n.type.toLowerCase().includes(lower)
    );
    if (matched.length > 0) {
      archNodes = matched;
    }
  }

  const totalArchNodes = archNodes.length;
  const isTruncated = totalArchNodes > maxGraphNodes;
  const displayNodes = isTruncated ? archNodes.slice(0, maxGraphNodes) : archNodes;

  lines.push(`## 2. Architecture Graph (${displayNodes.length} of ${totalArchNodes} node${totalArchNodes === 1 ? "" : "s"})`);
  lines.push("");

  if (displayNodes.length === 0) {
    lines.push("No architecture nodes found.");
    lines.push("");
  } else {
    const nodeIdSet = new Set<string>(displayNodes.map((n) => n.nodeId));
    const endpointSummaries = extractEndpointSummaries(elements.endpoints, nodeIdSet);
    const testCaseSummaries = extractTestCaseSummaries(elements.testCases, nodeIdSet);

    lines.push(serializeSubgraph(graph, displayNodes, endpointSummaries, testCaseSummaries, elements));
  }

  if (isTruncated) {
    lines.push("");
    lines.push(
      `> [!WARNING]\n` +
      `> **Notice: Graph output truncated (${totalArchNodes} total nodes present).**\n` +
      `> Showing the first ${maxGraphNodes} nodes above. To inspect specific nodes or routes in detail, please call \`get_system_design_context\` or \`traverse_architecture_graph\` with a specific \`query\` / \`topic\` (e.g. \`query: "payment"\` or \`query: "kafka"\`).`
    );
  }

  return lines.join("\n");
}
