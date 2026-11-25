"use client";

import React, { useState, useRef } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import {
  HardDrive,
  Settings,
  Edit3,
  Plus,
  Trash2,
  KeyRound,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { BrowserStorageKey, BrowserStorageEngine } from "@workspace/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toast } from "sonner";
import { LocalInput } from "../../common/LocalInput";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";

export const BrowserStorageNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const [isEditing, setIsEditing] = useState(!data.label && !data.storageName);
  const [name, setName] = useState(data.label || data.storageName || "");
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyType, setNewKeyType] = useState<BrowserStorageKey["type"]>("string");
  const inputRef = useRef<HTMLInputElement>(null);

  const currentStorageName = data.storageName || data.label || "BrowserStorage";
  const engine: BrowserStorageEngine = data.storageEngine || "localStorage";
  const keys: BrowserStorageKey[] = data.keys || [];
  const keyCount = keys.length;

  const handleSaveName = (rawValue?: string) => {
    const trimmed = (rawValue ?? inputRef.current?.value ?? name).trim();
    if (!trimmed) {
      setName(data.storageName || data.label || "BrowserStorage");
      setIsEditing(false);
      return;
    }
    updateNode(id, {
      data: {
        ...data,
        label: trimmed,
        storageName: trimmed,
      },
    });
    setIsEditing(false);
  };

  const handleToggleEngine = (newEngine: BrowserStorageEngine) => {
    updateNode(id, {
      data: {
        ...data,
        storageEngine: newEngine,
      },
    });
    toast.success(`Switched storage engine to ${newEngine}`);
  };

  const handleAddKey = () => {
    const trimmed = newKeyName.trim();
    if (!trimmed) {
      setIsAddingKey(false);
      return;
    }
    if (keys.some((k) => k.name === trimmed)) {
      toast.error(`Key "${trimmed}" already exists in this storage`);
      return;
    }

    const newKey: BrowserStorageKey = {
      id: crypto.randomUUID(),
      name: trimmed,
      type: newKeyType,
      defaultValue: newKeyType === "boolean" ? false : newKeyType === "number" ? 0 : "",
      description: "",
    };

    updateNode(id, {
      data: {
        ...data,
        keys: [...keys, newKey],
      },
    });

    setNewKeyName("");
    setIsAddingKey(false);
    toast.success(`Added storage key "${trimmed}"`);
  };

  const handleDeleteKey = (keyId: string) => {
    updateNode(id, {
      data: {
        ...data,
        keys: keys.filter((k) => k.id !== keyId),
      },
    });
  };

  const handleOpenConfig = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveConfigItem({
      type: "browser_storage",
      id,
      nodeId: id,
    });
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card/95 backdrop-blur-md shadow-md transition-all select-none min-w-[270px] max-w-[340px]",
        selected
          ? "border-emerald-500 shadow-emerald-500/15 ring-2 ring-emerald-500/20"
          : "border-border/70 hover:border-emerald-500/50",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Target Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="storage-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "!bg-emerald-500 !border-2 !border-background hover:scale-125 transition-all",
        )}
        style={{ top: "28px" }}
        title="Connect from WebPage or Action to access this storage"
      />

      {/* Header Container */}
      <div className="flex flex-col gap-1.5 p-3 pb-2.5 border-b border-border/50">
        <div className="flex items-center justify-between gap-2.5 w-full">
          {/* Icon + Label */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shrink-0">
              <HardDrive size={15} />
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              {isEditing ? (
                <div
                  className="nodrag nowheel nopan relative flex-1 min-w-0"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <LocalInput
                    ref={inputRef}
                    value={name}
                    debounceMs={0}
                    placeholder="Enter storage name..."
                    onChange={(e) => setName(e.target.value)}
                    className="h-6 text-xs font-bold px-1.5 py-0 bg-background/90 border-border/80 w-full"
                    autoFocus
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveName(e.currentTarget.value);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setName(data.storageName || data.label || "");
                        setIsEditing(false);
                      }
                    }}
                    onBlur={(e) => handleSaveName(e.currentTarget.value)}
                  />
                </div>
              ) : (
                <div
                  className="flex items-center gap-1.5 cursor-pointer min-w-0 group/name"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                  title="Click to rename"
                >
                  <span className="text-xs font-bold text-foreground tracking-wide truncate hover:text-emerald-400 transition-colors">
                    {currentStorageName}
                  </span>
                  <Edit3
                    size={10}
                    className="opacity-0 group-hover/name:opacity-70 text-muted-foreground transition-opacity shrink-0"
                  />
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground">
                <span>{keyCount} {keyCount === 1 ? "key" : "keys"}</span>
                <span>•</span>
                <span className="text-emerald-500 font-semibold">{engine}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-[9px] uppercase font-mono font-extrabold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20 cursor-pointer"
              onClick={handleOpenConfig}
              title="Open Browser Storage Configuration"
            >
              Config
            </Button>
            <button
              className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={handleOpenConfig}
              title="Configure Browser Storage"
            >
              <Settings size={13} />
            </button>
          </div>
        </div>

        {/* Engine Toggle Strip */}
        <div className="flex items-center gap-1 mt-1 pt-1 border-t border-border/30">
          <button
            type="button"
            onClick={() => handleToggleEngine("localStorage")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-0.5 px-1.5 rounded text-[10px] font-medium transition-all cursor-pointer",
              engine === "localStorage"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs font-semibold"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground border border-transparent",
            )}
            title="Persists across browser restarts"
          >
            <ShieldCheck size={10} />
            <span>localStorage</span>
          </button>
          <button
            type="button"
            onClick={() => handleToggleEngine("sessionStorage")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 py-0.5 px-1.5 rounded text-[10px] font-medium transition-all cursor-pointer",
              engine === "sessionStorage"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs font-semibold"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground border border-transparent",
            )}
            title="Cleared when active browser tab closes"
          >
            <Clock size={10} />
            <span>sessionStorage</span>
          </button>
        </div>
      </div>

      {/* Keys List */}
      <div className="p-2 space-y-1">
        {keys.length === 0 ? (
          <div className="text-center py-3 text-[11px] text-muted-foreground/80 italic">
            No keys defined. Click + to add a key.
          </div>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className="relative flex items-center justify-between p-1.5 rounded-md bg-muted/20 hover:bg-muted/40 border border-border/30 text-xs group/item transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1">
                <KeyRound size={11} className="text-emerald-500 shrink-0" />
                <span className="font-mono text-[11px] font-semibold text-foreground truncate">
                  {k.name}
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 h-4 uppercase font-mono font-medium border-emerald-500/30 text-emerald-500/90 shrink-0 ml-auto"
                >
                  {k.type}
                </Badge>
              </div>

              {/* Delete key button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteKey(k.id);
                }}
                className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded hover:text-destructive text-muted-foreground transition-all cursor-pointer shrink-0 ml-1"
                title="Remove key"
              >
                <Trash2 size={11} />
              </button>

              {/* Per-Key Handles for precision wiring */}
              <Handle
                type="target"
                position={Position.Left}
                id={`storage-key-in-${k.id}`}
                className={cn(CANVAS_HANDLE_CLASS, CANVAS_HANDLE_LEFT_OFFSET_CLASS, "!bg-emerald-500 !border-2 !border-background hover:scale-125 transition-all")}
                style={{ top: "50%" }}
                title={`Setter target for ${k.name}`}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={`storage-key-out-${k.id}`}
                className={cn(CANVAS_HANDLE_CLASS, CANVAS_HANDLE_RIGHT_OFFSET_CLASS, "!bg-emerald-500 !border-2 !border-background hover:scale-125 transition-all")}
                style={{ top: "50%" }}
                title={`Getter source for ${k.name}`}
              />
            </div>
          ))
        )}

        {/* Inline Add Key Input */}
        {isAddingKey ? (
          <div
            className="nodrag nowheel nopan flex items-center gap-1 p-1 rounded-md bg-muted/30 border border-emerald-500/40"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              value={newKeyName}
              placeholder="Key name..."
              onChange={(e) => setNewKeyName(e.target.value)}
              className="h-6 text-xs font-mono px-1.5 bg-background border border-border/60 rounded flex-1 min-w-0"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddKey();
                }
                if (e.key === "Escape") {
                  setIsAddingKey(false);
                  setNewKeyName("");
                }
              }}
            />
            <Select
              value={newKeyType}
              onValueChange={(val: BrowserStorageKey["type"]) => setNewKeyType(val)}
            >
              <SelectTrigger className="h-6 text-[10px] w-20 px-1 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">string</SelectItem>
                <SelectItem value="number">number</SelectItem>
                <SelectItem value="boolean">boolean</SelectItem>
                <SelectItem value="object">object</SelectItem>
                <SelectItem value="array">array</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              onClick={handleAddKey}
            >
              Add
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingKey(true)}
            className="w-full flex items-center justify-center gap-1 py-1 rounded-md border border-dashed border-border/60 hover:border-emerald-500/60 text-muted-foreground hover:text-emerald-500 text-[11px] font-medium transition-colors cursor-pointer"
          >
            <Plus size={12} />
            <span>Add Storage Key</span>
          </button>
        )}
      </div>

      {/* Node-level Source Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="storage-out"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
          "!bg-emerald-500 !border-2 !border-background hover:scale-125 transition-all",
        )}
        style={{ top: "28px" }}
        title="Connect to WebPage to expose storage keys"
      />
    </div>
  );
};
