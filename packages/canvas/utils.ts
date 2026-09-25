import type {
  HandleKind,
  BackendNodeType,
  BackendEdgeType,
  WebRtcCapabilities,
  WebRtcMediaMode,
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
  if (nodeType === "state_store") {
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
  if (trimmed === "/") return "/";

  // Split into segments in case of nested paths (e.g. "dashboard/user profile")
  const segments = trimmed
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
  return trimmed.startsWith("/") ? `/${cleanPath}` : cleanPath;
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
 * Sanitizes an endpoint route for persistence (e.g. on blur/save),
 * trimming whitespace and replacing internal spaces with hyphens.
 */
export function sanitizeEndpointRoute(route: string): string {
  if (!route) return "";
  return route.trim().replace(/\s+/g, "-");
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
