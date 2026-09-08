"use client";

import React, { useMemo, useState } from "react";
import {
  Network,
  Radio,
  Sparkles,
  Layers,
  RefreshCw,
  Trash2,
  Plus,
  Bot,
  AlertCircle,
  CheckCircle2,
  Flame,
  ArrowRight,
} from "lucide-react";
import { BackendNode } from "@workspace/canvas/types";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { PipelineStepDraft } from "./types";

export interface LangGraphInvokeStepSectionProps {
  step: PipelineStepDraft;
  allNodes: BackendNode[];
  onChange: (updated: PipelineStepDraft) => void;
  children?: React.ReactNode;
}

export const LangGraphInvokeStepSection: React.FC<
  LangGraphInvokeStepSectionProps
> = ({ step, allNodes, onChange, children }) => {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  // 1. Identify all LangGraph nodes on canvas
  const availableAgents = useMemo(() => {
    return allNodes.filter((n) => n.type === "langgraph");
  }, [allNodes]);

  // Selected agent node
  const selectedAgentNode = useMemo(() => {
    if (step.langGraphTargetNodeId) {
      const found = availableAgents.find(
        (n) => n.id === step.langGraphTargetNodeId,
      );
      if (found) return found;
    }
    return availableAgents[0];
  }, [availableAgents, step.langGraphTargetNodeId]);

  // Auto-set targetNodeId if not set yet
  React.useEffect(() => {
    if (!step.langGraphTargetNodeId && selectedAgentNode) {
      onChange({
        ...step,
        langGraphTargetNodeId: selectedAgentNode.id,
      });
    }
  }, [selectedAgentNode, step.langGraphTargetNodeId, step, onChange]);

  // State channels defined on selected agent node
  const stateChannels: Array<{ key: string; type: string }> = useMemo(() => {
    if (!selectedAgentNode?.data) return [{ key: "messages", type: "BaseMessage[]" }];
    const channels = selectedAgentNode.data.stateChannels;
    if (Array.isArray(channels) && channels.length > 0) {
      return channels;
    }
    return [{ key: "messages", type: "BaseMessage[]" }];
  }, [selectedAgentNode]);

  const mapping: Record<string, string> = useMemo(() => {
    return step.langGraphStateMapping || {};
  }, [step.langGraphStateMapping]);

  const isStreaming = step.langGraphStreamingEnabled ?? false;
  const streamingProtocol = step.langGraphStreamingProtocol || "sse";
  const outputMode = step.langGraphOutputMode || "full_state";
  const streamingFields = step.langGraphStreamingFields || [];
  const outputFields = step.langGraphOutputFields || [];

  // Handlers
  const handleSelectAgent = (nodeId: string) => {
    onChange({
      ...step,
      langGraphTargetNodeId: nodeId,
    });
  };

  const handleMappingChange = (stateKey: string, sourcePath: string) => {
    const updated = { ...mapping };
    if (!sourcePath.trim()) {
      delete updated[stateKey];
    } else {
      updated[stateKey] = sourcePath;
    }
    onChange({
      ...step,
      langGraphStateMapping: updated,
    });
  };

  const handleRemoveMapping = (stateKey: string) => {
    const updated = { ...mapping };
    delete updated[stateKey];
    onChange({
      ...step,
      langGraphStateMapping: updated,
    });
  };

  const handleAutoMap = () => {
    const newMapping: Record<string, string> = { ...mapping };
    stateChannels.forEach((ch) => {
      if (ch.key === "messages") {
        newMapping[ch.key] = "body.message";
      } else {
        newMapping[ch.key] = `body.${ch.key}`;
      }
    });
    onChange({
      ...step,
      langGraphStateMapping: newMapping,
    });
  };

  const handleAddCustomField = () => {
    if (!newKey.trim()) return;
    const updated = {
      ...mapping,
      [newKey.trim()]: newValue.trim() || `body.${newKey.trim()}`,
    };
    onChange({
      ...step,
      langGraphStateMapping: updated,
    });
    setNewKey("");
    setNewValue("");
  };

  const handleToggleStreaming = (enabled: boolean) => {
    onChange({
      ...step,
      langGraphStreamingEnabled: enabled,
      langGraphStreamingProtocol: enabled ? streamingProtocol : undefined,
    });
  };

  const handleToggleStreamingField = (channelKey: string) => {
    const nextFields = streamingFields.includes(channelKey)
      ? streamingFields.filter((k) => k !== channelKey)
      : [...streamingFields, channelKey];
    onChange({
      ...step,
      langGraphStreamingFields: nextFields,
    });
  };

  const handleToggleOutputField = (channelKey: string) => {
    const nextFields = outputFields.includes(channelKey)
      ? outputFields.filter((k) => k !== channelKey)
      : [...outputFields, channelKey];
    onChange({
      ...step,
      langGraphOutputFields: nextFields,
    });
  };

  if (availableAgents.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold">No LangGraph Agent Found</span>
        </div>
        <p className="text-[11px] text-amber-300/80 leading-relaxed">
          There are no LangGraph agent nodes currently present on this canvas.
          Add a LangGraph node from the canvas sidebar to connect it to this
          pipeline step.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Target Agent Selector */}
      <div className="flex flex-col gap-2 p-3 bg-secondary/20 rounded-xl border border-border/50">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-primary" />
            Target LangGraph Agent
          </Label>
          <span className="text-[10px] text-muted-foreground font-mono">
            {availableAgents.length} available
          </span>
        </div>
        <Select
          value={selectedAgentNode?.id || ""}
          onValueChange={handleSelectAgent}
        >
          <SelectTrigger className="h-9 text-xs bg-background/80 border-border/60">
            <SelectValue placeholder="Select an agent..." />
          </SelectTrigger>
          <SelectContent>
            {availableAgents.map((agent) => (
              <SelectItem
                key={agent.id}
                value={agent.id}
                className="text-xs flex items-center gap-2"
              >
                <div className="flex items-center gap-2">
                  <Network className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-semibold text-foreground">
                    {agent.data?.label || "LangGraph Agent"}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ({agent.id})
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedAgentNode && (
          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground bg-background/50 px-2.5 py-1.5 rounded-lg border border-border/40">
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span className="font-medium text-foreground">
              {selectedAgentNode.data?.label || "Agent"}
            </span>
            <span className="text-[10px]">•</span>
            <span>{stateChannels.length} state channels</span>
            {selectedAgentNode.data?.memoryConfig?.checkpointer && (
              <>
                <span className="text-[10px]">•</span>
                <span className="text-emerald-400 font-mono text-[10px]">
                  Memory ({selectedAgentNode.data.memoryConfig.checkpointer})
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* State Channels Mapping */}
      <div className="flex flex-col gap-2.5 p-3.5 bg-secondary/15 rounded-xl border border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <Label className="text-xs font-bold text-foreground">
              State Channel Payload Mapping
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoMap}
            className="h-6 text-[10px] font-semibold gap-1 px-2 border-border/60 hover:bg-secondary/40"
            title="Auto-map default payload fields"
          >
            <RefreshCw className="w-3 h-3 text-primary" />
            Auto-map
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Map request parameters or preceding step outputs into the agent state
          channels (e.g. `body.message`, `req.headers["x-user-id"]`, or
          `step_output`).
        </p>

        <div className="flex flex-col gap-1.5 mt-1">
          <div className="grid grid-cols-12 gap-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-1">
            <span className="col-span-5">State Channel</span>
            <span className="col-span-6">Source Accessor</span>
            <span className="col-span-1 text-right"></span>
          </div>

          {stateChannels.map((ch) => (
            <div
              key={ch.key}
              className="grid grid-cols-12 gap-2 items-center text-xs"
            >
              <div className="col-span-5 flex items-center gap-1 min-w-0">
                <span className="font-mono font-bold text-purple-300 text-[11px] truncate bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                  {ch.key}
                </span>
                <span className="text-[9px] text-muted-foreground font-mono truncate">
                  {ch.type}
                </span>
              </div>
              <div className="col-span-6">
                <Input
                  value={mapping[ch.key] ?? ""}
                  placeholder={
                    ch.key === "messages"
                      ? "body.message"
                      : `body.${ch.key}`
                  }
                  onChange={(e) => handleMappingChange(ch.key, e.target.value)}
                  className="h-7 text-xs font-mono bg-background/80"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                {mapping[ch.key] !== undefined && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveMapping(ch.key)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    title="Clear mapping"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {/* Any custom mappings not in declared channels */}
          {Object.entries(mapping)
            .filter(([k]) => !stateChannels.some((ch) => ch.key === k))
            .map(([k, v]) => (
              <div
                key={k}
                className="grid grid-cols-12 gap-2 items-center text-xs"
              >
                <div className="col-span-5 flex items-center gap-1 min-w-0">
                  <span className="font-mono font-bold text-primary text-[11px] truncate bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                    {k}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    (custom)
                  </span>
                </div>
                <div className="col-span-6">
                  <Input
                    value={v}
                    onChange={(e) => handleMappingChange(k, e.target.value)}
                    className="h-7 text-xs font-mono bg-background/80"
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveMapping(k)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    title="Remove custom mapping"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}

          {/* Add custom state field */}
          <div className="grid grid-cols-12 gap-2 items-center pt-2 border-t border-border/30">
            <div className="col-span-5">
              <Input
                value={newKey}
                placeholder="Custom key"
                onChange={(e) => setNewKey(e.target.value)}
                className="h-7 text-xs font-mono bg-background/80"
              />
            </div>
            <div className="col-span-6">
              <Input
                value={newValue}
                placeholder="e.g. headers['x-user-id']"
                onChange={(e) => setNewValue(e.target.value)}
                className="h-7 text-xs font-mono bg-background/80"
              />
            </div>
            <div className="col-span-1 flex justify-end">
              <Button
                variant="outline"
                size="icon"
                onClick={handleAddCustomField}
                disabled={!newKey.trim()}
                className="h-7 w-7 text-primary border-border/60 hover:bg-primary/10"
                title="Add state mapping"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Streaming & Output Delivery Section */}
      <div className="flex flex-col gap-3 p-3.5 bg-secondary/15 rounded-xl border border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio
              className={`w-3.5 h-3.5 ${
                isStreaming ? "text-purple-400 animate-pulse" : "text-muted-foreground"
              }`}
            />
            <Label className="text-xs font-bold text-foreground">
              Response Streaming (SSE)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">
              {isStreaming ? "Stream Active" : "Sync REST"}
            </span>
            <Switch
              checked={isStreaming}
              onCheckedChange={handleToggleStreaming}
            />
          </div>
        </div>

        {isStreaming ? (
          <div className="flex flex-col gap-2.5 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">
                Delivery Protocol:
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={streamingProtocol === "sse" ? "default" : "outline"}
                  onClick={() =>
                    onChange({
                      ...step,
                      langGraphStreamingProtocol: "sse",
                    })
                  }
                  className="h-6 text-[10px] px-2.5"
                >
                  Server-Sent Events (SSE)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={streamingProtocol === "websocket" ? "default" : "outline"}
                  onClick={() =>
                    onChange({
                      ...step,
                      langGraphStreamingProtocol: "websocket",
                    })
                  }
                  className="h-6 text-[10px] px-2.5"
                >
                  WebSocket
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-[11px] font-medium text-foreground">
                Streamed State Channels
              </span>
              <p className="text-[10px] text-muted-foreground">
                Click to filter which channel tokens are forwarded to the client
                (empty = all tokens):
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {stateChannels.map((ch) => {
                  const isSelected = streamingFields.includes(ch.key);
                  return (
                    <button
                      key={ch.key}
                      type="button"
                      onClick={() => handleToggleStreamingField(ch.key)}
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

            <div className="flex items-center gap-1.5 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg text-purple-200 text-[10px] mt-1">
              <Flame className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>
                Tokens will be streamed in real-time as the agent generates
                them (`graph.stream()`).
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
                  onClick={() =>
                    onChange({
                      ...step,
                      langGraphOutputMode: "full_state",
                    })
                  }
                  className="h-6 text-[10px] px-2"
                >
                  Full State
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={outputMode === "last_message" ? "default" : "outline"}
                  onClick={() =>
                    onChange({
                      ...step,
                      langGraphOutputMode: "last_message",
                    })
                  }
                  className="h-6 text-[10px] px-2"
                >
                  Last Message
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={outputMode === "specific_fields" ? "default" : "outline"}
                  onClick={() =>
                    onChange({
                      ...step,
                      langGraphOutputMode: "specific_fields",
                    })
                  }
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
                  {stateChannels.map((ch) => {
                    const isSelected = outputFields.includes(ch.key);
                    return (
                      <button
                        key={ch.key}
                        type="button"
                        onClick={() => handleToggleOutputField(ch.key)}
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
      </div>

      {children}
    </div>
  );
};
