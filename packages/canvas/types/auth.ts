import { AUTH_FRAMEWORK_OPTIONS, BETTER_AUTH_VERSIONS } from "../constants";
import type { CanvasEntityColumn } from "./database";

export type AuthFramework = (typeof AUTH_FRAMEWORK_OPTIONS)[number]["value"];
export type BetterAuthVersion = (typeof BETTER_AUTH_VERSIONS)[number]["value"];

export type IdPCapabilities = {
  authentication: boolean;
  userManagement: boolean;
  identity: boolean;
  authorization: boolean;
};

export type IdPOutputs = {
  user: boolean;
  tokens: boolean;
  claims: boolean;
};

export type IdentityProviderPreset = {
  provider: string;
  issuerUrl: string;
  discoveryUrl?: string;
  jwksUrl: string;
  supportedAlgorithms: string[];
  capabilities: IdPCapabilities;
  outputs: IdPOutputs;
};

export const IDENTITY_PROVIDER_PRESETS: Record<string, IdentityProviderPreset> =
  {
    auth0: {
      provider: "Auth0",
      issuerUrl: "https://<tenant>.auth0.com/",
      discoveryUrl:
        "https://<tenant>.auth0.com/.well-known/openid-configuration",
      jwksUrl: "https://<tenant>.auth0.com/.well-known/jwks.json",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: true,
        userManagement: true,
        identity: false,
        authorization: true,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    clerk: {
      provider: "Clerk",
      issuerUrl: "https://clerk.<your-domain>.com",
      discoveryUrl:
        "https://clerk.<your-domain>.com/.well-known/openid-configuration",
      jwksUrl: "https://clerk.<your-domain>.com/.well-known/jwks.json",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: true,
        userManagement: true,
        identity: false,
        authorization: true,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    keycloak: {
      provider: "Keycloak",
      issuerUrl: "https://<domain>/realms/<realm>",
      discoveryUrl:
        "https://<domain>/realms/<realm>/.well-known/openid-configuration",
      jwksUrl: "https://<domain>/realms/<realm>/protocol/openid-connect/certs",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: true,
        userManagement: true,
        identity: true,
        authorization: true,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    okta: {
      provider: "Okta",
      issuerUrl: "https://<domain>.okta.com/oauth2/default",
      discoveryUrl:
        "https://<domain>.okta.com/oauth2/default/.well-known/openid-configuration",
      jwksUrl: "https://<domain>.okta.com/oauth2/default/v1/keys",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: true,
        userManagement: true,
        identity: true,
        authorization: true,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    cognito: {
      provider: "AWS Cognito",
      issuerUrl: "https://cognito-idp.<region>.amazonaws.com/<pool-id>",
      discoveryUrl:
        "https://cognito-idp.<region>.amazonaws.com/<pool-id>/.well-known/openid-configuration",
      jwksUrl:
        "https://cognito-idp.<region>.amazonaws.com/<pool-id>/.well-known/jwks.json",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: true,
        userManagement: true,
        identity: true,
        authorization: true,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    firebase: {
      provider: "Firebase",
      issuerUrl: "https://securetoken.google.com/<project-id>",
      discoveryUrl:
        "https://securetoken.google.com/<project-id>/.well-known/openid-configuration",
      jwksUrl:
        "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: true,
        userManagement: true,
        identity: true,
        authorization: false,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    supabase: {
      provider: "Supabase",
      issuerUrl: "https://<project-ref>.supabase.co/auth/v1",
      discoveryUrl:
        "https://<project-ref>.supabase.co/auth/v1/.well-known/openid-configuration",
      jwksUrl:
        "https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: true,
        userManagement: true,
        identity: true,
        authorization: true,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    entraid: {
      provider: "Azure Entra ID",
      issuerUrl: "https://login.microsoftonline.com/<tenant-id>/v2.0",
      discoveryUrl:
        "https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration",
      jwksUrl:
        "https://login.microsoftonline.com/<tenant-id>/discovery/v2.0/keys",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: true,
        userManagement: true,
        identity: true,
        authorization: true,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    better_auth: {
      provider: "Better Auth",
      issuerUrl: "http://localhost:3000/api/auth",
      discoveryUrl:
        "http://localhost:3000/api/auth/.well-known/openid-configuration",
      jwksUrl: "http://localhost:3000/api/auth/jwks",
      supportedAlgorithms: ["EdDSA", "RS256", "ES256"],
      capabilities: {
        authentication: true,
        userManagement: true,
        identity: true,
        authorization: true,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    oidc: {
      provider: "OpenID Connect",
      issuerUrl: "https://<domain>",
      discoveryUrl: "https://<domain>/.well-known/openid-configuration",
      jwksUrl: "https://<domain>/.well-known/jwks.json",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: true,
        userManagement: false,
        identity: false,
        authorization: false,
      },
      outputs: { user: true, tokens: true, claims: true },
    },
    custom: {
      provider: "Custom JWT",
      issuerUrl: "",
      discoveryUrl: "",
      jwksUrl: "",
      supportedAlgorithms: ["RS256"],
      capabilities: {
        authentication: false,
        userManagement: false,
        identity: false,
        authorization: false,
      },
      outputs: { user: false, tokens: false, claims: false },
    },
  };

export type GatewayRoute = {
  id: string;
  name: string;
  method?: string;
  service?: string;
  authRuleId?: string;
};

export type AuthRule =
  | {
      type: "jwt";
      id: string;
      name: string;
      description?: string;
      config: { providerId?: string; algorithms?: string[] };
    }
  | {
      type: "oauth2";
      id: string;
      name: string;
      description?: string;
      config: { providerId?: string; algorithms?: string[] };
    }
  | {
      type: "apiKey";
      id: string;
      name: string;
      description?: string;
      config: { headerName?: string };
    }
  | {
      type: "mtls";
      id: string;
      name: string;
      description?: string;
      config: { clientCa?: string };
    }
  | {
      type: "basic";
      id: string;
      name: string;
      description?: string;
      config?: Record<string, never>;
    }
  | {
      type: "none";
      id: string;
      name: string;
      description?: string;
      config?: Record<string, never>;
    };

// ---- Access Conditions & Rules ----
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired";

export type ConditionPrimitive =
  | { type: "auth"; op: "signedIn" | "signedOut" }
  | { type: "org"; op: "required" | "notRequired" }
  | { type: "orgRole"; op: "in" | "notIn"; values: string[] }
  | { type: "access"; op: "granted" | "notGranted" }
  | {
      type: "subscriptionStatus";
      op: "statusIn" | "statusNotIn";
      values: SubscriptionStatus[];
    }
  | { type: "plan"; op: "in" | "notIn"; values: string[] }
  | {
      type: "customClaim";
      key: string;
      op: "eq" | "neq" | "in" | "notIn" | "truthy" | "falsy";
      value?: string | number | boolean;
      values?: string[];
    }
  /** Represents a server-side DB guard — used for display purposes in ZoneConfig only.
   *  The actual guard config lives in WebAppZone.serverGuard. */
  | {
      type: "serverGuard";
      entityNodeId: string;
      entityLabel?: string;
      dbFunctionId?: string;
      entityField?: string;
    };

export type ConditionNode =
  | { kind: "group"; op: "AND" | "OR" | "NOT"; children: ConditionNode[] }
  | { kind: "leaf"; condition: ConditionPrimitive };

export type FailureReason =
  | "no-auth"
  | "no-org"
  | "wrong-role"
  | "no-access"
  | "wrong-plan"
  | "custom-denied";

export type RedirectMap = Partial<Record<FailureReason, string>> & {
  default: string;
};

export interface ProtectionRule {
  id: string;
  scope: "zone" | "page";
  accessType?: "public" | "protected" | "private" | "role-gated" | "payment-gated" | "org-gated";
  conditions: ConditionNode;
  redirects: RedirectMap;
  customLogic?: { mode: "naturalLanguage" | "code"; prompt?: string; code?: string };
}

// ---- Server Guard (DB-level auth, runs in layout.tsx instead of middleware) ----
/**
 * What input is passed to the guard DB function.
 * - "userId"       → session.user.id from the active session
 * - "sessionToken" → raw session token string
 * - "header"       → a custom HTTP header value (e.g. x-api-key)
 */
export type ServerGuardParam = "userId" | "sessionToken" | "header";

/** Which thing on the entity to check. */
export type ServerGuardCheckMode = "dbFunction" | "columnValue";

export interface ServerGuardConfig {
  /** The entity node whose data is queried. */
  entityNodeId: string;
  /** Human label of that entity (denormalised for display). */
  entityLabel?: string;
  /** Whether we call a DB operation function or check a column value. */
  checkMode: ServerGuardCheckMode;
  /** ID of the DbOperationFunction to call (when checkMode="dbFunction"). */
  dbFunctionId?: string;
  /** Name of the DbOperationFunction (denormalised for display/codegen). */
  dbFunctionName?: string;
  /** Column name to check (when checkMode="columnValue"). */
  entityField?: string;
  /** Expected column value that means "allowed" (when checkMode="columnValue"). */
  entityFieldExpectedValue?: string;
  /** What we pass into the DB function / column lookup. */
  param: ServerGuardParam;
  /** Header name when param="header" (e.g. "x-api-key"). */
  headerName?: string;
  /** Require an active session before running the guard. Default true. */
  requireSession?: boolean;
  /** Where to redirect on guard failure. */
  failRedirect: string;
}

// ---- Protected Zone / Section (User-Managed Child Entity of WebAppNode) ----
export interface WebAppZone {
  id: string;
  parentId?: string;
  name: string;
  handleId: string;
  accessType: "public" | "protected";
  /**
   * Controls which protection strategy is generated for this zone.
   * - "middleware" (default) → JWT-based check in middleware.ts (Edge-compatible)
   * - "server-guard"         → DB-based check in layout.tsx (full Node.js runtime)
   */
  protectionMode?: "middleware" | "server-guard";
  /** Only used when protectionMode = "server-guard". */
  serverGuard?: ServerGuardConfig;
  rule?: ProtectionRule;
  hasLayout?: boolean;
  layoutDescription?: string;
  layoutSourceCode?: string;
  layoutImageUrl?: string;
  layoutImages?: string[];
}

// ---- Session Claims ----
export interface SessionClaims {
  userId: string;
  orgId?: string;
  orgRole?: string;
  hasAccess?: boolean;
  accessExpiresAt?: string;
  subscriptionStatus?:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "expired"
    | "none";
  planId?: string;
  inGracePeriod?: boolean;
  custom?: Record<string, string | number | boolean>;
}

import type {
  OAuthProviderConfig,
  SessionClaimConfig,
  AuthFunctionRef,
  AuthHookConfig,
  EndpointHookConfig,
  DbHookConfig,
  AdditionalAuthTableConfig,
  AccountLinkingPolicy,
  EmailPasswordConfig,
  SessionConfig,
  OrgInvitationsConfig,
  RedirectsConfig,
  BetterAuthTableMapping,
} from "../schemas/nodes/auth";

export type {
  OAuthProviderConfig,
  SessionClaimConfig,
  AuthFunctionRef,
  AuthHookConfig,
  EndpointHookConfig,
  DbHookConfig,
  AdditionalAuthTableConfig,
  AccountLinkingPolicy,
  EmailPasswordConfig,
  SessionConfig,
  OrgInvitationsConfig,
  RedirectsConfig,
  BetterAuthTableMapping,
};

import type {
  BetterAuthTableKey,
  BetterAuthTableName,
  BetterAuthCategory,
  AuthHookEvent,
} from "../constants";

export interface AuthLifecycleHookDefinition {
  event: AuthHookEvent;
  phase: "before" | "after";
  label: string;
  description: string;
  defaultPrompt: string;
  defaultCode: string;
}


export interface BetterAuthTableDefinition {
  key: BetterAuthTableKey;
  name: BetterAuthTableName;
  category: BetterAuthCategory;
  description: string;
  defaultColumns: CanvasEntityColumn[];
  defaultIndexes?: Array<{
    name: string;
    columns: string;
    isUnique?: boolean;
  }>;
}

export interface PaymentsTableDefinition {
  key: string;
  name: string;
  category: "payments";
  description: string;
  defaultColumns: CanvasEntityColumn[];
  defaultIndexes?: Array<{
    name: string;
    columns: string;
    isUnique?: boolean;
  }>;
}

export interface PaymentsPlanConfig {
  id: string;
  name: string;
  price: string;
  interval: "monthly" | "yearly";
}

export interface AuthOrganizationConfig {
  enabled?: boolean;
  roles?: string[];
  teams?: boolean;
  multiOrg?: boolean;
  invitations?: boolean;
  schemaId?: string;
  entityId?: string;
  additionalTables?: AdditionalAuthTableConfig[];
}

import type { CanvasAuthNodeData } from "./infrastructure";

export type BetterAuthDbAdapter =
  | "sqlite-raw"
  | "sqlite"
  | "postgres"
  | "mysql"
  | "drizzle"
  | "prisma"
  | "custom"
  | (string & {});

export interface AdapterConfig {
  importStatement: string;
  adapterCall: string;
}

export type BetterAuthV16NodeData = CanvasAuthNodeData & {
  label?: string;
  port?: string | number;
  baseUrl?: string;
  connectionString?: string;
  connectionStringPooled?: string;
  dbAdapter?: BetterAuthDbAdapter;
  validateSchema?: boolean;
};



