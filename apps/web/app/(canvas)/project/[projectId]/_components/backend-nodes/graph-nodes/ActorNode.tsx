import React from "react";
import { NodeProps, Position } from "@xyflow/react";
import { User } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EditableNodeList } from "./shared";

export const ActorNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[200px] max-w-[300px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={User} title="Client / Page" colorClass="bg-green-500/10 text-green-700 dark:text-green-400" selected={selected} />
      <EditableNodeList nodeId={id} title="Events" items={data.events} field="events" handleType="source" handlePosition={Position.Right} updateNode={updateNode} data={data} />
    </div>
  );
};
