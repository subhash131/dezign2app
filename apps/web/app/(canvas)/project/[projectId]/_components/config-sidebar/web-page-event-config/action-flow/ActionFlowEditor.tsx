import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import {
  Layers,
  Code2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import type { ActionFlowEditorProps, FrontendActionStepDraft, FrontendActionStepType } from "./types";
import {
  deriveStepsFromEdges,
  getActionFlowRuntime,
  autoMapAuthBindings,
  buildInitialBindingsFromEndpoint,
} from "./utils";
import { FrontendAddStepToolbar } from "./FrontendAddStepToolbar";
import { FrontendStepRow } from "./FrontendStepRow";
import { IncomingRealtimePayloadCard } from "./IncomingRealtimePayloadCard";
import { createDefaultFrontendStep } from "./frontendStepFactory";
import {
  ensureActionServiceConnection,
  ensureActionStorageConnection,
  ensureActionTransformerConnection,
  ensureActionStateStoreConnection,
  cleanupActionStepEdge,
  reorderActionStepEdges,
} from "./actionStepCanvasSync";
import { toVarName } from "@/lib/compiler/utils";

export const ActionFlowEditor: React.FC<ActionFlowEditorProps> = ({
  item,
  canvasSteps,
  serviceNodes,
  allNodes,
  endpoints,
  webPageNodeId = "",
  actionId = "",
  isProtected = false,
  isRealtime = false,
  realtimeEventName,
  realtimeProtocol,
  realtimeSourceLabel,
  realtimeSourceItemName,
  incomingPaths,
  isItemScoped,
  itemKeyField,
  itemSourceStateName,
  itemPropSuggestions,
  isLangGraph,
  langGraphStreamModes,
  onSave,
  onDeleteStep,
}) => {
    const effectiveIsItemScoped = isItemScoped ?? Boolean(item?.scope === "item" || item?.itemSourceStateId);
  const effectiveItemKey = itemKeyField || item?.itemContextFields?.[0] || "id";
  const [drafts, setDrafts] = useState<FrontendActionStepDraft[]>(() => {
    if (item?.actionSteps && item.actionSteps.length > 0) {
      const hasUnmergedCanvasStep = canvasSteps.some(
        (c) => !item.actionSteps?.some((s) => s.edgeId === c.edgeId),
      );
      if (hasUnmergedCanvasStep) {
        return deriveStepsFromEdges(canvasSteps, item.actionSteps, isProtected);
      }
      return item.actionSteps.map((s) => {
        if (s.type === "api_call") {
          const ep = endpoints.find((e) => e.id === s.endpointId);
          const bindings = s.requestBindings && s.requestBindings.length > 0
            ? autoMapAuthBindings(s.requestBindings, ep, isProtected)
            : buildInitialBindingsFromEndpoint(ep, isProtected, effectiveIsItemScoped, effectiveItemKey);
          return {
            ...s,
            requestBindings: bindings,
          };
        }
        return s;
      });
    }
    return deriveStepsFromEdges(canvasSteps, item?.actionSteps, isProtected);
  });
  const [showRuntimePreview, setShowRuntimePreview] = useState(false);

  // Sync with item.actionSteps or canvasSteps if external changes happen
  useEffect(() => {
    if (item?.actionSteps && item.actionSteps.length > 0) {
      const hasUnmergedCanvasStep = canvasSteps.some(
        (c) => !item.actionSteps?.some((s) => s.edgeId === c.edgeId),
      );
      if (hasUnmergedCanvasStep) {
        const derived = deriveStepsFromEdges(canvasSteps, item.actionSteps, isProtected);
        setDrafts(derived);
        onSave(derived);
      } else {
        const mapped = item.actionSteps.map((s) => {
          if (s.type === "api_call") {
            const ep = endpoints.find((e) => e.id === s.endpointId);
            const bindings = s.requestBindings && s.requestBindings.length > 0
              ? autoMapAuthBindings(s.requestBindings, ep, isProtected)
              : buildInitialBindingsFromEndpoint(ep, isProtected, effectiveIsItemScoped, effectiveItemKey);
            return {
              ...s,
              requestBindings: bindings,
            };
          }
          return s;
        });
        setDrafts(mapped);
      }
    } else if (canvasSteps.length > 0) {
      const derived = deriveStepsFromEdges(canvasSteps, item?.actionSteps, isProtected);
      setDrafts(derived);
      onSave(derived);
    } else {
      setDrafts([]);
    }
  }, [item?.actionSteps, canvasSteps, isProtected]);

  const handleAddStep = (type: FrontendActionStepType) => {
    const newOrder = drafts.length + 1;
    let initialDefaults: Partial<FrontendActionStepDraft> = {};

    // Auto-draw canvas edge if adding an api_call step and service is available
    if (type === "api_call" && serviceNodes.length > 0) {
      const firstService = serviceNodes[0];
      const srvEndpoints = endpoints.filter((ep) => ep.nodeId === firstService?.id);
      const firstEndpoint = srvEndpoints[0];
      if (firstService && firstEndpoint && webPageNodeId && actionId) {
        const edgeId = ensureActionServiceConnection({
          webPageNodeId,
          actionId,
          serviceNodeId: firstService.id,
          endpointId: firstEndpoint.id,
          stepOrder: newOrder,
        });
        initialDefaults = {
          serviceNodeId: firstService.id,
          endpointId: firstEndpoint.id,
          edgeId,
          requestBindings: buildInitialBindingsFromEndpoint(firstEndpoint, isProtected, effectiveIsItemScoped, effectiveItemKey),
        };
      }
    }

    // Auto-draw canvas edge if adding a storage_put step and bucket is available
    if (type === "storage_put") {
      const storageNode = allNodes.find((n) => n.type === "storage");
      const bucket = storageNode?.data?.buckets?.[0];
      const bucketId = bucket?.id || bucket?.name || "default-bucket";
      if (webPageNodeId && actionId) {
        const res = ensureActionStorageConnection({
          webPageNodeId,
          actionId,
          storageNodeId: storageNode?.id,
          bucketId,
          stepOrder: newOrder,
        });
        initialDefaults = {
          bucketId,
          storageNodeId: storageNode?.id,
          storageRefNodeId: res?.refNodeId,
          edgeId: res?.edgeId,
        };
      }
    }

    // Auto-draw canvas edge if adding a transform step and a transformer node is available
    if (type === "transform") {
      const transformerNodes = allNodes.filter(
        (n) => n.type === "transformer" || n.type === "transformer_ref",
      );
      const firstTransformer = transformerNodes[0];
      if (firstTransformer && webPageNodeId && actionId) {
        const trNodeId =
          firstTransformer.type === "transformer_ref"
            ? firstTransformer.data?.transformerRef || firstTransformer.id
            : firstTransformer.id;
        const connRes = ensureActionTransformerConnection({
          webPageNodeId,
          actionId,
          transformerNodeId: firstTransformer.id,
          stepOrder: newOrder,
        });
        const edgeId = connRes?.edgeId;
        const refNodeId = connRes?.refNodeId;
        const trName =
          firstTransformer.data?.label ||
          firstTransformer.data?.functionName ||
          "transformer";
        const cleanFn = toVarName(trName);
        const defaultVar = `${cleanFn}Result`;
        const isGlobal =
          firstTransformer.data?.scope === "global" ||
          firstTransformer.type === "transformer_ref";

        initialDefaults = {
          name: defaultVar,
          outputVariable: defaultVar,
          transformerNodeId: trNodeId,
          transformerRefNodeId:
            refNodeId ||
            (firstTransformer.type === "transformer_ref"
              ? firstTransformer.id
              : undefined),
          transformerName: trName,
          edgeId,
          functionRef: {
            name: cleanFn,
            importPath: isGlobal
              ? "@workspace/transformers"
              : `../transformers/${cleanFn}`,
            isGlobal,
            inputSchema: firstTransformer.data?.inputSchema,
            returnSchema: firstTransformer.data?.returnSchema,
          },
          transformBindings: (firstTransformer.data?.inputSchema || []).map(
            (field: { name: string }) => ({
              argName: field.name,
              source: { kind: "literal", value: "" },
            }),
          ),
        };
      }
    }

    // Auto-draw canvas edge if adding a state_mutation step and a state_store node is available
    if (type === "state_mutation") {
      const stateStoreNodes = allNodes.filter((n) => n.type === "state_store");
      const firstStore = stateStoreNodes[0];
      if (firstStore && webPageNodeId && actionId) {
        const firstField = firstStore.data?.fields?.[0];
        const targetFieldId = firstField?.id;
        const edgeId = ensureActionStateStoreConnection({
          webPageNodeId,
          actionId,
          stateStoreNodeId: firstStore.id,
          targetFieldId,
          stepOrder: newOrder,
        });
        initialDefaults = {
          stateTargetKind: "store",
          stateStoreNodeId: firstStore.id,
          stateTargetFieldId: targetFieldId,
          stateKey: firstField?.name || "stateVar",
          stateActionName: "set",
          stateUpdateType: "set",
          stateReducerName: firstField?.reducer || "replace",
          edgeId,
        };
      }
    }

    const newStep = createDefaultFrontendStep(type, newOrder, initialDefaults);
    const updatedDrafts = [...drafts, newStep];
    setDrafts(updatedDrafts);
    onSave(updatedDrafts);
  };

  const handleStepChange = (updatedStep: FrontendActionStepDraft) => {
    const nextDrafts = drafts.map((d) =>
      d.id === updatedStep.id ? updatedStep : d,
    );
    setDrafts(nextDrafts);
    onSave(nextDrafts);
  };

  const handleDeleteStep = (stepId: string) => {
    const stepToDelete = drafts.find((d) => d.id === stepId);
    const edgeIdToDelete =
      stepToDelete?.edgeId ||
      canvasSteps.find(
        (c) => c.edgeId === stepToDelete?.id || c.step === stepToDelete?.order,
      )?.edgeId;

    if (edgeIdToDelete) {
      cleanupActionStepEdge(edgeIdToDelete);
      if (onDeleteStep) {
        onDeleteStep(edgeIdToDelete);
      }
    }

    const remaining = drafts
      .filter((d) => d.id !== stepId)
      .map((d, idx) => ({ ...d, order: idx + 1 }));

    if (webPageNodeId && actionId) {
      reorderActionStepEdges(remaining, webPageNodeId, actionId);
    }

    setDrafts(remaining);
    onSave(remaining);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const fromIdx = result.source.index;
    const toIdx = result.destination.index;
    if (fromIdx === toIdx) return;

    const reordered = Array.from(drafts);
    const [moved] = reordered.splice(fromIdx, 1);
    if (!moved) return;
    reordered.splice(toIdx, 0, moved);

    const updated = reordered.map((d, idx) => ({ ...d, order: idx + 1 }));

    if (webPageNodeId && actionId) {
      reorderActionStepEdges(updated, webPageNodeId, actionId);
    }

    setDrafts(updated);
    onSave(updated);
  };

  const runtimePlan = getActionFlowRuntime(item, canvasSteps, drafts);

  return (
    <div className="space-y-3">
      {/* Top Header matching PipelineStepEditor */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground">
              Pipeline Steps
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {drafts.length} {drafts.length === 1 ? "step" : "steps"}
            </Badge>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Explicit field-level bindings per step — compiler generates client interaction flow.
        </p>
      </div>

      {/* Real-time Incoming Data Payload Card at top of pipeline steps */}
      {isRealtime && (
        <IncomingRealtimePayloadCard
          eventName={realtimeEventName || item?.name}
          protocol={realtimeProtocol}
          sourceServiceLabel={realtimeSourceLabel}
          sourceItemName={realtimeSourceItemName}
          incomingPaths={incomingPaths}
          isLangGraph={isLangGraph}
          langGraphStreamModes={langGraphStreamModes}
        />
      )}

      {/* Steps List with Drag & Drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="frontend-action-steps-droppable">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="space-y-2"
            >
              {drafts.length === 0 ? (
                <div className="p-4 border border-dashed rounded-lg bg-muted/10 text-center space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    No action steps configured.
                  </p>
                  <p className="text-[11px] text-muted-foreground/80">
                    Use the toolbar below to add API requests, state manipulators, uploads, or navigation.
                  </p>
                </div>
              ) : (
                drafts.map((step, idx) => {
                  const matchingCanvasStep = canvasSteps.find(
                    (cs) => cs.edgeId === step.edgeId || cs.step === step.order,
                  );

                  return (
                    <FrontendStepRow
                      key={step.id}
                      step={step}
                      index={idx}
                      canvasStep={matchingCanvasStep}
                      allSteps={drafts}
                      allCanvasSteps={canvasSteps}
                      allNodes={allNodes}
                      serviceNodes={serviceNodes}
                      endpoints={endpoints}
                      webPageNodeId={webPageNodeId}
                      actionId={actionId}
                      actionItem={item}
                      isProtected={isProtected}
                      incomingPaths={incomingPaths}
                      isItemScoped={effectiveIsItemScoped}
                      itemKeyField={effectiveItemKey}
                      itemSourceStateName={itemSourceStateName}
                      itemPropSuggestions={itemPropSuggestions}
                      onChange={handleStepChange}
                      onDelete={() => handleDeleteStep(step.id)}
                    />
                  );
                })
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add Step Toolbar matching PipelineStepEditor */}
      <div className="pt-1">
        <FrontendAddStepToolbar onAddStep={handleAddStep} />
      </div>

      {/* Collapsible Runtime Execution Preview */}
      {drafts.length > 0 && (
        <div className="pt-2 border-t border-border/30">
          <button
            type="button"
            onClick={() => setShowRuntimePreview(!showRuntimePreview)}
            className="w-full flex items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground py-1 px-1 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Code2 size={12} />
              Runtime Execution Plan
            </span>
            {showRuntimePreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showRuntimePreview && (
            <div className="mt-1.5 p-2.5 rounded-md bg-muted/40 border text-[10px] font-mono whitespace-pre-wrap text-muted-foreground leading-relaxed">
              {runtimePlan}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
