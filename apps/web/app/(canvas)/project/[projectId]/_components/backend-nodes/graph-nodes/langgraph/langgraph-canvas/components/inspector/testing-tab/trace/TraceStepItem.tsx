import React from "react";
import {
  Copy,
  ChevronDown,
  ChevronUp,
  Radio,
  GitBranch,
  Wrench,
  Shield,
  Terminal,
  Settings,
  Zap,
  Sparkles,
  Bot,
  Coins,
} from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { toast } from "sonner";
import { evaluateRouterBranch, resolveRouterFieldValue } from "@/lib/simulation/langgraph";
import type { SimulationTraceEntry, SimulationStepLogEntry, SimulationStepLogLevel } from "@/lib/simulation/types";
import type { LangGraphCanvasNode, LangGraphCanvasEdge } from "@workspace/canvas";
import type {
  TraceViewMode,
  BatchFormatMode,
  StreamBatchItem,
  RouterDecisionState,
  RouterBranchEval,
  AppliedStateUpdate,
} from "../types";
import { StreamBatchesView } from "./StreamBatchesView";
import { RouterDecisionCard } from "./RouterDecisionCard";
import { StepLogsView } from "./StepLogsView";

export interface TraceStepItemProps {
  step: SimulationTraceEntry;
  idx: number;
  nodes: LangGraphCanvasNode[];
  edges: LangGraphCanvasEdge[];
  expandedTraceNodes: Record<number, boolean>;
  setExpandedTraceNodes: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  traceNodeViews: Record<number, TraceViewMode>;
  setTraceNodeViews: React.Dispatch<React.SetStateAction<Record<number, TraceViewMode>>>;
  batchFormatViews: Record<number, BatchFormatMode>;
  setBatchFormatViews: React.Dispatch<React.SetStateAction<Record<number, BatchFormatMode>>>;
  expandedBatchRaw: Record<string, boolean>;
  expandedLogDetails: Record<string, boolean>;
  setExpandedLogDetails: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  finalState?: Record<string, unknown>;
  provider: string;
  modelName: string;
}

export function TraceStepItem({
  step: t,
  idx,
  nodes,
  edges,
  expandedTraceNodes,
  setExpandedTraceNodes,
  traceNodeViews,
  setTraceNodeViews,
  batchFormatViews,
  setBatchFormatViews,
  expandedBatchRaw,
  expandedLogDetails,
  setExpandedLogDetails,
  finalState,
  provider,
  modelName,
}: TraceStepItemProps) {
  const isFailed = t.status === "failed";
  const isNodeExpanded = expandedTraceNodes[idx];
  const outputObj = (t.output && typeof t.output === "object" ? t.output : null) as Record<string, unknown> | null;
  const nodeUsage = (outputObj?.usage || outputObj?.tokenUsage || (outputObj?.llmRequest as any)?.usage) as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined;
  const streamBatches = (outputObj?.streamBatches || []) as StreamBatchItem[];
  const hasBatches = streamBatches.length > 0;
  const activeView = traceNodeViews[idx] || (hasBatches ? "batches" : "output");
  const activeFormat = batchFormatViews[idx] || "event";

  const nodeLogs: SimulationStepLogEntry[] =
    t.logs && t.logs.length > 0
      ? t.logs
      : [
          {
            timestamp: Date.now(),
            level: (t.status === "failed" ? "error" : "step") as SimulationStepLogLevel,
            message: `Step "${t.label}" (${t.nodeId}) executed with status: ${t.status}`,
            nodeId: t.nodeId,
            nodeLabel: t.label,
            details: t.output,
          },
        ];

  // Generic canvas node inspection
  const canvasNode = nodes.find((n) => n.id === t.nodeId);
  const nodeData = (canvasNode?.data || {}) as Record<string, unknown>;
  const routerConfig = nodeData.routerConfig as { branches?: Array<any> } | undefined;

  // Generic tools extraction for any node
  const nodeToolsMap = new Map<string, { id: string; name: string; source?: string }>();
  if (Array.isArray(outputObj?.tools)) {
    for (const tool of outputObj.tools as Array<{ id?: string; name?: string; source?: string }>) {
      if (tool && (tool.name || tool.id)) {
        nodeToolsMap.set(tool.id || tool.name!, {
          id: tool.id || tool.name!,
          name: tool.name || tool.id || "Tool",
          source: tool.source,
        });
      }
    }
  }
  const connectedToolEdges = edges.filter(
    (e) => e.target === t.nodeId && (e.targetHandle === "tools_in" || e.targetHandle?.includes("tool"))
  );
  for (const edge of connectedToolEdges) {
    const tn = nodes.find((n) => n.id === edge.source);
    const toolData = tn?.data as Record<string, unknown> | undefined;
    const name = (toolData?.name as string) || (toolData?.label as string) || tn?.id || "Tool";
    const id = tn?.id || edge.source;
    nodeToolsMap.set(id, { id, name });
  }
  if (Array.isArray(nodeData.tools)) {
    for (const tItem of nodeData.tools as Array<unknown>) {
      const tName = typeof tItem === "string" ? tItem : (tItem as any)?.name || (tItem as any)?.label || (tItem as any)?.id;
      if (tName) nodeToolsMap.set(tName, { id: tName, name: tName });
    }
  }
  const nodeTools = Array.from(nodeToolsMap.values());

  // Generic middleware extraction for any node
  const nodeMwMap = new Map<string, { id: string; name: string; type?: string }>();
  if (Array.isArray(outputObj?.middleware)) {
    for (const mw of outputObj.middleware as Array<{ id?: string; name?: string; type?: string }>) {
      if (mw && (mw.name || mw.id)) {
        nodeMwMap.set(mw.id || mw.name!, {
          id: mw.id || mw.name!,
          name: mw.name || mw.id || "Middleware",
          type: mw.type,
        });
      }
    }
  }
  const connectedMwEdges = edges.filter(
    (e) => e.target === t.nodeId && (e.targetHandle === "middleware_in" || e.targetHandle?.includes("middleware"))
  );
  for (const edge of connectedMwEdges) {
    const mn = nodes.find((n) => n.id === edge.source);
    const mwData = mn?.data as Record<string, unknown> | undefined;
    const name = (mwData?.name as string) || (mwData?.label as string) || mn?.id || "Middleware";
    const id = mn?.id || edge.source;
    nodeMwMap.set(id, {
      id,
      name,
      type: mwData?.middlewareType as string | undefined,
    });
  }
  if (Array.isArray(nodeData.middleware)) {
    for (const mItem of nodeData.middleware as Array<unknown>) {
      const mName = typeof mItem === "string" ? mItem : (mItem as any)?.name || (mItem as any)?.label || (mItem as any)?.id;
      if (mName) nodeMwMap.set(mName, { id: mName, name: mName });
    }
  }
  const nodeMiddleware = Array.from(nodeMwMap.values());

  // Generic router detection and evaluation
  const isRouter =
    Boolean(outputObj?.router) ||
    nodeData.stepType === "router" ||
    Boolean(routerConfig?.branches && routerConfig.branches.length > 0) ||
    Boolean(t.label?.toLowerCase().includes("router"));

  let routerDecision = outputObj?.router as RouterDecisionState | undefined;

  if (!routerDecision && isRouter && routerConfig?.branches && routerConfig.branches.length > 0) {
    const branches = routerConfig.branches;
    const inputState = (t.input && typeof t.input === "object" ? t.input : finalState || {}) as Record<string, unknown>;
    const outgoing = edges.filter((e) => e.source === t.nodeId);
    const evaluatedBranches: RouterBranchEval[] = branches.map((b: any, bIdx: number) => {
      const actualVal = resolveRouterFieldValue(b.field, inputState);
      const isMatch = !b.isDefault && evaluateRouterBranch(b, inputState);
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

    let matchedBranch = branches.find((b: any) => !b.isDefault && evaluateRouterBranch(b, inputState));
    if (!matchedBranch) {
      matchedBranch = branches.find((b: any) => b.isDefault);
    }
    const targetEdge = matchedBranch
      ? outgoing.find((e) => e.sourceHandle === matchedBranch?.id) || outgoing[0]
      : outgoing[0];
    const targetNode = nodes.find((n) => n.id === targetEdge?.target);
    const targetNodeLabel =
      targetEdge?.target === "END" || targetEdge?.target?.startsWith("end_")
        ? "END"
        : targetNode?.data?.label || targetEdge?.target || "END";

    routerDecision = {
      selectedRoute: matchedBranch?.label || (matchedBranch?.id ? `Route (${matchedBranch.id})` : "Default Route"),
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

  // Helper to extract clean output text / object
  let cleanOutput: unknown = outputObj
    ? outputObj.response || outputObj.structuredResponse || outputObj.messages || outputObj
    : t.output;

  if (outputObj && typeof cleanOutput === "object" && cleanOutput !== null) {
    const filteredEntries = Object.entries(cleanOutput as Record<string, unknown>).filter(
      ([k]) => !["router", "tools", "middleware", "streamBatches", "streamBatchCount", "streamConfig", "llmRequest", "stateUpdates"].includes(k)
    );
    cleanOutput = filteredEntries.length > 0 ? Object.fromEntries(filteredEntries) : null;
  }

  // Extract Applied State Updates
  let appliedStateUpdates = (outputObj?.stateUpdates || []) as AppliedStateUpdate[];
  if (
    appliedStateUpdates.length === 0 &&
    Array.isArray(nodeData.stateUpdates) &&
    nodeData.stateUpdates.length > 0
  ) {
    for (const su of nodeData.stateUpdates as Array<{
      channelKey: string;
      mode?: string;
      schemaField?: string;
      value?: string;
      source?: string;
    }>) {
      if (su.channelKey && outputObj && su.channelKey in outputObj) {
        appliedStateUpdates.push({
          channelKey: su.channelKey,
          previousValue: (t.input as any)?.[su.channelKey] ?? "",
          newValue: outputObj[su.channelKey],
          reducer: su.mode || "replace",
          source: su.source || "structured_field",
          sourceField: su.schemaField || su.value || su.channelKey,
        });
      }
    }
  }

  // START node check
  const isStartNode =
    t.nodeId === "START" ||
    t.label === "START" ||
    canvasNode?.type === "start";

  // Check connected LLM handles via edges
  const connectedLlmEdge = edges.find(
    (e) =>
      e.target === t.nodeId &&
      (e.targetHandle === "llm_in" || e.targetHandle === "llm")
  );
  const connectedLlmNode = connectedLlmEdge
    ? nodes.find((n) => n.id === connectedLlmEdge.source)
    : undefined;

  let connectedModel = "";
  let connectedProvider = "";
  let hasConnectedLlm = false;

  if (connectedLlmNode?.type === "langgraph_llm") {
    hasConnectedLlm = connectedLlmNode.data.enabled !== false;
    connectedModel = connectedLlmNode.data.model ?? "";
    connectedProvider = connectedLlmNode.data.provider ?? "";
  } else if (connectedLlmNode?.type === "langgraph_llm_ref") {
    hasConnectedLlm = true;
    const masterId = connectedLlmNode.data.llmRef || connectedLlmNode.data.refId;
    const masterNode = nodes.find((n) => n.id === masterId);
    if (masterNode?.type === "langgraph_llm") {
      connectedModel = masterNode.data.model ?? "";
      connectedProvider = masterNode.data.provider ?? "";
    }
  }

  let nodeLlmEnabled = false;
  let nodeModel = "";
  let nodeProvider = "";
  let isLlmStepType = false;

  if (canvasNode?.type === "langgraph_node" || canvasNode?.type === "langgraph_agent") {
    nodeLlmEnabled = canvasNode.data.llmConfig?.enabled === true || Boolean(canvasNode.data.modelConfig?.model);
    nodeModel = canvasNode.data.llmConfig?.model ?? canvasNode.data.modelConfig?.model ?? "";
    nodeProvider = canvasNode.data.llmConfig?.provider ?? canvasNode.data.modelConfig?.provider ?? "";
  } else if (canvasNode?.type === "step") {
    nodeLlmEnabled = canvasNode.data.llmConfig?.enabled === true || Boolean(canvasNode.data.modelConfig?.model);
    nodeModel = canvasNode.data.llmConfig?.model ?? canvasNode.data.modelConfig?.model ?? "";
    nodeProvider = canvasNode.data.llmConfig?.provider ?? canvasNode.data.modelConfig?.provider ?? "";
    isLlmStepType = canvasNode.data.stepType === "llm_call";
  }

  let hasInvokedLlm = false;
  let invokedModel = "";
  let invokedProvider = "";
  let invokedSystemPrompt = "";

  if (
    outputObj &&
    "llmRequest" in outputObj &&
    outputObj.llmRequest &&
    typeof outputObj.llmRequest === "object"
  ) {
    hasInvokedLlm = true;
    if ("model" in outputObj.llmRequest && typeof outputObj.llmRequest.model === "string") {
      invokedModel = outputObj.llmRequest.model;
    }
    if ("provider" in outputObj.llmRequest && typeof outputObj.llmRequest.provider === "string") {
      invokedProvider = outputObj.llmRequest.provider;
    }
    if ("systemPrompt" in outputObj.llmRequest && typeof outputObj.llmRequest.systemPrompt === "string") {
      invokedSystemPrompt = outputObj.llmRequest.systemPrompt;
    }
  }

  const isLlmActive =
    !isStartNode &&
    (hasInvokedLlm || hasConnectedLlm || nodeLlmEnabled || isLlmStepType);

  // 5 Node configuration steps
  const agentName =
    (canvasNode && "name" in canvasNode.data && typeof canvasNode.data.name === "string" && canvasNode.data.name) ||
    (canvasNode && "label" in canvasNode.data && typeof canvasNode.data.label === "string" && canvasNode.data.label) ||
    t.label;
  const systemPrompt =
    (canvasNode && "systemPrompt" in canvasNode.data && typeof canvasNode.data.systemPrompt === "string"
      ? canvasNode.data.systemPrompt
      : invokedSystemPrompt);
  const effectiveModel =
    invokedModel ||
    connectedModel ||
    nodeModel ||
    modelName;
  const effectiveProvider =
    invokedProvider ||
    connectedProvider ||
    nodeProvider ||
    provider;
  const responseFormat = (nodeData.responseFormat as any) || {};
  const isStructured = Boolean(responseFormat?.enabled);
  let schemaFieldsList: Array<{ name: string; type?: string; required?: boolean }> = [];
  if (isStructured && responseFormat.schemaJson) {
    try {
      const parsedJson = JSON.parse(responseFormat.schemaJson);
      if (parsedJson?.properties) {
        const reqs = Array.isArray(parsedJson.required) ? parsedJson.required : [];
        schemaFieldsList = Object.entries(parsedJson.properties).map(
          ([k, def]: [string, any]) => ({
            name: k,
            type: def?.type || "string",
            required: reqs.includes(k),
          }),
        );
      }
    } catch {}
  }
  const configuredUpdates = (nodeData.stateUpdates as any[]) || [];
  const streamConfig = (nodeData.streamConfig as any) || (outputObj?.streamConfig as any);
  const isStreamActive = streamConfig?.enabled !== false;
  const hasNodeConfig = Boolean(
    !isStartNode &&
      (isLlmActive ||
        systemPrompt ||
        isStructured ||
        configuredUpdates.length > 0 ||
        nodeTools.length > 0 ||
        nodeMiddleware.length > 0)
  );

  return (
    <div
      className={`p-2.5 rounded-lg border flex flex-col gap-2 text-[11px] ${
        isFailed
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : "bg-background/80 border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isFailed ? "bg-destructive" : "bg-emerald-400"
              }`}
            />
            {t.label}
          </span>
          {hasBatches && (
            <Badge
              variant="outline"
              className="text-[8.5px] px-1.5 py-0 h-4 font-mono bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 flex items-center gap-1"
            >
              <Radio className="w-2.5 h-2.5 animate-pulse text-cyan-500" />
              <span>{streamBatches.length} Stream Batches</span>
            </Badge>
          )}
          {appliedStateUpdates.length > 0 && (
            <Badge
              variant="outline"
              className="text-[8.5px] px-1.5 py-0 h-4 font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1"
            >
              <Zap className="w-2.5 h-2.5 text-emerald-500" />
              <span>{appliedStateUpdates.length} {appliedStateUpdates.length === 1 ? "State Update" : "State Updates"}</span>
            </Badge>
          )}
          {isRouter && (
            <Badge
              variant="outline"
              className="text-[8.5px] px-1.5 py-0 h-4 font-mono bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30 flex items-center gap-1"
            >
              <GitBranch className="w-2.5 h-2.5 text-sky-400" />
              <span>{routerDecision?.selectedRoute || "Conditional Router"}</span>
            </Badge>
          )}
          {nodeTools.length > 0 && (
            <Badge
              variant="outline"
              className="text-[8.5px] px-1.5 py-0 h-4 font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1"
            >
              <Wrench className="w-2.5 h-2.5 text-amber-500" />
              <span>{nodeTools.length} {nodeTools.length === 1 ? "Tool" : "Tools"}</span>
            </Badge>
          )}
          {nodeMiddleware.length > 0 && (
            <Badge
              variant="outline"
              className="text-[8.5px] px-1.5 py-0 h-4 font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30 flex items-center gap-1"
            >
              <Shield className="w-2.5 h-2.5 text-purple-500" />
              <span>{nodeMiddleware.length} Middleware</span>
            </Badge>
          )}
          {nodeUsage && (nodeUsage.total_tokens || nodeUsage.prompt_tokens || nodeUsage.completion_tokens) ? (
            <Badge
              variant="outline"
              className="text-[8.5px] px-1.5 py-0 h-4 font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1"
              title={`Token Usage: ${nodeUsage.prompt_tokens ?? 0} prompt tokens in, ${nodeUsage.completion_tokens ?? 0} completion tokens out`}
            >
              <Coins className="w-2.5 h-2.5 text-amber-500" />
              <span>{nodeUsage.total_tokens ?? ((nodeUsage.prompt_tokens ?? 0) + (nodeUsage.completion_tokens ?? 0))} Tokens</span>
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-muted-foreground/70">
            {t.nodeId}
          </span>
          {Boolean(t.output) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(JSON.stringify(t.output, null, 2));
                toast.success(`Copied output for ${t.label}`);
              }}
              title="Copy node output"
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            >
              <Copy className="w-2.5 h-2.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setExpandedTraceNodes((prev) => ({
                ...prev,
                [idx]: !isNodeExpanded,
              }))
            }
            title={isNodeExpanded ? "Collapse step" : "Expand step"}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
          >
            {isNodeExpanded ? (
              <ChevronUp className="w-2.5 h-2.5" />
            ) : (
              <ChevronDown className="w-2.5 h-2.5" />
            )}
          </button>
        </div>
      </div>

      {/* Quick Result Strip — always visible, shows only what actually ran */}
      {(() => {
        const toolLogEntries = nodeLogs.filter((l) => l.level === "tool");
        // Connected tools from runtime output (simulation attaches these even without real invocations)
        const runtimeTools = (Array.isArray(outputObj?.tools)
          ? (outputObj!.tools as Array<{ id?: string; name?: string }>)
          : []
        ).filter((t) => t.name || t.id);

        const hasResults =
          appliedStateUpdates.length > 0 ||
          toolLogEntries.length > 0 ||
          runtimeTools.length > 0;

        if (!hasResults) return null;

        return (
          <div className="flex flex-wrap gap-1 text-[9px] font-mono">
            {/* State updates: channelKey = newValue, hover shows previous */}
            {appliedStateUpdates.map((su, i) => (
              <span
                key={`su_${i}`}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
                title={`${su.channelKey}: ${JSON.stringify(su.previousValue)} → ${JSON.stringify(su.newValue)}\nSource: ${su.source || ""}${su.sourceField ? ` (${su.sourceField})` : ""}`}
              >
                <Zap className="w-2.5 h-2.5 shrink-0" />
                <span className="font-semibold">{su.channelKey}</span>
                <span className="text-emerald-500/60">=</span>
                <span className="max-w-[140px] truncate text-emerald-300">
                  {typeof su.newValue === "object"
                    ? JSON.stringify(su.newValue)
                    : String(su.newValue ?? "")}
                </span>
              </span>
            ))}

            {/* Tool call logs (when tool invocations are tracked) */}
            {toolLogEntries.map((l, i) => {
              const msgParts = l.message.split("→");
              const toolLabel = msgParts[0]?.replace(/^Tool[:\s]*/i, "").trim() || l.message;
              const toolResult = msgParts[1]?.trim() || (l.details ? JSON.stringify(l.details).slice(0, 80) : "");
              return (
                <span
                  key={`tl_${i}`}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400"
                  title={l.message + (l.details ? `\n\nOutput: ${JSON.stringify(l.details, null, 2)}` : "")}
                >
                  <Wrench className="w-2.5 h-2.5 shrink-0" />
                  <span className="font-semibold">{toolLabel}</span>
                  {toolResult && (
                    <>
                      <span className="text-amber-500/50">→</span>
                      <span className="max-w-[120px] truncate text-amber-300">{toolResult}</span>
                    </>
                  )}
                </span>
              );
            })}

            {/* Connected tools (from config — shown when no explicit tool-call logs) */}
            {toolLogEntries.length === 0 && runtimeTools.map((t, i) => (
              <span
                key={`rt_${i}`}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/8 border border-amber-500/20 text-amber-500/80"
                title={`Tool attached: ${t.name || t.id}`}
              >
                <Wrench className="w-2.5 h-2.5 shrink-0" />
                <span>{t.name || t.id}</span>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Node Configuration Overview - only shows invoked/active sections */}
      {hasNodeConfig && (() => {
        // Build only the config cells that are actually active/invoked
        const configCells: React.ReactNode[] = [];

        // Identity & Prompt — show if we have a name or system prompt
        if (!isStartNode && (agentName || systemPrompt)) {
          configCells.push(
            <div key="identity" className="flex flex-col gap-0.5 p-1.5 rounded bg-background/60 border border-border/40 min-w-0">
              <span className="text-[8px] font-semibold text-muted-foreground uppercase flex items-center gap-1">Identity & Prompt</span>
              <span className="font-bold text-foreground font-mono truncate text-[9px]">{agentName}</span>
              {systemPrompt ? (
                <span className="text-[8.5px] text-muted-foreground italic truncate" title={systemPrompt}>
                  &ldquo;{systemPrompt}&rdquo;
                </span>
              ) : null}
            </div>
          );
        }

        // Model — only show if LLM is actually active/configured or was invoked
        if (isLlmActive && (effectiveModel || effectiveProvider)) {
          configCells.push(
            <div key="model" className="flex flex-col gap-0.5 p-1.5 rounded bg-background/60 border border-border/40 min-w-0">
              <span className="text-[8px] font-semibold text-muted-foreground uppercase flex items-center gap-1">Model</span>
              <span className="font-mono text-purple-300 font-medium truncate text-[9px]">
                {effectiveProvider.toUpperCase()} / {effectiveModel}
              </span>
            </div>
          );
        }

        // Token Usage — show if usage metadata is available
        if (nodeUsage && (nodeUsage.total_tokens || nodeUsage.prompt_tokens || nodeUsage.completion_tokens)) {
          configCells.push(
            <div key="tokens" className="flex flex-col gap-0.5 p-1.5 rounded bg-amber-500/5 border border-amber-500/20 min-w-0">
              <span className="text-[8px] font-semibold text-amber-400 uppercase flex items-center gap-1">
                <Coins className="w-2.5 h-2.5" /> Tokens
              </span>
              <span className="text-[8.5px] font-mono text-muted-foreground truncate" title={`Prompt: ${nodeUsage.prompt_tokens ?? 0} | Completion: ${nodeUsage.completion_tokens ?? 0}`}>
                {nodeUsage.total_tokens ?? ((nodeUsage.prompt_tokens ?? 0) + (nodeUsage.completion_tokens ?? 0))} total ({nodeUsage.prompt_tokens ?? 0} in / {nodeUsage.completion_tokens ?? 0} out)
              </span>
            </div>
          );
        }

        // Tools — only if tools are connected
        if (nodeTools.length > 0) {
          configCells.push(
            <div key="tools" className="flex flex-col gap-0.5 p-1.5 rounded bg-amber-500/5 border border-amber-500/20 min-w-0">
              <span className="text-[8px] font-semibold text-amber-400 uppercase flex items-center gap-1">
                <Wrench className="w-2.5 h-2.5" /> Tools ({nodeTools.length})
              </span>
              <span className="text-[8.5px] font-mono text-muted-foreground truncate" title={nodeTools.map(t => t.name).join(", ")}>
                {nodeTools.map((t) => t.name).join(", ")}
              </span>
            </div>
          );
        }

        // Middleware — only if middleware is connected
        if (nodeMiddleware.length > 0) {
          configCells.push(
            <div key="mw" className="flex flex-col gap-0.5 p-1.5 rounded bg-fuchsia-500/5 border border-fuchsia-500/20 min-w-0">
              <span className="text-[8px] font-semibold text-fuchsia-400 uppercase flex items-center gap-1">
                <Shield className="w-2.5 h-2.5" /> Middleware ({nodeMiddleware.length})
              </span>
              <span className="text-[8.5px] font-mono text-muted-foreground truncate" title={nodeMiddleware.map(m => m.name).join(", ")}>
                {nodeMiddleware.map((m) => m.name).join(", ")}
              </span>
            </div>
          );
        }

        // Schema — only if structured output is enabled
        if (isStructured) {
          configCells.push(
            <div key="schema" className="flex flex-col gap-0.5 p-1.5 rounded bg-emerald-500/5 border border-emerald-500/20 min-w-0">
              <span className="text-[8px] font-semibold text-emerald-400 uppercase flex items-center gap-1">
                Schema ({responseFormat.strategy || "auto"})
              </span>
              <span className="text-[8.5px] font-mono text-muted-foreground truncate" title={schemaFieldsList.map(f => `${f.name}:${f.type}`).join(", ")}>
                {schemaFieldsList.map((f) => `${f.name}:${f.type || "string"}`).join(", ") || "custom schema"}
              </span>
            </div>
          );
        }

        // State Updates — only if channels are mapped
        if (configuredUpdates.length > 0) {
          configCells.push(
            <div key="state" className="flex flex-col gap-0.5 p-1.5 rounded bg-sky-500/5 border border-sky-500/20 min-w-0">
              <span className="text-[8px] font-semibold text-sky-400 uppercase flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" /> State Updates ({configuredUpdates.length})
              </span>
              <span className="text-[8.5px] font-mono text-muted-foreground truncate" title={configuredUpdates.map((u: any) => `${u.channelKey} [${u.mode || "replace"}]`).join(", ")}>
                {configuredUpdates.map((u: any) => `${u.channelKey} [${u.mode || "replace"}]`).join(", ")}
              </span>
            </div>
          );
        }

        // Streaming — only if batches were actually streamed
        if (hasBatches) {
          configCells.push(
            <div key="stream" className="flex flex-col gap-0.5 p-1.5 rounded bg-cyan-500/5 border border-cyan-500/20 min-w-0">
              <span className="text-[8px] font-semibold text-cyan-400 uppercase flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 animate-pulse" /> Streaming
              </span>
              <span className="text-[8.5px] font-mono text-muted-foreground truncate">
                {streamBatches.length} batches · {streamConfig?.version || "v3"}
              </span>
            </div>
          );
        }

        if (configCells.length === 0) return null;

        return (
          <div className="flex flex-col gap-1.5 p-2 rounded-md bg-muted/20 border border-border/50 text-[9.5px]">
            <div className="flex items-center justify-between text-muted-foreground font-semibold uppercase tracking-wider text-[8.5px]">
              <span className="flex items-center gap-1.5 text-foreground/80">
                <Settings className="w-3 h-3 text-indigo-400" />
                Node Configuration
              </span>
              <span className="font-mono text-[8px] text-muted-foreground/60">
                {configCells.length} active
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {configCells}
            </div>
          </div>
        );
      })()}

      {/* Sub-view switcher tabs for step */}
      <div className="flex items-center justify-between bg-muted/40 p-1 rounded-md border border-border/40 text-[9.5px] font-mono gap-1.5 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {hasBatches && (
            <button
              type="button"
              onClick={() =>
                setTraceNodeViews((prev) => ({
                  ...prev,
                  [idx]: "batches",
                }))
              }
              className={`px-2 py-0.5 rounded transition-all font-medium ${
                activeView === "batches"
                  ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ⚡ Stream Batches ({streamBatches.length})
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setTraceNodeViews((prev) => ({
                ...prev,
                [idx]: "output",
              }))
            }
            className={`px-2 py-0.5 rounded transition-all font-medium ${
              activeView === "output"
                ? "bg-background text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isRouter ? "Route & Output" : "Final Output"}
          </button>
          {appliedStateUpdates.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setTraceNodeViews((prev) => ({
                  ...prev,
                  [idx]: "state",
                }))
              }
              className={`px-2 py-0.5 rounded transition-all font-medium flex items-center gap-1 ${
                activeView === "state"
                  ? "bg-emerald-500/20 text-emerald-400 font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="w-2.5 h-2.5 text-emerald-400" />
              State Updates ({appliedStateUpdates.length})
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setTraceNodeViews((prev) => ({
                ...prev,
                [idx]: "logs",
              }))
            }
            className={`px-2 py-0.5 rounded transition-all font-medium flex items-center gap-1 ${
              activeView === "logs"
                ? "bg-blue-500/20 text-blue-400 font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Terminal className="w-2.5 h-2.5" />
            Logs ({nodeLogs.length})
          </button>
          {(hasInvokedLlm || isLlmActive) && (
            <button
              type="button"
              onClick={() =>
                setTraceNodeViews((prev) => ({
                  ...prev,
                  [idx]: "req",
                }))
              }
              className={`px-2 py-0.5 rounded transition-all font-medium ${
                activeView === "req"
                  ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              AI Request
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setTraceNodeViews((prev) => ({
                ...prev,
                [idx]: "raw",
              }))
            }
            className={`px-2 py-0.5 rounded transition-all font-medium ${
              activeView === "raw"
                ? "bg-background text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Raw JSON
          </button>
        </div>

        {hasBatches && (
          <div className="flex items-center gap-1.5">
            {activeView === "batches" && (
              <div className="flex items-center gap-0.5 bg-background p-0.5 rounded border border-border/50 text-[8.5px]">
                <button
                  type="button"
                  onClick={() => setBatchFormatViews((prev) => ({ ...prev, [idx]: "event" }))}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    activeFormat === "event"
                      ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Configured Event
                </button>
                <button
                  type="button"
                  onClick={() => setBatchFormatViews((prev) => ({ ...prev, [idx]: "delta" }))}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    activeFormat === "delta"
                      ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Delta
                </button>
                <button
                  type="button"
                  onClick={() => setBatchFormatViews((prev) => ({ ...prev, [idx]: "raw" }))}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    activeFormat === "raw"
                      ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Raw Chunk
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const exportBatches = streamBatches.map((b) =>
                  activeFormat === "delta"
                    ? b.delta
                    : activeFormat === "raw"
                      ? b.raw
                      : (b.formatted ?? b)
                );
                navigator.clipboard.writeText(
                  JSON.stringify(exportBatches, null, 2)
                );
                toast.success(`Copied all ${streamBatches.length} streaming event batches`);
              }}
              className="text-[8.5px] text-muted-foreground hover:text-cyan-500 px-1 py-0.5 underline flex items-center gap-1"
            >
              <Copy className="w-2.5 h-2.5" /> Copy Batches
            </button>
          </div>
        )}
      </div>

      {/* View 1: Stream Batches Timeline */}
      {hasBatches && activeView === "batches" && (
        <StreamBatchesView
          streamBatches={streamBatches}
          cleanOutput={cleanOutput}
          activeFormat={activeFormat}
          expandedBatchRaw={expandedBatchRaw}
          stepIdx={idx}
          stepLabel={t.label}
        />
      )}

      {/* View 2: Clean Final Output or Conditional Router Card */}
      {activeView === "output" && (
        <div className="flex flex-col gap-2">
          {/* Dedicated Conditional Router Branch Card */}
          {isRouter && routerDecision && (
            <RouterDecisionCard routerDecision={routerDecision} />
          )}

          {/* Graph State Updates Applied Card */}
          {appliedStateUpdates.length > 0 && (
            <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono">
              <div className="flex items-center justify-between text-emerald-400 font-semibold text-[10px]">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  Graph State Channel Updates ({appliedStateUpdates.length})
                </span>
                <Badge
                  variant="outline"
                  className="text-[8px] px-1.5 py-0 h-3.5 border-emerald-500/40 text-emerald-300 font-mono"
                >
                  Mutated
                </Badge>
              </div>

              <div className="flex flex-col gap-1 pt-0.5">
                {appliedStateUpdates.map((su, suIdx) => (
                  <div
                    key={suIdx}
                    className="p-1.5 rounded bg-background/80 border border-emerald-500/20 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/50 text-[9.5px]">
                          {su.channelKey}
                        </span>
                        <span className="text-muted-foreground text-[9px]">←</span>
                        <span className="text-emerald-400 font-semibold text-[10px]">
                          {typeof su.newValue === "object"
                            ? JSON.stringify(su.newValue)
                            : String(su.newValue)}
                        </span>
                      </div>
                      <span className="text-[8.5px] px-1.5 py-0 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {su.reducer}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[8px] text-muted-foreground pt-0.5 border-t border-border/20">
                      <span>
                        Source:{" "}
                        <span className="text-purple-300">
                          {su.sourceField ? `structuredResponse.${su.sourceField}` : su.source}
                        </span>
                      </span>
                      {su.previousValue !== undefined && su.previousValue !== null && (
                        <span>
                          Prior:{" "}
                          <span className="text-muted-foreground/80">
                            {JSON.stringify(su.previousValue)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clean Final Output */}
          {cleanOutput !== null && cleanOutput !== undefined ? (
            <div className="flex flex-col gap-1">
              {isRouter && (
                <span className="text-[9px] font-mono text-muted-foreground">
                  State Changes / Output:
                </span>
              )}
              <pre
                className={`text-[9px] font-mono p-2 rounded overflow-auto hide-scrollbar transition-all ${
                  isNodeExpanded
                    ? "max-h-[380px]"
                    : "max-h-[260px]"
                } ${
                  isFailed
                    ? "bg-destructive/20 text-destructive border border-destructive/30"
                    : "text-muted-foreground bg-muted/30"
                }`}
              >
                {typeof cleanOutput === "string"
                  ? cleanOutput
                  : JSON.stringify(cleanOutput, null, 2)}
              </pre>
            </div>
          ) : !isRouter && Boolean(t.output) ? (
            <div className="text-[9.5px] text-muted-foreground/70 italic p-2 rounded bg-muted/20 border border-border/30">
              Step completed successfully (no state delta produced).
            </div>
          ) : null}
        </div>
      )}

      {/* View 2c: Dedicated State Updates View */}
      {activeView === "state" && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/30">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Graph State Updates Applied ({appliedStateUpdates.length})
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">
              Mutated by step &ldquo;{t.label}&rdquo;
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {appliedStateUpdates.map((su, suIdx) => (
              <div
                key={suIdx}
                className="p-2 rounded bg-background border border-emerald-500/30 flex flex-col gap-1 text-[10px] font-mono shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground bg-muted/60 px-2 py-0.5 rounded border border-border/50 text-[10.5px]">
                      {su.channelKey}
                    </span>
                    <span className="text-muted-foreground">←</span>
                    <span className="text-emerald-400 font-bold text-[11px]">
                      {typeof su.newValue === "object"
                        ? JSON.stringify(su.newValue, null, 2)
                        : String(su.newValue)}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[8.5px] px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-300 font-mono"
                  >
                    reducer: {su.reducer}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-[8.5px] text-muted-foreground pt-1 border-t border-border/30">
                  <span>
                    Source mapping:{" "}
                    <span className="text-purple-300 font-semibold">
                      {su.sourceField ? `structuredResponse.${su.sourceField}` : su.source}
                    </span>
                  </span>
                  <span>
                    Prior value:{" "}
                    <span className="text-muted-foreground font-mono">
                      {su.previousValue !== undefined && su.previousValue !== null && su.previousValue !== ""
                        ? JSON.stringify(su.previousValue)
                        : '"" (initial)'}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View 2b: Step Execution Logs */}
      {activeView === "logs" && (
        <StepLogsView
          nodeLogs={nodeLogs}
          stepLabel={t.label}
          stepIdx={idx}
          expandedLogDetails={expandedLogDetails}
          setExpandedLogDetails={setExpandedLogDetails}
        />
      )}

      {/* View 3: AI Request Inspection */}
      {activeView === "req" && (
        <pre
          className={`text-[9px] font-mono p-2.5 rounded overflow-auto hide-scrollbar transition-all ${
            isNodeExpanded ? "max-h-[380px]" : "max-h-[260px]"
          } text-cyan-300 bg-black/60 border border-cyan-500/20`}
        >
          {JSON.stringify(
            outputObj?.llmRequest || {
              provider,
              model: modelName,
              stream: true,
              status: "Streaming enabled via agent streamConfig",
            },
            null,
            2
          )}
        </pre>
      )}

      {/* View 4: Complete Raw JSON */}
      {activeView === "raw" && (
        <pre
          className={`text-[9px] font-mono p-2 rounded overflow-auto hide-scrollbar transition-all ${
            isNodeExpanded
              ? "max-h-[380px]"
              : "max-h-[260px]"
          } text-muted-foreground bg-muted/30`}
        >
          {JSON.stringify(t.output, null, 2)}
        </pre>
      )}
    </div>
  );
}
