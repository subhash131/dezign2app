"use client";

import React, { useState } from "react";
import { Plus, Trash2, Sliders, Sparkles, Check, HelpCircle } from "lucide-react";
import { SectionStateVariable, StateVariableType } from "@workspace/canvas/types";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";

export interface SectionStateTabProps {
  states: SectionStateVariable[];
  renderMode: "server" | "client";
  onUpdateStates: (states: SectionStateVariable[]) => void;
  onUpdateRenderMode?: (renderMode: "server" | "client") => void;
}

const COMMON_PRESETS: { name: string; type: StateVariableType; defaultValue: unknown; label: string }[] = [
  { name: "searchQuery", type: "string", defaultValue: "", label: "Search Query" },
  { name: "isOpen", type: "boolean", defaultValue: false, label: "Modal / Drawer Open" },
  { name: "activeTab", type: "string", defaultValue: "overview", label: "Active Tab" },
  { name: "selectedId", type: "string", defaultValue: "", label: "Selected ID" },
  { name: "counter", type: "number", defaultValue: 0, label: "Counter" },
  { name: "filterList", type: "array", defaultValue: [], label: "Filter List" },
];

export const SectionStateTab: React.FC<SectionStateTabProps> = ({
  states = [],
  renderMode,
  onUpdateStates,
  onUpdateRenderMode,
}) => {
  const [newVarName, setNewVarName] = useState("");
  const [newVarType, setNewVarType] = useState<StateVariableType>("string");
  const [newVarDefault, setNewVarDefault] = useState("");

  const handleAddState = (name?: string, type?: StateVariableType, defaultValue?: unknown) => {
    const effectiveName = (name || newVarName).trim().replace(/[^a-zA-Z0-9_$]/g, "");
    if (!effectiveName) return;

    // Avoid duplicate names
    if (states.some((s) => s.name.toLowerCase() === effectiveName.toLowerCase())) {
      return;
    }

    const effectiveType = type || newVarType;
    let effectiveDefault = defaultValue !== undefined ? defaultValue : newVarDefault;

    if (effectiveDefault === "" && effectiveType === "number") effectiveDefault = 0;
    if (effectiveDefault === "" && effectiveType === "boolean") effectiveDefault = false;
    if (effectiveDefault === "" && effectiveType === "array") effectiveDefault = [];
    if (effectiveDefault === "" && effectiveType === "object") effectiveDefault = {};

    const newState: SectionStateVariable = {
      id: `state-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: effectiveName,
      type: effectiveType,
      defaultValue: effectiveDefault as string | number | boolean | null,
    };

    onUpdateStates([...states, newState]);
    setNewVarName("");
    setNewVarDefault("");
  };

  const handleUpdateField = (id: string, changes: Partial<SectionStateVariable>) => {
    const updated = states.map((s) => (s.id === id ? { ...s, ...changes } : s));
    onUpdateStates(updated);
  };

  const handleDeleteState = (id: string) => {
    const updated = states.filter((s) => s.id !== id);
    onUpdateStates(updated);
  };

  return (
    <div className="flex flex-col gap-5 p-4 overflow-y-auto max-h-[calc(100vh-220px)]">
      {/* Informative Header Banner */}
      <div className="p-3.5 rounded-xl bg-secondary/30 border border-border/50 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Sliders size={14} className="text-indigo-500" />
            <span>Section-Local States</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            {states.length} {states.length === 1 ? "variable" : "variables"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Local reactive variables managed inside this section. Compiles directly into type-safe React{" "}
          <code className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">useState</code> hooks.
        </p>

        {renderMode === "server" && states.length > 0 && (
          <div className="mt-1 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400">
            <span>Section defines states and will compile as a <strong>Client Component</strong>.</span>
            {onUpdateRenderMode && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 text-amber-600 hover:text-amber-700 dark:text-amber-400 cursor-pointer"
                onClick={() => onUpdateRenderMode("client")}
              >
                Set Client
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Quick Add Presets */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Sparkles size={12} className="text-indigo-400" />
          <span>Quick Presets</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_PRESETS.map((preset) => {
            const isAdded = states.some((s) => s.name === preset.name);
            return (
              <button
                key={preset.name}
                type="button"
                disabled={isAdded}
                onClick={() => handleAddState(preset.name, preset.type, preset.defaultValue)}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-medium border flex items-center gap-1.5 transition-all cursor-pointer",
                  isAdded
                    ? "bg-muted/40 text-muted-foreground border-transparent opacity-50 cursor-not-allowed"
                    : "bg-secondary/40 hover:bg-secondary border-border/60 hover:border-indigo-500/30 text-foreground"
                )}
              >
                {isAdded ? <Check size={10} className="text-emerald-500" /> : <Plus size={10} />}
                <span>{preset.label}</span>
                <span className="font-mono text-[9px] text-muted-foreground">({preset.type})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* State Variables List */}
      <div className="flex flex-col gap-2.5">
        <Label className="text-xs font-semibold text-foreground">Declared Variables</Label>

        {states.length === 0 ? (
          <div className="py-6 text-center border border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-1.5 bg-muted/10">
            <Sliders size={20} className="text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground">No state variables declared</span>
            <span className="text-[10px] text-muted-foreground/60">
              Add a state below or select a quick preset above.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {states.map((st) => (
              <div
                key={st.id}
                className="p-3 rounded-xl bg-card border border-border/70 shadow-xs flex flex-col gap-2.5 transition-all hover:border-border"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Input
                      value={st.name}
                      onChange={(e) => handleUpdateField(st.id, { name: e.target.value })}
                      placeholder="variableName"
                      className="h-7 text-xs font-mono font-medium bg-background"
                    />
                    <Select
                      value={st.type}
                      onValueChange={(val) => handleUpdateField(st.id, { type: val as StateVariableType })}
                    >
                      <SelectTrigger className="h-7 w-28 text-[11px] font-mono shrink-0 bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">string</SelectItem>
                        <SelectItem value="number">number</SelectItem>
                        <SelectItem value="boolean">boolean</SelectItem>
                        <SelectItem value="array">array</SelectItem>
                        <SelectItem value="object">object</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteState(st.id)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer"
                    title="Delete state variable"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-medium shrink-0">Default:</span>
                  <Input
                    value={
                      typeof st.defaultValue === "object" && st.defaultValue !== null
                        ? JSON.stringify(st.defaultValue)
                        : String(st.defaultValue ?? "")
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      let parsed: unknown = raw;
                      if (st.type === "number") parsed = Number(raw) || 0;
                      if (st.type === "boolean") parsed = raw === "true";
                      if (st.type === "array" || st.type === "object") {
                        try {
                          parsed = JSON.parse(raw);
                        } catch {
                          parsed = raw;
                        }
                      }
                      handleUpdateField(st.id, { defaultValue: parsed as any });
                    }}
                    placeholder={st.type === "string" ? 'e.g. "initial"' : st.type === "number" ? "0" : "false"}
                    className="h-6 text-[11px] font-mono bg-background/50 flex-1"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Add Form */}
      <div className="p-3 rounded-xl bg-secondary/20 border border-border/50 flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-foreground">Add Custom State</span>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={newVarName}
            onChange={(e) => setNewVarName(e.target.value)}
            placeholder="e.g. isFiltered"
            className="h-7 text-xs font-mono bg-background"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddState();
              }
            }}
          />
          <Select
            value={newVarType}
            onValueChange={(val) => setNewVarType(val as StateVariableType)}
          >
            <SelectTrigger className="h-7 text-xs font-mono bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">string</SelectItem>
              <SelectItem value="number">number</SelectItem>
              <SelectItem value="boolean">boolean</SelectItem>
              <SelectItem value="array">array</SelectItem>
              <SelectItem value="object">object</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={newVarDefault}
            onChange={(e) => setNewVarDefault(e.target.value)}
            placeholder="Initial value (optional)"
            className="h-7 text-xs font-mono bg-background flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddState();
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => handleAddState()}
            disabled={!newVarName.trim()}
            className="h-7 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shrink-0"
          >
            <Plus size={12} className="mr-1" />
            Add State
          </Button>
        </div>
      </div>
    </div>
  );
};
