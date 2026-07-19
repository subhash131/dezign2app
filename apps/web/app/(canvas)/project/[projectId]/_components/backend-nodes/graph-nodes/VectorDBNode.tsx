import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Database, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EditableNodeList } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";

export const VectorDBNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[260px] max-w-[360px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Database} title="Vector DB" colorClass="bg-violet-500/10 text-violet-700 dark:text-violet-400" selected={selected} />

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
            <SelectItem value="Pinecone" className="text-xs">Pinecone</SelectItem>
            <SelectItem value="Qdrant" className="text-xs">Qdrant</SelectItem>
            <SelectItem value="Milvus" className="text-xs">Milvus</SelectItem>
            <SelectItem value="Weaviate" className="text-xs">Weaviate</SelectItem>
            <SelectItem value="pgvector" className="text-xs">pgvector</SelectItem>
            <SelectItem value="Chroma" className="text-xs">Chroma</SelectItem>
            <SelectItem value="Other" className="text-xs">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Collections */}
      <EditableNodeList
        nodeId={id}
        title="Collections"
        items={data.collections || []}
        field="collections"
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
              <Label className="text-xs shrink-0 text-muted-foreground">Embedding Model</Label>
              <Input
                className="h-6 text-xs w-[160px] bg-background"
                placeholder="text-embedding-3-small"
                value={data.embeddingModel || ""}
                onChange={(e) => updateNode(id, { data: { ...data, embeddingModel: e.target.value } })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">Dimensions</Label>
              <Input
                type="number"
                className="h-6 text-xs w-20 text-right bg-background"
                placeholder="1536"
                value={data.dimensions ?? ""}
                onChange={(e) => updateNode(id, { data: { ...data, dimensions: parseInt(e.target.value) || undefined } })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">Metric</Label>
              <Select
                value={data.metric || "Cosine"}
                onValueChange={(v) => updateNode(id, { data: { ...data, metric: v as typeof data.metric } })}
              >
                <SelectTrigger className="h-6 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cosine" className="text-xs">Cosine</SelectItem>
                  <SelectItem value="Dot Product" className="text-xs">Dot Product</SelectItem>
                  <SelectItem value="Euclidean" className="text-xs">Euclidean</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
