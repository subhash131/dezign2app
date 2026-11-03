import React, { useEffect } from "react";
import { Bot, ChevronsUpDown, ChevronsDownUp, Trash2, Zap, Coins } from "lucide-react";
import { DEFAULT_STREAM_ENVELOPE } from "../../../constants";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { LocalInput } from "../../../../../common";
import type { AgentNodeData, LangGraphNodePipelineStep } from "@workspace/canvas";
import { LANGGRAPH_STEP_META } from "./stepTypes";
import { toCamelCase } from "./AgentPromptVariablePicker";

interface AgentPipelineHeaderProps {
  selectedAgentData: AgentNodeData;
  onUpdateAgent: (changes: Partial<AgentNodeData>) => void;
  onDeleteAgent: () => void;
  activePipelineSteps: LangGraphNodePipelineStep[];
  expandedSteps: Record<string, boolean>;
  onToggleStep: (stepId: string) => void;
  allOpen: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  isStateUpdatesOpen: boolean;
  onToggleStateUpdates: () => void;
  isStateUpdatesEnabled: boolean;
}

export function AgentPipelineHeader({
  selectedAgentData,
  onUpdateAgent,
  onDeleteAgent,
  activePipelineSteps,
  expandedSteps,
  onToggleStep,
  allOpen,
  onCollapseAll,
  onExpandAll,
  isStateUpdatesOpen,
  onToggleStateUpdates,
  isStateUpdatesEnabled,
}: AgentPipelineHeaderProps) {
  useEffect(() => {
    if (selectedAgentData.name) {
      const camel = toCamelCase(selectedAgentData.name);
      if (camel && camel !== selectedAgentData.name) {
        onUpdateAgent({ name: camel });
      }
    }
  }, [selectedAgentData.name, onUpdateAgent]);

  return (
    <div className="flex flex-col gap-2 p-3 bg-secondary/20 rounded-xl border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-500/10 border border-purple-500/30 text-purple-400 shadow-xs shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <LocalInput
                value={selectedAgentData.name || ""}
                onChange={(e) => onUpdateAgent({ name: e.target.value })}
                onBlur={(e) => {
                  const cc = toCamelCase(e.target.value);
                  if (cc && cc !== selectedAgentData.name) {
                    onUpdateAgent({ name: cc });
                  }
                }}
                placeholder="nodeName"
                className="h-6 text-xs font-bold text-foreground font-mono bg-background/40 border border-border/40 focus:border-purple-400 px-1.5 py-0 max-w-[170px] truncate rounded"
                title="Edit Node Name"
              />
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-4 border-purple-500/30 text-purple-400 font-mono shrink-0"
              >
                LangGraph Node
              </Badge>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
              {selectedAgentData.agentId || selectedAgentData.id || "agent_node"} •{" "}
              {activePipelineSteps.length} {activePipelineSteps.length === 1 ? "Step" : "Steps"} Configured
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {activePipelineSteps.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
              onClick={allOpen ? onCollapseAll : onExpandAll}
              title={allOpen ? "Collapse All Steps" : "Expand All Steps"}
            >
              {allOpen ? (
                <>
                  <ChevronsDownUp className="w-3 h-3" /> Collapse
                </>
              ) : (
                <>
                  <ChevronsUpDown className="w-3 h-3" /> Expand
                </>
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
            onClick={onDeleteAgent}
            title="Delete Agent Node"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Stepper Navigation Pills */}
      <div className="flex items-center gap-1 pt-1.5 border-t border-border/30 overflow-x-auto hide-scrollbar text-[10px] font-mono select-none">
        {activePipelineSteps.map((step, index) => {
          const meta = LANGGRAPH_STEP_META[step.type];
          const isExpanded = Boolean(expandedSteps[step.id]);
          const stepDisplayName = toCamelCase(step.label || step.name || meta?.label || step.type);
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onToggleStep(step.id)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all cursor-pointer shrink-0 ${
                isExpanded
                  ? "bg-primary/15 text-primary border border-primary/30 font-semibold"
                  : "bg-background/40 hover:bg-secondary/40 text-muted-foreground border border-border/40"
              }`}
              title={`Toggle ${stepDisplayName}`}
            >
              <span className="w-3.5 text-center font-bold">{index + 1}</span>
              <span className="truncate max-w-[90px]">{stepDisplayName}</span>
            </button>
          );
        })}
        {/* Pinned Terminal Step: State Updates */}
        <button
          type="button"
          onClick={onToggleStateUpdates}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all cursor-pointer shrink-0 border ${
            isStateUpdatesOpen
              ? "bg-amber-500/15 text-amber-300 border-amber-500/30 font-semibold"
              : "bg-background/40 hover:bg-secondary/40 text-muted-foreground border-border/40"
          }`}
          title="Toggle Pinned Terminal Return: State Updates"
        >
          <Zap className="w-2.5 h-2.5 text-amber-400" />
          <span>State Updates</span>
          <span className="text-[9px] opacity-75 font-mono">
            ({isStateUpdatesEnabled ? `${(selectedAgentData.stateUpdates || []).length}` : "off"})
          </span>
        </button>

        {/* Token Usage Toggle Pill */}
        <button
          type="button"
          onClick={() => {
            const nextVal = !(selectedAgentData.trackTokenUsage !== false && selectedAgentData.streamConfig?.envelope?.includeUsage !== false);
            onUpdateAgent({
              trackTokenUsage: nextVal,
              streamConfig: {
                ...(selectedAgentData.streamConfig || {}),
                envelope: {
                  ...DEFAULT_STREAM_ENVELOPE,
                  ...(selectedAgentData.streamConfig?.envelope || {}),
                  includeUsage: nextVal,
                },
              },
            });
          }}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-all cursor-pointer shrink-0 border ${
            selectedAgentData.trackTokenUsage !== false && selectedAgentData.streamConfig?.envelope?.includeUsage !== false
              ? "bg-amber-500/15 text-amber-300 border-amber-500/30 font-semibold"
              : "bg-background/40 hover:bg-secondary/40 text-muted-foreground border-border/40 opacity-60"
          }`}
          title="Toggle Token Usage Tracking ON/OFF (Click to disable or enable)"
        >
          <Coins className="w-2.5 h-2.5 text-amber-400" />
          <span>Usage</span>
          <span className="text-[9px] font-mono">
            ({selectedAgentData.trackTokenUsage !== false && selectedAgentData.streamConfig?.envelope?.includeUsage !== false ? "on" : "off"})
          </span>
        </button>
      </div>
    </div>
  );
}
