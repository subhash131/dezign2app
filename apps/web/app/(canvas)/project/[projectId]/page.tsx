"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useQueryState, parseAsStringEnum } from "nuqs";
import { CanvasMode, BackendCanvasView } from "@/types/canvas";
import { CanvasToolbar } from "./_components/CanvasToolbar";
import { FrontendCanvas } from "./_components/FrontendCanvas";
import { BackendCanvas } from "./_components/BackendCanvas";
import { AiPanel } from "./_components/AiPanel";
import { Loader2 } from "lucide-react";

export default function ProjectCanvasPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = React.use(params);

  const [mode, setMode] = useQueryState<CanvasMode>(
    "mode",
    parseAsStringEnum<CanvasMode>(["frontend", "backend"]).withDefault("frontend")
  );
  
  const [view, setView] = useQueryState<BackendCanvasView>(
    "view",
    parseAsStringEnum<BackendCanvasView>(["graph", "sequence"]).withDefault("graph")
  );

  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // Fetch project basic info to show in toolbar
  const project = useQuery(api.projects.getProjectById, { 
    projectId: projectId as Id<"projects"> 
  });

  if (project === undefined) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <p>Project not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full relative">
      <CanvasToolbar
        projectName={project.name}
        mode={mode}
        setMode={setMode}
        view={view}
        setView={setView}
        aiPanelOpen={aiPanelOpen}
        setAiPanelOpen={setAiPanelOpen}
      />
      
      <div className="flex-1 relative overflow-hidden flex">
        <div className="flex-1 relative">
          {mode === "frontend" ? (
            <FrontendCanvas projectId={projectId} />
          ) : (
            <BackendCanvas projectId={projectId} view={view} />
          )}
        </div>
        
        <AiPanel 
          projectId={projectId} 
          mode={mode}
          isOpen={aiPanelOpen} 
          onClose={() => setAiPanelOpen(false)} 
        />
      </div>
    </div>
  );
}
