import React, { useState } from "react";
import { NodeProps, Position, Handle } from "@xyflow/react";
import { Globe, Plus, X, Play, Send, Loader2 } from "lucide-react";
import { BackendNode, Endpoint, Parameter, UIEventItem } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, generateId } from "./shared";
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
import { simulateEndpoint, SimulationTraceEntry } from "@/lib/simulation/runtime";
import { useSimulationStore } from "@/lib/stores/simulationStore";

const EVENT_OPTIONS = ["pageLoad", "click", "hover", "drag", "dblclick", "keydown", "keyup", "submit", "other"];

function endpointInputParams(endpoint: Endpoint): Parameter[] {
  if (endpoint.params?.length) return endpoint.params.map((param) => ({ ...param, value: param.value ?? param.defaultValue ?? "" }));
  return [...(endpoint.pathParams ?? []), ...(endpoint.queryParams ?? [])].map((param) => ({
    ...param,
    key: param.name,
    value: param.value ?? param.defaultValue ?? "",
  }));
}

function endpointBodyTemplate(endpoint: Endpoint): string {
  if (endpoint.body) return endpoint.body;
  const fields = endpoint.requestBody?.fields ?? [];
  if (fields.length === 0) return "";
  const valueFor = (type: string) => type === "number" ? 0 : type === "boolean" ? false : type === "array" ? [] : type === "object" ? {} : "";
  return JSON.stringify(Object.fromEntries(fields.map((field) => [field.name, valueFor(field.type)])), null, 2);
}

interface TriggerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: UIEventItem;
  targetNode: BackendNode;
  endpoint: Endpoint;
  sourceNodeId: string;
}

const TriggerDialog = ({ isOpen, onClose, event, targetNode, endpoint, sourceNodeId }: TriggerDialogProps) => {
  const [headers, setHeaders] = useState<Parameter[]>(() => {
    return endpoint.headers?.map((h) => ({ ...h, key: h.key ?? h.name, value: h.value ?? h.defaultValue ?? "" })) || [];
  });
  const [params, setParams] = useState<Parameter[]>(() => {
    return endpointInputParams(endpoint);
  });
  const [body, setBody] = useState<string>(() => {
    return endpointBodyTemplate(endpoint);
  });
  const bodyFields = endpoint.requestBody?.fields ?? [];

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ headers?: Record<string, string>; status?: number; statusText?: string; body?: unknown; trace?: SimulationTraceEntry[] } | null>(null);
  const nodes = useBackendCanvasStore((state) => state.nodes);
  const edges = useBackendCanvasStore((state) => state.edges);
  const startSimulation = useSimulationStore((state) => state.start);

  React.useEffect(() => {
    setHeaders(endpoint.headers?.map((h) => ({ ...h, key: h.key ?? h.name, value: h.value ?? h.defaultValue ?? "" })) || []);
    setParams(endpointInputParams(endpoint));
    setBody(endpointBodyTemplate(endpoint));
    setResponse(null);
  }, [endpoint]);

  const handleSend = async () => {
    let parsedBody: unknown = null;
    if (body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch (err) {
        setResponse({
          status: 400,
          statusText: "Bad Request",
          headers: {
            "content-type": "application/json",
            "x-simulated": "true",
          },
          body: {
            error: "Invalid JSON in request body",
            message: err instanceof Error ? err.message : String(err),
          }
        });
        return;
      }
    }

    setLoading(true);
    setResponse(null);

    const queryParams: Record<string, string> = {};
    params.forEach(p => { if (p.key) queryParams[p.key] = p.value || `[${p.type || "string"}]`; });
    const reqHeaders: Record<string, string> = {};
    headers.forEach(h => { if (h.key) reqHeaders[h.key.toLowerCase()] = h.value || ""; });

    // The input dialog is only for composing the request. Once sent, the
    // canvas and terminal become the live simulation surface.
    onClose();
    const result = await simulateEndpoint({
      service: targetNode,
      endpoint,
      nodes,
      edges,
      request: { method: endpoint.type || "GET", path: endpoint.name || "/", headers: reqHeaders, params: queryParams, body: parsedBody },
      sourceNodeId,
      sourceEventId: event.id,
    });
    startSimulation(result.trace);
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
          {headers.length > 0 && <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Defined Headers</h4>
            <div className="grid gap-2 border p-2.5 rounded-lg bg-secondary/10">
              {headers.map((h, idx) => (
                <div key={h.id || idx} className="flex items-center gap-2">
                  <span className="h-7 flex items-center flex-1 text-xs font-mono text-muted-foreground">{h.name || h.key}</span>
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
                </div>
              ))}
            </div>
          </div>}

          {/* Request Body Section */}
          {bodyFields.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Defined Request Body</h4>
              <div className="grid gap-2 border p-2.5 rounded-lg bg-secondary/10">
                {bodyFields.map((field) => {
                  let parsed: Record<string, unknown> = {};
                  try { parsed = body ? JSON.parse(body) : {}; } catch { /* reset below */ }
                  const currentValue = parsed[field.name];
                  return (
                    <div key={field.id || field.name} className="grid grid-cols-3 items-center gap-2">
                      <Label className="text-xs font-mono text-muted-foreground">
                        {field.name}{field.required ? " *" : ""}
                        <span className="block text-[9px] opacity-60">{field.type}</span>
                      </Label>
                      <Input
                        className="col-span-2 h-7 text-xs font-mono bg-background"
                        placeholder={field.description || field.type}
                        value={typeof currentValue === "object" ? JSON.stringify(currentValue) : String(currentValue ?? "")}
                        onChange={(e) => {
                          let next: Record<string, unknown> = {};
                          try { next = body ? JSON.parse(body) : {}; } catch { next = {}; }
                          const raw = e.target.value;
                          next[field.name] = field.type === "number" ? (raw === "" ? "" : Number(raw)) : field.type === "boolean" ? raw === "true" : (field.type === "object" || field.type === "array" ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw);
                          setBody(JSON.stringify(next));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
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
                    {response.status} {response.statusText}
                  </span>
                </div>
              </div>

              {/* Response Headers */}
              {response.trace && response.trace.length > 0 && (
                <div className="flex flex-col gap-1 border rounded-lg p-2 bg-secondary/10">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Execution Trace</span>
                  {response.trace.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2 text-[10px] font-mono">
                      <span className={entry.status === "failed" ? "text-destructive" : "text-green-600"}>{entry.status === "failed" ? "✕" : "✓"}</span>
                      <span className="flex-1">{entry.label}{entry.detail ? ` — ${entry.detail}` : ""}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-2 border rounded-lg bg-secondary/10 flex flex-col gap-1 text-[10px] font-mono text-muted-foreground">
                {Object.entries((response.headers as Record<string, string>) || {}).map(([k, v]: [string, string]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}:</span>
                    <span className="text-foreground">{String(v)}</span>
                  </div>
                ))}
              </div>

              {/* Response Body */}
              <pre className="p-3 border rounded-lg bg-secondary/30 font-mono text-[11px] overflow-x-auto text-foreground whitespace-pre-wrap">
                {typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}
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
  items?: UIEventItem[];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
  onTriggerEvent: (triggerInfo: { event: UIEventItem; targetNode: BackendNode; endpoint: Endpoint }) => void;
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
  const [activeTrigger, setActiveTrigger] = useState<{ event: UIEventItem; targetNode: BackendNode; endpoint: Endpoint } | null>(null);

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
          sourceNodeId={id}
        />
      )}
    </div>
  );
};
