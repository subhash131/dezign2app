import React, { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import type { LangGraphMemoryConfig, BackendNode } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import {
  Database,
  DatabaseZap,
  Server,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Table2,
  Plus,
  Lock,
  X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface MemoryTabContentProps {
  memoryConfig: LangGraphMemoryConfig;
  setMemoryConfig: React.Dispatch<React.SetStateAction<LangGraphMemoryConfig>>;
  onClose?: () => void;
}

import {
  LANGGRAPH_POSTGRES_TABLE_DEFINITIONS,
  LANGGRAPH_REDIS_SCHEMA_DEFINITIONS,
  provisionCheckpointerTables,
  provisionDatabaseAndCheckpointerTables,
  getExistingCheckpointerTables,
} from "../../utils/checkpointerTables";
import { CheckpointerTablesList } from "./CheckpointerTablesList";

export const LANGGRAPH_TABLE_DEFINITIONS = LANGGRAPH_POSTGRES_TABLE_DEFINITIONS;

export function MemoryTabContent({
  memoryConfig,
  setMemoryConfig,
  onClose,
}: MemoryTabContentProps) {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.projectId as string) || "";

  const handleOpenSchemaView = () => {
    useBackendCanvasStore.getState().setView("schema");
    if (projectId) {
      router.push(`/project/${projectId}?view=schema`);
    }
  };

  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addNode = useBackendCanvasStore((s) => s.addNode);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);

  const postgresDatabaseNodes = useMemo(
    () => nodes.filter((n) => n?.type === "database" && n.data?.dbEngine === "postgres"),
    [nodes],
  );

  const redisNodes = useMemo(
    () =>
      nodes.filter(
        (n) => n?.type === "redis_instance" || (n?.type === "database" && n.data?.dbEngine === "redis"),
      ),
    [nodes],
  );

  const currentEngine = memoryConfig.checkpointer || "memory";
  const linkedNodeId = memoryConfig.checkpointerNodeId;
  const linkedNode = useMemo(
    () => nodes.find((n) => n.id === linkedNodeId),
    [nodes, linkedNodeId],
  );

  // Check if LangGraph tables exist under the linked database / redis instance
  const existingLangGraphTables = useMemo(() => {
    if (!linkedNodeId) return [];
    return getExistingCheckpointerTables(nodes, edges, currentEngine, linkedNodeId);
  }, [nodes, edges, currentEngine, linkedNodeId]);

  const isEnabled = memoryConfig.enabled !== false;
  const hasMissingLinkedDb =
    isEnabled &&
    (currentEngine === "postgres" || currentEngine === "redis") &&
    (!linkedNodeId || !linkedNode);

  const handleCreateTables = () => {
    if (!linkedNodeId || !linkedNode) {
      const result = provisionDatabaseAndCheckpointerTables({
        nodes,
        edges,
        addNode,
        updateNode,
        addEdge,
        checkpointerType: currentEngine,
      });

      if (result.configuredNodeId) {
        setMemoryConfig({ ...memoryConfig, checkpointerNodeId: result.configuredNodeId });
        toast.success(
          `Created ${currentEngine === "redis" ? "Redis instance" : "PostgreSQL database"} and ${result.createdCount} checkpointer tables in SchemaView!`,
        );
      }
      return;
    }

    const createdCount = provisionCheckpointerTables({
      linkedNodeId,
      checkpointerType: currentEngine,
      nodes,
      edges,
      addNode,
      updateNode,
      addEdge,
    });

    if (createdCount > 0) {
      toast.success(
        `Provisioned & synced LangGraph ${currentEngine === "redis" ? "schemas" : "tables"} with foreign key mappings and indexes in SchemaView!`,
      );
    } else {
      toast.info(`All LangGraph checkpointer ${currentEngine === "redis" ? "schemas" : "tables"} are up to date.`);
    }
  };


  return (
    <div className="flex-1 min-h-0 p-4 overflow-y-auto hide-scrollbar m-0 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Database className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-xs text-foreground tracking-wide">
              Graph Checkpointer
            </span>
            <span className="text-[10px] text-muted-foreground">
              Configure graph state persistence & memory saver
            </span>
          </div>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            title="Close inspector (Esc)"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Enable / Disable Checkpoint Toggle Card */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/50">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-amber-500" />
            Graph State Checkpointing
          </span>
          <span className="text-[10px] text-muted-foreground">
            {isEnabled
              ? "Persist graph state snapshots and turns across sessions"
              : "Disabled: Graph state lives only in-memory for current turn"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-muted-foreground">
            {isEnabled ? "ON" : "OFF"}
          </span>
          <Switch
            checked={isEnabled}
            onCheckedChange={(checked) =>
              setMemoryConfig((prev) => ({ ...prev, enabled: checked }))
            }
          />
        </div>
      </div>

      {!isEnabled && (
        <div className="p-3 rounded-xl bg-secondary/15 border border-border/30 text-center flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">
            Checkpointing is currently turned off
          </span>
          <span className="text-[11px] text-muted-foreground/70">
            The graph will compile without state persistence. To enable PostgreSQL, Redis, or In-Memory checkpointing, switch the toggle above ON.
          </span>
        </div>
      )}

      {/* Engine Selection */}
      <div className={`flex flex-col gap-2 ${!isEnabled ? "opacity-40 pointer-events-none" : ""}`}>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-primary" />
          Checkpointer Engine
        </span>
        <Select
          value={currentEngine}
          onValueChange={(v: string) => {
            const nextEngine = v as LangGraphMemoryConfig["checkpointer"];
            if (nextEngine === "memory") {
              setMemoryConfig((prev) => ({
                ...prev,
                checkpointer: "memory",
                checkpointerNodeId: undefined,
                checkpointerEnvVar: undefined,
              }));
            } else if (nextEngine === "postgres") {
              const defaultPg = postgresDatabaseNodes[0];
              setMemoryConfig((prev) => ({
                ...prev,
                checkpointer: "postgres",
                checkpointerNodeId: defaultPg?.id,
                checkpointerEnvVar:
                  defaultPg?.data?.connectionStringEnv || "POSTGRES_CHECKPOINTER_CONN_STRING",
              }));
            } else if (nextEngine === "redis") {
              const defaultRedis = redisNodes[0];
              setMemoryConfig((prev) => ({
                ...prev,
                checkpointer: "redis",
                checkpointerNodeId: defaultRedis?.id,
                checkpointerEnvVar:
                  defaultRedis?.data?.connectionStringEnv || "REDIS_CHECKPOINTER_URL",
              }));
            }
          }}
        >
          <SelectTrigger className="h-9 text-xs bg-background/50 font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="memory">
              <div className="flex items-center gap-2">
                <span className="font-semibold">In-Memory</span>
                <span className="text-muted-foreground text-[11px]">(MemorySaver)</span>
              </div>
            </SelectItem>
            <SelectItem value="postgres">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-sky-500" />
                <span className="font-semibold">PostgreSQL</span>
                <span className="text-muted-foreground text-[11px]">(PostgresSaver)</span>
              </div>
            </SelectItem>
            <SelectItem value="redis">
              <div className="flex items-center gap-2">
                <DatabaseZap className="w-3.5 h-3.5 text-red-500" />
                <span className="font-semibold">Redis</span>
                <span className="text-muted-foreground text-[11px]">(RedisSaver)</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground">
          {currentEngine === "postgres"
            ? "Production checkpointer using PostgreSQL. Checkpoints and writes are persisted across sessions."
            : currentEngine === "redis"
              ? "Fast in-memory key-value checkpointer using Redis instances."
              : "Ephemeral in-memory checkpointer. Resets whenever graph execution restarts."}
        </span>
      </div>

      {/* Missing Linked Database Warning Banner */}
      {hasMissingLinkedDb && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1.5 flex-1">
            <span className="font-bold">Database Required</span>
            <span>
              {currentEngine === "postgres"
                ? postgresDatabaseNodes.length === 0
                  ? "No PostgreSQL databases exist in SchemaView. Please create a Database node with engine set to 'postgres' in SchemaView."
                  : "Please select a PostgreSQL database from SchemaView to persist checkpoints."
                : redisNodes.length === 0
                  ? "No Redis instances exist in SchemaView. Please create a Redis Instance in SchemaView."
                  : "Please select a Redis instance from SchemaView."}
            </span>
            {(currentEngine === "postgres"
              ? postgresDatabaseNodes.length === 0
              : redisNodes.length === 0) && (
              <Button
                size="sm"
                variant="outline"
                className="mt-1 h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/20 w-fit gap-1.5"
                onClick={handleOpenSchemaView}
              >
                <span>Open Schema View</span>
                <ExternalLink className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* PostgreSQL Database Picker */}
      {currentEngine === "postgres" && (
        <div className="flex flex-col gap-3 p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-sky-500" />
              Linked PostgreSQL Database
            </span>
            {linkedNode && linkedNode.data?.dbEngine === "postgres" && (
              <Badge variant="outline" className="text-[10px] text-sky-500 border-sky-500/30 bg-sky-500/10">
                postgres
              </Badge>
            )}
          </div>

          <Select
            value={linkedNode?.data?.dbEngine === "postgres" ? linkedNodeId || "none" : "none"}
            onValueChange={(val: string) => {
              if (val === "none") {
                setMemoryConfig((prev) => ({
                  ...prev,
                  checkpointerNodeId: undefined,
                }));
              } else {
                const targetDb = postgresDatabaseNodes.find((d) => d.id === val);
                const envName =
                  targetDb?.data?.connectionStringEnv ||
                  `${(targetDb?.data?.label || "POSTGRES").toUpperCase().replace(/[^A-Z0-9]/g, "_")}_CONN_STRING`;
                setMemoryConfig((prev) => ({
                  ...prev,
                  checkpointerNodeId: val,
                  checkpointerEnvVar: envName,
                }));
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-background/50">
              <SelectValue placeholder="Select PostgreSQL database..." />
            </SelectTrigger>
            <SelectContent>
              {postgresDatabaseNodes.length === 0 ? (
                <SelectItem value="none" disabled>
                  No PostgreSQL databases found in SchemaView
                </SelectItem>
              ) : (
                postgresDatabaseNodes.map((db) => (
                  <SelectItem key={db.id} value={db.id}>
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-sky-500" />
                      <span>{db.data?.label || "PostgreSQL Database"}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        (postgres)
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {postgresDatabaseNodes.length === 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenSchemaView}
              className="h-7 text-xs border-dashed text-muted-foreground hover:text-foreground gap-1.5 justify-center"
            >
              <Plus className="w-3 h-3" />
              <span>Create PostgreSQL Database in Schema View</span>
            </Button>
          )}

          {/* Table Provisioning Status & Action */}
          <CheckpointerTablesList
            checkpointerType="postgres"
            existingTables={existingLangGraphTables}
            linkedNodeId={linkedNodeId}
            onCreateTables={handleCreateTables}
          />
        </div>
      )}

      {/* Redis Instance Picker */}
      {currentEngine === "redis" && (
        <div className="flex flex-col gap-3 p-3.5 rounded-xl border bg-card/60 backdrop-blur-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <DatabaseZap className="w-3.5 h-3.5 text-red-500" />
            Linked Redis Instance
          </span>

          <Select
            value={linkedNodeId || "none"}
            onValueChange={(val: string) => {
              if (val === "none") {
                setMemoryConfig((prev) => ({
                  ...prev,
                  checkpointerNodeId: undefined,
                }));
              } else {
                const targetRedis = redisNodes.find((d) => d.id === val);
                setMemoryConfig((prev) => ({
                  ...prev,
                  checkpointerNodeId: val,
                  checkpointerEnvVar: targetRedis?.data?.connectionStringEnv || "REDIS_CHECKPOINTER_URL",
                }));
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-background/50">
              <SelectValue placeholder="Select Redis instance..." />
            </SelectTrigger>
            <SelectContent>
              {redisNodes.length === 0 ? (
                <SelectItem value="none" disabled>
                  No Redis instances found in SchemaView
                </SelectItem>
              ) : (
                redisNodes.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    <div className="flex items-center gap-2">
                      <span>{inst.data?.label || "Redis Instance"}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        (port: {String(inst.data?.port || 6379)})
                      </span>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          {redisNodes.length === 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenSchemaView}
              className="h-7 text-xs border-dashed text-muted-foreground hover:text-foreground gap-1.5 justify-center"
            >
              <Plus className="w-3 h-3" />
              <span>Create Redis Instance in Schema View</span>
            </Button>
          )}

          {/* Redis Schema Provisioning Status & Action */}
          <CheckpointerTablesList
            checkpointerType="redis"
            existingTables={existingLangGraphTables}
            linkedNodeId={linkedNodeId}
            onCreateTables={handleCreateTables}
          />
        </div>
      )}

      {/* Thread Scope */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Thread Scope
        </span>
        <Select
          value={memoryConfig.threadScope || "session"}
          onValueChange={(v: "session" | "user" | "global") =>
            setMemoryConfig((prev) => ({ ...prev, threadScope: v }))
          }
        >
          <SelectTrigger className="h-8 text-xs bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="session">Session (Per Conversation)</SelectItem>
            <SelectItem value="user">User (Shared across sessions)</SelectItem>
            <SelectItem value="global">Global (Singleton shared state)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Auto-Summarize Switch */}
      <div className="flex items-center justify-between rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">
            Auto-Summarize
          </span>
          <span className="text-xs text-muted-foreground">
            Compress history when message count exceeds threshold
          </span>
        </div>
        <Switch
          checked={memoryConfig.autoSummarize ?? true}
          onCheckedChange={(c) =>
            setMemoryConfig((prev) => ({ ...prev, autoSummarize: c }))
          }
        />
      </div>
    </div>
  );
}
