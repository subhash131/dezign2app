import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isValidConnection, isBackendNode, RULES_VERSION, BackendNodeType, BackendNode, BackendEdgeType, BackendEdge, nodeDataSchemas } from "@workspace/canvas";

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

    const endpoints = await ctx.db
      .query("canvas_backend_endpoints")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const events = await ctx.db
      .query("canvas_backend_events")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const testCases = await ctx.db
      .query("canvas_backend_test_cases")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Sort by fractionalIndex for correct ordering
    nodes.sort((a, b) => (a.fractionalIndex < b.fractionalIndex ? -1 : 1));
    edges.sort((a, b) => (a.fractionalIndex < b.fractionalIndex ? -1 : 1));

    return { 
      nodes, 
      edges, 
      endpoints: endpoints.map(e => ({ ...e.data, nodeId: e.nodeId, id: e.endpointId })), 
      events: events.map(e => ({ ...e.data, nodeId: e.nodeId, variant: e.variant, id: e.eventId })),
      testCases: testCases.map(t => ({ ...t.data, id: t.testCaseId }))
    };
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
    console.log("upsertBackendNode called with args:", { nodeId: args.nodeId, type: args.type, label: args.data?.label });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const schema = nodeDataSchemas[args.type];
    if (schema) {
      // Validate the data against the strict Zod schema for this node type
      const parsed = schema.safeParse(args.data);
      if (!parsed.success) {
        throw new ConvexError(`Invalid data for node type '${args.type}': ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`);
      }
      args.data = parsed.data;
    }

    if ((args.type === "entity" || args.type === "group") && args.data?.label) {
      const allNodes = await ctx.db
        .query("canvas_backend_nodes")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();

      const exists = allNodes.some(
        (n) =>
          n.nodeId !== args.nodeId &&
          n.type === args.type &&
          n.data?.label?.toLowerCase() === args.data.label.toLowerCase()
      );

      if (exists) {
        const typeName = args.type === "entity" ? "table" : "schema group";
        throw new ConvexError(`A ${typeName} with the name "${args.data.label}" already exists.`);
      }
    }

    if (args.type === "entity" && Array.isArray(args.data?.columns)) {
      const seen = new Set<string>();
      for (const col of args.data.columns) {
        if (!col.name || typeof col.name !== "string" || col.name.trim() === "") continue;
        const lowerName = col.name.toLowerCase();
        if (seen.has(lowerName)) {
          throw new ConvexError(`A column with the name "${col.name}" already exists in this table.`);
        }
        seen.add(lowerName);
      }
    }

    const existing = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project_node", (q) =>
        q.eq("projectId", args.projectId).eq("nodeId", args.nodeId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        type: args.type as BackendNodeType,
        position: args.position,
        data: args.data as BackendNode["data"],
        fractionalIndex: args.fractionalIndex,
      });
    } else {
      await ctx.db.insert("canvas_backend_nodes", {
        projectId: args.projectId,
        nodeId: args.nodeId,
        type: args.type as BackendNodeType,
        position: args.position,
        data: args.data as BackendNode["data"],
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
    sourceHandle: v.optional(v.string()),
    targetHandle: v.optional(v.string()),
    data: v.optional(v.any()),
    fractionalIndex: v.string(),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    // --- Edge Validation (Primary Enforcement) ---
    // Look up source & target nodes to get their types
    const sourceNode = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project_node", (q) =>
        q.eq("projectId", args.projectId).eq("nodeId", args.source)
      )
      .unique();

    const targetNode = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project_node", (q) =>
        q.eq("projectId", args.projectId).eq("nodeId", args.target)
      )
      .unique();

    if (!sourceNode) {
      throw new ConvexError({
        code: "SOURCE_NODE_NOT_FOUND",
        message: `Source node "${args.source}" not found in project.`,
      });
    }
    if (!targetNode) {
      throw new ConvexError({
        code: "TARGET_NODE_NOT_FOUND",
        message: `Target node "${args.target}" not found in project.`,
      });
    }

    // Fetch existing edges for duplicate detection (exclude current edgeId for upsert case)
    const existingEdges = await ctx.db
      .query("canvas_backend_edges")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const otherEdges = existingEdges
      .filter((e) => e.edgeId !== args.edgeId)
      .map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      }));

    if (!isBackendNode(sourceNode.type) || !isBackendNode(targetNode.type)) {
      throw new ConvexError("Invalid node type");
    }

    const result = isValidConnection(
      sourceNode.type,
      args.sourceHandle,
      targetNode.type,
      args.targetHandle,
      {
        sourceNodeId: args.source,
        targetNodeId: args.target,
        existingEdges: otherEdges,
      },
    );

    if (!result.valid) {
      throw new ConvexError({
        code: result.code,
        message: result.message,
        ...(result.suggestion && { suggestion: result.suggestion }),
      });
    }

    // Use validated edge type — the mutation is authoritative, not the client
    const validatedType = result.edgeType;
    const enrichedData = {
      ...args.data,
      ...(result.resourceKind && { resourceKind: result.resourceKind }),
    };

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
        type: validatedType as BackendEdgeType,
        sourceHandle: args.sourceHandle,
        targetHandle: args.targetHandle,
        data: enrichedData as BackendEdge["data"],
        fractionalIndex: args.fractionalIndex,
        rulesVersion: RULES_VERSION,
      });
    } else {
      await ctx.db.insert("canvas_backend_edges", {
        projectId: args.projectId,
        edgeId: args.edgeId,
        source: args.source,
        target: args.target,
        type: validatedType as BackendEdgeType,
        sourceHandle: args.sourceHandle,
        targetHandle: args.targetHandle,
        data: enrichedData as BackendEdge["data"],
        fractionalIndex: args.fractionalIndex,
        rulesVersion: RULES_VERSION,
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





// Trigger convex reload

export const upsertBackendEndpoint = mutation({
  args: {
    projectId: v.id("projects"),
    nodeId: v.string(),
    endpointId: v.string(),
    data: v.any(),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_endpoints")
      .withIndex("by_node_endpoint", (q) =>
        q.eq("nodeId", args.nodeId).eq("endpointId", args.endpointId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data });
    } else {
      await ctx.db.insert("canvas_backend_endpoints", {
        projectId: args.projectId,
        nodeId: args.nodeId,
        endpointId: args.endpointId,
        data: args.data,
      });
    }
  },
});

export const removeBackendEndpoint = mutation({
  args: { projectId: v.id("projects"), nodeId: v.string(), endpointId: v.string() },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_endpoints")
      .withIndex("by_node_endpoint", (q) =>
        q.eq("nodeId", args.nodeId).eq("endpointId", args.endpointId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const upsertBackendEvent = mutation({
  args: {
    projectId: v.id("projects"),
    nodeId: v.string(),
    eventId: v.string(),
    variant: v.union(v.literal("publish"), v.literal("consume")),
    data: v.any(),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_events")
      .withIndex("by_node_event", (q) =>
        q.eq("nodeId", args.nodeId).eq("eventId", args.eventId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { variant: args.variant, data: args.data });
    } else {
      await ctx.db.insert("canvas_backend_events", {
        projectId: args.projectId,
        nodeId: args.nodeId,
        eventId: args.eventId,
        variant: args.variant,
        data: args.data,
      });
    }
  },
});

export const removeBackendEvent = mutation({
  args: { projectId: v.id("projects"), nodeId: v.string(), eventId: v.string() },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_events")
      .withIndex("by_node_event", (q) =>
        q.eq("nodeId", args.nodeId).eq("eventId", args.eventId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// ---------------------------------------------------------------------------
// TEST CASES
// ---------------------------------------------------------------------------

export const upsertBackendTestCase = mutation({
  args: {
    projectId: v.id("projects"),
    testCaseId: v.string(),
    data: v.any(), // uses simulationTestCaseSchema
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_test_cases")
      .withIndex("by_project_test_case", (q) =>
        q.eq("projectId", args.projectId).eq("testCaseId", args.testCaseId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data });
    } else {
      await ctx.db.insert("canvas_backend_test_cases", {
        projectId: args.projectId,
        testCaseId: args.testCaseId,
        data: args.data,
      });
    }
  },
});

export const removeBackendTestCase = mutation({
  args: { projectId: v.id("projects"), testCaseId: v.string() },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const existing = await ctx.db
      .query("canvas_backend_test_cases")
      .withIndex("by_project_test_case", (q) =>
        q.eq("projectId", args.projectId).eq("testCaseId", args.testCaseId)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
