import React, { useState, useEffect } from "react";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { generateId, getInitialBody, endpointInputParams } from "../backend-nodes/graph-nodes/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@workspace/ui/components/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useParams } from "next/navigation";
import { Plus, FlaskConical, Play, Send, Loader2, Trash, ChevronRight } from "lucide-react";
import { SimulationTestCase } from "@workspace/canvas";
import { TestCaseEditor } from "./TestCaseEditor";
import { Endpoint, BackendNode, UIEventItem, Parameter, JSONValue } from "@/types/canvas";
import { Id } from "@workspace/backend/_generated/dataModel";
import { JsonPayloadEditor } from "../backend-nodes/graph-nodes/Editors";
import { simulateEndpoint, simulateTestCase, SimulationTraceEntry } from "@/lib/simulation/runtime";

export interface EventTestingConfigProps {
  id: string; // The event ID
  nodeId: string;
  targetNodeId: string;
  endpointId: string;
  initialTab?: "trigger" | "test-cases";
}

export const EventTestingConfig = ({ id, nodeId, targetNodeId, endpointId, initialTab = "trigger" }: EventTestingConfigProps) => {
  const paramsHook = useParams();
  const projectId = paramsHook.projectId as Id<"projects">;
  
  const testCases = useSimulationStore((s) => s.testCases);
  const addTestCase = useSimulationStore((s) => s.addTestCase);
  const updateTestCase = useSimulationStore((s) => s.updateTestCase);
  const deleteTestCase = useSimulationStore((s) => s.deleteTestCase);
  const selectTestCase = useSimulationStore((s) => s.selectTestCase);
  const startSimulation = useSimulationStore((state) => state.start);
  const clearSimulation = useSimulationStore((state) => state.clear);
  const selectedGlobalCaseId = useSimulationStore((state) => state.selectedCaseId) || "none";
  const activeIndex = useSimulationStore((state) => state.activeIndex);

  const upsertBackendTestCase = useMutation(api.canvas.upsertBackendTestCase);
  const removeBackendTestCase = useMutation(api.canvas.removeBackendTestCase);

  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  
  const parentNode = nodes.find((n) => n.id === nodeId);
  const event = parentNode?.data?.events?.find((e: UIEventItem) => e.id === id) as UIEventItem | undefined;
  const targetNode = nodes.find(n => n.id === targetNodeId);
  const endpoint = endpoints.find(e => e.id === endpointId) || targetNode?.data?.endpoints?.find((e: Endpoint) => e.id === endpointId) || (targetNode?.data?.routeGroups?.flatMap((g: any) => g.endpoints || []) as Endpoint[]).find(e => e.id === endpointId);

  const triggerTestCases = event ? testCases.filter(tc => tc.targetEventId === event.id) : [];

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [newTcOpen, setNewTcOpen] = useState(false);
  const [newTcName, setNewTcName] = useState("");
  const didAutoSelect = React.useRef(false);

  const [headers, setHeaders] = useState<Parameter[]>([]);
  const [params, setParams] = useState<Parameter[]>([]);
  const [body, setBody] = useState<JSONValue | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ headers?: Record<string, string>; status?: number; statusText?: string; body?: unknown; trace?: SimulationTraceEntry[] } | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Auto-select the first test case when the panel opens (or when the list loads)
  useEffect(() => {
    // Reset flag whenever we switch to a different event
    didAutoSelect.current = false;
  }, [id]);

  useEffect(() => {
    if (!didAutoSelect.current && triggerTestCases.length > 0 && triggerTestCases[0]) {
      didAutoSelect.current = true;
      selectTestCase(triggerTestCases[0].id);
    }
  }, [triggerTestCases.length, id]);

  useEffect(() => {
    if (!endpoint) return;

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
  }, [endpoint, selectedGlobalCaseId, testCases]);

  const loadCase = (caseId: string) => {
    selectTestCase(caseId === "none" ? undefined : caseId);
    const testCase = testCases.find((item) => item.id === caseId);
    if (!testCase || !endpoint) return;
    setHeaders(endpoint.headers?.map((h) => ({ ...h, key: h.key ?? h.name, value: testCase.request?.headers?.[h.name] ?? h.defaultValue ?? "" })) || []);
    setParams(endpointInputParams(endpoint).map((param) => ({ ...param, value: testCase.request?.params?.[param.key || param.name] ?? param.value ?? "" })));
    setBody(testCase.request?.body === undefined ? getInitialBody(endpoint) : testCase.request.body);
  };

  const handleSend = async () => {
    if (!endpoint || !event || !targetNode) return;
    let parsedBody = body;
    try {
      if (typeof body === 'string' && body.trim().startsWith('{')) {
        parsedBody = JSON.parse(body);
      }
    } catch (e) {
      console.warn("Failed to parse body as JSON", e);
    }
    setLoading(true);
    setResponse(null);

    const queryParams: Record<string, string> = {};
    params.forEach(p => { if (p.key) queryParams[p.key] = p.value || `[${p.type || "string"}]`; });
    const reqHeaders: Record<string, string> = {};
    headers.forEach(h => { if (h.key) reqHeaders[h.key.toLowerCase()] = h.value || ""; });

    const client = nodes.find((node) => node.id === nodeId);
    try {
      const selectedCase = selectedGlobalCaseId !== "none" ? testCases.find(t => t.id === selectedGlobalCaseId) : undefined;
      const result = client
        ? await simulateTestCase({
          client,
          event,
          testCase: {
            id: selectedGlobalCaseId !== "none" ? selectedGlobalCaseId : "scratchpad",
            name: selectedCase?.name || "Test case",
            targetNodeId: client.id,
            request: { headers: reqHeaders, params: queryParams, body: parsedBody },
            mocks: selectedCase?.mocks,
            expectedBody: selectedCase?.expectedBody,
            expectedStatus: selectedCase?.expectedStatus,
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
          sourceNodeId: nodeId,
          sourceEventId: event.id,
        });
      setResponse(result);
      startSimulation(result.trace);
    } catch (e) {
      console.error(e);
      toast.error("Simulation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTestCase = () => {
    if (!event) return;
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
      targetNodeId: nodeId,
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

  const getDownstreamMocks = () => {
    if (!endpoint || !targetNode) return [];
    
    const mockables: { id: string, label: string, type: string, description: string, isInitial?: boolean }[] = [];
    
    mockables.push({
      id: endpoint.id,
      label: `${targetNode.data?.label || 'Service'}: ${endpoint.type || 'GET'} ${endpoint.name}`,
      type: "endpoint",
      description: "Target Endpoint",
      isInitial: true
    });

    const visitedEndpoints = new Set<string>();
    
    let currentEndpoint: Endpoint | undefined = endpoint;
    let currentService: BackendNode | undefined = targetNode;

    while (currentEndpoint && currentService && !visitedEndpoints.has(currentEndpoint.id)) {
      visitedEndpoints.add(currentEndpoint.id);
      
      const outgoingEdges = edges.filter(e => 
         e.source === currentService!.id && 
         (e.sourceHandle === `endpoint-out-${currentEndpoint!.id}` || e.sourceHandle === `endpoints-out-${currentEndpoint!.id}`)
      );

      for (const edge of outgoingEdges) {
         if (!edge.targetHandle?.startsWith("endpoint-in-") && edge.targetHandle !== "database-target") {
             const extNode = nodes.find(n => n.id === edge.target);
             if (extNode && extNode.type === "external") {
                 if (!mockables.find(m => m.id === extNode.id)) {
                     const apiName = extNode.data?.label || "External API";
                     mockables.push({
                       id: extNode.id,
                       label: `External / ${apiName}`,
                       type: extNode.type,
                       description: "External API"
                     });
                 }
             }
         }
      }
      
      const nextEdge = outgoingEdges.find(e => e.targetHandle?.startsWith("endpoint-in-"));
      if (nextEdge) {
         const nextEndpointId = nextEdge.targetHandle?.split("-in-").pop();
         const nextService = nodes.find(n => n.id === nextEdge.target);
         if (nextService && nextEndpointId) {
             let nextEndpoint: Endpoint | undefined = endpoints.find(ep => ep.nodeId === nextService.id && ep.id === nextEndpointId);
             if (!nextEndpoint) nextEndpoint = nextService.data?.endpoints?.find((ep: Endpoint) => ep.id === nextEndpointId);
             if (!nextEndpoint && nextService.data?.routeGroups) {
                for (const group of nextService.data.routeGroups) {
                  nextEndpoint = group.endpoints?.find((ep: Endpoint) => ep.id === nextEndpointId);
                  if (nextEndpoint) break;
                }
             }
             
             if (nextEndpoint) {
                 if (!mockables.find(m => m.id === nextEndpoint!.id)) {
                    mockables.push({
                      id: nextEndpoint.id,
                      label: `${nextService.data?.label || 'Service'} / ${nextEndpoint.type || 'GET'} ${nextEndpoint.name}`,
                      type: "endpoint",
                      description: "Service Endpoint"
                    });
                 }
                 currentEndpoint = nextEndpoint;
                 currentService = nextService;
             } else {
                 currentEndpoint = undefined;
             }
         } else {
             currentEndpoint = undefined;
         }
      } else {
         currentEndpoint = undefined;
      }
    }
    return mockables;
  };
  
  const mockables = getDownstreamMocks();

  const handleCreateNew = (caseName: string) => {
    if (!endpoint || !event || !caseName.trim()) return;

    const newCase: SimulationTestCase = {
      id: generateId(),
      name: caseName,
      targetNodeId: nodeId,
      targetEventId: event.id,
      request: { headers: {}, params: {}, body: getInitialBody(endpoint) },
      // Pre-populate expected output from the endpoint's configured simulation output on the graph node
      expectedStatus: (endpoint.simulationOutput as any)?.status ?? 200,
      expectedBody: endpoint.simulationOutput !== undefined
        ? (endpoint.simulationOutput as JSONValue)
        : endpoint.responseBody?.rawJson
          ? (() => { try { return JSON.parse(endpoint.responseBody.rawJson) as JSONValue; } catch { return undefined; } })()
          : undefined,
      mocks: {}
    };
    
    addTestCase(newCase);
    if (projectId) {
      upsertBackendTestCase({ projectId, testCaseId: newCase.id, data: newCase });
    }
  };

  const handleUpdateTc = (updated: SimulationTestCase) => {
    updateTestCase(updated.id, { request: updated.request, expectedStatus: updated.expectedStatus, expectedBody: updated.expectedBody, mocks: updated.mocks });
    if (projectId) {
      upsertBackendTestCase({ projectId, testCaseId: updated.id, data: updated });
    }
  };

  const handleDeleteTc = (tcId: string) => {
    deleteTestCase(tcId);
    if (projectId) {
      removeBackendTestCase({ projectId, testCaseId: tcId });
    }
    toast.success("Test case deleted");
  };

  if (!event || !endpoint) return null;

  const url = endpoint?.name || "/";

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12 font-sans">
      <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-primary/15 text-primary rounded border border-primary/20 shadow-sm uppercase">
             {(event?.event as string) || event?.name || "event"}
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
             {event?.name && event.name !== (event.event as string) ? event.name : "Action Configuration"}
          </span>
        </div>
        <span className="text-sm text-muted-foreground flex items-center gap-1.5 mt-2">
            Targeting 
            <div className="flex items-center gap-1.5 p-1 bg-secondary/30 rounded-md border text-xs font-mono text-foreground">
              <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground border">
                {endpoint?.type || "GET"}
              </span>
              <span className="font-semibold text-muted-foreground">{url}</span>
            </div>
            on <strong>{targetNode?.data?.label || "Service"}</strong>
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="w-full grid grid-cols-2 mb-4">
            <TabsTrigger value="trigger" className="text-sm flex gap-2 data-[state=active]:bg-primary data-[state=active]:text-background! transition-all">
              <Play className="w-4 h-4" />
              Simulate
            </TabsTrigger>
            <TabsTrigger value="test-cases" className="text-sm flex gap-2 data-[state=active]:bg-primary data-[state=active]:text-background! transition-all">
              <FlaskConical className="w-4 h-4" />
              Test Cases
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trigger" className="flex flex-col gap-6 p-1 m-0">
            <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-2">
                <Select value={selectedGlobalCaseId} onValueChange={(value) => value !== "none" && loadCase(value)}>
                  <SelectTrigger className="h-9 flex-1 text-sm bg-background"><SelectValue placeholder="Load a global test case" /></SelectTrigger>
                  <SelectContent>
                    {triggerTestCases.map((testCase) => <SelectItem key={testCase.id} value={testCase.id}>{testCase.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
              {params.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Query / Path Parameters</h4>
                  <div className="grid gap-3 border p-3 rounded-lg bg-background/50">
                    {params.map((p, idx) => (
                      <div key={p.id || idx} className="grid grid-cols-3 items-center gap-2">
                        <Label className="text-xs font-mono text-muted-foreground flex flex-col gap-0.5">
                          <span>{p.key}</span>
                          <span className="text-[9px] font-normal opacity-60">({p.type || "string"})</span>
                        </Label>
                        <Input
                          className="col-span-2 h-8 text-xs font-mono bg-background"
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

              {headers.length > 0 && <div className="flex flex-col gap-2">
                <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Defined Headers</h4>
                <div className="grid gap-3 border p-3 rounded-lg bg-background/50">
                  {headers.map((h, idx) => (
                    <div key={h.id || idx} className="flex items-center gap-3">
                      <span className="h-8 flex items-center w-1/3 text-xs font-mono text-muted-foreground truncate">{h.name || h.key}</span>
                      <Input
                        className="h-8 text-xs font-mono flex-1 bg-background"
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

              {endpoint.requestBody && <div className="pb-2">
                <JsonPayloadEditor
                  key={`mock-body-${selectedGlobalCaseId}-${endpoint.id}`}
                  title="Request Body (JSON)"
                  schema={endpoint.requestBody}
                  value={body}
                  onChange={(val) => setBody(val)}
                />
              </div>}

              <div className="mt-4 flex flex-col gap-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  {/* <Button size="sm" variant="secondary" onClick={handleSaveTestCase} className="text-xs h-8 px-4">
                    {selectedGlobalCaseId !== "none" ? "Update Test Case" : "Save as Test Case"}
                  </Button> */}
                  <Button 
                    size="sm" 
                    className="text-xs font-medium h-8 px-5" 
                    onClick={handleSend}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        Simulate
                        <Send className="ml-2 h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {response && (
              <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm mt-2">
                <div className="flex items-center justify-between border-b pb-3">
                  <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Simulated Response</h4>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded text-[11px] font-bold font-mono border bg-muted text-muted-foreground shadow-sm">
                      {response.status} {response.statusText}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive transition-colors" onClick={() => { setResponse(null); clearSimulation(); }} title="Clear Response">
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {response.trace && response.trace.length > 0 && (
                  <div className="flex flex-col gap-1.5 border rounded-lg p-3 bg-background/50">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Execution Trace</span>
                    {response.trace.slice(0, activeIndex >= 0 ? activeIndex + 1 : response.trace.length).map((entry) => (
                      <div key={entry.id} className="flex flex-col gap-1 text-xs font-mono pb-2 border-b last:border-0 border-border/40 last:pb-0">
                        <div className="flex items-start gap-2">
                          <span className={entry.status === "failed" ? "text-destructive" : "text-green-600"}>{entry.status === "failed" ? "✕" : "✓"}</span>
                          <span className="flex-1 font-semibold text-foreground/80">{entry.label}{entry.detail ? ` — ${entry.detail}` : ""}</span>
                        </div>
                        {(entry.input !== undefined || entry.output !== undefined) && (
                          <div className="pl-5 flex flex-col gap-1.5">
                            {entry.input !== undefined && (
                              <details className="group">
                                <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground list-none flex items-center select-none font-sans">
                                  <ChevronRight className="w-3 h-3 mr-1 group-open:rotate-90 transition-transform" />
                                  Input
                                </summary>
                                <pre className="mt-1.5 p-2 bg-secondary/20 rounded border text-[10px] overflow-x-auto whitespace-pre-wrap max-h-[150px] overflow-y-auto text-foreground/70">
                                  {typeof entry.input === 'string' ? entry.input : JSON.stringify(entry.input, null, 2)}
                                </pre>
                              </details>
                            )}
                            {entry.output !== undefined && (
                              <details className="group">
                                <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground list-none flex items-center select-none font-sans">
                                  <ChevronRight className="w-3 h-3 mr-1 group-open:rotate-90 transition-transform" />
                                  Output
                                </summary>
                                <pre className="mt-1.5 p-2 bg-secondary/20 rounded border text-[10px] overflow-x-auto whitespace-pre-wrap max-h-[150px] overflow-y-auto text-foreground/70">
                                  {typeof entry.output === 'string' ? entry.output : JSON.stringify(entry.output, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {response.headers && Object.keys(response.headers).length > 0 && (
                  <div className="p-3 border rounded-lg bg-background/50 flex flex-col gap-1.5 text-xs font-mono text-muted-foreground">
                    {Object.entries((response.headers as Record<string, string>) || {}).map(([k, v]: [string, string]) => (
                      <div key={k} className="flex gap-4">
                        <span className="w-1/3 truncate">{k}:</span>
                        <span className="text-foreground flex-1 break-all">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <pre className="p-4 border rounded-lg bg-secondary/30 font-mono text-xs overflow-x-auto text-foreground whitespace-pre-wrap">
                  {typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}
                </pre>
              </div>
            )}
          </TabsContent>

          <TabsContent value="test-cases" className="flex flex-col gap-4 p-1 m-0">
            <div className="flex items-center justify-between pb-3 border-b">
              <h4 className="text-sm font-semibold text-foreground">Saved Cases</h4>
              <Dialog open={newTcOpen} onOpenChange={setNewTcOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 text-xs px-3 shadow-sm" onClick={() => setNewTcName(`Test for ${event.name || event.event}`)}>
                    <Plus className="h-4 w-4 mr-1.5" /> New Test Case
                  </Button>
                </DialogTrigger>
                <DialogContent className="font-sans">
                  <DialogHeader>
                    <DialogTitle>Create Test Case</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 flex flex-col gap-3">
                    <Label className="text-sm font-medium text-foreground">Test Case Name</Label>
                    <Input 
                      value={newTcName} 
                      onChange={e => setNewTcName(e.target.value)} 
                      placeholder="Enter test case name"
                      autoFocus
                      className="text-sm h-10 bg-background"
                      onKeyDown={(e) => {
                          if (e.key === "Enter" && newTcName.trim()) {
                            handleCreateNew(newTcName);
                            setNewTcOpen(false);
                          }
                      }}
                    />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">Cancel</Button>
                    </DialogClose>
                    <Button size="sm" onClick={() => { handleCreateNew(newTcName); setNewTcOpen(false); }} disabled={!newTcName.trim()}>Create</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {triggerTestCases.length > 0 ? (
              <Accordion type="multiple" className="w-full flex flex-col gap-3 border-none">
                {triggerTestCases.map(tc => (
                  <AccordionItem key={tc.id} value={tc.id} className="bg-card/50 border rounded-xl overflow-hidden shadow-sm backdrop-blur-sm">
                    <AccordionTrigger className="text-sm font-semibold px-4 py-3 hover:bg-secondary/20 hover:no-underline">
                      <span className="flex items-center gap-2">{tc.name}</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 pt-0">
                      <TestCaseEditor 
                        initialCase={tc}
                        endpoint={endpoint}
                        mockables={mockables}
                        triggerLabel={`${parentNode?.data?.label || "Page"} / ${event.name || event.event || "Event"} Trigger`}
                        onSave={handleUpdateTc}
                        onDelete={() => handleDeleteTc(tc.id)}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <div className="text-sm text-muted-foreground p-8 flex flex-col items-center justify-center text-center border rounded-xl bg-card/30 border-dashed">
                <FlaskConical className="w-8 h-8 text-muted-foreground/30 mb-3" />
                No test cases saved for this event yet.
                <span className="text-xs mt-1">Create one to test edge cases and mocks.</span>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
