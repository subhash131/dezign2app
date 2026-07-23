import type { BackendEdge, BackendNode, BackendNodeType, Endpoint, Schema, SimulationTestCase, UIEventItem, JSONValue } from "@/types/canvas";
import { getSimulationTable, saveSimulationTable } from "./database";

export type SimulationRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  params: Record<string, unknown>;
  body: unknown;
};

export type SimulationTraceEntry = {
  id: string;
  kind: "client" | "endpoint" | "step" | "database" | "response" | "messaging" | "push";
  label: string;
  status: "completed" | "failed";
  nodeId?: string;
  edgeId?: string;
  input?: unknown;
  output?: unknown;
  detail?: string;
};

export type SimulationResult = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  trace: SimulationTraceEntry[];
};

export type SimulationTestCaseResult = SimulationResult & {
  testCaseId: string;
  testCaseName: string;
  assertions: Array<{ name: string; passed: boolean; detail?: string }>;
};

type RuntimeContext = {
  request: SimulationRequest;
  data: unknown;
  variables: Record<string, unknown>;
  response?: { status?: number; body?: unknown };
};

const clone = <T,>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

function getPath(root: unknown, path: string): unknown {
  return path.split(".").filter(Boolean).reduce<unknown>((value, key) => {
    if (value === null || value === undefined) return undefined;
    return (value as Record<string, unknown>)[key];
  }, root);
}

function setPath(root: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".").filter(Boolean);
  const last = parts.pop();
  if (!last) return;
  let cursor = root;
  for (const part of parts) {
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[last] = clone(value);
}

function resolveValue(value: unknown, context: RuntimeContext): unknown {
  if (typeof value !== "string") return clone(value);
  if (!value.startsWith("$")) return value;
  if (value === "$data") return context.data;
  if (value.startsWith("$request.")) return getPath(context.request, value.slice(9));
  if (value.startsWith("$variables.")) return getPath(context.variables, value.slice(11));
  if (value.startsWith("$response.")) return getPath(context.response, value.slice(10));
  return value;
}

function resolveObject(value: unknown, context: RuntimeContext): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveObject(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveObject(item, context)]));
  }
  return resolveValue(value, context);
}

function validateSchema(value: unknown, schema?: Schema): string[] {
  return [];
}

function findEventName(id: string, serviceNode: BackendNode, allNodes: BackendNode[]): string | undefined {
  const pe = serviceNode.data.publishedEvents?.find((e) => e.id === id);
  if (pe?.name) return pe.name;
  const ce = serviceNode.data.consumedEvents?.find((e) => e.id === id);
  if (ce?.name) return ce.name;
  const top = serviceNode.data.topics?.find((e) => e.id === id);
  if (top?.name) return top.name;
  const q = serviceNode.data.queues?.find((e) => e.id === id);
  if (q?.name) return q.name;
  const str = serviceNode.data.streams?.find((e) => e.id === id);
  if (str?.name) return str.name;
  const ch = serviceNode.data.channels?.find((e) => e.id === id);
  if (ch?.name) return ch.name;

  for (const ep of serviceNode.data.endpoints ?? []) {
    const epe = ep.publishedEvents?.find((e) => e.id === id);
    if (epe?.name) return epe.name;
  }

  for (const n of allNodes) {
    const pe2 = n.data.publishedEvents?.find((e) => e.id === id);
    if (pe2?.name) return pe2.name;
    const ce2 = n.data.consumedEvents?.find((e) => e.id === id);
    if (ce2?.name) return ce2.name;
    const top2 = n.data.topics?.find((e) => e.id === id);
    if (top2?.name) return top2.name;
    const q2 = n.data.queues?.find((e) => e.id === id);
    if (q2?.name) return q2.name;
    const str2 = n.data.streams?.find((e) => e.id === id);
    if (str2?.name) return str2.name;
    const ch2 = n.data.channels?.find((e) => e.id === id);
    if (ch2?.name) return ch2.name;

    for (const ep of n.data.endpoints ?? []) {
      const epe2 = ep.publishedEvents?.find((e) => e.id === id);
      if (epe2?.name) return epe2.name;
    }
  }

  return undefined;
}

function findEndpointDatabaseRefs(serviceId: string, endpoint: Endpoint, nodes: BackendNode[], edges: BackendEdge[]) {
  const declared = new Set([
    ...(endpoint.databaseNodeIds ?? []),
    ...(endpoint.databaseNodeId ? [endpoint.databaseNodeId] : []),
  ]);
  const connected = edges
    .filter((edge) => edge.source === serviceId && edge.sourceHandle === `endpoints-out-${endpoint.id}` && edge.targetHandle === "database-target")
    .map((edge) => edge.target);
  const ids = declared.size > 0 ? [...declared] : connected;
  return ids
    .map((id) => nodes.find((node) => node.id === id && (node.type === "database" || node.type === "db_ref")))
    .filter((node): node is BackendNode => Boolean(node));
}

export async function simulateEndpoint(args: {
  service: BackendNode;
  endpoint: Endpoint;
  nodes: BackendNode[];
  edges: BackendEdge[];
  request: SimulationRequest;
  sourceNodeId?: string;
  sourceEventId?: string;
  /** Pre-resolved ingress edge — pass this for chained service-to-service hops
   *  so the trace entry carries the correct edgeId and the arrow animates. */
  resolvedIngressEdge?: BackendEdge;
  mocks?: Record<string, { returnData: JSONValue; status: number }>;
}): Promise<SimulationResult> {
  const { service, endpoint, nodes, edges, request, mocks } = args;
  const trace: SimulationTraceEntry[] = [];
  const context: RuntimeContext = { request, data: clone(request.body), variables: {} };
  const entitySeeds: Record<string, Array<Record<string, unknown>>> = {};

  for (const node of nodes) {
    if (node.type === "entity") {
      const seededRows = Array.isArray(node.data.seedRows) ? clone(node.data.seedRows) : [];
      entitySeeds[node.id] = seededRows;
    }
  }

  const refs = findEndpointDatabaseRefs(service.id, endpoint, nodes, edges);
  // For client→service edges the sourceHandle pattern is `events-{eventId}`.
  // For service→service chained hops the caller already holds the edge, so
  // accept it directly via `resolvedIngressEdge` to avoid a failed lookup.
  const ingressEdge: BackendEdge | undefined = args.resolvedIngressEdge ??
    (args.sourceNodeId
      ? edges.find((edge) => edge.source === args.sourceNodeId && edge.target === service.id && edge.sourceHandle === `events-${args.sourceEventId}`)
      : undefined);

  const databaseFor = async (config: Record<string, unknown>) => {
    const requested = resolveValue(config.tableRef, context);
    const ref = refs.find((node) => node.id === requested || node.data.tableRef === requested) ?? refs[0];
    if (!ref) throw new Error("This endpoint has no connected database reference.");
    const tableId = ref.data.tableRef || ref.id;
    const rows = await getSimulationTable(tableId, entitySeeds[tableId] ?? []);
    const edge = edges.find((candidate) =>
      candidate.source === service.id &&
      candidate.target === ref.id &&
      candidate.sourceHandle === `endpoint-out-${endpoint.id}` &&
      candidate.targetHandle === "database-target"
    );
    return { ref, rows, tableId, edge };
  };

  const steps = endpoint.processingSteps ?? [];
  try {
    if (args.sourceNodeId) {
      trace.push({
        id: `${args.sourceEventId ?? endpoint.id}-client`,
        kind: "client",
        label: `Client event → ${endpoint.type} ${endpoint.name}`,
        status: "completed",
        nodeId: args.sourceNodeId,
        edgeId: ingressEdge?.id,
        input: clone(context.data),
      });
    }

    // Resolve mock early — if a mock is defined for this endpoint, it IS the output.
    const endpointMock = mocks?.[endpoint.id];

    if (endpointMock) {
      // Short-circuit: the user has explicitly defined what this endpoint returns.
      const body = clone(endpointMock.returnData);
      const status = endpointMock.status || 200;
      trace.push({ id: endpoint.id, kind: "endpoint", label: `${endpoint.type} ${endpoint.name}`, status: "completed", nodeId: service.id, edgeId: ingressEdge?.id, input: clone(context.data), output: body });
      trace.push({ id: `${endpoint.id}-response`, kind: "response", label: `[MOCKED] ${status} ${status === 201 ? "Created" : "OK"}`, status: "completed", nodeId: service.id, output: clone(body) });
      return { status, statusText: status === 201 ? "Created" : "OK", headers: { "content-type": "application/json", "x-simulated": "true" }, body, trace };
    }

    trace.push({ id: endpoint.id, kind: "endpoint", label: `${endpoint.type} ${endpoint.name}`, status: "completed", nodeId: service.id, edgeId: ingressEdge?.id, input: clone(context.data) });

    for (const step of steps) {
      const input = clone(context.data);
      const operation = step.operation ?? "passthrough";
      const config = step.config ?? {};

      if (operation === "passthrough") {
        // Legacy text-only steps remain visible but do not perform unsafe guessing.
      } else if (operation === "validate") {
        const required = Array.isArray(config.required) ? config.required : [];
        for (const path of required) {
          if (resolveValue(`$${String(path)}`, context) === undefined) throw new Error(`Missing required value: ${String(path)}`);
        }
      } else if (operation === "pick") {
        const fields = Array.isArray(config.fields) ? config.fields : [];
        const source: Record<string, unknown> = context.data !== null && typeof context.data === "object" ? { ...context.data as Record<string, unknown> } : {};
        context.data = Object.fromEntries(fields.map((field) => [String(field), source[String(field)]]));
      } else if (operation === "omit") {
        const source: Record<string, unknown> = context.data !== null && typeof context.data === "object" ? { ...context.data as Record<string, unknown> } : {};
        for (const field of Array.isArray(config.fields) ? config.fields : []) delete source[String(field)];
        context.data = source;
      } else if (operation === "rename") {
        const source: Record<string, unknown> = context.data !== null && typeof context.data === "object" ? { ...context.data as Record<string, unknown> } : {};
        for (const [from, to] of Object.entries(config.fields ?? {})) {
          if (from in source) { source[String(to)] = source[from]; delete source[from]; }
        }
        context.data = source;
      } else if (operation === "set") {
        const target: Record<string, unknown> = context.data !== null && typeof context.data === "object" ? { ...context.data as Record<string, unknown> } : {};
        setPath(target, String(config.path ?? ""), resolveObject(config.value, context));
        context.data = target;
      } else if (operation === "filter" || operation === "map") {
        if (!Array.isArray(context.data)) throw new Error(`${operation} requires an array payload.`);
        const field = String(config.field ?? "");
        const expected = resolveValue(config.equals, context);
        context.data = operation === "filter"
          ? context.data.filter((item) => getPath(item, field) === expected)
          : context.data.map((item) => getPath(item, field));
      } else if (operation.startsWith("db_")) {
        const database = await databaseFor(config);
        const resolved = resolveObject(config.where ?? {}, context);
        const where: Record<string, unknown> = resolved !== null && typeof resolved === "object" && !Array.isArray(resolved) ? resolved as Record<string, unknown> : {};
        
        let result: unknown;
        const mock = mocks?.[database.ref.id];
        
        if (mock) {
          result = clone(mock.returnData);
        } else {
          const matches = (row: Record<string, unknown>) => Object.entries(where).every(([key, value]) => row[key] === value);
          if (operation === "db_get") result = database.rows.find(matches) ?? null;
          if (operation === "db_get_many") result = database.rows.filter(matches);
          if (operation === "db_insert") { const rowResolved = resolveObject(config.value ?? context.data, context); const row: Record<string, unknown> = rowResolved !== null && typeof rowResolved === "object" && !Array.isArray(rowResolved) ? rowResolved as Record<string, unknown> : {}; database.rows.push(clone(row)); result = row; }
          if (operation === "db_update") { const row = database.rows.find(matches); if (!row) throw new Error("No matching database row found."); Object.assign(row, resolveObject(config.value ?? context.data, context)); result = row; }
          if (operation === "db_delete") { const index = database.rows.findIndex(matches); result = index >= 0 ? database.rows.splice(index, 1)[0] : null; }
          if (operation === "db_insert" || operation === "db_update" || operation === "db_delete") {
            await saveSimulationTable(database.tableId, database.rows);
          }
        }
        
        context.data = clone(result);
        const assignTo = config.assignTo ? String(config.assignTo) : undefined;
        if (assignTo) context.variables[assignTo] = clone(result);
        trace.push({ id: `${step.id}-db`, kind: "database", label: `${mock ? "[MOCKED] " : ""}${operation} ${database.ref.data.label ?? database.tableId}`, status: "completed", nodeId: database.ref.id, edgeId: database.edge?.id, input: where, output: clone(result) });
        continue;
      } else if (operation === "return") {
        context.response = { status: Number(config.status ?? 200), body: resolveObject(config.body ?? context.data, context) };
      }

      trace.push({ id: step.id, kind: "step", label: step.text || operation, status: "completed", nodeId: service.id, input, output: clone(context.data) });
    }

    const body = context.response?.body ?? endpoint.simulationOutput ?? null;
    const status = context.response?.status ?? (endpoint.type === "POST" ? 201 : 200);
    const schemaErrors = validateSchema(body, endpoint.responseBody);
    if (schemaErrors.length) throw new Error(schemaErrors.join(" "));
    const statusText = status === 201 ? "Created" : status === 204 ? "No Content" : "OK";
    trace.push({ id: `${endpoint.id}-response`, kind: "response", label: `${status} ${statusText}`, status: "completed", nodeId: service.id, output: clone(body) });
    return { status, statusText, headers: { "content-type": "application/json", "x-simulated": "true" }, body, trace };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trace.push({ id: `${endpoint.id}-error`, kind: "response", label: "Simulation failed", status: "failed", nodeId: service.id, detail: message, output: clone(context.data) });
    return { status: 422, statusText: "Simulation Failed", headers: { "content-type": "application/json", "x-simulated": "true" }, body: { error: message }, trace };
  }
}

function findEndpoint(nodes: BackendNode[], nodeId: string, endpointId: string, endpoints: Array<Endpoint & { nodeId: string }> = []): { service: BackendNode; endpoint: Endpoint } | undefined {
  const service = nodes.find((node) => node.id === nodeId && node.type === "service");
  if (!service) return undefined;
  const endpoint = endpoints.find((item) => item.nodeId === nodeId && item.id === endpointId)
    ?? service.data.endpoints?.find((item) => item.id === endpointId)
    ?? service.data.routeGroups?.flatMap((group) => group.endpoints).find((item) => item.id === endpointId);
  return endpoint ? { service, endpoint } : undefined;
}

/** Execute a named client test case through every endpoint connected by endpoint-out -> endpoint-in edges. */
export async function simulateTestCase(args: {
  client: BackendNode;
  event: UIEventItem;
  testCase: SimulationTestCase;
  nodes: BackendNode[];
  edges: BackendEdge[];
  endpoints?: Array<Endpoint & { nodeId: string }>;
}): Promise<SimulationTestCaseResult> {
  // Follow pageload-in chains: when the event connects to a pageload-in handle
  // on another WebClient, walk the chain until we reach an actual endpoint.
  const chainEdges: BackendEdge[] = [];
  const chainNodes: BackendNode[] = [args.client];

  let currentEdge = args.edges.find((edge) => edge.source === args.client.id && edge.sourceHandle === `events-${args.event.id}`);
  let depth = 0;

  const isIncomingHandle = (handle?: string | null) => 
    handle?.startsWith("pageload-in-") || handle?.startsWith("sse-in-") || handle?.startsWith("websocket-in-") || handle?.startsWith("ws-in-");

  while (currentEdge && isIncomingHandle(currentEdge.targetHandle) && depth < 10) {
    chainEdges.push(currentEdge);
    const targetNode = args.nodes.find((n) => n.id === currentEdge!.target);
    if (targetNode) chainNodes.push(targetNode);

    const linkedEventId = currentEdge.targetHandle!.replace(/^(pageload|sse|websocket|ws)-in-/, "");
    const nextEdge = args.edges.find((edge) => edge.source === currentEdge!.target && edge.sourceHandle === `events-${linkedEventId}`);
    if (!nextEdge) break;
    currentEdge = nextEdge;
    depth++;
  }

  if (currentEdge) {
    chainEdges.push(currentEdge);
  }

  const finalEdge = currentEdge;
  const firstEndpointId = finalEdge?.targetHandle?.split("-in-").pop();
  const first = finalEdge && firstEndpointId ? findEndpoint(args.nodes, finalEdge.target, firstEndpointId, args.endpoints) : undefined;
  if (!first) {
    return {
      testCaseId: args.testCase.id,
      testCaseName: args.testCase.name,
      status: 422,
      statusText: "Simulation Failed",
      headers: { "x-simulated": "true" },
      body: { error: "Client event is not connected to an endpoint." },
      trace: [{ id: `${args.testCase.id}-error`, kind: "response", label: "Simulation failed", status: "failed", detail: "Client event is not connected to an endpoint." }],
      assertions: [{ name: "client event has a connected endpoint", passed: false }],
    };
  }

  const connectedEdge = finalEdge!;

  // Build trace steps for client navigation chain
  const trace: SimulationTraceEntry[] = [{
    id: `${args.testCase.id}-client`,
    kind: "client",
    label: `Test case: ${args.testCase.name}`,
    status: "completed",
    nodeId: args.client.id,
    edgeId: chainEdges[0]?.id,
    input: clone(args.testCase.request?.body),
  }];

  // Add intermediate page load steps in the trace
  for (let i = 0; i < chainEdges.length - 1; i++) {
    const navNode = chainNodes[i + 1];
    const nextEdge = chainEdges[i + 1];
    trace.push({
      id: `${args.testCase.id}-nav-${i}`,
      kind: "client",
      label: `Page Load: ${navNode?.data?.label || "Web Client"}`,
      status: "completed",
      nodeId: navNode?.id,
      edgeId: nextEdge?.id,
    });
  }
  let current: { service: BackendNode; endpoint: Endpoint } | undefined = first;
  let body: unknown = clone(args.testCase.request?.body ?? null);
  let result: SimulationResult | undefined;
  const visited = new Set<string>();

  // Build the effective mocks map: merge test case mocks with the expectedBody/expectedStatus
  // for the initial (target) endpoint so the simulation uses the configured output directly.
  const buildMocks = (endpointId: string): Record<string, { returnData: JSONValue; status: number }> | undefined => {
    const base = args.testCase.mocks ?? {};
    if (args.testCase.expectedBody !== undefined && !(endpointId in base)) {
      return {
        ...base,
        [endpointId]: {
          returnData: args.testCase.expectedBody,
          status: args.testCase.expectedStatus ?? 200,
        },
      };
    }
    return Object.keys(base).length > 0 ? base : undefined;
  };

  // Track the outgoing edge from the previous hop so it can be passed as the
  // ingress edge when simulateEndpoint runs for the next chained service.
  let ingressEdgeForNext: BackendEdge | undefined = connectedEdge;

  while (current && !visited.has(`${current.service.id}:${current.endpoint.id}`)) {
    const step: { service: BackendNode; endpoint: Endpoint } = current;
    visited.add(`${step.service.id}:${step.endpoint.id}`);
    const isFirst = visited.size === 1;

    result = await simulateEndpoint({
      service: step.service,
      endpoint: step.endpoint,
      nodes: args.nodes,
      edges: args.edges,
      request: {
        method: step.endpoint.type || "GET",
        path: step.endpoint.name || "/",
        headers: args.testCase.request?.headers ?? {},
        params: args.testCase.request?.params ?? {},
        body,
      },
      // First hop: use sourceNodeId/sourceEventId so simulateEndpoint derives the
      // client→service edge via the `events-{id}` handle pattern.
      // Subsequent hops: pass the already-resolved service→service edge directly
      // so the trace entry carries the correct edgeId and the arrow animates.
      sourceNodeId: isFirst ? args.client.id : undefined,
      sourceEventId: isFirst ? args.event.id : undefined,
      resolvedIngressEdge: isFirst ? undefined : ingressEdgeForNext,
      mocks: isFirst ? buildMocks(step.endpoint.id) : args.testCase.mocks,
    });
    trace.push(...result.trace);
    body = clone(result.body);
    if (result.status >= 400) break;

    // ── Direct service-to-service hop (HTTP) ──────────────────────────────
    const outgoing: BackendEdge | undefined = args.edges.find((edge) =>
      edge.source === step.service.id &&
      edge.sourceHandle === `endpoint-out-${step.endpoint.id}` &&
      edge.targetHandle?.startsWith("endpoint-in-"),
    );
    const nextEndpointId = outgoing?.targetHandle?.split("-in-").pop();

    // Carry this outgoing edge forward so the next iteration can reference it
    // as its own ingress edge (the arrow that flows into the next service node)
    ingressEdgeForNext = outgoing;

    current = outgoing && nextEndpointId ? findEndpoint(args.nodes, outgoing.target, nextEndpointId, args.endpoints) : undefined;

    // ── Messaging path: publishedEvents-out-* → broker → consumedEvents-in-* ──
    // Collect published events specifically belonging to the executing endpoint (step.endpoint).
    const endpointPublishedEvents = step.endpoint.publishedEvents ?? [];
    const allowedEventIds = new Set(endpointPublishedEvents.map((e) => e.id));

    const publishEdges = args.edges.filter((edge) => {
      if (edge.source !== step.service.id) return false;
      if (!edge.sourceHandle?.startsWith("publishedEvents-out-")) return false;
      const eventId = edge.sourceHandle.replace("publishedEvents-out-", "");
      return allowedEventIds.has(eventId);
    });

    for (const pubEdge of publishEdges) {
      const brokerNode = args.nodes.find((n) => n.id === pubEdge.target);
      if (!brokerNode) continue;

      const messagingTypes: BackendNodeType[] = ["kafka", "sqs", "redis-streams", "redis-pubsub", "pubsub", "eventstream", "queue"];
      if (!messagingTypes.includes(brokerNode.type)) continue;

      // Find the event name from the service's published events or endpoint
      const publishedEventId = pubEdge.sourceHandle?.replace("publishedEvents-out-", "");
      const publishedEventName = publishedEventId ? findEventName(publishedEventId, step.service, args.nodes) : undefined;
      const eventLabel = publishedEventName ?? publishedEventId ?? "event";

      // Trace: broker node receives the event
      trace.push({
        id: `msg-${pubEdge.id}`,
        kind: "messaging",
        label: `${brokerNode.data.label ?? brokerNode.type} ← ${eventLabel}`,
        status: "completed",
        nodeId: brokerNode.id,
        edgeId: pubEdge.id,
        output: clone(body),
      });

      // Find consumer services whose consumed event name matches the published topic name.
      const consumeEdges = args.edges.filter((edge) =>
        edge.source === brokerNode.id &&
        edge.targetHandle?.startsWith("consumedEvents-in-"),
      );

      for (const consumeEdge of consumeEdges) {
        const consumerService = args.nodes.find(
          (n) => n.id === consumeEdge.target && n.type === "service",
        );
        if (!consumerService) continue;

        const consumedEventId = consumeEdge.targetHandle?.replace("consumedEvents-in-", "");
        const consumedEventName = consumedEventId ? findEventName(consumedEventId, consumerService, args.nodes) : undefined;

        // ── Topic matching guard ─────────────────────────────────────────────
        // 1. If both edges explicitly reference a broker topic handle (e.g. topics:in:id / topics:out:id), require matching topic ID
        const pubTopicId = pubEdge.targetHandle?.split(":").pop();
        const subTopicId = consumeEdge.sourceHandle?.split(":").pop();
        if (pubTopicId && subTopicId && pubTopicId !== subTopicId) {
          continue;
        }

        // 2. If event/topic names are resolved on both sides, require topic name match
        if (consumedEventName && eventLabel) {
          if (consumedEventName.trim().toLowerCase() !== eventLabel.trim().toLowerCase()) {
            continue;
          }
        }

        // Find the consumer endpoint (the handler for this consumed event).
        // Check the hydrated endpoints store first (same as findEndpoint() does),
        // then fall back to in-node data for older snapshots.
        const consumerEndpoint: Endpoint | undefined =
          (args.endpoints ?? []).find((ep) => ep.nodeId === consumerService.id && ep.id === consumedEventId) ??
          consumerService.data.endpoints?.find((ep) => ep.id === consumedEventId) ??
          consumerService.data.routeGroups?.flatMap((g) => g.endpoints).find((ep) => ep.id === consumedEventId);

        if (!consumerEndpoint) {
          // Still show the consumer service receiving the message even without a matched endpoint
          trace.push({
            id: `msg-consume-${consumeEdge.id}`,
            kind: "messaging",
            label: `${consumerService.data.label ?? "Service"} ← ${eventLabel}`,
            status: "completed",
            nodeId: consumerService.id,
            edgeId: consumeEdge.id,
            output: clone(body),
          });
          continue;
        }

        // Simulate the consumer endpoint
        const consumerResult = await simulateEndpoint({
          service: consumerService,
          endpoint: consumerEndpoint,
          nodes: args.nodes,
          edges: args.edges,
          request: {
            method: consumerEndpoint.type || "EVENT",
            path: consumerEndpoint.name || eventLabel,
            headers: {},
            params: {},
            body,
          },
          resolvedIngressEdge: consumeEdge,
          mocks: args.testCase.mocks,
        });
        trace.push(...consumerResult.trace);
        const consumerBody = clone(consumerResult.body);

        // ── SSE / WebSocket / WebRTC push back to clients ─────────────────
        // Any edge from the consumer service that targets a webClient node is
        // a real-time push. The targetHandle tells us the push mechanism.
        const pushEdges = args.edges.filter((edge) =>
          edge.source === consumerService.id &&
          args.nodes.some((n) => n.id === edge.target && n.type === "webClient"),
        );

        for (const pushEdge of pushEdges) {
          const clientNode = args.nodes.find(
            (n) => n.id === pushEdge.target && n.type === "webClient",
          );
          if (!clientNode) continue;

          // Determine push mechanism from targetHandle
          const th = pushEdge.targetHandle ?? "";
          let pushKind = "SSE";
          if (th.startsWith("websocket-in-") || th.startsWith("ws-in-")) pushKind = "WebSocket";
          else if (th.startsWith("webrtc-in-")) pushKind = "WebRTC";

          trace.push({
            id: `push-${pushEdge.id}`,
            kind: "push",
            label: `${pushKind} → ${clientNode.data.label ?? "Client"}`,
            status: "completed",
            nodeId: clientNode.id,
            edgeId: pushEdge.id,
            output: clone(consumerBody),
          });
        }
      }
    }


  } // end while

  if (!result) {
    throw new Error("Simulation did not execute an endpoint.");
  }
  const uniqueActualPath = trace.map(t => t.nodeId).filter((id, i, arr): id is string => id !== undefined && id !== arr[i - 1]);
  const pathPassed = args.testCase.expectedPath === undefined || JSON.stringify(args.testCase.expectedPath) === JSON.stringify(uniqueActualPath);

  const assertions = [{
    name: "expected status",
    passed: args.testCase.expectedStatus === undefined || args.testCase.expectedStatus === result.status,
    detail: args.testCase.expectedStatus === undefined ? undefined : `Expected ${args.testCase.expectedStatus}, received ${result.status}`,
  }, {
    name: "expected body",
    passed: args.testCase.expectedBody === undefined || JSON.stringify(args.testCase.expectedBody) === JSON.stringify(result.body),
    detail: args.testCase.expectedBody === undefined ? undefined : "Response body differs from expected body",
  }, {
    name: "expected path",
    passed: pathPassed,
    detail: args.testCase.expectedPath === undefined ? undefined : `Expected path ${JSON.stringify(args.testCase.expectedPath)}, but executed ${JSON.stringify(uniqueActualPath)}`,
  }];
  const passed = assertions.every((assertion) => assertion.passed);
  return { ...result, trace, testCaseId: args.testCase.id, testCaseName: args.testCase.name, assertions, status: passed ? result.status : 422, statusText: passed ? result.statusText : "Assertion Failed" };
}
