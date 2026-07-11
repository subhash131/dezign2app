/**
 * Edge Connection Rules — Single Source of Truth
 *
 * Pure data. No React, no Convex, no Node APIs.
 * JSON-serializable so AI Agents can read/write these rules.
 *
 * Importable by:
 *   - Convex mutations (primary enforcement)
 *   - Web client (UI drag feedback)
 *   - MCP tools (AI Agent validation)
 */

// ============================================================================
// RULES VERSION
// ============================================================================
// Increment when rules change. Stamped on every persisted edge so historical
// graphs exported to RAG/graph memory remain interpretable under old rules.
export const RULES_VERSION = 1;

// ============================================================================
// HANDLE KIND TAXONOMY
// ============================================================================
// Each handle on a node emits a "handle kind" derived from its ID pattern.
// Connection rules are defined between handle kinds, NOT between node types.
// This makes the system composable — adding a new node only requires
// declaring which handle kinds its handles map to.
//
// classifyHandle() in validateConnection.ts maps raw handle IDs to these kinds.

export type HandleKind =
  // --- Entity (schema view) ---
  | "entity-column-source"     // source-{index} on entity nodes
  | "entity-column-target"     // target-{index} on entity nodes
  | "entity-top-target"        // generic top target on entity
  | "entity-bottom-source"     // generic bottom source on entity

  // --- Service endpoints ---
  // Note: "route group endpoints" normalize to these same kinds.
  // The route-vs-flat distinction lives in handle metadata, not the taxonomy.
  | "endpoint-in"              // endpoints-in-{id} OR routeEndpoints-in-{id}
  | "endpoint-out"             // endpoints-out-{id} OR routeEndpoints-out-{id}

  // --- WebClient events ---
  | "event-source"             // events-{id}

  // --- Service messaging (pub/sub on service nodes) ---
  | "published-event-out"      // publishedEvents-out-{id}
  | "consumed-event-in"        // consumedEvents-in-{id}

  // --- Messaging resource definitions ---
  // Covers: Kafka topics, SQS queues, Redis Streams, Redis Pub/Sub channels.
  // The concrete resource type (kafka/sqs/redis-stream/redis-pubsub) is NOT
  // part of the handle kind — it's stamped into edge data.resourceKind at
  // validation time from the target node's type.
  | "resource-def-in"          // {topics|queues|streams|channels}:in:{id}
  | "resource-def-out"         // {topics|queues|streams|channels}:out:{id}

  // --- Database (Table Reference) ---
  | "database-target"          // left target handle on database node
  | "database-source"          // right source handle on database node

  // --- External API actions ---
  | "action-target"            // actions-{id} — target-only

  // --- Fallback ---
  // If classifyHandle() returns "unknown", the validation MUST fail loudly
  // with UNKNOWN_SOURCE_KIND or UNKNOWN_TARGET_KIND — not silently pass.
  | "unknown";

// ============================================================================
// CONNECTION RULES
// ============================================================================
// Source HandleKind → allowed Target HandleKinds.
// If a pair is NOT listed, the connection is REJECTED.
//
// Every HandleKind MUST appear as a key here, even if mapped to [].
// The exhaustiveness test enforces this.

export const CONNECTION_RULES: Record<HandleKind, HandleKind[]> = {
  // WebClient events fire HTTP calls to service endpoints
  "event-source": ["endpoint-in"],

  // Service endpoints connect to: databases, external APIs, messaging resources
  "endpoint-in": [],  // target-only: receives connections
  "endpoint-out": ["database-target", "action-target", "resource-def-in"],

  // Service published events → messaging resource inputs (async produce)
  "published-event-out": ["resource-def-in"],

  // Consumed events: target-only — receives from messaging resources
  "consumed-event-in": [],

  // Messaging resource outputs → service consumed events (async consume)
  "resource-def-in": [],   // target-only: receives connections
  "resource-def-out": ["consumed-event-in"],

  // Entity FK columns (schema view only)
  "entity-column-source": ["entity-column-target"],
  "entity-column-target": [],  // target-only
  "entity-top-target": [],     // target-only
  "entity-bottom-source": ["entity-top-target"],

  // Database: receives from endpoints, can chain to other services
  "database-target": [],       // target-only: receives connections
  "database-source": ["endpoint-in"],

  // External API actions: target-only
  "action-target": [],

  // Unknown: empty — unknown handles always fail with a specific code
  // BEFORE even checking this map.
  "unknown": [],
};

// ============================================================================
// EDGE TYPE DERIVATION
// ============================================================================
// Determines BackendEdgeType from the handle kind pair.
// If not found, defaults to "connection".

export const EDGE_TYPE_MAP: Record<string, string> = {
  "entity-column-source→entity-column-target": "foreign-key",
  "entity-bottom-source→entity-top-target": "foreign-key",
  "published-event-out→resource-def-in": "message",
  "resource-def-out→consumed-event-in": "message",
  // Everything else → "connection" (default)
};

// ============================================================================
// RESOURCE KIND MAP
// ============================================================================
// Maps node types to the concrete resource kind stamped on edge data.
// Used by the mutation to enrich edges with semantic metadata for downstream
// RAG/graph-memory consumers who need to distinguish "Kafka log semantics"
// from "SQS competing-consumer semantics" from "Redis Pub/Sub fire-and-forget".

export const NODE_TYPE_TO_RESOURCE_KIND: Record<string, string | undefined> = {
  kafka: "kafka",
  sqs: "sqs",
  "redis-streams": "redis-stream",
  "redis-pubsub": "redis-pubsub",
  queue: "generic-queue",
  pubsub: "generic-pubsub",
  eventstream: "generic-eventstream",
};

// ============================================================================
// STRUCTURED REJECTION CODES
// ============================================================================

export type RejectionCode =
  | "UNKNOWN_SOURCE_KIND"    // source handle pattern not recognized
  | "UNKNOWN_TARGET_KIND"    // target handle pattern not recognized
  | "INVALID_KIND_PAIR"      // pair not in CONNECTION_RULES
  | "SELF_CONNECTION"        // source and target are same node
  | "DUPLICATE_EDGE"         // identical edge already exists (different edgeId)
  | "SOURCE_NODE_NOT_FOUND"  // node ID doesn't exist
  | "TARGET_NODE_NOT_FOUND"; // node ID doesn't exist

export type ValidationResult =
  | { valid: true; edgeType: string; rulesVersion: number; resourceKind?: string }
  | { valid: false; code: RejectionCode; message: string; suggestion?: string; rulesVersion: number };

// ============================================================================
// SUGGESTION HELPERS
// ============================================================================
// For INVALID_KIND_PAIR rejections, find the nearest valid alternative
// from the same direction. This is the highest-leverage field for AI Agent
// self-correction in retry loops.

/**
 * Given a rejected source kind and attempted target kind, find which source
 * kinds CAN reach that target kind, or which target kinds the source kind
 * CAN reach — whichever is more actionable.
 */
export function getSuggestion(
  sourceKind: HandleKind,
  targetKind: HandleKind,
): string | undefined {
  // What CAN the source kind connect to?
  const validTargets = CONNECTION_RULES[sourceKind];
  if (validTargets && validTargets.length > 0) {
    return `"${sourceKind}" can connect to: ${validTargets.map(k => `"${k}"`).join(", ")}. ` +
      `You attempted to connect to "${targetKind}" which is not in that list.`;
  }

  // What CAN connect to the target kind?
  const validSources = (Object.entries(CONNECTION_RULES) as [HandleKind, HandleKind[]][])
    .filter(([, targets]) => targets.includes(targetKind))
    .map(([src]) => src);

  if (validSources.length > 0) {
    return `"${targetKind}" accepts connections from: ${validSources.map(k => `"${k}"`).join(", ")}. ` +
      `You attempted to connect from "${sourceKind}" which is not in that list.`;
  }

  return undefined;
}
