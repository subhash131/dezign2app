import React, { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@workspace/ui/components/sheet";
import { ChevronLeft } from "lucide-react";
import { Endpoint, AnyMessagingResource, BackendNode } from "@/types/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { ParameterEditor, SchemaEditor } from "./backend-nodes/graph-nodes/Editors";
import { MessagingResourceList } from "./backend-nodes/graph-nodes/shared";
import { LocalInput, LocalTextarea } from "./backend-nodes/graph-nodes/shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Button } from "@workspace/ui/components/button";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from "@workspace/ui/components/combobox";
import { Badge } from "@workspace/ui/components/badge";

export const ConfigSidebar = () => {
  const activeConfigItem = useBackendCanvasStore(s => s.activeConfigItem);
  const setActiveConfigItem = useBackendCanvasStore(s => s.setActiveConfigItem);
  const endpoints = useBackendCanvasStore(s => s.endpoints);
  const events = useBackendCanvasStore(s => s.events);
  const updateEndpoint = useBackendCanvasStore(s => s.updateEndpoint);
  const updateEvent = useBackendCanvasStore(s => s.updateEvent);
  const nodes = useBackendCanvasStore(s => s.nodes);
  const edges = useBackendCanvasStore(s => s.edges);

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

    const simulationOutputText = item.simulationOutput === undefined
      ? ""
      : JSON.stringify(item.simulationOutput, null, 2);

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

        <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Simulation Output
          </span>
          <span className="text-xs text-muted-foreground">
            JSON returned by this endpoint during simulation and passed unchanged to the next connected endpoint.
          </span>
          <LocalTextarea
            className="min-h-[140px] text-sm resize-y bg-background/50 focus-visible:ring-1 font-mono"
            placeholder={'{\n  "id": "user-123",\n  "name": "Ada"\n}'}
            defaultValue={simulationOutputText}
            onBlur={event => {
              const value = event.currentTarget.value.trim();
              if (!value) {
                updateEndpoint(item.id, { simulationOutput: undefined });
                return;
              }
              try {
                updateEndpoint(item.id, { simulationOutput: JSON.parse(value) });
              } catch {
                // Keep invalid JSON visible until the user corrects it.
              }
            }}
          />
        </div>
      </div>
    );
  };

  const renderEventConfig = () => {
    type ConfigItemData = AnyMessagingResource & { variant?: string; nodeId?: string };
    let item: ConfigItemData | undefined = events.find(e => e.id === id);
    let parentEndpoint: Endpoint | undefined;
    let parentNode: BackendNode | undefined;
    let isEndpointEvent = false;
    let isNodeResource = false;
    let resourceArrayName: 'topics' | 'streams' | 'queues' | 'channels' | 'caches' | 'buckets' | "" = "";

    if (!item) {
      for (const ep of endpoints) {
        const publishedMatch = ep.publishedEvents?.find(e => e.id === id);
        if (publishedMatch) {
           item = { ...publishedMatch, variant: 'publish', nodeId: ep.nodeId };
           parentEndpoint = ep;
           isEndpointEvent = true;
           break;
        }
      }
    }

    if (!item) {
      // Look in nodes for topics, queues, streams, channels, caches
      parentNode = nodes.find(n => n.id === nodeId);
      if (parentNode && parentNode.data) {
        const { topics, streams, queues, channels, caches, buckets } = parentNode.data;
        const candidateArrays: Array<{
          name: 'topics' | 'streams' | 'queues' | 'channels' | 'caches' | 'buckets';
          arr: typeof topics | typeof streams | typeof queues | typeof channels | typeof caches | typeof buckets;
        }> = [
          { name: "topics", arr: topics },
          { name: "streams", arr: streams },
          { name: "queues", arr: queues },
          { name: "channels", arr: channels },
          { name: "caches", arr: caches },
          { name: "buckets", arr: buckets }
        ];
        
        for (const candidate of candidateArrays) {
          if (candidate.arr) {
            const match = candidate.arr.find((r) => r.id === id);
            if (match) {
              item = { ...match, variant: 'definition', nodeId: parentNode.id };
              isNodeResource = true;
              resourceArrayName = candidate.name;
              break;
            }
          }
        }
      }
    }

    if (!item) return null;

    const handleUpdate = (eventId: string, changes: Partial<AnyMessagingResource>) => {
      if (isEndpointEvent && parentEndpoint) {
        const list = parentEndpoint.publishedEvents;
        if (list) {
          const updatedList = list.map(e => e.id === eventId ? Object.assign({}, e, changes) : e);
          updateEndpoint(parentEndpoint.id, { 
            publishedEvents: updatedList 
          });
        }
      } else if (isNodeResource && parentNode && resourceArrayName !== "") {
        const updateNode = useBackendCanvasStore.getState().updateNode;
        const currentData = parentNode.data;
        
        if (resourceArrayName === "topics" && currentData.topics) {
          const updatedList = currentData.topics.map(r => r.id === eventId ? Object.assign({}, r, changes) : r);
          updateNode(parentNode.id, { data: { ...currentData, topics: updatedList } });
        } else if (resourceArrayName === "streams" && currentData.streams) {
          const updatedList = currentData.streams.map(r => r.id === eventId ? Object.assign({}, r, changes) : r);
          updateNode(parentNode.id, { data: { ...currentData, streams: updatedList } });
        } else if (resourceArrayName === "queues" && currentData.queues) {
          const updatedList = currentData.queues.map(r => r.id === eventId ? Object.assign({}, r, changes) : r);
          updateNode(parentNode.id, { data: { ...currentData, queues: updatedList } });
        } else if (resourceArrayName === "channels" && currentData.channels) {
          const updatedList = currentData.channels.map(r => r.id === eventId ? Object.assign({}, r, changes) : r);
          updateNode(parentNode.id, { data: { ...currentData, channels: updatedList } });
        } else if (resourceArrayName === "caches" && currentData.caches) {
          const updatedList = currentData.caches.map(r => r.id === eventId ? Object.assign({}, r, changes) : r);
          updateNode(parentNode.id, { data: { ...currentData, caches: updatedList } });
        } else if (resourceArrayName === "buckets" && currentData.buckets) {
          const updatedList = currentData.buckets.map(r => r.id === eventId ? Object.assign({}, r, changes) : r);
          updateNode(parentNode.id, { data: { ...currentData, buckets: updatedList } });
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
      n.type === "sqs" ||
      n.type === "redis-pubsub"
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
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-orange-500/15 text-orange-500 rounded border border-orange-500/20 shadow-sm">
              {resourceArrayName === "caches" || item.kind === 'cache' ? "CACHE" : resourceArrayName === "buckets" ? "STORAGE" : "EVENT"}
            </span>
            <span className="text-lg font-semibold tracking-tight text-foreground">{item.name}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {resourceArrayName === "caches" || item.kind === 'cache' ? "Configure caching details and schema." : 
             resourceArrayName === "buckets" ? "Configure data persistence, schema and events." : 
             "Configure event and messaging details."}
          </span>
        </div>

        {item.variant !== "definition" && (
          <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm">
            <span className="text-xs font-bold text-muted-foreground">
              {isPublished ? "Publishes To Broker" : "Consumes From Broker"}
            </span>
            <Select value={item.brokerNodeId || ""} onValueChange={v => handleUpdate(item!.id, { brokerNodeId: v, messagingResourceId: "" })}>
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
              <Select
                value={item.messagingResourceId || ""}
                onValueChange={v => {
                  const selectedResource = availableResources.find(resource => resource.id === v);
                  const resourceSchema = selectedResource && "payloadSchema" in selectedResource
                    ? selectedResource.payloadSchema
                    : undefined;
                  handleUpdate(item!.id, {
                    messagingResourceId: v,
                    ...(resourceSchema ? { payloadSchema: resourceSchema } : {}),
                  });
                }}
              >
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
        )}

        {!isConsumed && !(resourceArrayName === 'caches' || item.kind === 'cache') && (
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

        {item.variant === "definition" && (() => {
          let pubLabel = "Publishers";
          let subLabel = "Subscribers";
          let noPubText = "No publishers connected";
          let noSubText = "No subscribers connected";

          if (resourceArrayName === "buckets" || resourceArrayName === "caches") {
            pubLabel = "Writers";
            subLabel = "Readers";
            noPubText = "No writers connected";
            noSubText = "No readers connected";
          } else if (resourceArrayName === "queues" || resourceArrayName === "streams") {
            pubLabel = "Producers";
            subLabel = "Consumers";
            noPubText = "No producers connected";
            noSubText = "No consumers connected";
          }

          return (
            <div className="flex gap-4">
              <div className="flex-1 flex flex-col gap-2 rounded-xl border bg-card/50 p-4 shadow-sm">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{pubLabel}</span>
                {edges.filter(e => e.targetResourceId === item!.id).length === 0 ? (
                  <span className="text-xs text-muted-foreground/60 italic">{noPubText}</span>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {edges.filter(e => e.targetResourceId === item!.id).map((e, i) => {
                    const n = nodes.find(n => n.id === e.source);
                    let eventName = "";
                    let eventId = e.sourceResourceId || "";
                    
                    if (!eventId) {
                      if (e.sourceHandle?.startsWith("publishedEvents-out-")) {
                        eventId = e.sourceHandle.replace("publishedEvents-out-", "");
                      } else if (e.sourceHandle?.startsWith("consumedEvents-out-")) {
                        eventId = e.sourceHandle.replace("consumedEvents-out-", "");
                      } else if (e.sourceHandle?.match(/^(endpoint|endpoints|routeEndpoints)-out-/)) {
                        const epId = e.sourceHandle.replace(/^(endpoint|endpoints|routeEndpoints)-out-/, "");
                        const ep = endpoints.find(ep => ep.id === epId);
                        if (ep) eventName = `${ep.type} ${ep.name}`;
                      }
                    }
                    
                    if (!eventName && eventId) {
                      const ev = events.find(ev => ev.id === eventId);
                      if (ev) {
                        eventName = ev.name;
                      } else {
                        for (const ep of endpoints) {
                          const publishedMatch = ep.publishedEvents?.find(pev => pev.id === eventId);
                          if (publishedMatch) {
                            eventName = publishedMatch.name;
                            break;
                          }
                        }
                      }
                    }
                    
                    const displayName = eventName ? `${n?.data.label || 'Unknown Node'} / ${eventName}` : (n?.data.label || 'Unknown Node');
                    return <span key={i} className="text-xs font-medium" title={displayName}>{displayName}</span>;
                  })}
                </div>
              )}
            </div>
            
            <div className="flex-1 flex flex-col gap-2 rounded-xl border bg-card/50 p-4 shadow-sm">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{subLabel}</span>
              {edges.filter(e => e.sourceResourceId === item!.id).length === 0 ? (
                <span className="text-xs text-muted-foreground/60 italic">{noSubText}</span>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {edges.filter(e => e.sourceResourceId === item!.id).map((e, i) => {
                    const n = nodes.find(n => n.id === e.target);
                    let eventName = "";
                    let eventId = e.targetResourceId || "";
                    
                    if (!eventId) {
                      if (e.targetHandle?.startsWith("consumedEvents-in-")) {
                        eventId = e.targetHandle.replace("consumedEvents-in-", "");
                      } else if (e.targetHandle?.startsWith("publishedEvents-in-")) {
                        eventId = e.targetHandle.replace("publishedEvents-in-", "");
                      } else if (e.targetHandle?.match(/^(endpoint|endpoints|routeEndpoints)-in-/)) {
                        const epId = e.targetHandle.replace(/^(endpoint|endpoints|routeEndpoints)-in-/, "");
                        const ep = endpoints.find(ep => ep.id === epId);
                        if (ep) eventName = `${ep.type} ${ep.name}`;
                      }
                    }
                    
                    if (!eventName && eventId) {
                      const ev = events.find(ev => ev.id === eventId);
                      if (ev) {
                        eventName = ev.name;
                      }
                    }
                    
                    const displayName = eventName ? `${n?.data.label || 'Unknown Node'} / ${eventName}` : (n?.data.label || 'Unknown Node');
                    return <span key={i} className="text-xs font-medium" title={displayName}>{displayName}</span>;
                  })}
                </div>
              )}
            </div>
          </div>
          );
        })()}
        
        {resourceArrayName === 'buckets' && (
          <div className="flex flex-col gap-4 mt-2 mb-2">
            <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Storage Type</span>
              <Select value={item.storageType || "s3"} onValueChange={v => handleUpdate(item!.id, { storageType: v })}>
                <SelectTrigger className="w-full bg-background/50 h-9">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="s3">AWS S3</SelectItem>
                  <SelectItem value="blob">Azure Blob Storage</SelectItem>
                  <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                  <SelectItem value="local">Local Disk</SelectItem>
                  <SelectItem value="custom">Custom / Other</SelectItem>
                </SelectContent>
              </Select>
              {item.storageType === 'custom' && (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Describe Custom Storage</span>
                  <LocalInput 
                    className="h-8 bg-background/50 text-xs" 
                    placeholder="e.g. MinIO, Cloudflare R2, On-Prem NAS" 
                    value={item.storageTypeOther || ""}
                    onBlur={e => handleUpdate(item!.id, { storageTypeOther: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data Types</span>
              <span className="text-xs text-muted-foreground mb-1">Categorize the kinds of objects stored</span>
              <div className="grid grid-cols-2 gap-2">
                {["Image", "Video", "Audio", "Document", "JSON", "Archive", "Binary", "Other"].map(type => {
                  const currentList = Array.isArray(item.storedDataTypes) ? item.storedDataTypes : [];
                  const isChecked = currentList.includes(type);
                  return (
                    <label key={type} className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                      <input 
                        type="checkbox"
                        className="rounded border-border bg-background"
                        checked={isChecked}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const updated = checked 
                            ? [...currentList, type]
                            : currentList.filter((t: string) => t !== type);
                          handleUpdate(item!.id, { storedDataTypes: updated });
                        }}
                      />
                      {type}
                    </label>
                  );
                })}
              </div>
              {(Array.isArray(item.storedDataTypes) ? item.storedDataTypes : []).includes("Other") && (
                <div className="mt-2 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Other Data Types</span>
                  <LocalInput 
                    className="h-8 bg-background/50 text-xs" 
                    placeholder="e.g. CAD Files, Parquet Files" 
                    value={item.storedDataTypesOther || ""}
                    onBlur={e => handleUpdate(item!.id, { storedDataTypesOther: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {!(resourceArrayName === 'caches' || item.kind === 'cache') && (
          <SchemaEditor 
            title={resourceArrayName === 'buckets' ? "Metadata" : (isConsumed ? "Expected Payload" : (isPublished ? "Payload Schema" : "Schema"))} 
            schema={item.payloadSchema} 
            onChange={payloadSchema => handleUpdate(item!.id, { payloadSchema })} 
          />
        )}

        {(resourceArrayName === 'caches' || item.kind === 'cache') && (
          <>
            <div className="flex flex-col gap-3 rounded-xl border bg-primary/5 p-4 shadow-sm border-primary/20">
               <div className="flex items-center justify-between">
                 <span className="text-xs font-bold text-primary uppercase tracking-wider">AI fill
                  <Badge className="ml-2">Beta</Badge>
                 </span>
               </div>
               <div className="flex items-center gap-2">
                 <LocalInput 
                   className="flex-1 text-xs bg-background/50" 
                   placeholder="e.g. User profile cache with fields username, email." 
                   value={""}
                   onChange={e => handleUpdate(item!.id, { description: e.target.value })}
                 />
                 <Button 
                   size="sm" 
                   className="h-8 text-xs shrink-0" 
                   onClick={async (e) => {
                     const btn = e.currentTarget;
                     const originalText = btn.innerText;
                     btn.innerText = "Generating...";
                     btn.disabled = true;
                     try {
                       const description = item?.description || item?.name;
                       const res = await fetch("/api/cache-ai", {
                         method: "POST",
                         headers: { "Content-Type": "application/json" },
                         body: JSON.stringify({ description })
                       });
                       if (res.ok) {
                         const config = await res.json();
                         handleUpdate(item!.id, {
                           namespace: config.namespace,
                           keyPattern: config.keyPattern,
                           ttl: config.ttl,
                           cacheStrategy: config.cacheStrategy,
                           sourceOfTruth: config.sourceOfTruth,
                           invalidationRules: config.invalidationRules,
                           serialization: config.serialization,
                           cacheEviction: config.cacheEviction,
                           replication: config.replication,
                           persistence: config.persistence,
                           compression: config.compression,
                           maxObjectSize: config.maxObjectSize,
                           payloadSchema: config.payloadSchema
                         });
                       }
                     } catch(err) { console.error(err); } 
                     finally { btn.innerText = originalText; btn.disabled = false; }
                   }}
                 >
                   Generate
                 </Button>
               </div>
            </div>

            <div className="flex flex-col gap-4 border-t pt-4">
               <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Identity</span>
               <div className="flex flex-col gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Namespace</span>
                 <LocalInput className="text-xs font-mono" placeholder="e.g. user:profile" value={item.namespace || item.keyPrefix || ""} onBlur={e => handleUpdate(item!.id, { namespace: e.target.value, keyPrefix: e.target.value })} />
               </div>
               <div className="flex flex-col gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Key Pattern</span>
                 <LocalInput className="text-xs font-mono" placeholder="e.g. user:{id}" value={item.keyPattern || ""} onBlur={e => handleUpdate(item!.id, { keyPattern: e.target.value })} />
               </div>
            </div>

            <div className="flex flex-col gap-4 border-t pt-4">
               <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Data</span>
               <SchemaEditor 
                 title="Cached Object Schema" 
                 schema={item.payloadSchema} 
                 onChange={payloadSchema => handleUpdate(item!.id, { payloadSchema })} 
               />
               <div className="flex flex-col gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Source of Truth</span>
                 <Combobox 
                   value={item.sourceOfTruth || ""} 
                   onValueChange={(val) => { if (val) handleUpdate(item!.id, { sourceOfTruth: val }); }}
                 >
                   <ComboboxInput 
                     placeholder="e.g. Postgres.users" 
                     className="text-xs w-full"
                     onBlur={e => handleUpdate(item!.id, { sourceOfTruth: e.target.value })} 
                   />
                   <ComboboxContent>
                     <ComboboxList>
                       <ComboboxEmpty className={"bg-sidebar"}>No tables found on canvas.</ComboboxEmpty>
                       {nodes
                         .filter(n => n.type === 'entity' || n.type === 'db_ref')
                         .map(n => {
                           const label = n.data?.label || 'Unnamed Table';
                           return (
                             <ComboboxItem key={n.id} value={label}>
                               {label}
                             </ComboboxItem>
                           );
                         })
                       }
                     </ComboboxList>
                   </ComboboxContent>
                 </Combobox>
               </div>
               <div className="flex items-center justify-between gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Serialization</span>
                 <Select value={item.serialization || "JSON"} onValueChange={v => handleUpdate(item!.id, { serialization: v })}>
                   <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="JSON" className="text-xs">JSON</SelectItem>
                     <SelectItem value="MessagePack" className="text-xs">MessagePack</SelectItem>
                     <SelectItem value="ProtoBuf" className="text-xs">ProtoBuf</SelectItem>
                     <SelectItem value="String" className="text-xs">String</SelectItem>
                     <SelectItem value="Binary" className="text-xs">Binary</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
            </div>

            <div className="flex flex-col gap-4 border-t pt-4">
               <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Behavior</span>
               <div className="flex items-center justify-between gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Cache Strategy</span>
                 <Select value={item.cacheStrategy || "Cache Aside"} onValueChange={v => handleUpdate(item!.id, { cacheStrategy: v })}>
                   <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="Cache Aside" className="text-xs">Cache Aside</SelectItem>
                     <SelectItem value="Read Through" className="text-xs">Read Through</SelectItem>
                     <SelectItem value="Write Through" className="text-xs">Write Through</SelectItem>
                     <SelectItem value="Write Behind" className="text-xs">Write Behind</SelectItem>
                     <SelectItem value="Refresh Ahead" className="text-xs">Refresh Ahead</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               <div className="flex items-center justify-between gap-2">
                 <span className="text-xs font-bold text-muted-foreground">TTL (Time to Live)</span>
                 <LocalInput className="w-24 text-xs text-right" placeholder="e.g. 3600s" value={item.ttl || ""} onBlur={e => handleUpdate(item!.id, { ttl: e.target.value })} />
               </div>
               <div className="flex flex-col gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Invalidation Rules</span>
                 <LocalInput className="text-xs" placeholder="e.g. On profile update" value={item.invalidationRules || ""} onBlur={e => handleUpdate(item!.id, { invalidationRules: e.target.value })} />
               </div>
            </div>

            <div className="flex flex-col gap-4 border-t pt-4">
               <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Infrastructure</span>
               <div className="flex items-center justify-between gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Eviction Policy</span>
                 <Select value={item.cacheEviction || "volatile-lru"} onValueChange={v => handleUpdate(item!.id, { cacheEviction: v })}>
                   <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="volatile-lru" className="text-xs">LRU (with TTL)</SelectItem>
                     <SelectItem value="allkeys-lru" className="text-xs">LRU (All Keys)</SelectItem>
                     <SelectItem value="volatile-lfu" className="text-xs">LFU (with TTL)</SelectItem>
                     <SelectItem value="allkeys-lfu" className="text-xs">LFU (All Keys)</SelectItem>
                     <SelectItem value="noeviction" className="text-xs">No Eviction</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               <div className="flex items-center justify-between gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Persistence</span>
                 <Select value={item.persistence || "None"} onValueChange={v => handleUpdate(item!.id, { persistence: v })}>
                   <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="None" className="text-xs">None</SelectItem>
                     <SelectItem value="RDB" className="text-xs">RDB</SelectItem>
                     <SelectItem value="AOF" className="text-xs">AOF</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               <div className="flex items-center justify-between gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Replication</span>
                 <Select value={item.replication || "Standalone"} onValueChange={v => handleUpdate(item!.id, { replication: v })}>
                   <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="Standalone" className="text-xs">Standalone</SelectItem>
                     <SelectItem value="Primary/Replica" className="text-xs">Primary/Replica</SelectItem>
                     <SelectItem value="Redis Cluster" className="text-xs">Redis Cluster</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
               <div className="flex items-center justify-between gap-2">
                 <span className="text-xs font-bold text-muted-foreground">Compression</span>
                 <Select value={item.compression || "None"} onValueChange={v => handleUpdate(item!.id, { compression: v })}>
                   <SelectTrigger className="w-[180px] text-xs"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="None" className="text-xs">None</SelectItem>
                     <SelectItem value="gzip" className="text-xs">gzip</SelectItem>
                     <SelectItem value="brotli" className="text-xs">brotli</SelectItem>
                     <SelectItem value="lz4" className="text-xs">lz4</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
            </div>
          </>
        )}

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
                value={item.deadLetterQueue || ""}
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

        {isPublished && (
          <div className="flex flex-col gap-4 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">Version</span>
              <LocalInput 
                className="w-24 text-xs text-right" 
                placeholder="v1" 
                value={item.version || "v1"}
                onBlur={e => handleUpdate(item!.id, { version: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">Category</span>
              <Select value={item.category || "DOMAIN"} onValueChange={v => handleUpdate(item!.id, { category: v })}>
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
              <Select value={item.delivery || "AT_LEAST_ONCE"} onValueChange={v => handleUpdate(item!.id, { delivery: v })}>
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
