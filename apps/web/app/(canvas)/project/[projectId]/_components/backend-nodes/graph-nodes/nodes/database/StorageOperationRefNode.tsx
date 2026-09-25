"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  Handle,
  Position,
  NodeProps,
  useUpdateNodeInternals,
} from "@xyflow/react";
import {
  HardDrive,
  Layers,
  Settings,
  Trash,
  Code2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Play,
  Plus,
  X,
} from "lucide-react";
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
import {
  getStorageOperations,
  getStorageKindBadge,
  StorageOperationFunction,
} from "@/lib/utils/storageOperationsHelper";
import { useSectionCollapseStore } from "@/lib/stores/sectionCollapseStore";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";
import { StorageOperationDialog } from "./StorageOperationDialog";

export const StorageOperationRefNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const hasPipelineError = useNodePipelineError(id);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const [dialogOp, setDialogOp] = useState<StorageOperationFunction | null>(
    null,
  );
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);

  // 1. All storage nodes on canvas
  const storageNodes = useBackendCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n?.type === "storage")),
  );

  const selectedStorageNode = storageNodes.find(
    (n) => n.id === data.storageNodeId,
  );
  const activeStorageNode = selectedStorageNode || storageNodes[0];

  const availableBuckets = useMemo(() => {
    return activeStorageNode?.data?.buckets || [];
  }, [activeStorageNode]);

  const selectedBucket =
    data.bucketId ||
    data.bucketName ||
    availableBuckets[0]?.name ||
    "default-bucket";

  const provider =
    activeStorageNode?.data?.storageProvider || data.storageProvider || "s3";

  // 2. User-configured operations on this reference node (empty by default unless added)
  const operations: StorageOperationFunction[] = useMemo(() => {
    return Array.isArray(data.storageOperations) ? data.storageOperations : [];
  }, [data.storageOperations]);

  // All possible predefined operations provided by the storage provider
  const allAvailableOps: StorageOperationFunction[] = useMemo(() => {
    return getStorageOperations(activeStorageNode);
  }, [activeStorageNode]);

  // Operations that haven't been added yet
  const unaddedOps = useMemo(() => {
    return allAvailableOps.filter(
      (avail) =>
        !operations.some(
          (op) => op.name === avail.name || op.id === avail.id,
        ),
    );
  }, [allAvailableOps, operations]);

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

  // 3. Ensure invisible reference edge exists between bucket on StorageNode and this ref node header
  useEffect(() => {
    if (!activeStorageNode?.id || !selectedBucket) return;
    const bucketObj = availableBuckets.find(
      (b) => b.id === selectedBucket || b.name === selectedBucket,
    );
    const bucketId = bucketObj?.id || selectedBucket;
    const sourceHandle = `buckets:out:${bucketId}`;
    const legacySourceHandle = `bucket:out:${bucketId}`;
    const targetHandle = "storage-ref-header";

    const exists = edges.some(
      (e) =>
        (e.type === "storage-reference" || e.type === "reference") &&
        e.source === activeStorageNode.id &&
        e.target === id &&
        (e.sourceHandle === sourceHandle ||
          e.sourceHandle === legacySourceHandle ||
          !e.sourceHandle),
    );

    if (!exists) {
      // Clean up any stale reference edges for this node pointing to old bucket
      edges
        .filter(
          (e) =>
            (e.type === "storage-reference" || e.type === "reference") &&
            e.target === id &&
            (e.source !== activeStorageNode.id ||
              (e.sourceHandle !== sourceHandle &&
                e.sourceHandle !== legacySourceHandle)),
        )
        .forEach((e) => deleteEdge(e.id));

      addEdge({
        id: `edge-storage-ref-${activeStorageNode.id}-${bucketId}-${id}`,
        source: activeStorageNode.id,
        target: id,
        sourceHandle,
        targetHandle,
        type: "storage-reference",
      });
    }
  }, [activeStorageNode?.id, selectedBucket, availableBuckets, id, edges, addEdge, deleteEdge]);

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

  const isHeaderConnected = useMemo(() => {
    return edges.some(
      (e) =>
        (e.target === id &&
          (e.targetHandle === "storage-ref-header" ||
            e.type === "storage-reference" ||
            e.type === "reference")) ||
        (e.source === id &&
          (e.sourceHandle === "storage-ref-header" ||
            e.sourceHandle === "storage-ref-header-out")),
    );
  }, [edges, id]);

  const handleOpenConfig = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveConfigItem({
      id,
      nodeId: id,
      type: "storage_ref",
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Clean up all connected edges
    edges
      .filter((edge) => edge.target === id || edge.source === id)
      .forEach((edge) => deleteEdge(edge.id));
    requestDeleteNode(id);
  };

  const handleSelectStorageNode = (val: string) => {
    const targetStorage = storageNodes.find((n) => n.id === val);
    const targetBuckets = targetStorage?.data?.buckets || [];
    const firstBucketName = targetBuckets[0]?.name || "default-bucket";

    updateNode(id, {
      data: {
        ...data,
        storageNodeId: val,
        storageProvider: targetStorage?.data?.storageProvider || "s3",
        bucketId: firstBucketName,
        bucketName: firstBucketName,
        label: `${firstBucketName}`,
      },
    });
  };

  const handleSelectBucket = (val: string) => {
    updateNode(id, {
      data: {
        ...data,
        bucketId: val,
        bucketName: val,
        label: `${val}`,
      },
    });
  };

  const handleAddOperation = (opToAdd: StorageOperationFunction) => {
    const nextOps = [...operations, opToAdd];
    updateNode(id, {
      data: {
        ...data,
        storageOperations: nextOps,
      },
    });
    setShowAddMenu(false);
  };

  const handleRemoveOperation = (
    e: React.MouseEvent,
    opToRemove: StorageOperationFunction,
  ) => {
    e.stopPropagation();
    // Clean up any edge connected to this operation
    edges
      .filter(
        (edge) =>
          edge.target === id &&
          (edge.targetHandle === `func-${opToRemove.name}` ||
            edge.targetHandle === `func-${opToRemove.id}`),
      )
      .forEach((edge) => deleteEdge(edge.id));

    const nextOps = operations.filter(
      (o) => o.id !== opToRemove.id && o.name !== opToRemove.name,
    );
    updateNode(id, {
      data: {
        ...data,
        storageOperations: nextOps,
      },
    });
  };

  const handleSaveCustomOperation = (customOp: StorageOperationFunction) => {
    const existsIndex = operations.findIndex((o) => o.id === customOp.id);
    let nextOps: StorageOperationFunction[];
    if (existsIndex >= 0) {
      nextOps = [...operations];
      nextOps[existsIndex] = customOp;
    } else {
      nextOps = [...operations, customOp];
    }
    updateNode(id, {
      data: {
        ...data,
        storageOperations: nextOps,
      },
    });
    setIsCustomDialogOpen(false);
    setDialogOp(null);
  };

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[340px] flex flex-col transition-all duration-300 select-none cursor-pointer relative",
        selected
          ? "border-amber-500 shadow-amber-500/15 ring-1 ring-amber-500/20"
          : "border-border/80 hover:border-amber-500/50 hover:shadow-lg",
        hasPipelineError &&
          "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Visible Target Handle on the header for bucket reference from StorageNode */}
      <Handle
        type="target"
        position={Position.Left}
        id="storage-ref-header"
        className={cn(
          "w-2.5 h-2.5 -left-[5px] border-2 transition-all cursor-crosshair rounded-full z-10",
          isHeaderConnected
            ? "!bg-amber-500 !border-amber-500 ring-2 ring-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
            : "!bg-background border-amber-500/70 hover:!bg-amber-400 hover:scale-125",
        )}
        style={{ top: "18px" }}
        title="Inbound Reference: Connect bucket from StorageNode"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="storage-ref-header-out"
        className="opacity-0 pointer-events-none -left-[5px]"
        style={{ top: "18px" }}
      />

      {/* Top Header: Amber theme matching StorageNode */}
      <div className="px-3 py-2 border-b flex items-center justify-between gap-2 rounded-t-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 group">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="p-1 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 shrink-0">
            <HardDrive size={14} />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">
                Bucket Ref
              </span>
              {provider && (
                <span className="text-[8px] font-mono px-1 py-0.2 rounded font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase shrink-0">
                  {provider}
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
              {data.label || selectedBucket || "Bucket Ref"}
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-1 shrink-0 nodrag"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all cursor-pointer nodrag"
            onClick={handleOpenConfig}
            title="Configure Bucket Reference"
          >
            <Settings size={13} />
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all cursor-pointer nodrag"
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
          <span className="font-medium">Missing required storage input mapping</span>
        </div>
      )}

      {/* Selectors section: Storage Node & Bucket dropdowns */}
      <div
        className="px-3 py-2.5 bg-secondary/5 border-b flex flex-col gap-2 nodrag"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 1. Storage Node Selector */}
        <Select
          value={activeStorageNode?.id || "__none__"}
          onValueChange={handleSelectStorageNode}
        >
          <SelectTrigger
            className="h-7 w-full text-xs font-medium bg-background/80 hover:bg-background border-border/70 hover:border-amber-500/50 px-2.5 py-0 truncate shadow-none nodrag cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate pointer-events-none">
              <HardDrive size={12} className="text-amber-500 shrink-0" />
              <span className="truncate">
                {activeStorageNode?.data?.label || "Select Storage..."}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent position="popper" className="nodrag z-[100]">
            {storageNodes.length === 0 ? (
              <SelectItem value="__none__" disabled className="text-xs">
                No storage instances found
              </SelectItem>
            ) : (
              storageNodes.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.data?.label || "Storage Instance"} ({s.data?.storageProvider || "s3"})
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {/* 2. Bucket Selector */}
        <Select
          value={selectedBucket || "__none__"}
          onValueChange={handleSelectBucket}
        >
          <SelectTrigger
            className="h-7 w-full text-xs font-medium bg-background/80 hover:bg-background border-border/70 hover:border-amber-500/50 px-2.5 py-0 truncate shadow-none nodrag cursor-pointer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 min-w-0 truncate pointer-events-none">
              <Layers size={12} className="text-amber-500 shrink-0" />
              <span className="truncate">
                {selectedBucket || "Select Bucket..."}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent position="popper" className="nodrag z-[100]">
            {availableBuckets.length === 0 ? (
              <SelectItem value="__none__" disabled className="text-xs">
                No buckets defined
              </SelectItem>
            ) : (
              availableBuckets.map((b) => (
                <SelectItem key={b.id || b.name} value={b.name} className="text-xs">
                  {b.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Bucket Operations section bar with + button */}
      <div
        className="px-3 py-1.5 bg-secondary/15 flex items-center justify-between text-xs font-semibold cursor-pointer border-b hover:bg-secondary/25 transition-colors relative group/ops"
        onClick={() => toggleSectionCollapsed(id, "operations")}
      >
        {/* Invisible right handles when collapsed so existing edges stay attached */}
        {isOperationsCollapsed && (
          <>
            {operations.map((op) => (
              <React.Fragment key={op.id || op.name}>
                <Handle
                  type="target"
                  position={Position.Right}
                  id={`func-${op.name}`}
                  className={cn(
                    "w-2.5 h-2.5 border-2 transition-colors -right-[5px]",
                    hasAnyConnectedOperation
                      ? "!bg-amber-500 !border-amber-500 ring-2 ring-amber-500/30"
                      : "!bg-background border-muted-foreground/60 hover:!bg-amber-400",
                  )}
                  style={{ top: "50%", transform: "translateY(-50%)" }}
                />
                {op.id && op.id !== op.name && (
                  <Handle
                    type="target"
                    position={Position.Right}
                    id={`func-${op.id}`}
                    className="opacity-0 pointer-events-none -right-[5px]"
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                  />
                )}
              </React.Fragment>
            ))}
          </>
        )}

        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="text-muted-foreground group-hover/ops:text-foreground transition-transform">
            {isOperationsCollapsed ? (
              <ChevronRight size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </div>
          <Code2 size={11} className="text-amber-500 shrink-0" />
          <span className="truncate">Bucket Operations</span>
        </div>

        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {hasAnyConnectedOperation && isOperationsCollapsed && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 animate-pulse"
              title="Connected Operations"
            />
          )}
          <span className="text-[9px] font-mono text-muted-foreground/70 mr-0.5">
            {operations.length}
          </span>

          <button
            type="button"
            className="p-1 rounded hover:bg-amber-500/20 text-muted-foreground hover:text-amber-500 transition-colors nodrag cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddMenu((prev) => !prev);
            }}
            title="Add Operation"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Add Operation Popover Dropdown */}
        {showAddMenu && (
          <div
            className="absolute left-2 right-2 top-full mt-1 z-50 bg-popover/95 backdrop-blur-md border border-border shadow-xl rounded-lg p-1.5 flex flex-col gap-1 nodrag text-xs"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1.5 py-0.5 border-b border-border/50 text-[10px] font-semibold text-muted-foreground uppercase">
              <span>Add Bucket Operation</span>
              <button
                type="button"
                onClick={() => setShowAddMenu(false)}
                className="hover:text-foreground p-0.5 rounded cursor-pointer"
              >
                <X size={10} />
              </button>
            </div>
            <div className="max-h-[160px] overflow-y-auto flex flex-col gap-0.5">
              {unaddedOps.map((op) => {
                const b = op.badge || getStorageKindBadge(op.kind);
                return (
                  <button
                    key={op.id || op.name}
                    type="button"
                    onClick={() => handleAddOperation(op)}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-amber-500/10 text-left text-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer group"
                  >
                    <span className="font-mono text-xs truncate mr-1.5">
                      {op.name}
                    </span>
                    <span
                      className={cn(
                        "text-[8px] font-bold px-1 py-0.2 rounded border uppercase font-mono shrink-0",
                        b.colorClass,
                      )}
                    >
                      {b.label}
                    </span>
                  </button>
                );
              })}
              {unaddedOps.length === 0 && (
                <div className="px-2 py-2 text-[11px] text-muted-foreground text-center">
                  All default operations added
                </div>
              )}
            </div>
            <div className="pt-1 border-t border-border/50">
              <button
                type="button"
                onClick={() => {
                  setShowAddMenu(false);
                  setIsCustomDialogOpen(true);
                }}
                className="w-full text-center py-1 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                + New Custom Operation...
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Functions / Operations List: shown when expanded */}
      {!isOperationsCollapsed && (
        <div className="flex flex-col">
          {operations.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground/70 flex flex-col items-center justify-center gap-1.5">
              <span className="text-[11px]">No operations configured</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddMenu(true);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <Plus size={11} /> Add Operation
              </button>
            </div>
          ) : (
            operations.map((op) => {
              const isLeftConnected = edges.some(
                (e) =>
                  e.target === id &&
                  (e.targetHandle === `func-${op.name}` ||
                    e.targetHandle === `func-${op.id}` ||
                    e.targetHandle === `func-in-${op.name}` ||
                    e.targetHandle === `func-in-${op.id}` ||
                    (!e.targetHandle && op === operations[0])),
              );

              const isRightConnected = edges.some(
                (e) =>
                  (e.source === id &&
                    (e.sourceHandle === `func-out-${op.name}` ||
                      e.sourceHandle === `func-out-${op.id}` ||
                      e.sourceHandle === `func-${op.name}` ||
                      e.sourceHandle === `func-${op.id}`)) ||
                  (e.target === id &&
                    (e.targetHandle === `func-out-${op.name}` ||
                      e.targetHandle === `func-out-${op.id}`)),
              );

              const isConnected = isLeftConnected || isRightConnected;

              const badge = op.badge || getStorageKindBadge(op.kind);

              return (
                <div
                  key={op.id || op.name}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-xs relative group/row transition-colors nodrag",
                    isConnected
                      ? "text-foreground font-medium bg-amber-500/5"
                      : "hover:bg-secondary/20 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {/* Inbound Handle on LEFT (from WebPage action or other trigger) */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`func-${op.name}`}
                    className={cn(
                      "w-2.5 h-2.5 border-2 transition-colors -left-[5px]",
                      isLeftConnected
                        ? "!bg-amber-500 !border-amber-500 ring-2 ring-amber-500/30"
                        : "!bg-background border-muted-foreground/60 hover:!bg-amber-400",
                    )}
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                    title="Inbound: Connect from WebPage action"
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

                  <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 pr-2 pl-1">
                    <span
                      className="font-mono text-xs truncate select-text"
                      title={op.signature || op.name}
                    >
                      {op.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      className="opacity-0 group-hover/row:opacity-100 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-amber-500 transition-all cursor-pointer nodrag"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDialogOp(op);
                      }}
                      title="Preview / Test Operation"
                    >
                      <Play size={10} />
                    </button>

                    <span
                      className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 font-mono tracking-wider",
                        badge.colorClass,
                      )}
                    >
                      {badge.label}
                    </span>

                    {/* Delete operation button */}
                    <button
                      type="button"
                      className="opacity-0 group-hover/row:opacity-100 p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all cursor-pointer nodrag"
                      onClick={(e) => handleRemoveOperation(e, op)}
                      title="Remove Operation"
                    >
                      <Trash size={11} />
                    </button>
                  </div>

                  {/* Outbound Handle on RIGHT (to Service endpoint) */}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`func-out-${op.name}`}
                    className={cn(
                      "w-2.5 h-2.5 border-2 transition-colors -right-[5px]",
                      isRightConnected
                        ? "!bg-amber-500 !border-amber-500 ring-2 ring-amber-500/30"
                        : "!bg-background border-muted-foreground/60 hover:!bg-amber-400",
                    )}
                    style={{ top: "50%", transform: "translateY(-50%)" }}
                    title="Outbound: Connect to Service endpoint"
                  />
                  {op.id && op.id !== op.name && (
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`func-out-${op.id}`}
                      className="opacity-0 pointer-events-none -right-[5px]"
                      style={{ top: "50%", transform: "translateY(-50%)" }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Operation preview / test dialog */}
      {dialogOp && activeStorageNode && (
        <StorageOperationDialog
          isOpen={Boolean(dialogOp)}
          onClose={() => setDialogOp(null)}
          operation={dialogOp}
          storageNode={{
            id: activeStorageNode.id,
            data: activeStorageNode.data,
            type: activeStorageNode.type,
          }}
          onSave={handleSaveCustomOperation}
        />
      )}

      {/* New custom operation creation dialog */}
      {isCustomDialogOpen && activeStorageNode && (
        <StorageOperationDialog
          isOpen={isCustomDialogOpen}
          onClose={() => setIsCustomDialogOpen(false)}
          operation={null}
          isNew={true}
          storageNode={{
            id: activeStorageNode.id,
            data: activeStorageNode.data,
            type: activeStorageNode.type,
          }}
          onSave={handleSaveCustomOperation}
        />
      )}
    </div>
  );
};

export const StorageBucketRefNode = StorageOperationRefNode;
