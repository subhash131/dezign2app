"use client";

import React from "react";
import { History, CheckCircle2, ShieldCheck, Database, Layers, SlidersHorizontal } from "lucide-react";
import { BackendNode, Endpoint, Parameter } from "@workspace/canvas/types";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import { Input } from "@workspace/ui/components/input";
import { PipelineStepDraft, AvailableSource, StepBinding } from "../types";
import { BindingSourceEditor } from "../BindingSourceEditor";
import { accessorToStepSource, stepSourceToAccessor } from "./utils";

export interface HistoryConfigSectionProps {
  step: PipelineStepDraft;
  selectedAgentNode: BackendNode | undefined;
  availableSources: AvailableSource[];
  serviceNodeId?: string;
  endpoint?: Endpoint;
  onEndpointChange?: (changes: Partial<Endpoint>) => void;
  onChange: (updated: PipelineStepDraft) => void;
}

export const HistoryConfigSection: React.FC<HistoryConfigSectionProps> = ({
  step,
  selectedAgentNode,
  availableSources,
  serviceNodeId,
  endpoint,
  onEndpointChange,
  onChange,
}) => {
  const currentFormat = step.langGraphHistoryFormat || "chat_messages";
  const excludeTools = step.langGraphHistoryExcludeToolMessages !== false;

  // Build binding object for thread ID source
  const currentThreadSource = step.langGraphThreadIdSource || "params.threadId";
  const threadBinding: StepBinding = React.useMemo(() => {
    return {
      argName: "thread_id",
      source: accessorToStepSource(currentThreadSource, availableSources),
    };
  }, [currentThreadSource, availableSources]);

  const handleThreadBindingChange = (updated: StepBinding) => {
    const accessor = stepSourceToAccessor(updated.source, availableSources);
    onChange({
      ...step,
      langGraphThreadIdSource: accessor,
    });
  };

  // Build binding object for limit source
  const currentLimitSource = step.langGraphHistoryLimitSource || "query.limit";
  const limitBinding: StepBinding = React.useMemo(() => {
    return {
      argName: "limit",
      source: accessorToStepSource(currentLimitSource, availableSources),
    };
  }, [currentLimitSource, availableSources]);

  const handleLimitBindingChange = (updated: StepBinding) => {
    const accessor = stepSourceToAccessor(updated.source, availableSources);
    onChange({
      ...step,
      langGraphHistoryLimitSource: accessor,
    });
  };

  // Build binding object for before cursor source
  const currentBeforeSource = step.langGraphHistoryBeforeSource || "query.before";
  const beforeBinding: StepBinding = React.useMemo(() => {
    return {
      argName: "before",
      source: accessorToStepSource(currentBeforeSource, availableSources),
    };
  }, [currentBeforeSource, availableSources]);

  const handleBeforeBindingChange = (updated: StepBinding) => {
    const accessor = stepSourceToAccessor(updated.source, availableSources);
    onChange({
      ...step,
      langGraphHistoryBeforeSource: accessor,
    });
  };

  // Check if endpoint queryParams already has limit and before
  const endpointQueryParams = endpoint?.queryParams || [];
  const hasEndpointLimit = endpointQueryParams.some(
    (q) => q.name?.toLowerCase() === "limit" || q.key?.toLowerCase() === "limit",
  );
  const hasEndpointBefore = endpointQueryParams.some(
    (q) => q.name?.toLowerCase() === "before" || q.key?.toLowerCase() === "before",
  );
  const hasBothPaginationQueryParams = hasEndpointLimit && hasEndpointBefore;

  // Function to add limit & before query parameters to the endpoint contract
  const handleAddPaginationQueryParams = React.useCallback(() => {
    if (!endpoint || !onEndpointChange) return;

    const currentParams = endpoint.queryParams || [];
    const newParams: Parameter[] = [...currentParams];
    let changed = false;

    if (!newParams.some((q) => q.name?.toLowerCase() === "limit" || q.key?.toLowerCase() === "limit")) {
      newParams.push({
        id: `param_limit_${Date.now()}`,
        name: "limit",
        key: "limit",
        type: "number",
        required: false,
        defaultValue: String(step.langGraphHistoryLimitDefault ?? 20),
        description: "Maximum history records to return",
      });
      changed = true;
    }

    if (!newParams.some((q) => q.name?.toLowerCase() === "before" || q.key?.toLowerCase() === "before")) {
      newParams.push({
        id: `param_before_${Date.now() + 1}`,
        name: "before",
        key: "before",
        type: "string",
        required: false,
        defaultValue: "",
        description: "Checkpoint cursor ID to page backwards",
      });
      changed = true;
    }

    if (changed) {
      onEndpointChange({ queryParams: newParams });
    }
  }, [endpoint, onEndpointChange, step.langGraphHistoryLimitDefault]);

  // Handler for cursor pagination toggle: enables pagination and auto-provisions query params
  const handleTogglePagination = (checked: boolean) => {
    onChange({
      ...step,
      langGraphHistoryPaginationEnabled: checked,
      langGraphHistoryLimitSource: step.langGraphHistoryLimitSource || "query.limit",
      langGraphHistoryLimitDefault: step.langGraphHistoryLimitDefault ?? 20,
      langGraphHistoryBeforeSource: step.langGraphHistoryBeforeSource || "query.before",
    });

    if (checked) {
      handleAddPaginationQueryParams();
    }
  };

  return (
    <div className="flex flex-col gap-3.5 p-3.5 bg-indigo-500/5 border border-indigo-500/25 rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-400" />
          <Label className="text-xs font-bold text-foreground">
            LangGraph State & Chat History
          </Label>
        </div>
        <Badge
          variant="outline"
          className="text-[9.5px] font-mono border-indigo-500/40 text-indigo-300 bg-indigo-500/10"
        >
          {step.langGraphHistoryPaginationEnabled ? "graph.getStateHistory()" : "graph.getState()"}
        </Badge>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Fetches the persisted state snapshot for a specific thread from the LangGraph checkpointer without re-running the agent or consuming LLM tokens.
      </p>

      {/* Target Thread ID Binding */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-border/30">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-foreground/90 flex items-center gap-1.5">
            <Database className="w-3 h-3 text-emerald-400" />
            Thread ID Source
          </Label>
          <span className="text-[10px] text-muted-foreground font-mono">
            configurable.thread_id
          </span>
        </div>
        <BindingSourceEditor
          binding={threadBinding}
          availableSources={availableSources}
          serviceNodeId={serviceNodeId}
          onChange={handleThreadBindingChange}
        />
        <div className="flex flex-wrap gap-1.5 mt-1">
          <span className="text-[10px] text-muted-foreground/70">Suggestions:</span>
          {["params.threadId", "params.id", "query.thread_id", "headers.x-thread-id"].map((src) => (
            <button
              key={src}
              type="button"
              className={`text-[9.5px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                currentThreadSource === src
                  ? "bg-primary/20 text-primary border-primary/40 font-semibold"
                  : "bg-secondary/40 text-muted-foreground border-border/40 hover:text-foreground"
              }`}
              onClick={() =>
                onChange({
                  ...step,
                  langGraphThreadIdSource: src,
                })
              }
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      {/* Output Format Selector */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-border/30">
        <Label className="text-[11px] font-semibold text-foreground/90 flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-indigo-400" />
          Output Response Format
        </Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            type="button"
            className={`p-2.5 rounded-lg border text-left transition-all flex flex-col gap-1 ${
              currentFormat === "chat_messages"
                ? "bg-indigo-500/15 border-indigo-500/40 text-foreground"
                : "bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() =>
              onChange({
                ...step,
                langGraphHistoryFormat: "chat_messages",
              })
            }
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">Standard Messages</span>
              {currentFormat === "chat_messages" && (
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">
              Formatted message array: <code className="text-[9px] bg-secondary/80 px-1 py-0.2 rounded font-mono">[{`{ id, role, content }`}]</code>
            </span>
          </button>

          <button
            type="button"
            className={`p-2.5 rounded-lg border text-left transition-all flex flex-col gap-1 ${
              currentFormat === "full_state"
                ? "bg-indigo-500/15 border-indigo-500/40 text-foreground"
                : "bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() =>
              onChange({
                ...step,
                langGraphHistoryFormat: "full_state",
              })
            }
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">Full Checkpoint State</span>
              {currentFormat === "full_state" && (
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">
              Entire snapshot with state channels: <code className="text-[9px] bg-secondary/80 px-1 py-0.2 rounded font-mono">{`{ values, next }`}</code>
            </span>
          </button>
        </div>
      </div>

      {/* Message Filter Options (Only relevant for chat_messages format) */}
      {currentFormat === "chat_messages" && (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 border border-border/30">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              Sanitize for Chat UI
            </span>
            <span className="text-[10px] text-muted-foreground">
              Excludes internal <code className="text-[9px] font-mono">ToolMessage</code> records, returning only User &amp; Assistant speech turns.
            </span>
          </div>
          <Switch
            checked={excludeTools}
            onCheckedChange={(checked) =>
              onChange({
                ...step,
                langGraphHistoryExcludeToolMessages: checked,
              })
            }
          />
        </div>
      )}

      {/* Checkpoint Pagination: limit & before cursor */}
      <div className="flex flex-col gap-2.5 p-3 rounded-lg bg-secondary/30 border border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
              Cursor Pagination (limit &amp; before)
            </span>
            <span className="text-[10px] text-muted-foreground">
              Uses LangGraph&apos;s <code className="text-[9px] font-mono">getStateHistory(config, &#123; limit, before &#125;)</code> for cursor-based paging.
            </span>
          </div>
          <Switch
            checked={Boolean(step.langGraphHistoryPaginationEnabled)}
            onCheckedChange={handleTogglePagination}
          />
        </div>

        {step.langGraphHistoryPaginationEnabled && (
          <div className="flex flex-col gap-2.5 pt-2 border-t border-border/30">
            {/* Endpoint sync banner/button */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Arguments Mapping
              </span>
              {hasBothPaginationQueryParams ? (
                <span className="text-[9.5px] text-emerald-400 flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3 h-3" /> ?limit=&amp;before= on endpoint
                </span>
              ) : onEndpointChange ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-5 text-[9px] px-1.5 border-amber-500/40 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                  onClick={handleAddPaginationQueryParams}
                >
                  + Add Query Params to Endpoint
                </Button>
              ) : null}
            </div>

            {/* Limit Mapping Row */}
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[130px_auto_1fr] gap-2 items-center text-xs bg-background/50 p-2 rounded-lg border border-border/40">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-[11px] truncate px-1.5 py-0.5 rounded border text-blue-300 bg-blue-500/10 border-blue-500/20">
                      limit
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">number</span>
                  </div>
                  <span className="text-[8.5px] text-muted-foreground mt-0.5 truncate">
                    Max records
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground/50 px-0.5 select-none">←</span>
                <div className="min-w-0">
                  <BindingSourceEditor
                    binding={limitBinding}
                    availableSources={availableSources}
                    serviceNodeId={serviceNodeId}
                    onChange={handleLimitBindingChange}
                  />
                </div>
              </div>

              {/* Suggestions and fallback limit */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9.5px] text-muted-foreground/70">Suggestions:</span>
                  {["query.limit", "body.limit"].map((src) => (
                    <button
                      key={src}
                      type="button"
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded border transition-colors ${
                        currentLimitSource === src
                          ? "bg-primary/20 text-primary border-primary/40 font-semibold"
                          : "bg-secondary/40 text-muted-foreground border-border/40 hover:text-foreground"
                      }`}
                      onClick={() =>
                        onChange({
                          ...step,
                          langGraphHistoryLimitSource: src,
                        })
                      }
                    >
                      {src}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[9.5px] text-muted-foreground/70">Fallback if omitted:</span>
                  <Input
                    type="number"
                    className="h-5 w-14 text-[10px] font-mono text-center px-1 py-0"
                    value={step.langGraphHistoryLimitDefault ?? 20}
                    min={1}
                    max={100}
                    onChange={(e) =>
                      onChange({
                        ...step,
                        langGraphHistoryLimitDefault: Number(e.target.value) || 20,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Before Cursor Mapping Row */}
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[130px_auto_1fr] gap-2 items-center text-xs bg-background/50 p-2 rounded-lg border border-border/40">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-[11px] truncate px-1.5 py-0.5 rounded border text-purple-300 bg-purple-500/10 border-purple-500/20">
                      before
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">string</span>
                  </div>
                  <span className="text-[8.5px] text-muted-foreground mt-0.5 truncate">
                    Cursor checkpoint ID
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground/50 px-0.5 select-none">←</span>
                <div className="min-w-0">
                  <BindingSourceEditor
                    binding={beforeBinding}
                    availableSources={availableSources}
                    serviceNodeId={serviceNodeId}
                    onChange={handleBeforeBindingChange}
                  />
                </div>
              </div>

              {/* Suggestions for before */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9.5px] text-muted-foreground/70">Suggestions:</span>
                  {["query.before", "query.cursor", "body.before"].map((src) => (
                    <button
                      key={src}
                      type="button"
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded border transition-colors ${
                        currentBeforeSource === src
                          ? "bg-primary/20 text-primary border-primary/40 font-semibold"
                          : "bg-secondary/40 text-muted-foreground border-border/40 hover:text-foreground"
                      }`}
                      onClick={() =>
                        onChange({
                          ...step,
                          langGraphHistoryBeforeSource: src,
                        })
                      }
                    >
                      {src}
                    </button>
                  ))}
                </div>

                <span className="text-[9px] text-muted-foreground/70">
                  Returns <code className="font-mono text-primary text-[9px]">next_cursor</code>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
