"use client";

import React from "react";
import { AlertTriangle, Database, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { createTypesNodeFromEntity } from "@/lib/stores/backendCanvas/packageTypesSync";

export interface EntityDerivedTypeBannerProps {
  nodeId: string;
  sourceEntityId: string;
  sourceEntityName: string;
  affectedNodesCount: number;
}

export const EntityDerivedTypeBanner: React.FC<EntityDerivedTypeBannerProps> = ({
  nodeId,
  sourceEntityId,
  sourceEntityName,
  affectedNodesCount,
}) => {
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const handleOpenEntity = () => {
    setActiveConfigItem({
      id: sourceEntityId,
      nodeId: sourceEntityId,
      type: "entityFunctions",
    });
  };

  const handleReSync = () => {
    createTypesNodeFromEntity(sourceEntityId);
  };

  return (
    <div className="flex flex-col gap-2.5 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-amber-500 shrink-0" />
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
            <span>Derived from: {sourceEntityName}</span>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-500 border border-amber-500/30 uppercase tracking-wider">
          ENTITY DERIVED
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        This TypeScript contract is automatically generated from database table <strong>{sourceEntityName}</strong>. Column edits in the entity node automatically update these types.
      </p>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-amber-500/20 mt-0.5">
        <div className="flex items-center gap-1 text-[11px] text-amber-500/90 font-medium">
          <AlertTriangle size={12} />
          <span>
            {affectedNodesCount > 0
              ? `${affectedNodesCount} downstream component${affectedNodesCount > 1 ? "s" : ""} will be affected by schema changes.`
              : "No downstream consumers connected yet."}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
            onClick={handleReSync}
            title="Force re-sync from entity"
          >
            <RefreshCw size={10} />
            <span>Re-sync</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
            onClick={handleOpenEntity}
            title="Open entity functions config"
          >
            <span>View Entity</span>
            <ExternalLink size={10} />
          </Button>
        </div>
      </div>
    </div>
  );
};
