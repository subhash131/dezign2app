import type { HandleKind } from "./types.js";

export const CONNECTION_RULES: Record<HandleKind, HandleKind[]> = {
  "event-source": ["endpoint-in"],
  "endpoint-in": [],
  "endpoint-out": ["database-target", "action-target", "resource-def-in", "endpoint-in"],
  "published-event-out": ["resource-def-in"],
  "consumed-event-in": [],
  "resource-def-in": [],
  "resource-def-out": ["consumed-event-in"],
  "entity-column-source": ["entity-column-target"],
  "entity-column-target": [],
  "entity-top-target": [],
  "entity-bottom-source": ["entity-top-target"],
  "database-target": [],
  "database-source": ["endpoint-in"],
  "action-target": [],
  "unknown": [],
};

export const EDGE_TYPE_MAP: Record<string, string> = {
  "entity-column-source→entity-column-target": "foreign-key",
  "entity-bottom-source→entity-top-target": "foreign-key",
  "published-event-out→resource-def-in": "message",
  "resource-def-out→consumed-event-in": "message",
};
