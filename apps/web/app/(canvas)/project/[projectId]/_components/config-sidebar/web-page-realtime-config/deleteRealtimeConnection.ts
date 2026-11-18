import {
  RealtimeConnection,
  PipelineStep,
  Endpoint,
  ConsumedEventItem,
} from "@workspace/canvas/types";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

function cleanPipelineSteps<T extends PipelineStep>(
  steps: T[],
  connId: string,
  onClean?: () => void,
): { cleaned: T[]; changed: boolean } {
  let changed = false;
  const traverse = (stepList: T[]): T[] => {
    return stepList.map((s) => {
      let updatedStep = { ...s };
      if (s.id === connId) {
        changed = true;
        onClean?.();
        updatedStep = {
          ...updatedStep,
          clientDeliveryTargetPageId: undefined,
          clientDeliveryPageRefNodeId: undefined,
          clientDeliveryTargetWebAppId: undefined,
        };
      }
      if (updatedStep.thenSteps) updatedStep.thenSteps = traverse(updatedStep.thenSteps as T[]);
      if (updatedStep.elseSteps) updatedStep.elseSteps = traverse(updatedStep.elseSteps as T[]);
      if (updatedStep.trySteps) updatedStep.trySteps = traverse(updatedStep.trySteps as T[]);
      if (updatedStep.catchSteps) updatedStep.catchSteps = traverse(updatedStep.catchSteps as T[]);
      if (updatedStep.loopBody) updatedStep.loopBody = traverse(updatedStep.loopBody as T[]);
      return updatedStep;
    });
  };
  const cleaned = traverse(steps);
  return { cleaned, changed };
}

export function deleteRealtimeConnection({
  connId,
  nodeId,
  store,
}: {
  connId: string;
  nodeId: string;
  store: ReturnType<typeof useBackendCanvasStore.getState>;
}) {
  const { nodes, edges, events, endpoints, updateNode, deleteEdge, updateEvent, updateEndpoint } = store;

  // 1. Remove from WebPageNode realtimeConnections
  const pageNode = nodes.find((n) => n.id === nodeId);
  if (pageNode?.data?.realtimeConnections) {
    const updated = pageNode.data.realtimeConnections.filter((c: RealtimeConnection) => c.id !== connId);
    updateNode(nodeId, {
      data: {
        ...pageNode.data,
        label: pageNode.data?.label || "",
        realtimeConnections: updated,
      },
    });
  }

  // 2. If it's a derived connection from an event's push_to_client or langgraph_invoke step
  events.forEach((ev) => {
    if (ev.pipelineSteps) {
      const { cleaned, changed } = cleanPipelineSteps(ev.pipelineSteps, connId);
      if (changed) {
        updateEvent(ev.id, { pipelineSteps: cleaned });
      }
    }
  });

  // 3. If it's a derived connection from an endpoint's push_to_client or langgraph_invoke step
  endpoints.forEach((ep) => {
    if (ep.pipelineSteps) {
      const { cleaned, changed } = cleanPipelineSteps(ep.pipelineSteps, connId);
      if (changed) {
        updateEndpoint(ep.id, { pipelineSteps: cleaned });
      }
    }
  });

  // 4. Also check service nodes with embedded endpoints/consumedEvents
  nodes.forEach((n) => {
    if (n.type === "service") {
      let serviceChanged = false;
      let nextEndpoints = n.data?.endpoints;
      let nextEvents = n.data?.consumedEvents;

      if (Array.isArray(nextEndpoints)) {
        nextEndpoints = nextEndpoints.map((ep: Endpoint): Endpoint => {
          if (!ep.pipelineSteps) return ep;
          const { cleaned, changed: epChanged } = cleanPipelineSteps(ep.pipelineSteps, connId, () => {
            serviceChanged = true;
          });
          return epChanged ? { ...ep, pipelineSteps: cleaned } : ep;
        });
      }

      if (Array.isArray(nextEvents)) {
        nextEvents = nextEvents.map((ev: ConsumedEventItem): ConsumedEventItem => {
          if (!ev.pipelineSteps) return ev;
          const { cleaned, changed: evChanged } = cleanPipelineSteps(ev.pipelineSteps, connId, () => {
            serviceChanged = true;
          });
          return evChanged ? { ...ev, pipelineSteps: cleaned } : ev;
        });
      }

      if (serviceChanged) {
        updateNode(n.id, {
          data: {
            ...n.data,
            endpoints: nextEndpoints,
            consumedEvents: nextEvents,
          },
        });
      }
    }
  });

  // 5. Delete any connected canvas edges for this realtime connection
  const rtcEdges = edges.filter(
    (e) =>
      (e.source === nodeId && (e.sourceHandle === `rtc-out-${connId}` || e.sourceHandle === `rtc-in-${connId}` || e.sourceHandle === `rtc-right-in-${connId}`)) ||
      (e.target === nodeId && (e.targetHandle === `rtc-in-${connId}` || e.targetHandle === `rtc-out-${connId}` || e.targetHandle === `rtc-right-in-${connId}`)),
  );
  rtcEdges.forEach((e) => deleteEdge(e.id));
}

