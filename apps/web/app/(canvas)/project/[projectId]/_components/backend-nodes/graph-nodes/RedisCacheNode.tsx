import React from "react";
import { NodeProps } from "@xyflow/react";
import { DatabaseZap } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, MessagingResourceList } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";

export const RedisCacheNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[350px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={DatabaseZap} title="Redis Cache" colorClass="bg-red-500/10 text-red-700 dark:text-red-400" selected={selected} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="Describe caching strategy (e.g., Cache User Profiles for 1h)"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Cache Entries */}
      <MessagingResourceList
        nodeId={id}
        title="Cache Entries"
        items={data.caches || []}
        variant="definition"
        resourceType="caches"
        onChange={(caches) =>
          updateNode(id, {
            data: {
              ...data,
              caches,
            },
          })
        }
      />
    </div>
  );
};
