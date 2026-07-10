"use client";

import React, { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendCanvasAdapter } from "@/lib/canvas-adapters/backendAdapter";
import { BackendCanvasView, BackendNode, BackendEdge } from "@/types/canvas";
import { nodeTypes } from "./backend-nodes/Nodes";
import { ForeignKeyEdge } from "./backend-nodes/ForeignKeyEdge";
import ELK from "elkjs/lib/elk.bundled.js";

const edgeTypes = {
  "foreign-key": ForeignKeyEdge,
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

  const { fitView } = useReactFlow();

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

    const nodes: BackendNode[] = (initialElements.nodes ?? []).map((row: any) => ({
      id: row.nodeId,
      type: row.type,
      position: row.position,
      data: row.data,
      fractionalIndex: row.fractionalIndex,
      parentId: row.data?.parentId,
      style: row.data?.style,
      width: row.data?.width,
      height: row.data?.height,
    }));
    const edges: BackendEdge[] = (initialElements.edges ?? []).map((row: any) => ({
      id: row.edgeId,
      source: row.source,
      target: row.target,
      type: row.type,
      data: row.data,
      fractionalIndex: row.fractionalIndex,
    }));
    setNodesAndEdges(nodes, edges);

    if (nodes.length > 0) {
      setTimeout(() => fitView(), 100);
    }
  }, [initialElements, setNodesAndEdges, fitView]);

  // Fix stale closure: always reference live store state for the adapter
  useEffect(() => {
    (window as any).backendAdapter = new BackendCanvasAdapter(
      useBackendCanvasStore.getState()
    );
  }, []);

  // Sync pending ops to Convex immediately (no debounce needed — per-op)
  useEffect(() => {
    if (
      pendingNodeUpserts.length === 0 &&
      pendingNodeRemovals.length === 0 &&
      pendingEdgeUpserts.length === 0 &&
      pendingEdgeRemovals.length === 0
    ) {
      return;
    }

    console.log("BackendCanvas sync loop: pendingNodeUpserts", pendingNodeUpserts);

    const pid = projectId as Id<"projects">;

    Promise.all([
      ...pendingNodeUpserts.map((n) =>
        upsertNode({
          projectId: pid,
          nodeId: n.id,
          type: n.type,
          position: n.position,
          data: { 
            ...n.data, 
            ...(n.parentId !== undefined && { parentId: n.parentId }), 
            ...(n.style !== undefined && { style: n.style }), 
            ...(n.width !== undefined && { width: n.width }), 
            ...(n.height !== undefined && { height: n.height }) 
          },
          fractionalIndex: n.fractionalIndex,
        })
      ),
      ...pendingNodeRemovals.map((id) =>
        removeNode({ projectId: pid, nodeId: id })
      ),
      ...pendingEdgeUpserts.map((e) =>
        upsertEdge({
          projectId: pid,
          edgeId: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          data: e.data,
          fractionalIndex: e.fractionalIndex,
        })
      ),
      ...pendingEdgeRemovals.map((id) =>
        removeEdge({ projectId: pid, edgeId: id })
      ),
    ])
      .then(() => {
        console.log("BackendCanvas sync loop: sync successful");
        clearPending();
      })
      .catch((e) => {
        console.error("BackendCanvas sync loop: sync failed", e);
      });
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
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={(deleted: Node[]) => {
            const store = useBackendCanvasStore.getState();
            deleted.forEach(d => store.deleteNode(d.id));
          }}
          deleteKeyCode={["Backspace", "Delete"]}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          attributionPosition="bottom-right"
        >
          <Background gap={12} size={1} />
          <Controls />
          <MiniMap />
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
  
  return (
    <div className="w-full h-full bg-muted/20">
      <ReactFlow
        nodes={nodes.filter(n => n.type !== "group")}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={(deleted: Node[]) => {
          const store = useBackendCanvasStore.getState();
          deleted.forEach(d => store.deleteNode(d.id));
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="bottom-right"
      >
        <Background gap={12} size={1} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

export function BackendCanvas(props: BackendCanvasProps) {
  if (!props.projectId) return null;
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
