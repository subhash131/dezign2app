
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// Helper to hash an API key
async function hashKey(key: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Helper to generate a random key
function generateRawKey() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return `sk_live_${Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

export const generate = mutation({
  args: { 
    name: v.optional(v.string()),
    projectId: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthorized");
    }

    const rawKey = generateRawKey();
    const keyHash = await hashKey(rawKey);
    
    await ctx.db.insert("api_keys", {
      keyHash,
      userId: identity.subject,
      name: args.name,
      projectId: args.projectId,
      orgId: identity.org_id?.toString() || undefined,
      createdAt: Date.now(),
    });

    return rawKey; // Return the raw key only once
  },
});

export const list = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthorized");
    }

    const keys = await ctx.db
      .query("api_keys")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();

    return keys;
  },
});

export const listPaginated = query({
  args: { 
    paginationOpts: paginationOptsValidator,
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthorized");
    }

    const { page, isDone, continueCursor } = await ctx.db
      .query("api_keys")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .paginate(args.paginationOpts);

    // Enrich with project name
    const keysWithProjects = await Promise.all(
      page.map(async (key) => {
        let projectName: string | undefined;
        if (key.projectId) {
          try {
            const project = await ctx.db.get(key.projectId as any);
            projectName = (project as any)?.name;
          } catch {
            // project may have been deleted
          }
        }
        return { ...key, projectName };
      })
    );

    return {
      page: keysWithProjects,
      isDone,
      continueCursor,
    };
  },
});

export const revoke = mutation({
  args: { id: v.id("api_keys") },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthorized");
    }

    const existing = await ctx.db.get(args.id);
    if (!existing) return; 
    
    if (existing.userId !== identity.subject) {
      throw new ConvexError("Unauthorized");
    }

    await ctx.db.delete(args.id);
  },
});

export const validate = query({
  args: { 
    key: v.string(),
  },
  async handler(ctx, args) {
    const keyHash = await hashKey(args.key);
    const keyRecord = await ctx.db
      .query("api_keys")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
      .unique();

    if (!keyRecord) return null;

    // Update last used timestamp (best-effort, cannot do inside a query, but logged here)
    return {
      userId: keyRecord.userId,
      keyId: keyRecord._id,
      orgId: keyRecord.orgId,
      projectId: keyRecord.projectId,
    };
  },
});
