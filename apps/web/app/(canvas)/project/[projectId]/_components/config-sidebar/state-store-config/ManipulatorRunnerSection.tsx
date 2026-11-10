"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Sliders,
  Activity,
  Play,
  Code2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
  CornerDownRight,
  Layers,
  GitMerge,
  Database,
  Check,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { GlobalStoreField, CustomTypeItem, JsonValue } from "@workspace/canvas/types";
import {
  StateManipulator,
  StoreState,
  isManipulatorForField,
  inferSampleValueForField,
  inferSamplePatchForField,
} from "./types";

export interface ExecutionResult {
  manipulatorName: string;
  category: string;
  success: boolean;
  error?: string;
  changedKeys: string[];
  beforeState: StoreState;
  afterState: StoreState;
  timestamp: string;
}

export interface ManipulatorRunnerSectionProps {
  manipulators: StateManipulator[];
  selectedManipulator: StateManipulator | undefined;
  selectedManipulatorId: string;
  onSelectManipulator: (id: string) => void;
  payloadText: string;
  onChangePayloadText: (text: string) => void;
  manipulatorArgInfo: { label: string; placeholder: string };
  isExecuting: boolean;
  onRunManipulator: () => void;
  onQuickRunManipulator?: (manipulatorId: string) => void;
  lastExecutionResult?: ExecutionResult | null;
  fields?: GlobalStoreField[];
  sandboxState?: StoreState;
  selectedVariableTab?: string;
  onSelectVariableTab?: (tab: string) => void;
  availableCustomTypes?: CustomTypeItem[];
}

function formatValueForDisplay(val: JsonValue | undefined): string {
  if (val === undefined) return "undefined";
  if (val === null) return "null";
  if (val === "") return '""';
  if (Array.isArray(val)) {
    return `Array(${val.length}) ${JSON.stringify(val)}`;
  }
  if (typeof val === "object") {
    return JSON.stringify(val);
  }
  return String(val);
}

export const ManipulatorRunnerSection: React.FC<ManipulatorRunnerSectionProps> = ({
  manipulators,
  selectedManipulator,
  selectedManipulatorId,
  onSelectManipulator,
  payloadText,
  onChangePayloadText,
  manipulatorArgInfo,
  isExecuting,
  onRunManipulator,
  onQuickRunManipulator,
  lastExecutionResult,
  fields = [],
  sandboxState = {},
  selectedVariableTab,
  onSelectVariableTab,
  availableCustomTypes = [],
}) => {
  // Support both controlled and uncontrolled state variable tab
  const [internalVarTab, setInternalVarTab] = useState<string>("all");
  const activeVarTab = selectedVariableTab !== undefined ? selectedVariableTab : internalVarTab;

  const handleSelectVariableTab = useCallback(
    (tab: string) => {
      if (onSelectVariableTab) {
        onSelectVariableTab(tab);
      } else {
        setInternalVarTab(tab);
      }
    },
    [onSelectVariableTab],
  );

  const [categoryFilter, setCategoryFilter] = useState<
    "all" | "custom_action" | "auto_setter" | "builtin"
  >("all");
  const [showCodePreview, setShowCodePreview] = useState(false);

  // Group manipulators by variable field
  const varFieldMap = useMemo(() => {
    const map = new Map<string, StateManipulator[]>();
    fields.forEach((f) => {
      map.set(
        f.id,
        manipulators.filter((m) => isManipulatorForField(m, f)),
      );
    });
    return map;
  }, [fields, manipulators]);

  // Actions that don't belong to any specific variable (store-wide built-ins like reset, populate)
  const storeWideActions = useMemo(() => {
    if (!fields || fields.length === 0) return [];
    return manipulators.filter(
      (m) => !fields.some((f) => isManipulatorForField(m, f)),
    );
  }, [fields, manipulators]);

  // The active field object if a specific variable tab is selected
  const activeField = useMemo(
    () => fields.find((f) => f.id === activeVarTab || f.name.toLowerCase() === activeVarTab.toLowerCase()),
    [fields, activeVarTab],
  );

  // Manipulators filtered for the active state variable tab
  const manipulatorsForActiveVar = useMemo(() => {
    if (activeVarTab === "all") return manipulators;
    if (activeVarTab === "store_wide") return storeWideActions;
    if (activeField) {
      return varFieldMap.get(activeField.id) || [];
    }
    return manipulators;
  }, [activeVarTab, manipulators, storeWideActions, activeField, varFieldMap]);

  // Auto-switch selected action if current selection doesn't belong to active variable
  useEffect(() => {
    if (manipulatorsForActiveVar.length > 0) {
      const isCurrentInActive = manipulatorsForActiveVar.some((m) => m.id === selectedManipulatorId);
      if (!isCurrentInActive) {
        const first = manipulatorsForActiveVar[0]!;
        onSelectManipulator(first.id);
      }
    }
  }, [activeVarTab, manipulatorsForActiveVar, selectedManipulatorId, onSelectManipulator]);

  // Category filters within the active state variable
  const customActions = useMemo(
    () =>
      manipulatorsForActiveVar.filter(
        (m) => m.category === "custom_action" || m.category === "standard_action",
      ),
    [manipulatorsForActiveVar],
  );

  const setterActions = useMemo(
    () => manipulatorsForActiveVar.filter((m) => m.category === "auto_setter"),
    [manipulatorsForActiveVar],
  );

  const builtinActions = useMemo(
    () => manipulatorsForActiveVar.filter((m) => m.category === "builtin"),
    [manipulatorsForActiveVar],
  );

  const filteredManipulators = useMemo(() => {
    if (categoryFilter === "custom_action") return customActions;
    if (categoryFilter === "auto_setter") return setterActions;
    if (categoryFilter === "builtin") return builtinActions;
    return manipulatorsForActiveVar;
  }, [categoryFilter, customActions, setterActions, builtinActions, manipulatorsForActiveVar]);

  // Identify field metadata for smart payload presets
  const activeTargetField = useMemo(() => {
    if (activeField) return activeField;
    if (!selectedManipulator) return undefined;
    return fields.find((f) => isManipulatorForField(selectedManipulator, f));
  }, [activeField, fields, selectedManipulator]);

  const isArrayField = useMemo(() => {
    return Boolean(
      activeTargetField?.isArray ||
        activeTargetField?.type === "array" ||
        activeTargetField?.type?.endsWith("[]"),
    );
  }, [activeTargetField]);

  const isMessageField = useMemo(() => {
    const t = (activeTargetField?.type || "").toLowerCase();
    const n = (activeTargetField?.name || "").toLowerCase();
    return t.includes("message") || t.includes("chat") || n.includes("message") || n.includes("chat");
  }, [activeTargetField]);

  const isNoArgAction = useMemo(() => {
    if (!selectedManipulator) return false;
    const act = selectedManipulator.actionType || selectedManipulator.defaultManipulatorType;
    return act === "pop" || act === "reset" || act === "toggle";
  }, [selectedManipulator]);

  const handleApplyPreset = (preset: string) => {
    if (!selectedManipulator) return;

    if (preset === "default") {
      const def = selectedManipulator.defaultPayload;
      onChangePayloadText(
        def !== undefined && def !== null
          ? typeof def === "object"
            ? JSON.stringify(def, null, 2)
            : String(def)
          : "",
      );
    } else if (preset === "empty") {
      onChangePayloadText("");
    } else if (preset === "sample_stream") {
      onChangePayloadText(
        JSON.stringify(
          {
            delta: "Streaming chunk response from assistant...",
            role: "assistant",
          },
          null,
          2,
        ),
      );
    } else if (preset === "stream_done") {
      onChangePayloadText(JSON.stringify({ delta: "", done: true }, null, 2));
    } else if (preset === "sample_item") {
      if (activeTargetField) {
        const sample = inferSampleValueForField(activeTargetField, availableCustomTypes, false);
        onChangePayloadText(
          typeof sample === "object" && sample !== null
            ? JSON.stringify(sample, null, 2)
            : typeof sample === "string"
            ? `"${sample}"`
            : String(sample),
        );
      } else {
        onChangePayloadText(
          JSON.stringify(
            {
              id: "item_1",
              title: "Sample Item",
            },
            null,
            2,
          ),
        );
      }
    } else if (preset === "sample_array") {
      if (activeTargetField) {
        const single = inferSampleValueForField(activeTargetField, availableCustomTypes, false);
        onChangePayloadText(JSON.stringify([single], null, 2));
      } else {
        onChangePayloadText(
          JSON.stringify(
            [
              { id: "item_1", title: "First Item" },
              { id: "item_2", title: "Second Item" },
            ],
            null,
            2,
          ),
        );
      }
    } else if (preset === "empty_array") {
      onChangePayloadText("[]");
    } else if (preset === "sample_patch") {
      if (activeTargetField) {
        const patch = inferSamplePatchForField(activeTargetField, availableCustomTypes);
        onChangePayloadText(JSON.stringify(patch, null, 2));
      } else {
        onChangePayloadText(
          JSON.stringify(
            {
              id: "1",
              title: "Updated Title",
              modified: true,
            },
            null,
            2,
          ),
        );
      }
    } else if (preset === "remove_id") {
      onChangePayloadText(JSON.stringify({ id: isMessageField ? "msg_1" : "1" }, null, 2));
    } else if (preset === "remove_index") {
      onChangePayloadText("0");
    } else if (preset === "bool_true") {
      onChangePayloadText("true");
    } else if (preset === "bool_false") {
      onChangePayloadText("false");
    } else if (preset === "inc_1") {
      onChangePayloadText("1");
    } else if (preset === "inc_5") {
      onChangePayloadText("5");
    } else if (preset === "sample_text") {
      onChangePayloadText(`"Updated ${activeTargetField?.name || "value"}"`);
    }
  };

  const hasCustomCode = Boolean(selectedManipulator?.code && selectedManipulator.code.trim());

  return (
    <div className="p-3 rounded-lg bg-card border border-border space-y-3 shadow-xs">
      {/* Header & Global Count */}
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
          <Zap size={13} className="text-foreground" />
          <span>Execute Store Action ({manipulators.length})</span>
        </Label>

        {selectedManipulator && (
          <Badge
            variant="outline"
            className="text-[9px] uppercase px-1.5 py-0 font-mono text-muted-foreground border-border bg-muted"
          >
            {selectedManipulator.category.replace("_", " ")}
          </Badge>
        )}
      </div>

      {/* STATE VARIABLES TABS: Switch between state variables to view only their reducer actions */}
      {fields.length > 0 && (
        <div className="space-y-1.5 pb-2 border-b border-border">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers size={11} className="text-foreground" />
              <span>State Variables</span>
            </Label>
            <span className="text-[9px] text-muted-foreground font-mono">
              {activeVarTab === "all"
                ? `All ${manipulators.length} actions across ${fields.length} variables`
                : activeVarTab === "store_wide"
                ? `Store-level actions (${storeWideActions.length})`
                : `${activeField?.name}: ${manipulatorsForActiveVar.length} ${manipulatorsForActiveVar.length === 1 ? "action" : "actions"}`}
            </span>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 hide-scrollbar">
            {/* "All Variables" Tab */}
            <button
              type="button"
              onClick={() => handleSelectVariableTab("all")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-medium transition-all cursor-pointer whitespace-nowrap border select-none",
                activeVarTab === "all"
                  ? "bg-primary text-primary-foreground border-primary font-semibold shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent border-border",
              )}
            >
              <span>All</span>
              <span
                className={cn(
                  "text-[9px] px-1 py-0.2 rounded-full font-mono font-bold",
                  activeVarTab === "all"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-background text-muted-foreground",
                )}
              >
                {manipulators.length}
              </span>
            </button>

            {/* Individual Field Tabs */}
            {fields.map((f) => {
              const varActions = varFieldMap.get(f.id) || [];
              const isSelected = activeVarTab === f.id || activeVarTab.toLowerCase() === f.name.toLowerCase();
              const cleanType = (f.type || "string").replace(/\[\]$/, "").trim();
              const isArr = Boolean(f.isArray || f.type === "array" || f.type?.endsWith("[]"));
              const displayType = isArr ? `${cleanType}[]` : cleanType;

              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleSelectVariableTab(f.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-mono transition-all cursor-pointer whitespace-nowrap border select-none group",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent border-border",
                  )}
                  title={`${f.name} (${displayType}) — ${varActions.length} reducer actions`}
                >
                  <span className={cn(isSelected ? "text-primary-foreground font-bold" : "text-foreground font-semibold")}>
                    {f.name}
                  </span>
                  <span
                    className={cn(
                      "text-[8px] px-1 py-0 rounded font-normal font-mono",
                      isSelected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-background text-muted-foreground border border-border",
                    )}
                  >
                    {displayType}
                  </span>
                  <span
                    className={cn(
                      "text-[9px] px-1 py-0.2 rounded-full font-mono font-bold",
                      isSelected
                        ? "bg-primary-foreground/25 text-primary-foreground"
                        : "bg-background text-muted-foreground",
                    )}
                  >
                    {varActions.length}
                  </span>
                </button>
              );
            })}

            {/* Store-wide / Built-ins Tab */}
            {storeWideActions.length > 0 && (
              <button
                type="button"
                onClick={() => handleSelectVariableTab("store_wide")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-medium transition-all cursor-pointer whitespace-nowrap border select-none",
                  activeVarTab === "store_wide"
                    ? "bg-primary text-primary-foreground border-primary font-semibold shadow-xs"
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent border-border",
                )}
                title="Store-wide actions (reset, populate)"
              >
                <span>Store / Global</span>
                <span
                  className={cn(
                    "text-[9px] px-1 py-0.2 rounded-full font-mono font-bold",
                    activeVarTab === "store_wide"
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-muted-foreground",
                  )}
                >
                  {storeWideActions.length}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active Variable Context Card: Displays reducer info & current live value */}
      {activeField && (
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/60 border border-border text-xs">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-1.5 rounded-md bg-background text-foreground border border-border shrink-0">
              <GitMerge size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-bold text-foreground text-[12px]">{activeField.name}</span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 font-mono text-muted-foreground border-border bg-background"
                >
                  {activeField.isArray || activeField.type?.endsWith("[]") || activeField.type === "array"
                    ? `${(activeField.type || "string").replace(/\[\]$/, "")}[]`
                    : activeField.type || "string"}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Reducer: <code className="text-foreground font-semibold">{activeField.reducer || `${activeField.name}_reducer`}</code>
                </span>
              </div>
              {sandboxState && sandboxState[activeField.name] !== undefined && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground pt-1 truncate">
                  <span className="text-muted-foreground/80 font-medium">Live value:</span>
                  <code className="text-foreground bg-background px-1.5 py-0.5 rounded border border-border truncate max-w-[280px]">
                    {formatValueForDisplay(sandboxState[activeField.name])}
                  </code>
                </div>
              )}
            </div>
          </div>
          <Badge
            variant="outline"
            className="text-[9.5px] font-mono px-2 py-0.5 shrink-0 bg-background text-muted-foreground border-border"
          >
            {manipulatorsForActiveVar.length} {manipulatorsForActiveVar.length === 1 ? "action" : "actions"}
          </Badge>
        </div>
      )}

      {/* Category Filter Pills (Filters within the active state variable) */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => setCategoryFilter("all")}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer whitespace-nowrap",
            categoryFilter === "all"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "bg-muted text-muted-foreground hover:text-foreground border border-border",
          )}
        >
          All ({manipulatorsForActiveVar.length})
        </button>
        <button
          type="button"
          onClick={() => setCategoryFilter("custom_action")}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer whitespace-nowrap",
            categoryFilter === "custom_action"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "bg-muted text-muted-foreground hover:text-foreground border border-border",
          )}
        >
          Custom Actions ({customActions.length})
        </button>
        <button
          type="button"
          onClick={() => setCategoryFilter("auto_setter")}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer whitespace-nowrap",
            categoryFilter === "auto_setter"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "bg-muted text-muted-foreground hover:text-foreground border border-border",
          )}
        >
          Setters ({setterActions.length})
        </button>
        {builtinActions.length > 0 && (
          <button
            type="button"
            onClick={() => setCategoryFilter("builtin")}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer whitespace-nowrap",
              categoryFilter === "builtin"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "bg-muted text-muted-foreground hover:text-foreground border border-border",
            )}
          >
            Built-ins ({builtinActions.length})
          </button>
        )}
      </div>

      {/* Quick Action Selector / Action List for this variable */}
      <div className="space-y-1.5">
        <Select value={selectedManipulatorId} onValueChange={onSelectManipulator}>
          <SelectTrigger className="h-8 text-xs bg-background font-mono border-border">
            <SelectValue placeholder="Select state action..." />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {filteredManipulators.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                <span className="font-semibold text-foreground">{m.name}</span>
                <span className="text-[10px] text-muted-foreground ml-1.5">
                  [{m.actionType || m.category.replace("_", " ")}]
                </span>
                {m.targetFieldName && (
                  <span className="text-[9px] text-muted-foreground ml-1 font-semibold">
                    → {m.targetFieldName}
                  </span>
                )}
                {m.code && m.code.trim() && (
                  <span className="text-[9px] text-foreground font-semibold ml-1">
                    *custom
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Action Quick Chips for this variable */}
        <div className="flex flex-wrap gap-1 pt-1 max-h-28 overflow-y-auto">
          {filteredManipulators.map((m) => {
            const isSelected = m.id === selectedManipulatorId;
            return (
              <div
                key={m.id}
                onClick={() => onSelectManipulator(m.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono cursor-pointer transition-all border select-none",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary font-semibold shadow-xs"
                    : "bg-muted text-muted-foreground border-border hover:text-foreground hover:bg-accent",
                )}
              >
                <span>{m.name}</span>
                {m.actionType && (
                  <span
                    className={cn(
                      "text-[8px] uppercase px-1 py-0 rounded font-semibold",
                      isSelected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-background text-muted-foreground border border-border",
                    )}
                  >
                    {m.actionType}
                  </span>
                )}
                {onQuickRunManipulator && (
                  <button
                    type="button"
                    title={`Quick run ${m.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickRunManipulator(m.id);
                    }}
                    className={cn(
                      "p-0.5 cursor-pointer ml-0.5",
                      isSelected ? "text-primary-foreground hover:opacity-80" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Play size={9} className="fill-current" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Action Details & Payload Editor */}
      {selectedManipulator && (
        <div className="rounded-lg bg-card border border-border p-3 space-y-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-mono font-bold text-foreground">
                {selectedManipulator.name}
              </span>
              {selectedManipulator.actionType && (
                <Badge
                  variant="outline"
                  className="text-[8px] px-1 py-0 uppercase bg-muted text-foreground border-border font-semibold"
                >
                  {selectedManipulator.actionType}
                </Badge>
              )}
              {selectedManipulator.targetFieldName && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  target: <code className="text-foreground font-semibold">{selectedManipulator.targetFieldName}</code>
                </span>
              )}
            </div>

            {hasCustomCode && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCodePreview(!showCodePreview)}
                className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground gap-0.5 cursor-pointer"
              >
                <Code2 size={11} />
                <span>{showCodePreview ? "Hide Logic" : "View Logic"}</span>
                {showCodePreview ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </Button>
            )}
          </div>

          {/* Collapsible Custom Code Preview */}
          {hasCustomCode && showCodePreview && (
            <div className="p-2.5 rounded-md bg-muted border border-border font-mono text-[10px] text-foreground overflow-x-auto space-y-1">
              <div className="text-[9px] text-muted-foreground flex items-center justify-between">
                <span>
                  {selectedManipulator.targetFieldName
                    ? `Reducer Action (${activeField?.reducer || `${selectedManipulator.targetFieldName}_reducer`}):`
                    : "Custom Action Logic:"}
                </span>
                <span>{selectedManipulator.targetFieldName ? "Scope: (prev, next)" : "Scope: payload, set, get"}</span>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed">{selectedManipulator.code}</pre>
            </div>
          )}

          {/* Action Arguments / Payload Editor */}
          {isNoArgAction ? (
            <div className="p-2.5 rounded-md bg-muted/60 border border-border text-[10.5px] font-mono text-muted-foreground flex items-center gap-2">
              <CheckCircle2 size={13} className="text-foreground shrink-0" />
              <span>
                No payload arguments required. Calling <strong>{selectedManipulator.name}</strong> executes the reducer logic directly on <strong>{selectedManipulator.targetFieldName || "store"}</strong>.
              </span>
            </div>
          ) : (
            <div className="space-y-1.5 pt-1 border-t border-border">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                  <span>{manipulatorArgInfo.label}</span>
                </Label>

                {/* Smart Presets tailored to action type and variable */}
                <div className="flex items-center gap-1 flex-wrap">
                  {selectedManipulator.actionType === "stream" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("sample_stream")}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                      >
                        Sample Chunk
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("stream_done")}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                      >
                        Done Chunk
                      </button>
                    </>
                  ) : selectedManipulator.actionType === "append" || selectedManipulator.actionType === "prepend" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("sample_item")}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                      >
                        Sample Item
                      </button>
                    </>
                  ) : selectedManipulator.actionType === "set" ? (
                    isArrayField ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset("sample_array")}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                        >
                          Sample Array
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset("empty_array")}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                        >
                          Empty []
                        </button>
                      </>
                    ) : activeTargetField?.type === "boolean" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset("bool_true")}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                        >
                          true
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset("bool_false")}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                        >
                          false
                        </button>
                      </>
                    ) : activeTargetField?.type === "number" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onChangePayloadText("100")}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                        >
                          100
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangePayloadText("0")}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                        >
                          0
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("sample_item")}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                      >
                        Sample {activeTargetField?.type || "Item"}
                      </button>
                    )
                  ) : selectedManipulator.actionType === "update" ? (
                    <button
                      type="button"
                      onClick={() => handleApplyPreset("sample_patch")}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                    >
                      Patch Obj
                    </button>
                  ) : selectedManipulator.actionType === "remove" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("remove_id")}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                      >
                        ID &quot;msg_1&quot;
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("remove_index")}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                      >
                        Index 0
                      </button>
                    </>
                  ) : selectedManipulator.actionType === "increment" || selectedManipulator.actionType === "decrement" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("inc_1")}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                      >
                        1
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset("inc_5")}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                      >
                        5
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleApplyPreset("default")}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset("empty")}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground border border-border cursor-pointer font-mono"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <Textarea
                value={payloadText}
                onChange={(e) => onChangePayloadText(e.target.value)}
                placeholder={manipulatorArgInfo.placeholder}
                className="min-h-[64px] text-[11px] font-mono bg-background resize-y p-2 border border-border leading-relaxed text-foreground"
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    onRunManipulator();
                  }
                }}
              />
              <span className="text-[9px] text-muted-foreground block">
                Tip: Press <kbd className="px-1 py-0.2 rounded bg-muted text-[8px] font-mono border border-border">Ctrl+Enter</kbd> to execute
              </span>
            </div>
          )}

          {/* Run Button */}
          <Button
            type="button"
            onClick={onRunManipulator}
            disabled={isExecuting || !selectedManipulator}
            className="w-full h-8 text-xs font-semibold shadow-xs gap-1.5 cursor-pointer mt-1 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isExecuting ? (
              <Activity size={13} className="animate-spin" />
            ) : (
              <Play size={13} className="fill-current" />
            )}
            <span>Execute {selectedManipulator.name}</span>
          </Button>

          {/* Execution Result Banner */}
          {lastExecutionResult && lastExecutionResult.manipulatorName === selectedManipulator.name && (
            <div
              className={cn(
                "p-2.5 rounded-md border text-[11px] font-mono mt-2 space-y-1.5 transition-all",
                lastExecutionResult.success
                  ? "bg-card border-border text-foreground"
                  : "bg-destructive/10 border-destructive text-destructive",
              )}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5">
                  {lastExecutionResult.success ? (
                    <CheckCircle2 size={13} className="text-foreground shrink-0" />
                  ) : (
                    <AlertCircle size={13} className="text-destructive shrink-0" />
                  )}
                  <span>
                    {lastExecutionResult.success ? "Execution Succeeded" : "Execution Failed"}
                  </span>
                </span>
                <span className="text-[9px] text-muted-foreground font-normal">
                  {lastExecutionResult.timestamp}
                </span>
              </div>

              {lastExecutionResult.error ? (
                <p className="text-[10px] text-destructive break-words font-mono">
                  {lastExecutionResult.error}
                </p>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[10px]">
                    <span className="text-muted-foreground block">
                      Mutated fields:{" "}
                      {lastExecutionResult.changedKeys.length === 0 ? (
                        <span className="italic text-muted-foreground">No fields modified</span>
                      ) : (
                        lastExecutionResult.changedKeys.map((key) => (
                          <span
                            key={key}
                            className="font-bold mr-1 px-1 py-0.2 rounded bg-muted text-foreground border border-border"
                          >
                            {key}
                          </span>
                        ))
                      )}
                    </span>
                  </div>

                  {/* Target Variable Before/After State Diff */}
                  {activeTargetField && (
                    <div className="p-2 rounded bg-background border border-border space-y-1.5 text-[10px] font-mono">
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-muted-foreground shrink-0">
                          {activeTargetField.name} (before):
                        </span>
                        <code className="text-muted-foreground break-all flex-1">
                          {formatValueForDisplay(lastExecutionResult.beforeState[activeTargetField.name])}
                        </code>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-foreground shrink-0">
                          {activeTargetField.name} (after):
                        </span>
                        <code className="text-foreground font-bold break-all flex-1">
                          {formatValueForDisplay(lastExecutionResult.afterState[activeTargetField.name])}
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ManipulatorRunnerSection;
