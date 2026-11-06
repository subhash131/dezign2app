import { BackendNode } from "@workspace/canvas/types";
import { AvailablePath, PipelineStepDraft } from "../../types";
import { parseRelaxedJson } from "@/lib/compiler/generators/routeGenerator/jsonInterpolation";

interface ChannelInfo {
  key: string;
  type?: string;
}

interface StructuredFieldItem {
  name: string;
  type: string;
  description?: string;
}

function extractStructuredSchemaFields(schemaJson?: string): StructuredFieldItem[] {
  if (!schemaJson || !schemaJson.trim()) return [];
  const clean = schemaJson.trim();
  try {
    const { parsed, error } = parseRelaxedJson(clean);
    if (error || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }
    const obj = parsed as Record<string, unknown>;

    // Case 1: Standard JSON Schema with properties
    if (obj.properties && typeof obj.properties === "object" && !Array.isArray(obj.properties)) {
      const props = obj.properties as Record<string, Record<string, unknown>>;
      const fields: StructuredFieldItem[] = [];
      for (const [key, def] of Object.entries(props)) {
        if (!key || typeof key !== "string" || !key.trim()) continue;
        const cleanKey = key.trim();
        const isArray = def?.type === "array";
        const baseType = isArray
          ? (typeof def?.items === "object" && def?.items && "type" in def.items
              ? String((def.items as Record<string, unknown>).type)
              : "string")
          : String(def?.type || "string");
        const typeStr = isArray ? `${baseType}[]` : baseType;
        const desc = typeof def?.description === "string" ? def.description : undefined;
        fields.push({ name: cleanKey, type: typeStr, description: desc });
      }
      return fields;
    }

    // Case 2: Shorthand key-value map, e.g. { summary: "string", sentiment: "string" }
    const fields: StructuredFieldItem[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (!key || typeof key !== "string" || !key.trim()) continue;
      const cleanKey = key.trim();
      const valStr = typeof val === "string" ? val.toLowerCase() : "string";
      fields.push({ name: cleanKey, type: valStr });
    }
    return fields;
  } catch {
    return [];
  }
}

export function resolveLangGraphStepPaths(
  step: PipelineStepDraft,
  allNodes: BackendNode[],
  stepPaths: AvailablePath[],
): void {
  const isLangGraphStep =
    step.type === "langgraph_invoke" || Boolean(step.langGraphTargetNodeId);
  if (!isLangGraphStep) return;

  if (step.langGraphAction === "history") {
    if (step.langGraphHistoryFormat === "full_state") {
      if (!stepPaths.some((p) => p.path === "values")) {
        stepPaths.push({
          path: "values",
          type: "object",
          description: "Latest state channel snapshot values",
        });
      }
      if (!stepPaths.some((p) => p.path === "next")) {
        stepPaths.push({
          path: "next",
          type: "string[]",
          description: "Next nodes to execute in graph",
        });
      }
      if (!stepPaths.some((p) => p.path === "threadId")) {
        stepPaths.push({
          path: "threadId",
          type: "string",
          description: "Target session thread ID",
        });
      }
      if (!stepPaths.some((p) => p.path === "messages")) {
        stepPaths.push({
          path: "messages",
          type: "BaseMessage[]",
          description: "State messages array",
        });
      }
    } else {
      if (!stepPaths.some((p) => p.path === "")) {
        stepPaths.push({
          path: "",
          type: "BaseMessage[]",
          description: "Formatted chat messages array",
        });
      }
      if (!stepPaths.some((p) => p.path === "messages")) {
        stepPaths.push({
          path: "messages",
          type: "BaseMessage[]",
          description: "Formatted chat messages array",
        });
      }
    }
    if (step.langGraphHistoryPaginationEnabled) {
      if (!stepPaths.some((p) => p.path === "pagination")) {
        stepPaths.push({
          path: "pagination",
          type: "object",
          description: "Cursor pagination metadata",
        });
      }
      if (!stepPaths.some((p) => p.path === "pagination.limit")) {
        stepPaths.push({
          path: "pagination.limit",
          type: "number",
          description: "Page size limit",
        });
      }
      if (!stepPaths.some((p) => p.path === "pagination.before")) {
        stepPaths.push({
          path: "pagination.before",
          type: "string | null",
          description: "Starting checkpoint cursor",
        });
      }
      if (!stepPaths.some((p) => p.path === "pagination.next_cursor")) {
        stepPaths.push({
          path: "pagination.next_cursor",
          type: "string | null",
          description: "Next page cursor checkpoint ID",
        });
      }
    }
    return;
  }

  const lgNode =
    allNodes.find((n) => n.id === step.langGraphTargetNodeId && n.type === "langgraph") ||
    allNodes.find((n) => n.type === "langgraph");

  const rawChannels = lgNode?.data?.stateChannels;
  const channels: ChannelInfo[] = [];

  if (Array.isArray(rawChannels)) {
    for (const ch of rawChannels) {
      if (
        ch &&
        typeof ch === "object" &&
        "key" in ch &&
        typeof ch.key === "string" &&
        ch.key.length > 0
      ) {
        const chType =
          "type" in ch && typeof ch.type === "string" ? ch.type : undefined;
        channels.push({ key: ch.key, type: chType });
      }
    }
  }

  // 1. Assistant text response (primary field)
  if (!stepPaths.some((p) => p.path === "response")) {
    stepPaths.push({
      path: "response",
      type: "string",
      description: "Latest assistant message text response",
    });
  }
  if (!stepPaths.some((p) => p.path === "content")) {
    stepPaths.push({
      path: "content",
      type: "string",
      description: "Accumulated assistant text content",
    });
  }
  if (!stepPaths.some((p) => p.path === "toolCalls")) {
    stepPaths.push({
      path: "toolCalls",
      type: "any[]",
      description: "Tool calls executed during agent run",
    });
  }

  // 1b. Structured output fields configured on child agents
  interface AgentCandidate {
    name: string;
    responseFormat?: {
      enabled?: boolean;
      schemaJson?: string;
    };
  }

  const agentCandidates: AgentCandidate[] = [];

  // Child nodes inside lgNode.data.nodes
  const childNodes = lgNode?.data?.nodes;
  if (Array.isArray(childNodes)) {
    for (const cn of childNodes) {
      if (cn && typeof cn === "object") {
        const d = (cn as any).data;
        if (d && typeof d === "object") {
          const rf = d.responseFormat;
          if (rf && typeof rf === "object") {
            const name = d.label || d.name || (cn as any).id || "Agent";
            agentCandidates.push({ name, responseFormat: rf });
          }
        }
      }
    }
  }

  // agentDefinitions on lgNode.data
  const agentDefs = lgNode?.data?.agentDefinitions;
  if (Array.isArray(agentDefs)) {
    for (const ad of agentDefs) {
      if (ad && typeof ad === "object") {
        const rf = (ad as any).responseFormat;
        if (rf && typeof rf === "object") {
          const name = (ad as any).name || (ad as any).label || "Agent";
          agentCandidates.push({ name, responseFormat: rf });
        }
      }
    }
  }

  // graphSteps on lgNode.data
  const graphSteps = lgNode?.data?.graphSteps;
  if (Array.isArray(graphSteps)) {
    for (const gs of graphSteps) {
      if (gs && typeof gs === "object") {
        const rf = (gs as any).responseFormat;
        if (rf && typeof rf === "object") {
          const name = (gs as any).name || (gs as any).label || "Step";
          agentCandidates.push({ name, responseFormat: rf });
        }
      }
    }
  }

  // Direct on lgNode.data
  const lgNodeData = lgNode?.data as any;
  if (lgNodeData?.responseFormat && typeof lgNodeData.responseFormat === "object") {
    agentCandidates.push({
      name: lgNodeData.label || lgNode?.id || "Agent",
      responseFormat: lgNodeData.responseFormat as any,
    });
  }

  // Standalone matching canvas nodes in allNodes
  for (const n of allNodes) {
    const nodeType = n.type as string;
    if (
      (n.id === step.langGraphTargetNodeId ||
        nodeType === "agent" ||
        nodeType === "langgraph_agent" ||
        nodeType === "llm") &&
      n !== lgNode
    ) {
      const d = (n as any).data;
      if (d?.responseFormat && typeof d.responseFormat === "object") {
        const name = d.label || d.name || n.id || "Agent";
        agentCandidates.push({ name, responseFormat: d.responseFormat });
      }
    }
  }

  for (const candidate of agentCandidates) {
    const rf = candidate.responseFormat;
    if (!rf || rf.enabled === false || !rf.schemaJson) continue;

    const schemaFields = extractStructuredSchemaFields(rf.schemaJson);
    if (schemaFields.length === 0) continue;

    // Structured response root object
    if (!stepPaths.some((p) => p.path === "structuredResponse")) {
      stepPaths.push({
        path: "structuredResponse",
        type: "object",
        description: `Structured response payload (${candidate.name})`,
      });
    }

    for (const f of schemaFields) {
      const fieldDesc = f.description
        ? `${f.description} (${candidate.name})`
        : `Structured field: ${f.name} (${candidate.name})`;

      // 1. structuredResponse.<fieldName>
      const srPath = `structuredResponse.${f.name}`;
      if (!stepPaths.some((p) => p.path === srPath)) {
        stepPaths.push({
          path: srPath,
          type: f.type,
          description: fieldDesc,
        });
      }

      // 2. Direct <fieldName>
      if (!stepPaths.some((p) => p.path === f.name)) {
        stepPaths.push({
          path: f.name,
          type: f.type,
          description: fieldDesc,
        });
      }
    }
  }

  // 2. Custom state channels from the LangGraph node
  if (channels.length > 0) {
    channels.forEach((ch) => {
      if (!ch.key) return;
      if (!stepPaths.some((p) => p.path === ch.key)) {
        stepPaths.push({
          path: ch.key,
          type: ch.type || "string",
          description: `State channel: ${ch.key}`,
        });
      }
    });
  } else {
    if (!stepPaths.some((p) => p.path === "messages")) {
      stepPaths.push({
        path: "messages",
        type: "BaseMessage[]",
        description: "Full chat messages history",
      });
    }
  }

  // 3. Memory thread ID
  if (lgNode?.data?.memoryConfig?.enabled !== false) {
    if (!stepPaths.some((p) => p.path === "threadId")) {
      stepPaths.push({
        path: "threadId",
        type: "string",
        description: "Active session thread ID",
      });
    }
  }

  // 4. Full state object
  if (!stepPaths.some((p) => p.path === "state")) {
    stepPaths.push({
      path: "state",
      type: "object",
      description: "Complete final graph state dictionary",
    });
  }

  // 5. Token usage metrics
  if (step.langGraphTrackTokenUsage) {
    if (!stepPaths.some((p) => p.path === "usage")) {
      stepPaths.push({
        path: "usage",
        type: "object",
        description: "Token usage metrics (input, output, total, and reasoning tokens)",
      });
    }
    if (!stepPaths.some((p) => p.path === "usage.input_tokens")) {
      stepPaths.push({
        path: "usage.input_tokens",
        type: "number",
        description: "Input / prompt tokens consumed",
      });
    }
    if (!stepPaths.some((p) => p.path === "usage.output_tokens")) {
      stepPaths.push({
        path: "usage.output_tokens",
        type: "number",
        description: "Output / completion tokens consumed",
      });
    }
    if (!stepPaths.some((p) => p.path === "usage.total_tokens")) {
      stepPaths.push({
        path: "usage.total_tokens",
        type: "number",
        description: "Total tokens consumed",
      });
    }
    if (!stepPaths.some((p) => p.path === "usage.reasoning_tokens")) {
      stepPaths.push({
        path: "usage.reasoning_tokens",
        type: "number",
        description: "Reasoning / thinking tokens consumed (models with extended thinking/reasoning)",
      });
    }
  }

  // Streaming transport metadata
  if (step.langGraphStreamingEnabled) {
    if (!stepPaths.some((p) => p.path === "done")) {
      stepPaths.push({
        path: "done",
        type: "boolean",
        description: "Indicates streaming reached completion",
      });
    }
    if (!stepPaths.some((p) => p.path === "streamed")) {
      stepPaths.push({
        path: "streamed",
        type: "boolean",
        description: "Indicates real-time token stream was active",
      });
    }
    if (!stepPaths.some((p) => p.path === "protocol")) {
      stepPaths.push({
        path: "protocol",
        type: "string",
        description: `Streaming transport protocol (${step.langGraphStreamingProtocol || "sse"})`,
      });
    }
    if (step.langGraphStreamingProtocol === "websocket" && !stepPaths.some((p) => p.path === "room")) {
      stepPaths.push({
        path: "room",
        type: "string",
        description: "Target WebSocket broadcast room",
      });
    }
    if (step.langGraphStreamingProtocol === "kafka" && !stepPaths.some((p) => p.path === "topic")) {
      stepPaths.push({
        path: "topic",
        type: "string",
        description: "Target Kafka topic for streaming tokens",
      });
    }
    if (step.langGraphStreamingProtocol === "redis_stream" && !stepPaths.some((p) => p.path === "streamKey")) {
      stepPaths.push({
        path: "streamKey",
        type: "string",
        description: "Target Redis stream key for streaming tokens",
      });
    }
  }
}
