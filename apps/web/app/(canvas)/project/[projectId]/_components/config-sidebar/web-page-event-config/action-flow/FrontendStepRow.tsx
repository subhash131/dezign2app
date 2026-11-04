import React, { useState } from "react";
import { Draggable } from "@hello-pangea/dnd";
import type { BackendNode, Endpoint, UIEventItem } from "@workspace/canvas";
import type { ActionStepItem } from "../TargetEndpointSection";
import type { FrontendActionStepDraft, AvailablePath } from "./types";
import { FrontendStepRowHeader } from "./FrontendStepRowHeader";
import { ApiCallStep } from "./ApiCallStep";
import { StoragePutStep } from "./StoragePutStep";
import { StateMutationStep } from "./StateMutationStep";
import { NavigationStep } from "./NavigationStep";
import { QueryParamsStep } from "./QueryParamsStep";
import { TransformerStep } from "./TransformerStep";
import { CustomCodeStep } from "./CustomCodeStep";
import { ConditionStep } from "./ConditionStep";
import { NotificationStep } from "./NotificationStep";
import { ResetFormStep } from "./ResetFormStep";
import { BrowserStorageStep } from "./BrowserStorageStep";

export interface FrontendStepRowProps {
  step: FrontendActionStepDraft;
  index: number;
  canvasStep?: ActionStepItem;
  allSteps: FrontendActionStepDraft[];
  allCanvasSteps: ActionStepItem[];
  allNodes: BackendNode[];
  serviceNodes: BackendNode[];
  endpoints: (Endpoint & { nodeId: string })[];
  webPageNodeId?: string;
  actionId?: string;
  actionItem?: UIEventItem;
  isProtected?: boolean;
  incomingPaths?: AvailablePath[];
  onChange: (updated: FrontendActionStepDraft) => void;
  onDelete: () => void;
}

export const FrontendStepRow: React.FC<FrontendStepRowProps> = ({
  step,
  index,
  canvasStep,
  allSteps,
  allCanvasSteps,
  allNodes,
  serviceNodes,
  endpoints,
  webPageNodeId,
  actionId,
  actionItem,
  isProtected,
  incomingPaths,
  onChange,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Draggable draggableId={step.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`rounded-lg border bg-card transition-all ${
            snapshot.isDragging
              ? "shadow-lg border-primary/50 opacity-90 ring-1 ring-primary/30"
              : "shadow-xs border-border/70 hover:border-border"
          }`}
        >
          {/* Header Row */}
          <FrontendStepRowHeader
            step={step}
            index={index}
            expanded={expanded}
            allNodes={allNodes}
            endpoints={endpoints}
            dragHandleProps={provided.dragHandleProps}
            onToggleExpand={() => setExpanded(!expanded)}
            onDelete={onDelete}
          />

          {/* Expanded Step Body */}
          {expanded && (
            <div className="p-3 border-t border-border/40 bg-card/40 space-y-3">
              {step.type === "api_call" && (
                <ApiCallStep
                  draft={step}
                  canvasStep={canvasStep}
                  stepIndex={index}
                  allSteps={allSteps}
                  allCanvasSteps={allCanvasSteps}
                  serviceNodes={serviceNodes}
                  allNodes={allNodes}
                  endpoints={endpoints}
                  webPageNodeId={webPageNodeId}
                  actionId={actionId}
                  actionItem={actionItem}

                  isProtected={isProtected}
                  incomingPaths={incomingPaths}
                  onChange={onChange}
                />
              )}

              {step.type === "storage_put" && (
                <StoragePutStep
                  draft={step}
                  canvasStep={canvasStep}
                  stepIndex={index}
                  allSteps={allSteps}
                  allCanvasSteps={allCanvasSteps}
                  allNodes={allNodes}
                  endpoints={endpoints}
                  webPageNodeId={webPageNodeId}
                  actionId={actionId}
                  actionItem={actionItem}

                  onChange={onChange}
                />
              )}

              {step.type === "state_mutation" && (
                <StateMutationStep
                  draft={step}
                  allSteps={allSteps}
                  stepIndex={index}
                  allNodes={allNodes}
                  webPageNodeId={webPageNodeId}
                  actionId={actionId}
                  actionItem={actionItem}

                  incomingPaths={incomingPaths}
                  onChange={onChange}
                />
              )}

              {step.type === "browser_storage" && (
                <BrowserStorageStep
                  draft={step}
                  allSteps={allSteps}
                  stepIndex={index}
                  allNodes={allNodes}
                  endpoints={endpoints}
                  webPageNodeId={webPageNodeId}
                  actionId={actionId}
                  actionItem={actionItem}

                  onChange={onChange}
                />
              )}

              {step.type === "navigation" && (
                <NavigationStep
                  draft={step}
                  allNodes={allNodes}
                  onChange={onChange}
                />
              )}

              {step.type === "update_query_params" && (
                <QueryParamsStep
                  draft={step}
                  allSteps={allSteps}
                  stepIndex={index}
                  allNodes={allNodes}
                  webPageNodeId={webPageNodeId}
                  onChange={onChange}
                />
              )}

              {step.type === "transform" && (
                <TransformerStep
                  draft={step}
                  allSteps={allSteps}
                  stepIndex={index}
                  allNodes={allNodes}
                  webPageNodeId={webPageNodeId}
                  actionId={actionId}
                  actionItem={actionItem}

                  incomingPaths={incomingPaths}
                  onChange={onChange}
                />
              )}

              {step.type === "custom_code" && (
                <CustomCodeStep
                  draft={step}
                  onChange={onChange}
                />
              )}

              {step.type === "condition" && (
                <ConditionStep
                  draft={step}
                  onChange={onChange}
                />
              )}

              {step.type === "notification" && (
                <NotificationStep
                  draft={step}
                  onChange={onChange}
                />
              )}

              {step.type === "reset_form" && (
                <ResetFormStep
                  draft={step}
                  onChange={onChange}
                />
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
};
