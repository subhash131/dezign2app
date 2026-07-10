import { defineTable } from "convex/server";
import { v } from "convex/values";

export const featureTables = {
  conversations: defineTable({
    organizationId: v.string(),
    userId: v.string(),
    title: v.string(),
  }).index("by_user", ["userId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    content: v.string(),
    role: v.union(v.literal("USER"), v.literal("AI"), v.literal("SYSTEM")),
    thinking: v.optional(v.string()),
    context: v.optional(v.array(v.any())),
    clientMessageId: v.optional(v.string()),
  }).index("by_conversation", ["conversationId"]),

  embeddings: defineTable({
    task_id: v.id("kanban_tasks"),
    task_title: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_task", ["task_id"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 384,
      filterFields: ["task_title"],
    }),

  kanban_tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("todo"),
      v.literal("in-progress"),
      v.literal("done"),
    ),
    position: v.float64(),
    userId: v.string(),
    organizationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"])
    .index("by_status", ["status"])
    .index("by_user_status", ["userId", "status"])
    .index("by_org_status", ["organizationId", "status"]),

  // Granular tldraw records — one row per shape/asset/camera
  canvas_frontend_records: defineTable({
    projectId: v.id("projects"),
    recordId: v.string(),    // tldraw native ID e.g. "shape:xyz"
    typeName: v.string(),    // "shape" | "asset" | "camera" | etc.
    record: v.any(),
    isDeleted: v.boolean(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_record", ["projectId", "recordId"]),

  // Granular React Flow nodes
  canvas_backend_nodes: defineTable({
    projectId: v.id("projects"),
    nodeId: v.string(),
    type: v.string(),
    position: v.object({ x: v.number(), y: v.number() }),
    data: v.any(),
    fractionalIndex: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_node", ["projectId", "nodeId"]),

  // Granular React Flow edges
  canvas_backend_edges: defineTable({
    projectId: v.id("projects"),
    edgeId: v.string(),
    source: v.string(),
    target: v.string(),
    type: v.string(),
    data: v.optional(v.any()),
    fractionalIndex: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_edge", ["projectId", "edgeId"]),

};
