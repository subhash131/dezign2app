import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Server, Database, Container, Table2, User, Globe } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";

// --- Service Node ---
export const ServiceNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-3 shadow-md rounded-xl bg-card border-2 flex items-center min-w-[150px]", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <div className="flex items-center">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-blue-500/20 text-blue-500 mr-3">
        <Server size={16} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Service</span>
        <span className="font-medium text-sm">{data.label}</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// --- Database Node ---
export const DatabaseNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-3 shadow-md rounded-xl bg-card border-2 flex items-center min-w-[150px]", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <div className="flex items-center">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-orange-500/20 text-orange-500 mr-3">
        <Database size={16} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Database</span>
        <span className="font-medium text-sm">{data.label}</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// --- Queue Node ---
export const QueueNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-3 shadow-md rounded-xl bg-card border-2 flex items-center min-w-[150px]", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <div className="flex items-center">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-purple-500/20 text-purple-500 mr-3">
        <Container size={16} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Queue</span>
        <span className="font-medium text-sm">{data.label}</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// --- Entity Node ---
export const EntityNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[200px] overflow-hidden", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <div className="px-3 py-2 bg-secondary/50 border-b flex items-center">
      <Table2 size={14} className="mr-2 text-muted-foreground" />
      <span className="font-semibold text-sm">{data.label}</span>
    </div>
    {data.columns && data.columns.length > 0 && (
      <div className="flex flex-col">
        {data.columns.map((col, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b last:border-b-0 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium">{col.name}</span>
              {col.isPrimaryKey && <span className="text-[10px] bg-yellow-500/20 text-yellow-600 px-1 rounded font-bold">PK</span>}
              {col.isForeignKey && <span className="text-[10px] bg-blue-500/20 text-blue-600 px-1 rounded font-bold">FK</span>}
            </div>
            <span className="text-muted-foreground ml-4">{col.type}</span>
          </div>
        ))}
      </div>
    )}
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// --- External Node ---
export const ExternalNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-3 shadow-md rounded-xl bg-card border-2 border-dashed flex items-center min-w-[150px]", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <div className="flex items-center">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-gray-500/20 text-gray-500 mr-3">
        <Globe size={16} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">External</span>
        <span className="font-medium text-sm">{data.label}</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// --- Actor Node ---
export const ActorNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-2 flex flex-col items-center", selected ? "text-primary" : "")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <User size={32} className="mb-2" />
    <span className="font-medium text-sm text-center">{data.label}</span>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// Map for React Flow
export const nodeTypes = {
  service: ServiceNode,
  database: DatabaseNode,
  queue: QueueNode,
  entity: EntityNode,
  external: ExternalNode,
  actor: ActorNode,
};
