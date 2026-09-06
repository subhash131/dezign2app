"use client";

import React, { useMemo } from "react";
import {
  Database,
  Server,
  AlertTriangle,
  Link2Off,
  Workflow,
  Radio,
  Layers,
  Key,
  ShieldAlert,
} from "lucide-react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";
import { ColumnItem } from "./ColumnRow";
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
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { cn } from "@workspace/ui/lib/utils";

interface ColumnDeletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  col: ColumnItem;
  onConfirm: () => void;
}

export const ColumnDeletionDialog: React.FC<ColumnDeletionDialogProps> = ({
  open,
  onOpenChange,
  nodeId,
  col,
  onConfirm,
}) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);

  const entityNode = useMemo(
    () => nodes.find((n) => n.id === nodeId),
    [nodes, nodeId],
  );

  const tableLabel = entityNode?.data.label || "Table";
  const colName = col?.name || "Column";
  const colLower = colName.toLowerCase();

  // 1. Compute Affected Table Indexes
  const affectedIndexes = useMemo(() => {
    if (!entityNode?.data.indexes) return [];
    return entityNode.data.indexes.filter((idx) => {
      const cols = (idx.columns || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      return cols.includes(colLower);
    });
  }, [entityNode, colLower]);

  // 2. Compute Affected DB Operations
  const affectedDbOps = useMemo(() => {
    if (!entityNode) return [];
    const allOps = getEntityDbOperations(entityNode, nodes);

    return allOps.filter((op) => {
      // Check parameters
      const hasParam = op.params?.some(
        (p) => p.name.toLowerCase() === colLower,
      );
      if (hasParam) return true;

      // Primary key operations
      if (col.isPrimaryKey && (op.kind === "findById" || op.kind === "delete" || op.kind === "update")) {
        return true;
      }

      // Check if op corresponds to an affected index
      if (op.kind === "fetchByIndex") {
        const opNameLower = op.name.toLowerCase();
        if (opNameLower.includes(colLower)) return true;
        const matchesIndex = affectedIndexes.some((idx) =>
          opNameLower.includes(idx.name.toLowerCase()),
        );
        if (matchesIndex) return true;
      }

      // Check query/prompt/code references
      if (
        (op.prompt && op.prompt.toLowerCase().includes(colLower)) ||
        (op.query && op.query.toLowerCase().includes(colLower)) ||
        (op.code && op.code.toLowerCase().includes(colLower))
      ) {
        return true;
      }

      return false;
    });
  }, [entityNode, nodes, col, colLower, affectedIndexes]);

  // 3. Compute Foreign Key Dependents from other tables
  const foreignKeyDependents = useMemo(() => {
    const dependents: { tableId: string; tableName: string; columnName: string }[] = [];
    const tableLabelLower = tableLabel.toLowerCase();

    nodes.forEach((n) => {
      if (n.type === "entity" && n.id !== nodeId) {
        const cols = n.data?.columns || [];
        cols.forEach((otherCol) => {
          if (
            otherCol.references?.table?.toLowerCase() === tableLabelLower &&
            otherCol.references?.column?.toLowerCase() === colLower
          ) {
            dependents.push({
              tableId: n.id,
              tableName: n.data.label || "Table",
              columnName: otherCol.name,
            });
          }
        });
      }
    });

    return dependents;
  }, [nodes, nodeId, tableLabel, colLower]);

  // 4. Compute Affected Server Endpoints & Pipelines
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

      // Check pipeline steps
      const steps = ep.pipelineSteps || [];
      for (const step of steps) {
        if (step.tableNodeId === nodeId || step.databaseId === nodeId) {
          // Check if calling an affected DB operation
          const isCallingAffectedOp = affectedDbOps.some(
            (op) =>
              op.id === step.operationId ||
              op.name === step.functionRef?.name,
          );
          if (isCallingAffectedOp) {
            matchReason = `Executes affected DB function (${step.functionRef?.name || step.name || "step"})`;
            break;
          }

          // Check argument bindings and source fields referencing this column
          const hasMatchingBinding = step.inputBindings?.some((b) => {
            const isArgMatch = b.argName.toLowerCase() === colLower;
            const isSourceFieldMatch =
              b.source.kind !== "inline" &&
              "field" in b.source &&
              typeof b.source.field === "string" &&
              b.source.field.toLowerCase() === colLower;
            return isArgMatch || isSourceFieldMatch;
          });

          if (hasMatchingBinding) {
            matchReason = `Binds column "${colName}" in pipeline step argument`;
            break;
          }

          if (step.type === "db_operation") {
            matchReason = `Targets table "${tableLabel}" in pipeline`;
          }
        }
      }

      // Check crud operations dictionary
      if (!matchReason && ep.crudOperations?.[nodeId]) {
        matchReason = `Configured for direct CRUD on table "${tableLabel}"`;
      }

      // Check direct canvas edges
      if (!matchReason) {
        const hasEdge = edges.some(
          (e) =>
            (e.source === ep.nodeId && e.target === nodeId) ||
            (e.target === ep.nodeId && e.source === nodeId),
        );
        if (hasEdge) {
          matchReason = `Connected via canvas edge to table "${tableLabel}"`;
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
  }, [endpoints, nodes, edges, nodeId, colLower, colName, tableLabel, affectedDbOps]);

  // 5. Compute Direct Canvas Edges
  const connectedEdgesCount = useMemo(() => {
    return edges.filter(
      (e) =>
        (e.source === nodeId &&
          (e.sourceHandle === colName ||
            e.sourceHandle === `col-source-${colName}`)) ||
        (e.target === nodeId &&
          (e.targetHandle === colName ||
            e.targetHandle === `col-target-${colName}`)),
    ).length;
  }, [edges, nodeId, colName]);

  const totalImpactCount =
    affectedDbOps.length +
    affectedEndpoints.length +
    foreignKeyDependents.length +
    affectedIndexes.length +
    connectedEdgesCount;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onClick={(e) => e.stopPropagation()}
        className="bg-[#111216] border-zinc-800 text-zinc-100 max-w-2xl shadow-2xl ring-1 ring-white/10 p-0 overflow-hidden"
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
                  <span>Delete Column</span>
                  <span className="font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                    {tableLabel}.{colName}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono border-zinc-700 bg-zinc-800 text-zinc-300">
                    {col.type || "TEXT"}
                  </Badge>
                  {col.isPrimaryKey && (
                    <Badge className="text-[9px] font-bold bg-amber-500/20 text-amber-400 border-amber-500/40">
                      PK
                    </Badge>
                  )}
                  {col.isForeignKey && (
                    <Badge className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border-blue-500/40">
                      FK
                    </Badge>
                  )}
                  {col.isUnique && (
                    <Badge className="text-[9px] font-bold bg-purple-500/20 text-purple-400 border-purple-500/40">
                      UQ
                    </Badge>
                  )}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-zinc-400 mt-1">
                  Review the architecture blast radius and dependent server components below before confirming deletion.
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

        {/* Body / Blast Radius Impact List */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {totalImpactCount === 0 ? (
            <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 text-center">
              No dependent database functions, foreign keys, or server endpoints reference this column. Safe to delete.
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1. Affected DB Functions */}
              {affectedDbOps.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-blue-400" />
                      Affected DB Functions ({affectedDbOps.length})
                    </span>
                    <span className="text-[10px] text-zinc-500 lowercase font-normal">
                      table entity operations
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
                        <span className="text-[10px] text-zinc-400 truncate max-w-[200px] font-mono">
                          {op.returnType || "void"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Affected Server Endpoints & Pipelines */}
              {affectedEndpoints.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-emerald-400" />
                      Affected Server Endpoints ({affectedEndpoints.length})
                    </span>
                    <span className="text-[10px] text-zinc-500 lowercase font-normal">
                      service pipelines
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

              {/* 3. Foreign Key Relationships */}
              {foreignKeyDependents.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-purple-400" />
                      Foreign Key Dependents ({foreignKeyDependents.length})
                    </span>
                    <span className="text-[10px] text-zinc-500 lowercase font-normal">
                      foreign tables
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {foreignKeyDependents.map((dep, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs"
                      >
                        <span className="font-mono text-purple-300">
                          {dep.tableName}.{dep.columnName}
                        </span>
                        <span className="text-[10px] text-purple-400 font-mono">
                          references {tableLabel}.{colName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Affected Indexes */}
              {affectedIndexes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      Affected Table Indexes ({affectedIndexes.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {affectedIndexes.map((idx, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80 text-xs"
                      >
                        <span className="font-mono text-zinc-200">{idx.name}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          ({idx.columns})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. Canvas Edges */}
              {connectedEdgesCount > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400">
                  <Link2Off className="w-3.5 h-3.5 text-zinc-500" />
                  <span>
                    {connectedEdgesCount} canvas connection {connectedEdgesCount === 1 ? "edge" : "edges"} will be disconnected.
                  </span>
                </div>
              )}
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
            Delete Column
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
