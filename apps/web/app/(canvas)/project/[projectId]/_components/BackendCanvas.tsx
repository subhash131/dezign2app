"use client";

import React, { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendCanvasAdapter } from "@/lib/canvas-adapters/backendAdapter";
import { BackendCanvasView, BackendNode, BackendEdge } from "@/types/canvas";
import { nodeTypes } from "./backend-nodes/Nodes";
import ELK from "elkjs/lib/elk.bundled.js";

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

  // Hydrate from Convex — useQuery is reactive, effect runs when data arrives
  useEffect(() => {
    if (initialElements === undefined) return; // still loading — wait

    const nodes: BackendNode[] = (initialElements.nodes ?? []).map((row: any) => ({
      id: row.nodeId,
      type: row.type,
      position: row.position,
      data: row.data,
      fractionalIndex: row.fractionalIndex,
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
  // Run once when initialElements resolves from undefined → data
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialElements]);

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

    const pid = projectId as Id<"projects">;

    Promise.all([
      ...pendingNodeUpserts.map((n) =>
        upsertNode({
          projectId: pid,
          nodeId: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
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
      .then(() => clearPending())
      .catch(console.error);
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

  return (
    <div className="w-full h-full bg-muted/20">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
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
