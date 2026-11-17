import { BackendNode, BackendEdge, Endpoint, Parameter } from "@workspace/canvas/types";
import { AvailableSource, StepSource, StepBinding, PipelineStepDraft } from "../types";

export function stepSourceToAccessor(
  source: StepSource,
  availableSources?: AvailableSource[],
): string {
  if (source.kind === "req_body") {
    return source.field ? `body.${source.field}` : "body";
  }
  if (source.kind === "req_params") {
    return source.field ? `params.${source.field}` : "params";
  }
  if (source.kind === "req_query") {
    return source.field ? `query.${source.field}` : "query";
  }
  if (source.kind === "req_headers") {
    return source.field ? `headers.${source.field}` : "headers";
  }
  if (source.kind === "auth") {
    return source.field ? `auth.${source.field}` : "auth";
  }
  if (source.kind === "env") {
    return source.field ? `env.${source.field}` : "env";
  }
  if (source.kind === "step_output") {
    const matched = availableSources?.find(
      (s) => s.kind === "step_output" && s.stepId === source.stepId,
    );
    const varName = matched?.variableName || source.stepId;
    return source.field ? `${varName}.${source.field}` : varName;
  }
  if (source.kind === "inline") {
    return source.value !== undefined && source.value !== "" ? String(source.value) : "inline:";
  }
  return "";
}

export function accessorToStepSource(
  accessor: string,
  availableSources?: AvailableSource[],
): StepSource {
  const trimmed = (accessor || "").trim();
  if (!trimmed) {
    return { kind: "req_body", field: "" };
  }
  if (trimmed.startsWith("auth.") || trimmed === "auth") {
    return { kind: "auth", field: trimmed === "auth" ? "" : trimmed.slice(5) };
  }
  if (trimmed.startsWith("body.") || trimmed === "body") {
    return { kind: "req_body", field: trimmed === "body" ? "" : trimmed.slice(5) };
  }
  if (trimmed.startsWith("event.") || trimmed === "event") {
    return { kind: "req_body", field: trimmed === "event" ? "" : trimmed.slice(6) };
  }
  if (trimmed.startsWith("params.") || trimmed === "params") {
    return { kind: "req_params", field: trimmed === "params" ? "" : trimmed.slice(7) };
  }
  if (trimmed.startsWith("query.") || trimmed === "query") {
    return { kind: "req_query", field: trimmed === "query" ? "" : trimmed.slice(6) };
  }
  if (trimmed.startsWith("headers.") || trimmed === "headers") {
    return { kind: "req_headers", field: trimmed === "headers" ? "" : trimmed.slice(8) };
  }
  const headerMatch = trimmed.match(/(?:req\.)?headers\[['"]([^'"]+)['"]\]/);
  if (headerMatch) {
    return { kind: "req_headers", field: headerMatch[1] };
  }
  if (
    trimmed === "env" ||
    trimmed === "process.env" ||
    trimmed.startsWith("env.") ||
    trimmed.startsWith("process.env.")
  ) {
    const field = trimmed.startsWith("process.env.")
      ? trimmed.slice(12)
      : trimmed.startsWith("env.")
      ? trimmed.slice(4)
      : "";
    return { kind: "env", field };
  }
  if (availableSources) {
    for (const src of availableSources) {
      if (src.kind === "step_output" && src.stepId) {
        const varName = src.variableName;
        if (varName && (trimmed === varName || trimmed.startsWith(`${varName}.`))) {
          const field = trimmed === varName ? "" : trimmed.slice(varName.length + 1);
          return { kind: "step_output", stepId: src.stepId, field };
        }
        if (trimmed === src.stepId || trimmed.startsWith(`${src.stepId}.`)) {
          const field = trimmed === src.stepId ? "" : trimmed.slice(src.stepId.length + 1);
          return { kind: "step_output", stepId: src.stepId, field };
        }
      }
    }
  }
  if (
    trimmed.startsWith("`") ||
    trimmed.startsWith('"') ||
    trimmed.startsWith("'") ||
    trimmed.includes("${") ||
    trimmed.startsWith("inline:")
  ) {
    const val = trimmed.startsWith("inline:") ? trimmed.slice(7).trim() : trimmed;
    return { kind: "inline", value: val };
  }
  return { kind: "req_body", field: trimmed };
}

/**
 * Identifies channels that already have dedicated UI sections:
 * - thread_id / threadId: handled by the Session Thread ID card (checkpointer configurable)
 * - messages / message: handled by the Conversation & Messages Input card when langGraphMessagesConfig is active
 */
export function isDedicatedChannel(
  key: string,
  stateChannelKey?: string,
  hasDedicatedMessages: boolean = true,
): boolean {
  if (!key) return true;
  const lower = key.toLowerCase();
  if (lower === "thread_id" || lower === "threadid") return true;

  // Any channel that maps to state "messages" is an input alias for conversation messages
  if (stateChannelKey) {
    const parts = stateChannelKey.split(",").map((s) => s.trim().toLowerCase());
    if (parts.includes("messages")) return true;
  }

  if (hasDedicatedMessages && lower === "messages") return true;
  return false;
}

/**
 * Determines whether an agent node has memory / checkpointer persistence configured.
 */
export function getAgentHasMemory(agentNode?: BackendNode): boolean {
  if (!agentNode?.data) return false;
  const rawMemoryConfig = agentNode.data.memoryConfig;
  const memoryConfig = rawMemoryConfig ?? {
    checkpointer: "memory",
    enabled: true,
  };
  if (rawMemoryConfig && rawMemoryConfig.enabled === false) return false;
  return Boolean(memoryConfig.checkpointer);
}

/**
 * Resolves a StepBinding for a specific argument key, falling back to an accessor string if unmapped.
 */
export function getArgBinding(
  step: PipelineStepDraft,
  availableSources: AvailableSource[] | undefined,
  argName: string,
  fieldValue: string | undefined,
  fallbackAccessor: string,
): StepBinding {
  if (argName !== "thread_id" && argName !== "threadId") {
    const existing = (step.inputBindings || []).find((b) => b.argName === argName);
    if (existing) return existing;
  }
  if (fieldValue !== undefined && fieldValue !== "") {
    return {
      argName,
      source: accessorToStepSource(fieldValue, availableSources),
    };
  }
  return {
    argName,
    source: accessorToStepSource(fallbackAccessor, availableSources),
  };
}

/**
 * Checks whether an endpoint contract already provides or maps a thread_id field.
 */
export function checkEndpointHasThreadId(
  endpoint?: Endpoint,
  threadIdSource?: string,
  availableSources?: AvailableSource[],
): boolean {
  if (!endpoint) return true;

  if (threadIdSource) {
    const src = accessorToStepSource(threadIdSource, availableSources);
    if (src.kind === "req_params" && src.field) {
      const exists = (endpoint.pathParams || []).some((p: Parameter) => p.name === src.field);
      if (exists) return true;
    }
    if (src.kind === "req_body" && src.field) {
      const exists = (endpoint.requestBody?.fields || []).some(
        (f: Parameter) => f.name === src.field,
      );
      if (exists) return true;
    }
    if (src.kind === "req_query" && src.field) {
      const exists = (endpoint.queryParams || []).some(
        (q: Parameter) => q.name === src.field,
      );
      if (exists) return true;
    }
    if (src.kind === "req_headers" && src.field) {
      const exists = (endpoint.headers || []).some(
        (h: Parameter) => h.name === src.field,
      );
      if (exists) return true;
    }
  }

  // Fallback: check for canonical thread_id field names across all contract sections
  const bodyFields = endpoint.requestBody?.fields || [];
  const hasInBody = bodyFields.some(
    (f: Parameter) =>
      f.name?.toLowerCase() === "thread_id" ||
      f.name?.toLowerCase() === "threadid" ||
      f.name?.toLowerCase() === "sessionid" ||
      f.name?.toLowerCase() === "session_id",
  );
  if (hasInBody) return true;

  const headers = endpoint.headers || [];
  const hasInHeaders = headers.some(
    (h: Parameter) =>
      h.name?.toLowerCase() === "x-thread-id" ||
      h.name?.toLowerCase() === "thread_id",
  );
  if (hasInHeaders) return true;

  const queryParams = endpoint.queryParams || [];
  const hasInQuery = queryParams.some(
    (q: Parameter) =>
      q.name?.toLowerCase() === "thread_id" ||
      q.name?.toLowerCase() === "threadid",
  );
  if (hasInQuery) return true;

  const pathParams = endpoint.pathParams || [];
  const hasInPath = pathParams.some(
    (p: Parameter) =>
      p.name?.toLowerCase() === "thread_id" ||
      p.name?.toLowerCase() === "threadid",
  );
  return hasInPath;
}

/**
 * Detects which WebPage node invokes/connects to a given endpoint/service.
 */
export function resolveInvokingPage(
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
  serviceNodeId?: string,
  endpoint?: Endpoint,
): BackendNode | undefined {
  if (!serviceNodeId) return undefined;
  const epId = endpoint?.id;

  // 1. Direct edge from a webPage to this service/endpoint
  for (const edge of allEdges) {
    const isSrcPage = allNodes.some((n) => n.id === edge.source && n.type === "webPage");
    const isTgtPage = allNodes.some((n) => n.id === edge.target && n.type === "webPage");
    if (!isSrcPage && !isTgtPage) continue;

    const pageId = isSrcPage ? edge.source : edge.target;
    const otherId = isSrcPage ? edge.target : edge.source;
    const otherHandle = isSrcPage ? (edge.targetHandle || "") : (edge.sourceHandle || "");

    if (otherId === serviceNodeId) {
      if (
        epId &&
        (otherHandle.includes(epId) ||
          otherHandle === `endpoint-in-${epId}` ||
          otherHandle === `endpoint-out-${epId}` ||
          otherHandle === `endpoints-in-${epId}` ||
          otherHandle === `routeEndpoints-in-${epId}`)
      ) {
        return allNodes.find((n) => n.id === pageId && n.type === "webPage");
      }
    }
  }

  // 2. Section actionSteps inside webPages targeting this endpoint
  for (const node of allNodes) {
    if (node.type !== "webPage") continue;
    const sections = node.data?.sections || [];
    for (const sec of sections) {
      const actions = sec.actions || [];
      for (const act of actions) {
        const steps = act.actionSteps || [];
        for (const s of steps) {
          if (
            (epId && s.endpointId === epId) ||
            (s.serviceNodeId === serviceNodeId && (!s.endpointId || s.endpointId === epId))
          ) {
            return node;
          }
        }
      }
    }
  }

  // 3. Fallback: Any direct edge between webPage and serviceNodeId
  for (const edge of allEdges) {
    if (edge.source === serviceNodeId) {
      const p = allNodes.find((n) => n.id === edge.target && n.type === "webPage");
      if (p) return p;
    } else if (edge.target === serviceNodeId) {
      const p = allNodes.find((n) => n.id === edge.source && n.type === "webPage");
      if (p) return p;
    }
  }

  return undefined;
}

/**
 * Identifies connected push to client (page_ref) node on the canvas.
 */
export function resolveConnectedPageRefNode(
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
  serviceNodeId?: string,
  endpoint?: Endpoint,
  clientDeliveryPageRefNodeId?: string,
  targetPageId?: string,
): BackendNode | undefined {
  if (!serviceNodeId) return undefined;

  // 1. If explicit pageRefNodeId is provided, look up that specific node first
  if (clientDeliveryPageRefNodeId) {
    const byId = allNodes.find(
      (n) => n.id === clientDeliveryPageRefNodeId && n.type === "page_ref",
    );
    if (byId) return byId;
  }

  const epId = endpoint?.id;

  // 2. Look for connected edge to a page_ref matching targetPageId (if provided)
  for (const edge of allEdges) {
    const isSrc = edge.source === serviceNodeId;
    const isTgt = edge.target === serviceNodeId;
    if (!isSrc && !isTgt) continue;

    const otherId = isSrc ? edge.target : edge.source;
    const handle = isSrc ? (edge.sourceHandle || "") : (edge.targetHandle || "");

    const matchesHandle = epId ? (!handle || handle.includes(epId)) : true;
    if (matchesHandle) {
      const candidate = allNodes.find((n) => n.id === otherId && n.type === "page_ref");
      if (candidate) {
        if (!targetPageId || candidate.data?.targetPageId === targetPageId || candidate.data?.pageRefId === targetPageId) {
          return candidate;
        }
      }
    }
  }

  // 3. Fallback: if no targetPageId was provided, return any connected page_ref
  if (!targetPageId) {
    for (const edge of allEdges) {
      const isSrc = edge.source === serviceNodeId;
      const isTgt = edge.target === serviceNodeId;
      if (!isSrc && !isTgt) continue;

      const otherId = isSrc ? edge.target : edge.source;
      const handle = isSrc ? (edge.sourceHandle || "") : (edge.targetHandle || "");

      const matchesHandle = epId ? (!handle || handle.includes(epId)) : true;
      if (matchesHandle) {
        const candidate = allNodes.find((n) => n.id === otherId && n.type === "page_ref");
        if (candidate) return candidate;
      }
    }
  }

  return undefined;
}

/**
 * Searches availableSources for the closest match for a channel key.
 */
export function findMatchingSourceForChannel(
  channelKey: string,
  availableSources: AvailableSource[] = [],
): StepSource {
  const keyLower = channelKey.toLowerCase();
  for (const src of availableSources) {
    if (src.kind === "inline") continue;
    const foundPath = src.paths.find((p) => {
      const pLower = p.path.toLowerCase();
      if (pLower === keyLower) return true;
      if (
        keyLower === "messages" &&
        (pLower === "messages" || pLower === "message" || pLower === "prompt" || pLower === "query")
      ) {
        return true;
      }
      return false;
    });
    if (foundPath) {
      if (src.kind === "step_output" && src.stepId) {
        return { kind: "step_output", stepId: src.stepId, field: foundPath.path };
      } else if (
        src.kind === "req_body" ||
        src.kind === "req_params" ||
        src.kind === "req_query" ||
        src.kind === "req_headers" ||
        src.kind === "auth" ||
        src.kind === "env"
      ) {
        return { kind: src.kind, field: foundPath.path };
      }
    }
  }
  return {
    kind: "req_body",
    field: channelKey === "messages" ? "message" : channelKey,
  };
}

/**
 * Searches availableSources for a candidate thread_id / session_id field.
 */
export function findMatchingSourceForThreadId(
  availableSources: AvailableSource[] = [],
): StepSource | null {
  for (const src of availableSources) {
    if (src.kind === "inline") continue;
    const found = src.paths.find((p) => {
      const l = p.path.toLowerCase();
      return (
        l === "thread_id" ||
        l === "threadid" ||
        l === "x-thread-id" ||
        l === "conversation_id" ||
        l === "session_id"
      );
    });
    if (found) {
      if (src.kind === "step_output" && src.stepId) {
        return {
          kind: "step_output",
          stepId: src.stepId,
          field: found.path,
        };
      } else if (
        src.kind === "req_body" ||
        src.kind === "req_params" ||
        src.kind === "req_query" ||
        src.kind === "req_headers" ||
        src.kind === "auth" ||
        src.kind === "env"
      ) {
        return { kind: src.kind, field: found.path };
      }
    }
  }
  return null;
}
