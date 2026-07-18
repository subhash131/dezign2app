import React, { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@workspace/ui/components/sheet";
import { ChevronLeft } from "lucide-react";
import { Schema, Endpoint, AnyMessagingResource, PublishedEvent } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { ParameterEditor, SchemaEditor } from "./backend-nodes/graph-nodes/Editors";
import { MessagingResourceList } from "./backend-nodes/graph-nodes/shared";
import { LocalInput, LocalTextarea } from "./backend-nodes/graph-nodes/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

export const ConfigSidebar = () => {
  const activeConfigItem = useBackendCanvasStore(s => s.activeConfigItem);
  const setActiveConfigItem = useBackendCanvasStore(s => s.setActiveConfigItem);
  const endpoints = useBackendCanvasStore(s => s.endpoints);
  const events = useBackendCanvasStore(s => s.events);
  const updateEndpoint = useBackendCanvasStore(s => s.updateEndpoint);
  const updateEvent = useBackendCanvasStore(s => s.updateEvent);
  const nodes = useBackendCanvasStore(s => s.nodes);

  const [width, setWidth] = useState(540);
  const isDragging = useRef(false);

  type ConfigItem = NonNullable<typeof activeConfigItem>;
  const [history, setHistory] = useState<ConfigItem[]>([]);

  useEffect(() => {
    if (!activeConfigItem) {
      setHistory([]);
      return;
    }

    setHistory(prev => {
      if (prev.length > 1 && prev[prev.length - 2]?.id === activeConfigItem.id && prev[prev.length - 2]?.type === activeConfigItem.type) {
        return prev.slice(0, prev.length - 1);
      }
      
      if (prev.length > 0 && prev[prev.length - 1]?.id === activeConfigItem.id && prev[prev.length - 1]?.type === activeConfigItem.type) {
        return prev;
      }
      
      if (prev.length > 0 && prev[prev.length - 1]?.nodeId !== activeConfigItem.nodeId) {
         return [activeConfigItem];
      }

      return [...prev, activeConfigItem];
    });
  }, [activeConfigItem]);

  const handleBack = () => {
    if (history.length > 1) {
      setActiveConfigItem(history[history.length - 2] ?? null);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 320 && newWidth < 800) {
        setWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const open = activeConfigItem !== null;
  
  if (!open) return null;

  const type = activeConfigItem.type;
  const id = activeConfigItem.id;
  const nodeId = activeConfigItem.nodeId;

  const renderEndpointConfig = () => {
    const item = endpoints.find(e => e.id === id);
    if (!item) return null;

    return (
      <div className="flex flex-col gap-6 mt-6 pb-12">
        <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-primary/15 text-primary rounded border border-primary/20 shadow-sm">{item.type}</span>
            <span className="text-lg font-semibold tracking-tight text-foreground">{item.name}</span>
          </div>
          <span className="text-sm text-muted-foreground">Configure endpoint details and behavior.</span>
        </div>
        
        <ParameterEditor 
          title="Headers" 
          parameters={item.headers || []} 
          onChange={headers => updateEndpoint(item.id, { headers })} 
        />
        <ParameterEditor 
          title="Path Params" 
          parameters={item.pathParams || []} 
          onChange={pathParams => updateEndpoint(item.id, { pathParams })} 
        />
        <ParameterEditor 
          title="Query Params" 
          parameters={item.queryParams || []} 
          onChange={queryParams => updateEndpoint(item.id, { queryParams })} 
        />
        <SchemaEditor 
          title="Request Body Schema" 
          schema={item.requestBody} 
          onChange={requestBody => updateEndpoint(item.id, { requestBody })} 
        />
        <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Business Logic (Pseudo-code)
          </span>
          <LocalTextarea 
            className="min-h-[120px] text-sm resize-none bg-background/50 focus-visible:ring-1 font-mono"
            placeholder="e.g. 1. Validate user input&#10;2. Check if user exists&#10;3. Save to database"
            value={item.businessLogic || ""}
            onBlur={e => updateEndpoint(item.id, { businessLogic: e.target.value })}
          />
        </div>
        
        <div className="flex flex-col gap-3 mt-2">
          <MessagingResourceList
            nodeId={nodeId}
            title="Publish Events"
            items={item.publishedEvents || []}
            variant="publish"
            resourceType="topics"
            asCard={true}
            onChange={(publishedEvents) => updateEndpoint(item.id, { publishedEvents })}
          />
        </div>
        
        <SchemaEditor 
          title="Response Schema" 
          schema={item.responseBody} 
          onChange={responseBody => updateEndpoint(item.id, { responseBody })} 
        />
      </div>
    );
  };

  const renderEventConfig = () => {
    let item = events.find(e => e.id === id);
    let parentEndpoint: Endpoint | undefined;
    let isEndpointEvent = false;

    if (!item) {
      for (const ep of endpoints) {
        const publishedMatch = ep.publishedEvents?.find(e => e.id === id);
        if (publishedMatch) {
           item = { ...publishedMatch, variant: 'publish', nodeId: ep.nodeId } as any;
           parentEndpoint = ep;
           isEndpointEvent = true;
           break;
        }
      }
    }

    if (!item) return null;

    const handleUpdate = (eventId: string, changes: Partial<AnyMessagingResource>) => {
      if (isEndpointEvent && parentEndpoint) {
        const list = parentEndpoint.publishedEvents;
        if (list) {
          const updatedList = list.map(e => e.id === eventId ? { ...e, ...changes } as PublishedEvent : e);
          updateEndpoint(parentEndpoint.id, { 
            publishedEvents: updatedList 
          });
        }
      } else {
        updateEvent(eventId, changes);
      }
    };
    
    const isPublished = item.variant === "publish";
    const isConsumed = item.variant === "consume";
    
    const messagingNodes = nodes.filter(n => 
      n.type === "queue" || 
      n.type === "pubsub" || 
      n.type === "eventstream" || 
      n.type === "kafka" || 
      n.type === "redis-streams" || 
      n.type === "sqs"
    );
    
    const selectedBroker = messagingNodes.find(n => n.id === item.brokerNodeId);
    const availableResources = selectedBroker ? (
      selectedBroker.data.topics || 
      selectedBroker.data.streams || 
      selectedBroker.data.queues || 
      selectedBroker.data.channels || []
    ) : [];

    return (
      <div className="flex flex-col gap-6 mt-6 pb-12">
        <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-orange-500/15 text-orange-500 rounded border border-orange-500/20 shadow-sm">EVENT</span>
            <span className="text-lg font-semibold tracking-tight text-foreground">{item.name}</span>
          </div>
          <span className="text-sm text-muted-foreground">Configure event and messaging details.</span>
        </div>

        {!isConsumed && (
          <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isPublished ? "Publish Trigger Condition" : "Description"}
            </span>
            <LocalTextarea 
              className="min-h-[60px] text-sm resize-none bg-background/50 focus-visible:ring-1"
              placeholder={isPublished ? "Explain the exact logic/condition that causes this event to fire (e.g. 'When a user successfully pays for their order')" : "Describe this resource..."}
              value={item.publishedWhen || item.description || ""}
              onBlur={e => handleUpdate(item!.id, { publishedWhen: e.target.value, description: e.target.value })}
            />
          </div>
        )}
        
        <SchemaEditor 
          title={isConsumed ? "Expected Payload" : (isPublished ? "Payload Schema" : "Schema")} 
          schema={item.payloadSchema} 
          onChange={payloadSchema => handleUpdate(item!.id, { payloadSchema })} 
        />

        {isConsumed && (
          <div className="flex flex-col gap-1.5 border-t pt-4">
            <span className="text-xs font-bold text-muted-foreground">Handler Logic</span>
            <LocalTextarea 
              className="min-h-[80px] text-xs font-mono"
              placeholder="What happens when this event is received?"
              value={item.handlerLogic || ""}
              onBlur={e => handleUpdate(item!.id, { handlerLogic: e.target.value })}
            />
          </div>
        )}

        {isConsumed && (
          <div className="flex flex-col gap-4 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">Retry Policy</span>
              <Select value={item.retryPolicy || "NONE"} onValueChange={v => handleUpdate(item!.id, { retryPolicy: v })}>
                <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE" className="text-xs">None</SelectItem>
                  <SelectItem value="EXPONENTIAL_BACKOFF" className="text-xs">Exponential Backoff</SelectItem>
                  <SelectItem value="FIXED_INTERVAL" className="text-xs">Fixed Interval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">Max Retries</span>
              <LocalInput 
                type="number"
                className="w-24 text-xs text-right" 
                placeholder="e.g. 3" 
                value={(item.maxRetries) ?? ""}
                onBlur={e => handleUpdate(item!.id, { maxRetries: parseInt(e.target.value) })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">DLQ</span>
              <LocalInput 
                className="flex-1 text-xs font-mono" 
                placeholder="dlq-topic-name" 
                value={(item.deadLetterQueue as string) || ""}
                onBlur={e => handleUpdate(item!.id, { deadLetterQueue: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id={`idempotent-${item.id}`} 
                checked={(item.isIdempotent) || false} 
                onChange={e => handleUpdate(item!.id, { isIdempotent: e.target.checked })} 
              />
              <label htmlFor={`idempotent-${item.id}`} className="text-xs font-bold text-muted-foreground cursor-pointer">
                Idempotent Consumer
              </label>
            </div>
          </div>
        )}

        {!isConsumed && (
          <div className="flex flex-col gap-4 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">Version</span>
              <LocalInput 
                className="w-24 text-xs text-right" 
                placeholder="v1" 
                value={(item.version as string) || "v1"}
                onBlur={e => handleUpdate(item!.id, { version: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">Category</span>
              <Select value={(item.category as string) || "DOMAIN"} onValueChange={v => handleUpdate(item!.id, { category: v })}>
                <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOMAIN" className="text-xs">Domain</SelectItem>
                  <SelectItem value="INTEGRATION" className="text-xs">Integration</SelectItem>
                  <SelectItem value="CDC" className="text-xs">CDC</SelectItem>
                  <SelectItem value="AUDIT" className="text-xs">Audit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">Delivery</span>
              <Select value={(item.delivery as string) || "AT_LEAST_ONCE"} onValueChange={v => handleUpdate(item!.id, { delivery: v })}>
                <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AT_LEAST_ONCE" className="text-xs">At Least Once</SelectItem>
                  <SelectItem value="AT_MOST_ONCE" className="text-xs">At Most Once</SelectItem>
                  <SelectItem value="EXACTLY_ONCE" className="text-xs">Exactly Once</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-4">
          <span className="text-xs font-bold text-muted-foreground">
            {isPublished ? "Publishes To Broker" : "Consumes From Broker"}
          </span>
          <Select value={(item.brokerNodeId as string) || ""} onValueChange={v => handleUpdate(item!.id, { brokerNodeId: v, messagingResourceId: "" })}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Select Messaging Node" />
            </SelectTrigger>
            <SelectContent>
              {messagingNodes.length === 0 && <SelectItem value="none" disabled className="text-xs">No messaging nodes found</SelectItem>}
              {messagingNodes.map((node) => (
                <SelectItem key={node.id} value={node.id} className="text-xs">
                  {node.data.label || "Untitled Messaging"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {item.brokerNodeId ? (
            <Select value={(item.messagingResourceId as string) || ""} onValueChange={v => handleUpdate(item!.id, { messagingResourceId: v })}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select Topic / Queue / Stream" />
              </SelectTrigger>
              <SelectContent>
                {availableResources.length === 0 && <SelectItem value="none" disabled className="text-xs">No resources defined on broker</SelectItem>}
                {availableResources.map((res) => (
                  <SelectItem key={res.id} value={res.id} className="text-xs">
                    {res.name || "Untitled Resource"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="h-9 text-xs text-muted-foreground flex items-center px-3 bg-secondary/20 border rounded-md border-dashed">
              Select a broker first
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Sheet modal={false} open={open} onOpenChange={(isOpen) => !isOpen && setActiveConfigItem(null)}>
      <SheetContent 
        hideOverlay 
        className="overflow-y-auto bg-background/80 backdrop-blur-xl border-l border-border/50 shadow-2xl p-6 sm:p-8 transition-none"
        style={{ maxWidth: '100vw', width: width }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 z-50 transition-colors"
          onMouseDown={() => {
            isDragging.current = true;
          }}
        />
        <SheetHeader className="hidden">
          <SheetTitle>Configuration</SheetTitle>
          <SheetDescription>
            {type === 'endpoint' ? "Configure endpoint properties." : "Configure event and messaging properties."}
          </SheetDescription>
        </SheetHeader>
        
        {history.length > 1 && (
          <div 
            onClick={handleBack}
            className="flex items-center w-fit text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors -mb-2 mt-2"
          >
            <ChevronLeft size={14} className="mr-0.5" />
            Back
          </div>
        )}

        {type === 'endpoint' ? renderEndpointConfig() : renderEventConfig()}
      </SheetContent>
    </Sheet>
  );
};
