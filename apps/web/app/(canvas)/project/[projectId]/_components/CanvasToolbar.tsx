"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Network, Workflow, Sparkles, Database, RefreshCw, Trash2 } from "lucide-react";
import { BackendCanvasView } from "@/types/canvas";
import { Button } from "@workspace/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { toast } from "sonner";
import { useAuth } from "@clerk/nextjs";
import { Label } from "@workspace/ui/components/label";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { FlaskConical } from "lucide-react";

interface CanvasToolbarProps {
  projectName: string;
  projectId: string;
  view: BackendCanvasView;
  setView: (view: BackendCanvasView) => void;
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;
}

export function CanvasToolbar({
  projectName,
  projectId,
  view,
  setView,
  aiPanelOpen,
  setAiPanelOpen,
}: CanvasToolbarProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const { getToken } = useAuth();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const token = await getToken({ template: "convex" });
      const res = await fetch(`${window.location.origin}/api/sync-supermemory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, token }),
      });

      if (!res.ok) {
        throw new Error("Failed to sync");
      }

      toast.success("Successfully synced context to Supermemory!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to sync context.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    try {
      const token = await getToken({ template: "convex" });
      const res = await fetch("/api/clear-supermemory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, token }),
      });

      if (!res.ok) {
        throw new Error("Failed to clear");
      }

      toast.success("Successfully cleared context from Supermemory!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to clear context.");
    } finally {
      setIsClearing(false);
    }
  };

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
      <div className="flex items-center justify-center flex-1">
        <Tabs value={view} onValueChange={(v) => setView(v as BackendCanvasView)} className="w-[300px]">
          <TabsList className="grid w-fit grid-cols-2 h-9">
            <TabsTrigger value="graph" className={`${view === "graph" ? "text-foreground!" : ""}`}>
              <Network className="w-3 h-3 mr-1.5" />
              Graph
            </TabsTrigger>
            <TabsTrigger value="schema" className={`${view === "schema" ? "text-foreground!" : ""}`}>
              <Database className="w-3 h-3 mr-1.5" />
              Schema
            </TabsTrigger>
            {/* <TabsTrigger value="sequence" className="text-xs">
              <Workflow className="w-3 h-3 mr-1.5" />
              Sequence
            </TabsTrigger> */}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center space-x-2">
        <div className="flex items-center gap-2 bg-sidebar py-1 px-2 rounded-lg">
          <Label>MCP</Label>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing || isClearing}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleClear}
              disabled={isClearing || isSyncing}
            >
              <Trash2 className={`w-4 h-4 ${isClearing ? "animate-pulse" : ""}`} />
            </Button>
          </div>
        </div>
        <Button
          variant={"secondary"}
          size="sm"
          className="py-3.5"
          onClick={() => useSimulationStore.getState().toggleTestExplorer()}
        >
          <FlaskConical className="w-4 h-4 mr-2 text-primary" />
          Test Explorer
        </Button>
        <Button
          variant={"secondary"}
          size="sm"
          className="py-3.5"
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
        >
          <Sparkles className="w-4 h-4 mr-2 text-primary" />
          AI Assistant
        </Button>
      </div>
    </div>
  );
}
