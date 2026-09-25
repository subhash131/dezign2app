import { v, ConvexError } from "convex/values";
import { mutation } from "../_generated/server";
import { backendNodeDataValidator } from "../schema/canvasValidators";
import { log } from "../logger";
import { assertActiveSubscriptionForProject } from "../auth_guards";

export const upsertBackendNode = mutation({
  args: {
    projectId: v.id("projects"),
    nodeId: v.string(),
    type: v.string(),
    position: v.object({ x: v.number(), y: v.number() }),
    data: backendNodeDataValidator,
    fractionalIndex: v.string(),
  },
  async handler(ctx, args) {
    const labelToLog =
      "label" in args.data && typeof args.data.label === "string"
        ? args.data.label
        : undefined;
    log("upsertBackendNode called with args:", {
      nodeId: args.nodeId,
      type: args.type,
      label: labelToLog,
    });
    await assertActiveSubscriptionForProject(ctx, args.projectId);

    if (args.type === "auth" && typeof args.data === "object" && args.data !== null) {
      if ("dbNodeId" in args.data) {
        delete args.data.dbNodeId;
      }
      if ("dbConnectionStringEnv" in args.data) {
        delete args.data.dbConnectionStringEnv;
      }
    }

    if (
      args.data &&
      "label" in args.data &&
      typeof args.data.label === "string" &&
      args.data.label.trim() !== ""
    ) {
      const allNodes = await ctx.db
        .query("canvas_backend_nodes")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();

      const label = args.data.label.trim();
      const isWebPage = args.type === "webPage";
      const exists = allNodes.some(
        (n) =>
          n.nodeId !== args.nodeId &&
          (isWebPage ? n.type === "webPage" : n.type !== "webPage") &&
          n.data?.label &&
          typeof n.data.label === "string" &&
          n.data.label.trim().toLowerCase() === label.toLowerCase(),
      );

      if (exists) {
        throw new ConvexError(
          `A node with the name "${label}" already exists in this project.`,
        );
      }
    }

    if (
      args.type === "entity" &&
      "columns" in args.data &&
      Array.isArray(args.data.columns)
    ) {
      const seen = new Set<string>();
      for (const col of args.data.columns) {
        if (
          !col ||
          typeof col !== "object" ||
          !("name" in col) ||
          typeof col.name !== "string" ||
          col.name.trim() === ""
        )
          continue;
        const lowerName = col.name.toLowerCase();
        if (seen.has(lowerName)) {
          throw new ConvexError(
            `A column with the name "${col.name}" already exists in this table.`,
          );
        }
        seen.add(lowerName);
      }
    }

    const existing = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project_node", (q) =>
        q.eq("projectId", args.projectId).eq("nodeId", args.nodeId),
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

    // Trigger background sync to System Design Engine
    // TODO: ctx.scheduler.runAfter(0, internal.sync.triggerWebhook, { projectId: args.projectId });
  },
});

export const removeBackendNode = mutation({
  args: { projectId: v.id("projects"), nodeId: v.string() },
  async handler(ctx, args) {
    await assertActiveSubscriptionForProject(ctx, args.projectId);

    const existing = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project_node", (q) =>
        q.eq("projectId", args.projectId).eq("nodeId", args.nodeId),
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

/**
 * Lightweight mutation used by the system-design-engine page editor to
 * patch specific fields on a node's `data` object without requiring the
 * full node payload. Merges the provided fields into the existing data.
 */
export const patchNodeData = mutation({
  args: {
    projectId: v.id("projects"),
    nodeId: v.string(),
    patch: v.any(),
  },
  async handler(ctx, args) {
    await assertActiveSubscriptionForProject(ctx, args.projectId);

    const existing = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project_node", (q) =>
        q.eq("projectId", args.projectId).eq("nodeId", args.nodeId),
      )
      .unique();

    if (!existing) {
      throw new ConvexError(
        `Node ${args.nodeId} not found in project ${args.projectId}`,
      );
    }

    const mergedData = { ...existing.data, ...args.patch };
    await ctx.db.patch(existing._id, { data: mergedData });
  },
});
