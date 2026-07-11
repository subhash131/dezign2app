import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader } from "./shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Input } from "@workspace/ui/components/input";

export const QueueNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  
  const [showReliability, setShowReliability] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Derive publishers and subscribers from edges and service node event targets
  const serviceNodes = nodes.filter(n => n.type === "service");
  
  const publisherIds = new Set([
    ...edges.filter(e => e.target === id).map(e => e.source),
    ...serviceNodes.filter(n => n.data.publishedEvents?.some((ev: any) => ev.targetNodeId === id)).map(n => n.id)
  ]);
  const subscriberIds = new Set([
    ...edges.filter(e => e.source === id).map(e => e.target),
    ...serviceNodes.filter(n => n.data.consumedEvents?.some((ev: any) => ev.targetNodeId === id)).map(n => n.id)
  ]);
  
  const publishers = nodes.filter(n => publisherIds.has(n.id));
  const subscribers = nodes.filter(n => subscriberIds.has(n.id));

  // Get all events routed through this node
  const events = serviceNodes.flatMap(n => n.data.publishedEvents?.filter((ev: any) => ev.targetNodeId === id) || []);

  const pattern = data.pattern || "Queue";
  const implementation = data.implementation || "None";
  const hasImplementation = implementation !== "None";

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[350px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={MessageSquare} title="Messaging" colorClass="bg-purple-500/10 text-purple-700 dark:text-purple-400" selected={selected} />
      
      {/* Node level handles for connections */}
      <Handle type="target" position={Position.Left} className="w-2 h-2" style={{ top: '20px' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2" style={{ top: '20px' }} />

      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
         <Textarea 
           className="min-h-[40px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50" 
           placeholder="description (e.g. Handles all order lifecycle events...)"
           value={data.description || ""}
           onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
         />
      </div>

      <div className="p-3 flex flex-col gap-3 bg-secondary/10 border-b">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Pattern</span>
          <Select value={pattern} onValueChange={(val) => updateNode(id, { data: { ...data, pattern: val } })}>
            <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Queue" className="text-xs">Queue</SelectItem>
              <SelectItem value="Pub/Sub" className="text-xs">Pub/Sub</SelectItem>
              <SelectItem value="Event Stream" className="text-xs">Event Stream</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Implementation</span>
          <Select value={implementation} onValueChange={(val) => updateNode(id, { data: { ...data, implementation: val } })}>
            <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="None" className="text-xs">None</SelectItem>
              <SelectItem value="Kafka" className="text-xs">Kafka</SelectItem>
              <SelectItem value="RabbitMQ" className="text-xs">RabbitMQ</SelectItem>
              <SelectItem value="Amazon SQS" className="text-xs">Amazon SQS</SelectItem>
              <SelectItem value="Redis Streams" className="text-xs">Redis Streams</SelectItem>
              <SelectItem value="Google Pub/Sub" className="text-xs">Google Pub/Sub</SelectItem>
              <SelectItem value="Azure Service Bus" className="text-xs">Azure Service Bus</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {events.length > 0 && (
        <div className="flex flex-col border-t bg-secondary/10 nodrag pb-2">
           <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Routed Events</div>
           <div className="px-3 flex flex-col gap-1">
             {events.map((ev: any, i: number) => (
               <div key={i} className="text-xs font-medium truncate px-1 border-l-2 border-purple-500/50 ml-1">
                 {ev.name || "Unnamed Event"}
               </div>
             ))}
           </div>
        </div>
      )}

      <div className="flex flex-col border-t border-b bg-secondary/20 nodrag">
         <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
           {pattern === "Queue" ? "Producers" : "Publishers"}
         </div>
         <div className="px-3 pb-2 flex flex-col gap-1">
           {publishers.length === 0 ? (
             <span className="text-[10px] text-muted-foreground italic">No {pattern === "Queue" ? "producers" : "publishers"}</span>
           ) : (
             publishers.map(p => (
               <div key={p.id} className="text-xs font-medium truncate px-1 border-l-2 border-primary/50 ml-1">{p.data.label || "Untitled"}</div>
             ))
           )}
         </div>
      </div>

      <div className="flex flex-col border-b bg-secondary/20 nodrag">
         <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
           {pattern === "Queue" ? "Consumers" : "Subscribers"}
         </div>
         <div className="px-3 pb-2 flex flex-col gap-1">
           {subscribers.length === 0 ? (
             <span className="text-[10px] text-muted-foreground italic">No {pattern === "Queue" ? "consumers" : "subscribers"}</span>
           ) : (
             subscribers.map(s => (
               <div key={s.id} className="text-xs font-medium truncate px-1 border-l-2 border-primary/50 ml-1">{s.data.label || "Untitled"}</div>
             ))
           )}
         </div>
      </div>

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
                
                {/* Available across all patterns */}
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

                {pattern === "Event Stream" && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Ordering</span>
                    <Select value={data.ordering || "Unordered"} onValueChange={(val) => updateNode(id, { data: { ...data, ordering: val } })}>
                      <SelectTrigger className="h-6 w-[140px] text-[10px] px-2 py-0 nodrag"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Unordered" className="text-xs">Unordered</SelectItem>
                        <SelectItem value="Ordered" className="text-xs">Ordered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {pattern === "Queue" && (
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
                )}
                
                {(pattern === "Pub/Sub" || pattern === "Event Stream") && (
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

                {pattern === "Queue" && (
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
                {implementation === "Redis Streams" && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-[10px] font-bold text-muted-foreground">Consumer Group</Label>
                      <Input className="h-6 text-[10px] w-32 bg-background nodrag" placeholder="Group Name" value={data.redisConsumerGroup || ""} onChange={e => updateNode(id, { data: { ...data, redisConsumerGroup: e.target.value } })} />
                    </div>
                  </>
                )}
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
                {implementation === "Azure Service Bus" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-[10px] font-bold text-muted-foreground">Topic / Queue</Label>
                      <Input className="h-6 text-[10px] w-full bg-background nodrag" placeholder="Topic Name" value={data.azureTopic || ""} onChange={e => updateNode(id, { data: { ...data, azureTopic: e.target.value } })} />
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
