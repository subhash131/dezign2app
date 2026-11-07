import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { CompiledFile, CompiledServiceResult, Endpoint, AnyMessagingResource, AuthPageMetaInfo } from "@workspace/canvas/types";
import {
  DEFAULT_AUTH_FRAMEWORK,
  DEFAULT_BETTER_AUTH_VERSION,
  AUTH_FRAMEWORK_BETTER_AUTH,
  BackendNodeData,
  arePageRoutesEqual,
} from "@workspace/canvas";
import { compileBetterAuthV16, resolveOAuthProviders, BetterAuthV16NodeData } from "./auth/better-auth/v1.6";

export type { AuthPageMetaInfo };

export type AuthCompilerNodeData = BackendNodeData | BetterAuthV16NodeData | Partial<BackendNodeData>;

export interface CompiledAuthResult {
  authNodeId: string;
  serviceId?: string;
  serviceName?: string;
  files: CompiledFile[];
}

/**
 * Resolves database nodes connected to an Auth node via graph edges
 */
export function resolveConnectedDbNodes(
  authNode: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = []
): BackendNode[] {
  const connectedNodeIds = new Set<string>();

  allEdges.forEach((edge) => {
    if (edge.source === authNode.id) {
      connectedNodeIds.add(edge.target);
    } else if (edge.target === authNode.id) {
      connectedNodeIds.add(edge.source);
    }
  });

  const connectedDbNodes = allNodes.filter((n) => {
    if (!connectedNodeIds.has(n.id)) return false;
    const t = String(n.type).toLowerCase();
    return t === "entity" || t === "db_ref" || t === "db" || t === "database";
  });

  if (connectedDbNodes.length > 0) {
    return connectedDbNodes;
  }

  // Fallback: Return all DB nodes in canvas if available
  return allNodes.filter((n) => {
    const t = String(n.type).toLowerCase();
    return t === "entity" || t === "db_ref" || t === "db" || t === "database";
  });
}

/**
 * Resolves accessible target nodes (web apps, pages, services) protected by or connected to an Auth node
 */
export function resolveAccessibleNodes(
  authNode: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = []
): BackendNode[] {
  const accessibleNodeIds = new Set<string>();

  allEdges.forEach((edge) => {
    if (edge.source === authNode.id) {
      accessibleNodeIds.add(edge.target);
    } else if (edge.target === authNode.id) {
      accessibleNodeIds.add(edge.source);
    }
  });

  return allNodes.filter((n) => {
    if (!accessibleNodeIds.has(n.id)) return false;
    const t = String(n.type).toLowerCase();
    return t === "webclient" || t === "webapp" || t === "service" || Boolean(n.data?.isWebClient);
  });
}

/**
 * Compiles a Canvas Auth Node into code based on the selected framework type (e.g. better_auth) and version (e.g. v1.6).
 * Auth is compiled as an integrated monorepo security component (Better Auth configuration, Next.js handler,
 * client SDK, FastAPI middleware, and environment variables) rather than an independent standalone app.
 */
export function compileAuth(
  node: BackendNode,
  _endpoints: (Endpoint & { nodeId: string })[] = [],
  _events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  _testCases: SimulationTestCase[] = []
): CompiledAuthResult {
  const framework = node.data?.framework || DEFAULT_AUTH_FRAMEWORK;
  const _version = node.data?.version || DEFAULT_BETTER_AUTH_VERSION;

  // Ensure validateSchema defaults to false to prevent BetterAuthError: Database schema mismatch
  // (SCHEMA_MISMATCH) crashes during startup or on /api/auth/get-session requests.
  const sanitizedNode: BackendNode = {
    ...node,
    data: {
      validateSchema: false,
      ...node.data,
    },
  };

  switch (framework) {
    case AUTH_FRAMEWORK_BETTER_AUTH:
    case "better_auth":
    default: {
      return compileBetterAuthV16(sanitizedNode, allNodes, allEdges);
    }
  }
}

/**
 * Checks whether a page is the Sign-In / Login page as defined in AuthConfig (redirects) or by fallback conventions
 */
export function isAuthLoginPage(
  pageMeta: AuthPageMetaInfo,
  authNodeData?: AuthCompilerNodeData
): boolean {
  const redirects = authNodeData?.redirects;

  // 1. Direct match by nodeId if configured
  if (redirects?.signInPageNodeId && pageMeta.nodeId === redirects.signInPageNodeId) {
    return true;
  }

  // 2. Direct match by configured signInPageUrl if configured
  const configuredSignInUrl = redirects?.signInPageUrl;
  if (configuredSignInUrl) {
    const cleanSignIn = configuredSignInUrl.startsWith("/") ? configuredSignInUrl : `/${configuredSignInUrl}`;
    const cleanRoutePath = pageMeta.routePath?.startsWith("/") ? pageMeta.routePath : `/${pageMeta.routePath || ""}`;
    const cleanSlug = pageMeta.slug ? `/${pageMeta.slug}` : "";
    if (
      cleanRoutePath === cleanSignIn ||
      cleanSlug === cleanSignIn ||
      arePageRoutesEqual(cleanRoutePath, cleanSignIn) ||
      arePageRoutesEqual(cleanSlug, cleanSignIn) ||
      arePageRoutesEqual(pageMeta.label || "", cleanSignIn)
    ) {
      return true;
    }
  }

  // 3. Match standard naming conventions for login / sign-in (e.g. "login", "signin", "sign-in", "Sign In")
  const rawSlug = (pageMeta.slug || "").toLowerCase();
  const rawRoute = (pageMeta.routePath || "").toLowerCase();
  const rawLabel = (pageMeta.label || "").toLowerCase();
  const normSlug = rawSlug.replace(/[-_]/g, "");
  const normRoute = rawRoute.replace(/[-_]/g, "");
  const normLabel = rawLabel.replace(/[-_\s]/g, "");

  const matchesSignInConvention =
    rawSlug === "login" ||
    rawSlug === "signin" ||
    rawSlug === "sign-in" ||
    normSlug === "signin" ||
    normSlug === "login" ||
    rawRoute === "/login" ||
    rawRoute === "/signin" ||
    rawRoute === "/sign-in" ||
    normRoute === "/signin" ||
    normRoute === "/login" ||
    normLabel === "login" ||
    normLabel === "signin" ||
    normLabel === "/login" ||
    normLabel === "/signin" ||
    arePageRoutesEqual(rawRoute, "/login") ||
    arePageRoutesEqual(rawRoute, "/signin") ||
    arePageRoutesEqual(rawRoute, "/sign-in");

  if (matchesSignInConvention) {
    return true;
  }

  // 4. If the page is explicitly flagged as an auth page and is not a register page, treat as sign-in
  if (pageMeta.isAuthPage && !isAuthRegisterPage(pageMeta, authNodeData)) {
    return true;
  }

  return false;
}

/**
 * Checks whether a page is the Sign-Up / Register page as defined in AuthConfig (redirects) or by fallback conventions
 */
export function isAuthRegisterPage(
  pageMeta: AuthPageMetaInfo,
  authNodeData?: AuthCompilerNodeData
): boolean {
  const redirects = authNodeData?.redirects;

  // 1. Direct match by nodeId if configured
  if (redirects?.signUpPageNodeId && pageMeta.nodeId === redirects.signUpPageNodeId) {
    return true;
  }

  // 2. Direct match by configured signUpPageUrl if configured
  const configuredSignUpUrl = redirects?.signUpPageUrl;
  if (configuredSignUpUrl) {
    const cleanSignUp = configuredSignUpUrl.startsWith("/") ? configuredSignUpUrl : `/${configuredSignUpUrl}`;
    const cleanRoutePath = pageMeta.routePath?.startsWith("/") ? pageMeta.routePath : `/${pageMeta.routePath || ""}`;
    const cleanSlug = pageMeta.slug ? `/${pageMeta.slug}` : "";
    if (
      cleanRoutePath === cleanSignUp ||
      cleanSlug === cleanSignUp ||
      arePageRoutesEqual(cleanRoutePath, cleanSignUp) ||
      arePageRoutesEqual(cleanSlug, cleanSignUp) ||
      arePageRoutesEqual(pageMeta.label || "", cleanSignUp)
    ) {
      return true;
    }
  }

  // 3. Match standard naming conventions for register / sign-up (e.g. "register", "signup", "sign-up", "Sign Up")
  const rawSlug = (pageMeta.slug || "").toLowerCase();
  const rawRoute = (pageMeta.routePath || "").toLowerCase();
  const rawLabel = (pageMeta.label || "").toLowerCase();
  const normSlug = rawSlug.replace(/[-_]/g, "");
  const normRoute = rawRoute.replace(/[-_]/g, "");
  const normLabel = rawLabel.replace(/[-_\s]/g, "");

  const matchesSignUpConvention =
    rawSlug === "register" ||
    rawSlug === "signup" ||
    rawSlug === "sign-up" ||
    normSlug === "signup" ||
    normSlug === "register" ||
    rawRoute === "/register" ||
    rawRoute === "/signup" ||
    rawRoute === "/sign-up" ||
    normRoute === "/signup" ||
    normRoute === "/register" ||
    normLabel === "register" ||
    normLabel === "signup" ||
    normLabel === "/register" ||
    normLabel === "/signup" ||
    arePageRoutesEqual(rawRoute, "/register") ||
    arePageRoutesEqual(rawRoute, "/signup") ||
    arePageRoutesEqual(rawRoute, "/sign-up");

  return matchesSignUpConvention;
}

/**
 * Checks whether a page is any auth page (login or register page)
 */
export function isAuthPage(
  pageMeta: AuthPageMetaInfo,
  authNodeData?: AuthCompilerNodeData
): boolean {
  if (pageMeta.isAuthPage) return true;
  return isAuthLoginPage(pageMeta, authNodeData) || isAuthRegisterPage(pageMeta, authNodeData);
}

/**
 * Determines whether social authentication providers should be generated for a page.
 * Social providers are ONLY generated for the login and register pages defined in AuthConfig.
 */
export function shouldGenerateSocialProviders(
  pageMeta: AuthPageMetaInfo,
  authNodeData?: AuthCompilerNodeData
): boolean {
  const isTargetAuthPage =
    Boolean(pageMeta.isAuthPage) ||
    isAuthLoginPage(pageMeta, authNodeData) ||
    isAuthRegisterPage(pageMeta, authNodeData);
  if (!isTargetAuthPage) {
    return false;
  }

  const oauthList = resolveOAuthProviders(authNodeData);
  return oauthList.length > 0;
}
