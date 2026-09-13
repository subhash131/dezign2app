"use client";

import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Database, Settings, Trash, Layers } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { LocalInput } from "../../common/LocalInput";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";

export const StateStoreNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const [isEditing, setIsEditing] = useState(!data.label && !data.storeName);
  const [name, setName] = useState(data.label || data.storeName || "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setName(data.label || data.storeName || "");
    if (!data.label && !data.storeName) {
      setIsEditing(true);
    }
  }, [data.label, data.storeName]);

  React.useEffect(() => {
    if (isEditing) {
      const focus = () => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      };
      const raf = requestAnimationFrame(focus);
      const timer = setTimeout(focus, 50);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      if (!data.label && !data.storeName) {
        deleteNode(id);
        return;
      }
      setName(data.label || data.storeName || "");
      setIsEditing(false);
      return;
    }
    updateNode(id, {
      data: {
        ...data,
        label: trimmed,
        storeName: trimmed,
      },
    });
    setName(trimmed);
    setIsEditing(false);
  };

  const handleOpenConfig = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveConfigItem({
      id,
      nodeId: id,
      type: "state_store",
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  const scope = data.scope || "global";
  const storage = data.storage || "memory";

  const handleToggleScope = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextScope = scope === "global" ? "local" : "global";
    updateNode(id, {
      data: {
        ...data,
        scope: nextScope,
      },
    });
  };

  const fieldCount = data.fields?.length || 0;
  const actionCount = data.actions?.length || 0;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-card/95 backdrop-blur border-2 min-w-[220px] max-w-[280px] shadow-md transition-all duration-150 cursor-pointer select-none",
        selected
          ? "border-indigo-500 shadow-indigo-500/15 ring-1 ring-indigo-500/20"
          : "border-border/80 hover:border-indigo-500/50 hover:shadow-lg",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Incoming handle on the left (target) */}
      <Handle
        type="target"
        position={Position.Left}
        id="store-in"
        className="w-2.5 h-2.5 !bg-indigo-500 border-2 border-background"
      />

      <div className="flex items-center justify-between gap-3 w-full">
        {/* Icon + Label */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 shrink-0">
            <Database size={14} />
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">
                State Store
              </span>
              <button
                type="button"
                onClick={handleToggleScope}
                className={cn(
                  "text-[7px] font-mono px-1 py-0.2 rounded font-medium border transition-colors cursor-pointer",
                  scope === "global"
                    ? "bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/25"
                    : "bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25",
                )}
                title="Click to toggle Global / Local scope"
              >
                {scope === "global" ? "GLOBAL" : "LOCAL"}
              </button>
              {storage !== "memory" && (
                <span className="text-[7px] font-mono px-1 py-0.2 rounded font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {storage === "localStorage" ? "LOCAL" : "SESSION"}
                </span>
              )}
            </div>

            {isEditing ? (
              <div
                className="nodrag nowheel nopan relative flex-1 min-w-0"
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onDragStart={(e) => e.stopPropagation()}
              >
                <LocalInput
                  ref={inputRef}
                  value={name}
                  placeholder="Enter store name..."
                  onChange={(e) => setName(e.target.value)}
                  className="h-5 text-xs font-semibold px-1 py-0 bg-background/80 border-border/80 w-full"
                  autoFocus
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSave();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      if (!data.label && !data.storeName) {
                        deleteNode(id);
                        return;
                      }
                      setName(data.label || data.storeName || "");
                      setIsEditing(false);
                    }
                  }}
                  onBlur={handleSave}
                />
              </div>
            ) : (
              <span
                className="text-xs font-semibold text-foreground truncate hover:text-indigo-400 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                title={data.label || data.storeName || "StateStore"}
              >
                {data.label || data.storeName || "StateStore"}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons: Gear (Settings) + Delete */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
            onClick={handleOpenConfig}
            title="Configure State Store"
          >
            <Settings size={13} />
          </button>
          <button
            className="p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={handleDelete}
            title="Delete Node"
          >
            <Trash size={13} />
          </button>
        </div>
      </div>

      {/* Info footer: fields and actions count */}
      <div className="flex items-center gap-2 pt-0.5 text-[10px] text-muted-foreground font-mono">
        <span className="flex items-center gap-1">
          <Layers size={10} className="text-indigo-400/80" />
          {fieldCount} {fieldCount === 1 ? "field" : "fields"}
        </span>
        <span>•</span>
        <span>{actionCount} {actionCount === 1 ? "action" : "actions"}</span>
      </div>

      {/* Outgoing handle on the right (source) */}
      <Handle
        type="source"
        position={Position.Right}
        id="store-out"
        className="w-2.5 h-2.5 !bg-indigo-500 border-2 border-background"
      />
    </div>
  );
};
