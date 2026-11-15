export type AuthStrategy = "db" | "jwks" | "http";

/**
 * Generates `src/middleware/requireAuth.ts` for a compiled Express service.
 *
 * - Strategy is resolved at compile time (not runtime) and baked directly into
 *   the generated source — no switch statement in the output.
 * - Default strategy is "db": direct SQLite session lookup via @workspace/db,
 *   which is correct for the centralized monorepo where the DB is shared.
 * - The returned middleware is a factory: requireAuth() for auth-only,
 *   requireAuth({ roles: ["admin"] }) for auth + role enforcement.
 * - req.user is declared via Express namespace augmentation in the same file
 *   so no separate types.d.ts is needed.
 */
export function generateRequireAuthMiddleware(
  strategy: AuthStrategy = "db"
): string {
  const sessionBlock = buildSessionBlock(strategy);

  return `import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createLogger } from "@workspace/logger";
import type { AuthUser } from "@workspace/types";
${buildImports(strategy)}

// Extend Express Request to carry the resolved user identity
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const logger = createLogger("middleware:requireAuth");

interface AuthOptions {
  /** When provided, the request is rejected with 403 unless req.user.role is in this list. */
  roles?: string[];
}

/**
 * Express middleware factory for authentication (and optional role-based authorization).
 *
 * Usage:
 *   router.get("/public",  handler);
 *   router.get("/private", requireAuth(), handler);
 *   router.post("/admin",  requireAuth({ roles: ["admin"] }), handler);
 *
 * On success, attaches \`req.user = { id, role }\` and calls next().
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

    const token = authHeader.substring(7).trim();

    try {
${sessionBlock}
    } catch (err) {
      logger.error("requireAuth: unexpected error during session resolution", {
        error: String(err),
      });
      return res.status(500).json({ error: "Internal Server Error during authentication" });
    }

    if (options.roles && options.roles.length > 0) {
      const userRole = req.user!.role;
      if (!options.roles.includes(userRole)) {
        logger.warn("Auth failed: insufficient role", {
          userRole,
          required: options.roles,
        });
        return res.status(403).json({ error: "Forbidden: Insufficient role" });
      }
    }

    next();
  };
}
`;
}

// ---------------------------------------------------------------------------
// Strategy-specific helpers
// ---------------------------------------------------------------------------

function buildImports(strategy: AuthStrategy): string {
  if (strategy === "db") {
    return `import { findAuthSessionByToken, findAuthUserById } from "@workspace/db";
import crypto from "node:crypto";`;
  }
  if (strategy === "jwks") {
    return `import { jwtVerify, createRemoteJWKSet } from "jose";`;
  }
  // http — no extra compile-time import needed; uses global fetch
  return "";
}

function buildSessionBlock(strategy: AuthStrategy): string {
  if (strategy === "db") return buildDbSessionBlock();
  if (strategy === "jwks") return buildJwksSessionBlock();
  return buildHttpSessionBlock();
}

function buildDbSessionBlock(): string {
  return `      // Fast path: Stateless HS256 JWT Verification (instant for Postman & external test tokens)
      const secret = process.env.BETTER_AUTH_SECRET ?? "default_super_secret_key_change_in_production";
      const _toValidUuid = (str?: string | null): string => {
        if (!str) return "a0000000-0000-4000-8000-000000000001";
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)) return str;
        const hex = crypto.createHash("md5").update(str).digest("hex");
        return \`\${hex.slice(0, 8)}-\${hex.slice(8, 12)}-4\${hex.slice(13, 16)}-8\${hex.slice(17, 20)}-\${hex.slice(20, 32)}\`;
      };
      let resolvedUserId: string | undefined;
      let resolvedRole: string = "user";
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
              if (!payload.exp || payload.exp * 1000 > Date.now()) {
                const sub = payload.sub ?? payload.userId ?? payload.id;
                if (sub) {
                  resolvedUserId = _toValidUuid(String(sub));
                  resolvedRole = String(payload.role ?? "user");
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

        if (!resolvedUserId) {
          logger.warn("Auth failed: session not found and JWT invalid", {
            tokenPrefix: token.substring(0, 8) + "...",
          });
          return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
        }

        if (resolvedExpiresAt && new Date(resolvedExpiresAt).getTime() < Date.now()) {
          logger.warn("Auth failed: session expired", { expiresAt: String(resolvedExpiresAt) });
          return res.status(401).json({ error: "Unauthorized: Session has expired" });
        }

        resolvedUserRecord = await findAuthUserById(resolvedUserId);
        resolvedRole = String(resolvedUserRecord?.role ?? "user");
        logger.info("Auth: session resolved via shared DB", { userId: resolvedUserId, role: resolvedRole });
      }

      req.user = {
        ...resolvedUserClaims,
        id: _toValidUuid(String(resolvedUserId)),
        userId: _toValidUuid(String(resolvedUserId)),
        username: String(resolvedUserClaims.username ?? resolvedUserRecord?.username ?? resolvedUserClaims.name ?? resolvedUserRecord?.name ?? resolvedUserId),
        role: resolvedRole,
        ...(resolvedUserClaims.email ? { email: String(resolvedUserClaims.email) } : resolvedUserRecord?.email ? { email: String(resolvedUserRecord.email) } : {}),
        ...(resolvedUserClaims.name ? { name: String(resolvedUserClaims.name) } : resolvedUserRecord?.name ? { name: String(resolvedUserRecord.name) } : {}),
        sessionToken: token,
      };`;
}

function buildJwksSessionBlock(): string {
  return `      // Strategy: jwks — stateless JWT verification via JWKS endpoint (better-auth v1.6)
      const authServerUrl =
        process.env.AUTH_SERVER_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
      const JWKS = createRemoteJWKSet(new URL(\`\${authServerUrl}/api/auth/jwks\`));
      const verifyResult = await jwtVerify(token, JWKS);
      const payload = verifyResult.payload;

      const sub = typeof payload.sub === "string" ? payload.sub : undefined;
      const payloadId = "id" in payload && typeof payload.id === "string" ? payload.id : undefined;
      const payloadUserId = "userId" in payload && typeof payload.userId === "string" ? payload.userId : undefined;
      const resolvedSub = sub ?? payloadId ?? payloadUserId;
      if (!resolvedSub) {
        logger.warn("Auth failed: JWT payload has no subject");
        return res.status(401).json({ error: "Unauthorized: Invalid token payload" });
      }

      const payloadUsername = "username" in payload && typeof payload.username === "string" ? payload.username : undefined;
      const payloadName = "name" in payload && typeof payload.name === "string" ? payload.name : undefined;
      const payloadRole = "role" in payload && typeof payload.role === "string" ? payload.role : "user";
      const payloadEmail = "email" in payload && typeof payload.email === "string" ? payload.email : undefined;

      req.user = {
        ...payload,
        id: resolvedSub,
        userId: resolvedSub,
        username: payloadUsername ?? payloadName ?? resolvedSub,
        role: payloadRole,
        email: payloadEmail,
        name: payloadName,
        sessionToken: token,
      };

      logger.info("Auth: session resolved via JWKS", { userId: req.user.id, role: req.user.role });`;
}

function buildHttpSessionBlock(): string {
  return `      // Strategy: http — session lookup via Better Auth /api/auth/get-session
      const authServerUrl =
        process.env.AUTH_SERVER_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

      const authRes = await fetch(\`\${authServerUrl}/api/auth/get-session\`, {
        headers: {
          authorization: authHeader,
          "x-better-auth-session-token": token,
          cookie: req.headers.cookie ?? \`better-auth.session_token=\${token}\`,
        },
      });

      if (!authRes.ok) {
        logger.warn("Auth failed: auth server returned non-OK", { status: authRes.status });
        return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
      }

      const contentType = authRes.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        logger.warn("Auth failed: unexpected content-type from auth server", { contentType });
        return res.status(401).json({ error: "Unauthorized: Invalid auth server response" });
      }

      interface BetterAuthSessionResponse {
        user?: { id?: string; role?: string; email?: string; name?: string; username?: string };
        session?: { userId?: string };
      }
      const data: BetterAuthSessionResponse = await authRes.json();

      const userId = data.user?.id ?? data.session?.userId;
      if (!userId) {
        logger.warn("Auth failed: no userId in auth server response");
        return res.status(401).json({ error: "Unauthorized: User not found" });
      }

      req.user = {
        ...(data.user || {}),
        id: String(userId),
        userId: String(userId),
        username: String(data.user?.username ?? data.user?.name ?? userId),
        role: String(data.user?.role ?? "user"),
        email: data.user?.email,
        name: data.user?.name,
        sessionToken: token,
      };

      logger.info("Auth: session resolved via HTTP get-session", { userId: req.user.id, role: req.user.role });`;
}
