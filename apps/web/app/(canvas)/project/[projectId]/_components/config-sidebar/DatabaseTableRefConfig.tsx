"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  Server,
  Table2,
  ExternalLink,
  Key,
  Layers,
  Info,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@workspace/ui/lib/utils";

interface DatabaseTableRefConfigProps {
  id: string;
  nodeId: string;
}

function DatabaseTableRefConfigContent({
  id,
  nodeId,
  refNode,
}: DatabaseTableRefConfigProps & { refNode: NonNullable<ReturnType<typeof useBackendCanvasStore.getState>["nodes"][0]> }) {
  const router = useRouter();
  const projectId = useBackendCanvasStore((s) => s.projectId);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  const data = refNode.data || {};

  const databaseInstances = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "database" &&
          n.data?.dbEngine !== "redis" &&
          n.data?.dbType !== "redis",
      ),
    ),
  );

  const allEntities = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) =>
          n?.type === "entity" &&
          n.data?.dbType !== "vector" &&
          n.data?.dbType !== "redis",
      ),
    ),
  );

  const selectedTable = allEntities.find((e) => e.id === data.tableRef);
  const selectedDatabaseId = data.databaseId || selectedTable?.data?.databaseId;
  const selectedDatabase = databaseInstances.find((n) => n.id === selectedDatabaseId);
  const parentDatabase = nodes.find(
    (n) => n.id === (selectedTable?.data?.databaseId || selectedDatabaseId),
  );

  const filteredEntities = useMemo(() => {
    if (!selectedDatabaseId || selectedDatabaseId === "__all__") return allEntities;
    const directMatches = allEntities.filter(
      (e) =>
        e.data?.databaseId === selectedDatabaseId ||
        edges.some(
          (edge) =>
            (edge.source === selectedDatabaseId && edge.target === e.id) ||
            (edge.target === selectedDatabaseId && edge.source === e.id),
        ),
    );
    return directMatches.length > 0 ? directMatches : allEntities;
  }, [allEntities, selectedDatabaseId, edges]);

  const engineName =
    selectedDatabase?.data?.dbEngine ||
    parentDatabase?.data?.dbEngine ||
    selectedDatabase?.data?.dbType ||
    parentDatabase?.data?.dbType ||
    "sql";

  const columns = selectedTable?.data?.columns || [];
  const primaryKeyCol = columns.find((c) => c.isPrimary || c.isPrimaryKey || c.primaryKey);

  const handleJumpToSchema = () => {
    // 1. Switch store view to "schema"
    useBackendCanvasStore.getState().setView("schema");

    // 2. Navigate to schema page if projectId available
    if (projectId) {
      router.push(`/project/${projectId}?view=schema`);
    }

    // 3. Open target Database config in Schema View
    if (selectedDatabase) {
      setActiveConfigItem({
        id: selectedDatabase.id,
        nodeId: selectedDatabase.id,
        type: "database",
      });
    } else if (selectedTable) {
      setActiveConfigItem({
        id: selectedTable.id,
        nodeId: selectedTable.id,
        type: "entityFunctions",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-foreground">
        <div className="p-2 rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400 shrink-0">
          <Database size={20} />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Table Reference</h3>
            <Badge variant="outline" className="text-[10px] uppercase font-mono bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30">
              {engineName}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Graph reference linking services to schema tables.
          </p>
        </div>
      </div>

      {/* Editable Reference Selection */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Reference Target
          </Label>
          <span className="text-[10px] text-muted-foreground font-mono">Editable</span>
        </div>

        {/* Database Selector */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Server size={13} className="text-orange-500" />
            Database Instance
          </Label>
          <Select
            value={selectedDatabaseId || "__all__"}
            onValueChange={(val) => {
              const newDbId = val === "__all__" ? "" : val;
              const currentTable = allEntities.find((e) => e.id === data.tableRef);
              const belongsToNew =
                !newDbId ||
                (currentTable &&
                  (currentTable.data?.databaseId === newDbId ||
                    edges.some(
                      (e) =>
                        (e.source === newDbId && e.target === currentTable.id) ||
                        (e.target === newDbId && e.source === currentTable.id),
                    )));

              updateNode(nodeId, {
                data: {
                  ...data,
                  databaseId: newDbId || undefined,
                  tableRef: belongsToNew ? data.tableRef : undefined,
                  label: belongsToNew ? data.label : "Table Ref",
                },
              });
            }}
          >
            <SelectTrigger className="h-9 text-xs bg-background">
              <SelectValue placeholder="Select Database..." />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              <SelectItem value="__all__" className="text-xs">
                All Databases
              </SelectItem>
              {databaseInstances
                .filter((inst) => Boolean(inst && inst.id && inst.id.trim()))
                .map((inst) => (
                  <SelectItem key={inst.id} value={inst.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>{inst.data?.label || "Database"}</span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">
                        ({inst.data?.dbEngine || "sql"})
                      </span>
                    </div>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table Selector */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Table2 size={13} className="text-orange-500" />
            Target Table
          </Label>
          <Select
            value={data.tableRef || undefined}
            onValueChange={(val) => {
              const entity = allEntities.find((e) => e.id === val);
              updateNode(nodeId, {
                data: {
                  ...data,
                  tableRef: val,
                  databaseId:
                    entity?.data?.databaseId || selectedDatabaseId || data.databaseId,
                  label: entity?.data?.label || "Table Ref",
                  graphPosition: entity?.position,
                },
              });
            }}
          >
            <SelectTrigger className="h-9 text-xs bg-background">
              <SelectValue placeholder="Select Table..." />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {filteredEntities.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground italic">
                  No tables found for this database
                </div>
              ) : (
                filteredEntities
                  .filter((e) => Boolean(e && e.id && e.id.trim()))
                  .map((e) => (
                    <SelectItem key={e.id} value={e.id} className="text-xs">
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="font-medium">{e.data?.label || "Untitled Table"}</span>
                        {e.data?.columns && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {e.data.columns.length} cols
                          </span>
                        )}
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>


        {/* Description / Notes */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Usage Notes / Description</Label>
          <Textarea
            value={data.description || ""}
            onChange={(e) =>
              updateNode(nodeId, {
                data: { ...data, description: e.target.value },
              })
            }
            placeholder="Describe how this table is used in services..."
            className="min-h-[60px] text-xs resize-none"
          />
        </div>
      </div>

      {/* Jump to Schema View Link Card */}
      <div className="p-4 rounded-xl bg-card border flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
              <ExternalLink size={13} className="text-orange-500" />
              Schema View Configuration
            </span>
            <span className="text-[11px] text-muted-foreground leading-relaxed">
              To edit database engines, connection strings, table columns, foreign keys, or indexes, open the database in Schema View.
            </span>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleJumpToSchema}
          variant="outline"
          className="w-full h-8 text-xs font-semibold text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/10 flex items-center justify-center gap-2"
        >
          <span>Open Database in Schema View</span>
          <ArrowRight size={13} />
        </Button>
      </div>

      {/* Read-Only Schema Details Preview */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Database Schema Details (Read-Only)
          </Label>
          <Badge variant="secondary" className="text-[9px] font-mono">
            Uneditable here
          </Badge>
        </div>

        {selectedTable ? (
          <div className="rounded-xl border bg-muted/20 p-3.5 flex flex-col gap-3">
            {/* Table & DB Summary Row */}
            <div className="flex items-center justify-between border-b pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-foreground font-mono">
                  {selectedTable.data?.label || "table"}
                </span>
                <Badge variant="outline" className="text-[9px] font-mono uppercase bg-background">
                  {engineName}
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {columns.length} columns
              </span>
            </div>

            {/* Parent DB info */}
            {parentDatabase && (
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
                <span>Database Instance:</span>
                <span className="font-medium text-foreground">{parentDatabase.data?.label || "Database"}</span>
              </div>
            )}

            {/* Column List (Read-only) */}
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Columns
              </span>
              <div className="max-h-[220px] overflow-y-auto flex flex-col gap-1 pr-1">
                {columns.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic py-1">
                    No columns defined
                  </span>
                ) : (
                  columns.map((col, idx) => {
                    const isPk = col.isPrimary || col.isPrimaryKey || col.primaryKey;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-background/60 border border-border/50 text-xs"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {isPk && (
                            <span title="Primary Key" className="inline-flex items-center">
                              <Key size={11} className="text-amber-500 shrink-0" />
                            </span>
                          )}
                          <span className={cn("font-mono font-medium truncate", isPk && "text-amber-500 font-semibold")}>
                            {col.name || "column"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {col.type || "string"}
                          </span>
                          {col.required && !isPk && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-muted text-muted-foreground">
                              NN
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-dashed text-center text-xs text-muted-foreground italic">
            Select a table above to view its schema columns and database details.
          </div>
        )}
      </div>
    </div>
  );
}

export function DatabaseTableRefConfig({ id, nodeId }: DatabaseTableRefConfigProps) {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const refNode = nodes.find((n) => n.id === nodeId);
  if (!refNode) return null;

  return <DatabaseTableRefConfigContent id={id} nodeId={nodeId} refNode={refNode} />;
}
