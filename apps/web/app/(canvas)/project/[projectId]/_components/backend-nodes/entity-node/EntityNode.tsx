import React, { useRef } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Database, Table2, Trash, Settings, Sparkles, Lock, CheckCircle2, AlertTriangle, RefreshCw, Boxes } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { createTypesNodeFromEntity } from "@/lib/stores/backendCanvas/packageTypesSync";
import { getOutOfSyncDerivedTypesNodes } from "@/lib/stores/backendCanvas/node";
import { useDbSyncStore } from "@/lib/stores/dbSyncStore";
import { cn } from "@workspace/ui/lib/utils";
import { CANVAS_HANDLE_CLASS } from "@workspace/canvas/constants";
import { Badge } from "@workspace/ui/components/badge";
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
import { EntityAffectedTypesBanner } from "./EntityAffectedTypesBanner";
import { EntityDbSyncBanner } from "./EntityDbSyncBanner";
import { EntityGroupSelect } from "./EntityGroupSelect";
import { getUniqueNodeLabel } from "@workspace/canvas";
import { NodeHeader } from "../graph-nodes/common";
import { EntityRenameDialog } from "./EntityRenameDialog";
import { renameDbTable } from "@/lib/services/databaseService";
import { syncDerivedTypesForEntity } from "@/lib/stores/backendCanvas/packageTypesSync";
import { toast } from "sonner";

export const EntityNode = React.memo(({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const setNodesPendingDeletion = useBackendCanvasStore(
    (s) => s.setNodesPendingDeletion,
  );
  const syncState = useDbSyncStore((s) => s.entitySyncStatus[id]);
  const isCheckingThisEntity = syncState?.isChecking || false;
  const syncStatus = syncState?.status || null;
  const validateEntity = useDbSyncStore((s) => s.validateEntity);
  const isOutOfSync = Boolean(
    syncStatus && syncStatus.serverReachable && !syncStatus.inSync,
  );
  const isInSync = Boolean(
    syncStatus && syncStatus.serverReachable && syncStatus.inSync,
  );

  const nodeRef = useRef<HTMLDivElement>(null);

  const columns = data.columns || [];
  const indexes = data.indexes || [];
  const isVector = data.dbType === "vector";

  // Ensure default columns (id, created_at, updated_at) for relational tables
  const hasInitializedColumnsRef = useRef(false);
  React.useEffect(() => {
    if (hasInitializedColumnsRef.current) return;
    if (isVector || data.dbType === "redis" || data.readOnly) return;

    if (!data.columns || data.columns.length === 0) {
      hasInitializedColumnsRef.current = true;
      updateNode(id, {
        data: {
          ...data,
          columns: [
            { name: "id", type: "TEXT", isPrimaryKey: true },
            { name: "created_at", type: "TIMESTAMPTZ" },
            { name: "updated_at", type: "TIMESTAMPTZ" },
          ],
        },
      });
      return;
    }

    if (
      data.columns.length === 1 &&
      data.columns[0]?.name?.toLowerCase() === "id"
    ) {
      hasInitializedColumnsRef.current = true;
      updateNode(id, {
        data: {
          ...data,
          columns: [
            ...data.columns,
            { name: "created_at", type: "TIMESTAMPTZ" },
            { name: "updated_at", type: "TIMESTAMPTZ" },
          ],
        },
      });
    }
  }, [id, isVector, data.dbType, data.readOnly, data.columns, updateNode]);

  const [renameDialogOpen, setRenameDialogOpen] = React.useState(false);
  const [showSyncBanner, setShowSyncBanner] = React.useState(false);
  const [pendingRename, setPendingRename] = React.useState<{
    oldName: string;
    newName: string;
  } | null>(null);

  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);

  const parentDbNode = React.useMemo(() => {
    return allNodes.find((n) => n.id === data.databaseId);
  }, [allNodes, data.databaseId]);

  const dbData = (parentDbNode?.data || {}) as NonNullable<BackendNode["data"]>;
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

  const executeTableRename = async (finalName: string, renameLive: boolean) => {
    const currentName = data.tableName || data.label || "";
    if (renameLive && parentDbNode && currentName) {
      const renameRes = await renameDbTable({
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
        oldTableName: currentName,
        newTableName: finalName,
        schema: data.schema || parentDbNode?.data?.schema || "public",
      });

      if (renameRes.success) {
        toast.success(
          `Renamed table "${currentName}" to "${finalName}" on live ${engine.toUpperCase()} database`,
        );
      } else {
        toast.error(
          `Failed to rename table on live database: ${renameRes.error || "Unknown error"}`,
        );
      }
    }

    const latestNode = useBackendCanvasStore
      .getState()
      .nodes.find((n) => n.id === id);
    const updatedData = {
      ...(latestNode?.data || data),
      label: finalName,
      tableName: finalName,
    };
    updateNode(id, { data: updatedData });

    // Sync derived TypesNode interface name and fields immediately
    syncDerivedTypesForEntity(id, { openConfig: false });
  };

  const handleSaveName = (finalName: string) => {
    const cleanNew = finalName.trim();
    const currentName = data.tableName || data.label || "";
    if (!cleanNew || cleanNew === currentName) return;

    if (hasLiveConnection && currentName) {
      setPendingRename({ oldName: currentName, newName: cleanNew });
      setRenameDialogOpen(true);
    } else {
      executeTableRename(cleanNew, false);
    }
  };

  // Derived TypesNodes generated from or linked to this entity
  const derivedTypesNodes = React.useMemo(() => {
    return allNodes.filter(
      (n) =>
        n.type === "types" &&
        (n.data?.sourceEntityId === id ||
          n.data?.types?.some((t) => t.id === `type-entity-${id}`) ||
          edges.some(
            (e) =>
              e.source === id &&
              e.target === n.id &&
              (e.type === "type-reference" || e.data?.label === "generates"),
          )),
    );
  }, [allNodes, id, edges]);

  // Auto-validate schema against connected live database on debounced entity changes
  React.useEffect(() => {
    if (!hasLiveConnection || isVector || data.readOnly) return;
    const timer = setTimeout(() => {
      validateEntity(id);
    }, 700);
    return () => clearTimeout(timer);
  }, [
    id,
    hasLiveConnection,
    isVector,
    data.readOnly,
    data.columns,
    data.indexes,
    data.tableName,
    data.label,
    data.databaseId,
    validateEntity,
  ]);

  const currentNode = React.useMemo(() => {
    return (
      allNodes.find((n) => n.id === id) ||
      ({ id, type: "entity", data } as BackendNode)
    );
  }, [allNodes, id, data]);

  // Derived TypesNodes that have changes not yet synced with this entity
  const outOfSyncTypesNodes = React.useMemo(() => {
    return getOutOfSyncDerivedTypesNodes(currentNode, derivedTypesNodes);
  }, [currentNode, derivedTypesNodes]);

  // Downstream consumers of those derived TypesNodes
  const affectedDownstreamNodes = React.useMemo(() => {
    if (derivedTypesNodes.length === 0) return [];
    const typesIds = new Set(derivedTypesNodes.map((n) => n.id));
    const downstreamIds = new Set<string>();
    for (const edge of edges) {
      if (typesIds.has(edge.source) && !typesIds.has(edge.target) && edge.target !== id) {
        downstreamIds.add(edge.target);
      }
    }
    return allNodes.filter((n) => downstreamIds.has(n.id));
  }, [derivedTypesNodes, edges, allNodes, id]);

  const handleViewTypesNode = (nodeId: string) => {
    setActiveConfigItem({
      id: nodeId,
      nodeId: nodeId,
      type: "types",
    });
  };

  // List only SQL/relational/document database nodes
  const dbNodes = allNodes.filter(
    (n) => n.type === "database" && n.data?.dbEngine !== "redis",
  );
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
        "shadow-md rounded-xl bg-card border-2 min-w-[260px] max-w-[360px] focus:outline-none transition-all relative z-10",
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
        className={cn(CANVAS_HANDLE_CLASS, "!border-2 !border-background hover:scale-125 transition-all !-top-[7px]")}
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
        onSave={data.readOnly ? undefined : handleSaveName}
        badges={
          data.systemBadge ? (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 font-mono bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30 flex items-center gap-1 uppercase"
            >
              <Lock size={9} />
              <span>{data.systemBadge}</span>
            </Badge>
          ) : undefined
        }
        rightElement={
          data.readOnly ? (
            <div className="flex items-center gap-0.5 mr-1">
              <div
                className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-secondary text-muted-foreground hover:text-amber-500 transition-all cursor-pointer"
                title="Generate / Sync TypesNode"
                onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                  e.stopPropagation();
                  createTypesNodeFromEntity(id);
                }}
              >
                <Sparkles size={14} />
              </div>
              <div
                className="flex items-center text-muted-foreground mr-1 p-1"
                title="System-managed table (Read-only)"
              >
                <Lock size={13} className="text-sky-500" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 mr-1">
              <div
                className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-secondary text-muted-foreground hover:text-amber-500 transition-all cursor-pointer"
                title="Generate / Sync TypesNode"
                onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                  e.stopPropagation();
                  createTypesNodeFromEntity(id);
                }}
              >
                <Sparkles size={14} />
              </div>
              <div
                className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                title="Configure Entity & DB Functions"
                onClick={openSettings}
              >
                <Settings size={14} />
              </div>
            </div>
          )
        }
      />

      <div className="px-3 py-1.5 border-b flex items-center justify-between gap-1.5 nodrag text-[10px] bg-muted/20">
          <span className="text-muted-foreground font-medium shrink-0 flex items-center gap-1">
            <Database size={10} style={{ color: dbThemeColor || (isVector ? "#8b5cf6" : "#f59e0b") }} />
            DB Node:
          </span>
          <div className="flex items-center gap-1 min-w-0">
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
              <SelectTrigger
                disabled={data.readOnly}
                className={cn(
                  "h-5 text-[10px] font-semibold bg-background/60 hover:bg-background border-border/40 px-1.5 py-0 shadow-none",
                  data.readOnly && "opacity-70 cursor-not-allowed",
                )}
              >
                <SelectValue placeholder="Unattached" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs italic text-muted-foreground">
                  Unattached
                </SelectItem>
                {dbNodes.map((db) => (
                  <SelectItem key={db.id} value={db.id} className="text-xs">
                    {db.data.label || "Database"} ({db.data.dbEngine || "postgres"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasLiveConnection && !isVector && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isInSync) {
                    setShowSyncBanner((prev) => !prev);
                  } else {
                    validateEntity(id);
                  }
                }}
                disabled={isCheckingThisEntity}
                className={cn(
                  "h-5 px-1.5 rounded text-[9px] font-medium border flex items-center gap-1 cursor-pointer transition-colors shrink-0",
                  isOutOfSync
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20"
                    : isInSync
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20"
                      : "bg-background/60 hover:bg-background border-border/40 text-muted-foreground hover:text-foreground",
                )}
                title={
                  isCheckingThisEntity
                    ? "Validating table against connected live database..."
                    : isOutOfSync
                      ? "Schema out of sync with live database (click to re-validate)"
                      : isInSync
                        ? "Schema in sync with live database (click to toggle sync card / drop table)"
                        : "Validate this table against the connected live database"
                }
              >
                {isCheckingThisEntity ? (
                  <RefreshCw size={9} className="animate-spin text-primary" />
                ) : isOutOfSync ? (
                  <AlertTriangle size={9} className="text-amber-500" />
                ) : isInSync ? (
                  <CheckCircle2 size={9} className="text-emerald-500" />
                ) : (
                  <Database size={9} />
                )}
                <span>
                  {isCheckingThisEntity
                    ? "Checking..."
                    : isInSync
                      ? "In Sync"
                      : isOutOfSync
                        ? "Out of Sync"
                        : "Validate"}
                </span>
              </button>
            )}
          </div>
        </div>

      {/* Schema View Group Bar */}
      <div className="px-3 py-1.5 border-b flex items-center justify-between gap-1.5 nodrag text-[10px] bg-muted/10">
        <span className="text-muted-foreground font-medium shrink-0 flex items-center gap-1">
          <Boxes size={10} className="text-sky-400" />
          Group:
        </span>
        <div className="flex items-center gap-1 min-w-0">
          <EntityGroupSelect
            nodeId={id}
            variant="button"
            size="sm"
            readOnly={data.readOnly}
          />
        </div>
      </div>

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          readOnly={data.readOnly}
          className={cn(
            "min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50",
            data.readOnly && "cursor-default",
          )}
          placeholder={data.readOnly ? "System-managed entity" : "description"}
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

      {/* Live Database Schema Sync Banner */}
      {!isVector && (
        <EntityDbSyncBanner
          entityId={id}
          tableName={data.label || "table"}
          schema={data.schema || parentDbNode?.data?.schema || "public"}
          columns={columns}
          indexes={indexes}
          databaseNode={parentDbNode}
          forceShow={showSyncBanner}
          onToggleForceShow={() => setShowSyncBanner((prev) => !prev)}
        />
      )}

      {/* Derived Types Warning Banner - only shown when out of sync */}
      <EntityAffectedTypesBanner
        entityId={id}
        derivedTypesNodes={derivedTypesNodes}
        outOfSyncTypesNodes={outOfSyncTypesNodes}
        affectedDownstreamNodes={affectedDownstreamNodes}
        entityName={data.label || "Entity"}
        onViewTypesNode={handleViewTypesNode}
        onSync={() => createTypesNodeFromEntity(id)}
      />

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

      {/* Table Rename Migration Dialog */}
      {pendingRename && (
        <EntityRenameDialog
          open={renameDialogOpen}
          onOpenChange={(open) => {
            setRenameDialogOpen(open);
            if (!open) setPendingRename(null);
          }}
          mode="table"
          tableName={pendingRename.oldName}
          schema={data.schema || parentDbNode?.data?.schema || "public"}
          oldName={pendingRename.oldName}
          newName={pendingRename.newName}
          dbEngine={engine}
          dbLabel={dbData.label || "Database"}
          hasLiveConnection={hasLiveConnection}
          onConfirm={async (renameLive) => {
            await executeTableRename(pendingRename.newName, renameLive);
          }}
        />
      )}

      <div className="h-2 w-full border-t border-transparent rounded-b-[10px]" />
    </div>
  );
});

EntityNode.displayName = "EntityNode";
