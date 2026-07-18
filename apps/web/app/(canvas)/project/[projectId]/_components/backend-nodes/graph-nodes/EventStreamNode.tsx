import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Waves, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader } from "./shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

// Event Stream implementations with their specific config fields
const EVENTSTREAM_IMPLEMENTATIONS = ["None", "Kafka", "Redis Streams", "Azure Event Hubs"] as const;
type EventStreamImpl = typeof EVENTSTREAM_IMPLEMENTATIONS[number];

export const EventStreamNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const [showReliability, setShowReliability] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const implementation = (data.implementation || "None") as EventStreamImpl;
  const hasImplementation = implementation !== "None";

  // Derive producers (nodes/endpoints/events that send to this event stream)
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

  // Derive consumers (nodes/endpoints/events that read from this event stream)
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
      <NodeHeader id={id} data={data} icon={Waves} title="Event Stream" colorClass="bg-teal-500/10 text-teal-700 dark:text-teal-400" selected={selected} />

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
              {EVENTSTREAM_IMPLEMENTATIONS.map(impl => (
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
                <div key={p.id} className="text-xs font-medium truncate px-1 border-l-2 border-teal-500/50 ml-1">{p.label}</div>
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
                <div key={c.id} className="text-xs font-medium truncate px-1 border-l-2 border-teal-500/50 ml-1">{c.label}</div>
            ))
          }
        </div>
      </div>


      {/* Reliability */}
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
              {implementation === "Kafka" && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-bold text-muted-foreground">Partitions</Label>
                    <Input className="h-6 text-[10px] w-16 text-right bg-background nodrag" placeholder="e.g. 3" value={data.kafkaPartitions || ""} onChange={e => updateNode(id, { data: { ...data, kafkaPartitions: e.target.value } })} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-bold text-muted-foreground">Replication Factor</Label>
                    <Input className="h-6 text-[10px] w-16 text-right bg-background nodrag" placeholder="e.g. 3" value={data.kafkaReplication || ""} onChange={e => updateNode(id, { data: { ...data, kafkaReplication: e.target.value } })} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-bold text-muted-foreground">Compression</Label>
                    <Select value={data.kafkaCompression || "None"} onValueChange={(val) => updateNode(id, { data: { ...data, kafkaCompression: val } })}>
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
                    <Input className="h-6 text-[10px] w-24 text-right bg-background nodrag" placeholder="e.g. 7 days" value={data.kafkaTTL || ""} onChange={e => updateNode(id, { data: { ...data, kafkaTTL: e.target.value } })} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[10px] font-bold text-muted-foreground">Batch Size</Label>
                    <Input className="h-6 text-[10px] w-24 text-right bg-background nodrag" placeholder="e.g. 16KB" value={data.kafkaBatchSize || ""} onChange={e => updateNode(id, { data: { ...data, kafkaBatchSize: e.target.value } })} />
                  </div>
                </>
              )}

              {implementation === "Redis Streams" && (
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[10px] font-bold text-muted-foreground">Consumer Group</Label>
                  <Input className="h-6 text-[10px] w-32 bg-background nodrag" placeholder="Group Name" value={data.redisConsumerGroup || ""} onChange={e => updateNode(id, { data: { ...data, redisConsumerGroup: e.target.value } })} />
                </div>
              )}

              {implementation === "Azure Event Hubs" && (
                <p className="text-[10px] text-muted-foreground italic">
                  Azure Event Hubs uses the common delivery and retention settings above. No additional config required.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
