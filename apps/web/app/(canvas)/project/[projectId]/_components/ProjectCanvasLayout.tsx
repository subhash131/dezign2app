"use client";

import React, { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  useTerminalWorkspace,
  useProjectWorkspaceStore,
} from "./terminal/hooks/useTerminalWorkspace";
import { getProjectWorkspaceDir } from "./terminal/hooks/projectWorkspaceUtils";
import { ProjectFolderModal } from "./ProjectFolderModal";
import {
  useSidebarStore,
  getEffectiveConfigSidebarWidth,
} from "@/lib/stores/sidebarStore";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodePaletteSidebar } from "./NodePaletteSidebar";
import { AiPanel } from "./AiPanel";
import { Terminal } from "./terminal/Terminal";
import { ReactFlowProvider } from "@xyflow/react";
import { AppUpdateIndicator } from "./AppUpdateIndicator";

interface ProjectCanvasLayoutProps {
  children: React.ReactNode;
  projectId: string;
}

export function ProjectCanvasLayout({
  children,
  projectId,
}: ProjectCanvasLayoutProps) {
  const pathname = usePathname();
  const isLangGraph = Boolean(pathname?.includes("/langgraph"));

  const project = useQuery(api.projects.getProjectById, {
    projectId: projectId as Id<"projects">,
  });

  const { outputDir, saveWorkspaceDir, handlePickDirectory } =
    useTerminalWorkspace(projectId, project?.name);
  const syncFromStorage = useProjectWorkspaceStore((s) => s.syncFromStorage);

  // Sidebar state
  const paletteOpen = useSidebarStore((s) => s.paletteOpen);
  const setPaletteOpen = useSidebarStore((s) => s.setPaletteOpen);
  const aiPanelOpen = useSidebarStore((s) => s.aiPanelOpen);
  const setAiPanelOpen = useSidebarStore((s) => s.setAiPanelOpen);
  const setTerminalOpen = useSidebarStore((s) => s.setTerminalOpen);

  const projectFolderModalOpen = useSidebarStore(
    (s) => s.projectFolderModalOpen
  );
  const setProjectFolderModalOpen = useSidebarStore(
    (s) => s.setProjectFolderModalOpen
  );
  const langGraphInspectorOpen = useSidebarStore(
    (s) => s.langGraphInspectorOpen
  );
  const langGraphInspectorWidth = useSidebarStore(
    (s) => s.langGraphInspectorWidth
  );
  const configSidebarOpen = useSidebarStore((s) => s.configSidebarOpen);
  const configSidebarWidth = useSidebarStore((s) => s.configSidebarWidth);
  const activeConfigItem = useBackendCanvasStore((s) => s.activeConfigItem);

  const isConfigSidebarOpen =
    !isLangGraph && (Boolean(activeConfigItem) || configSidebarOpen);
  const effectiveConfigWidth =
    getEffectiveConfigSidebarWidth(configSidebarWidth);

  // Read the current canvas view from the store (set by each page via setStoreView)
  const canvasView = useBackendCanvasStore((s) => s.canvasView);

  const hasCheckedSwitchRef = useRef<string | null>(null);

  // Detect project switch and automatically prompt for a folder ONLY if genuinely not configured
  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    if (hasCheckedSwitchRef.current === projectId) return;

    // Check storage synchronously first so we never falsely treat a configured project as empty
    const currentDir = outputDir || getProjectWorkspaceDir(projectId);

    // If currentDir is in storage but not yet populated in the Zustand store, sync it immediately
    if (currentDir && !outputDir) {
      syncFromStorage(projectId);
    }

    try {
      const lastProjectId = localStorage.getItem("dezign2app_last_project_id");
      const isSwitch = Boolean(lastProjectId && lastProjectId !== projectId);
      localStorage.setItem("dezign2app_last_project_id", projectId);

      // If a workspace folder is already configured, mark checked and DO NOT open modal
      if (currentDir) {
        hasCheckedSwitchRef.current = projectId;
        if (isSwitch && project?.name) {
          const folderName =
            currentDir.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || currentDir;
          toast.info(`Switched to "${project.name}" (Folder: ${folderName})`, {
            action: {
              label: "Change Folder",
              onClick: () => setProjectFolderModalOpen(true),
            },
          });
        }
        return;
      }

      // If Convex is still loading project data, wait before checking dismissal so we have full context
      if (project === undefined) {
        return;
      }

      // Check if user already dismissed the prompt for this project in this session
      const dismissed = sessionStorage.getItem(`dismissed_folder_modal_${projectId}`);
      if (dismissed) {
        hasCheckedSwitchRef.current = projectId;
        return;
      }

      // Only prompt when switching to an unconfigured project (and not in LangGraph Studio)
      if (isSwitch && !isLangGraph) {
        hasCheckedSwitchRef.current = projectId;
        setProjectFolderModalOpen(true);
      } else if (!isSwitch) {
        // Cold start or same-project reload: do not force open a blocking modal
        hasCheckedSwitchRef.current = projectId;
      }
    } catch (e) {
      console.warn("[ProjectCanvasLayout] Switch detection error:", e);
      hasCheckedSwitchRef.current = projectId;
    }
  }, [
    projectId,
    outputDir,
    project,
    isLangGraph,
    setProjectFolderModalOpen,
    syncFromStorage,
  ]);

  // When in LangGraph Studio, ensure palette drawer is closed
  useEffect(() => {
    if (isLangGraph) {
      setPaletteOpen(false);
    }
  }, [isLangGraph, setPaletteOpen]);

  return (
    <ReactFlowProvider>
      <div className="flex-1 w-full h-full min-h-0 flex flex-col overflow-hidden relative">
        {/* Active Route Workspace (Canvas, Compiler, Schemas, Pages, etc.) */}
        <div className="flex-1 min-h-0 w-full relative overflow-hidden flex flex-col">
          {children}
        </div>

        {/* ======================================================================== */}
        {/* SHARED UI OVERLAY - Sidebars + Terminal (persists across all tab routes)  */}
        {/* In GraphView: Squeezed between NodePalette & AI Panel                     */}
        {/* In LangGraph: Squeezed between ToolsSidebar (w-60) & InspectorSidebar    */}
        {/* ======================================================================== */}
        <div className="absolute inset-0 w-full h-full z-20 pointer-events-none flex flex-col overflow-hidden">
          {/* Top spacer: matches toolbar height so sidebars start below the toolbar */}
          <div className="shrink-0 h-14" />
          <div className="flex-1 min-h-0 w-full flex overflow-hidden relative pointer-events-none">
            {/* Left: Node Palette Sidebar in GraphView, or spacer matching ToolsSidebar (w-60 = 240px) in LangGraph */}
            {!isLangGraph ? (
              <NodePaletteSidebar
                view={canvasView ?? "graph"}
                isOpen={paletteOpen}
                onToggle={() => setPaletteOpen(!paletteOpen)}
              />
            ) : (
              <div className="w-60 shrink-0 pointer-events-none" />
            )}

            {/* Center Column: Transparent canvas area + Terminal docked at bottom */}
            <div className="flex-1 min-w-0 h-full pointer-events-none overflow-hidden relative flex flex-col">
              <div className="flex-1 min-h-0" />
              <Terminal
                projectId={projectId}
                projectName={project?.name || "Dezign2App"}
                outputDir={outputDir}
                onPickDirectory={() => setProjectFolderModalOpen(true)}
              />
            </div>

            {/* Right: AI Assistant Sidebar & ConfigSidebar spacer in GraphView, or spacer matching InspectorSidebar in LangGraph */}
            {!isLangGraph ? (
              <>
                {isConfigSidebarOpen && (
                  <div
                    style={{ width: `${effectiveConfigWidth}px` }}
                    className="shrink-0 pointer-events-none"
                  />
                )}
                <AiPanel
                  projectId={projectId}
                  isOpen={aiPanelOpen && !isConfigSidebarOpen}
                  onClose={() => setAiPanelOpen(false)}
                />
              </>
            ) : (
              langGraphInspectorOpen && (
                <div
                  style={{ width: `${langGraphInspectorWidth}px` }}
                  className="shrink-0 pointer-events-none"
                />
              )
            )}
          </div>
        </div>

        {/* Unique Project Folder Selection Modal */}
        <ProjectFolderModal
          open={projectFolderModalOpen}
          onOpenChange={(open) => {
            setProjectFolderModalOpen(open);
            if (!open && typeof window !== "undefined") {
              try {
                sessionStorage.setItem(`dismissed_folder_modal_${projectId}`, "1");
              } catch {}
            }
          }}
          projectId={projectId}
          projectName={project?.name || "Dezign2App Project"}
          currentOutputDir={
            outputDir ||
            (typeof window !== "undefined"
              ? getProjectWorkspaceDir(projectId)
              : "")
          }
          onPickDirectory={handlePickDirectory}
          onSaveDirectory={saveWorkspaceDir}
        />

        {/* Global Desktop Auto-Update Indicator with Progress & Restart */}
        <AppUpdateIndicator />
      </div>
    </ReactFlowProvider>
  );
}
