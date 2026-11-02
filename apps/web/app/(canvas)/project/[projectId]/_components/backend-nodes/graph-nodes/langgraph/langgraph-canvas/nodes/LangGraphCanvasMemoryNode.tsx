import React from "react";
import { useParams, useRouter } from "next/navigation";
import { NodeProps, useReactFlow } from "@xyflow/react";
import {
  Database,
  HardDrive,
  Key,
  Layers,
  AlertTriangle,
  Plus,
  ExternalLink,
  CheckCircle2,
  X,
} from "lucide-react";
import { Switch } from "@workspace/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type { MemoryNode, LangGraphCanvasNode } from "@workspace/canvas";
import { LANGGRAPH_CANVAS_NODE_MEMORY } from "../constants";
import { LocalInput } from "../../../common";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  checkCheckpointerTablesStatus,
  provisionCheckpointerTables,
  provisionDatabaseAndCheckpointerTables,
} from "../utils/checkpointerTables";
import { toast } from "sonner";

export const LangGraphCanvasMemoryNode = ({
  id,
  data,
  selected,
}: NodeProps<MemoryNode>) => {
  const { setNodes } = useReactFlow<LangGraphCanvasNode>();
  const allCanvasNodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addNode = useBackendCanvasStore((s) => s.addNode);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);

  const postgresNodes = React.useMemo(
    () => allCanvasNodes.filter((n) => n?.type === "database" && n.data?.dbEngine === "postgres"),
    [allCanvasNodes],
  );

  const redisNodes = React.useMemo(
    () =>
      allCanvasNodes.filter(
        (n) => n?.type === "redis_instance" || (n?.type === "database" && n.data?.dbEngine === "redis"),
      ),
    [allCanvasNodes],
  );

  const isEnabled = data.enabled !== false;
  const checkpointerType = data.checkpointer || "postgres";
  const threadIdKey = data.threadIdKey || "thread_id";

  const tableStatus = React.useMemo(
    () =>
      checkCheckpointerTablesStatus(
        allCanvasNodes,
        edges,
        isEnabled,
        checkpointerType,
        data.checkpointerConnectionId,
      ),
    [allCanvasNodes, edges, isEnabled, checkpointerType, data.checkpointerConnectionId],
  );

  const hasTableError =
    isEnabled &&
    (checkpointerType === "postgres" || checkpointerType === "redis") &&
    !tableStatus.areTablesCreated;

  const updateMemoryData = (changes: Partial<typeof data>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id && n.type === LANGGRAPH_CANVAS_NODE_MEMORY
          ? { ...n, data: { ...n.data, ...changes } }
          : n,
      ),
    );
  };

  const handleToggle = (checked: boolean) => {
    updateMemoryData({ enabled: checked });
    if (data.onToggleEnabled) {
      data.onToggleEnabled(checked);
    }
  };

  const params = useParams();
  const router = useRouter();
  const storeProjectId = useBackendCanvasStore((s) => s.projectId);
  const rawProjectId = params?.projectId;
  const routeProjectId =
    typeof rawProjectId === "string"
      ? rawProjectId
      : Array.isArray(rawProjectId)
        ? rawProjectId[0]
        : undefined;
  const projectId = routeProjectId || storeProjectId;

  const handleOpenSchemaView = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    useBackendCanvasStore.getState().setView("schema");
    if (projectId) {
      router.push(`/project/${projectId}?view=schema`);
    }
  };

  const handleCreateMissingTables = (e: React.MouseEvent) => {
    e.stopPropagation();

    // 1-Click fallback when no storage database exists in SchemaView
    if (tableStatus.isMissingStorage || !tableStatus.configuredNodeId) {
      const result = provisionDatabaseAndCheckpointerTables({
        nodes: allCanvasNodes,
        edges,
        addNode,
        updateNode,
        addEdge,
        checkpointerType,
      });

      if (result.configuredNodeId) {
        updateMemoryData({ checkpointerConnectionId: result.configuredNodeId });
        data.onUpdateMemoryConfig?.({ checkpointerNodeId: result.configuredNodeId });
        toast.success(
          `Created ${checkpointerType === "postgres" ? "PostgreSQL database" : "Redis instance"} and ${result.createdCount} checkpointer tables in SchemaView!`,
        );
      }
      return;
    }

    const created = provisionCheckpointerTables({
      linkedNodeId: tableStatus.configuredNodeId,
      checkpointerType,
      nodes: allCanvasNodes,
      edges,
      addNode,
      updateNode,
      addEdge,
    });

    if (created > 0) {
      toast.success(
        `Created ${created} LangGraph checkpointer ${checkpointerType === "postgres" ? "table" : "schema"}${created > 1 ? "s" : ""} in SchemaView!`,
      );
      if (data.checkpointerConnectionId !== tableStatus.configuredNodeId) {
        updateMemoryData({ checkpointerConnectionId: tableStatus.configuredNodeId });
        data.onUpdateMemoryConfig?.({ checkpointerNodeId: tableStatus.configuredNodeId });
      }
    } else {
      toast.info("All LangGraph checkpointer tables already exist in SchemaView.");
    }
  };

  return (
    <div
      className={`rounded-xl bg-card/95 backdrop-blur-md border-2 w-[300px] p-3 flex flex-col gap-2.5 transition-all duration-200 shadow-xl relative cursor-pointer ${
        hasTableError
          ? selected
            ? "ring-4 ring-destructive/25 shadow-destructive/15 scale-105 border-destructive"
            : "border-destructive/80 hover:border-destructive shadow-destructive/10"
          : selected
            ? "ring-4 ring-amber-500/20 shadow-amber-500/10 scale-105 border-amber-500"
            : "border-amber-500/60 hover:border-amber-500/90"
      }`}
      onClick={() => {
        data.onOpenMemoryTab?.();
      }}
    >
      {/* Node Header */}
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-lg shrink-0 border ${
              hasTableError
                ? "bg-destructive/15 text-destructive border-destructive/30"
                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
            }`}
          >
            <Database className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-xs text-foreground tracking-wide flex items-center gap-1.5 flex-wrap">
              Checkpointer
              {isEnabled && (
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-mono font-bold uppercase ${
                    hasTableError
                      ? "bg-destructive/15 text-destructive"
                      : "bg-amber-500/15 text-amber-500"
                  }`}
                >
                  {checkpointerType}
                </span>
              )}
              {hasTableError && (
                <span className="text-[8px] font-mono px-1 py-0.2 rounded font-semibold bg-destructive/20 text-destructive flex items-center gap-0.5 shrink-0">
                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                  SCHEMA ERROR
                </span>
              )}
            </span>
            <span className="text-[9px] font-mono text-muted-foreground truncate">
              {isEnabled
                ? checkpointerType === "postgres"
                  ? "PostgresSaver (persisted)"
                  : checkpointerType === "redis"
                    ? "RedisSaver (persisted)"
                    : "MemorySaver (in-memory)"
                : "Disabled (no checkpoint)"}
            </span>
          </div>
        </div>

        {/* Toggle Button to Enable or Disable Checkpointing */}
        <div
          className="flex items-center gap-1.5 nodrag shrink-0 ml-1"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="text-[9px] font-mono font-bold text-muted-foreground">
            {isEnabled ? "ON" : "OFF"}
          </span>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            className="scale-75"
          />
        </div>
      </div>

      {/* Disabled State Body */}
      {!isEnabled && (
        <div className="p-2.5 rounded-lg bg-secondary/20 border border-border/40 flex flex-col items-center justify-center gap-1 text-center py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">
            Checkpointing Disabled
          </span>
          <span className="text-[9px] text-muted-foreground/70 leading-tight">
            Graph state is temporary for the current turn. Toggle ON to persist snapshots across turns.
          </span>
        </div>
      )}

      {/* Enabled State Body */}
      {isEnabled && (
        <div
          className="flex flex-col gap-2.5 nodrag"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Checkpointer Saver Engine Selection */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[9px] font-semibold text-muted-foreground uppercase">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-amber-500" />
                Saver Engine
              </span>
              <button
                type="button"
                className="text-[9px] text-amber-500 hover:underline cursor-pointer lowercase"
                onClick={() => data.onOpenMemoryTab?.()}
              >
                memory tab ↗
              </button>
            </div>
            <Select
              value={checkpointerType}
              onValueChange={(val: string) => {
                let defaultConn = data.checkpointerConnectionId;
                if (val === "postgres") {
                  defaultConn = postgresNodes[0]?.id;
                } else if (val === "redis") {
                  defaultConn = redisNodes[0]?.id;
                }
                updateMemoryData({
                  checkpointer: val,
                  checkpointerConnectionId: defaultConn,
                });
                if (data.onUpdateMemoryConfig) {
                  data.onUpdateMemoryConfig({
                    checkpointer: val,
                    checkpointerNodeId: defaultConn,
                  });
                }
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-secondary/30 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postgres">PostgreSQL (PostgresSaver)</SelectItem>
                <SelectItem value="redis">Redis (RedisSaver)</SelectItem>
                <SelectItem value="memory">In-Memory (MemorySaver)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Linked Database for PostgreSQL */}
          {checkpointerType === "postgres" && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-semibold text-sky-500 uppercase flex items-center gap-1">
                <Database className="w-3 h-3 text-sky-500" />
                Linked PostgreSQL Database
              </span>
              <Select
                value={
                  data.checkpointerConnectionId &&
                  postgresNodes.some((p) => p.id === data.checkpointerConnectionId)
                    ? String(data.checkpointerConnectionId)
                    : (postgresNodes[0]?.id || "none")
                }
                onValueChange={(val: string) => {
                  const newId = val === "none" ? undefined : val;
                  updateMemoryData({ checkpointerConnectionId: newId });
                  if (data.onUpdateMemoryConfig) {
                    data.onUpdateMemoryConfig({ checkpointerNodeId: newId });
                  }
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-secondary/30 font-mono">
                  <SelectValue placeholder="Select Database..." />
                </SelectTrigger>
                <SelectContent>
                  {postgresNodes.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No PostgreSQL database in SchemaView
                    </SelectItem>
                  ) : (
                    postgresNodes.map((db) => (
                      <SelectItem key={db.id} value={db.id}>
                        {db.data?.label || "PostgreSQL DB"} (postgres)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {postgresNodes.length === 0 && (
                <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  No PostgreSQL DB in SchemaView
                </span>
              )}
            </div>
          )}

          {/* Linked Redis Instance */}
          {checkpointerType === "redis" && (
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-semibold text-red-500 uppercase flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-red-500" />
                Linked Redis Instance
              </span>
              <Select
                value={
                  data.checkpointerConnectionId &&
                  redisNodes.some((r) => r.id === data.checkpointerConnectionId)
                    ? String(data.checkpointerConnectionId)
                    : (redisNodes[0]?.id || "none")
                }
                onValueChange={(val: string) => {
                  const newId = val === "none" ? undefined : val;
                  updateMemoryData({ checkpointerConnectionId: newId });
                  if (data.onUpdateMemoryConfig) {
                    data.onUpdateMemoryConfig({ checkpointerNodeId: newId });
                  }
                }}
              >
                <SelectTrigger className="h-7 text-xs bg-secondary/30 font-mono">
                  <SelectValue placeholder="Select Redis..." />
                </SelectTrigger>
                <SelectContent>
                  {redisNodes.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No Redis in SchemaView
                    </SelectItem>
                  ) : (
                    redisNodes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.data?.label || "Redis Instance"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {redisNodes.length === 0 && (
                <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  No Redis in SchemaView
                </span>
              )}
            </div>
          )}

          {/* Error Banner when tables are not created on SchemaView */}
          {hasTableError && (
            <div
              className="flex flex-col gap-2 p-2.5 rounded-xl bg-destructive/10 border-2 border-destructive/40 text-destructive shadow-md nodrag animate-in fade-in slide-in-from-top-1 duration-150"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Banner Header */}
              <div className="flex items-start gap-2">
                <div className="p-1 rounded-md bg-destructive/20 text-destructive shrink-0 mt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold leading-tight">
                      Checkpointer Tables Required
                    </span>
                    <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded bg-destructive/20 text-destructive shrink-0 border border-destructive/30">
                      {tableStatus.existingTables.length}/{tableStatus.expectedCount} Tables
                    </span>
                  </div>
                  <span className="text-[9.5px] text-destructive/90 leading-tight mt-0.5">
                    {tableStatus.isMissingStorage
                      ? `No ${checkpointerType === "postgres" ? "PostgreSQL database" : "Redis instance"} found in SchemaView to store thread state.`
                      : `State persistence requires LangGraph tables in "${tableStatus.configuredNode?.data?.label || "PostgreSQL"}" in SchemaView:`}
                  </span>
                </div>
              </div>

              {/* Table Breakdown List */}
              <div className="flex flex-col gap-1 p-1.5 rounded-lg bg-background/80 border border-destructive/25 text-[9.5px] font-mono">
                {tableStatus.tableBreakdown.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-1 min-w-0 truncate">
                      <span className="text-[8px] text-muted-foreground">•</span>
                      <span className="font-semibold truncate text-foreground">
                        {item.name}
                      </span>
                      {item.name === "langgraph_checkpoint_migrations" && (
                        <span className="text-[7.5px] px-1 py-0.2 rounded bg-muted text-muted-foreground font-sans font-normal shrink-0">
                          migration
                        </span>
                      )}
                    </div>
                    {item.exists ? (
                      <span className="text-[8px] px-1 py-0.2 rounded font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 shrink-0">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Exists
                      </span>
                    ) : (
                      <span className="text-[8px] px-1 py-0.2 rounded font-bold bg-destructive/15 text-destructive flex items-center gap-0.5 shrink-0">
                        <X className="w-2.5 h-2.5" />
                        Missing
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleCreateMissingTables}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[10.5px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow active:scale-95 border border-red-600 tracking-tight"
                  title={
                    tableStatus.isMissingStorage
                      ? `Create PostgreSQL DB and checkpointer tables in SchemaView`
                      : `Create required LangGraph checkpointer tables in SchemaView`
                  }
                >
                  <Plus className="w-3.5 h-3.5 shrink-0 text-white stroke-[2.5]" />
                  <span>
                    {tableStatus.isMissingStorage
                      ? `+ Create DB & Tables`
                      : `+ Create ${tableStatus.missingCount} Table${tableStatus.missingCount > 1 ? "s" : ""} in SchemaView`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenSchemaView}
                  className="py-1.5 px-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer border border-border/60 shrink-0"
                  title="Open SchemaView ER Diagram"
                >
                  <span>SchemaView</span>
                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground" />
                </button>
              </div>
            </div>
          )}

          {/* Reassuring Success State when tables exist */}
          {!hasTableError &&
            isEnabled &&
            (checkpointerType === "postgres" || checkpointerType === "redis") &&
            tableStatus.areTablesCreated && (
              <div
                className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] nodrag animate-in fade-in duration-150"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5 font-medium truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                  <span className="truncate">
                    {tableStatus.expectedCount} Checkpointer Tables Active in SchemaView
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenSchemaView}
                  className="text-[9px] underline hover:opacity-80 shrink-0 font-medium ml-1 cursor-pointer flex items-center gap-0.5"
                >
                  <span>view</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              </div>
            )}

          {/* Thread / Session ID Field */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
              <Key className="w-3 h-3 text-amber-500" />
              Thread ID Key
            </span>
            <LocalInput
              className="h-7 text-xs bg-secondary/30 border border-border/50 p-1.5 rounded font-mono nodrag"
              placeholder="thread_id"
              value={threadIdKey}
              onChange={(e) => {
                updateMemoryData({ threadIdKey: e.target.value });
                if (data.onUpdateMemoryConfig) {
                  data.onUpdateMemoryConfig({ threadIdKey: e.target.value });
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

