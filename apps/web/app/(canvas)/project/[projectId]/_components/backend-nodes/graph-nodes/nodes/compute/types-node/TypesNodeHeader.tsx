"use client";

import React from "react";
import { Braces, Package, Settings, Trash, Plus, RefreshCw } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { LocalInput } from "../../../common/LocalInput";
import type { TypesNodeHeaderProps } from "./types";

export const TypesNodeHeader: React.FC<TypesNodeHeaderProps> = ({
  id,
  data,
  name,
  setName,
  isEditing,
  setIsEditing,
  isPackageNode,
  hasInstallError,
  isRefreshing,
  totalCount,
  inputRef,
  onSave,
  onDeleteNode,
  onRefresh,
  onAddType,
  onOpenConfig,
  onDelete,
}) => {
  const scope = data.scope || "global";

  return (
    <div className="flex items-center justify-between gap-2.5 px-3 pt-2">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          className={cn(
            "p-1.5 rounded-lg shrink-0 border",
            hasInstallError
              ? "bg-red-500/15 text-red-500 border-red-500/30"
              : isPackageNode
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
          )}
        >
          {isPackageNode ? <Package size={15} /> : <Braces size={15} />}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                "text-[8px] uppercase font-bold tracking-wider",
                hasInstallError
                  ? "text-red-500"
                  : isPackageNode
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-indigo-600 dark:text-indigo-400",
              )}
            >
              {isPackageNode ? "Package Types" : "Custom Types"}
            </span>

            {!isPackageNode && (
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
            )}

            {Boolean(data.isExtended) && (
              <span className="text-[7px] font-mono px-1 py-0.2 rounded font-medium bg-purple-500/15 text-purple-400">
                EXTENDED
              </span>
            )}

            {isPackageNode && (
              <span className="text-[7px] font-mono px-1 py-0.2 rounded font-medium bg-emerald-500/15 text-emerald-400">
                {data.packageName || "PKG"}
              </span>
            )}

            {hasInstallError && (
              <span className="text-[7px] font-mono px-1 py-0.2 rounded font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                NOT INSTALLED
              </span>
            )}

            {/* Type count badge */}
            {totalCount > 0 && (
              <span
                className={cn(
                  "text-[7px] font-mono px-1.5 py-0.2 rounded-full font-bold tabular-nums",
                  isPackageNode
                    ? "bg-emerald-500/10 text-emerald-500/80"
                    : "bg-indigo-500/10 text-indigo-500/80",
                )}
              >
                {totalCount}
              </span>
            )}
          </div>

          {isPackageNode ? (
            <span
              className="text-xs font-semibold text-foreground truncate"
              title={data.packageName || data.label || "Package Types"}
            >
              {data.packageName || data.label || "Package Types"}
            </span>
          ) : isEditing ? (
            <div
              className="nodrag nowheel nopan relative flex-1 min-w-0"
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onDragStart={(e) => e.stopPropagation()}
            >
              <LocalInput
                ref={inputRef}
                value={name}
                placeholder="Enter types label..."
                onChange={(e) => setName(e.target.value)}
                className="h-5 text-xs font-semibold px-1 py-0 bg-background/80 border-border/80 w-full"
                autoFocus
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSave();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    if (!data.label || !data.label.trim()) {
                      onDeleteNode();
                      return;
                    }
                    setName(data.label || "");
                    setIsEditing(false);
                  }
                }}
                onBlur={onSave}
              />
            </div>
          ) : (
            <span
              className="text-xs font-semibold text-foreground truncate hover:text-indigo-400 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              title={data.label || "Custom Types"}
            >
              {data.label || "Custom Types"}
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons: Plus (+ only for custom types), Gear (Settings), Trash (Delete) */}
      <div className="flex items-center gap-1 shrink-0">
        {isPackageNode && (
          <button
            className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer disabled:opacity-50"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Re-sync types from node_modules"
          >
            <RefreshCw size={12} className={cn(isRefreshing && "animate-spin")} />
          </button>
        )}
        {!isPackageNode && (
          <button
            className="p-1 rounded-md text-muted-foreground/70 hover:text-indigo-400 hover:bg-indigo-500/15 transition-colors cursor-pointer"
            onClick={onAddType}
            title="Add New Type"
          >
            <Plus size={14} />
          </button>
        )}
        <button
          className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
          onClick={onOpenConfig}
          title="Configure Node"
        >
          <Settings size={13} />
        </button>
        <button
          className="p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={onDelete}
          title="Delete Node"
        >
          <Trash size={13} />
        </button>
      </div>
    </div>
  );
};
