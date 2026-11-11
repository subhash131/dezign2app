"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Sparkles,
  Plus,
  Trash2,
  Box,
  Database,
  Route,
  Code2,
  Sliders,
  Check,
  ChevronRight,
} from "lucide-react";
import type {
  EffectConfig,
  EffectVariableMapping,
  SectionStateVariable,
  PageSection,
} from "@workspace/canvas";

export interface StateStoreOption {
  id: string;
  name: string;
  fields: Array<{ id: string; name: string; type?: string }>;
}

export interface EffectVariableMappingSectionProps {
  effectConfig: EffectConfig;
  onChange: (next: EffectConfig) => void;
  currentSectionStateObjects?: SectionStateVariable[];
  allPageSections?: PageSection[];
  stateStores?: StateStoreOption[];
  pathParams?: Array<{ id?: string; name: string; type?: string }>;
  queryParams?: Array<{ id?: string; name?: string; key?: string; type?: string }>;
  actionName?: string;
  className?: string;
}

export const EffectVariableMappingSection: React.FC<EffectVariableMappingSectionProps> = ({
  effectConfig,
  onChange,
  currentSectionStateObjects = [],
  allPageSections = [],
  stateStores = [],
  pathParams = [],
  queryParams = [],
  actionName = "onEffect",
  className,
}) => {
  const [selectedVarKey, setSelectedVarKey] = useState<string>("");
  const [customVarName, setCustomVarName] = useState<string>("");
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);

  // Normalize mappings from existing variableMappings or seed from dependencies
  const mappings: EffectVariableMapping[] = useMemo(() => {
    if (effectConfig.variableMappings && effectConfig.variableMappings.length > 0) {
      return effectConfig.variableMappings;
    }
    // Backward compatibility: seed from string dependencies if present
    if (effectConfig.dependencies && effectConfig.dependencies.length > 0) {
      return effectConfig.dependencies.map((depName, idx) => {
        // Try matching against current section state
        const matchedState = currentSectionStateObjects.find((s) => s.name === depName);
        if (matchedState) {
          return {
            id: `seed-${idx}-${depName}`,
            variableName: depName,
            source: "section_state" as const,
            displayName: depName,
            varType: matchedState.type,
          };
        }
        // Try matching against store field
        for (const store of stateStores) {
          const matchedField = store.fields.find((f) => f.name === depName);
          if (matchedField) {
            return {
              id: `seed-${idx}-${depName}`,
              variableName: depName,
              source: "store" as const,
              storeId: store.id,
              storeName: store.name,
              displayName: `${store.name} → ${depName}`,
              varType: matchedField.type,
            };
          }
        }
        return {
          id: `seed-${idx}-${depName}`,
          variableName: depName,
          source: "custom" as const,
          displayName: depName,
        };
      });
    }
    return [];
  }, [effectConfig.variableMappings, effectConfig.dependencies, currentSectionStateObjects, stateStores]);

  // Catalog of available variables
  interface AvailableVariableOption {
    key: string;
    label: string;
    detail?: string;
    source: "section_state" | "store" | "param" | "custom";
    variableName: string;
    varType?: string;
    sectionId?: string;
    sectionName?: string;
    storeId?: string;
    storeName?: string;
    paramKey?: string;
  }

  const availableOptions = useMemo(() => {
    const list: AvailableVariableOption[] = [];

    // 1. Current Section State
    currentSectionStateObjects.forEach((st) => {
      const vName = st.name || st.id;
      list.push({
        key: `curr_sec:${vName}`,
        label: vName,
        detail: "Current Section",
        source: "section_state",
        variableName: vName,
        varType: st.type || "string",
      });
    });

    // 2. Other Page Sections State
    allPageSections.forEach((sec) => {
      (sec.stateObjects || []).forEach((st) => {
        const vName = st.name || st.id;
        const existsInCurrent = currentSectionStateObjects.some((c) => (c.name || c.id) === vName);
        if (!existsInCurrent) {
          list.push({
            key: `other_sec:${sec.id}:${vName}`,
            label: `${sec.name || "Section"} → ${vName}`,
            detail: sec.name || "Other Section",
            source: "section_state",
            variableName: vName,
            sectionId: sec.id,
            sectionName: sec.name,
            varType: st.type || "string",
          });
        }
      });
    });

    // 3. State Stores
    stateStores.forEach((store) => {
      (store.fields || []).forEach((field) => {
        list.push({
          key: `store:${store.id}:${field.name}`,
          label: `${store.name} → ${field.name}`,
          detail: `Store: ${store.name}`,
          source: "store",
          variableName: field.name,
          storeId: store.id,
          storeName: store.name,
          varType: field.type || "any",
        });
      });
    });

    // 4. Route Path Params
    pathParams.forEach((param) => {
      list.push({
        key: `param_path:${param.name}`,
        label: `[${param.name}] (path param)`,
        detail: "Route Parameter",
        source: "param",
        variableName: `routeParams.${param.name}`,
        paramKey: param.name,
        varType: param.type || "string",
      });
    });

    // 5. Query Params
    queryParams.forEach((qp) => {
      const qKey = qp.name || qp.key || "query";
      list.push({
        key: `param_query:${qKey}`,
        label: `?${qKey} (query param)`,
        detail: "URL Query",
        source: "param",
        variableName: `routeSearchParams.get("${qKey}")`,
        paramKey: qKey,
        varType: qp.type || "string",
      });
    });

    return list;
  }, [currentSectionStateObjects, allPageSections, stateStores, pathParams, queryParams]);

  // Already mapped variable names
  const mappedVarNames = useMemo(() => {
    return new Set(mappings.map((m) => m.variableName));
  }, [mappings]);

  const handleAddMapping = (opt: AvailableVariableOption) => {
    if (mappedVarNames.has(opt.variableName)) return;

    const newMapping: EffectVariableMapping = {
      id: `evm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      variableName: opt.variableName,
      displayName: opt.label,
      source: opt.source,
      varType: opt.varType,
      sectionId: opt.sectionId,
      sectionName: opt.sectionName,
      storeId: opt.storeId,
      storeName: opt.storeName,
      paramKey: opt.paramKey,
    };

    const nextMappings = [...mappings, newMapping];
    const nextDeps = Array.from(new Set(nextMappings.map((m) => m.variableName)));

    onChange({
      ...effectConfig,
      variableMappings: nextMappings,
      dependencies: nextDeps,
    });
    setSelectedVarKey("");
  };

  const handleAddCustomVar = () => {
    const trimmed = customVarName.trim();
    if (!trimmed) return;
    if (mappedVarNames.has(trimmed)) {
      setCustomVarName("");
      setIsAddingCustom(false);
      return;
    }

    const newMapping: EffectVariableMapping = {
      id: `evm-custom-${Date.now()}`,
      variableName: trimmed,
      displayName: trimmed,
      source: "custom",
      varType: "any",
    };

    const nextMappings = [...mappings, newMapping];
    const nextDeps = Array.from(new Set(nextMappings.map((m) => m.variableName)));

    onChange({
      ...effectConfig,
      variableMappings: nextMappings,
      dependencies: nextDeps,
    });
    setCustomVarName("");
    setIsAddingCustom(false);
  };

  const handleRemoveMapping = (mappingId: string) => {
    const nextMappings = mappings.filter((m) => m.id !== mappingId);
    const nextDeps = Array.from(new Set(nextMappings.map((m) => m.variableName)));

    onChange({
      ...effectConfig,
      variableMappings: nextMappings,
      dependencies: nextDeps,
    });
  };

  const handleDebounceChange = (ms: number) => {
    onChange({
      ...effectConfig,
      debounceMs: Math.max(0, ms),
    });
  };

  const currentDebounce = effectConfig.debounceMs ?? 0;
  const DEBOUNCE_PRESETS = [0, 150, 300, 500, 1000];

  return (
    <div className={cn("space-y-4 font-sans", className)}>
      {/* 1. Header & Callout */}
      <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-violet-500 shrink-0" />
            <span className="text-xs font-semibold text-foreground">
              Variable Change Trigger Mapping
            </span>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] font-mono px-2 py-0 border-violet-500/40 text-violet-600 dark:text-violet-400 bg-background/60"
          >
            {mappings.length} {mappings.length === 1 ? "variable" : "variables"} mapped
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Select state variables, global store fields, or route parameters to watch. Whenever any mapped variable changes value, this effect triggers automatically.
        </p>
      </div>

      {/* 2. Variable Picker / Adder */}
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-card border border-border/70 shadow-xs">
        <Label className="text-[11px] font-semibold text-foreground flex items-center justify-between">
          <span>Map Variable to Effect</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            Triggers on value change
          </span>
        </Label>

        <div className="flex items-center gap-2">
          <Select
            value={selectedVarKey}
            onValueChange={(val) => {
              if (val === "CUSTOM_PROMPT") {
                setIsAddingCustom(true);
                return;
              }
              const opt = availableOptions.find((o) => o.key === val);
              if (opt) {
                handleAddMapping(opt);
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-background font-mono flex-1 focus:ring-1 focus:ring-violet-500">
              <SelectValue placeholder="Select variable to watch..." />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {/* Group 1: Current Section State */}
              <SelectGroup>
                <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 flex items-center gap-1.5">
                  <Box size={11} className="text-emerald-500" /> Current Section State
                </SelectLabel>
                {availableOptions
                  .filter((o) => o.key.startsWith("curr_sec:"))
                  .map((opt) => {
                    const isMapped = mappedVarNames.has(opt.variableName);
                    return (
                      <SelectItem
                        key={opt.key}
                        value={opt.key}
                        disabled={isMapped}
                        className="text-xs font-mono"
                      >
                        <div className="flex items-center justify-between w-full gap-3">
                          <span className={cn(isMapped && "line-through text-muted-foreground")}>
                            {opt.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-sans">
                            {isMapped ? "(already mapped)" : opt.varType ? `(${opt.varType})` : ""}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
              </SelectGroup>

              {/* Group 2: Other Page Sections */}
              {availableOptions.some((o) => o.key.startsWith("other_sec:")) && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 flex items-center gap-1.5">
                    <Box size={11} className="text-emerald-400" /> Other Page Sections
                  </SelectLabel>
                  {availableOptions
                    .filter((o) => o.key.startsWith("other_sec:"))
                    .map((opt) => {
                      const isMapped = mappedVarNames.has(opt.variableName);
                      return (
                        <SelectItem
                          key={opt.key}
                          value={opt.key}
                          disabled={isMapped}
                          className="text-xs font-mono"
                        >
                          <div className="flex items-center justify-between w-full gap-3">
                            <span className={cn(isMapped && "line-through text-muted-foreground")}>
                              {opt.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-sans">
                              {isMapped ? "(already mapped)" : `(${opt.varType})`}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                </SelectGroup>
              )}

              {/* Group 3: State Stores */}
              {availableOptions.some((o) => o.key.startsWith("store:")) && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 flex items-center gap-1.5">
                    <Database size={11} className="text-sky-500" /> Global State Stores
                  </SelectLabel>
                  {availableOptions
                    .filter((o) => o.key.startsWith("store:"))
                    .map((opt) => {
                      const isMapped = mappedVarNames.has(opt.variableName);
                      return (
                        <SelectItem
                          key={opt.key}
                          value={opt.key}
                          disabled={isMapped}
                          className="text-xs font-mono"
                        >
                          <div className="flex items-center justify-between w-full gap-3">
                            <span className={cn(isMapped && "line-through text-muted-foreground")}>
                              {opt.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-sans">
                              {isMapped ? "(already mapped)" : `(${opt.varType})`}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                </SelectGroup>
              )}

              {/* Group 4: Route & Query Params */}
              {availableOptions.some((o) => o.key.startsWith("param_")) && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 flex items-center gap-1.5">
                    <Route size={11} className="text-amber-500" /> Route & Query Params
                  </SelectLabel>
                  {availableOptions
                    .filter((o) => o.key.startsWith("param_"))
                    .map((opt) => {
                      const isMapped = mappedVarNames.has(opt.variableName);
                      return (
                        <SelectItem
                          key={opt.key}
                          value={opt.key}
                          disabled={isMapped}
                          className="text-xs font-mono"
                        >
                          <div className="flex items-center justify-between w-full gap-3">
                            <span className={cn(isMapped && "line-through text-muted-foreground")}>
                              {opt.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-sans">
                              {isMapped ? "(already mapped)" : `(${opt.varType})`}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                </SelectGroup>
              )}

              {/* Group 5: Custom Expression */}
              <SelectGroup>
                <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1 flex items-center gap-1.5">
                  <Code2 size={11} className="text-violet-500" /> Custom Expression
                </SelectLabel>
                <SelectItem value="CUSTOM_PROMPT" className="text-xs font-mono text-violet-500">
                  + Enter custom variable name...
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          {!isAddingCustom && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddingCustom(true)}
              className="h-8 px-2.5 text-xs gap-1 shrink-0 border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
              title="Add a custom variable expression"
            >
              <Plus size={12} />
              Custom
            </Button>
          )}
        </div>

        {/* Custom Input prompt if user clicked Custom */}
        {isAddingCustom && (
          <div className="flex items-center gap-1.5 pt-2 border-t border-border/50">
            <Input
              value={customVarName}
              onChange={(e) => setCustomVarName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustomVar();
                }
                if (e.key === "Escape") {
                  setIsAddingCustom(false);
                  setCustomVarName("");
                }
              }}
              placeholder="e.g. isOnline, filterValue, window.innerWidth"
              className="h-7 text-xs bg-background font-mono flex-1"
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddCustomVar}
              disabled={!customVarName.trim()}
              className="h-7 px-2.5 text-xs bg-violet-600 hover:bg-violet-700 text-white shrink-0"
            >
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAddingCustom(false);
                setCustomVarName("");
              }}
              className="h-7 px-2 text-xs text-muted-foreground shrink-0"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* 3. Mapped Variables List */}
      <div className="flex flex-col gap-2">
        <Label className="text-[11px] font-semibold text-foreground flex items-center justify-between">
          <span>Currently Watched Variables ({mappings.length})</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            Executes effect on change
          </span>
        </Label>

        {mappings.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {mappings.map((m) => {
              const isSectionState = m.source === "section_state";
              const isStore = m.source === "store";
              const isParam = m.source === "param";
              const isCustom = m.source === "custom";

              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg border text-xs transition-all",
                    isSectionState && "bg-emerald-500/5 border-emerald-500/20",
                    isStore && "bg-sky-500/5 border-sky-500/20",
                    isParam && "bg-amber-500/5 border-amber-500/20",
                    isCustom && "bg-violet-500/5 border-violet-500/20",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="shrink-0">
                      {isSectionState && <Box size={14} className="text-emerald-500" />}
                      {isStore && <Database size={14} className="text-sky-500" />}
                      {isParam && <Route size={14} className="text-amber-500" />}
                      {isCustom && <Code2 size={14} className="text-violet-500" />}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-mono font-semibold text-foreground truncate">
                          {m.variableName}
                        </span>
                        {m.varType && (
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1 py-0 font-mono text-muted-foreground shrink-0"
                          >
                            {m.varType}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {isSectionState && (m.sectionName ? `Section: ${m.sectionName}` : "Section State")}
                        {isStore && (m.storeName ? `Store: ${m.storeName}` : "Global Store Field")}
                        {isParam && (m.paramKey ? `Param: ${m.paramKey}` : "Route Parameter")}
                        {isCustom && "Custom Expression"}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveMapping(m.id)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                    title={`Unmap ${m.variableName}`}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-5 rounded-xl border border-dashed border-border text-center bg-muted/10 space-y-1.5">
            <Sparkles size={20} className="text-violet-400/80 mb-0.5" />
            <div className="text-xs font-medium text-foreground">No Variables Mapped</div>
            <p className="text-[11px] text-muted-foreground max-w-xs leading-normal">
              Select a section state variable, store property, or route param above to trigger this effect whenever its value changes.
            </p>
          </div>
        )}
      </div>

      {/* 4. Debounce Delay Configuration */}
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-card border border-border/70 shadow-xs">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Sliders size={13} className="text-violet-500" />
            <span>Debounce Delay (ms)</span>
          </Label>
          <span className="text-[10px] font-mono text-muted-foreground">
            {currentDebounce > 0 ? `${currentDebounce}ms delay` : "Immediate (0ms)"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {DEBOUNCE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleDebounceChange(preset)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-mono border transition-all",
                currentDebounce === preset
                  ? "bg-violet-500 text-white border-violet-500 shadow-xs"
                  : "bg-background border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {preset === 0 ? "0ms (Instant)" : `${preset}ms`}
            </button>
          ))}
        </div>

        <Input
          type="number"
          min={0}
          step={50}
          value={currentDebounce}
          onChange={(e) => handleDebounceChange(parseInt(e.target.value, 10) || 0)}
          className="h-8 text-xs bg-background font-mono focus:ring-1 focus:ring-violet-500"
          placeholder="e.g. 300 for debounced search input"
        />
      </div>

      {/* 5. Live Code Hook Preview */}
      <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 font-mono text-[11px]">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans pb-1 border-b border-slate-800">
          <span className="font-semibold text-slate-300">Generated Next.js Hook</span>
          <span>Client Side</span>
        </div>
        <pre className="overflow-x-auto text-[10.5px] leading-relaxed text-slate-300 py-1">
          <code>
            {`useEffect(() => {
${currentDebounce > 0 ? `  const handler = setTimeout(() => {\n    handleTriggerAction("${actionName}", "effect");\n  }, ${currentDebounce});\n  return () => clearTimeout(handler);` : `  handleTriggerAction("${actionName}", "effect");`}
}, [${mappings.map((m) => m.variableName).join(", ")}]);`}
          </code>
        </pre>
      </div>
    </div>
  );
};
