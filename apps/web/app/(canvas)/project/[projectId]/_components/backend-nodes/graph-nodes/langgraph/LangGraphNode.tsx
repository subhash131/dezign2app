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
} from "lucide-react";
import type {
  BackendNode,
  LangGraphStepConfig,
  LangGraphStateChannel,
  OutputChannelConfig,
} from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader } from "../common";

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

  // All edges that target this langgraph node
  const incomingEdges = edges.filter((e) => e.target === nodeId);

  return incomingEdges.map((edge): ConnectedRouteInfo => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const sourceNodeLabel = sourceNode?.data?.label || edge.source;

    // Resolve specific endpoint
    if (edge.sourceHandle?.startsWith("endpoint-out-")) {
      const endpointId = edge.sourceHandle.replace("endpoint-out-", "");
      const ep = endpoints.find((e) => e.id === endpointId);
      if (ep) {
        const item: ConnectedRouteInfo = {
          edgeId: edge.id,
          kind: "endpoint",
          label: ep.name || ep.id,
          method: ep.type || "GET",
          sourceNodeLabel,
          payloadMapping: edge.data?.payloadMapping,
        };
        return item;
      }
    }

    // Resolve consumed event
    if (edge.sourceHandle?.startsWith("consumedEvents-out-")) {
      const eventId = edge.sourceHandle.replace("consumedEvents-out-", "");
      const ev = events.find((e) => e.id === eventId);
      if (ev) {
        const item: ConnectedRouteInfo = {
          edgeId: edge.id,
          kind: "event",
          label: ev.name || eventId,
          method: "EVENT",
          sourceNodeLabel,
          payloadMapping: edge.data?.payloadMapping,
        };
        return item;
      }
    }

    // Fallback — task or general connection
    const fallbackItem: ConnectedRouteInfo = {
      edgeId: edge.id,
      kind: "task",
      label: sourceNodeLabel,
      method: "INVOKE",
      sourceNodeLabel,
      payloadMapping: edge.data?.payloadMapping,
    };
    return fallbackItem;
  });
}


export const LangGraphNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
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

  return (
    <div
      className={cn(
        "rounded-2xl bg-card/95 backdrop-blur-xl border-2 w-[280px] min-w-[280px] max-w-[340px] flex flex-col transition-all duration-300 relative shadow-2xl group",
        selected
          ? "border-primary ring-4 ring-primary/20 shadow-primary/10"
          : "border-border hover:border-border/80",
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
        rightElement={
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-secondary nodrag"
            onClick={handleOpenEditor}
            title="Open LangGraph Studio"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        }
      />
      <div className="px-3 py-1 bg-muted/20 border-b flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <ShieldCheck className="w-3 h-3 text-primary shrink-0" />
        <span className="truncate">
          {inputChannels.length} inputs · {graphSteps.length} steps ·{" "}
          {stateChannels.length} state fields
          {connectedRoutesCount > 0 && (
            <> · <span className="text-primary font-semibold">{connectedRoutesCount} routes</span></>
          )}
        </span>
      </div>

      {/* Single generic target Handle for canvas edges */}
      <Handle
        type="target"
        position={Position.Left}
        id="input-start"
        className="!bg-primary !w-3 !h-3 !border-2 !border-background hover:!scale-125 transition-transform !-left-[7px]"
        title="Drag from an endpoint or event handle to invoke this agent"
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
            {(data.outputChannels || []).map((ch) => {
              const typeInfo = getChannelTypeBadge(ch.type);
              const IconComponent = typeInfo.icon;
              return (
                <div
                  key={ch.id}
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
                    className="!bg-primary !w-3 !h-3 !border-2 !border-background hover:!scale-125 transition-transform !-right-[7px]"
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
            {stateChannels.slice(0, 3).map((ch: LangGraphStateChannel) => (
              <span
                key={ch.key}
                className="text-[9px] px-1.5 py-0.5 rounded bg-[#006ddd]/15 text-[#006ddd] font-mono border border-[#006ddd]/30 font-semibold"
              >
                {ch.key}
              </span>
            ))}
            {stateChannels.length > 3 && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                +{stateChannels.length - 3}
              </span>
            )}
          </div>
        </div>

        {/* Steps mini-list */}
        <div className="flex flex-wrap gap-1.5">
          {graphSteps.slice(0, 4).map((step: LangGraphStepConfig) => {
            const hasUpdates = Boolean(
              step.stateUpdates && step.stateUpdates.length > 0,
            );
            return (
              <span
                key={step.id}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-md border font-mono flex items-center gap-1",
                  hasUpdates
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-secondary text-foreground border-border/50",
                )}
              >
                {step.name || step.id}
                {hasUpdates && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                )}
              </span>
            );
          })}
          {graphSteps.length > 4 && (
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary/40 text-muted-foreground border border-border/50 font-mono">
              +{graphSteps.length - 4} more
            </span>
          )}
        </div>

        {/* Memory badge */}
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
    </div>
  );
};
