import {
  StateGraph,
  START,
  END,
  BaseCheckpointSaver,
} from "@langchain/langgraph";
import type {
  StepNodeData,
  AgentNodeData,
  ToolNodeData,
  MiddlewareNodeData,
} from "@workspace/canvas";
import {
  evaluateRouterBranch,
  resolveRouterFieldValue,
} from "../langgraph";
import type {
  SimulationTraceEntry,
  SimulationStepLogEntry,
} from "../types";
import type { StreamBatchItem } from "../streamFormatter";

import {
  ServerExecutionParams,
  ServerExecutionResult,
  ServerExecutionCheckpoint,
} from "./types";
import {
  getOrCreateCheckpointer,
} from "./checkpointer";
import {
  clone,
  generateId,
  serializeMessages,
  coerceToLangChainMessages,
  serializeStateValues,
} from "./messages";
import { buildGraphAnnotationSchema } from "./schema";
import { filterFlowEdges, createTargetNodeResolver } from "./edgeResolver";
import { executeAgentNode } from "./agentExecutor";
import { executeStepNode } from "./stepExecutor";

// Re-export modular components and types
export * from "./types";
export * from "./checkpointer";
export * from "./messages";
export * from "./llm";
export * from "./schema";
export * from "./edgeResolver";
export * from "./agentExecutor";
export * from "./stepExecutor";

/**
 * Execute graph directly via official @langchain/langgraph StateGraph runtime on Node.js
 */
export async function executeServerLangGraph(
  params: ServerExecutionParams,
): Promise<ServerExecutionResult> {
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
  } = params;

  const trace: SimulationTraceEntry[] = [];
  const allRunLogs: SimulationStepLogEntry[] = [];
  const visitedNodes: string[] = [];
  const nodeStreamBatchesMap = new Map<string, StreamBatchItem[]>();
  const nodeLlmRequestMap = new Map<string, unknown>();
  let latestAssistantResponse: string | undefined;

  // 1. Build Dynamic Annotation Schema for @langchain/langgraph StateGraph
  const GraphState = buildGraphAnnotationSchema(nodes, stateChannels);

  // 2. Initialize StateGraph Builder
  const rawBuilder = new StateGraph(GraphState);
  const builder = rawBuilder as unknown as {
    addNode: (
      node: string,
      action: (state: Record<string, unknown>) => Promise<Record<string, unknown>>,
    ) => void;
    addEdge: (from: string | typeof START, to: string | typeof END) => void;
    addConditionalEdges: (
      from: string,
      condition: (state: Record<string, unknown>) => string,
      pathMap: Record<string, string | typeof END>,
    ) => void;
    compile: (options?: { checkpointer?: BaseCheckpointSaver }) => {
      stream: (
        input: Record<string, unknown>,
        options?: { configurable?: { thread_id: string }; streamMode?: string },
      ) => Promise<AsyncIterable<Record<string, Record<string, unknown>>>>;
      invoke: (
        input: Record<string, unknown>,
        options?: { configurable?: { thread_id: string } },
      ) => Promise<Record<string, unknown>>;
      getState: (options?: {
        configurable?: { thread_id: string };
      }) => Promise<{ values?: Record<string, unknown> }>;
      getStateHistory: (options?: {
        configurable?: { thread_id: string };
      }) => AsyncIterable<{
        values?: Record<string, unknown>;
        config?: { configurable?: { checkpoint_id?: string; thread_id?: string } };
        metadata?: { step?: number };
        createdAt?: string;
      }>;
    };
  };

  // Step Node Labels map
  const nodeLabelMap = new Map<string, string>();
  for (const n of nodes) {
    const label =
      (n.data as { label?: string; name?: string })?.label ||
      (n.data as { label?: string; name?: string })?.name ||
      n.id;
    nodeLabelMap.set(n.id, label);
  }

  // 3. Register Nodes
  const executableNodes = nodes.filter(
    (n) =>
      n.type === "langgraph_agent" ||
      n.type === "langgraph_node" ||
      n.type === "step",
  );

  const nodeLogsMap = new Map<string, SimulationStepLogEntry[]>();

  for (const node of executableNodes) {
    const nodeName = nodeLabelMap.get(node.id) || node.id;
    const isAgent =
      node.type === "langgraph_agent" ||
      node.type === "langgraph_node";
    const isStep = node.type === "step";

    builder.addNode(node.id, async (state: Record<string, unknown>) => {
      if (isAgent) {
        const result = await executeAgentNode({
          node,
          nodeName,
          state,
          edges,
          nodes,
          stateChannels,
          threadId,
          provider,
          apiKey,
          modelName,
          nodeStreamBatchesMap,
          nodeLlmRequestMap,
        });
        if (result.latestAssistantResponse) {
          latestAssistantResponse = result.latestAssistantResponse;
        }
        nodeLogsMap.set(node.id, result.stepLogs);
        return result.outputDelta;
      }

      if (isStep) {
        const result = await executeStepNode({
          node,
          nodeName,
          state,
          edges,
          nodes,
          threadId,
          provider,
          apiKey,
          modelName,
          nodeStreamBatchesMap,
        });
        if (result.latestAssistantResponse) {
          latestAssistantResponse = result.latestAssistantResponse;
        }
        nodeLogsMap.set(node.id, result.stepLogs);
        return result.outputDelta;
      }

      return {};
    });
  }

  // 4. Edges & Flow Configuration
  const flowEdges = filterFlowEdges(edges);
  const resolveTargetNodeId = createTargetNodeResolver(nodes, executableNodes);

  // START edges
  const startEdge = flowEdges.find((e) => e.source === "START");
  if (startEdge) {
    builder.addEdge(START, resolveTargetNodeId(startEdge.target));
  }

  // Node to Node / Router Edges
  for (const node of executableNodes) {
    const stepData = node.data as StepNodeData | undefined;
    const isRouter = node.type === "step" && stepData?.stepType === "router";

    const outgoing = flowEdges.filter((e) => e.source === node.id);
    if (outgoing.length === 0) {
      builder.addEdge(node.id, END);
      continue;
    }

    if (isRouter && stepData?.routerConfig?.branches) {
      const branches = stepData.routerConfig.branches;
      const pathMap: Record<string, string | typeof END> = {};

      for (const branch of branches) {
        const edge = outgoing.find((e) => e.sourceHandle === branch.id) || outgoing[0];
        pathMap[branch.id] = resolveTargetNodeId(edge?.target);
      }

      builder.addConditionalEdges(
        node.id,
        (state: Record<string, unknown>) => {
          let matched = branches.find((b) => !b.isDefault && evaluateRouterBranch(b, state));
          if (!matched) {
            matched = branches.find((b) => b.isDefault) || branches[0];
          }
          return matched?.id || "";
        },
        pathMap,
      );
    } else {
      const uniqueTargets = Array.from(
        new Set(outgoing.map((e) => resolveTargetNodeId(e.target))),
      );
      for (const target of uniqueTargets) {
        builder.addEdge(node.id, target);
      }
    }
  }

  // 5. Compile Graph with Checkpointer
  const isMemoryEnabled = memoryConfig?.enabled !== false;
  let checkpointer: BaseCheckpointSaver | undefined;

  if (isMemoryEnabled) {
    try {
      checkpointer = await getOrCreateCheckpointer(
        memoryConfig,
        threadId,
        params.checkpointerConnection,
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      trace.push({
        id: `trace_${generateId()}`,
        kind: "step",
        label: "Checkpointer Error",
        status: "failed",
        nodeId: "START",
        output: { error: errMsg },
      });
      return {
        finalState: {},
        trace,
        totalDurationMs: Date.now() - startTime,
        visitedNodes: ["START"],
        error: errMsg,
      };
    }
  }

  const compiledGraph = isMemoryEnabled && checkpointer
    ? builder.compile({ checkpointer })
    : builder.compile();

  // 6. Map input channels & inputValues to initial state
  const initialState: Record<string, unknown> = {};

  for (const inputCh of inputChannels) {
    const val = inputValues[inputCh.key];
    if (val !== undefined) {
      const targetStateKey = inputCh.stateChannelKey || inputCh.key;
      if (targetStateKey === "messages") {
        initialState.messages = coerceToLangChainMessages(
          typeof val === "string" ? [{ role: "user", content: val }] : val,
        );
      } else {
        initialState[targetStateKey] = val;
      }
    }
  }

  for (const [k, v] of Object.entries(inputValues)) {
    if (k === "messages") {
      initialState.messages = coerceToLangChainMessages(
        typeof v === "string" ? [{ role: "user", content: v }] : v,
      );
    } else if (initialState[k] === undefined && v !== undefined) {
      initialState[k] = v;
    }
  }

  if (Object.keys(initialState).length === 0) {
    initialState.messages = [];
  }

  // Record START trace
  visitedNodes.push("START");
  trace.push({
    id: `trace_${generateId()}`,
    kind: "step",
    label: "START",
    status: "completed",
    nodeId: "START",
    input: clone(initialState),
    output: clone(initialState),
  });

  // 7. Execute official LangGraph streaming run
  const accumulatedState: Record<string, unknown> = clone(initialState);
  try {
    const stream = await compiledGraph.stream(initialState, {
      configurable: { thread_id: threadId },
      streamMode: "updates",
    });

    let previousNodeId: string | null = null;
    for await (const chunk of stream) {
      for (const [nodeId, outputDelta] of Object.entries(chunk)) {
        if (previousNodeId) {
          const transitionEdge = flowEdges.find(
            (e) => e.source === previousNodeId && resolveTargetNodeId(e.target) === nodeId,
          );
          if (transitionEdge && transitionEdge.target !== nodeId) {
            const intermediateNode = nodes.find((n) => n.id === transitionEdge.target);
            if (
              intermediateNode &&
              (intermediateNode.type === "langgraph_agent_ref" ||
                intermediateNode.type === "langgraph_node_ref")
            ) {
              const refLabel =
                (intermediateNode.data as { label?: string })?.label ||
                intermediateNode.id;
              visitedNodes.push(intermediateNode.id);
              allRunLogs.push({
                timestamp: Date.now(),
                level: "step",
                nodeId: intermediateNode.id,
                nodeLabel: refLabel,
                message: `Looping back to "${nodeLabelMap.get(nodeId) || nodeId}" via loop reference "${refLabel}"`,
              });
            }
          }
        }
        previousNodeId = nodeId;
        visitedNodes.push(nodeId);
        const nodeName = nodeLabelMap.get(nodeId) || nodeId;

        const serializedDelta: Record<string, unknown> = {};
        if (outputDelta && typeof outputDelta === "object") {
          for (const [key, value] of Object.entries(outputDelta as Record<string, unknown>)) {
            if (key === "messages" && Array.isArray(value)) {
              serializedDelta.messages = serializeMessages(value);
            } else {
              serializedDelta[key] = value;
            }
          }
        }

        Object.assign(accumulatedState, serializedDelta);

        // Attach streaming batches captured during execution
        const nodeBatches = nodeStreamBatchesMap.get(nodeId) || [];
        if (nodeBatches.length > 0) {
          serializedDelta.streamBatches = nodeBatches;
          serializedDelta.streamBatchCount = nodeBatches.length;
        }

        const nodeObj = nodes.find((n) => n.id === nodeId);
        const isAgent = nodeObj?.type === "langgraph_agent" || nodeObj?.type === "langgraph_node";
        const agentData = isAgent ? (nodeObj?.data as AgentNodeData) : undefined;
        const stepData = nodeObj?.data as StepNodeData | undefined;

        if (outputDelta.streamConfig) {
          serializedDelta.streamConfig = outputDelta.streamConfig;
        } else if (agentData?.streamConfig) {
          serializedDelta.streamConfig = agentData.streamConfig;
        }

        const llmReq = nodeLlmRequestMap.get(nodeId);
        if (llmReq) {
          serializedDelta.llmRequest = llmReq;
        }

        // Attach generic connected tools and middleware
        const connectedTools = edges
          .filter((e) => e.target === nodeId && e.targetHandle === "tool_in")
          .map((e) => {
            const tn = nodes.find((n) => n.id === e.source);
            const tnData = tn?.data as ToolNodeData | undefined;
            return {
              id: tn?.id || e.source,
              name: tnData?.name || tnData?.label || "Tool",
              source: tnData?.source,
            };
          });

        const connectedMiddleware = edges
          .filter((e) => e.target === nodeId && e.targetHandle === "middleware_in")
          .map((e) => {
            const mn = nodes.find((n) => n.id === e.source);
            const mnData = mn?.data as MiddlewareNodeData | undefined;
            return {
              id: mn?.id || e.source,
              name: mnData?.name || mnData?.label || "Middleware",
              type: mnData?.type,
            };
          });

        if (connectedTools.length > 0) {
          serializedDelta.tools = connectedTools;
        }
        if (connectedMiddleware.length > 0) {
          serializedDelta.middleware = connectedMiddleware;
        }

        // Router evaluation metadata
        if (stepData?.stepType === "router" && stepData.routerConfig?.branches) {
          const branches = stepData.routerConfig.branches;
          const outgoing = flowEdges.filter((e) => e.source === nodeId);

          const evaluatedBranches = branches.map((b, bIdx) => {
            const actualVal = resolveRouterFieldValue(b.field, accumulatedState);
            const isMatch = !b.isDefault && evaluateRouterBranch(b, accumulatedState);
            const edge = outgoing.find((e) => e.sourceHandle === b.id) || outgoing[0];
            const targetNode = nodes.find((n) => n.id === edge?.target);
            const targetLabel =
              edge?.target === "END" || edge?.target?.startsWith("end_")
                ? "END"
                : (targetNode?.data as { label?: string })?.label || edge?.target || "END";
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
            (b) => !b.isDefault && evaluateRouterBranch(b, accumulatedState),
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

          serializedDelta.router = {
            selectedRoute: matchedBranch?.label || (matchedBranch?.id ? `Route (${matchedBranch.id})` : "Default"),
            selectedBranchId: matchedBranch?.id,
            condition: matchedBranch?.isDefault
              ? "default (fallback)"
              : matchedBranch
                ? `${matchedBranch.field} ${matchedBranch.operator} ${matchedBranch.value ?? ""}`.trim()
                : "none",
            targetNodeId: targetEdge?.target,
            targetNodeLabel,
            evaluatedBranches,
          };
        }

        const recordedLogs = nodeLogsMap.get(nodeId);
        const stepLogs: SimulationStepLogEntry[] =
          recordedLogs && recordedLogs.length > 0
            ? [...recordedLogs]
            : [
                {
                  timestamp: Date.now(),
                  level: "step",
                  message: `Executed step "${nodeName}" (type: ${nodeObj?.type || "step"}) on server`,
                  nodeId,
                  nodeLabel: nodeName,
                },
              ];

        if (connectedTools.length > 0 && !stepLogs.some((l) => l.level === "tool")) {
          stepLogs.push({
            timestamp: Date.now(),
            level: "tool",
            message: `Connected tools (${connectedTools.length}): ${connectedTools.map((t) => t.name).join(", ")}`,
            nodeId,
            nodeLabel: nodeName,
          });
        }
        if (connectedMiddleware.length > 0 && !stepLogs.some((l) => l.level === "middleware")) {
          stepLogs.push({
            timestamp: Date.now(),
            level: "middleware",
            message: `Connected middleware (${connectedMiddleware.length}): ${connectedMiddleware.map((m) => m.name).join(", ")}`,
            nodeId,
            nodeLabel: nodeName,
          });
        }
        if (serializedDelta.router) {
          const rInfo = serializedDelta.router as {
            selectedRoute?: string;
            targetNodeLabel?: string;
            condition?: string;
          };
          stepLogs.push({
            timestamp: Date.now(),
            level: "router",
            message: `Selected Route: "${rInfo.selectedRoute || "Default"}" -> Proceeding to "${rInfo.targetNodeLabel || "END"}" (${rInfo.condition || ""})`,
            nodeId,
            nodeLabel: nodeName,
          });
        }
        if (nodeBatches.length > 0 && !stepLogs.some((l) => l.level === "llm" && l.message.includes("Streamed"))) {
          stepLogs.push({
            timestamp: Date.now(),
            level: "llm",
            message: `Streamed ${nodeBatches.length} tokens/batches from server LLM runtime`,
            nodeId,
            nodeLabel: nodeName,
          });
        }
        allRunLogs.push(...stepLogs);

        trace.push({
          id: `trace_${generateId()}`,
          kind: "step",
          label: nodeName,
          status: "completed",
          nodeId,
          output: clone(serializedDelta),
          logs: stepLogs,
        });
      }
    }

    // Add END trace
    visitedNodes.push("END");
    const endLogs: SimulationStepLogEntry[] = [
      {
        timestamp: Date.now(),
        level: "step",
        message: `Node.js StateGraph reached END. Visited ${visitedNodes.length} steps in ${Date.now() - startTime}ms.`,
        nodeId: "END",
        nodeLabel: "END",
      },
    ];
    allRunLogs.push(...endLogs);

    trace.push({
      id: `trace_${generateId()}`,
      kind: "step",
      label: "END",
      status: "completed",
      nodeId: "END",
      logs: endLogs,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errLog: SimulationStepLogEntry = {
      timestamp: Date.now(),
      level: "error",
      message: `StateGraph execution failed: ${errMsg}`,
      nodeId: visitedNodes[visitedNodes.length - 1] || "START",
      nodeLabel: "Error",
    };
    allRunLogs.push(errLog);
    trace.push({
      id: `trace_${generateId()}`,
      kind: "step",
      label: "Error",
      status: "failed",
      nodeId: visitedNodes[visitedNodes.length - 1] || "START",
      output: { error: errMsg },
      logs: [errLog],
    });
    return {
      finalState: {},
      trace,
      logs: allRunLogs,
      totalDurationMs: Date.now() - startTime,
      visitedNodes,
      latestAssistantResponse,
      error: errMsg,
    };
  }

  // 8. Extract final state snapshot & checkpoints from official StateGraph checkpointer
  let finalState: Record<string, unknown> = { ...accumulatedState };
  const checkpoints: ServerExecutionCheckpoint[] = [];

  if (isMemoryEnabled && checkpointer) {
    try {
      const stateSnapshot = await compiledGraph.getState({
        configurable: { thread_id: threadId },
      });
      if (stateSnapshot?.values) {
        const snapVals = serializeStateValues(stateSnapshot.values);
        finalState = { ...accumulatedState, ...snapVals };
      }

      for await (const stateItem of compiledGraph.getStateHistory({
        configurable: { thread_id: threadId },
      })) {
        const cpConfig = stateItem.config?.configurable as
          | { checkpoint_id?: string; thread_id?: string }
          | undefined;
        checkpoints.push({
          id: cpConfig?.checkpoint_id || generateId(),
          threadId: cpConfig?.thread_id || threadId,
          stepName: stateItem.metadata?.step !== undefined ? `Step ${stateItem.metadata.step}` : "Checkpoint",
          state: serializeStateValues(stateItem.values || {}),
          timestamp: stateItem.createdAt ? new Date(stateItem.createdAt).getTime() : Date.now(),
        });
      }
    } catch (err) {
      console.error("GETSTATE ERROR:", err);
    }
  }

  // If latestAssistantResponse wasn't captured directly, pull from finalState messages
  if (!latestAssistantResponse && Array.isArray(finalState.messages)) {
    const msgs = finalState.messages as Array<{ role?: string; content?: string }>;
    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg && (lastMsg.role === "assistant" || lastMsg.role === "ai")) {
      latestAssistantResponse = lastMsg.content;
    }
  }

  return {
    finalState,
    trace,
    logs: allRunLogs,
    totalDurationMs: Date.now() - startTime,
    visitedNodes,
    latestAssistantResponse,
    checkpoints,
  };
}
