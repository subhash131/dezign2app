"use client";

import React from "react";
import { Brain, Coins, Compass, Database, Flame, Key, Layers, Plus, Radio, Sparkles, Trash2 } from "lucide-react";
import { BackendNode } from "@workspace/canvas/types";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { BindingSourceEditor } from "../BindingSourceEditor";
import { LocalInput } from "../BufferedInput";
import { AvailableSource, StepBinding, LangGraphStreamMode } from "../types";

export type { LangGraphStreamMode };

export interface StreamingAndOutputSectionProps {
  isStreaming: boolean;
  streamingProtocol: string;
  streamModes?: LangGraphStreamMode[];
  includeReasoning?: boolean;
  includeSubgraphs?: boolean;
  outputMode: string;
  streamingFields: string[];
  outputFields: string[];
  stateChannels: Array<{ key: string; type: string }>;
  /** Auto-detected page_ref node connected via a canvas edge (for SSE). Read-only — user draws the edge. */
  ssePageRefNode?: BackendNode;
  /** All available WebPage nodes on canvas */
  allWebPages?: BackendNode[];
  /** The WebPage node that invoked/connected to this endpoint (default stream target) */
  invokingPage?: BackendNode;
  /** Currently selected target WebPage ID */
  selectedTargetPageId?: string;
  /** Connected PageRef (push-to-client) node on canvas */
  connectedPageRefNode?: BackendNode;
  /** Callback when target page is changed in dropdown */
  onTargetPageChange?: (pageId: string) => void;
  /** Callback to connect or re-connect push-to-client node to this endpoint */
  onConnectPushToClient?: () => void;
  kafkaBrokerNodes: BackendNode[];
  selectedKafkaBrokerNode: BackendNode | undefined;
  availableKafkaTopics: string[];
  kafkaTopic: string | undefined;
  kafkaKeyBinding: StepBinding;
  hasCustomKafkaKey: boolean;
  redisNodes: BackendNode[];
  selectedRedisNode: BackendNode | undefined;
  availableRedisStreams: string[];
  redisStreamKey: string | undefined;
  redisStreamKeyBinding: StepBinding;
  hasCustomRedisStreamKey: boolean;
  roomBinding: StepBinding;
  hasCustomRoom: boolean;
  threadIdSource: string | undefined;
  availableSources: AvailableSource[];
  serviceNodeId?: string;
  onToggleStreaming: (enabled: boolean) => void;
  onProtocolChange: (protocol: "raw" | "sse" | "websocket" | "kafka" | "redis_stream") => void;
  onToggleStreamMode?: (mode: LangGraphStreamMode) => void;
  onToggleIncludeReasoning?: (enabled: boolean) => void;
  onToggleIncludeSubgraphs?: (enabled: boolean) => void;
  onKafkaBrokerChange: (brokerNodeId: string, defaultTopic: string) => void;
  onKafkaTopicChange: (topic: string) => void;
  onRedisNodeChange: (redisNodeId: string, defaultStreamKey: string) => void;
  onRedisKeyChange: (streamKey: string) => void;
  onOutputModeChange: (mode: "full_state" | "last_message" | "specific_fields") => void;
  onToggleStreamingField: (key: string) => void;
  onToggleOutputField: (key: string) => void;
  onRoomBindingChange: (updated: StepBinding) => void;
  onResetRoomBinding: () => void;
  onKafkaKeyBindingChange: (updated: StepBinding) => void;
  onResetKafkaKeyBinding: () => void;
  onRedisKeyBindingChange: (updated: StepBinding) => void;
  onResetRedisKeyBinding: () => void;
  trackTokenUsage?: boolean;
  onToggleTrackTokenUsage?: (enabled: boolean) => void;
}

export const StreamingAndOutputSection: React.FC<StreamingAndOutputSectionProps> = ({
  isStreaming,
  streamingProtocol,
  streamModes = ["messages"],
  includeReasoning = true,
  includeSubgraphs = false,
  outputMode,
  streamingFields,
  outputFields,
  stateChannels,
  ssePageRefNode,
  allWebPages = [],
  invokingPage,
  selectedTargetPageId,
  connectedPageRefNode,
  onTargetPageChange,
  onConnectPushToClient,
  kafkaBrokerNodes,
  selectedKafkaBrokerNode,
  availableKafkaTopics,
  kafkaTopic,
  kafkaKeyBinding,
  hasCustomKafkaKey,
  redisNodes,
  selectedRedisNode,
  availableRedisStreams,
  redisStreamKey,
  redisStreamKeyBinding,
  hasCustomRedisStreamKey,
  roomBinding,
  hasCustomRoom,
  threadIdSource,
  availableSources,
  serviceNodeId,
  onToggleStreaming,
  onProtocolChange,
  onToggleStreamMode,
  onToggleIncludeReasoning,
  onToggleIncludeSubgraphs,
  onKafkaBrokerChange,
  onKafkaTopicChange,
  onRedisNodeChange,
  onRedisKeyChange,
  onOutputModeChange,
  onToggleStreamingField,
  onToggleOutputField,
  onRoomBindingChange,
  onResetRoomBinding,
  onKafkaKeyBindingChange,
  onResetKafkaKeyBinding,
  onRedisKeyBindingChange,
  onResetRedisKeyBinding,
  trackTokenUsage = false,
  onToggleTrackTokenUsage,
}) => {
  const effectiveStreamModes = streamModes && streamModes.length > 0 ? streamModes : ["messages"];

  return (
    <div className="flex flex-col gap-3 p-3.5 bg-secondary/15 rounded-xl border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio
            className={`w-3.5 h-3.5 ${
              isStreaming ? "text-purple-400 animate-pulse" : "text-muted-foreground"
            }`}
          />
          <Label className="text-xs font-bold text-foreground">
            Real-time Response Streaming
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">
            {isStreaming ? "Stream Active" : "Sync REST"}
          </span>
          <Switch
            checked={isStreaming}
            onCheckedChange={onToggleStreaming}
          />
        </div>
      </div>

      {/* LangGraph Invocation Modes — always visible regardless of streaming toggle */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
        <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-background/50 border border-border/40">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Stream Modes (streamMode)</span>
            </Label>
            <span className="text-[9px] text-muted-foreground font-mono">
              {effectiveStreamModes.length > 1 ? "Multi-Mode" : effectiveStreamModes[0] ?? "messages"}
            </span>
          </div>

          <p className="text-[9.5px] text-muted-foreground leading-tight">
            Controls what data LangGraph emits per chunk. Enable multiple modes to receive LLM tokens and node-progress events simultaneously:
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            {[
              {
                id: "messages" as const,
                label: "LLM Tokens",
                badge: "messages",
                desc: "Live (token, metadata) tuples from nodes where LLM runs",
              },
              {
                id: "updates" as const,
                label: "Agent Progress",
                badge: "updates",
                desc: "State delta emitted after each node completes",
              },
              {
                id: "values" as const,
                label: "Full State",
                badge: "values",
                desc: "Complete state snapshot after each step",
              },
              {
                id: "custom" as const,
                label: "Custom Events",
                badge: "custom",
                desc: "Arbitrary events via config.writer",
              },
            ].map((m) => {
              const isSelected = effectiveStreamModes.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onToggleStreamMode?.(m.id)}
                  className={`flex flex-col text-left p-2 rounded-lg border transition-all ${
                    isSelected
                      ? "bg-purple-500/15 border-purple-500/50 text-purple-200"
                      : "bg-background/60 border-border/40 text-muted-foreground hover:bg-secondary/40"
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1">
                    <span className="text-[10.5px] font-semibold truncate">{m.label}</span>
                    <span
                      className={`shrink-0 text-[8.5px] px-1 rounded font-bold font-mono ${
                        isSelected ? "bg-purple-500/30 text-purple-300" : "bg-border/40 text-muted-foreground/60"
                      }`}
                    >
                      {isSelected ? "ON" : "OFF"}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-purple-400/70 mt-0.5">{m.badge}</span>
                  <span className="text-[9px] text-muted-foreground/80 mt-0.5 leading-snug">
                    {m.desc}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Extended Thinking & Reasoning Tokens Toggle */}
          <div className="flex items-center justify-between pt-1.5 border-t border-border/20">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-foreground flex items-center gap-1">
                <Brain className="w-3 h-3 text-pink-400" />
                Stream Reasoning Tokens
              </span>
              <span className="text-[9px] text-muted-foreground">
                Surface thinking blocks in real time (Claude 3.7+, o1/o3, Gemini Flash)
              </span>
            </div>
            <Switch
              checked={includeReasoning !== false}
              onCheckedChange={(val) => onToggleIncludeReasoning?.(val)}
            />
          </div>

          {/* Subgraphs Output Toggle */}
          <div className="flex items-center justify-between pt-1.5 border-t border-border/20">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-foreground flex items-center gap-1">
                <Layers className="w-3 h-3 text-sky-400" />
                Include Subgraph Outputs
              </span>
              <span className="text-[9px] text-muted-foreground">
                Prefix chunks with subgraph namespace (subgraphs: true)
              </span>
            </div>
            <Switch
              checked={Boolean(includeSubgraphs)}
              onCheckedChange={(val) => onToggleIncludeSubgraphs?.(val)}
            />
          </div>
        </div>
      </div>

      {isStreaming ? (
        <div className="flex flex-col gap-2.5 pt-2 border-t border-border/30">
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground text-[11px] font-medium">
              Delivery Protocol &amp; Destination:
            </span>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant={streamingProtocol === "raw" ? "default" : "outline"}
                onClick={() => onProtocolChange("raw")}
                className="h-6 text-[10px] px-2.5"
              >
                Raw Stream
              </Button>
              <Button
                type="button"
                size="sm"
                variant={streamingProtocol === "sse" ? "default" : "outline"}
                onClick={() => onProtocolChange("sse")}
                className="h-6 text-[10px] px-2.5"
              >
                SSE
              </Button>
              <Button
                type="button"
                size="sm"
                variant={streamingProtocol === "websocket" ? "default" : "outline"}
                onClick={() => onProtocolChange("websocket")}
                className="h-6 text-[10px] px-2.5"
              >
                WebSocket
              </Button>
              <Button
                type="button"
                size="sm"
                variant={streamingProtocol === "kafka" ? "default" : "outline"}
                onClick={() => onProtocolChange("kafka")}
                className="h-6 text-[10px] px-2.5"
              >
                Kafka Topic
              </Button>
              <Button
                type="button"
                size="sm"
                variant={streamingProtocol === "redis_stream" ? "default" : "outline"}
                onClick={() => onProtocolChange("redis_stream")}
                className="h-6 text-[10px] px-2.5"
              >
                Redis Stream
              </Button>
            </div>
          </div>


          {/* WebSocket Config */}
          {streamingProtocol === "websocket" && (
            <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Radio className="w-3 h-3 text-sky-400" />
                  <span>WebSocket Room / Channel Mapping</span>
                </Label>
                <span className="text-[9px] text-muted-foreground font-mono">
                  wsBroadcast Room
                </span>
              </div>

              <div className="grid grid-cols-[140px_auto_1fr_auto] gap-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                <span>Target Key</span>
                <span></span>
                <span>Source &amp; Field</span>
                <span className="w-6 text-right"></span>
              </div>

              <div className="grid grid-cols-[140px_auto_1fr_auto] gap-2 items-center text-xs bg-background/60 p-1.5 rounded-lg border border-sky-500/20">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono font-bold text-sky-400 text-[11px] truncate bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                    room_id
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono">string</span>
                </div>
                <span className="text-[10px] text-muted-foreground/50 px-0.5 select-none">←</span>
                <div className="min-w-0">
                  <BindingSourceEditor
                    binding={roomBinding}
                    availableSources={availableSources}
                    serviceNodeId={serviceNodeId}
                    onChange={onRoomBindingChange}
                  />
                </div>
                <div className="flex justify-end">
                  {hasCustomRoom ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onResetRoomBinding}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="Reset to default (thread_id)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  ) : (
                    <div className="w-6" />
                  )}
                </div>
              </div>

              <p className="text-[9.5px] text-muted-foreground leading-tight">
                Tokens are broadcasted to connected clients in this room. {roomBinding.source ? `Configured source: ${threadIdSource || "body.thread_id"}` : `Defaults to ${threadIdSource || "body.thread_id"}`}.
              </p>
            </div>
          )}

          {/* Kafka Config */}
          {streamingProtocol === "kafka" && (
            <div className="flex flex-col gap-2.5 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="grid grid-cols-2 gap-2">
                {/* Kafka Broker Node Selector */}
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-400" />
                    <span>Kafka Broker Node</span>
                  </Label>
                  {kafkaBrokerNodes.length > 0 ? (
                    <Select
                      value={selectedKafkaBrokerNode?.id || "__none__"}
                      onValueChange={(val) => {
                        const broker = kafkaBrokerNodes.find((n) => n.id === val);
                        const firstTopic = broker?.data?.topics?.[0]?.name || broker?.data?.topics?.[0]?.id || "";
                        onKafkaBrokerChange(val, firstTopic);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs bg-background">
                        <SelectValue placeholder="Select Kafka Broker" />
                      </SelectTrigger>
                      <SelectContent>
                        {kafkaBrokerNodes.map((b) => (
                          <SelectItem key={b.id} value={b.id} className="text-xs">
                            {b.data?.label || b.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic py-1">
                      No Kafka broker node on canvas
                    </span>
                  )}
                </div>

                {/* Kafka Topic Selector */}
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Radio className="w-3 h-3 text-purple-400" />
                    <span>Target Topic</span>
                  </Label>
                  {availableKafkaTopics.length > 0 ? (
                    <Select
                      value={kafkaTopic || availableKafkaTopics[0]}
                      onValueChange={onKafkaTopicChange}
                    >
                      <SelectTrigger className="h-7 text-xs bg-background">
                        <SelectValue placeholder="Select Topic" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableKafkaTopics.map((top) => (
                          <SelectItem key={top} value={top} className="text-xs">
                            {top}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <LocalInput
                      value={kafkaTopic || ""}
                      onChange={(e) => onKafkaTopicChange(e.target.value)}
                      placeholder="agent-response-tokens"
                      className="h-7 text-xs bg-background"
                    />
                  )}
                </div>
              </div>

              {/* Partition Key Field Mapping */}
              <div className="flex flex-col gap-1.5 mt-0.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Key className="w-3 h-3 text-amber-400" />
                    <span>Partition Key Mapping (ensures in-order delivery)</span>
                  </Label>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    Kafka Record Key
                  </span>
                </div>

                <div className="grid grid-cols-[140px_auto_1fr_auto] gap-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                  <span>Target Key</span>
                  <span></span>
                  <span>Source &amp; Field</span>
                  <span className="w-6 text-right"></span>
                </div>

                <div className="grid grid-cols-[140px_auto_1fr_auto] gap-2 items-center text-xs bg-background/60 p-1.5 rounded-lg border border-amber-500/20">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-amber-400 text-[11px] truncate bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      partition_key
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">string</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 px-0.5 select-none">←</span>
                  <div className="min-w-0">
                    <BindingSourceEditor
                      binding={kafkaKeyBinding}
                      availableSources={availableSources}
                      serviceNodeId={serviceNodeId}
                      onChange={onKafkaKeyBindingChange}
                    />
                  </div>
                  <div className="flex justify-end">
                    {hasCustomKafkaKey ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onResetKafkaKeyBinding}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Reset to default (thread_id)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <div className="w-6" />
                    )}
                  </div>
                </div>

                <p className="text-[9.5px] text-muted-foreground leading-tight">
                  Tokens published with this key route to the same Kafka partition, guaranteeing ordering for consumers. {hasCustomKafkaKey ? "Custom key mapped" : `Defaults to ${threadIdSource || "body.thread_id"}`}.
                </p>
              </div>
            </div>
          )}

          {/* Redis Stream Config */}
          {streamingProtocol === "redis_stream" && (
            <div className="flex flex-col gap-2.5 p-2.5 rounded-lg bg-background/50 border border-border/40">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Database className="w-3 h-3 text-red-400" />
                  <span>Redis Node</span>
                </Label>
                {redisNodes.length > 0 ? (
                  <Select
                    value={selectedRedisNode?.id || "__none__"}
                    onValueChange={(val) => {
                      const rNode = redisNodes.find((n) => n.id === val);
                      const firstStream = rNode?.data?.streams?.[0]?.name || rNode?.data?.streams?.[0]?.id || "";
                      onRedisNodeChange(val, firstStream);
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background">
                      <SelectValue placeholder="Select Redis Node" />
                    </SelectTrigger>
                    <SelectContent>
                      {redisNodes.map((rn) => (
                        <SelectItem key={rn.id} value={rn.id} className="text-xs">
                          {rn.data?.label || rn.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-[10px] text-muted-foreground italic py-1">
                    No Redis node on canvas
                  </span>
                )}
              </div>

              {/* Declared Redis streams quick-picker chips if node has streams */}
              {availableRedisStreams.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9.5px] text-muted-foreground">Declared streams:</span>
                  {availableRedisStreams.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => onRedisKeyChange(st)}
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                        redisStreamKey === st
                          ? "border-red-500/60 bg-red-500/20 text-red-300 font-bold"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:bg-secondary/40"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              )}

              {/* Redis Stream Key Field Mapping */}
              <div className="flex flex-col gap-1.5 mt-0.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Radio className="w-3 h-3 text-red-400" />
                    <span>Stream Key Mapping (XADD destination)</span>
                  </Label>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    Redis Stream Key
                  </span>
                </div>

                <div className="grid grid-cols-[140px_auto_1fr_auto] gap-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-1">
                  <span>Target Key</span>
                  <span></span>
                  <span>Source &amp; Field</span>
                  <span className="w-6 text-right"></span>
                </div>

                <div className="grid grid-cols-[140px_auto_1fr_auto] gap-2 items-center text-xs bg-background/60 p-1.5 rounded-lg border border-red-500/20">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-red-400 text-[11px] truncate bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                      stream_key
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">string</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 px-0.5 select-none">←</span>
                  <div className="min-w-0">
                    <BindingSourceEditor
                      binding={redisStreamKeyBinding}
                      availableSources={availableSources}
                      serviceNodeId={serviceNodeId}
                      onChange={onRedisKeyBindingChange}
                    />
                  </div>
                  <div className="flex justify-end">
                    {hasCustomRedisStreamKey ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onResetRedisKeyBinding}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Reset to default stream key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <div className="w-6" />
                    )}
                  </div>
                </div>

                <p className="text-[9.5px] text-muted-foreground leading-tight">
                  Tokens are pushed to this Redis stream via XADD. {hasCustomRedisStreamKey ? "Custom stream key mapped" : `Defaults to stream:agent:\${${threadIdSource || "body.thread_id"}}`}.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5 mt-1">
            <span className="text-[11px] font-medium text-foreground">
              Streamed State Channels
            </span>
            <p className="text-[10px] text-muted-foreground">
              Click to filter which channel tokens are forwarded (empty = all tokens):
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {stateChannels.map((ch, idx) => {
                const isSelected = streamingFields.includes(ch.key);
                return (
                  <button
                    key={ch.key ? `stream-ch-${ch.key}-${idx}` : `stream-ch-empty-${idx}`}
                    type="button"
                    onClick={() => onToggleStreamingField(ch.key)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border transition-all ${
                      isSelected
                        ? "bg-purple-500/20 text-purple-300 border-purple-500/40 font-bold"
                        : "bg-background/80 text-muted-foreground border-border/40 hover:border-border"
                    }`}
                  >
                    {ch.key}
                    {isSelected && " ✓"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stream Target Page (Page Ref / Push to Client) — only for client protocols (SSE & WebSocket) */}
          {(streamingProtocol === "sse" || streamingProtocol === "websocket") && (
            <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-background/50 border border-border/40 mt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-[11px] font-medium text-foreground">
                    Stream Target Page (Page Ref)
                  </span>
                </div>
                {connectedPageRefNode ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected Node
                  </span>
                ) : (
                  onConnectPushToClient && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 gap-1 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-300"
                      onClick={onConnectPushToClient}
                      title="Connect Push to Client (PageRef) node on canvas"
                    >
                      <Plus className="w-3 h-3" />
                      Connect Push Node
                    </Button>
                  )
                )}
              </div>

              <p className="text-[9.5px] text-muted-foreground leading-tight">
                {invokingPage
                  ? `Defaulting to the invoking page (${invokingPage.data?.label || invokingPage.id}) connected to this endpoint.`
                  : "Select which web page receives this stream. A Push to Client (page_ref) node connects to this endpoint."}
              </p>

              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Select
                    value={selectedTargetPageId || "__none__"}
                    onValueChange={(val) => {
                      if (val !== "__none__" && onTargetPageChange) {
                        onTargetPageChange(val);
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background/80 border-border/70">
                      <SelectValue placeholder="Select target web page…" />
                    </SelectTrigger>
                    <SelectContent>
                      {!allWebPages || allWebPages.length === 0 ? (
                        <SelectItem value="__none__" disabled className="text-xs">
                          No WebPage nodes on canvas
                        </SelectItem>
                      ) : (
                        allWebPages.map((page) => {
                          const isInvoking = invokingPage?.id === page.id;
                          const label = page.data?.label || page.id;
                          return (
                            <SelectItem key={page.id} value={page.id} className="text-xs">
                              <span className="font-mono">{label}</span>
                              {isInvoking && (
                                <span className="ml-1.5 text-[9px] text-indigo-400 font-sans">
                                  (invoking page)
                                </span>
                              )}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {connectedPageRefNode && onConnectPushToClient && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
                    onClick={onConnectPushToClient}
                    title="Re-sync edge and PageRef node"
                  >
                    Re-sync
                  </Button>
                )}
              </div>

              {connectedPageRefNode && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded text-[9.5px] text-indigo-300">
                  <span className="font-semibold">Push to Client:</span>
                  <span className="font-mono font-bold truncate">
                    {connectedPageRefNode.data?.label || connectedPageRefNode.id}
                  </span>
                  <span className="text-muted-foreground ml-auto shrink-0 font-mono text-[9px]">
                    endpoint-out → page-ref-in
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-200 text-[10px] mt-1">
            <Flame className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>
              {streamingProtocol === "sse" &&
                "Tokens will stream in real-time to the caller over HTTP SSE (`res.write()`)."}
              {streamingProtocol === "raw" &&
                "Tokens will stream in real-time as raw plaintext to the caller over HTTP chunked transfer (`res.write(token)`)."}
              {streamingProtocol === "websocket" &&
                "Tokens will broadcast in real-time to connected WebSocket clients (`wsBroadcast()`)."}
              {streamingProtocol === "kafka" &&
                "Tokens will stream in real-time to the Kafka topic (`publishKafkaEvent()`)."}
              {streamingProtocol === "redis_stream" &&
                "Tokens will append in real-time to the Redis stream (`redis.xadd()`)."}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-medium text-foreground">
              Output Mode
            </Label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={outputMode === "full_state" ? "default" : "outline"}
                onClick={() => onOutputModeChange("full_state")}
                className="h-6 text-[10px] px-2"
              >
                Full State
              </Button>
              <Button
                type="button"
                size="sm"
                variant={outputMode === "last_message" ? "default" : "outline"}
                onClick={() => onOutputModeChange("last_message")}
                className="h-6 text-[10px] px-2"
              >
                Last Message
              </Button>
              <Button
                type="button"
                size="sm"
                variant={outputMode === "specific_fields" ? "default" : "outline"}
                onClick={() => onOutputModeChange("specific_fields")}
                className="h-6 text-[10px] px-2"
              >
                Specific Fields
              </Button>
            </div>
          </div>

          {outputMode === "specific_fields" && (
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-[10px] text-muted-foreground">
                Select state channels to include in step output:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {stateChannels.map((ch, idx) => {
                  const isSelected = outputFields.includes(ch.key);
                  return (
                    <button
                      key={ch.key ? `out-ch-${ch.key}-${idx}` : `out-ch-empty-${idx}`}
                      type="button"
                      onClick={() => onToggleOutputField(ch.key)}
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full border transition-all ${
                        isSelected
                          ? "bg-primary/20 text-primary border-primary/40 font-bold"
                          : "bg-background/80 text-muted-foreground border-border/40 hover:border-border"
                      }`}
                    >
                      {ch.key}
                      {isSelected && " ✓"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Token Usage Tracking */}
      <div className="flex flex-col gap-2 pt-2.5 border-t border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins
              className={`w-3.5 h-3.5 ${
                trackTokenUsage ? "text-amber-400" : "text-muted-foreground"
              }`}
            />
            <div className="flex flex-col">
              <Label className="text-[11px] font-medium text-foreground cursor-pointer">
                Track Token Usage
              </Label>
              <span className="text-[9.5px] text-muted-foreground leading-tight">
                Extract input, output, and total tokens per invocation
              </span>
            </div>
          </div>
          <Switch
            checked={Boolean(trackTokenUsage)}
            onCheckedChange={(checked) => onToggleTrackTokenUsage?.(checked)}
          />
        </div>

        {trackTokenUsage && (
          <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-200">
            <div className="flex items-center justify-between font-medium">
              <span>Available in step output & downstream steps:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 font-mono text-[9px]">
              <span className="px-1.5 py-0.5 rounded bg-background/60 border border-amber-500/30 text-amber-300">
                usage.input_tokens
              </span>
              <span className="px-1.5 py-0.5 rounded bg-background/60 border border-amber-500/30 text-amber-300">
                usage.output_tokens
              </span>
              <span className="px-1.5 py-0.5 rounded bg-background/60 border border-amber-500/30 text-amber-300">
                usage.total_tokens
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
