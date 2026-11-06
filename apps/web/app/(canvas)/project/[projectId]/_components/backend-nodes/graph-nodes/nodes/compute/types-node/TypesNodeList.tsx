"use client";

import React from "react";
import { Plus, ChevronDown } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { TypeRow } from "./TypeRow";
import type { TypesNodeListProps } from "./types";

export const TypesNodeList: React.FC<TypesNodeListProps> = ({
  nodeId,
  isPackageNode,
  serviceName,
  connectedTypes,
  restTypes,
  totalCount,
  shouldCollapse,
  isListCollapsed,
  setIsListCollapsed,
  hasIncomingEdge,
  hasOutgoingEdge,
  onOpenConfigForType,
  onExtendType,
  onDeleteType,
  onAddType,
}) => {
  return (
    <div className="flex flex-col border-t border-border/50">
      {totalCount > 0 ? (
        <>
          {/* ── PINNED SECTION: Extended / connected types ──────────────────
              These are always rendered outside any overflow container so
              xyflow can correctly position edge handles regardless of scroll. */}
          {connectedTypes.length > 0 && (
            <div className="flex flex-col">
              {connectedTypes.length > 0 && restTypes.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 border-b border-border/30 bg-purple-500/5">
                  <span className="text-[7px] uppercase font-bold tracking-wider text-purple-400/70">
                    {connectedTypes.some((t) => Boolean(t.extendedFrom))
                      ? connectedTypes.some((t) => !t.extendedFrom)
                        ? "Extended & Connected"
                        : "Extended"
                      : "Connected"}
                  </span>
                  <span className="text-[7px] font-mono text-purple-400/50">
                    {connectedTypes.length}
                  </span>
                </div>
              )}
              {connectedTypes.map((item) => (
                <TypeRow
                  key={item.id}
                  item={item}
                  isConnected
                  incoming={hasIncomingEdge(item.id)}
                  outgoing={hasOutgoingEdge(item.id)}
                  isPackageNode={isPackageNode}
                  serviceName={serviceName}
                  onOpenConfig={(e) => onOpenConfigForType(item.id, e)}
                  onExtend={(e) => {
                    e.stopPropagation();
                    onExtendType(item.id);
                  }}
                  onDelete={
                    !item.isReadOnly && !isPackageNode
                      ? (e) => onDeleteType(item.id, e)
                      : undefined
                  }
                />
              ))}
            </div>
          )}

          {/* ── SCROLLABLE SECTION: Rest of types (no active connections) ── */}
          {restTypes.length > 0 && (
            <div className="flex flex-col">
              {connectedTypes.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 border-t border-b border-border/30 bg-muted/20">
                  <span
                    className={cn(
                      "text-[7px] uppercase font-bold tracking-wider",
                      isPackageNode ? "text-emerald-500/60" : "text-indigo-400/60",
                    )}
                  >
                    All types
                  </span>
                  <span
                    className={cn(
                      "text-[7px] font-mono",
                      isPackageNode ? "text-emerald-500/40" : "text-indigo-400/40",
                    )}
                  >
                    {restTypes.length}
                  </span>
                </div>
              )}

              <div className="relative">
                <div
                  className={cn(
                    "flex flex-col overflow-y-auto transition-all duration-200",
                    shouldCollapse && isListCollapsed ? "max-h-[180px]" : "max-h-none",
                  )}
                >
                  {restTypes.map((item) => (
                    <TypeRow
                      key={item.id}
                      item={item}
                      isConnected={false}
                      incoming={hasIncomingEdge(item.id)}
                      outgoing={hasOutgoingEdge(item.id)}
                      isPackageNode={isPackageNode}
                      serviceName={serviceName}
                      onOpenConfig={(e) => onOpenConfigForType(item.id, e)}
                      onExtend={(e) => {
                        e.stopPropagation();
                        onExtendType(item.id);
                      }}
                      onDelete={
                        !item.isReadOnly && !isPackageNode
                          ? (e) => onDeleteType(item.id, e)
                          : undefined
                      }
                    />
                  ))}
                </div>

                {/* Fade overlay when collapsed */}
                {shouldCollapse && isListCollapsed && (
                  <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none bg-gradient-to-t from-card/95 via-card/60 to-transparent" />
                )}
              </div>

              {/* Show all / Collapse toggle */}
              {shouldCollapse && (
                <button
                  className={cn(
                    "w-full flex items-center justify-center gap-1 py-1 text-[9px] font-semibold transition-colors border-t border-border/40 cursor-pointer",
                    isPackageNode
                      ? "text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/5"
                      : "text-indigo-500/70 hover:text-indigo-400 hover:bg-indigo-500/5",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsListCollapsed((v) => !v);
                  }}
                >
                  {isListCollapsed ? (
                    <>
                      <span>Show all {restTypes.length} types</span>
                      <ChevronDown size={10} />
                    </>
                  ) : (
                    <>
                      <span>Collapse</span>
                      <ChevronDown size={10} className="rotate-180" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Add type button – custom types only */}
          {!isPackageNode && (
            <button
              className="w-full flex items-center justify-center gap-1.5 py-1 text-[10px] font-medium text-muted-foreground/70 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all border-t border-border/30 cursor-pointer"
              onClick={onAddType}
            >
              <Plus size={12} />
              <span>Add Type</span>
            </button>
          )}
        </>
      ) : (
        !isPackageNode && (
          <button
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md border border-dashed border-border/60 hover:border-indigo-500/40 text-xs text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/5 transition-all cursor-pointer"
            onClick={onAddType}
          >
            <Plus size={13} />
            <span>Add First Type</span>
          </button>
        )
      )}
    </div>
  );
};
