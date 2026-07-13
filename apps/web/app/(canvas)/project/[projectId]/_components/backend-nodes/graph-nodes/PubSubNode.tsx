import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Radio, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader } from "./shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

// Pub/Sub implementations with their specific config fields
const PUBSUB_IMPLEMENTATIONS = ["None", "Google Pub/Sub", "Redis Pub/Sub", "RabbitMQ Fanout"] as const;
type PubSubImpl = typeof PUBSUB_IMPLEMENTATIONS[number];

export const PubSubNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const [showReliability, setShowReliability] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const implementation = (data.implementation || "None") as PubSubImpl;
  const hasImplementation = implementation !== "None";

  // Derive publishers (nodes/endpoints/events that send to this pub/sub)
  const publisherEdges = edges.filter(e => e.target === id);
  const publishers = publisherEdges.map(edge => {
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

  // Derive subscribers (nodes/endpoints/events that read from this pub/sub)
  const subscriberEdges = edges.filter(e => e.source === id);
  const subscribers = subscriberEdges.map(edge => {
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
      <NodeHeader id={id} data={data} icon={Radio} title="Pub / Sub" colorClass="bg-purple-500/10 text-purple-700 dark:text-purple-400" selected={selected} />

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
              {PUBSUB_IMPLEMENTATIONS.map(impl => (
                <SelectItem key={impl} value={impl} className="text-xs">{impl}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Publishers */}
      <div className="flex flex-col border-t border-b bg-secondary/20 nodrag">
        <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Publishers</div>
        <div className="px-3 pb-2 flex flex-col gap-1">
          {publishers.length === 0
            ? <span className="text-[10px] text-muted-foreground italic px-1">No publishers connected</span>
            : publishers.map(p => (
                <div key={p.id} className="text-xs font-medium truncate px-1 border-l-2 border-purple-500/50 ml-1">{p.label}</div>
              ))
          }
        </div>
      </div>

      {/* Subscribers */}
      <div className="flex flex-col border-b bg-secondary/20 nodrag">
        <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Subscribers</div>
        <div className="px-3 pb-2 flex flex-col gap-1">
          {subscribers.length === 0
            ? <span className="text-[10px] text-muted-foreground italic px-1">No subscribers connected</span>
            : subscribers.map(s => (
                <div key={s.id} className="text-xs font-medium truncate px-1 border-l-2 border-purple-500/50 ml-1">{s.label}</div>
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

              {/* Retention is relevant for Pub/Sub patterns */}
              {(implementation === "Google Pub/Sub" || implementation === "RabbitMQ Fanout") && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Retention</span>
                  <Select value={data.retention || "1 day"} onValueChange={(val) => updateNode(id, { data: { ...data, retention: val } })}>
                    <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1 hour" className="text-xs">1 hour</SelectItem>
                      <SelectItem value="1 day" className="text-xs">1 day</SelectItem>
                      <SelectItem value="7 days" className="text-xs">7 days</SelectItem>
                      <SelectItem value="Forever" className="text-xs">Forever</SelectItem>
                    </SelectContent>
                  </Select>
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
              {implementation === "Google Pub/Sub" && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground">Topic</Label>
                    <Input className="h-6 text-[10px] w-full bg-background nodrag" placeholder="projects/my-project/topics/my-topic" value={data.gcpTopic || ""} onChange={e => updateNode(id, { data: { ...data, gcpTopic: e.target.value } })} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[10px] font-bold text-muted-foreground">Subscription</Label>
                    <Input className="h-6 text-[10px] w-full bg-background nodrag" placeholder="projects/my-project/subscriptions/my-sub" value={data.gcpSubscription || ""} onChange={e => updateNode(id, { data: { ...data, gcpSubscription: e.target.value } })} />
                  </div>
                </>
              )}

              {implementation === "RabbitMQ Fanout" && (
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[10px] font-bold text-muted-foreground">Exchange</Label>
                  <Input className="h-6 text-[10px] w-28 bg-background nodrag" placeholder="Exchange Name" value={data.rabbitExchange || ""} onChange={e => updateNode(id, { data: { ...data, rabbitExchange: e.target.value } })} />
                </div>
              )}

              {implementation === "Redis Pub/Sub" && (
                <p className="text-[10px] text-muted-foreground italic">
                  Redis Pub/Sub is fire-and-forget — no persistence or acknowledgment. No additional config required.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
