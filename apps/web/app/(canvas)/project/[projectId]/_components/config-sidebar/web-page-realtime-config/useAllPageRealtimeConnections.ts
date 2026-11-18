import { useMemo } from "react";
import {
  BackendNode,
  BackendEdge,
  RealtimeConnection,
  ClientDeliveryProtocol,
  PipelineStep,
  PipelineStepDraft,
} from "@workspace/canvas/types";
import { EventWithNode, EndpointWithNode } from "@/lib/stores/backendCanvasStore";

export interface MergedPageRealtimeConnection extends RealtimeConnection {
  isDerived?: boolean;
}

export function useAllPageRealtimeConnections({
  nodeId,
  pageNode,
  nodes,
  edges,
  events,
  endpoints,
}: {
  nodeId: string;
  pageNode?: BackendNode;
  nodes: BackendNode[];
  edges: BackendEdge[];
  events: EventWithNode[];
  endpoints: EndpointWithNode[];
}): MergedPageRealtimeConnection[] {
  return useMemo(() => {
    const derived: MergedPageRealtimeConnection[] = [];

    const isStepTargetingThisPage = (
      step: PipelineStep | PipelineStepDraft,
      sourceItemId: string,
      sourceNodeId: string,
    ): boolean => {
      // 1. Explicit target page ID on step
      if (step.clientDeliveryTargetPageId) {
        return step.clientDeliveryTargetPageId === nodeId;
      }

      // 2. Step targets a page_ref node that references this page
      if (step.clientDeliveryPageRefNodeId) {
        const pr = nodes.find(
          (n) =>
            n.id === step.clientDeliveryPageRefNodeId &&
            n.type === "page_ref",
        );
        if (pr) {
          return pr.data?.targetPageId === nodeId || pr.data?.pageRefId === nodeId;
        }
      }

      // 3. Fallback only if step has neither explicit targetPageId nor pageRefNodeId:
      // Canvas edge connects source endpoint/event to a page_ref referencing this page
      const edgeToPageRef = edges.find((e) => {
        if (e.source !== sourceNodeId) return false;
        const matchesHandle =
          !e.sourceHandle ||
          e.sourceHandle.includes(sourceItemId) ||
          e.sourceHandle === `endpoint-out-${sourceItemId}` ||
          e.sourceHandle === `consumedEvents-out-${sourceItemId}`;
        if (!matchesHandle) return false;
        const targetNode = nodes.find((n) => n.id === e.target && n.type === "page_ref");
        return Boolean(
          targetNode &&
            (targetNode.data?.targetPageId === nodeId ||
              targetNode.data?.pageRefId === nodeId),
        );
      });
      if (edgeToPageRef) return true;

      return false;
    };

    const checkSteps = (
      steps: (PipelineStep | PipelineStepDraft)[] | undefined,
      sourceNodeId: string,
      sourceItemName: string,
      sourceItemId: string,
      sourceItemType: "endpoint" | "event",
    ) => {
      if (!steps) return;
      steps.forEach((step, idx) => {
        const isPushToClient =
          step.type === "push_to_client" &&
          isStepTargetingThisPage(step, sourceItemId, sourceNodeId);

        const isLangGraphStreaming =
          step.type === "langgraph_invoke" &&
          Boolean(step.langGraphStreamingEnabled) &&
          (step.langGraphStreamingProtocol === "sse" ||
            step.langGraphStreamingProtocol === "websocket" ||
            !step.langGraphStreamingProtocol) &&
          isStepTargetingThisPage(step, sourceItemId, sourceNodeId);

        if (isPushToClient || isLangGraphStreaming) {
          const sourceNode = nodes.find((n) => n.id === sourceNodeId);
          const proto: ClientDeliveryProtocol = isLangGraphStreaming
            ? (step.langGraphStreamingProtocol === "websocket" ? "WEBSOCKET" : "SSE")
            : (step.clientDeliveryProtocol ?? "SSE");

          const eventName =
            step.clientDeliveryEventName ||
            (isLangGraphStreaming
              ? (proto === "WEBSOCKET" ? "agent_stream" : (sourceItemName || step.name || "message"))
              : (sourceItemName || "message"));

          const room =
            step.clientDeliveryRoom ||
            (isLangGraphStreaming ? step.langGraphStreamingRoom : undefined);

          const stepName =
            step.name ||
            (isLangGraphStreaming
              ? (step.langGraphAgentName ? `LangGraph: ${step.langGraphAgentName}` : "LangGraph Agent")
              : "Push to Client");

          derived.push({
            id: step.id,
            protocol: proto,
            eventName,
            room,
            description: sourceItemName || step.name,
            sourceServiceNodeId: sourceNodeId,
            sourceServiceLabel: sourceNode?.data?.label || sourceNode?.type || "Service",
            sourceEventId: sourceItemId,
            sourceItemName,
            sourceItemType,
            sourceStepName: stepName,
            sourceStepType: step.type,
            sourceStepIndex: idx + 1,
            isDerived: true,
            isLangGraph: isLangGraphStreaming,
          });
        }
        if (step.thenSteps) checkSteps(step.thenSteps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.elseSteps) checkSteps(step.elseSteps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.trySteps) checkSteps(step.trySteps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.catchSteps) checkSteps(step.catchSteps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.loopBody) checkSteps(step.loopBody, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.switchCases) {
          step.switchCases.forEach((c) => checkSteps(c.steps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType));
        }
        if (step.switchDefault) checkSteps(step.switchDefault, sourceNodeId, sourceItemName, sourceItemId, sourceItemType);
        if (step.parallelBranches) {
          step.parallelBranches.forEach((b) => checkSteps(b.steps, sourceNodeId, sourceItemName, sourceItemId, sourceItemType));
        }
      });
    };

    // 1. Check all consumed / published events
    events.forEach((ev) => {
      if (ev.pipelineSteps && ev.nodeId) {
        checkSteps(ev.pipelineSteps, ev.nodeId, ev.name || "Event", ev.id, "event");
      }
    });

    // 2. Check all endpoints
    endpoints.forEach((ep) => {
      if (ep.pipelineSteps && ep.nodeId) {
        checkSteps(ep.pipelineSteps, ep.nodeId, ep.name || "Endpoint", ep.id, "endpoint");
      }
    });

    // 3. Check embedded endpoints and consumedEvents in service nodes
    nodes.forEach((n) => {
      if (n.type === "service" && Array.isArray(n.data?.endpoints)) {
        n.data.endpoints.forEach((ep: { pipelineSteps?: PipelineStep[]; name?: string; id: string }) => {
          if (ep.pipelineSteps) {
            checkSteps(ep.pipelineSteps, n.id, ep.name || "Endpoint", ep.id, "endpoint");
          }
        });
      }
      if (n.type === "service" && Array.isArray(n.data?.consumedEvents)) {
        n.data.consumedEvents.forEach((ev: { pipelineSteps?: PipelineStep[]; name?: string; id: string }) => {
          if (ev.pipelineSteps) {
            checkSteps(ev.pipelineSteps, n.id, ev.name || "Event", ev.id, "event");
          }
        });
      }
    });

    const manualConnections: RealtimeConnection[] = pageNode?.data?.realtimeConnections || [];
    const connectionsMap = new Map<string, RealtimeConnection>();
    manualConnections.forEach((c) => connectionsMap.set(c.id, c));

    const derivedIds = new Set(derived.map((d) => d.id));

    const derivedWithBindings: MergedPageRealtimeConnection[] = derived.map((d) => {
      const match = connectionsMap.get(d.id);
      return {
        ...d,
        storeActionBinding: match?.storeActionBinding || d.storeActionBinding,
        storeActionBindings: match?.storeActionBindings || d.storeActionBindings,
        actionSteps: match?.actionSteps || d.actionSteps,
        subscriptionBindings: match?.subscriptionBindings || d.subscriptionBindings,
      };
    });

    const manualOnly: MergedPageRealtimeConnection[] = manualConnections
      .filter((c) => !derivedIds.has(c.id))
      .map((c) => ({
        ...c,
        isDerived: false,
      }));

    return [...derivedWithBindings, ...manualOnly];
  }, [nodeId, pageNode, nodes, edges, events, endpoints]);
}
