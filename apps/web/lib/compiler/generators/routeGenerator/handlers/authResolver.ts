// ═══════════════════════════════════════════════════════════════
// MODULE: AuthResolver
// LAYER:  generators / routeGenerator / handlers
// EMITS:  auth metadata (requiresAuth, authOptions) for route registration
// ═══════════════════════════════════════════════════════════════

import {
  Endpoint,
  EndpointTraceResult,
  PipelineStepInputSource,
} from "@workspace/canvas/types";
import { AUTH_FRAMEWORK_BETTER_AUTH, DEFAULT_AUTH_FRAMEWORK } from "@workspace/canvas";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { AuthStrategy } from "../../auth-providers/better-auth/v1.6/generateRequireAuthMiddleware";
import { compileRedisNodes } from "../../../compileRedisNodes";

export interface AuthResolutionResult {
  /** Whether this endpoint requires authentication. */
  requiresAuth: boolean;
  /** JSON-serialized options object string, e.g. '{}' or '{"roles":["admin"]}'. Always valid JSON. */
  authOptions: string;
}

export interface ServiceAuthContext {
  /** Resolved verification strategy for this ServiceNode. */
  strategy: AuthStrategy;
  /** Base URL of the Auth server / IdP (used for JWKS and HTTP session checks). */
  authServerUrl: string;
  /** Optional JWT issuer claim enforced during JWKS verification. */
  issuer?: string;
  /** Optional JWT audience claim enforced during JWKS verification. */
  audience?: string;
  /** Workspace Redis package name (e.g. "@workspace/redis") when revocation checking is enabled. */
  redisRevocationPackageName?: string;
  /** Resolved AuthNode on the canvas, if present. */
  authNode?: BackendNode;
}

/**
 * Finds the AuthNode governing a ServiceNode (connected via edge, or single AuthNode on canvas).
 */
export function resolveAuthNodeForService(
  serviceNode?: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): BackendNode | undefined {
  const authNodes = allNodes.filter((n) => n.type === "auth");
  if (authNodes.length === 0) return undefined;

  if (serviceNode) {
    if (serviceNode.data?.authNodeId) {
      const explicit = authNodes.find((a) => a.id === serviceNode.data.authNodeId);
      if (explicit) return explicit;
    }
    const edgeMatch = allEdges.find((e) => {
      const touchesService = e.source === serviceNode.id || e.target === serviceNode.id;
      if (!touchesService) return false;
      const otherId = e.source === serviceNode.id ? e.target : e.source;
      return authNodes.some((a) => a.id === otherId);
    });
    if (edgeMatch) {
      const otherId = edgeMatch.source === serviceNode.id ? edgeMatch.target : edgeMatch.source;
      const matched = authNodes.find((a) => a.id === otherId);
      if (matched) return matched;
    }
  }

  return authNodes.length === 1 ? authNodes[0] : authNodes[0];
}

/**
 * Resolves the multi-server token verification strategy for a ServiceNode.
 *
 * Why:
 * - In a single-DB Express monolith, direct `@workspace/db` lookup ("db") works with zero extra config.
 * - In multi-server, decoupled-DB, or polyglot architectures (or non-Better-Auth IdPs),
 *   "jwks" verifies tokens locally against `/api/auth/jwks` with zero shared DB coupling.
 */
export function resolveServiceAuthContext(
  serviceNode?: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): ServiceAuthContext {
  const authNode = resolveAuthNodeForService(serviceNode, allNodes, allEdges);
  const framework = authNode?.data?.framework || DEFAULT_AUTH_FRAMEWORK;
  const authPort = String(authNode?.data?.port || "3000");
  const authServerUrl = authNode?.data?.baseUrl || `http://localhost:${authPort}`;
  const issuer = authNode?.data?.jwtConfig?.issuer;
  const audience = authNode?.data?.jwtConfig?.audience;

  let redisRevocationPackageName: string | undefined;
  if (authNode?.data?.revocationCheck?.enabled) {
    const compiledRedis = compileRedisNodes(allNodes, allEdges);
    const targetRedisId = authNode.data.revocationCheck.redisNodeId;
    const matchedPkg = targetRedisId
      ? compiledRedis.packages?.find((p) => p.redisNodeId === targetRedisId)
      : compiledRedis.packages?.[0];
    if (matchedPkg?.packageName) {
      redisRevocationPackageName = matchedPkg.packageName;
    } else if (compiledRedis.files.length > 0) {
      redisRevocationPackageName = `@workspace/${compiledRedis.packageFolder || "redis"}`;
    }
  }

  // Non-Better-Auth IdPs always verify via JWKS (no shared Better Auth DB tables)
  if (framework !== AUTH_FRAMEWORK_BETTER_AUTH) {
    return {
      strategy: "jwks",
      authServerUrl,
      issuer,
      audience,
      redisRevocationPackageName,
      authNode,
    };
  }

  const configured = authNode?.data?.serviceAuthStrategy || "auto";
  if (configured !== "auto") {
    return {
      strategy: configured,
      authServerUrl,
      issuer,
      audience,
      redisRevocationPackageName,
      authNode,
    };
  }

  const enabledPlugins = authNode?.data?.plugins || ["bearer", "admin", "organization", "jwt"];
  const hasJwtPlugin = enabledPlugins.includes("jwt");
  const serviceCount = allNodes.filter((n) => n.type === "service").length;
  const dbCount = allNodes.filter(
    (n) => n.type === "database" && n.data?.dbEngine !== "redis" && n.data?.dbType !== "redis",
  ).length;
  const techStack = (serviceNode?.data?.techStack || "express").toLowerCase();
  const isPolyglot = techStack !== "express";
  const authDbId = authNode?.data?.databaseId;
  const serviceDbId = serviceNode?.data?.databaseId;
  const isDecoupledDb = Boolean(authDbId && serviceDbId && authDbId !== serviceDbId) || dbCount > 1;

  // Auto-select "jwks" whenever multiple servers, polyglot runtimes, or isolated DBs exist
  const strategy: AuthStrategy =
    authNode && hasJwtPlugin && (serviceCount > 1 || isPolyglot || isDecoupledDb)
      ? "jwks"
      : "db";

  return {
    strategy,
    authServerUrl,
    issuer,
    audience,
    redisRevocationPackageName,
    authNode,
  };
}

/**
 * Compute per-endpoint auth requirements — surfaced on the return value so the
 * router builder can inject requireAuth() at the registration site, not inline.
 */
export function resolveEndpointAuth(
  ep: Endpoint & { nodeId: string },
  trace: EndpointTraceResult,
): AuthResolutionResult {
  const isCallerProtected = trace.incoming.some((inc) => inc.isProtected);
  const requiresAuth =
    ep.requireAuth === true ||
    (ep.requireAuth !== false &&
      (isCallerProtected ||
        Boolean(ep.authRuleId) ||
        Boolean(ep.requiredRoles && ep.requiredRoles.length > 0) ||
        Boolean(ep.requiredScopes && ep.requiredScopes.length > 0) ||
        Boolean(
          ep.pipelineSteps?.some((s) => {
            const check = (src?: PipelineStepInputSource): boolean => src?.kind === "auth";
            return (
              s.inputBindings?.some((b) => check(b.source)) ||
              check(s.variableSource) ||
              check(s.switchSource) ||
              check(s.loopSource)
            );
          }),
        )));

  // Build the JSON-safe options object for requireAuth().
  // JSON.stringify ensures user-supplied role strings are safely escaped —
  // never interpolated as raw code regardless of what the canvas config contains.
  const authOptionsObj: { roles?: string[] } = {};
  if (ep.requiredRoles && ep.requiredRoles.length > 0) {
    authOptionsObj.roles = ep.requiredRoles;
  }
  const authOptions = JSON.stringify(authOptionsObj);

  return {
    requiresAuth,
    authOptions,
  };
}
