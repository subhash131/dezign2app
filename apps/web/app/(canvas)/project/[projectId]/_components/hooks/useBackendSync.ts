import React, { useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id, Doc } from "@workspace/backend/_generated/dataModel";
import {
  useBackendCanvasStore,
  parseResourceHandle,
  EndpointWithNode,
  EventWithNode,
  IdentityProviderWithNode,
} from "@/lib/stores/backendCanvasStore";
import { ensureLangGraphDataReachability } from "@workspace/canvas/constants";
import { sanitizeForConvex } from "@/lib/utils/convexSanitizer";
import {
  BackendCanvasView,
  BackendNode,
  BackendEdge,
  SimulationTestCase,
} from "@/types/canvas";

import { BackendCanvasAdapter } from "@/lib/canvas-adapters/backendAdapter";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { z } from "zod";
import {
  endpointSchema,
  publishedEventSchema,
  consumedEventSchema,
  identityProviderSchema,
} from "@workspace/canvas/schemas";

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

  const storeProjectId = useBackendCanvasStore((s) => s.projectId);
  const hasHydrated = useRef(false);
  const needsReset = storeProjectId !== projectId;

  // Reset must happen in a useEffect, NOT in the render body.
  // Calling set() during render triggers "Cannot update a component while
  // rendering a different component" because Zustand's set() schedules a
  // React state update synchronously.
  useEffect(() => {
    if (needsReset) {
      hasHydrated.current = false;
      useBackendCanvasStore.getState().reset(projectId);
      useSimulationStore.setState({ testCases: [], selectedCaseId: undefined });
    }
  }, [needsReset, projectId]);

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
  const upsertIdentityProvider = useMutation(
    api.canvas.upsertBackendIdentityProvider,
  );
  const removeIdentityProvider = useMutation(
    api.canvas.removeBackendIdentityProvider,
  );

  // Hydrate from Convex
  useEffect(() => {
    if (initialElements === undefined) return;

    const isFirstHydration = !hasHydrated.current;
    hasHydrated.current = true;

    const rawNodes: BackendNode[] = (initialElements.nodes ?? []).map(
      (row: Doc<"canvas_backend_nodes">) => {
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
      },
    );

    const store = useBackendCanvasStore.getState();
    const pendingNodeIds = new Set(store.pendingNodeUpserts.map((n) => n.id));
    const pendingNodeRemovalIds = new Set(store.pendingNodeRemovals);

    const pendingEdgeIds = new Set(store.pendingEdgeUpserts.map((e) => e.id));
    const pendingEdgeRemovalIds = new Set(store.pendingEdgeRemovals);

    const pendingEndpointIds = new Set(
      store.pendingEndpointUpserts.map((ep) => ep.id),
    );
    const pendingEndpointRemovalIds = new Set(
      store.pendingEndpointRemovals.map((r) => r.endpointId),
    );

    const pendingEventIds = new Set(
      store.pendingEventUpserts.map((ev) => ev.id),
    );
    const pendingEventRemovalIds = new Set(
      store.pendingEventRemovals.map((r) => r.eventId),
    );

    const pendingProviderIds = new Set(
      store.pendingIdentityProviderUpserts.map((p) => p.id),
    );
    const pendingProviderRemovalIds = new Set(
      store.pendingIdentityProviderRemovals.map((r) => r.providerId),
    );

    // Ensure parent nodes appear before child nodes for React Flow
    const nodesToSet: BackendNode[] = [];
    const addedIds = new Set<string>();

    const addNode = (node: BackendNode) => {
      if (addedIds.has(node.id)) return;
      if (!isFirstHydration && pendingNodeRemovalIds.has(node.id)) return;

      if (node.parentId && !addedIds.has(node.parentId)) {
        const parent =
          rawNodes.find((n) => n.id === node.parentId) ||
          (!isFirstHydration
            ? store.nodes.find((n) => n.id === node.parentId)
            : undefined);
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

    // Also include any locally added nodes not yet returned by Convex
    if (!isFirstHydration) {
      store.nodes.forEach((localNode) => {
        if (
          pendingNodeIds.has(localNode.id) &&
          !addedIds.has(localNode.id) &&
          !pendingNodeRemovalIds.has(localNode.id)
        ) {
          addNode(localNode);
        }
      });
    }

    const edgesToSet: BackendEdge[] = [];
    const addedEdgeIds = new Set<string>();

    (initialElements.edges ?? []).forEach((row: Doc<"canvas_backend_edges">) => {
      if (!isFirstHydration && pendingEdgeRemovalIds.has(row.edgeId)) {
        return;
      }

      if (!isFirstHydration && pendingEdgeIds.has(row.edgeId)) {
        const localEdge = store.edges.find((e) => e.id === row.edgeId);
        if (localEdge) {
          edgesToSet.push(localEdge);
          addedEdgeIds.add(localEdge.id);
          return;
        }
      }

      const sourceResource = parseResourceHandle(row.sourceHandle);
      const targetResource = parseResourceHandle(row.targetHandle);
      const edge: BackendEdge = {
        id: row.edgeId,
        source: row.source,
        target: row.target,
        type: row.type as BackendEdge["type"],
        sourceHandle: row.sourceHandle ?? undefined,
        targetHandle: row.targetHandle ?? undefined,
        sourceResourceId: sourceResource?.resourceId,
        targetResourceId: targetResource?.resourceId,
        resourceType:
          targetResource?.resourceType ?? sourceResource?.resourceType,
        data: row.data,
        fractionalIndex: row.fractionalIndex,
      };
      edgesToSet.push(edge);
      addedEdgeIds.add(edge.id);
    });

    // Also include any locally added edges not yet in Convex
    if (!isFirstHydration) {
      store.edges.forEach((localEdge) => {
        if (
          pendingEdgeIds.has(localEdge.id) &&
          !addedEdgeIds.has(localEdge.id) &&
          !pendingEdgeRemovalIds.has(localEdge.id)
        ) {
          edgesToSet.push(localEdge);
          addedEdgeIds.add(localEdge.id);
        }
      });
    }

    // Only retain edges whose source and target nodes exist
    const nodeMap = new Map(nodesToSet.map((n) => [n.id, n]));
    const validEdges = edgesToSet.filter(
      (e) => nodeMap.has(e.source) && nodeMap.has(e.target),
    );

    // Heal FK edges that were saved without column handles (e.g. created by AI).
    // Without handles, ReactFlow falls back to the first handle it finds on the node
    // which is `database-entity-target` at the top — making edges point to the card head.
    const healedEdges = validEdges.map((edge) => {
      if (
        edge.type !== "foreign-key" ||
        (edge.sourceHandle && edge.targetHandle)
      ) {
        return edge;
      }
      const srcNode = nodeMap.get(edge.source);
      const tgtNode = nodeMap.get(edge.target);
      if (
        srcNode?.type !== "entity" ||
        tgtNode?.type !== "entity" ||
        !srcNode.data?.columns ||
        !tgtNode.data?.columns
      ) {
        return edge;
      }
      const pkIdx = srcNode.data.columns.findIndex((c) => c.isPrimaryKey);
      const fkIdx = tgtNode.data.columns.findIndex(
        (c) =>
          c.isForeignKey && c.references?.table === srcNode.data.label,
      );
      return {
        ...edge,
        sourceHandle: edge.sourceHandle ?? (pkIdx !== -1 ? `source-${pkIdx}` : undefined),
        targetHandle: edge.targetHandle ?? (fkIdx !== -1 ? `target-${fkIdx}` : undefined),
      };
    });

    const fullEndpointSchema = endpointSchema.extend({ nodeId: z.string() });
    const fullEventSchema = z.union([
      publishedEventSchema.extend({
        nodeId: z.string(),
        variant: z.literal("publish"),
      }),
      consumedEventSchema.extend({
        nodeId: z.string(),
        variant: z.literal("consume"),
      }),
    ]);
    const fullIdentityProviderSchema = identityProviderSchema.extend({
      nodeId: z.string(),
    });

    const rawEndpoints = z
      .array(fullEndpointSchema)
      .parse(initialElements.endpoints || []);
    const endpointsToSet: EndpointWithNode[] = [];
    const addedEndpointIds = new Set<string>();

    rawEndpoints.forEach((ep) => {
      if (!isFirstHydration && pendingEndpointRemovalIds.has(ep.id)) {
        return;
      }
      if (!isFirstHydration && pendingEndpointIds.has(ep.id)) {
        const local = store.endpoints.find((e) => e.id === ep.id);
        if (local) {
          endpointsToSet.push(local);
          addedEndpointIds.add(local.id);
          return;
        }
      }
      endpointsToSet.push(ep);
      addedEndpointIds.add(ep.id);
    });

    if (!isFirstHydration) {
      store.endpoints.forEach((local) => {
        if (
          pendingEndpointIds.has(local.id) &&
          !addedEndpointIds.has(local.id) &&
          !pendingEndpointRemovalIds.has(local.id)
        ) {
          endpointsToSet.push(local);
          addedEndpointIds.add(local.id);
        }
      });
    }

    const rawEvents = z
      .array(fullEventSchema)
      .parse(initialElements.events || []);
    const eventsToSet: EventWithNode[] = [];
    const addedEventIds = new Set<string>();

    rawEvents.forEach((ev) => {
      if (!isFirstHydration && pendingEventRemovalIds.has(ev.id)) {
        return;
      }
      if (!isFirstHydration && pendingEventIds.has(ev.id)) {
        const local = store.events.find((e) => e.id === ev.id);
        if (local) {
          eventsToSet.push(local);
          addedEventIds.add(local.id);
          return;
        }
      }
      eventsToSet.push(ev);
      addedEventIds.add(ev.id);
    });

    if (!isFirstHydration) {
      store.events.forEach((local) => {
        if (
          pendingEventIds.has(local.id) &&
          !addedEventIds.has(local.id) &&
          !pendingEventRemovalIds.has(local.id)
        ) {
          eventsToSet.push(local);
          addedEventIds.add(local.id);
        }
      });
    }

    const rawProviders = z
      .array(fullIdentityProviderSchema)
      .parse(initialElements.identityProviders || []);
    const providersToSet: IdentityProviderWithNode[] = [];
    const addedProviderIds = new Set<string>();

    rawProviders.forEach((p) => {
      if (!isFirstHydration && pendingProviderRemovalIds.has(p.id)) {
        return;
      }
      if (!isFirstHydration && pendingProviderIds.has(p.id)) {
        const local = store.identityProviders.find((ip) => ip.id === p.id);
        if (local) {
          providersToSet.push(local);
          addedProviderIds.add(local.id);
          return;
        }
      }
      providersToSet.push(p);
      addedProviderIds.add(p.id);
    });

    if (!isFirstHydration) {
      store.identityProviders.forEach((local) => {
        if (
          pendingProviderIds.has(local.id) &&
          !addedProviderIds.has(local.id) &&
          !pendingProviderRemovalIds.has(local.id)
        ) {
          providersToSet.push(local);
          addedProviderIds.add(local.id);
        }
      });
    }

    setNodesAndEdges(
      nodesToSet,
      healedEdges,
      endpointsToSet,
      eventsToSet,
      providersToSet,
      projectId,
    );
    useSimulationStore
      .getState()
      .setTestCases(initialElements.testCases || []);
  }, [initialElements, setNodesAndEdges, view, projectId]);

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
      const syncingIdentityProviderRemovals = [
        ...pendingIdentityProviderRemovals,
      ];

      const uniqueNodeRemovals = Array.from(
        new Set(syncingNodeRemovals.filter(Boolean)),
      );
      const uniqueEdgeRemovals = Array.from(
        new Set(syncingEdgeRemovals.filter(Boolean)),
      );
      const uniqueNodeRemovalSet = new Set(uniqueNodeRemovals);
      const uniqueEdgeRemovalSet = new Set(uniqueEdgeRemovals);

      const uniqueEndpointRemovalSet = new Set(
        syncingEndpointRemovals.map((r) => r.endpointId),
      );
      const uniqueEventRemovalSet = new Set(
        syncingEventRemovals.map((r) => r.eventId),
      );
      const uniqueProviderRemovalSet = new Set(
        syncingIdentityProviderRemovals.map((r) => r.providerId),
      );

      // Deduplicate for actual API calls (excluding items being deleted)
      const uniqueNodesToSync = Array.from(
        new Map(
          syncingNodes
            .filter(
              (n): n is typeof n =>
                Boolean(n?.id) && !uniqueNodeRemovalSet.has(n.id),
            )
            .map((n) => [n.id, n]),
        ).values(),
      );
      const edgesById = Array.from(
        new Map(
          syncingEdges
            .filter(
              (e): e is typeof e =>
                Boolean(e?.id) && !uniqueEdgeRemovalSet.has(e.id),
            )
            .map((e) => [e.id, e]),
        ).values(),
      );

      const seenEdgeHandleKeys = new Set<string>();
      const uniqueEdgesToSync: typeof syncingEdges = [];
      for (const edge of edgesById) {
        const key = `${edge.source}:${edge.sourceHandle ?? ""}->${edge.target}:${edge.targetHandle ?? ""}`;
        const revKey = `${edge.target}:${edge.targetHandle ?? ""}->${edge.source}:${edge.sourceHandle ?? ""}`;
        if (!seenEdgeHandleKeys.has(key) && !seenEdgeHandleKeys.has(revKey)) {
          seenEdgeHandleKeys.add(key);
          uniqueEdgesToSync.push(edge);
        }
      }

      const uniqueEndpointsToSync = Array.from(
        new Map(
          syncingEndpoints
            .filter(
              (e): e is typeof e =>
                Boolean(e?.id) && !uniqueEndpointRemovalSet.has(e.id),
            )
            .map((e) => [e.id, e]),
        ).values(),
      );
      const uniqueEventsToSync = Array.from(
        new Map(
          syncingEvents
            .filter(
              (e): e is typeof e =>
                Boolean(e?.id) && !uniqueEventRemovalSet.has(e.id),
            )
            .map((e) => [e.id, e]),
        ).values(),
      );
      const uniqueIdentityProvidersToSync = Array.from(
        new Map(
          syncingIdentityProviders
            .filter(
              (p): p is typeof p =>
                Boolean(p?.id) && !uniqueProviderRemovalSet.has(p.id),
            )
            .map((p) => [p.id, p]),
        ).values(),
      );

      Promise.all([
        ...uniqueNodesToSync.map((n) => {
          let position = n.position;

          let cleanStyle:
            | Record<string, string | number | boolean | null>
            | undefined = undefined;
          if (n.style) {
            const temp: Record<string, string | number | boolean | null> = {};
            for (const [k, v] of Object.entries(n.style)) {
              if (v !== undefined) {
                temp[k] = v;
              }
            }
            cleanStyle = temp;
          }

          const rawData = {
            ...n.data,
            position,
            ...(n.parentId !== undefined && { parentId: n.parentId }),
            ...(cleanStyle !== undefined && { style: cleanStyle }),
            ...(n.width !== undefined && { width: n.width }),
            ...(n.height !== undefined && { height: n.height }),
          };

          const baseData =
            n.type === "langgraph"
              ? ensureLangGraphDataReachability(rawData)
              : rawData;

          const finalData = sanitizeForConvex(baseData) as typeof baseData;

          return upsertNode({
            projectId: pid,
            nodeId: n.id,
            type: n.type,
            position: position,
            data: finalData,
            fractionalIndex: n.fractionalIndex,
          }).catch((err) => {
            console.warn(`[useBackendSync] Error upserting node ${n.id}:`, err);
          });
        }),
        ...uniqueNodeRemovals.map((id) =>
          removeNode({ projectId: pid, nodeId: id }),
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
          }).catch((err) => {
            const errMsg = err?.message || String(err);
            const errCode = err?.data?.code;
            if (
              errCode === "DUPLICATE_EDGE" ||
              errMsg.includes("DUPLICATE_EDGE") ||
              errMsg.includes("An edge already exists between these exact handles")
            ) {
              console.warn(
                `[useBackendSync] Edge ${e.id} already exists in database; dropping duplicate.`,
              );
              const currentEdges = useBackendCanvasStore.getState().edges;
              const hasOriginal = currentEdges.some(
                (other) =>
                  other.id !== e.id &&
                  other.source === e.source &&
                  other.target === e.target &&
                  (other.sourceHandle ?? null) === (e.sourceHandle ?? null) &&
                  (other.targetHandle ?? null) === (e.targetHandle ?? null),
              );
              if (hasOriginal) {
                useBackendCanvasStore.setState({
                  edges: currentEdges.filter((item) => item.id !== e.id),
                });
              }
              return;
            }
            throw err;
          }),
        ),
        ...uniqueEdgeRemovals.map((id) =>
          removeEdge({ projectId: pid, edgeId: id }),
        ),
        ...uniqueEndpointsToSync.map((e) =>
          upsertEndpoint({
            projectId: pid,
            nodeId: e.nodeId,
            endpointId: e.id,
            data: endpointSchema.parse(e),
          }),
        ),
        ...syncingEndpointRemovals.map((r) =>
          removeEndpoint({
            projectId: pid,
            nodeId: r.nodeId,
            endpointId: r.endpointId,
          }),
        ),
        ...uniqueEventsToSync.map((e) => {
          const data =
            e.variant === "publish"
              ? publishedEventSchema.parse(e)
              : consumedEventSchema.parse(e);
          return upsertEvent({
            projectId: pid,
            nodeId: e.nodeId,
            eventId: e.id,
            variant: e.variant,
            data,
          });
        }),
        ...syncingEventRemovals.map((r) =>
          removeEvent({ projectId: pid, nodeId: r.nodeId, eventId: r.eventId }),
        ),
        ...uniqueIdentityProvidersToSync.map((p) =>
          upsertIdentityProvider({
            projectId: pid,
            nodeId: p.nodeId,
            providerId: p.id,
            data: identityProviderSchema.parse(p),
          }),
        ),
        ...syncingIdentityProviderRemovals.map((r) =>
          removeIdentityProvider({
            projectId: pid,
            nodeId: r.nodeId,
            providerId: r.providerId,
          }),
        ),
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
            syncingIdentityProviderRemovals,
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
    pendingIdentityProviderUpserts,
    pendingIdentityProviderRemovals,
    projectId,
    upsertNode,
    removeNode,
    upsertEdge,
    removeEdge,
    upsertEndpoint,
    removeEndpoint,
    upsertEvent,
    removeEvent,
    upsertIdentityProvider,
    removeIdentityProvider,
    clearPending,
  ]);

  useEffect(() => {
    (
      window as Window &
        typeof globalThis & { backendAdapter?: BackendCanvasAdapter }
    ).backendAdapter = new BackendCanvasAdapter(
      useBackendCanvasStore.getState(),
    );
  }, []);

  return {
    isLoading: initialElements === undefined,
    hasHydrated: hasHydrated.current,
    nodes,
  };
}
