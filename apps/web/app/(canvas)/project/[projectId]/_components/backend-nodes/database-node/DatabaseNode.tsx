import React from "react";
import { useParams } from "next/navigation";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Database, Trash, Settings, Server, Palette, Key, Table2, KeyRound, Zap, RefreshCw } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useDbSyncStore } from "@/lib/stores/dbSyncStore";
import {
  DEFAULT_DATABASE_NODE_LABEL,
  DEFAULT_DATABASE_ENGINE,
  CANVAS_HANDLE_CLASS,
} from "@workspace/canvas";

import { NodeHeader } from "../graph-nodes/common";
import { NodeEnvVarsSection } from "../graph-nodes/nodes/ai-security/ExternalEnvVarsDrawer";

export const DB_COLOR_PRESETS = [
  { name: "Amber", hex: "#f59e0b" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Orange", hex: "#f97316" },
];

export const DatabaseNode = React.memo(({ id, data, selected }: NodeProps<BackendNode>) => {
  const params = useParams();
  const projectId = (params?.projectId as string) || undefined;
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const requestDeleteNode = useBackendCanvasStore(
    (s) => s.requestDeleteNode,
  );
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const validateDatabase = useDbSyncStore((s) => s.validateDatabase);
  const isValidatingThisDb = useDbSyncStore(
    (s) => Boolean(s.validatingDatabases[id] || s.isValidatingAll),
  );

  const engine = data.dbEngine || DEFAULT_DATABASE_ENGINE;
  const color = data.color || "#f59e0b"; // Default to Amber
  const label = data.label || "";

  // Find all SQL / document table entity nodes hanging off this DB
  const attachedTables = allNodes.filter(
    (n) => n.type === "entity" && n.data?.databaseId === id,
  );

  const connStringEnv = data.connectionStringEnv || "DATABASE_URL";
  const dbFilePathEnv = data.dbFilePathEnv || "DB_FILE_PATH";
  const envVarsCount = data.envVars?.length || 0;

  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        setActiveConfigItem({
          type: "database",
          id: id,
          nodeId: id,
        });
      }}
      className={cn(
        "shadow-lg rounded-xl bg-card border-2 min-w-[270px] max-w-[350px] focus:outline-none transition-all group",
      )}
      style={{
        borderColor: color,
        boxShadow: selected
          ? `0 0 0 2px ${color}50, 0 10px 15px -3px rgba(0, 0, 0, 0.15)`
          : undefined,
      }}
    >
      {/* Incoming Connection Handle for Services/Tasks */}
      <Handle
        type="target"
        position={Position.Top}
        id="database-target"
        className={cn(CANVAS_HANDLE_CLASS, "!border-2 !border-background hover:scale-125 transition-all !-top-[7px]")}
        style={{ backgroundColor: color }}
      />

      {/* Node Header */}
      <NodeHeader
        id={id}
        data={data}
        nodeType="database"
        icon={Database}
        title="Database"
        style={{ backgroundColor: `${color}18` }}
        iconColor={color}
        selected={selected}
        placeholder="Enter database name..."
        badges={
          <div className="flex items-center gap-1">
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-mono uppercase"
              style={{
                backgroundColor: `${color}15`,
                borderColor: `${color}40`,
                color: color,
              }}
            >
              {engine}
            </Badge>
            {data.provider && data.provider !== "local" && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1.5 py-0 font-mono capitalize",
                  data.provider === "neon"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold"
                    : data.provider === "supabase"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
                )}
              >
                {data.provider === "neon"
                  ? "Neon"
                  : data.provider === "supabase"
                    ? "Supabase"
                    : data.provider === "aws_rds"
                      ? "AWS RDS"
                      : data.provider}
              </Badge>
            )}
            {envVarsCount > 0 && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1"
              >
                <KeyRound size={9} />
                <span>{envVarsCount} env</span>
              </Badge>
            )}
          </div>
        }
        rightElement={
          <div
            className="flex items-center justify-center p-1.5 rounded hover:bg-background/40 transition-all cursor-pointer"
            style={{ color }}
            title="Configure Database"
            onClick={(e) => {
              e.stopPropagation();
              setActiveConfigItem({
                type: "database",
                id: id,
                nodeId: id,
              });
            }}
          >
            <Settings size={15} />
          </div>
        }
      />

      {/* Body / Config Summary */}
      <div className="p-3 flex flex-col gap-2 text-xs">
        {/* Color Palette Selector Section */}
        <div className="flex items-center justify-between bg-muted/30 p-1.5 rounded-lg border border-border/40 nodrag">
          <div className="flex items-center text-muted-foreground gap-1.5">
            <Palette size={12} className="shrink-0" style={{ color }} />
            <span className="text-[11px] font-medium">Theme Color</span>
          </div>
          <div className="flex items-center gap-1">
            {DB_COLOR_PRESETS.map((preset) => {
              const isSelected =
                color.toLowerCase() === preset.hex.toLowerCase();
              return (
                <button
                  key={preset.hex}
                  type="button"
                  title={preset.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateNode(id, { data: { ...data, color: preset.hex } });
                  }}
                  className={cn(
                    "w-3.5 h-3.5 rounded-full transition-transform hover:scale-125 focus:outline-none cursor-pointer",
                    isSelected &&
                      "ring-2 ring-offset-1 ring-offset-background scale-110",
                  )}
                  style={{
                    backgroundColor: preset.hex,
                    borderColor: isSelected ? preset.hex : "transparent",
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between bg-muted/30 p-1.5 rounded-lg border border-border/40">
          <div className="flex items-center text-muted-foreground gap-1.5">
            <Key size={12} className="shrink-0" style={{ color }} />
            <span className="text-[11px] font-medium">ENV Connection</span>
          </div>
          <code
            className="text-[10px] font-mono font-semibold bg-background px-1.5 py-0.5 rounded border border-border/60"
            style={{ color }}
          >
            {connStringEnv}
          </code>
        </div>

        {(data.connectionStringPooled || data.provider === "neon" || data.provider === "supabase") && (
          <div className="flex items-center justify-between bg-emerald-500/5 p-1.5 rounded-lg border border-emerald-500/20">
            <div className="flex items-center text-emerald-600 dark:text-emerald-400 gap-1.5">
              <Zap size={12} className="shrink-0" />
              <span className="text-[11px] font-medium">Pooled ENV</span>
            </div>
            <code className="text-[10px] font-mono font-semibold bg-background px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              {data.connectionStringPooledEnv || "DATABASE_URL_POOLED"}
            </code>
          </div>
        )}

        {engine === "sqlite" && (
          <div className="flex items-center justify-between bg-muted/30 p-1.5 rounded-lg border border-border/40">
            <div className="flex items-center text-muted-foreground gap-1.5">
              <Server size={12} className="shrink-0" style={{ color }} />
              <span className="text-[11px] font-medium">File Path ENV</span>
            </div>
            <code className="text-[10px] font-mono font-semibold bg-background px-1.5 py-0.5 rounded border border-border/60 text-foreground/80">
              {dbFilePathEnv}
            </code>
          </div>
        )}

        {/* Connected Entities Counter & Validate DB Button */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[11px] nodrag">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Table2 size={12} style={{ color }} />
            <span>Hanging Tables</span>
            <span className="font-semibold text-foreground bg-secondary px-1.5 py-0.2 rounded-full text-[10px]">
              {attachedTables.length}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            disabled={isValidatingThisDb || attachedTables.length === 0}
            onClick={(e) => {
              e.stopPropagation();
              validateDatabase(id);
            }}
            className="h-7 px-2.5 text-xs text-foreground hover:bg-secondary/80 border border-border/50 hover:border-emerald-500/40 rounded-lg gap-1.5 shadow-xs transition-colors"
            title={
              attachedTables.length === 0
                ? "No tables connected to this database"
                : "Validate schema of all tables attached to this database against live DB"
            }
          >
            <RefreshCw
              className={cn(
                "w-3.5 h-3.5 text-emerald-500",
                isValidatingThisDb && "animate-spin",
              )}
            />
            <span>{isValidatingThisDb ? "Validating DB..." : "Validate DB"}</span>
          </Button>
        </div>
      </div>

      {/* Environment Variables (.env) Section */}
      <NodeEnvVarsSection nodeId={id} projectId={projectId} />

      {/* Outgoing Handle to Hanging Entity Nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="database-source"
        className={cn(CANVAS_HANDLE_CLASS, "!border-2 !border-background hover:scale-125 transition-all !-bottom-[7px]")}
        style={{ backgroundColor: color }}
      />
    </div>
  );
});

DatabaseNode.displayName = "DatabaseNode";
