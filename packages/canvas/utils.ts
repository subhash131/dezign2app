import type {
  HandleKind,
  BackendNodeType,
  BackendEdgeType,
  WebRtcCapabilities,
  WebRtcMediaMode,
  Parameter,
} from "./types";
import { CONNECTION_RULES, EDGE_TYPE_MAP } from "./graph-rules";
import { MESSAGING_RESOURCE_TYPES, MESSAGING_NODE_TYPES, BACKEND_EDGE_TYPES } from "./constants";

const ALL_BACKEND_NODE_TYPES = [
  "service",
  "database",
  "queue",
  "pubsub",
  "eventstream",
  "kafka",
  "redis-streams",
  "sqs",
  "redis-pubsub",
  "redis-cache",
  "redis_instance",
  "redis_schema",
  "entity",
  "webPage",
  "external",
  "group",
  "db_ref",
  "storage",
  "storage_operation_ref",
  "storage_ref",
  "bucket_ref",
  "storage_bucket_ref",
  "StorageBucketRefNode",
  "StorageOperationRefNode",
  "worker",
  "serverless",
  "search_index",
  "api_gateway",
  "load_balancer",
  "webhook",
  "llm",
  "mcp_server",
  "vector_db_ref",
  "identity_provider",
  "auth",
  "webApp",
  "webAppGroup",
  "payments",
  "langgraph",
  "langgraph_step",
  "page_ref",
  "transformer",
  "transformer_ref",
  "hook",
  "hook_ref",
  "types",
  "state_store",
  "browser_storage",
] as const;

export function isBackendNode(type: string): type is BackendNodeType {
  return ALL_BACKEND_NODE_TYPES.some((t) => t === type);
}

export function isBackendEdgeType(type: string): type is BackendEdgeType {
  return Object.values(BACKEND_EDGE_TYPES).some((t) => t === type);
}

export function getUniqueNodeLabel(
  existingNodes: Array<{ type?: string; data?: { label?: string } }>,
  baseLabel: string,
  type: string = "entity",
): string {
  const existingLabels = new Set(
    existingNodes
      .filter((n) => n.data?.label && (type === "webPage" ? n.type === "webPage" : n.type !== "webPage"))
      .map((n) => n.data!.label!.toLowerCase()),
  );

  if (!existingLabels.has(baseLabel.toLowerCase())) {
    return baseLabel;
  }

  let counter = 1;
  while (existingLabels.has(`${baseLabel}_${counter}`.toLowerCase())) {
    counter++;
  }
  return `${baseLabel}_${counter}`;
}

export function getSuggestion(
  sourceKind: HandleKind,
  targetKind: HandleKind,
): string | undefined {
  const validTargets = CONNECTION_RULES[sourceKind];
  if (validTargets && validTargets.length > 0) {
    return (
      `"${sourceKind}" can connect to: ${validTargets.map((k: HandleKind) => `"${k}"`).join(", ")}. ` +
      `You attempted to connect to "${targetKind}" which is not in that list.`
    );
  }

  const validSources = (
    Object.entries(CONNECTION_RULES) as [HandleKind, HandleKind[]][]
  )
    .filter(([, targets]) => targets.includes(targetKind))
    .map(([src]) => src);

  if (validSources.length > 0) {
    return (
      `"${targetKind}" accepts connections from: ${validSources.map((k: HandleKind) => `"${k}"`).join(", ")}. ` +
      `You attempted to connect from "${sourceKind}" which is not in that list.`
    );
  }

  return undefined;
}

export function classifyHandle(
  nodeType: BackendNodeType,
  handleId: string | null | undefined,
  handleDirection: "source" | "target",
): HandleKind {
  const id = handleId ?? "";

  if (id === "llm_out" || id.startsWith("llm_out")) return "llm-out";
  if (id === "llm_in" || id.startsWith("llm_in")) return "llm-in";

  if (nodeType === "llm") {
    if (handleDirection === "source") return "llm-out";
    if (handleDirection === "target") return "llm-in";
  }

  if (nodeType === "langgraph_step") {
    if (id === "llm_in") return "llm-in";
    if (handleDirection === "target") return "step-in";
    if (handleDirection === "source") return "step-out";
  }

  if (nodeType === "langgraph") {
    if (
      id === "types-in" ||
      id.startsWith("types-in") ||
      id === "type-in" ||
      id.startsWith("type-in")
    ) {
      return "type-in";
    }
    if (
      id === "input-start" ||
      id.startsWith("langgraph-in-") ||
      id.startsWith("route-in-")
    )
      return "langgraph-in";
    if (
      id === "output-end" ||
      id.startsWith("langgraph-out-") ||
      id.startsWith("route-out-") ||
      id.startsWith("channel-out-")
    )
      return "langgraph-out";
    if (handleDirection === "target") return "langgraph-in";
    if (handleDirection === "source") return "langgraph-out";
  }

  if (id.startsWith("route-in-")) return "langgraph-in";
  if (id.startsWith("route-out-") || id.startsWith("channel-out-"))
    return "langgraph-out";

  if (nodeType === "entity" || nodeType === "redis_schema") {
    if (id.startsWith("source-")) return "entity-column-source";
    if (id.startsWith("target-")) return "entity-column-target";
    if (handleDirection === "target") return "entity-top-target";
    if (handleDirection === "source") return "entity-bottom-source";
  }

  if (
    id.startsWith("endpoint-in-") ||
    id.startsWith("endpoints-in-") ||
    id.startsWith("routeEndpoints-in-")
  )
    return "endpoint-in";
  if (
    id.startsWith("endpoint-out-") ||
    id.startsWith("endpoints-out-") ||
    id.startsWith("routeEndpoints-out-")
  )
    return "endpoint-out";

  if (
    nodeType === "service" ||
    nodeType === "serverless" ||
    nodeType === "api_gateway" ||
    nodeType === "webhook"
  ) {
    if (id.startsWith("func-in-") || id.startsWith("func-")) {
      return handleDirection === "source" ? "endpoint-out" : "endpoint-in";
    }
    if (id.startsWith("func-out-")) {
      return "endpoint-out";
    }
    if (!id) {
      return handleDirection === "source" ? "endpoint-out" : "endpoint-in";
    }
  }
  if (id.startsWith("events-")) return "event-source";
  if (id.startsWith("event-in-") || id.startsWith("action-in-"))
    return "action-target";
  if (id.startsWith("pageload-in-")) return "pageload-in";
  if (id.startsWith("sse-in-")) return "sse-in";
  if (id.startsWith("websocket-in-") || id.startsWith("ws-in-"))
    return "websocket-in";
  if (id.startsWith("publishedEvents-out-")) return "published-event-out";
  if (id.startsWith("consumedEvents-in-")) return "consumed-event-in";
  if (id.startsWith("consumedEvents-out-")) return "consumed-event-out";

  const resourceMatchRegex = new RegExp(
    `^(${[...MESSAGING_RESOURCE_TYPES, "bucket", "topic", "stream", "queue", "channel", "cache"].join("|")}):(in|out):(.+)$`,
  );
  const resourceMatch = id.match(resourceMatchRegex);
  if (resourceMatch) {
    const direction = resourceMatch[2];
    return direction === "in" ? "resource-def-in" : "resource-def-out";
  }

  if (
    id === "storage-ref-header" ||
    id.startsWith("storage-ref-header")
  ) {
    return "resource-def-in";
  }

  if (
    nodeType === "storage_operation_ref" ||
    nodeType === "storage_ref" ||
    nodeType === "bucket_ref" ||
    nodeType === "storage_bucket_ref" ||
    nodeType === "StorageBucketRefNode" ||
    nodeType === "StorageOperationRefNode"
  ) {
    if (id === "storage-ref-header" || id.startsWith("storage-ref-header")) {
      return "resource-def-in";
    }
    if (handleDirection === "source" || id.startsWith("func-out-")) {
      return "resource-def-out";
    }
    if (id.startsWith("func-") || id.startsWith("func-in-") || handleDirection === "target") {
      return "action-target";
    }
  }

  if (
    id === "storage-target" ||
    id.startsWith("storage-target") ||
    id === "storage-in"
  ) {
    return "resource-def-in";
  }
  if (
    id === "storage-source" ||
    id.startsWith("storage-source") ||
    id === "storage-out"
  ) {
    return "resource-def-out";
  }

  if (id === "auth-out" || id.startsWith("auth-out")) return "auth-out";
  if (id === "auth-in" || id.startsWith("auth-in")) return "auth-in";
  if (id === "injects-plugin-out" || id.startsWith("injects-plugin-out"))
    return "injects-plugin-out";
  if (id === "payments-plugin-in" || id.startsWith("payments-plugin-in"))
    return "payments-plugin-in";
  if (id === "page-out" || id.startsWith("page-out-")) return "page-out";
  if (id === "page-in" || id.startsWith("page-in")) return "page-in";
  if (id === "page-ref-in" || id.startsWith("page-ref-in")) return "page-ref-in";
  if (nodeType === "page_ref" && handleDirection === "target") return "page-ref-in";
  if (nodeType === "webApp") {
    if (id === "auth-in" || id.startsWith("auth-in")) {
      return handleDirection === "source" ? "auth-out" : "auth-in";
    }
    if (
      id === "types-in" ||
      id.startsWith("types-in") ||
      id === "type-in" ||
      id.startsWith("type-in") ||
      id === "web-app-in"
    ) {
      return "type-in";
    }
    return handleDirection === "source" ? "page-out" : "page-section-in";
  }

  // --- Transformers and Transformer Refs ---
  if (id === "transformer-in" || id.startsWith("transformer-in")) {
    return "transformer-in";
  }
  if (id === "transformer-out" || id.startsWith("transformer-out")) {
    return "transformer-out";
  }
  if (nodeType === "transformer" || nodeType === "transformer_ref") {
    return handleDirection === "target" ? "transformer-in" : "transformer-out";
  }

  // --- Hooks and Hook Refs ---
  if (id === "hook-in" || id.startsWith("hook-in") || id.startsWith("hooks-in")) {
    return "hook-in";
  }
  if (id === "hook-out" || id.startsWith("hook-out") || id.startsWith("hooks-out")) {
    return "hook-out";
  }
  if (nodeType === "hook" || nodeType === "hook_ref") {
    return handleDirection === "target" ? "hook-in" : "hook-out";
  }

  // --- Custom Types ---
  if (
    id === "type-in" ||
    id.startsWith("type-in") ||
    id.startsWith("types-in") ||
    id === "service-in" ||
    id === "web-app-in"
  ) {
    return "type-in";
  }
  if (id === "type-out" || id.startsWith("type-out") || id.startsWith("types-out")) {
    return "type-out";
  }
  if (nodeType === "types") {
    return handleDirection === "target" ? "type-in" : "type-out";
  }

  // --- Components and Component Refs ---
  if (
    id === "component-in" ||
    id.startsWith("component-in") ||
    id.startsWith("components-in") ||
    id.startsWith("slot-in")
  ) {
    return "component-in";
  }
  if (
    id === "component-out" ||
    id.startsWith("component-out") ||
    id.startsWith("components-out") ||
    id.startsWith("slot-out")
  ) {
    return "component-out";
  }

  // --- State Store ---
  if (
    id === "store-in" ||
    id.startsWith("store-in") ||
    id.startsWith("store-field-in") ||
    id === "populate-in" ||
    id.startsWith("populate-in") ||
    id === "mutate-in" ||
    id.startsWith("mutate-in") ||
    id === "reset-in" ||
    id.startsWith("reset-in") ||
    id.startsWith("store-action-in")
  ) {
    return "store-in";
  }
  if (
    id === "store-out" ||
    id.startsWith("store-out") ||
    id.startsWith("store-field-out") ||
    id === "state-out" ||
    id.startsWith("state-out") ||
    id === "populate-out" ||
    id.startsWith("populate-out") ||
    id === "mutate-out" ||
    id.startsWith("mutate-out") ||
    id === "reset-out" ||
    id.startsWith("reset-out") ||
    id.startsWith("store-action-out")
  ) {
    return "store-out";
  }
  if (nodeType === "state_store" || nodeType === "browser_storage") {
    return handleDirection === "target" ? "store-in" : "store-out";
  }

  // --- WebPage Section State Subscriptions ---
  if (
    id.startsWith("section-state-in-") ||
    id.startsWith("store-state-in") ||
    id.startsWith("state-in-")
  ) {
    return handleDirection === "source" ? "store-out" : "page-section-in";
  }

  if (
    id.endsWith("-in") ||
    id.startsWith("public-in") ||
    id.startsWith("private-in") ||
    id.startsWith("role-in") ||
    id.startsWith("payment-in") ||
    id.startsWith("org-in") ||
    id.startsWith("zone-") ||
    id.startsWith("pageload-in") ||
    id.startsWith("event-in") ||
    id.startsWith("action-in") ||
    id.startsWith("sse-in") ||
    id.startsWith("websocket-in") ||
    id.startsWith("ws-in") ||
    id.startsWith("webrtc-in")
  ) {
    if (handleDirection === "source") return "page-out";
    if (handleDirection === "target") {
      if (id.startsWith("pageload-in")) return "pageload-in";
      return "page-section-in";
    }
  }

  if (id.startsWith("index-in-")) return "index-in";
  if (id.startsWith("index-out-")) return "index-out";

  if (
    nodeType === "database" ||
    nodeType === "redis_instance" ||
    nodeType === "db_ref" ||
    nodeType === "vector_db_ref" ||
    nodeType === "redis-cache"
  ) {
    if (id.startsWith("database-target") || handleDirection === "target")
      return "database-target";
    if (id.startsWith("database-source") || handleDirection === "source")
      return "database-source";
  }

  if (MESSAGING_NODE_TYPES.some((t) => t === nodeType)) {
    if (handleDirection === "target") return "resource-def-in";
    if (handleDirection === "source") return "resource-def-out";
  }

  return "unknown";
}

export function getEdgeType(
  sourceKind: HandleKind,
  targetKind: HandleKind,
): string {
  const key = `${sourceKind}→${targetKind}`;
  return EDGE_TYPE_MAP[key] ?? "connection";
}

/**
 * Meaningfully parses and normalizes a WebClient page label into a clean,
 * valid Next.js App Router route slug and folder path (no spaces, URL/filesystem safe).
 *
 * It guarantees:
 * 1. No spaces (replaced with hyphens `-`)
 * 2. No disallowed filesystem/URL characters
 * 3. Strips leading/trailing slashes so it can safely form Next.js folder paths (`app/(group)/<slug>/page.tsx`)
 * 4. Preserves valid dynamic segments like `[id]`, `[...slug]`
 * 5. Returns `"/"` for explicit root/landing page
 *
 * Examples:
 * - "Page Client" -> "page-client"
 * - "User Profile" -> "user-profile"
 * - "/dashboard/user settings/" -> "dashboard/user-settings"
 * - "Landing Page" -> "landing-page"
 * - "/" -> "/"
 * - "users/[id]" -> "users/[id]"
 */
export function parsePageRoute(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  // Strip query string if present before folder route parsing
  const qIndex = trimmed.indexOf("?");
  const pathPart = qIndex >= 0 ? trimmed.slice(0, qIndex).trim() : trimmed;
  if (pathPart === "") return "";
  if (pathPart === "/") return "/";

  // Split into segments in case of nested paths (e.g. "dashboard/user profile")
  const segments = pathPart
    .split("/")
    .map((seg) => {
      const segTrimmed = seg.trim();
      if (!segTrimmed) return "";

      // Allow dynamic route segments like [id], [...slug], [[...slug]]
      const isDynamic =
        /^\[\[?\.\.\.[a-zA-Z0-9_-]+\]?\]$|^\[[a-zA-Z0-9_-]+\]$/.test(
          segTrimmed,
        );
      if (isDynamic) {
        return segTrimmed;
      }

      return segTrimmed
        .toLowerCase()
        // Replace spaces and underscores with hyphens
        .replace(/[\s_]+/g, "-")
        // Remove disallowed route folder characters (keep alphanumeric, hyphens, and dynamic brackets)
        .replace(/[^a-z0-9\-[\]]/g, "")
        // Collapse consecutive hyphens
        .replace(/-+/g, "-")
        // Trim leading and trailing hyphens in segment
        .replace(/^-+|-+$/g, "");
    })
    .filter(Boolean);

  if (segments.length === 0) return "/";

  const cleanPath = segments.join("/");
  return pathPart.startsWith("/") ? `/${cleanPath}` : cleanPath;
}

export interface ParsedRouteWithParams {
  route: string;
  extractedPathParams: Parameter[];
  extractedQueryParams: Parameter[];
}

/**
 * Parses a page route string that may include dynamic segments (e.g. /c/[id])
 * and/or query parameters (e.g. ?limit=10&offset=20).
 * Extracts clean route path, dynamic path params, and query params.
 */
export function parseRouteWithQueryParams(raw: string): ParsedRouteWithParams {
  if (!raw) {
    return { route: "", extractedPathParams: [], extractedQueryParams: [] };
  }
  const trimmed = raw.trim();
  const qIndex = trimmed.indexOf("?");
  const pathPart = qIndex >= 0 ? trimmed.slice(0, qIndex).trim() : trimmed;
  const queryPart = qIndex >= 0 ? trimmed.slice(qIndex + 1).trim() : "";

  const route = parsePageRoute(pathPart);

  // Extract dynamic route segments: [id], [...slug], [[...slug]]
  const extractedPathParams: Parameter[] = [];
  const dynamicParamMatches = route.matchAll(/\[\[?\.\.\.([a-zA-Z0-9_-]+)\]?\]|\[([a-zA-Z0-9_-]+)\]/g);
  const seenPathParams = new Set<string>();

  for (const match of dynamicParamMatches) {
    const paramName = match[1] || match[2];
    if (paramName && !seenPathParams.has(paramName)) {
      seenPathParams.add(paramName);
      extractedPathParams.push({
        id: `param-${paramName}`,
        name: paramName,
        type: "string",
        required: true,
      });
    }
  }

  // Extract query parameters
  const extractedQueryParams: Parameter[] = [];
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    const seenQueryParams = new Set<string>();

    searchParams.forEach((val, key) => {
      const cleanKey = key.trim();
      if (cleanKey && !seenQueryParams.has(cleanKey)) {
        seenQueryParams.add(cleanKey);
        let paramType = "string";
        if (!isNaN(Number(val)) && val.trim() !== "") {
          paramType = "number";
        } else if (val === "true" || val === "false") {
          paramType = "boolean";
        }

        extractedQueryParams.push({
          id: `query-${cleanKey}`,
          name: cleanKey,
          type: paramType,
          defaultValue: val,
          required: false,
        });
      }
    });
  }

  return {
    route,
    extractedPathParams,
    extractedQueryParams,
  };
}

/**
 * Returns the relative folder path under `app/(group)/` for Next.js App Router.
 * - "/" or "home" or "index" -> "" (maps to app/(group)/page.tsx)
 * - "page-client" -> "page-client" (maps to app/(group)/page-client/page.tsx)
 * - "dashboard/user-settings" -> "dashboard/user-settings"
 */
export function pageRouteToFolderPath(routeOrLabel: string): string {
  const parsed = parsePageRoute(routeOrLabel);
  const lower = parsed.toLowerCase();
  if (lower === "/") {
    return "";
  }
  return parsed.replace(/^\/+|\/+$/g, "");
}

/**
 * Returns the URL path for browser navigation or preview iframe.
 * - "/" or "home" -> "/"
 * - "page-client" -> "/page-client"
 * - "dashboard/user-settings" -> "/dashboard/user-settings"
 */
export function pageRouteToUrl(routeOrLabel: string): string {
  const folder = pageRouteToFolderPath(routeOrLabel);
  return folder ? `/${folder}` : "/";
}

/**
 * Computes the final compiled page route including query parameters.
 * - For layouts: returns "layout"
 * - For routes without query parameters: returns e.g. "/c/[id]"
 * - For routes with query parameters: returns e.g. "/c/[id]?limit=20&offset=0"
 */
export function computeCompiledPageRoute({
  label,
  pathParams = [],
  queryParams = [],
  isLayout = false,
}: {
  label?: string;
  pathParams?: Array<{ name?: string; key?: string }>;
  queryParams?: Array<{ name?: string; key?: string; defaultValue?: string | number | boolean | null }>;
  isLayout?: boolean;
}): string {
  if (isLayout) {
    return "layout";
  }
  const cleanLabel = (label || "").trim();
  let baseRoute = pageRouteToUrl(cleanLabel);

  // Ensure all non-empty path parameters are represented in the base route path
  if (pathParams && pathParams.length > 0) {
    pathParams.forEach((p) => {
      const name = (p.name || p.key || "").trim();
      if (name && !baseRoute.includes(`[${name}]`) && !baseRoute.includes(`[...${name}]`)) {
        if (baseRoute === "/" || baseRoute === "") {
          baseRoute = `/[${name}]`;
        } else {
          baseRoute = `${baseRoute.replace(/\/+$/, "")}/[${name}]`;
        }
      }
    });
  }

  const validQueryParams = (queryParams || []).filter(
    (p) => p && typeof (p.name || p.key) === "string" && (p.name || p.key)!.trim().length > 0,
  );

  if (validQueryParams.length === 0) {
    return baseRoute;
  }

  const queryParts = validQueryParams.map((p) => {
    const k = (p.name || p.key)!.trim();
    const v = p.defaultValue !== undefined && p.defaultValue !== null ? String(p.defaultValue).trim() : "";
    if (v.length > 0) {
      return `${k}=${v}`;
    }
    return k;
  });

  return `${baseRoute}?${queryParts.join("&")}`;
}

/**
 * Synchronizes a page route URL with an updated list of path parameters.
 * When a user renames, adds, or deletes a path param in the Path Params editor,
 * this function updates the bracketed dynamic segments in the route URL.
 *
 * Examples:
 * - "/c/[id]" with "id" renamed to "userId" -> "/c/[userId]"
 * - "/docs/[...slug]" with "slug" renamed to "path" -> "/docs/[...path]"
 * - "/c/[id]" with "id" removed -> "/c"
 * - "/c" or "c" with "id" added -> "/c/[id]"
 */
export function syncRouteWithUpdatedPathParams({
  currentRoute,
  oldPathParams = [],
  newPathParams = [],
  isLayout = false,
}: {
  currentRoute: string;
  oldPathParams?: Array<{ id?: string; name?: string; key?: string }>;
  newPathParams?: Array<{ id?: string; name?: string; key?: string }>;
  isLayout?: boolean;
}): string {
  if (isLayout || !currentRoute) {
    return currentRoute || "/";
  }

  let route = currentRoute.trim();
  if (route.toLowerCase() === "layout") {
    return route;
  }

  // 1. Handle renamed parameters (matched by parameter id)
  newPathParams.forEach((newP) => {
    const oldP = oldPathParams.find((op) => op.id && newP.id && op.id === newP.id);
    const newName = (newP.name || newP.key || "").trim();
    if (oldP) {
      const oldName = (oldP.name || oldP.key || "").trim();
      if (oldName && newName && oldName !== newName) {
        // Replace regular dynamic segment [oldName] with [newName]
        const bracketOld = `[${oldName}]`;
        const bracketNew = `[${newName}]`;
        if (route.includes(bracketOld)) {
          route = route.split(bracketOld).join(bracketNew);
        }

        // Replace catch-all segment [...oldName] with [...newName]
        const catchAllOld = `[...${oldName}]`;
        const catchAllNew = `[...${newName}]`;
        if (route.includes(catchAllOld)) {
          route = route.split(catchAllOld).join(catchAllNew);
        }
      }
    }
  });

  // 2. Handle removed parameters (existed in oldPathParams, removed in newPathParams)
  oldPathParams.forEach((oldP) => {
    const stillExists = newPathParams.some(
      (np) => (oldP.id && np.id && oldP.id === np.id) || (oldP.name && np.name && oldP.name === np.name),
    );
    if (!stillExists) {
      const oldName = (oldP.name || oldP.key || "").trim();
      if (oldName) {
        // Remove catch-all or regular param segments
        route = route.replace(new RegExp(`/\\[\\.\\.\\.${escapeRegexForRoute(oldName)}\\]`, "g"), "");
        route = route.replace(new RegExp(`\\[\\.\\.\\.${escapeRegexForRoute(oldName)}\\]`, "g"), "");
        route = route.replace(new RegExp(`/\\[${escapeRegexForRoute(oldName)}\\]`, "g"), "");
        route = route.replace(new RegExp(`\\[${escapeRegexForRoute(oldName)}\\]`, "g"), "");
      }
    }
  });

  // 3. Ensure all non-empty parameters in newPathParams are present in the route
  newPathParams.forEach((newP) => {
    const newName = (newP.name || newP.key || "").trim();
    if (newName) {
      const bracketSegment = `[${newName}]`;
      const catchAllSegment = `[...${newName}]`;
      if (!route.includes(bracketSegment) && !route.includes(catchAllSegment)) {
        if (route === "/" || route === "") {
          route = `/${bracketSegment}`;
        } else {
          route = `${route.replace(/\/+$/, "")}/${bracketSegment}`;
        }
      }
    }
  });

  // Clean up any double slashes or trailing slashes (unless root "/")
  route = route.replace(/\/+/g, "/");
  if (route.length > 1 && route.endsWith("/")) {
    route = route.slice(0, -1);
  }
  if (!route || route === "") {
    route = "/";
  }

  // Ensure leading slash for non-layout routes
  if (route !== "layout" && !route.startsWith("/")) {
    route = `/${route}`;
  }

  return route;
}

function escapeRegexForRoute(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes a page route so that "/<route>" and "<route>" are identical.
 * Canonical format always starts with "/" unless it's "layout".
 * - "login" -> "/login"
 * - "/login" -> "/login"
 * - "/" or "" or "home" or "index" -> "/"
 * - "dashboard/user-settings" -> "/dashboard/user-settings"
 * - "/dashboard/user-settings" -> "/dashboard/user-settings"
 * - "layout" -> "layout"
 */
export function normalizePageRoute(raw: string): string {
  if (!raw) return "/";
  const trimmed = raw.trim();
  if (trimmed.toLowerCase() === "layout" || trimmed.toLowerCase() === "/layout") return "layout";
  const parsed = parsePageRoute(trimmed);
  const unslashed = (parsed || "").replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!parsed || parsed === "/" || unslashed === "home" || unslashed === "index") {
    return "/";
  }
  return parsed.startsWith("/") ? parsed : `/${parsed}`;
}

/**
 * Checks if two page route strings point to the same route.
 * Treats "/<route>" and "<route>" as identical.
 */
export function arePageRoutesEqual(routeA: string, routeB: string): boolean {
  return normalizePageRoute(routeA) === normalizePageRoute(routeB);
}

/**
 * Normalizes an endpoint route path by replacing whitespace with hyphens,
 * matching compiler endpoint path transformation (e.g. "send msg" -> "send-msg", "/send msg" -> "/send-msg").
 */
export function formatEndpointRoute(route: string): string {
  if (!route) return "";
  return route.replace(/\s+/g, "-");
}

/**
 * Deduplicates dynamic path parameter placeholders (e.g. ":id", "{id}", "[id]") within a route URL path.
 * If a parameter placeholder name appears multiple times (e.g. "/users/:id/posts/:id" or "send-message/:id/:id"),
 * subsequent duplicate placeholders are omitted to maintain valid routing syntax.
 * If a query string is attached, query parameters that duplicate path parameters or appear multiple times are also cleaned.
 */
export function deduplicateEndpointRoutePathParams(route: string): string {
  if (!route) return "";

  const qIdx = route.indexOf("?");
  const pathPart = qIdx >= 0 ? route.slice(0, qIdx) : route;
  const queryPart = qIdx >= 0 ? route.slice(qIdx + 1) : "";

  const hasLeadingSlash = pathPart.startsWith("/");
  const hasTrailingSlash = pathPart.length > 1 && pathPart.endsWith("/");

  const rawSegments = pathPart.split("/").filter((s, idx) => {
    if (idx === 0 && s === "") return true;
    return s !== "";
  });

  const seenPathParams = new Set<string>();
  const cleanedSegments: string[] = [];

  for (const seg of rawSegments) {
    if (seg === "" && cleanedSegments.length === 0 && hasLeadingSlash) {
      cleanedSegments.push("");
      continue;
    }

    const colonMatch = /^:([a-zA-Z_][a-zA-Z0-9_]*)$/.exec(seg);
    const braceMatch = /^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/.exec(seg);
    const bracketMatch = /^\[\[?\.\.\.?([a-zA-Z_][a-zA-Z0-9_]*)\]?\]$|^\[([a-zA-Z_][a-zA-Z0-9_]*)\]$/.exec(seg);

    const paramName = colonMatch?.[1] || braceMatch?.[1] || bracketMatch?.[1] || bracketMatch?.[2];

    if (paramName) {
      const lower = paramName.toLowerCase();
      if (seenPathParams.has(lower)) {
        continue;
      }
      seenPathParams.add(lower);
      cleanedSegments.push(seg);
    } else {
      cleanedSegments.push(seg);
    }
  }

  let resultPath = cleanedSegments.join("/");
  if (hasLeadingSlash && !resultPath.startsWith("/")) {
    resultPath = `/${resultPath}`;
  }
  if (hasTrailingSlash && !resultPath.endsWith("/") && resultPath !== "/") {
    resultPath = `${resultPath}/`;
  }
  if (!resultPath && hasLeadingSlash) {
    resultPath = "/";
  }

  if (qIdx >= 0) {
    const cleanedQuery = formatEndpointQueryString(extractEndpointQueryParams(queryPart), {
      excludeNames: Array.from(seenPathParams),
    });
    return cleanedQuery ? `${resultPath}${cleanedQuery}` : resultPath;
  }

  return resultPath;
}

/**
 * Sanitizes an endpoint route for persistence (e.g. on blur/save),
 * trimming whitespace, replacing internal spaces with hyphens, and deduplicating dynamic path parameters.
 */
export function sanitizeEndpointRoute(route: string): string {
  if (!route) return "";
  const formatted = route.trim().replace(/\s+/g, "-");
  return deduplicateEndpointRoutePathParams(formatted);
}

/**
 * Extracts path parameter placeholder names from an endpoint route string.
 * Supports Express style (:id), OpenAPI style ({id}), and bracket style ([id]).
 * Automatically ignores port numbers (e.g. :8080 or :3000) by requiring names
 * to start with a letter or underscore.
 *
 * Examples:
 * - "send-message/:hello" -> ["hello"]
 * - "/api/orgs/:orgId/users/:userId" -> ["orgId", "userId"]
 * - "/items/{itemId}" -> ["itemId"]
 */
export function extractEndpointPathParams(route: string): string[] {
  if (!route) return [];
  const matches = new Set<string>();

  const qIdx = route.indexOf("?");
  let pathname = qIdx >= 0 ? route.slice(0, qIdx) : route;

  try {
    if (pathname.includes("://")) {
      const parsed = new URL(pathname);
      pathname = parsed.pathname;
    }
  } catch {
    pathname = pathname.replace(/^[a-zA-Z]+:\/\/[^/]+/, "");
  }

  // 1. Colon params: :paramName (must start with letter or underscore)
  const colonRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = colonRegex.exec(pathname)) !== null) {
    if (m[1]) matches.add(m[1]);
  }

  // 2. Brace params: {paramName}
  const braceRegex = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
  while ((m = braceRegex.exec(pathname)) !== null) {
    if (m[1]) matches.add(m[1]);
  }

  // 3. Bracket params: [paramName] or [...paramName]
  const bracketRegex = /\[\[?\.\.\.?([a-zA-Z_][a-zA-Z0-9_]*)\]?\]|\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g;
  while ((m = bracketRegex.exec(pathname)) !== null) {
    const name = m[1] || m[2];
    if (name) matches.add(name);
  }

  return Array.from(matches);
}

/**
 * Extracts query parameters from a query string (or endpoint route with '?').
 */
export function extractEndpointQueryParams(queryOrRoute: string): Parameter[] {
  if (!queryOrRoute) return [];
  const qIdx = queryOrRoute.indexOf("?");
  let queryPart = "";
  if (qIdx >= 0) {
    queryPart = queryOrRoute.slice(qIdx + 1).trim();
  } else if (!queryOrRoute.includes("/") && queryOrRoute.includes("=")) {
    queryPart = queryOrRoute.trim();
  } else {
    return [];
  }
  if (!queryPart) return [];

  const searchParams = new URLSearchParams(queryPart);
  const extractedQueryParams: Parameter[] = [];
  const seenQueryParams = new Set<string>();

  searchParams.forEach((val, key) => {
    const cleanKey = key.trim();
    if (cleanKey && !seenQueryParams.has(cleanKey.toLowerCase())) {
      seenQueryParams.add(cleanKey.toLowerCase());
      let paramType = "string";
      if (!isNaN(Number(val)) && val.trim() !== "") {
        paramType = "number";
      } else if (val === "true" || val === "false") {
        paramType = "boolean";
      }

      extractedQueryParams.push({
        id: `query-${cleanKey}`,
        name: cleanKey,
        type: paramType,
        defaultValue: val,
        required: false,
      });
    }
  });

  return extractedQueryParams;
}

/**
 * Parses an endpoint route string which may include dynamic path params (e.g. :hello or {hello})
 * and/or query parameters (e.g. ?limit=10&sort=asc).
 * Returns the sanitized route pathname (without query string) and the extracted path and query parameters.
 */
export function parseEndpointRouteWithParams(raw: string): {
  route: string;
  extractedPathParams: Parameter[];
  extractedQueryParams: Parameter[];
} {
  if (!raw) {
    return { route: "", extractedPathParams: [], extractedQueryParams: [] };
  }
  const trimmed = raw.trim();
  const qIndex = trimmed.indexOf("?");
  const pathPart = qIndex >= 0 ? trimmed.slice(0, qIndex).trim() : trimmed;
  const queryPart = qIndex >= 0 ? trimmed.slice(qIndex + 1).trim() : "";

  const route = sanitizeEndpointRoute(pathPart);
  const pathParamNames = extractEndpointPathParams(route);
  const pathNameSet = new Set(pathParamNames.map((n) => n.toLowerCase()));
  const extractedPathParams: Parameter[] = pathParamNames.map((name) => ({
    id: `param-${name}`,
    name,
    type: "string",
    required: true,
  }));

  const extractedQueryParams = extractEndpointQueryParams(queryPart).filter(
    (q) => !pathNameSet.has((q.name || "").trim().toLowerCase()),
  );

  return {
    route,
    extractedPathParams,
    extractedQueryParams,
  };
}

/**
 * Synchronizes an endpoint route URL with an updated list of path parameters.
 * When a user adds, renames, or deletes a path param in the Path Params editor,
 * this function updates the `:paramName` segments in the route string.
 *
 * Examples:
 * - "send-message" with param "hello" added -> "send-message/:hello"
 * - "/send-message" with param "hello" added -> "/send-message/:hello"
 * - "/api/users/:id" with "id" renamed to "userId" -> "/api/users/:userId"
 * - "/api/users/:id" with "id" removed -> "/api/users"
 * - "" with param "id" added -> "/:id"
 */
export function syncEndpointRouteWithPathParams({
  currentRoute,
  oldPathParams = [],
  newPathParams = [],
}: {
  currentRoute: string;
  oldPathParams?: Array<{ id?: string; name?: string; key?: string }>;
  newPathParams?: Array<{ id?: string; name?: string; key?: string }>;
}): string {
  let route = (currentRoute || "").trim();

  // Separate query string if present
  const qIndex = route.indexOf("?");
  const pathPart = qIndex >= 0 ? route.slice(0, qIndex).trim() : route;
  const queryPart = qIndex >= 0 ? route.slice(qIndex).trim() : "";

  let updatedPath = pathPart;

  // 1. Handle renamed parameters (matched by parameter id)
  newPathParams.forEach((newP) => {
    const oldP = oldPathParams.find((op) => op.id && newP.id && op.id === newP.id);
    const newName = (newP.name || newP.key || "").trim();
    if (oldP) {
      const oldName = (oldP.name || oldP.key || "").trim();
      if (oldName && newName && oldName !== newName) {
        const escapedOld = escapeRegexForRoute(oldName);
        updatedPath = updatedPath.replace(new RegExp(`:${escapedOld}\\b`, "g"), `:${newName}`);
        updatedPath = updatedPath.replace(new RegExp(`\\{${escapedOld}\\}`, "g"), `:${newName}`);
        updatedPath = updatedPath.replace(new RegExp(`\\[${escapedOld}\\]`, "g"), `:${newName}`);
      }
    }
  });

  // 2. Handle removed parameters (existed in oldPathParams, removed in newPathParams)
  oldPathParams.forEach((oldP) => {
    const stillExists = newPathParams.some((np) => {
      const sameId = Boolean(oldP.id && np.id && oldP.id === np.id);
      const sameName = Boolean(
        (oldP.name || oldP.key)?.trim() &&
        (np.name || np.key)?.trim() &&
        (oldP.name || oldP.key)!.trim().toLowerCase() === (np.name || np.key)!.trim().toLowerCase()
      );
      return sameId || sameName;
    });

    if (!stillExists) {
      const oldName = (oldP.name || oldP.key || "").trim();
      if (oldName) {
        const escapedOld = escapeRegexForRoute(oldName);
        updatedPath = updatedPath.replace(new RegExp(`/+:${escapedOld}\\b`, "g"), "");
        updatedPath = updatedPath.replace(new RegExp(`:${escapedOld}\\b`, "g"), "");
        updatedPath = updatedPath.replace(new RegExp(`/+\\{${escapedOld}\\}`, "g"), "");
        updatedPath = updatedPath.replace(new RegExp(`\\{${escapedOld}\\}`, "g"), "");
        updatedPath = updatedPath.replace(new RegExp(`/+\\[${escapedOld}\\]`, "g"), "");
        updatedPath = updatedPath.replace(new RegExp(`\\[${escapedOld}\\]`, "g"), "");
      }
    }
  });

  // 3. Ensure all non-empty parameters in newPathParams are present in the route (deduplicated)
  const seenParamNames = new Set<string>();
  extractEndpointPathParams(updatedPath).forEach((n) => seenParamNames.add(n.toLowerCase()));

  newPathParams.forEach((newP) => {
    const newName = (newP.name || newP.key || "").trim();
    if (newName) {
      const lower = newName.toLowerCase();
      if (seenParamNames.has(lower)) {
        return;
      }
      seenParamNames.add(lower);

      const escapedNew = escapeRegexForRoute(newName);
      const hasParam =
        new RegExp(`:${escapedNew}\\b`).test(updatedPath) ||
        new RegExp(`\\{${escapedNew}\\}`).test(updatedPath) ||
        new RegExp(`\\[${escapedNew}\\]`).test(updatedPath);

      if (!hasParam) {
        if (!updatedPath || updatedPath === "") {
          updatedPath = `/:${newName}`;
        } else if (updatedPath === "/") {
          updatedPath = `/:${newName}`;
        } else if (updatedPath.endsWith("/")) {
          updatedPath = `${updatedPath}:${newName}`;
        } else {
          updatedPath = `${updatedPath}/:${newName}`;
        }
      }
    }
  });

  // Clean up any double slashes and deduplicate dynamic segments
  updatedPath = deduplicateEndpointRoutePathParams(updatedPath.replace(/\/+/g, "/"));

  // Clean up trailing slash if not root "/"
  if (updatedPath.length > 1 && updatedPath.endsWith("/")) {
    updatedPath = updatedPath.slice(0, -1);
  }

  return updatedPath + queryPart;
}

/**
 * Reconciles the pathParams array when an endpoint route string is edited.
 * - Extracts parameter names from newRoute (e.g. ":id", "{orgId}").
 * - Preserves existing Parameter configurations (id, type, defaultValue, required, description).
 * - If an old parameter was removed from the route string (present in oldRoute but not newRoute), removes it.
 * - Renames a parameter if a single param was renamed in place.
 * - Adds new Parameter objects for newly added placeholders.
 * - Deduplicates parameter names so duplicate path parameters are prevented.
 */
export function reconcileEndpointPathParams({
  currentPathParams = [],
  newRoute,
  oldRoute,
  idGenerator,
}: {
  currentPathParams?: Parameter[];
  newRoute: string;
  oldRoute?: string;
  idGenerator?: () => string;
}): Parameter[] {
  const newNames = extractEndpointPathParams(newRoute);
  const oldNames = oldRoute ? extractEndpointPathParams(oldRoute) : [];

  let result = [...currentPathParams];

  // If a single old param was replaced by a single new param (e.g. :id -> :userId), rename it
  let renamedOldName: string | null = null;
  const firstOld = oldNames[0];
  const firstNew = newNames[0];
  if (oldNames.length === 1 && newNames.length === 1 && firstOld && firstNew && firstOld !== firstNew) {
    const oldName = firstOld.toLowerCase();
    const newName = firstNew;
    renamedOldName = oldName;
    result = result.map((p) => {
      if (p.name && p.name.trim().toLowerCase() === oldName) {
        return { ...p, name: newName };
      }
      return p;
    });
  }

  const removedNames = new Set(
    oldNames
      .filter(
        (name) =>
          name.toLowerCase() !== renamedOldName &&
          !newNames.some((n) => n.toLowerCase() === name.toLowerCase()),
      )
      .map((n) => n.toLowerCase()),
  );

  result = result.filter(
    (p) => !p.name || !removedNames.has(p.name.trim().toLowerCase()),
  );

  // Ensure all newNames exist in result
  const makeId = idGenerator || (() => `param-${Math.random().toString(36).substring(2, 9)}`);
  newNames.forEach((name) => {
    const exists = result.some((p) => p.name && p.name.trim().toLowerCase() === name.toLowerCase());
    if (!exists) {
      result.push({
        id: makeId(),
        name,
        type: "string",
        required: true,
      });
    }
  });

  // Deduplicate result to ensure no duplicate names exist in pathParams
  const seenNames = new Set<string>();
  result = result.filter((p) => {
    const name = (p.name || "").trim().toLowerCase();
    if (!name) return true;
    if (seenNames.has(name)) return false;
    seenNames.add(name);
    return true;
  });

  return result;
}

/**
 * Formats endpoint query parameters into a standard query string pattern
 * with keys and their default values (e.g. "?key=defaultvalue&key2=&key3=value").
 * Deduplicates repeated query parameter keys and filters out any keys present in options.excludeNames (e.g. path params).
 */
export function formatEndpointQueryString(
  queryParams?: Parameter[] | Array<{ name?: string; defaultValue?: string }>,
  options?: {
    excludeNames?: string[];
  },
): string {
  const disallowed = new Set(
    (options?.excludeNames || [])
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n.length > 0),
  );

  const seenKeys = new Set<string>();
  const validQueryParams = (queryParams || []).filter((p) => {
    if (!p || typeof p.name !== "string") return false;
    const trimmed = p.name.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (seenKeys.has(lower)) return false;
    if (disallowed.has(lower)) return false;
    seenKeys.add(lower);
    return true;
  });

  if (validQueryParams.length === 0) {
    return "";
  }

  const queryParts = validQueryParams.map((p) => {
    const k = p.name!.trim();
    const v =
      p.defaultValue !== undefined && p.defaultValue !== null
        ? String(p.defaultValue).trim()
        : "";
    return `${k}=${v}`;
  });

  return `?${queryParts.join("&")}`;
}

/**
 * Computes a preview URL pattern for the endpoint including query string if queryParams are defined
 * (e.g. "/send-message/:hello?sort=asc&limit=10&page=").
 * Deduplicates path parameters and excludes any query parameters that share the same key as a path parameter.
 */
export function computeCompiledEndpointRoute({
  route,
  queryParams = [],
  pathParams = [],
}: {
  route: string;
  queryParams?: Parameter[] | Array<{ name?: string; defaultValue?: string }>;
  pathParams?: Parameter[] | Array<{ name?: string; key?: string }>;
}): string {
  const cleanRoute = deduplicateEndpointRoutePathParams((route || "").trim());
  const extractedPathNames = extractEndpointPathParams(cleanRoute);
  const explicitPathNames = (pathParams || [])
    .map((p) => (p.name || ("key" in p ? p.key : "") || "").trim())
    .filter((n): n is string => n.length > 0);
  const allPathNames = Array.from(new Set([...extractedPathNames, ...explicitPathNames]));

  const qs = formatEndpointQueryString(queryParams, {
    excludeNames: allPathNames,
  });
  return qs ? `${cleanRoute}${qs}` : cleanRoute;
}

export interface EndpointParamValidationResult {
  isValid: boolean;
  duplicatePathParams: string[];
  duplicateQueryParams: string[];
  conflictingParams: string[];
  errors: string[];
}

/**
 * Validates endpoint path parameters and query parameters to ensure:
 * 1. No duplicate parameter names within pathParams.
 * 2. No duplicate parameter names within queryParams.
 * 3. No parameter names shared between pathParams and queryParams.
 */
export function validateEndpointParamKeys({
  pathParams = [],
  queryParams = [],
}: {
  pathParams?: Array<{ name?: string }>;
  queryParams?: Array<{ name?: string }>;
}): EndpointParamValidationResult {
  const duplicatePathParams: string[] = [];
  const duplicateQueryParams: string[] = [];
  const conflictingParams: string[] = [];
  const errors: string[] = [];

  const seenPath = new Set<string>();
  pathParams.forEach((p) => {
    const name = (p.name || "").trim().toLowerCase();
    if (!name) return;
    if (seenPath.has(name) && !duplicatePathParams.includes(name)) {
      duplicatePathParams.push(name);
      errors.push(`Duplicate path parameter: "${name}"`);
    }
    seenPath.add(name);
  });

  const seenQuery = new Set<string>();
  queryParams.forEach((q) => {
    const name = (q.name || "").trim().toLowerCase();
    if (!name) return;
    if (seenQuery.has(name) && !duplicateQueryParams.includes(name)) {
      duplicateQueryParams.push(name);
      errors.push(`Duplicate query parameter: "${name}"`);
    }
    seenQuery.add(name);

    if (seenPath.has(name) && !conflictingParams.includes(name)) {
      conflictingParams.push(name);
      errors.push(
        `Parameter "${name}" cannot be used as both a path parameter and a query parameter.`,
      );
    }
  });

  return {
    isValid: errors.length === 0,
    duplicatePathParams,
    duplicateQueryParams,
    conflictingParams,
    errors,
  };
}

/**
 * Normalizes a topic or event name by replacing whitespace with dots,
 * matching standard event-driven and Kafka hierarchical topic naming conventions (e.g. "message sent" -> "message.sent").
 */
export function formatTopicName(name: string): string {
  if (!name) return "";
  const noLeading = name.replace(/^[\s.]+/, "");
  return noLeading.replace(/[\s.]*\s+[\s.]*/g, ".");
}

/**
 * Sanitizes a topic or event name for persistence (e.g. on blur/save),
 * trimming whitespace, collapsing dots, and stripping trailing dots.
 */
export function sanitizeTopicName(name: string): string {
  if (!name) return "";
  const formatted = formatTopicName(name.trim());
  return formatted.replace(/\.+/g, ".").replace(/^\.+|\.+$/g, "");
}

export interface RawWebRtcStepCaps {
  clientDeliveryEnableDataChannel?: boolean;
  clientDeliveryEnableMic?: boolean;
  clientDeliveryEnableSpeaker?: boolean;
  clientDeliveryEnableCamera?: boolean;
  clientDeliveryEnableScreenShare?: boolean;
  clientDeliveryEnableRemoteVideo?: boolean;
  clientDeliveryEnableAudio?: boolean;
  clientDeliveryEnableVideo?: boolean;
  clientDeliveryMediaMode?: WebRtcMediaMode;
}

/**
 * Computes the aggregate WebRTC media mode based on enabled audio and video capabilities.
 */
export function computeMediaMode(
  values: Pick<
    WebRtcCapabilities,
    "enableMic" | "enableSpeaker" | "enableCamera" | "enableScreenShare" | "enableRemoteVideo"
  >,
): WebRtcMediaMode {
  const hasAnyAudio = Boolean(values.enableMic || values.enableSpeaker);
  const hasAnyVideo = Boolean(
    values.enableCamera || values.enableScreenShare || values.enableRemoteVideo,
  );
  return hasAnyAudio && hasAnyVideo
    ? "audio-video"
    : hasAnyAudio
    ? "audio"
    : hasAnyVideo
    ? "video"
    : "data";
}

/**
 * Resolves discrete WebRTC capabilities from a step draft or connection, ensuring independent
 * control with strict explicit false handling. When clientDeliveryMediaMode is 'data',
 * all audio and video capabilities resolve strictly to false.
 */
export function resolveWebRtcCapabilitiesFromStep(
  step: RawWebRtcStepCaps,
): WebRtcCapabilities {
  const isExplicitDataMode = step.clientDeliveryMediaMode === "data";

  const enableMic = isExplicitDataMode
    ? false
    : step.clientDeliveryEnableMic !== undefined
    ? Boolean(step.clientDeliveryEnableMic)
    : step.clientDeliveryEnableAudio !== undefined
    ? Boolean(step.clientDeliveryEnableAudio)
    : Boolean(
        step.clientDeliveryMediaMode === "audio" ||
          step.clientDeliveryMediaMode === "audio-video",
      );

  const enableSpeaker = isExplicitDataMode
    ? false
    : step.clientDeliveryEnableSpeaker !== undefined
    ? Boolean(step.clientDeliveryEnableSpeaker)
    : Boolean(
        step.clientDeliveryMediaMode === "audio" ||
          step.clientDeliveryMediaMode === "audio-video",
      );

  const enableCamera = isExplicitDataMode
    ? false
    : step.clientDeliveryEnableCamera !== undefined
    ? Boolean(step.clientDeliveryEnableCamera)
    : step.clientDeliveryEnableVideo !== undefined
    ? Boolean(step.clientDeliveryEnableVideo)
    : Boolean(
        step.clientDeliveryMediaMode === "video" ||
          step.clientDeliveryMediaMode === "audio-video",
      );

  const enableScreenShare = isExplicitDataMode
    ? false
    : Boolean(step.clientDeliveryEnableScreenShare);

  const enableRemoteVideo = isExplicitDataMode
    ? false
    : step.clientDeliveryEnableRemoteVideo !== undefined
    ? Boolean(step.clientDeliveryEnableRemoteVideo)
    : step.clientDeliveryEnableVideo !== undefined
    ? Boolean(step.clientDeliveryEnableVideo)
    : Boolean(
        step.clientDeliveryMediaMode === "video" ||
          step.clientDeliveryMediaMode === "audio-video",
      );

  return {
    enableDataChannel: step.clientDeliveryEnableDataChannel !== false,
    enableMic,
    enableSpeaker,
    enableCamera,
    enableScreenShare,
    enableRemoteVideo,
  };
}
