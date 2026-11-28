import { z } from "zod";
import { baseNodeDataSchema } from "./base";

export const oauthProviderConfigSchema = z.object({
  id: z.string(),
  provider: z.string(),
  clientIdEnv: z.string(),
  clientSecretEnv: z.string(),
});
export type OAuthProviderConfig = z.infer<typeof oauthProviderConfigSchema>;

export const sessionClaimConfigSchema = z.object({
  key: z.string(),
  source: z.string(),
  entityId: z.string().optional(),
  targetValue: z.string().optional(),
  deliveryMode: z.enum(["jwt", "cookie", "session", "oauthToken"]).optional(),
  destination: z.enum(["jwt", "session", "oauthToken"]).optional(),
});
export type SessionClaimConfig = z.infer<typeof sessionClaimConfigSchema>;

export const authFunctionRefSchema = z.object({
  id: z.string(),
  variableName: z.string().optional(),
  entityNodeId: z.string(),
  functionId: z.string(),
});
export type AuthFunctionRef = z.infer<typeof authFunctionRefSchema>;

// Endpoint hooks → betterAuth({ hooks: { before/after: createAuthMiddleware(...) } })
// DB hooks      → betterAuth({ databaseHooks: { user/session/account: { create/update/delete: { before/after } } } })
// Object schema structured for clean zodToConvex database validator generation
export const authHookConfigSchema = z.object({
  hookType: z.enum(["endpoint", "db"]).optional(),
  event: z.string().optional(),
  model: z.string().optional(),
  operation: z.enum(["create", "update", "delete"]).optional(),
  phase: z.enum(["before", "after"]).optional(),
  enabled: z.boolean().optional(),
  mode: z.enum(["naturalLanguage", "code"]).optional(),
  prompt: z.string().optional(),
  code: z.string().optional(),
});

export type AuthHookConfig = z.infer<typeof authHookConfigSchema>;

export type EndpointHookConfig = AuthHookConfig & {
  hookType: "endpoint";
  event: string;
  phase: "before" | "after";
};

export type DbHookConfig = AuthHookConfig & {
  hookType: "db";
  model: string;
  operation: "create" | "update" | "delete";
  phase: "before" | "after";
};




export const additionalAuthTableConfigSchema = z.object({
  id: z.string(),
  entityId: z.string(),
  purpose: z.string().optional(),
});
export type AdditionalAuthTableConfig = z.infer<
  typeof additionalAuthTableConfigSchema
>;

export const accountLinkingPolicySchema = z.object({
  policy: z.enum(["prompt", "merge", "block"]).optional(),
  trustedProviders: z.array(z.string()).optional(),
  allowDifferentEmails: z.boolean().optional(),
  enabled: z.boolean().optional(),
});
export type AccountLinkingPolicy = z.infer<typeof accountLinkingPolicySchema>;

export const emailPasswordConfigSchema = z.object({
  enabled: z.boolean(),
  requireVerification: z.boolean().optional().default(false),
  minLength: z.number(),
  requireUppercase: z.boolean().optional(),
  requireNumbers: z.boolean().optional(),
  requireSpecialChars: z.boolean().optional(),
  rateLimit: z
    .object({
      maxAttempts: z.number().optional(),
      windowSeconds: z.number().optional(),
      lockoutDurationSeconds: z.number().optional(),
    })
    .optional(),
});
export type EmailPasswordConfig = z.infer<typeof emailPasswordConfigSchema>;

export const sessionConfigSchema = z.object({
  claims: z.array(sessionClaimConfigSchema).optional(),
  expiresInSeconds: z.number().optional(),
  updateAgeSeconds: z.number().optional(),
  cookieCache: z
    .object({
      enabled: z.boolean().optional(),
      maxAgeSeconds: z.number().optional(),
      /** Better Auth cookieCache encoding format: compact (HMAC), jwt, or jwe (encrypted). */
      strategy: z.enum(["compact", "jwt", "jwe"]).optional(),
      /** Enables fully stateless cookie cache refresh without hitting DB/Redis on every request. */
      refreshCache: z.boolean().optional(),
    })
    .optional(),
  /** Persist session rows in primary SQL DB even when Redis secondaryStorage is enabled. */
  storeSessionInDatabase: z.boolean().optional(),
  refreshTokenRotation: z.boolean().optional(),
  rememberMeDurationDays: z.number().optional(),
});
export type SessionConfig = z.infer<typeof sessionConfigSchema>;

/** Better Auth Redis secondaryStorage configuration (only active when framework === "better_auth"). */
export const betterAuthSecondaryStorageSchema = z.object({
  enabled: z.boolean().optional(),
  /** Optional canvas Redis node ID; defaults to the first Redis node if omitted. */
  redisNodeId: z.string().optional(),
  keyPrefix: z.string().optional(),
  /** Route Better Auth's built-in IP/endpoint rate limiter to Redis secondaryStorage. */
  useForRateLimit: z.boolean().optional(),
});
export type BetterAuthSecondaryStorageConfig = z.infer<typeof betterAuthSecondaryStorageSchema>;

/** Better Auth jwt() plugin signing and claim options for stateless multi-server JWKS verification. */
export const betterAuthJwtConfigSchema = z.object({
  algorithm: z.enum(["EdDSA", "RS256", "ES256"]).optional(),
  expirationTime: z.string().optional(),
  issuer: z.string().optional(),
  audience: z.string().optional(),
});
export type BetterAuthJwtConfig = z.infer<typeof betterAuthJwtConfigSchema>;

/** Optional Redis-backed revocation check so short-lived JWTs can still be invalidated immediately on logout/ban. */
export const authRevocationCheckSchema = z.object({
  enabled: z.boolean().optional(),
  redisNodeId: z.string().optional(),
});
export type AuthRevocationCheckConfig = z.infer<typeof authRevocationCheckSchema>;

/**
 * Global application / user roles configuration for AuthNode.
 * - `roles`: provider-agnostic role catalog used by downstream endpoint/page/pipeline dropdowns.
 * - `defaultRole` & `adminRoles`: mapped to Better Auth `admin()` plugin options when `framework === "better_auth"`.
 */
export const rbacConfigSchema = z.object({
  roles: z.array(z.string()).optional(),
  defaultRole: z.string().optional(),
  adminRoles: z.array(z.string()).optional(),
});
export type RbacConfig = z.infer<typeof rbacConfigSchema>;

export const orgInvitationsConfigSchema = z.object({
  deliveryMethod: z.enum(["email", "link", "both"]).optional(),
  inviteExpiresInDays: z.number().optional(),
  defaultRole: z.string().optional(),
  allowMemberInvites: z.boolean().optional(),
});
export type OrgInvitationsConfig = z.infer<typeof orgInvitationsConfigSchema>;

export const redirectsConfigSchema = z.object({
  signInPageUrl: z.string().optional(),
  signInPageNodeId: z.string().optional(),
  signUpPageUrl: z.string().optional(),
  signUpPageNodeId: z.string().optional(),
  signInRedirectUrl: z.string().optional(),
  signInRedirectNodeId: z.string().optional(),
  signUpRedirectUrl: z.string().optional(),
  signUpRedirectNodeId: z.string().optional(),
  signOutRedirectUrl: z.string().optional(),
  signOutRedirectNodeId: z.string().optional(),
  unauthorizedUrl: z.string().optional(),
  unauthorizedNodeId: z.string().optional(),
  pricingUrl: z.string().optional(),
  pricingNodeId: z.string().optional(),
  callbackUrl: z.string().optional(),
  callbackNodeId: z.string().optional(),
});
export type RedirectsConfig = z.infer<typeof redirectsConfigSchema>;

export const betterAuthTableMappingSchema = z.object({
  userEntityId: z.string().optional(),
  sessionEntityId: z.string().optional(),
  accountEntityId: z.string().optional(),
  verificationEntityId: z.string().optional(),
  orgEntityId: z.string().optional(),
  memberEntityId: z.string().optional(),
  invitationEntityId: z.string().optional(),
  teamEntityId: z.string().optional(),
  teamMemberEntityId: z.string().optional(),
  passkeyEntityId: z.string().optional(),
  twoFactorEntityId: z.string().optional(),
  jwksEntityId: z.string().optional(),
  rateLimitEntityId: z.string().optional(),
});
export type BetterAuthTableMapping = z.infer<
  typeof betterAuthTableMappingSchema
>;

// --- Auth Framework Node Schema ---
export const authDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),
    framework: z.string().optional(),
    authMode: z.string().optional(),
    plugins: z.array(z.string()).optional(),
    secretKey: z.string().optional(),
    baseUrl: z.string().optional(),
    provider: z.string().optional(),
    version: z.string().optional(),
    dbAdapter: z.string().optional(),
    dbEngine: z.string().optional(),
    generateId: z.string().optional(),
    databaseId: z.string().optional(),
    authFunctions: z.array(authFunctionRefSchema).optional(),
    tableMappings: betterAuthTableMappingSchema.optional(),
    userEntityId: z.string().optional(),
    userSchemaId: z.string().optional(),
    additionalUserTables: z.array(additionalAuthTableConfigSchema).optional(),
    additionalTables: z.array(additionalAuthTableConfigSchema).optional(),
    providers: z
      .object({
        emailPassword: emailPasswordConfigSchema.optional(),
        socialEnabled: z.boolean().optional(),
        oauthEnabled: z.boolean().optional(),
        oauth: z.array(oauthProviderConfigSchema).optional(),
        magicLink: z.boolean().optional(),
        passkey: z.boolean().optional(),
        accountLinking: accountLinkingPolicySchema.optional(),
      })
      .optional(),
    session: sessionConfigSchema.optional(),
    redirects: redirectsConfigSchema.optional(),
    trustedOrigins: z.array(z.string()).optional(),
    organization: z
      .object({
        enabled: z.boolean().optional(),
        roles: z.array(z.string()).optional(),
        teams: z.boolean().optional(),
        multiOrg: z.boolean().optional(),
        invitations: z.boolean().optional(),
        invitationsConfig: orgInvitationsConfigSchema.optional(),
        schemaId: z.string().optional(),
        entityId: z.string().optional(),
        additionalTables: z.array(additionalAuthTableConfigSchema).optional(),
      })
      .optional(),
    subscription: z
      .object({
        enabled: z.boolean().optional(),
        schemaId: z.string().optional(),
        entityId: z.string().optional(),
      })
      .optional(),
    hooks: z.array(authHookConfigSchema).optional(),
    /** Provider-agnostic global RBAC roles catalog + Better Auth admin() role defaults. */
    rbac: rbacConfigSchema.optional(),
    /** Better Auth Redis secondaryStorage config (gated to framework === "better_auth"). */
    secondaryStorage: betterAuthSecondaryStorageSchema.optional(),
    /** Better Auth jwt() plugin key-pair & token lifetime config (gated to framework === "better_auth"). */
    jwtConfig: betterAuthJwtConfigSchema.optional(),
    /** Provider-agnostic ServiceNode verification strategy ("auto" resolves to "jwks" in multi-server). */
    serviceAuthStrategy: z.enum(["auto", "jwks", "db", "http"]).optional(),
    /** Optional Redis revocation/token-version check paired with stateless JWKS verification. */
    revocationCheck: authRevocationCheckSchema.optional(),
    paymentsPlugin: z
      .object({
        provider: z.literal("creem"),
        apiKeyEnv: z.string(),
        webhookSecretEnv: z.string(),
      })
      .optional(),
  })
  .passthrough();

export type AuthNodeData = z.infer<typeof authDataSchema>;
