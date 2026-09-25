"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  Database,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  X,
  Server,
  Globe,
  Radio,
  Braces,
  Cpu,
} from "lucide-react";
import type { TypesNodeEntityWarningBannerProps } from "./types";

function getNodeIcon(type?: string) {
  switch (type) {
    case "service":
      return Server;
    case "webApp":
    case "webPage":
      return Globe;
    case "types":
      return Braces;
    case "agent":
    case "langgraph":
    case "compute":
      return Cpu;
    default:
      return Radio;
  }
}

export const TypesNodeEntityWarningBanner: React.FC<
  TypesNodeEntityWarningBannerProps
> = ({
  sourceEntityName,
  sourceEntityId,
  affectedNodes,
  updatedAt,
  onViewEntity,
  onDismiss,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="mx-2.5 p-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 dark:text-amber-200 flex flex-col gap-1.5 shadow-xs">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertTriangle size={13} className="text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold text-amber-300 truncate">
            Derived from Entity
          </span>
          <span className="text-[7px] font-mono px-1 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 shrink-0 uppercase tracking-wide">
            AUTO-SYNCED
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            className="text-amber-400/80 hover:text-amber-200 p-0.5 rounded hover:bg-amber-500/20 transition-colors cursor-pointer"
            title={isExpanded ? "Collapse banner" : "Expand banner"}
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {onDismiss && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="text-amber-400/70 hover:text-amber-200 p-0.5 rounded hover:bg-amber-500/20 transition-colors cursor-pointer"
              title="Dismiss warning"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-amber-200/90 leading-tight">
        <Database size={10} className="text-amber-400 shrink-0" />
        <span className="truncate">
          Source table: <strong>{sourceEntityName || "Entity"}</strong>
        </span>
        {onViewEntity && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewEntity();
            }}
            className="inline-flex items-center gap-0.5 ml-auto text-[9px] text-amber-300 hover:text-amber-100 hover:underline cursor-pointer shrink-0"
            title="Focus entity node on canvas"
          >
            <span>View Table</span>
            <ExternalLink size={9} />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-1 pt-1 border-t border-amber-500/20">
          <p className="text-[9.5px] text-amber-300/80 leading-snug">
            Column changes in <strong>{sourceEntityName}</strong> automatically
            update this contract.
          </p>

          {affectedNodes.length > 0 ? (
            <div className="flex flex-col gap-1 mt-0.5">
              <span className="text-[9px] font-semibold text-amber-400 flex items-center gap-1">
                ⚠️ {affectedNodes.length} downstream component{affectedNodes.length > 1 ? "s" : ""} affected:
              </span>
              <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto pr-0.5">
                {affectedNodes.map((node) => {
                  const Icon = getNodeIcon(node.type);
                  return (
                    <span
                      key={node.id}
                      className="px-1.5 py-0.5 rounded bg-black/40 border border-amber-500/30 text-[9px] font-mono text-amber-200 flex items-center gap-1 shrink-0"
                      title={`${node.type}: ${node.name}`}
                    >
                      <Icon size={9} className="text-amber-400" />
                      <span className="truncate max-w-[120px]">{node.name}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[9px] text-amber-300/60 italic">
              No downstream components connected yet. Connections will receive
              updated types automatically.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
