import { BackendNode, BackendEdge, PageSection } from "@/types/canvas";

/**
 * Self-heals any orphaned edges connected to WebPage or StateStore nodes whose target or
 * source handles no longer exist on the node (such as removed section state variables,
 * deleted state store fields, or deleted action events).
 */
export function healOrphanedWebPageEdges({
  nodes,
  edges,
  pendingEdgeRemovals = [],
  pendingEdgeUpserts = [],
  pendingNodeUpserts = [],
}: {
  nodes: BackendNode[];
  edges: BackendEdge[];
  pendingEdgeRemovals?: string[];
  pendingEdgeUpserts?: BackendEdge[];
  pendingNodeUpserts?: BackendNode[];
}): {
  changed: boolean;
  nodes: BackendNode[];
  edges: BackendEdge[];
  pendingEdgeRemovals: string[];
  pendingEdgeUpserts: BackendEdge[];
  pendingNodeUpserts: BackendNode[];
} {
  let changed = false;
  const nextRemovals = new Set(pendingEdgeRemovals);
  let nextEdges = [...edges];

  const orphanedEdgeIds = new Set<string>();

  for (const edge of nextEdges) {
    if (!edge) continue;

    // Check 0: Missing source or target node entirely
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!sourceNode || !targetNode) {
      orphanedEdgeIds.add(edge.id);
      continue;
    }

    // Check 1: Target handle is section-state-in-* (WebPage)
    if (edge.targetHandle && edge.targetHandle.startsWith("section-state-in-")) {
      if (targetNode.type !== "webPage") {
        orphanedEdgeIds.add(edge.id);
        continue;
      }

      const sections: PageSection[] = targetNode.data?.sections || [];
      const handleExists = sections.some((sec) =>
        (sec.stateObjects || []).some(
          (st) => edge.targetHandle === `section-state-in-${sec.id}-${st.id}`,
        ),
      );

      if (!handleExists) {
        orphanedEdgeIds.add(edge.id);
        continue;
      }
    }

    // Check 2: Target handle is store-field-in-* (StateStore incoming type or action binding)
    if (edge.targetHandle && edge.targetHandle.startsWith("store-field-in-")) {
      if (targetNode.type !== "state_store") {
        orphanedEdgeIds.add(edge.id);
        continue;
      }

      const fieldId = edge.targetHandle.replace("store-field-in-", "");
      const fields: Array<{ id: string }> = targetNode.data?.fields || [];
      const fieldExists = fields.some((f) => f.id === fieldId);

      if (!fieldExists) {
        orphanedEdgeIds.add(edge.id);
        continue;
      }
    }

    // Check 3: Source handle is store-field-out-* (StateStore outgoing state subscription)
    if (edge.sourceHandle && edge.sourceHandle.startsWith("store-field-out-")) {
      if (sourceNode.type !== "state_store") {
        orphanedEdgeIds.add(edge.id);
        continue;
      }

      const fieldId = edge.sourceHandle.replace("store-field-out-", "");
      const fields: Array<{ id: string }> = sourceNode.data?.fields || [];
      const fieldExists = fields.some((f) => f.id === fieldId);

      if (!fieldExists) {
        orphanedEdgeIds.add(edge.id);
        continue;
      }
    }

    // Check 4: Specific manipulator handles on StateStore (setter-*, append-*, pop-*, mutate-*)
    if (
      edge.targetHandle &&
      (edge.targetHandle.startsWith("setter-in-") ||
        edge.targetHandle.startsWith("append-in-") ||
        edge.targetHandle.startsWith("pop-in-") ||
        edge.targetHandle.startsWith("mutate-in-"))
    ) {
      if (targetNode.type === "state_store") {
        const fieldOrActId = edge.targetHandle.replace(
          /^(?:setter-in-left-|setter-in-|append-in-left-|append-in-|pop-in-left-|pop-in-|mutate-in-left-|mutate-in-)/,
          "",
        );
        const fields: Array<{ id: string }> = targetNode.data?.fields || [];
        const actions: Array<{ id: string; targetFieldId?: string }> = targetNode.data?.actions || [];
        const exists =
          fields.some((f) => f.id === fieldOrActId) ||
          actions.some((a) => a.id === fieldOrActId || a.targetFieldId === fieldOrActId);
        if (!exists) {
          orphanedEdgeIds.add(edge.id);
          continue;
        }
      }
    }

    // Check 5: Source handle is type-out-* (TypesNode)
    if (edge.sourceHandle && edge.sourceHandle.startsWith("type-out-")) {
      if (sourceNode.type === "types") {
        const typeId = edge.sourceHandle.replace("type-out-", "");
        const typesList: Array<{ id: string; name?: string }> = sourceNode.data?.types || [];
        const typeExists = typesList.some((t) => t.id === typeId || t.name === typeId);

        if (!typeExists) {
          orphanedEdgeIds.add(edge.id);
          continue;
        }
      }
    }

    // Check 6: Target handle is an inbound action handle on a WebPage (event-in-*, pageload-in-*, etc.)
    if (
      edge.targetHandle &&
      (edge.targetHandle.startsWith("event-in-") ||
        edge.targetHandle.startsWith("pageload-in-") ||
        edge.targetHandle.startsWith("sse-in-") ||
        edge.targetHandle.startsWith("websocket-in-") ||
        edge.targetHandle.startsWith("webrtc-in-"))
    ) {
      if (targetNode.type === "webPage") {
        const actionId = edge.targetHandle.replace(
          /^(?:event-in-|pageload-in-|sse-in-|websocket-in-|webrtc-in-)/,
          "",
        );
        const sections: PageSection[] = targetNode.data?.sections || [];
        const actionExists =
          sections.some((sec) =>
            (sec.actions || []).some((act) => act.id === actionId),
          ) ||
          (targetNode.data?.events || []).some((act) => act.id === actionId) ||
          (targetNode.data?.realtimeConnections || []).some((c) => c.id === actionId);
        if (!actionExists) {
          orphanedEdgeIds.add(edge.id);
          continue;
        }
      }
    }

    // Check 7: Source handle is an outgoing action handle on a WebPage (events-*)
    if (edge.sourceHandle && edge.sourceHandle.startsWith("events-")) {
      if (sourceNode.type === "webPage") {
        const actionId = edge.sourceHandle.replace(/^events-/, "");
        const sections: PageSection[] = sourceNode.data?.sections || [];
        const actionExists =
          sections.some((sec) =>
            (sec.actions || []).some((act) => act.id === actionId),
          ) ||
          (sourceNode.data?.events || []).some((act) => act.id === actionId) ||
          (sourceNode.data?.realtimeConnections || []).some((c) => c.id === actionId);
        if (!actionExists) {
          orphanedEdgeIds.add(edge.id);
          continue;
        }
      }
    }
  }

  if (orphanedEdgeIds.size > 0) {
    changed = true;
    nextEdges = nextEdges.filter((e) => !orphanedEdgeIds.has(e.id));
    orphanedEdgeIds.forEach((id) => nextRemovals.add(id));
  }

  return {
    changed,
    nodes,
    edges: nextEdges,
    pendingEdgeRemovals: Array.from(nextRemovals),
    pendingEdgeUpserts: (pendingEdgeUpserts || []).filter(
      (e) => !orphanedEdgeIds.has(e.id),
    ),
    pendingNodeUpserts,
  };
}
