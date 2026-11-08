import type { BackendNode, Endpoint, UIEventItem } from "@workspace/canvas";
import type {
  TransformerHelperNodeData,
  CustomTypeItem,
  CustomTypeField,
} from "@workspace/canvas/types";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toVarName } from "@/lib/compiler/utils";
import {
  inferReturnSchemaFromCode,
  InferredFieldDraft,
} from "@/lib/utils/inferReturnSchema";
import { extractNestedPaths, parseRawJsonSafe } from "@/lib/utils/nestedJsonSchema";
import type { ActionStepItem } from "../TargetEndpointSection";
import type { ComboboxOption } from "./ActionFlowCombobox";
import type {
  FrontendActionStepDraft,
  FrontendActionStepType,
  FrontendFieldSource,
  FrontendRequestFieldBinding,
} from "./types";

interface ReturnSchemaFieldItem {
  name: string;
  type?: string;
  description?: string;
  isArray?: boolean;
  nestedFields?: ReturnSchemaFieldItem[];
}

export const KNOWN_FIELD_TYPES: Record<string, string> = {
  presignedUrl: "url",
  signedUrl: "url",
  uploadUrl: "url",
  downloadUrl: "url",
  url: "url",
  fileUrl: "url",
  "data.presignedUrl": "url",
  "data.url": "url",
  key: "string",
  fileKey: "string",
  id: "string",
  fileName: "string",
  fileType: "string",
  fileSize: "number",
  status: "string",
  success: "boolean",
  data: "object",
  error: "string",
};

export const FILE_STORAGE_RESPONSE_FIELD_SUGGESTIONS = [
  "presignedUrl",
  "url",
  "uploadUrl",
  "downloadUrl",
  "fileUrl",
  "data.presignedUrl",
  "data.url",
  "key",
  "id",
];

/** @deprecated Use FILE_STORAGE_RESPONSE_FIELD_SUGGESTIONS for file storage contexts */
export const COMMON_RESPONSE_FIELD_SUGGESTIONS = FILE_STORAGE_RESPONSE_FIELD_SUGGESTIONS;

export interface ExtractResponseFieldSuggestionsOptions {
  isStorage?: boolean;
}

/**
 * Extracts candidate response field paths from an endpoint, or defaults for file storage when isStorage is true.
 */
export function extractResponseFieldSuggestions(
  endpoint?: Endpoint,
  options?: ExtractResponseFieldSuggestionsOptions,
): string[] {
  const suggestions = new Set<string>();

  // Only include file-upload/storage default suggestions if explicitly in a storage context
  if (options?.isStorage) {
    FILE_STORAGE_RESPONSE_FIELD_SUGGESTIONS.forEach((s) => suggestions.add(s));
  }

  if (endpoint?.responseBody?.fields) {
    for (const field of endpoint.responseBody.fields) {
      if (field.name) {
        suggestions.add(field.name);
      }
    }
  }

  if (endpoint?.responseFields) {
    for (const rf of endpoint.responseFields) {
      if (rf.name) {
        suggestions.add(rf.name);
      }
    }
  }

  if (endpoint?.responseBody?.rawJson) {
    try {
      const parsed = JSON.parse(endpoint.responseBody.rawJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const key of Object.keys(parsed)) {
          suggestions.add(key);
        }
      }
    } catch {}
  }

  return Array.from(suggestions);
}

export interface ExtractStepFieldOptions {
  isStorage?: boolean;
  allNodes?: BackendNode[];
  endpoints?: (Endpoint & { nodeId?: string })[];
}

/**
 * Extracts available field suggestions from a prior action step (transformer, API call, storage, etc.)
 */
export function extractStepFieldOptions(
  step?: FrontendActionStepDraft,
  options?: ExtractStepFieldOptions,
): ComboboxOption[] {
  if (!step) return [];

  const results: ComboboxOption[] = [];
  const seen = new Set<string>();

  const addOption = (path: string, type?: string) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    results.push({
      value: path,
      label: path,
      type: type || KNOWN_FIELD_TYPES[path] || "property",
    });
  };

  const isTransform =
    step.type === "transform" ||
    Boolean(step.transformerNodeId) ||
    Boolean(step.transformerRefNodeId) ||
    Boolean(step.transformerName) ||
    Boolean(step.functionRef);

  if (isTransform) {
    const nodesPool: BackendNode[] =
      options?.allNodes && options.allNodes.length > 0
        ? options.allNodes
        : useBackendCanvasStore.getState().nodes || [];

    // Find transformer node
    let matchedNode: BackendNode | undefined;

    // 1. By transformerNodeId
    if (step.transformerNodeId) {
      matchedNode = nodesPool.find((n) => n.id === step.transformerNodeId);
      if (matchedNode?.type === "transformer_ref") {
        const refTarget = matchedNode.data?.transformerRef;
        if (typeof refTarget === "string" && refTarget.length > 0) {
          const master = nodesPool.find(
            (m) =>
              m.type === "transformer" &&
              (m.id === refTarget ||
                m.data?.functionName === refTarget ||
                m.data?.label === refTarget ||
                (typeof m.data?.functionName === "string" && toVarName(m.data.functionName) === toVarName(refTarget)) ||
                (typeof m.data?.label === "string" && toVarName(m.data.label) === toVarName(refTarget))),
          );
          if (master) matchedNode = master;
        }
      }
    }

    // 2. By transformerRefNodeId
    if (!matchedNode && step.transformerRefNodeId) {
      const refNode = nodesPool.find((n) => n.id === step.transformerRefNodeId);
      if (refNode) {
        const refTarget = refNode.data?.transformerRef;
        if (typeof refTarget === "string" && refTarget.length > 0) {
          const master = nodesPool.find(
            (m) =>
              m.type === "transformer" &&
              (m.id === refTarget ||
                m.data?.functionName === refTarget ||
                m.data?.label === refTarget ||
                (typeof m.data?.functionName === "string" && toVarName(m.data.functionName) === toVarName(refTarget)) ||
                (typeof m.data?.label === "string" && toVarName(m.data.label) === toVarName(refTarget))),
          );
          matchedNode = master || refNode;
        } else {
          matchedNode = refNode;
        }
      }
    }

    // 3. By functionRef name
    if (!matchedNode && typeof step.functionRef?.name === "string" && step.functionRef.name.length > 0) {
      const fnName = step.functionRef.name;
      matchedNode = nodesPool.find(
        (n) =>
          (n.type === "transformer" || n.type === "transformer_ref") &&
          (n.id === fnName ||
            n.data?.functionName === fnName ||
            n.data?.label === fnName ||
            (typeof n.data?.functionName === "string" && toVarName(n.data.functionName) === toVarName(fnName)) ||
            (typeof n.data?.label === "string" && toVarName(n.data.label) === toVarName(fnName))),
      );
      if (matchedNode?.type === "transformer_ref") {
        const refTarget = matchedNode.data?.transformerRef;
        if (typeof refTarget === "string" && refTarget.length > 0) {
          const master = nodesPool.find(
            (m) =>
              m.type === "transformer" &&
              (m.id === refTarget ||
                m.data?.functionName === refTarget ||
                m.data?.label === refTarget ||
                (typeof m.data?.functionName === "string" && toVarName(m.data.functionName) === toVarName(refTarget)) ||
                (typeof m.data?.label === "string" && toVarName(m.data.label) === toVarName(refTarget))),
          );
          if (master) matchedNode = master;
        }
      }
    }

    // 4. By transformerName
    if (!matchedNode && typeof step.transformerName === "string" && step.transformerName.length > 0) {
      const trName = step.transformerName;
      matchedNode = nodesPool.find(
        (n) =>
          (n.type === "transformer" || n.type === "transformer_ref") &&
          (n.id === trName ||
            n.data?.label === trName ||
            n.data?.functionName === trName ||
            (typeof n.data?.label === "string" && toVarName(n.data.label) === toVarName(trName)) ||
            (typeof n.data?.functionName === "string" && toVarName(n.data.functionName) === toVarName(trName))),
      );
      if (matchedNode?.type === "transformer_ref") {
        const refTarget = matchedNode.data?.transformerRef;
        if (typeof refTarget === "string" && refTarget.length > 0) {
          const master = nodesPool.find(
            (m) =>
              m.type === "transformer" &&
              (m.id === refTarget ||
                m.data?.functionName === refTarget ||
                m.data?.label === refTarget ||
                (typeof m.data?.functionName === "string" && toVarName(m.data.functionName) === toVarName(refTarget)) ||
                (typeof m.data?.label === "string" && toVarName(m.data.label) === toVarName(refTarget))),
          );
          if (master) matchedNode = master;
        }
      }
    }

    // 5. By step.outputVariable or step.name (e.g. generateChatIdResult -> generateChatId)
    if (!matchedNode && (step.outputVariable || step.name)) {
      const rawName = step.outputVariable || step.name || "";
      const baseName = rawName.replace(/Result$/i, "");
      matchedNode = nodesPool.find(
        (n) =>
          (n.type === "transformer" || n.type === "transformer_ref") &&
          (n.id === baseName ||
            n.data?.label === baseName ||
            n.data?.functionName === baseName ||
            (typeof n.data?.label === "string" && toVarName(n.data.label) === toVarName(baseName)) ||
            (typeof n.data?.functionName === "string" && toVarName(n.data.functionName) === toVarName(baseName)) ||
            (typeof n.data?.label === "string" && toVarName(n.data.label) === toVarName(rawName)) ||
            (typeof n.data?.functionName === "string" && toVarName(n.data.functionName) === toVarName(rawName))),
      );
      if (matchedNode?.type === "transformer_ref") {
        const refTarget = matchedNode.data?.transformerRef;
        if (typeof refTarget === "string" && refTarget.length > 0) {
          const master = nodesPool.find(
            (m) =>
              m.type === "transformer" &&
              (m.id === refTarget ||
                m.data?.functionName === refTarget ||
                m.data?.label === refTarget ||
                (typeof m.data?.functionName === "string" && toVarName(m.data.functionName) === toVarName(refTarget)) ||
                (typeof m.data?.label === "string" && toVarName(m.data.label) === toVarName(refTarget))),
          );
          if (master) matchedNode = master;
        }
      }
    }

    // 6. Check any transformer_ref node referencing step.transformerNodeId
    if (!matchedNode && step.transformerNodeId) {
      const refNode = nodesPool.find(
        (n) =>
          n.type === "transformer_ref" &&
          n.data?.transformerRef === step.transformerNodeId,
      );
      if (refNode) {
        matchedNode = nodesPool.find(
          (n) => n.type === "transformer" && n.id === step.transformerNodeId,
        );
      }
    }

    // 7. Check service nodes transformerHelpers
    if (!matchedNode) {
      for (const svc of nodesPool.filter((n) => n.type === "service")) {
        const helpers = svc.data?.transformerHelpers;
        if (Array.isArray(helpers)) {
          const helper = helpers.find((h: TransformerHelperNodeData) => {
            if (step.transformerNodeId && h.id === step.transformerNodeId) return true;
            const targetName = step.functionRef?.name || step.transformerName;
            if (typeof targetName === "string" && typeof h.name === "string") {
              return h.name === targetName || toVarName(h.name) === toVarName(targetName);
            }
            return false;
          });
          if (helper && Array.isArray(helper.returnSchema)) {
            helper.returnSchema.forEach((rf: { name: string; type: string }) => {
              if (rf.name) addOption(rf.name, rf.type);
            });
            break;
          }
        }
      }
    }

    // A) Raw JSON return schema mode
    if (
      matchedNode?.data?.returnSchemaMode === "raw_json" &&
      typeof matchedNode.data.returnSchemaRawJson === "string"
    ) {
      const { parsed, error } = parseRawJsonSafe(matchedNode.data.returnSchemaRawJson);
      if (!error && parsed !== null) {
        const nested = extractNestedPaths(parsed);
        nested.forEach((item) => {
          if (item.path) {
            addOption(item.path, item.type);
          }
        });
      }
    }

    // B) Structured returnSchema array
    const rawReturnSchema: ReturnSchemaFieldItem[] = [];
    if (Array.isArray(matchedNode?.data?.returnSchema)) {
      for (const item of matchedNode.data.returnSchema) {
        rawReturnSchema.push({
          name: item.name,
          type: item.type,
          description: item.description,
          isArray: item.isArray,
          nestedFields: item.nestedFields,
        });
      }
    }
    if (rawReturnSchema.length === 0 && Array.isArray(step.functionRef?.returnSchema)) {
      for (const item of step.functionRef.returnSchema) {
        rawReturnSchema.push({
          name: item.name,
          type: item.type,
        });
      }
    }

    if (rawReturnSchema.length > 0) {
      const addParams = (params: readonly ReturnSchemaFieldItem[], prefix = "") => {
        params.forEach((param) => {
          if (!param || !param.name) return;
          const fullPath = prefix ? `${prefix}.${param.name}` : param.name;
          const pType = param.type || (param.isArray ? "array" : "string");
          addOption(fullPath, pType);

          if (Array.isArray(param.nestedFields) && param.nestedFields.length > 0) {
            addParams(param.nestedFields, fullPath);
          } else if (pType && nodesPool.some((n) => n.type === "types")) {
            for (const typesNode of nodesPool.filter((n) => n.type === "types")) {
              const typesList = typesNode.data?.types;
              if (Array.isArray(typesList)) {
                const matchedType = typesList.find(
                  (t: CustomTypeItem) =>
                    t.name === pType ||
                    (typeof t.name === "string" && toVarName(t.name) === toVarName(pType)),
                );
                if (matchedType && Array.isArray(matchedType.fields)) {
                  matchedType.fields.forEach((tf: CustomTypeField) => {
                    if (tf.name) {
                      addOption(`${fullPath}.${tf.name}`, tf.type || "string");
                    }
                  });
                }
              }
            }
          }
        });
      };
      addParams(rawReturnSchema);
    }

    // C) Dynamic code inference from transformer code
    const code = matchedNode?.data?.code;
    const inSchema = matchedNode?.data?.inputSchema || [];
    if (typeof code === "string" && code.trim().length > 0) {
      const inferred = inferReturnSchemaFromCode(code, inSchema);
      if (inferred.length > 0) {
        const isDummy = inferred.length === 1 && inferred[0]?.name === "result";
        if (!isDummy || results.length === 0) {
          if (results.length === 1 && results[0]?.value === "result" && !isDummy) {
            results.length = 0;
            seen.clear();
          }
          const addInferred = (items: readonly InferredFieldDraft[], prefix = "") => {
            items.forEach((item) => {
              if (!item || !item.name) return;
              const fullPath = prefix ? `${prefix}.${item.name}` : item.name;
              addOption(fullPath, item.type || "string");
              if (Array.isArray(item.nestedFields) && item.nestedFields.length > 0) {
                addInferred(item.nestedFields, fullPath);
              }
            });
          };
          addInferred(inferred);
        }
      }
    }

    // Filter out dummy "result" if real fields exist
    if (results.some((r) => r.value !== "result")) {
      const idx = results.findIndex((r) => r.value === "result");
      if (idx !== -1) {
        results.splice(idx, 1);
        seen.delete("result");
      }
    }

    return results;
  }

  // 2. Api Call Step
  if (step.type === "api_call" || step.endpointId) {
    const endpointsPool =
      options?.endpoints && options.endpoints.length > 0
        ? options.endpoints
        : useBackendCanvasStore.getState().endpoints || [];

    const ep = endpointsPool.find((e) => e.id === step.endpointId);
    if (ep) {
      if (ep.responseBody?.fields) {
        for (const f of ep.responseBody.fields) {
          if (f.name) addOption(f.name, f.type);
        }
      }
      if (ep.responseFields) {
        for (const rf of ep.responseFields) {
          if (rf.name) addOption(rf.name, rf.type);
        }
      }
      if (ep.responseBody?.rawJson) {
        const { parsed, error } = parseRawJsonSafe(ep.responseBody.rawJson);
        if (!error && parsed !== null) {
          const nested = extractNestedPaths(parsed);
          nested.forEach((item) => {
            if (item.path) {
              addOption(item.path, item.type);
            }
          });
        }
      }
    }
    return results;
  }

  // 3. Storage Put Step
  if (step.type === "storage_put") {
    FILE_STORAGE_RESPONSE_FIELD_SUGGESTIONS.forEach((s) => {
      addOption(s, KNOWN_FIELD_TYPES[s] || "string");
    });
    return results;
  }

  // 4. State Mutation Step
  if (step.type === "state_mutation" && step.stateKey) {
    addOption(step.stateKey, "property");
    return results;
  }

  // 5. Browser Storage Step
  if (step.type === "browser_storage" && step.storageKey) {
    addOption(step.storageKey, "string");
    return results;
  }

  return results;
}

/**
 * Checks if a parameter or field name is an authentication header (e.g. Authorization)
 */
export function isAuthHeaderName(name?: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase().trim();
  return (
    lower === "authorization" ||
    lower === "auth-bearer-header" ||
    lower === "auth_token" ||
    lower.startsWith("auth-")
  );
}

/**
 * Returns any auth headers configured on the endpoint, or defaults to Authorization: Bearer <token>
 * if the endpoint is connected to a protected page (or requireAuth === true) and requireAuth !== false.
 */
export function getEndpointAuthHeaders(
  endpoint?: Endpoint | null,
  isProtected?: boolean,
  isItemScoped?: boolean,
  itemKeyField?: string,
): Array<{ name: string; value: string }> {
  if (endpoint?.requireAuth === false) {
    return [];
  }

  // Check if endpoint already has an auth header in endpoint.headers
  const existingAuthHeaders = (endpoint?.headers || []).filter((h) => {
    const name = (h.name || "").toLowerCase();
    const id = (h.id || "").toLowerCase();
    return (
      name === "authorization" ||
      id === "auth-bearer-header" ||
      id.startsWith("auth-") ||
      h.defaultValue?.toLowerCase().includes("bearer") ||
      h.value?.toLowerCase().includes("bearer")
    );
  });

  if (existingAuthHeaders.length > 0) {
    return existingAuthHeaders.map((h) => ({
      name: h.name || "Authorization",
      value: h.defaultValue || h.value || "Bearer <token>",
    }));
  }

  if (isProtected || endpoint?.requireAuth === true) {
    return [{ name: "Authorization", value: "Bearer <token>" }];
  }

  return [];
}

/**
 * Automatically maps required authentication headers into requestBindings when calling
 * an authenticated endpoint from a protected WebPage.
 */
export function autoMapAuthBindings(
  bindings: FrontendRequestFieldBinding[] = [],
  endpoint?: Endpoint | null,
  isProtected?: boolean,
  isItemScoped?: boolean,
  itemKeyField?: string,
): FrontendRequestFieldBinding[] {
  const authHeaders = getEndpointAuthHeaders(endpoint, isProtected);

  if (authHeaders.length === 0) {
    // If endpoint explicitly disallows auth, remove any default Bearer <token> auth header
    if (endpoint?.requireAuth === false) {
      return bindings.filter(
        (b) =>
          !isAuthHeaderName(b.targetField) ||
          (b.source.kind !== "auth_token" &&
            (b.source.kind !== "literal" || b.source.value !== "Bearer <token>")),
      );
    }
    return bindings;
  }

  const result = [...bindings];
  for (const ah of authHeaders) {
    const existingIndex = result.findIndex(
      (b) => b.targetField.toLowerCase() === ah.name.toLowerCase(),
    );
    if (existingIndex < 0) {
      result.push({
        id: `bind-auth-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        slot: "header",
        targetField: ah.name,
        source: {
          kind: "auth_token",
          tokenType: "session",
        },
      });
    } else {
      // Auto-upgrade legacy literal "Bearer <token>" placeholder to dynamic auth_token
      const existing = result[existingIndex]!;
      if (existing.source.kind === "literal" && existing.source.value === "Bearer <token>") {
        result[existingIndex] = {
          ...existing,
          source: { kind: "auth_token", tokenType: "session" },
        };
      }
    }
  }

  return result;
}

/**
 * Generates initial slot-aware bindings from an Endpoint definition.
 * Populates headers (with auth if required), pathParams, queryParams, and requestBody fields.
 */
export function buildInitialBindingsFromEndpoint(
  endpoint?: Endpoint | null,
  isProtected?: boolean,
  isItemScoped?: boolean,
  itemKeyField?: string,
): FrontendRequestFieldBinding[] {
  if (!endpoint) return [];

  const result: FrontendRequestFieldBinding[] = [];

  // 1. Headers — use getEndpointAuthHeaders to check if auth header is required
  const authHeaders = getEndpointAuthHeaders(endpoint, isProtected);
  const headers = [...(endpoint.headers ?? [])];

  for (const ah of authHeaders) {
    if (!headers.some((h) => h.name?.toLowerCase() === ah.name.toLowerCase())) {
      headers.unshift({
        id: "auth-bearer-header",
        name: ah.name,
        type: "string",
        required: true,
      });
    }
  }

  for (const h of headers) {
    if (!h.name) continue;
    const isAuth = isAuthHeaderName(h.name);
    // If endpoint explicitly disallows auth, skip auth headers
    if (isAuth && endpoint.requireAuth === false) continue;
    // If not protected and endpoint does not require auth, skip default auth header
    if (isAuth && !isProtected && endpoint.requireAuth !== true && authHeaders.length === 0) continue;

    result.push({
      id: `bind-h-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      slot: "header",
      targetField: h.name,
      source: isAuth
        ? { kind: "auth_token", tokenType: "session" }
        : { kind: "user_input", fieldName: h.name },
    });
  }

  // 2. Path params — default to matching route param of same name
  for (const p of endpoint.pathParams ?? []) {
    if (!p.name) continue;
    result.push({
      id: `bind-p-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      slot: "path_param",
      targetField: p.name,
      source: isItemScoped
        ? { kind: "item_prop", propPath: itemKeyField || p.name, fieldPath: itemKeyField || p.name }
        : { kind: "route_param", paramName: p.name },
    });
  }

  // 3. Query params — default to matching query param of same name
  for (const q of endpoint.queryParams ?? []) {
    if (!q.name) continue;
    result.push({
      id: `bind-q-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      slot: "query_param",
      targetField: q.name,
      source: { kind: "query_param", paramName: q.name },
    });
  }

  // 4. Body fields — default to user_input of same name
  for (const f of endpoint.requestBody?.fields ?? []) {
    if (!f.name) continue;
    result.push({
      id: `bind-b-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      slot: "body",
      targetField: f.name,
      source: { kind: "user_input", fieldName: f.name },
    });
  }

  return result;
}

/**
 * Derives FrontendActionStepDraft[] by merging canvas topology (ActionStepItem[])
 * with any existing saved drafts on the UIEventItem.
 * Canvas steps remain the source of truth for step existence, ordering, and topology.
 */
export function deriveStepsFromEdges(
  canvasSteps: ActionStepItem[],
  existing?: FrontendActionStepDraft[],
  isProtected?: boolean,
  isItemScoped?: boolean,
  itemKeyField?: string,
): FrontendActionStepDraft[] {
  const existingByEdgeId = new Map<string, FrontendActionStepDraft>();
  const existingByEndpoint = new Map<string, FrontendActionStepDraft>();
  const nonEdgeSteps: FrontendActionStepDraft[] = [];

  if (existing) {
    for (const draft of existing) {
      const edgeId =
        draft.edgeId ||
        (canvasSteps.some((c) => c.edgeId === draft.id) ? draft.id : undefined);
      if (edgeId) {
        existingByEdgeId.set(edgeId, draft);
        if (draft.serviceNodeId && draft.endpointId) {
          existingByEndpoint.set(`${draft.serviceNodeId}:${draft.endpointId}`, draft);
        }
      } else {
        // Retain steps without a canvas edge (e.g. state_mutation, update_query_params, navigate, transform)
        if (draft.type !== "api_call" && draft.type !== "storage_put" && draft.type !== "transform") {
          nonEdgeSteps.push(draft);
        }
      }
    }
  }

  const edgeSteps: FrontendActionStepDraft[] = canvasSteps.map((cStep, idx) => {
    const existingDraft =
      existingByEdgeId.get(cStep.edgeId) ||
      (cStep.targetNodeId && cStep.endpointId
        ? existingByEndpoint.get(`${cStep.targetNodeId}:${cStep.endpointId}`)
        : undefined);

    const isTransformer =
      cStep.targetNode?.type === "transformer" ||
      cStep.targetNode?.type === "transformer_ref" ||
      existingDraft?.type === "transform";

    if (isTransformer) {
      const targetNode = cStep.targetNode;
      const fnName =
        existingDraft?.transformerName ||
        targetNode?.data?.label ||
        targetNode?.data?.functionName ||
        "transformer";
      const cleanFn = toVarName(fnName);
      const defaultVar =
        existingDraft?.outputVariable ||
        existingDraft?.name ||
        (cleanFn ? `${cleanFn}Result` : "transformerResult");
      const isRef = targetNode?.type === "transformer_ref";
      const masterId = isRef
        ? targetNode?.data?.transformerRef || targetNode?.id
        : targetNode?.id;

      const draft: FrontendActionStepDraft = {
        id: existingDraft?.id || cStep.edgeId,
        order: existingDraft?.order ?? (cStep.step ?? idx + 1),
        type: "transform",
        name: existingDraft?.name || defaultVar,
        outputVariable: defaultVar,
        edgeId: cStep.edgeId,
        transformerNodeId: existingDraft?.transformerNodeId || masterId,
        transformerRefNodeId:
          existingDraft?.transformerRefNodeId || (isRef ? targetNode?.id : undefined),
        transformerName: fnName,
        functionRef: existingDraft?.functionRef || {
          name: cleanFn,
          importPath: "@workspace/transformers",
          isGlobal: true,
          inputSchema: targetNode?.data?.inputSchema,
          returnSchema: targetNode?.data?.returnSchema,
        },
        transformBindings: existingDraft?.transformBindings || [],
      };

      return draft;
    }

    const stepType: FrontendActionStepType = cStep.isStorageRef
      ? "storage_put"
      : "api_call";

    if (stepType === "storage_put") {
      const priorCanvasStep = idx > 0 ? canvasSteps[idx - 1] : undefined;
      const defaultPresignedUrlSource = priorCanvasStep
        ? {
            stepId: priorCanvasStep.edgeId,
            fieldPath: "presignedUrl",
          }
        : undefined;

      const presignedUrlSource =
        existingDraft?.presignedUrlSource || defaultPresignedUrlSource;

      const defaultFileSource: { kind: "state_var" | "user_input"; key: string } = {
        kind: "user_input",
        key: "file",
      };
      const fileSource = existingDraft?.fileSource || defaultFileSource;

      const contentType =
        existingDraft?.contentType || "application/octet-stream";

      const draft: FrontendActionStepDraft = {
        id: existingDraft?.id || cStep.edgeId,
        order: existingDraft?.order ?? (cStep.step ?? idx + 1),
        type: "storage_put",
        name: existingDraft?.name || `Upload to ${cStep.bucketName || "Storage"}`,
        edgeId: cStep.edgeId,
        storageRefNodeId: cStep.targetNodeId,
        storageServiceNodeId: existingDraft?.storageServiceNodeId,
        bucketId: cStep.bucketName,
        bucketName: cStep.bucketName,
        presignedUrlSource,
        fileSource,
        contentType,
      };

      return draft;
    }

    const requestBindings: FrontendRequestFieldBinding[] =
      existingDraft?.requestBindings ? [...existingDraft.requestBindings] : [];

    const mappedBindings =
      cStep.endpoint && requestBindings.length === 0
        ? buildInitialBindingsFromEndpoint(cStep.endpoint, isProtected)
        : autoMapAuthBindings(
            requestBindings,
            cStep.endpoint,
            isProtected,
          );

    const endpointName = cStep.endpoint?.name
      ? `${cStep.endpoint.type || "POST"} ${cStep.endpoint.name}`
      : "Call Endpoint";

    const draft: FrontendActionStepDraft = {
      id: existingDraft?.id || cStep.edgeId,
      order: existingDraft?.order ?? (cStep.step ?? idx + 1),
      type: "api_call",
      name: existingDraft?.name || endpointName,
      edgeId: cStep.edgeId,
      serviceNodeId: cStep.targetNodeId,
      endpointId: cStep.endpointId,
      requestBindings: mappedBindings,
    };

    return draft;
  });

  // Merge edge steps with non-edge steps and sort by order
  const combined = [...edgeSteps, ...nonEdgeSteps].sort((a, b) => a.order - b.order);

  // Normalize order to 1-based sequential integers
  return combined.map((step, index) => ({
    ...step,
    order: index + 1,
  }));
}

/**
 * Formats a clean runtime summary string for display in the sidebar.
 */
export function formatFieldSource(src?: FrontendFieldSource): string {
  if (!src) return "value";
  if (src.kind === "literal") return `"${src.value || ""}"`;
  if (src.kind === "state_var")
    return (
      src.fieldPath ||
      (src.storeName
        ? `${src.storeName}.${src.stateKey}`
        : `state.${src.stateKey}`)
    );
  if (src.kind === "user_input") return `input.${src.fieldName}`;
  if (src.kind === "prev_response") return `step.${src.fieldPath}`;
  if (src.kind === "route_param") return `params.${src.paramName}`;
  if (src.kind === "query_param") return `query.${src.paramName}`;
  if (src.kind === "session_storage") return `sessionStorage.${src.key}`;
  if (src.kind === "local_storage") return `localStorage.${src.key}`;
  if (src.kind === "cookie") return `cookie.${src.cookieName}`;
  if (src.kind === "item_prop")
    return `item.${src.propPath || src.fieldPath || "id"}`;
  if (src.kind === "realtime_payload")
    return `stream.${src.fieldPath || "payload"}`;
  if (src.kind === "auth_token") {
    return src.tokenType === "cookie"
      ? "cookie.session_token"
      : src.tokenType === "local_storage"
      ? "localStorage.auth_token"
      : "auth.sessionToken";
  }
  return "value";
}

function formatDraftStep(
  draft: FrontendActionStepDraft,
  stepNum: number,
  lines: string[],
) {
  switch (draft.type) {
    case "update_query_params": {
      const nav = draft.queryParamNavMode || "replace";
      const scroll = draft.queryParamScroll ? "scroll: true" : "scroll: false";

      const updates = draft.queryParamsUpdates;
      if (updates && updates.length > 1) {
        const ops = updates
          .map((u) => {
            const k = u.key || "param";
            const m = (u.mode || "set").toUpperCase();
            if (m === "REMOVE") return `REMOVE "${k}"`;
            if (m === "TOGGLE") return `TOGGLE "${k}"`;
            return `SET "${k}" = ${formatFieldSource(u.valueSource)}`;
          })
          .join(", ");
        lines.push(
          `// Step ${stepNum}: [UPDATE QUERY PARAMS] (${ops}) (${nav}, ${scroll})`,
        );
        break;
      }

      const key = draft.queryParamKey || "param";
      const mode = (draft.queryParamMode || "set").toUpperCase();
      const val = formatFieldSource(draft.queryParamValueSource);
      lines.push(
        `// Step ${stepNum}: [UPDATE QUERY PARAMS] ${mode} "${key}"${mode !== "REMOVE" && mode !== "TOGGLE" ? ` = ${val}` : ""} (${nav}, ${scroll})`,
      );
      break;
    }
    case "navigation": {
      const route = draft.targetRoute || "/";
      const bindings = draft.pathParamBindings || [];
      const method = draft.navMethod || "router_push";
      const fnName =
        method === "history_push"
          ? "history.pushState"
          : method === "history_replace"
          ? "history.replaceState"
          : method === "router_replace"
          ? "router.replace"
          : "router.push";
      if (bindings.length > 0) {
        let templateRoute = route;
        bindings.forEach((b) => {
          templateRoute = templateRoute.replace(
            new RegExp(`\\[${b.paramName}\\]`, "g"),
            `\${${formatFieldSource(b.source)}}`,
          );
        });
        lines.push(
          `// Step ${stepNum}: [NAVIGATE] -> ${fnName}(\`${templateRoute}\`) (${draft.navCondition || "direct"})`,
        );
        bindings.forEach((b) => {
          lines.push(`//         [${b.paramName}] <- ${formatFieldSource(b.source)}`);
        });
      } else {
        lines.push(
          `// Step ${stepNum}: [NAVIGATE] -> ${fnName}("${route}") (${draft.navCondition || "direct"})`,
        );
      }
      break;
    }
    case "state_mutation": {
      lines.push(
        `// Step ${stepNum}: [STATE MUTATION] ${draft.stateUpdateType || "set"} ${draft.stateKey || "state"}`,
      );
      break;
    }
    case "storage_put": {
      const bucket = draft.bucketName || draft.bucketId || "bucket";
      const fileKey = draft.fileSource?.key || "file";
      lines.push(
        `// Step ${stepNum}: [STORAGE PUT] -> ${bucket} (Payload: ${fileKey})`,
      );
      break;
    }
    case "api_call": {
      lines.push(`// Step ${stepNum}: [API CALL] /endpoint`);
      break;
    }
    case "transform": {
      const varName = draft.outputVariable || draft.name || "transformResult";
      const fnName = draft.functionRef?.name || draft.transformerName || "transformer";
      lines.push(`// Step ${stepNum}: [TRANSFORMER] const ${varName} = ${fnName}(...)`);
      break;
    }
    case "custom_code": {
      lines.push(`// Step ${stepNum}: [CUSTOM CODE]`);
      break;
    }
    case "condition": {
      lines.push(
        `// Step ${stepNum}: [CONDITION] if (${draft.conditionExpr || "condition"})`,
      );
      break;
    }
    case "notification": {
      lines.push(
        `// Step ${stepNum}: [NOTIFICATION] ${draft.notifyLevel || "info"}: "${draft.notifyMessage || ""}"`,
      );
      break;
    }
    case "reset_form": {
      lines.push(
        `// Step ${stepNum}: [RESET FORM] ${draft.formTarget || "form"}`,
      );
      break;
    }
  }
}

export function getActionFlowRuntime(
  item?: UIEventItem,
  canvasSteps: ActionStepItem[] = [],
  drafts: FrontendActionStepDraft[] = [],
): string {
  if (canvasSteps.length === 0 && drafts.length === 0) {
    return "// No execution steps configured for this action.";
  }

  const actionName = item?.name || "Action";
  const total = drafts.length > 0 ? drafts.length : canvasSteps.length;
  const lines: string[] = [
    `// Runtime execution plan for: ${actionName}`,
    `// Total sequential steps: ${total}`,
    "// ----------------------------------------------------",
  ];

  if (canvasSteps.length > 0) {
    canvasSteps.forEach((cStep, idx) => {
      const draft = drafts.find((d) => d.id === cStep.edgeId) || drafts[idx];
      const stepNum = idx + 1;

      if (cStep.isStorageRef) {
        const bucket = cStep.bucketName || "bucket";
        const op = cStep.operationName || "uploadObject";
        const sourceStepId = draft?.presignedUrlSource?.stepId;
        const priorStepIdx = canvasSteps.findIndex((s) => s.edgeId === sourceStepId);
        const urlRef =
          priorStepIdx >= 0
            ? `Step ${priorStepIdx + 1}.${draft?.presignedUrlSource?.fieldPath || "presignedUrl"}`
            : `<${draft?.presignedUrlSource?.fieldPath || "presignedUrl"}>`;

        const fileKey = draft?.fileSource
          ? `${draft.fileSource.kind === "state_var" ? "state." : "input."}${draft.fileSource.key}`
          : "file";
        const cType = draft?.contentType || "application/octet-stream";

        lines.push(
          `// Step ${stepNum}: [STORAGE PUT] -> ${bucket} (${op})`,
          `//         URL: ${urlRef}`,
          `//         Payload: ${fileKey}`,
          `//         Content-Type: ${cType}`,
        );
      } else {
        const method = cStep.endpoint?.type || "POST";
        const epPath = cStep.endpoint?.name || "/endpoint";
        const serviceName = cStep.targetNode?.data?.label || "Service";
        const bindings = draft?.requestBindings || [];
        const bindingStr =
          bindings.length > 0
            ? bindings
                .map((b) => {
                  const src =
                    b.source.kind === "literal"
                      ? `"${b.source.value}"`
                      : b.source.kind === "state_var"
                        ? (b.source.fieldPath || (b.source.storeName ? `${b.source.storeName}.${b.source.stateKey}` : `state.${b.source.stateKey}`))
                        : b.source.kind === "user_input"
                          ? `input.${b.source.fieldName}`
                          : b.source.kind === "route_param"
                            ? `params.${b.source.paramName}`
                            : b.source.kind === "query_param"
                              ? `query.${b.source.paramName}`
                              : b.source.kind === "session_storage"
                                ? `sessionStorage.${b.source.key}`
                                : b.source.kind === "local_storage"
                                  ? `localStorage.${b.source.key}`
                                  : b.source.kind === "cookie"
                                    ? `cookie.${b.source.cookieName}`
                                    : b.source.kind === "item_prop"
                                      ? `item.${b.source.propPath || b.source.fieldPath || "id"}`
                                      : b.source.kind === "realtime_payload"
                                        ? `stream.${b.source.fieldPath || "data"}`
                                        : b.source.kind === "auth_token"
                                      ? "auth.sessionToken"
                                      : `Step.${b.source.fieldPath || ""}`;
                  return `${b.targetField}: ${src}`;
                })
                .join(", ")
            : "default payload";

        lines.push(
          `// Step ${stepNum}: [API CALL] ${method} ${epPath} (${serviceName})`,
          `//         Body: { ${bindingStr} }`,
        );
      }
    });

    const nonCanvasDrafts = drafts.filter(
      (d) => !canvasSteps.some((c) => c.edgeId === d.id || c.edgeId === d.edgeId),
    );
    nonCanvasDrafts.forEach((draft, idx) => {
      const stepNum = canvasSteps.length + idx + 1;
      formatDraftStep(draft, stepNum, lines);
    });

    return lines.join("\n");
  }

  drafts.forEach((draft, idx) => {
    const stepNum = idx + 1;
    formatDraftStep(draft, stepNum, lines);
  });

  return lines.join("\n");
}


export {
  extractBaseTypeName,
  resolveItemPropsFromType,
  resolveItemPropsFromState,
} from "./itemPropUtils";
