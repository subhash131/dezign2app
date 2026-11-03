import type {
  StepNodeData,
  ToolNodeData,
} from "@workspace/canvas";
import { evaluateRouterBranch, resolveRouterFieldValue } from "../langgraph";
import { formatStreamingBatch, type StreamBatchItem } from "../streamFormatter";
import { callBrowserLLM } from "./llm";
import {
  clone,
  extractMessages,
  isLangGraphLLMNode,
  getEnvKeyForProvider,
  applyStepStateUpdates,
} from "./state";
import type {
  ExecuteBrowserStepParams,
  ExecuteBrowserStepResult,
  GraphChatMessage,
  LangGraphSimulationProvider,
} from "./types";

/**
 * Execute a LangGraph step node (LLM call, tool node, custom code, router, or human gate) in the browser preview.
 */
export async function executeBrowserStepNode(
  params: ExecuteBrowserStepParams,
): Promise<ExecuteBrowserStepResult> {
  const {
    node,
    nodeName,
    currentNodeId,
    state,
    nodes,
    edges,
    flowEdges,
    stateChannels,
    threadId,
    provider = "groq",
    apiKey,
    modelName,
    addLog,
  } = params;

  let latestAssistantResponse = params.latestAssistantResponse;
  const outputDelta: Record<string, unknown> = {};
  const stepData = node.data as StepNodeData;

  // ─── B1: LLM Call / Summarizer / Evaluator Step ───────────────────────────
  if (
    stepData.stepType === "llm_call" ||
    stepData.stepType === "summarizer" ||
    stepData.stepType === "evaluator"
  ) {
    const llmEdge = edges.find(
      (e) => e.target === node.id && e.targetHandle === "llm_in",
    );
    const llmNode = llmEdge ? nodes.find((n) => n.id === llmEdge.source) : null;
    const llmData = isLangGraphLLMNode(llmNode) ? llmNode.data : undefined;

    const effectiveProvider: LangGraphSimulationProvider =
      llmData?.provider || provider || "groq";
    const effectiveModel =
      llmData?.model ||
      stepData.modelConfig?.model ||
      modelName ||
      (effectiveProvider === "groq"
        ? "openai/gpt-oss-120b"
        : effectiveProvider === "openai"
        ? "gpt-4o-mini"
        : "claude-3-5-sonnet-20241022");

    const rawStepApiKey =
      typeof stepData.modelConfig?.apiKeyHeader === "string"
        ? stepData.modelConfig.apiKeyHeader.replace(/^Bearer\s+/i, "").trim()
        : "";
    const rawNodeApiKey =
      typeof llmData?.apiKeyHeader === "string"
        ? llmData.apiKeyHeader.replace(/^Bearer\s+/i, "").trim()
        : "";
    let effectiveApiKey = apiKey || rawStepApiKey || rawNodeApiKey || undefined;

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

    if (!effectiveApiKey && effectiveProvider !== "custom") {
      throw new Error(
        `Missing API Key: Step "${nodeName}" requires a valid ${effectiveProvider.toUpperCase()} API key.`,
      );
    }

    const systemPrompt =
      stepData.modelConfig?.systemPrompt ||
      (stepData.stepType === "summarizer"
        ? "Summarize the current conversation and state concisely."
        : stepData.stepType === "evaluator"
        ? "Evaluate the input against criteria and provide assessment."
        : "You are a helpful assistant.");

    let msgs: GraphChatMessage[] = extractMessages(state.messages);
    if (msgs.length === 0) {
      if (typeof state.message === "string" && state.message.trim()) {
        msgs = [{ role: "user", content: state.message.trim() }];
      } else if (typeof state.prompt === "string" && state.prompt.trim()) {
        msgs = [{ role: "user", content: state.prompt.trim() }];
      } else {
        msgs = [{ role: "user", content: JSON.stringify(state) }];
      }
    }

    addLog(
      "llm",
      `Executing ${stepData.stepType} step via ${effectiveProvider.toUpperCase()} (${effectiveModel})`,
    );
    const { text: responseText, streamBatches } = await callBrowserLLM({
      provider: effectiveProvider,
      apiKey: effectiveApiKey,
      modelName: effectiveModel,
      systemPrompt,
      messages: msgs,
      customUrl: llmData?.url || llmData?.baseUrl,
    });

    latestAssistantResponse = responseText;
    addLog("llm", `Received response from ${effectiveModel} (${responseText.length} chars)`);
    const outKey = stepData.stepId || node.id || "response";
    outputDelta[outKey] = responseText;
    if (Array.isArray(state.messages)) {
      const updated = [...state.messages, { role: "assistant", content: responseText }];
      state.messages = updated;
      outputDelta.messages = updated;
    } else {
      state[outKey] = responseText;
    }

    const allPromptText =
      (systemPrompt || "") +
      " " +
      msgs
        .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
        .join(" ");
    const prompt_tokens = Math.max(1, Math.ceil(allPromptText.length / 4));
    const completion_tokens = Math.max(1, Math.ceil((responseText || "").length / 4));
    const tokenUsage = {
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
    };
    outputDelta.usage = tokenUsage;
    outputDelta.tokenUsage = tokenUsage;
    if (streamBatches && streamBatches.length > 0) {
      const runId = `run_${threadId.slice(0, 8)}_${Math.random().toString(36).slice(2, 6)}`;
      const filtered = streamBatches.filter((b) => Boolean(b.delta));
      const formattedBatches: StreamBatchItem[] = filtered.map((b, newIdx) => ({
        ...b,
        index: newIdx,
        formatted: formatStreamingBatch({
          batch: b,
          nodeName,
          runId,
          streamConfig: undefined,
        }),
      }));

      outputDelta.streamBatches = formattedBatches;
      outputDelta.streamBatchCount = formattedBatches.length;
    }
  }

  // ─── B2: Tool Node Step ───────────────────────────────────────────────────
  else if (stepData.stepType === "tool_node") {
    const toolEdge = edges.find(
      (e) => e.target === node.id && e.targetHandle === "tool_in",
    );
    const toolNode = toolEdge ? nodes.find((n) => n.id === toolEdge.source) : null;
    const toolData = toolNode?.data as ToolNodeData | undefined;

    if (!toolData) {
      throw new Error(
        `Tool step "${nodeName}" does not have a connected tool definition on the canvas.`,
      );
    }

    addLog("tool", `Invoking tool "${toolData.name || nodeName}" [source: ${toolData.source}]`);

    if (toolData.source === "api_endpoint") {
      if (!toolData.endpointUrl) {
        throw new Error(`Tool "${toolData.name || nodeName}" has no endpoint URL configured.`);
      }
      addLog("tool", `POST request sent to ${toolData.endpointUrl}`);
      let res: Response;
      try {
        res = await fetch(toolData.endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        });
      } catch (netErr: unknown) {
        throw new Error(
          `API tool "${toolData.name || nodeName}" failed to reach ${toolData.endpointUrl}: ${netErr instanceof Error ? netErr.message : String(netErr)}`,
        );
      }
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(
          `API tool "${toolData.name || nodeName}" (${toolData.endpointUrl}) failed with HTTP ${res.status}: ${errBody}`,
        );
      }
      const json = await res.json();
      addLog(
        "tool",
        `Tool "${toolData.name || nodeName}" returned HTTP ${res.status} (${JSON.stringify(json).length} bytes)`,
      );
      const resKey = toolData.name || "tool_result";
      outputDelta[resKey] = json;
      state[resKey] = json;
    } else if (toolData.functionBody && toolData.functionBody.trim()) {
      try {
        const toolFn = new Function("input", "state", "clone", toolData.functionBody);
        const lastMsg = Array.isArray(state.messages)
          ? state.messages[state.messages.length - 1]
          : undefined;
        const result = await toolFn(lastMsg || state, state, clone);
        addLog("tool", `Executed custom tool function body successfully`);
        const resKey = toolData.name || "tool_result";
        outputDelta[resKey] = result;
        state[resKey] = result;
      } catch (err: unknown) {
        throw new Error(
          `Tool "${toolData.name || nodeName}" execution error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (toolData.source === "mcp_server") {
      throw new Error(
        `Tool "${toolData.name || nodeName}" is an MCP tool (${toolData.mcpConnectionId || "remote"}). Live MCP execution requires a backend server bridge. Configure a JavaScript function body or API endpoint to test in-browser.`,
      );
    } else {
      throw new Error(
        `Tool "${toolData.name || nodeName}" has no implementation. Please define a JavaScript function body or API endpoint for this tool.`,
      );
    }
  }

  // ─── B3: Custom Code Step ─────────────────────────────────────────────────
  else if (stepData.stepType === "custom_code") {
    if (!stepData.customCode?.body || !stepData.customCode.body.trim()) {
      throw new Error(`Custom code step "${nodeName}" has an empty function body.`);
    }
    addLog("step", `Executing custom code script for "${nodeName}"`);
    try {
      const customConsole = {
        log: (...args: unknown[]) => {
          const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
          addLog("info", `[console.log] ${msg}`);
        },
        warn: (...args: unknown[]) => {
          const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
          addLog("warn", `[console.warn] ${msg}`);
        },
        error: (...args: unknown[]) => {
          const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
          addLog("error", `[console.error] ${msg}`);
        },
      };
      const runner = new Function("state", "clone", "console", stepData.customCode.body);
      const res = await runner(state, clone, customConsole);
      if (res && typeof res === "object") {
        Object.assign(state, res);
        Object.assign(outputDelta, res);
      }
      addLog("step", `Custom code block executed successfully`);
    } catch (codeErr: unknown) {
      throw new Error(
        `Custom code step "${nodeName}" error: ${codeErr instanceof Error ? codeErr.message : String(codeErr)}`,
      );
    }
  }

  // ─── B4: Router Step ──────────────────────────────────────────────────────
  else if (stepData.stepType === "router") {
    const branches = stepData.routerConfig?.branches || [];
    const outgoing = flowEdges.filter((e) => e.source === currentNodeId);
    addLog("router", `Evaluating ${branches.length} conditional route branch(es)`);

    const evaluatedBranches = branches.map((b, bIdx) => {
      const actualVal = resolveRouterFieldValue(b.field, state);
      const isMatch = !b.isDefault && evaluateRouterBranch(b, state);
      const edge = outgoing.find((e) => e.sourceHandle === b.id) || outgoing[0];
      const targetNode = nodes.find((n) => n.id === edge?.target);
      const targetLabel =
        edge?.target === "END" || edge?.target?.startsWith("end_")
          ? "END"
          : (targetNode?.data as { label?: string })?.label || edge?.target || "END";
      addLog(
        "router",
        `Route "${b.label || `Route ${bIdx + 1}`}": (${b.field || "state"} ${b.operator} ${b.value ?? ""}) -> ${isMatch ? "MATCHED" : "SKIPPED"} [state: ${JSON.stringify(actualVal)}]`,
      );
      return {
        id: b.id,
        label: b.label || `Route ${bIdx + 1}`,
        field: b.field,
        operator: b.operator,
        value: b.value,
        isDefault: b.isDefault,
        actualValue: actualVal,
        matched: isMatch,
        targetId: edge?.target,
        targetLabel,
      };
    });

    let matchedBranch = branches.find(
      (b) => !b.isDefault && evaluateRouterBranch(b, state),
    );
    if (!matchedBranch) {
      matchedBranch = branches.find((b) => b.isDefault);
    }

    const targetEdge = matchedBranch
      ? outgoing.find((e) => e.sourceHandle === matchedBranch?.id) || outgoing[0]
      : outgoing[0];

    const targetNode = nodes.find((n) => n.id === targetEdge?.target);
    const targetNodeLabel =
      targetEdge?.target === "END" || targetEdge?.target?.startsWith("end_")
        ? "END"
        : (targetNode?.data as { label?: string })?.label || targetEdge?.target || "END";

    const selectedRouteName =
      matchedBranch?.label || (matchedBranch?.id ? `Route (${matchedBranch.id})` : "Default");
    const conditionDesc = matchedBranch?.isDefault
      ? "default (fallback)"
      : matchedBranch
      ? `${matchedBranch.field} ${matchedBranch.operator} ${matchedBranch.value ?? ""}`.trim()
      : "none";

    addLog("router", `Selected Route: "${selectedRouteName}" -> Proceeding to step "${targetNodeLabel}"`);

    outputDelta.router = {
      selectedRoute: selectedRouteName,
      selectedBranchId: matchedBranch?.id,
      condition: conditionDesc,
      targetNodeId: targetEdge?.target,
      targetNodeLabel,
      evaluatedBranches,
    };
  }

  // ─── B5: Human Gate / Interrupt Step ──────────────────────────────────────
  else if (stepData.stepType === "human_gate" || stepData.stepType === "interrupt") {
    const pauseMsg =
      stepData.humanGateConfig?.approvalPrompt ||
      "Execution paused at human gate.";
    addLog("warn", `Human Gate: ${pauseMsg}`);
    outputDelta.interrupt = {
      message: pauseMsg,
    };
  }

  // Apply stateUpdates for step nodes
  const appliedStepStateUpdates = applyStepStateUpdates({
    stateUpdates: stepData.stateUpdates,
    state,
    stateChannels,
    outputDelta,
    latestAssistantResponse,
    addLog,
  });

  if (appliedStepStateUpdates.length > 0) {
    outputDelta.stateUpdates = appliedStepStateUpdates;
  }

  return {
    outputDelta,
    latestAssistantResponse,
  };
}

