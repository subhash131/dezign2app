"use client";

import React, { useState, useEffect, useRef } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Shuffle, Settings, Trash, AlertTriangle, Package } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { LocalInput } from "../../common/LocalInput";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";
import { toVarName } from "@/lib/compiler/utils";
import { toast } from "sonner";

export const TransformerNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const hasPipelineError = useNodePipelineError(id);
  const nodes = useBackendCanvasStore((s) => s.nodes);
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

  const [isEditing, setIsEditing] = useState(!data.label && !data.functionName);
  const [name, setName] = useState(data.label || data.functionName || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const raw = data.label || data.functionName || "";
    if (raw) {
      const formatted = toVarName(raw);
      setName(formatted);
      if (formatted !== data.label || formatted !== data.functionName) {
        updateNode(id, {
          data: {
            ...data,
            label: formatted,
            functionName: formatted,
          },
        });
      }
    } else {
      setName("");
      if (!data.label && !data.functionName) {
        setIsEditing(true);
      }
    }
  }, [data.label, data.functionName, id, updateNode]);

  useEffect(() => {
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
      if (!data.label && !data.functionName) {
        deleteNode(id);
        return;
      }
      const fallback = toVarName(data.label || data.functionName || "") || "transformer";
      setName(fallback);
      setIsEditing(false);
      return;
    }
    const formatted = toVarName(trimmed);
    const isDuplicate = nodes.some(
      (n) =>
        n.id !== id &&
        n.type === "transformer" &&
        toVarName(n.data?.functionName || n.data?.label || "").toLowerCase() ===
          formatted.toLowerCase(),
    );

    if (isDuplicate) {
      toast.error(
        `A transformer named "${formatted}" already exists. Transformer names must be unique.`,
      );
      if (!data.label && !data.functionName) {
        setIsEditing(true);
      } else {
        setName(toVarName(data.label || data.functionName || ""));
        setIsEditing(false);
      }
      return;
    }

    updateNode(id, {
      data: {
        ...data,
        label: formatted,
        functionName: formatted,
      },
    });
    setName(formatted);
    setIsEditing(false);
  };

  const handleOpenConfig = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveConfigItem({
      id,
      nodeId: id,
      type: "transformer",
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  const isDuplicateName = React.useMemo(() => {
    const currentName = toVarName(data.label || data.functionName || "");
    if (!currentName) return false;
    return nodes.some(
      (n) =>
        n.id !== id &&
        n.type === "transformer" &&
        toVarName(n.data?.functionName || n.data?.label || "").toLowerCase() ===
          currentName.toLowerCase(),
    );
  }, [nodes, id, data.label, data.functionName]);

  const scope = data.scope || "global";

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-card/95 backdrop-blur border-2 min-w-[220px] max-w-[280px] shadow-md transition-all duration-150 cursor-pointer select-none",
        selected
          ? "border-purple-500 shadow-purple-500/15 ring-1 ring-purple-500/20"
          : "border-border/80 hover:border-purple-500/50 hover:shadow-lg",
        (hasPipelineError || isDuplicateName) &&
          "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Types Reference Target Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="types-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "!bg-indigo-400 rounded-full border-2 border-background opacity-0 group-hover:opacity-100 transition-all hover:scale-125",
        )}
        style={{ top: "14px" }}
        title="Package Types / Custom Types Reference"
      />

      {/* Invocation / Action Target Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="transformer-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "!bg-purple-500 border-2 border-background hover:scale-125 transition-all",
        )}
        title="Action / Invocation Target"
      />

      <div className="flex items-center justify-between gap-3 w-full">
        {/* Icon + Label */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0">
            <Shuffle size={14} />
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase font-bold tracking-wider text-purple-600 dark:text-purple-400">
                Transformer
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
              {data.packageImports && data.packageImports.length > 0 && (
                <span
                  className="text-[7px] font-mono px-1 py-0.2 rounded font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 flex items-center gap-0.5"
                  title={`${data.packageImports.length} package import(s) configured`}
                >
                  <Package size={7} />
                  {data.packageImports.length}
                </span>
              )}
              {isDuplicateName && (
                <span
                  className="text-[7px] font-medium px-1 py-0.2 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse"
                  title="Transformer names must be unique"
                >
                  <AlertTriangle size={8} />
                  Duplicate
                </span>
              )}
              {hasPipelineError && (
                <span className="text-[7px] font-medium px-1 py-0.2 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse">
                  <AlertTriangle size={8} />
                  Unmapped
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
                  placeholder="Enter transformer name..."
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
                      if (!data.label && !data.functionName) {
                        deleteNode(id);
                        return;
                      }
                      setName(data.label || data.functionName || "");
                      setIsEditing(false);
                    }
                  }}
                  onBlur={handleSave}
                />
              </div>
            ) : (
              <span
                className="text-xs font-semibold text-foreground truncate hover:text-purple-400 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                title={toVarName(data.label || data.functionName || "") || "transformer"}
              >
                {toVarName(data.label || data.functionName || "") || "transformer"}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons: Gear (Settings) + Delete */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
            onClick={handleOpenConfig}
            title="Configure Transformer Settings & Packages"
          >
            <Settings size={13} />
          </button>
          <button
            className="p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            onClick={handleDelete}
            title="Delete Node"
          >
            <Trash size={13} />
          </button>
        </div>
      </div>

      {isDuplicateName && (
        <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-destructive/10 border border-destructive/20 text-[10px] text-destructive leading-tight">
          <AlertTriangle size={11} className="shrink-0" />
          <span className="font-medium">Transformer name &quot;{toVarName(data.label || data.functionName || "")}&quot; is already in use</span>
        </div>
      )}

      {hasPipelineError && (
        <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-destructive/10 border border-destructive/20 text-[10px] text-destructive leading-tight">
          <AlertTriangle size={11} className="shrink-0" />
          <span className="font-medium">Missing required input mapping</span>
        </div>
      )}

      {/* Single outgoing handle on the right */}
      <Handle
        type="source"
        position={Position.Right}
        id="transformer-out"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
          "!bg-purple-500 border-2 border-background hover:scale-125 transition-all",
        )}
      />
    </div>
  );
};

