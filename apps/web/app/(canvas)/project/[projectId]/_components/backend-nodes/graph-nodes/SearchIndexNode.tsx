import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Search, ChevronDown, ChevronUp, Settings, Plus, X, Check } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, LocalInput, generateId } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";

export const SearchIndexNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[260px] max-w-[360px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Search} title="Search Index" colorClass="bg-sky-500/10 text-sky-700 dark:text-sky-400" selected={selected} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Implementation */}
      <div className="px-3 py-2 border-b nodrag flex items-center gap-2">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider shrink-0">Implementation</Label>
        <Select
          value={data.implementation || ""}
          onValueChange={(v) => updateNode(id, { data: { ...data, implementation: v } })}
        >
          <SelectTrigger className="h-6 text-xs flex-1"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Elasticsearch" className="text-xs">Elasticsearch</SelectItem>
            <SelectItem value="OpenSearch" className="text-xs">OpenSearch</SelectItem>
            <SelectItem value="Algolia" className="text-xs">Algolia</SelectItem>
            <SelectItem value="Meilisearch" className="text-xs">Meilisearch</SelectItem>
            <SelectItem value="Typesense" className="text-xs">Typesense</SelectItem>
            <SelectItem value="Other" className="text-xs">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Indexes */}
      <SearchIndexList nodeId={id} indexes={data.searchIndexes || []} data={data} updateNode={updateNode} />

      {/* Advanced */}
      <div className="p-3 bg-secondary/10 flex flex-col gap-3 rounded-b-xl">
        <div
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">Advanced</span>
          <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground group-hover:text-foreground transition-all">
            {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
        {advancedOpen && (
          <div className="flex flex-col gap-2.5 pt-2 border-t border-border/50 nodrag">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] shrink-0 text-muted-foreground uppercase font-bold tracking-wider">Analyzer</Label>
              <Input
                className="h-6 text-xs w-[160px] bg-background"
                placeholder="standard"
                value={data.analyzer || ""}
                onChange={(e) => updateNode(id, { data: { ...data, analyzer: e.target.value } })}
              />
            </div>
            
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] shrink-0 text-muted-foreground uppercase font-bold tracking-wider">Shards</Label>
              <Input
                type="number"
                className="h-6 text-xs w-[160px] bg-background"
                placeholder="1"
                value={data.shards || ""}
                onChange={(e) => updateNode(id, { data: { ...data, shards: parseInt(e.target.value) || undefined } })}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] shrink-0 text-muted-foreground uppercase font-bold tracking-wider">Replicas</Label>
              <Input
                type="number"
                className="h-6 text-xs w-[160px] bg-background"
                placeholder="1"
                value={data.replicas || ""}
                onChange={(e) => updateNode(id, { data: { ...data, replicas: parseInt(e.target.value) || undefined } })}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] shrink-0 text-muted-foreground uppercase font-bold tracking-wider">Refresh Interval</Label>
              <Input
                className="h-6 text-xs w-[160px] bg-background"
                placeholder="1s"
                value={data.refreshInterval || ""}
                onChange={(e) => updateNode(id, { data: { ...data, refreshInterval: e.target.value } })}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] shrink-0 text-muted-foreground uppercase font-bold tracking-wider">Reindex Strategy</Label>
              <Select
                value={data.reindexStrategy || ""}
                onValueChange={(v) => updateNode(id, { data: { ...data, reindexStrategy: v } })}
              >
                <SelectTrigger className="h-6 text-xs w-[160px] bg-background"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="None" className="text-xs">None</SelectItem>
                  <SelectItem value="Incremental" className="text-xs">Incremental</SelectItem>
                  <SelectItem value="Batch" className="text-xs">Batch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Custom Index List for SearchIndexNode ---
const SearchIndexList = ({ nodeId, indexes, data, updateNode }: { nodeId: string, indexes: any[], data: any, updateNode: any }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const setActiveConfigItem = useBackendCanvasStore(s => s.setActiveConfigItem);

  const handleAdd = () => {
    const newItems = [...indexes, { id: generateId(), name: "" }];
    updateNode(nodeId, { data: { ...data, searchIndexes: newItems } });
    setEditingId(newItems[newItems.length - 1]!.id);
    setEditingName("");
  };

  const handleUpdate = (id: string, name: string) => {
    const newItems = indexes.map((item) => item.id === id ? { ...item, name } : item);
    updateNode(nodeId, { data: { ...data, searchIndexes: newItems } });
  };

  const handleDelete = (id: string) => {
    const newItems = indexes.filter((item) => item.id !== id);
    updateNode(nodeId, { data: { ...data, searchIndexes: newItems } });
  };

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        Indexes
        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all" onClick={handleAdd}>
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {indexes.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <div key={item.id} className="flex flex-col px-3 py-1.5 border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag">
              <Handle 
                type="target" 
                position={Position.Left} 
                id={`index-in-${item.id}`} 
                className="w-2 h-2 -left-1" 
                style={{ top: '15px' }} 
              />
              <Handle 
                type="source" 
                position={Position.Right} 
                id={`index-out-${item.id}`} 
                className="w-2 h-2 -right-1" 
                style={{ top: '15px' }} 
              />
              {isEditing ? (
                 <div className="flex items-center gap-1 nodrag">
                   <LocalInput 
                      value={editingName} 
                      onChange={(e) => setEditingName(e.target.value)} 
                      className="h-6 text-xs flex-1 nodrag"
                      placeholder="Index Name"
                      autoFocus
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === "Enter") {
                          if (!editingName.trim()) handleDelete(item.id);
                          else {
                            const wasEmpty = !item.name;
                            handleUpdate(item.id, editingName.trim());
                            if (wasEmpty) setActiveConfigItem({ type: 'searchIndex', id: item.id, nodeId });
                          }
                          setEditingId(null);
                        }
                        if (e.key === "Escape") {
                           if (!item.name) handleDelete(item.id);
                           setEditingId(null);
                        }
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => {
                        if (!editingName.trim()) handleDelete(item.id);
                        else {
                          const wasEmpty = !item.name;
                          handleUpdate(item.id, editingName.trim());
                          if (wasEmpty) setActiveConfigItem({ type: 'searchIndex', id: item.id, nodeId });
                        }
                        setEditingId(null);
                    }}>
                       <Check size={14} />
                    </Button>
                 </div>
              ) : (
                <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { setEditingId(item.id); setEditingName(item.name || ""); }}>
                   <span className="font-medium truncate">{item.name}</span>
                   <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-all">
                      <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setActiveConfigItem({ type: 'searchIndex', id: item.id, nodeId }); }}>
                         <Settings size={14} />
                      </div>
                      <div className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                         <X size={14} />
                      </div>
                   </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  );
};
