import React, { useState } from "react";
import { NodeProps, Position, Handle } from "@xyflow/react";
import { Globe, Plus, X, Play, Send, Loader2 } from "lucide-react";
import { BackendNode, Endpoint, Parameter } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, generateId, BaseItem } from "./shared";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";

const EVENT_OPTIONS = ["pageLoad", "click", "hover", "drag", "dblclick", "keydown", "keyup", "submit", "other"];

interface TriggerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: Record<string, unknown> & BaseItem;
  targetNode: BackendNode;
  endpoint: Endpoint;
}

const TriggerDialog = ({ isOpen, onClose, event, targetNode, endpoint }: TriggerDialogProps) => {
  const [headers, setHeaders] = useState<Parameter[]>(() => {
    return endpoint.headers?.map((h) => ({ ...h })) || [];
  });
  const [params, setParams] = useState<Parameter[]>(() => {
    return endpoint.params?.map((p) => ({ ...p, value: "" })) || [];
  });
  const [body, setBody] = useState<string>(() => {
    return endpoint.body || "";
  });

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    setHeaders(endpoint.headers?.map((h) => ({ ...h })) || []);
    setParams(endpoint.params?.map((p) => ({ ...p, value: "" })) || []);
    setBody(endpoint.body || "");
    setResponse(null);
  }, [endpoint]);

  const handleSend = () => {
    if (body.trim()) {
      try {
        JSON.parse(body);
      } catch (err: unknown) {
        setResponse({
          status: 400,
          statusText: "Bad Request",
          headers: {
            "content-type": "application/json",
            "x-simulated": "true",
          },
          body: JSON.stringify({
            error: "Invalid JSON in request body",
            message: (err as Error).message,
          }, null, 2)
        });
        return;
      }
    }

    setLoading(true);
    setResponse(null);

    setTimeout(() => {
      setLoading(false);
      
      const queryParams: Record<string, unknown> = {};
      params.forEach(p => {
        if (p.key) {
          queryParams[p.key] = p.value || `[${p.type || "string"}]`;
        }
      });

      const reqHeaders: Record<string, string> = {};
      headers.forEach(h => {
        if (h.key) reqHeaders[h.key.toLowerCase()] = h.value || "";
      });

      let responseBody = "";
      if (endpoint.output?.trim()) {
        try {
          const parsed = JSON.parse(endpoint.output);
          responseBody = JSON.stringify(parsed, null, 2);
        } catch {
          responseBody = JSON.stringify({
            success: true,
            message: "Request processed successfully",
            output: endpoint.output,
            timestamp: new Date().toISOString()
          }, null, 2);
        }
      } else {
        responseBody = JSON.stringify({
          success: true,
          message: `Simulated response for ${endpoint.type || "GET"} ${endpoint.name}`,
          timestamp: new Date().toISOString(),
          received: {
            method: endpoint.type || "GET",
            path: endpoint.name,
            params: queryParams,
            headers: reqHeaders,
            body: body ? JSON.parse(body) : null
          }
        }, null, 2);
      }

      setResponse({
        status: endpoint.type === "POST" ? 201 : 200,
        statusText: endpoint.type === "POST" ? "Created" : "OK",
        headers: {
          "content-type": "application/json",
          "x-simulated": "true",
          "x-powered-by": "Blueprint Simulation Engine"
        },
        body: responseBody
      });
    }, 600);
  };

  const url = endpoint?.name || "/";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto font-sans" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-muted text-muted-foreground border border-border uppercase tracking-wider">
              {(event?.event as string) || event?.name || "event"}
            </span>
            <span>{event?.name && event.name !== (event.event as string) ? event.name : "Trigger Endpoint"}</span>
          </DialogTitle>
          <DialogDescription className="flex flex-col gap-1.5 pt-1 text-xs text-muted-foreground">
            <span>
              Simulate triggering this client event, which will call the connected endpoint on <strong>{targetNode?.data?.label || "Service"}</strong>.
            </span>
            <span className="flex items-center gap-1.5 p-2 bg-secondary/20 rounded-lg border text-xs font-mono select-all text-foreground mt-1">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground border">
                {endpoint?.type || "GET"}
              </span>
              <span className="font-semibold">{url}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Query Parameters Section */}
          {params.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Query / Path Parameters</h4>
              <div className="grid gap-2 border p-2.5 rounded-lg bg-secondary/10">
                {params.map((p, idx) => (
                  <div key={p.id || idx} className="grid grid-cols-3 items-center gap-2">
                    <Label className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                      {p.key}
                      <span className="text-[9px] font-normal opacity-60">({p.type || "string"})</span>
                    </Label>
                    <Input
                      className="col-span-2 h-7 text-xs font-mono bg-background"
                      placeholder={`value (${p.type || "string"})`}
                      value={p.value}
                      onChange={(e) => {
                        const next = [...params];
                        if (next[idx]) next[idx].value = e.target.value;
                        setParams(next);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Headers Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Headers</h4>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => setHeaders([...headers, { id: generateId(), key: "", value: "", name: "Custom Header", type: "string", required: false }])}
              >
                + Add Custom Header
              </Button>
            </div>
            <div className="grid gap-2 border p-2.5 rounded-lg bg-secondary/10">
              {headers.map((h, idx) => (
                <div key={h.id || idx} className="flex items-center gap-2">
                  <Input
                    className="h-7 text-xs font-mono flex-1 bg-background"
                    placeholder="Key"
                    value={h.key}
                    onChange={(e) => {
                      const next = [...headers];
                      if (next[idx]) next[idx].key = e.target.value;
                      setHeaders(next);
                    }}
                  />
                  <Input
                    className="h-7 text-xs font-mono flex-1 bg-background"
                    placeholder="Value"
                    value={h.value}
                    onChange={(e) => {
                      const next = [...headers];
                      if (next[idx]) next[idx].value = e.target.value;
                      setHeaders(next);
                    }}
                  />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setHeaders(headers.filter((_, i) => i !== idx))}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
              {headers.length === 0 && (
                <span className="text-[10px] text-muted-foreground italic text-center py-1">No headers configured</span>
              )}
            </div>
          </div>

          {/* Request Body Section */}
          {(endpoint?.type !== "GET" || body.trim().length > 0) && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Request Body (JSON)</h4>
              <Textarea
                className="min-h-[100px] font-mono text-xs p-2 bg-background border focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="{}"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          )}

          {/* Dialog Footer Actions */}
          <DialogFooter className="mt-2 flex sm:flex-row sm:justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm" className="text-xs">
                Cancel
              </Button>
            </DialogClose>
            <Button 
              size="sm" 
              className="text-xs font-medium" 
              onClick={handleSend}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Send
                  <Send className="mr-0.5 h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </DialogFooter>

          {/* Response Panel */}
          {response && (
            <div className="flex flex-col gap-2 border-t pt-4 mt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Simulated Response</h4>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border bg-muted text-muted-foreground">
                    {response.status as string} {response.statusText as string}
                  </span>
                </div>
              </div>

              {/* Response Headers */}
              <div className="p-2 border rounded-lg bg-secondary/10 flex flex-col gap-1 text-[10px] font-mono text-muted-foreground">
                {Object.entries((response.headers as Record<string, unknown>) || {}).map(([k, v]: [string, unknown]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}:</span>
                    <span className="text-foreground">{String(v)}</span>
                  </div>
                ))}
              </div>

              {/* Response Body */}
              <pre className="p-3 border rounded-lg bg-secondary/30 font-mono text-[11px] overflow-x-auto text-foreground whitespace-pre-wrap">
                {response.body as string}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export interface WebClientEventListProps {
  nodeId: string;
  items?: (Record<string, unknown> & BaseItem)[];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
  onTriggerEvent: (triggerInfo: { event: Record<string, unknown> & BaseItem; targetNode: BackendNode; endpoint: Endpoint }) => void;
}

const WebClientEventList = ({ nodeId, items = [], updateNode, data, onTriggerEvent }: WebClientEventListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEvent, setEditEvent] = useState("");
  const [customEvent, setCustomEvent] = useState("");

  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const getLinkedEndpoint = (eventId: string) => {
    const edge = edges.find((e) => e.source === nodeId && e.sourceHandle === `events-${eventId}`);
    if (!edge || !edge.targetHandle) return null;

    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!targetNode) return null;

    const parts = edge.targetHandle.split("-in-");
    const endpointId = parts[parts.length - 1];
    if (!endpointId) return null;

    // Search ungrouped
    let endpoint = targetNode.data?.endpoints?.find((ep) => ep.id === endpointId);

    // Search grouped
    if (!endpoint && targetNode.data?.routeGroups) {
      for (const group of targetNode.data.routeGroups) {
        endpoint = group.endpoints?.find((ep) => ep.id === endpointId);
        if (endpoint) break;
      }
    }

    if (!endpoint) return null;

    return { targetNode, endpoint };
  };

  const handleAdd = () => {
    const newItem = { id: generateId(), name: "New Action", event: "click" };
    const newItems = [...items, newItem];
    updateNode(nodeId, { data: { ...data, events: newItems } });
    setEditingId(newItem.id);
    setEditName("New Action");
    setEditEvent("click");
    setCustomEvent("");
  };

  const handleUpdate = (id: string, name: string, event: string) => {
    const newItems = items.map((item) => item.id === id ? { ...item, name, event } : item);
    updateNode(nodeId, { data: { ...data, events: newItems } });
  };

  const handleDelete = (id: string) => {
    const newItems = items.filter((item) => item.id !== id);
    updateNode(nodeId, { data: { ...data, events: newItems } });
  };

  const saveEvent = (id: string) => {
     const finalEvent = editEvent === "other" ? customEvent : editEvent;
     const finalName = editName.trim() || "Unnamed Action";
     handleUpdate(id, finalName, finalEvent.trim());
     setEditingId(null);
  };

  if (!items.length && !editingId) {
     return (
       <div className="bg-secondary/20 p-1.5 border-t">
        <Button variant="ghost" size="sm" className="w-full h-6 text-xs text-muted-foreground hover:text-foreground" onClick={handleAdd}>
          <Plus size={12} className="mr-1" /> Add event
        </Button>
      </div>
     )
  }

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        Events
        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all" onClick={handleAdd}>
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((item) => {
          const isEditing = editingId === item.id;
          const link = getLinkedEndpoint(item.id);
          const displayEvent = (item.event as string) || item.name;

          return (
            <div key={item.id} className="flex flex-col px-3 py-1.5 border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag">
              <Handle 
                type="source" 
                position={Position.Right} 
                id={`events-${item.id}`} 
                className="w-2 h-2 -right-1" 
                style={{ top: '50%' }} 
              />
              {isEditing ? (
                 <div className="flex flex-col gap-1.5 w-full" onBlur={(e) => {
                    const related = e.relatedTarget as HTMLElement | null;
                    if (related?.closest('[role="combobox"]')) return;
                    if (related?.closest('[role="listbox"]')) return;
                    if (related?.closest('[data-radix-popper-content-wrapper]')) return;

                    if (!e.currentTarget.contains(related)) {
                       saveEvent(item.id);
                    }
                 }}>
                    <Input 
                       value={editName}
                       onChange={(e) => setEditName(e.target.value)}
                       placeholder="Action name (e.g. sendMessage)"
                       className="h-6 text-xs"
                       autoFocus
                       onKeyDown={(e) => {
                          if (e.key === "Enter") saveEvent(item.id);
                          if (e.key === "Escape") setEditingId(null);
                       }}
                    />
                    <div className="flex items-center gap-1">
                      <Select 
                         value={editEvent} 
                         onValueChange={(v) => setEditEvent(v)}
                      >
                        <SelectTrigger className="h-6 text-xs w-full bg-background focus:ring-1 focus:ring-ring focus:ring-offset-0">
                          <SelectValue placeholder="Event type" />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_OPTIONS.map(opt => (
                             <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {editEvent === "other" && (
                         <Input 
                            value={customEvent}
                            onChange={(e) => setCustomEvent(e.target.value)}
                            placeholder="Custom event"
                            className="h-6 text-xs w-full"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEvent(item.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                         />
                      )}
                    </div>
                 </div>
              ) : (
                <div 
                  className="flex items-center justify-between w-full cursor-pointer gap-2" 
                  onClick={() => { 
                      setEditingId(item.id); 
                      setEditName(item.name || "");
                      const evt = (item.event as string) || item.name;
                      const isStandard = EVENT_OPTIONS.includes(evt);
                      setEditEvent(isStandard ? evt : (evt ? "other" : "click")); 
                      setCustomEvent(isStandard ? "" : evt);
                  }}
                >
                   <div className="flex flex-col gap-0.5 overflow-hidden">
                       <span className="font-medium truncate">{item.name}</span>
                       <span className="text-[9px] text-muted-foreground font-mono truncate">{displayEvent}</span>
                   </div>
                   <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                     {link && (
                       <button
                         type="button"
                         className="flex items-center justify-center p-1 rounded hover:bg-green-500/10 text-green-500 transition-all cursor-pointer"
                         onClick={(e) => {
                           e.stopPropagation();
                           onTriggerEvent({ event: item, targetNode: link.targetNode, endpoint: link.endpoint });
                         }}
                         title={`Trigger simulated request: ${link.endpoint.type || "GET"} ${link.endpoint.name}`}
                       >
                         <Play size={10} className="fill-green-600 text-green-600" />
                       </button>
                     )}
                     <div className="opacity-0 group-hover/row:opacity-100 flex items-center justify-center p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all cursor-pointer" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                        <X size={12} />
                     </div>
                   </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export const WebClientNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [activeTrigger, setActiveTrigger] = useState<{ event: Record<string, unknown> & BaseItem; targetNode: BackendNode; endpoint: Endpoint } | null>(null);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[200px] max-w-[300px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Globe} title="Web Client(page)" selected={selected} />
      
      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      <WebClientEventList 
        nodeId={id} 
        items={data.events} 
        updateNode={updateNode} 
        data={data} 
        onTriggerEvent={(triggerInfo) => setActiveTrigger(triggerInfo)}
      />

      {activeTrigger && (
        <TriggerDialog
          isOpen={!!activeTrigger}
          onClose={() => setActiveTrigger(null)}
          event={activeTrigger.event}
          targetNode={activeTrigger.targetNode}
          endpoint={activeTrigger.endpoint}
        />
      )}
    </div>
  );
};
