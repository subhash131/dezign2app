import React from "react";
import { NodeProps, Position } from "@xyflow/react";
import { Globe } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Input } from "@workspace/ui/components/input";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EditableNodeList } from "./shared";

export const ExternalNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 border-dashed min-w-[250px] max-w-[350px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Globe} title="External API" colorClass="bg-gray-500/10 text-gray-700 dark:text-gray-400" selected={selected} />
      <div className="p-2 border-b">
         <Input 
           placeholder="Base URL (e.g. api.stripe.com)" 
           className="h-7 text-xs" 
           value={data.baseUrl || ""} 
           onChange={(e) => updateNode(id, { data: { ...data, baseUrl: e.target.value } })}
         />
      </div>
      <EditableNodeList nodeId={id} title="Actions / Endpoints" items={data.actions} field="actions" handleType="target" handlePosition={Position.Left} updateNode={updateNode} data={data} />
    </div>
  );
};
