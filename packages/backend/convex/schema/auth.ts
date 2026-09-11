import { defineTable } from "convex/server";
import { v } from "convex/values";

export const authTables = {
  users: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    creemCustomerId: v.optional(v.string()),
    authId: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    isSystemAdmin: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_creem_customer", ["creemCustomerId"])
    .index("by_auth_id", ["authId"]),

  subscriptions: defineTable({
    userId: v.id("users"),
    planId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("incomplete"),
      v.literal("expired"),
      v.literal("trialing"),
      v.literal("unpaid"),
      v.literal("paused"),
      v.literal("free"),
    ),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    creemSubscriptionId: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_creem_sub_id", ["creemSubscriptionId"]),

  api_keys: defineTable({
    keyHash: v.string(),
    userId: v.string(),
    orgId: v.optional(v.string()),
    name: v.optional(v.string()),
    projectId: v.optional(v.string()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_key_hash", ["keyHash"])
    .index("by_user", ["userId"])
    .index("by_user_org", ["userId", "orgId"]),

  early_believers: defineTable({
    userId: v.id("users"),
    tier: v.union(v.literal(500), v.literal(1000)),
    seats: v.number(),
    discountPercent: v.number(),
    investmentAmount: v.optional(v.number()),
    subscriptionMonths: v.optional(v.number()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    totalPaid: v.number(),
    status: v.literal("active"),
    creemCheckoutId: v.optional(v.string()),
    creemCustomerId: v.optional(v.string()),
    purchasedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_creem_customer", ["creemCustomerId"]),

  organization_billing: defineTable({
    organizationId: v.string(),
    ownerUserId: v.id("users"),
    baseSeats: v.number(),
    extraSeats: v.number(),
    totalSeats: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
      v.literal("expired"),
      v.literal("trialing"),
    ),
    creemSubscriptionId: v.optional(v.string()),
    creemCustomerId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_owner", ["ownerUserId"]),
};

