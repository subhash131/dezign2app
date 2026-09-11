import React, { useRef } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Database, Table2, Trash, Settings } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { ColumnList } from "./ColumnList";
import { IndexList } from "./IndexList";
import { VectorConfig } from "./VectorConfig";
import { DbOperationsList } from "./DbOperationsList";
import { getUniqueNodeLabel } from "@workspace/canvas";
import { NodeHeader } from "../graph-nodes/common";
import { Layers } from "lucide-react";
import { toast } from "sonner";

export const EntityNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const setNodesPendingDeletion = useBackendCanvasStore(
    (s) => s.setNodesPendingDeletion,
  );
  const nodeRef = useRef<HTMLDivElement>(null);

  const columns = data.columns || [];
  const indexes = data.indexes || [];

  const handleSaveName = (finalName: string) => {
    // Check global uniqueness for entities
    const allNodes = useBackendCanvasStore.getState().nodes;
    const exists = allNodes.some(
      (n) =>
        n.id !== id &&
        n.type === "entity" &&
        n.data.label.toLowerCase() === finalName.toLowerCase(),
    );

    if (exists) {
      toast.error(`Table name "${finalName}" is already used!`);
      return;
    }

    const latestNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === id);
    if (latestNode) {
      updateNode(id, { data: { ...latestNode.data, label: finalName } });
    } else {
      updateNode(id, { data: { ...data, label: finalName } });
    }
  };

  const isVector = data.dbType === "vector";

  const allNodes = useBackendCanvasStore((s) => s.nodes);
  // List only SQL/relational/document database nodes
  const dbNodes = allNodes.filter(
    (n) => n.type === "database" && n.data?.dbEngine !== "redis",
  );
  const parentDbNode = allNodes.find((n) => n.id === data.databaseId);
  const dbThemeColor = parentDbNode?.data?.color || (isVector ? "#8b5cf6" : undefined);

  const openSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveConfigItem({
      type: "entityFunctions",
      id: id,
      nodeId: id,
    });
  };

  return (
    <div
      ref={nodeRef}
      tabIndex={-1}
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[260px] max-w-[360px] focus:outline-none transition-all",
        !dbThemeColor && (selected ? "border-primary" : "border-border"),
      )}
      style={{
        borderColor: dbThemeColor ? dbThemeColor : undefined,
        boxShadow: selected
          ? `0 0 0 2px ${dbThemeColor || "var(--primary)"}50, 0 4px 6px -1px rgba(0, 0, 0, 0.1)`
          : undefined,
      }}
    >
      {/* Top Handle for Database Node connection */}
      <Handle
        type="target"
        position={Position.Top}
        id="database-entity-target"
        className="w-3 h-3 border-2 border-background !-top-1.5"
        style={{ backgroundColor: dbThemeColor || "#f59e0b" }}
      />

      <NodeHeader
        id={id}
        data={data}
        nodeType="entity"
        icon={isVector ? Database : Table2}
        iconColor={dbThemeColor ? dbThemeColor : undefined}
        title={isVector ? "Vector Collection" : "Table"}
        colorClass={
          isVector
            ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
            : "bg-secondary/80"
        }
        placeholder={isVector ? "Enter vector collection name..." : "Enter table name..."}
        selected={selected}
        onSave={handleSaveName}
        rightElement={
          <div
            className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer mr-1"
            title="DB Operation Functions"
            onClick={openSettings}
          >
            <Settings size={14} />
          </div>
        }
      />

      <div className="px-3 py-1.5 border-b flex items-center justify-between gap-1.5 nodrag text-[10px] bg-muted/20">
          <span className="text-muted-foreground font-medium shrink-0 flex items-center gap-1">
            <Database size={10} style={{ color: dbThemeColor || (isVector ? "#8b5cf6" : "#f59e0b") }} />
            DB Node:
          </span>
          <Select
            value={data.databaseId || "none"}
            onValueChange={(val: string) => {
              const selectedDbId = val === "none" ? undefined : val;
              const store = useBackendCanvasStore.getState();

              // Update node data
              updateNode(id, {
                data: {
                  ...data,
                  databaseId: selectedDbId,
                },
              });

              // Clean up existing edge if changed
              const existingEdge = store.edges.find(
                (e) => e.target === id && e.type === "database-connection",
              );
              if (existingEdge && existingEdge.source !== selectedDbId) {
                store.deleteEdge(existingEdge.id);
              }

              // Add new edge if selected
              if (selectedDbId) {
                const edgeExists = store.edges.some(
                  (e) => e.source === selectedDbId && e.target === id,
                );
                if (!edgeExists) {
                  store.addEdge({
                    id: `edge-${selectedDbId}-${id}`,
                    source: selectedDbId,
                    target: id,
                    sourceHandle: "database-source",
                    targetHandle: "database-entity-target",
                    type: "database-connection",
                  });
                }
              }
            }}
          >
            <SelectTrigger className="h-5 text-[10px] font-semibold bg-background/60 hover:bg-background border-border/40 px-1.5 py-0 shadow-none">
              <SelectValue placeholder="Unattached" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs italic text-muted-foreground">
                Unattached
              </SelectItem>
              {dbNodes.map((db) => (
                <SelectItem key={db.id} value={db.id} className="text-xs">
                  {db.data.label || "Database"} ({db.data.dbEngine || "sqlite"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) =>
            updateNode(id, { data: { ...data, description: e.target.value } })
          }
        />
      </div>

      {/* Vector Collection Settings */}
      {isVector && (
        <VectorConfig id={id} data={data} updateNode={updateNode} />
      )}

      {/* Column List */}
      <ColumnList
        nodeId={id}
        items={columns}
        updateNode={updateNode}
        data={data}
        isVector={isVector}
      />

      {/* Index List for Relational */}
      {!isVector && (
        <IndexList
          id={id}
          indexes={indexes}
          columns={columns}
          data={data}
          updateNode={updateNode}
        />
      )}

      {/* Database Operations / Helper Functions List */}
      <DbOperationsList nodeId={id} data={data} updateNode={updateNode} />

      <div className="h-2 w-full border-t border-transparent rounded-b-[10px]" />
    </div>
  );
};
