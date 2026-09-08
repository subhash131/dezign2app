import {
  Endpoint,
  PublishedEvent,
  PipelineStep,
  KafkaTopic,
  MESSAGING_TYPES,
} from "@workspace/canvas/types";
import { BackendCanvasState } from "./types";

export function cleanupDeletedNodesState(
  currentState: BackendCanvasState,
  initialIdsToDelete: string[],
): Partial<BackendCanvasState> {
  const getChildrenIds = (parentId: string): string[] => {
    const children = currentState.nodes
      .filter((n) => n && n.parentId === parentId)
      .map((n) => n.id);
    let allIds = [...children];
    for (const childId of children) {
      allIds = [...allIds, ...getChildrenIds(childId)];
    }
    return allIds;
  };

  const allIdsSet = new Set<string>();
  initialIdsToDelete.forEach((id) => {
    if (id) {
      allIdsSet.add(id);
      getChildrenIds(id).forEach((childId) => allIdsSet.add(childId));
    }
  });

  const idsToDeleteArray = Array.from(allIdsSet);
  if (idsToDeleteArray.length === 0) return {};

  // 1. Next Nodes (and clean up internal references on auth nodes)
  const nextNodes = currentState.nodes
    .filter((n) => !allIdsSet.has(n.id))
    .map((node) => {
      if (node.type === "auth" && node.data) {
        let changed = false;
        let newData = { ...node.data };

        // Clean up databaseId if the referenced database node was deleted
        if (newData.databaseId && allIdsSet.has(newData.databaseId)) {
          newData.databaseId = undefined;
          changed = true;
        }

        // Clean up table mappings if referenced entity was deleted
        if (newData.tableMappings) {
          const newMappings: Record<string, string | undefined> = { ...newData.tableMappings };
          let mappingsChanged = false;
          for (const [key, entId] of Object.entries(newMappings)) {
            if (entId && allIdsSet.has(entId)) {
              delete newMappings[key];
              mappingsChanged = true;
            }
          }
          if (mappingsChanged) {
            newData.tableMappings = newMappings;
            changed = true;
          }
        }

        // Clean up userEntityId / userSchemaId
        if (newData.userEntityId && allIdsSet.has(newData.userEntityId)) {
          newData.userEntityId = undefined;
          changed = true;
        }
        if (newData.userSchemaId && allIdsSet.has(newData.userSchemaId)) {
          newData.userSchemaId = undefined;
          changed = true;
        }

        // Clean up authFunctions
        if (
          newData.authFunctions &&
          newData.authFunctions.some((af: { entityNodeId?: string }) => af.entityNodeId && allIdsSet.has(af.entityNodeId))
        ) {
          newData.authFunctions = newData.authFunctions.filter(
            (af: { entityNodeId?: string }) => !af.entityNodeId || !allIdsSet.has(af.entityNodeId)
          );
          changed = true;
        }

        if (changed) {
          return { ...node, data: newData };
        }
      }

      // Clean up transformerRef if referenced transformer was deleted
      if (node.type === "transformer_ref" && node.data?.transformerRef) {
        if (allIdsSet.has(node.data.transformerRef)) {
          return {
            ...node,
            data: {
              ...node.data,
              transformerRef: undefined,
            },
          };
        }
      }

      return node;
    });

  // Track deleted transformer nodes and their names for pipeline step cleanup
  const deletedTransformerNodes = currentState.nodes.filter(
    (n) =>
      n &&
      (n.type === "transformer" || n.type === "transformer_ref") &&
      allIdsSet.has(n.id),
  );
  const deletedTransformerNames = new Set(
    deletedTransformerNodes
      .map((n) => n.data?.functionName || n.data?.label)
      .filter(Boolean),
  );

  // Track deleted langgraph nodes for pipeline step cleanup
  const deletedLangGraphNodes = currentState.nodes.filter(
    (n) => n && n.type === "langgraph" && allIdsSet.has(n.id),
  );
  const deletedLangGraphIds = new Set(deletedLangGraphNodes.map((n) => n.id));

  // 2. Events to remove (publishers & consumers)
  const eventsToDelete = currentState.events.filter((ev) =>
    allIdsSet.has(ev.nodeId),
  );
  const deletedEventIds = new Set(eventsToDelete.map((ev) => ev.id));
  const nextEvents = currentState.events
    .filter((ev) => !allIdsSet.has(ev.nodeId))
    .map((ev) => {
      let evChanged = false;
      let updatedEv = ev;
      if (ev.brokerNodeId && allIdsSet.has(ev.brokerNodeId)) {
        updatedEv = { ...updatedEv, brokerNodeId: "" };
        evChanged = true;
      }
      if (
        deletedTransformerNodes.length > 0 &&
        updatedEv.pipelineSteps &&
        updatedEv.pipelineSteps.length > 0
      ) {
        const filteredSteps = updatedEv.pipelineSteps.filter(
          (s) =>
            !(
              s.type === "transform" &&
              ((s.transformerNodeId && allIdsSet.has(s.transformerNodeId)) ||
                (s.functionRef?.name &&
                  (allIdsSet.has(s.functionRef.name) ||
                    deletedTransformerNames.has(s.functionRef.name))))
            ),
        );
        if (filteredSteps.length !== updatedEv.pipelineSteps.length) {
          updatedEv = { ...updatedEv, pipelineSteps: filteredSteps };
          evChanged = true;
        }
      }
      if (
        deletedLangGraphIds.size > 0 &&
        updatedEv.pipelineSteps &&
        updatedEv.pipelineSteps.length > 0
      ) {
        const filteredSteps = updatedEv.pipelineSteps.filter(
          (s) =>
            !(
              s.type === "langgraph_invoke" &&
              s.langGraphTargetNodeId &&
              deletedLangGraphIds.has(s.langGraphTargetNodeId)
            ),
        );
        if (filteredSteps.length !== updatedEv.pipelineSteps.length) {
          updatedEv = { ...updatedEv, pipelineSteps: filteredSteps };
          evChanged = true;
        }
      }
      return evChanged ? updatedEv : ev;
    });

  // 3. Endpoints to remove
  const endpointsToDelete = currentState.endpoints.filter((e) =>
    allIdsSet.has(e.nodeId),
  );
  const deletedEndpointIds = new Set(endpointsToDelete.map((e) => e.id));
  const nextEndpoints = currentState.endpoints
    .filter((e) => !allIdsSet.has(e.nodeId))
    .map((ep) => {
      let changed = false;
      let newDbIds = ep.databaseNodeIds;
      let newDbId = ep.databaseNodeId;
      let newCrudOps = ep.crudOperations;
      let newCrudExp = ep.crudExplanations;
      let newPubEvents = ep.publishedEvents;
      let newPipelineSteps = ep.pipelineSteps;

      if (
        deletedTransformerNodes.length > 0 &&
        newPipelineSteps &&
        newPipelineSteps.length > 0
      ) {
        const filteredSteps = newPipelineSteps.filter(
          (s) =>
            !(
              s.type === "transform" &&
              ((s.transformerNodeId && allIdsSet.has(s.transformerNodeId)) ||
                (s.functionRef?.name &&
                  (allIdsSet.has(s.functionRef.name) ||
                    deletedTransformerNames.has(s.functionRef.name))))
            ),
        );
        if (filteredSteps.length !== newPipelineSteps.length) {
          changed = true;
          newPipelineSteps = filteredSteps;
        }
      }

      if (
        deletedLangGraphIds.size > 0 &&
        newPipelineSteps &&
        newPipelineSteps.length > 0
      ) {
        const filteredSteps = newPipelineSteps.filter(
          (s) =>
            !(
              s.type === "langgraph_invoke" &&
              s.langGraphTargetNodeId &&
              deletedLangGraphIds.has(s.langGraphTargetNodeId)
            ),
        );
        if (filteredSteps.length !== newPipelineSteps.length) {
          changed = true;
          newPipelineSteps = filteredSteps;
        }
      }

      if (newDbIds && newDbIds.some((id) => allIdsSet.has(id))) {
        newDbIds = newDbIds.filter((id) => !allIdsSet.has(id));
        newDbId = newDbIds[0] || "none";
        changed = true;
      }
      if (newDbId && allIdsSet.has(newDbId)) {
        newDbId = "none";
        changed = true;
      }
      if (newCrudOps) {
        const cleanedOps: NonNullable<Endpoint["crudOperations"]> = {};
        for (const [key, val] of Object.entries(newCrudOps)) {
          if (!allIdsSet.has(key)) cleanedOps[key] = val;
          else changed = true;
        }
        if (changed) newCrudOps = cleanedOps;
      }
      if (newCrudExp) {
        const cleanedExp: NonNullable<Endpoint["crudExplanations"]> = {};
        for (const [key, val] of Object.entries(newCrudExp)) {
          if (!allIdsSet.has(key)) cleanedExp[key] = val;
          else changed = true;
        }
        if (changed) newCrudExp = cleanedExp;
      }
      if (newPubEvents) {
        const cleanedEvents = newPubEvents.filter(
          (pev) =>
            !deletedEventIds.has(pev.id) &&
            !allIdsSet.has(pev.id) &&
            !(pev.brokerNodeId && allIdsSet.has(pev.brokerNodeId)),
        );
        if (cleanedEvents.length !== newPubEvents.length) {
          changed = true;
          newPubEvents = cleanedEvents;
        }
      }

      return changed
        ? {
            ...ep,
            databaseNodeIds: newDbIds,
            databaseNodeId: newDbId,
            crudOperations: newCrudOps,
            crudExplanations: newCrudExp,
            publishedEvents: newPubEvents,
            pipelineSteps: newPipelineSteps,
          }
        : ep;
    });

  // 4. Identity Providers to remove
  const providersToDelete = currentState.identityProviders.filter((p) =>
    allIdsSet.has(p.nodeId),
  );
  const nextProviders = currentState.identityProviders.filter(
    (p) => !allIdsSet.has(p.nodeId),
  );

  // 5. Edges to remove
  const removedEdges = currentState.edges.filter((e) => {
    if (!e) return false;
    if (allIdsSet.has(e.source) || allIdsSet.has(e.target)) return true;
    if (e.sourceHandle) {
      for (const epId of deletedEndpointIds) {
        if (e.sourceHandle.includes(epId)) return true;
      }
      for (const evId of deletedEventIds) {
        if (e.sourceHandle.includes(evId)) return true;
      }
    }
    if (e.targetHandle) {
      for (const epId of deletedEndpointIds) {
        if (e.sourceHandle?.includes(epId)) return true; // Note: edge target handle check
        if (e.targetHandle.includes(epId)) return true;
      }
      for (const evId of deletedEventIds) {
        if (e.targetHandle.includes(evId)) return true;
      }
    }
    return false;
  });
  const removedEdgeIds = removedEdges.map((e) => e.id);
  const removedEdgeSet = new Set(removedEdgeIds);
  const nextEdges = currentState.edges.filter((e) => !removedEdgeSet.has(e.id));

  // 6. Config sidebar reset
  let nextActiveConfigItem = currentState.activeConfigItem;
  if (nextActiveConfigItem) {
    if (
      allIdsSet.has(nextActiveConfigItem.nodeId) ||
      deletedEndpointIds.has(nextActiveConfigItem.id) ||
      deletedEventIds.has(nextActiveConfigItem.id)
    ) {
      nextActiveConfigItem = null;
    }
  }

  const changedEndpoints = nextEndpoints.filter((ep) => {
    const old = currentState.endpoints.find((o) => o.id === ep.id);
    return old && old !== ep;
  });

  const changedEvents = nextEvents.filter((ev) => {
    const old = currentState.events.find((o) => o.id === ev.id);
    return old && old !== ev;
  });

  const changedNodes = nextNodes.filter((n) => {
    const old = currentState.nodes.find((o) => o.id === n.id);
    return old && old !== n;
  });

  return {
    nodes: nextNodes,
    edges: nextEdges,
    endpoints: nextEndpoints,
    events: nextEvents,
    identityProviders: nextProviders,
    activeConfigItem: nextActiveConfigItem,
    pendingNodeUpserts: [
      ...currentState.pendingNodeUpserts.filter((n) => !allIdsSet.has(n.id)),
      ...changedNodes,
    ],
    pendingNodeRemovals: [
      ...currentState.pendingNodeRemovals,
      ...idsToDeleteArray,
    ],
    pendingEdgeUpserts: currentState.pendingEdgeUpserts.filter(
      (e) => !removedEdgeSet.has(e.id),
    ),
    pendingEdgeRemovals: [
      ...currentState.pendingEdgeRemovals,
      ...removedEdgeIds,
    ],
    pendingEndpointUpserts: [
      ...currentState.pendingEndpointUpserts,
      ...changedEndpoints,
    ],
    pendingEndpointRemovals: [
      ...currentState.pendingEndpointRemovals,
      ...endpointsToDelete.map((ep) => ({
        nodeId: ep.nodeId,
        endpointId: ep.id,
      })),
    ],
    pendingEventUpserts: [
      ...currentState.pendingEventUpserts,
      ...changedEvents,
    ],
    pendingEventRemovals: [
      ...currentState.pendingEventRemovals,
      ...eventsToDelete.map((ev) => ({ nodeId: ev.nodeId, eventId: ev.id })),
    ],
    pendingIdentityProviderRemovals: [
      ...currentState.pendingIdentityProviderRemovals,
      ...providersToDelete.map((p) => ({
        nodeId: p.nodeId,
        providerId: p.id,
      })),
    ],
  };
}

export function cleanupDeletedEdgesState(
  currentState: BackendCanvasState,
  removedEdgeIds: string[],
): Partial<BackendCanvasState> {
  if (!removedEdgeIds || removedEdgeIds.length === 0) return {};

  const removedSet = new Set(removedEdgeIds);
  const removedEdges = currentState.edges.filter(
    (e) => e && removedSet.has(e.id),
  );
  const nextEdges = currentState.edges.filter(
    (e) => e && !removedSet.has(e.id),
  );

  let nextNodes = [...currentState.nodes];
  let nodesChanged = false;
  const pendingNodeUpserts = [...currentState.pendingNodeUpserts];

  let nextEndpoints = [...currentState.endpoints];
  let endpointsChanged = false;

  let nextEvents = [...currentState.events];
  let eventsChanged = false;
  const deletedEventEntries: Array<{ nodeId: string; eventId: string }> = [];

  const dbNodeIdsSet = new Set(
    currentState.nodes
      .filter((n) => n && (n.type === "db_ref" || n.type === "database"))
      .map((n) => n.id),
  );

  const pendingEndpointUpserts = [...currentState.pendingEndpointUpserts];
  const pendingEventUpserts = [...currentState.pendingEventUpserts];

  removedEdges.forEach((edge) => {
    if (!edge) return;

    // 1. Endpoint -> DB Node connection cleanup
    const targetEndpointIds = new Set<string>();
    let targetDbId: string | null = null;

    if (edge.sourceHandle?.startsWith("endpoint-out-")) {
      const epId = edge.sourceHandle.replace("endpoint-out-", "");
      targetEndpointIds.add(epId);
      if (dbNodeIdsSet.has(edge.target)) {
        targetDbId = edge.target;
      }

      // Check if target is a Kafka / messaging broker node
      const targetNode = currentState.nodes.find((n) => n.id === edge.target);
      const isTargetMessaging = targetNode && MESSAGING_TYPES.has(targetNode.type);
      if (isTargetMessaging && targetNode) {
        nextEndpoints = nextEndpoints.map((ep) => {
          if (ep.id === epId && ep.pipelineSteps && ep.pipelineSteps.length > 0) {
            const updatedSteps = ep.pipelineSteps.filter((step) => {
              if (step.type !== "kafka_publish") return true;
              if (step.brokerNodeId === targetNode.id) return false;
              return true;
            });
            if (updatedSteps.length !== ep.pipelineSteps.length) {
              endpointsChanged = true;
              const updatedEp = { ...ep, pipelineSteps: updatedSteps };
              pendingEndpointUpserts.push(updatedEp);
              return updatedEp;
            }
          }
          return ep;
        });
      }
    } else {
      if (dbNodeIdsSet.has(edge.target)) {
        targetDbId = edge.target;
        currentState.endpoints
          .filter((ep) => ep.nodeId === edge.source)
          .forEach((ep) => targetEndpointIds.add(ep.id));
      } else if (dbNodeIdsSet.has(edge.source)) {
        targetDbId = edge.source;
        currentState.endpoints
          .filter((ep) => ep.nodeId === edge.target)
          .forEach((ep) => targetEndpointIds.add(ep.id));
      }
    }

    if (targetDbId) {
      nextEndpoints = nextEndpoints.map((ep) => {
        if (
          targetEndpointIds.size > 0 &&
          !targetEndpointIds.has(ep.id)
        )
          return ep;

        const currentDbIds =
          ep.databaseNodeIds ||
          (ep.databaseNodeId && ep.databaseNodeId !== "none"
            ? [ep.databaseNodeId]
            : []);

        if (currentDbIds.includes(targetDbId!)) {
          endpointsChanged = true;
          const newDbIds = currentDbIds.filter((id) => id !== targetDbId);
          const newDbId = newDbIds[0] || "none";

          const newCrudOps = { ...(ep.crudOperations || {}) };
          delete newCrudOps[targetDbId!];

          const newCrudExp = { ...(ep.crudExplanations || {}) };
          delete newCrudExp[targetDbId!];

          const updatedEp = {
            ...ep,
            databaseNodeIds: newDbIds,
            databaseNodeId: newDbId,
            crudOperations: newCrudOps,
            crudExplanations: newCrudExp,
          };
          pendingEndpointUpserts.push(updatedEp);
          return updatedEp;
        }
        return ep;
      });
    }

    // 2. Messaging Event -> Broker Node cleanup: fully delete the publish event & pipeline step when its edge is removed
    if (edge.sourceHandle?.startsWith("publishedEvents-out-")) {
      const eventId = edge.sourceHandle.replace("publishedEvents-out-", "");

      // Find the event and record it for DB removal
      const deletedEvent = nextEvents.find((ev) => ev.id === eventId);
      if (deletedEvent) {
        eventsChanged = true;
        nextEvents = nextEvents.filter((ev) => ev.id !== eventId);
        deletedEventEntries.push({
          nodeId: deletedEvent.nodeId,
          eventId: deletedEvent.id,
        });
      }

      // Remove from endpoint.publishedEvents AND remove matching kafka_publish step from pipelineSteps
      nextEndpoints = nextEndpoints.map((ep) => {
        const matchingPub = ep.publishedEvents?.find((pev) => pev.id === eventId);
        if (matchingPub) {
          endpointsChanged = true;
          const updatedPubs = ep.publishedEvents?.filter((pev) => pev.id !== eventId) ?? [];

          // Remove corresponding kafka_publish step from pipelineSteps
          const updatedSteps = (ep.pipelineSteps ?? []).filter((step) => {
            if (step.type !== "kafka_publish") return true;
            if (step.brokerNodeId && step.brokerNodeId === matchingPub.brokerNodeId) {
              if (!step.messagingResourceId || step.messagingResourceId === matchingPub.messagingResourceId) {
                return false;
              }
            }
            if (step.messagingResourceId && step.messagingResourceId === matchingPub.messagingResourceId) {
              return false;
            }
            if (
              matchingPub.name &&
              (step.name === matchingPub.name ||
                step.name === `Publish ${matchingPub.name}` ||
                step.functionRef?.name?.toLowerCase().includes(
                  matchingPub.name.toLowerCase().replace(/^publish\s*/i, ""),
                ))
            ) {
              return false;
            }
            return true;
          });

          const updatedEp = {
            ...ep,
            publishedEvents: updatedPubs,
            pipelineSteps: updatedSteps,
          };
          pendingEndpointUpserts.push(updatedEp);
          return updatedEp;
        }
        return ep;
      });
    }

    // Transformer -> Endpoint edge cleanup: remove transform step when edge is deleted
    if (edge.targetHandle?.startsWith("endpoint-in-")) {
      const epId = edge.targetHandle.replace("endpoint-in-", "");
      const srcNode = currentState.nodes.find((n) => n.id === edge.source);
      if (srcNode && (srcNode.type === "transformer" || srcNode.type === "transformer_ref")) {
        const fnName = srcNode.data?.functionName || srcNode.data?.label;
        nextEndpoints = nextEndpoints.map((ep) => {
          if (ep.id === epId && ep.pipelineSteps && ep.pipelineSteps.length > 0) {
            const updatedSteps = ep.pipelineSteps.filter((step) => {
              if (step.type !== "transform") return true;
              if (step.transformerNodeId === srcNode.id) return false;
              if (fnName && step.functionRef?.name === fnName) return false;
              return true;
            });
            if (updatedSteps.length !== ep.pipelineSteps.length) {
              endpointsChanged = true;
              const updatedEp = { ...ep, pipelineSteps: updatedSteps };
              pendingEndpointUpserts.push(updatedEp);
              return updatedEp;
            }
          }
          return ep;
        });
      }
    }

    if (edge.targetHandle?.startsWith("consumedEvents-in-")) {
      const eventId = edge.targetHandle.replace("consumedEvents-in-", "");
      nextEvents = nextEvents.map((ev) => {
        if (ev.id === eventId && ev.brokerNodeId) {
          eventsChanged = true;
          const updatedEv = { ...ev, brokerNodeId: "" };
          pendingEventUpserts.push(updatedEv);
          return updatedEv;
        }
        return ev;
      });
    }

    // LangGraph <-> Endpoint / Consumed Event edge cleanup: remove langgraph_invoke step when edge is deleted
    const lgSrcNode = currentState.nodes.find((n) => n.id === edge.source);
    const lgTgtNode = currentState.nodes.find((n) => n.id === edge.target);
    const isServiceToLangGraph =
      lgSrcNode?.type === "service" && lgTgtNode?.type === "langgraph";
    const isLangGraphToService =
      lgSrcNode?.type === "langgraph" && lgTgtNode?.type === "service";

    if (isServiceToLangGraph || isLangGraphToService) {
      const lgNode = isServiceToLangGraph ? lgTgtNode! : lgSrcNode!;
      const svcNode = isServiceToLangGraph ? lgSrcNode! : lgTgtNode!;
      const handle = isServiceToLangGraph
        ? edge.sourceHandle
        : edge.targetHandle;

      const epId = handle?.startsWith("endpoint-out-")
        ? handle.replace("endpoint-out-", "")
        : handle?.startsWith("endpoint-in-")
        ? handle.replace("endpoint-in-", "")
        : null;

      const evId = handle?.startsWith("consumedEvents-out-")
        ? handle.replace("consumedEvents-out-", "")
        : handle?.startsWith("consumedEvents-in-")
        ? handle.replace("consumedEvents-in-", "")
        : null;

      // Check if any other edge still connects this endpoint or event to this langgraph node
      const hasOtherEdge = nextEdges.some((e) => {
        if (!e) return false;
        const connectsBoth =
          (e.source === svcNode.id && e.target === lgNode.id) ||
          (e.source === lgNode.id && e.target === svcNode.id);
        if (!connectsBoth) return false;
        if (epId) {
          return (
            e.sourceHandle === `endpoint-out-${epId}` ||
            e.sourceHandle === `endpoint-in-${epId}` ||
            e.targetHandle === `endpoint-in-${epId}` ||
            e.targetHandle === `endpoint-out-${epId}`
          );
        }
        if (evId) {
          return (
            e.sourceHandle === `consumedEvents-out-${evId}` ||
            e.sourceHandle === `consumedEvents-in-${evId}` ||
            e.targetHandle === `consumedEvents-in-${evId}` ||
            e.targetHandle === `consumedEvents-out-${evId}`
          );
        }
        return true;
      });

      if (!hasOtherEdge) {
        if (epId) {
          nextEndpoints = nextEndpoints.map((ep) => {
            if (ep.id === epId && ep.pipelineSteps && ep.pipelineSteps.length > 0) {
              const updatedSteps = ep.pipelineSteps.filter(
                (step) =>
                  !(
                    step.type === "langgraph_invoke" &&
                    step.langGraphTargetNodeId === lgNode.id
                  ),
              );
              if (updatedSteps.length !== ep.pipelineSteps.length) {
                endpointsChanged = true;
                const updatedEp = { ...ep, pipelineSteps: updatedSteps };
                pendingEndpointUpserts.push(updatedEp);
                return updatedEp;
              }
            }
            return ep;
          });
        }
        if (evId) {
          nextEvents = nextEvents.map((ev) => {
            if (ev.id === evId && ev.pipelineSteps && ev.pipelineSteps.length > 0) {
              const updatedSteps = ev.pipelineSteps.filter(
                (step) =>
                  !(
                    step.type === "langgraph_invoke" &&
                    step.langGraphTargetNodeId === lgNode.id
                  ),
              );
              if (updatedSteps.length !== ev.pipelineSteps.length) {
                eventsChanged = true;
                const updatedEv = { ...ev, pipelineSteps: updatedSteps };
                pendingEventUpserts.push(updatedEv);
                return updatedEv;
              }
            }
            return ev;
          });
        }
      }
    }

    // 3. Foreign Key edge cleanup: remove isForeignKey and references if no edge remains for column
    if (edge.type === "foreign-key") {
      const handleNodes = [
        { nodeId: edge.source, handleId: edge.sourceHandle },
        { nodeId: edge.target, handleId: edge.targetHandle },
      ];

      handleNodes.forEach(({ nodeId, handleId }) => {
        if (!handleId) return;
        const match = handleId.match(/^(?:source|target)-(\d+)$/);
        if (!match) return;
        const colIdx = parseInt(match[1]!, 10);

        const stillConnected = nextEdges.some(
          (e) =>
            e &&
            ((e.source === nodeId &&
              (e.sourceHandle === handleId || e.targetHandle === handleId)) ||
              (e.target === nodeId &&
                (e.sourceHandle === handleId || e.targetHandle === handleId))),
        );

        if (!stillConnected) {
          const targetNode = nextNodes.find((n) => n.id === nodeId);
          if (
            targetNode &&
            targetNode.type === "entity" &&
            targetNode.data?.columns
          ) {
            const cols = targetNode.data.columns;
            if (
              cols[colIdx] &&
              (cols[colIdx].isForeignKey || cols[colIdx].references)
            ) {
              nodesChanged = true;
              const newCols = [...cols];
              const oldCol = newCols[colIdx]!;
              newCols[colIdx] = {
                ...oldCol,
                isForeignKey: false,
                references: undefined,
              };
              const updatedNode = {
                ...targetNode,
                data: { ...targetNode.data, columns: newCols },
              };
              nextNodes = nextNodes.map((n) => (n.id === nodeId ? updatedNode : n));
              pendingNodeUpserts.push(updatedNode);
            }
          }
        }
      });
    }

    // 4. WebApp <-> Auth Node connection cleanup: remove authNodeId if no edge remains between them
    const srcNode = currentState.nodes.find((n) => n.id === edge.source);
    const tgtNode = currentState.nodes.find((n) => n.id === edge.target);
    const webAppNode = srcNode?.type === "webApp" ? srcNode : tgtNode?.type === "webApp" ? tgtNode : null;
    const authNode = srcNode?.type === "auth" ? srcNode : tgtNode?.type === "auth" ? tgtNode : null;
    if (webAppNode && authNode && webAppNode.data?.authNodeId === authNode.id) {
      const stillConnected = nextEdges.some(
        (e) =>
          e &&
          ((e.source === webAppNode.id && e.target === authNode.id) ||
            (e.target === webAppNode.id && e.source === authNode.id)),
      );
      if (!stillConnected) {
        nodesChanged = true;
        const updatedNode = {
          ...webAppNode,
          data: { ...webAppNode.data, authNodeId: undefined },
        };
        nextNodes = nextNodes.map((n) => (n.id === webAppNode.id ? updatedNode : n));
        pendingNodeUpserts.push(updatedNode);
      }
    }

    // 5. Service <-> Messaging Broker Node cleanup: remove published & consumed event references if disconnected
    const serviceNode = srcNode?.type === "service" ? srcNode : tgtNode?.type === "service" ? tgtNode : null;
    const brokerNode =
      srcNode && MESSAGING_TYPES.has(srcNode.type)
        ? srcNode
        : tgtNode && MESSAGING_TYPES.has(tgtNode.type)
          ? tgtNode
          : null;

    if (serviceNode && brokerNode) {
      const stillConnected = nextEdges.some((e) => {
        if (!e) return false;
        if ((e.source === serviceNode.id && e.target === brokerNode.id) || (e.target === serviceNode.id && e.source === brokerNode.id)) {
          return true;
        }
        const topics: KafkaTopic[] = brokerNode.data?.topics || [];
        if (e.source === serviceNode.id && e.targetHandle && topics.some((t: KafkaTopic) => e.targetHandle!.includes(t.id))) {
          return true;
        }
        if (e.target === serviceNode.id && e.sourceHandle && topics.some((t: KafkaTopic) => e.sourceHandle!.includes(t.id))) {
          return true;
        }
        return false;
      });

      if (!stillConnected) {
        const brokerTopicIds = new Set((brokerNode.data?.topics || []).map((t: KafkaTopic) => t.id));

        // Clean up nextEvents
        const eventsToRemove = nextEvents.filter(
          (ev) =>
            ev.nodeId === serviceNode.id &&
            (ev.brokerNodeId === brokerNode.id || (ev.messagingResourceId && brokerTopicIds.has(ev.messagingResourceId))),
        );
        if (eventsToRemove.length > 0) {
          eventsChanged = true;
          const removeIds = new Set(eventsToRemove.map((ev) => ev.id));
          nextEvents = nextEvents.filter((ev) => !removeIds.has(ev.id));
          eventsToRemove.forEach((ev) => {
            deletedEventEntries.push({ nodeId: ev.nodeId, eventId: ev.id });
          });
        }

        // Clean up nextEndpoints
        nextEndpoints = nextEndpoints.map((ep) => {
          if (ep.nodeId === serviceNode.id) {
            let epModified = false;
            let updatedPubs = ep.publishedEvents;
            if (ep.publishedEvents && ep.publishedEvents.length > 0) {
              const remainingPubs = ep.publishedEvents.filter(
                (pe: PublishedEvent) =>
                  pe.brokerNodeId !== brokerNode.id &&
                  (!pe.messagingResourceId || !brokerTopicIds.has(pe.messagingResourceId)),
              );
              if (remainingPubs.length !== ep.publishedEvents.length) {
                epModified = true;
                updatedPubs = remainingPubs;
              }
            }

            let updatedSteps = ep.pipelineSteps;
            if (ep.pipelineSteps && ep.pipelineSteps.length > 0) {
              const remainingSteps = ep.pipelineSteps.filter((step: PipelineStep) => {
                if (step.type !== "kafka_publish") return true;
                if (step.brokerNodeId === brokerNode.id) return false;
                if (step.messagingResourceId && brokerTopicIds.has(step.messagingResourceId)) return false;
                return true;
              });
              if (remainingSteps.length !== ep.pipelineSteps.length) {
                epModified = true;
                updatedSteps = remainingSteps;
              }
            }

            if (epModified) {
              endpointsChanged = true;
              const updatedEp = {
                ...ep,
                publishedEvents: updatedPubs,
                pipelineSteps: updatedSteps,
              };
              pendingEndpointUpserts.push(updatedEp);
              return updatedEp;
            }
          }
          return ep;
        });

        // Clean up service node data if it contains publishedEvents/consumedEvents
        const liveSrvNode = nextNodes.find((n) => n.id === serviceNode.id);
        if (liveSrvNode?.data) {
          let nodeDataChanged = false;
          const newData = { ...liveSrvNode.data };
          if (newData.publishedEvents) {
            const remainingPubs = newData.publishedEvents.filter(
              (pe) =>
                pe.targetNodeId !== brokerNode.id &&
                (!pe.targetNodeId || !brokerTopicIds.has(pe.targetNodeId)),
            );
            if (remainingPubs.length !== newData.publishedEvents.length) {
              newData.publishedEvents = remainingPubs;
              nodeDataChanged = true;
            }
          }
          if (newData.consumedEvents) {
            const remainingCons = newData.consumedEvents.filter(
              (ce) =>
                ce.targetNodeId !== brokerNode.id &&
                (!ce.targetNodeId || !brokerTopicIds.has(ce.targetNodeId)),
            );
            if (remainingCons.length !== newData.consumedEvents.length) {
              newData.consumedEvents = remainingCons;
              nodeDataChanged = true;
            }
          }
          if (newData.endpoints) {
            const newEps = newData.endpoints.map((ep) => {
              let epChanged = false;
              let filteredPubs = ep.publishedEvents;
              if (ep.publishedEvents) {
                filteredPubs = ep.publishedEvents.filter(
                  (pe) =>
                    pe.brokerNodeId !== brokerNode.id &&
                    (!pe.messagingResourceId || !brokerTopicIds.has(pe.messagingResourceId)),
                );
                if (filteredPubs.length !== ep.publishedEvents.length) {
                  epChanged = true;
                }
              }
              let filteredSteps = ep.pipelineSteps;
              if (ep.pipelineSteps) {
                filteredSteps = ep.pipelineSteps.filter((step) => {
                  if (step.type !== "kafka_publish") return true;
                  if (step.brokerNodeId === brokerNode.id) return false;
                  if (step.messagingResourceId && brokerTopicIds.has(step.messagingResourceId)) return false;
                  return true;
                });
                if (filteredSteps.length !== ep.pipelineSteps.length) {
                  epChanged = true;
                }
              }
              if (epChanged) {
                nodeDataChanged = true;
                return { ...ep, publishedEvents: filteredPubs, pipelineSteps: filteredSteps };
              }
              return ep;
            });
            if (nodeDataChanged) {
              newData.endpoints = newEps;
            }
          }
          if (nodeDataChanged) {
            nodesChanged = true;
            const updatedNode = { ...liveSrvNode, data: newData };
            nextNodes = nextNodes.map((n) => (n.id === serviceNode.id ? updatedNode : n));
            pendingNodeUpserts.push(updatedNode);
          }
        }
      }
    }

    // 6. Transformer / TransformerRef -> Service Endpoint / Event connection cleanup
    const transformerNode =
      srcNode && (srcNode.type === "transformer" || srcNode.type === "transformer_ref")
        ? srcNode
        : tgtNode && (tgtNode.type === "transformer" || tgtNode.type === "transformer_ref")
        ? tgtNode
        : null;

    if (transformerNode) {
      let targetEpId: string | null = null;
      let targetEvId: string | null = null;

      if (edge.targetHandle?.startsWith("endpoint-in-")) {
        targetEpId = edge.targetHandle.replace("endpoint-in-", "");
      } else if (edge.targetHandle?.startsWith("consumedEvents-in-")) {
        targetEvId = edge.targetHandle.replace("consumedEvents-in-", "");
      } else if (edge.sourceHandle?.startsWith("endpoint-in-")) {
        targetEpId = edge.sourceHandle.replace("endpoint-in-", "");
      } else if (edge.sourceHandle?.startsWith("consumedEvents-in-")) {
        targetEvId = edge.sourceHandle.replace("consumedEvents-in-", "");
      }

      if (targetEpId || targetEvId) {
        // Update transformer node data (targetEndpointIds / targetEventIds)
        const currentLiveTNode =
          nextNodes.find((n) => n.id === transformerNode.id) || transformerNode;
        const currentEpIds: string[] =
          currentLiveTNode.data?.targetEndpointIds ||
          (currentLiveTNode.data?.targetEndpointId
            ? [currentLiveTNode.data.targetEndpointId]
            : []);
        const currentEvIds: string[] =
          currentLiveTNode.data?.targetEventIds ||
          (currentLiveTNode.data?.targetEventId
            ? [currentLiveTNode.data.targetEventId]
            : []);

        const nextEpIds = targetEpId
          ? currentEpIds.filter((id) => id !== targetEpId)
          : currentEpIds;
        const nextEvIds = targetEvId
          ? currentEvIds.filter((id) => id !== targetEvId)
          : currentEvIds;

        const hasRemainingTargets =
          nextEpIds.length > 0 || nextEvIds.length > 0;

        if (
          nextEpIds.length !== currentEpIds.length ||
          nextEvIds.length !== currentEvIds.length
        ) {
          nodesChanged = true;
          const updatedTNode = {
            ...currentLiveTNode,
            data: {
              ...currentLiveTNode.data,
              targetEndpointIds: nextEpIds,
              targetEndpointId: nextEpIds[0] || undefined,
              targetEventIds: nextEvIds,
              targetEventId: nextEvIds[0] || undefined,
              targetServiceId: hasRemainingTargets
                ? currentLiveTNode.data?.targetServiceId
                : undefined,
            },
          };
          nextNodes = nextNodes.map((n) =>
            n.id === transformerNode.id ? updatedTNode : n,
          );
          pendingNodeUpserts.push(updatedTNode);
        }

        const fnName =
          transformerNode.data?.functionName || transformerNode.data?.label;

        // Clean up endpoint pipelineSteps
        if (targetEpId) {
          nextEndpoints = nextEndpoints.map((ep) => {
            if (
              ep.id === targetEpId &&
              ep.pipelineSteps &&
              ep.pipelineSteps.length > 0
            ) {
              const filteredSteps = ep.pipelineSteps.filter(
                (s) =>
                  !(
                    s.type === "transform" &&
                    (s.transformerNodeId === transformerNode.id ||
                      (fnName && s.functionRef?.name === fnName))
                  ),
              );
              if (filteredSteps.length !== ep.pipelineSteps.length) {
                endpointsChanged = true;
                const updatedEp = { ...ep, pipelineSteps: filteredSteps };
                pendingEndpointUpserts.push(updatedEp);
                return updatedEp;
              }
            }
            return ep;
          });
        }

        // Clean up event pipelineSteps
        if (targetEvId) {
          nextEvents = nextEvents.map((ev) => {
            if (
              ev.id === targetEvId &&
              ev.pipelineSteps &&
              ev.pipelineSteps.length > 0
            ) {
              const filteredSteps = ev.pipelineSteps.filter(
                (s) =>
                  !(
                    s.type === "transform" &&
                    (s.transformerNodeId === transformerNode.id ||
                      (fnName && s.functionRef?.name === fnName))
                  ),
              );
              if (filteredSteps.length !== ev.pipelineSteps.length) {
                eventsChanged = true;
                const updatedEv = { ...ev, pipelineSteps: filteredSteps };
                pendingEventUpserts.push(updatedEv);
                return updatedEv;
              }
            }
            return ev;
          });
        }
      }
    }
  });

  const updates: Partial<BackendCanvasState> = {
    edges: nextEdges,
    pendingEdgeUpserts: currentState.pendingEdgeUpserts.filter(
      (e) => !removedSet.has(e.id),
    ),
    pendingEdgeRemovals: [
      ...currentState.pendingEdgeRemovals,
      ...removedEdgeIds,
    ],
  };

  if (nodesChanged) {
    updates.nodes = nextNodes;
    updates.pendingNodeUpserts = pendingNodeUpserts;
  }

  if (endpointsChanged) {
    updates.endpoints = nextEndpoints;
    updates.pendingEndpointUpserts = pendingEndpointUpserts;
  }

  if (eventsChanged) {
    updates.events = nextEvents;
    updates.pendingEventUpserts = pendingEventUpserts;
    if (deletedEventEntries.length > 0) {
      updates.pendingEventRemovals = [
        ...currentState.pendingEventRemovals,
        ...deletedEventEntries,
      ];
    }
  }

  return updates;
}
