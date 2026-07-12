import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const get = query({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    return await ctx.db.query("projectRequirements")
      .withIndex("by_project", q => q.eq("projectId", projectId))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    projectId: v.string(),
    functional: v.array(v.string()),
    nonFunctional: v.array(v.string()),
    assumptions: v.array(v.string()),
    status: v.union(v.literal("pending"), v.literal("confirmed")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("projectRequirements")
      .withIndex("by_project", q => q.eq("projectId", args.projectId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("projectRequirements", { ...args, updatedAt: Date.now() });
    }
  },
});
