import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// FRONTEND CANVAS — tldraw granular records
// ---------------------------------------------------------------------------

export const getFrontendRecords = query({
  args: { projectId: v.id("projects") },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const rows = await ctx.db
      .query("canvas_frontend_records")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Return only live records (not soft-deleted)
    return rows.filter((r) => !r.isDeleted).map((r) => r.record);
  },
});

export const syncFrontendRecords = mutation({
  args: {
    projectId: v.id("projects"),
    put: v.array(v.any()),      // records to upsert (added + updated)
    remove: v.array(v.string()), // recordIds to soft-delete
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    // Upsert each record
    for (const record of args.put) {
      const recordId: string = record.id;
      const existing = await ctx.db
        .query("canvas_frontend_records")
        .withIndex("by_project_record", (q) =>
          q.eq("projectId", args.projectId).eq("recordId", recordId)
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
          q.eq("projectId", args.projectId).eq("recordId", recordId)
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { isDeleted: true });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// BACKEND CANVAS — React Flow granular nodes & edges
// ---------------------------------------------------------------------------

export const getBackendElements = query({
  args: { projectId: v.id("projects") },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const nodes = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const edges = await ctx.db
      .query("canvas_backend_edges")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Sort by fractionalIndex for correct ordering
    nodes.sort((a, b) => (a.fractionalIndex < b.fractionalIndex ? -1 : 1));
    edges.sort((a, b) => (a.fractionalIndex < b.fractionalIndex ? -1 : 1));

    return { nodes, edges };
  },
});

export const upsertBackendNode = mutation({
  args: {
    projectId: v.id("projects"),
    nodeId: v.string(),
    type: v.string(),
    position: v.object({ x: v.number(), y: v.number() }),
    data: v.any(),
    fractionalIndex: v.string(),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project_node", (q) =>
        q.eq("projectId", args.projectId).eq("nodeId", args.nodeId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        type: args.type,
        position: args.position,
        data: args.data,
        fractionalIndex: args.fractionalIndex,
      });
    } else {
      await ctx.db.insert("canvas_backend_nodes", {
        projectId: args.projectId,
        nodeId: args.nodeId,
        type: args.type,
        position: args.position,
        data: args.data,
        fractionalIndex: args.fractionalIndex,
      });
    }
  },
});

export const removeBackendNode = mutation({
  args: { projectId: v.id("projects"), nodeId: v.string() },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project_node", (q) =>
        q.eq("projectId", args.projectId).eq("nodeId", args.nodeId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Also remove all edges connected to this node
    const connectedEdges = await ctx.db
      .query("canvas_backend_edges")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const edge of connectedEdges) {
      if (edge.source === args.nodeId || edge.target === args.nodeId) {
        await ctx.db.delete(edge._id);
      }
    }
  },
});

export const upsertBackendEdge = mutation({
  args: {
    projectId: v.id("projects"),
    edgeId: v.string(),
    source: v.string(),
    target: v.string(),
    type: v.string(),
    data: v.optional(v.any()),
    fractionalIndex: v.string(),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_edges")
      .withIndex("by_project_edge", (q) =>
        q.eq("projectId", args.projectId).eq("edgeId", args.edgeId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        source: args.source,
        target: args.target,
        type: args.type,
        data: args.data,
        fractionalIndex: args.fractionalIndex,
      });
    } else {
      await ctx.db.insert("canvas_backend_edges", {
        projectId: args.projectId,
        edgeId: args.edgeId,
        source: args.source,
        target: args.target,
        type: args.type,
        data: args.data,
        fractionalIndex: args.fractionalIndex,
      });
    }
  },
});

export const removeBackendEdge = mutation({
  args: { projectId: v.id("projects"), edgeId: v.string() },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_edges")
      .withIndex("by_project_edge", (q) =>
        q.eq("projectId", args.projectId).eq("edgeId", args.edgeId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});


