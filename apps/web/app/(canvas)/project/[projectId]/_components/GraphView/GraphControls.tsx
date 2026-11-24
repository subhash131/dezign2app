import React, { useCallback } from "react";
import {
  Panel,
  useReactFlow,
  useStore,
  useStoreApi,
  type ReactFlowStoreState,
} from "@xyflow/react";
import { Plus, Minus, Maximize2, Lock, Unlock } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";

export interface GraphControlsProps {
  style?: React.CSSProperties;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  flowNodesToFit?: { id: string }[];
}

export const GraphControls: React.FC<GraphControlsProps> = React.memo(
  ({ style, className, minZoom = 0.01, maxZoom = 3, flowNodesToFit }) => {
    const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow();
    // Select only zoom from the internal transform — avoids re-renders on pan (x/y changes)
    const zoom = useStore((s: ReactFlowStoreState) => s.transform[2]);

    const store = useStoreApi();
    const isInteractive = useStore(
      (s: ReactFlowStoreState) => s.nodesDraggable && s.elementsSelectable,
    );

    const isMinZoom = zoom <= minZoom + 0.005;
    const isMaxZoom = zoom >= maxZoom - 0.005;
    const zoomPercent = Math.round(zoom * 100);

    const handleZoomIn = useCallback(() => {
      zoomIn({ duration: 300 });
    }, [zoomIn]);

    const handleZoomOut = useCallback(() => {
      zoomOut({ duration: 300 });
    }, [zoomOut]);

    const handleResetZoom = useCallback(() => {
      zoomTo(1, { duration: 300 });
    }, [zoomTo]);

    const handleFitView = useCallback(() => {
      fitView({
        nodes: flowNodesToFit && flowNodesToFit.length > 0 ? flowNodesToFit : undefined,
        duration: 350,
        padding: 0.35,
        maxZoom: 0.65,
      });
    }, [fitView, flowNodesToFit]);

    const handleToggleInteractive = useCallback(() => {
      const next = !isInteractive;
      store.setState({
        nodesDraggable: next,
        nodesConnectable: next,
        elementsSelectable: next,
      });
    }, [isInteractive, store]);

    return (
      <Panel
        position="bottom-left"
        className={`pointer-events-auto select-none ${className || ""}`}
        style={style}
      >
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-col items-center gap-0.5 p-1 rounded-xl bg-sidebar/95 backdrop-blur-md border border-sidebar-border shadow-lg">
            {/* Zoom In */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors disabled:opacity-30"
                  onClick={handleZoomIn}
                  disabled={isMaxZoom}
                  aria-label="Zoom in"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Zoom In <kbd className="text-[10px] opacity-70 ml-1 font-mono">Ctrl +</kbd>
              </TooltipContent>
            </Tooltip>

            {/* Zoom Percentage / Reset to 100% */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="w-full py-0.5 px-1 rounded text-[10px] font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors text-center cursor-pointer select-none"
                  aria-label={`Current zoom: ${zoomPercent}%. Click to reset to 100%`}
                >
                  {zoomPercent}%
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Reset zoom to 100%
              </TooltipContent>
            </Tooltip>

            {/* Zoom Out */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors disabled:opacity-30"
                  onClick={handleZoomOut}
                  disabled={isMinZoom}
                  aria-label="Zoom out"
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Zoom Out <kbd className="text-[10px] opacity-70 ml-1 font-mono">Ctrl -</kbd>
              </TooltipContent>
            </Tooltip>

            <div className="w-4 h-px bg-sidebar-border my-0.5" />

            {/* Fit View */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  onClick={handleFitView}
                  aria-label="Fit view"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-primary" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Fit View <kbd className="text-[10px] opacity-70 ml-1 font-mono">Ctrl 0</kbd>
              </TooltipContent>
            </Tooltip>

            {/* Lock / Interactivity Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                  onClick={handleToggleInteractive}
                  aria-label={isInteractive ? "Lock canvas interactions" : "Unlock canvas interactions"}
                >
                  {isInteractive ? (
                    <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {isInteractive ? "Lock interactions" : "Unlock interactions"}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </Panel>
    );
  },
);

GraphControls.displayName = "GraphControls";
