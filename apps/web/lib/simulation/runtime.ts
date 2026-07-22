import type { BackendEdge, BackendNode, Endpoint, Schema, SimulationTestCase, UIEventItem, JSONValue } from "@/types/canvas";
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
  kind: "client" | "endpoint" | "step" | "database" | "response";
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
  if (!schema?.fields?.length) return [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Expected an object response."];
  const object = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const field of schema.fields) {
    const fieldValue = object[field.name];
    if (field.required && (fieldValue === undefined || fieldValue === null)) {
      errors.push(`Missing required output field: ${field.name}`);
      continue;
    }
    if (fieldValue === undefined || fieldValue === null) continue;
    const valid = field.type === "number" ? typeof fieldValue === "number"
      : field.type === "boolean" ? typeof fieldValue === "boolean"
      : field.type === "array" ? Array.isArray(fieldValue)
      : field.type === "object" ? typeof fieldValue === "object" && !Array.isArray(fieldValue)
      : typeof fieldValue === "string";
    if (!valid) errors.push(`Output field ${field.name} must be ${field.type}.`);
  }
  return errors;
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
    .map((id) => nodes.find((node) => node.id === id && (node.type === "database" || (node.type as string) === "db_ref")))
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
  mocks?: Record<string, { returnData: JSONValue; status: number }>;
}): Promise<SimulationResult> {
  const { service, endpoint, nodes, edges, request, mocks } = args;
  const trace: SimulationTraceEntry[] = [];
  const context: RuntimeContext = { request, data: clone(request.body), variables: {} };
  const entitySeeds: Record<string, Array<Record<string, unknown>>> = {};

  for (const node of nodes) {
    if (node.type === "entity") {
      const seededRows: Array<Record<string, unknown>> = Array.isArray((node.data as any).seedRows) ? clone((node.data as any).seedRows) : [];
      entitySeeds[node.id] = seededRows;
    }
  }

  const refs = findEndpointDatabaseRefs(service.id, endpoint, nodes, edges);
  const ingressEdge = args.sourceNodeId
    ? edges.find((edge) => edge.source === args.sourceNodeId && edge.target === service.id && edge.sourceHandle === `events-${args.sourceEventId}`)
    : undefined;

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
        const source = context.data && typeof context.data === "object" ? context.data as Record<string, unknown> : {};
        context.data = Object.fromEntries(fields.map((field) => [String(field), source[String(field)]]));
      } else if (operation === "omit") {
        const source = context.data && typeof context.data === "object" ? { ...(context.data as Record<string, unknown>) } : {};
        for (const field of Array.isArray(config.fields) ? config.fields : []) delete source[String(field)];
        context.data = source;
      } else if (operation === "rename") {
        const source = context.data && typeof context.data === "object" ? { ...(context.data as Record<string, unknown>) } : {};
        for (const [from, to] of Object.entries(config.fields ?? {})) {
          if (from in source) { source[String(to)] = source[from]; delete source[from]; }
        }
        context.data = source;
      } else if (operation === "set") {
        const target = context.data && typeof context.data === "object" ? context.data as Record<string, unknown> : {};
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
        const where = resolveObject(config.where ?? {}, context) as Record<string, unknown>;
        
        let result: unknown;
        const mock = mocks?.[database.ref.id];
        
        if (mock) {
          result = clone(mock.returnData);
        } else {
          const matches = (row: Record<string, unknown>) => Object.entries(where).every(([key, value]) => row[key] === value);
          if (operation === "db_get") result = database.rows.find(matches) ?? null;
          if (operation === "db_get_many") result = database.rows.filter(matches);
          if (operation === "db_insert") { const row = resolveObject(config.value ?? context.data, context) as Record<string, unknown>; database.rows.push(clone(row)); result = row; }
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
      } else if (operation === "return") {
        context.response = { status: Number(config.status ?? 200), body: resolveObject(config.body ?? context.data, context) };
      }

      trace.push({ id: step.id, kind: "step", label: step.text || operation, status: "completed", nodeId: service.id, input, output: clone(context.data) });
    }

    const body = context.response?.body ?? endpoint.simulationOutput ?? context.data;
    const status = context.response?.status ?? (endpoint.type === "POST" ? 201 : 200);
    const schemaErrors = validateSchema(body, endpoint.responseBody);
    if (schemaErrors.length) throw new Error(schemaErrors.join(" "));
    trace.push({ id: `${endpoint.id}-response`, kind: "response", label: `${status} ${status === 201 ? "Created" : "OK"}`, status: "completed", nodeId: service.id, output: clone(body) });
    return { status, statusText: status === 201 ? "Created" : "OK", headers: { "content-type": "application/json", "x-simulated": "true" }, body, trace };
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
  const firstEdge = args.edges.find((edge) => edge.source === args.client.id && edge.sourceHandle === `events-${args.event.id}`);
  const firstEndpointId = firstEdge?.targetHandle?.split("-in-").pop();
  const first = firstEdge && firstEndpointId ? findEndpoint(args.nodes, firstEdge.target, firstEndpointId, args.endpoints) : undefined;
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

  const connectedEdge = firstEdge!;
  const trace: SimulationTraceEntry[] = [{
    id: `${args.testCase.id}-client`, kind: "client", label: `Test case: ${args.testCase.name}`,
    status: "completed", nodeId: args.client.id, edgeId: connectedEdge.id, input: clone(args.testCase.request?.body),
  }];
  let current: { service: BackendNode; endpoint: Endpoint } | undefined = first;
  let body: unknown = clone(args.testCase.request?.body ?? null);
  let result: SimulationResult | undefined;
  const visited = new Set<string>();

  while (current && !visited.has(`${current.service.id}:${current.endpoint.id}`)) {
    const step: { service: BackendNode; endpoint: Endpoint } = current;
    visited.add(`${step.service.id}:${step.endpoint.id}`);
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
      mocks: args.testCase.mocks,
    });
    trace.push(...result.trace);
    body = clone(result.body);
    if (result.status >= 400) break;

    const outgoing: BackendEdge | undefined = args.edges.find((edge) =>
      edge.source === step.service.id &&
      edge.sourceHandle === `endpoint-out-${step.endpoint.id}` &&
      edge.targetHandle?.startsWith("endpoint-in-"),
    );
    const nextEndpointId = outgoing?.targetHandle?.split("-in-").pop();
    current = outgoing && nextEndpointId ? findEndpoint(args.nodes, outgoing.target, nextEndpointId, args.endpoints) : undefined;
  }

  if (!result) {
    throw new Error("Simulation did not execute an endpoint.");
  }
  const uniqueActualPath = trace.map(t => t.nodeId).filter((id, i, arr) => id && id !== arr[i - 1]) as string[];
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
