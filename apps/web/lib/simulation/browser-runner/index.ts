import {
  saveBrowserCheckpoint,
  getLatestBrowserCheckpoint,
  type BrowserCheckpoint,
} from "../indexedDBCheckpointer";
import { resolveInputTransition, isTransformerCanvasNode } from "@workspace/canvas";
import type {
  SimulationTraceEntry,
  SimulationStepLogEntry,
} from "../types";
import {
  clone,
  generateId,
  extractMessages,
} from "./state";
import {
  filterBrowserFlowEdges,
  resolveBrowserNextNode,
  attachConnectedToolsAndMiddleware,
} from "./edgeResolver";
import { executeBrowserAgentNode } from "./agentExecutor";
import { executeBrowserStepNode } from "./stepExecutor";
import type {
  BrowserExecutionParams,
  BrowserExecutionResult,
  GraphChatMessage,
} from "./types";

// Re-export modular components and types
export * from "./types";
export * from "./state";
export * from "./llm";
export * from "./edgeResolver";
export * from "./agentExecutor";
export * from "./stepExecutor";

/**
 * Execute LangGraph 100% in the browser environment.
 * Zero external servers, zero Next.js API routes, zero mock/fake responses.
 */
export async function executeBrowserLangGraph(
  params: BrowserExecutionParams,
): Promise<BrowserExecutionResult> {
  const startTime = Date.now();
  const {
    nodes,
    edges,
    stateChannels,
    inputChannels,
    memoryConfig,
    inputValues,
    threadId,
    provider = "groq",
    apiKey,
    modelName,
    onStepStart,
    onStepEnd,
    onCheckpoint,
  } = params;

  if (memoryConfig?.checkpointer && memoryConfig.checkpointer !== "memory") {
    console.warn(
      `[sim] ${memoryConfig.checkpointer} checkpointer not supported directly in browser preview — using in-browser IndexedDB / MemorySaver fallback`,
    );
  }

  const trace: SimulationTraceEntry[] = [];
  const allRunLogs: SimulationStepLogEntry[] = [];
  const visitedNodes: string[] = [];
  let latestAssistantResponse: string | undefined;
  let latestStructuredResponse: Record<string, unknown> | undefined;

  // 1. Initialize State
  let state: Record<string, unknown> & { messages: GraphChatMessage[] } = {
    messages: [],
  };

  // Check for prior checkpoint in thread memory
  const previousCheckpoint = await getLatestBrowserCheckpoint(threadId);
  if (previousCheckpoint?.state) {
    state = Object.assign(clone(previousCheckpoint.state), {
      messages: extractMessages((previousCheckpoint.state as Record<string, unknown>).messages),
    });
  } else {
    // Initialize default channel values
    for (const channel of stateChannels) {
      if (channel.key === "messages") {
        state.messages = extractMessages(channel.defaultValue);
      } else if (channel.defaultValue !== undefined && channel.defaultValue !== null) {
        state[channel.key] = clone(channel.defaultValue);
      } else if (channel.type === "number") {
        state[channel.key] = 0;
      } else if (channel.type === "boolean") {
        state[channel.key] = false;
      } else if (channel.type === "array") {
        state[channel.key] = [];
      } else if (channel.type === "object") {
        state[channel.key] = {};
      } else {
        state[channel.key] = "";
      }
    }
  }

  // 2. Map inputChannels values to stateChannels
  for (const inputCh of inputChannels) {
    const val = inputValues[inputCh.key];
    if (val !== undefined) {
      const targetStateKey = inputCh.stateChannelKey || inputCh.key;
      const targetChannel = stateChannels.find((sc) => sc.key === targetStateKey);
      const transition = resolveInputTransition(inputCh, targetChannel);

      switch (transition) {
        case "as_human_message": {
          const msgs = extractMessages(state[targetStateKey]);
          if (typeof val === "string" && val.trim()) {
            state.messages = [
              ...msgs,
              { role: "user", content: val.trim() },
            ];
          } else if (Array.isArray(val)) {
            state.messages = [...msgs, ...extractMessages(val)];
          } else if (val && typeof val === "object") {
            state.messages = [...msgs, ...extractMessages([val])];
          }
          break;
        }
        case "append_to_list": {
          const existing = Array.isArray(state[targetStateKey])
            ? (state[targetStateKey] as unknown[])
            : [];
          state[targetStateKey] = Array.isArray(val)
            ? [...existing, ...val]
            : [...existing, val];
          break;
        }
        case "merge_object": {
          const existing =
            typeof state[targetStateKey] === "object" && state[targetStateKey] !== null
              ? (state[targetStateKey] as Record<string, unknown>)
              : {};
          state[targetStateKey] = {
            ...existing,
            ...(typeof val === "object" && val !== null
              ? (val as Record<string, unknown>)
              : {}),
          };
          break;
        }
        case "parse_json": {
          if (typeof val === "string") {
            try {
              state[targetStateKey] = JSON.parse(val);
            } catch {
              state[targetStateKey] = val;
            }
          } else {
            state[targetStateKey] = val;
          }
          break;
        }
        case "transformer": {
          // If transformer is referenced, check for matching transformer node code
          const tNode = nodes.find(
            (n) =>
              isTransformerCanvasNode(n) &&
              (n.data.functionName === inputCh.transformerRef ||
                n.data.label === inputCh.transformerRef ||
                n.id === inputCh.transformerRef),
          );
          const tCode = tNode && isTransformerCanvasNode(tNode) ? tNode.data.code : undefined;
          if (tCode && typeof tCode === "string" && tCode.trim()) {
            try {
              const fn = new Function("input", "state", tCode);
              const transformed = fn(val, state);
              if (targetStateKey === "messages") {
                const msgs = extractMessages(state.messages);
                state.messages = Array.isArray(transformed)
                  ? [...msgs, ...extractMessages(transformed)]
                  : [...msgs, { role: "user", content: String(transformed) }];
              } else {
                state[targetStateKey] = transformed;
              }
            } catch (err) {
              console.warn(`[sim] Error in transformer "${inputCh.transformerRef}":`, err);
              state[targetStateKey] = val;
            }
          } else {
            state[targetStateKey] = val;
          }
          break;
        }
        case "direct":
        default: {
          if (targetStateKey === "messages") {
            const msgs = extractMessages(state.messages);
            if (Array.isArray(val)) {
              state.messages = [...msgs, ...extractMessages(val)];
            } else if (typeof val === "string" && val.trim()) {
              state.messages = [...msgs, { role: "user", content: val.trim() }];
            }
          } else {
            state[targetStateKey] = val;
          }
          break;
        }
      }
    }
  }

  // 3. Process direct inputs (like chatMessage or values passed directly)
  for (const [k, v] of Object.entries(inputValues)) {
    if (k === "messages") {
      const msgs = extractMessages(state.messages);
      if (typeof v === "string" && v.trim()) {
        state.messages = [...msgs, { role: "user", content: v.trim() }];
      } else if (Array.isArray(v)) {
        state.messages = [...msgs, ...extractMessages(v)];
      }
    } else if (state[k] === undefined && v !== undefined) {
      state[k] = v;
    }
  }

  // Record START step
  const startLogs: SimulationStepLogEntry[] = [
    {
      timestamp: Date.now(),
      level: "step",
      message: `Graph execution started (threadId: "${threadId}")`,
      nodeId: "START",
      nodeLabel: "START",
    },
    {
      timestamp: Date.now(),
      level: "state",
      message: `Initialized graph state channels (${Object.keys(state).length} active: ${Object.keys(state).join(", ")})`,
      nodeId: "START",
      nodeLabel: "START",
      details: clone(state),
    },
  ];
  allRunLogs.push(...startLogs);

  const startTrace: SimulationTraceEntry = {
    id: `trace_${generateId()}`,
    kind: "step",
    label: "START",
    status: "completed",
    nodeId: "START",
    input: clone(state),
    output: clone(state),
    logs: startLogs,
  };
  trace.push(startTrace);
  visitedNodes.push("START");
  onStepStart?.("START", "START", clone(state));
  onStepEnd?.("START", "START", clone(state), 2);

  // 4. Find outgoing flow edges from START
  const flowEdges = filterBrowserFlowEdges(edges);

  const currentEdge = flowEdges.find((e) => e.source === "START");
  let currentNodeId = currentEdge?.target;
  let safetyLoopGuard = 0;
  const maxSteps = nodes.length * 4 + 10;

  while (
    currentNodeId &&
    currentNodeId !== "END" &&
    safetyLoopGuard++ < maxSteps
  ) {
    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) break;

    visitedNodes.push(node.id);
    const nodeName =
      (node.data as { label?: string; name?: string })?.label ||
      (node.data as { label?: string; name?: string })?.name ||
      node.id;

    onStepStart?.(node.id, nodeName, clone(state));
    const stepStartTime = Date.now();

    const stepLogs: SimulationStepLogEntry[] = [];
    const addLog = (
      level: SimulationStepLogEntry["level"],
      message: string,
      details?: unknown,
    ) => {
      const entry: SimulationStepLogEntry = {
        timestamp: Date.now(),
        level,
        message,
        nodeId: node.id,
        nodeLabel: nodeName,
        ...(details !== undefined ? { details } : {}),
      };
      stepLogs.push(entry);
      allRunLogs.push(entry);
    };

    addLog("step", `Started execution of step "${nodeName}" (type: ${node.type || "step"})`);

    const nodeTrace: SimulationTraceEntry = {
      id: `trace_${generateId()}`,
      kind: "step",
      label: nodeName,
      status: "completed",
      nodeId: node.id,
      input: clone(state),
      logs: stepLogs,
    };
    trace.push(nodeTrace);

    const outputDelta: Record<string, unknown> = {};

    try {
      const isAgent =
        node.type === "langgraph_agent" ||
        node.type === "langgraph_node";
      const isStep = node.type === "step";

      // ─── A. AGENT / COMPONENT NODE ──────────────────────────────────
      if (isAgent) {
        const agentResult = await executeBrowserAgentNode({
          node,
          nodeName,
          state,
          nodes,
          edges,
          stateChannels,
          threadId,
          provider,
          apiKey,
          modelName,
          latestAssistantResponse,
          latestStructuredResponse,
          addLog,
        });
        Object.assign(outputDelta, agentResult.outputDelta);
        if (agentResult.latestAssistantResponse !== undefined) {
          latestAssistantResponse = agentResult.latestAssistantResponse;
        }
        if (agentResult.latestStructuredResponse !== undefined) {
          latestStructuredResponse = agentResult.latestStructuredResponse;
        }
      }

      // ─── B. STEP NODE ───────────────────────────────────────────────
      else if (isStep) {
        const stepResult = await executeBrowserStepNode({
          node,
          nodeName,
          currentNodeId,
          state,
          nodes,
          edges,
          flowEdges,
          stateChannels,
          threadId,
          provider,
          apiKey,
          modelName,
          latestAssistantResponse,
          latestStructuredResponse,
          addLog,
        });
        Object.assign(outputDelta, stepResult.outputDelta);
        if (stepResult.latestAssistantResponse !== undefined) {
          latestAssistantResponse = stepResult.latestAssistantResponse;
        }
      }

      // Attach generic connected tools and middleware metadata for any node
      attachConnectedToolsAndMiddleware({
        node,
        nodes,
        edges,
        outputDelta,
        addLog,
      });

      const durationMs = Date.now() - stepStartTime;
      addLog("step", `Completed step "${nodeName}" in ${durationMs}ms`);
      nodeTrace.status = "completed";
      nodeTrace.logs = stepLogs;
      nodeTrace.output = clone(outputDelta);
      onStepEnd?.(node.id, nodeName, clone(outputDelta), durationMs);

      // Save interim checkpoint
      const checkpoint: BrowserCheckpoint = {
        id: generateId(),
        threadId,
        stepId: node.id,
        stepName: nodeName,
        state: clone(state),
        timestamp: Date.now(),
      };
      await saveBrowserCheckpoint(checkpoint);
      onCheckpoint?.(checkpoint);
    } catch (err: unknown) {
      nodeTrace.status = "failed";
      const errMsg = err instanceof Error ? err.message : String(err);
      addLog("error", `Step "${nodeName}" failed: ${errMsg}`);
      nodeTrace.logs = stepLogs;
      nodeTrace.output = { error: errMsg };
      onStepEnd?.(node.id, nodeName, { error: errMsg }, Date.now() - stepStartTime);
      return {
        finalState: state,
        trace,
        logs: allRunLogs,
        totalDurationMs: Date.now() - startTime,
        visitedNodes,
        latestAssistantResponse,
        error: errMsg,
      };
    }

    // Determine Next Node
    const outgoing = flowEdges.filter((e) => e.source === currentNodeId);
    if (outgoing.length === 0) break;

    const { nextNodeId, loopbackNodeId } = resolveBrowserNextNode({
      currentNodeId,
      outputDelta,
      flowEdges,
      nodes,
      addLog,
    });

    if (loopbackNodeId) {
      visitedNodes.push(loopbackNodeId);
    }
    currentNodeId = nextNodeId;
  }

  // Handle Infinite Loop timeout
  const exceededMaxSteps = safetyLoopGuard >= maxSteps && currentNodeId !== "END";
  if (exceededMaxSteps) {
    const loopCycle = visitedNodes.slice(-6).map((id) => {
      const n = nodes.find((node) => node.id === id);
      return (n?.data as { label?: string; name?: string })?.label || id;
    });
    const loopMsg = `Infinite loop detected! Execution exceeded maximum limit of ${maxSteps} steps without reaching END. Repeating path: ${loopCycle.join(" → ")}`;

    allRunLogs.push({
      timestamp: Date.now(),
      level: "error",
      message: loopMsg,
      nodeId: currentNodeId || "LOOP_GUARD",
      nodeLabel: "Infinite Loop Guard",
    });

    const errorTrace: SimulationTraceEntry = {
      id: `trace_${generateId()}`,
      kind: "step",
      label: "Infinite Loop Exceeded",
      status: "failed",
      nodeId: currentNodeId || "LOOP_GUARD",
      input: clone(state),
      output: clone(state),
      logs: [
        {
          timestamp: Date.now(),
          level: "error",
          message: loopMsg,
          nodeId: currentNodeId || "LOOP_GUARD",
          nodeLabel: "Infinite Loop Guard",
        },
      ],
    };
    trace.push(errorTrace);
    onStepStart?.(currentNodeId || "LOOP_GUARD", "Infinite Loop Guard", clone(state));
    onStepEnd?.(currentNodeId || "LOOP_GUARD", "Infinite Loop Guard", clone(state), 2);

    return {
      finalState: state,
      trace,
      logs: allRunLogs,
      totalDurationMs: Date.now() - startTime,
      visitedNodes,
      latestAssistantResponse,
      error: loopMsg,
    };
  }

  // END Step
  visitedNodes.push("END");
  const endLogs: SimulationStepLogEntry[] = [
    {
      timestamp: Date.now(),
      level: "step",
      message: `Graph reached END. Visited ${visitedNodes.length} steps in ${Date.now() - startTime}ms.`,
      nodeId: "END",
      nodeLabel: "END",
    },
  ];
  allRunLogs.push(...endLogs);

  const endTrace: SimulationTraceEntry = {
    id: `trace_${generateId()}`,
    kind: "step",
    label: "END",
    status: "completed",
    nodeId: "END",
    input: clone(state),
    output: clone(state),
    logs: endLogs,
  };
  trace.push(endTrace);
  onStepStart?.("END", "END", clone(state));
  onStepEnd?.("END", "END", clone(state), 2);

  // Final checkpoint
  const finalCheckpoint: BrowserCheckpoint = {
    id: generateId(),
    threadId,
    stepId: "END",
    stepName: "END",
    state: clone(state),
    timestamp: Date.now(),
  };
  await saveBrowserCheckpoint(finalCheckpoint);
  onCheckpoint?.(finalCheckpoint);

  return {
    finalState: state,
    trace,
    logs: allRunLogs,
    totalDurationMs: Date.now() - startTime,
    visitedNodes,
    latestAssistantResponse,
  };
}

