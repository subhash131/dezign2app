import React, { useRef } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { ColumnList } from "../entity-node/ColumnList";
import { RedisConfig } from "../entity-node/RedisConfig";
import { DbOperationsList } from "../entity-node/DbOperationsList";
import { RedisSchemaDescription } from "./components/RedisSchemaDescription";
import { RedisSchemaInstanceSelect } from "./components/RedisSchemaInstanceSelect";
import { useRedisInstanceConnection } from "./hooks/useRedisInstanceConnection";
import { syncHashColumns } from "./utils";
import { NodeHeader } from "../graph-nodes/common";
import { DatabaseZap, Settings } from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";

export const RedisSchemaNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const setNodesPendingDeletion = useBackendCanvasStore(
    (s) => s.setNodesPendingDeletion,
  );
  const nodeRef = useRef<HTMLDivElement>(null);

  const { redisInstanceNodes, dbThemeColor, handleInstanceChange } =
    useRedisInstanceConnection(id, data, updateNode);

  const redisStructure = data.redisDataStructure || "hash";

  const openSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveConfigItem({
      type: "redisSchema",
      id: id,
      nodeId: id,
    });
  };

  const handleUpdateNodeWithSync = (
    targetNodeId: string,
    changes: Partial<BackendNode>,
  ) => {
    const syncedChanges = syncHashColumns(changes, redisStructure);
    updateNode(targetNodeId, syncedChanges);
  };

  return (
    <div
      ref={nodeRef}
      tabIndex={-1}
      onDoubleClick={openSettings}
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[370px] focus:outline-none transition-all",
        selected ? "border-primary" : "border-border",
      )}
      style={{
        borderColor: dbThemeColor ? dbThemeColor : undefined,
        boxShadow: selected
          ? `0 0 0 2px ${dbThemeColor || "var(--primary)"}50, 0 4px 6px -1px rgba(0, 0, 0, 0.1)`
          : undefined,
      }}
    >
      {/* Top Handle for Redis Instance Node connection */}
      <Handle
        type="target"
        position={Position.Top}
        id="database-entity-target"
        className="w-3 h-3 border-2 border-background !-top-1.5"
        style={{ backgroundColor: dbThemeColor }}
      />

      {/* Header with inline name edit, badge & actions */}
      <NodeHeader
        id={id}
        data={data}
        nodeType="redis_schema"
        icon={DatabaseZap}
        iconColor={dbThemeColor || "#ef4444"}
        title="Redis Schema"
        colorClass="bg-red-500/10 text-red-700 dark:text-red-400"
        placeholder="Enter cache name..."
        selected={selected}
        badges={
          <Badge
            variant="outline"
            className="text-[9px] px-1 py-0 uppercase font-mono bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 shrink-0"
          >
            {redisStructure}
          </Badge>
        }
        rightElement={
          <div
            className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer mr-1"
            title="Configure Redis Schema"
            onClick={openSettings}
          >
            <Settings size={14} />
          </div>
        }
      />

      {/* Redis Instance Selector Dropdown */}
      <div className="px-3 py-1.5 border-b bg-muted/20">
        <RedisSchemaInstanceSelect
          currentDatabaseId={data.databaseId}
          dbThemeColor={dbThemeColor}
          redisInstanceNodes={redisInstanceNodes}
          onInstanceChange={handleInstanceChange}
        />
      </div>

      {/* Description */}
      <RedisSchemaDescription
        value={data.description}
        onChange={(val) =>
          updateNode(id, { data: { ...data, description: val } })
        }
      />

      {/* Redis Key & Structure Settings */}
      <RedisConfig id={id} data={data} updateNode={updateNode} />

      {/* Schema Columns (for Hash or JSON structures) */}
      {(redisStructure === "hash" || redisStructure === "json") && (
        <ColumnList
          nodeId={id}
          items={data.columns || []}
          updateNode={handleUpdateNodeWithSync}
          data={data}
          isVector={false}
        />
      )}

      {/* DB / Redis Operations list */}
      <DbOperationsList nodeId={id} data={data} updateNode={updateNode} />
    </div>
  );
};
