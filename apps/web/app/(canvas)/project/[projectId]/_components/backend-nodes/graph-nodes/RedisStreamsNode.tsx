import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Waves, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, MessagingResourceList } from "./shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

export const RedisStreamsNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  const [showReliability, setShowReliability] = useState(false);
  const [showBrokerConfig, setShowBrokerConfig] = useState(true);

  // Initialize redisBroker if not defined
  const broker = data.redisBroker || {};

  const updateBroker = <K extends keyof NonNullable<BackendNode["data"]["redisBroker"]>>(key: K, value: NonNullable<BackendNode["data"]["redisBroker"]>[K]) => {
    updateNode(id, {
      data: {
        ...data,
        redisBroker: {
          ...broker,
          [key]: value,
        },
      },
    });
  };

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[350px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Waves} title="Redis Streams" colorClass="bg-rose-500/10 text-rose-700 dark:text-rose-400" selected={selected} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Streams (Messaging Resources) */}
      <MessagingResourceList
        title="Streams"
        items={data.streams || []}
        variant="definition"
        resourceType="streams"
        onChange={(streams) =>
          updateNode(id, {
            data: {
              ...data,
              streams,
            },
          })
        }
      />

      {/* Reliability */}
      <div className="flex flex-col nodrag border-b">
        <div
          className="px-3 py-1.5 flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary/40 transition-colors"
          onClick={() => setShowReliability(!showReliability)}
        >
          {showReliability ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Reliability
        </div>
        {showReliability && (
          <div className="p-3 flex flex-col gap-3 bg-secondary/5 border-t">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Delivery Guarantee</span>
              <Select value={data.delivery || "At Least Once"} onValueChange={(val) => updateNode(id, { data: { ...data, delivery: val } })}>
                <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="At Most Once" className="text-xs">At Most Once</SelectItem>
                  <SelectItem value="At Least Once" className="text-xs">At Least Once</SelectItem>
                  <SelectItem value="Exactly Once" className="text-xs">Exactly Once</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ordering */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Ordering</span>
              <Select value={data.ordering || "Unordered"} onValueChange={(val) => updateNode(id, { data: { ...data, ordering: val } })}>
                <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Unordered" className="text-xs">Unordered</SelectItem>
                  <SelectItem value="Ordered" className="text-xs">Ordered</SelectItem>
                  <SelectItem value="Global Order" className="text-xs">Global Order</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Retention */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Retention</span>
              <Select value={data.retention || "7 days"} onValueChange={(val) => updateNode(id, { data: { ...data, retention: val } })}>
                <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1 hour" className="text-xs">1 hour</SelectItem>
                  <SelectItem value="1 day" className="text-xs">1 day</SelectItem>
                  <SelectItem value="7 days" className="text-xs">7 days</SelectItem>
                  <SelectItem value="Forever" className="text-xs">Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

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
          <div className="px-3 py-2 flex flex-col gap-3 border-t text-[10px] text-muted-foreground bg-secondary/5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">Consumer Group</Label>
              <Input className="h-6 text-[10px] w-32 bg-background nodrag" placeholder="Group Name" value={broker.consumerGroup || ""} onChange={e => updateBroker("consumerGroup", e.target.value)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
