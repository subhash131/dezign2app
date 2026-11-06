import type { BetterAuthTableDefinition, AuthLifecycleHookDefinition, PaymentsTableDefinition } from "../types/auth";
import type { CanvasEntityColumn } from "../types/database";
import type { AuthNodeData } from "../schemas/nodes/auth";
import { DB_COLUMN_TYPES } from "./database";

// ─── Auth Framework & Better Auth Options ───────────────────────────────────────
export const AUTH_FRAMEWORK_BETTER_AUTH = "better_auth" as const;
export const AUTH_FRAMEWORK_NEXT_AUTH = "next_auth" as const;
export const AUTH_FRAMEWORK_LUCIA = "lucia" as const;
export const AUTH_FRAMEWORK_CUSTOM = "custom" as const;

export const AUTH_FRAMEWORK_OPTIONS = [
  { value: "better_auth", label: "Better Auth" },
] as const;

export const BETTER_AUTH_VERSIONS = [
  { value: "v1.4", label: "v1.4" },
] as const;

export const DEFAULT_AUTH_FRAMEWORK = AUTH_FRAMEWORK_BETTER_AUTH;
export const DEFAULT_BETTER_AUTH_VERSION = "v1.4";

export const ACCOUNT_LINKING_POLICY_OPTIONS = [
  {
    id: "prompt",
    label: "Prompt & Verify",
    desc: "disableImplicitLinking: true — Rejects silent merge with account_not_linked. Requires user password auth + linkSocial().",
  },
  {
    id: "merge",
    label: "Auto-Merge",
    desc: "enabled: true — Automatically links accounts when email matches and provider's email is verified.",
  },
  {
    id: "block",
    label: "Block Account Linking",
    desc: "enabled: false — Prevents linking OAuth logins to existing accounts.",
  },
] as const;

// ─── Auth Lifecycle Hook Events & Default Slots ──────────────────────────────
// Better Auth has TWO separate hook systems:
//   1. Endpoint hooks → hooks.before / hooks.after  (createAuthMiddleware, branch on ctx.path)
//   2. Database hooks → databaseHooks.{model}.{operation}.{before|after}

// --- Endpoint Hook Events (ctx.path strings) ---
export const AUTH_ENDPOINT_HOOK_EVENTS = {
  SIGN_UP: "/sign-up",
  SIGN_IN_EMAIL: "/sign-in/email",
  SIGN_OUT: "/sign-out",
  RESET_PASSWORD: "/reset-password",
  VERIFY_EMAIL: "/verify-email",
} as const;
export type AuthEndpointHookEvent = (typeof AUTH_ENDPOINT_HOOK_EVENTS)[keyof typeof AUTH_ENDPOINT_HOOK_EVENTS];

// Backwards-compat alias (old code referenced AUTH_HOOK_EVENTS)
export const AUTH_HOOK_EVENTS = AUTH_ENDPOINT_HOOK_EVENTS;
export type AuthHookEvent = AuthEndpointHookEvent;

// --- Database Hook Models & Operations (verified against Better Auth v1.x docs) ---
export const AUTH_DB_HOOK_MODELS = ["user", "session", "account"] as const;
export type AuthDbHookModel = (typeof AUTH_DB_HOOK_MODELS)[number];

export const AUTH_DB_HOOK_OPERATIONS = ["create", "update", "delete"] as const;
export type AuthDbHookOperation = (typeof AUTH_DB_HOOK_OPERATIONS)[number];

export const AUTH_DB_HOOK_PHASES = ["before", "after"] as const;
export type AuthDbHookPhase = (typeof AUTH_DB_HOOK_PHASES)[number];

// All three operations are supported on all three core models in v1.x
export const AUTH_DB_MODEL_OPERATIONS: Record<AuthDbHookModel, AuthDbHookOperation[]> = {
  user: ["create", "update", "delete"],
  session: ["create", "update", "delete"],
  account: ["create", "update", "delete"],
};

// --- Endpoint Hook Slot Definitions ---
export const LIFECYCLE_HOOK_SLOTS: AuthLifecycleHookDefinition[] = [
  {
    event: AUTH_ENDPOINT_HOOK_EVENTS.SIGN_UP,
    phase: "after",
    label: "hooks.after → /sign-up",
    description: "Runs after sign-up. Access ctx.context.newSession for the created session.",
    defaultPrompt: "After sign up, create a default workspace, initialize user settings, and send a welcome email.",
    defaultCode: `hooks: {\n  after: createAuthMiddleware(async (ctx) => {\n    if (ctx.path === "/sign-up/email") {\n      const newSession = ctx.context.newSession;\n      if (newSession) {\n        await createDefaultWorkspace(newSession.user.id);\n        await sendWelcomeEmail(newSession.user.email);\n      }\n    }\n  }),\n}`,
  },
  {
    event: AUTH_ENDPOINT_HOOK_EVENTS.SIGN_IN_EMAIL,
    phase: "after",
    label: "hooks.after → /sign-in/email",
    description: "Runs after email sign-in. Log analytics, check IP anomalies, update last-seen.",
    defaultPrompt: "Log sign-in timestamp, update lastLoginIp, and check for geo-location anomalies.",
    defaultCode: `hooks: {\n  after: createAuthMiddleware(async (ctx) => {\n    if (ctx.path === "/sign-in/email") {\n      // log analytics, check IP anomaly\n    }\n  }),\n}`,
  },
  {
    event: AUTH_ENDPOINT_HOOK_EVENTS.RESET_PASSWORD,
    phase: "after",
    label: "hooks.after → /reset-password",
    description: "Runs after a password reset. Invalidate other sessions, notify user.",
    defaultPrompt: "On password reset, invalidate all other active sessions and notify the user via email.",
    defaultCode: `hooks: {\n  after: createAuthMiddleware(async (ctx) => {\n    if (ctx.path === "/reset-password") {\n      // revoke sessions, send security email\n    }\n  }),\n}`,
  },
  {
    event: AUTH_ENDPOINT_HOOK_EVENTS.VERIFY_EMAIL,
    phase: "after",
    label: "hooks.after → /verify-email",
    description: "Runs after the email verification link is clicked.",
    defaultPrompt: "Upon email verification, mark user status active and grant 14-day trial access.",
    defaultCode: `hooks: {\n  after: createAuthMiddleware(async (ctx) => {\n    if (ctx.path === "/verify-email") {\n      // activate user, start trial\n    }\n  }),\n}`,
  },
];

// --- Database Hook Slot Definitions ---
// Verified against Better Auth v1.x docs: user / session / account support create + update + delete
export interface AuthDbHookDefinition {
  model: AuthDbHookModel;
  operation: AuthDbHookOperation;
  label: string;
  description: string;
  defaultPrompt: string;
  defaultCode: string;
}

export const DB_HOOK_SLOTS: AuthDbHookDefinition[] = [
  // user
  {
    model: "user", operation: "create",
    label: "databaseHooks.user.create",
    description: "Before/after a user row is inserted. Return { data: user } in before to mutate fields.",
    defaultPrompt: "Before user creation, normalize email to lowercase and trim whitespace.",
    defaultCode: `databaseHooks: {\n  user: {\n    create: {\n      before: async (user, ctx) => {\n        return { data: { ...user, email: user.email.toLowerCase().trim() } };\n      },\n    },\n  },\n}`,
  },
  {
    model: "user", operation: "update",
    label: "databaseHooks.user.update",
    description: "Before/after a user row is updated.",
    defaultPrompt: "After a user is updated, invalidate their profile cache.",
    defaultCode: `databaseHooks: {\n  user: {\n    update: {\n      after: async (user, ctx) => {\n        await invalidateUserCache(user.id);\n      },\n    },\n  },\n}`,
  },
  {
    model: "user", operation: "delete",
    label: "databaseHooks.user.delete",
    description: "Before/after a user row is deleted. Return false in before to abort.",
    defaultPrompt: "Before deleting a user, cascade-delete their workspaces and subscriptions.",
    defaultCode: `databaseHooks: {\n  user: {\n    delete: {\n      before: async (user, ctx) => {\n        await deleteUserWorkspaces(user.id);\n      },\n    },\n  },\n}`,
  },
  // session
  {
    model: "session", operation: "create",
    label: "databaseHooks.session.create",
    description: "Before/after a session row is created (sign-in, token refresh).",
    defaultPrompt: "After session creation, log the IP and user-agent for audit purposes.",
    defaultCode: `databaseHooks: {\n  session: {\n    create: {\n      after: async (session, ctx) => {\n        await logSessionCreated(session.userId, session.ipAddress);\n      },\n    },\n  },\n}`,
  },
  {
    model: "session", operation: "update",
    label: "databaseHooks.session.update",
    description: "Before/after a session row is updated (e.g. token rotation).",
    defaultPrompt: "After session update, emit a session-renewed analytics event.",
    defaultCode: `databaseHooks: {\n  session: {\n    update: {\n      after: async (session, ctx) => {\n        await trackSessionRenewed(session.userId);\n      },\n    },\n  },\n}`,
  },
  {
    model: "session", operation: "delete",
    label: "databaseHooks.session.delete",
    description: "Before/after a session row is deleted (sign-out, expiry).",
    defaultPrompt: "After session deletion, notify the user about the sign-out event.",
    defaultCode: `databaseHooks: {\n  session: {\n    delete: {\n      after: async (session, ctx) => {\n        await notifySignOut(session.userId);\n      },\n    },\n  },\n}`,
  },
  // account
  {
    model: "account", operation: "create",
    label: "databaseHooks.account.create",
    description: "Before/after an OAuth account row is created (first OAuth login).",
    defaultPrompt: "After account creation, send a welcome email for new OAuth users.",
    defaultCode: `databaseHooks: {\n  account: {\n    create: {\n      after: async (account, ctx) => {\n        if (account.providerId !== "credential") {\n          await sendWelcomeEmail(account.userId);\n        }\n      },\n    },\n  },\n}`,
  },
  {
    model: "account", operation: "update",
    label: "databaseHooks.account.update",
    description: "Before/after an OAuth account row is updated (token refresh, re-auth).",
    defaultPrompt: "After account update, log the token refresh for security auditing.",
    defaultCode: `databaseHooks: {\n  account: {\n    update: {\n      after: async (account, ctx) => {\n        await logTokenRefresh(account.userId, account.providerId);\n      },\n    },\n  },\n}`,
  },
  {
    model: "account", operation: "delete",
    label: "databaseHooks.account.delete",
    description: "Before/after an OAuth account row is deleted (provider unlink).",
    defaultPrompt: "After account deletion, notify the user that a linked provider was removed.",
    defaultCode: `databaseHooks: {\n  account: {\n    delete: {\n      after: async (account, ctx) => {\n        await notifyProviderUnlinked(account.userId, account.providerId);\n      },\n    },\n  },\n}`,
  },
];

// ─── Access Conditions & Protection Rule Enums ──────────────────────────────
export const CONDITION_PRIMITIVE_TYPES = [
  "auth",
  "org",
  "orgRole",
  "access",
  "subscriptionStatus",
  "plan",
  "customClaim",
] as const;

export type ConditionPrimitiveType = (typeof CONDITION_PRIMITIVE_TYPES)[number];

export const FAILURE_REASONS = [
  "no-auth",
  "no-org",
  "wrong-role",
  "no-access",
  "wrong-plan",
  "custom-denied",
] as const;

export type FailureReasonType = (typeof FAILURE_REASONS)[number];

export const SESSION_DELIVERY_MODES = ["jwt", "cookie"] as const;
export type SessionDeliveryMode = (typeof SESSION_DELIVERY_MODES)[number];

export const DEFAULT_SESSION_CLAIM_SOURCE = "customField" as const;
export const DEFAULT_SESSION_CLAIM_DELIVERY_MODE = "jwt" as const;

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "unpaid",
  "paused",
] as const;

export type SubscriptionStatusType = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAYMENTS_TABLE_NAMES = {
  SUBSCRIPTION: "subscription",
} as const;

export const PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION: PaymentsTableDefinition = {
  key: "subscriptionEntityId",
  name: "subscription",
  category: "payments",
  description: "User subscription records, plan tiers, billing cycles, and Creem customer/subscription links.",
  defaultColumns: [
    { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
    { name: "userId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: "user", column: "id" }, isNotNull: true },
    { name: "creemSubscriptionId", type: DB_COLUMN_TYPES.TEXT, isUnique: true, isNotNull: true },
    { name: "creemCustomerId", type: DB_COLUMN_TYPES.TEXT },
    { name: "plan", type: DB_COLUMN_TYPES.TEXT, isNotNull: true, },
    { name: "status", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
    { name: "currentPeriodStart", type: DB_COLUMN_TYPES.TIMESTAMPTZ },
    { name: "currentPeriodEnd", type: DB_COLUMN_TYPES.TIMESTAMPTZ },
    { name: "cancelAtPeriodEnd", type: DB_COLUMN_TYPES.BOOLEAN },
  ],
  defaultIndexes: [
    { name: "idx_subscription_userId", columns: "userId" },
    { name: "idx_subscription_creemSubscriptionId", columns: "creemSubscriptionId", isUnique: true },
    { name: "idx_subscription_creemCustomerId", columns: "creemCustomerId" },
  ],
};

export const PAYMENTS_INTERVALS = ["monthly", "yearly"] as const;
export type PaymentsIntervalType = (typeof PAYMENTS_INTERVALS)[number];

export const PAYMENT_PROVIDER_OPTIONS = [
  { value: "creem", label: "Creem" },
  // { value: "lemonsqueezy", label: "Lemon Squeezy" },
  // { value: "custom", label: "Custom Billing Engine" },
  // { value: "stripe", label: "Stripe" }
] as const;

// ─── Better Auth Table Keys & Plugins ──────────────────────────────────────────
export const BETTER_AUTH_TABLE_KEYS = {
  USER: "userEntityId",
  SESSION: "sessionEntityId",
  ACCOUNT: "accountEntityId",
  VERIFICATION: "verificationEntityId",
  ORG: "orgEntityId",
  MEMBER: "memberEntityId",
  INVITATION: "invitationEntityId",
  TEAM: "teamEntityId",
  TEAM_MEMBER: "teamMemberEntityId",
  PASSKEY: "passkeyEntityId",
  TWO_FACTOR: "twoFactorEntityId",
  JWKS: "jwksEntityId",
  RATE_LIMIT: "rateLimitEntityId",
} as const;

export type BetterAuthTableKey = (typeof BETTER_AUTH_TABLE_KEYS)[keyof typeof BETTER_AUTH_TABLE_KEYS];

// ─── Better Auth Table Names ───────────────────────────────────────────────────
export const BETTER_AUTH_TABLE_NAMES = {
  USER: "user",
  SESSION: "session",
  ACCOUNT: "account",
  VERIFICATION: "verification",
  ORG: "organization",
  MEMBER: "member",
  INVITATION: "invitation",
  TEAM: "team",
  TEAM_MEMBER: "teamMember",
  PASSKEY: "passkey",
  TWO_FACTOR: "twoFactor",
  JWKS: "jwks",
  RATE_LIMIT: "rateLimit",
} as const;

export type BetterAuthTableName = (typeof BETTER_AUTH_TABLE_NAMES)[keyof typeof BETTER_AUTH_TABLE_NAMES];

// ─── Better Auth Categories ───────────────────────────────────────────────────
export const BETTER_AUTH_CATEGORIES = {
  CORE: "core",
  ORGANIZATION: "organization",
  PLUGIN: "plugin",
} as const;

export type BetterAuthCategory = (typeof BETTER_AUTH_CATEGORIES)[keyof typeof BETTER_AUTH_CATEGORIES];

export const BETTER_AUTH_PLUGINS = {
  TWO_FACTOR: "twoFactor",
  ORGANIZATION: "organization",
  PASSKEY: "passkey",
  MAGIC_LINK: "magicLink",
  EMAIL_OTP: "emailOtp",
  USERNAME: "username",
  PHONE_NUMBER: "phoneNumber",
  ADMIN: "admin",
  API_KEY: "apiKey",
  BEARER: "bearer",
  JWT: "jwt",
  MULTI_SESSION: "multiSession",
  SSO: "sso",
  RATE_LIMIT: "rateLimit",
} as const;

export type BetterAuthPluginId = (typeof BETTER_AUTH_PLUGINS)[keyof typeof BETTER_AUTH_PLUGINS];

const ALL_BETTER_AUTH_TABLE_NAMES = new Set([
  ...Object.values(BETTER_AUTH_TABLE_NAMES).map((n) => n.toLowerCase()),
  "subscription",
]);

export function isBetterAuthTableName(name?: string): boolean {
  if (!name) return false;
  const clean = name.toLowerCase().replace(/[-_\s]/g, "");
  for (const n of ALL_BETTER_AUTH_TABLE_NAMES) {
    if (clean === n.replace(/[-_\s]/g, "")) return true;
  }
  return false;
}

// ─── Better Auth Table Definitions ───────────────────────────────────────────
// IMPORTANT: Do not define createdAt and updatedAt on Better Auth table definitions.
// Defining them on table definitions causes schema validation mismatches (unexpected-required-column).
export const BETTER_AUTH_TABLE_DEFINITIONS: BetterAuthTableDefinition[] = [
  {
    key: BETTER_AUTH_TABLE_KEYS.USER,
    name: BETTER_AUTH_TABLE_NAMES.USER,
    category: BETTER_AUTH_CATEGORIES.CORE,
    description: "Core user accounts, emails, display names, and verification flags.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "name", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "email", type: DB_COLUMN_TYPES.TEXT, isUnique: true, isNotNull: true },
      { name: "emailVerified", type: DB_COLUMN_TYPES.BOOLEAN, isNotNull: true },
      { name: "image", type: DB_COLUMN_TYPES.TEXT },
      { name: "role", type: DB_COLUMN_TYPES.TEXT },
      { name: "banned", type: DB_COLUMN_TYPES.BOOLEAN },
      { name: "banReason", type: DB_COLUMN_TYPES.TEXT },
      { name: "banExpires", type: DB_COLUMN_TYPES.TIMESTAMPTZ },
      { name: "twoFactorEnabled", type: DB_COLUMN_TYPES.BOOLEAN },
      { name: "plan", type: DB_COLUMN_TYPES.TEXT },
      { name: "creemCustomerId", type: DB_COLUMN_TYPES.TEXT },
    ],
    defaultIndexes: [
      { name: "idx_user_email", columns: "email", isUnique: true },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.SESSION,
    name: BETTER_AUTH_TABLE_NAMES.SESSION,
    category: BETTER_AUTH_CATEGORIES.CORE,
    description: "Active session tokens, expiration timestamps, IP & User-Agent metadata.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "userId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.USER, column: "id" }, isNotNull: true },
      { name: "token", type: DB_COLUMN_TYPES.TEXT, isUnique: true, isNotNull: true },
      { name: "expiresAt", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: true },
      { name: "ipAddress", type: DB_COLUMN_TYPES.TEXT },
      { name: "userAgent", type: DB_COLUMN_TYPES.TEXT },
      { name: "impersonatedBy", type: DB_COLUMN_TYPES.TEXT },
      { name: "activeOrganizationId", type: DB_COLUMN_TYPES.UUID },
      { name: "activeTeamId", type: DB_COLUMN_TYPES.UUID },
    ],
    defaultIndexes: [
      { name: "idx_session_userId", columns: "userId" },
      { name: "idx_session_token", columns: "token", isUnique: true },
      { name: "idx_session_activeOrganizationId", columns: "activeOrganizationId" },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.ACCOUNT,
    name: BETTER_AUTH_TABLE_NAMES.ACCOUNT,
    category: BETTER_AUTH_CATEGORIES.CORE,
    description: "OAuth provider credentials, hashed passwords, and token links.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "userId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.USER, column: "id" }, isNotNull: true },
      { name: "accountId", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "providerId", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "password", type: DB_COLUMN_TYPES.TEXT },
      { name: "accessToken", type: DB_COLUMN_TYPES.TEXT },
      { name: "refreshToken", type: DB_COLUMN_TYPES.TEXT },
      { name: "accessTokenExpiresAt", type: DB_COLUMN_TYPES.TIMESTAMPTZ },
      { name: "refreshTokenExpiresAt", type: DB_COLUMN_TYPES.TIMESTAMPTZ },
      { name: "scope", type: DB_COLUMN_TYPES.TEXT },
      { name: "idToken", type: DB_COLUMN_TYPES.TEXT },
    ],
    defaultIndexes: [
      { name: "idx_account_userId", columns: "userId" },
      { name: "idx_account_provider_account", columns: "providerId, accountId" },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.VERIFICATION,
    name: BETTER_AUTH_TABLE_NAMES.VERIFICATION,
    category: BETTER_AUTH_CATEGORIES.CORE,
    description: "Email verification, magic link, and OTP tokens.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "identifier", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "value", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "expiresAt", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: true },
    ],
    defaultIndexes: [
      { name: "idx_verification_identifier", columns: "identifier" },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.ORG,
    name: BETTER_AUTH_TABLE_NAMES.ORG,
    category: BETTER_AUTH_CATEGORIES.ORGANIZATION,
    description: "Multi-tenant workspaces, company accounts, and team scopes.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "name", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "slug", type: DB_COLUMN_TYPES.TEXT, isUnique: true, isNotNull: true },
      { name: "logo", type: DB_COLUMN_TYPES.TEXT },
      { name: "metadata", type: DB_COLUMN_TYPES.TEXT },
    ],
    defaultIndexes: [
      { name: "idx_organization_slug", columns: "slug", isUnique: true },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.MEMBER,
    name: BETTER_AUTH_TABLE_NAMES.MEMBER,
    category: BETTER_AUTH_CATEGORIES.ORGANIZATION,
    description: "User membership mappings to organizations with roles.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "organizationId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.ORG, column: "id" }, isNotNull: true },
      { name: "userId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.USER, column: "id" }, isNotNull: true },
      { name: "role", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
    ],
    defaultIndexes: [
      { name: "idx_member_organizationId", columns: "organizationId" },
      { name: "idx_member_userId", columns: "userId" },
      { name: "idx_member_org_user", columns: "organizationId, userId", isUnique: true },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.INVITATION,
    name: BETTER_AUTH_TABLE_NAMES.INVITATION,
    category: BETTER_AUTH_CATEGORIES.ORGANIZATION,
    description: "Pending email invitations for joining organizations.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "organizationId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.ORG, column: "id" }, isNotNull: true },
      { name: "email", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "role", type: DB_COLUMN_TYPES.TEXT },
      { name: "teamId", type: DB_COLUMN_TYPES.UUID },
      { name: "status", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "expiresAt", type: DB_COLUMN_TYPES.TIMESTAMPTZ, isNotNull: true },
      { name: "inviterId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.USER, column: "id" }, isNotNull: true },
    ],
    defaultIndexes: [
      { name: "idx_invitation_organizationId", columns: "organizationId" },
      { name: "idx_invitation_email", columns: "email" },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.TEAM,
    name: BETTER_AUTH_TABLE_NAMES.TEAM,
    category: BETTER_AUTH_CATEGORIES.ORGANIZATION,
    description: "Sub-groups and department teams within organizations.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "organizationId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.ORG, column: "id" }, isNotNull: true },
      { name: "name", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
    ],
    defaultIndexes: [
      { name: "idx_team_organizationId", columns: "organizationId" },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.TEAM_MEMBER,
    name: BETTER_AUTH_TABLE_NAMES.TEAM_MEMBER,
    category: BETTER_AUTH_CATEGORIES.ORGANIZATION,
    description: "User memberships mapped to organization teams.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "teamId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.TEAM, column: "id" }, isNotNull: true },
      { name: "userId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.USER, column: "id" }, isNotNull: true },
      { name: "role", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
    ],
    defaultIndexes: [
      { name: "idx_teamMember_teamId", columns: "teamId" },
      { name: "idx_teamMember_userId", columns: "userId" },
      { name: "idx_teamMember_team_user", columns: "teamId, userId", isUnique: true },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.PASSKEY,
    name: BETTER_AUTH_TABLE_NAMES.PASSKEY,
    category: BETTER_AUTH_CATEGORIES.PLUGIN,
    description: "WebAuthn / Passkey public credentials and counters.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "name", type: DB_COLUMN_TYPES.TEXT },
      { name: "publicKey", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "userId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.USER, column: "id" }, isNotNull: true },
      { name: "credentialID", type: DB_COLUMN_TYPES.TEXT, isUnique: true, isNotNull: true },
      { name: "counter", type: DB_COLUMN_TYPES.INTEGER, isNotNull: true },
      { name: "deviceType", type: DB_COLUMN_TYPES.TEXT },
      { name: "backedUp", type: DB_COLUMN_TYPES.BOOLEAN },
      { name: "transports", type: DB_COLUMN_TYPES.TEXT },
      { name: "aaguid", type: DB_COLUMN_TYPES.TEXT },
    ],
    defaultIndexes: [
      { name: "idx_passkey_userId", columns: "userId" },
      { name: "idx_passkey_credentialID", columns: "credentialID", isUnique: true },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.TWO_FACTOR,
    name: BETTER_AUTH_TABLE_NAMES.TWO_FACTOR,
    category: BETTER_AUTH_CATEGORIES.PLUGIN,
    description: "TOTP secrets and encrypted recovery backup codes.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "userId", type: DB_COLUMN_TYPES.UUID, isForeignKey: true, references: { table: BETTER_AUTH_TABLE_NAMES.USER, column: "id" }, isNotNull: true },
      { name: "secret", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "backupCodes", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "verified", type: DB_COLUMN_TYPES.BOOLEAN },
      { name: "failedVerificationCount", type: DB_COLUMN_TYPES.INTEGER },
      { name: "lockedUntil", type: DB_COLUMN_TYPES.TIMESTAMPTZ },
    ],
    defaultIndexes: [
      { name: "idx_twoFactor_userId", columns: "userId" },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.JWKS,
    name: BETTER_AUTH_TABLE_NAMES.JWKS,
    category: BETTER_AUTH_CATEGORIES.PLUGIN,
    description: "RSA / EC keypairs for JWT signing and OIDC discovery.",
    defaultColumns: [
      { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true, isNotNull: true },
      { name: "publicKey", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "privateKey", type: DB_COLUMN_TYPES.TEXT, isNotNull: true },
      { name: "expiresAt", type: DB_COLUMN_TYPES.TIMESTAMPTZ },
      { name: "alg", type: DB_COLUMN_TYPES.TEXT },
      { name: "crv", type: DB_COLUMN_TYPES.TEXT },
    ],
    defaultIndexes: [
      { name: "idx_jwks_expiresAt", columns: "expiresAt" },
    ],
  },
  {
    key: BETTER_AUTH_TABLE_KEYS.RATE_LIMIT,
    name: BETTER_AUTH_TABLE_NAMES.RATE_LIMIT,
    category: BETTER_AUTH_CATEGORIES.PLUGIN,
    description: "Brute-force protection counter table.",
    defaultColumns: [
      { name: "key", type: DB_COLUMN_TYPES.TEXT, isPrimaryKey: true, isNotNull: true },
      { name: "count", type: DB_COLUMN_TYPES.INTEGER, isNotNull: true },
      { name: "lastRequest", type: DB_COLUMN_TYPES.INTEGER, isNotNull: true },
    ],
    defaultIndexes: [
      { name: "idx_rateLimit_lastRequest", columns: "lastRequest" },
    ],
  },
];

export interface BetterAuthTableRequirementOptions {
  isOrgEnabled?: boolean;
  teamsEnabled?: boolean;
  enabledPlugins?: string[];
  tableMappings?: Record<string, string | undefined>;
  providers?: AuthNodeData["providers"];
}

export function isBetterAuthTableRequired(
  def: BetterAuthTableDefinition,
  options: BetterAuthTableRequirementOptions = {},
): boolean {
  const { isOrgEnabled = true, teamsEnabled, enabledPlugins = [], tableMappings, providers } = options;

  if (tableMappings && (tableMappings[def.key] || tableMappings[def.name])) {
    return true;
  }

  if (def.category === BETTER_AUTH_CATEGORIES.CORE) return true;
  if (def.category === BETTER_AUTH_CATEGORIES.ORGANIZATION) {
    if (!isOrgEnabled) return false;
    if (
      def.key === BETTER_AUTH_TABLE_KEYS.TEAM ||
      def.key === BETTER_AUTH_TABLE_KEYS.TEAM_MEMBER
    ) {
      return Boolean(teamsEnabled);
    }
    return true;
  }

  if (def.key === BETTER_AUTH_TABLE_KEYS.PASSKEY) {
    return (
      enabledPlugins.includes(BETTER_AUTH_PLUGINS.PASSKEY) ||
      Boolean(providers?.passkey) ||
      Boolean(tableMappings?.passkeyEntityId)
    );
  }
  if (def.key === BETTER_AUTH_TABLE_KEYS.TWO_FACTOR) {
    return (
      enabledPlugins.includes(BETTER_AUTH_PLUGINS.TWO_FACTOR) ||
      Boolean(tableMappings?.twoFactorEntityId)
    );
  }
  if (def.key === BETTER_AUTH_TABLE_KEYS.JWKS) {
    return (
      enabledPlugins.includes(BETTER_AUTH_PLUGINS.JWT) ||
      enabledPlugins.includes(BETTER_AUTH_PLUGINS.BEARER) ||
      Boolean(tableMappings?.jwksEntityId)
    );
  }
  if (def.key === BETTER_AUTH_TABLE_KEYS.RATE_LIMIT) {
    return (
      enabledPlugins.includes(BETTER_AUTH_PLUGINS.RATE_LIMIT) ||
      Boolean(providers?.emailPassword?.rateLimit) ||
      Boolean(tableMappings?.rateLimitEntityId)
    );
  }

  return false;
}

/**
 * Resolves Better Auth table column types based on the target database engine.
 * For SQLite, UUID primary keys and foreign keys fall back to TEXT.
 * For PostgreSQL (and default), UUID is used.
 */
export function resolveBetterAuthTableColumns(
  columns: CanvasEntityColumn[],
  engine?: string,
): CanvasEntityColumn[] {
  const isSqlite = (engine || "").toLowerCase() === "sqlite";
  return columns.map((col) => {
    if (
      isSqlite &&
      (col.type === DB_COLUMN_TYPES.UUID ||
        col.type === DB_COLUMN_TYPES.TIMESTAMPTZ ||
        col.type === DB_COLUMN_TYPES.TIMESTAMP)
    ) {
      const { defaultValue, ...rest } = col;
      return { ...rest, type: DB_COLUMN_TYPES.TEXT };
    }
    if (!isSqlite && col.type === DB_COLUMN_TYPES.UUID && (col.isPrimaryKey || col.name.toLowerCase() === "id")) {
      return { ...col, defaultValue: col.defaultValue || "gen_random_uuid()" };
    }
    return { ...col };
  });
}

/**
 * Convenience helper to get engine-adapted default columns for a Better Auth table definition.
 */
export function getTableColumnsForEngine(
  def: BetterAuthTableDefinition,
  engine?: string,
): CanvasEntityColumn[] {
  return resolveBetterAuthTableColumns(def.defaultColumns, engine);
}
