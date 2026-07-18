import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Radio, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, MessagingResourceList } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";

export const RedisPubSubNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [showBrokerConfig, setShowBrokerConfig] = useState(true);

  // Initialize redisPubSubBroker if not defined
  const broker = data.redisPubSubBroker || {};

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[350px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Radio} title="Redis Pub/Sub" colorClass="bg-red-500/10 text-red-700 dark:text-red-400" selected={selected} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Channels (Messaging Resources) */}
     <MessagingResourceList
        nodeId={id}
        title="Channels"
        items={data.channels || []}
        variant="definition"
        resourceType="channels"
        onChange={(channels) =>
          updateNode(id, {
            data: {
              ...data,
              channels,
            },
          })
        }
      />

      {/* Broker Configuration */}
      <div className="flex flex-col nodrag">
        <div
          className="px-3 py-1.5 flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary/40 transition-colors"
          onClick={() => setShowBrokerConfig(!showBrokerConfig)}
        >
          {showBrokerConfig ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Broker Configuration
        </div>
        {showBrokerConfig && (
          <div className="px-3 py-2 flex flex-col gap-1 border-t text-[10px] text-muted-foreground bg-secondary/5">
            <span className="italic">Standard Redis Pub/Sub channels. No sharding or cluster settings configured.</span>
          </div>
        )}
      </div>
    </div>
  );
};
