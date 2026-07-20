import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Search, ChevronDown, ChevronUp, Settings, Plus, X, Check } from "lucide-react";
import { BackendNode, SearchSource } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, generateId } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from "@workspace/ui/components/combobox";

const tableRefTypes = new Set(["db_ref"]);

export const SearchIndexNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedFields: {
    label: string;
    key: "analyzer" | "shards" | "replicas" | "refreshInterval";
    placeholder: string;
  }[] = [
    { label: "Analyzer", key: "analyzer", placeholder: "standard" },
    { label: "Shards", key: "shards", placeholder: "1" },
    { label: "Replicas", key: "replicas", placeholder: "1" },
    { label: "Refresh Interval", key: "refreshInterval", placeholder: "1s" },
  ];

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[260px] max-w-[360px] flex flex-col",
        selected ? "border-primary" : "border-border"
      )}
    >
      <NodeHeader
        id={id}
        data={data}
        icon={Search}
        title="Search Index"
        colorClass="bg-sky-500/10 text-sky-700 dark:text-sky-400"
        selected={selected}
      />
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
      <div className="px-3 py-2 border-b nodrag flex items-center gap-2">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider shrink-0">
          Implementation
        </Label>
        <Select
          value={data.implementation || ""}
          onValueChange={(v) =>
            updateNode(id, { data: { ...data, implementation: v } })
          }
        >
          <SelectTrigger className="h-6 text-xs flex-1">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {[
              "Elasticsearch",
              "OpenSearch",
              "Algolia",
              "Meilisearch",
              "Typesense",
              "Other",
            ].map((v) => (
              <SelectItem key={v} value={v} className="text-xs">
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SearchSourceList
        nodeId={id}
        sources={data.searchSources || []}
        data={data}
        updateNode={updateNode}
      />
      <div className="p-3 bg-secondary/10 flex flex-col gap-3 rounded-b-xl">
        <div
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Advanced
          </span>
          {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
        {advancedOpen && (
          <div className="flex flex-col gap-2.5 pt-2 border-t border-border/50 nodrag">
            {advancedFields.map(({ label, key, placeholder }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-2"
              >
                <Label className="text-[10px] shrink-0 text-muted-foreground uppercase font-bold tracking-wider">
                  {label}
                </Label>
                <Input
                  type={
                    key === "shards" || key === "replicas" ? "number" : "text"
                  }
                  className="h-6 text-xs w-[160px] bg-background"
                  placeholder={placeholder}
                  value={data[key] || ""}
                  onChange={(e) =>
                    updateNode(id, {
                      data: {
                        ...data,
                        [key]:
                          key === "shards" || key === "replicas"
                            ? parseInt(e.target.value) || undefined
                            : e.target.value,
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


const SearchSourceList = ({
  nodeId,
  sources,
  data,
  updateNode,
}: {
  nodeId: string;
  sources: SearchSource[];
  data: BackendNode["data"];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
}) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem
  );
  const [addingSource, setAddingSource] = useState(false);
  const [newTable, setNewTable] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const tableRefs = nodes.filter((n) => tableRefTypes.has(n.type));
  const availableTables = tableRefs.filter(
    (n) => !sources.some((s) => s.dbTable === n.id)
  );
  const updateSources = (next: SearchSource[]) =>
    updateNode(nodeId, { data: { ...data, searchSources: next } });
  const tableName = (tableId: string) =>
    tableRefs.find((n) => n.id === tableId)?.data?.label || "Untitled table";
  const tableFields = (tableId: string) => {
    const tableRef = tableRefs.find((node) => node.id === tableId);
    const entity = nodes.find(
      (node) => node.type === "entity" && node.id === tableRef?.data.tableRef
    );
    return entity?.data.columns?.map((column) => column.name) ?? [];
  };
  const addSource = () => {
    if (!newTable) return;
    const tableRef = tableRefs.find((node) => node.id === newTable);
    const entity = nodes.find(
      (node) => node.type === "entity" && node.id === tableRef?.data.tableRef
    );
    const primaryKey = entity?.data.columns?.find(
      (column) => column.isPrimaryKey
    )?.name;
    const sourceId = generateId();
    updateSources([
      ...sources,
      {
        id: sourceId,
        sourceType: "Database",
        dbTable: newTable,
        dbPrimaryKey: primaryKey,
        indexes: [],
      },
    ]);
    if (!edges.some((edge) => edge.source === newTable && edge.target === nodeId && edge.targetHandle === `source-in-${sourceId}`)) {
      addEdge({
        id: generateId(),
        source: newTable,
        target: nodeId,
        type: "connection",
        sourceHandle: "database-source",
        targetHandle: `index-in-${sourceId}`,
      });
    }
    setNewTable("");
    setAddingSource(false);
  };
  const addIndex = (sourceId: string) => {
    const index = { id: generateId(), name: "" };
    updateSources(
      sources.map((source) =>
        source.id === sourceId
          ? { ...source, indexes: [...source.indexes, index] }
          : source
      )
    );
    setEditing(index.id);
    setName("");
  };
  const removeIndex = (sourceId: string, indexId: string) =>
    updateSources(
      sources.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              indexes: source.indexes.filter((index) => index.id !== indexId),
            }
          : source
      )
    );
  const removeSource = (sourceId: string) => {
    edges
      .filter((edge) => edge.target === nodeId && edge.targetHandle === `index-in-${sourceId}`)
      .forEach((edge) => deleteEdge(edge.id));
    updateSources(sources.filter((source) => source.id !== sourceId));
  };
  const commitName = (
    sourceId: string,
    indexId: string,
    selectedName: string
  ) => {
    if (!selectedName.trim()) return;
    updateSources(
      sources.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              indexes: source.indexes.map((index) =>
                index.id === indexId
                  ? { ...index, name: selectedName.trim() }
                  : index
              ),
            }
          : source
      )
    );
    setEditing(null);
    setActiveConfigItem({ type: "searchIndex", id: indexId, nodeId, sourceId });
  };

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        Tables
        <button
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
          onClick={() => setAddingSource(true)}
        >
          <Plus size={12} />
        </button>
      </div>
      {!sources.length && !addingSource && (
        <div className="px-3 py-3 text-[11px] text-muted-foreground text-center nodrag">
          Add one or more table references to create indexes.
          <button
            className="block mx-auto mt-1.5 text-sky-600 dark:text-sky-400 font-medium hover:underline"
            onClick={() => setAddingSource(true)}
          >
            + Add table
          </button>
        </div>
      )}
      {sources.map((source) => (
        <div key={source.id} className="border-b last:border-b-0">
          <div className="relative flex items-center justify-between px-3 py-1.5 bg-secondary/10 group/src nodrag">
            <Handle
              type="target"
              position={Position.Left}
                id={`index-in-${source.id}`}
              className="w-2 h-2 -left-1"
            />
            <div
              className="flex items-center gap-1.5 min-w-0 cursor-pointer"
              onClick={() =>
                setCollapsed((current) => ({
                  ...current,
                  [source.id]: !current[source.id],
                }))
              }
            >
              {collapsed[source.id] ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronUp size={12} />
              )}
              <span className="text-xs font-medium truncate">
                {tableName(source.dbTable)}
              </span>
              <span className="text-[9px] text-muted-foreground">
                · Database
              </span>
            </div>
            <button
              className="opacity-0 group-hover/src:opacity-100 text-muted-foreground hover:text-destructive"
              onClick={() => removeSource(source.id)}
            >
              <X size={13} />
            </button>
          </div>
          {!collapsed[source.id] && (
            <div className="pl-4 border-l border-border/60 ml-3">
              {source.indexes.map((item) => (
                <div
                  key={item.id}
                  className="relative flex items-center px-3 py-1.5 text-xs group/row hover:bg-secondary/20 nodrag"
                >
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`index-out-${item.id}`}
                    className="w-2 h-2 -right-1"
                  />
                  {editing === item.id ? (
                    <div className="flex items-center gap-1 w-full">
                      <TableFieldCombobox
                        value={name}
                        fields={tableFields(source.dbTable)}
                        onValueChange={(value) => {
                          setName(value);
                          commitName(source.id, item.id, value);
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={!name.trim()}
                        onClick={() => commitName(source.id, item.id, name)}
                      >
                        <Check size={14} />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-between w-full cursor-pointer"
                      onClick={() => {
                        setEditing(item.id);
                        setName(item.name || "");
                      }}
                    >
                      <span className="font-medium truncate">
                        {item.name || "Untitled"}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100">
                        <button
                          className="p-0.5 text-muted-foreground hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveConfigItem({
                              type: "searchIndex",
                              id: item.id,
                              nodeId,
                              sourceId: source.id,
                            });
                          }}
                        >
                          <Settings size={13} />
                        </button>
                        <button
                          className="p-0.5 text-muted-foreground hover:text-destructive"
                          onClick={() => removeIndex(source.id, item.id)}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button
                className="px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground nodrag"
                onClick={() => addIndex(source.id)}
              >
                + Add index
              </button>
            </div>
          )}
        </div>
      ))}
      {addingSource && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-t nodrag bg-secondary/5">
          <Select value={newTable} onValueChange={setNewTable}>
            <SelectTrigger className="h-6 text-xs flex-1">
              <SelectValue placeholder={availableTables.length === 0 ? "No table refs available" : "table reference..."} />
            </SelectTrigger>
            <SelectContent>
              {availableTables.map((node) => (
                <SelectItem key={node.id} value={node.id} className="text-xs">
                  {node.data.label || "Untitled table"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            disabled={!newTable}
            onClick={addSource}
          >
            <Check size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              setAddingSource(false);
              setNewTable("");
            }}
          >
            <X size={14} />
          </Button>
        </div>
      )}
    </>
  );
};


const TableFieldCombobox = ({
  value,
  fields,
  onValueChange,
}: {
  value: string;
  fields: string[];
  onValueChange: (value: string) => void;
}) => (
  <Combobox
    value={value}
    onValueChange={(nextValue) => {
      if (nextValue !== null) onValueChange(nextValue);
    }}
  >
    <ComboboxInput
      className="h-6 text-xs flex-1"
      placeholder="Select table field"
      autoFocus
    />
    <ComboboxContent>
      <ComboboxList className={"bg-sidebar"}>
        {fields.map((field) => (
          <ComboboxItem key={field} value={field}>
            {field}
          </ComboboxItem>
        ))}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
);
