import React from "react";
import { NodeProps, Position } from "@xyflow/react";
import { User } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EditableNodeList } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";

export const ActorNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[200px] max-w-[300px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={User} title="Page" selected={selected} />
      
      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>
      
      <EditableNodeList nodeId={id} title="Events" items={data.events} field="events" handleType="source" handlePosition={Position.Right} updateNode={updateNode} data={data} />
    </div>
  );
};
