import React, { useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Connection,
  useReactFlow,
} from "@xyflow/react";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Globe, Server, Waves, GitBranch, Radio, Database, LayoutGrid, ChevronRight, TerminalSquare, Plus, PenLine, Trash } from "lucide-react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { nodeTypes } from "./backend-nodes/Nodes";
import { ForeignKeyEdge } from "./backend-nodes/ForeignKeyEdge";
import { HTTPConnectionEdge, MessagingEdge } from "./backend-nodes/CustomEdges";
import { isValidConnection } from "@workspace/canvas";
import { BackendNode } from "@/types/canvas";
import { SimulationTerminal } from "./SimulationTerminal";
import { getOffsetPosition, useCanvasHandlers } from "./hooks/useCanvasHandlers";

const edgeTypes = {
  "foreign-key": ForeignKeyEdge,
  "connection": HTTPConnectionEdge,
  "message": MessagingEdge,
};

interface GraphViewProps {
  projectId: string;
}

export function GraphView({ projectId }: GraphViewProps) {
  const {
    nodes,
    edges,
    onEdgesChange,
    onConnect,
    addNode,
  } = useBackendCanvasStore();
  const simulation = useSimulationStore();
  const selectedCaseId = useSimulationStore((state) => state.selectedCaseId);
  const testCases = useSimulationStore((state) => state.testCases);
  const selectTestCase = useSimulationStore((state) => state.selectTestCase);
  const clearSelectedTestCase = useSimulationStore((state) => state.clearSelectedTestCase);
  const addTestCase = useSimulationStore((state) => state.addTestCase);
  const updateTestCase = useSimulationStore((state) => state.updateTestCase);
  const deleteTestCase = useSimulationStore((state) => state.deleteTestCase);
  
  const upsertBackendTestCase = useMutation(api.canvas.upsertBackendTestCase);
  const removeBackendTestCase = useMutation(api.canvas.removeBackendTestCase);

  const [caseNameDialog, setCaseNameDialog] = useState<{ mode: "create" | "rename"; value: string } | null>(null);
  const [deleteCaseOpen, setDeleteCaseOpen] = useState(false);

  const { handleNodesChange, handleMoveEnd } = useCanvasHandlers(projectId, "graph");
  const { screenToFlowPosition } = useReactFlow();

  const getCenterPosition = () => {
    if (typeof window === "undefined") return { x: 100, y: 100 };
    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  };

  const handleAddGraphNode = (type: "service" | "db_ref" | "queue" | "pubsub" | "eventstream" | "kafka" | "redis-streams" | "sqs" | "redis-pubsub" | "redis-cache" | "webClient" | "external", label: string) => {
    const center = getCenterPosition();
    const { x, y } = getOffsetPosition(center.x - 100, center.y - 100, nodes);
    addNode({
      id: crypto.randomUUID(),
      type,
      position: { x, y },
      data: { 
        label,
        events: type === 'webClient' ? [] : undefined,
        inputs: type === 'service' ? [] : undefined,
        logic: type === 'service' ? [] : undefined,
        outputs: type === 'service' ? [] : undefined,
        actions: type === 'external' ? [] : undefined,
        topics: type === 'kafka' ? [] : undefined,
        streams: type === 'redis-streams' ? [] : undefined,
        queues: type === 'sqs' ? [] : undefined,
        channels: type === 'redis-pubsub' ? [] : undefined,
        kafkaBroker: type === 'kafka' ? {} : undefined,
        redisBroker: type === 'redis-streams' ? {} : undefined,
        sqsBroker: type === 'sqs' ? {} : undefined,
      },
    });
  };

  const graphNodes = nodes.filter((n) => n.type !== "group" && n.type !== "entity");
  const visualGraphNodes = graphNodes.map((node) => {
    const hasRun = simulation.status !== "idle";
    let isVisited = simulation.activeNodeIds.includes(node.id);
    let isCurrent = simulation.currentNodeId === node.id;

    if (node.type === "db_ref") {
      const activeEndpointIds = simulation.trace
        .slice(0, simulation.activeIndex + 1)
        .filter((t) => t.kind === "endpoint")
        .map((t) => t.id);

      const connectedToActive = edges.some((edge) => {
        if (edge.target === node.id && simulation.activeNodeIds.includes(edge.source)) {
          if (edge.sourceHandle?.startsWith("endpoints-out-")) {
            const endpointId = edge.sourceHandle.replace("endpoints-out-", "");
            return activeEndpointIds.includes(endpointId);
          }
          return true;
        }
        if (edge.source === node.id && simulation.activeNodeIds.includes(edge.target)) {
          return true;
        }
        return false;
      });
      if (connectedToActive) isVisited = true;

      const currentEndpointIds = simulation.trace[simulation.activeIndex]?.kind === "endpoint"
        ? [simulation.trace[simulation.activeIndex]?.id]
        : [];

      const connectedToCurrent = edges.some((edge) => {
        if (edge.target === node.id && simulation.currentNodeId === edge.source) {
          if (edge.sourceHandle?.startsWith("endpoints-out-")) {
            const endpointId = edge.sourceHandle.replace("endpoints-out-", "");
            return currentEndpointIds.includes(endpointId);
          }
          return true;
        }
        if (edge.source === node.id && simulation.currentNodeId === edge.target) {
          return true;
        }
        return false;
      });
      if (connectedToCurrent) isCurrent = true;
    }

    return {
      ...node,
      style: {
        ...node.style,
        opacity: hasRun && !isVisited ? 0.14 : 1,
        transition: "opacity 180ms ease, filter 180ms ease",
        filter: isCurrent ? "drop-shadow(0 0 8px hsl(var(--primary)))" : undefined,
      },
    };
  });

  const selectedCaseEntry = testCases.find((testCase) => testCase.id === selectedCaseId);

  React.useEffect(() => {
    if (!selectedCaseEntry && testCases[0]) {
      selectTestCase(testCases[0].id);
    }
  }, [testCases.length, selectedCaseId, selectedCaseEntry, selectTestCase]);

  return (
    <div className="w-full h-full bg-muted/20">
      <ReactFlow
        nodes={visualGraphNodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        deleteKeyCode={["Backspace", "Delete"]}
        onConnect={onConnect}
        isValidConnection={(connection: Connection) => {
          const src = nodes.find(n => n.id === connection.source);
          const tgt = nodes.find(n => n.id === connection.target);
          if (!src || !tgt) return false;
          return isValidConnection(src.type, connection.sourceHandle, tgt.type, connection.targetHandle).valid;
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onMoveEnd={handleMoveEnd}
        attributionPosition="bottom-right"
      >
        <Background gap={12} size={1} />
        <Controls />
        <MiniMap />
        <Panel position="top-left">
          <div className="flex items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Test case</span>
            <Select
              value={selectedCaseId || "none"}
              onValueChange={(value) => {
                if (value === "none") return;
                selectTestCase(value);
              }}
            >
              <SelectTrigger className="h-7 w-[190px] text-xs"><SelectValue placeholder="Select test case" /></SelectTrigger>
              <SelectContent>
                {testCases.length === 0 ? (
                  <SelectItem value="none">No saved test cases</SelectItem>
                ) : testCases.map((testCase) => (
                  <SelectItem key={testCase.id} value={testCase.id}>
                    {testCase.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="group flex items-center overflow-hidden transition-all duration-300">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 shrink-0 bg-background text-xs cursor-default">
                <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180" />
              </Button>
              <div className="flex items-center gap-2 max-w-0 opacity-0 overflow-hidden transition-all duration-300 ease-in-out group-hover:max-w-[200px] group-hover:opacity-100 group-hover:ml-2">
                <Button variant="outline" size="sm" className="h-7 px-2 shrink-0 bg-background text-xs" onClick={simulation.toggleTerminal}>
                  <TerminalSquare className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 shrink-0 bg-background text-xs"
                  onClick={() => {
                    const count = testCases.length;
                    setCaseNameDialog({ mode: "create", value: `Test Case ${count + 1}` });
                  }}
                  disabled={!selectedCaseEntry}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 shrink-0 bg-background text-xs"
                  onClick={() => {
                    if (!selectedCaseEntry) return;
                    setCaseNameDialog({ mode: "rename", value: selectedCaseEntry.name });
                  }}
                  disabled={!selectedCaseEntry}
                >
                  <PenLine className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 shrink-0 bg-background text-xs text-destructive"
                  onClick={() => {
                    if (selectedCaseEntry) setDeleteCaseOpen(true);
                  }}
                  disabled={!selectedCaseEntry}
                >
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </Panel>
        <Panel position="bottom-center">
          <SimulationTerminal />
        </Panel>
        <Panel position="top-right" className="flex gap-1.5 flex-col bg-background/95 backdrop-blur border rounded-lg p-2.5 shadow-md max-w-[180px]">
          <div className="text-[9px] uppercase font-extrabold text-muted-foreground/60 px-1 pt-1 pb-1">Computing</div>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('webClient', 'New Client')}>
            <Globe className="w-3.5 h-3.5 mr-2" />
            Client
          </Button>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('service', 'New Service')}>
            <Server className="w-3.5 h-3.5 mr-2" />
            Service
          </Button>
          
          <div className="text-[9px] uppercase font-extrabold text-muted-foreground/60 px-1 pt-2 pb-1 border-t mt-1">Messaging & Streaming</div>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('kafka', 'New Kafka Broker')}>
            <Waves className="w-3.5 h-3.5 mr-2 text-emerald-500" />
            Kafka
          </Button>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('redis-streams', 'New Redis Streams Broker')}>
            <Waves className="w-3.5 h-3.5 mr-2 text-rose-500" />
            Redis Streams
          </Button>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('sqs', 'New Amazon SQS')}>
            <GitBranch className="w-3.5 h-3.5 mr-2 text-orange-500" />
            Amazon SQS
          </Button>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('redis-pubsub', 'New Redis Pub/Sub')}>
            <Radio className="w-3.5 h-3.5 mr-2 text-red-500" />
            Redis Pub/Sub
          </Button>

          <div className="text-[9px] uppercase font-extrabold text-muted-foreground/60 px-1 pt-2 pb-1 border-t mt-1">Storage & External</div>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('db_ref', 'Table Ref')}>
            <Database className="w-3.5 h-3.5 mr-2" />
            DB Ref
          </Button>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('redis-cache', 'New Redis Cache')}>
            <Database className="w-3.5 h-3.5 mr-2 text-red-500" />
            Redis Cache
          </Button>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('external', 'New API')}>
            <Globe className="w-3.5 h-3.5 mr-2" />
            External
          </Button>
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start mt-2" onClick={() => {
             // runAutoLayout()
          }}>
            <LayoutGrid className="w-3.5 h-3.5 mr-2" />
            Auto-layout
          </Button>
        </Panel>
      </ReactFlow>
      <Dialog open={caseNameDialog !== null} onOpenChange={(open) => !open && setCaseNameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{caseNameDialog?.mode === "rename" ? "Rename test case" : "Create test case"}</DialogTitle>
            <DialogDescription>Choose the name shown in the canvas test-case selector.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={caseNameDialog?.value ?? ""}
            onChange={(event) => setCaseNameDialog((current) => current ? { ...current, value: event.target.value } : current)}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.form?.requestSubmit(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCaseNameDialog(null)}>Cancel</Button>
            <Button onClick={() => {
              const name = caseNameDialog?.value.trim();
              if (!name) return;
              const mode = caseNameDialog?.mode;
              if (mode === "create") {
                const nextCase = { id: `case-${Date.now()}`, name, targetNodeId: "", request: { body: null }, enabled: true };
                addTestCase(nextCase);
                selectTestCase(nextCase.id);
                upsertBackendTestCase({ projectId: projectId as Id<"projects">, testCaseId: nextCase.id, data: nextCase });
              } else if (selectedCaseEntry) {
                updateTestCase(selectedCaseId!, { name });
                upsertBackendTestCase({ projectId: projectId as Id<"projects">, testCaseId: selectedCaseId!, data: { ...selectedCaseEntry, name } });
              }
              setCaseNameDialog(null);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteCaseOpen} onOpenChange={setDeleteCaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete test case?</AlertDialogTitle>
            <AlertDialogDescription>This will remove “{selectedCaseEntry?.name}” from the project.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!selectedCaseEntry) return;
              deleteTestCase(selectedCaseId!);
              removeBackendTestCase({ projectId: projectId as Id<"projects">, testCaseId: selectedCaseId! });
              setDeleteCaseOpen(false);
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
