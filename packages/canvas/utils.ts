import type { HandleKind, BackendNodeType } from "./types";
import { CONNECTION_RULES, EDGE_TYPE_MAP } from "./graph-rules";
import { MESSAGING_RESOURCE_TYPES, MESSAGING_NODE_TYPES } from "./constants";

const ALL_BACKEND_NODE_TYPES = [
  "service", "database", "queue", "pubsub", "eventstream", "kafka", 
  "redis-streams", "sqs", "redis-pubsub", "redis-cache", "entity", 
  "webClient", "external", "group", "db_ref", "storage"
] as const;

export function isBackendNode(type: string): type is BackendNodeType {
  return ALL_BACKEND_NODE_TYPES.some(t => t === type);
}

export function getSuggestion(
  sourceKind: HandleKind,
  targetKind: HandleKind,
): string | undefined {
  const validTargets = CONNECTION_RULES[sourceKind];
  if (validTargets && validTargets.length > 0) {
    return `"${sourceKind}" can connect to: ${validTargets.map((k: HandleKind) => `"${k}"`).join(", ")}. ` +
      `You attempted to connect to "${targetKind}" which is not in that list.`;
  }

  const validSources = (Object.entries(CONNECTION_RULES) as [HandleKind, HandleKind[]][])
    .filter(([, targets]) => targets.includes(targetKind))
    .map(([src]) => src);

  if (validSources.length > 0) {
    return `"${targetKind}" accepts connections from: ${validSources.map((k: HandleKind) => `"${k}"`).join(", ")}. ` +
      `You attempted to connect from "${sourceKind}" which is not in that list.`;
  }

  return undefined;
}

export function classifyHandle(
  nodeType: BackendNodeType,
  handleId: string | null | undefined,
  handleDirection: "source" | "target",
): HandleKind {
  const id = handleId ?? "";

  if (nodeType === "entity") {
    if (id.startsWith("source-")) return "entity-column-source";
    if (id.startsWith("target-")) return "entity-column-target";
    if (handleDirection === "target") return "entity-top-target";
    if (handleDirection === "source") return "entity-bottom-source";
  }

  if (id.startsWith("endpoint-in-") || id.startsWith("endpoints-in-") || id.startsWith("routeEndpoints-in-")) return "endpoint-in";
  if (id.startsWith("endpoint-out-") || id.startsWith("endpoints-out-") || id.startsWith("routeEndpoints-out-")) return "endpoint-out";
  if (id.startsWith("events-")) return "event-source";
  if (id.startsWith("publishedEvents-out-")) return "published-event-out";
  if (id.startsWith("consumedEvents-in-")) return "consumed-event-in";
  if (id.startsWith("consumedEvents-out-")) return "consumed-event-out";

  const resourceMatchRegex = new RegExp(`^(${MESSAGING_RESOURCE_TYPES.join("|")}):(in|out):(.+)$`);
  const resourceMatch = id.match(resourceMatchRegex);
  if (resourceMatch) {
    const direction = resourceMatch[2];
    return direction === "in" ? "resource-def-in" : "resource-def-out";
  }

  if (id.startsWith("actions-")) return "action-target";

  if (nodeType === "database" || nodeType === "db_ref") {
    if (id.startsWith("database-target") || handleDirection === "target") return "database-target";
    if (id.startsWith("database-source") || handleDirection === "source") return "database-source";
  }

  if (MESSAGING_NODE_TYPES.some(t => t === nodeType)) {
    if (handleDirection === "target") return "resource-def-in";
    if (handleDirection === "source") return "resource-def-out";
  }

  return "unknown";
}

export function getEdgeType(sourceKind: HandleKind, targetKind: HandleKind): string {
  const key = `${sourceKind}→${targetKind}`;
  return EDGE_TYPE_MAP[key] ?? "connection";
}
