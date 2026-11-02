"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Network,
  Database,
  Hammer,
  Cloud,
  Code,
  Undo2,
  Redo2,
  GitCommit,
  History,
} from "lucide-react";
import { BackendCanvasView } from "@/types/canvas";
import { Button } from "@workspace/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { AppUpdateToolbarButton } from "./AppUpdateIndicator";

interface CanvasToolbarProps {
  projectName: string;
  projectId: string;
  view: BackendCanvasView;
  setView?: (view: BackendCanvasView) => void;
  onOpenCommit: () => void;
  onOpenHistory: () => void;
}

export function CanvasToolbar({
  projectName,
  projectId,
  view,
  setView,
  onOpenCommit,
  onOpenHistory,
}: CanvasToolbarProps): React.JSX.Element {
  const canUndo = useBackendCanvasStore((s) =>
    view === "schema"
      ? s.schemaUndoStack.length > 0
      : s.graphUndoStack.length > 0,
  );
  const canRedo = useBackendCanvasStore((s) =>
    view === "schema"
      ? s.schemaRedoStack.length > 0
      : s.graphRedoStack.length > 0,
  );
  const undoSchema = useBackendCanvasStore((s) => s.undoSchema);
  const undoGraph = useBackendCanvasStore((s) => s.undoGraph);
  const redoSchema = useBackendCanvasStore((s) => s.redoSchema);
  const redoGraph = useBackendCanvasStore((s) => s.redoGraph);

  const handleUndo = () => {
    if (view === "schema") {
      undoSchema();
    } else {
      undoGraph();
    }
  };

  const handleRedo = () => {
    if (view === "schema") {
      redoSchema();
    } else {
      redoGraph();
    }
  };

  return (
    <div className="flex items-center justify-between h-14 px-4 border-b bg-background shrink-0">
      <div className="flex items-center space-x-3">
        {view === "schema" && setView ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setView("graph")}
            title="Back to Graph Canvas"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link
              href={view === "schema" ? `/project/${projectId}?view=graph` : "/projects"}
              title={view === "schema" ? "Back to Graph Canvas" : "Back to Projects"}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        )}

        <div className="font-medium text-sm truncate max-w-[180px]">
          {projectName}
        </div>

        {/* Undo / Redo buttons */}
        <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/50">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground disabled:opacity-30 hover:text-foreground"
                disabled={!canUndo}
                onClick={handleUndo}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Undo (Ctrl+Z)
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground disabled:opacity-30 hover:text-foreground"
                disabled={!canRedo}
                onClick={handleRedo}
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Redo (Ctrl+Y / Ctrl+Shift+Z)
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex items-center justify-center flex-1">
        <div className="bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1">
          {setView ? (
            <>
              <button
                type="button"
                onClick={() => setView("graph")}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  view === "graph"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                )}
              >
                <Network className="w-3 h-3 mr-1.5" />
                Graph
              </button>
              <button
                type="button"
                onClick={() => setView("schema")}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  view === "schema"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                )}
              >
                <Database className="w-3 h-3 mr-1.5" />
                Schema
              </button>
            </>
          ) : (
            <>
              <Link
                href={`/project/${projectId}?view=graph`}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  view === "graph"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                )}
              >
                <Network className="w-3 h-3 mr-1.5" />
                Graph
              </Link>
              <Link
                href={`/project/${projectId}?view=schema`}
                className={cn(
                  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  view === "schema"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                )}
              >
                <Database className="w-3 h-3 mr-1.5" />
                Schema
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {/* Version History Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="py-3.5 h-8 gap-1.5 text-xs font-medium"
              onClick={onOpenHistory}
            >
              <History className="w-3.5 h-3.5 text-primary" />
              <span>History</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            View version checkpoints & audit history
          </TooltipContent>
        </Tooltip>

        {/* Commit Checkpoint Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="py-3.5 h-8 gap-1.5 text-xs font-medium border-primary/20 hover:bg-primary/5"
              onClick={onOpenCommit}
            >
              <GitCommit className="w-3.5 h-3.5 text-primary" />
              <span>Commit</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Create a version checkpoint snapshot
          </TooltipContent>
        </Tooltip>

        <AppUpdateToolbarButton />

        <Button asChild variant={"secondary"} size="sm" className="py-3.5 h-8">
          <Link href={"#"}>
            <Cloud className="mr-1 w-3.5 h-3.5" />
            Deploy
          </Link>
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={"secondary"}
              size="sm"
              className="py-3.5 h-8"
              asChild
            >
              <Link href={`/project/${projectId}/compiler`}>
                <Code className="w-4 h-4 mr-1 text-primary" />
                Code
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64 p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-background">
                <Hammer className="w-3.5 h-3.5" />
                <span>Monorepo IDE & Compiler</span>
              </div>
              <p className="text-[11px] text-background/80 leading-relaxed">
                Open full IDE page with Monaco editor, terminal, and AI agent to edit function bodies.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>

      </div>
    </div>
  );
}
