import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas/types";
import { toPascalCase } from "../../utils";
import {
  SchemaItem,
  schemaToTsInterface,
} from "../schemaToTypeScript";
import {
  classifyEndpointShape,
  buildResponseInterfaceBody,
} from "../routeGenerator/endpointTypeClassifier";
import { ResponseFieldItem, ResponseInterfaceResult } from "./types";

export function inferBindingType(
  binding: {
    argName?: string;
    source?: { kind?: string; stepId?: string; field?: string; value?: unknown };
  },
  ep: Endpoint | undefined,
  nodes: BackendNode[],
  entityImports: Set<string>,
): string {
  const source = binding?.source;
  if (!source) return "Record<string, string | number | boolean | null>";

  if (source.kind === "step_output" && source.stepId && ep?.pipelineSteps) {
    const step = ep.pipelineSteps.find((s) => s.id === source.stepId);
    if (step) {
      if (step.type === "db_operation") {
        const dbNodeId =
          step.tableNodeId ||
          step.databaseId ||
          (step as { databaseNodeId?: string; targetTableId?: string }).databaseNodeId ||
          (step as { databaseNodeId?: string; targetTableId?: string }).targetTableId ||
          ep.databaseNodeId ||
          (ep.databaseNodeIds && ep.databaseNodeIds[0]);
        let dbNode = dbNodeId
          ? nodes.find((n) => n.id === dbNodeId)
          : nodes.find((n) => n.type === "database" || n.type === "entity");
        if (dbNode?.type === "db_ref" && dbNode.data?.tableRef) {
          const master = nodes.find((n) => n.id === dbNode!.data!.tableRef);
          if (master) dbNode = master;
        }
        const rawTableName = dbNode?.data?.label || dbNode?.data?.tableRef || "Entity";
        const pascalEntity = toPascalCase(rawTableName);
        if (pascalEntity) {
          entityImports.add(pascalEntity);
          const op = ((step as { operation?: string }).operation || "").toLowerCase();
          const fnName = (step.functionRef?.name || "").toLowerCase();
          if (source.field) {
            if (source.field === "message") {
              return "string | undefined";
            }
            if (source.field === "success") {
              return "boolean | undefined";
            }
            if (source.field === "length") {
              return "number";
            }
            const cleanField = source.field.replace(/^\[\d+\]\./, "").replace(/^\[n\]\./, "");
            const col = dbNode?.data?.columns?.find(
              (c: { name?: string; type?: string; isNotNull?: boolean; isPrimaryKey?: boolean }) =>
                c.name?.toLowerCase() === cleanField.toLowerCase(),
            );
            if (col) {
              const colType = (col.type || "string").toLowerCase();
              let tsType = "string";
              if (["integer", "int", "number", "float", "double", "real"].includes(colType)) {
                tsType = "number";
              } else if (["boolean", "bool"].includes(colType)) {
                tsType = "boolean";
              }
              const isOptional = !col.isNotNull && !col.isPrimaryKey;
              return isOptional ? `${tsType} | null | undefined` : `${tsType} | undefined`;
            }
            return "string | undefined";
          }
          if (op === "find_all" || op === "query" || fnName.startsWith("findall") || fnName.startsWith("list")) {
            return `${pascalEntity}[]`;
          }
          if (op === "delete") {
            return "{ success: boolean }";
          }
          if (
            op === "find_unique" ||
            op === "find_first" ||
            op === "find_by_id" ||
            op === "find_one" ||
            fnName.startsWith("findone") ||
            fnName.startsWith("findbyid") ||
            fnName.startsWith("getbyid")
          ) {
            return `${pascalEntity} | null`;
          }
          return pascalEntity;
        }
      }
      if (step.type === "external_call") {
        if (source.field) {
          return "string | number | boolean | null | undefined";
        }
        return "Record<string, string | number | boolean | null>";
      }
      if (step.type === "redis_operation") {
        const redisNodeId =
          (step as { redisNodeId?: string; tableNodeId?: string; databaseId?: string }).redisNodeId ||
          (step as { redisNodeId?: string; tableNodeId?: string; databaseId?: string }).tableNodeId ||
          (step as { redisNodeId?: string; tableNodeId?: string; databaseId?: string }).databaseId;
        const redisNode = redisNodeId
          ? nodes.find((n) => n.id === redisNodeId)
          : nodes.find((n) => n.type === "redis_schema" || n.type === "redis-cache" || n.type === "redis_instance" || n.data?.redisDataStructure || n.data?.dbType === "redis");
        const rawName = redisNode?.data?.label || redisNode?.data?.tableName || "Item";
        const pascalName = toPascalCase(rawName);
        const isJsonArray = redisNode?.data?.jsonRootType === "array" || step.functionRef?.returnIsArray === true;
        const itemType = isJsonArray ? `${pascalName}Item` : pascalName;
        const fnName = (step.functionRef?.name || (step as { operation?: string }).operation || step.name || "").toLowerCase();

        if (source.field) {
          if (source.field === "message") {
            return "string | undefined";
          }
          if (source.field === "success") {
            return "boolean | undefined";
          }
          const columns = redisNode?.data?.columns || [];
          const hashFields = redisNode?.data?.hashConfig?.fields;
          const matchedField =
            columns.find((c: { name?: string }) => c.name?.toLowerCase() === source.field?.toLowerCase()) ||
            hashFields?.find((f: { name?: string }) => f.name?.toLowerCase() === source.field?.toLowerCase());
          if (matchedField) {
            const fType = ((matchedField as { type?: string }).type || "string").toLowerCase();
            if (["integer", "int", "number", "float", "double"].includes(fType)) return "number | undefined";
            if (["boolean", "bool"].includes(fType)) return "boolean | undefined";
            return "string | undefined";
          }
          return "string | undefined";
        }

        if (fnName.includes("recent") || fnName.includes("all") || fnName.includes("list") || fnName.includes("range")) {
          if (itemType) entityImports.add(itemType);
          return `${itemType}[]`;
        }
        if (fnName.includes("get") || fnName.includes("pop")) {
          if (isJsonArray && fnName.includes("get")) {
            if (itemType) entityImports.add(itemType);
            return `${itemType}[] | null`;
          }
          if (itemType) entityImports.add(itemType);
          return `${itemType} | null`;
        }
        if (fnName.includes("length") || fnName.includes("len") || fnName.includes("append") || fnName.includes("push") || fnName.includes("count")) {
          return "number";
        }
        if (fnName.includes("delete") || fnName.includes("del") || fnName.includes("exist")) {
          return "boolean";
        }
        if (itemType) entityImports.add(itemType);
        return isJsonArray ? `${itemType}[] | null` : `${itemType} | null`;
      }
      if (step.type === "transform") {
        const transformerId = (step as { transformerNodeId?: string }).transformerNodeId;
        const fnName = step.functionRef?.name;
        const transNode = transformerId
          ? nodes.find((n) => n.id === transformerId)
          : nodes.find((n) => n.type === "transformer" || n.data?.label === fnName);
        const returnSchema = transNode?.data?.returnSchema;
        if (Array.isArray(returnSchema) && returnSchema.length > 0) {
          if (source.field) {
            const f = returnSchema.find((f: { name?: string }) => f.name === source.field);
            if (f?.type) return f.type;
          }
          const props = returnSchema.map((f: { name: string; type: string; required?: boolean }) =>
            `  ${f.name}${f.required ? "" : "?"}: ${f.type || "string"};`
          );
          return `{\n${props.join("\n")}\n}`;
        }
      }
      if (step.type === "storage_operation") {
        const fnName = (
          step.functionRef?.name ||
          (step as { operation?: string }).operation ||
          step.name ||
          ""
        ).toLowerCase();
        const isPresigned =
          fnName.includes("presigned") ||
          fnName.includes("presign") ||
          fnName === "getuploadpresignedurl" ||
          fnName === "getdownloadpresignedurl";
        const isExists = fnName.includes("exists") || fnName.includes("objectexists");
        const isDelete = fnName.includes("delete");
        const isList = fnName.includes("list");

        if (isPresigned) {
          if (source.field) {
            const fLower = source.field.toLowerCase();
            if (fLower === "expiresinseconds") return "number";
            if (fLower === "method" || fLower === "key" || fLower === "bucket") return "string";
          }
          return "string";
        }
        if (isExists) {
          return "boolean";
        }
        if (isDelete) {
          return "{ success: boolean }";
        }
        if (isList) {
          return "string[]";
        }
        return "string";
      }
      if (step.type === "variable") {
        const varType = (step.variableDataType || "").toLowerCase();
        if (["number", "integer", "int", "float", "double"].includes(varType)) return "number";
        if (["boolean", "bool"].includes(varType)) return "boolean";
        if (["array"].includes(varType) || varType.endsWith("[]")) return "string[]";
        if (["object", "record"].includes(varType)) return "Record<string, string | number | boolean | null>";
        if (varType && varType !== "string") return varType;
        if (step.variableSource?.kind === "inline") {
          const val = step.variableSource.value;
          if (typeof val === "number") return "number";
          if (typeof val === "boolean") return "boolean";
        }
        return "string";
      }
      if (step.type === "kafka_publish") {
        if (source.field === "success") return "boolean";
        if (source.field === "messageId" || source.field === "topic") return "string";
        return "{ success: boolean }";
      }
      if (step.type === "service_call") {
        if (source.field) return "string | number | boolean | null";
        return "Record<string, string | number | boolean | null>";
      }
      if (step.type === "langgraph_invoke") {
        if (step.langGraphAction === "history") {
          if (source.field === "values") return "Record<string, unknown>";
          if (source.field === "next") return "string[]";
          if (source.field === "messages") return "Array<{ id: string; role: string; content: string; tool_calls?: Array<{ id?: string; name?: string; args?: Record<string, string> }>; tool_call_id?: string; name?: string; status?: string; artifact?: string }>";
          if (step.langGraphHistoryFormat === "full_state") {
            return "{ threadId: string; values: Record<string, string | number | boolean | null>; next: string[] }";
          }
          if (step.langGraphHistoryPaginationEnabled) {
            return "{ messages: Array<{ id: string; role: string; content: string; tool_calls?: Array<{ id?: string; name?: string; args?: Record<string, string> }>; tool_call_id?: string; name?: string; status?: string; artifact?: string }>; pagination: { limit: number; next_cursor: string | null } }";
          }
          return "Array<{ id: string; role: string; content: string; tool_calls?: Array<{ id?: string; name?: string; args?: Record<string, string> }>; tool_call_id?: string; name?: string; status?: string; artifact?: string }>";
        }
        if (source.field) {
          if (
            source.field === "response" ||
            source.field === "content" ||
            source.field === "messages[last].content" ||
            source.field === "threadId" ||
            source.field === "message"
          ) {
            return "string";
          }
          if (source.field === "count") {
            return "number";
          }
          if (source.field === "messages") {
            return "unknown[]";
          }
          if (source.field === "state" || source.field === "finalState") {
            return "Record<string, unknown>";
          }
          const lgNode = nodes.find(
            (n) => n.id === step.langGraphTargetNodeId || (n.data?.label && n.data.label === step.name)
          );
          const stateChannels =
            (lgNode?.data?.stateChannels as { key?: string; type?: string }[] | undefined) || [];
          const ch = stateChannels.find((c) => c.key === source.field);
          if (ch?.type) {
            if (ch.type === "number") return "number";
            if (ch.type === "boolean") return "boolean";
            if (ch.type === "string") return "string";
            if (ch.type === "array" || ch.type === "messages") return "unknown[]";
            if (ch.type === "object" || ch.type === "json") return "Record<string, unknown>";
          }
          return "string | number | boolean | null | undefined";
        }
        if (step.langGraphOutputMode === "last_message") {
          return "string";
        }
        if (
          step.langGraphOutputMode === "specific_fields" &&
          step.langGraphOutputFields &&
          step.langGraphOutputFields.length > 0
        ) {
          const lgNode = nodes.find(
            (n) => n.id === step.langGraphTargetNodeId || (n.data?.label && n.data.label === step.name)
          );
          const stateChannels =
            (lgNode?.data?.stateChannels as { key?: string; type?: string }[] | undefined) || [];
          const props = step.langGraphOutputFields.map((f) => {
            if (f === "response" || f === "threadId" || f === "message") return `${f}?: string`;
            if (f === "count") return `${f}?: number`;
            if (f === "messages") return `${f}?: unknown[]`;
            if (f === "state") return `${f}?: Record<string, unknown>`;
            const ch = stateChannels.find((c) => c.key === f);
            if (ch?.type === "number") return `${f}?: number`;
            if (ch?.type === "boolean") return `${f}?: boolean`;
            if (ch?.type === "string") return `${f}?: string`;
            if (ch?.type === "array" || ch?.type === "messages") return `${f}?: unknown[]`;
            if (ch?.type === "object" || ch?.type === "json") return `${f}?: Record<string, unknown>`;
            return `${f}?: string | number | boolean | null | undefined`;
          });
          return `{ ${props.join("; ")} }`;
        }
        return "{ response: string; threadId?: string; state?: Record<string, unknown> }";
      }
    }
  }

  if (source.kind === "req_body") {
    if (source.field) {
      if (ep?.requestBody?.fields && ep.requestBody.fields.length > 0) {
        const f = ep.requestBody.fields.find(
          (field) => (field.name || field.key)?.toLowerCase() === source.field?.toLowerCase(),
        );
        if (f?.type) {
          const t = f.type.toLowerCase();
          if (["number", "integer", "int", "float", "double"].includes(t)) return "number";
          if (["boolean", "bool"].includes(t)) return "boolean";
          if (["array"].includes(t)) return "string[]";
          if (["object", "record"].includes(t)) return "Record<string, unknown>";
          return "string";
        }
      }
      if (ep?.requestBody?.rawJson) {
        try {
          const parsed = JSON.parse(ep.requestBody.rawJson);
          if (parsed && typeof parsed === "object" && source.field in parsed) {
            const val = parsed[source.field];
            if (typeof val === "number") return "number";
            if (typeof val === "boolean") return "boolean";
            if (Array.isArray(val)) return "string[]";
            if (val && typeof val === "object") return "Record<string, string | number | boolean | null>";
            return "string";
          }
        } catch {
          // ignore invalid json in rawJson
        }
      }
      return "string";
    }
    return "Record<string, string | number | boolean | null>";
  }

  if (source.kind === "auth") {
    if (source.field) {
      const fieldLower = source.field.toLowerCase();
      if (fieldLower === "expiresat") return "number";
      const userNode = nodes.find(
        (n) => n.type === "entity" && (n.data?.label?.toLowerCase() === "user" || n.data?.label?.toLowerCase() === "users")
      );
      const col = userNode?.data?.columns?.find(
        (c: { name?: string }) => c.name?.toLowerCase() === fieldLower
      );
      if (col?.type) {
        const colType = col.type.toLowerCase();
        if (["integer", "int", "number", "float", "double"].includes(colType)) return "number";
        if (["boolean", "bool"].includes(colType)) return "boolean";
      }
      return "string";
    }
    return "{ id: string; userId: string; username: string; email?: string; role?: string; name?: string; sessionToken?: string; expiresAt?: number }";
  }

  if (source.kind === "req_params" || source.kind === "req_param") {
    if (source.field) {
      const p = [...(ep?.pathParams || []), ...(ep?.queryParams || [])].find(
        (param) => param.name?.toLowerCase() === source.field?.toLowerCase(),
      );
      if (p?.type) {
        const t = p.type.toLowerCase();
        if (["number", "integer", "int", "float", "double"].includes(t)) return "number";
        if (["boolean", "bool"].includes(t)) return "boolean";
        if (["array"].includes(t)) return "string[]";
        return "string";
      }
      return "string";
    }
    return "Record<string, string>";
  }

  if (source.kind === "req_query") {
    if (source.field) {
      const q = ep?.queryParams?.find(
        (param) => param.name?.toLowerCase() === source.field?.toLowerCase(),
      );
      let baseType = "string";
      if (q?.type) {
        const t = q.type.toLowerCase();
        if (["number", "integer", "int", "float", "double"].includes(t)) baseType = "number";
        else if (["boolean", "bool"].includes(t)) baseType = "boolean";
        else if (["array"].includes(t)) baseType = "string[]";
      }
      const isRequired = q?.required === true;
      return isRequired ? baseType : `${baseType} | undefined`;
    }
    return "Record<string, string | string[] | undefined>";
  }

  if (source.kind === "req_headers" || source.kind === "req_header") {
    if (source.field) {
      const h = ep?.headers?.find(
        (header) => header.name?.toLowerCase() === source.field?.toLowerCase(),
      );
      let baseType = "string";
      if (h?.type) {
        const t = h.type.toLowerCase();
        if (["number", "integer", "int", "float", "double"].includes(t)) baseType = "number";
        else if (["boolean", "bool"].includes(t)) baseType = "boolean";
      }
      const isRequired = h?.required === true;
      return isRequired ? baseType : `${baseType} | undefined`;
    }
    return "Record<string, string | string[] | undefined>";
  }

  if (source.kind === "literal" || source.kind === "inline") {
    if (typeof source.value === "number") return "number";
    if (typeof source.value === "boolean") return "boolean";
    if (typeof source.value === "string") return "string";
    return "string | number | boolean | null";
  }

  if (source.kind === "env") {
    return "string";
  }

  if (source.kind === "context") {
    if (source.field === "timestamp") return "string";
    if (source.field === "user") return "Record<string, string | number | boolean | null>";
    return "string";
  }

  // Fallback 1: Check if the endpoint's configured responseBody has a field with this argName
  if (binding.argName) {
    const cleanArg = binding.argName.trim().toLowerCase();
    if (ep?.responseBody?.fields) {
      const rf = ep.responseBody.fields.find(
        (f) => (f.name || f.key)?.toLowerCase() === cleanArg
      );
      if (rf?.type) {
        const t = rf.type.toLowerCase();
        if (["number", "integer", "int", "float", "double"].includes(t)) return "number";
        if (["boolean", "bool"].includes(t)) return "boolean";
        if (["array"].includes(t)) return "string[]";
        if (["object", "record"].includes(t)) return "Record<string, string | number | boolean | null>";
        if (t !== "string") return rf.type;
      }
    }
    if (ep?.responseFields) {
      const rf = ep.responseFields.find(
        (f) => f.name?.toLowerCase() === cleanArg
      );
      if (rf?.type) {
        const t = rf.type.toLowerCase();
        if (["number", "integer", "int", "float", "double"].includes(t)) return "number";
        if (["boolean", "bool"].includes(t)) return "boolean";
        if (["array"].includes(t)) return "string[]";
        if (["object", "record"].includes(t)) return "Record<string, string | number | boolean | null>";
        if (t !== "string") return rf.type;
      }
    }
  }

  // If a field was specified on the source, it is a single property (not a Record dictionary)
  if (source.field) {
    return "string";
  }

  return "Record<string, string | number | boolean | null>";
}

export function generateResponseInterface(
  interfaceName: string,
  responseFields: ResponseFieldItem[] = [],
  legacyResponseBody?: SchemaItem,
  nodes: BackendNode[] = [],
  ep?: Endpoint,
  serviceNode?: BackendNode,
  edges: BackendEdge[] = [],
): ResponseInterfaceResult {
  const entityImports = new Set<string>();

  // 0. Streaming LangGraph / Pipeline Step check
  // When an endpoint has streaming enabled (e.g. LangGraph SSE), the Express route handler
  // hijacks the response stream and streams data chunks over HTTP, bypassing standard JSON returns.
  if (ep?.pipelineSteps && ep.pipelineSteps.length > 0) {
    const streamingStep = ep.pipelineSteps.find(
      (s) =>
        s.enabled !== false &&
        (s.langGraphStreamingEnabled ||
          (s.type === "langgraph_invoke" && Boolean(s.langGraphStreamingEnabled))),
    );
    if (streamingStep) {
      const code = `/**
 * Token usage metrics payload for real-time stream execution
 */
export interface UsagePayload {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
}

/**
 * Invoked tool call metadata emitted during execution
 */
export interface StreamToolCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

/**
 * Real-time Streaming Stream Result for ${interfaceName}
 * Emitted when the LangGraph agent invocation streams tokens/updates over SSE or raw stream.
 */
export interface ${interfaceName} {
  content: string;
  tokens: string[];
  reasoning?: string;
  reasoningTokens?: string[];
  updates?: Array<{ node?: string; data: Record<string, unknown> }>;
  custom?: unknown[];
  values?: Record<string, unknown>;
  threadId?: string;
  usage?: UsagePayload;
  done?: boolean;
  streamed: true;
  raw?: string;
}

/**
 * Individual SSE event chunk received over the wire for ${interfaceName}
 */
export interface ${interfaceName}StreamChunk {
  token?: string;
  node?: string;
  type?: "reasoning" | "update" | "custom" | "values" | "session" | string;
  mode?: string;
  data?: unknown;
  reasoning?: string;
  tool_call?: StreamToolCall;
  tool_calls?: StreamToolCall[];
  usage?: UsagePayload;
  done?: boolean;
  content?: string;
  response?: string;
  threadId?: string;
  thread_id?: string;
  raw?: string;
}
`;
      return { code, entityImports };
    }
  }

  // 1. Explicit Pipeline Steps with return_response (from PipelineStepEditor)
  // When an endpoint has a return_response step, that step defines the actual code emitted by the route handler.
  if (ep?.pipelineSteps && ep.pipelineSteps.length > 0) {
    const returnStep = ep.pipelineSteps.find(
      (s) => s.type === "return_response" && s.enabled !== false,
    );

    if (returnStep) {
      const bindings = returnStep.inputBindings || [];
      const firstBinding = bindings[0];
      if (
        bindings.length === 1 &&
        firstBinding &&
        (firstBinding.argName === "_spread" ||
          !firstBinding.argName)
      ) {
        if (
          firstBinding.source.kind === "req_body" &&
          !firstBinding.source.field
        ) {
          const bodyInterfaceName = interfaceName.replace(/Response$/, "Body");
          return {
            code: `export type ${interfaceName} = ${bodyInterfaceName};\n`,
            entityImports,
          };
        }
        const bindingType = inferBindingType(firstBinding, ep, nodes, entityImports);
        return {
          code: `export type ${interfaceName} = ${bindingType};\n`,
          entityImports,
        };
      } else if (bindings.length > 0) {
        const props: string[] = [];
        for (const b of bindings) {
          const propName = b.argName?.trim() || "data";
          const tsType = inferBindingType(b, ep, nodes, entityImports);
          const isOptional = tsType.includes("undefined");
          props.push(`  ${propName}${isOptional ? "?" : ""}: ${tsType};`);
        }
        return {
          code: `export interface ${interfaceName} {\n${props.join("\n")}\n}\n`,
          entityImports,
        };
      } else {
        return {
          code: `export interface ${interfaceName} {\n  message: string;\n}\n`,
          entityImports,
        };
      }
    }
  }

  // 2. Explicit response fields (from EndpointConfig.tsx)
  if (responseFields && responseFields.length > 0) {
    const props: string[] = [];

    for (const field of responseFields) {
      const isRequired = field.required !== false;
      const propName = field.name || "field";
      let tsType = "string";

      if (field.type && field.type.startsWith("db:")) {
        const parts = field.type.split(":");
        const tableNodeId = parts[1];
        const category = parts[2] || "single";
        const tableNode = nodes.find((n) => n.id === tableNodeId);
        const rawTableName =
          tableNode?.data?.label || tableNode?.data?.tableRef || "Entity";
        const pascalEntity = toPascalCase(rawTableName);

        if (pascalEntity) {
          entityImports.add(pascalEntity);
        }

        const cols: string[] = field.selectedColumns || [];
        const hasPick = category.startsWith("partial") && cols.length > 0;
        const pickUnion = hasPick ? cols.map((c) => `"${c}"`).join(" | ") : "";

        if (category === "single") {
          tsType = pascalEntity;
        } else if (category === "array") {
          tsType = `${pascalEntity}[]`;
        } else if (category === "partial_single") {
          tsType = hasPick ? `Pick<${pascalEntity}, ${pickUnion}>` : pascalEntity;
        } else if (category === "partial_array") {
          tsType = hasPick ? `Pick<${pascalEntity}, ${pickUnion}>[]` : `${pascalEntity}[]`;
        }
      } else {
        switch (field.type) {
          case "string":
          case "UUID":
          case "timestamp":
            tsType = "string";
            break;
          case "number":
            tsType = "number";
            break;
          case "boolean":
            tsType = "boolean";
            break;
          case "object":
            tsType = "Record<string, string | number | boolean | null>";
            break;
          case "array":
            tsType = "string[]";
            break;
          default:
            tsType = "string";
        }
      }

      props.push(`  ${propName}${isRequired ? "" : "?"}: ${tsType};`);
    }

    const code = `export interface ${interfaceName} {\n${props.join("\n")}\n}\n`;
    return { code, entityImports };
  }

  // 3. Explicit responseBody (from EndpointConfig.tsx / NestedResponseSchemaEditor)
  const legacy = schemaToTsInterface(interfaceName, legacyResponseBody);
  if (legacy.hasContent) {
    // Augment with `data?` field if schema doesn't already have it
    if (
      legacy.code.includes(`export interface ${interfaceName}`) &&
      !legacy.code.includes("data:") &&
      !legacy.code.includes("data?:")
    ) {
      const lastBraceIndex = legacy.code.lastIndexOf("}");
      if (lastBraceIndex !== -1) {
        const entityShape = ep ? classifyEndpointShape(ep, nodes, edges) : { kind: "unknown" as const };
        if (entityShape.kind === "entity") {
          entityImports.add(entityShape.entity);
          const dataType = entityShape.cardinality === "one" ? entityShape.entity : `${entityShape.entity}[]`;
          const augmentedCode =
            legacy.code.slice(0, lastBraceIndex) +
            `  data?: ${dataType};\n` +
            legacy.code.slice(lastBraceIndex);
          return { code: augmentedCode, entityImports };
        }
      }
    }
    return { code: legacy.code, entityImports };
  }

  // 4. Pipeline Steps without explicit return_response step
  if (ep?.pipelineSteps && ep.pipelineSteps.length > 0) {
    const lastStep = [...ep.pipelineSteps].reverse().find((s) => s.enabled !== false);
    let lastDataType = "Record<string, string | number | boolean | null>";
    if (lastStep?.type === "db_operation") {
      const dbNodeId =
        lastStep.tableNodeId ||
        lastStep.databaseId ||
        (lastStep as { databaseNodeId?: string; targetTableId?: string }).databaseNodeId ||
        (lastStep as { databaseNodeId?: string; targetTableId?: string }).targetTableId ||
        ep.databaseNodeId ||
        (ep.databaseNodeIds && ep.databaseNodeIds[0]);
      let dbNode = dbNodeId
        ? nodes.find((n) => n.id === dbNodeId)
        : nodes.find((n) => n.type === "database" || n.type === "entity");
      if (dbNode?.type === "db_ref" && dbNode.data?.tableRef) {
        const master = nodes.find((n) => n.id === dbNode!.data!.tableRef);
        if (master) dbNode = master;
      }
      const rawTableName = dbNode?.data?.label || dbNode?.data?.tableRef || "Entity";
      const pascalEntity = toPascalCase(rawTableName);
      if (pascalEntity) {
        entityImports.add(pascalEntity);
        const op = ((lastStep as { operation?: string }).operation || "").toLowerCase();
        lastDataType = op === "find_all" || op === "query" ? `${pascalEntity}[]` : pascalEntity;
      }
    } else if (lastStep?.type === "redis_operation") {
      const redisNodeId =
        (lastStep as { redisNodeId?: string; tableNodeId?: string; databaseId?: string }).redisNodeId ||
        (lastStep as { redisNodeId?: string; tableNodeId?: string; databaseId?: string }).tableNodeId ||
        (lastStep as { redisNodeId?: string; tableNodeId?: string; databaseId?: string }).databaseId;
      const redisNode = redisNodeId
        ? nodes.find((n) => n.id === redisNodeId)
        : nodes.find((n) => n.type === "redis_schema" || n.type === "redis-cache" || n.type === "redis_instance" || n.data?.redisDataStructure || n.data?.dbType === "redis");
      const rawName = redisNode?.data?.label || redisNode?.data?.tableName || "Item";
      const pascalName = toPascalCase(rawName);
      const itemType = `${pascalName}Item`;
      const fnName = (lastStep.functionRef?.name || (lastStep as { operation?: string }).operation || lastStep.name || "").toLowerCase();

      if (fnName.includes("recent") || fnName.includes("all") || fnName.includes("list") || fnName.includes("range")) {
        if (itemType) entityImports.add(itemType);
        lastDataType = `${itemType}[]`;
      } else if (fnName.includes("get") || fnName.includes("pop")) {
        if (itemType) entityImports.add(itemType);
        lastDataType = `${itemType} | null`;
      } else if (fnName.includes("length") || fnName.includes("len") || fnName.includes("append") || fnName.includes("push") || fnName.includes("count")) {
        lastDataType = "number";
      } else if (fnName.includes("delete") || fnName.includes("del") || fnName.includes("exist")) {
        lastDataType = "boolean";
      } else {
        if (itemType) entityImports.add(itemType);
        lastDataType = itemType;
      }
    } else if (lastStep?.type === "transform") {
      const transformerId = (lastStep as { transformerNodeId?: string }).transformerNodeId;
      const fnName = lastStep.functionRef?.name;
      const transNode = transformerId
        ? nodes.find((n) => n.id === transformerId)
        : nodes.find((n) => n.type === "transformer" || n.data?.label === fnName);
      const returnSchema = transNode?.data?.returnSchema;
      if (Array.isArray(returnSchema) && returnSchema.length > 0) {
        const props = returnSchema.map((f: { name: string; type: string; required?: boolean }) =>
          `  ${f.name}${f.required ? "" : "?"}: ${f.type || "string"};`
        );
        lastDataType = `{\n${props.join("\n")}\n}`;
      }
    } else if (lastStep?.type === "langgraph_invoke") {
      if (lastStep.langGraphAction === "history") {
        if (lastStep.langGraphHistoryFormat === "full_state") {
          lastDataType = "{\n  threadId: string;\n  values: Record<string, unknown>;\n  next: string[];\n}";
        } else if (lastStep.langGraphHistoryPaginationEnabled) {
          lastDataType = "{\n  messages: Array<{\n    id: string;\n    role: string;\n    content: string;\n    tool_calls?: Array<{ id?: string; name?: string; args?: Record<string, string> }>;\n    tool_call_id?: string;\n    name?: string;\n    status?: string;\n    artifact?: string;\n  }>;\n  pagination: {\n    limit: number;\n    next_cursor: string | null;\n  };\n}";
        } else {
          lastDataType = "Array<{\n  id: string;\n  role: string;\n  content: string;\n  tool_calls?: Array<{ id?: string; name?: string; args?: Record<string, string> }>;\n  tool_call_id?: string;\n  name?: string;\n  status?: string;\n  artifact?: string;\n}>";
        }
      } else if (lastStep.langGraphOutputMode === "last_message") {
        lastDataType = "string";
      } else if (
        lastStep.langGraphOutputMode === "specific_fields" &&
        lastStep.langGraphOutputFields &&
        lastStep.langGraphOutputFields.length > 0
      ) {
        const lgNode = nodes.find(
          (n) => n.id === lastStep.langGraphTargetNodeId || (n.data?.label && n.data.label === lastStep.name)
        );
        const stateChannels =
          (lgNode?.data?.stateChannels as { key?: string; type?: string }[] | undefined) || [];
        const props = lastStep.langGraphOutputFields.map((f) => {
          if (f === "response" || f === "threadId" || f === "message") return `${f}?: string`;
          if (f === "count") return `${f}?: number`;
          if (f === "messages") return `${f}?: unknown[]`;
          if (f === "state") return `${f}?: Record<string, unknown>`;
          const ch = stateChannels.find((c) => c.key === f);
          if (ch?.type) {
            if (ch.type === "number") return `${f}?: number`;
            if (ch.type === "boolean") return `${f}?: boolean`;
            if (ch.type === "string") return `${f}?: string`;
            if (ch.type === "array" || ch.type === "messages") return `${f}?: unknown[]`;
            if (ch.type === "object" || ch.type === "json") return `${f}?: Record<string, unknown>`;
          }
          return `${f}?: string | number | boolean | null | undefined`;
        });
        lastDataType = `{ ${props.join("; ")} }`;
      } else {
        lastDataType = "{ response: string; threadId?: string; state?: Record<string, unknown> }";
      }
    }
    return {
      code: `export interface ${interfaceName} {\n  data: ${lastDataType};\n}\n`,
      entityImports,
    };
  }

  // 5. Output JSON string (from EndpointList.tsx / Endpoint)
  if (ep?.output && ep.output.trim()) {
    try {
      const parsed = JSON.parse(ep.output.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const props: string[] = [];
        for (const [key, val] of Object.entries(parsed)) {
          const valType =
            typeof val === "number"
              ? "number"
              : typeof val === "boolean"
              ? "boolean"
              : typeof val === "string"
              ? "string"
              : Array.isArray(val)
              ? val.length > 0 && typeof val[0] === "number"
                ? "number[]"
                : val.length > 0 && typeof val[0] === "boolean"
                ? "boolean[]"
                : "string[]"
              : "Record<string, string | number | boolean | null>";
          props.push(`  ${key}: ${valType};`);
        }
        return {
          code: `export interface ${interfaceName} {\n${props.join("\n")}\n}\n`,
          entityImports,
        };
      }
    } catch {
      // Proceed to fallback inference
    }
  }

  // 6. Database linkage
  const shape = ep ? classifyEndpointShape(ep, nodes, edges) : { kind: "unknown" as const };
  if (shape.kind === "entity") {
    entityImports.add(shape.entity);
    const dataType =
      shape.cardinality === "one"
        ? shape.entity
        : `${shape.entity}[]`;
    const code =
      `export interface ${interfaceName} {\n` +
      `  message: string;\n` +
      `  data: ${dataType};\n` +
      (shape.cardinality === "many" ? `  total?: number;\n` : "") +
      `}\n`;
    return { code, entityImports };
  }

  // 7. Endpoint on ServiceNode (Health check or Default endpoint without custom schema)
  const isHealth = shape.kind === "health";
  if (isHealth) {
    const code =
      `export interface ${interfaceName} {\n` +
      `  message: string;\n` +
      `  status?: string;\n` +
      `  service?: string;\n` +
      `  timestamp?: string;\n` +
      `  user?: {\n` +
      `    id: string;\n` +
      `    userId?: string;\n` +
      `    username?: string;\n` +
      `    role: string;\n` +
      `    email?: string;\n` +
      `    name?: string;\n` +
      `    sessionToken?: string;\n` +
      `    [key: string]: string | number | boolean | null | undefined;\n` +
      `  } | null;\n` +
      `}\n`;
    return { code, entityImports };
  }

  // 8. General fallback
  const code = buildResponseInterfaceBody(interfaceName, shape, entityImports);
  return { code, entityImports };
}
