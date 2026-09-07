import {
  Endpoint,
  TransformerHelperNodeData,
  JSONValue,
  JSONObject,
  BackendNode,
  BackendEdge,
  AnyMessagingResource,
} from "@workspace/canvas/types";
import { toVarName, parseSchemaJson } from "@/lib/compiler/utils";
import { extractNestedPaths, parseRawJsonSafe } from "@/lib/utils/nestedJsonSchema";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  PipelineStepDraft,
  AvailablePath,
  AvailableSource,
  AvailableTransformer,
} from "./types";

// ---------------------------------------------------------------------------
// Path Introspection Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a candidate source path matches an expected argument name.
 * Supports exact match, dot-separated subpath match (e.g. "body.user.email" vs "email"),
 * and case/format-insensitive match (e.g. "first_name" vs "firstName").
 */
export function isPathMatch(path: string, argName: string): boolean {
  if (!path || !argName) return false;
  const normArg = argName.trim().toLowerCase();
  const normPath = path.trim().toLowerCase();

  // 1. Exact match
  if (normPath === normArg) return true;

  // 2. Dot-suffix match (e.g., 'user.email' or 'data.items' ending with '.email' / '.items')
  if (normPath.endsWith(`.${normArg}`)) return true;

  // 3. Normalized alphanumeric match (handling snake_case vs camelCase, e.g., 'user_id' and 'userId')
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanArg = normalize(argName);
  const lastSegment = path.split(".").pop() || path;
  const cleanPath = normalize(lastSegment);

  return cleanPath.length > 0 && cleanPath === cleanArg;
}

export function extractPathsFromObject(
  obj: JSONValue | JSONObject | undefined | null,
  prefix = "",
  depth = 0,
): AvailablePath[] {
  if (depth > 6 || obj === null || obj === undefined) return [];
  const results: AvailablePath[] = [];

  if (Array.isArray(obj)) {
    if (prefix) {
      results.push({ path: prefix, type: "array" });
    }
    if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
      results.push(
        ...extractPathsFromObject(
          obj[0],
          prefix ? `${prefix}[0]` : "[0]",
          depth + 1,
        ),
      );
    }
    return results;
  }

  if (typeof obj === "object") {
    if (prefix) {
      results.push({ path: prefix, type: "object" });
    }
    const entries = Object.entries(obj);
    for (const [key, val] of entries) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const valType = Array.isArray(val) ? "array" : typeof val;
      if (val !== null && typeof val === "object") {
        results.push(
          ...extractPathsFromObject(val, fullPath, depth + 1),
        );
      } else {
        results.push({ path: fullPath, type: valType });
      }
    }
  }
  return results;
}

export function getAvailableSources(
  endpoint?: Endpoint,
  priorSteps: PipelineStepDraft[] = [],
  allNodes: BackendNode[] = [],
  consumedEvent?: AnyMessagingResource,
  extraSources: AvailableSource[] = [],
): AvailableSource[] {
  const sources: AvailableSource[] = [];

  if (consumedEvent) {
    // 1. Event Payload
    const eventPayloadPaths: AvailablePath[] = [];
    if (consumedEvent.payloadSchema) {
      if (
        Array.isArray(consumedEvent.payloadSchema.fields) &&
        consumedEvent.payloadSchema.fields.length > 0
      ) {
        consumedEvent.payloadSchema.fields.forEach((f) => {
          if (f.name) {
            eventPayloadPaths.push({
              path: f.name,
              type: f.type,
              description: f.description,
            });
          }
        });
      }
      if (consumedEvent.payloadSchema.rawJson) {
        const parsed = parseSchemaJson(consumedEvent.payloadSchema.rawJson);
        if (parsed && typeof parsed === "object") {
          const jsonPaths = extractPathsFromObject(parsed);
          jsonPaths.forEach((jp) => {
            if (!eventPayloadPaths.some((bp) => bp.path === jp.path)) {
              eventPayloadPaths.push(jp);
            }
          });
        }
      }
    }
    sources.push({
      id: "event_payload",
      label: "Event Payload (payload)",
      kind: "req_body",
      rootVariableName: "payload",
      paths: eventPayloadPaths,
    });

    // 2. Event Metadata
    sources.push({
      id: "event_metadata",
      label: "Event Metadata (event)",
      kind: "req_headers",
      rootVariableName: "event",
      paths: [
        { path: "key", type: "string", description: "Message partition key" },
        { path: "topic", type: "string", description: "Broker topic name" },
        {
          path: "headers",
          type: "Record<string, string>",
          description: "Message transport headers",
        },
        {
          path: "offset",
          type: "string",
          description: "Stream offset / message ID",
        },
        {
          path: "timestamp",
          type: "number",
          description: "Timestamp of emission",
        },
      ],
    });
  } else {
    // 1. Request Body
    const bodyPaths: AvailablePath[] = [];
    if (endpoint?.requestBody) {
      if (
        Array.isArray(endpoint.requestBody.fields) &&
        endpoint.requestBody.fields.length > 0
      ) {
        endpoint.requestBody.fields.forEach((f) => {
          if (f.name) {
            bodyPaths.push({
              path: f.name,
              type: f.type,
              description: f.description,
            });
          }
        });
      }
      if (endpoint.requestBody.rawJson) {
        const parsed = parseSchemaJson(endpoint.requestBody.rawJson);
        if (parsed && typeof parsed === "object") {
          const jsonPaths = extractPathsFromObject(parsed);
          jsonPaths.forEach((jp) => {
            if (!bodyPaths.some((bp) => bp.path === jp.path)) {
              bodyPaths.push(jp);
            }
          });
        }
      }
    }
    sources.push({
      id: "req_body",
      label: "Request Body (body)",
      kind: "req_body",
      rootVariableName: "body",
      paths: bodyPaths,
    });

    // 2. Path Params
    const pathParams: AvailablePath[] = [];
    if (Array.isArray(endpoint?.pathParams)) {
      endpoint.pathParams.forEach((p) => {
        if (p.name)
          pathParams.push({
            path: p.name,
            type: p.type,
            description: p.description,
          });
      });
    }
    sources.push({
      id: "req_params",
      label: "Path Params (req.params)",
      kind: "req_params",
      rootVariableName: "req.params",
      paths: pathParams,
    });

    // 3. Query Params
    const queryParams: AvailablePath[] = [];
    if (Array.isArray(endpoint?.queryParams)) {
      endpoint.queryParams.forEach((p) => {
        if (p.name)
          queryParams.push({
            path: p.name,
            type: p.type,
            description: p.description,
          });
      });
    }
    sources.push({
      id: "req_query",
      label: "Query Params (req.query)",
      kind: "req_query",
      rootVariableName: "req.query",
      paths: queryParams,
    });

    // 4. Headers
    const headerPaths: AvailablePath[] = [];
    if (Array.isArray(endpoint?.headers)) {
      endpoint.headers.forEach((h) => {
        if (h.name)
          headerPaths.push({
            path: h.name,
            type: h.type,
            description: h.description,
          });
      });
    }
    sources.push({
      id: "req_headers",
      label: "Request Headers",
      kind: "req_headers",
      rootVariableName: "req.headers",
      paths: headerPaths,
    });
  }

  // 5. Prior Steps (Variable-centric output paths)
  priorSteps.forEach((s, idx) => {
    const varName = s.outputVariable || s.name || `step${idx + 1}Result`;
    const stepPaths: AvailablePath[] = [];

    if (Array.isArray(s.outputSchema) && s.outputSchema.length > 0) {
      s.outputSchema.forEach((os) => {
        if (os.name) stepPaths.push({ path: os.name, type: os.type });
      });
    }

    if (s.tableNodeId) {
      const tableNode = allNodes.find((n) => n.id === s.tableNodeId);
      if (tableNode?.data?.columns) {
        tableNode.data.columns.forEach((col) => {
          if (col.name && !stepPaths.some((p) => p.path === col.name)) {
            stepPaths.push({ path: col.name, type: col.type });
          }
        });
      }
    }

    // Ensure database operation results expose id, message, and success
    if (s.type === "db_operation") {
      if (!stepPaths.some((p) => p.path === "id")) {
        stepPaths.unshift({ path: "id", type: "string" });
      }
      if (!stepPaths.some((p) => p.path === "message")) {
        stepPaths.push({ path: "message", type: "string" });
      }
      if (!stepPaths.some((p) => p.path === "success")) {
        stepPaths.push({ path: "success", type: "boolean" });
      }
    }

    // Ensure 'id' column appears at the front of the list if present
    const idIdx = stepPaths.findIndex((p) => p.path === "id");
    if (idIdx > 0) {
      const [idItem] = stepPaths.splice(idIdx, 1);
      if (idItem) {
        stepPaths.unshift(idItem);
      }
    }

    // If step is an external_call or service_call, extract response fields & nested paths
    if (s.type === "external_call" || s.type === "service_call") {
      const allStoreEndpoints = useBackendCanvasStore.getState().endpoints;
      const targetEp = allStoreEndpoints.find(
        (ep) =>
          ep.id === s.externalEndpointId ||
          ep.id === s.tableNodeId ||
          ep.id === s.operationId ||
          ep.name === s.tableNodeId,
      );
      if (targetEp?.responseBody) {
        if (Array.isArray(targetEp.responseBody.fields)) {
          targetEp.responseBody.fields.forEach((f) => {
            if (f.name && !stepPaths.some((p) => p.path === f.name)) {
              stepPaths.push({ path: f.name, type: f.type || "string" });
            }
          });
        }
        if (targetEp.responseBody.rawJson) {
          const { parsed, error } = parseRawJsonSafe(targetEp.responseBody.rawJson);
          if (!error && parsed !== null) {
            const nested = extractNestedPaths(parsed);
            nested.forEach((item) => {
              if (item.path && !stepPaths.some((p) => p.path === item.path)) {
                stepPaths.push({ path: item.path, type: item.type });
              }
            });
          }
        }
      }

      // Check target external node error response schema
      const targetExtNode = allNodes.find(
        (n) => n.id === s.externalNodeId || n.id === s.databaseId,
      );
      if (targetExtNode?.data?.errorResponseSchema) {
        const errSchema = targetExtNode.data.errorResponseSchema;
        if (typeof errSchema === "object" && errSchema !== null) {
          if (Array.isArray(errSchema.fields)) {
            errSchema.fields.forEach((f: { name?: string; type?: string }) => {
              if (f.name && !stepPaths.some((p) => p.path === `error.${f.name}`)) {
                stepPaths.push({ path: `error.${f.name}`, type: f.type || "string" });
              }
            });
          } else {
            const nestedErr = extractNestedPaths(errSchema);
            nestedErr.forEach((item) => {
              if (item.path && !stepPaths.some((p) => p.path === `error.${item.path}`)) {
                stepPaths.push({ path: `error.${item.path}`, type: item.type });
              }
            });
          }
        }
      }
      if (targetEp?.errorResponseBody) {
        if (Array.isArray(targetEp.errorResponseBody.fields)) {
          targetEp.errorResponseBody.fields.forEach((f) => {
            if (f.name && !stepPaths.some((p) => p.path === `error.${f.name}`)) {
              stepPaths.push({ path: `error.${f.name}`, type: f.type || "string" });
            }
          });
        }
        if (targetEp.errorResponseBody.rawJson) {
          const { parsed, error } = parseRawJsonSafe(targetEp.errorResponseBody.rawJson);
          if (!error && parsed !== null) {
            const nested = extractNestedPaths(parsed);
            nested.forEach((item) => {
              if (item.path && !stepPaths.some((p) => p.path === `error.${item.path}`)) {
                stepPaths.push({ path: `error.${item.path}`, type: item.type });
              }
            });
          }
        }
      }
      // Add standard error, success, and status paths
      if (!stepPaths.some((p) => p.path.startsWith("error"))) {
        stepPaths.push({ path: "error.message", type: "string" });
        stepPaths.push({ path: "error.error", type: "string" });
        stepPaths.push({ path: "error.statusCode", type: "number" });
      }
      if (!stepPaths.some((p) => p.path === "success")) {
        stepPaths.push({ path: "success", type: "boolean" });
      }
      if (!stepPaths.some((p) => p.path === "status")) {
        stepPaths.push({ path: "status", type: "number" });
      }
    }

    sources.push({
      id: `step:${s.id}`,
      label: `Step ${idx + 1}: ${varName} (const ${varName})`,
      kind: "step_output",
      stepId: s.id,
      variableName: varName,
      rootVariableName: varName,
      paths: stepPaths,
    });
  });

  // 6. Injected Context / Extra Sources (e.g. caught error, loop item)
  if (Array.isArray(extraSources) && extraSources.length > 0) {
    sources.push(...extraSources);
  }

  // 7. Inline Value (Literal or Template ${...})
  sources.push({
    id: "inline",
    label: "Inline Value (${...})",
    kind: "inline",
    rootVariableName: "inline",
    paths: [],
  });

  return sources;
}

/**
 * Gathers all transformer helpers and standalone transformer nodes in the project.
 */
export function getAvailableTransformers(
  allNodes: BackendNode[],
  serviceNodeId?: string,
  allEdges: BackendEdge[] = [],
): AvailableTransformer[] {
  const transformers: AvailableTransformer[] = [];
  const seenNames = new Set<string>();

  // 1. Service Helpers from the current service
  const currentService = allNodes.find((n) => n.id === serviceNodeId);
  const currentHelpers = currentService?.data?.transformerHelpers;
  if (Array.isArray(currentHelpers)) {
    currentHelpers.forEach((h: TransformerHelperNodeData) => {
      if (!h.name) return;
      const isLocal = h.scope !== "global";
      const importPath = isLocal ? `./transformers/${h.name}` : "@workspace/transformers";
      transformers.push({
        id: h.id || `helper-${h.name}`,
        name: h.name,
        description: h.description,
        scope: h.scope === "global" ? "global" : "local",
        targetServiceId: serviceNodeId,
        targetEndpointId: h.targetEndpointId,
        sourceType: "service_helper",
        importPath,
        inputSchema: h.inputSchema || [],
        returnSchema: h.returnSchema || [],
        logicMode: h.logicMode,
        code: h.code,
        prompt: h.prompt,
        isAsync: h.isAsync,
      });
      seenNames.add(h.name);
    });
  }

  // 2. Global helpers from other services
  allNodes
    .filter((n) => n.type === "service" && n.id !== serviceNodeId)
    .forEach((svc) => {
      const otherHelpers = svc.data?.transformerHelpers;
      if (Array.isArray(otherHelpers)) {
        otherHelpers.forEach((h: TransformerHelperNodeData) => {
          if (h.name && h.scope === "global" && !seenNames.has(h.name)) {
            transformers.push({
              id: h.id || `helper-${h.name}`,
              name: h.name,
              description: h.description,
              scope: "global",
              targetServiceId: svc.id,
              targetEndpointId: h.targetEndpointId,
              sourceType: "service_helper",
              importPath: "@workspace/transformers",
              inputSchema: h.inputSchema || [],
              returnSchema: h.returnSchema || [],
              logicMode: h.logicMode,
              code: h.code,
              prompt: h.prompt,
              isAsync: h.isAsync,
            });
            seenNames.add(h.name);
          }
        });
      }
    });

  // 3. Standalone Transformer Nodes from Canvas
  allNodes
    .filter((n) => n.type === "transformer")
    .forEach((tNode) => {
      const nodeData = tNode.data;
      const rawName = nodeData?.functionName || nodeData?.label || "transformData";
      const fnName = toVarName(rawName);
      if (!fnName || seenNames.has(fnName)) return;

      let targetServiceId = nodeData?.targetServiceId;
      if (!targetServiceId) {
        const edge = allEdges.find(
          (e) => e.source === tNode.id || e.target === tNode.id,
        );
        if (edge) {
          const otherId = edge.source === tNode.id ? edge.target : edge.source;
          const other = allNodes.find(
            (n) => n.id === otherId && n.type === "service",
          );
          if (other) targetServiceId = other.id;
        }
      }

      const scope = nodeData?.scope === "local" ? "local" : "global";
      const isLocalToCurrent =
        scope === "local" &&
        (!targetServiceId || targetServiceId === serviceNodeId);
      const importPath = isLocalToCurrent
        ? `./transformers/${fnName}`
        : "@workspace/transformers";

      // Check if there's already a transformer_ref node for this service
      const refNode = allNodes.find(
        (n) =>
          n.type === "transformer_ref" &&
          (n.data?.targetServiceId === serviceNodeId ||
            allEdges.some((e) => e.source === n.id && e.target === serviceNodeId)),
      );

      transformers.push({
        id: tNode.id,
        name: fnName,
        description: nodeData?.description,
        scope,
        targetServiceId,
        targetEndpointId: nodeData?.targetEndpointId,
        sourceType: "canvas_node",
        nodeId: tNode.id,
        transformerRefNodeId: refNode?.id,
        importPath,
        inputSchema: nodeData?.inputSchema || [],
        returnSchema: nodeData?.returnSchema || [],
        logicMode: nodeData?.logicMode,
        code: nodeData?.code,
        prompt: nodeData?.prompt,
        isAsync: nodeData?.isAsync,
      });
      seenNames.add(fnName);
    });

  return transformers;
}
