"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Server,
  Globe,
  Radio,
  Braces,
  Cpu,
  Sparkles,
} from "lucide-react";
import { BackendNode } from "@/types/canvas";

export interface EntityAffectedTypesBannerProps {
  entityId: string;
  derivedTypesNodes: BackendNode[];
  outOfSyncTypesNodes: BackendNode[];
  affectedDownstreamNodes: BackendNode[];
  entityName: string;
  onViewTypesNode?: (nodeId: string) => void;
  onSync?: () => void;
}

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

export const EntityAffectedTypesBanner: React.FC<
  EntityAffectedTypesBannerProps
> = ({
  entityId,
  derivedTypesNodes,
  outOfSyncTypesNodes,
  affectedDownstreamNodes,
  entityName,
  onViewTypesNode,
  onSync,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Only display the banner when the entity has changes not yet synced to derived TypesNodes
  if (outOfSyncTypesNodes.length === 0) return null;

  return (
    <div className="mx-3 my-1.5 p-2 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-300 dark:text-amber-200 flex flex-col gap-1.5 shadow-xs nodrag">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlertTriangle size={13} className="text-amber-400 shrink-0" />
          <span className="text-[10px] font-bold text-amber-300 truncate">
            Types Out of Sync
          </span>
          <span className="text-[7.5px] font-mono px-1 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 shrink-0 uppercase tracking-wide">
            {outOfSyncTypesNodes.length} UNSYNCED
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onSync && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSync();
              }}
              className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-semibold text-[9.5px] transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
              title="Sync changes to derived TypesNode"
            >
              <Sparkles size={10} />
              <span>Sync</span>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((prev) => !prev);
            }}
            className="text-amber-400/80 hover:text-amber-200 p-0.5 rounded hover:bg-amber-500/20 transition-colors cursor-pointer shrink-0"
            title={isExpanded ? "Collapse banner" : "Expand banner"}
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      <div className="text-[9.5px] text-amber-200/90 leading-tight">
        Table changes have not been synced to{" "}
        {outOfSyncTypesNodes.map((n, i) => (
          <span key={n.id}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewTypesNode?.(n.id);
              }}
              className="font-semibold underline hover:text-amber-100 cursor-pointer"
              title={`View ${n.data.label}`}
            >
              {n.data.label || "TypesNode"}
            </button>
            {i < outOfSyncTypesNodes.length - 1 ? ", " : ""}
          </span>
        ))}
        .
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-1 pt-1 border-t border-amber-500/20 mt-0.5">
          {affectedDownstreamNodes.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-semibold text-amber-400">
                ⚠️ Downstream components that will receive updated types:
              </span>
              <div className="flex flex-wrap gap-1 max-h-[70px] overflow-y-auto pr-0.5">
                {affectedDownstreamNodes.map((node) => {
                  const Icon = getNodeIcon(node.type);
                  return (
                    <span
                      key={node.id}
                      className="px-1.5 py-0.5 rounded bg-black/40 border border-amber-500/30 text-[8.5px] font-mono text-amber-200 flex items-center gap-1 shrink-0"
                      title={`${node.type}: ${node.data.label || node.id}`}
                    >
                      <Icon size={9} className="text-amber-400" />
                      <span className="truncate max-w-[110px]">
                        {node.data.label || node.id}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[9px] text-amber-300/60 italic">
              Click &quot;Sync&quot; to update linked types contract.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
