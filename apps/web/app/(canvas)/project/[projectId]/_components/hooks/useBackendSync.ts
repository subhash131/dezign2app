import React, { useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id, Doc } from "@workspace/backend/_generated/dataModel";
import { useBackendCanvasStore, parseResourceHandle } from "@/lib/stores/backendCanvasStore";
import { BackendCanvasView, BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";

import { BackendCanvasAdapter } from "@/lib/canvas-adapters/backendAdapter";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { z } from "zod";
import { endpointSchema, publishedEventSchema, consumedEventSchema, identityProviderSchema } from "@workspace/canvas/schemas";

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
    pendingIdentityProviderUpserts,
    pendingIdentityProviderRemovals,
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
  const upsertIdentityProvider = useMutation(api.canvas.upsertBackendIdentityProvider);
  const removeIdentityProvider = useMutation(api.canvas.removeBackendIdentityProvider);

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
        type: row.type as BackendNode["type"],
        position: activePosition,
        data: {
          ...row.data,
          position: activePosition,
        },
        fractionalIndex: row.fractionalIndex,
        parentId: row.data?.parentId,
      } as BackendNode;
    });
    
    const store = useBackendCanvasStore.getState();
    const pendingNodeIds = new Set(store.pendingNodeUpserts.map((n) => n.id));
    const pendingEdgeIds = new Set(store.pendingEdgeUpserts.map((e) => e.id));
    const pendingEventIds = new Set(store.pendingEventUpserts.map((ev) => ev.id));
    const pendingEndpointIds = new Set(store.pendingEndpointUpserts.map((ep) => ep.id));
    const pendingProviderIds = new Set(store.pendingIdentityProviderUpserts.map((p) => p.id));

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
    
    const fullEndpointSchema = endpointSchema.extend({ nodeId: z.string() });
    const fullEventSchema = z.union([
      publishedEventSchema.extend({ nodeId: z.string(), variant: z.literal("publish") }),
      consumedEventSchema.extend({ nodeId: z.string(), variant: z.literal("consume") })
    ]);
    const fullIdentityProviderSchema = identityProviderSchema.extend({ nodeId: z.string() });

    const rawEndpoints = z.array(fullEndpointSchema).parse(initialElements.endpoints || []);
    const endpointsToSet = rawEndpoints.map((ep) => {
      if (!isFirstHydration && pendingEndpointIds.has(ep.id)) {
        const local = store.endpoints.find((e) => e.id === ep.id);
        if (local) return local;
      }
      return ep;
    });

    const rawEvents = z.array(fullEventSchema).parse(initialElements.events || []);
    const eventsToSet = rawEvents.map((ev) => {
      if (!isFirstHydration && pendingEventIds.has(ev.id)) {
        const local = store.events.find((e) => e.id === ev.id);
        if (local) return local;
      }
      return ev;
    });

    const rawProviders = z.array(fullIdentityProviderSchema).parse(initialElements.identityProviders || []);
    const providersToSet = rawProviders.map((p) => {
      if (!isFirstHydration && pendingProviderIds.has(p.id)) {
        const local = store.identityProviders.find((ip) => ip.id === p.id);
        if (local) return local;
      }
      return p;
    });

    setNodesAndEdges(
      nodesToSet,
      edgesToSet,
      endpointsToSet,
      eventsToSet,
      providersToSet
    );
    useSimulationStore.getState().setTestCases((initialElements.testCases || []) as any);
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
      pendingEventRemovals.length === 0 &&
      pendingIdentityProviderUpserts.length === 0 &&
      pendingIdentityProviderRemovals.length === 0
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
      const syncingIdentityProviders = [...pendingIdentityProviderUpserts];
      const syncingIdentityProviderRemovals = [...pendingIdentityProviderRemovals];

      // Deduplicate for actual API calls
      const uniqueNodesToSync = Array.from(new Map(syncingNodes.map(n => [n.id, n])).values());
      const uniqueEdgesToSync = Array.from(new Map(syncingEdges.map(e => [e.id, e])).values());
      const uniqueNodeRemovals = Array.from(new Set(syncingNodeRemovals));
      const uniqueEdgeRemovals = Array.from(new Set(syncingEdgeRemovals));
      const uniqueEndpointsToSync = Array.from(new Map(syncingEndpoints.map(e => [e.id, e])).values());
      const uniqueEventsToSync = Array.from(new Map(syncingEvents.map(e => [e.id, e])).values());
      const uniqueIdentityProvidersToSync = Array.from(new Map(syncingIdentityProviders.map(p => [p.id, p])).values());

      Promise.all([
        ...uniqueNodesToSync.map((n) => {
          let position = n.position;
          
          let cleanStyle: Record<string, string | number | boolean | null> | undefined = undefined;
          if (n.style) {
            const temp: Record<string, string | number | boolean | null> = {};
            for (const [k, v] of Object.entries(n.style)) {
              if (v !== undefined) {
                temp[k] = v;
              }
            }
            cleanStyle = temp;
          }

          return upsertNode({
            projectId: pid,
            nodeId: n.id,
            type: n.type,
            position: position,
            data: { 
              ...n.data, 
              position,
              ...(n.parentId !== undefined && { parentId: n.parentId }), 
              ...(cleanStyle !== undefined && { style: cleanStyle }), 
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
          upsertEndpoint({ projectId: pid, nodeId: e.nodeId, endpointId: e.id, data: endpointSchema.parse(e) })
        ),
        ...syncingEndpointRemovals.map(r => removeEndpoint({ projectId: pid, nodeId: r.nodeId, endpointId: r.endpointId })),
        ...uniqueEventsToSync.map(e => {
          const data = e.variant === "publish" ? publishedEventSchema.parse(e) : consumedEventSchema.parse(e);
          return upsertEvent({ projectId: pid, nodeId: e.nodeId, eventId: e.id, variant: e.variant, data });
        }),
        ...syncingEventRemovals.map(r => removeEvent({ projectId: pid, nodeId: r.nodeId, eventId: r.eventId })),
        ...uniqueIdentityProvidersToSync.map(p => 
          upsertIdentityProvider({ projectId: pid, nodeId: p.nodeId, providerId: p.id, data: identityProviderSchema.parse(p) })
        ),
        ...syncingIdentityProviderRemovals.map(r => removeIdentityProvider({ projectId: pid, nodeId: r.nodeId, providerId: r.providerId })),
      ])
        .then(() => {
          clearPending(
            syncingNodes,
            syncingNodeRemovals,
            syncingEdges,
            syncingEdgeRemovals,
            syncingEndpoints,
            syncingEndpointRemovals,
            syncingEvents,
            syncingEventRemovals,
            syncingIdentityProviders,
            syncingIdentityProviderRemovals
          );
        })
        .catch((err) => console.error("Canvas backend sync failed:", err));
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
