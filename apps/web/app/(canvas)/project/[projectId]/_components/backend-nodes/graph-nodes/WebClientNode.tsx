import React, { useState } from "react";
import { NodeProps, Position, Handle } from "@xyflow/react";
import { Globe, Plus, X, Play, Send, Loader2 } from "lucide-react";
import { BackendNode, Endpoint, Parameter, UIEventItem, JSONValue } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, generateId } from "./shared";
import { JsonPayloadEditor } from "./Editors";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { toast } from "sonner";
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
import { simulateEndpoint, simulateTestCase, SimulationTraceEntry } from "@/lib/simulation/runtime";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { WEB_CLIENT_EVENTS } from "@workspace/canvas";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useParams } from "next/navigation";

const EVENT_OPTIONS = [...WEB_CLIENT_EVENTS];

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
  if (endpoint.requestBody?.rawJson) return endpoint.requestBody.rawJson;
  const fields = endpoint.requestBody?.fields ?? [];
  if (fields.length === 0) return "";
  const valueFor = (type: string) => type === "number" ? 0 : type === "boolean" ? false : type === "array" ? [] : type === "object" ? {} : "";
  return JSON.stringify(Object.fromEntries(fields.map((field) => [field.name, valueFor(field.type)])), null, 2);
}

function getInitialBody(endpoint: Endpoint): JSONValue | undefined {
  const template = endpointBodyTemplate(endpoint);
  if (!template) return undefined;
  try { return JSON.parse(template) as JSONValue; } catch { return undefined; }
}

interface TriggerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: UIEventItem;
  targetNode: BackendNode;
  endpoint: Endpoint;
  sourceNodeId: string;
  initialCaseId?: string;
}

const TriggerDialog = ({ isOpen, onClose, event, targetNode, endpoint, sourceNodeId, initialCaseId }: TriggerDialogProps) => {
  const paramsHook = useParams();
  const projectId = paramsHook.projectId as Id<"projects">;
  const upsertBackendTestCase = useMutation(api.canvas.upsertBackendTestCase);

  const [headers, setHeaders] = useState<Parameter[]>(() => {
    return endpoint.headers?.map((h) => ({ ...h, key: h.key ?? h.name, value: h.value ?? h.defaultValue ?? "" })) || [];
  });
  const [params, setParams] = useState<Parameter[]>(() => {
    return endpointInputParams(endpoint);
  });
  const [body, setBody] = useState<JSONValue | undefined>(() => getInitialBody(endpoint));
  const bodyFields = endpoint.requestBody?.fields ?? [];

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ headers?: Record<string, string>; status?: number; statusText?: string; body?: unknown; trace?: SimulationTraceEntry[] } | null>(null);
  const nodes = useBackendCanvasStore((state) => state.nodes);
  const edges = useBackendCanvasStore((state) => state.edges);
  const endpoints = useBackendCanvasStore((state) => state.endpoints);
  const startSimulation = useSimulationStore((state) => state.start);

  React.useEffect(() => {
    if (!isOpen) return;

    if (selectedGlobalCaseId !== "none") {
      const testCase = testCases.find(tc => tc.id === selectedGlobalCaseId);
      if (testCase) {
        setHeaders(endpoint.headers?.map((h) => ({ ...h, key: h.key ?? h.name, value: testCase.request?.headers?.[h.name] ?? h.defaultValue ?? "" })) || []);
        setParams(endpointInputParams(endpoint).map((param) => ({ ...param, value: testCase.request?.params?.[param.key || param.name] ?? param.value ?? "" })));
        setBody(testCase.request?.body === undefined ? getInitialBody(endpoint) : testCase.request.body);
        setResponse(null);
        return;
      }
    }

    setHeaders(endpoint.headers?.map((h) => ({ ...h, key: h.key ?? h.name, value: h.value ?? h.defaultValue ?? "" })) || []);
    setParams(endpointInputParams(endpoint));
    setBody(getInitialBody(endpoint));
    setResponse(null);
  }, [endpoint, event, isOpen]);



  const testCases = useSimulationStore((state) => state.testCases);
  const selectedGlobalCaseId = useSimulationStore((state) => state.selectedCaseId) || "none";
  const selectTestCase = useSimulationStore((state) => state.selectTestCase);

  const loadCase = (caseId: string) => {
    selectTestCase(caseId === "none" ? undefined : caseId);
    const testCase = testCases.find((item) => item.id === caseId);
    if (!testCase) return;
    setHeaders(endpoint.headers?.map((h) => ({ ...h, key: h.key ?? h.name, value: testCase.request?.headers?.[h.name] ?? h.defaultValue ?? "" })) || []);
    setParams(endpointInputParams(endpoint).map((param) => ({ ...param, value: testCase.request?.params?.[param.key || param.name] ?? param.value ?? "" })));
    setBody(testCase.request?.body === undefined ? getInitialBody(endpoint) : testCase.request.body);
  };

  const handleSend = async () => {
    const parsedBody = body;

    setLoading(true);
    setResponse(null);

    const queryParams: Record<string, string> = {};
    params.forEach(p => { if (p.key) queryParams[p.key] = p.value || `[${p.type || "string"}]`; });
    const reqHeaders: Record<string, string> = {};
    headers.forEach(h => { if (h.key) reqHeaders[h.key.toLowerCase()] = h.value || ""; });

    // The input dialog is only for composing the request. Once sent, the
    // canvas and terminal become the live simulation surface.
    onClose();
    const client = nodes.find((node) => node.id === sourceNodeId);
    const result = client
      ? await simulateTestCase({
        client,
        event,
        testCase: {
          id: selectedGlobalCaseId !== "none" ? selectedGlobalCaseId : "scratchpad",
          name: selectedGlobalCaseId !== "none" ? testCases.find(t => t.id === selectedGlobalCaseId)?.name || "Test case" : "Test case",
          targetNodeId: client.id,
          request: { headers: reqHeaders, params: queryParams, body: parsedBody },
        },
        nodes,
        edges,
        endpoints,
      })
      : await simulateEndpoint({
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

  const addTestCase = useSimulationStore((state) => state.addTestCase);
  const updateTestCase = useSimulationStore((state) => state.updateTestCase);
  
  const handleSaveTestCase = () => {
    const parsedBody = body;
    const queryParams: Record<string, string> = {};
    params.forEach(p => { if (p.key) queryParams[p.key] = p.value || `[${p.type || "string"}]`; });
    const reqHeaders: Record<string, string> = {};
    headers.forEach(h => { if (h.key) reqHeaders[h.key.toLowerCase()] = h.value || ""; });
    
    if (selectedGlobalCaseId !== "none") {
      const existingTestCase = testCases.find(tc => tc.id === selectedGlobalCaseId);
      if (existingTestCase) {
        const updatedCase = {
          ...existingTestCase,
          request: {
            headers: reqHeaders,
            params: queryParams,
            body: parsedBody
          }
        };
        updateTestCase(updatedCase.id, { request: updatedCase.request });
        if (projectId) {
          upsertBackendTestCase({ projectId, testCaseId: updatedCase.id, data: updatedCase });
        }
        toast.success("Test case updated!");
        return;
      }
    }

    const newCase = {
      id: generateId(),
      name: `Test for ${event.name}`,
      targetNodeId: sourceNodeId,
      targetEventId: event.id,
      request: {
        headers: reqHeaders,
        params: queryParams,
        body: parsedBody
      }
    };
    
    addTestCase(newCase);
    if (projectId) {
      upsertBackendTestCase({ projectId, testCaseId: newCase.id, data: newCase });
    }
    selectTestCase(newCase.id);
    toast.success("Test case saved!");
  };

  const url = endpoint?.name || "/";

  return (
    <>
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
          <div className="flex items-center gap-2">
            <Select value={selectedGlobalCaseId} onValueChange={(value) => value !== "none" && loadCase(value)}>
              <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="Load a global test case" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={"none"}>Load from test cases</SelectItem>
                {testCases.map((testCase) => <SelectItem key={testCase.id} value={testCase.id}>{testCase.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
          <div className="pb-2">
            <JsonPayloadEditor
              key={`mock-body-${selectedGlobalCaseId}-${endpoint.id}`}
              title="Request Body (JSON)"
              schema={endpoint.requestBody}
              value={body}
              onChange={(val) => setBody(val)}
              emptyText="No fields defined in request body schema. Use Raw JSON to mock the payload."
            />
          </div>

          {/* Dialog Footer Actions */}
          <DialogFooter className="mt-2 flex sm:flex-row sm:justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={handleSaveTestCase}>
              {selectedGlobalCaseId !== "none" ? "Update Test Case" : "Save as Test Case"}
            </Button>
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
    </>
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


  const endpoints = useBackendCanvasStore((s) => s.endpoints);

  const getLinkedEndpoint = (eventId: string) => {
    const edge = edges.find((e) => e.source === nodeId && e.sourceHandle === `events-${eventId}`);
    if (!edge || !edge.targetHandle) return null;

    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!targetNode) return null;

    const parts = edge.targetHandle.split("-in-");
    const endpointId = parts[parts.length - 1];
    if (!endpointId) return null;

    // Endpoints are persisted in a separate Convex collection and hydrated
    // into the store, so they may not exist on targetNode.data.
    let endpoint: Endpoint | undefined = endpoints.find((ep) => ep.nodeId === targetNode.id && ep.id === endpointId);

    // Backward compatibility for older node snapshots that embedded endpoints.
    if (!endpoint) endpoint = targetNode.data?.endpoints?.find((ep) => ep.id === endpointId);

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
    const newItem = {
      id: generateId(), name: "New Action", event: "click"
    };
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
                      const evt = item.event || item.name || "";
                      const isStandard = (EVENT_OPTIONS as readonly string[]).includes(evt);
                      setEditEvent((isStandard ? evt : (evt ? "other" : "click")) as any); 
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
  const selectedCaseId = useSimulationStore((state) => state.selectedCaseId);

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
          initialCaseId={selectedCaseId}
        />
      )}
    </div>
  );
};
