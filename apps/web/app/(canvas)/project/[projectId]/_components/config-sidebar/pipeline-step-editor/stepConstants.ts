import React from "react";
import {
  Shuffle,
  Database,
  Zap,
  Radio,
  Cloud,
  Terminal,
  Send,
  GitBranch,
  ShieldAlert,
  GitFork,
  Layers,
  Repeat,
  LogOut,
  MonitorSmartphone,
  Globe,
  Network,
} from "lucide-react";
import {
  StepType,
  PipelineStepDraft,
  ConditionOperator,
} from "./types";

// ---------------------------------------------------------------------------
// Constants & Metadata
// ---------------------------------------------------------------------------

export interface StepTypeMeta {
  label: string;
  icon: React.ReactNode;
  color: string;
}

export const STEP_TYPE_META: Record<StepType, StepTypeMeta> = {
  transform: {
    label: "Transform",
    icon: React.createElement(Shuffle, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  db_operation: {
    label: "DB Operation",
    icon: React.createElement(Database, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  redis_operation: {
    label: "Redis",
    icon: React.createElement(Zap, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  kafka_publish: {
    label: "Kafka Publish",
    icon: React.createElement(Radio, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  service_call: {
    label: "Service Call",
    icon: React.createElement(Cloud, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  external_call: {
    label: "External API Call",
    icon: React.createElement(Globe, { size: 13 }),
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  },
  custom_code: {
    label: "Custom Code",
    icon: React.createElement(Terminal, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  return_response: {
    label: "Return Response",
    icon: React.createElement(Send, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  condition: {
    label: "If / Else",
    icon: React.createElement(GitBranch, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  try_catch: {
    label: "Try / Catch",
    icon: React.createElement(ShieldAlert, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  switch: {
    label: "Switch",
    icon: React.createElement(GitFork, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  parallel: {
    label: "Parallel",
    icon: React.createElement(Layers, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  loop: {
    label: "Loop",
    icon: React.createElement(Repeat, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  early_return: {
    label: "Early Return",
    icon: React.createElement(LogOut, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  push_to_client: {
    label: "Push to Client",
    icon: React.createElement(MonitorSmartphone, { size: 13 }),
    color: "text-foreground/80 bg-secondary/40 border-border/60",
  },
  langgraph_invoke: {
    label: "LangGraph Agent",
    icon: React.createElement(Network, { size: 13 }),
    color: "text-primary bg-primary/10 border-primary/30",
  },
};

export const ADDABLE_STEP_TYPES: readonly StepType[] = [
  "transform",
  "db_operation",
  "redis_operation",
  "kafka_publish",
  "service_call",
  "external_call",
  "custom_code",
  "condition",
  "try_catch",
  "switch",
  "parallel",
  "loop",
  "early_return",
  "push_to_client",
  "langgraph_invoke",
];

export const CONDITION_OPERATORS: readonly {
  value: ConditionOperator;
  label: string;
  symbol: string;
  unary?: boolean;
}[] = [
  { value: "eq", label: "Equals (==)", symbol: "==" },
  { value: "neq", label: "Not Equals (!=)", symbol: "!=" },
  { value: "gt", label: "Greater Than (>)", symbol: ">" },
  { value: "gte", label: "Greater Than or Equal (>=)", symbol: ">=" },
  { value: "lt", label: "Less Than (<)", symbol: "<" },
  { value: "lte", label: "Less Than or Equal (<=)", symbol: "<=" },
  { value: "truthy", label: "Is Truthy (true / non-empty)", symbol: "is truthy", unary: true },
  { value: "falsy", label: "Is Falsy (false / null / empty)", symbol: "is falsy", unary: true },
  { value: "exists", label: "Exists (not null / undefined)", symbol: "exists", unary: true },
  { value: "not_exists", label: "Does Not Exist (null / undefined)", symbol: "not exists", unary: true },
  { value: "contains", label: "Contains (substring / item)", symbol: "contains" },
  { value: "starts_with", label: "Starts With", symbol: "starts with" },
  { value: "ends_with", label: "Ends With", symbol: "ends with" },
];

export function isControlFlowStep(type: StepType): boolean {
  return [
    "condition",
    "try_catch",
    "switch",
    "parallel",
    "loop",
    "early_return",
  ].includes(type);
}

export function collectAllNestedSteps(step: PipelineStepDraft): PipelineStepDraft[] {
  const nested: PipelineStepDraft[] = [];
  if (step.thenSteps) {
    step.thenSteps.forEach((s) => {
      nested.push(s, ...collectAllNestedSteps(s));
    });
  }
  if (step.elseSteps) {
    step.elseSteps.forEach((s) => {
      nested.push(s, ...collectAllNestedSteps(s));
    });
  }
  if (step.trySteps) {
    step.trySteps.forEach((s) => {
      nested.push(s, ...collectAllNestedSteps(s));
    });
  }
  if (step.catchSteps) {
    step.catchSteps.forEach((s) => {
      nested.push(s, ...collectAllNestedSteps(s));
    });
  }
  if (step.switchCases) {
    step.switchCases.forEach((c) => {
      if (c.steps) {
        c.steps.forEach((s) => {
          nested.push(s, ...collectAllNestedSteps(s));
        });
      }
    });
  }
  if (step.switchDefault) {
    step.switchDefault.forEach((s) => {
      nested.push(s, ...collectAllNestedSteps(s));
    });
  }
  if (step.parallelBranches) {
    step.parallelBranches.forEach((b) => {
      if (b.steps) {
        b.steps.forEach((s) => {
          nested.push(s, ...collectAllNestedSteps(s));
        });
      }
    });
  }
  if (step.loopBody) {
    step.loopBody.forEach((s) => {
      nested.push(s, ...collectAllNestedSteps(s));
    });
  }
  return nested;
}

export const TS_TYPES: readonly string[] = [
  "string",
  "number",
  "boolean",
  "string[]",
  "number[]",
  "Record<string, string>",
  "Date",
];

export interface HttpStatusOption {
  code: number;
  label: string;
}

export const HTTP_STATUS_OPTIONS: readonly HttpStatusOption[] = [
  { code: 200, label: "200 OK" },
  { code: 201, label: "201 Created" },
  { code: 204, label: "204 No Content" },
  { code: 400, label: "400 Bad Request" },
  { code: 401, label: "401 Unauthorized" },
  { code: 403, label: "403 Forbidden" },
  { code: 404, label: "404 Not Found" },
  { code: 500, label: "500 Internal Error" },
];

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}
