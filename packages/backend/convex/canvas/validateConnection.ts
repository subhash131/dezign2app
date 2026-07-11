/**
 * Edge Connection Validation Engine
 *
 * Pure functions consuming the rules from connectionRules.ts.
 * No React, no Convex, no Node APIs — runs anywhere.
 *
 * Used by:
 *   - Convex mutation (primary enforcement)
 *   - Web client onConnect / isValidConnection (UI feedback)
 *   - MCP validate_edge tool (AI Agent pre-commit check)
 */

import {
  HandleKind,
  ValidationResult,
  CONNECTION_RULES,
  EDGE_TYPE_MAP,
  NODE_TYPE_TO_RESOURCE_KIND,
  RULES_VERSION,
  getSuggestion,
} from "./connectionRules";

// ============================================================================
// HANDLE CLASSIFICATION
// ============================================================================

/**
 * Classify a raw handle ID into a HandleKind.
 *
 * Uses nodeType + handleId pattern + handle direction to determine the
 * semantic kind. If the pattern doesn't match anything known, returns
 * "unknown" — and the validation layer MUST reject with UNKNOWN_*_KIND
 * (not silently fall through).
 *
 * Handle ID patterns observed in the codebase:
 *   - Entity columns:      "source-{index}", "target-{index}"
 *   - Entity generic:      top handle (no ID), bottom handle (no ID)
 *   - Endpoints:           "endpoints-in-{id}", "endpoints-out-{id}"
 *   - Route endpoints:     "routeEndpoints-in-{id}", "routeEndpoints-out-{id}"
 *   - WebClient events:    "events-{id}"
 *   - Published events:    "publishedEvents-out-{id}"
 *   - Consumed events:     "consumedEvents-in-{id}"
 *   - Resource defs:       "{topics|queues|streams|channels}:in:{id}",
 *                          "{topics|queues|streams|channels}:out:{id}"
 *   - External actions:    "actions-{id}"
 *   - Database generic:    null/undefined (Position.Left = target, Position.Right = source)
 */
export function classifyHandle(
  nodeType: string,
  handleId: string | null | undefined,
  handleDirection: "source" | "target",
): HandleKind {
  const id = handleId ?? "";

  // --- Entity node handles ---
  if (nodeType === "entity") {
    if (id.startsWith("source-")) return "entity-column-source";
    if (id.startsWith("target-")) return "entity-column-target";
    // Generic top/bottom handles (no specific ID)
    if (handleDirection === "target") return "entity-top-target";
    if (handleDirection === "source") return "entity-bottom-source";
  }

  // --- Endpoint handles (service nodes) ---
  // Both "endpoints-in-*" and "routeEndpoints-in-*" normalize to the same kind
  if (id.startsWith("endpoints-in-") || id.startsWith("routeEndpoints-in-")) {
    return "endpoint-in";
  }
  if (id.startsWith("endpoints-out-") || id.startsWith("routeEndpoints-out-")) {
    return "endpoint-out";
  }

  // --- WebClient event handles ---
  if (id.startsWith("events-")) {
    return "event-source";
  }

  // --- Service messaging handles ---
  if (id.startsWith("publishedEvents-out-")) {
    return "published-event-out";
  }
  if (id.startsWith("consumedEvents-in-")) {
    return "consumed-event-in";
  }

  // --- Messaging resource definition handles ---
  // Pattern: "{resourceType}:in:{id}" or "{resourceType}:out:{id}"
  const resourceMatch = id.match(/^(topics|queues|streams|channels):(in|out):(.+)$/);
  if (resourceMatch) {
    const direction = resourceMatch[2];
    return direction === "in" ? "resource-def-in" : "resource-def-out";
  }

  // --- External API action handles ---
  if (id.startsWith("actions-")) {
    return "action-target";
  }

  // --- Database node handles ---
  // Database nodes have generic left (target) and right (source) handles
  // with no specific handle ID
  if (nodeType === "database") {
    if (handleDirection === "target") return "database-target";
    if (handleDirection === "source") return "database-source";
  }

  return "unknown";
}

// ============================================================================
// PRIMARY VALIDATION
// ============================================================================

/**
 * Validate a proposed edge connection.
 *
 * Control flow (order matters):
 *   1. Self-connection check
 *   2. Classify source handle → if "unknown", reject with UNKNOWN_SOURCE_KIND
 *   3. Classify target handle → if "unknown", reject with UNKNOWN_TARGET_KIND
 *   4. Check CONNECTION_RULES for the pair
 *   5. Check for duplicate edges (same source/target/handles, different edgeId)
 *   6. Derive edge type + resource kind → return valid result
 */
export function isValidConnection(
  sourceNodeType: string,
  sourceHandleId: string | null | undefined,
  targetNodeType: string,
  targetHandleId: string | null | undefined,
  options?: {
    sourceNodeId?: string;
    targetNodeId?: string;
    existingEdges?: Array<{
      source: string;
      target: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    }>;
  },
): ValidationResult {
  // 1. Self-connection check
  if (options?.sourceNodeId && options?.targetNodeId && options.sourceNodeId === options.targetNodeId) {
    return {
      valid: false,
      code: "SELF_CONNECTION",
      message: "A node cannot connect to itself.",
      rulesVersion: RULES_VERSION,
    };
  }

  // 2. Classify source handle — unknown checks fire FIRST
  const sourceKind = classifyHandle(sourceNodeType, sourceHandleId, "source");
  if (sourceKind === "unknown") {
    return {
      valid: false,
      code: "UNKNOWN_SOURCE_KIND",
      message: `Unrecognized source handle pattern: nodeType="${sourceNodeType}", handleId="${sourceHandleId ?? "null"}". ` +
        `This handle ID does not match any known pattern in the taxonomy — possible handle ID typo or missing node type registration.`,
      rulesVersion: RULES_VERSION,
    };
  }

  // 3. Classify target handle — unknown checks fire FIRST
  const targetKind = classifyHandle(targetNodeType, targetHandleId, "target");
  if (targetKind === "unknown") {
    return {
      valid: false,
      code: "UNKNOWN_TARGET_KIND",
      message: `Unrecognized target handle pattern: nodeType="${targetNodeType}", handleId="${targetHandleId ?? "null"}". ` +
        `This handle ID does not match any known pattern in the taxonomy — possible handle ID typo or missing node type registration.`,
      rulesVersion: RULES_VERSION,
    };
  }

  // 4. Check CONNECTION_RULES
  const allowedTargets = CONNECTION_RULES[sourceKind];
  if (!allowedTargets || !allowedTargets.includes(targetKind)) {
    const suggestion = getSuggestion(sourceKind, targetKind);
    return {
      valid: false,
      code: "INVALID_KIND_PAIR",
      message: `"${sourceKind}" cannot connect to "${targetKind}".`,
      suggestion,
      rulesVersion: RULES_VERSION,
    };
  }

  // 5. Duplicate edge check (same source/target/handles but different edgeId)
  if (options?.existingEdges && options.sourceNodeId && options.targetNodeId) {
    const isDuplicate = options.existingEdges.some(
      (e) =>
        e.source === options.sourceNodeId &&
        e.target === options.targetNodeId &&
        (e.sourceHandle ?? null) === (sourceHandleId ?? null) &&
        (e.targetHandle ?? null) === (targetHandleId ?? null),
    );
    if (isDuplicate) {
      return {
        valid: false,
        code: "DUPLICATE_EDGE",
        message: `An edge already exists between these exact handles. ` +
          `source="${options.sourceNodeId}" (${sourceHandleId ?? "default"}) → ` +
          `target="${options.targetNodeId}" (${targetHandleId ?? "default"}).`,
        rulesVersion: RULES_VERSION,
      };
    }
  }

  // 6. Derive edge type + resource kind
  const edgeType = getEdgeType(sourceKind, targetKind);
  const resourceKind = NODE_TYPE_TO_RESOURCE_KIND[targetNodeType];

  return {
    valid: true,
    edgeType,
    rulesVersion: RULES_VERSION,
    resourceKind,
  };
}

// ============================================================================
// EDGE TYPE DERIVATION
// ============================================================================

/**
 * Derive the edge type from a source/target handle kind pair.
 * Falls back to "connection" if no specific mapping exists.
 */
export function getEdgeType(sourceKind: HandleKind, targetKind: HandleKind): string {
  const key = `${sourceKind}→${targetKind}`;
  return EDGE_TYPE_MAP[key] ?? "connection";
}
