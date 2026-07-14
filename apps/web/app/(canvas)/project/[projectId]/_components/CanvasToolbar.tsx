"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Network, Workflow, Sparkles, Database, RefreshCw } from "lucide-react";
import { BackendCanvasView } from "@/types/canvas";
import { Button } from "@workspace/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { toast } from "sonner";
import { useAuth } from "@clerk/nextjs";

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
  const { getToken } = useAuth();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const token = await getToken({ template: "convex" });
      const res = await fetch("/api/sync-supermemory", {
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
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="graph" className="text-xs">
              <Network className="w-3 h-3 mr-1.5" />
              Graph
            </TabsTrigger>
            <TabsTrigger value="sequence" className="text-xs">
              <Workflow className="w-3 h-3 mr-1.5" />
              Sequence
            </TabsTrigger>
            <TabsTrigger value="schema" className="text-xs">
              <Database className="w-3 h-3 mr-1.5" />
              Schema
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={handleSync}
          disabled={isSyncing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync Context"}
        </Button>
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
