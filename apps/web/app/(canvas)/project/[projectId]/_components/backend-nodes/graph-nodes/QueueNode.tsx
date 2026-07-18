import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { GitBranch, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader } from "./shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Input } from "@workspace/ui/components/input";

// Queue implementations with their specific config fields
const QUEUE_IMPLEMENTATIONS = ["None", "RabbitMQ", "Amazon SQS", "Azure Service Bus"] as const;
type QueueImpl = typeof QUEUE_IMPLEMENTATIONS[number];

export const QueueNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const [showReliability, setShowReliability] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const implementation = (data.implementation || "None") as QueueImpl;
  const hasImplementation = implementation !== "None";

  // Derive producers (nodes/endpoints/events that send to this queue)
  const producerEdges = edges.filter(e => e.target === id);
  const producers = producerEdges.map(edge => {
    const srcNode = nodes.find(n => n.id === edge.source);
    if (!srcNode) return null;

    let eventDetail = "";
    if (edge.sourceHandle?.startsWith("publishedEvents-out-")) {
      const evId = edge.sourceHandle.replace("publishedEvents-out-", "");
      const ev = srcNode.data.publishedEvents?.find((e) => e.id === evId);
      if (ev && ev.name) {
        eventDetail = ` (${ev.name})`;
      }
    }

    return {
      id: edge.id,
      label: `${srcNode.data.label || "Untitled"}${eventDetail}`
    };
  }).filter((x): x is { id: string; label: string } => x !== null);

  // Derive consumers (nodes/endpoints/events that read from this queue)
  const consumerEdges = edges.filter(e => e.source === id);
  const consumers = consumerEdges.map(edge => {
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!targetNode) return null;

    let eventDetail = "";
    if (edge.targetHandle?.startsWith("consumedEvents-in-")) {
      const evId = edge.targetHandle.replace("consumedEvents-in-", "");
      const ev = targetNode.data.consumedEvents?.find((e) => e.id === evId);
      if (ev && ev.name) {
        eventDetail = ` (${ev.name})`;
      }
    }

    return {
      id: edge.id,
      label: `${targetNode.data.label || "Untitled"}${eventDetail}`
    };
  }).filter((x): x is { id: string; label: string } => x !== null);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[350px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={GitBranch} title="Queue" colorClass="bg-orange-500/10 text-orange-700 dark:text-orange-400" selected={selected} />

      <Handle type="target" position={Position.Left} className="w-2 h-2" style={{ top: '20px' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2" style={{ top: '20px' }} />

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      {/* Implementation */}
      <div className="p-3 flex flex-col gap-3 bg-secondary/10 border-b">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Implementation</span>
          <Select value={implementation} onValueChange={(val) => updateNode(id, { data: { ...data, implementation: val } })}>
            <SelectTrigger className="h-6 w-[160px] text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUEUE_IMPLEMENTATIONS.map(impl => (
                <SelectItem key={impl} value={impl} className="text-xs">{impl}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Producers */}
      <div className="flex flex-col border-t border-b bg-secondary/20 nodrag">
        <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Producers</div>
        <div className="px-3 pb-2 flex flex-col gap-1">
          {producers.length === 0
            ? <span className="text-[10px] text-muted-foreground italic px-1">No producers connected</span>
            : producers.map(p => (
                <div key={p.id} className="text-xs font-medium truncate px-1 border-l-2 border-orange-500/50 ml-1">{p.label}</div>
              ))
          }
        </div>
      </div>

      {/* Consumers */}
      <div className="flex flex-col border-b bg-secondary/20 nodrag">
        <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Consumers</div>
        <div className="px-3 pb-2 flex flex-col gap-1">
          {consumers.length !== 0 &&
            consumers.map(c => (
              <div key={c.id} className="text-xs font-medium truncate px-1 border-l-2 border-orange-500/50 ml-1">{c.label}</div>
            ))
          }
        </div>
      </div>


      {/* Reliability — only when an implementation is chosen */}
      {hasImplementation && (
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
              {/* Delivery guarantee */}
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

              {/* Failure Handling */}
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

              {/* Durable — only relevant for RabbitMQ */}
              {implementation === "RabbitMQ" && (
                <div className="flex items-center justify-between">
                  <Label htmlFor={`durable-${id}`} className="text-[10px] font-bold text-muted-foreground uppercase">Durable</Label>
                  <Switch
                    id={`durable-${id}`}
                    className="nodrag scale-75 origin-right"
                    checked={data.durable ?? true}
                    onCheckedChange={(val) => updateNode(id, { data: { ...data, durable: val } })}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Implementation-specific settings */}
      {hasImplementation && (
        <div className="flex flex-col nodrag">
          <div
            className="px-3 py-1.5 flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary/40 transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {implementation} Settings
          </div>
          {showAdvanced && (
            <div className="px-3 py-2 flex flex-col gap-3 border-t text-[10px] text-muted-foreground bg-secondary/5">
              {implementation === "RabbitMQ" && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-bold text-muted-foreground">Exchange</Label>
                    <Input className="h-6 text-[10px] w-28 bg-background nodrag" placeholder="Exchange Name" value={data.rabbitExchange || ""} onChange={e => updateNode(id, { data: { ...data, rabbitExchange: e.target.value } })} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-bold text-muted-foreground">Routing Key</Label>
                    <Input className="h-6 text-[10px] w-28 bg-background nodrag" placeholder="Routing Key" value={data.rabbitRoutingKey || ""} onChange={e => updateNode(id, { data: { ...data, rabbitRoutingKey: e.target.value } })} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-bold text-muted-foreground">Bindings</Label>
                    <Input className="h-6 text-[10px] w-28 bg-background nodrag" placeholder="Bindings" value={data.rabbitBindings || ""} onChange={e => updateNode(id, { data: { ...data, rabbitBindings: e.target.value } })} />
                  </div>
                </>
              )}

              {implementation === "Amazon SQS" && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-bold text-muted-foreground">Visibility Timeout</Label>
                    <Input className="h-6 text-[10px] w-24 text-right bg-background nodrag" placeholder="e.g. 30s" value={data.sqsVisibilityTimeout || ""} onChange={e => updateNode(id, { data: { ...data, sqsVisibilityTimeout: e.target.value } })} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-bold text-muted-foreground">Delay Seconds</Label>
                    <Input className="h-6 text-[10px] w-24 text-right bg-background nodrag" placeholder="e.g. 0s" value={data.sqsDelay || ""} onChange={e => updateNode(id, { data: { ...data, sqsDelay: e.target.value } })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`sqs-fifo-${id}`} className="text-[10px] font-bold text-muted-foreground uppercase">FIFO Queue</Label>
                    <Switch id={`sqs-fifo-${id}`} className="nodrag scale-75 origin-right" checked={data.sqsFifo || false} onCheckedChange={(val) => updateNode(id, { data: { ...data, sqsFifo: val } })} />
                  </div>
                </>
              )}

              {implementation === "Azure Service Bus" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground">Queue / Topic Name</Label>
                    <Input className="h-6 text-[10px] w-full bg-background nodrag" placeholder="my-queue" value={data.azureTopic || ""} onChange={e => updateNode(id, { data: { ...data, azureTopic: e.target.value } })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground">Subscription</Label>
                    <Input className="h-6 text-[10px] w-full bg-background nodrag" placeholder="Subscription Name" value={data.azureSubscription || ""} onChange={e => updateNode(id, { data: { ...data, azureSubscription: e.target.value } })} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
