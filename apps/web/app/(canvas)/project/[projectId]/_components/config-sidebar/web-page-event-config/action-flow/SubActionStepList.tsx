"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Layers,
} from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import type {
  FrontendActionStepDraft,
  FrontendActionStepType,
  BackendNode,
  Endpoint,
  AvailablePath,
  UIEventItem,
} from "./types";
import type { ComboboxOption } from "./ActionFlowCombobox";
import { FRONTEND_STEP_TYPE_META } from "./actionStepConstants";
import { formatStepCodePreview } from "./FrontendStepRowHeader";
import { FrontendAddStepToolbar } from "./FrontendAddStepToolbar";
import { createDefaultFrontendStep } from "./frontendStepFactory";
import { ApiCallStep } from "./ApiCallStep";
import { StoragePutStep } from "./StoragePutStep";
import { StateMutationStep } from "./StateMutationStep";
import { NavigationStep } from "./NavigationStep";
import { QueryParamsStep } from "./QueryParamsStep";
import { TransformerStep } from "./TransformerStep";
import { CustomCodeStep } from "./CustomCodeStep";
import { ConditionStep } from "./ConditionStep";
import { NotificationStep } from "./NotificationStep";
import { ResetFormStep } from "./ResetFormStep";
import { BrowserStorageStep } from "./BrowserStorageStep";

export interface SubActionStepListProps {
  steps: FrontendActionStepDraft[];
  onChange: (updatedSteps: FrontendActionStepDraft[]) => void;
  title: string;
  badgeLabel?: string;
  variantColor: "emerald" | "rose" | "indigo";
  parentOutputVariable?: string;
  allNodes?: BackendNode[];
  serviceNodes?: BackendNode[];
  endpoints?: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  isProtected?: boolean;
  incomingPaths?: AvailablePath[];
  isItemScoped?: boolean;
  itemKeyField?: string;
  itemSourceStateName?: string;
  itemPropSuggestions?: ComboboxOption[];
  emptyDescription?: string;
}

export const SubActionStepList: React.FC<SubActionStepListProps> = ({
  steps = [],
  onChange,
  title,
  badgeLabel,
  variantColor,
  parentOutputVariable = "authResult",
  allNodes = [],
  serviceNodes = [],
  endpoints = [],
  webPageNodeId,
  actionId,
  actionItem,
  isProtected,
  incomingPaths,
  isItemScoped,
  itemKeyField,
  itemSourceStateName,
  itemPropSuggestions,
  emptyDescription,
}) => {
  const [expandedIndices, setExpandedIndices] = useState<Record<number, boolean>>({});

  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleAddStep = (type: FrontendActionStepType) => {
    const nextOrder = steps.length + 1;
    let overrides: Partial<FrontendActionStepDraft> = {};

    if (variantColor === "rose") {
      if (type === "notification") {
        overrides = {
          notifyLevel: "error",
          notifyMessage: `${parentOutputVariable}?.error?.message || "Operation failed"`,
        };
      }
    } else if (variantColor === "emerald") {
      if (type === "notification") {
        overrides = {
          notifyLevel: "success",
          notifyMessage: "Operation completed successfully",
        };
      } else if (type === "navigation") {
        overrides = {
          targetRoute: "/dashboard",
        };
      }
    }

    const newStep = createDefaultFrontendStep(type, nextOrder, overrides);
    onChange([...steps, newStep]);

    // Automatically expand the newly added step
    setExpandedIndices((prev) => ({
      ...prev,
      [steps.length]: true,
    }));
  };

  const handleDeleteStep = (idx: number) => {
    const next = steps
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, order: i + 1 }));
    onChange(next);
  };

  const handleMoveUp = (idx: number) => {
    if (idx <= 0) return;
    const next = [...steps];
    const temp = next[idx]!;
    next[idx] = next[idx - 1]!;
    next[idx - 1] = temp;
    const reordered = next.map((s, i) => ({ ...s, order: i + 1 }));
    onChange(reordered);
  };

  const handleMoveDown = (idx: number) => {
    if (idx >= steps.length - 1) return;
    const next = [...steps];
    const temp = next[idx]!;
    next[idx] = next[idx + 1]!;
    next[idx + 1] = temp;
    const reordered = next.map((s, i) => ({ ...s, order: i + 1 }));
    onChange(reordered);
  };

  const handleUpdateStep = (idx: number, updated: FrontendActionStepDraft) => {
    const next = [...steps];
    next[idx] = updated;
    onChange(next);
  };

  const isEmerald = variantColor === "emerald";
  const isRose = variantColor === "rose";

  const borderColor = isEmerald
    ? "border-emerald-500/30"
    : isRose
    ? "border-rose-500/30"
    : "border-indigo-500/30";

  const headerBg = isEmerald
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : isRose
    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
    : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400";

  const Icon = isEmerald ? CheckCircle2 : isRose ? AlertCircle : Layers;

  return (
    <div className={`rounded-lg border ${borderColor} bg-card/50 overflow-hidden space-y-2 p-2.5 transition-all`}>
      {/* Sub-block Header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          <div className={`p-1 rounded ${headerBg}`}>
            <Icon size={12} />
          </div>
          <span className="text-[11px] font-semibold text-foreground">{title}</span>
          {badgeLabel && (
            <Badge
              variant="outline"
              className={`text-[9px] px-1 py-0 font-mono ${
                isEmerald
                  ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                  : isRose
                  ? "border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/5"
                  : "border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5"
              }`}
            >
              {badgeLabel}
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          {steps.length} {steps.length === 1 ? "step" : "steps"}
        </span>
      </div>

      {/* Child Steps List */}
      {steps.length === 0 ? (
        <div className="py-3 px-3 text-center rounded-md border border-dashed border-border/60 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            {emptyDescription ||
              (isEmerald
                ? "No steps configured yet. Use the toolbar below to define what happens when authentication succeeds."
                : "No steps configured yet. Use the toolbar below to define what happens when authentication fails.")}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {steps.map((childStep, i) => {
            const meta = FRONTEND_STEP_TYPE_META[childStep.type];
            const isExpanded = Boolean(expandedIndices[i]);
            const preview = formatStepCodePreview(childStep, allNodes, endpoints);

            return (
              <div
                key={childStep.id}
                className="rounded-md border border-border/60 bg-card overflow-hidden transition-all text-xs"
              >
                {/* Step Row Header */}
                <div
                  className="flex items-center justify-between px-2 py-1.5 bg-muted/25 hover:bg-muted/40 cursor-pointer select-none"
                  onClick={() => toggleExpand(i)}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                    <span className="text-[10px] font-mono text-muted-foreground/80 shrink-0">
                      #{i + 1}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{meta?.icon}</span>
                    <span className="text-[11px] font-medium text-foreground truncate shrink-0">
                      {meta?.label || childStep.type}
                    </span>
                    <span className="text-[10.5px] font-mono text-muted-foreground/80 truncate">
                      {preview}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => handleMoveUp(i)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                      title="Move up"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      disabled={i === steps.length - 1}
                      onClick={() => handleMoveDown(i)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                      title="Move down"
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpand(i)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStep(i)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete step"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Expanded Step Body */}
                {isExpanded && (
                  <div className="p-2.5 border-t border-border/40 bg-card/30 space-y-2">
                    {childStep.type === "navigation" && (
                      <NavigationStep
                        draft={childStep}
                        allNodes={allNodes}
                        allSteps={steps}
                        stepIndex={i}
                        endpoints={endpoints}
                        webPageNodeId={webPageNodeId}
                        actionId={actionId}
                        actionItem={actionItem}
                        incomingPaths={incomingPaths}
                        isItemScoped={isItemScoped}
                        itemKeyField={itemKeyField}
                        itemPropSuggestions={itemPropSuggestions}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "notification" && (
                      <NotificationStep
                        draft={childStep}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "state_mutation" && (
                      <StateMutationStep
                        draft={childStep}
                        allSteps={steps}
                        stepIndex={i}
                        allNodes={allNodes}
                        endpoints={endpoints}
                        webPageNodeId={webPageNodeId}
                        actionId={actionId}
                        actionItem={actionItem}
                        incomingPaths={incomingPaths}
                        isItemScoped={isItemScoped}
                        itemKeyField={itemKeyField}
                        itemPropSuggestions={itemPropSuggestions}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "reset_form" && (
                      <ResetFormStep
                        draft={childStep}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "browser_storage" && (
                      <BrowserStorageStep
                        draft={childStep}
                        allSteps={steps}
                        stepIndex={i}
                        allNodes={allNodes}
                        endpoints={endpoints}
                        webPageNodeId={webPageNodeId}
                        actionId={actionId}
                        actionItem={actionItem}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "api_call" && (
                      <ApiCallStep
                        draft={childStep}
                        stepIndex={i}
                        allSteps={steps}
                        allCanvasSteps={[]}
                        serviceNodes={serviceNodes}
                        allNodes={allNodes}
                        endpoints={endpoints}
                        webPageNodeId={webPageNodeId}
                        actionId={actionId}
                        actionItem={actionItem}
                        isProtected={isProtected}
                        incomingPaths={incomingPaths}
                        isItemScoped={isItemScoped}
                        itemKeyField={itemKeyField}
                        itemSourceStateName={itemSourceStateName}
                        itemPropSuggestions={itemPropSuggestions}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "storage_put" && (
                      <StoragePutStep
                        draft={childStep}
                        stepIndex={i}
                        allSteps={steps}
                        allCanvasSteps={[]}
                        allNodes={allNodes}
                        endpoints={endpoints}
                        webPageNodeId={webPageNodeId}
                        actionId={actionId}
                        actionItem={actionItem}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "transform" && (
                      <TransformerStep
                        draft={childStep}
                        allSteps={steps}
                        stepIndex={i}
                        allNodes={allNodes}
                        webPageNodeId={webPageNodeId}
                        actionId={actionId}
                        actionItem={actionItem}
                        incomingPaths={incomingPaths}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "custom_code" && (
                      <CustomCodeStep
                        draft={childStep}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "condition" && (
                      <ConditionStep
                        draft={childStep}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}

                    {childStep.type === "update_query_params" && (
                      <QueryParamsStep
                        draft={childStep}
                        allSteps={steps}
                        stepIndex={i}
                        allNodes={allNodes}
                        webPageNodeId={webPageNodeId}
                        onChange={(updated) => handleUpdateStep(i, updated)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Step Toolbar */}
      <div className="pt-1">
        <FrontendAddStepToolbar onAddStep={handleAddStep} />
      </div>
    </div>
  );
};

