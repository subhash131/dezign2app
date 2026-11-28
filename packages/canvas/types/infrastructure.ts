import type { WorkerTask, SearchSource } from "../schemas";
import type { DatabaseEngine } from "../techStack";
import type { ServiceAuthStrategy } from "../constants";
import type {
  GatewayRoute,
  AuthRule,
  AuthFramework,
  BetterAuthVersion,
  OAuthProviderConfig,
  AuthFunctionRef,
  BetterAuthTableMapping,
  AdditionalAuthTableConfig,
  EmailPasswordConfig,
  AccountLinkingPolicy,
  SessionConfig,
  RedirectsConfig,
  OrgInvitationsConfig,
  AuthHookConfig,
  BetterAuthDbAdapter,
  BetterAuthSecondaryStorageConfig,
  BetterAuthJwtConfig,
  AuthRevocationCheckConfig,
  RbacConfig,
} from "./auth";

/** Background worker node fields (canvas type). */
export interface CanvasWorkerNodeData {
  tasks?: WorkerTask[];
  queueSources?: string[];
  concurrency?: number;
  retryPolicy?: string;
  maxRetries?: number;
}

/** Serverless function node fields (canvas type). */
export interface CanvasServerlessNodeData {
  triggerType?: "HTTP" | "Event" | "CRON" | "Queue";
  runtime?: string;
  memoryMb?: number;
  timeoutSec?: number;
}

/** Infrastructure node fields — API Gateway, Load Balancer, Search Index (canvas type). */
export interface CanvasInfrastructureNodeData {
  // API Gateway
  routes?: GatewayRoute[];
  authRules?: AuthRule[];
  authType?: string;
  // Load Balancer
  targetGroups?: { id: string; name: string }[];
  algorithm?: string;
  healthCheckPath?: string;
  // Search Index
  searchSources?: SearchSource[];
  analyzer?: string;
  shards?: number;
  replicas?: number;
  refreshInterval?: string;
  reindexStrategy?: string;
}

/** Identity Provider node fields (canvas type). */
export interface CanvasIdentityProviderNodeData {
  provider?: string;
  issuerUrl?: string;
  discoveryUrl?: string;
  jwksUrl?: string;
  audiences?: string[];
  supportedAlgorithms?: string[];
  customCapabilities?: {
    authentication?: boolean;
    userManagement?: boolean;
    identity?: boolean;
    authorization?: boolean;
  };
  customOutputs?: {
    user?: boolean;
    tokens?: boolean;
    claims?: boolean;
  };
}

/** Auth Framework node fields (canvas type). */
export interface CanvasAuthNodeData {
  framework?: AuthFramework;
  provider?: string;
  authMode?: "embedded" | "standalone" | "gateway";
  plugins?: string[];
  secretKey?: string;
  baseUrl?: string;
  version?: BetterAuthVersion | string;
  dbAdapter?: BetterAuthDbAdapter;
  dbEngine?: DatabaseEngine | string;
  generateId?: "uuid" | "nanoid" | "serial" | string;
  validateSchema?: boolean;
  databaseId?: string;
  connectionString?: string;
  connectionStringPooled?: string;
  authFunctions?: AuthFunctionRef[];
  tableMappings?: BetterAuthTableMapping;
  userEntityId?: string;
  userSchemaId?: string;
  additionalUserTables?: AdditionalAuthTableConfig[];
  additionalTables?: AdditionalAuthTableConfig[];
  providers?: {
    emailPassword?: EmailPasswordConfig;
    socialEnabled?: boolean;
    oauthEnabled?: boolean;
    oauth?: OAuthProviderConfig[];
    magicLink?: boolean;
    passkey?: boolean;
    accountLinking?: AccountLinkingPolicy;
  };
  session?: SessionConfig;
  redirects?: RedirectsConfig;
  trustedOrigins?: string[];
  /** Better Auth Redis secondaryStorage config (active only when framework === "better_auth"). */
  secondaryStorage?: BetterAuthSecondaryStorageConfig;
  /** Better Auth jwt() plugin key-pair & token lifetime config. */
  jwtConfig?: BetterAuthJwtConfig;
  /** Provider-agnostic ServiceNode verification strategy ("auto" | "jwks" | "db" | "http"). */
  serviceAuthStrategy?: ServiceAuthStrategy;
  /** Optional Redis revocation/blocklist check paired with stateless JWKS verification. */
  revocationCheck?: AuthRevocationCheckConfig;
  /** Provider-agnostic global RBAC roles catalog + Better Auth admin() role defaults. */
  rbac?: RbacConfig;
  organization?: {
    enabled?: boolean;
    roles?: string[];
    teams?: boolean;
    multiOrg?: boolean;
    invitations?: boolean;
    invitationsConfig?: OrgInvitationsConfig;
    schemaId?: string;
    entityId?: string;
    additionalTables?: AdditionalAuthTableConfig[];
  };
  subscription?: {
    enabled?: boolean;
    schemaId?: string;
    entityId?: string;
  };
  hooks?: AuthHookConfig[];
  paymentsPlugin?: { provider: "creem"; apiKeyEnv?: string; webhookSecretEnv?: string };
}
