"use client";

import React, { useState, useMemo } from "react";
import { LocalInput, LocalTextarea } from "../../backend-nodes/graph-nodes/shared";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Switch } from "@workspace/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Sliders,
  RotateCcw,
  Download,
  ChevronDown,
  ChevronRight,
  Code2,
  Sparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Wrench,
  HelpCircle,
  Zap,
} from "lucide-react";
import { GlobalStoreAction, GlobalStoreField, Parameter } from "@workspace/canvas/types";
import { TypeCombobox } from "../TypeCombobox";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { generateActionCodePreview } from "./types";
import { InlineActionTester } from "./InlineActionTester";

export interface StoreDefaultManipulatorsSectionProps {
  fields: GlobalStoreField[];
  actions: GlobalStoreAction[];
  disabledDefaultManipulators?: string[];
  deletedDefaultManipulators?: string[];
  onModifyDefaultManipulator: (
    manipulatorKey: "populate" | "reset" | `setter-${string}`,
    patch: Partial<GlobalStoreAction>,
  ) => void;
  onRevertDefaultManipulator: (
    manipulatorKey: "populate" | "reset" | `setter-${string}`,
  ) => void;
  onToggleDefaultManipulator: (
    manipulatorKey: "populate" | "reset" | `setter-${string}`,
    enabled: boolean,
  ) => void;
  onDeleteDefaultManipulator?: (
    manipulatorKey: "populate" | "reset" | `setter-${string}`,
  ) => void;
}

interface DefaultManipulatorItem {
  key: "populate" | "reset" | `setter-${string}`;
  type: "populate" | "reset" | "setter";
  defaultName: string;
  currentAction: GlobalStoreAction | undefined;
  targetField?: GlobalStoreField;
  description: string;
  handleBadge: string;
  defaultCode: string;
  snippets: Array<{ label: string; code: string }>;
}

export const StoreDefaultManipulatorsSection: React.FC<
  StoreDefaultManipulatorsSectionProps
> = ({
  fields,
  actions,
  disabledDefaultManipulators = [],
  deletedDefaultManipulators = [],
  onModifyDefaultManipulator,
  onRevertDefaultManipulator,
  onToggleDefaultManipulator,
  onDeleteDefaultManipulator,
}) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const disabledSet = useMemo(
    () => new Set(disabledDefaultManipulators || []),
    [disabledDefaultManipulators],
  );
  const deletedSet = useMemo(
    () => new Set(deletedDefaultManipulators || []),
    [deletedDefaultManipulators],
  );

  // Find user overrides in actions
  const populateAction = useMemo(() => {
    return actions.find(
      (a) =>
        a.defaultManipulatorType === "populate" ||
        a.actionType === "populate" ||
        a.name.toLowerCase() === "populate" ||
        a.name.toLowerCase() === "load",
    );
  }, [actions]);

  const resetAction = useMemo(() => {
    return actions.find(
      (a) =>
        a.defaultManipulatorType === "reset" ||
        a.actionType === "reset" ||
        a.name.toLowerCase() === "reset",
    );
  }, [actions]);

  const fieldSetterActions = useMemo(() => {
    const map = new Map<string, GlobalStoreAction>();
    fields.forEach((f) => {
      const defaultSetterName = `set${f.name.toLowerCase()}`;
      const match = actions.find((a) => {
        if (a.defaultManipulatorType === "setter" && a.targetFieldId === f.id) {
          return true;
        }
        // Match explicit setter override by name and target field
        return (
          a.name.toLowerCase() === defaultSetterName &&
          (!a.targetFieldId || a.targetFieldId === f.id)
        );
      });
      if (match) {
        map.set(f.id, match);
      }
    });
    return map;
  }, [fields, actions]);

  // Build the list of default manipulators
  const manipulatorItems: DefaultManipulatorItem[] = useMemo(() => {
    const items: DefaultManipulatorItem[] = [
      {
        key: "populate",
        type: "populate",
        defaultName: "populate",
        currentAction: populateAction,
        description:
          "Bulk-hydrates store state from server API endpoints, pageLoad events, or incoming payloads.",
        handleBadge: "populate (populate-in/out)",
        defaultCode: `// Bulk-hydrate store state\nif (payload && typeof payload === "object") {\n  set((s) => ({ ...s, ...payload }));\n}`,
        snippets: [
          {
            label: "Shallow Merge",
            code: `// Shallow merge payload into store state\nset((s) => ({ ...s, ...(payload && typeof payload === "object" ? payload : {}) }));`,
          },
          {
            label: "Transform & Timestamp",
            code: `// Merge payload and record lastUpdated timestamp\nconst data = payload && typeof payload === "object" ? payload : {};\nset((s) => ({\n  ...s,\n  ...data,\n  lastLoadedAt: new Date().toISOString()\n}));`,
          },
          {
            label: "Key Validation",
            code: `// Validate payload contains object data before setting\nif (payload && typeof payload === "object" && !Array.isArray(payload)) {\n  set((s) => ({ ...s, ...payload }));\n}`,
          },
        ],
      },
      {
        key: "reset",
        type: "reset",
        defaultName: "reset",
        currentAction: resetAction,
        description:
          "Resets state fields back to initial defaults on unmount, logout, or reset triggers.",
        handleBadge: "reset (reset-in/out)",
        defaultCode: `// Reset all state fields back to default initial values\nset(initialState);`,
        snippets: [
          {
            label: "Full Reset",
            code: `// Reset all fields back to initial values\nset(initialState);`,
          },
          {
            label: "Preserve Field",
            code: fields.length > 0
              ? `// Reset all fields except ${fields[0]?.name}\nconst preserved = get().${fields[0]?.name};\nset({ ...initialState, ${fields[0]?.name}: preserved });`
              : `// Reset all fields except selected key\nset(initialState);`,
          },
          {
            label: "Reset & Notify",
            code: `// Reset store and log event\nset(initialState);\nconsole.log("[StateStore] Store reset to default initial state");`,
          },
        ],
      },
    ];

    // Add field setters
    fields.forEach((f) => {
      const capitalized = f.name.charAt(0).toUpperCase() + f.name.slice(1);
      const defaultSetterName = `set${capitalized}`;
      const setterAction = fieldSetterActions.get(f.id);

      items.push({
        key: `setter-${f.id}`,
        type: "setter",
        defaultName: defaultSetterName,
        currentAction: setterAction,
        targetField: f,
        description: `Direct mutation setter for "${f.name}" (${f.type}). Wired to ${defaultSetterName} handle or component triggers.`,
        handleBadge: `${defaultSetterName} (${defaultSetterName}-in/out)`,
        defaultCode: `// Set field value\nset({ ${f.name}: payload });`,
        snippets: [
          {
            label: "Direct Set",
            code: `// Direct set ${f.name}\nset({ ${f.name}: payload });`,
          },
          ...(f.type === "number"
            ? [
                {
                  label: "Clamp Range (0-100)",
                  code: `// Clamp number within range 0 to 100\nconst val = Math.max(0, Math.min(100, Number(payload) || 0));\nset({ ${f.name}: val });`,
                },
                {
                  label: "Positive Only",
                  code: `// Ensure non-negative value\nconst val = Math.max(0, Number(payload) || 0);\nset({ ${f.name}: val });`,
                },
              ]
            : []),
          ...(f.type === "string"
            ? [
                {
                  label: "Trim & Sanitize",
                  code: `// Trim whitespace\nset({ ${f.name}: String(payload ?? "").trim() });`,
                },
                {
                  label: "Uppercase",
                  code: `// Uppercase string value\nset({ ${f.name}: String(payload ?? "").toUpperCase() });`,
                },
              ]
            : []),
          ...(f.type === "array"
            ? [
                {
                  label: "Append Item",
                  code: `// Append item to ${f.name} array\nset((s) => ({ ${f.name}: [...(Array.isArray(s.${f.name}) ? s.${f.name} : []), payload] }));`,
                },
              ]
            : []),
        ],
      });
    });

    return items;
  }, [populateAction, resetAction, fields, fieldSetterActions]);

  const visibleItems = useMemo(() => {
    return manipulatorItems.filter(
      (item) => !deletedSet.has(item.key) && !deletedSet.has(item.defaultName),
    );
  }, [manipulatorItems, deletedSet]);

  const handleAddParam = (item: DefaultManipulatorItem) => {
    const currentParams = item.currentAction?.parameters || [];
    const newParam: Parameter = {
      id: `param_${Date.now()}`,
      name: `arg${currentParams.length + 1}`,
      type: "string",
      required: true,
    };
    onModifyDefaultManipulator(item.key, {
      name: item.currentAction?.name || item.defaultName,
      actionType: item.currentAction?.actionType || (item.type === "setter" ? "set" : item.type),
      targetFieldId: item.targetField?.id,
      parameters: [...currentParams, newParam],
    });
  };

  const handleUpdateParam = (
    item: DefaultManipulatorItem,
    paramId: string,
    patch: Partial<Parameter>,
  ) => {
    const currentParams = item.currentAction?.parameters || [];
    const updated = currentParams.map((p) => (p.id === paramId ? { ...p, ...patch } : p));
    onModifyDefaultManipulator(item.key, {
      name: item.currentAction?.name || item.defaultName,
      actionType: item.currentAction?.actionType || (item.type === "setter" ? "set" : item.type),
      targetFieldId: item.targetField?.id,
      parameters: updated,
    });
  };

  const handleRemoveParam = (item: DefaultManipulatorItem, paramId: string) => {
    const currentParams = item.currentAction?.parameters || [];
    const updated = currentParams.filter((p) => p.id !== paramId);
    onModifyDefaultManipulator(item.key, {
      name: item.currentAction?.name || item.defaultName,
      actionType: item.currentAction?.actionType || (item.type === "setter" ? "set" : item.type),
      targetFieldId: item.targetField?.id,
      parameters: updated,
    });
  };

  return (
    <div className="flex flex-col gap-2.5 pt-2 border-t border-border/40">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sliders size={13} className="text-cyan-500" />
          <span>Default Manipulators ({visibleItems.length})</span>
        </Label>
        <span className="text-[10px] text-muted-foreground font-mono">
          populate, reset &amp; field setters
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Default manipulators are built into this Zustand store and wired to canvas edge handles.
        Customize their names, parameter schemas, and mutation logic, or revert to built-ins anytime.
      </p>

      <div className="space-y-2">
        {visibleItems.length === 0 && (
          <div className="p-3 rounded-lg border border-dashed border-border/60 text-center text-xs text-muted-foreground/70">
            No default manipulators available.
          </div>
        )}

        {visibleItems.map((item) => {
          const isExpanded = expandedKey === item.key;
          const isCustomized = Boolean(item.currentAction);
          const isDisabled = disabledSet.has(item.key) || disabledSet.has(item.defaultName);
          const displayName = item.currentAction?.name || item.defaultName;
          const currentActionType =
            item.currentAction?.actionType || (item.type === "setter" ? "set" : item.type);
          const currentCode = item.currentAction?.code ?? item.defaultCode;
          const params = item.currentAction?.parameters || [];

          return (
            <div
              key={item.key}
              className={cn(
                "rounded-lg border transition-all overflow-hidden",
                isDisabled
                  ? "opacity-60 bg-muted/10 border-border/40"
                  : isExpanded
                  ? "bg-card border-cyan-500/40 shadow-sm"
                  : isCustomized
                  ? "bg-cyan-500/5 border-cyan-500/30 hover:border-cyan-500/50"
                  : "bg-card/60 border-border/60 hover:border-border",
              )}
            >
              {/* Card Header Row */}
              <div className="p-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setExpandedKey(isExpanded ? null : item.key)}
                    className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer shrink-0"
                    title={isExpanded ? "Collapse editor" : "Expand to edit manipulator"}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <div className="flex items-center gap-1.5 truncate">
                    {item.type === "populate" ? (
                      <Download size={13} className="text-emerald-500 shrink-0" />
                    ) : item.type === "reset" ? (
                      <RotateCcw size={13} className="text-rose-500 shrink-0" />
                    ) : (
                      <Sliders size={13} className="text-cyan-500 shrink-0" />
                    )}

                    <span className="font-mono text-xs font-semibold text-foreground truncate">
                      {displayName}()
                    </span>

                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 hidden sm:inline">
                      {item.type === "reset"
                        ? `${displayName}()`
                        : item.type === "populate"
                        ? `${displayName}(data)`
                        : `${displayName}(${item.targetField?.name || "value"})`}
                    </span>

                    {/* Status Badge */}
                    {isDisabled ? (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 uppercase border-muted text-muted-foreground"
                      >
                        Disabled
                      </Badge>
                    ) : isCustomized ? (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 uppercase text-amber-500 border-amber-500/30 bg-amber-500/10 font-mono flex items-center gap-1"
                      >
                        <Wrench size={9} />
                        <span>Modified</span>
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 uppercase text-muted-foreground border-border/60 bg-muted/20 font-mono"
                      >
                        Built-in
                      </Badge>
                    )}

                    <span className="text-[9px] text-muted-foreground/60 font-mono hidden sm:inline">
                      [{item.handleBadge}]
                    </span>
                  </div>
                </div>

                {/* Right controls: Enable Switch & Customize Button & Delete Button */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex items-center gap-1" title={isDisabled ? "Enable manipulator" : "Disable manipulator"}>
                    <Switch
                      checked={!isDisabled}
                      onCheckedChange={(checked) => onToggleDefaultManipulator(item.key, checked)}
                      className="scale-75"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!isExpanded) {
                        setExpandedKey(item.key);
                      }
                      if (!isCustomized) {
                        onModifyDefaultManipulator(item.key, {
                          name: item.defaultName,
                          actionType: item.type === "setter" ? "set" : item.type,
                          targetFieldId: item.targetField?.id,
                          code: item.defaultCode,
                        });
                      }
                    }}
                    className={cn(
                      "h-6 text-[10px] px-2 gap-1 cursor-pointer font-medium",
                      isCustomized
                        ? "text-cyan-600 dark:text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10"
                        : "text-muted-foreground hover:text-foreground border-border/60 hover:bg-muted/30",
                    )}
                  >
                    <Wrench size={10} />
                    <span>{isCustomized ? "Edit Logic" : "Customize"}</span>
                  </Button>

                  {onDeleteDefaultManipulator && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteDefaultManipulator(item.key)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer shrink-0"
                      title={`Delete ${displayName} manipulator from store and canvas node`}
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              </div>

              {/* Expandable Modification Drawer */}
              {isExpanded && (
                <div className="p-3 bg-muted/20 border-t border-border/40 space-y-3">
                  {/* Context notice */}
                  <div className="flex items-start gap-2 p-2 rounded-md bg-background/60 border border-border/50 text-[10px] text-muted-foreground">
                    <HelpCircle size={13} className="text-cyan-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-foreground/90">{item.description}</span>{" "}
                      Connected to canvas handle{" "}
                      <code className="px-1 py-0.5 bg-muted rounded text-foreground font-mono">
                        {item.handleBadge}
                      </code>.
                    </div>
                  </div>

                  {/* Name and Action Type Row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-muted-foreground">
                        Manipulator Name
                      </Label>
                      <LocalInput
                        value={displayName}
                        onChange={(e) =>
                          onModifyDefaultManipulator(item.key, {
                            name: e.target.value.trim() || item.defaultName,
                            actionType: currentActionType,
                            targetFieldId: item.targetField?.id,
                            code: currentCode,
                          })
                        }
                        debounceMs={150}
                        placeholder={item.defaultName}
                        className="h-7 text-xs font-mono bg-background"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-muted-foreground">
                        Action Type
                      </Label>
                      <Select
                        value={currentActionType}
                        onValueChange={(val: GlobalStoreAction["actionType"]) => {
                          onModifyDefaultManipulator(item.key, {
                            name: displayName,
                            actionType: val,
                            targetFieldId: item.targetField?.id,
                            code: currentCode,
                          });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs font-mono bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="populate">populate</SelectItem>
                          <SelectItem value="reset">reset</SelectItem>
                          <SelectItem value="set">set</SelectItem>
                          <SelectItem value="append">append</SelectItem>
                          <SelectItem value="remove">remove</SelectItem>
                          <SelectItem value="toggle">toggle</SelectItem>
                          <SelectItem value="increment">increment</SelectItem>
                          <SelectItem value="custom">custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Target Field if field setter or set/append/remove/increment */}
                  {item.type === "setter" && fields.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-muted-foreground">
                        Target Field
                      </Label>
                      <Select
                        value={item.currentAction?.targetFieldId || item.targetField?.id || fields[0]?.id}
                        onValueChange={(val) => {
                          onModifyDefaultManipulator(item.key, {
                            name: displayName,
                            actionType: currentActionType,
                            targetFieldId: val,
                            code: currentCode,
                          });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs font-mono bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {fields.map((f) => (
                            <SelectItem key={f.id} value={f.id} className="font-mono text-xs">
                              {f.name} ({f.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* ZONE 1: INPUTS (PARAMETERS) */}
                  <div className="space-y-2 rounded-md p-2.5 bg-background/50 border border-border/60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[9px] uppercase tracking-wider font-semibold border-cyan-500/40 text-cyan-500 bg-cyan-500/5 px-1 py-0"
                        >
                          Zone 1: Inputs
                        </Badge>
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Manipulator Arguments ({params.length})
                        </Label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddParam(item)}
                        className="h-5 text-[10px] text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 px-1.5 cursor-pointer"
                      >
                        <Plus size={10} className="mr-0.5" /> Add Input Arg
                      </Button>
                    </div>

                    {params.length === 0 ? (
                      <div className="p-2 rounded bg-muted/30 border border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-foreground font-medium bg-muted px-1.5 py-0.5 rounded border border-border/60">
                            {item.type === "populate"
                              ? "data: Partial<State>"
                              : item.type === "reset"
                              ? "none ()"
                              : `value: ${item.targetField?.type || "any"}`}
                          </span>
                          <span className="italic">
                            {item.type === "reset"
                              ? "(Takes no parameters; resets store state to defaults)"
                              : "(Default parameter wired to canvas handles and triggers)"}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddParam(item)}
                          className="h-5 text-[9px] px-1.5"
                        >
                          Customize Inputs
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {params.map((param) => (
                          <div key={param.id} className="flex items-center gap-1.5">
                            <LocalInput
                              value={param.name}
                              onChange={(e) =>
                                handleUpdateParam(item, param.id, {
                                  name: e.target.value.trim(),
                                })
                              }
                              debounceMs={150}
                              placeholder="argName"
                              className="h-6 text-[11px] font-mono flex-1 bg-background"
                            />
                            <TypeCombobox
                              value={param.type}
                              onValueChange={(val) =>
                                handleUpdateParam(item, param.id, {
                                  type: val,
                                })
                              }
                              className="h-6 w-24 text-[11px] font-mono bg-background"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveParam(item, param.id)}
                              className="p-1 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                              title="Remove argument"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ZONE 2: IMPLEMENTATION LOGIC (BODY) */}
                  <div className="space-y-2 rounded-md p-2.5 bg-background/50 border border-border/60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[9px] uppercase tracking-wider font-semibold border-cyan-500/40 text-cyan-500 bg-cyan-500/5 px-1 py-0"
                        >
                          Zone 2: Body
                        </Badge>
                        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Code2 size={11} className="text-cyan-400" />
                          <span>Implementation Logic (TypeScript / JS)</span>
                        </Label>
                      </div>
                    </div>

                    {/* Scope Bar */}
                    <div className="p-1.5 rounded bg-muted/40 border border-border/40 text-[9px] text-muted-foreground font-mono flex items-center gap-1 flex-wrap">
                      <span className="text-foreground/80 font-semibold uppercase text-[8px] tracking-wider">
                        In Scope:
                      </span>
                      <code className="text-emerald-400 bg-emerald-500/10 px-1 rounded">
                        set(patch | fn)
                      </code>
                      <code className="text-sky-400 bg-sky-500/10 px-1 rounded">get()</code>
                      <code className="text-amber-400 bg-amber-500/10 px-1 rounded">
                        {params.length > 0 ? params.map((p) => p.name).join(", ") : "payload"}
                      </code>
                      {item.type === "reset" && (
                        <code className="text-purple-400 bg-purple-500/10 px-1 rounded">
                          initialState
                        </code>
                      )}
                    </div>

                    {/* Quick Snippets Bar */}
                    <div className="flex flex-wrap gap-1">
                      {item.snippets.map((snip, idx) => (
                        <Button
                          key={idx}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onModifyDefaultManipulator(item.key, {
                              name: displayName,
                              actionType: currentActionType,
                              targetFieldId: item.targetField?.id,
                              code: snip.code,
                            });
                          }}
                          className="h-5 text-[9px] px-1.5 bg-background/50 hover:bg-cyan-500/10 cursor-pointer"
                        >
                          {snip.label}
                        </Button>
                      ))}
                    </div>

                    <LocalTextarea
                      value={currentCode}
                      onChange={(e) =>
                        onModifyDefaultManipulator(item.key, {
                          name: displayName,
                          actionType: currentActionType,
                          targetFieldId: item.targetField?.id,
                          code: e.target.value,
                        })
                      }
                      debounceMs={200}
                      placeholder={item.defaultCode}
                      className="min-h-[90px] font-mono text-[11px] bg-background/80 resize-y p-2 leading-relaxed border-border/80"
                    />

                    {/* AI Prompt / Instruction */}
                    <div className="space-y-1.5 pt-1.5 border-t border-border/30">
                      <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                        <Sparkles size={11} className="text-amber-400" />
                        <span>AI Prompt / Natural Language Instruction</span>
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <LocalInput
                          value={item.currentAction?.prompt || ""}
                          onChange={(e) =>
                            onModifyDefaultManipulator(item.key, {
                              name: displayName,
                              actionType: currentActionType,
                              targetFieldId: item.targetField?.id,
                              code: currentCode,
                              prompt: e.target.value,
                            })
                          }
                          debounceMs={150}
                          placeholder={`e.g. Customize ${displayName} behavior`}
                          className="h-7 text-xs bg-background flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ZONE 3: TEST MANIPULATOR & STATE CHANGE */}
                  <div className="space-y-1">
                    <InlineActionTester
                      action={
                        item.currentAction || {
                          id: `default-${item.key}`,
                          name: displayName,
                          actionType: currentActionType,
                          targetFieldId: item.targetField?.id,
                          code: currentCode,
                          parameters: params,
                          defaultManipulatorType: item.type === "setter" ? "setter" : item.type,
                        }
                      }
                      fields={fields}
                    />
                  </div>

                  {/* Revert Button if customized */}
                  {isCustomized && (
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <div className="text-[10px] text-amber-500 flex items-center gap-1">
                        <Wrench size={10} />
                        <span>Using customized implementation</span>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onRevertDefaultManipulator(item.key);
                        }}
                        className="h-6 text-[10px] text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 gap-1 cursor-pointer"
                      >
                        <RotateCcw size={10} />
                        <span>Revert to Built-in Default</span>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
