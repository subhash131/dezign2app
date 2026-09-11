"use client";

import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Anchor, Settings, Trash } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { LocalInput } from "../../common/LocalInput";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";

export const HookNode = ({
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

  const [isEditing, setIsEditing] = useState(!data.label && !data.hookName);
  const [name, setName] = useState(data.label || data.hookName || "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setName(data.label || data.hookName || "");
    if (!data.label && !data.hookName) {
      setIsEditing(true);
    }
  }, [data.label, data.hookName]);

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
      if (!data.label && !data.hookName) {
        deleteNode(id);
        return;
      }
      setName(data.label || data.hookName || "");
      setIsEditing(false);
      return;
    }
    updateNode(id, {
      data: {
        ...data,
        label: trimmed,
        hookName: trimmed,
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
      type: "hook",
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  const scope = data.scope || "global";
  const hookType = (data.hookType || "query").toUpperCase();

  return (
    <div
      className={cn(
        "group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-card/95 backdrop-blur border-2 min-w-[220px] max-w-[280px] shadow-md transition-all duration-150 cursor-pointer select-none",
        selected
          ? "border-cyan-500 shadow-cyan-500/15 ring-1 ring-cyan-500/20"
          : "border-border/80 hover:border-cyan-500/50 hover:shadow-lg",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Input handle on the left to receive Endpoint or Event connections */}
      <Handle
        type="target"
        position={Position.Left}
        id="hook-in"
        className="w-2.5 h-2.5 !bg-cyan-500 border-2 border-background"
      />

      {/* Icon + Label */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shrink-0">
          <Anchor size={14} />
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] uppercase font-bold tracking-wider text-cyan-600 dark:text-cyan-400">
              Hook
            </span>
            <span
              className={cn(
                "text-[7px] font-mono px-1 py-0.2 rounded font-medium",
                scope === "global"
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-sky-500/10 text-sky-400",
              )}
            >
              {scope === "global" ? "GLOBAL" : "LOCAL"}
            </span>
            <span className="text-[7px] font-mono px-1 py-0.2 rounded bg-muted text-muted-foreground font-medium">
              {hookType}
            </span>
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
                placeholder="Enter hook name..."
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
                    if (!data.label && !data.hookName) {
                      deleteNode(id);
                      return;
                    }
                    setName(data.label || data.hookName || "");
                    setIsEditing(false);
                  }
                }}
                onBlur={handleSave}
              />
            </div>
          ) : (
            <span
              className="text-xs font-semibold text-foreground truncate hover:text-cyan-400 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              title={data.label || data.hookName || "Hook"}
            >
              {data.label || data.hookName || "Hook"}
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons: Gear (Settings) + Delete */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
          onClick={handleOpenConfig}
          title="Configure Hook"
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

      {/* Single outgoing handle on the right to feed WebPage or Component */}
      <Handle
        type="source"
        position={Position.Right}
        id="hook-out"
        className="w-2.5 h-2.5 !bg-cyan-500 border-2 border-background"
      />
    </div>
  );
};
