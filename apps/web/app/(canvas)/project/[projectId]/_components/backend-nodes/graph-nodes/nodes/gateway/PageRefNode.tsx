import React, { useMemo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Compass, Globe, Trash, AlertTriangle, LayoutTemplate } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";

import {
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";
import {
  upsertDerivedConnection,
  removeDerivedConnection,
} from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor/pushToClientUtils";
import {
  resolvePageRefTargets,
  ensureLayoutNodeForTarget,
  isLayoutNode,
  getLayoutNodeDetails,
} from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor/reference-connections/pageRefLayoutUtils";

export const PageRefNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const hasPipelineError = useNodePipelineError(id);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const requestDeleteNode = useBackendCanvasStore((s) => s.requestDeleteNode);
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  // Available Pages & Layouts
  const { pages: pageTargets, layouts: layoutTargets } = useMemo(
    () => resolvePageRefTargets(nodes, edges),
    [nodes, edges],
  );

  // Available WebPage nodes on canvas
  const pageNodes = useMemo(
    () => nodes.filter((n) => n?.type === "webPage"),
    [nodes],
  );

  // Selected target page or layout node
  const selectedTargetId = data.targetPageId || data.pageRefId || "";
  const selectedPage = pageNodes.find((p) => p.id === selectedTargetId);
  const isSelectedLayout = isLayoutNode(selectedPage);
  const layoutDetails =
    isSelectedLayout && selectedPage
      ? getLayoutNodeDetails(selectedPage, nodes, edges)
      : null;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  const handlePageSelect = (selectedVal: string) => {
    // Ensure actual layout node exists on canvas if a layout target was selected
    const resolvedPageId = ensureLayoutNodeForTarget(selectedVal, nodes, edges);
    const store = useBackendCanvasStore.getState();
    const page = store.nodes.find((p) => p.id === resolvedPageId);
    const isLayout = isLayoutNode(page);
    const details = isLayout && page ? getLayoutNodeDetails(page, store.nodes, store.edges) : null;
    const pageLabel = page?.data?.label || "Page";
    const cleanLabel = pageLabel.trim().toLowerCase();
    const isRoot = !isLayout && (page?.data?.isRoot === true || cleanLabel === "/");
    const displayLabel = details ? details.displayTitle : isRoot ? "/" : pageLabel;

    updateNode(id, {
      data: {
        ...data,
        targetPageId: resolvedPageId,
        pageRefId: resolvedPageId,
        targetPageLabel: displayLabel,
        label: `Ref: ${displayLabel}`,
      },
    });

    // Synchronize connected push_to_client steps on Service endpoints or consumers
    const incomingEdges = edges.filter((e) => e.target === id);
    incomingEdges.forEach((edge) => {
      if (edge.sourceHandle?.startsWith("endpoint-out-")) {
        const epId = edge.sourceHandle.replace("endpoint-out-", "");
        const ep = store.endpoints.find((e) => e.id === epId);
        if (ep && ep.pipelineSteps) {
          const hasPushStep = ep.pipelineSteps.some(
            (s) => s.type === "push_to_client" || (s.type === "langgraph_invoke" && s.langGraphStreamingEnabled),
          );
          if (hasPushStep) {
            const updatedSteps = ep.pipelineSteps.map((s) => {
              if (
                (s.type === "push_to_client" || (s.type === "langgraph_invoke" && s.langGraphStreamingEnabled)) &&
                (s.clientDeliveryPageRefNodeId === id || !s.clientDeliveryPageRefNodeId)
              ) {
                const prevTargetPageId = s.clientDeliveryTargetPageId;
                if (prevTargetPageId && prevTargetPageId !== resolvedPageId) {
                  removeDerivedConnection(store, prevTargetPageId, s.id);
                }
                const updatedStep = {
                  ...s,
                  clientDeliveryTargetPageId: resolvedPageId,
                  clientDeliveryPageRefNodeId: id,
                };
                upsertDerivedConnection(
                  store,
                  resolvedPageId,
                  updatedStep,
                  edge.source,
                  ep.name || "Endpoint",
                  ep.id,
                  "endpoint",
                );
                return updatedStep;
              }
              return s;
            });
            store.updateEndpoint(ep.id, { pipelineSteps: updatedSteps });
          }
        }
      } else if (edge.sourceHandle?.startsWith("consumedEvents-out-")) {
        const evId = edge.sourceHandle.replace("consumedEvents-out-", "");
        const ev = store.events.find((e) => e.id === evId);
        if (ev && ev.pipelineSteps) {
          const hasPushStep = ev.pipelineSteps.some((s) => s.type === "push_to_client");
          if (hasPushStep) {
            const updatedSteps = ev.pipelineSteps.map((s) => {
              if (s.type === "push_to_client" && (s.clientDeliveryPageRefNodeId === id || !s.clientDeliveryPageRefNodeId)) {
                const prevTargetPageId = s.clientDeliveryTargetPageId;
                if (prevTargetPageId && prevTargetPageId !== resolvedPageId) {
                  removeDerivedConnection(store, prevTargetPageId, s.id);
                }
                const updatedStep = {
                  ...s,
                  clientDeliveryTargetPageId: resolvedPageId,
                  clientDeliveryPageRefNodeId: id,
                };
                upsertDerivedConnection(
                  store,
                  resolvedPageId,
                  updatedStep,
                  edge.source,
                  ev.name || "Event",
                  ev.id,
                  "event",
                );
                return updatedStep;
              }
              return s;
            });
            store.updateEvent(ev.id, { pipelineSteps: updatedSteps });
          }
        }
      }
    });
  };

  const selectedCleanLabel = (selectedPage?.data?.label || "").trim().toLowerCase();
  const isSelectedLanding =
    !isSelectedLayout &&
    (selectedPage?.data?.isRoot === true || selectedCleanLabel === "/");

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[210px] max-w-[320px] flex flex-col transition-all duration-300 relative",
        selected ? (isSelectedLayout ? "border-purple-500" : "border-indigo-500") : "border-transparent",
        hasPipelineError &&
          "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
        borderClass,
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="page-ref-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          isSelectedLayout ? "!bg-purple-500" : "!bg-indigo-500",
          "rounded-full !border-2 !border-background hover:scale-125 transition-all",
        )}
        style={{ top: "18px" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="ref-in"
        className={cn("opacity-0 pointer-events-none", CANVAS_HANDLE_LEFT_OFFSET_CLASS)}
        style={{ top: "18px" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="ref-out"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
          isSelectedLayout ? "!bg-purple-500" : "!bg-indigo-500",
          "rounded-full !border-2 !border-background hover:scale-125 transition-all",
        )}
        style={{ top: "18px" }}
      />

      <div
        className={cn(
          "p-3 border-b flex items-center justify-between gap-2",
          isSelectedLayout ? "bg-purple-500/10" : "bg-indigo-500/10",
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={cn(
              "p-1 rounded shrink-0",
              isSelectedLayout ? "bg-purple-500/20 text-purple-400" : "bg-indigo-500/20 text-indigo-400",
            )}
          >
            {isSelectedLayout ? <LayoutTemplate size={14} /> : <Compass size={14} />}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  isSelectedLayout ? "text-purple-400" : "text-indigo-400",
                )}
              >
                {isSelectedLayout ? "Layout Ref" : "Page Ref"}
              </span>
              {hasPipelineError && (
                <span className="text-[7px] font-medium px-1 py-0.2 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse">
                  <AlertTriangle size={8} />
                  Unmapped
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-foreground truncate">
              {layoutDetails
                ? layoutDetails.displayTitle
                : selectedPage
                  ? selectedPage.data?.label || "Untitled Page"
                  : "Select Target"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isSelectedLayout ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono shrink-0">
              {layoutDetails?.zoneSlug ? `(${layoutDetails.zoneSlug})` : "Layout"}
            </span>
          ) : isSelectedLanding ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono shrink-0">
              / (Root)
            </span>
          ) : null}
          <button
            type="button"
            className="p-1 rounded hover:bg-destructive/15 text-muted-foreground/60 hover:text-destructive transition-colors cursor-pointer"
            onClick={handleDelete}
            title="Delete Node"
          >
            <Trash size={13} />
          </button>
        </div>
      </div>

      {hasPipelineError && (
        <div className="flex items-center gap-1 px-2.5 py-1.5 bg-destructive/10 border-b border-destructive/20 text-[10px] text-destructive leading-tight">
          <AlertTriangle size={11} className="shrink-0" />
          <span className="font-medium">Missing required input mapping</span>
        </div>
      )}

      <div className="p-3 bg-secondary/5 flex flex-col gap-2 nodrag rounded-b-[10px]">
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
            {isSelectedLayout ? (
              <LayoutTemplate size={10} className="text-purple-400" />
            ) : (
              <Globe size={10} />
            )}
            <span>Target {isSelectedLayout ? "Layout" : "Page"}</span>
          </label>
          <Select
            value={data.targetPageId || ""}
            onValueChange={handlePageSelect}
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue placeholder="Select a page or layout to reference..." />
            </SelectTrigger>
            <SelectContent>
              {pageTargets.length === 0 && layoutTargets.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground text-center">
                  No pages or layouts defined on canvas
                </div>
              ) : (
                <>
                  {pageTargets.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground flex items-center gap-1 px-2 py-1">
                        <Globe size={10} className="text-indigo-400" />
                        <span>Pages</span>
                      </SelectLabel>
                      {pageTargets.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="font-medium truncate">{p.label}</span>
                            {p.isRoot && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-mono">
                                / (Root)
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}

                  {layoutTargets.length > 0 && (
                    <>
                      {pageTargets.length > 0 && <SelectSeparator className="my-1" />}
                      <SelectGroup>
                        <SelectLabel className="text-[9px] uppercase tracking-wider font-bold text-purple-400 flex items-center gap-1 px-2 py-1">
                          <LayoutTemplate size={10} />
                          <span>Layouts (Persistent Stream)</span>
                        </SelectLabel>
                        {layoutTargets.map((l) => (
                          <SelectItem key={l.id} value={l.id} className="text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <LayoutTemplate size={11} className="text-purple-400 shrink-0" />
                              <span className="font-medium truncate">{l.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </>
                  )}
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
