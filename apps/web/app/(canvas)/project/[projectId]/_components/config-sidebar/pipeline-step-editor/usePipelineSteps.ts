import { useMemo } from "react";
import { DropResult } from "@hello-pangea/dnd";
import {
  Endpoint,
  BackendNode,
  BackendEdge,
  AnyMessagingResource,
} from "@workspace/canvas/types";
import { StepType, PipelineStepDraft } from "./types";
import { isStepInputUnconfigured } from "@/lib/utils/pipelineValidation";
import { createDefaultStepDraft } from "./pipelineStepFactory";
import { useCanvasStepSync } from "./useCanvasStepSync";
import {
  handleStepUpdateCanvasEffects,
  handleStepDeleteCanvasEffects,
} from "./pipelineStepCanvasCleanup";
import { isPaginationNeededByOtherSteps } from "./DbOperationStepSection";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  isHealthEndpoint,
  getHealthCheckResponseBindings,
} from "@/lib/utils/healthCheckEndpoint";

export interface UsePipelineStepsProps {
  steps: PipelineStepDraft[];
  onChange: (steps: PipelineStepDraft[]) => void;
  endpoint?: Endpoint;
  onEndpointChange?: (changes: Partial<Endpoint>) => void;
  consumedEvent?: AnyMessagingResource;
  allNodes?: BackendNode[];
  allEdges?: BackendEdge[];
  serviceNodeId?: string;
  isNested?: boolean;
}

export function usePipelineSteps({
  steps,
  onChange,
  endpoint,
  onEndpointChange,
  consumedEvent,
  allNodes = [],
  allEdges = [],
  serviceNodeId,
  isNested = false,
}: UsePipelineStepsProps) {
  const isConsumer = Boolean(consumedEvent);
  const targetId = endpoint?.id || consumedEvent?.id;

  // Separate draggable executable steps from the mandatory pinned return step
  const executableSteps = useMemo(
    () => steps.filter((s) => s.type !== "return_response"),
    [steps],
  );

  const { connectedTransformers } = useCanvasStepSync({
    steps,
    executableSteps,
    onChange,
    targetId,
    serviceNodeId,
    endpoint,
    consumedEvent,
    allNodes,
    allEdges,
    isNested,
    isConsumer,
  });

  const hasStreaming = useMemo(() => {
    return executableSteps.some(
      (s) =>
        s.type === "langgraph_invoke" &&
        s.langGraphStreamingEnabled &&
        (!s.langGraphStreamingProtocol || s.langGraphStreamingProtocol === "sse" || s.langGraphStreamingProtocol === "raw") &&
        s.enabled !== false,
    );
  }, [executableSteps]);

  const hasUnconfiguredInputs = useMemo(
    () => executableSteps.some((s) => isStepInputUnconfigured(s, allNodes)),
    [executableSteps, allNodes],
  );

  const returnStep: PipelineStepDraft = useMemo(() => {
    if (isConsumer) {
      return {
        id: "return-event-step",
        name: "Acknowledge Event",
        type: "return_response",
        enabled: true,
        statusCode: 200,
        inputBindings: [],
        outputVariable: "",
      };
    }
    const isHealth = isHealthEndpoint(endpoint);
    const serviceNode = allNodes.find((n) => n.id === serviceNodeId);
    const serviceName = serviceNode?.data?.label || "service";
    const servicePort = String(serviceNode?.data?.port || "8080");

    const found = steps.find((s) => s.type === "return_response");
    if (found) {
      if ((found.inputBindings && found.inputBindings.length > 0) || !isHealth) {
        return found;
      }
      return {
        ...found,
        inputBindings: getHealthCheckResponseBindings(serviceName, servicePort),
      };
    }

    return {
      id: "return-response-step",
      name: "Return Response",
      type: "return_response",
      enabled: true,
      statusCode: endpoint?.type === "POST" ? 201 : 200,
      inputBindings: isHealth
        ? getHealthCheckResponseBindings(serviceName, servicePort)
        : [],
      outputVariable: "",
    };
  }, [steps, endpoint, isConsumer, allNodes, serviceNodeId]);

  const addStep = (type: StepType) => {
    const newStep = createDefaultStepDraft({
      type,
      stepNumber: executableSteps.length + 1,
      allNodes,
      endpoint,
      consumedEvent,
      serviceNodeId,
      existingSteps: executableSteps,
    });

    if (isConsumer || isNested) {
      onChange([...executableSteps, newStep]);
    } else {
      onChange([...executableSteps, newStep, returnStep]);
    }
  };

  const updateStep = (index: number, updated: PipelineStepDraft) => {
    const prevStep = executableSteps[index];
    const isTableChanging =
      prevStep?.type === "db_operation" &&
      updated.type === "db_operation" &&
      prevStep.tableNodeId !== updated.tableNodeId;

    const finalUpdated = {
      ...updated,
      dbRefNodeId: isTableChanging
        ? undefined
        : updated.dbRefNodeId || prevStep?.dbRefNodeId,
    };
    if (prevStep) {
      const remainingSteps = executableSteps.filter((_, i) => i !== index);
      handleStepUpdateCanvasEffects({
        prevStep,
        updatedStep: finalUpdated,
        remainingSteps,
        serviceNodeId,
        endpointId: endpoint?.id,
        consumedEventId: consumedEvent?.id,
        allNodes,
        isNested,
      });
    }

    const next = [...executableSteps];
    next[index] = finalUpdated;
    if (isConsumer || isNested) {
      onChange(next);
    } else {
      onChange([...next, returnStep]);
    }
  };

  const deleteStep = (index: number) => {
    const stepToDelete = executableSteps[index];
    if (!stepToDelete) return;

    const remainingSteps = executableSteps.filter((_, i) => i !== index);
    handleStepDeleteCanvasEffects({
      stepToDelete,
      remainingSteps,
      serviceNodeId,
      targetId,
      endpoint,
      consumedEventId: consumedEvent?.id,
      connectedTransformers,
      isNested,
    });

    if (isConsumer || isNested) {
      onChange(remainingSteps);
    } else {
      onChange([...remainingSteps, returnStep]);
    }

    if (endpoint && endpoint.queryParams && endpoint.queryParams.length > 0) {
      const isNeededElsewhere = isPaginationNeededByOtherSteps(
        stepToDelete.id,
        remainingSteps,
        allNodes,
      );
      if (!isNeededElsewhere) {
        const nextQueryParams = endpoint.queryParams.filter((qp) => {
          const name = (qp.name || "").trim().toLowerCase();
          return name !== "limit" && name !== "offset";
        });
        if (nextQueryParams.length !== endpoint.queryParams.length) {
          if (onEndpointChange) {
            onEndpointChange({ queryParams: nextQueryParams });
          } else {
            useBackendCanvasStore.getState().updateEndpoint(endpoint.id, {
              queryParams: nextQueryParams,
            });
          }
        }
      }
    }
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= executableSteps.length) return;
    const reordered = Array.from(executableSteps);
    const [moved] = reordered.splice(fromIndex, 1);
    if (!moved) return;
    reordered.splice(toIndex, 0, moved);
    if (isConsumer || isNested) {
      onChange(reordered);
    } else {
      onChange([...reordered, returnStep]);
    }
  };

  const updateReturnStep = (updated: PipelineStepDraft) => {
    if (isConsumer || isNested) return;
    onChange([...executableSteps, updated]);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    moveStep(result.source.index, result.destination.index);
  };

  return {
    isConsumer,
    executableSteps,
    returnStep,
    hasStreaming,
    hasUnconfiguredInputs,
    addStep,
    updateStep,
    deleteStep,
    moveStep,
    updateReturnStep,
    handleDragEnd,
  };
}
export * from "./pipelineStepFactory";
export * from "./useCanvasStepSync";
export * from "./pipelineStepCanvasCleanup";
