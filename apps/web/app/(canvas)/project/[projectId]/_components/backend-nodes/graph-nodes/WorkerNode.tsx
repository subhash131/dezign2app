import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Cog, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EditableNodeList } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";

export const WorkerNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[260px] max-w-[360px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Cog} title="Worker" colorClass="bg-amber-500/10 text-amber-700 dark:text-amber-400" selected={selected} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Tasks */}
      <EditableNodeList
        nodeId={id}
        title="Tasks"
        items={data.tasks || []}
        field="tasks"
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
              <Label className="text-xs shrink-0 text-muted-foreground">Concurrency</Label>
              <Input
                type="number"
                className="h-6 text-xs w-20 text-right bg-background"
                placeholder="e.g. 5"
                value={data.concurrency ?? ""}
                onChange={(e) => updateNode(id, { data: { ...data, concurrency: parseInt(e.target.value) || undefined } })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">Retry Policy</Label>
              <Select
                value={data.retryPolicy || "NONE"}
                onValueChange={(v) => updateNode(id, { data: { ...data, retryPolicy: v as typeof data.retryPolicy } })}
              >
                <SelectTrigger className="h-6 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE" className="text-xs">None</SelectItem>
                  <SelectItem value="EXPONENTIAL_BACKOFF" className="text-xs">Exponential Backoff</SelectItem>
                  <SelectItem value="FIXED_INTERVAL" className="text-xs">Fixed Interval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {data.retryPolicy && data.retryPolicy !== "NONE" && (
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs shrink-0 text-muted-foreground">Max Retries</Label>
                <Input
                  type="number"
                  className="h-6 text-xs w-20 text-right bg-background"
                  placeholder="e.g. 3"
                  value={data.maxRetries ?? ""}
                  onChange={(e) => updateNode(id, { data: { ...data, maxRetries: parseInt(e.target.value) || undefined } })}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
