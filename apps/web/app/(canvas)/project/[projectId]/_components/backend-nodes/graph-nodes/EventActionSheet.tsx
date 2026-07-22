import React, { useState, useEffect } from "react";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { generateId, getInitialBody, endpointInputParams } from "./shared";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@workspace/ui/components/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger, DialogDescription } from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useParams } from "next/navigation";
import { Plus, FlaskConical, Play, Send, Loader2 } from "lucide-react";
import { SimulationTestCase } from "@workspace/canvas";
import { TestCaseEditor } from "../../config-sidebar/TestCaseEditor";
import { Endpoint, BackendNode, UIEventItem, Parameter, JSONValue } from "@/types/canvas";
import { Id } from "@workspace/backend/_generated/dataModel";
import { JsonPayloadEditor } from "./Editors";
import { simulateEndpoint, simulateTestCase, SimulationTraceEntry } from "@/lib/simulation/runtime";

export interface EventActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  event: UIEventItem;
  nodeId: string;
  targetNode: BackendNode;
  endpoint: Endpoint;
  initialTab?: "trigger" | "test-cases";
}

export const EventActionSheet = ({ isOpen, onClose, event, nodeId, targetNode, endpoint, initialTab = "trigger" }: EventActionSheetProps) => {
  const paramsHook = useParams();
  const projectId = paramsHook.projectId as Id<"projects">;
  
  const testCases = useSimulationStore((s) => s.testCases);
  const addTestCase = useSimulationStore((s) => s.addTestCase);
  const updateTestCase = useSimulationStore((s) => s.updateTestCase);
  const deleteTestCase = useSimulationStore((s) => s.deleteTestCase);
  const selectTestCase = useSimulationStore((s) => s.selectTestCase);
  const startSimulation = useSimulationStore((state) => state.start);
  const selectedGlobalCaseId = useSimulationStore((state) => state.selectedCaseId) || "none";

  const upsertBackendTestCase = useMutation(api.canvas.upsertBackendTestCase);

  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  
  const parentNode = nodes.find((n) => n.id === nodeId);
  const triggerTestCases = testCases.filter(tc => tc.targetEventId === event.id);

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [newTcOpen, setNewTcOpen] = useState(false);
  const [newTcName, setNewTcName] = useState("");

  // Trigger state
  const [headers, setHeaders] = useState<Parameter[]>(() => {
    return endpoint.headers?.map((h) => ({ ...h, key: h.key ?? h.name, value: h.value ?? h.defaultValue ?? "" })) || [];
  });
  const [params, setParams] = useState<Parameter[]>(() => {
    return endpointInputParams(endpoint);
  });
  const [body, setBody] = useState<JSONValue | undefined>(() => getInitialBody(endpoint));
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ headers?: Record<string, string>; status?: number; statusText?: string; body?: unknown; trace?: SimulationTraceEntry[] } | null>(null);

  // Sync tab state when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
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
  }, [endpoint, event, isOpen, selectedGlobalCaseId, testCases]);

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

    onClose();
    const client = nodes.find((node) => node.id === nodeId);
    const result = client
      ? await simulateTestCase({
        client,
        event,
        testCase: {
          id: selectedGlobalCaseId !== "none" ? selectedGlobalCaseId : "scratchpad",
          name: selectedGlobalCaseId !== "none" ? testCases.find(t => t.id === selectedGlobalCaseId)?.name || "Test case" : "Test case",
          targetNodeId: client.id,
          request: { headers: reqHeaders, params: queryParams, body: parsedBody },
          mocks: selectedGlobalCaseId !== "none" ? testCases.find(t => t.id === selectedGlobalCaseId)?.mocks : undefined,
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
    startSimulation(result.trace);
  };

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
    if (!endpoint || !caseName.trim()) return;

    const newCase: SimulationTestCase = {
      id: generateId(),
      name: caseName,
      targetNodeId: nodeId,
      targetEventId: event.id,
      request: { headers: {}, params: {}, body: getInitialBody(endpoint) },
      expectedStatus: undefined,
      expectedBody: undefined,
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
    toast.success("Test case deleted");
  };

  const url = endpoint?.name || "/";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col font-sans" onClick={(e) => e.stopPropagation()}>
        <SheetHeader className="p-4 pb-2 border-b">
          <SheetTitle className="text-sm font-semibold flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-muted text-muted-foreground border border-border uppercase tracking-wider">
                {(event?.event as string) || event?.name || "event"}
              </span>
              <span>{event?.name && event.name !== (event.event as string) ? event.name : "Action Configuration"}</span>
            </div>
            <div className="flex items-center gap-1.5 p-1.5 bg-secondary/20 rounded-lg border text-xs font-mono select-all text-foreground mt-1">
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground border">
                {endpoint?.type || "GET"}
              </span>
              <span className="font-semibold text-muted-foreground">{url}</span>
            </div>
          </SheetTitle>
        </SheetHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-2 border-b">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="trigger" className="text-xs flex gap-1.5">
                <Play className="w-3 h-3" />
                Simulate
              </TabsTrigger>
              <TabsTrigger value="test-cases" className="text-xs flex gap-1.5">
                <FlaskConical className="w-3 h-3" />
                Test Cases
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="trigger" className="flex-1 overflow-y-auto p-4 m-0 flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Select value={selectedGlobalCaseId} onValueChange={(value) => value !== "none" && loadCase(value)}>
                  <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder="Load a global test case" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={"none"}>Load from test cases</SelectItem>
                    {testCases.map((testCase) => <SelectItem key={testCase.id} value={testCase.id}>{testCase.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              
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

              <div className="pb-2">
                <JsonPayloadEditor
                  key={`mock-body-${selectedGlobalCaseId}-${endpoint.id}`}
                  title="Request Body (JSON)"
                  schema={endpoint.requestBody}
                  value={body}
                  onChange={(val) => setBody(val)}
                />
              </div>

              <div className="mt-2 flex flex-col gap-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="secondary" onClick={handleSaveTestCase} className="text-xs h-7">
                    {selectedGlobalCaseId !== "none" ? "Update Test Case" : "Save as Test Case"}
                  </Button>
                  <Button 
                    size="sm" 
                    className="text-xs font-medium h-7" 
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
                        Simulate
                        <Send className="ml-1.5 h-3 w-3" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

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

                  <pre className="p-3 border rounded-lg bg-secondary/30 font-mono text-[11px] overflow-x-auto text-foreground whitespace-pre-wrap">
                    {typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="test-cases" className="flex-1 overflow-y-auto p-4 m-0 flex flex-col gap-4 bg-secondary/5">
            <div className="flex items-center justify-between pb-2 border-b">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Saved Cases</h4>
              {endpoint && (
                <Dialog open={newTcOpen} onOpenChange={setNewTcOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setNewTcName(`Test for ${event.name || event.event}`)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> New
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="font-sans">
                    <DialogHeader>
                      <DialogTitle>Create Test Case</DialogTitle>
                    </DialogHeader>
                    <div className="py-2 flex flex-col gap-2">
                      <Label className="text-xs font-mono text-muted-foreground">Test Case Name</Label>
                      <Input 
                        value={newTcName} 
                        onChange={e => setNewTcName(e.target.value)} 
                        placeholder="Enter test case name"
                        autoFocus
                        className="text-xs h-8 bg-background"
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
              )}
            </div>

            {!endpoint ? (
              <div className="text-xs mt-1 text-amber-500">
                Connect this event to an endpoint to configure test cases.
              </div>
            ) : triggerTestCases.length > 0 ? (
              <Accordion type="multiple" className="w-full flex flex-col gap-2">
                {triggerTestCases.map(tc => (
                  <AccordionItem key={tc.id} value={tc.id} className="bg-background border rounded-lg overflow-hidden">
                    <AccordionTrigger className="text-xs font-semibold px-3 py-2.5 hover:bg-secondary/10 hover:no-underline">
                      <span className="flex items-center gap-1.5">{tc.name}</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0">
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
              <div className="text-xs text-muted-foreground p-4 text-center border rounded-lg border-dashed">
                No test cases saved for this event yet.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
