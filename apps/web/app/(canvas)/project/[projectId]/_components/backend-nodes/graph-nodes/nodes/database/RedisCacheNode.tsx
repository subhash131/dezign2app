"use client";

import React, { useMemo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { DatabaseZap, Server, Layers, Settings, Trash, AlertTriangle } from "lucide-react";
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
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";

export const RedisCacheNode = ({
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

  const redisInstances = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "redis_instance" ||
          (n?.type === "database" &&
            (n.data?.dbEngine === "redis" || n.data?.dbType === "redis")),
      ),
    ),
  );

  const allRedisSchemas = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "redis_schema" ||
          (n?.type === "entity" && n.data?.dbType === "redis"),
      ),
    ),
  );

  const selectedSchema = allRedisSchemas.find((s) => s.id === data.schemaRef);
  const selectedInstanceId =
    data.databaseId || selectedSchema?.data?.databaseId;
  const selectedInstance = redisInstances.find(
    (n) => n.id === selectedInstanceId,
  );

  const filteredSchemas = useMemo(() => {
    if (!selectedInstanceId || selectedInstanceId === "__all__")
      return allRedisSchemas;
    const directMatches = allRedisSchemas.filter(
      (s) =>
        s.data?.databaseId === selectedInstanceId ||
        edges.some(
          (e) =>
            (e.source === selectedInstanceId && e.target === s.id) ||
            (e.target === selectedInstanceId && e.source === s.id),
        ),
    );
    return directMatches.length > 0 ? directMatches : allRedisSchemas;
  }, [allRedisSchemas, selectedInstanceId, edges]);

  const redisStructure =
    selectedSchema?.data?.redisDataStructure ||
    (selectedSchema ? "hash" : undefined);

  const handleOpenConfig = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveConfigItem({
      id,
      nodeId: id,
      type: "redis_cache",
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 p-2.5 rounded-xl bg-card/95 backdrop-blur border-2 min-w-[210px] max-w-[260px] shadow-md transition-all duration-150 cursor-pointer select-none",
        selected
          ? "border-red-500 shadow-red-500/15 ring-1 ring-red-500/20"
          : "border-border/80 hover:border-red-500/50 hover:shadow-lg",
        hasPipelineError &&
          "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Top row: Icon + Title + Structure Badge + Action Buttons */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="p-1 rounded-md bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/25 shrink-0">
            <DatabaseZap size={12} />
          </div>
          <span className="text-[9px] uppercase font-bold tracking-wider text-red-600 dark:text-red-400 truncate">
            Redis Cache Ref
          </span>
          {redisStructure && (
            <span className="text-[7px] font-mono px-1 py-0.2 rounded font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 uppercase shrink-0">
              {redisStructure}
            </span>
          )}
          {hasPipelineError && (
            <span className="text-[7px] font-medium px-1 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse">
              <AlertTriangle size={8} />
              Unmapped
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
            onClick={handleOpenConfig}
            title="Configure Redis Cache"
          >
            <Settings size={12} />
          </button>
          <button
            className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={handleDelete}
            title="Delete Node"
          >
            <Trash size={12} />
          </button>
        </div>
      </div>

      {hasPipelineError && (
        <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-destructive/10 border border-destructive/20 text-[10px] text-destructive leading-tight">
          <AlertTriangle size={11} className="shrink-0" />
          <span className="font-medium">Missing required input mapping</span>
        </div>
      )}

      {/* Dropdowns in flex-col */}
      <div className="flex flex-col gap-1.5 nodrag">
        {/* 1. Redis Instance Selector */}
        <Select
          value={selectedInstanceId || "__all__"}
          onValueChange={(val) => {
            const newInstanceId = val === "__all__" ? "" : val;
            const currentSchema = allRedisSchemas.find((s) => s.id === data.schemaRef);
            const belongsToNew =
              !newInstanceId ||
              (currentSchema &&
                (currentSchema.data?.databaseId === newInstanceId ||
                  edges.some(
                    (e) =>
                      (e.source === newInstanceId && e.target === currentSchema.id) ||
                      (e.target === newInstanceId && e.source === currentSchema.id),
                  )));

            updateNode(id, {
              data: {
                ...data,
                databaseId: newInstanceId || undefined,
                schemaRef: belongsToNew ? data.schemaRef : undefined,
                label: belongsToNew ? data.label : "Redis Cache Ref",
              },
            });
          }}
        >
          <SelectTrigger className="h-6 w-full text-[11px] font-medium bg-background/50 border-border/70 hover:border-red-500/50 px-2 py-0 truncate overflow-hidden">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <Server size={11} className="text-red-500/80 shrink-0" />
              <span className="truncate">
                {selectedInstance?.data?.label || (selectedInstanceId && selectedInstanceId !== "__all__" ? "Instance" : "All Instances")}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="nodrag z-[100]">
            <SelectItem value="__all__" className="text-xs">
              All Instances
            </SelectItem>
            {redisInstances.map((inst) => (
              <SelectItem key={inst.id} value={inst.id} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="truncate">{inst.data?.label || "Redis Instance"}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 2. Redis Schema Selector */}
        <Select
          value={data.schemaRef || ""}
          onValueChange={(val) => {
            const schema = allRedisSchemas.find((s) => s.id === val);
            updateNode(id, {
              data: {
                ...data,
                schemaRef: val,
                databaseId:
                  schema?.data?.databaseId || selectedInstanceId || data.databaseId,
                label: schema?.data?.label || "Redis Cache Ref",
                graphPosition: schema?.position,
              },
            });
          }}
        >
          <SelectTrigger className="h-6 w-full text-[11px] font-semibold bg-background/50 border-border/70 hover:border-red-500/50 px-2 py-0 truncate overflow-hidden">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <Layers size={11} className="text-red-500 shrink-0" />
              <span className="truncate">
                {selectedSchema?.data?.label || "Select Schema..."}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="nodrag z-[100]">
            {filteredSchemas.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground italic">
                {selectedInstanceId && selectedInstanceId !== "__all__"
                  ? "No schemas for instance"
                  : "No schemas defined"}
              </div>
            ) : (
              filteredSchemas.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.data?.label || "Untitled Cache"}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Target Handle on Left */}
      <Handle
        type="target"
        position={Position.Left}
        id="database-target"
        className="w-2.5 h-2.5 !bg-red-500 border-2 border-background"
      />
    </div>
  );
};
