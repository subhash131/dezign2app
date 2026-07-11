"use client";

import React, { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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
import { Button } from "@workspace/ui/components/button";
import { PlusSquare, FolderPlus, LayoutGrid, User, Server, Globe, Container, Database, GitBranch, Radio, Waves } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendCanvasAdapter } from "@/lib/canvas-adapters/backendAdapter";
import { BackendCanvasView, BackendNode, BackendEdge, BackendNodeType } from "@/types/canvas";
import { nodeTypes } from "./backend-nodes/Nodes";
import { ForeignKeyEdge } from "./backend-nodes/ForeignKeyEdge";
import { HTTPConnectionEdge, MessagingEdge } from "./backend-nodes/CustomEdges";
import { isValidConnection } from "@workspace/backend/canvas/index";
import ELK from "elkjs/lib/elk.bundled.js";
import { Connection } from "@xyflow/react";

const edgeTypes = {
  "foreign-key": ForeignKeyEdge,
  "connection": HTTPConnectionEdge,
  "message": MessagingEdge,
};


const elk = new ELK();

const getLayoutedElements = async (nodes: BackendNode[], edges: BackendEdge[]) => {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      "elk.spacing.nodeNode": "80",
    },
    children: nodes.map((node) => ({
      ...node,
      width: node.type === "entity" ? 200 : 150,
      height: 60,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layoutedGraph = await elk.layout(graph);

  return {
    nodes: nodes.map((node) => {
      const layoutedNode = layoutedGraph.children?.find((n) => n.id === node.id);
      return {
        ...node,
        position: {
          x: layoutedNode?.x ?? node.position.x,
          y: layoutedNode?.y ?? node.position.y,
        },
      };
    }),
    edges,
  };
};

interface BackendCanvasProps {
  projectId: string;
  view: BackendCanvasView;
}

function Flow({ projectId, view }: BackendCanvasProps) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodesAndEdges,
    pendingNodeUpserts,
    pendingNodeRemovals,
    pendingEdgeUpserts,
    pendingEdgeRemovals,
    clearPending,
  } = useBackendCanvasStore();

  const addTableNode = useBackendCanvasStore(s => s.addTableNode);
  const addNode = useBackendCanvasStore(s => s.addNode);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const removals = changes.filter(c => c.type === "remove");
    const otherChanges = changes.filter(c => c.type !== "remove");
    
    if (removals.length > 0) {
      const store = useBackendCanvasStore.getState();
      const entitiesToConfirm: BackendNode[] = [];
      const safeToRemove: NodeChange[] = [];
      
      removals.forEach(r => {
        const node = store.nodes.find(n => n.id === r.id);
        if (node && node.type === "entity") {
          const cols = node.data.columns || [];
          const idxs = node.data.indexes || [];
          const isEmpty = cols.length === 0 && idxs.length === 0;
          const isInitial = cols.length === 1 && cols[0]?.name === "_id" && idxs.length === 0;
          
          if (!isEmpty && !isInitial) {
            entitiesToConfirm.push(node);
          } else {
            safeToRemove.push(r);
          }
        } else if (node && node.type === "group") {
          const hasChildren = store.nodes.some(n => n.parentId === node.id);
          if (hasChildren || node.data.label) {
            entitiesToConfirm.push(node);
          } else {
            safeToRemove.push(r);
          }
        } else if (node) {
          safeToRemove.push(r);
        }
      });
      
      if (entitiesToConfirm.length > 0) {
        store.setNodesPendingDeletion(entitiesToConfirm);
        if (otherChanges.length > 0 || safeToRemove.length > 0) {
          onNodesChange([...otherChanges, ...safeToRemove]);
        }
        return;
      }
    }
    
    if (changes.length > 0) {
      onNodesChange(changes);
    }
  }, [onNodesChange]);

  const { fitView, setViewport, screenToFlowPosition } = useReactFlow();

  const getCenterPosition = () => {
    if (typeof window === "undefined") return { x: 100, y: 100 };
    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  };

  const getOffsetPosition = (baseX: number, baseY: number) => {
    let x = baseX;
    let y = baseY;
    const offset = 20;
    
    // Find a position that doesn't exactly overlap with existing nodes
    while (nodes.some(node => Math.abs(node.position.x - x) < 5 && Math.abs(node.position.y - y) < 5)) {
      x += offset;
      y += offset;
    }
    
    return { x, y };
  };

  const handleAddTable = () => {
    const center = getCenterPosition();
    const { x, y } = getOffsetPosition(center.x - 75, center.y - 30);
    addTableNode(undefined, { x, y }); // offset by half the rough width/height of table
  };

  const handleAddGroup = () => {
    const center = getCenterPosition();
    const { x, y } = getOffsetPosition(center.x - 225, center.y - 150);
    addNode({
      id: crypto.randomUUID(),
      type: "group",
      position: { x, y },
      style: { width: 450, height: 300 },
      width: 450,
      height: 300,
      data: { 
        label: ""
      },
    });
  };

  const initialElements = useQuery(api.canvas.getBackendElements, {
    projectId: projectId as Id<"projects">,
  });

  const upsertNode = useMutation(api.canvas.upsertBackendNode);
  const removeNode = useMutation(api.canvas.removeBackendNode);
  const upsertEdge = useMutation(api.canvas.upsertBackendEdge);
  const removeEdge = useMutation(api.canvas.removeBackendEdge);

  const hasHydrated = React.useRef(false);

  // Hydrate from Convex — useQuery is reactive, effect runs when data arrives
  useEffect(() => {
    if (initialElements === undefined || hasHydrated.current) return; // still loading or already loaded
    hasHydrated.current = true;

    const rawNodes: BackendNode[] = (initialElements.nodes ?? []).map((row: any) => {
      let activePosition = row.position;
      if (view === "schema" && row.data?.schemaPosition) {
        activePosition = row.data.schemaPosition;
      } else if (view === "graph" && row.data?.graphPosition) {
        activePosition = row.data.graphPosition;
      }
      return {
        id: row.nodeId,
        type: row.type,
        position: activePosition,
        data: {
          ...row.data,
          graphPosition: row.data?.graphPosition ?? row.position,
          schemaPosition: row.data?.schemaPosition,
        },
        fractionalIndex: row.fractionalIndex,
        parentId: row.data?.parentId,
        style: row.data?.style,
        width: row.data?.width,
        height: row.data?.height,
      };
    });
    
    // Ensure parent nodes appear before child nodes for React Flow
    const nodes: BackendNode[] = [];
    const addedIds = new Set<string>();

    const addNode = (node: BackendNode) => {
      if (addedIds.has(node.id)) return;
      if (node.parentId && !addedIds.has(node.parentId)) {
        const parent = rawNodes.find((n) => n.id === node.parentId);
        if (parent) addNode(parent);
      }
      nodes.push(node);
      addedIds.add(node.id);
    };

    rawNodes.forEach(addNode);

    const edges: BackendEdge[] = (initialElements.edges ?? []).map((row: any) => ({
      id: row.edgeId,
      source: row.source,
      target: row.target,
      type: row.type,
      sourceHandle: row.sourceHandle,
      targetHandle: row.targetHandle,
      data: row.data,
      fractionalIndex: row.fractionalIndex,
    }));
    setNodesAndEdges(nodes, edges);
  }, [initialElements, setNodesAndEdges, view]);

  // Handle view changes: swap active positions for existing nodes
  const prevViewRef = React.useRef(view);
  useEffect(() => {
    if (prevViewRef.current !== view && hasHydrated.current) {
      const store = useBackendCanvasStore.getState();
      const nextNodes = store.nodes.map((n) => {
        let newPos = n.position;
        if (view === "schema") {
          newPos = n.data?.schemaPosition ?? n.data?.graphPosition ?? n.position;
        } else if (view === "graph") {
          newPos = n.data?.graphPosition ?? n.position;
        }
        return { ...n, position: newPos };
      });
      useBackendCanvasStore.setState({ nodes: nextNodes });
    }
    prevViewRef.current = view;
  }, [view]);

  // Restore viewport when view changes or after hydration
  useEffect(() => {
    if (!hasHydrated.current || nodes.length === 0) return;
    
    // Slight delay to ensure React Flow has rendered the nodes
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(`canvas_viewport_${projectId}_${view}`);
        if (saved) {
          setViewport(JSON.parse(saved));
        } else {
          fitView();
        }
      } catch (e) {
        fitView();
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [hasHydrated.current, nodes.length > 0, view, projectId, setViewport, fitView]);

  const handleMoveEnd = useCallback((event: any, viewport: any) => {
    localStorage.setItem(`canvas_viewport_${projectId}_${view}`, JSON.stringify(viewport));
  }, [projectId, view]);

  // Fix stale closure: always reference live store state for the adapter
  useEffect(() => {
    (window as any).backendAdapter = new BackendCanvasAdapter(
      useBackendCanvasStore.getState()
    );
  }, []);

  // Sync pending ops to Convex with a small debounce to batch rapid drag events
  useEffect(() => {
    if (
      pendingNodeUpserts.length === 0 &&
      pendingNodeRemovals.length === 0 &&
      pendingEdgeUpserts.length === 0 &&
      pendingEdgeRemovals.length === 0
    ) {
      return;
    }

    const timer = setTimeout(() => {
      console.log("BackendCanvas sync loop: pendingNodeUpserts", pendingNodeUpserts);

      const pid = projectId as Id<"projects">;
      
      // Capture the exact references being synced so we can clear only them
      const syncingNodes = [...pendingNodeUpserts];
      const syncingNodeRemovals = [...pendingNodeRemovals];
      const syncingEdges = [...pendingEdgeUpserts];
      const syncingEdgeRemovals = [...pendingEdgeRemovals];

      // Deduplicate for actual API calls (take the latest version for each ID)
      const uniqueNodesToSync = Array.from(new Map(syncingNodes.map(n => [n.id, n])).values());
      const uniqueEdgesToSync = Array.from(new Map(syncingEdges.map(e => [e.id, e])).values());
      const uniqueNodeRemovals = Array.from(new Set(syncingNodeRemovals));
      const uniqueEdgeRemovals = Array.from(new Set(syncingEdgeRemovals));

      Promise.all([
        ...uniqueNodesToSync.map((n) => {
          let graphPosition = n.data?.graphPosition ?? n.position;
          let schemaPosition = n.data?.schemaPosition;
          
          if (view === "schema") {
            schemaPosition = n.position;
          } else if (view === "graph") {
            graphPosition = n.position;
          }

          return upsertNode({
            projectId: pid,
            nodeId: n.id,
            type: n.type,
            position: graphPosition,
            data: { 
              ...n.data, 
              graphPosition,
              schemaPosition,
              ...(n.parentId !== undefined && { parentId: n.parentId }), 
              ...(n.style !== undefined && { style: n.style }), 
              ...(n.width !== undefined && { width: n.width }), 
              ...(n.height !== undefined && { height: n.height }) 
            },
            fractionalIndex: n.fractionalIndex,
          });
        }),
        ...uniqueNodeRemovals.map((id) =>
          removeNode({ projectId: pid, nodeId: id })
        ),
        ...uniqueEdgesToSync.map((e) =>
          upsertEdge({
            projectId: pid,
            edgeId: e.id,
            source: e.source,
            target: e.target,
            type: e.type,
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
            data: e.data,
            fractionalIndex: e.fractionalIndex,
          })
        ),
        ...uniqueEdgeRemovals.map((id) =>
          removeEdge({ projectId: pid, edgeId: id })
        ),
      ])
        .then(() => {
          console.log("BackendCanvas sync loop: sync successful");
          clearPending(syncingNodes, syncingNodeRemovals, syncingEdges, syncingEdgeRemovals);
        })
        .catch((e) => {
          console.error("BackendCanvas sync loop: sync failed", e);
        });
    }, 500);

    return () => clearTimeout(timer);
  }, [
    pendingNodeUpserts,
    pendingNodeRemovals,
    pendingEdgeUpserts,
    pendingEdgeRemovals,
    projectId,
    upsertNode,
    removeNode,
    upsertEdge,
    removeEdge,
    clearPending,
  ]);

  const onLayout = useCallback(async () => {
    const layouted = await getLayoutedElements(nodes, edges);
    setNodesAndEdges(layouted.nodes, layouted.edges);
    window.requestAnimationFrame(() => fitView());
  }, [nodes, edges, setNodesAndEdges, fitView]);

  if (view === "sequence") {
    return (
      <div className="w-full h-full flex flex-col items-center p-8 bg-background overflow-auto">
        <h2 className="text-xl font-bold mb-8">Sequence Diagram</h2>
        <div className="text-muted-foreground">
          Sequence rendering coming soon — data model and fractional ordering are ready.
        </div>
      </div>
    );
  }

  if (view === "schema") {
    const schemaNodes = nodes
      .filter((n) => n.type === "entity" || n.type === "group")
      .map((n) => {
        if (n.type === "group") {
          return {
            ...n,
            style: { ...n.style, minWidth: 450, minHeight: 300 },
          };
        }
        return n;
      });
    const schemaEdges = edges.filter((e) => e.type === "foreign-key");
    
    return (
      <div className="w-full h-full bg-muted/20">
        <ReactFlow
          nodes={schemaNodes}
          edges={schemaEdges}
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
          <Panel position="top-right" className="flex gap-2 flex-col">
            <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs" onClick={handleAddTable}>
              <PlusSquare className="w-3.5 h-3.5 mr-2" />
              Table
            </Button>
            <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs" onClick={handleAddGroup}>
              <FolderPlus className="w-3.5 h-3.5 mr-2" />
              Group
            </Button>
            <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs" onClick={() => {
               // runAutoLayout()
            }}>
              <LayoutGrid className="w-3.5 h-3.5 mr-2" />
              Auto-layout
            </Button>
          </Panel>
        </ReactFlow>
      </div>
    );
  }

  // Filter out schema specific things in graph view
  const graphNodes = nodes.filter((n) => n.type !== "group" && n.type !== "entity");
  // If we still want entities in graph view, we can just do n.type !== "group"
  // The spec said: "New 3rd view — 'Schema' tab, dedicated to DB table nodes only, clean slate"
  // This implies graph view probably doesn't need entity nodes, or if it does, it doesn't need groups.
  // I will just filter out "group".
  
  const handleAddGraphNode = (type: "service" | "database" | "queue" | "pubsub" | "eventstream" | "kafka" | "redis-streams" | "sqs" | "redis-pubsub" | "webClient" | "external", label: string) => {
    const center = getCenterPosition();
    const { x, y } = getOffsetPosition(center.x - 100, center.y - 100);
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

  return (
    <div className="w-full h-full bg-muted/20">
      <ReactFlow
        nodes={nodes.filter(n => n.type !== "group")}
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
          <Button variant="outline" size="sm" className="bg-sidebar dark:bg-sidebar shadow-sm text-xs justify-start h-8" onClick={() => handleAddGraphNode('database', 'Table Ref')}>
            <Database className="w-3.5 h-3.5 mr-2" />
            DB Ref
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
    </div>
  );
}

export function BackendCanvas(props: BackendCanvasProps) {
  if (!props.projectId) return null;
  
  const nodesPendingDeletion = useBackendCanvasStore(s => s.nodesPendingDeletion);
  const setNodesPendingDeletion = useBackendCanvasStore(s => s.setNodesPendingDeletion);
  const deleteNode = useBackendCanvasStore(s => s.deleteNode);

  return (
    <ReactFlowProvider>
      <Flow {...props} />
      <AlertDialog open={nodesPendingDeletion.length > 0} onOpenChange={(open) => !open && setNodesPendingDeletion([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the {nodesPendingDeletion.length > 1 ? "selected items" : (nodesPendingDeletion[0]?.type === 'group' ? "group" : "table")} "{nodesPendingDeletion.map(n => n.data.label || 'Untitled').join(", ")}" and all of their contents. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              nodesPendingDeletion.forEach(n => deleteNode(n.id));
              setNodesPendingDeletion([]);
            }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ReactFlowProvider>
  );
}
