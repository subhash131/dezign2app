import React from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import {
  DatabaseZap,
  Settings,
  Palette,
  Radio,
  Key,
  ShieldCheck,
  HardDrive,
} from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Badge } from "@workspace/ui/components/badge";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader } from "../graph-nodes/common";

export const REDIS_COLOR_PRESETS = [
  { name: "Crimson", hex: "#ef4444" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Orange", hex: "#f97316" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Cyan", hex: "#06b6d4" },
];

export const RedisInstanceNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const requestDeleteNode = useBackendCanvasStore(
    (s) => s.requestDeleteNode,
  );
  const allNodes = useBackendCanvasStore((s) => s.nodes);

  const color = data.color || "#ef4444";
  const label = data.label || "";
  const port = String(data.port || "6379");
  const host = data.host || "localhost";

  // Find all Redis schema entities hanging off this instance
  const attachedSchemas = allNodes.filter(
    (n) =>
      (n.type === "redis_schema" || (n.type === "entity" && n.data?.dbType === "redis")) &&
      n.data?.databaseId === id,
  );

  const connStringEnv = data.connectionStringEnv || "REDIS_URL";
  const maxmemoryPolicy = data.maxmemoryPolicy || "volatile-lru";
  const persistenceMode = data.persistenceMode || "RDB+AOF";

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
      {/* Incoming Connection Handle for Services/Workers */}
      <Handle
        type="target"
        position={Position.Top}
        id="database-target"
        className="w-3 h-3 border-2 border-background !-top-1.5"
        style={{ backgroundColor: color }}
      />

      {/* Node Header */}
      <NodeHeader
        id={id}
        data={data}
        nodeType="redis_instance"
        icon={DatabaseZap}
        title="Redis Instance"
        style={{ backgroundColor: `${color}18` }}
        iconColor={color}
        selected={selected}
        placeholder="Enter Redis instance name..."
        badges={
          <>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-mono font-bold"
              style={{
                backgroundColor: `${color}15`,
                borderColor: `${color}40`,
                color: color,
              }}
            >
              :{port}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-mono uppercase font-semibold hidden sm:inline-flex"
              style={{
                backgroundColor: `${color}15`,
                borderColor: `${color}40`,
                color: color,
              }}
            >
              REDIS 7.x
            </Badge>
          </>
        }
        rightElement={
          <div
            className="flex items-center justify-center p-1.5 rounded hover:bg-background/40 transition-all cursor-pointer"
            style={{ color }}
            title="Configure Redis Instance"
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
            {REDIS_COLOR_PRESETS.map((preset) => {
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

        {/* Host & Port */}
        <div className="flex items-center justify-between bg-muted/30 p-1.5 rounded-lg border border-border/40">
          <div className="flex items-center text-muted-foreground gap-1.5">
            <Radio size={12} className="shrink-0" style={{ color }} />
            <span className="text-[11px] font-medium">Host : Port</span>
          </div>
          <code
            className="text-[10px] font-mono font-bold bg-background px-1.5 py-0.5 rounded border border-border/60"
            style={{ color }}
          >
            {host}:{port}
          </code>
        </div>

        {/* ENV Connection */}
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

        {/* Eviction Policy */}
        <div className="flex items-center justify-between bg-muted/30 p-1.5 rounded-lg border border-border/40">
          <div className="flex items-center text-muted-foreground gap-1.5">
            <ShieldCheck size={12} className="shrink-0" style={{ color }} />
            <span className="text-[11px] font-medium">Eviction Policy</span>
          </div>
          <code className="text-[10px] font-mono font-semibold bg-background px-1.5 py-0.5 rounded border border-border/60 text-foreground/80">
            {maxmemoryPolicy}
          </code>
        </div>

        {/* Persistence */}
        <div className="flex items-center justify-between bg-muted/30 p-1.5 rounded-lg border border-border/40">
          <div className="flex items-center text-muted-foreground gap-1.5">
            <HardDrive size={12} className="shrink-0" style={{ color }} />
            <span className="text-[11px] font-medium">Persistence</span>
          </div>
          <code className="text-[10px] font-mono font-semibold bg-background px-1.5 py-0.5 rounded border border-border/60 text-foreground/80">
            {persistenceMode}
          </code>
        </div>

        {/* Connected Schemas Counter */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <DatabaseZap size={12} style={{ color }} />
            <span>Hanging Schemas</span>
          </div>
          <span className="font-semibold text-foreground bg-secondary px-1.5 rounded-full">
            {attachedSchemas.length}
          </span>
        </div>
      </div>

      {/* Outgoing Handle to Hanging Redis Schema Nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="database-source"
        className="w-3 h-3 border-2 border-background !-bottom-1.5"
        style={{ backgroundColor: color }}
      />
    </div>
  );
};
