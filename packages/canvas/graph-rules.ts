import type { HandleKind } from "./types";

export const CONNECTION_RULES: Record<HandleKind, HandleKind[]> = {
  "event-source": ["endpoint-in"],
  "endpoint-in": [],
  "endpoint-out": ["database-target", "action-target", "resource-def-in", "endpoint-in", "task-in", "index-in"],
  "published-event-out": ["resource-def-in", "task-in"],
  "consumed-event-in": [],
  "consumed-event-out": ["endpoint-in", "resource-def-in", "task-in", "index-in"],
  "resource-def-in": [],
  "resource-def-out": ["consumed-event-in", "task-in"],
  "entity-column-source": ["entity-column-target"],
  "entity-column-target": [],
  "entity-top-target": [],
  "entity-bottom-source": ["entity-top-target"],
  "database-target": [],
  "database-source": ["endpoint-in", "task-in", "index-in"],
  "action-target": [],
  "task-in": [],
  "task-out": ["database-target", "action-target", "resource-def-in", "endpoint-in", "index-in"],
  "index-in": [],
  "index-out": ["endpoint-in", "task-in"],
  "unknown": [],
};

export const EDGE_TYPE_MAP: Record<string, string> = {
  "entity-column-source→entity-column-target": "foreign-key",
  "entity-bottom-source→entity-top-target": "foreign-key",
  "published-event-out→resource-def-in": "message",
  "consumed-event-out→resource-def-in": "message",
  "resource-def-out→consumed-event-in": "message",
  "published-event-out→task-in": "message",
  "consumed-event-out→task-in": "message",
  "resource-def-out→task-in": "message",
  "task-out→resource-def-in": "message",
  "endpoint-out→task-in": "connection",
};

export const WEB_CLIENT_EVENTS = ["pageLoad", "click", "hover", "drag", "dblclick", "keydown", "keyup", "submit", "change", "focus", "blur", "mouseenter", "mouseleave", "other"] as const;
