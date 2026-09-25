"use client";

import React, { useState, useMemo } from "react";
import { LocalInput, LocalTextarea } from "../../backend-nodes/graph-nodes/shared";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  FileCode,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Code2,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Sliders,
  CheckCircle2,
  Terminal,
  Zap,
} from "lucide-react";
import { GlobalStoreAction, GlobalStoreField, Parameter } from "@workspace/canvas/types";
import { TypeCombobox } from "../TypeCombobox";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import {
  generateActionCodePreview,
  getDefaultTemplateForAction,
  validateStoreAction,
} from "./types";
import { InlineActionTester } from "./InlineActionTester";

export interface StoreActionsSectionProps {
  actions: GlobalStoreAction[];
  fields: GlobalStoreField[];
  onAddAction: () => void;
  onUpdateAction: (actionId: string, patch: Partial<GlobalStoreAction>) => void;
  onRemoveAction: (actionId: string) => void;
}

export const StoreActionsSection: React.FC<StoreActionsSectionProps> = ({
  actions,
  fields,
  onAddAction,
  onUpdateAction,
  onRemoveAction,
}) => {
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);

  const handleAddActionParameter = (actionId: string) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;
    const currentParams = action.parameters || [];
    const newParam: Parameter = {
      id: `param_${Date.now()}`,
      name: `arg${currentParams.length + 1}`,
      type: "string",
      required: true,
    };
    onUpdateAction(actionId, { parameters: [...currentParams, newParam] });
  };

  const handleUpdateActionParameter = (
    actionId: string,
    paramId: string,
    patch: Partial<Parameter>,
  ) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;
    const updatedParams = (action.parameters || []).map((p) =>
      p.id === paramId ? { ...p, ...patch } : p,
    );
    onUpdateAction(actionId, { parameters: updatedParams });
  };

  const handleRemoveActionParameter = (actionId: string, paramId: string) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;
    const updatedParams = (action.parameters || []).filter((p) => p.id !== paramId);
    onUpdateAction(actionId, { parameters: updatedParams });
  };

  const customActions = useMemo(() => {
    return actions.filter((act) => {
      if (act.defaultManipulatorType) return false;
      const isPopulateOverride =
        act.actionType === "populate" ||
        act.name?.toLowerCase() === "populate" ||
        act.name?.toLowerCase() === "load";
      const isResetOverride =
        act.actionType === "reset" || act.name?.toLowerCase() === "reset";
      const isSetterOverride = fields.some(
        (f) =>
          act.targetFieldId === f.id &&
          act.name?.toLowerCase() === `set${f.name?.toLowerCase()}`,
      );
      return !isPopulateOverride && !isResetOverride && !isSetterOverride;
    });
  }, [actions, fields]);

  // Generate logic from prompt
  const handleGenerateFromPrompt = (actionId: string) => {
    const act = actions.find((a) => a.id === actionId);
    if (!act) return;
    const promptText = (act.prompt || "").trim();
    const targetField = fields.find((f) => f.id === act.targetFieldId);
    const targetName = targetField?.name || "value";
    const argName = act.parameters?.[0]?.name || "payload";
    const lowerPrompt = promptText.toLowerCase();

    let generatedCode = "";
    if (lowerPrompt.includes("add") || lowerPrompt.includes("append") || targetField?.type === "array") {
      generatedCode = `// AI Generated: Append to ${targetName}\nset((state) => ({\n  ${targetName}: [...(Array.isArray(state.${targetName}) ? state.${targetName} : []), ${argName}]\n}));`;
    } else if (lowerPrompt.includes("remove") || lowerPrompt.includes("delete") || lowerPrompt.includes("filter")) {
      generatedCode = `// AI Generated: Filter from ${targetName}\nset((state) => ({\n  ${targetName}: Array.isArray(state.${targetName})\n    ? state.${targetName}.filter((it, idx) =>\n        typeof it === "object" && it !== null && "id" in it ? it.id !== ${argName} : idx !== ${argName}\n      )\n    : []\n}));`;
    } else if (lowerPrompt.includes("toggle") || targetField?.type === "boolean") {
      generatedCode = `// AI Generated: Toggle ${targetName}\nset((state) => ({\n  ${targetName}: !state.${targetName}\n}));`;
    } else if (lowerPrompt.includes("increment") || targetField?.type === "number") {
      generatedCode = `// AI Generated: Increment ${targetName}\nset((state) => ({\n  ${targetName}: (Number(state.${targetName}) || 0) + (Number(${argName}) || 1)\n}));`;
    } else if (lowerPrompt.includes("merge") || targetField?.type === "object") {
      generatedCode = `// AI Generated: Merge into ${targetName}\nset((state) => ({\n  ${targetName}: { ...(state.${targetName} || {}), ...(${argName} && typeof ${argName} === "object" ? ${argName} : {}) }\n}));`;
    } else {
      generatedCode = `// AI Generated Action Logic\nset((state) => ({\n  ...state,\n  ${targetName}: ${argName}\n}));`;
    }

    onUpdateAction(actionId, { code: generatedCode });
    toast.success("Generated mutation logic from instruction!");
  };

  return (
    <div className="flex flex-col gap-2.5 pt-2 border-t border-border/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileCode size={13} className="text-indigo-400" />
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Custom Store Actions &amp; Logic ({customActions.length})
          </Label>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onAddAction();
          }}
          className="h-6 text-[10px] px-2 gap-1 text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10 border-indigo-500/30 cursor-pointer"
        >
          <Plus size={11} />
          <span>Add Custom Action</span>
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Define actions with inputs and state mutation bodies following the Zustand pattern:{" "}
        <code className="px-1 py-0.2 bg-muted rounded font-mono text-[10px] text-indigo-300">
          actionName: (inputs) =&gt; set(...)
        </code>
      </p>

      {customActions.length === 0 ? (
        <div className="p-3 text-center text-[11px] text-muted-foreground bg-muted/20 rounded-md border border-dashed border-border/60">
          No additional custom actions defined. Click &quot;Add Custom Action&quot; to add business logic.
        </div>
      ) : (
        <div className="space-y-2.5">
          {customActions.map((act) => {
            const isExpanded = expandedActionId === act.id;
            const isCustom = act.actionType === "custom";
            const targetField = fields.find((f) => f.id === act.targetFieldId);
            const validation = validateStoreAction({
              action: act,
              allActions: actions,
              fields,
            });
            const hasErrors = validation.errors.length > 0;
            const hasWarnings = validation.warnings.length > 0;

            // Compute signature for preview
            const signatureParams =
              act.parameters && act.parameters.length > 0
                ? act.parameters.map((p) => p.name || "arg").join(", ")
                : act.actionType === "reset" || act.actionType === "toggle"
                ? ""
                : "payload";
            const signaturePreview = `${act.name || "action"}(${signatureParams})`;

            // Generate live Zustand code snippet
            const zustandCodeSnippet = generateActionCodePreview({
              name: act.name,
              actionType: act.actionType,
              targetFieldName: targetField?.name,
              parameters: act.parameters,
              code: act.code,
              field: targetField,
            });

            return (
              <div
                key={act.id}
                className={cn(
                  "rounded-lg border transition-all overflow-hidden",
                  hasErrors
                    ? "border-destructive/60 bg-destructive/5"
                    : isExpanded
                    ? "bg-card border-indigo-500/50 shadow-sm"
                    : "bg-card/60 border-border/60 hover:border-border",
                )}
              >
                {/* Action Header Row */}
                <div className="p-2 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedActionId(isExpanded ? null : act.id)}
                      className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer shrink-0"
                      title={isExpanded ? "Collapse action editor" : "Expand action editor"}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {/* Action Name Input */}
                    <div className="flex-1 min-w-0">
                      <LocalInput
                        value={act.name}
                        onChange={(e) => onUpdateAction(act.id, { name: e.target.value.trim() })}
                        debounceMs={150}
                        placeholder="actionName (e.g. login, toggleTheme)"
                        className={cn(
                          "h-7 text-xs font-mono bg-background",
                          hasErrors && "border-destructive focus-visible:ring-destructive",
                        )}
                      />
                    </div>

                    {/* Action Type Selector */}
                    <Select
                      value={act.actionType}
                      onValueChange={(val: GlobalStoreAction["actionType"]) => {
                        onUpdateAction(act.id, { actionType: val });
                        if (val === "custom") setExpandedActionId(act.id);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-26 font-mono bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="set">set (replace)</SelectItem>
                        <SelectItem value="append">append (array)</SelectItem>
                        <SelectItem value="remove">remove (array)</SelectItem>
                        <SelectItem value="toggle">toggle (bool)</SelectItem>
                        <SelectItem value="increment">increment</SelectItem>
                        <SelectItem value="populate">populate</SelectItem>
                        <SelectItem value="reset">reset</SelectItem>
                        <SelectItem value="custom">custom ✦</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Target Field Selector */}
                    {!isCustom && act.actionType !== "reset" && act.actionType !== "populate" && (
                      <Select
                        value={act.targetFieldId || "none"}
                        onValueChange={(val) =>
                          onUpdateAction(act.id, {
                            targetFieldId: val === "none" ? undefined : val,
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-28 font-mono bg-background">
                          <SelectValue placeholder="Target field" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {fields.map((f) => (
                            <SelectItem key={f.id} value={f.id} className="font-mono text-xs">
                              {f.name} ({f.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Delete Action Button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        onRemoveAction(act.id);
                        if (expandedActionId === act.id) setExpandedActionId(null);
                      }}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
                      title="Delete custom action"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>

                  {/* Header Sub-bar: Signature Preview & Validation Messages */}
                  <div className="flex items-center justify-between pl-6 pr-1 text-[10px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-muted-foreground/70 font-sans">Pattern:</span>
                      <code className="text-indigo-400 dark:text-indigo-300 font-mono bg-indigo-500/10 px-1 py-0.5 rounded border border-indigo-500/20">
                        {signaturePreview} =&gt; set(...)
                      </code>
                      {targetField && (
                        <span className="text-muted-foreground/80 font-mono text-[9px]">
                          target: <span className="text-foreground">{targetField.name}</span>
                        </span>
                      )}
                    </div>

                    {/* Validation Indicators */}
                    {hasErrors ? (
                      <div className="flex items-center gap-1 text-destructive font-medium">
                        <AlertCircle size={11} />
                        <span>{validation.errors[0]}</span>
                      </div>
                    ) : hasWarnings ? (
                      <div className="flex items-center gap-1 text-amber-500 font-medium">
                        <AlertTriangle size={11} />
                        <span>{validation.warnings[0]}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* ============================================================ */}
                {/* EXPANDABLE 3-ZONE ACTION PANEL                              */}
                {/* Zone 1: Inputs / Parameters                                  */}
                {/* Zone 2: Mutation Body & Logic                                */}
                {/* Zone 3: Generated Zustand Code Preview                       */}
                {/* ============================================================ */}
                {isExpanded && (
                  <div className="p-3 bg-muted/20 border-t border-border/40 space-y-4">
                    {/* ---------------- ZONE 1: INPUTS (PARAMETERS) ---------------- */}
                    <div className="space-y-2 rounded-md p-2.5 bg-background/50 border border-border/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase tracking-wider font-semibold border-indigo-500/40 text-indigo-400 bg-indigo-500/5 px-1 py-0"
                          >
                            Zone 1: Inputs
                          </Badge>
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Action Arguments ({act.parameters?.length || 0})
                          </Label>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddActionParameter(act.id)}
                          className="h-5 text-[10px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 px-1.5 cursor-pointer"
                        >
                          <Plus size={10} className="mr-0.5" /> Add Input Arg
                        </Button>
                      </div>

                      {/* Display when no custom args defined */}
                      {(!act.parameters || act.parameters.length === 0) ? (
                        <div className="p-2 rounded bg-muted/30 border border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-foreground font-medium bg-muted px-1.5 py-0.5 rounded border border-border/60">
                              payload: any
                            </span>
                            <span className="italic">
                              (Default single input. Passed automatically when calling this action)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddActionParameter(act.id)}
                            className="h-5 text-[9px] px-1.5"
                          >
                            Customize Inputs
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {act.parameters.map((param, pIdx) => {
                            const isReserved = ["set", "get", "initialState", "state"].includes(
                              param.name?.trim().toLowerCase(),
                            );
                            return (
                              <div key={param.id} className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-mono text-muted-foreground w-4 text-right">
                                    #{pIdx + 1}
                                  </span>
                                  <LocalInput
                                    value={param.name}
                                    onChange={(e) =>
                                      handleUpdateActionParameter(act.id, param.id, {
                                        name: e.target.value.trim(),
                                      })
                                    }
                                    debounceMs={150}
                                    placeholder="argName (e.g. item, count)"
                                    className={cn(
                                      "h-6 text-[11px] font-mono flex-1 bg-background",
                                      isReserved && "border-destructive text-destructive",
                                    )}
                                  />
                                  <TypeCombobox
                                    value={param.type}
                                    onValueChange={(val) =>
                                      handleUpdateActionParameter(act.id, param.id, {
                                        type: val,
                                      })
                                    }
                                    className="h-6 w-24 text-[11px] font-mono bg-background"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveActionParameter(act.id, param.id)}
                                    className="p-1 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                                    title="Remove argument"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                                {isReserved && (
                                  <span className="text-[9px] text-destructive pl-6 font-mono">
                                    Cannot use &quot;{param.name}&quot; (conflicts with store scope)
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* ---------------- ZONE 2: MUTATION BODY & LOGIC ---------------- */}
                    <div className="space-y-2 rounded-md p-2.5 bg-background/50 border border-border/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase tracking-wider font-semibold border-emerald-500/40 text-emerald-400 bg-emerald-500/5 px-1 py-0"
                          >
                            Zone 2: Body
                          </Badge>
                          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Code2 size={11} className="text-emerald-400" />
                            <span>Mutation Logic (TypeScript / JS)</span>
                          </Label>
                        </div>

                        {/* Apply default template button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const defaultTemplate = getDefaultTemplateForAction({
                              actionType: act.actionType,
                              targetFieldName: targetField?.name,
                              parameters: act.parameters,
                              field: targetField,
                            });
                            onUpdateAction(act.id, { code: defaultTemplate });
                            toast.success(`Inserted ${act.actionType} template!`);
                          }}
                          className="h-5 text-[9px] text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 px-1.5 cursor-pointer gap-1"
                        >
                          <Zap size={10} />
                          <span>Insert Template</span>
                        </Button>
                      </div>

                      {/* Scope Information Bar */}
                      <div className="p-1.5 rounded bg-muted/40 border border-border/40 text-[9px] text-muted-foreground font-mono flex items-center gap-1 flex-wrap">
                        <span className="text-foreground/80 font-semibold uppercase text-[8px] tracking-wider">
                          In Scope:
                        </span>
                        <code className="text-emerald-400 bg-emerald-500/10 px-1 rounded">
                          set(patch | fn)
                        </code>
                        <code className="text-sky-400 bg-sky-500/10 px-1 rounded">get()</code>
                        {act.parameters && act.parameters.length > 0 ? (
                          act.parameters.map((p) => (
                            <code
                              key={p.id}
                              className="text-amber-400 bg-amber-500/10 px-1 rounded"
                            >
                              {p.name}
                            </code>
                          ))
                        ) : (
                          <code className="text-amber-400 bg-amber-500/10 px-1 rounded">
                            payload
                          </code>
                        )}
                      </div>

                      {/* Quick Snippets Bar */}
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const fieldName = targetField ? targetField.name : "items";
                            const snippet = `// Safe Array Append\nset((state) => ({\n  ${fieldName}: [...(Array.isArray(state.${fieldName}) ? state.${fieldName} : []), ${signatureParams.split(",")[0] || "payload"}]\n}));`;
                            onUpdateAction(act.id, { code: snippet });
                          }}
                          className="h-5 text-[9px] px-1.5 bg-background/50 hover:bg-indigo-500/10 cursor-pointer"
                        >
                          Array Append
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const fieldName = targetField ? targetField.name : "items";
                            const snippet = `// Map Array Item by ID\nset((state) => ({\n  ${fieldName}: Array.isArray(state.${fieldName})\n    ? state.${fieldName}.map((item) =>\n        typeof item === "object" && item !== null && item.id === payload?.id\n          ? { ...item, ...payload }\n          : item\n      )\n    : state.${fieldName},\n}));`;
                            onUpdateAction(act.id, { code: snippet });
                          }}
                          className="h-5 text-[9px] px-1.5 bg-background/50 hover:bg-indigo-500/10 cursor-pointer"
                        >
                          Item Map (by ID)
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const snippet = `// Multi-field update and calculation\nconst items = get().items || [];\nconst nextItems = [...items, payload];\nset({\n  items: nextItems,\n  total: nextItems.reduce((sum, item) => sum + (Number(item?.price) || 0), 0)\n});`;
                            onUpdateAction(act.id, { code: snippet });
                          }}
                          className="h-5 text-[9px] px-1.5 bg-background/50 hover:bg-indigo-500/10 cursor-pointer"
                        >
                          Multi-field Calc
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const snippet = `// Direct state merge\nset((state) => ({ ...state, ...(payload && typeof payload === "object" ? payload : {}) }));`;
                            onUpdateAction(act.id, { code: snippet });
                          }}
                          className="h-5 text-[9px] px-1.5 bg-background/50 hover:bg-indigo-500/10 cursor-pointer"
                        >
                          State Merge
                        </Button>
                      </div>

                      {/* Code Editor */}
                      <LocalTextarea
                        value={act.code || ""}
                        onChange={(e) => onUpdateAction(act.id, { code: e.target.value })}
                        debounceMs={200}
                        placeholder={`// Write mutation body logic (e.g. set({ ${targetField?.name || "field"}: payload }))\nset((state) => ({\n  ${targetField?.name || "field"}: payload\n}));`}
                        className="min-h-[110px] font-mono text-[11px] bg-background/90 resize-y p-2.5 leading-relaxed border-border/80"
                      />

                      {/* Natural Language Prompt & Generator (commented out for now) */}
                      {/*
                      <div className="pt-1.5 border-t border-border/40 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                            <Sparkles size={11} className="text-amber-400" />
                            <span>AI Prompt / Natural Language Instruction</span>
                          </Label>
                          {act.prompt && act.prompt.trim() && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateFromPrompt(act.id)}
                              className="h-5 text-[9px] px-2 text-amber-500 border-amber-500/30 hover:bg-amber-500/10 gap-1 cursor-pointer font-medium"
                            >
                              <Sparkles size={10} />
                              <span>Generate Body</span>
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <LocalInput
                            value={act.prompt || ""}
                            onChange={(e) => onUpdateAction(act.id, { prompt: e.target.value })}
                            debounceMs={150}
                            placeholder="e.g. Add product to cart and recalculate subtotal and total"
                            className="h-7 text-xs bg-background flex-1"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleGenerateFromPrompt(act.id)}
                            className="h-7 text-[10px] px-2.5 gap-1 shrink-0 cursor-pointer"
                          >
                            <Sparkles size={11} className="text-amber-400" />
                            <span>Generate</span>
                          </Button>
                        </div>
                      </div>
                      */}
                    </div>

                    {/* ---------------- ZONE 3: TEST ACTION & STATE CHANGE ---------------- */}
                    <div className="space-y-1">
                      <InlineActionTester
                        action={act}
                        fields={fields}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
