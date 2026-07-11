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

export const KafkaNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  const [showReliability, setShowReliability] = useState(false);
  const [showBrokerConfig, setShowBrokerConfig] = useState(true);

  // Initialize kafkaBroker if not defined
  const broker = data.kafkaBroker || {};

  const updateBroker = (key: string, value: any) => {
    updateNode(id, {
      data: {
        ...data,
        kafkaBroker: {
          ...broker,
          [key]: value,
        },
      },
    });
  };

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[350px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Waves} title="Kafka" colorClass="bg-teal-500/10 text-teal-700 dark:text-teal-400" selected={selected} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Topics (Messaging Resources) */}
      <MessagingResourceList
          title="Topics"
          items={data.topics || []}
          variant="definition"
          resourceType="topics"
          onChange={(topics) =>
            updateNode(id, {
              data: { ...data, topics },
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
                  <SelectItem value="Ordered" className="text-xs">Ordered (per partition)</SelectItem>
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
              <Label className="text-[10px] font-bold text-muted-foreground">Partitions</Label>
              <Input className="h-6 text-[10px] w-16 text-right bg-background nodrag" placeholder="e.g. 3" value={broker.partitions || ""} onChange={e => updateBroker("partitions", e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">Replication Factor</Label>
              <Input className="h-6 text-[10px] w-16 text-right bg-background nodrag" placeholder="e.g. 3" value={broker.replication || ""} onChange={e => updateBroker("replication", e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">Compression</Label>
              <Select value={broker.compression || "None"} onValueChange={(val) => updateBroker("compression", val)}>
                <SelectTrigger className="h-6 w-24 text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="None" className="text-[10px]">None</SelectItem>
                  <SelectItem value="Gzip" className="text-[10px]">Gzip</SelectItem>
                  <SelectItem value="Snappy" className="text-[10px]">Snappy</SelectItem>
                  <SelectItem value="LZ4" className="text-[10px]">LZ4</SelectItem>
                  <SelectItem value="Zstd" className="text-[10px]">Zstd</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">TTL</Label>
              <Input className="h-6 text-[10px] w-24 text-right bg-background nodrag" placeholder="e.g. 7 days" value={broker.ttl || ""} onChange={e => updateBroker("ttl", e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">Batch Size</Label>
              <Input className="h-6 text-[10px] w-24 text-right bg-background nodrag" placeholder="e.g. 16KB" value={broker.batchSize || ""} onChange={e => updateBroker("batchSize", e.target.value)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
