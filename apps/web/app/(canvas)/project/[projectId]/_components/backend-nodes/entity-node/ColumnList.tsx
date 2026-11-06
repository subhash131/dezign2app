import React, { useState } from "react";
import { Plus, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { isBetterAuthTableName } from "@workspace/canvas";
import { ColumnItem, ColumnRow } from "./ColumnRow";
import { EntityRenameDialog } from "./EntityRenameDialog";
import { renameDbColumn } from "@/lib/services/databaseService";
import { syncDerivedTypesForEntity } from "@/lib/stores/backendCanvas/packageTypesSync";
import { toast } from "sonner";

import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";

export interface ColumnListProps {
  nodeId: string;
  items?: ColumnItem[];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
  isVector: boolean;
  defaultCollapsed?: boolean;
  title?: string;
  badge?: string;
}

export const ColumnList = ({
  nodeId,
  items = [],
  updateNode,
  data,
  isVector,
  defaultCollapsed = false,
  title,
  badge,
}: ColumnListProps) => {
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState("TEXT");
  const [nameError, setNameError] = useState(false);
  const [pendingColRename, setPendingColRename] = useState<{
    oldName: string;
    newName: string;
    index: number;
    changes: Partial<ColumnItem>;
  } | null>(null);

  const parentDb = allNodes.find((n) => n.id === data.databaseId);
  const dbData = (parentDb?.data || {}) as NonNullable<BackendNode["data"]>;
  const engine = (dbData.dbEngine || "postgres").toLowerCase();
  const hasLiveConnection = Boolean(
    dbData.connectionString ||
      dbData.connectionStringEnv ||
      dbData.connectionStringPooled ||
      dbData.connectionStringPooledEnv ||
      dbData.host ||
      dbData.dbFilePath ||
      dbData.dbFilePathEnv,
  );

  const syncNodeData = (newCols: ColumnItem[], newIndexes?: BackendNode["data"]["indexes"]) => {
    const nextData: BackendNode["data"] = {
      ...data,
      columns: newCols,
      ...(newIndexes !== undefined ? { indexes: newIndexes } : {}),
    };
    if (data.dbOperations && data.dbOperations.length > 0) {
      const parentDb = allNodes.find((n) => n.id === data.databaseId);
      const engine = parentDb?.data?.dbEngine || parentDb?.data?.dbType || "postgres";
      nextData.dbOperations = getEntityDbOperations({ data: nextData }, allNodes, engine);
    }
    return nextData;
  };

  const handleAdd = () => {
    setIsCollapsed(false);
    const newItems = [...items, { name: "", type: "TEXT" }];
    updateNode(nodeId, { data: syncNodeData(newItems) });
    setEditingIndex(newItems.length - 1);
    setEditingName("");
    setEditingType("TEXT");
    setNameError(false);
  };

  const hasCreatedAt = items.some(
    (c) => c.name?.toLowerCase().replace(/[^a-z0-9]/g, "") === "createdat",
  );
  const hasUpdatedAt = items.some(
    (c) => c.name?.toLowerCase().replace(/[^a-z0-9]/g, "") === "updatedat",
  );
  const isAuthEntity =
    data?.group?.toLowerCase() === "authentication" ||
    isBetterAuthTableName(data?.tableName || data?.label || "");
  const missingTimestamps = !isAuthEntity && !isVector && data?.dbType !== "redis" && (!hasCreatedAt || !hasUpdatedAt);

  const handleAddTimestamps = (e: React.MouseEvent) => {
    e.stopPropagation();
    const toAdd: ColumnItem[] = [];
    if (!hasCreatedAt) toAdd.push({ name: "created_at", type: "TIMESTAMPTZ" });
    if (!hasUpdatedAt) toAdd.push({ name: "updated_at", type: "TIMESTAMPTZ" });
    if (toAdd.length > 0) {
      updateNode(nodeId, { data: syncNodeData([...items, ...toAdd]) });
      syncDerivedTypesForEntity(nodeId, { openConfig: false });
      toast.success("Added timestamp columns (created_at, updated_at)");
    }
  };

  const applyColumnUpdate = (index: number, changes: Partial<ColumnItem>) => {
    let newCols = [...items];
    const oldCol = items[index];
    const oldColName = oldCol?.name;
    newCols[index] = { ...newCols[index]!, ...changes };
    const newColName = newCols[index]?.name;

    // Update any indexes that reference the renamed column
    let newIndexes = data.indexes;
    if (oldColName && newColName && oldColName !== newColName && data.indexes) {
      newIndexes = data.indexes.map((idx) => {
        const colList = (idx.columns || "").split(",").map((c) => c.trim());
        if (colList.includes(oldColName)) {
          const updatedCols = colList.map((c) => (c === oldColName ? newColName : c));
          const isOldNameMatching =
            idx.name === oldColName ||
            idx.name === `idx_${oldColName}` ||
            idx.name === `idx_${data.label || ""}_${oldColName}`;
          return {
            ...idx,
            name: isOldNameMatching ? newColName : idx.name,
            columns: updatedCols.join(", "),
          };
        }
        return idx;
      });
    }

    updateNode(nodeId, { data: syncNodeData(newCols, newIndexes) });
  };

  const handleUpdate = (index: number, changes: Partial<ColumnItem>) => {
    let newCols = [...items];
    const oldCol = items[index];
    const oldColName = oldCol?.name?.trim();
    const newColName = changes.name?.trim();

    if (
      changes.name &&
      changes.name.trim() !== "" &&
      changes.name !== items[index]?.name
    ) {
      const isDuplicate = newCols.some(
        (c, idx) =>
          idx !== index && c.name.toLowerCase() === changes.name!.toLowerCase(),
      );
      if (isDuplicate) {
        setNameError(true);
        return;
      }
    }

    if (
      hasLiveConnection &&
      oldColName &&
      newColName &&
      oldColName !== newColName
    ) {
      setPendingColRename({
        oldName: oldColName,
        newName: newColName,
        index,
        changes,
      });
      return;
    }

    applyColumnUpdate(index, changes);
  };

  const executeColumnRename = async (renameLive: boolean) => {
    if (!pendingColRename) return;
    const { oldName, newName, index, changes } = pendingColRename;

    if (renameLive && parentDb) {
      const renameRes = await renameDbColumn({
        engine,
        connection: {
          host: dbData.host,
          port: dbData.port,
          database: dbData.database,
          user: dbData.user || dbData.username,
          password: dbData.password,
          connectionString: dbData.connectionString || dbData.connectionStringPooled,
          connectionStringEnv: dbData.connectionStringEnv,
          connectionStringPooled: dbData.connectionStringPooled,
          connectionStringPooledEnv: dbData.connectionStringPooledEnv,
          sslMode: dbData.sslMode,
          provider: dbData.provider,
          dbFilePath: dbData.dbFilePath,
          dbFilePathEnv: dbData.dbFilePathEnv,
        },
        tableName: data.tableName || data.label || "table",
        schema: data.schema || parentDb?.data?.schema || "public",
        oldColumnName: oldName,
        newColumnName: newName,
      });

      if (renameRes.success) {
        toast.success(
          `Renamed column "${oldName}" to "${newName}" on live ${engine.toUpperCase()} database`,
        );
      } else {
        toast.error(
          `Failed to rename column on live database: ${renameRes.error || "Unknown error"}`,
        );
      }
    }

    applyColumnUpdate(index, changes);
    syncDerivedTypesForEntity(nodeId, { openConfig: false });
    setPendingColRename(null);
  };

  const handleDelete = (index: number) => {
    let newCols = [...items];
    const deletedCol = newCols[index];
    newCols.splice(index, 1);

    let newIndexes = data.indexes;
    if (deletedCol?.name && data.indexes) {
      newIndexes = data.indexes
        .map((idx) => {
          const colList = (idx.columns || "")
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c !== deletedCol.name);
          return { ...idx, columns: colList.join(", ") };
        })
        .filter((idx) => idx.columns.trim() !== "");
    }

    updateNode(nodeId, { data: syncNodeData(newCols, newIndexes) });
  };

  return (
    <div className="flex flex-col">
      <div
        className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group cursor-pointer select-none hover:bg-secondary/60 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-1.5">
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span>{title || "Columns"} ({items.length})</span>
          {badge && (
            <span className="text-[9px] font-mono px-1 py-0 rounded bg-red-500/20 text-red-600 dark:text-red-400 font-bold lowercase">
              {badge}
            </span>
          )}
        </div>
        {!data?.readOnly && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
            {missingTimestamps && (
              <div
                className="cursor-pointer text-muted-foreground hover:text-amber-500 p-0.5"
                onClick={handleAddTimestamps}
                title="Add timestamp columns (created_at, updated_at)"
              >
                <Clock size={12} />
              </div>
            )}
            <div
              className="cursor-pointer text-muted-foreground hover:text-foreground transition-all p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                handleAdd();
              }}
              title="Add Column"
            >
              <Plus size={12} />
            </div>
          </div>
        )}
      </div>
      {!isCollapsed && (
        <div className="flex flex-col">
          {items.map((col, i) => (
            <ColumnRow
              key={i}
              nodeId={nodeId}
              col={col}
              index={i}
              isEditing={editingIndex === i}
              setEditingIndex={setEditingIndex}
              editingName={editingName}
              setEditingName={setEditingName}
              editingType={editingType}
              setEditingType={setEditingType}
              handleUpdate={handleUpdate}
              handleDelete={handleDelete}
              isVector={isVector}
              nameError={nameError && editingIndex === i}
              setNameError={setNameError}
            />
          ))}
        </div>
      )}

      {/* Column Rename Migration Dialog */}
      {pendingColRename && (
        <EntityRenameDialog
          open={Boolean(pendingColRename)}
          onOpenChange={(open) => {
            if (!open) setPendingColRename(null);
          }}
          mode="column"
          tableName={data.tableName || data.label || "table"}
          schema={data.schema || parentDb?.data?.schema || "public"}
          oldName={pendingColRename.oldName}
          newName={pendingColRename.newName}
          dbEngine={engine}
          dbLabel={dbData.label || "Database"}
          hasLiveConnection={hasLiveConnection}
          onConfirm={async (renameLive) => {
            await executeColumnRename(renameLive);
          }}
        />
      )}
    </div>
  );
};
