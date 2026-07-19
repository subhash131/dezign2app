import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Webhook, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EditableNodeList } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

export const WebhookNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 border-dashed min-w-[240px] max-w-[340px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Webhook} title="Webhook" colorClass="bg-pink-500/10 text-pink-700 dark:text-pink-400" selected={selected} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Incoming Events */}
      <EditableNodeList
        nodeId={id}
        title="Incoming Events"
        items={(data.events as { id: string; name: string }[]) || []}
        field="events"
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
              <Label className="text-xs shrink-0 text-muted-foreground">Authentication</Label>
              <Select
                value={data.authentication || "None"}
                onValueChange={(v) => updateNode(id, { data: { ...data, authentication: v } })}
              >
                <SelectTrigger className="h-6 text-xs w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="None" className="text-xs">None</SelectItem>
                  <SelectItem value="HMAC" className="text-xs">HMAC</SelectItem>
                  <SelectItem value="Bearer" className="text-xs">Bearer</SelectItem>
                  <SelectItem value="Basic" className="text-xs">Basic</SelectItem>
                  <SelectItem value="Custom" className="text-xs">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
