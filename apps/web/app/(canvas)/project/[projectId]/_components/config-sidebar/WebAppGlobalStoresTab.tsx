"use client";

import React, { useState } from "react";
import { Plus, Trash2, Database, Sparkles, Check, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { GlobalStoreDefinition, GlobalStoreField, GlobalStoreAction, StateVariableType, JsonValue } from "@workspace/canvas/types";
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

export interface WebAppGlobalStoresTabProps {
  stores: GlobalStoreDefinition[];
  onUpdateStores: (stores: GlobalStoreDefinition[]) => void;
}

const STORE_PRESETS: {
  name: string;
  description: string;
  fields: { name: string; type: StateVariableType; defaultValue: JsonValue }[];
  actions: { name: string; actionType: "set" | "append" | "remove" | "toggle" | "custom"; targetFieldName: string }[];
}[] = [
  {
    name: "cart",
    description: "Global shopping cart store",
    fields: [
      { name: "items", type: "array", defaultValue: [] },
      { name: "total", type: "number", defaultValue: 0 },
      { name: "currency", type: "string", defaultValue: "USD" },
    ],
    actions: [
      { name: "addItem", actionType: "append", targetFieldName: "items" },
      { name: "setTotal", actionType: "set", targetFieldName: "total" },
    ],
  },
  {
    name: "userPreferences",
    description: "User preferences & display settings",
    fields: [
      { name: "theme", type: "string", defaultValue: "system" },
      { name: "notificationsEnabled", type: "boolean", defaultValue: true },
      { name: "sidebarCollapsed", type: "boolean", defaultValue: false },
    ],
    actions: [
      { name: "toggleSidebar", actionType: "toggle", targetFieldName: "sidebarCollapsed" },
      { name: "setTheme", actionType: "set", targetFieldName: "theme" },
    ],
  },
];

export const WebAppGlobalStoresTab: React.FC<WebAppGlobalStoresTabProps> = ({
  stores = [],
  onUpdateStores,
}) => {
  const [newStoreName, setNewStoreName] = useState("");
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(stores[0]?.id || null);

  const handleAddStore = (preset?: typeof STORE_PRESETS[0]) => {
    const name = (preset ? preset.name : newStoreName).trim().replace(/[^a-zA-Z0-9_$]/g, "");
    if (!name) return;

    if (stores.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      return;
    }

    const newId = `store-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    let fields: GlobalStoreField[] = [
      { id: `f-${Date.now()}-1`, name: "data", type: "string", defaultValue: "" },
    ];
    let actions: GlobalStoreAction[] = [];

    if (preset) {
      fields = preset.fields.map((f, idx) => ({
        id: `f-${Date.now()}-${idx}`,
        name: f.name,
        type: f.type,
        defaultValue: f.defaultValue,
      }));

      actions = preset.actions.map((a, idx) => {
        const matchedField = fields.find((f) => f.name === a.targetFieldName);
        return {
          id: `act-${Date.now()}-${idx}`,
          name: a.name,
          targetFieldId: matchedField?.id,
          actionType: a.actionType,
        };
      });
    }

    const newStore: GlobalStoreDefinition = {
      id: newId,
      name,
      description: preset?.description || `Global ${name} store`,
      fields,
      actions,
    };

    onUpdateStores([...stores, newStore]);
    setNewStoreName("");
    setExpandedStoreId(newId);
  };

  const handleDeleteStore = (id: string) => {
    onUpdateStores(stores.filter((s) => s.id !== id));
  };

  const handleAddField = (storeId: string) => {
    const updated = stores.map((s) => {
      if (s.id !== storeId) return s;
      const newField: GlobalStoreField = {
        id: `f-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: `field${s.fields.length + 1}`,
        type: "string",
        defaultValue: "",
      };
      return { ...s, fields: [...s.fields, newField] };
    });
    onUpdateStores(updated);
  };

  const handleUpdateField = (storeId: string, fieldId: string, changes: Partial<GlobalStoreField>) => {
    const updated = stores.map((s) => {
      if (s.id !== storeId) return s;
      const fields = s.fields.map((f) => (f.id === fieldId ? { ...f, ...changes } : f));
      return { ...s, fields };
    });
    onUpdateStores(updated);
  };

  const handleDeleteField = (storeId: string, fieldId: string) => {
    const updated = stores.map((s) => {
      if (s.id !== storeId) return s;
      return { ...s, fields: s.fields.filter((f) => f.id !== fieldId) };
    });
    onUpdateStores(updated);
  };

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Informative Banner */}
      <div className="p-4 rounded-xl bg-card border border-border/70 shadow-xs flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Database size={16} className="text-indigo-500" />
            <span>Global Stores (Zustand)</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-semibold">
            {stores.length} {stores.length === 1 ? "store" : "stores"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Application-wide reactive stores generated into{" "}
          <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11px]">lib/stores/use[Store]Store.ts</code>.
          Zero wrapper overhead — any Client Section can subscribe directly without Provider nesting.
        </p>
      </div>

      {/* Quick Presets */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles size={13} className="text-indigo-400" />
          <span>Quick Store Presets</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {STORE_PRESETS.map((p) => {
            const isAdded = stores.some((s) => s.name === p.name);
            return (
              <button
                key={p.name}
                type="button"
                disabled={isAdded}
                onClick={() => handleAddStore(p)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer",
                  isAdded
                    ? "bg-muted/40 text-muted-foreground border-transparent opacity-50 cursor-not-allowed"
                    : "bg-secondary/40 hover:bg-secondary border-border/60 hover:border-indigo-500/30 text-foreground shadow-2xs"
                )}
              >
                {isAdded ? <Check size={12} className="text-emerald-500" /> : <Plus size={12} />}
                <span>{p.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">({p.fields.length} fields)</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stores List */}
      <div className="flex flex-col gap-3">
        <Label className="text-xs font-semibold text-foreground">Configured Stores</Label>

        {stores.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-border/60 rounded-xl flex flex-col items-center justify-center gap-2 bg-muted/10">
            <Layers size={22} className="text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground">No global stores configured</span>
            <span className="text-[11px] text-muted-foreground/60">
              Create a custom store or pick a preset above.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {stores.map((st) => {
              const isExpanded = expandedStoreId === st.id;
              const hookName = `use${st.name.charAt(0).toUpperCase() + st.name.slice(1)}Store`;

              return (
                <div
                  key={st.id}
                  className="rounded-xl bg-card border border-border/70 shadow-xs flex flex-col overflow-hidden transition-all"
                >
                  {/* Store Header */}
                  <div
                    className="p-3.5 bg-secondary/20 hover:bg-secondary/35 flex items-center justify-between gap-2 cursor-pointer select-none border-b border-border/40"
                    onClick={() => setExpandedStoreId(isExpanded ? null : st.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button type="button" className="p-0.5 text-muted-foreground hover:text-foreground">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <span className="text-xs font-bold font-mono text-foreground">{hookName}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        ({st.fields.length} {st.fields.length === 1 ? "field" : "fields"})
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteStore(st.id);
                      }}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      title="Delete store"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>

                  {/* Store Fields Body */}
                  {isExpanded && (
                    <div className="p-3.5 flex flex-col gap-3 bg-background/50">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          State Fields
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAddField(st.id)}
                          className="h-6 px-2 text-[10px] text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10 cursor-pointer"
                        >
                          <Plus size={11} className="mr-1" />
                          Add Field
                        </Button>
                      </div>

                      <div className="flex flex-col gap-2">
                        {st.fields.map((field) => (
                          <div
                            key={field.id}
                            className="p-2.5 rounded-lg bg-secondary/20 border border-border/50 flex flex-col gap-2"
                          >
                            <div className="flex items-center gap-2">
                              <Input
                                value={field.name}
                                onChange={(e) => handleUpdateField(st.id, field.id, { name: e.target.value })}
                                placeholder="fieldName"
                                className="h-7 text-xs font-mono bg-background flex-1"
                              />
                              <Select
                                value={field.type}
                                onValueChange={(val) =>
                                  handleUpdateField(st.id, field.id, { type: val as StateVariableType })
                                }
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
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteField(st.id, field.id)}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Custom Store */}
      <div className="p-3.5 rounded-xl bg-secondary/20 border border-border/50 flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-foreground">Create New Store</span>
        <div className="flex items-center gap-2">
          <Input
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            placeholder="e.g. notificationStore"
            className="h-8 text-xs font-mono bg-background flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddStore();
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => handleAddStore()}
            disabled={!newStoreName.trim()}
            className="h-8 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shrink-0"
          >
            <Plus size={13} className="mr-1" />
            Add Store
          </Button>
        </div>
      </div>
    </div>
  );
};
