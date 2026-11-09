"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Layers,
  Plus,
  Trash2,
  AlertCircle,
  Type,
  GitMerge,
  ChevronDown,
  ChevronRight,
  Code2,
  RotateCcw,
  Sparkles,
  Braces,
  Play,
  Zap,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Expand,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  GlobalStoreField,
  GlobalStoreAction,
  JsonValue,
  CustomTypeItem,
  StateRenderComponent,
  StoreActionType,
} from "@workspace/canvas/types";
import { isTypesNode } from "@workspace/canvas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { TwoStepTypeSelector } from "../../shared/TwoStepTypeSelector";
import { TypeCombobox } from "../TypeCombobox";
import { LocalInput, LocalTextarea } from "../../backend-nodes/graph-nodes/shared";
import { cn } from "@workspace/ui/lib/utils";
import {
  getSuggestedReducerCodeForChannelType,
  extractActionsFromReducerCode,
  generateSchemaAwareReducerCode,
  REDUCER_CODE_PRESETS,
} from "../../backend-nodes/graph-nodes/langgraph/langgraph-canvas/components/inspector/state-inspector/constants";
import { getSupportedActionsForType } from "../../backend-nodes/graph-nodes/nodes/frontend/StateStoreNode";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

export const STRING_REDUCER_PRESETS = {
  standard: `(prev, next) => {
  const current = typeof prev === "string" ? prev : "";
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;

  // 1. Default update: set / replace
  if (!action || action === "" || action === "default" || action === "set") {
    const raw = typeof next === "object" && next !== null && "value" in next ? next.value : next;
    return raw !== undefined ? String(raw) : current;
  }

  // 2. Action: append - appends incoming string
  if (action === "append") {
    const raw = next?.value !== undefined ? next.value : next;
    return current + (raw !== undefined ? String(raw) : "");
  }

  // 3. Action: prepend - prepends incoming string
  if (action === "prepend") {
    const raw = next?.value !== undefined ? next.value : next;
    return (raw !== undefined ? String(raw) : "") + current;
  }

  // 4. Action: reset / clear
  if (action === "reset" || action === "clear") {
    return "";
  }

  return current;
}`,
  replace: `(prev, next) => {
  const raw = typeof next === "object" && next !== null && "value" in next ? next.value : next;
  return raw !== undefined ? String(raw) : (prev ?? "");
}`,
};

export const BOOLEAN_REDUCER_PRESETS = {
  standard: `(prev, next) => {
  const current = typeof prev === "boolean" ? prev : false;
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;

  // 1. Action: toggle
  if (action === "toggle") {
    return !current;
  }

  // 2. Action: reset
  if (action === "reset") {
    return false;
  }

  // 3. Default: set / replace
  const raw = typeof next === "object" && next !== null && "value" in next ? next.value : next;
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return Boolean(raw);
}`,
  replace: `(prev, next) => {
  const raw = typeof next === "object" && next !== null && "value" in next ? next.value : next;
  return Boolean(raw);
}`,
};

export const NUMBER_REDUCER_PRESETS = {
  standard: REDUCER_CODE_PRESETS.number,
  sum: `(prev, next) => {
  const current = typeof prev === "number" && !Number.isNaN(prev) ? prev : 0;
  const action = next?.action;
  const raw = next !== null && typeof next === "object" && "value" in next ? next.value : next;
  const num = Number(raw);
  const isValid = !Number.isNaN(num) && raw !== undefined && raw !== null;

  if (!action || action === "" || action === "default" || action === "add") {
    return current + (isValid ? num : 0);
  }
  if (action === "replace" || action === "set") {
    return isValid ? num : current;
  }
  if (action === "reset" || action === "clear") {
    return 0;
  }
  return current;
}`,
  replace: `(prev, next) => {
  const raw = next !== null && typeof next === "object" && "value" in next ? next.value : next;
  const num = Number(raw);
  return !Number.isNaN(num) && raw !== undefined ? num : (prev ?? 0);
}`,
};

export const ARRAY_REDUCER_PRESETS = {
  standard: REDUCER_CODE_PRESETS.array,
  appendOnly: `(prev, next) => {
  const prevArr = Array.isArray(prev) ? prev : [];
  const incoming = next?.value !== undefined ? next.value : next;
  return [...prevArr, ...(Array.isArray(incoming) ? incoming : (incoming != null ? [incoming] : []))];
}`,
  replace: `(prev, next) => {
  const raw = next?.value !== undefined ? next.value : next;
  return Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
}`,
};

export interface StoreFieldsSectionProps {
  fields: GlobalStoreField[];
  actions?: GlobalStoreAction[];
  onAddField: () => void;
  onUpdateField: (fieldId: string, patch: Partial<GlobalStoreField>) => void;
  onRemoveField: (fieldId: string) => void;
  onSelectFieldAction?: (fieldId: string, actionType: StoreActionType | "none", actionId?: string) => void;
  onOpenTestForField?: (field: GlobalStoreField) => void;
}

interface StoreVariableCardProps {
  field: GlobalStoreField;
  index: number;
  isDuplicate?: boolean;
  availableCustomTypes: CustomTypeItem[];
  allNodes?: ReturnType<typeof useBackendCanvasStore.getState>["nodes"];
  onUpdateField: (fieldId: string, patch: Partial<GlobalStoreField>) => void;
  onRemoveField: (fieldId: string) => void;
  onOpenTestForField?: (field: GlobalStoreField) => void;
}

const StoreVariableCard = React.memo(function StoreVariableCard({
  field,
  index,
  isDuplicate = false,
  availableCustomTypes,
  allNodes,
  onUpdateField,
  onRemoveField,
  onOpenTestForField,
}: StoreVariableCardProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [showCodeEditor, setShowCodeEditor] = useState<boolean>(true);
  const [isTallEditor, setIsTallEditor] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const isArray = Boolean(field.isArray || field.type?.endsWith("[]"));
  const baseType = (field.type || "string").replace(/\[\]$/, "").trim();
  const matchedCustomType = useMemo(
    () => availableCustomTypes.find((t) => t.name === baseType),
    [availableCustomTypes, baseType],
  );

  const reducerName = field.reducer || `${field.name || "state"}_reducer`;

  // Compute recommended code for this field type & schema
  const recommendedCode = useMemo(() => {
    return getSuggestedReducerCodeForChannelType(baseType, matchedCustomType);
  }, [baseType, matchedCustomType]);

  const currentCode = field.customReducerCode || recommendedCode;

  const lineCount = useMemo(
    () => (currentCode ? currentCode.split("\n").length : 0),
    [currentCode],
  );

  const handleCopyCode = useCallback(() => {
    if (!currentCode) return;
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [currentCode]);

  // Auto-detect action types from reducer code + type defaults
  const detectedActions = useMemo(() => {
    const fromCode = extractActionsFromReducerCode(currentCode);
    const standard = getSupportedActionsForType(field.type, isArray);
    const set = new Set([...standard, ...fromCode]);
    return Array.from(set);
  }, [currentCode, field.type, isArray]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextName = e.target.value;
      const patch: Partial<GlobalStoreField> = { name: nextName };
      if (!field.reducer || field.reducer === `${field.name}_reducer` || field.reducer.endsWith("_reducer")) {
        patch.reducer = `${nextName.trim() || "state"}_reducer`;
      }
      onUpdateField(field.id, patch);
    },
    [field.id, field.name, field.reducer, onUpdateField],
  );

  const handleTypeChange = useCallback(
    (selectedBase: string) => {
      const cleanBase = selectedBase.replace(/\[\]$/, "").trim();
      const newType = isArray ? `${cleanBase}[]` : cleanBase;
      const customMatch = availableCustomTypes.find((t) => t.name === cleanBase);
      const newActions = getSupportedActionsForType(newType, isArray);
      const newSuggestedCode = getSuggestedReducerCodeForChannelType(cleanBase, customMatch);

      const patch: Partial<GlobalStoreField> = {
        type: newType,
        isArray,
        actions: newActions,
        customReducerCode: newSuggestedCode,
      };

      if (customMatch && !isArray && (field.defaultValue === "" || field.defaultValue === undefined)) {
        patch.defaultValue = null;
      }

      onUpdateField(field.id, patch);
    },
    [field.id, field.defaultValue, isArray, availableCustomTypes, onUpdateField],
  );

  const handleToggleArray = useCallback(() => {
    if (isArray) {
      const newActions = getSupportedActionsForType(baseType, false);
      onUpdateField(field.id, {
        type: baseType,
        isArray: false,
        defaultValue: undefined,
        actions: newActions,
      });
    } else {
      const newType = `${baseType}[]`;
      const newActions = getSupportedActionsForType(newType, true);
      onUpdateField(field.id, {
        type: newType,
        isArray: true,
        defaultValue: [],
        actions: newActions,
      });
    }
  }, [field.id, isArray, baseType, onUpdateField]);

  const defaultString = useMemo(() => {
    if (field.defaultValue === undefined || field.defaultValue === null) {
      return "";
    }
    if (typeof field.defaultValue === "object") {
      try {
        return JSON.stringify(field.defaultValue);
      } catch {
        return String(field.defaultValue);
      }
    }
    return String(field.defaultValue);
  }, [field.defaultValue]);

  const initialPlaceholder = useMemo(() => {
    if (isArray) return "[]";
    switch (baseType) {
      case "number":
        return "0";
      case "boolean":
        return "false";
      case "array":
        return "[]";
      case "object":
        return matchedCustomType ? `{/* ${matchedCustomType.name} */}` : "{}";
      case "string":
      default:
        return "e.g., <blank>, draft, user_123";
    }
  }, [isArray, baseType, matchedCustomType]);

  const handleDefaultChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (baseType === "string" && !isArray) {
        let parsedStr = raw;
        if (
          (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
          (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
        ) {
          parsedStr = raw.slice(1, -1);
        }
        if (raw.trim() === "" || parsedStr.trim() === "" || parsedStr === '""' || parsedStr === "''") {
          onUpdateField(field.id, { defaultValue: "" });
          return;
        }
        onUpdateField(field.id, { defaultValue: parsedStr });
        return;
      }

      let val: JsonValue | undefined = raw;
      if (raw === "") {
        val = undefined;
      } else if (isArray || baseType === "object" || matchedCustomType) {
        try {
          val = JSON.parse(raw);
        } catch {
          val = raw;
        }
      } else if (baseType === "number") {
        if (raw.trim() === "" || raw === "-") {
          val = undefined;
        } else {
          const num = Number(raw);
          val = isNaN(num) ? raw : num;
        }
      } else if (baseType === "boolean") {
        const lower = raw.trim().toLowerCase();
        if (lower === "true") val = true;
        else if (lower === "false") val = false;
        else val = raw;
      }
      onUpdateField(field.id, { defaultValue: val });
    },
    [field.id, isArray, baseType, matchedCustomType, onUpdateField],
  );

  const handleApplyPreset = useCallback(
    (code: string) => {
      const extracted = extractActionsFromReducerCode(code);
      const standard = getSupportedActionsForType(field.type, isArray);
      const mergedActions = Array.from(new Set([...standard, ...extracted]));
      onUpdateField(field.id, {
        customReducerCode: code,
        actions: mergedActions,
      });
    },
    [field.id, field.type, isArray, onUpdateField],
  );

  const handleCodeChange = useCallback(
    (newCode: string) => {
      const extracted = extractActionsFromReducerCode(newCode);
      const standard = getSupportedActionsForType(field.type, isArray);
      const mergedActions = Array.from(new Set([...standard, ...extracted]));
      onUpdateField(field.id, {
        customReducerCode: newCode,
        actions: mergedActions,
      });
    },
    [field.id, field.type, isArray, onUpdateField],
  );

  const handleResetToSuggested = useCallback(() => {
    onUpdateField(field.id, {
      customReducerCode: recommendedCode,
      actions: getSupportedActionsForType(field.type, isArray),
    });
  }, [field.id, field.type, isArray, recommendedCode, onUpdateField]);

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/70 shadow-xs overflow-hidden transition-all text-xs backdrop-blur-sm",
        isDuplicate
          ? "border-destructive/60 bg-destructive/5"
          : "border-border/70 hover:border-indigo-500/40",
      )}
    >
      {/* ── State Var Header: Index, Key & Fast Actions (LangGraph StateChannelItem style) ── */}
      <div className="flex items-center justify-between p-3 pb-2 gap-2 bg-muted/20 border-b border-border/40">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-mono font-medium">
              State Variable #{index + 1}
            </span>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 h-4 border-indigo-500/40 bg-indigo-500/10 text-indigo-400 font-mono font-semibold flex items-center gap-1"
                title={`1 Reducer: ${reducerName} (${detectedActions.length} actions)`}
              >
                <GitMerge size={9} />
                <span>{reducerName}</span>
              </Badge>
              <Badge
                variant="secondary"
                className="text-[8.5px] px-1.5 py-0 h-4 font-mono text-muted-foreground"
              >
                {detectedActions.length} actions
              </Badge>
            </div>
          </div>
          <LocalInput
            value={field.name}
            onChange={handleNameChange}
            placeholder="e.g. cartItems, user_query, counter"
            debounceMs={150}
            className={cn(
              "h-7 text-xs font-mono font-medium bg-background",
              isDuplicate && "border-destructive text-destructive focus-visible:ring-destructive",
            )}
          />
        </div>

        <div className="self-end pb-0.5 flex items-center gap-1 shrink-0">
          {onOpenTestForField && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 shrink-0 cursor-pointer"
              onClick={() => onOpenTestForField(field)}
              title={`Test ${field.name} in Live Test Area`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemoveField(field.id)}
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer"
            title="Delete state variable"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {isDuplicate && (
        <div className="flex items-center gap-1.5 px-3 py-1 bg-destructive/15 text-destructive text-[10px] font-medium font-sans border-b border-destructive/20">
          <AlertCircle size={11} className="shrink-0" />
          <span>Duplicate variable name &quot;{field.name}&quot;. Variable names must be unique.</span>
        </div>
      )}

      {/* ── Variable Properties Row: Type, Array, Optional, Initial Value, UI Component ── */}
      <div className="p-3 space-y-2.5 bg-background/40">
        <div className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-start gap-1 flex-1 min-w-[130px]">
            <Label className="text-[10px] text-muted-foreground font-mono shrink-0 pt-1.5">
              Type
            </Label>
            <TwoStepTypeSelector
              value={baseType}
              onValueChange={handleTypeChange}
              allNodes={allNodes}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title={isArray ? "Array type active (click to make single)" : "Single value (click to make array [])"}
              className={cn(
                "h-7 px-2 font-mono text-xs font-bold shrink-0 rounded-md transition-all cursor-pointer mt-0",
                isArray
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs hover:bg-cyan-500/30"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/40",
              )}
              onClick={handleToggleArray}
            >
              []
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title={field.required === false ? "Optional (?) active" : "Required — click to make optional (?)"}
              className={cn(
                "h-7 px-2 font-mono text-xs font-bold shrink-0 rounded-md transition-all cursor-pointer",
                field.required === false
                  ? "bg-amber-500/20 text-amber-500 border border-amber-500/40 shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/40",
              )}
              onClick={() => onUpdateField(field.id, { required: field.required === false ? true : false })}
            >
              ?
            </Button>
          </div>

          {/* Initial Value */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[130px]">
            <Label className="text-[10px] text-muted-foreground font-mono shrink-0">
              Initial
            </Label>
            <LocalInput
              value={defaultString}
              onChange={handleDefaultChange}
              debounceMs={150}
              placeholder={initialPlaceholder}
              className="h-7 text-xs font-mono bg-background flex-1"
            />
          </div>
        </div>

        {/* UI Render Binding Component Selector */}
        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-border/30 text-[11px]">
          <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
            <Type size={11} className="text-indigo-400" />
            <span>UI Render Binding:</span>
          </span>
          <Select
            value={field.suggestedComponent || (baseType === "boolean" ? "switch" : baseType === "number" || baseType === "string" ? "input" : "badge")}
            onValueChange={(val: string) => {
              if (
                val === "input" ||
                val === "badge" ||
                val === "button" ||
                val === "switch" ||
                val === "card" ||
                val === "progress"
              ) {
                onUpdateField(field.id, { suggestedComponent: val });
              }
            }}
          >
            <SelectTrigger className="h-6 text-[10px] font-mono bg-background/60 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="input" className="text-xs">Input (Two-way sync)</SelectItem>
              <SelectItem value="badge" className="text-xs">Badge (Display tag)</SelectItem>
              <SelectItem value="button" className="text-xs">Button (Clickable state)</SelectItem>
              <SelectItem value="switch" className="text-xs">Switch (Toggle boolean)</SelectItem>
              <SelectItem value="card" className="text-xs">Card (Metric card)</SelectItem>
              <SelectItem value="progress" className="text-xs">Progress (Progress bar)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Collapsible 1 Reducer Function & Action Dispatchers (ChannelReducerConfig style) ── */}
        <div className="flex flex-col gap-2 pt-2 border-t border-indigo-500/20">
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="flex items-center gap-1.5 text-left transition-colors cursor-pointer group py-0.5"
            >
              <Code2 className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-foreground group-hover:text-primary transition-colors font-mono">
                Reducer Function
              </span>
              <Badge
                variant="outline"
                className="text-[8px] h-3.5 px-1 py-0 uppercase font-mono text-indigo-400 border-indigo-500/40"
              >
                (prev, next) =&gt; newState
              </Badge>
            </button>

            <div className="flex items-center gap-2">
              {onOpenTestForField && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-5 text-[9px] px-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30 gap-1 font-medium cursor-pointer"
                  onClick={() => onOpenTestForField(field)}
                  title="Test reducer in the Live Test Area"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Test Reducer</span>
                </Button>
              )}

              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5"
              >
                <span>{isExpanded ? "Collapse" : "Expand"}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {isExpanded && (
            <div className="animate-in fade-in-50 slide-in-from-top-1 duration-150 pt-1 space-y-2">
              {/* Presets Action Pills (Like LangGraph ChannelReducerConfig) */}
              <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span className="flex items-center gap-1">
                    <Sparkles size={11} className="text-amber-400" />
                    <span>Action Presets for {field.type}:</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[9px] text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={handleResetToSuggested}
                    title="Reset to recommended template"
                  >
                    <RotateCcw size={9} className="mr-1 text-indigo-400" />
                    <span>Reset</span>
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5 items-center">
                  {baseType === "string" && !isArray && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(STRING_REDUCER_PRESETS.standard)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                        title="Supports actions: set, append, prepend, reset"
                      >
                        ⚡ Actions (set/append/prepend/reset)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(STRING_REDUCER_PRESETS.replace)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                        title="Simple last-value-wins replacement"
                      >
                        ⚡ Replace Only
                      </button>
                    </>
                  )}

                  {baseType === "number" && !isArray && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(NUMBER_REDUCER_PRESETS.standard)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                        title="Supports actions: set, increment, decrement, reset"
                      >
                        ⚡ Actions (inc/dec/set/reset)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(NUMBER_REDUCER_PRESETS.sum)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                        title="Sum incoming values"
                      >
                        ⚡ Sum (delta)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(NUMBER_REDUCER_PRESETS.replace)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                        title="Direct replacement"
                      >
                        ⚡ Replace Only
                      </button>
                    </>
                  )}

                  {baseType === "boolean" && !isArray && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(BOOLEAN_REDUCER_PRESETS.standard)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                        title="Supports actions: set, toggle, reset"
                      >
                        ⚡ Actions (set/toggle/reset)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(BOOLEAN_REDUCER_PRESETS.replace)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                      >
                        ⚡ Replace Only
                      </button>
                    </>
                  )}

                  {isArray && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(ARRAY_REDUCER_PRESETS.standard)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                        title="Supports actions: set, append, pop, remove, reset"
                      >
                        ⚡ Actions (set/append/pop/remove/reset)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(ARRAY_REDUCER_PRESETS.appendOnly)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                        title="Append incoming items"
                      >
                        ⚡ Append Only
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(ARRAY_REDUCER_PRESETS.replace)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                      >
                        ⚡ Replace Only
                      </button>
                    </>
                  )}

                  {!isArray && (baseType === "object" || matchedCustomType) && (
                    <>
                      {matchedCustomType ? (
                        <button
                          type="button"
                          onClick={() => handleApplyPreset(generateSchemaAwareReducerCode(matchedCustomType))}
                          className="text-[8.5px] px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-mono transition-colors cursor-pointer border border-cyan-500/40 font-semibold flex items-center gap-1"
                          title={`Type-safe reducer generated from ${matchedCustomType.name} schema`}
                        >
                          <Braces size={9} />
                          <span>⚡ Type-Safe ({matchedCustomType.name})</span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(REDUCER_CODE_PRESETS.object)}
                        className="text-[8.5px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                        title="Generic dictionary merge with reset and replace support"
                      >
                        ⚡ Generic Merge ({baseType})
                      </button>
                    </>
                  )}
                </div>

                {/* Dispatches to {N} Actions Badges */}
                <div className="pt-1.5 border-t border-indigo-500/20 space-y-1">
                  <div className="text-[9.5px] text-muted-foreground font-mono flex items-center justify-between">
                    <span>Dispatches to {detectedActions.length} actions:</span>
                    <span className="text-[8.5px] text-indigo-400 font-semibold">1 Reducer Architecture</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {detectedActions.map((act) => (
                      <Badge
                        key={act}
                        variant="outline"
                        className="text-[9px] px-1.5 py-0.5 h-4.5 border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-mono font-medium"
                      >
                        {act}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Code Editor */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between px-0.5 text-[10px] text-muted-foreground font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground/85 flex items-center gap-1">
                      <Code2 size={12} className="text-indigo-400" />
                      <span>Reducer Implementation</span>
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[8.5px] px-1.5 py-0 h-4 border-border/60 text-muted-foreground font-mono"
                    >
                      {lineCount} lines
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyCode}
                      className="h-5 px-1.5 text-[9px] text-muted-foreground hover:text-foreground cursor-pointer gap-1"
                      title="Copy reducer code to clipboard"
                    >
                      {copied ? (
                        <>
                          <Check size={10} className="text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={10} />
                          <span>Copy</span>
                        </>
                      )}
                    </Button>
                    <div className="h-3 w-px bg-border/50 mx-0.5" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsTallEditor((prev) => !prev)}
                      className={cn(
                        "h-5 px-1.5 text-[9px] cursor-pointer gap-1 transition-colors",
                        isTallEditor
                          ? "bg-indigo-500/20 text-indigo-300 font-semibold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      title={
                        isTallEditor
                          ? "Switch to standard height (340px)"
                          : "Expand height (520px)"
                      }
                    >
                      {isTallEditor ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
                      <span>{isTallEditor ? "Compact" : "Expand"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsDialogOpen(true)}
                      className="h-5 px-1.5 text-[9px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 cursor-pointer gap-1 font-medium"
                      title="Open in full modal editor"
                    >
                      <Expand size={10} />
                      <span>Modal</span>
                    </Button>
                  </div>
                </div>

                <LocalTextarea
                  value={currentCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  debounceMs={200}
                  className={cn(
                    "font-mono text-xl bg-zinc-950/90 border-border/80 leading-relaxed text-zinc-100 resize-y w-full rounded-md p-3 focus-visible:ring-indigo-500/40 focus-visible:border-indigo-500/60 transition-all shadow-inner",
                    isTallEditor ? "min-h-[460px] h-[520px]" : "min-h-[280px] h-[340px]",
                  )}
                  placeholder="(prev, next) => next"
                  spellCheck={false}
                />

                <div className="text-[9.5px] font-mono text-muted-foreground/75 flex items-center justify-between px-0.5 pt-0.5">
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground/60">Signature:</span>
                    <code className="text-indigo-300 font-semibold">(prev, next) =&gt; newState</code>
                  </span>
                  <span>Dispatch <code>&#123; action, value &#125;</code> or direct values</span>
                </div>
              </div>

              {/* Fullscreen / Modal Reducer Editor Dialog */}
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-[70vw] sm:max-w-5xl lg:max-w-[70vw] w-[94vw] h-[86vh] flex flex-col p-0 gap-0 overflow-hidden font-sans border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl">
                  <DialogHeader className="p-4 pb-3 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between shrink-0">
                    <div>
                      <DialogTitle className="text-base font-bold font-mono flex items-center gap-2 text-foreground">
                        <Code2 className="w-4 h-4 text-indigo-400" />
                        <span>Reducer Function: {reducerName}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono text-indigo-400 border-indigo-500/40 bg-indigo-500/10"
                        >
                          {field.type}
                        </Badge>
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5 font-mono">
                        Target State Variable: <span className="text-foreground font-semibold font-mono">{field.name}</span> • Dispatches to {detectedActions.length} actions
                      </DialogDescription>
                    </div>
                  </DialogHeader>

                  <div className="flex-1 p-4 flex flex-col gap-3 min-h-0 bg-background/50 overflow-hidden">
                    {/* Action Presets in Dialog */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20 text-xs shrink-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                          <Sparkles size={12} className="text-amber-400" />
                          <span>Presets for {field.type}:</span>
                        </span>
                        {baseType === "string" && !isArray && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(STRING_REDUCER_PRESETS.standard)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                            >
                              ⚡ Actions (set/append/prepend/reset)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(STRING_REDUCER_PRESETS.replace)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                            >
                              ⚡ Replace Only
                            </button>
                          </div>
                        )}
                        {baseType === "number" && !isArray && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(NUMBER_REDUCER_PRESETS.standard)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                            >
                              ⚡ Actions (inc/dec/set/reset)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(NUMBER_REDUCER_PRESETS.sum)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                            >
                              ⚡ Sum (delta)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(NUMBER_REDUCER_PRESETS.replace)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                            >
                              ⚡ Replace Only
                            </button>
                          </div>
                        )}
                        {baseType === "boolean" && !isArray && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(BOOLEAN_REDUCER_PRESETS.standard)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                            >
                              ⚡ Actions (set/toggle/reset)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(BOOLEAN_REDUCER_PRESETS.replace)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                            >
                              ⚡ Replace Only
                            </button>
                          </div>
                        )}
                        {isArray && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(ARRAY_REDUCER_PRESETS.standard)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                            >
                              ⚡ Actions (set/append/pop/remove/reset)
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(ARRAY_REDUCER_PRESETS.appendOnly)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300/80 font-mono transition-colors cursor-pointer border border-indigo-500/20"
                            >
                              ⚡ Append Only
                            </button>
                          </div>
                        )}
                        {!isArray && (baseType === "object" || matchedCustomType) && (
                          <div className="flex items-center gap-1.5">
                            {matchedCustomType ? (
                              <button
                                type="button"
                                onClick={() => handleApplyPreset(generateSchemaAwareReducerCode(matchedCustomType))}
                                className="text-[9px] px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-mono transition-colors cursor-pointer border border-cyan-500/40 font-semibold flex items-center gap-1"
                              >
                                <Braces size={9} />
                                <span>⚡ Type-Safe ({matchedCustomType.name})</span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(REDUCER_CODE_PRESETS.object)}
                              className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 font-mono transition-colors cursor-pointer border border-indigo-500/30 font-semibold"
                            >
                              ⚡ Generic Merge
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={handleResetToSuggested}
                        >
                          <RotateCcw size={10} className="mr-1 text-indigo-400" />
                          <span>Reset</span>
                        </Button>
                      </div>
                    </div>

                    {/* Dialog Textarea */}
                    <div className="flex-1 min-h-0 flex flex-col">
                      <LocalTextarea
                        value={currentCode}
                        onChange={(e) => handleCodeChange(e.target.value)}
                        debounceMs={150}
                        className="flex-1 w-full font-mono text-xl bg-zinc-950 text-zinc-100 p-4 leading-relaxed border-border/80 resize-none rounded-md focus-visible:ring-indigo-500/50 shadow-inner"
                        placeholder="(prev, next) => next"
                        spellCheck={false}
                      />
                    </div>

                    {/* Dialog Footer Actions Info */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40 font-mono shrink-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-muted-foreground text-[10px]">Detected Actions ({detectedActions.length}):</span>
                        {detectedActions.map((act) => (
                          <Badge
                            key={act}
                            variant="outline"
                            className="text-[9.5px] px-1.5 py-0.5 border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                          >
                            {act}
                          </Badge>
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{lineCount} lines</span>
                    </div>
                  </div>

                  <DialogFooter className="p-3 border-t border-border/50 bg-muted/20 flex items-center justify-between sm:justify-between shrink-0">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Signature: <code>(prev: {field.type}, next: {field.type}) =&gt; {field.type}</code>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-4 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Done
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export const StoreFieldsSection: React.FC<StoreFieldsSectionProps> = ({
  fields,
  actions = [],
  onAddField,
  onUpdateField,
  onRemoveField,
  onOpenTestForField,
}) => {
  const allNodes = useBackendCanvasStore((s) => s.nodes);

  const availableCustomTypes = useMemo(() => {
    const types: CustomTypeItem[] = [];
    allNodes.forEach((n) => {
      if (n.type === "types" && n.data?.types) {
        n.data.types.forEach((t: CustomTypeItem) => {
          if (t && t.name && !types.some((existing) => existing.id === t.id)) {
            types.push(t);
          }
        });
      }
    });
    return types;
  }, [allNodes]);

  const duplicateFieldNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of fields) {
      const key = f.name?.trim().toLowerCase();
      if (key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const duplicates = new Set<string>();
    for (const [key, count] of counts.entries()) {
      if (count > 1) duplicates.add(key);
    }
    return duplicates;
  }, [fields]);

  return (
    <div className="flex flex-col gap-2.5 pt-2 border-t border-border/40">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-mono">
          <Layers size={13} className="text-indigo-400" />
          <span>State Variables &amp; Reducers ({fields.length})</span>
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddField}
          className="h-6 text-[10px] px-2 gap-1 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 border-indigo-500/30 cursor-pointer font-mono font-bold"
        >
          <Plus size={11} />
          <span>Add Variable</span>
        </Button>
      </div>

      {duplicateFieldNames.size > 0 && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-[11px]">Duplicate Variable Names Detected</span>
            <span className="text-[10px] text-destructive/90">
              Variable names must be unique within this store. Please rename duplicate variables.
            </span>
          </div>
        </div>
      )}

      {fields.length === 0 ? (
        <div className="p-4 text-center text-[11px] text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/60 flex flex-col items-center gap-2">
          <span>No state variables defined yet.</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onAddField}
            className="h-7 text-xs font-mono text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10 cursor-pointer"
          >
            <Plus size={12} className="mr-1" />
            <span>Add State Variable</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {fields.map((f, idx) => {
            const key = f.name?.trim().toLowerCase();
            const isDuplicate = Boolean(key && duplicateFieldNames.has(key));
            return (
              <StoreVariableCard
                key={f.id}
                field={f}
                index={idx}
                isDuplicate={isDuplicate}
                availableCustomTypes={availableCustomTypes}
                allNodes={allNodes}
                onUpdateField={onUpdateField}
                onRemoveField={onRemoveField}
                onOpenTestForField={onOpenTestForField}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
