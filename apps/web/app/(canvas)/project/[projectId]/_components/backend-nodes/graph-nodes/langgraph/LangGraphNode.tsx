import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { NodeProps, Handle, Position } from "@xyflow/react";
import {
  Network,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Trash,
  Pencil,
  Radio,
  Plug,
  Zap,
  Globe,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Layers,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type {
  BackendNode,
  LangGraphStepConfig,
  LangGraphStateChannel,
  OutputChannelConfig,
} from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, useServiceStepHandLayout } from "../common";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";
import { NodeEnvVarsSection } from "../nodes/ai-security/ExternalEnvVarsDrawer";
import { checkCheckpointerTablesStatus } from "./langgraph-canvas/utils/checkpointerTables";

export interface ConnectedRouteInfo {
  edgeId: string;
  kind: "endpoint" | "event" | "task";
  label: string;
  method: string;
  sourceNodeLabel: string;
  payloadMapping?: Record<string, string>;
}

interface ChannelBadgeInfo {
  label: string;
  badgeColor: string;
  iconColor: string;
  icon: typeof Radio;
}

const DEFAULT_CHANNEL_TYPE_BADGE: ChannelBadgeInfo = {
  label: "SSE",
  badgeColor: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  iconColor: "text-purple-400",
  icon: Radio,
};

const CHANNEL_TYPE_BADGES: Record<string, ChannelBadgeInfo> = {
  sse: DEFAULT_CHANNEL_TYPE_BADGE,
  websocket: {
    label: "WS",
    badgeColor: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    iconColor: "text-blue-400",
    icon: Plug,
  },
  event: {
    label: "EVENT",
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    iconColor: "text-amber-400",
    icon: Zap,
  },
  webhook: {
    label: "HOOK",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    iconColor: "text-emerald-400",
    icon: Globe,
  },
  rest: {
    label: "REST",
    badgeColor: "bg-secondary text-foreground border-border/50",
    iconColor: "text-muted-foreground",
    icon: Radio,
  },
};

function getChannelTypeBadge(type: string): ChannelBadgeInfo {
  return CHANNEL_TYPE_BADGES[type] ?? DEFAULT_CHANNEL_TYPE_BADGE;
}

/** Resolves a readable label for each edge invoking this LangGraph node. */
export function useConnectedRoutes(nodeId: string): ConnectedRouteInfo[] {
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const events = useBackendCanvasStore((s) => s.events);

  // All edges connected to this LangGraph node (either as source feeding into service, or as target)
  const connectedEdges = edges.filter(
    (e) => e.source === nodeId || e.target === nodeId,
  );

  return connectedEdges.map((edge): ConnectedRouteInfo => {
    const isOutbound = edge.source === nodeId;
    const otherNodeId = isOutbound ? edge.target : edge.source;
    const otherNode = nodes.find((n) => n.id === otherNodeId);
    const otherNodeLabel = otherNode?.data?.label || otherNodeId;

    // Check targetHandle (when edge is LangGraph -> Service) or sourceHandle (when Service -> LangGraph)
    const handleToCheck = isOutbound ? edge.targetHandle : edge.sourceHandle;

    // Resolve specific endpoint
    if (
      handleToCheck?.startsWith("endpoint-in-") ||
      handleToCheck?.startsWith("endpoint-out-")
    ) {
      const endpointId = handleToCheck.replace(/^endpoint-(in|out)-/, "");
      const ep = endpoints.find((e) => e.id === endpointId);
      if (ep) {
        const item: ConnectedRouteInfo = {
          edgeId: edge.id,
          kind: "endpoint",
          label: ep.name || ep.id,
          method: ep.type || "GET",
          sourceNodeLabel: otherNodeLabel,
          payloadMapping: edge.data?.payloadMapping,
        };
        return item;
      }
    }

    // Resolve consumed event
    if (
      handleToCheck?.startsWith("consumedEvents-in-") ||
      handleToCheck?.startsWith("consumedEvents-out-")
    ) {
      const eventId = handleToCheck.replace(/^consumedEvents-(in|out)-/, "");
      const ev = events.find((e) => e.id === eventId);
      if (ev) {
        const item: ConnectedRouteInfo = {
          edgeId: edge.id,
          kind: "event",
          label: ev.name || eventId,
          method: "EVENT",
          sourceNodeLabel: otherNodeLabel,
          payloadMapping: edge.data?.payloadMapping,
        };
        return item;
      }
    }

    // Fallback — task or general connection
    const fallbackItem: ConnectedRouteInfo = {
      edgeId: edge.id,
      kind: "task",
      label: otherNodeLabel,
      method: "INVOKE",
      sourceNodeLabel: otherNodeLabel,
      payloadMapping: edge.data?.payloadMapping,
    };
    return fallbackItem;
  });
}


export const LangGraphNode = React.memo(({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const hasPipelineError = useNodePipelineError(id);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const storeProjectId = useBackendCanvasStore((s) => s.projectId);
  const params = useParams();
  const router = useRouter();
  const rawProjectId = params?.projectId;
  const routeProjectId =
    typeof rawProjectId === "string"
      ? rawProjectId
      : Array.isArray(rawProjectId)
        ? rawProjectId[0]
        : undefined;
  const projectId = routeProjectId || storeProjectId;
  const connectedRoutes = useConnectedRoutes(id);
  const connectedRoutesCount = connectedRoutes.length;

  const handleOpenEditor = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (projectId) {
      router.push(`/project/${projectId}/langgraph/${id}`);
    }
  };

  const inputChannels = data.inputChannels || [];
  const stateChannels = data.stateChannels || [];
  const graphSteps = data.graphSteps || [];
  const memoryConfig = data.memoryConfig || {
    checkpointer: "memory",
    threadScope: "session",
    autoSummarize: true,
    maxWindowMessages: 10,
  };

  const allCanvasNodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);

  const {
    cardIndex,
    totalCards,
    hasMultipleCards,
    isStacked,
    toggleStack,
    moveCard,
    bringCardToFront,
  } = useServiceStepHandLayout(id, allCanvasNodes, edges, updateNode);
  const [isHovered, setIsHovered] = useState(false);

  const checkpointerTablesStatus = React.useMemo(() => {
    return checkCheckpointerTablesStatus(
      allCanvasNodes,
      edges,
      memoryConfig.enabled !== false,
      memoryConfig.checkpointer || "memory",
      memoryConfig.checkpointerNodeId,
    );
  }, [allCanvasNodes, edges, memoryConfig]);

  const checkpointerError = React.useMemo(() => {
    if (!memoryConfig || memoryConfig.enabled === false || memoryConfig.checkpointer === "memory") return null;
    const isPg = memoryConfig.checkpointer === "postgres";
    const isRedis = memoryConfig.checkpointer === "redis";
    if (!isPg && !isRedis) return null;

    if (checkpointerTablesStatus.isMissingStorage) {
      return `No ${isPg ? "PostgreSQL database" : "Redis"} in SchemaView`;
    }
    if (!checkpointerTablesStatus.areTablesCreated) {
      return `${checkpointerTablesStatus.missingCount} checkpointer tables missing in SchemaView`;
    }
    return null;
  }, [memoryConfig, checkpointerTablesStatus]);

  return (
    <div
      onClick={(e) => {
        if (isStacked) {
          e.stopPropagation();
          bringCardToFront();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        zIndex: isStacked
          ? selected
            ? 1000
            : 10 + cardIndex
          : selected
            ? 1000
            : undefined,
      }}
      className={cn(
        "rounded-2xl bg-card/95 backdrop-blur-xl border-2 w-[280px] min-w-[280px] max-w-[340px] flex flex-col transition-all duration-300 relative shadow-2xl group",
        isStacked && "shadow-lg backdrop-blur-sm",
        isStacked && (selected || isHovered) && "ring-2 ring-primary/50 shadow-2xl scale-[1.01] border-primary",
        selected
          ? "border-primary ring-4 ring-primary/20 shadow-primary/10"
          : "border-border hover:border-border/80",
        (hasPipelineError || Boolean(checkpointerError)) &&
          "border-destructive/80 ring-4 ring-destructive/20 shadow-destructive/10",
      )}
      onDoubleClick={handleOpenEditor}
    >
      {/* Header */}
      <NodeHeader
        id={id}
        data={data}
        nodeType="langgraph"
        icon={Network}
        title="LangGraph Agent"
        placeholder="Enter agent name..."
        selected={selected}
        badges={
          checkpointerError ? (
            <span
              className="text-[7px] font-medium px-1 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse"
              title={checkpointerError}
            >
              <AlertTriangle size={8} />
              {checkpointerTablesStatus.isMissingStorage
                ? "No DB"
                : `${checkpointerTablesStatus.existingTables.length}/${checkpointerTablesStatus.expectedCount} Tables`}
            </span>
          ) : hasPipelineError ? (
            <span className="text-[7px] font-medium px-1 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse">
              <AlertTriangle size={8} />
              Unmapped
            </span>
          ) : undefined
        }
        rightElement={
          <div className="flex items-center gap-1 shrink-0 nodrag">
            {hasMultipleCards && (
              <div className="flex items-center gap-1 shrink-0 mr-0.5">
                {isStacked ? (
                  <div className="flex items-center rounded text-[8px] font-mono font-bold bg-primary/15 text-primary border border-primary/30 overflow-hidden shrink-0">
                    {cardIndex > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCard("up");
                        }}
                        className="px-1 py-0.5 hover:bg-primary/30 text-primary hover:text-primary/80 transition-colors cursor-pointer"
                        title="Move step up in stack"
                      >
                        <ChevronUp size={9} />
                      </button>
                    )}
                    <span
                      className="px-1.5 py-0.5 flex items-center gap-0.5"
                      title={`Step ${cardIndex + 1} of ${totalCards} (stacked)`}
                    >
                      <Layers size={8} />
                      <span>{cardIndex + 1}/{totalCards}</span>
                    </span>
                    {cardIndex < totalCards - 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCard("down");
                        }}
                        className="px-1 py-0.5 hover:bg-primary/30 text-primary hover:text-primary/80 transition-colors cursor-pointer"
                        title="Move step down in stack"
                      >
                        <ChevronDown size={9} />
                      </button>
                    )}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStack();
                  }}
                  className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                  title={isStacked ? "Fan out steps" : "Stack steps into deck"}
                >
                  {isStacked ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
                </button>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary nodrag"
              onClick={handleOpenEditor}
              title="Open LangGraph Studio"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />

      {checkpointerError && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/15 border-b border-destructive/30 text-[11px] text-destructive leading-tight font-medium">
          <AlertTriangle size={12} className="shrink-0" />
          <span>{checkpointerError}</span>
        </div>
      )}

      {hasPipelineError && !checkpointerError && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20 text-[11px] text-destructive leading-tight">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="font-medium">Missing required input mapping</span>
        </div>
      )}
      <div className="px-3 py-1 bg-muted/20 border-b flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <ShieldCheck className="w-3 h-3 text-primary shrink-0" />
        <span className="truncate">
          {inputChannels.length} inputs · {(graphSteps.length || 0) + ((data.agentDefinitions as unknown[])?.length || 0)} steps ·{" "}
          {stateChannels.length} state fields
          {connectedRoutesCount > 0 && (
            <> · <span className="text-primary font-semibold">{connectedRoutesCount} routes</span></>
          )}
        </span>
      </div>


      {/* Outbound source handle on right feeding into ServiceNode endpoint-in */}
      <Handle
        type="source"
        position={Position.Right}
        id="langgraph-out"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
          "!bg-primary !border-2 !border-background hover:!scale-125 transition-transform",
        )}
        style={{ top: "35px" }}
        title="Drag to server endpoint to invoke this agent"
      />

      {/* Emitted Output Channels Section */}
      {(data.outputChannels || []).length > 0 && (
        <div className="flex flex-col border-t border-border/60">
          <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/20 border-b border-border/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-primary" />
              <span>Emitted Output Channels</span>
            </div>
            <span className="font-mono text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">
              {(data.outputChannels || []).length}
            </span>
          </div>

          <div className="flex flex-col divide-y divide-border/40">
            {(data.outputChannels || []).map((ch, idx: number) => {
              const typeInfo = getChannelTypeBadge(ch.type);
              const IconComponent = typeInfo.icon;
              const chKey = ch.id ? `ch-${ch.id}-${idx}` : `ch-empty-${idx}`;
              return (
                <div
                  key={chKey}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary/40 transition-colors nodrag relative group/channel"
                  title={`Emitted output channel: ${ch.name} (${ch.type})`}
                >
                  <IconComponent
                    className={`w-3 h-3 shrink-0 ${typeInfo.iconColor}`}
                  />
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 font-mono ${typeInfo.badgeColor}`}
                  >
                    {typeInfo.label}
                  </span>
                  <span className="font-medium truncate text-foreground flex-1">
                    {ch.name}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono truncate shrink-0">
                    {ch.topicOrEventName || ch.targetStateChannel || "all"}
                  </span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`channel-out-${ch.id}`}
                    className={cn(
                      CANVAS_HANDLE_CLASS,
                      CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
                      "!bg-primary !border-2 !border-background hover:!scale-125 transition-transform",
                    )}
                    title={`Outgoing channel: ${ch.name}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Summary Preview ────────────────────────────────────────────── */}
      <div className="p-3 flex flex-col gap-2 nodrag">
        {/* State schema preview */}
        <div className="flex flex-col gap-1 bg-[#006ddd]/10 p-2 rounded-xl border border-[#006ddd]/30">
          <div className="flex items-center justify-between text-[10px] font-bold text-[#006ddd]">
            <span>GRAPH STATE SCHEMA</span>
            <span className="font-mono">{stateChannels.length} fields</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {stateChannels.slice(0, 3).map((ch: LangGraphStateChannel, idx: number) => {
              const channelKey = ch.key?.trim() ? `state-${ch.key}-${idx}` : `state-empty-${idx}`;
              return (
                <span
                  key={channelKey}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-[#006ddd]/15 text-[#006ddd] font-mono border border-[#006ddd]/30 font-semibold"
                >
                  {ch.key || `field_${idx + 1}`}
                </span>
              );
            })}
            {stateChannels.length > 3 && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                +{stateChannels.length - 3}
              </span>
            )}
          </div>
        </div>

        {/* Steps mini-list */}
        <div className="flex flex-wrap gap-1.5">
          {[
            ...graphSteps,
            ...((data.agentDefinitions as Array<{ id?: string; agentId?: string; name?: string; stateUpdates?: unknown[] }>) || []).map((ag) => ({
              id: ag.id || ag.agentId || "agentNode",
              name: ag.name || "agentNode",
              stateUpdates: ag.stateUpdates || [],
            })),
          ].slice(0, 4).map((step: { id?: string; name?: string; stateUpdates?: unknown[] }, idx: number) => {
            const hasUpdates = Boolean(
              step.stateUpdates && step.stateUpdates.length > 0,
            );
            const stepKey = step.id?.trim() ? `step-${step.id}-${idx}` : `step-empty-${idx}`;
            return (
              <span
                key={stepKey}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-md border font-mono flex items-center gap-1",
                  hasUpdates
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-secondary text-foreground border-border/50",
                )}
              >
                {step.name || step.id || `Step ${idx + 1}`}
                {hasUpdates && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                )}
              </span>
            );
          })}
          {(graphSteps.length + ((data.agentDefinitions as unknown[])?.length || 0)) > 4 && (
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary/40 text-muted-foreground border border-border/50 font-mono">
              +{(graphSteps.length + ((data.agentDefinitions as unknown[])?.length || 0)) - 4} more
            </span>
          )}
        </div>

        {/* Checkpointer Status / Warning */}
        {checkpointerError ? (
          <div
            className="flex items-center justify-between p-2 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-[10px] font-medium"
            title={checkpointerError}
          >
            <div className="flex items-center gap-1.5 truncate">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{checkpointerError}</span>
            </div>
            <button
              type="button"
              onClick={handleOpenEditor}
              className="text-[9px] underline font-bold shrink-0 ml-1 hover:opacity-80 cursor-pointer"
            >
              fix in studio ↗
            </button>
          </div>
        ) : (
          /* Memory badge */
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="px-1.5 py-0.5 rounded bg-secondary text-foreground border border-border/40 font-mono">
              {memoryConfig.checkpointer || "memory"}
            </span>
            <span>checkpointer</span>
            {memoryConfig.autoSummarize && (
              <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/40 font-mono">
                auto-summarize
              </span>
            )}
          </div>
        )}

        {/* Open Editor Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full h-9 text-xs font-semibold border-border hover:bg-secondary gap-2 mt-1 transition-all"
          onClick={handleOpenEditor}
        >
          <Sparkles className="w-4 h-4 text-primary" />
          Open LangGraph Studio
          <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
        </Button>
      </div>

      {/* Environment Variables (.env) Section */}
      <NodeEnvVarsSection nodeId={id} />
    </div>
  );
});
