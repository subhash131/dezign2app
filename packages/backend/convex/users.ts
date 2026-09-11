import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";

export const getSubscriptionStatus = query({
  args: {
    email: v.optional(v.string()),
    organizationId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const userEmail = identity?.email || args.email;
    if (!userEmail) {
      return { status: "unauthenticated" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", userEmail))
      .first();

    if (!user) {
      return { status: "no_subscription", hasPriorSubscription: false };
    }

    const authUserId = identity?.subject || user.authId;

    // 1. If in an Organization workspace: check organization membership & org billing
    if (args.organizationId && args.organizationId !== "personal") {
      let isMember = false;
      let memberRole = "member";

      if (authUserId) {
        try {
          const member = await ctx.runQuery(
            components.betterAuth.adapter.findOne,
            {
              model: "member",
              where: [
                { field: "userId", value: authUserId },
                { field: "organizationId", value: args.organizationId },
              ],
            },
          );
          if (member) {
            isMember = true;
            memberRole = member.role;
          }
        } catch (e) {
          console.error("[getSubscriptionStatus] Error checking member:", e);
        }
      }

      if (isMember) {
        // Check organization_billing record
        const orgBilling = await ctx.db
          .query("organization_billing")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId!),
          )
          .first();

        if (
          orgBilling &&
          (orgBilling.status === "active" || orgBilling.status === "trialing")
        ) {
          return {
            status: "active",
            isOrgSeat: true,
            organizationId: args.organizationId,
            role: memberRole,
            hasPriorSubscription: true,
          };
        }

        // Fallback: check if the organization owner has an active subscription or early believer status
        try {
          const ownerMember = await ctx.runQuery(
            components.betterAuth.adapter.findOne,
            {
              model: "member",
              where: [
                { field: "organizationId", value: args.organizationId },
                { field: "role", value: "owner" },
              ],
            },
          );

          if (ownerMember?.userId) {
            const ownerUser = await ctx.db
              .query("users")
              .withIndex("by_auth_id", (q) =>
                q.eq("authId", ownerMember.userId),
              )
              .first();

            if (ownerUser) {
              const ownerSubs = await ctx.db
                .query("subscriptions")
                .withIndex("by_user", (q) => q.eq("userId", ownerUser._id))
                .collect();

              const activeOwnerSub = ownerSubs.find(
                (s) => s.status === "active" || s.status === "trialing",
              );

              if (activeOwnerSub) {
                return {
                  status: "active",
                  isOrgSeat: true,
                  organizationId: args.organizationId,
                  role: memberRole,
                  hasPriorSubscription: true,
                };
              }
            }
          }
        } catch (e) {
          console.error(
            "[getSubscriptionStatus] Error checking owner subscription:",
            e,
          );
        }

        return {
          status: "inactive",
          isOrgSeat: true,
          organizationId: args.organizationId,
          role: memberRole,
          hasPriorSubscription: false,
        };
      } else {
        return {
          status: "unauthorized_org",
          isOrgSeat: true,
          organizationId: args.organizationId,
          hasPriorSubscription: false,
        };
      }
    }

    // 2. If in Personal workspace: check the user's personal subscription
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Check if user belongs to any organizations to provide smart routing
    let userOrgCount = 0;
    if (authUserId) {
      try {
        const membershipsRes = await ctx.runQuery(
          components.betterAuth.adapter.findMany,
          {
            model: "member",
            where: [{ field: "userId", value: authUserId }],
            paginationOpts: { cursor: null, numItems: 100 },
          },
        );
        userOrgCount = membershipsRes?.page?.length || 0;
      } catch (e) {}
    }

    // If no subscriptions found at all, user is "new" to payments
    if (subscriptions.length === 0) {
      return {
        status: "no_subscription",
        isOrgSeat: false,
        hasPriorSubscription: false,
        hasOrganizations: userOrgCount > 0,
      };
    }

    // Find if there is any active subscription
    const activeSub = subscriptions.find(
      (sub) => sub.status === "active" || sub.status === "trialing",
    );

    if (activeSub) {
      return {
        status: "active",
        isOrgSeat: false,
        hasPriorSubscription: true,
        creemSubscriptionId: activeSub.creemSubscriptionId,
        planId: activeSub.planId,
        hasOrganizations: userOrgCount > 0,
      };
    }

    // If subscriptions exist but none are active, they are an "existing" user with a lapsed sub
    return {
      status: "inactive",
      isOrgSeat: false,
      hasPriorSubscription: true,
      hasOrganizations: userOrgCount > 0,
    };
  },
});

export const ensureAuthUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
    authId: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingUser) {
      const updates: { authId?: string; avatarUrl?: string } = {};
      if (args.authId && !existingUser.authId) {
        updates.authId = args.authId;
      }
      if (args.avatarUrl && !existingUser.avatarUrl) {
        updates.avatarUrl = args.avatarUrl;
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existingUser._id, updates);
      }
      return existingUser._id;
    }

    const newUserId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      authId: args.authId,
      avatarUrl: args.avatarUrl,
      passwordHash: "",
      createdAt: Date.now(),
    });

    return newUserId;
  },
});

export const syncCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) return null;

    const email = identity.email;
    const name = identity.name || email.split("@")[0] || "User";
    const authId = identity.subject;
    const avatarUrl = identity.pictureUrl;

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existingUser) {
      if (authId && !existingUser.authId) {
        await ctx.db.patch(existingUser._id, {
          authId,
        });
      }
      return existingUser._id;
    }

    return await ctx.db.insert("users", {
      email,
      name,
      authId,
      avatarUrl,
      passwordHash: "",
      createdAt: Date.now(),
    });
  },
});

export const getIsSystemAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    return user?.isSystemAdmin ?? false;
  },
});

export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();
  },
});
