import { AIMessage } from "@langchain/core/messages";
import type {
  LangGraphCanvasNode,
  LangGraphCanvasEdge,
  LangGraphStateChannel,
  AgentNodeData,
  LangGraphLLMNodeData,
  ToolNodeData,
  MiddlewareNodeData,
} from "@workspace/canvas";
import {
  extractJsonFromText,
  resolveStructuredFieldValue,
} from "../langgraph";
import { formatStreamingBatch, type StreamBatchItem } from "../streamFormatter";
import type {
  SimulationStepLogEntry,
  SimulationStepLogLevel,
} from "../types";
import { callServerLLM } from "./llm";
import { clone, serializeMessages } from "./messages";
import type {
  ConnectedToolInfo,
  ConnectedMiddlewareInfo,
  AppliedStateUpdate,
  StepStateRecord,
  StepStateValue,
} from "./types";
import {
  findTransformerNode,
  runTransformer,
  resolveInputValue,
} from "./stepExecutor";
import type { LangGraphNodePipelineStep } from "@workspace/canvas";

export interface ExecuteAgentNodeParams {
  node: LangGraphCanvasNode;
  nodeName: string;
  state: Record<string, unknown>;
  edges: LangGraphCanvasEdge[];
  nodes: LangGraphCanvasNode[];
  stateChannels: LangGraphStateChannel[];
  threadId: string;
  provider?: "groq" | "openai" | "anthropic" | "custom";
  apiKey?: string;
  modelName?: string;
  nodeStreamBatchesMap: Map<string, StreamBatchItem[]>;
  nodeLlmRequestMap: Map<string, unknown>;
}

export interface ExecuteAgentNodeResult {
  outputDelta: Record<string, unknown>;
  stepLogs: SimulationStepLogEntry[];
  latestAssistantResponse?: string;
}

export async function executeAgentNode(
  params: ExecuteAgentNodeParams,
): Promise<ExecuteAgentNodeResult> {
  const {
    node,
    nodeName,
    state,
    edges,
    nodes,
    stateChannels,
    threadId,
    provider = "groq",
    apiKey,
    modelName,
    nodeStreamBatchesMap,
    nodeLlmRequestMap,
  } = params;

  const outputDelta: Record<string, unknown> = {};
  const stepLogs: SimulationStepLogEntry[] = [];
  let latestAssistantResponse: string | undefined;
  let latestStructuredResponse: Record<string, unknown> | undefined;

  const addLog = (
    level: SimulationStepLogLevel,
    message: string,
    details?: unknown,
  ) => {
    stepLogs.push({
      timestamp: Date.now(),
      level,
      message,
      nodeId: node.id,
      nodeLabel: nodeName,
      ...(details !== undefined ? { details } : {}),
    });
  };

  const agentData = node.data as AgentNodeData;
  const pipelineSteps = agentData.pipelineSteps;
  const hasPipelineSteps = Array.isArray(pipelineSteps) && pipelineSteps.length > 0;

  // Detect LLM node connected to this agent
  const llmEdge = edges.find(
    (e) => e.target === node.id && e.targetHandle === "llm_in",
  );
  const llmNode = llmEdge ? nodes.find((n) => n.id === llmEdge.source) : null;
  const llmData = llmNode?.data as LangGraphLLMNodeData | undefined;

  // Is LLM actually enabled/configured for this node?
  const isExplicitlyDisabled = agentData.llmConfig?.enabled === false;
  const hasConnectedLlm = Boolean(llmNode && llmData?.enabled !== false);
  const isLlmActive = hasPipelineSteps
    ? pipelineSteps.some((s) => s.type === "llm_call" && s.enabled !== false)
    : !isExplicitlyDisabled &&
      (hasConnectedLlm || agentData.llmConfig?.enabled === true);

  const rawSystemPrompt = agentData.systemPrompt?.trim() || "";
  const systemPrompt = rawSystemPrompt || (isLlmActive ? "You are a helpful assistant." : "");

  const rawMessages = (state.messages as unknown[]) || [];
  const messages = serializeMessages(rawMessages);

  if (messages.length === 0) {
    const candidateKeys = ["input", "prompt", "query", "question", "text", "message"];
    for (const key of candidateKeys) {
      if (typeof state[key] === "string" && (state[key] as string).trim()) {
        messages.push({ role: "user", content: (state[key] as string).trim() });
        break;
      }
    }
  }

  if (isLlmActive && messages.length === 0) {
    throw new Error(
      `Agent "${nodeName}" execution failed: No prompt or user message was provided in graph state.`,
    );
  }

  const effectiveProvider =
    (llmData?.provider as typeof provider) || provider || "groq";
  const effectiveModel =
    llmData?.model ||
    modelName ||
    (effectiveProvider === "groq"
      ? "openai/gpt-oss-120b"
      : effectiveProvider === "openai"
        ? "gpt-4o-mini"
        : "claude-3-5-sonnet-20241022");

  const rawApiKey = llmData?.apiKeyHeader
    ? String(llmData.apiKeyHeader).replace(/^Bearer\s+/i, "").trim()
    : "";
  const effectiveApiKey = rawApiKey ||
    apiKey ||
    (effectiveProvider === "groq"
      ? process.env.GROQ_API_KEY
      : effectiveProvider === "openai"
        ? process.env.OPENAI_API_KEY
        : effectiveProvider === "anthropic"
          ? process.env.ANTHROPIC_API_KEY
          : undefined);

  // Extract connected tools (via edges and agent data)
  const connectedTools: ConnectedToolInfo[] = [];
  const seenToolIds = new Set<string>();

  const toolEdges = edges.filter(
    (e) =>
      e.target === node.id &&
      (e.targetHandle === "tool_in" ||
        e.targetHandle === "tools_in" ||
        e.targetHandle?.includes("tool")),
  );
  for (const e of toolEdges) {
    const tn = nodes.find((n) => n.id === e.source);
    const tnData = tn?.data as ToolNodeData | undefined;
    const tId = tn?.id || e.source;
    if (!seenToolIds.has(tId)) {
      seenToolIds.add(tId);
      connectedTools.push({
        id: tId,
        name: tnData?.name || tnData?.label || "Tool",
        source: tnData?.source,
      });
    }
  }
  if (Array.isArray(agentData.tools)) {
    for (const item of agentData.tools) {
      const tName =
        typeof item === "string"
          ? item
          : (item as { name?: string; id?: string })?.name ||
            (item as { name?: string; id?: string })?.id;
      const tId =
        typeof item === "string"
          ? item
          : (item as { name?: string; id?: string })?.id || tName;
      if (tId && !seenToolIds.has(tId)) {
        seenToolIds.add(tId);
        connectedTools.push({ id: tId, name: tName || "Tool" });
      }
    }
  }

  // Extract connected middleware
  const connectedMiddleware: ConnectedMiddlewareInfo[] = [];
  const seenMwIds = new Set<string>();
  const mwEdges = edges.filter(
    (e) =>
      e.target === node.id &&
      (e.targetHandle === "middleware_in" ||
        e.targetHandle?.includes("middleware")),
  );
  for (const e of mwEdges) {
    const mn = nodes.find((n) => n.id === e.source);
    const mnData = mn?.data as MiddlewareNodeData | undefined;
    const mId = mn?.id || e.source;
    if (!seenMwIds.has(mId)) {
      seenMwIds.add(mId);
      connectedMiddleware.push({
        id: mId,
        name: mnData?.name || mnData?.label || "Middleware",
        type: mnData?.type,
      });
    }
  }
  if (Array.isArray(agentData.middleware)) {
    for (const item of agentData.middleware) {
      const mName =
        typeof item === "string"
          ? item
          : (item as { name?: string; id?: string })?.name ||
            (item as { name?: string; id?: string })?.id;
      const mId =
        typeof item === "string"
          ? item
          : (item as { name?: string; id?: string })?.id || mName;
      if (mId && !seenMwIds.has(mId)) {
        seenMwIds.add(mId);
        connectedMiddleware.push({ id: mId, name: mName || "Middleware" });
      }
    }
  }

  if (connectedTools.length > 0) {
    outputDelta.tools = connectedTools;
  }
  if (connectedMiddleware.length > 0) {
    outputDelta.middleware = connectedMiddleware;
  }

  // ── STEP-BASED EXECUTION LOGGING ──
  // Only show the configuration for steps that are actually present/configured
  const agentName = agentData.name || agentData.label || nodeName;
  const configuredUpdates = agentData.stateUpdates || [];

  if (hasPipelineSteps) {
    addLog(
      "config",
      `[Pipeline Steps] ${pipelineSteps.length} step(s) configured: ${pipelineSteps.map((s, i) => `${i + 1}. ${s.label || s.name || s.type}`).join(" → ")}`,
      { pipelineSteps },
    );

    const hasLlmInSteps = pipelineSteps.some((s) => s.type === "llm_call" && s.enabled !== false);
    if (hasLlmInSteps) {
      addLog(
        "config",
        `[Step: LLM Agent] Model: ${effectiveProvider.toUpperCase()} / ${effectiveModel}${systemPrompt ? ` | System Prompt: "${systemPrompt.length > 90 ? systemPrompt.slice(0, 90) + "..." : systemPrompt}"` : ""} | Tools: ${connectedTools.length} | Middleware: ${connectedMiddleware.length}`,
        {
          provider: effectiveProvider,
          model: effectiveModel,
          systemPrompt,
          tools: connectedTools,
          middleware: connectedMiddleware,
        },
      );
    }

    if (configuredUpdates.length > 0) {
      addLog(
        "config",
        `[State Updates] ${configuredUpdates.length} channel update(s) configured: ${configuredUpdates.map((u) => `${u.channelKey} <- ${u.source === "structured_field" ? `structuredResponse.${u.schemaField || u.value}` : u.source || "value"} [mode: ${u.mode || "replace"}]`).join(", ")}`,
        { stateUpdates: configuredUpdates },
      );
    }
  } else {
    // Legacy fallback: only log active components
    if (isLlmActive) {
      addLog(
        "config",
        `[Config - LLM Agent] Node: "${agentName}" | Model: ${effectiveProvider.toUpperCase()} / ${effectiveModel}${systemPrompt ? ` | System Prompt: "${systemPrompt.length > 90 ? systemPrompt.slice(0, 90) + "..." : systemPrompt}"` : ""} | Tools: ${connectedTools.length} | Middleware: ${connectedMiddleware.length}`,
        {
          provider: effectiveProvider,
          model: effectiveModel,
          systemPrompt,
          tools: connectedTools,
          middleware: connectedMiddleware,
        },
      );
    }

    if (configuredUpdates.length > 0) {
      addLog(
        "config",
        `[State Updates] ${configuredUpdates.length} channel update(s) configured: ${configuredUpdates.map((u) => `${u.channelKey} <- ${u.source === "structured_field" ? `structuredResponse.${u.schemaField || u.value}` : u.source || "value"} [mode: ${u.mode || "replace"}]`).join(", ")}`,
        { stateUpdates: configuredUpdates },
      );
    }
  }

  // Track step outputs across pipeline execution (Step N can map inputs from Step 1..N-1)
  const stepOutputs = new Map<string, StepStateValue>();

  const interpolatePromptTemplate = (prompt: string): string => {
    if (!prompt || !/\$\{([^}]+)\}/.test(prompt)) return prompt;
    return prompt.replace(/\$\{([^}]+)\}/g, (match, expr: string) => {
      const trimmed = expr.trim();
      if (trimmed.startsWith("state.")) {
        const field = trimmed.replace(/^state\./, "");
        const val = resolveInputValue({ kind: "state", field }, { state, stepOutputs });
        if (val !== undefined && val !== null) {
          return typeof val === "object" ? JSON.stringify(val) : String(val);
        }
        return match;
      }

      const dotIdx = trimmed.indexOf(".");
      const rootVar = dotIdx > 0 ? trimmed.substring(0, dotIdx) : trimmed;
      const subField = dotIdx > 0 ? trimmed.substring(dotIdx + 1) : "";

      if (stepOutputs.has(rootVar)) {
        const stepVal = stepOutputs.get(rootVar);
        if (subField && typeof stepVal === "object" && stepVal !== null) {
          const fieldVal = resolveInputValue(
            { kind: "step_output", stepId: rootVar, field: subField },
            { state, stepOutputs },
          );
          if (fieldVal !== undefined && fieldVal !== null) {
            return typeof fieldVal === "object" ? JSON.stringify(fieldVal) : String(fieldVal);
          }
        } else if (stepVal !== undefined && stepVal !== null) {
          return typeof stepVal === "object" ? JSON.stringify(stepVal) : String(stepVal);
        }
        return match;
      }

      if (stepOutputs.has(trimmed)) {
        const val = stepOutputs.get(trimmed);
        if (val !== undefined && val !== null) {
          return typeof val === "object" ? JSON.stringify(val) : String(val);
        }
        return match;
      }

      const fromState = resolveInputValue({ kind: "state", field: trimmed }, { state, stepOutputs });
      if (fromState !== undefined && fromState !== null) {
        return typeof fromState === "object" ? JSON.stringify(fromState) : String(fromState);
      }

      return match;
    });
  };

  const runLlmStep = async () => {
    if (!isLlmActive) return;
    const streamConfig = agentData.streamConfig;
    const isStreamActive = streamConfig?.enabled !== false;
    const streamEnabled = isStreamActive;
    const responseFormat = agentData.responseFormat;
    const isStructured = Boolean(responseFormat?.enabled);
    const schemaJsonStr = responseFormat?.schemaJson?.trim() || "";
    const parsedSchemaFields: Array<{ name: string; type?: string; required?: boolean }> = [];
    if (isStructured && schemaJsonStr) {
      try {
        const parsedJson = JSON.parse(schemaJsonStr);
        if (parsedJson && typeof parsedJson === "object" && "properties" in parsedJson) {
          const properties = parsedJson.properties;
          if (properties && typeof properties === "object") {
            const reqs: string[] =
              "required" in parsedJson && Array.isArray(parsedJson.required) ? parsedJson.required : [];
            for (const [k, def] of Object.entries(properties)) {
              const propType =
                def && typeof def === "object" && "type" in def && typeof def.type === "string"
                  ? def.type
                  : "string";
              parsedSchemaFields.push({
                name: k,
                type: propType,
                required: reqs.includes(k),
              });
            }
          }
        }
      } catch {}
    }
    const effectivePrompt = interpolatePromptTemplate(systemPrompt);
    addLog("llm", `Calling LLM: ${effectiveProvider.toUpperCase()} / ${effectiveModel} (${messages.length} message(s))`);
    const { text: responseText, streamBatches } = await callServerLLM({
      provider: effectiveProvider,
      apiKey: effectiveApiKey,
      modelName: effectiveModel,
      systemPrompt: effectivePrompt,
      messages,
      customUrl: llmData?.url || llmData?.baseUrl,
      responseFormat,
      streamEnabled,
    });

    latestAssistantResponse = responseText;
    addLog("llm", `Received LLM response (${responseText.length} chars, ${streamBatches.length} streaming batch(es))`);

    const isTokenUsageActive =
      (agentData as any).trackTokenUsage !== false &&
      (agentData as any).langGraphTrackTokenUsage !== false;

    let tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    if (isTokenUsageActive) {
      const allPromptText =
        (effectivePrompt || systemPrompt || "") +
        " " +
        messages
          .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
          .join(" ");
      const prompt_tokens = Math.max(1, Math.ceil(allPromptText.length / 4));
      const completion_tokens = Math.max(1, Math.ceil((responseText || "").length / 4));
      tokenUsage = {
        prompt_tokens,
        completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      };
      outputDelta.usage = tokenUsage;
      outputDelta.tokenUsage = tokenUsage;
    }

    const aiMessageUsage =
      isTokenUsageActive && tokenUsage
        ? {
            input_tokens: tokenUsage.prompt_tokens,
            output_tokens: tokenUsage.completion_tokens,
            total_tokens: tokenUsage.total_tokens,
          }
        : undefined;

    if (responseFormat?.enabled) {
      let parsed: Record<string, unknown> | null = extractJsonFromText(responseText);
      if (!parsed) {
        const trimmedClean = responseText.trim().replace(/^["']|["']$/g, "");
        if (
          parsedSchemaFields.length === 1 &&
          parsedSchemaFields[0]?.name &&
          trimmedClean.length < 100 &&
          !trimmedClean.startsWith("{")
        ) {
          parsed = { [parsedSchemaFields[0].name]: trimmedClean };
        } else {
          parsed = { raw: responseText };
        }
      }
      latestStructuredResponse = parsed ?? undefined;
      outputDelta.structuredResponse = parsed;
      const formattedContent = JSON.stringify(parsed, null, 2);
      outputDelta.messages = [
        new AIMessage({
          content: formattedContent,
          ...(aiMessageUsage ? { usage_metadata: aiMessageUsage } : {}),
        }),
      ];
      outputDelta.response = formattedContent;
      addLog("llm", `Structured Output Parsed: ${JSON.stringify(parsed)}`, { structuredResponse: parsed });
    } else {
      outputDelta.messages = [
        new AIMessage({
          content: responseText,
          ...(aiMessageUsage ? { usage_metadata: aiMessageUsage } : {}),
        }),
      ];
      outputDelta.response = responseText;
    }

    const effectiveStreamConfig = agentData.streamConfig
      ? {
          ...agentData.streamConfig,
          envelope: {
            ...agentData.streamConfig.envelope,
            includeUsage: isTokenUsageActive,
          },
        }
      : isTokenUsageActive
      ? {
          enabled: true,
          envelope: {
            includeUsage: true,
          },
        }
      : undefined;

    outputDelta.llmRequest = {
      provider: effectiveProvider,
      model: effectiveModel,
      stream: streamEnabled,
      systemPrompt: effectivePrompt,
      messageCount: messages.length,
      ...(isTokenUsageActive && tokenUsage ? { usage: tokenUsage } : {}),
    };
    nodeLlmRequestMap.set(node.id, outputDelta.llmRequest);

    if (streamBatches && streamBatches.length > 0) {
      const runId = `run_${threadId.slice(0, 8)}_${Math.random().toString(36).slice(2, 6)}`;
      const stripEmpty = effectiveStreamConfig?.envelope?.stripEmptyDeltas !== false;
      const filtered = streamBatches.filter((b) => (stripEmpty ? Boolean(b.delta) : true));
      const formattedBatches: StreamBatchItem[] = filtered.map((b, newIdx) => {
        const rawWithUsage =
          isTokenUsageActive && tokenUsage
            ? (b.raw && typeof b.raw === "object" ? { ...b.raw, usage: tokenUsage } : { usage: tokenUsage })
            : b.raw;
        const batchItem = { ...b, raw: rawWithUsage };
        return {
          ...batchItem,
          index: newIdx,
          formatted: formatStreamingBatch({
            batch: batchItem,
            nodeName,
            runId,
            streamConfig: effectiveStreamConfig,
          }),
        };
      });

      nodeStreamBatchesMap.set(node.id, formattedBatches);
      outputDelta.streamBatches = formattedBatches;
      outputDelta.streamBatchCount = formattedBatches.length;
      if (effectiveStreamConfig) {
        outputDelta.streamConfig = effectiveStreamConfig;
      }
    }

    const llmOut = (outputDelta.structuredResponse || responseText) as StepStateValue;
    stepOutputs.set("response", responseText);
    stepOutputs.set("message", responseText);
    stepOutputs.set("content", responseText);
    if (outputDelta.structuredResponse) {
      stepOutputs.set("structuredResponse", outputDelta.structuredResponse as StepStateValue);
    }
    stepOutputs.set(node.id, llmOut);
  };

  const runTransformerStep = async (
    step: LangGraphNodePipelineStep,
    stepLabel: string,
  ) => {
    const trDef = findTransformerNode(node.id, step, nodes, edges);
    const code =
      trDef?.code ||
      step.customCode ||
      "";
    const trName =
      trDef?.name ||
      step.label ||
      stepLabel;

    if (!code.trim()) {
      throw new Error(`Transformer "${trName}" has an empty function body.`);
    }

    const inputs: StepStateRecord = {};
    if (step.inputBindings && step.inputBindings.length > 0) {
      for (const b of step.inputBindings) {
        if (b && b.argName) {
          inputs[b.argName] = resolveInputValue(b.source, {
            state,
            stepOutputs,
          });
        }
      }
    } else if (trDef?.inputSchema && trDef.inputSchema.length > 0) {
      for (const param of trDef.inputSchema) {
        if (!param || !param.name) continue;
        if (stepOutputs.has(param.name)) {
          inputs[param.name] = stepOutputs.get(param.name);
        } else if (state[param.name] !== undefined) {
          inputs[param.name] = state[param.name] as StepStateValue;
        }
      }
    }

    if (Object.keys(inputs).length === 0 && Object.keys(state).length > 0) {
      for (const [k, v] of Object.entries(state)) {
        inputs[k] = v as StepStateValue;
      }
    }

    addLog(
      "info",
      `Executing step "${stepLabel}" (Transformer: ${trName}) (${Object.keys(inputs).length} input(s) mapped)`,
      { inputs },
    );

    try {
      const res = await runTransformer({
        code,
        name: trName,
        inputs,
        state,
        cloneFn: clone,
      });

      const resValue: StepStateValue =
        typeof res === "object" ||
        typeof res === "string" ||
        typeof res === "number" ||
        typeof res === "boolean" ||
        res === null
          ? (res as StepStateValue)
          : undefined;

      stepOutputs.set(step.id, resValue);
      if (step.outputVariable) {
        stepOutputs.set(step.outputVariable, resValue);
        outputDelta[step.outputVariable] = resValue;
      }

      if (res && typeof res === "object") {
        Object.assign(outputDelta, res);
        Object.assign(state, res);
      }

      addLog("info", `Completed step "${stepLabel}" (Transformer: ${trName})`, {
        outputVariable: step.outputVariable,
        result: resValue,
      });
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      addLog("error", `Error executing transformer step "${stepLabel}": ${errStr}`);
      throw new Error(`Transformer step "${stepLabel}" failed: ${errStr}`);
    }
  };

  const runCustomCodeStep = async (codeBody?: string, stepLabel = "Custom Code") => {
    if (!codeBody?.trim()) return;
    addLog("info", `Executing step "${stepLabel}" (Custom Code)`);
    try {
      const runner = new Function("state", "clone", codeBody);
      const res = await runner(state, clone);
      if (res && typeof res === "object") {
        Object.assign(outputDelta, res);
        Object.assign(state, res);
      }
    } catch (err) {
      const errStr = err instanceof Error ? err.message : String(err);
      addLog("error", `Error executing custom code step "${stepLabel}": ${errStr}`);
      throw new Error(`Custom code step "${stepLabel}" failed: ${errStr}`);
    }
  };

  // Execute pipeline steps in user-configured sequence
  if (agentData.pipelineSteps && agentData.pipelineSteps.length > 0) {
    for (const step of agentData.pipelineSteps) {
      if (step.type === "transformer" || step.type === "transform") {
        await runTransformerStep(step, step.label || "Transformer");
      } else if (step.type === "custom_code") {
        await runCustomCodeStep(step.customCode, step.label || "Custom Code");
        if (step.outputVariable && outputDelta[step.outputVariable]) {
          stepOutputs.set(step.outputVariable, outputDelta[step.outputVariable] as StepStateValue);
        }
        stepOutputs.set(step.id, outputDelta as StepStateValue);
      } else if (step.type === "llm_call") {
        await runLlmStep();
        const llmOut = (outputDelta.structuredResponse || latestAssistantResponse) as StepStateValue;
        stepOutputs.set(step.id, llmOut);
        if (step.outputVariable) {
          stepOutputs.set(step.outputVariable, llmOut);
          outputDelta[step.outputVariable] = llmOut;
        }
      } else if (step.type === "kafka_publish") {
        const topicBinding = step.inputBindings?.find((b) => b.argName === "topic");
        const keyBinding = step.inputBindings?.find((b) => b.argName === "key");
        const topic = topicBinding
          ? String(resolveInputValue(topicBinding.source, { state, stepOutputs }) || "")
          : (step.name || "agent-events");
        const key = keyBinding
          ? String(resolveInputValue(keyBinding.source, { state, stepOutputs }) || "")
          : undefined;
        const payloadBindings = step.inputBindings?.filter((b) => b.argName !== "topic" && b.argName !== "key") || [];
        const payload: StepStateRecord = {};
        for (const b of payloadBindings) {
          payload[b.argName] = resolveInputValue(b.source, { state, stepOutputs });
        }
        const result: StepStateValue = { published: true, topic, key, payload, timestamp: Date.now() };
        addLog("info", `[Simulation] Published Kafka event to "${topic}"`, result);
        const outVar = step.outputVariable || step.id;
        stepOutputs.set(step.id, result);
        stepOutputs.set(outVar, result);
        outputDelta[outVar] = result;
      } else if (step.type === "db_operation") {
        const op = step.operationId || step.functionRef?.name || "findMany";
        const table = step.tableNodeId || step.name || "entity";
        const result: StepStateValue = { success: true, table, operation: op, count: 1, rows: [{ id: "sim_1", status: "active" }] };
        addLog("info", `[Simulation] Executed DB operation "${op}" on "${table}"`, result);
        const outVar = step.outputVariable || step.id;
        stepOutputs.set(step.id, result);
        stepOutputs.set(outVar, result);
        outputDelta[outVar] = result;
      } else if (step.type === "redis_operation") {
        const command = (step.operationId || step.functionRef?.name || "get").toLowerCase();
        const result: StepStateValue = command === "get" ? "cached_value" : { status: "OK" };
        addLog("info", `[Simulation] Executed Redis command "${command}"`, { command, result });
        const outVar = step.outputVariable || step.id;
        stepOutputs.set(step.id, result);
        stepOutputs.set(outVar, result);
        outputDelta[outVar] = result;
      } else if (step.type === "storage_operation") {
        const op = step.operationId || step.functionRef?.name || "uploadObject";
        const result: StepStateValue = { success: true, operation: op, url: "https://storage.simulation.local/file.bin" };
        addLog("info", `[Simulation] Storage operation "${op}"`, result);
        const outVar = step.outputVariable || step.id;
        stepOutputs.set(step.id, result);
        stepOutputs.set(outVar, result);
        outputDelta[outVar] = result;
      } else if (step.type === "external_call" || step.type === "service_call") {
        const result: StepStateValue = { status: 200, data: { simulated: true } };
        addLog("info", `[Simulation] Call to "${step.label || step.name}"`, result);
        const outVar = step.outputVariable || step.id;
        stepOutputs.set(step.id, result);
        stepOutputs.set(outVar, result);
        outputDelta[outVar] = result;
      } else if (step.type === "variable") {
        const valBinding = step.inputBindings?.find((b) => b.argName === "value" || b.argName === "val");
        const source = valBinding?.source || step.variableSource;
        const val: StepStateValue = source ? resolveInputValue(source, { state, stepOutputs }) : null;
        const outVar = step.outputVariable || step.id;
        stepOutputs.set(step.id, val);
        stepOutputs.set(outVar, val);
        outputDelta[outVar] = val;
        addLog("info", `[Simulation] Set variable "${outVar}"`, { value: val });
      } else if (step.type === "push_to_client") {
        addLog("info", `[Simulation] Push to client event "${step.label || "client"}"`);
      }
    }
  } else {
    // Legacy fallback: LLM then custom code
    if (isLlmActive) {
      await runLlmStep();
    }
    if (agentData.customCode?.body?.trim()) {
      await runCustomCodeStep(agentData.customCode.body, "Custom Code");
    }
  }

  // Apply stateUpdates configured on agent (if enabled)
  const appliedStateUpdates: AppliedStateUpdate[] = [];
  const isStateUpdatesEnabled = agentData.stateUpdatesConfig?.enabled !== false;

  if (isStateUpdatesEnabled) {
    for (const update of agentData.stateUpdates || []) {
      const rawFieldKey = update.schemaField || update.value || update.channelKey || "";
      const cleanFieldKey = rawFieldKey.replace(/^structuredResponse\./, "").trim();

      const parsedObj = latestStructuredResponse;

      let val: unknown;

      let resolvedValue = update.value;
      if (typeof resolvedValue === "string" && resolvedValue.includes("${")) {
        resolvedValue = resolvedValue.replace(/\$\{([^}]+)\}/g, (_: string, expr: string): string => {
          const clean = expr.trim();
          if (clean === "response.content") return latestAssistantResponse ?? "";
          if (clean === "response") return JSON.stringify(parsedObj ?? latestAssistantResponse ?? "");
          if (clean.startsWith("response.")) {
            const field = clean.replace(/^response\./, "");
            const resVal = parsedObj ? parsedObj[field] : undefined;
            return resVal !== undefined && resVal !== null ? String(resVal) : "";
          }
          if (clean.startsWith("state.")) {
            const field = clean.replace(/^state\./, "");
            const stVal = state[field];
            return stVal !== undefined && stVal !== null ? String(stVal) : "";
          }
          return "";
        });
      }

      if (update.source === "none") {
        val = undefined;
      } else if (update.source === "structured_field" || update.schemaField) {
        val = resolveStructuredFieldValue(rawFieldKey, parsedObj, latestAssistantResponse);
      } else if (update.source === "structured_full") {
        val = outputDelta.structuredResponse;
      } else if (update.source === "message_content") {
        val = latestAssistantResponse;
      } else if (update.source === "message_object") {
        const msgs = outputDelta.messages;
        val = Array.isArray(msgs) && msgs.length > 0 ? msgs[0] : undefined;
      } else if (update.source === "expression" || update.mode === "expression") {
        try {
          const structuredScope =
            typeof outputDelta.structuredResponse === "object" &&
            outputDelta.structuredResponse !== null
              ? outputDelta.structuredResponse
              : {};
          const responseScope = {
            content: latestAssistantResponse,
            ...structuredScope,
            ...outputDelta,
          };
          const exprFn = new Function("state", "clone", "response", `return (${resolvedValue});`);
          val = exprFn(state, clone, responseScope);
        } catch {
          val = resolvedValue;
        }
      } else {
        val = resolvedValue;
        if (typeof val === "string") {
          if (/\bstate\b/.test(val)) {
            try {
              const exprFn = new Function("state", "clone", `return (${val});`);
              val = exprFn(state, clone);
            } catch {
              // fallback to JSON parse
            }
          }
        }
      }

      if (typeof val === "string") {
        try {
          const jsonCompatible = val.replace(/`(\$\{[^`]+\})`/g, '"$1"');
          val = JSON.parse(jsonCompatible);
        } catch {
          // plain text string
        }
      }

      const isActionWithoutValue =
        update.source === "none" ||
        update.action === "reset" ||
        update.action === "toggle" ||
        update.action === "clear";

      if (val === undefined && !isActionWithoutValue) {
        addLog(
          "warn",
          `State update for channel "${update.channelKey}" skipped: field "${cleanFieldKey}" not found in model output`,
          {
            update,
            structuredResponse: outputDelta.structuredResponse,
            response: latestAssistantResponse,
          },
        );
        continue;
      }

      const targetChannel = stateChannels.find(
        (c) => c.key === update.channelKey,
      );
      const channelReducer =
        targetChannel?.reducer ||
        update.reducer ||
        (update.mode === "append" ? "append" : "replace");

      const prevVal = state[update.channelKey];

      // Form the action payload if action is specified
      const actionPayload =
        update.action && update.action !== "default"
          ? (val !== undefined ? { action: update.action, value: val } : { action: update.action })
          : val;

      // Execute reducer:
      if (targetChannel?.customReducerCode) {
        try {
          const fn = new Function(
            "prev",
            "next",
            "state",
            `"use strict";
            const customFn = (${targetChannel.customReducerCode});
            if (typeof customFn === "function") {
              return customFn(prev, next, state);
            }
            return customFn;`,
          );
          state[update.channelKey] = fn(prevVal, actionPayload, state);
        } catch {
          state[update.channelKey] = executeBuiltInAction(
            update.action,
            channelReducer,
            targetChannel?.type,
            prevVal,
            val,
            actionPayload,
          );
        }
      } else {
        state[update.channelKey] = executeBuiltInAction(
          update.action,
          channelReducer,
          targetChannel?.type,
          prevVal,
          val,
          actionPayload,
        );
      }

      const newVal = state[update.channelKey];
      outputDelta[update.channelKey] = newVal;

      const record: AppliedStateUpdate = {
        channelKey: update.channelKey,
        previousValue: prevVal,
        newValue: newVal,
        reducer: channelReducer,
        action: update.action,
        source: update.source || "structured_field",
        sourceField: cleanFieldKey,
      };
      appliedStateUpdates.push(record);

      addLog(
        "state",
        `State Channel Mutated: "${update.channelKey}" = ${JSON.stringify(newVal)} (Reducer: ${channelReducer}${update.action ? `, Action: ${update.action}` : ""}, was: ${JSON.stringify(prevVal)})`,
        record,
      );
    }

    if (appliedStateUpdates.length > 0) {
      outputDelta.stateUpdates = appliedStateUpdates;
    }
  }

  return {
    outputDelta,
    stepLogs,
    latestAssistantResponse,
  };
}

function executeBuiltInAction(
  action: string | undefined,
  reducer: string,
  type: string | undefined,
  prevVal: unknown,
  val: unknown,
  actionPayload: unknown,
): unknown {
  if (action && action !== "default") {
    switch (action) {
      case "increment": {
        const current = typeof prevVal === "number" ? prevVal : (Number(prevVal) || 0);
        const amount = typeof val === "number" ? val : (Number(val) || 1);
        return current + amount;
      }
      case "decrement": {
        const current = typeof prevVal === "number" ? prevVal : (Number(prevVal) || 0);
        const amount = typeof val === "number" ? val : (Number(val) || 1);
        return current - amount;
      }
      case "toggle": {
        return !Boolean(prevVal);
      }
      case "reset":
      case "clear": {
        if (type === "number") return 0;
        if (type === "boolean") return false;
        if (type === "array" || type === "messages") return [];
        if (type === "object" || type === "json") return {};
        if (type === "string") return "";
        return undefined;
      }
      case "replace": {
        return val !== undefined ? val : actionPayload;
      }
      case "append": {
        const arr = Array.isArray(prevVal) ? prevVal : (prevVal != null ? [prevVal] : []);
        return [...arr, ...(Array.isArray(val) ? val : (val != null ? [val] : []))];
      }
      case "merge": {
        const obj = (prevVal && typeof prevVal === "object" && !Array.isArray(prevVal)) ? prevVal : {};
        const incoming = (val && typeof val === "object" && !Array.isArray(val)) ? val : {};
        return { ...obj, ...incoming };
      }
      case "concat": {
        const str = typeof prevVal === "string" ? prevVal : "";
        const incoming = val != null ? String(val) : "";
        return str ? `${str}\n${incoming}` : incoming;
      }
      default: {
        return val !== undefined ? val : actionPayload;
      }
    }
  }

  // Standard reducer logic without explicit action
  if ((reducer === "append" || reducer === "concat_array") && Array.isArray(prevVal)) {
    return [...prevVal, ...(Array.isArray(val) ? val : (val != null ? [val] : []))];
  }
  if ((reducer === "merge_object" || type === "object") && typeof prevVal === "object" && typeof val === "object" && prevVal !== null && val !== null) {
    return { ...(prevVal as Record<string, unknown>), ...(val as Record<string, unknown>) };
  }
  return val;
}
