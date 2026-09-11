import React from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Database, Trash, Settings, Server, Palette, Key, Table2 } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Badge } from "@workspace/ui/components/badge";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { DEFAULT_DATABASE_NODE_LABEL } from "@workspace/canvas";

import { NodeHeader } from "../graph-nodes/common";

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

export const DatabaseNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const requestDeleteNode = useBackendCanvasStore(
    (s) => s.requestDeleteNode,
  );
  const allNodes = useBackendCanvasStore((s) => s.nodes);

  const engine = data.dbEngine || "sqlite";
  const color = data.color || "#f59e0b"; // Default to Amber
  const label = data.label || "";

  // Find all SQL / document table entity nodes hanging off this DB
  const attachedTables = allNodes.filter(
    (n) => n.type === "entity" && n.data?.databaseId === id,
  );

  const connStringEnv = data.connectionStringEnv || "DATABASE_URL";
  const dbFilePathEnv = data.dbFilePathEnv || "DB_FILE_PATH";

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
        className="w-3 h-3 border-2 border-background !-top-1.5"
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

        {/* Connected Entities Counter */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Table2 size={12} style={{ color }} />
            <span>Hanging Tables</span>
          </div>
          <span className="font-semibold text-foreground bg-secondary px-1.5 rounded-full">
            {attachedTables.length}
          </span>
        </div>
      </div>

      {/* Outgoing Handle to Hanging Entity Nodes */}
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
