import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";

export const handleCheckoutCompleted = mutation({
  args: {
    data: v.any(),
    secret: v.string(),
  },
  handler: async (ctx, { data, secret }) => {
    const customerEmail = data.customer?.email;
    let userId;
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", customerEmail))
      .first();
    if (user) userId = user._id;

    if (!userId) {
      console.error(`User not found for checkout: ${customerEmail}`);
      return { success: false, error: "User not found" };
    }

    await ctx.db.patch(userId, { creemCustomerId: data.customer?.id });

    // Handle Additional Org Seats checkout metadata
    if (data.metadata?.type === "org_seats") {
      const orgId = data.metadata.organizationId;
      const additionalSeats = Math.max(1, Number(data.metadata.seats) || 1);

      if (orgId) {
        const existingBilling = await ctx.db
          .query("organization_billing")
          .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
          .first();

        if (existingBilling) {
          await ctx.db.patch(existingBilling._id, {
            extraSeats: existingBilling.extraSeats + additionalSeats,
            totalSeats: existingBilling.totalSeats + additionalSeats,
            status: "active",
            updatedAt: Date.now(),
          });
        } else {
          await ctx.db.insert("organization_billing", {
            organizationId: orgId,
            ownerUserId: userId,
            baseSeats: 1,
            extraSeats: additionalSeats,
            totalSeats: 1 + additionalSeats,
            status: "active",
            creemCustomerId: data.customer?.id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    }

    // Handle Early Believer checkout metadata
    if (data.metadata?.type === "early_believer" || data.metadata?.tier) {
      const tier: 500 | 1000 = Number(data.metadata.tier) === 1000 ? 1000 : 500;
      const seats = Math.max(
        1,
        Number(data.metadata.seats) || Number(data.units) || 1,
      );
      const discountPercent = tier === 1000 ? 10 : 5;
      const totalPaid = tier * seats;

      const subscriptionMonths = tier === 1000 ? 12 : 6;
      const investmentPerSeat = tier === 1000 ? 900 : 450;
      const investmentAmount = investmentPerSeat * seats;

      const periodDays = tier === 1000 ? 365 : 182;
      const now = Date.now();
      const periodEnd = now + periodDays * 24 * 60 * 60 * 1000;

      await ctx.db.insert("early_believers", {
        userId,
        tier,
        seats,
        discountPercent,
        investmentAmount,
        subscriptionMonths,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        totalPaid,
        status: "active",
        creemCheckoutId: data.id,
        creemCustomerId: data.customer?.id,
        purchasedAt: now,
      });

      // Grant/extend user's active subscription in Convex DB
      const existingSub = await ctx.db
        .query("subscriptions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();

      if (existingSub) {
        const newEnd = Math.max(existingSub.currentPeriodEnd, periodEnd);
        await ctx.db.patch(existingSub._id, {
          status: "active",
          planId: `early_believer_${tier}`,
          currentPeriodStart: now,
          currentPeriodEnd: newEnd,
        });
      } else {
        await ctx.db.insert("subscriptions", {
          userId,
          planId: `early_believer_${tier}`,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          creemSubscriptionId: `eb_${data.id || now}`,
        });
      }
    }

    if (data.subscription) {
      const productId =
        typeof data.subscription.product === "string"
          ? data.subscription.product
          : data.subscription.product?.id;

      const existingSub = await ctx.db
        .query("subscriptions")
        .withIndex("by_creem_sub_id", (q) =>
          q.eq("creemSubscriptionId", data.subscription.id),
        )
        .unique();

      if (existingSub) {
        await ctx.db.patch(existingSub._id, {
          planId: productId,
          status: data.subscription.status,
        });
      } else {
        await ctx.db.insert("subscriptions", {
          userId,
          planId: productId,
          status: data.subscription.status,
          currentPeriodStart: Date.now(),
          currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
          creemSubscriptionId: data.subscription.id,
        });
      }
    }
    return { success: true };
  },
});

export const getUserEarlyBeliever = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) return null;

    const ebPurchases = await ctx.db
      .query("early_believers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    if (ebPurchases.length === 0) return null;

    const totalSeats = ebPurchases.reduce((acc, item) => acc + item.seats, 0);
    const maxDiscountPercent = Math.max(
      ...ebPurchases.map((item) => item.discountPercent),
    );
    const totalPaid = ebPurchases.reduce(
      (acc, item) => acc + item.totalPaid,
      0,
    );
    const totalInvestment = ebPurchases.reduce(
      (acc, item) =>
        acc +
        (item.investmentAmount ||
          (item.tier === 1000 ? 900 : 450) * item.seats),
      0,
    );
    const maxSubscriptionEnd = Math.max(
      ...ebPurchases.map(
        (item) =>
          item.currentPeriodEnd ||
          item.purchasedAt +
            (item.tier === 1000 ? 365 : 182) * 24 * 60 * 60 * 1000,
      ),
    );

    return {
      purchases: ebPurchases,
      totalSeats,
      discountPercent: maxDiscountPercent,
      totalPaid,
      totalInvestment,
      maxSubscriptionEnd,
    };
  },
});

export const handleSubscriptionEvent = mutation({
  args: {
    type: v.string(),
    data: v.any(),
    secret: v.string(),
  },
  handler: async (ctx, { type, data, secret }) => {
    if (secret !== process.env.CREEM_SUBSCRIPTION_WEBHOOK_SECRET)
      throw new Error("Unauthorized webhook call");

    const customerId = data.customer?.id;
    const user = await ctx.db
      .query("users")
      .withIndex("by_creem_customer", (q) =>
        q.eq("creemCustomerId", customerId),
      )
      .unique();

    if (!user) {
      console.error(`User not found for creemCustomerId: ${customerId}`);
      return { success: false, error: "User not found" };
    }

    const existingSub = await ctx.db
      .query("subscriptions")
      .withIndex("by_creem_sub_id", (q) => q.eq("creemSubscriptionId", data.id))
      .unique();

    let newStatus = data.status;
    if (type === "subscription.canceled") newStatus = "canceled";

    if (existingSub) {
      await ctx.db.patch(existingSub._id, {
        status: newStatus,
      });
    } else {
      const productId =
        typeof data.product === "string" ? data.product : data.product?.id;

      await ctx.db.insert("subscriptions", {
        userId: user._id,
        planId: productId,
        status: newStatus,
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        creemSubscriptionId: data.id,
      });
    }
    return { success: true };
  },
});

export const handleSubscriptionExpired = mutation({
  args: {
    data: v.any(),
    secret: v.string(),
  },
  handler: async (ctx, { data, secret }) => {
    if (secret !== process.env.CREEM_SUBSCRIPTION_WEBHOOK_SECRET)
      throw new Error("Unauthorized webhook call");

    const customerId = data.customer?.id;
    const user = await ctx.db
      .query("users")
      .withIndex("by_creem_customer", (q) =>
        q.eq("creemCustomerId", customerId),
      )
      .unique();

    if (!user) {
      console.error(`User not found for creemCustomerId: ${customerId}`);
      return { success: false, error: "User not found" };
    }

    const existingSub = await ctx.db
      .query("subscriptions")
      .withIndex("by_creem_sub_id", (q) => q.eq("creemSubscriptionId", data.id))
      .unique();

    if (existingSub) {
      await ctx.db.patch(existingSub._id, {
        status: "expired",
      });
    } else {
      const productId =
        typeof data.product === "string" ? data.product : data.product?.id;

      await ctx.db.insert("subscriptions", {
        userId: user._id,
        planId: productId,
        status: "expired",
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now(),
        creemSubscriptionId: data.id,
      });
    }
    return { success: true };
  },
});

export const ensureOrgBilling = mutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) throw new Error("Unauthorized");

    const existingBilling = await ctx.db
      .query("organization_billing")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .first();

    if (existingBilling) {
      return existingBilling;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email!))
      .first();

    if (!user) throw new Error("User not found");

    // Check if user has Early Believer seats
    const ebPurchases = await ctx.db
      .query("early_believers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const ebSeats = ebPurchases.reduce(
      (acc, item) => acc + (item.seats || 1),
      0,
    );
    const totalSeats = Math.max(1, ebSeats);
    const extraSeats = Math.max(0, totalSeats - 1);

    const billingId = await ctx.db.insert("organization_billing", {
      organizationId: args.organizationId,
      ownerUserId: user._id,
      baseSeats: 1,
      extraSeats,
      totalSeats,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return await ctx.db.get(billingId);
  },
});

interface OrgMemberItem {
  _id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: number;
}

interface OrgInvitationItem {
  _id: string;
  organizationId: string;
  email: string;
  role?: string | null;
  status: string;
  expiresAt: number;
  createdAt?: number | null;
  inviterId: string;
}

export const getOrgSeatStatus = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const authUserId = identity.subject;

    // Check if user is a member or owner
    let isMember = false;
    let isOwner = false;
    let memberCount = 0;
    let pendingInviteCount = 0;

    try {
      const membersRes = await ctx.runQuery(
        components.betterAuth.adapter.findMany,
        {
          model: "member",
          where: [{ field: "organizationId", value: args.organizationId }],
          paginationOpts: { cursor: null, numItems: 100 },
        },
      );

      const members: OrgMemberItem[] = membersRes?.page ?? [];
      memberCount = members.length;
      const currentMember = members.find((m) => m.userId === authUserId);
      if (currentMember) {
        isMember = true;
        isOwner = currentMember.role === "owner";
      }

      const invitationsRes = await ctx.runQuery(
        components.betterAuth.adapter.findMany,
        {
          model: "invitation",
          where: [
            { field: "organizationId", value: args.organizationId },
            { field: "status", value: "pending" },
          ],
          paginationOpts: { cursor: null, numItems: 100 },
        },
      );
      const invitations: OrgInvitationItem[] = invitationsRes?.page ?? [];
      pendingInviteCount = invitations.length;
    } catch (e) {
      console.error("[getOrgSeatStatus] Error fetching org members/invites:", e);
    }

    if (!isMember) {
      return null;
    }

    // Get org billing record
    const orgBilling = await ctx.db
      .query("organization_billing")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .first();

    let totalSeats = 1;
    let extraSeats = 0;
    let status = "active";

    if (orgBilling) {
      totalSeats = orgBilling.totalSeats;
      extraSeats = orgBilling.extraSeats;
      status = orgBilling.status;
    } else {
      // Fallback: Check if owner has early believer seats
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identity.email!))
        .first();

      if (user) {
        const ebPurchases = await ctx.db
          .query("early_believers")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

        const ebSeats = ebPurchases.reduce(
          (acc, item) => acc + (item.seats || 1),
          0,
        );
        if (ebSeats > 1) {
          totalSeats = ebSeats;
          extraSeats = ebSeats - 1;
        }
      }
    }

    const usedSeats = memberCount + pendingInviteCount;
    const availableSeats = Math.max(0, totalSeats - usedSeats);
    const canInvite = usedSeats < totalSeats;

    return {
      totalSeats,
      extraSeats,
      baseSeats: 1,
      usedSeats,
      memberCount,
      pendingInviteCount,
      availableSeats,
      canInvite,
      isOwner,
      status,
    };
  },
});

export const getOrgInvitations = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const authUserId = identity.subject;
    const member = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "member",
        where: [
          { field: "organizationId", value: args.organizationId },
          { field: "userId", value: authUserId },
        ],
      },
    );
    if (!member) return [];

    const invitationsRes = await ctx.runQuery(
      components.betterAuth.adapter.findMany,
      {
        model: "invitation",
        where: [
          { field: "organizationId", value: args.organizationId },
          { field: "status", value: "pending" },
        ],
        paginationOpts: { cursor: null, numItems: 100 },
      },
    );

    const invitations: OrgInvitationItem[] = invitationsRes?.page ?? [];
    return invitations.map((inv) => ({
      id: inv._id,
      email: inv.email,
      role: inv.role ?? "member",
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt ?? 0,
      isExpired: inv.expiresAt < Date.now(),
    }));
  },
});

export const getOrgMembers = query({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const authUserId = identity.subject;
    const callerMember = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "member",
        where: [
          { field: "organizationId", value: args.organizationId },
          { field: "userId", value: authUserId },
        ],
      },
    );
    if (!callerMember) return [];

    const membersRes = await ctx.runQuery(
      components.betterAuth.adapter.findMany,
      {
        model: "member",
        where: [{ field: "organizationId", value: args.organizationId }],
        paginationOpts: { cursor: null, numItems: 100 },
      },
    );

    const members: OrgMemberItem[] = membersRes?.page ?? [];

    const memberDetails = await Promise.all(
      members.map(async (m) => {
        let name = "Team Member";
        let email = "";
        let avatarUrl: string | undefined = undefined;

        const userDoc = await ctx.db
          .query("users")
          .withIndex("by_auth_id", (q) => q.eq("authId", m.userId))
          .first();

        if (userDoc) {
          name = userDoc.name;
          email = userDoc.email;
          avatarUrl = userDoc.avatarUrl;
        } else {
          const authUser = await ctx.runQuery(
            components.betterAuth.adapter.findOne,
            {
              model: "user",
              where: [{ field: "_id", value: m.userId }],
            },
          );
          if (authUser) {
            if (typeof authUser.name === "string" && authUser.name.length > 0) {
              name = authUser.name;
            }
            if (typeof authUser.email === "string") {
              email = authUser.email;
            }
            if (typeof authUser.image === "string") {
              avatarUrl = authUser.image;
            }
          }
        }

        return {
          id: m._id,
          userId: m.userId,
          role: m.role,
          createdAt: m.createdAt,
          name,
          email,
          avatarUrl,
          isCurrentUser: m.userId === authUserId,
        };
      }),
    );

    return memberDetails;
  },
});

export const revokeInvitation = mutation({
  args: {
    invitationId: v.string(),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const authUserId = identity.subject;
    const callerMember = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "member",
        where: [
          { field: "organizationId", value: args.organizationId },
          { field: "userId", value: authUserId },
        ],
      },
    );

    if (
      !callerMember ||
      (callerMember.role !== "owner" && callerMember.role !== "admin")
    ) {
      throw new Error(
        "Only organization owners and admins can revoke invitations",
      );
    }

    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: "invitation",
        where: [
          { field: "_id", value: args.invitationId },
          { field: "organizationId", value: args.organizationId },
        ],
      },
      paginationOpts: { cursor: null, numItems: 10 },
    });

    return { success: true };
  },
});

export const getInvitationById = query({
  args: {
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    const invitation = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "invitation",
        where: [{ field: "_id", value: args.invitationId }],
      },
    );

    if (!invitation) {
      return null;
    }

    const organization = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "organization",
        where: [{ field: "_id", value: invitation.organizationId }],
      },
    );

    let inviterName = "A team administrator";
    if (invitation.inviterId) {
      const inviterUser = await ctx.runQuery(
        components.betterAuth.adapter.findOne,
        {
          model: "user",
          where: [{ field: "_id", value: invitation.inviterId }],
        },
      );
      if (inviterUser) {
        if (
          typeof inviterUser.name === "string" &&
          inviterUser.name.trim().length > 0
        ) {
          inviterName = inviterUser.name;
        } else if (typeof inviterUser.email === "string") {
          inviterName = inviterUser.email;
        }
      }
    }

    const isExpired =
      typeof invitation.expiresAt === "number" &&
      invitation.expiresAt < Date.now();

    return {
      id: invitation._id,
      email: typeof invitation.email === "string" ? invitation.email : "",
      role: typeof invitation.role === "string" ? invitation.role : "member",
      status: typeof invitation.status === "string" ? invitation.status : "pending",
      expiresAt:
        typeof invitation.expiresAt === "number" ? invitation.expiresAt : 0,
      isExpired,
      organizationId:
        typeof invitation.organizationId === "string"
          ? invitation.organizationId
          : "",
      organizationName:
        typeof organization?.name === "string"
          ? organization.name
          : "Organization",
      inviterName,
    };
  },
});


