"use client";

import React, { useState } from "react";
import { Plus, Trash, Edit2, List, AlertTriangle } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { BindingSourceEditor } from "./BindingSourceEditor";
import { StepBinding, ExpectedArg, AvailableSource } from "./types";
import { isPathMatch } from "./utils";
import { isBindingSourceConfigured } from "@/lib/utils/pipelineValidation";

export interface ArgumentBindingsSectionProps {
  bindings: StepBinding[];
  expectedArgs?: ExpectedArg[];
  availableSources: AvailableSource[];
  onAddBinding: () => void;
  onUpdateBinding: (index: number, updated: StepBinding) => void;
  onRemoveBinding: (index: number) => void;
  onAutoMapArguments: () => void;
}

export const ArgumentBindingsSection = ({
  bindings,
  expectedArgs = [],
  availableSources,
  onAddBinding,
  onUpdateBinding,
  onRemoveBinding,
  onAutoMapArguments,
}: ArgumentBindingsSectionProps) => {
  const [customModeRows, setCustomModeRows] = useState<Record<number, boolean>>({});

  const handleArgSelect = (bi: number, binding: StepBinding, val: string) => {
    if (val === "__custom__") {
      setCustomModeRows((prev) => ({ ...prev, [bi]: true }));
      return;
    }

    let updated: StepBinding = { ...binding, argName: val };

    // Smart auto-fill: if source field is currently empty, try to find a matching path in available sources
    if (binding.source.kind !== "inline" && !binding.source.field) {
      const activeSource = availableSources.find((s) => {
        if (binding.source.kind === "step_output") {
          return s.kind === "step_output" && s.stepId === binding.source.stepId;
        }
        return s.kind === binding.source.kind;
      });

      const matchInActive = activeSource?.paths.find((p) => isPathMatch(p.path, val));
      if (matchInActive) {
        updated = {
          ...updated,
          source: { ...binding.source, field: matchInActive.path },
        };
      } else {
        for (const src of availableSources) {
          const match = src.paths.find((p) => isPathMatch(p.path, val));
          if (match) {
            if (src.kind === "step_output" && src.stepId) {
              updated = {
                ...updated,
                source: { kind: "step_output", stepId: src.stepId, field: match.path },
              };
            } else if (
              src.kind === "req_body" ||
              src.kind === "req_params" ||
              src.kind === "req_query" ||
              src.kind === "req_headers"
            ) {
              updated = {
                ...updated,
                source: { kind: src.kind, field: match.path },
              };
            }
            break;
          }
        }
      }
    }

    onUpdateBinding(bi, updated);
  };

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
            Argument Bindings
          </Label>
          {bindings.length > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-muted/60 text-muted-foreground">
              {bindings.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] text-primary/80 hover:text-primary transition-colors"
            onClick={onAddBinding}
          >
            <Plus size={10} />
            Add arg
          </button>
        </div>
      </div>

      {bindings.length === 0 && (
        <div className="rounded border border-dashed border-border/40 p-2.5 text-center bg-muted/10">
          <p className="text-[10px] text-muted-foreground/60">
            No arguments bound yet.
          </p>
          {expectedArgs.length > 0 ? (
            <p
              className="text-[9px] text-primary/70 mt-0.5 cursor-pointer hover:underline"
              onClick={onAutoMapArguments}
            >
              Click here to auto-map matching fields from available sources.
            </p>
          ) : (
            <p className="text-[9px] text-muted-foreground/40 mt-0.5">
              Click &quot;+ Add arg&quot; to bind function parameters.
            </p>
          )}
        </div>
      )}

      {bindings.map((binding, bi) => {
        const validExpectedArgs = expectedArgs.filter(
          (a) => Boolean(a && a.name && a.name.trim().length > 0),
        );
        const hasExpectedArgs = validExpectedArgs.length > 0;
        const isCustomMode = Boolean(customModeRows[bi]);
        const matchingExpectedArg = validExpectedArgs.find(
          (a) =>
            a.name.toLowerCase() === (binding.argName || "").trim().toLowerCase() ||
            (a.name.toLowerCase() === "payload" && (binding.argName || "").trim().toLowerCase() === "message") ||
            (a.name.toLowerCase() === "message" && (binding.argName || "").trim().toLowerCase() === "payload"),
        );
        const isCustomValue = Boolean(binding.argName?.trim()) && !matchingExpectedArg;

        const isInlineSource = binding.source.kind === "inline";

        // Highlight row red when it maps a required arg that has no configured source
        const isRequiredAndUnmapped =
          matchingExpectedArg?.required !== false &&
          !isBindingSourceConfigured(binding);

        return (
          <div
            key={bi}
            className={cn(
              "grid grid-cols-[1.1fr_auto_2.2fr_auto] gap-1.5 bg-background/60 p-1.5 rounded border",
              isInlineSource ? "items-start pt-2" : "items-center",
              isRequiredAndUnmapped
                ? "border-destructive/50 bg-destructive/5"
                : "border-border/40",
            )}
          >
            {/* Arg name (Dropdown of function input variables or custom text input) */}
            <div className="min-w-0">
              {hasExpectedArgs && !isCustomMode ? (
                <Select
                  value={matchingExpectedArg ? matchingExpectedArg.name : (binding.argName?.trim() || undefined)}
                  onValueChange={(val) => handleArgSelect(bi, binding, val)}
                >
                  <SelectTrigger className="h-7 text-xs font-mono bg-background/70 border-border/60 w-full min-w-0">
                    <SelectValue placeholder="Select arg...">
                      {binding.argName || undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Function Input Variables
                    </div>
                    {validExpectedArgs.map((arg) => {
                      const isAlreadyBound = bindings.some(
                        (b, idx) =>
                          idx !== bi &&
                          b.argName.trim().toLowerCase() === arg.name.trim().toLowerCase(),
                      );
                      return (
                        <SelectItem key={arg.name} value={arg.name} className="text-xs font-mono">
                          <div className="flex items-center justify-between w-full gap-2 pr-2">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-semibold">{arg.name}</span>
                              {isAlreadyBound && (
                                <span className="text-[8px] font-sans text-muted-foreground/60">
                                  (bound)
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] text-muted-foreground font-sans uppercase shrink-0">
                              :{arg.type}
                              {arg.required && (
                                <span className="text-amber-500 font-bold ml-0.5" title="Required">
                                  *
                                </span>
                              )}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}

                    {isCustomValue && Boolean(binding.argName?.trim()) && (
                      <SelectItem value={binding.argName.trim()} className="text-xs font-mono">
                        <div className="flex items-center justify-between w-full gap-2 pr-2">
                          <span>{binding.argName}</span>
                          <span className="text-[9px] text-muted-foreground font-sans italic shrink-0">
                            (custom)
                          </span>
                        </div>
                      </SelectItem>
                    )}

                    <SelectSeparator />
                    <SelectItem value="__custom__" className="text-xs text-muted-foreground font-sans">
                      <div className="flex items-center gap-1.5">
                        <Edit2 size={10} />
                        <span>Custom variable name...</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-1 min-w-0">
                  <Input
                    className="h-7 text-xs font-mono bg-background/70 border-border/60 flex-1 min-w-0"
                    value={binding.argName}
                    onChange={(e) =>
                      onUpdateBinding(bi, { ...binding, argName: e.target.value })
                    }
                    placeholder="argName"
                    autoFocus={isCustomMode}
                  />
                  {hasExpectedArgs && (
                    <button
                      type="button"
                      className="h-7 w-7 p-0 flex items-center justify-center rounded border border-border/50 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
                      onClick={() =>
                        setCustomModeRows((prev) => ({ ...prev, [bi]: false }))
                      }
                      title="Switch to function variables dropdown"
                    >
                      <List size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Arrow */}
            <span className="text-[10px] text-muted-foreground/50 px-0.5 select-none">←</span>

            {/* Source & Smart Path Editor */}
            <div className="min-w-0">
              <BindingSourceEditor
                binding={binding}
                availableSources={availableSources}
                onChange={(updated) => onUpdateBinding(bi, updated)}
              />
              {isRequiredAndUnmapped && (
                <span className="flex items-center gap-0.5 mt-0.5 text-[9px] text-destructive font-medium">
                  <AlertTriangle size={9} />
                  Not mapped
                </span>
              )}
            </div>

            {/* Delete */}
            <button
              type="button"
              className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10"
              onClick={() => {
                setCustomModeRows((prev) => {
                  const copy = { ...prev };
                  delete copy[bi];
                  return copy;
                });
                onRemoveBinding(bi);
              }}
              title="Remove argument"
            >
              <Trash size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
