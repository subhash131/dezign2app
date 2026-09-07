"use client";

import React from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Trash,
  AlertTriangle,
} from "lucide-react";
import { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { PipelineStepDraft } from "./types";
import { StepTypeMeta, formatConditionSummary } from "./utils";

export interface StepRowHeaderProps {
  step: PipelineStepDraft;
  index: number;
  meta: StepTypeMeta;
  displayVarName: string;
  isUnconfigured: boolean;
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  onToggleExpand: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onChange?: (updated: PipelineStepDraft) => void;
}

export const StepRowHeader = ({
  step,
  index,
  meta,
  displayVarName,
  isUnconfigured,
  expanded,
  isFirst,
  isLast,
  dragHandleProps,
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onDelete,
}: StepRowHeaderProps) => {
  return (
    <div
      className="flex flex-col gap-0.5 px-2.5 py-1.5 cursor-pointer select-none"
      onClick={onToggleExpand}
    >
      {/* Top Line: Grip, Index, Type Badge, Summary/Code Preview, Actions, Chevron */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div
          {...dragHandleProps}
          className="text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted/40"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={13} className="shrink-0" />
        </div>
        <span className="text-[11px] text-muted-foreground/60 w-3.5 shrink-0 font-mono">
          {index + 1}
        </span>
        <span
          className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${meta.color}`}
        >
          {meta.icon}
          {meta.label}
        </span>

        {/* Variable assignment / Control flow summary view */}
        <span className="text-xs font-mono font-medium text-foreground/90 flex-1 truncate flex items-center gap-1.5 min-w-0">
          {step.type === "condition" ? (
            <span className="text-amber-300 font-semibold truncate">
              if ({formatConditionSummary(step.conditionExpr)}) &#123; then:{" "}
              {step.thenSteps?.length || 0}, else: {step.elseSteps?.length || 0} &#125;
            </span>
          ) : step.type === "try_catch" ? (
            <span className="text-rose-300 font-semibold truncate">
              try &#123; {step.trySteps?.length || 0} &#125; catch &#123;{" "}
              {step.catchSteps?.length || 0} &#125;
            </span>
          ) : step.type === "switch" ? (
            <span className="text-indigo-300 font-semibold truncate">
              switch ({step.switchCases?.length || 0} cases)
            </span>
          ) : step.type === "parallel" ? (
            <span className="text-sky-300 font-semibold truncate">
              parallel ({step.parallelBranches?.length || 0} branches)
            </span>
          ) : step.type === "loop" ? (
            <span className="text-teal-300 font-semibold truncate">
              {step.loopKind === "for"
                ? `for (${step.iteratorVariable || "i"} = ${step.loopForStart ?? 0}; ${step.iteratorVariable || "i"} < ${step.loopForEnd ?? 10}; ${step.iteratorVariable || "i"} += ${step.loopForStep ?? 1})`
                : step.loopKind === "while"
                ? `while (condition) { ${step.loopBody?.length || 0} steps }`
                : step.loopKind === "do_while"
                ? `do { ${step.loopBody?.length || 0} steps } while (condition)`
                : step.loopSource && "field" in step.loopSource && step.loopSource.field
                ? `for (const ${step.iteratorVariable || "item"} of ${step.loopSource.field})`
                : `for (const ${step.iteratorVariable || "item"} of items)`}
            </span>
          ) : step.type === "early_return" ? (
            <span className="text-orange-300 font-semibold truncate">
              return res.status({step.statusCode || 200})
            </span>
          ) : (
            <>
              <span className="text-muted-foreground/45 font-normal select-none">const</span>
              <span className="text-primary/95 font-semibold">{displayVarName}</span>
              <span className="text-muted-foreground/35 font-normal select-none">=</span>
              {step.functionRef?.name && (
                <span className="text-[11px] text-muted-foreground/75 font-mono truncate max-w-[150px]">
                  {step.functionRef.name}(...)
                </span>
              )}
              {step.type === "custom_code" && (
                <span className="text-[11px] text-muted-foreground/50 font-mono italic truncate max-w-[120px]">
                  {`{ /* code */ }`}
                </span>
              )}
            </>
          )}

          {/* runIf Guard Badge */}
          {step.runIf && (
            <span className="text-[9px] font-sans font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 ml-1">
              ⚡ if
            </span>
          )}
        </span>

        {/* Unconfigured Warning Badge */}
        {isUnconfigured && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-1 shrink-0">
            <AlertTriangle size={10} />
            Unconfigured
          </span>
        )}

        <div
          className="flex items-center gap-0.5 ml-1"
          onClick={(e) => e.stopPropagation()}
        >
          {!isFirst && (
            <button
              type="button"
              className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded hover:bg-muted/40"
              onClick={onMoveUp}
              title="Move step up"
            >
              <ArrowUp size={11} />
            </button>
          )}
          {!isLast && (
            <button
              type="button"
              className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded hover:bg-muted/40"
              onClick={onMoveDown}
              title="Move step down"
            >
              <ArrowDown size={11} />
            </button>
          )}
          <button
            type="button"
            className="text-destructive/50 hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10"
            onClick={onDelete}
            title="Delete step"
          >
            <Trash size={11} />
          </button>
        </div>
        {expanded ? (
          <ChevronDown size={12} className="text-muted-foreground/50 shrink-0" />
        ) : (
          <ChevronRight size={12} className="text-muted-foreground/50 shrink-0" />
        )}
      </div>

      {/* Second Line: Description (read-only, no events) */}
      {step.description?.trim() ? (
        <div className="flex items-center ml-7 mr-6 -mt-0.5 mb-0.5 pointer-events-none min-h-[18px]">
          <span className="text-[11px] font-sans leading-relaxed text-muted-foreground/75 line-clamp-2">
            {step.description}
          </span>
        </div>
      ) : null}
    </div>
  );
};
