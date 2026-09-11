"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Handle, Position, NodeProps, useUpdateNodeInternals } from "@xyflow/react";
import { Database, Server, Table2, Settings, Trash, Code2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";
import { DbOperationFunction } from "@workspace/canvas/types";
import { useSectionCollapseStore } from "@/lib/stores/sectionCollapseStore";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";

export const DatabaseTableRefNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const hasPipelineError = useNodePipelineError(id);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const databaseInstances = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "database" &&
          n.data?.dbEngine !== "redis" &&
          n.data?.dbType !== "redis",
      ),
    ),
  );

  const allEntities = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "entity" &&
          n.data?.dbType !== "vector" &&
          n.data?.dbType !== "redis",
      ),
    ),
  );

  const selectedTable = allEntities.find((e) => e.id === data.tableRef);
  const selectedDatabaseId =
    data.databaseId || selectedTable?.data?.databaseId;
  const selectedDatabase = databaseInstances.find(
    (n) => n.id === selectedDatabaseId,
  );
  const parentDatabase = nodes.find(
    (n) => n.id === (selectedTable?.data?.databaseId || selectedDatabaseId),
  );

  const filteredEntities = useMemo(() => {
    if (!selectedDatabaseId || selectedDatabaseId === "__all__")
      return allEntities;
    const directMatches = allEntities.filter(
      (e) =>
        e.data?.databaseId === selectedDatabaseId ||
        edges.some(
          (edge) =>
            (edge.source === selectedDatabaseId && edge.target === e.id) ||
            (edge.target === selectedDatabaseId && edge.source === e.id),
        ),
    );
    return directMatches.length > 0 ? directMatches : allEntities;
  }, [allEntities, selectedDatabaseId, edges]);

  const operations: DbOperationFunction[] = useMemo(() => {
    if (!selectedTable) return [];
    return getEntityDbOperations(selectedTable, nodes);
  }, [selectedTable, nodes]);

  const isOperationsCollapsed = useSectionCollapseStore((s) =>
    s.isSectionCollapsed(id, "operations"),
  );
  const toggleSectionCollapsed = useSectionCollapseStore(
    (s) => s.toggleSectionCollapsed,
  );

  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    if (typeof updateNodeInternals === "function") {
      updateNodeInternals(id);
    }
  }, [isOperationsCollapsed, id, updateNodeInternals, operations.length]);

  const hasAnyConnectedOperation = useMemo(() => {
    return edges.some(
      (e) =>
        e.target === id &&
        operations.some(
          (op) =>
            e.targetHandle === `func-${op.name}` ||
            e.targetHandle === `func-${op.id}` ||
            (!e.targetHandle && op === operations[0]),
        ),
    );
  }, [edges, id, operations]);

  const engineName =
    selectedDatabase?.data?.dbEngine ||
    parentDatabase?.data?.dbEngine ||
    selectedDatabase?.data?.dbType ||
    parentDatabase?.data?.dbType;

  const handleOpenConfig = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveConfigItem({
      id,
      nodeId: id,
      type: "db_ref",
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[340px] flex flex-col transition-all duration-300 select-none cursor-pointer",
        selected
          ? "border-orange-500 shadow-orange-500/15 ring-1 ring-orange-500/20"
          : "border-border/80 hover:border-orange-500/50 hover:shadow-lg",
        hasPipelineError &&
          "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Top Header: matches NodeHeader structure and padding with orange accents */}
      <div className="px-3 py-2 border-b flex items-center justify-between gap-2 rounded-t-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 group">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="p-1 rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/25 shrink-0">
            <Database size={14} />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase font-bold tracking-wider text-orange-600 dark:text-orange-400">
                Table Ref
              </span>
              {engineName && (
                <span className="text-[8px] font-mono px-1 py-0.2 rounded font-semibold bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20 uppercase shrink-0">
                  {engineName}
                </span>
              )}
              {hasPipelineError && (
                <span className="text-[7px] font-medium px-1 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse">
                  <AlertTriangle size={8} />
                  Unmapped
                </span>
              )}
            </div>
            <span className="font-semibold text-xs text-foreground truncate">
              {selectedTable?.data?.label || data.label || "Table Ref"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            onClick={handleOpenConfig}
            title="Configure Database"
          >
            <Settings size={13} />
          </button>
          <button
            className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all cursor-pointer"
            onClick={handleDelete}
            title="Delete Node"
          >
            <Trash size={13} />
          </button>
        </div>
      </div>

      {hasPipelineError && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20 text-[11px] text-destructive leading-tight">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="font-medium">Missing required input mapping</span>
        </div>
      )}

      {/* Selectors section: matches ServiceNode body bg-secondary/5 and border-b */}
      <div className="px-3 py-2.5 bg-secondary/5 border-b flex flex-col gap-2 nodrag">
        {/* 1. Database Selector */}
        <Select
          value={selectedDatabaseId || "__all__"}
          onValueChange={(val) => {
            const newDbId = val === "__all__" ? "" : val;
            const currentTable = allEntities.find((e) => e.id === data.tableRef);
            const belongsToNew =
              !newDbId ||
              (currentTable &&
                (currentTable.data?.databaseId === newDbId ||
                  edges.some(
                    (e) =>
                      (e.source === newDbId && e.target === currentTable.id) ||
                      (e.target === newDbId && e.source === currentTable.id),
                  )));

            updateNode(id, {
              data: {
                ...data,
                databaseId: newDbId || undefined,
                tableRef: belongsToNew ? data.tableRef : undefined,
                label: belongsToNew ? data.label : "Table Ref",
              },
            });
          }}
        >
          <SelectTrigger className="h-7 w-full text-xs font-medium bg-background/80 hover:bg-background border-border/70 hover:border-orange-500/50 px-2.5 py-0 truncate shadow-none">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <Server size={12} className="text-orange-500 shrink-0" />
              <span className="truncate">
                {selectedDatabase?.data?.label || (selectedDatabaseId && selectedDatabaseId !== "__all__" ? "Database" : "All Databases")}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="nodrag z-[100]">
            <SelectItem value="__all__" className="text-xs">
              All Databases
            </SelectItem>
            {databaseInstances.map((inst) => (
              <SelectItem key={inst.id} value={inst.id} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                  <span className="truncate">{inst.data?.label || "Database"}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 2. Table Selector */}
        <Select
          value={data.tableRef || ""}
          onValueChange={(val) => {
            const entity = allEntities.find((e) => e.id === val);
            updateNode(id, {
              data: {
                ...data,
                tableRef: val,
                databaseId:
                  entity?.data?.databaseId || selectedDatabaseId || data.databaseId,
                label: entity?.data?.label || "Table Ref",
                graphPosition: entity?.position,
              },
            });
          }}
        >
          <SelectTrigger className="h-7 w-full text-xs font-semibold bg-background/80 hover:bg-background border-border/70 hover:border-orange-500/50 px-2.5 py-0 truncate shadow-none">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <Table2 size={12} className="text-orange-500 shrink-0" />
              <span className="truncate">
                {selectedTable?.data?.label || "Select Table..."}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="nodrag z-[100]">
            {filteredEntities.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground italic">
                {selectedDatabaseId && selectedDatabaseId !== "__all__"
                  ? "No tables for this database"
                  : "No tables defined"}
              </div>
            ) : (
              filteredEntities.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-xs">
                  {e.data?.label || "Untitled Table"}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Section Header: Collapsible Operations banner */}
      <div
        className={cn(
          "px-3 py-1 bg-secondary/40 border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center cursor-pointer hover:bg-secondary/60 transition-colors nodrag select-none relative group/ops",
          isOperationsCollapsed && "rounded-b-xl border-b-0",
        )}
        onClick={(e) => {
          e.stopPropagation();
          toggleSectionCollapsed(id, "operations");
        }}
        title={isOperationsCollapsed ? "Expand Operations" : "Collapse Operations"}
      >
        {/* Collapsed Handles: all function handles anchor directly to the Operations header row */}
        {isOperationsCollapsed && (
          <>
            {operations.map((op) => (
              <React.Fragment key={op.id || op.name}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`func-${op.name}`}
                  className={cn(
                    "w-2.5 h-2.5 border-2 transition-colors -left-[5px]",
                    hasAnyConnectedOperation
                      ? "!bg-orange-500 !border-orange-500 ring-2 ring-orange-500/30"
                      : "!bg-background border-muted-foreground/60 hover:!bg-orange-400",
                  )}
                  style={{ top: "50%", transform: "translateY(-50%)" }}
                />
                {op.id && op.id !== op.name && (
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`func-${op.id}`}
                    className="opacity-0 pointer-events-none -left-[5px]"
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  />
                )}
              </React.Fragment>
            ))}
          </>
        )}

        <span className="flex items-center gap-1.5">
          <div className="text-muted-foreground group-hover/ops:text-foreground transition-transform">
            {isOperationsCollapsed ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </div>
          <Code2 size={11} className="text-orange-500" />
          Operations
        </span>

        <div className="flex items-center gap-1.5">
          {hasAnyConnectedOperation && isOperationsCollapsed && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0 animate-pulse"
              title="Connected Operations"
            />
          )}
          <span className="text-[9px] font-mono text-muted-foreground/70">
            {operations.length}
          </span>
        </div>
      </div>

      {/* Functions / Operations List: shown when expanded */}
      {!isOperationsCollapsed && (
        selectedTable && operations.length > 0 ? (
          <div className="flex flex-col">
            {operations.map((op) => {
              const isConnected = edges.some(
                (e) =>
                  e.target === id &&
                  (e.targetHandle === `func-${op.name}` ||
                    e.targetHandle === `func-${op.id}` ||
                    (!e.targetHandle && op === operations[0])),
              );

              const badgeColor =
                op.kind === "findAll" || op.kind === "findById"
                  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                  : op.kind === "create"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : op.kind === "update"
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : op.kind === "delete"
                  ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  : "bg-purple-500/15 text-purple-400 border-purple-500/30";

              const badgeLabel =
                op.kind === "findAll"
                  ? "ALL"
                  : op.kind === "findById"
                  ? "BY ID"
                  : op.kind === "create"
                  ? "NEW"
                  : op.kind === "update"
                  ? "SET"
                  : op.kind === "delete"
                  ? "DEL"
                  : "FN";

              return (
                <div
                  key={op.id || op.name}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-xs relative group/row transition-colors nodrag",
                    isConnected
                      ? "text-foreground font-medium"
                      : "hover:bg-secondary/20 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {/* Target Handle sitting cleanly on the left card border */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`func-${op.name}`}
                    className={cn(
                      "w-2.5 h-2.5 border-2 transition-colors -left-[5px]",
                      isConnected
                        ? "!bg-orange-500 !border-orange-500 ring-2 ring-orange-500/30"
                        : "!bg-background border-muted-foreground/60 hover:!bg-orange-400",
                    )}
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  />
                  {op.id && op.id !== op.name && (
                    <Handle
                      type="target"
                      position={Position.Left}
                      id={`func-${op.id}`}
                      className="opacity-0 pointer-events-none -left-[5px]"
                      style={{ top: "50%", transform: "translateY(-50%)" }}
                    />
                  )}

                  <span
                    className="font-mono text-xs truncate select-text"
                    title={op.signature || op.name}
                  >
                    {op.name}
                  </span>

                  <span
                    className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 font-mono tracking-wider",
                      badgeColor,
                    )}
                  >
                    {badgeLabel}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground/60 italic">
            {selectedTable ? "No operations available" : "Select a table to view operations"}
          </div>
        )
      )}
    </div>
  );
};
