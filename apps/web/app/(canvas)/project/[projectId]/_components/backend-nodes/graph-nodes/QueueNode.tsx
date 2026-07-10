import React from "react";
import { NodeProps, Position } from "@xyflow/react";
import { Container } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EditableNodeList } from "./shared";

export const QueueNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[200px] max-w-[300px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Container} title="Queue / Topic" colorClass="bg-purple-500/10 text-purple-700 dark:text-purple-400" selected={selected} />
      <EditableNodeList nodeId={id} title="Messages / Events" items={data.messages} field="messages" handleType="target" handlePosition={Position.Left} updateNode={updateNode} data={data} />
      <EditableNodeList nodeId={id} title="Subscribers" items={data.outputs} field="outputs" handleType="source" handlePosition={Position.Right} updateNode={updateNode} data={data} />
    </div>
  );
};
