import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Compass, Globe, Trash, AlertTriangle } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
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

  // Available WebPage nodes on canvas
  const pageNodes = useBackendCanvasStore(
    useShallow((s) =>
      s.nodes.filter((n) => n?.type === "webPage"),
    ),
  );

  // Selected target page node
  const selectedPage = pageNodes.find((p) => p.id === (data.targetPageId || data.pageRefId));

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    requestDeleteNode(id);
  };

  const handlePageSelect = (pageId: string) => {
    const page = pageNodes.find((p) => p.id === pageId);
    const pageLabel = page?.data?.label || "Page";
    const cleanLabel = pageLabel.trim().toLowerCase();
    const isRoot =
      page?.data?.isRoot === true ||
      cleanLabel === "/";

    updateNode(id, {
      data: {
        ...data,
        targetPageId: pageId,
        pageRefId: pageId,
        targetPageLabel: pageLabel,
        label: `Ref: ${isRoot ? "/" : pageLabel}`,
      },
    });

    // Synchronize connected push_to_client steps on Service endpoints or consumers
    const incomingEdges = edges.filter((e) => e.target === id);
    const store = useBackendCanvasStore.getState();
    incomingEdges.forEach((edge) => {
      if (edge.sourceHandle?.startsWith("endpoint-out-")) {
        const epId = edge.sourceHandle.replace("endpoint-out-", "");
        const ep = store.endpoints.find((e) => e.id === epId);
        if (ep && ep.pipelineSteps) {
          const hasPushStep = ep.pipelineSteps.some((s) => s.type === "push_to_client");
          if (hasPushStep) {
            const updatedSteps = ep.pipelineSteps.map((s) => {
              if (s.type === "push_to_client" && (s.clientDeliveryPageRefNodeId === id || !s.clientDeliveryPageRefNodeId)) {
                return {
                  ...s,
                  clientDeliveryTargetPageId: pageId,
                  clientDeliveryPageRefNodeId: id,
                };
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
                return {
                  ...s,
                  clientDeliveryTargetPageId: pageId,
                  clientDeliveryPageRefNodeId: id,
                };
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
    selectedPage?.data?.isRoot === true ||
    selectedCleanLabel === "/";

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[210px] max-w-[320px] flex flex-col transition-all duration-300 relative",
        selected ? "border-indigo-500" : "border-transparent",
        hasPipelineError &&
          "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
        borderClass,
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="page-ref-in"
        className="w-2.5 h-2.5 !bg-indigo-500 rounded-full border-2 border-background -left-1.5"
        style={{ top: "18px" }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="ref-in"
        className="w-2.5 h-2.5 !bg-indigo-500 rounded-full border-2 border-background -left-1.5 opacity-0 pointer-events-none"
        style={{ top: "18px" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="ref-out"
        className="w-2.5 h-2.5 !bg-indigo-500 rounded-full border-2 border-background -right-1.5"
        style={{ top: "18px" }}
      />

      <div className="p-3 bg-indigo-500/10 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1 rounded bg-indigo-500/20 text-indigo-400 shrink-0">
            <Compass size={14} />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                Page Ref
              </span>
              {hasPipelineError && (
                <span className="text-[7px] font-medium px-1 py-0.2 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse">
                  <AlertTriangle size={8} />
                  Unmapped
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-foreground truncate">
              {selectedPage ? selectedPage.data?.label || "Untitled Page" : "Select Target"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isSelectedLanding && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono shrink-0">
              / (Root)
            </span>
          )}
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
            <Globe size={10} /> Target Page
          </label>
          <Select
            value={data.targetPageId || ""}
            onValueChange={handlePageSelect}
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue placeholder="Select a page to reference..." />
            </SelectTrigger>
            <SelectContent>
              {pageNodes.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground text-center">
                  No pages defined on canvas
                </div>
              ) : (
                pageNodes.map((p) => {
                  const label = p.data?.label || "Untitled Page";
                  const clean = label.trim().toLowerCase();
                  const isHome =
                    p.data?.isRoot === true ||
                    clean === "/";
                  return (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <div className="flex items-center justify-between w-full gap-2">
                        <span className="font-medium truncate">{label}</span>
                        {isHome && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-mono">
                            / (Root)
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
