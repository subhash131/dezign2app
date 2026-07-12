import { defineTable } from "convex/server";
import { v } from "convex/values";

export const requirementsTables = {
  projectRequirements: defineTable({
    projectId: v.string(),
    functional: v.array(v.string()),
    nonFunctional: v.array(v.string()),
    assumptions: v.array(v.string()),
    status: v.union(v.literal("pending"), v.literal("confirmed")),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),
};
