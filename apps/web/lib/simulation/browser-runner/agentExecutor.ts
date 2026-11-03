import type {
  AgentNodeData,
  ToolNodeData,
  MiddlewareNodeData,
} from "@workspace/canvas";
import { extractJsonFromText } from "../langgraph";
import { formatStreamingBatch, type StreamBatchItem } from "../streamFormatter";
import { callBrowserLLM } from "./llm";
import {
  clone,
  extractMessages,
  interpolateBrowserPrompt,
  isLangGraphLLMNode,
  getEnvKeyForProvider,
  applyAgentStateUpdates,
} from "./state";
import type {
  ConnectedToolInfo,
  ConnectedMiddlewareInfo,
  ExecuteBrowserAgentParams,
  ExecuteBrowserAgentResult,
  GraphChatMessage,
  LangGraphSimulationProvider,
} from "./types";

/**
 * Execute a LangGraph agent or component node in the browser preview.
 */
export async function executeBrowserAgentNode(
  params: ExecuteBrowserAgentParams,
): Promise<ExecuteBrowserAgentResult> {
  const {
    node,
    nodeName,
    state,
    nodes,
    edges,
    stateChannels,
    threadId,
    provider = "groq",
    apiKey,
    modelName,
    addLog,
  } = params;

  let latestAssistantResponse = params.latestAssistantResponse;
  let latestStructuredResponse = params.latestStructuredResponse;
  const outputDelta: Record<string, unknown> = {};

  const agentData = node.data as AgentNodeData;
  const pipelineSteps = agentData.pipelineSteps;
  const hasPipelineSteps = Array.isArray(pipelineSteps) && pipelineSteps.length > 0;

  // Detect LLM node connected to this agent on the canvas
  const llmEdge = edges.find(
    (e) => e.target === node.id && e.targetHandle === "llm_in",
  );
  const llmNode = llmEdge ? nodes.find((n) => n.id === llmEdge.source) : null;
  const llmData = isLangGraphLLMNode(llmNode) ? llmNode.data : undefined;

  // Is LLM actually enabled/configured for this node?
  const isExplicitlyDisabled = agentData.llmConfig?.enabled === false;
  const hasConnectedLlm = Boolean(llmNode && llmData?.enabled !== false);
  const isLlmActive = hasPipelineSteps
    ? pipelineSteps.some((s) => s.type === "llm_call" && s.enabled !== false)
    : !isExplicitlyDisabled &&
      (hasConnectedLlm || agentData.llmConfig?.enabled === true);

  const rawSystemPrompt = agentData.systemPrompt?.trim() || "";
  const systemPrompt = rawSystemPrompt || (isLlmActive ? "You are a helpful assistant." : "");

  // Gather real conversation messages with strict typing (no any)
  let messages: GraphChatMessage[] = extractMessages(state.messages);

  // If messages is empty, inspect state channels for user prompt
  if (messages.length === 0) {
    const candidateKeys = ["input", "prompt", "query", "question", "text", "message"];
    for (const key of candidateKeys) {
      const val = state[key];
      if (typeof val === "string" && val.trim()) {
        messages = [{ role: "user", content: val.trim() }];
        break;
      }
    }
    if (messages.length === 0) {
      for (const [k, v] of Object.entries(state)) {
        if (typeof v === "string" && v.trim() && k !== "id") {
          messages = [{ role: "user", content: v.trim() }];
          break;
        }
      }
    }
  }

  if (isLlmActive && messages.length === 0) {
    throw new Error(
      `Agent "${nodeName}" execution failed: No user input message or prompt was provided. Please type a message in the input box before running the graph.`,
    );
  }

  const effectiveProvider: LangGraphSimulationProvider =
    llmData?.provider || provider || "groq";
  const effectiveModel =
    llmData?.model ||
    modelName ||
    (effectiveProvider === "groq"
      ? "openai/gpt-oss-120b"
      : effectiveProvider === "openai"
      ? "gpt-4o-mini"
      : "claude-3-5-sonnet-20241022");

  // Prefer passed apiKey, then LLM node apiKeyHeader, then localStorage, then NEXT_PUBLIC env
  const rawApiKeyHeader =
    typeof llmData?.apiKeyHeader === "string"
      ? llmData.apiKeyHeader.replace(/^Bearer\s+/i, "").trim()
      : "";
  let effectiveApiKey = apiKey || rawApiKeyHeader || undefined;
  if (!effectiveApiKey && typeof window !== "undefined") {
    const envKey = getEnvKeyForProvider(effectiveProvider);
    effectiveApiKey =
      localStorage.getItem(`dezign2app_lg_key_${effectiveProvider}`) ||
      localStorage.getItem(`dezign2app_env_${envKey}`) ||
      undefined;
  }

  if (!effectiveApiKey && effectiveProvider === "groq") {
    effectiveApiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
  }

  if (isLlmActive && !effectiveApiKey && effectiveProvider !== "custom") {
    throw new Error(
      `Missing API Key: Agent node "${nodeName}" requires a valid ${effectiveProvider.toUpperCase()} API key. Please enter your API key in the toolbar.`,
    );
  }

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

  // STEP-BASED EXECUTION LOGGING
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

  if (isLlmActive) {
    // Call the real LLM endpoint directly in the browser
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
    addLog("llm", `Calling LLM: ${effectiveProvider.toUpperCase()} / ${effectiveModel} (${messages.length} message(s))`);
    const { text: responseText, streamBatches } = await callBrowserLLM({
      provider: effectiveProvider,
      apiKey: effectiveApiKey,
      modelName: effectiveModel,
      systemPrompt: interpolateBrowserPrompt(systemPrompt, state),
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
        (systemPrompt || "") +
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
      state.structuredResponse = parsed;
      outputDelta.structuredResponse = parsed;
      const formattedContent = JSON.stringify(parsed, null, 2);
      const newMessages = [
        ...messages,
        {
          role: "assistant",
          content: formattedContent,
          ...(aiMessageUsage ? { usage_metadata: aiMessageUsage } : {}),
        },
      ];
      state.messages = newMessages;
      outputDelta.messages = newMessages;
      outputDelta.response = formattedContent;
      addLog("llm", `Structured Output Parsed: ${JSON.stringify(parsed)}`, { structuredResponse: parsed });
    } else {
      const newMessages = [
        ...messages,
        {
          role: "assistant",
          content: responseText,
          ...(aiMessageUsage ? { usage_metadata: aiMessageUsage } : {}),
        },
      ];
      state.messages = newMessages;
      outputDelta.messages = newMessages;
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
      systemPrompt: interpolateBrowserPrompt(systemPrompt, state),
      messageCount: messages.length,
      ...(isTokenUsageActive && tokenUsage ? { usage: tokenUsage } : {}),
    };

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

      outputDelta.streamBatches = formattedBatches;
      outputDelta.streamBatchCount = formattedBatches.length;
      if (effectiveStreamConfig) {
        outputDelta.streamConfig = effectiveStreamConfig;
      }
    }
  } else {
    // If custom code was configured on this node, execute it
    if (agentData.customCode?.body?.trim()) {
      const runner = new Function("state", "clone", agentData.customCode.body);
      const res = await runner(state, clone);
      if (res && typeof res === "object") {
        Object.assign(outputDelta, res);
        Object.assign(state, res);
      }
    }
  }

  // Apply stateUpdates configured on agent
  const appliedStateUpdates = applyAgentStateUpdates({
    stateUpdates: agentData.stateUpdates,
    state,
    stateChannels,
    outputDelta,
    latestAssistantResponse,
    latestStructuredResponse,
    addLog,
  });

  if (appliedStateUpdates.length > 0) {
    outputDelta.stateUpdates = appliedStateUpdates;
  }

  return {
    outputDelta,
    latestAssistantResponse,
    latestStructuredResponse,
  };
}

