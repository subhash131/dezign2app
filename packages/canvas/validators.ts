import type { ValidationResult } from "./types";
import type { BackendNodeType } from "./types";
import { CONNECTION_RULES } from "./graph-rules";
import { RULES_VERSION, NODE_TYPE_TO_RESOURCE_KIND } from "./constants";
import { classifyHandle, getSuggestion, getEdgeType } from "./utils";

export function isValidConnection(
  sourceNodeType: BackendNodeType,
  sourceHandleId: string | null | undefined,
  targetNodeType: BackendNodeType,
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
  if (options?.sourceNodeId && options?.targetNodeId && options.sourceNodeId === options.targetNodeId) {
    return {
      valid: false,
      code: "SELF_CONNECTION",
      message: "A node cannot connect to itself.",
      rulesVersion: RULES_VERSION,
    };
  }

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

  const edgeType = getEdgeType(sourceKind, targetKind);
  const resourceKind = NODE_TYPE_TO_RESOURCE_KIND[targetNodeType];

  return {
    valid: true,
    edgeType,
    rulesVersion: RULES_VERSION,
    resourceKind,
  };
}
