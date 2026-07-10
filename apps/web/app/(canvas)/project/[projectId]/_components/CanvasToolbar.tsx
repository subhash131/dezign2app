"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, MonitorPlay, Network, Workflow, Sparkles, LayoutGrid } from "lucide-react";
import { CanvasMode, BackendCanvasView } from "@/types/canvas";
import { Button } from "@workspace/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Separator } from "@workspace/ui/components/separator";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

interface CanvasToolbarProps {
  projectName: string;
  mode: CanvasMode;
  setMode: (mode: CanvasMode) => void;
  view: BackendCanvasView;
  setView: (view: BackendCanvasView) => void;
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;
}

export function CanvasToolbar({
  projectName,
  mode,
  setMode,
  view,
  setView,
  aiPanelOpen,
  setAiPanelOpen,
}: CanvasToolbarProps) {
  // We can hook into the store for auto-layout if needed
  // const runAutoLayout = useBackendCanvasStore(s => s.runAutoLayout); // to be implemented

  return (
    <div className="flex items-center justify-between h-14 px-4 border-b bg-background shrink-0">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="font-medium text-sm truncate max-w-[200px]">{projectName}</div>
      </div>

      <div className="flex items-center space-x-6">
        <Tabs value={mode} onValueChange={(v) => setMode(v as CanvasMode)} className="w-[300px]">
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="frontend" className="text-xs">
              <MonitorPlay className="w-3.5 h-3.5 mr-2" />
              Frontend UI
            </TabsTrigger>
            <TabsTrigger value="backend" className="text-xs">
              <Network className="w-3.5 h-3.5 mr-2" />
              Backend System
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "backend" && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <Tabs value={view} onValueChange={(v) => setView(v as BackendCanvasView)} className="w-[200px]">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="graph" className="text-xs">
                  <Network className="w-3 h-3 mr-1.5" />
                  Graph
                </TabsTrigger>
                <TabsTrigger value="sequence" className="text-xs">
                  <Workflow className="w-3 h-3 mr-1.5" />
                  Sequence
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => {
               // runAutoLayout()
            }}>
              <LayoutGrid className="w-3.5 h-3.5 mr-2" />
              Auto-layout
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center">
        <Button
          variant={aiPanelOpen ? "secondary" : "ghost"}
          size="sm"
          className="h-9"
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
        >
          <Sparkles className="w-4 h-4 mr-2 text-primary" />
          AI Assistant
        </Button>
      </div>
    </div>
  );
}
