import React from "react";
import { DragDropContext, Droppable } from "@hello-pangea/dnd";
import { AlertTriangle } from "lucide-react";
import {
  Endpoint,
  BackendNode,
  BackendEdge,
  AnyMessagingResource,
} from "@workspace/canvas/types";
import {
  PipelineStepDraft,
  AvailableSource,
} from "./types";
import { StepRow } from "./StepRow";
import { ReturnResponseStepRow } from "./ReturnResponseStepRow";
import { AddStepToolbar } from "./AddStepToolbar";
import { usePipelineSteps } from "./usePipelineSteps";
import { createPresignedUrlExtraSource } from "./utils";

export interface PipelineStepEditorProps {
  steps: PipelineStepDraft[];
  onChange: (steps: PipelineStepDraft[]) => void;
  endpoint?: Endpoint;
  onEndpointChange?: (changes: Partial<Endpoint>) => void;
  consumedEvent?: AnyMessagingResource;
  allNodes?: BackendNode[];
  allEdges?: BackendEdge[];
  serviceNodeId?: string;
  depth?: number;
  isNested?: boolean;
  extraSources?: AvailableSource[];
  droppableId?: string;
}

export const PipelineStepEditor: React.FC<PipelineStepEditorProps> = ({
  steps,
  onChange,
  endpoint,
  onEndpointChange,
  consumedEvent,
  allNodes = [],
  allEdges = [],
  serviceNodeId,
  depth = 0,
  isNested = false,
  extraSources = [],
  droppableId = "pipeline-steps-droppable",
}) => {
  const {
    isConsumer,
    executableSteps,
    returnStep,
    hasUnconfiguredInputs,
    addStep,
    updateStep,
    deleteStep,
    moveStep,
    updateReturnStep,
    handleDragEnd,
  } = usePipelineSteps({
    steps,
    onChange,
    endpoint,
    consumedEvent,
    allNodes,
    allEdges,
    serviceNodeId,
    isNested,
  });

  const priorStepsMap = React.useMemo(() => {
    const map = new Map<number, PipelineStepDraft[]>();
    for (let i = 0; i < executableSteps.length; i++) {
      map.set(i, executableSteps.slice(0, i));
    }
    return map;
  }, [executableSteps]);

  const presignSourcesMap = React.useMemo(() => {
    const map = new Map<number, AvailableSource[]>();
    for (let i = 0; i < executableSteps.length; i++) {
      const prior = executableSteps.slice(0, i);
      const presignSources: AvailableSource[] = prior
        .filter(
          (s) =>
            s.type === "storage_operation" &&
            ((s.operationId && s.operationId.toLowerCase().includes("presign")) ||
              (s.functionRef?.name && s.functionRef.name.toLowerCase().includes("presign"))),
        )
        .map((s) => {
          const isDownload =
            (s.operationId && s.operationId.toLowerCase().includes("download")) ||
            (s.functionRef?.name && s.functionRef.name.toLowerCase().includes("download"));
          return createPresignedUrlExtraSource(s, isDownload ? "download" : "upload");
        });
      map.set(i, presignSources);
    }
    return map;
  }, [executableSteps]);

  return (
    <div className="flex flex-col gap-3">
      {hasUnconfiguredInputs && !isNested && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs">
          <AlertTriangle size={14} className="shrink-0 text-destructive" />
          <span className="font-medium text-[11px] leading-tight">
            Pipeline has steps with unconfigured input variables. Map all required inputs below.
          </span>
        </div>
      )}

      {/* Draggable step list */}
      {executableSteps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/40 p-4 text-center">
          <p className="text-xs text-muted-foreground/60">
            No pipeline steps configured yet.
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">
            {isConsumer
              ? "Add transform, DB operations, or downstream event publish steps to process incoming events."
              : isNested
              ? "Add steps to execute inside this branch."
              : "Add transform, DB operations, or control flow logic below."}
          </p>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId={droppableId}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`flex flex-col gap-2 rounded-lg transition-colors ${
                  snapshot.isDraggingOver ? "bg-accent/15 p-1 -m-1" : ""
                }`}
              >
                {executableSteps.map((step, i) => (
                  <StepRow
                    key={step.id || `step-${i}`}
                    step={step}
                    index={i}
                    priorSteps={priorStepsMap.get(i) || []}
                    endpoint={endpoint}
                    consumedEvent={consumedEvent}
                    allNodes={allNodes}
                    allEdges={allEdges}
                    serviceNodeId={serviceNodeId}
                    depth={depth}
                    extraSources={[...extraSources, ...(presignSourcesMap.get(i) || [])]}
                    onChange={(updated) => updateStep(i, updated)}
                    onDelete={() => deleteStep(i)}
                    isFirst={i === 0}
                    isLast={i === executableSteps.length - 1}
                    onMoveUp={() => moveStep(i, i - 1)}
                    onMoveDown={() => moveStep(i, i + 1)}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Add step buttons / Depth Limit Guard */}
      <AddStepToolbar depth={depth} onAddStep={addStep} />

      {/* Mandatory Pinned Return Response Step (Only for top-level HTTP Endpoints) */}
      {!isConsumer && !isNested && (
        <div className="pt-2 border-t border-border/40">
          <ReturnResponseStepRow
            step={returnStep}
            priorSteps={executableSteps}
            endpoint={endpoint}
            allNodes={allNodes}
            onChange={updateReturnStep}
            onEndpointChange={onEndpointChange}
          />
        </div>
      )}
    </div>
  );
};
