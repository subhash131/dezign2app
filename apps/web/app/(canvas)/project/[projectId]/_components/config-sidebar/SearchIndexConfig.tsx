import React from "react";
import { SearchIndexItem, SearchSource } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { LocalTextarea, LocalInput } from "../backend-nodes/graph-nodes/shared";
import { SchemaEditor } from "../backend-nodes/graph-nodes/Editors";

interface SearchIndexConfigProps { id: string; nodeId: string; sourceId?: string; }

export const SearchIndexConfig = ({ id, nodeId, sourceId }: SearchIndexConfigProps) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const parentNode = nodes.find((n) => n.id === nodeId);
  if (!parentNode) return null;
  const source: SearchSource | undefined = parentNode.data.searchSources?.find((candidate) => candidate.id === sourceId);
  const item: SearchIndexItem | undefined = source?.indexes.find((index) => index.id === id);
  if (!source || !item) return null;
  const handleUpdate = (changes: Partial<SearchIndexItem>) => updateNode(nodeId, { data: { ...parentNode.data, searchSources: parentNode.data.searchSources?.map((candidate) => candidate.id === sourceId ? { ...candidate, indexes: candidate.indexes.map((index) => index.id === id ? { ...index, ...changes } : index) } : candidate) } });
  const tableRef = nodes.find((node) => node.id === source.dbTable && node.type === "db_ref");
  const table = nodes.find((node) => node.id === tableRef?.data.tableRef && node.type === "entity");
  const tableName = tableRef?.data.label || table?.data.label || "the selected table";
  const tableFields = table?.data.columns?.map((column) => column.name) ?? [];

  return <div className="flex flex-col gap-6 mt-6 pb-12">
    <div className="flex flex-col gap-2 border-b border-border/50 pb-6"><div className="flex items-center gap-2.5"><span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-sky-500/15 text-sky-500 rounded border border-sky-500/20 shadow-sm">INDEX</span><span className="text-lg font-semibold tracking-tight text-foreground">{item.name || "Untitled Index"}</span></div><span className="text-sm text-muted-foreground">This index is derived from {tableName}. Table and ingestion settings are managed on the source.</span></div>
    <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</span><LocalTextarea className="min-h-[60px] text-sm resize-none bg-background/50 focus-visible:ring-1" placeholder="Describe what data this index stores..." value={item.description || ""} onBlur={(e) => handleUpdate({ description: e.target.value })} /></div>
    <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Analyzer Override</span><LocalInput className="h-8 text-sm bg-background/50 focus-visible:ring-1" placeholder="e.g. standard (leave empty to use global)" value={item.analyzer || ""} onBlur={(e) => handleUpdate({ analyzer: e.target.value })} /></div>
    <div className="flex flex-col gap-4 border-t pt-4"><SchemaEditor title="Indexed Table Fields" schema={item.schema} fieldOptions={tableFields} onChange={(schema) => handleUpdate({ schema })} /></div>
  </div>;
};
