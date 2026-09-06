"use client";

import React, { useMemo } from "react";
import {
  Layers,
  Database,
  Server,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";

interface IndexItem {
  name: string;
  columns?: string;
  isUnique?: boolean;
}

interface IndexDeletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  indexItem: IndexItem;
  onConfirm: () => void;
}

export const IndexDeletionDialog: React.FC<IndexDeletionDialogProps> = ({
  open,
  onOpenChange,
  nodeId,
  indexItem,
  onConfirm,
}) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);

  const entityNode = useMemo(
    () => nodes.find((n) => n.id === nodeId),
    [nodes, nodeId],
  );

  const tableLabel = entityNode?.data.label || "Table";
  const indexName = indexItem?.name || "index";
  const indexNameLower = indexName.toLowerCase();
  const indexCols = (indexItem?.columns || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 1. Compute Affected DB Operations
  const affectedDbOps = useMemo(() => {
    if (!entityNode) return [];
    const allOps = getEntityDbOperations(entityNode, nodes);

    return allOps.filter((op) => {
      if (op.kind === "fetchByIndex") {
        const opNameLower = op.name.toLowerCase();
        if (opNameLower.includes(indexNameLower)) return true;
        if (indexCols.some((col) => opNameLower.includes(col.toLowerCase()))) {
          return true;
        }
      }
      return false;
    });
  }, [entityNode, nodes, indexNameLower, indexCols]);

  // 2. Compute Affected Server Endpoints & Pipelines
  const affectedEndpoints = useMemo(() => {
    const list: {
      endpointId: string;
      method: string;
      name: string;
      serviceLabel: string;
      reason: string;
    }[] = [];

    endpoints.forEach((ep) => {
      const serviceNode = nodes.find((n) => n.id === ep.nodeId);
      const serviceLabel = serviceNode?.data.label || "Service";

      let matchReason = "";

      const steps = ep.pipelineSteps || [];
      for (const step of steps) {
        if (step.tableNodeId === nodeId || step.databaseId === nodeId) {
          const isCallingAffectedOp = affectedDbOps.some(
            (op) =>
              op.id === step.operationId ||
              op.name === step.functionRef?.name,
          );
          if (isCallingAffectedOp) {
            matchReason = `Calls index operation "${step.functionRef?.name || step.name || "step"}"`;
            break;
          }
        }
      }

      if (matchReason) {
        list.push({
          endpointId: ep.id,
          method: ep.type || "GET",
          name: ep.name || "endpoint",
          serviceLabel,
          reason: matchReason,
        });
      }
    });

    return list;
  }, [endpoints, nodes, nodeId, affectedDbOps]);

  const totalImpactCount = affectedDbOps.length + affectedEndpoints.length;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111216] border-zinc-800 text-zinc-100 max-w-xl shadow-2xl ring-1 ring-white/10 p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-900/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <AlertDialogTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2 flex-wrap">
                  <span>Delete Index</span>
                  <span className="font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                    {tableLabel}.{indexName}
                  </span>
                  {indexItem.isUnique && (
                    <Badge className="text-[9px] font-bold bg-purple-500/20 text-purple-400 border-purple-500/40">
                      UQ
                    </Badge>
                  )}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-zinc-400 mt-1">
                  Columns: <span className="font-mono text-zinc-300">({indexItem.columns || "none"})</span>
                </AlertDialogDescription>
              </div>
            </div>

            {totalImpactCount > 0 && (
              <Badge className="bg-destructive/15 text-destructive border-destructive/30 shrink-0 font-mono text-xs">
                {totalImpactCount} {totalImpactCount === 1 ? "Impact" : "Impacts"}
              </Badge>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {indexItem.isUnique && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 leading-relaxed">
              <strong>Warning:</strong> This index enforces a uniqueness constraint (<code className="text-amber-200">UNIQUE</code>). Removing it will allow duplicate entries in <span className="font-mono">{indexItem.columns}</span>.
            </div>
          )}

          {/* 1. Affected DB Functions */}
          {affectedDbOps.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  Affected Index Functions ({affectedDbOps.length})
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {affectedDbOps.map((op) => (
                  <div
                    key={op.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-zinc-200 truncate">
                        {op.name}
                      </span>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {op.kind}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {op.returnType || "void"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Affected Server Endpoints */}
          {affectedEndpoints.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-emerald-400" />
                  Affected Server Endpoints ({affectedEndpoints.length})
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {affectedEndpoints.map((ep) => (
                  <div
                    key={ep.endpointId}
                    className="flex items-start justify-between p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80 text-xs gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded",
                          ep.method === "GET" && "bg-blue-500/20 text-blue-400",
                          ep.method === "POST" && "bg-emerald-500/20 text-emerald-400",
                          ep.method === "PUT" && "bg-amber-500/20 text-amber-400",
                          ep.method === "DELETE" && "bg-red-500/20 text-red-400",
                        )}
                      >
                        {ep.method}
                      </span>
                      <span className="font-mono text-zinc-200 truncate">
                        {ep.serviceLabel} → {ep.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-amber-400/90 text-right shrink-0">
                      {ep.reason}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalImpactCount === 0 && !indexItem.isUnique && (
            <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 text-center">
              No server endpoints or custom queries reference this index. Safe to delete.
            </div>
          )}
        </div>

        {/* Footer */}
        <AlertDialogFooter className="p-4 border-t border-zinc-800 bg-zinc-900/40">
          <AlertDialogCancel
            onClick={() => onOpenChange(false)}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 hover:text-zinc-100 text-xs cursor-pointer"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold text-xs cursor-pointer"
          >
            Delete Index
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
