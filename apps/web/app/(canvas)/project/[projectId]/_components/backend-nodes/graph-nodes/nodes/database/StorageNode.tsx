import React from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { HardDrive, Settings } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  NodeHeader,
  MessagingResourceList,
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";
import { Textarea } from "@workspace/ui/components/textarea";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";

export const StorageNode: React.FC<NodeProps<BackendNode>> = ({
  id,
  data,
  selected,
}) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const provider = data.storageProvider || "s3";
  const bucketCount = data.buckets?.length || 0;

  const handleOpenConfig = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveConfigItem({
      type: "storage",
      id,
      nodeId: id,
    });
  };

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[340px] flex flex-col relative transition-all duration-150 select-none",
        selected ? "border-amber-500 ring-1 ring-amber-500/20" : "border-border",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Node-Level Ingress Handle on Left (Writers / Service connect) */}
      <Handle
        type="target"
        position={Position.Left}
        id="storage-target"
        className="w-2.5 h-2.5 -left-1.5 !bg-amber-500 border-2 border-background"
        title="Storage Ingress (Writes & Service Connections)"
        style={{ top: "28px" }}
      />

      {/* Node-Level Egress Handle on Right (Events / Read Notifications) */}
      <Handle
        type="source"
        position={Position.Right}
        id="storage-source"
        className="w-2.5 h-2.5 -right-1.5 !bg-amber-500 border-2 border-background"
        title="Storage Egress (Events & Read Streams)"
        style={{ top: "28px" }}
      />

      <NodeHeader
        id={id}
        data={data}
        nodeType="storage"
        icon={HardDrive}
        title="Storage"
        colorClass="bg-amber-500/10 text-amber-700 dark:text-amber-400"
        selected={selected}
        badges={
          <div className="flex items-center gap-1 flex-wrap">
            <Badge
              variant="outline"
              className="bg-background/80 text-[9px] font-mono capitalize px-1 py-0 h-4 border-amber-500/30"
            >
              {provider}
            </Badge>
            <Badge
              variant="secondary"
              className="text-[9px] px-1 py-0 h-4 font-mono"
            >
              {bucketCount} {bucketCount === 1 ? "bucket" : "buckets"}
            </Badge>
          </div>
        }
        rightElement={
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground nodrag shrink-0"
            onClick={handleOpenConfig}
            title="Configure Storage Node in Sidebar"
          >
            <Settings size={13} />
          </Button>
        }
      />

      {/* Strategy Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="Describe storage strategy (e.g. S3 for user uploads and media assets)"
          value={data.description || ""}
          onChange={(e) =>
            updateNode(id, { data: { ...data, description: e.target.value } })
          }
        />
      </div>

      {/* Buckets List */}
      <MessagingResourceList
        nodeId={id}
        title="Buckets"
        items={data.buckets || []}
        variant="definition"
        resourceType="buckets"
        onChange={(buckets) =>
          updateNode(id, {
            data: {
              ...data,
              buckets,
            },
          })
        }
      />
    </div>
  );
};
