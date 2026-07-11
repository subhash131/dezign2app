/**
 * Canvas validation barrel export.
 * Re-exports everything from connectionRules and validateConnection.
 */
export {
  RULES_VERSION,
  CONNECTION_RULES,
  EDGE_TYPE_MAP,
  NODE_TYPE_TO_RESOURCE_KIND,
  getSuggestion,
  type HandleKind,
  type RejectionCode,
  type ValidationResult,
} from "./connectionRules";

export {
  classifyHandle,
  isValidConnection,
  getEdgeType,
} from "./validateConnection";
