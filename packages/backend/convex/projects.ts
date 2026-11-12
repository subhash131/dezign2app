import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { log } from "./logger";
import {
  isUserAuthorizedForOrg,
  assertCanCreateProject,
  assertActiveSubscriptionForProject,
} from "./auth_guards";

async function deepCopyProjectData(
  ctx: MutationCtx,
  sourceProjectId: Id<"projects">,
  targetProjectId: Id<"projects">,
) {
  // 1. Concurrently fetch all source project collections in parallel
  const [
    nodes,
    edges,
    endpoints,
    events,
    idps,
    testCases,
    frontendRecords,
    langgraphSteps,
    langgraphEdges,
    reqs,
    plans,
  ] = await Promise.all([
    ctx.db
      .query("canvas_backend_nodes")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("canvas_backend_edges")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("canvas_backend_endpoints")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("canvas_backend_events")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("canvas_backend_identity_providers")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("canvas_backend_test_cases")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("canvas_frontend_records")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("canvas_backend_langgraph_steps")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("canvas_backend_langgraph_edges")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("projectRequirements")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
    ctx.db
      .query("projectPlans")
      .withIndex("by_project", (q) => q.eq("projectId", sourceProjectId))
      .collect(),
  ]);

  // 2. Concurrently insert all records into the target project
  await Promise.all([
    ...nodes.map((n) => {
      const { _id, _creationTime, projectId, ...nodeRest } = n;
      return ctx.db.insert("canvas_backend_nodes", {
        ...nodeRest,
        projectId: targetProjectId,
      });
    }),
    ...edges.map((e) => {
      const { _id, _creationTime, projectId, ...edgeRest } = e;
      return ctx.db.insert("canvas_backend_edges", {
        ...edgeRest,
        projectId: targetProjectId,
      });
    }),
    ...endpoints.map((ep) => {
      const { _id, _creationTime, projectId, ...epRest } = ep;
      return ctx.db.insert("canvas_backend_endpoints", {
        ...epRest,
        projectId: targetProjectId,
      });
    }),
    ...events.map((ev) => {
      const { _id, _creationTime, projectId, ...evRest } = ev;
      return ctx.db.insert("canvas_backend_events", {
        ...evRest,
        projectId: targetProjectId,
      });
    }),
    ...idps.map((idp) => {
      const { _id, _creationTime, projectId, ...idpRest } = idp;
      return ctx.db.insert("canvas_backend_identity_providers", {
        ...idpRest,
        projectId: targetProjectId,
      });
    }),
    ...testCases.map((tc) => {
      const { _id, _creationTime, projectId, ...tcRest } = tc;
      return ctx.db.insert("canvas_backend_test_cases", {
        ...tcRest,
        projectId: targetProjectId,
      });
    }),
    ...frontendRecords.map((r) => {
      const { _id, _creationTime, projectId, ...recordRest } = r;
      return ctx.db.insert("canvas_frontend_records", {
        ...recordRest,
        projectId: targetProjectId,
      });
    }),
    ...langgraphSteps.map((s) => {
      const { _id, _creationTime, projectId, ...stepRest } = s;
      return ctx.db.insert("canvas_backend_langgraph_steps", {
        ...stepRest,
        projectId: targetProjectId,
      });
    }),
    ...langgraphEdges.map((le) => {
      const { _id, _creationTime, projectId, ...lgEdgeRest } = le;
      return ctx.db.insert("canvas_backend_langgraph_edges", {
        ...lgEdgeRest,
        projectId: targetProjectId,
      });
    }),
    ...reqs.map((req) => {
      const { _id, _creationTime, projectId, ...reqRest } = req;
      return ctx.db.insert("projectRequirements", {
        ...reqRest,
        projectId: targetProjectId,
      });
    }),
    ...plans.map((plan) => {
      const { _id, _creationTime, projectId, ...planRest } = plan;
      return ctx.db.insert("projectPlans", {
        ...planRest,
        projectId: targetProjectId,
      });
    }),
  ]);
}

export const createProject = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    organizationId: v.optional(v.union(v.string(), v.null())),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    log("[createProject] identity:", JSON.stringify({
      resolved: !!identity,
      subject: identity?.subject,
      email: identity?.email,
      org_id: identity?.org_id,
      tokenIdentifier: identity?.tokenIdentifier,
    }));
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

    // Server-side subscription check: require active subscription to create projects
    await assertCanCreateProject(ctx, targetOrgId);

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
      log(`[getProjectsByOrganization] Querying projects for org: ${targetOrgId}`);
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

    log(`[getProjectsByOrganization] Querying personal projects for user: ${userId}`);
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
    log(`[getProjectById] Querying project ${args.projectId}`);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      return null;
    }

    const userOrgId = identity?.org_id?.toString();
    let isOwner = false;

    if (identity) {
      if (project.organizationId) {
        const authorized = await isUserAuthorizedForOrg(
          ctx,
          identity.subject,
          project.organizationId,
          userOrgId,
        );
        if (authorized || project.createdBy === identity.subject) {
          isOwner = true;
        }
      } else {
        if (project.createdBy === identity.subject) {
          isOwner = true;
        }
      }
    }

    // If not owner, only allow viewing if published
    if (!isOwner) {
      if (!project.isPublished) {
        return null;
      }
    }

    return {
      ...project,
      isOwner,
      isReadOnly: !isOwner,
    };
  },
});

export const assignProjectOrganization = mutation({
  args: {
    projectId: v.id("projects"),
    organizationId: v.optional(v.union(v.string(), v.null())),
  },
  async handler(ctx, args) {
    const { identity } = await assertActiveSubscriptionForProject(
      ctx,
      args.projectId,
    );

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
    log(`[updateProject] Updating project ${args.projectId}:`, { name: args.name, description: args.description });
    await assertActiveSubscriptionForProject(ctx, args.projectId);

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
    log(`[removeProject] Removing project ${args.projectId} with cascade delete`);
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
    log(`[removeProject] Successfully deleted project ${args.projectId}`);
  },
});

export const duplicateProject = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    log(`[duplicateProject] Duplicating project ${args.projectId}`);
    const { project, identity } = await assertActiveSubscriptionForProject(
      ctx,
      args.projectId,
    );
    await assertCanCreateProject(ctx, project.organizationId);

    const newProjectId = await ctx.db.insert("projects", {
      name: `${project.name} (Copy)`,
      description: project.description,
      category: project.category,
      tags: project.tags,
      organizationId: project.organizationId,
      createdBy: identity.subject,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublished: false,
      cloneCount: 0,
    });

    await deepCopyProjectData(ctx, args.projectId, newProjectId);
    log(`[duplicateProject] Created copy with new ID ${newProjectId}`);
    return newProjectId;
  },
});

export const cloneProject = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    targetOrganizationId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    log(`[cloneProject] Cloning project ${args.projectId}`);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You must be logged in to clone a project",
      });
    }

    const sourceProject = await ctx.db.get(args.projectId);
    if (!sourceProject) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Project not found",
      });
    }

    // Authorization check: must own project, be in same org, or project must be published
    let isAuthorized = false;
    if (sourceProject.isPublished) {
      isAuthorized = true;
    } else {
      const userOrgId = identity.org_id?.toString();
      if (sourceProject.organizationId) {
        isAuthorized = await isUserAuthorizedForOrg(
          ctx,
          identity.subject,
          sourceProject.organizationId,
          userOrgId,
        );
      }
      if (sourceProject.createdBy === identity.subject) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You are not authorized to clone this project",
      });
    }

    // Determine target organization
    let targetOrgId: string | undefined = undefined;
    if (
      args.targetOrganizationId !== undefined &&
      args.targetOrganizationId !== null &&
      args.targetOrganizationId !== "personal"
    ) {
      targetOrgId = args.targetOrganizationId;
    } else if (args.targetOrganizationId === undefined && identity.org_id) {
      targetOrgId = identity.org_id.toString();
    }

    await assertCanCreateProject(ctx, targetOrgId);

    const newProjectName = args.name || `${sourceProject.name} (Clone)`;
    const newProjectId = await ctx.db.insert("projects", {
      name: newProjectName,
      description: sourceProject.description,
      category: sourceProject.category,
      tags: sourceProject.tags,
      organizationId: targetOrgId,
      createdBy: identity.subject,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublished: false,
      cloneCount: 0,
    });

    await deepCopyProjectData(ctx, args.projectId, newProjectId);

    // Increment clone count on source project
    await ctx.db.patch(args.projectId, {
      cloneCount: (sourceProject.cloneCount ?? 0) + 1,
    });

    log(`[cloneProject] Successfully cloned project ${args.projectId} to ${newProjectId}`);
    return newProjectId;
  },
});

export const publishProject = mutation({
  args: {
    projectId: v.id("projects"),
    isPublished: v.boolean(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  async handler(ctx, args) {
    log(`[publishProject] Toggling publish for project ${args.projectId}: ${args.isPublished}`);
    const { project } = await assertActiveSubscriptionForProject(
      ctx,
      args.projectId,
    );

    const patches: Partial<Doc<"projects">> = {
      isPublished: args.isPublished,
      updatedAt: Date.now(),
    };

    if (args.isPublished && !project.publishedAt) {
      patches.publishedAt = Date.now();
    }
    if (args.description !== undefined) patches.description = args.description;
    if (args.category !== undefined) patches.category = args.category;
    if (args.tags !== undefined) patches.tags = args.tags;

    await ctx.db.patch(args.projectId, patches);
    return { success: true, isPublished: args.isPublished };
  },
});

export const getPublishedProjects = query({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  async handler(ctx, args) {
    log(`[getPublishedProjects] Querying published projects`);
    const paginated = await ctx.db
      .query("projects")
      .withIndex("by_published", (q) => q.eq("isPublished", true))
      .order("desc")
      .paginate(args.paginationOpts);

    let filteredPage = paginated.page;

    if (args.category && args.category !== "all") {
      filteredPage = filteredPage.filter(
        (p) => p.category?.toLowerCase() === args.category?.toLowerCase(),
      );
    }

    if (args.search && args.search.trim()) {
      const q = args.search.toLowerCase();
      filteredPage = filteredPage.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }

    const enrichedPage = await Promise.all(
      filteredPage.map(async (project) => {
        const creator = await ctx.db
          .query("users")
          .withIndex("by_auth_id", (q) => q.eq("authId", project.createdBy))
          .first();

        const nodesCount = (
          await ctx.db
            .query("canvas_backend_nodes")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect()
        ).length;

        const endpointsCount = (
          await ctx.db
            .query("canvas_backend_endpoints")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect()
        ).length;

        return {
          ...project,
          creatorName:
            creator?.name ||
            (creator?.email ? creator.email.split("@")[0] : "Architect"),
          creatorAvatar: creator?.avatarUrl,
          creatorEmail: creator?.email,
          nodesCount,
          endpointsCount,
          cloneCount: project.cloneCount ?? 0,
        };
      }),
    );

    return {
      ...paginated,
      page: enrichedPage,
    };
  },
});
