import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { GitBranch, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, MessagingResourceList } from "./shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Input } from "@workspace/ui/components/input";

export const SQSNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  const [showReliability, setShowReliability] = useState(false);
  const [showBrokerConfig, setShowBrokerConfig] = useState(true);

  // Initialize sqsBroker if not defined
  const broker = data.sqsBroker || {};

  const updateBroker = <K extends keyof NonNullable<BackendNode["data"]["sqsBroker"]>>(key: K, value: NonNullable<BackendNode["data"]["sqsBroker"]>[K]) => {
    updateNode(id, {
      data: {
        ...data,
        sqsBroker: {
          ...broker,
          [key]: value,
        },
      },
    });
  };

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[350px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={GitBranch} title="Amazon SQS" colorClass="bg-orange-500/10 text-orange-700 dark:text-orange-400" selected={selected} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Queues (Messaging Resources) */}
      <MessagingResourceList
        title="Queues"
        items={data.queues || []}
        variant="definition"
        resourceType="queues"
        onChange={(queues) =>
          updateNode(id, {
            data: {
              ...data,
              queues,
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

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Failure Handling</span>
              <Select value={data.failureHandling || "Retry"} onValueChange={(val) => updateNode(id, { data: { ...data, failureHandling: val } })}>
                <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Drop" className="text-xs">Drop</SelectItem>
                  <SelectItem value="Retry" className="text-xs">Retry</SelectItem>
                  <SelectItem value="Retry + DLQ" className="text-xs">Retry + DLQ</SelectItem>
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
              <Label className="text-[10px] font-bold text-muted-foreground">Visibility Timeout</Label>
              <Input className="h-6 text-[10px] w-24 text-right bg-background nodrag" placeholder="e.g. 30s" value={broker.visibilityTimeout || ""} onChange={e => updateBroker("visibilityTimeout", e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[10px] font-bold text-muted-foreground">Delay Seconds</Label>
              <Input className="h-6 text-[10px] w-24 text-right bg-background nodrag" placeholder="e.g. 0s" value={broker.delay || ""} onChange={e => updateBroker("delay", e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor={`sqs-fifo-${id}`} className="text-[10px] font-bold text-muted-foreground uppercase">FIFO Queue</Label>
              <Switch id={`sqs-fifo-${id}`} className="nodrag scale-75 origin-right" checked={broker.fifo || false} onCheckedChange={(val) => updateBroker("fifo", val)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
