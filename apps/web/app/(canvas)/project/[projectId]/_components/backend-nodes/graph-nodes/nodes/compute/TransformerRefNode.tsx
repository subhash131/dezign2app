"use client";

import React from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import {
  Shuffle,
  Settings,
  Trash,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Layers,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { BackendNode, PageSection, UIEventItem, FrontendActionStepDraft } from "@/types/canvas";
import { resolveWebPageActionInboundHandle } from "@/lib/stores/backendCanvas/edge/handlers/transformerConnect";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
  useServiceStepHandLayout,
} from "../../common";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";

export const TransformerRefNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const hasPipelineError = useNodePipelineError(id);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const nodes = useBackendCanvasStore((s) => s.nodes);

  const {
    cardIndex,
    totalCards,
    hasMultipleCards,
    isStacked,
    toggleStack,
    moveCard,
    bringCardToFront,
  } = useServiceStepHandLayout(id, nodes, edges, updateNode);
  const [isHovered, setIsHovered] = React.useState(false);

  // Collect all global transformer nodes available on the canvas
  const globalTransformers = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter(
        (n) => n?.type === "transformer" && n.data?.scope !== "local",
      ),
    ),
  );

  const selectedMaster = React.useMemo(() => {
    if (!data.transformerRef) return undefined;
    return globalTransformers.find(
      (t) =>
        t.id === data.transformerRef ||
        t.data?.functionName === data.transformerRef ||
        t.data?.label === data.transformerRef,
    );
  }, [globalTransformers, data.transformerRef]);

  // Ensure invisible reference edge exists between master transformer and this ref node
  React.useEffect(() => {
    if (!selectedMaster?.id) return;
    const exists = edges.some(
      (e) =>
        (e.type === "transformer-reference" || e.type === "reference") &&
        e.source === selectedMaster.id &&
        e.target === id,
    );
    if (!exists) {
      addEdge({
        id: `edge-ref-link-${selectedMaster.id}-${id}`,
        source: selectedMaster.id,
        target: id,
        sourceHandle: "transformer-out",
        targetHandle: "transformer-in",
        type: "transformer-reference",
      });
    }
  }, [selectedMaster?.id, id, edges, addEdge]);

  // Ensure outgoing connection edge exists between this ref node and target WebPage action
  React.useEffect(() => {
    let wp: BackendNode | undefined = data.targetWebPageId
      ? nodes.find((n: BackendNode): boolean => n.id === data.targetWebPageId)
      : undefined;

    if (!wp) {
      wp = nodes.find(
        (n: BackendNode): boolean =>
          n.type === "webPage" &&
          Boolean(
            (n.data?.sections || []).some((sec: PageSection): boolean =>
              (sec.actions || []).some((act: UIEventItem): boolean =>
                (act.actionSteps || []).some(
                  (s: FrontendActionStepDraft): boolean =>
                    s.type === "transform" &&
                    (s.transformerRefNodeId === id ||
                      (data.transformerRef !== undefined && s.transformerNodeId === data.transformerRef)),
                ),
              ),
            ),
          ),
      );
    }

    if (!wp) {
      const webPages: BackendNode[] = nodes.filter((n: BackendNode): boolean => n.type === "webPage");
      if (webPages.length === 1) {
        wp = webPages[0];
      }
    }

    if (!wp) return;

    let targetActId =
      data.targetActionId ||
      (Array.isArray(data.targetActionIds) && data.targetActionIds[0] ? data.targetActionIds[0] : "");

    const sections: PageSection[] = wp.data?.sections || [];
    for (const sec of sections) {
      for (const act of sec.actions || []) {
        const hasStep = (act.actionSteps || []).some(
          (s: FrontendActionStepDraft): boolean =>
            s.type === "transform" &&
            (s.transformerRefNodeId === id ||
              (data.transformerRef !== undefined && s.transformerNodeId === data.transformerRef)),
        );
        if (hasStep) {
          targetActId = act.id;
          break;
        }
      }
      if (targetActId && targetActId !== data.targetActionId) break;
    }

    const { handle: targetHandle, actionId } = resolveWebPageActionInboundHandle(wp, targetActId);
    if (!actionId || !targetHandle) return;

    const existingEdge = edges.find(
      (e) =>
        e.source === id &&
        e.target === wp!.id &&
        (e.type === "connection" || !e.type),
    );

    if (existingEdge) {
      if (existingEdge.targetHandle !== targetHandle || existingEdge.sourceHandle !== "transformer-out") {
        useBackendCanvasStore.getState().updateEdge(existingEdge.id, {
          sourceHandle: "transformer-out",
          targetHandle,
          type: "connection",
        });
      }
    } else {
      addEdge({
        id: `edge-ref-${id}-${actionId}-${Date.now()}`,
        source: id,
        target: wp.id,
        sourceHandle: "transformer-out",
        targetHandle,
        type: "connection",
        data: { sequenceOrder: 1, label: "1" },
      });
    }

    if (data.targetWebPageId !== wp.id || data.targetActionId !== actionId) {
      updateNode(id, {
        data: {
          ...data,
          targetWebPageId: wp.id,
          targetActionId: actionId,
          targetActionIds: [actionId],
        },
      });
    }
  }, [id, data, edges, nodes, addEdge, updateNode]);

  const handleMasterChange = (masterId: string) => {
    const master = globalTransformers.find((t) => t.id === masterId);
    const fnName =
      master?.data?.functionName || master?.data?.label || "Transformer Ref";

    // Clean up old reference edges
    edges
      .filter(
        (e) =>
          (e.type === "transformer-reference" || e.type === "reference") &&
          e.target === id &&
          e.source !== masterId,
      )
      .forEach((e) => deleteEdge(e.id));

    updateNode(id, {
      data: {
        ...data,
        transformerRef: masterId,
        label: `${fnName} (Ref)`,
      },
    });

    if (masterId) {
      const exists = edges.some(
        (e) =>
          (e.type === "transformer-reference" || e.type === "reference") &&
          e.source === masterId &&
          e.target === id,
      );
      if (!exists) {
        addEdge({
          id: `edge-ref-link-${masterId}-${id}`,
          source: masterId,
          target: id,
          sourceHandle: "transformer-out",
          targetHandle: "transformer-in",
          type: "transformer-reference",
        });
      }
    }
  };

  const handleOpenConfig = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedMaster) {
      setActiveConfigItem({
        id: selectedMaster.id,
        nodeId: selectedMaster.id,
        type: "transformer",
      });
    } else {
      setActiveConfigItem({
        id,
        nodeId: id,
        type: "transformer_ref",
      });
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  return (
    <div
      onClick={(e) => {
        if (isStacked) {
          e.stopPropagation();
          bringCardToFront();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        zIndex: isStacked
          ? selected
            ? 1000
            : 10 + cardIndex
          : selected
            ? 1000
            : undefined,
      }}
      className={cn(
        "group relative flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-card/95 backdrop-blur border-2 min-w-[240px] max-w-[280px] shadow-md transition-all duration-150 cursor-pointer select-none",
        isStacked && "shadow-lg backdrop-blur-sm",
        isStacked && (selected || isHovered) && "ring-2 ring-purple-500/50 shadow-2xl scale-[1.01] border-purple-500",
        selected
          ? "border-purple-500 shadow-purple-500/15 ring-1 ring-purple-500/20"
          : "border-border/80 hover:border-purple-500/50 hover:shadow-lg",
        hasPipelineError &&
          "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      <div className="flex items-center justify-between gap-2.5 w-full">
        {/* Icon + Global Selector */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
          <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0">
            <Shuffle size={14} />
          </div>

          <div className="flex flex-col min-w-0 flex-1 overflow-hidden nodrag">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[8px] uppercase font-bold tracking-wider text-purple-600 dark:text-purple-400">
                Transformer Ref
              </span>
              <span className="text-[7px] font-mono px-1 py-0.2 rounded font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                GLOBAL
              </span>
              {hasPipelineError && (
                <span className="text-[7px] font-medium px-1 py-0.2 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse">
                  <AlertTriangle size={8} />
                  Unmapped
                </span>
              )}
            </div>

            <Select
              value={selectedMaster?.id || data.transformerRef || ""}
              onValueChange={handleMasterChange}
            >
              <SelectTrigger className="h-6 !w-full max-w-[155px] min-w-0 text-xs font-mono font-semibold bg-background/60 border-border/70 hover:border-purple-500/50 px-2 py-0 truncate overflow-hidden">
                <SelectValue placeholder="Select global..." />
              </SelectTrigger>
              <SelectContent className="nodrag">
                {globalTransformers.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground italic">
                    No global transformers on canvas
                  </div>
                ) : (
                  globalTransformers.map((t) => (
                    <SelectItem
                      key={t.id}
                      value={t.id}
                      className="text-xs font-mono"
                    >
                      {t.data?.functionName || t.data?.label || "Transformer"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action Buttons: Deck Controls + Gear (Settings) + Delete */}
        <div
          className="flex items-center gap-1 shrink-0 nodrag"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {hasMultipleCards && (
            <div className="flex items-center gap-1 shrink-0 mr-0.5">
              {isStacked ? (
                <div className="flex items-center rounded text-[8px] font-mono font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 overflow-hidden shrink-0">
                  {cardIndex > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveCard("up");
                      }}
                      className="px-1 py-0.5 hover:bg-purple-500/30 text-purple-400 hover:text-purple-200 transition-colors cursor-pointer"
                      title="Move step up in stack"
                    >
                      <ChevronUp size={9} />
                    </button>
                  )}
                  <span
                    className="px-1.5 py-0.5 flex items-center gap-0.5"
                    title={`Step ${cardIndex + 1} of ${totalCards} (stacked)`}
                  >
                    <Layers size={8} />
                    <span>{cardIndex + 1}/{totalCards}</span>
                  </span>
                  {cardIndex < totalCards - 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moveCard("down");
                      }}
                      className="px-1 py-0.5 hover:bg-purple-500/30 text-purple-400 hover:text-purple-200 transition-colors cursor-pointer"
                      title="Move step down in stack"
                    >
                      <ChevronDown size={9} />
                    </button>
                  )}
                </div>
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStack();
                }}
                className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                title={isStacked ? "Fan out steps" : "Stack steps into deck"}
              >
                {isStacked ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
              </button>
            </div>
          )}
          <button
            className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
            onClick={handleOpenConfig}
            title={
              selectedMaster
                ? "Edit Master Transformer"
                : "Configure Transformer Ref"
            }
          >
            <Settings size={13} />
          </button>
          <button
            className="p-1 rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={handleDelete}
            title="Delete Node"
          >
            <Trash size={13} />
          </button>
        </div>
      </div>

      {hasPipelineError && (
        <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-destructive/10 border border-destructive/20 text-[10px] text-destructive leading-tight">
          <AlertTriangle size={11} className="shrink-0" />
          <span className="font-medium">Missing required input mapping</span>
        </div>
      )}

      {/* Left target handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="transformer-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "!bg-purple-500 border-2 border-background hover:scale-125 transition-all",
        )}
      />

      {/* Right source handle to connect to endpoints */}
      <Handle
        type="source"
        position={Position.Right}
        id="transformer-out"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
          "!bg-purple-500 border-2 border-background hover:scale-125 transition-all",
        )}
      />
    </div>
  );
};
