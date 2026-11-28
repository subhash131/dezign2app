export type AuthStrategy = "db" | "jwks" | "http";

export interface RequireAuthMiddlewareOptions {
  /** Auth server / IdP base URL used for JWKS and HTTP session lookups. */
  authServerUrl?: string;
  /** Optional JWT issuer claim enforced during JWKS verification. */
  issuer?: string;
  /** Optional JWT audience claim enforced during JWKS verification. */
  audience?: string;
  /** Workspace Redis package name (e.g. "@workspace/redis") for instant JWT revocation checks. */
  redisRevocationPackageName?: string;
}

/**
 * Shared builder producing the core `AuthVerificationError` + `verifyAuthToken` implementation
 * so both standalone `src/middleware/requireAuth.ts` and `src/middleware/verifyToken.ts`
 * share identical JWKS / DB / HTTP + Redis revocation logic with zero duplication.
 */
function buildVerifyTokenCore(
  strategy: AuthStrategy,
  options: RequireAuthMiddlewareOptions,
): {
  extraImports: string;
  moduleScopeSetup: string;
  coreSource: string;
} {
  const defaultAuthUrl = options.authServerUrl || "http://localhost:3000";
  const redisImport = options.redisRevocationPackageName
    ? `import { getCache } from "${options.redisRevocationPackageName}";\n`
    : "";

  const redisRevocationBlock = options.redisRevocationPackageName
    ? `
  // Check Redis revocation blocklist so logged-out/banned users are rejected immediately
  // even if their short-lived JWT has not expired yet (or ignoreExpiration is enabled).
  const jti = typeof resolvedUser.jti === "string" ? resolvedUser.jti : undefined;
  if (jti) {
    const revokedToken = await getCache(\`auth:revoked:\${jti}\`);
    if (revokedToken) {
      throw new AuthVerificationError(401, "Unauthorized: Token has been revoked");
    }
  }
  const revokedBefore = await getCache(\`auth:user_revoked_before:\${resolvedUser.id}\`);
  const iat = typeof resolvedUser.iat === "number" ? resolvedUser.iat : undefined;
  if (revokedBefore && iat && iat * 1000 < Number(revokedBefore)) {
    throw new AuthVerificationError(401, "Unauthorized: Session has been revoked");
  }`
    : "";

  const moduleScopeSetup =
    strategy === "jwks"
      ? `
// Hoisted at module scope so jose caches the remote JWKS keys across requests
const AUTH_SERVER_URL =
  process.env.AUTH_SERVER_URL ?? process.env.BETTER_AUTH_URL ?? ${JSON.stringify(defaultAuthUrl)};
const JWKS = createRemoteJWKSet(new URL(\`\${AUTH_SERVER_URL}/api/auth/jwks\`));
`
      : "";

  const verifyBody =
    strategy === "jwks"
      ? buildVerifyJwksBody(options)
      : strategy === "http"
        ? buildVerifyHttpBody(defaultAuthUrl)
        : buildVerifyDbBody();

  const coreSource = `export class AuthVerificationError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthVerificationError";
  }
}

export interface VerifyTokenOptions {
  /** Required global user roles (resolvedUser.role); throws 403 if not satisfied. */
  roles?: string[];
  /** Required organization membership roles (resolvedUser.orgRole); throws 403 if not satisfied. */
  orgRoles?: string[];
  /**
   * Match rule when both roles and orgRoles are supplied:
   * - "all" (default): requires BOTH global user role AND organization role to match.
   * - "any": passes if EITHER global user role OR organization role matches.
   */
  roleMatchMode?: "all" | "any";
  /**
   * When true, skips JWT \`exp\` validation while still verifying cryptographic signature
   * (useful for delayed/retried Kafka consumer messages paired with Redis revocation).
   */
  ignoreExpiration?: boolean;
}

/**
 * Verifies a raw Bearer token (or "Bearer <token>" header string) and returns AuthUser.
 */
export async function verifyAuthToken(
  rawToken: string,
  options: VerifyTokenOptions = {},
): Promise<AuthUser> {
  const token = rawToken.startsWith("Bearer ") ? rawToken.slice(7).trim() : rawToken.trim();
  if (!token) {
    throw new AuthVerificationError(401, "Unauthorized: Missing Bearer token");
  }

  let resolvedUser: AuthUser;
${verifyBody}
${redisRevocationBlock}

  const requiredUserRoles = options.roles?.filter(Boolean) ?? [];
  const requiredOrgRoles = options.orgRoles?.filter(Boolean) ?? [];
  if (requiredUserRoles.length > 0 || requiredOrgRoles.length > 0) {
    const userRoleMatches =
      requiredUserRoles.length > 0 && requiredUserRoles.includes(resolvedUser.role);
    const orgRoleMatches =
      requiredOrgRoles.length > 0 &&
      typeof resolvedUser.orgRole === "string" &&
      requiredOrgRoles.includes(resolvedUser.orgRole);

    const matchMode = options.roleMatchMode ?? "all";
    const hasBoth = requiredUserRoles.length > 0 && requiredOrgRoles.length > 0;
    const authorized = hasBoth
      ? matchMode === "any"
        ? userRoleMatches || orgRoleMatches
        : userRoleMatches && orgRoleMatches
      : requiredUserRoles.length > 0
      ? userRoleMatches
      : orgRoleMatches;

    if (!authorized) {
      logger.warn("Auth failed: insufficient role", {
        userRole: resolvedUser.role,
        orgRole: resolvedUser.orgRole,
        requiredUserRoles,
        requiredOrgRoles,
        roleMatchMode: matchMode,
      });
      throw new AuthVerificationError(403, "Forbidden: Insufficient role");
    }
  }

  return resolvedUser;
}`;

  return {
    extraImports: `${buildImports(strategy)}\n${redisImport}`.trimEnd(),
    moduleScopeSetup,
    coreSource,
  };
}

/**
 * Generates `src/middleware/verifyToken.ts` — a reusable token verification helper
 * used by `auth_verify` pipeline steps (including Kafka consumers, where no Express `req` exists).
 */
export function generateVerifyTokenHelper(
  strategy: AuthStrategy = "db",
  options: RequireAuthMiddlewareOptions = {},
): string {
  const { extraImports, moduleScopeSetup, coreSource } = buildVerifyTokenCore(strategy, options);
  return `import { createLogger } from "@workspace/logger";
import type { AuthUser } from "@workspace/types";
${extraImports ? `${extraImports}\n` : ""}
const logger = createLogger("auth:verifyToken");
${moduleScopeSetup}
${coreSource}
`;
}

/**
 * Generates `src/middleware/requireAuth.ts` for a compiled Express service.
 *
 * - Self-contained: embeds `verifyAuthToken` directly so standalone generation works cleanly.
 * - Strategy ("db" | "jwks" | "http") is resolved at compile time and baked directly
 *   into the generated source — no switch statement in the output.
 * - req.user is declared via Express namespace augmentation in the same file
 *   so no separate types.d.ts is needed.
 */
export function generateRequireAuthMiddleware(
  strategy: AuthStrategy = "db",
  options: RequireAuthMiddlewareOptions = {},
): string {
  const { extraImports, moduleScopeSetup, coreSource } = buildVerifyTokenCore(strategy, options);

  return `import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createLogger } from "@workspace/logger";
import type { AuthUser } from "@workspace/types";
${extraImports ? `${extraImports}\n` : ""}
// Extend Express Request to carry the resolved user identity
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const logger = createLogger("middleware:requireAuth");
${moduleScopeSetup}
${coreSource}

interface AuthOptions {
  /** When provided, the request is rejected with 403 unless req.user.role is in this list. */
  roles?: string[];
  /** When provided, enforces active organization membership role (req.user.orgRole). */
  orgRoles?: string[];
  /** Match rule when both roles and orgRoles are provided ("all" | "any"). */
  roleMatchMode?: "all" | "any";
}

/**
 * Express middleware factory for authentication (and optional role-based authorization).
 *
 * Usage:
 *   router.get("/public",  handler);
 *   router.get("/private", requireAuth(), handler);
 *   router.post("/admin",  requireAuth({ roles: ["admin"] }), handler);
 *
 * On success, attaches \`req.user\` and calls next().
 * On failure, responds immediately with 401 (unauthenticated) or 403 (unauthorized).
 */
export function requireAuth<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
>(options: AuthOptions = {}): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return async (req: Request<any, any, any, any>, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      logger.warn("Auth failed: missing or malformed Authorization header", {
        headersReceived: Object.keys(req.headers),
      });
      return res.status(401).json({ error: "Unauthorized: Missing Bearer token" });
    }

    try {
      req.user = await verifyAuthToken(authHeader, {
        roles: options.roles,
        orgRoles: options.orgRoles,
        roleMatchMode: options.roleMatchMode,
      });
      next();
    } catch (err) {
      if (err instanceof AuthVerificationError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      logger.error("requireAuth: unexpected error during session resolution", {
        error: String(err),
      });
      return res.status(500).json({ error: "Internal Server Error during authentication" });
    }
  };
}
`;
}

// ---------------------------------------------------------------------------
// Strategy-specific helpers
// ---------------------------------------------------------------------------

function buildImports(strategy: AuthStrategy): string {
  if (strategy === "db") {
    return `import { findAuthSessionByToken, findAuthUserById, findAuthOrgMemberRole } from "@workspace/db";
import crypto from "node:crypto";`;
  }
  if (strategy === "jwks") {
    return `import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";`;
  }
  return "";
}

function buildVerifyDbBody(): string {
  return `  // Fast path: Stateless HS256 JWT Verification (instant for Postman & external test tokens)
  const secret = process.env.BETTER_AUTH_SECRET ?? "default_super_secret_key_change_in_production";
  const _toValidUuid = (str?: string | null): string => {
    if (!str) return "a0000000-0000-4000-8000-000000000001";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)) return str;
    const hex = crypto.createHash("md5").update(str).digest("hex");
    return \`\${hex.slice(0, 8)}-\${hex.slice(8, 12)}-4\${hex.slice(13, 16)}-8\${hex.slice(17, 20)}-\${hex.slice(20, 32)}\`;
  };
  let resolvedUserId: string | undefined;
  let resolvedRole: string = "user";
  let resolvedActiveOrgId: string | undefined;
  let resolvedOrgRole: string | undefined;
  let resolvedUserClaims: Record<string, string | number | boolean | null | undefined> = {};
  let resolvedUserRecord: { role?: string; email?: string; name?: string; username?: string } | null | undefined;

  try {
    const parts = token.split(".");
    if (parts.length === 3 && typeof parts[0] === "string" && typeof parts[1] === "string" && typeof parts[2] === "string") {
      const headerB64: string = parts[0];
      const payloadB64: string = parts[1];
      const signatureB64: string = parts[2];
      const data = \`\${headerB64}.\${payloadB64}\`;
      const expectedSig = crypto
        .createHmac("sha256", secret)
        .update(data)
        .digest("base64url");
      const sigBuf = Buffer.from(signatureB64);
      const expBuf = Buffer.from(expectedSig);
      if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
        const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf-8"));
        if (header.alg === "HS256") {
          const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
          if (options.ignoreExpiration || !payload.exp || payload.exp * 1000 > Date.now()) {
            const sub = payload.sub ?? payload.userId ?? payload.id;
            if (sub) {
              resolvedUserId = _toValidUuid(String(sub));
              resolvedRole = String(payload.role ?? "user");
              resolvedActiveOrgId =
                typeof payload.activeOrganizationId === "string" ? payload.activeOrganizationId : undefined;
              resolvedOrgRole = typeof payload.orgRole === "string" ? payload.orgRole : undefined;
              resolvedUserClaims = { ...payload };
              logger.info("Auth: token resolved via stateless HS256 JWT verification", { userId: resolvedUserId, role: resolvedRole });
            }
          }
        }
      }
    }
  } catch (_jwtErr) {
    // Fall back to database session query
  }

  // Fallback path: direct session lookup via shared @workspace/db (better-auth v1.6 schema)
  if (!resolvedUserId) {
    const session = await findAuthSessionByToken(token);

    resolvedUserId = session?.userId ? _toValidUuid(String(session.userId)) : undefined;
    const resolvedExpiresAt = session?.expiresAt;
    resolvedActiveOrgId =
      typeof session?.activeOrganizationId === "string" ? session.activeOrganizationId : undefined;

    if (!resolvedUserId) {
      logger.warn("Auth failed: session not found and JWT invalid", {
        tokenPrefix: token.substring(0, 8) + "...",
      });
      throw new AuthVerificationError(401, "Unauthorized: Invalid or expired token");
    }

    if (!options.ignoreExpiration && resolvedExpiresAt && new Date(resolvedExpiresAt).getTime() < Date.now()) {
      logger.warn("Auth failed: session expired", { expiresAt: String(resolvedExpiresAt) });
      throw new AuthVerificationError(401, "Unauthorized: Session has expired");
    }

    resolvedUserRecord = await findAuthUserById(resolvedUserId);
    resolvedRole = String(resolvedUserRecord?.role ?? "user");
    if (resolvedActiveOrgId) {
      resolvedOrgRole = await findAuthOrgMemberRole(resolvedUserId, resolvedActiveOrgId);
    }
    logger.info("Auth: session resolved via shared DB", { userId: resolvedUserId, role: resolvedRole });
  }

  resolvedUser = {
    ...resolvedUserClaims,
    id: _toValidUuid(String(resolvedUserId)),
    userId: _toValidUuid(String(resolvedUserId)),
    username: String(resolvedUserClaims.username ?? resolvedUserRecord?.username ?? resolvedUserClaims.name ?? resolvedUserRecord?.name ?? resolvedUserId),
    role: resolvedRole,
    ...(resolvedActiveOrgId ? { activeOrganizationId: resolvedActiveOrgId } : {}),
    ...(resolvedOrgRole ? { orgRole: resolvedOrgRole } : {}),
    ...(resolvedUserClaims.email ? { email: String(resolvedUserClaims.email) } : resolvedUserRecord?.email ? { email: String(resolvedUserRecord.email) } : {}),
    ...(resolvedUserClaims.name ? { name: String(resolvedUserClaims.name) } : resolvedUserRecord?.name ? { name: String(resolvedUserRecord.name) } : {}),
    sessionToken: token,
  };`;
}

function buildVerifyJwksBody(options: RequireAuthMiddlewareOptions): string {
  const jwtVerifyOpts: string[] = [];
  if (options.issuer) jwtVerifyOpts.push(`issuer: ${JSON.stringify(options.issuer)}`);
  if (options.audience) jwtVerifyOpts.push(`audience: ${JSON.stringify(options.audience)}`);

  return `  // Strategy: jwks — stateless asymmetric JWT verification via cached JWKS endpoint
  let payload: JWTPayload;
  try {
    const verifyResult = await jwtVerify(token, JWKS, {
      ...(options.ignoreExpiration ? { currentDate: new Date(0) } : {}),
      ${jwtVerifyOpts.join(",\n      ")}
    });
    payload = verifyResult.payload;
  } catch (jwtErr) {
    logger.warn("Auth failed: JWKS token verification failed", { error: String(jwtErr) });
    throw new AuthVerificationError(401, "Unauthorized: Invalid or expired token");
  }

  const sub = typeof payload.sub === "string" ? payload.sub : undefined;
  const payloadId = "id" in payload && typeof payload.id === "string" ? payload.id : undefined;
  const payloadUserId = "userId" in payload && typeof payload.userId === "string" ? payload.userId : undefined;
  const resolvedSub = sub ?? payloadId ?? payloadUserId;
  if (!resolvedSub) {
    logger.warn("Auth failed: JWT payload has no subject");
    throw new AuthVerificationError(401, "Unauthorized: Invalid token payload");
  }

  const payloadUsername = "username" in payload && typeof payload.username === "string" ? payload.username : undefined;
  const payloadName = "name" in payload && typeof payload.name === "string" ? payload.name : undefined;
  const payloadRole = "role" in payload && typeof payload.role === "string" ? payload.role : "user";
  const payloadActiveOrgId =
    "activeOrganizationId" in payload && typeof payload.activeOrganizationId === "string"
      ? payload.activeOrganizationId
      : undefined;
  const payloadOrgRole =
    "orgRole" in payload && typeof payload.orgRole === "string" ? payload.orgRole : undefined;
  const payloadEmail = "email" in payload && typeof payload.email === "string" ? payload.email : undefined;

  // Collect primitive JWT claims cleanly onto AuthUser without unsafe type casts
  const extraClaims: Record<string, string | number | boolean | null | undefined> = {};
  for (const [claimKey, claimValue] of Object.entries(payload)) {
    if (
      typeof claimValue === "string" ||
      typeof claimValue === "number" ||
      typeof claimValue === "boolean" ||
      claimValue === null
    ) {
      extraClaims[claimKey] = claimValue;
    }
  }

  resolvedUser = {
    ...extraClaims,
    id: resolvedSub,
    userId: resolvedSub,
    username: payloadUsername ?? payloadName ?? resolvedSub,
    role: payloadRole,
    ...(payloadActiveOrgId ? { activeOrganizationId: payloadActiveOrgId } : {}),
    ...(payloadOrgRole ? { orgRole: payloadOrgRole } : {}),
    email: payloadEmail,
    name: payloadName,
    sessionToken: token,
  };

  logger.info("Auth: session resolved via JWKS", { userId: resolvedUser.id, role: resolvedUser.role });`;
}

function buildVerifyHttpBody(defaultAuthUrl: string): string {
  return `  // Strategy: http — session lookup via Better Auth /api/auth/get-session
  const authServerUrl =
    process.env.AUTH_SERVER_URL ?? process.env.BETTER_AUTH_URL ?? ${JSON.stringify(defaultAuthUrl)};

  const forwardHeaders = {
    authorization: \`Bearer \${token}\`,
    "x-better-auth-session-token": token,
    cookie: \`better-auth.session_token=\${token}\`,
  };
  const authRes = await fetch(\`\${authServerUrl}/api/auth/get-session\`, {
    headers: forwardHeaders,
  });

  if (!authRes.ok) {
    logger.warn("Auth failed: auth server returned non-OK", { status: authRes.status });
    throw new AuthVerificationError(401, "Unauthorized: Invalid or expired token");
  }

  const contentType = authRes.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    logger.warn("Auth failed: unexpected content-type from auth server", { contentType });
    throw new AuthVerificationError(401, "Unauthorized: Invalid auth server response");
  }

  interface BetterAuthSessionResponse {
    user?: { id?: string; role?: string; email?: string; name?: string; username?: string };
    session?: { userId?: string; activeOrganizationId?: string };
  }
  const data: BetterAuthSessionResponse = await authRes.json();

  const userId = data.user?.id ?? data.session?.userId;
  if (!userId) {
    logger.warn("Auth failed: no userId in auth server response");
    throw new AuthVerificationError(401, "Unauthorized: User not found");
  }

  const activeOrganizationId = data.session?.activeOrganizationId;
  let orgRole: string | undefined;
  if (activeOrganizationId) {
    try {
      const memberRes = await fetch(\`\${authServerUrl}/api/auth/organization/get-active-member\`, {
        headers: forwardHeaders,
      });
      if (memberRes.ok && (memberRes.headers.get("content-type") ?? "").includes("application/json")) {
        const memberData: { role?: string } | null = await memberRes.json();
        if (typeof memberData?.role === "string") {
          orgRole = memberData.role;
        }
      }
    } catch {
      // Ignore if organization endpoint is not enabled on the auth server
    }
  }

  resolvedUser = {
    ...(data.user || {}),
    id: String(userId),
    userId: String(userId),
    username: String(data.user?.username ?? data.user?.name ?? userId),
    role: String(data.user?.role ?? "user"),
    ...(activeOrganizationId ? { activeOrganizationId } : {}),
    ...(orgRole ? { orgRole } : {}),
    email: data.user?.email,
    name: data.user?.name,
    sessionToken: token,
  };

  logger.info("Auth: session resolved via HTTP get-session", { userId: resolvedUser.id, role: resolvedUser.role });`;
}
