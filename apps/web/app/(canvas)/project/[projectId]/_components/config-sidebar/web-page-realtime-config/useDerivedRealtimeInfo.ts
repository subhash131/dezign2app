import { useMemo } from "react";
import { BackendNode, PipelineStep } from "@workspace/canvas/types";
import { EventWithNode, EndpointWithNode } from "@/lib/stores/backendCanvasStore";
import { DerivedRealtimeInfo } from "./types";

export function useDerivedRealtimeInfo(
  id: string,
  nodeId: string,
  events: EventWithNode[],
  endpoints: EndpointWithNode[],
  nodes: BackendNode[],
): DerivedRealtimeInfo | null {
  return useMemo(() => {
    const isStepMatch = (step: PipelineStep): boolean => {
      if (step.id !== id) return false;
      if (step.type === "push_to_client") return true;
      if (
        step.type === "langgraph_invoke" &&
        step.langGraphStreamingEnabled &&
        (step.langGraphStreamingProtocol === "sse" ||
          step.langGraphStreamingProtocol === "websocket" ||
          !step.langGraphStreamingProtocol)
      ) {
        return true;
      }
      return false;
    };

    const findInSteps = (
      steps: PipelineStep[] | undefined,
      parentIndex?: number,
    ): { step: PipelineStep; stepIndex: number } | null => {
      if (!steps) return null;
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step) continue;
        const currentIndex = parentIndex ?? i + 1;
        if (isStepMatch(step)) {
          return { step, stepIndex: currentIndex };
        }
        const nested =
          findInSteps(step.thenSteps, currentIndex) ||
          findInSteps(step.elseSteps, currentIndex) ||
          findInSteps(step.trySteps, currentIndex) ||
          findInSteps(step.catchSteps, currentIndex) ||
          findInSteps(step.loopBody, currentIndex);
        if (nested) return nested;
        if (step.switchCases) {
          for (const sc of step.switchCases) {
            const scFound = findInSteps(sc.steps, currentIndex);
            if (scFound) return scFound;
          }
        }
        if (step.switchDefault) {
          const sdFound = findInSteps(step.switchDefault, currentIndex);
          if (sdFound) return sdFound;
        }
        if (step.parallelBranches) {
          for (const pb of step.parallelBranches) {
            const pbFound = findInSteps(pb.steps, currentIndex);
            if (pbFound) return pbFound;
          }
        }
      }
      return null;
    };

    for (const ev of events) {
      if (ev.pipelineSteps && ev.nodeId) {
        const match = findInSteps(ev.pipelineSteps);
        if (match) {
          return {
            step: match.step,
            stepIndex: match.stepIndex,
            sourceNode: nodes.find((n) => n.id === ev.nodeId),
            sourceEventId: ev.id,
            sourceEndpointId: null,
          };
        }
      }
    }

    for (const ep of endpoints) {
      if (ep.pipelineSteps && ep.nodeId) {
        const match = findInSteps(ep.pipelineSteps);
        if (match) {
          return {
            step: match.step,
            stepIndex: match.stepIndex,
            sourceNode: nodes.find((n) => n.id === ep.nodeId),
            sourceEventId: null,
            sourceEndpointId: ep.id,
          };
        }
      }
    }

    // Check embedded endpoints/consumedEvents in service nodes
    for (const n of nodes) {
      if (n.type === "service" && Array.isArray(n.data?.endpoints)) {
        for (const ep of n.data.endpoints) {
          if (ep.pipelineSteps) {
            const match = findInSteps(ep.pipelineSteps);
            if (match) {
              return {
                step: match.step,
                stepIndex: match.stepIndex,
                sourceNode: n,
                sourceEventId: null,
                sourceEndpointId: ep.id,
              };
            }
          }
        }
      }
      if (n.type === "service" && Array.isArray(n.data?.consumedEvents)) {
        for (const ev of n.data.consumedEvents) {
          if (ev.pipelineSteps) {
            const match = findInSteps(ev.pipelineSteps);
            if (match) {
              return {
                step: match.step,
                stepIndex: match.stepIndex,
                sourceNode: n,
                sourceEventId: ev.id,
                sourceEndpointId: null,
              };
            }
          }
        }
      }
    }

    return null;
  }, [id, nodeId, events, endpoints, nodes]);
}
