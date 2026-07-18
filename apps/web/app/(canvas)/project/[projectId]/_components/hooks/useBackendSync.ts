import React, { useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id, Doc } from "@workspace/backend/_generated/dataModel";
import { useBackendCanvasStore, parseResourceHandle } from "@/lib/stores/backendCanvasStore";
import { BackendCanvasView, BackendNode, BackendEdge } from "@/types/canvas";
import { migrateNodeDataToV2 } from "@workspace/canvas/migrations";
import { BackendCanvasAdapter } from "@/lib/canvas-adapters/backendAdapter";

export function useBackendSync(projectId: string, view: BackendCanvasView) {
  const {
    nodes,
    setNodesAndEdges,
    pendingNodeUpserts,
    pendingNodeRemovals,
    pendingEdgeUpserts,
    pendingEdgeRemovals,
    pendingEndpointUpserts,
    pendingEndpointRemovals,
    pendingEventUpserts,
    pendingEventRemovals,
    clearPending,
  } = useBackendCanvasStore();

  const initialElements = useQuery(api.canvas.getBackendElements, {
    projectId: projectId as Id<"projects">,
  });

  const upsertNode = useMutation(api.canvas.upsertBackendNode);
  const removeNode = useMutation(api.canvas.removeBackendNode);
  const upsertEdge = useMutation(api.canvas.upsertBackendEdge);
  const removeEdge = useMutation(api.canvas.removeBackendEdge);
  const upsertEndpoint = useMutation(api.canvas.upsertBackendEndpoint);
  const removeEndpoint = useMutation(api.canvas.removeBackendEndpoint);
  const upsertEvent = useMutation(api.canvas.upsertBackendEvent);
  const removeEvent = useMutation(api.canvas.removeBackendEvent);

  const hasHydrated = useRef(false);

  // Hydrate from Convex
  useEffect(() => {
    if (initialElements === undefined) return;
    
    const isFirstHydration = !hasHydrated.current;
    hasHydrated.current = true;

    const rawNodes: BackendNode[] = (initialElements.nodes ?? []).map((row: Doc<"canvas_backend_nodes">) => {
      let activePosition = row.data?.position ?? row.position;
      return {
        id: row.nodeId,
        type: row.type,
        position: activePosition,
        data: {
          ...row.data,
          position: activePosition,
        },
        fractionalIndex: row.fractionalIndex,
        parentId: row.data?.parentId,
      };
    }).map((node) => migrateNodeDataToV2(node as BackendNode));
    
    const store = useBackendCanvasStore.getState();
    const pendingNodeIds = new Set(store.pendingNodeUpserts.map((n) => n.id));
    const pendingEdgeIds = new Set(store.pendingEdgeUpserts.map((e) => e.id));

    // Ensure parent nodes appear before child nodes for React Flow
    const nodesToSet: BackendNode[] = [];
    const addedIds = new Set<string>();

    const addNode = (node: BackendNode) => {
      if (addedIds.has(node.id)) return;
      if (node.parentId && !addedIds.has(node.parentId)) {
        const parent = rawNodes.find((n) => n.id === node.parentId);
        if (parent) addNode(parent);
      }
      
      // Preserve local state for nodes currently being edited/dragged
      if (!isFirstHydration && pendingNodeIds.has(node.id)) {
        const localNode = store.nodes.find((n) => n.id === node.id);
        if (localNode) {
          nodesToSet.push(localNode);
          addedIds.add(node.id);
          return;
        }
      }
      
      nodesToSet.push(node);
      addedIds.add(node.id);
    };

    rawNodes.forEach(addNode);

    const edgesToSet: BackendEdge[] = (initialElements.edges ?? []).map((row: Doc<"canvas_backend_edges">) => {
      if (!isFirstHydration && pendingEdgeIds.has(row.edgeId)) {
        const localEdge = store.edges.find((e) => e.id === row.edgeId);
        if (localEdge) return localEdge;
      }

      const sourceResource = parseResourceHandle(row.sourceHandle);
      const targetResource = parseResourceHandle(row.targetHandle);
      return {
        id: row.edgeId,
        source: row.source,
        target: row.target,
        type: row.type as BackendEdge["type"],
        sourceHandle: row.sourceHandle ?? undefined,
        targetHandle: row.targetHandle ?? undefined,
        sourceResourceId: sourceResource?.resourceId,
        targetResourceId: targetResource?.resourceId,
        resourceType: targetResource?.resourceType ?? sourceResource?.resourceType,
        data: row.data,
        fractionalIndex: row.fractionalIndex,
      };
    });
    
    setNodesAndEdges(nodesToSet, edgesToSet, initialElements.endpoints || [], initialElements.events || []);
  }, [initialElements, setNodesAndEdges, view]);

  // Handle view changes: swap active positions for existing nodes
  const prevViewRef = useRef(view);
  useEffect(() => {
    if (prevViewRef.current !== view && hasHydrated.current) {
      const store = useBackendCanvasStore.getState();
      const nextNodes = store.nodes.map((n) => {
        let newPos = n.data?.position ?? n.position;
        return { ...n, position: newPos };
      });
      useBackendCanvasStore.setState({ nodes: nextNodes });
    }
    prevViewRef.current = view;
  }, [view]);

  // Sync pending ops to Convex with a small debounce
  useEffect(() => {
    if (
      pendingNodeUpserts.length === 0 &&
      pendingNodeRemovals.length === 0 &&
      pendingEdgeUpserts.length === 0 &&
      pendingEdgeRemovals.length === 0 &&
      pendingEndpointUpserts.length === 0 &&
      pendingEndpointRemovals.length === 0 &&
      pendingEventUpserts.length === 0 &&
      pendingEventRemovals.length === 0
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
      const syncingEndpoints = [...pendingEndpointUpserts];
      const syncingEndpointRemovals = [...pendingEndpointRemovals];
      const syncingEvents = [...pendingEventUpserts];
      const syncingEventRemovals = [...pendingEventRemovals];

      // Deduplicate for actual API calls
      const uniqueNodesToSync = Array.from(new Map(syncingNodes.map(n => [n.id, n])).values());
      const uniqueEdgesToSync = Array.from(new Map(syncingEdges.map(e => [e.id, e])).values());
      const uniqueNodeRemovals = Array.from(new Set(syncingNodeRemovals));
      const uniqueEdgeRemovals = Array.from(new Set(syncingEdgeRemovals));
      const uniqueEndpointsToSync = Array.from(new Map(syncingEndpoints.map(e => [e.id, e])).values());
      const uniqueEventsToSync = Array.from(new Map(syncingEvents.map(e => [e.id, e])).values());

      Promise.all([
        ...uniqueNodesToSync.map((n) => {
          let position = n.position;

          return upsertNode({
            projectId: pid,
            nodeId: n.id,
            type: n.type,
            position: position,
            data: { 
              ...n.data, 
              position,
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
        ...uniqueEndpointsToSync.map((e) =>
          upsertEndpoint({ projectId: pid, nodeId: e.nodeId, endpointId: e.id, data: e })
        ),
        ...syncingEndpointRemovals.map((r) =>
          removeEndpoint({ projectId: pid, nodeId: r.nodeId, endpointId: r.endpointId })
        ),
        ...uniqueEventsToSync.map((e) =>
          upsertEvent({ projectId: pid, nodeId: e.nodeId, eventId: e.id, variant: e.variant, data: e })
        ),
        ...syncingEventRemovals.map((r) =>
          removeEvent({ projectId: pid, nodeId: r.nodeId, eventId: r.eventId })
        ),
      ])
        .then(() => {
          console.log("BackendCanvas sync loop: sync successful");
          clearPending(syncingNodes, syncingNodeRemovals, syncingEdges, syncingEdgeRemovals, syncingEndpoints, syncingEndpointRemovals, syncingEvents, syncingEventRemovals);
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
    pendingEndpointUpserts,
    pendingEndpointRemovals,
    pendingEventUpserts,
    pendingEventRemovals,
    projectId,
    upsertNode,
    removeNode,
    upsertEdge,
    removeEdge,
    upsertEndpoint,
    removeEndpoint,
    upsertEvent,
    removeEvent,
    clearPending,
  ]);

  useEffect(() => {
    (window as Window & typeof globalThis & { backendAdapter?: BackendCanvasAdapter }).backendAdapter = new BackendCanvasAdapter(
      useBackendCanvasStore.getState()
    );
  }, []);

  return { hasHydrated: hasHydrated.current, nodes };
}
