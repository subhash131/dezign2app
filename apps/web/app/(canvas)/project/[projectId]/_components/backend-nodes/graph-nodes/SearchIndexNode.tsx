import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EditableNodeList } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";

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
      <EditableNodeList
        nodeId={id}
        title="Indexes"
        items={data.searchIndexes || []}
        field="searchIndexes"
        updateNode={updateNode}
        data={data}
      />

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
              <Label className="text-xs shrink-0 text-muted-foreground">Analyzer</Label>
              <Input
                className="h-6 text-xs w-[160px] bg-background"
                placeholder="standard"
                value={data.analyzer || ""}
                onChange={(e) => updateNode(id, { data: { ...data, analyzer: e.target.value } })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
