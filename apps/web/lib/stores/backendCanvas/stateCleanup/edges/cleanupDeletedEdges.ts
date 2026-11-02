import { BackendCanvasState } from "../../types";
import { EdgeCleanupContext } from "../types";
import { cleanDatabaseEdge } from "./cleanDatabaseEdge";
import { cleanMessagingEdge } from "./cleanMessagingEdge";
import { cleanConsumedEventsHandle } from "./cleanConsumedEventsHandle";
import { cleanTransformerEdge } from "./cleanTransformerEdge";
import { cleanStorageEdge } from "./cleanStorageEdge";
import { cleanWebPageEdge } from "./cleanWebPageEdge";
import { cleanLangGraphEdge } from "./cleanLangGraphEdge";
import { cleanRedisEdge } from "./cleanRedisEdge";
import { cleanServiceCallEdge } from "./cleanServiceCallEdge";
import { cleanForeignKeyEdge } from "./cleanForeignKeyEdge";
import { cleanAuthEdge } from "./cleanAuthEdge";
import { cleanStateStoreEdge } from "./cleanStateStoreEdge";

/**
 * Cleans up canvas state when edges are removed, resetting references,
 * foreign keys, pipeline steps, published events, and node bindings.
 */
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

  const ctx: EdgeCleanupContext = {
    currentState,
    removedSet,
    nextEdges,
    nextNodes: [...currentState.nodes],
    nodesChanged: false,
    pendingNodeUpserts: [...currentState.pendingNodeUpserts],
    nextEndpoints: [...currentState.endpoints],
    endpointsChanged: false,
    pendingEndpointUpserts: [...currentState.pendingEndpointUpserts],
    nextEvents: [...currentState.events],
    eventsChanged: false,
    pendingEventUpserts: [...currentState.pendingEventUpserts],
    pendingEdgeUpserts: [
      ...(currentState.pendingEdgeUpserts || []).filter(
        (e) => !removedSet.has(e.id),
      ),
    ],
    deletedEventEntries: [],
    dbNodeIdsSet: new Set(
      currentState.nodes
        .filter(
          (n) =>
            n &&
            (n.type === "db_ref" ||
              n.type === "database" ||
              n.type === "entity"),
        )
        .map((n) => n.id),
    ),
  };

  removedEdges.forEach((edge) => {
    if (!edge) return;
    cleanDatabaseEdge(edge, ctx);
    cleanMessagingEdge(edge, ctx);
    cleanConsumedEventsHandle(edge, ctx);
    cleanTransformerEdge(edge, ctx);
    cleanStorageEdge(edge, ctx);
    cleanWebPageEdge(edge, ctx);
    cleanLangGraphEdge(edge, ctx);
    cleanRedisEdge(edge, ctx);
    cleanServiceCallEdge(edge, ctx);
    cleanForeignKeyEdge(edge, ctx);
    cleanAuthEdge(edge, ctx);
    cleanStateStoreEdge(edge, ctx);
  });

  const updates: Partial<BackendCanvasState> = {
    edges: ctx.nextEdges,
    pendingEdgeUpserts: ctx.pendingEdgeUpserts,
    pendingEdgeRemovals: [
      ...(currentState.pendingEdgeRemovals || []),
      ...removedEdgeIds,
      ...(ctx.additionalRemovedEdgeIds || []),
    ],
  };

  if (ctx.nodesChanged) {
    updates.nodes = ctx.nextNodes;
    updates.pendingNodeUpserts = ctx.pendingNodeUpserts;
  }

  if (ctx.endpointsChanged) {
    updates.endpoints = ctx.nextEndpoints;
    updates.pendingEndpointUpserts = ctx.pendingEndpointUpserts;
  }

  if (ctx.eventsChanged) {
    updates.events = ctx.nextEvents;
    updates.pendingEventUpserts = ctx.pendingEventUpserts;
    if (ctx.deletedEventEntries.length > 0) {
      updates.pendingEventRemovals = [
        ...currentState.pendingEventRemovals,
        ...ctx.deletedEventEntries,
      ];
    }
  }

  return updates;
}
