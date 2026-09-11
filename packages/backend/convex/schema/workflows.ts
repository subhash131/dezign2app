import { defineTable } from "convex/server";
import { v } from "convex/values";

export const workflowVersionKindValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

export const workflowRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const workflowTriggerTypeValidator = v.union(
  v.literal("manual"),
  v.literal("cron"),
);

export const workflowEventLevelValidator = v.union(
  v.literal("debug"),
  v.literal("info"),
  v.literal("warn"),
  v.literal("error"),
);

export const workflowTables = {
  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    organizationId: v.optional(v.string()),
    isArchived: v.optional(v.boolean()), // Soft delete support
  })
    .index("by_organization", ["organizationId"])
    .index("by_name", ["name"])
    .index("by_creator", ["createdBy"])
    .index("by_creator_organization", ["createdBy", "organizationId"]),

  workflows: defineTable({
    name: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    organizationId: v.optional(v.string()),
    isArchived: v.optional(v.boolean()),
    nextVersionNumber: v.number(),
    draftVersionId: v.optional(v.id("workflow_versions")),
    publishedVersionId: v.optional(v.id("workflow_versions")),
    activeVersionId: v.optional(v.id("workflow_versions")),
    scheduledJobId: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_archived", ["organizationId", "isArchived"])
    .index("by_name", ["name"])
    .index("by_creator", ["createdBy"]),

  workflow_versions: defineTable({
    workflowId: v.id("workflows"),
    versionNumber: v.number(),
    kind: workflowVersionKindValidator,
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
    sourceVersionId: v.optional(v.id("workflow_versions")),
    compileStatus: v.union(v.literal("valid"), v.literal("invalid")),
    compileErrors: v.optional(v.array(v.string())),
    message: v.optional(v.string()),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_workflow_kind", ["workflowId", "kind"])
    .index("by_workflow_version_number", ["workflowId", "versionNumber"]),

  workflow_nodes: defineTable({
    versionId: v.id("workflow_versions"),
    nodeKey: v.string(),
    type: v.string(),
    label: v.optional(v.string()),
    positionX: v.float64(),
    positionY: v.float64(),
    config: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_version", ["versionId"])
    .index("by_version_node_key", ["versionId", "nodeKey"]),

  workflow_edges: defineTable({
    versionId: v.id("workflow_versions"),
    edgeKey: v.string(),
    sourceNodeKey: v.string(),
    sourceHandle: v.optional(v.string()),
    targetNodeKey: v.string(),
    targetHandle: v.optional(v.string()),
    kind: v.union(v.literal("default"), v.literal("true"), v.literal("false")),
    label: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_version", ["versionId"])
    .index("by_version_edge_key", ["versionId", "edgeKey"]),

  workflow_runs: defineTable({
    workflowId: v.id("workflows"),
    versionId: v.id("workflow_versions"),
    organizationId: v.optional(v.string()),
    triggerType: workflowTriggerTypeValidator,
    status: workflowRunStatusValidator,
    input: v.optional(v.any()),
    output: v.optional(v.any()),
    error: v.optional(v.any()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    initiatedBy: v.optional(v.string()),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_workflow_started_at", ["workflowId", "startedAt"])
    .index("by_organization_started_at", ["organizationId", "startedAt"]),

  workflow_run_events: defineTable({
    runId: v.id("workflow_runs"),
    seq: v.number(),
    type: v.string(),
    nodeKey: v.optional(v.string()),
    level: workflowEventLevelValidator,
    payload: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_seq", ["runId", "seq"]),

  workflow_secrets: defineTable({
    organizationId: v.optional(v.string()),
    name: v.string(),
    provider: v.optional(v.string()),
    description: v.optional(v.string()),
    encryptedValue: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_name", ["organizationId", "name"]),
};
