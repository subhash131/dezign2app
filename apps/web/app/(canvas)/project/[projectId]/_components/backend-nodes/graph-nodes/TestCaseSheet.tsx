import React, { useState } from "react";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { generateId, getInitialBody } from "./shared";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@workspace/ui/components/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useParams } from "next/navigation";
import { Plus, FlaskConical } from "lucide-react";
import { SimulationTestCase } from "@workspace/canvas";
import { TestCaseEditor } from "../../config-sidebar/TestCaseEditor";
import { Endpoint, BackendNode, UIEventItem } from "@/types/canvas";
import { Id } from "@workspace/backend/_generated/dataModel";

export interface TestCaseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  event: UIEventItem;
  nodeId: string;
  targetNode: BackendNode | null;
  endpoint: Endpoint | null;
}

export const TestCaseSheet = ({ isOpen, onClose, event, nodeId, targetNode, endpoint }: TestCaseSheetProps) => {
  const paramsHook = useParams();
  const projectId = paramsHook.projectId as Id<"projects">;
  
  const testCases = useSimulationStore((s) => s.testCases);
  const addTestCase = useSimulationStore((s) => s.addTestCase);
  const updateTestCase = useSimulationStore((s) => s.updateTestCase);
  const deleteTestCase = useSimulationStore((s) => s.deleteTestCase);
  const upsertBackendTestCase = useMutation(api.canvas.upsertBackendTestCase);

  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  
  const parentNode = nodes.find((n) => n.id === nodeId);
  const triggerTestCases = testCases.filter(tc => tc.targetEventId === event.id);

  const [newTcOpen, setNewTcOpen] = useState(false);
  const [newTcName, setNewTcName] = useState("");

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

      // 1. Explicit edges to External nodes from this endpoint
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
      
      // 3. The next endpoint in the chain
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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col font-sans" onClick={(e) => e.stopPropagation()}>
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="text-sm font-semibold flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-muted-foreground" />
            Test Cases for {event.name || event.event}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-secondary/5">
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
        </div>
      </SheetContent>
    </Sheet>
  );
};
