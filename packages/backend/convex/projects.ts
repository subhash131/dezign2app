import { ConvexError, v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Doc } from "./_generated/dataModel";
import { components } from "./_generated/api";

// Helper to verify if a user belongs to an organization
async function isUserAuthorizedForOrg(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  targetOrgId: string,
  tokenOrgId?: string,
): Promise<boolean> {
  if (tokenOrgId && tokenOrgId === targetOrgId) {
    return true;
  }
  try {
    const member = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "member",
      where: [
        { field: "userId", value: userId },
        { field: "organizationId", value: targetOrgId },
      ],
    });
    return !!member;
  } catch (err) {
    console.error("[projects] Error checking org membership:", err);
    return false;
  }
}

export const createProject = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    organizationId: v.optional(v.union(v.string(), v.null())),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const userId = identity.subject;
    const tokenOrgId = identity.org_id?.toString();

    let targetOrgId: string | undefined = undefined;
    if (
      args.organizationId !== undefined &&
      args.organizationId !== null &&
      args.organizationId !== "personal"
    ) {
      targetOrgId = args.organizationId;
    } else if (args.organizationId === undefined && tokenOrgId) {
      targetOrgId = tokenOrgId;
    }

    if (targetOrgId) {
      const authorized = await isUserAuthorizedForOrg(
        ctx,
        userId,
        targetOrgId,
        tokenOrgId,
      );
      if (!authorized) {
        throw new ConvexError({
          code: "UNAUTHORIZED",
          message: "Not authorized to create project in this organization",
        });
      }
    }

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      description: args.description,
      organizationId: targetOrgId,
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Add a default global test case
    await ctx.db.insert("canvas_backend_test_cases", {
      projectId,
      testCaseId: `case-${Date.now()}`,
      data: {
        id: `case-${Date.now()}`,
        name: "Test Case 1",
        targetNodeId: "",
        request: { body: null },
        enabled: true,
      },
    });

    return projectId;
  },
});

export const getProjectsByOrganization = query({
  args: {
    paginationOpts: paginationOptsValidator,
    organizationId: v.optional(v.union(v.string(), v.null())),
    userEmail: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        page: [],
        isDone: true,
        continueCursor: "",
      };
    }

    const userId = identity.subject;
    const tokenOrgId = identity.org_id?.toString();

    // Determine target organization:
    // If organizationId is specified:
    //   - non-empty string: target organization
    //   - null or "personal" or empty string: personal workspace
    // If organizationId is undefined:
    //   - fallback to tokenOrgId (if present) else personal workspace
    let targetOrgId: string | null = null;
    if (args.organizationId !== undefined) {
      targetOrgId =
        args.organizationId && args.organizationId !== "personal"
          ? args.organizationId
          : null;
    } else if (tokenOrgId) {
      targetOrgId = tokenOrgId;
    }

    if (targetOrgId) {
      // Verify user is authorized for this organization
      const authorized = await isUserAuthorizedForOrg(
        ctx,
        userId,
        targetOrgId,
        tokenOrgId,
      );
      if (!authorized) {
        return {
          page: [],
          isDone: true,
          continueCursor: "",
        };
      }

      return await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) => q.eq("organizationId", targetOrgId))
        .order("desc")
        .paginate(args.paginationOpts);
    }

    // Personal Workspace: Strictly personal projects created by this user
    return await ctx.db
      .query("projects")
      .withIndex("by_creator_organization", (q) =>
        q.eq("createdBy", userId).eq("organizationId", undefined),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getProjectById = query({
  args: { projectId: v.id("projects") },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return null;
    }

    const userOrgId = identity.org_id?.toString();

    // Check organization membership or creator status
    if (project.organizationId) {
      const authorized = await isUserAuthorizedForOrg(
        ctx,
        identity.subject,
        project.organizationId,
        userOrgId,
      );
      if (!authorized && project.createdBy !== identity.subject) {
        return null;
      }
    } else {
      if (project.createdBy !== identity.subject) {
        return null;
      }
    }

    return project;
  },
});

export const assignProjectOrganization = mutation({
  args: {
    projectId: v.id("projects"),
    organizationId: v.optional(v.union(v.string(), v.null())),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }
    if (project.createdBy !== identity.subject) {
      throw new ConvexError("Unauthorized");
    }
    const targetOrgId =
      args.organizationId && args.organizationId !== "personal"
        ? args.organizationId
        : undefined;

    if (targetOrgId) {
      const authorized = await isUserAuthorizedForOrg(
        ctx,
        identity.subject,
        targetOrgId,
        identity.org_id?.toString(),
      );
      if (!authorized) {
        throw new ConvexError("Not authorized for this organization");
      }
    }
    await ctx.db.patch(args.projectId, {
      organizationId: targetOrgId,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const updateProject = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    if (project.createdBy !== identity.subject) {
      throw new ConvexError("Unauthorized");
    }

    const patches: Partial<Doc<"projects">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) patches.name = args.name;
    if (args.description !== undefined) patches.description = args.description;

    await ctx.db.patch(args.projectId, patches);
  },
});

export const removeProject = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    if (project.createdBy !== identity.subject) {
      throw new ConvexError("Unauthorized");
    }

    // Cascade-delete: canvas backend nodes
    const nodes = await ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const node of nodes) {
      await ctx.db.delete(node._id);
    }

    // Cascade-delete: canvas backend edges
    const edges = await ctx.db
      .query("canvas_backend_edges")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const edge of edges) {
      await ctx.db.delete(edge._id);
    }

    // Cascade-delete: canvas frontend records
    const frontendRecords = await ctx.db
      .query("canvas_frontend_records")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const record of frontendRecords) {
      await ctx.db.delete(record._id);
    }

    // Cascade-delete: project chats and their messages
    const chats = await ctx.db
      .query("project_chats")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const chat of chats) {
      const messages = await ctx.db
        .query("project_chat_messages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .collect();
      for (const message of messages) {
        await ctx.db.delete(message._id);
      }
      await ctx.db.delete(chat._id);
    }

    // Cascade-delete: project requirements
    const requirements = await ctx.db
      .query("projectRequirements")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const req of requirements) {
      await ctx.db.delete(req._id);
    }

    // Cascade-delete: project plans
    const plans = await ctx.db
      .query("projectPlans")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const plan of plans) {
      await ctx.db.delete(plan._id);
    }

    // Cascade-delete: canvas backend endpoints
    const endpoints = await ctx.db
      .query("canvas_backend_endpoints")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const endpoint of endpoints) {
      await ctx.db.delete(endpoint._id);
    }

    // Cascade-delete: canvas backend events
    const events = await ctx.db
      .query("canvas_backend_events")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    // Cascade-delete: canvas backend identity providers
    const identityProviders = await ctx.db
      .query("canvas_backend_identity_providers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const provider of identityProviders) {
      await ctx.db.delete(provider._id);
    }

    // Cascade-delete: canvas backend test cases
    const testCases = await ctx.db
      .query("canvas_backend_test_cases")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const tc of testCases) {
      await ctx.db.delete(tc._id);
    }

    // Cascade-delete: canvas backend langgraph steps
    const langgraphSteps = await ctx.db
      .query("canvas_backend_langgraph_steps")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const step of langgraphSteps) {
      await ctx.db.delete(step._id);
    }

    // Cascade-delete: canvas backend langgraph edges
    const langgraphEdges = await ctx.db
      .query("canvas_backend_langgraph_edges")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const lgEdge of langgraphEdges) {
      await ctx.db.delete(lgEdge._id);
    }

    // Cascade-delete: langgraph thread checkpoints
    const checkpoints = await ctx.db
      .query("langgraph_checkpoints")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const cp of checkpoints) {
      await ctx.db.delete(cp._id);
    }

    // Cascade-delete: API keys bound to this project
    const apiKeys = await ctx.db
      .query("api_keys")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    for (const key of apiKeys) {
      if (key.projectId === args.projectId) {
        await ctx.db.delete(key._id);
      }
    }

    // Finally delete the project itself
    await ctx.db.delete(args.projectId);
  },
});

export const duplicateProject = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    if (project.createdBy !== identity.subject) {
      throw new ConvexError("Unauthorized");
    }

    const { _id, _creationTime, ...projectRest } = project;
    const newProjectId = await ctx.db.insert("projects", {
      ...projectRest,
      name: `${projectRest.name} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return newProjectId;
  },
});
