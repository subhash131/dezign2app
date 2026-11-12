import { v, ConvexError } from "convex/values";
import { mutation, query } from "../_generated/server";
import { log } from "../logger";
import { assertActiveSubscriptionForProject } from "../auth_guards";

export const getFrontendRecords = query({
  args: { projectId: v.id("projects") },
  async handler(ctx, args) {
    log(`[getFrontendRecords] Reading frontend records for project ${args.projectId}`);
    const identity = await ctx.auth.getUserIdentity();
    const project = await ctx.db.get(args.projectId);
    if (!project?.isPublished && !identity) {
      throw new ConvexError("Not authenticated");
    }

    const rows = await ctx.db
      .query("canvas_frontend_records")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Return only live records (not soft-deleted)
    const live = rows.filter((r) => !r.isDeleted).map((r) => r.record);
    log(`[getFrontendRecords] Returning ${live.length} live records for project ${args.projectId}`);
    return live;
  },
});

export const syncFrontendRecords = mutation({
  args: {
    projectId: v.id("projects"),
    put: v.array(v.any()), // records to upsert (added + updated)
    remove: v.array(v.string()), // recordIds to soft-delete
  },
  async handler(ctx, args) {
    log(
      `[syncFrontendRecords] Syncing records for project ${args.projectId}: ${args.put.length} put, ${args.remove.length} remove`,
    );
    await assertActiveSubscriptionForProject(ctx, args.projectId);

    // Upsert each record
    for (const record of args.put) {
      const recordId: string = record.id;
      const existing = await ctx.db
        .query("canvas_frontend_records")
        .withIndex("by_project_record", (q) =>
          q.eq("projectId", args.projectId).eq("recordId", recordId),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { record, isDeleted: false });
      } else {
        await ctx.db.insert("canvas_frontend_records", {
          projectId: args.projectId,
          recordId,
          typeName: record.typeName ?? "unknown",
          record,
          isDeleted: false,
        });
      }
    }

    // Soft-delete removed records
    for (const recordId of args.remove) {
      const existing = await ctx.db
        .query("canvas_frontend_records")
        .withIndex("by_project_record", (q) =>
          q.eq("projectId", args.projectId).eq("recordId", recordId),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { isDeleted: true });
      }
    }
  },
});
