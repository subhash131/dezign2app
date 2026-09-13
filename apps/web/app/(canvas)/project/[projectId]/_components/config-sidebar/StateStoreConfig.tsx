"use client";

import React, { useState } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Database,
  Plus,
  Trash2,
  Sparkles,
  Layers,
  HardDrive,
  Globe,
  FileCode,
  Link,
} from "lucide-react";
import {
  GlobalStoreField,
  GlobalStoreAction,
  StateVariableType,
} from "@workspace/canvas/types";
import { cn } from "@workspace/ui/lib/utils";

export interface StateStoreConfigProps {
  id: string;
  nodeId: string;
}

interface StorePreset {
  name: string;
  description: string;
  storage: "memory" | "localStorage" | "sessionStorage";
  fields: Array<{
    name: string;
    type: StateVariableType;
    defaultValue: string | number | boolean | null;
  }>;
  actions: Array<{
    name: string;
    actionType: "set" | "append" | "remove" | "toggle" | "custom";
    targetFieldName: string;
  }>;
}

const STORE_PRESETS: StorePreset[] = [
  {
    name: "Cart",
    description: "Shopping cart state with items and total",
    storage: "localStorage",
    fields: [
      { name: "items", type: "array", defaultValue: null },
      { name: "total", type: "number", defaultValue: 0 },
      { name: "currency", type: "string", defaultValue: "USD" },
    ],
    actions: [
      { name: "addItem", actionType: "append", targetFieldName: "items" },
      { name: "setTotal", actionType: "set", targetFieldName: "total" },
    ],
  },
  {
    name: "UserSession",
    description: "User authentication session and preferences",
    storage: "memory",
    fields: [
      { name: "userId", type: "string", defaultValue: "" },
      { name: "isAuthenticated", type: "boolean", defaultValue: false },
      { name: "theme", type: "string", defaultValue: "system" },
    ],
    actions: [
      { name: "logout", actionType: "set", targetFieldName: "isAuthenticated" },
      { name: "setTheme", actionType: "set", targetFieldName: "theme" },
    ],
  },
  {
    name: "UIState",
    description: "Modal, sidebar, and view filter toggles",
    storage: "memory",
    fields: [
      { name: "sidebarOpen", type: "boolean", defaultValue: true },
      { name: "activeFilter", type: "string", defaultValue: "all" },
      { name: "searchQuery", type: "string", defaultValue: "" },
    ],
    actions: [
      { name: "toggleSidebar", actionType: "toggle", targetFieldName: "sidebarOpen" },
      { name: "setSearchQuery", actionType: "set", targetFieldName: "searchQuery" },
    ],
  },
];

export const StateStoreConfig: React.FC<StateStoreConfigProps> = ({
  id,
  nodeId,
}) => {
  const node = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === (nodeId || id)),
  );
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const allEdges = useBackendCanvasStore((s) => s.edges);

  if (!node) return null;

  const data = node.data;
  const webAppNodes = allNodes.filter((n) => n.type === "webApp");
  const webPageNodes = allNodes.filter((n) => n.type === "webPage");

  const storeName = data.storeName || data.label || "App";
  const scope = data.scope || "global";
  const storage = data.storage || "memory";
  const targetWebAppId = data.targetWebAppId || webAppNodes[0]?.id;
  const targetPageId = data.targetPageId;
  const fields: GlobalStoreField[] = data.fields || [];
  const actions: GlobalStoreAction[] = data.actions || [];

  const rawBase = storeName.trim().replace(/[^a-zA-Z0-9_$]/g, "");
  const baseName = rawBase.charAt(0).toUpperCase() + rawBase.slice(1);
  const hookName = baseName.endsWith("Store") ? `use${baseName}` : `use${baseName}Store`;

  // Connected pages via graph edges
  const connectedPageIds = allEdges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => (e.source === node.id ? e.target : e.source));
  const connectedPages = webPageNodes.filter((p) => connectedPageIds.includes(p.id));

  const handleApplyPreset = (preset: StorePreset) => {
    const newFields: GlobalStoreField[] = preset.fields.map((f, idx) => ({
      id: `f-${Date.now()}-${idx}`,
      name: f.name,
      type: f.type,
      defaultValue: f.defaultValue,
    }));

    const newActions: GlobalStoreAction[] = preset.actions.map((a, idx) => {
      const matchedField = newFields.find((f) => f.name === a.targetFieldName);
      return {
        id: `act-${Date.now()}-${idx}`,
        name: a.name,
        targetFieldId: matchedField?.id,
        actionType: a.actionType,
      };
    });

    updateNode(node.id, {
      data: {
        ...data,
        label: `${preset.name}Store`,
        storeName: preset.name,
        description: preset.description,
        storage: preset.storage,
        fields: newFields,
        actions: newActions,
      },
    });
  };

  const handleAddField = () => {
    const newField: GlobalStoreField = {
      id: `f-${Date.now()}`,
      name: `field${fields.length + 1}`,
      type: "string",
      defaultValue: "",
    };
    updateNode(node.id, {
      data: {
        ...data,
        fields: [...fields, newField],
      },
    });
  };

  const handleUpdateField = (fieldId: string, patch: Partial<GlobalStoreField>) => {
    const updated = fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f));
    updateNode(node.id, {
      data: {
        ...data,
        fields: updated,
      },
    });
  };

  const handleRemoveField = (fieldId: string) => {
    const updatedFields = fields.filter((f) => f.id !== fieldId);
    const updatedActions = actions.filter((a) => a.targetFieldId !== fieldId);
    updateNode(node.id, {
      data: {
        ...data,
        fields: updatedFields,
        actions: updatedActions,
      },
    });
  };

  const handleAddAction = () => {
    const newAction: GlobalStoreAction = {
      id: `act-${Date.now()}`,
      name: `update${fields[0]?.name ? fields[0].name.charAt(0).toUpperCase() + fields[0].name.slice(1) : "State"}`,
      targetFieldId: fields[0]?.id,
      actionType: "set",
    };
    updateNode(node.id, {
      data: {
        ...data,
        actions: [...actions, newAction],
      },
    });
  };

  const handleUpdateAction = (actionId: string, patch: Partial<GlobalStoreAction>) => {
    const updated = actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a));
    updateNode(node.id, {
      data: {
        ...data,
        actions: updated,
      },
    });
  };

  const handleRemoveAction = (actionId: string) => {
    updateNode(node.id, {
      data: {
        ...data,
        actions: actions.filter((a) => a.id !== actionId),
      },
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
            <Database size={16} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              State Store
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1 py-0 uppercase font-mono",
                  scope === "global"
                    ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
                    : "text-sky-400 border-sky-500/30 bg-sky-500/10",
                )}
              >
                {scope}
              </Badge>
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono">
              {hookName}()
            </p>
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center gap-1 text-[11px] font-medium text-foreground">
          <Sparkles size={12} className="text-amber-400" />
          <span>Quick Presets</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {STORE_PRESETS.map((preset) => (
            <Button
              key={preset.name}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleApplyPreset(preset)}
              className="h-6 text-[10px] px-2 bg-background/50 hover:bg-indigo-500/10 hover:text-indigo-400 hover:border-indigo-500/30 transition-all"
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Store Identity */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Store Name</Label>
          <Input
            value={storeName}
            onChange={(e) => {
              const val = e.target.value;
              updateNode(node.id, {
                data: {
                  ...data,
                  storeName: val,
                  label: val,
                },
              });
            }}
            placeholder="e.g. Cart, UserPreferences"
            className="h-8 text-xs font-medium"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Description</Label>
          <Input
            value={data.description || ""}
            onChange={(e) =>
              updateNode(node.id, {
                data: { ...data, description: e.target.value },
              })
            }
            placeholder="Brief purpose of this store..."
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Scope & Persistence */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Scope</Label>
          <Select
            value={scope}
            onValueChange={(val: "global" | "local") =>
              updateNode(node.id, {
                data: { ...data, scope: val },
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global (WebApp-Wide)</SelectItem>
              <SelectItem value="local">Local (Page-Scoped)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Storage</Label>
          <Select
            value={storage}
            onValueChange={(val: "memory" | "localStorage" | "sessionStorage") =>
              updateNode(node.id, {
                data: { ...data, storage: val },
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="memory">Memory (RAM)</SelectItem>
              <SelectItem value="localStorage">Local Storage</SelectItem>
              <SelectItem value="sessionStorage">Session Storage</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Scope Target Details */}
      {scope === "local" && (
        <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-sky-500/5 border border-sky-500/20">
          <Label className="text-[11px] font-semibold text-sky-400">Target Page</Label>
          <Select
            value={targetPageId || "none"}
            onValueChange={(val) =>
              updateNode(node.id, {
                data: { ...data, targetPageId: val === "none" ? undefined : val },
              })
            }
          >
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue placeholder="Select target page..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Auto-detect from edge</SelectItem>
              {webPageNodes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.data?.label || p.data?.path || p.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground">
            Local stores compile into the page directory: <code>app/[page]/_stores/</code>
          </span>
        </div>
      )}

      {/* WebApp Owning Boundary */}
      {webAppNodes.length > 1 && (
        <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-muted/20 border border-border/40">
          <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <Globe size={11} />
            <span>Owning Web App</span>
          </Label>
          <Select
            value={targetWebAppId || "auto"}
            onValueChange={(val) =>
              updateNode(node.id, {
                data: { ...data, targetWebAppId: val === "auto" ? undefined : val },
              })
            }
          >
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue placeholder="Auto (connected app)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (from connections)</SelectItem>
              {webAppNodes.map((app) => (
                <SelectItem key={app.id} value={app.id}>
                  {app.data?.label || app.data?.appSlug || app.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Connected Pages Display */}
      {connectedPages.length > 0 && (
        <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-400">
            <Link size={12} />
            <span>Connected Pages ({connectedPages.length})</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {connectedPages.map((p) => (
              <Badge
                key={p.id}
                variant="secondary"
                className="text-[10px] bg-background/80 font-mono"
              >
                {p.data?.label || p.data?.path || p.id}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Fields Builder */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-border/40">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers size={13} />
            <span>State Fields ({fields.length})</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddField}
            className="h-6 text-[10px] px-2 gap-1 text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10 border-indigo-500/30"
          >
            <Plus size={11} />
            <span>Add Field</span>
          </Button>
        </div>

        {fields.length === 0 ? (
          <div className="p-3 text-center text-[11px] text-muted-foreground bg-muted/20 rounded-md border border-dashed border-border/60">
            No fields defined. Click &quot;Add Field&quot; or pick a preset above.
          </div>
        ) : (
          <div className="space-y-2">
            {fields.map((f) => (
              <div
                key={f.id}
                className="p-2.5 rounded-lg bg-card/60 border border-border/60 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={f.name}
                    onChange={(e) => handleUpdateField(f.id, { name: e.target.value })}
                    placeholder="Field name (e.g. count)"
                    className="h-7 text-xs font-mono flex-1"
                  />
                  <Select
                    value={f.type}
                    onValueChange={(val: StateVariableType) =>
                      handleUpdateField(f.id, { type: val })
                    }
                  >
                    <SelectTrigger className="h-7 text-xs w-28">
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
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveField(f.id)}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono w-16 shrink-0">
                    Default:
                  </span>
                  <Input
                    value={
                      f.defaultValue !== undefined && f.defaultValue !== null
                        ? String(f.defaultValue)
                        : ""
                    }
                    onChange={(e) => {
                      let val: string | number | boolean = e.target.value;
                      if (f.type === "number") {
                        val = Number(val) || 0;
                      } else if (f.type === "boolean") {
                        val = val === "true";
                      }
                      handleUpdateField(f.id, { defaultValue: val });
                    }}
                    placeholder={`e.g. ${f.type === "number" ? "0" : f.type === "boolean" ? "false" : '""'}`}
                    className="h-6 text-[11px] font-mono bg-background/50 flex-1"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions Builder */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-border/40">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FileCode size={13} />
            <span>Store Actions ({actions.length})</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddAction}
            className="h-6 text-[10px] px-2 gap-1 text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10 border-indigo-500/30"
          >
            <Plus size={11} />
            <span>Add Action</span>
          </Button>
        </div>

        {actions.length === 0 ? (
          <div className="p-3 text-center text-[11px] text-muted-foreground bg-muted/20 rounded-md border border-dashed border-border/60">
            No custom actions. Default setters (<code>setX</code>) and <code>reset()</code> are automatically generated.
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map((act) => (
              <div
                key={act.id}
                className="p-2.5 rounded-lg bg-card/60 border border-border/60 flex items-center gap-2"
              >
                <Input
                  value={act.name}
                  onChange={(e) => handleUpdateAction(act.id, { name: e.target.value })}
                  placeholder="Action name"
                  className="h-7 text-xs font-mono flex-1"
                />
                <Select
                  value={act.actionType}
                  onValueChange={(val: GlobalStoreAction["actionType"]) =>
                    handleUpdateAction(act.id, { actionType: val })
                  }
                >
                  <SelectTrigger className="h-7 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">set</SelectItem>
                    <SelectItem value="append">append</SelectItem>
                    <SelectItem value="remove">remove</SelectItem>
                    <SelectItem value="toggle">toggle</SelectItem>
                    <SelectItem value="custom">custom</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={act.targetFieldId || "none"}
                  onValueChange={(val) =>
                    handleUpdateAction(act.id, {
                      targetFieldId: val === "none" ? undefined : val,
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs w-28 font-mono">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {fields.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveAction(act.id)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
