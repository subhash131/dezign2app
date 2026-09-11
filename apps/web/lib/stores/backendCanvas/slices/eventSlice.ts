import { AnyMessagingResource } from "@workspace/canvas/types";
import { sanitizeTopicName } from "@workspace/canvas";
import {
  BackendCanvasState,
  EventWithNode,
  PendingEventRemoval,
} from "../types";
import { syncConfiguredEventEdge } from "../edgeSync";

export interface EventSlice {
  events: EventWithNode[];
  pendingEventUpserts: EventWithNode[];
  pendingEventRemovals: PendingEventRemoval[];
  addEvent: (
    nodeId: string,
    variant: "publish" | "consume",
    event: AnyMessagingResource,
  ) => void;
  updateEvent: (id: string, changes: Partial<AnyMessagingResource>) => void;
  deleteEvent: (id: string) => void;
}

export const createEventSlice = (
  set: (
    partial:
      | Partial<BackendCanvasState>
      | ((state: BackendCanvasState) => Partial<BackendCanvasState>),
  ) => void,
  get: () => BackendCanvasState,
): EventSlice => ({
  events: [],
  pendingEventUpserts: [],
  pendingEventRemovals: [],

  addEvent: (nodeId, variant, event) => {
    get().pushHistorySnapshot("graph");
    const sanitizedName = event.name ? sanitizeTopicName(event.name) : event.name;
    const newEvent = { ...event, name: sanitizedName, nodeId, variant };
    set({
      events: [...get().events, newEvent],
      pendingEventUpserts: [...get().pendingEventUpserts, newEvent],
    });
  },

  updateEvent: (id, changes) => {
    get().pushHistorySnapshot("graph");
    const sanitizedChanges = { ...changes };
    if (typeof sanitizedChanges.name === "string") {
      sanitizedChanges.name = sanitizeTopicName(sanitizedChanges.name);
    }
    const nextEvents = get().events.map((e) =>
      e.id === id ? { ...e, ...sanitizedChanges } : e,
    );
    const updated = nextEvents.find((e) => e.id === id);

    let endpointsChanged = false;
    const pendingEndpointUpserts = [...get().pendingEndpointUpserts];
    let updatedEndpointEvent: AnyMessagingResource | null = null;
    let endpointOwnerNodeId: string = "";

    const nextEndpoints = get().endpoints.map((ep) => {
      if (ep.publishedEvents?.some((pev) => pev.id === id)) {
        endpointsChanged = true;
        endpointOwnerNodeId = ep.nodeId;
        const updatedEp = {
          ...ep,
          publishedEvents: ep.publishedEvents.map((pev) => {
            if (pev.id !== id) return pev;
            const updatedItem = { ...pev };
            if (changes.name !== undefined) updatedItem.name = changes.name;
            if (changes.publishedWhen !== undefined)
              updatedItem.publishedWhen = changes.publishedWhen;
            if (changes.brokerNodeId !== undefined)
              updatedItem.brokerNodeId = changes.brokerNodeId;
            if (changes.messagingResourceId !== undefined)
              updatedItem.messagingResourceId = changes.messagingResourceId;
            if (changes.payloadSchema !== undefined)
              updatedItem.payloadSchema = changes.payloadSchema;
            updatedEndpointEvent = updatedItem;
            return updatedItem;
          }),
        };
        pendingEndpointUpserts.push(updatedEp);
        return updatedEp;
      }
      return ep;
    });

    if (updated) {
      const synced = syncConfiguredEventEdge(
        updated,
        updated.nodeId,
        updated.variant,
        get().nodes,
        get().edges,
      );
      set({
        events: nextEvents,
        ...(endpointsChanged ? { endpoints: nextEndpoints, pendingEndpointUpserts } : {}),
        edges: synced.edges,
        pendingEventUpserts: [...get().pendingEventUpserts, updated],
        pendingEdgeUpserts: [...get().pendingEdgeUpserts, ...synced.added],
        pendingEdgeRemovals: [...get().pendingEdgeRemovals, ...synced.removed],
      });
    } else if (updatedEndpointEvent && endpointOwnerNodeId) {
      const synced = syncConfiguredEventEdge(
        updatedEndpointEvent,
        endpointOwnerNodeId,
        "publish",
        get().nodes,
        get().edges,
      );
      set({
        endpoints: nextEndpoints,
        pendingEndpointUpserts,
        edges: synced.edges,
        pendingEdgeUpserts: [...get().pendingEdgeUpserts, ...synced.added],
        pendingEdgeRemovals: [...get().pendingEdgeRemovals, ...synced.removed],
      });
    } else if (endpointsChanged) {
      set({
        endpoints: nextEndpoints,
        pendingEndpointUpserts,
      });
    }
  },

  deleteEvent: (id) => {
    get().pushHistorySnapshot("graph");
    const event = get().events.find((e) => e.id === id);
    const active = get().activeConfigItem;

    const nextEvents = get().events.filter((e) => e.id !== id);

    let endpointsChanged = false;
    const pendingEndpointUpserts = [...get().pendingEndpointUpserts];
    const nextEndpoints = get().endpoints.map((ep) => {
      if (ep.publishedEvents?.some((pev) => pev.id === id)) {
        endpointsChanged = true;
        const updatedEp = {
          ...ep,
          publishedEvents: ep.publishedEvents.filter((pev) => pev.id !== id),
        };
        pendingEndpointUpserts.push(updatedEp);
        return updatedEp;
      }
      return ep;
    });

    let targetNodeId = event?.nodeId || "";
    if (!targetNodeId) {
      for (const ep of get().endpoints) {
        if (ep.publishedEvents?.some((pev) => pev.id === id)) {
          targetNodeId = ep.nodeId;
          break;
        }
      }
    }

    // Clean up all edges connected to this event handle or resource ID
    const currentEdges = get().edges;
    const removedEdges = currentEdges.filter(
      (edge) =>
        edge &&
        (edge.sourceHandle === `publishedEvents-out-${id}` ||
          edge.targetHandle === `consumedEvents-in-${id}` ||
          edge.sourceHandle?.includes(id) ||
          edge.targetHandle?.includes(id) ||
          edge.sourceResourceId === id ||
          edge.targetResourceId === id),
    );
    const removedEdgeIds = removedEdges.map((e) => e.id);
    const nextEdges = currentEdges.filter((e) => !removedEdgeIds.includes(e.id));

    set({
      events: nextEvents,
      ...(endpointsChanged ? { endpoints: nextEndpoints, pendingEndpointUpserts } : {}),
      edges: nextEdges,
      pendingEdgeRemovals: [...get().pendingEdgeRemovals, ...removedEdgeIds],
      activeConfigItem: active?.id === id ? null : active,
      ...(targetNodeId
        ? {
            pendingEventRemovals: [
              ...get().pendingEventRemovals,
              { nodeId: targetNodeId, eventId: id },
            ],
          }
        : {}),
    });
  },
});
