import {
  BackendNode,
  BackendEdge,
  RealtimeConnection,
  PipelineStep,
  EndpointWithNode,
} from "@workspace/canvas/types";
import { AvailablePath } from "../pipeline-step-editor/types";
import { DerivedRealtimeInfo } from "./types";
import { parseSchemaJson, toPascalCase, toSingular } from "@/lib/compiler/utils";
import { extractPathsFromObject } from "../pipeline-step-editor/sourcePaths";

interface ResolveRealtimePayloadPathsArgs {
  conn: RealtimeConnection;
  derivedInfo?: DerivedRealtimeInfo | null;
  endpoints: EndpointWithNode[];
  events: Array<{ id: string; name: string; payloadSchema?: { fields?: Array<{ name: string; type?: string; description?: string }>; rawJson?: string } }>;
  nodes: BackendNode[];
  edges?: BackendEdge[];
}

/**
 * Strips route parameter variables (e.g. "/send-message/:id" -> "send-message")
 */
function cleanRouteName(route?: string): string {
  if (!route) return "";
  return route
    .replace(/^\//, "")
    .replace(/:[a-zA-Z0-9_]+/g, "")
    .replace(/\[[a-zA-Z0-9_]+\]/g, "")
    .replace(/\/+/g, " ")
    .replace(/[-_]+/g, " ")
    .trim();
}

/**
 * Extracts comprehensive, typed available paths for an incoming real-time payload.
 * Inspects:
 * 1. Linked push_to_client step inputBindings and target entities
 * 2. Prior db_operation steps in the source endpoint pipeline
 * 3. Endpoint responseBody and requestBody schemas
 * 4. Connected Database Entity nodes on the canvas
 * 5. Meaningful inferred TypeScript interface types (e.g. Message, SendMessagePayload) instead of generic "object"
 */
export function resolveRealtimePayloadPaths({
  conn,
  derivedInfo,
  endpoints,
  events,
  nodes,
  edges = [],
}: ResolveRealtimePayloadPathsArgs): AvailablePath[] {
  const paths: AvailablePath[] = [];
  const seenPaths = new Set<string>();

  const addPath = (path: string, type: string, description?: string) => {
    if (!path || seenPaths.has(path)) return;
    // Replace any generic "object" with a proper type name if needed
    const resolvedType =
      type === "object" || !type
        ? `${toPascalCase(path.split(".").pop() || "Event")}Payload`
        : type;
    seenPaths.add(path);
    paths.push({ path, type: resolvedType, description });
  };

  // 1. Find all accessible endpoints across top-level endpoints and embedded service endpoints
  const allEndpoints: EndpointWithNode[] = [];
  endpoints.forEach((e) => allEndpoints.push(e));
  nodes.forEach((n) => {
    const embedded = n.data?.endpoints;
    if (Array.isArray(embedded)) {
      embedded.forEach((item) => {
        allEndpoints.push({
          ...item,
          nodeId: n.id,
        });
      });
    }
  });

  // 2. Resolve matching endpoint
  const targetEndpointId = derivedInfo?.sourceEndpointId;
  const targetItemName = conn.sourceItemName || conn.eventName || "";

  const ep = targetEndpointId
    ? allEndpoints.find((e) => e.id === targetEndpointId)
    : allEndpoints.find((e) => {
        if (!e.name) return false;
        const normE = e.name.toLowerCase().replace(/^\//, "");
        const normTarget = targetItemName.toLowerCase().replace(/^\//, "");
        return normE === normTarget || normE === normTarget.replace(/:[a-zA-Z0-9_]+/g, "").trim();
      });

  // 3. Resolve source service node
  const epNodeId = ep?.nodeId;
  const serviceNode =
    (conn.sourceServiceNodeId && nodes.find((n) => n.id === conn.sourceServiceNodeId)) ||
    derivedInfo?.sourceNode ||
    (epNodeId ? nodes.find((n) => n.id === epNodeId) : undefined) ||
    (conn.sourceServiceLabel &&
      nodes.find(
        (n) =>
          n.type === "service" &&
          (n.data?.label?.toLowerCase() === conn.sourceServiceLabel?.toLowerCase() ||
            n.data?.name?.toLowerCase() === conn.sourceServiceLabel?.toLowerCase()),
      ));

  // 4. Resolve connected Entity nodes for the service
  const connectedEntities: BackendNode[] = [];
  if (serviceNode) {
    const serviceEdges = edges.filter(
      (e) => e.source === serviceNode.id || e.target === serviceNode.id,
    );
    serviceEdges.forEach((e) => {
      const otherId = e.source === serviceNode.id ? e.target : e.source;
      const otherNode = nodes.find((n) => n.id === otherId);
      if (otherNode && (otherNode.type === "entity" || otherNode.type === "db_ref")) {
        const resolved =
          otherNode.type === "db_ref" && otherNode.data?.tableRef
            ? nodes.find((m) => m.id === otherNode.data?.tableRef) || otherNode
            : otherNode;
        if (!connectedEntities.some((ce) => ce.id === resolved.id)) {
          connectedEntities.push(resolved);
        }
      }
    });
  }

  // Also include entities whose names match words in the route (e.g. "send-message" -> "Message")
  const routeWords = cleanRouteName(targetItemName).split(" ").filter(Boolean);
  nodes.forEach((n) => {
    if (n.type === "entity") {
      const entityLabel = (n.data?.label || n.data?.name || "").toLowerCase();
      const entitySingular = toSingular(entityLabel);
      if (
        routeWords.some(
          (w) =>
            toSingular(w.toLowerCase()) === entitySingular ||
            entitySingular.includes(toSingular(w.toLowerCase())),
        )
      ) {
        if (!connectedEntities.some((ce) => ce.id === n.id)) {
          connectedEntities.push(n);
        }
      }
    }
  });

  const primaryEntity = connectedEntities[0];
  const primaryEntityName = primaryEntity
    ? toPascalCase(toSingular(primaryEntity.data?.label || primaryEntity.data?.name || "Entity"))
    : toPascalCase(cleanRouteName(targetItemName)) || "EventPayload";

  // 4b. Check for LangGraph Invoke streaming step
  const langGraphStep =
    (derivedInfo?.step?.type === "langgraph_invoke" ? derivedInfo.step : undefined) ||
    ep?.pipelineSteps?.find((s) => s.type === "langgraph_invoke") ||
    (conn.isLangGraph ? derivedInfo?.step : undefined);

  if (langGraphStep && (langGraphStep.langGraphStreamingEnabled || conn.isLangGraph)) {
    const rawModes =
      langGraphStep.langGraphStreamModes ||
      conn.langGraphStreamModes ||
      ["messages"];
    const activeModes = rawModes.length > 0 ? rawModes : ["messages"];
    const includeReasoning =
      langGraphStep.langGraphStreamIncludeReasoning ??
      conn.langGraphStreamIncludeReasoning ??
      true;

    // 1. LLM Tokens mode ('messages')
    if (activeModes.includes("messages")) {
      addPath("token", "string", "Streamed LLM token chunk");
      addPath("node", "string", "Graph node emitting the token");
      if (includeReasoning) {
        addPath("reasoning", "string", "Model reasoning / thinking tokens");
      }
    }

    // 2. Agent Progress mode ('updates')
    if (activeModes.includes("updates")) {
      addPath("data", "Record<string, any>", "State delta emitted after node completes");
      addPath("node", "string", "Completed node name");
      addPath("mode", "string", "Stream mode ('updates')");
    }

    // 3. Full State mode ('values')
    if (activeModes.includes("values")) {
      addPath("data", "Record<string, any>", "Full graph state snapshot after step");
      addPath("mode", "string", "Stream mode ('values')");

      // Extract channels from linked LangGraph node
      const lgTargetId = langGraphStep.langGraphTargetNodeId || conn.langGraphTargetNodeId;
      const lgNode =
        (lgTargetId ? nodes.find((n) => n.id === lgTargetId && n.type === "langgraph") : undefined) ||
        nodes.find((n) => n.type === "langgraph");

      const rawChannels = lgNode?.data?.stateChannels;
      if (Array.isArray(rawChannels)) {
        rawChannels.forEach((ch: { key?: string; type?: string }) => {
          if (ch?.key) {
            addPath(`data.${ch.key}`, ch.type || "any", `State channel: ${ch.key}`);
            addPath(ch.key, ch.type || "any", `State channel: ${ch.key}`);
          }
        });
      }
    }

    // 4. Custom Events mode ('custom')
    if (activeModes.includes("custom")) {
      addPath("data", "any", "Arbitrary event payload via config.writer");
      addPath("mode", "string", "Stream mode ('custom')");
    }

    // Event & Chunk metadata
    addPath("type", "string", "Chunk/event type ('stream_start' | 'token' | 'reasoning' | 'tool_call' | 'update' | 'values' | 'custom' | 'usage' | 'stream_end')");
    addPath("mode", "string", "Active stream mode");

    // Tool calls
    addPath("tool_call", "any", "Invoked tool call metadata");
    addPath("tool_calls", "any[]", "List of tool calls executed during streaming");

    // Token usage metrics
    addPath("usage", "object", "Token usage metrics ({ input_tokens, output_tokens, total_tokens })");
    addPath("usage.input_tokens", "number", "Input / prompt tokens consumed");
    addPath("usage.output_tokens", "number", "Output / completion tokens consumed");
    addPath("usage.total_tokens", "number", "Total tokens consumed");

    // Stream status & convenience helpers
    addPath("done", "boolean", "Stream completion indicator (true when done)");
    addPath("content", "string", "Accumulated text content from streamed tokens");
    addPath("response", "string", "Accumulated text response");
    addPath("threadId", "string", "Active session / conversation thread ID");
    addPath("thread_id", "string", "Active session / conversation thread ID");
    addPath("raw", "string", "Raw incoming stream event chunk");

    return paths;
  }

  // 5. Inspect push_to_client step in endpoint pipeline
  const pushStep: PipelineStep | undefined =
    derivedInfo?.step ||
    ep?.pipelineSteps?.find((s) => s.type === "push_to_client");

  if (pushStep && pushStep.inputBindings && pushStep.inputBindings.length > 0) {
    pushStep.inputBindings.forEach((b) => {
      if (!b.argName) return;

      if (b.source && "kind" in b.source && b.source.kind === "step_output") {
        const stepId = "stepId" in b.source ? b.source.stepId : undefined;
        const sourceField = "field" in b.source ? b.source.field : undefined;
        const targetStep = ep?.pipelineSteps?.find((s) => s.id === stepId);

        let entityForStep = primaryEntity;
        if (targetStep && "tableNodeId" in targetStep && targetStep.tableNodeId) {
          const matched = nodes.find((n) => n.id === targetStep.tableNodeId);
          if (matched) entityForStep = matched;
        }

        if (sourceField) {
          const col = entityForStep?.data?.columns?.find(
            (c: { name?: string; type?: string }) => c.name?.toLowerCase() === sourceField.toLowerCase(),
          );
          addPath(b.argName, col?.type || "string", `${primaryEntityName} ${b.argName}`);
        } else if (entityForStep) {
          const entityTypeName = toPascalCase(
            toSingular(entityForStep.data?.label || entityForStep.data?.name || "Entity"),
          );
          addPath(b.argName, entityTypeName, `${entityTypeName} payload object`);
          (entityForStep.data?.columns || []).forEach(
            (col: { name?: string; type?: string; description?: string }) => {
              if (col.name) {
                addPath(
                  `${b.argName}.${col.name}`,
                  col.type || "string",
                  col.description || `${entityTypeName} ${col.name}`,
                );
              }
            },
          );
        }
      } else if (b.source && "kind" in b.source && b.source.kind === "req_body") {
        const sourceField = "field" in b.source ? b.source.field : undefined;
        const reqField = ep?.requestBody?.fields?.find((f) => f.name === sourceField);
        addPath(b.argName, reqField?.type || "string", reqField?.description);
      } else {
        addPath(b.argName, "string", `Pushed parameter ${b.argName}`);
      }
    });
  }

  // 6. Inspect prior db_operation in endpoint pipeline if push_to_client didn't provide full fields
  if (paths.length === 0 && ep?.pipelineSteps) {
    const dbSteps = ep.pipelineSteps.filter((s) => s.type === "db_operation");
    const lastDbStep = dbSteps[dbSteps.length - 1];
    if (lastDbStep) {
      let stepEntity = primaryEntity;
      const targetTableId =
        "tableNodeId" in lastDbStep
          ? lastDbStep.tableNodeId
          : "databaseId" in lastDbStep
          ? lastDbStep.databaseId
          : undefined;
      if (targetTableId) {
        const matched = nodes.find((n) => n.id === targetTableId);
        if (matched) stepEntity = matched;
      }
      if (stepEntity?.data?.columns) {
        const entityTypeName = toPascalCase(
          toSingular(stepEntity.data?.label || stepEntity.data?.name || "Entity"),
        );
        addPath("data", entityTypeName, `${entityTypeName} payload`);
        stepEntity.data.columns.forEach((col: { name?: string; type?: string; description?: string }) => {
          if (col.name) {
            addPath(`data.${col.name}`, col.type || "string", col.description);
            addPath(col.name, col.type || "string", col.description);
          }
        });
      }
    }
  }

  // 7. Inspect endpoint responseBody if available
  if (ep?.responseBody) {
    if (Array.isArray(ep.responseBody.fields) && ep.responseBody.fields.length > 0) {
      ep.responseBody.fields.forEach((f) => {
        if (f.name) {
          const typeName =
            f.type && f.type !== "object"
              ? f.type
              : f.name === "data" || f.name === "payload"
              ? primaryEntityName
              : `${toPascalCase(f.name)}Type`;
          addPath(f.name, typeName, f.description);
        }
      });
    }
    if (ep.responseBody.rawJson) {
      const parsed = parseSchemaJson(ep.responseBody.rawJson);
      if (parsed && typeof parsed === "object") {
        const jsonPaths = extractPathsFromObject(parsed);
        jsonPaths.forEach((jp) => {
          const cleanType = jp.type === "object" ? `${toPascalCase(jp.path)}Payload` : jp.type;
          addPath(jp.path, cleanType || "string", jp.description);
        });
      }
    }
  }

  // 8. Inspect events payloadSchema
  if (derivedInfo?.sourceEventId) {
    const ev = events.find((e) => e.id === derivedInfo.sourceEventId);
    if (ev?.payloadSchema) {
      if (Array.isArray(ev.payloadSchema.fields)) {
        ev.payloadSchema.fields.forEach((f) => {
          if (f.name) {
            const typeName = f.type && f.type !== "object" ? f.type : `${primaryEntityName}`;
            addPath(f.name, typeName, f.description);
          }
        });
      }
      if (ev.payloadSchema.rawJson) {
        const parsed = parseSchemaJson(ev.payloadSchema.rawJson);
        if (parsed && typeof parsed === "object") {
          const jsonPaths = extractPathsFromObject(parsed);
          jsonPaths.forEach((jp) => {
            const cleanType = jp.type === "object" ? `${toPascalCase(jp.path)}Payload` : jp.type;
            addPath(jp.path, cleanType || "string", jp.description);
          });
        }
      }
    }
  }

  // 9. If primaryEntity is known but no nested paths were populated, unpack entity schema
  if (primaryEntity?.data?.columns && !paths.some((p) => p.path.startsWith("data."))) {
    const entityTypeName = toPascalCase(
      toSingular(primaryEntity.data?.label || primaryEntity.data?.name || "Entity"),
    );
    addPath("data", entityTypeName, `${entityTypeName} payload record`);
    primaryEntity.data.columns.forEach((col: { name?: string; type?: string; description?: string }) => {
      if (col.name) {
        addPath(`data.${col.name}`, col.type || "string", col.description);
        addPath(col.name, col.type || "string", col.description);
      }
    });
  }

  // 10. Fallback: strictly typed payload with meaningful PascalCase interface types instead of "object"
  if (paths.length === 0) {
    const fallbackTypeName =
      toPascalCase(cleanRouteName(targetItemName)) ||
      toPascalCase(conn.eventName || "Realtime") ||
      "Message";
    addPath("data", `${fallbackTypeName}Data`, "Real-time stream event data");
    addPath("message", "string", "Message body or text");
    addPath("id", "string", "Event or message identifier");
    addPath("timestamp", "string", "ISO event timestamp");
    addPath("type", "string", "Event type name");
    addPath("payload", `${fallbackTypeName}Payload`, "Nested message payload");
  }

  return paths;
}
