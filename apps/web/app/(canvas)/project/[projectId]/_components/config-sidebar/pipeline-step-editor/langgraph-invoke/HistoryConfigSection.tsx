"use client";

import React from "react";
import { History, CheckCircle2, ShieldCheck, Database, Layers, SlidersHorizontal } from "lucide-react";
import { BackendNode, Endpoint } from "@workspace/canvas/types";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
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
  onChange: (updated: PipelineStepDraft) => void;
}

export const HistoryConfigSection: React.FC<HistoryConfigSectionProps> = ({
  step,
  selectedAgentNode,
  availableSources,
  serviceNodeId,
  endpoint,
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
    const accessor = stepSourceToAccessor(updated.source);
    onChange({
      ...step,
      langGraphThreadIdSource: accessor,
    });
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
          graph.getState()
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
              Excludes internal <code className="text-[9px] font-mono">ToolMessage</code> records, returning only User & Assistant speech turns.
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
              Cursor Pagination (limit & before)
            </span>
            <span className="text-[10px] text-muted-foreground">
              Uses LangGraph's <code className="text-[9px] font-mono">getStateHistory(config, {"{ limit, before }"})</code> for cursor-based paging.
            </span>
          </div>
          <Switch
            checked={Boolean(step.langGraphHistoryPaginationEnabled)}
            onCheckedChange={(checked) =>
              onChange({
                ...step,
                langGraphHistoryPaginationEnabled: checked,
                langGraphHistoryLimitSource: step.langGraphHistoryLimitSource || "query.limit",
                langGraphHistoryLimitDefault: step.langGraphHistoryLimitDefault || 10,
                langGraphHistoryBeforeSource: step.langGraphHistoryBeforeSource || "query.before",
              })
            }
          />
        </div>

        {step.langGraphHistoryPaginationEnabled && (
          <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground font-medium">
                  Limit Source
                </Label>
                <Input
                  className="h-7 text-xs font-mono"
                  value={step.langGraphHistoryLimitSource || "query.limit"}
                  placeholder="query.limit"
                  onChange={(e) =>
                    onChange({
                      ...step,
                      langGraphHistoryLimitSource: e.target.value,
                    })
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground font-medium">
                  Default Limit (count)
                </Label>
                <Input
                  type="number"
                  className="h-7 text-xs font-mono"
                  value={step.langGraphHistoryLimitDefault ?? 10}
                  min={1}
                  max={100}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      langGraphHistoryLimitDefault: Number(e.target.value) || 10,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground font-medium">
                  Before Cursor Source (checkpoint_id)
                </Label>
                <span className="text-[9.5px] text-muted-foreground font-mono">
                  query.before
                </span>
              </div>
              <Input
                className="h-7 text-xs font-mono"
                value={step.langGraphHistoryBeforeSource || "query.before"}
                placeholder="query.before"
                onChange={(e) =>
                  onChange({
                    ...step,
                    langGraphHistoryBeforeSource: e.target.value,
                  })
                }
              />
              <span className="text-[9.5px] text-muted-foreground/70">
                Paginates backwards in time before this checkpoint. Returns <code className="text-[9px] font-mono">next_cursor</code> in response.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
