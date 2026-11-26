"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Resizable } from "re-resizable";
import { motion, AnimatePresence } from "framer-motion";
import { isElectron, getElectronAPI } from "@/lib/electron";
import { downloadMonorepoZip } from "./utils/terminalExportUtils";
import { toast } from "sonner";
import {
  XTermTerminalHandle,
  cleanTerminalText,
  copyToClipboard,
  isTerminalToggleShortcut,
} from "@/components/terminal";
import { TerminalProps, TerminalType } from "./types";
import { useSidebarStore } from "@/lib/stores/sidebarStore";

import { useTerminalWorkspace } from "./hooks/useTerminalWorkspace";
import { useMonorepoEndpoints } from "./hooks/useMonorepoEndpoints";
import { useDynamicTerminalSessions } from "./hooks/useDynamicTerminalSessions";
import { useAutoDiskSync } from "./hooks/useAutoDiskSync";
import { usePortMonitor } from "./hooks/usePortMonitor";

import {
  TerminalPanelHeader,
  ProblemsTab,
  OutputTab,
  PortsTab,
  TerminalTab,
  TerminalPanelTab,
  ServicePortInfo,
} from "../../compiler/_components/terminal-panel";
import { TerminalDockButton } from "./components/TerminalDockButton";

export function Terminal({
  projectId,
  projectName = "Dezign2App",
  isOpen: controlledIsOpen,
  onToggleOpen: controlledOnToggleOpen,
  outputDir: propOutputDir,
  onPickDirectory: propOnPickDirectory,
}: TerminalProps) {
  const inElectron = isElectron();
  const terminalRefs = useRef<Map<string, XTermTerminalHandle | null>>(new Map());
  const hasCreatedInitialRef = useRef(false);

  // Drawer UI state from local store
  const storeTerminalOpen = useSidebarStore((s) => s.terminalOpen);
  const storeToggleTerminal = useSidebarStore((s) => s.toggleTerminal);
  const storeSetTerminalOpen = useSidebarStore((s) => s.setTerminalOpen);
  const terminalHeight = useSidebarStore((s) => s.terminalHeight);
  const setTerminalHeight = useSidebarStore((s) => s.setTerminalHeight);
  const setProjectFolderModalOpen = useSidebarStore(
    (s) => s.setProjectFolderModalOpen
  );

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : storeTerminalOpen;
  const handleToggleOpen = controlledOnToggleOpen || storeToggleTerminal;
  const handleToggleOpenRef = useRef(handleToggleOpen);
  handleToggleOpenRef.current = handleToggleOpen;

  // Global shortcut: Ctrl+J / Cmd+J expands or collapses the terminal drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isTerminalToggleShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        handleToggleOpenRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
  const handleClose = () => {
    if (controlledOnToggleOpen && isOpen) {
      controlledOnToggleOpen();
    } else {
      storeSetTerminalOpen(false);
    }
  };

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [downloadingZip, setDownloadingZip] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Tab State: Persistent per project
  const [selectedTab, setSelectedTab] = useState<TerminalPanelTab>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`canvas_terminal_tab_${projectId}`);
        if (saved && ["problems", "output", "terminal", "ports"].includes(saved)) {
          return saved as TerminalPanelTab;
        }
      } catch (e) {}
    }
    return "terminal";
  });

  const handleTabChange = (tab: TerminalPanelTab) => {
    setSelectedTab(tab);
    try {
      localStorage.setItem(`canvas_terminal_tab_${projectId}`, tab);
    } catch (e) {}
  };

  // 1. Workspace directory persistence & folder picker
  const {
    outputDir: workspaceOutputDir,
    handlePickDirectory: fallbackPickDirectory,
  } = useTerminalWorkspace(projectId, projectName);

  const outputDir =
    (propOutputDir && propOutputDir.trim()) ? propOutputDir.trim() : workspaceOutputDir;
  const handleFolderClick =
    propOnPickDirectory ||
    (() => setProjectFolderModalOpen(true)) ||
    fallbackPickDirectory;

  // 2. Monorepo compilation & endpoints
  const { formattedProjectName, files, serviceEndpoints } =
    useMonorepoEndpoints(projectName);

  // 3. Dynamic User-Created Terminal Sessions (Persistent across drawers/nodes)
  const {
    sessions,
    activeSessionId,
    activeSession,
    createTerminal,
    closeTerminal,
    selectTerminal,
    clearTerminal,
    writeToSession,
    resizeSession,
    allDetectedPorts,
    replayMissedLogs,
  } = useDynamicTerminalSessions({
    projectId,
    outputDir,
    terminalRefs,
  });

  // 4. Real-time automatic disk synchronization (Electron mode)
  const {
    syncStatus,
    lastSyncedAt,
    forceSyncNow,
  } = useAutoDiskSync({
    projectId,
    outputDir,
    files,
  });

  // Download project as ZIP (Browser / fallback mode)
  const handleDownloadZip = async () => {
    try {
      setDownloadingZip(true);
      await downloadMonorepoZip(files, formattedProjectName);
      toast.success("Project downloaded successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      toast.error("Failed to download project zip", {
        description: msg,
      });
    } finally {
      setDownloadingZip(false);
    }
  };

  // Sync session workspace paths whenever output directory is changed
  useEffect(() => {
    const electronApi = getElectronAPI();
    if (outputDir && electronApi?.workspace?.setPath) {
      electronApi.workspace.setPath(
        `${outputDir}/${formattedProjectName}`,
      );
    }
  }, [outputDir, formattedProjectName]);

  // Handle first-time automatic creation of starter terminal
  useEffect(() => {
    if (hasCreatedInitialRef.current) return;
    if (sessions.length === 0 && (inElectron || files.length > 0)) {
      hasCreatedInitialRef.current = true;
      createTerminal({
        type: inElectron ? "shell" : "bash",
        title: "Main Terminal",
      });
    }
  }, [files, formattedProjectName, sessions.length, inElectron, createTerminal]);

  // Raw combined list of endpoints & detected process ports
  const rawPorts = useMemo(() => {
    const list: ServicePortInfo[] = serviceEndpoints.map((ep) => ({
      port: ep.port,
      name: ep.name,
      type: ep.type === "web" ? "Next.js App" : "Backend Service",
      url: ep.url,
    }));

    const existingPorts = new Set(list.map((p) => String(p.port)));

    allDetectedPorts.forEach((dp) => {
      const portStr = String(dp.port);
      if (!existingPorts.has(portStr)) {
        existingPorts.add(portStr);
        list.push({
          port: dp.port,
          name: `Process Service (:${dp.port})`,
          type: "Dynamic Port",
          url: dp.url,
        });
      }
    });

    return list;
  }, [serviceEndpoints, allDetectedPorts]);

  // Active Real-Time Port Monitoring (TCP sockets in Electron / fetch in Web)
  const { monitoredPorts, activePortsCount, refreshPorts } = usePortMonitor({
    ports: rawPorts,
  });

  // Generate output logs for the Output Tab
  const outputLogs = useMemo(() => {
    return [
      `[Monorepo Engine] ${formattedProjectName}`,
      `✔ Compiled ${files.length} workspace files`,
      `✔ Registered ${serviceEndpoints.length} canvas service endpoints`,
      `✔ Environment: ${inElectron ? "Desktop Native (node-pty)" : "Web Simulated Engine"}`,
      outputDir ? `✔ Workspace target: ${outputDir}` : `ℹ Default workspace: /workspace/${projectId}`,
      `[Ready] Build and hot-reload watchers active.`,
    ];
  }, [formattedProjectName, files.length, serviceEndpoints.length, inElectron, outputDir, projectId]);

  const handleCopyCurrentTab = async () => {
    let content = "";
    if (selectedTab === "output") {
      content = outputLogs.join("\n");
    } else if (selectedTab === "terminal") {
      const activeRef = activeSessionId
        ? terminalRefs.current.get(activeSessionId)
        : terminalRefs.current.values().next().value;
      if (activeRef?.getText) {
        content = activeRef.getText();
      }
    } else if (selectedTab === "ports") {
      content = monitoredPorts
        .map((p) => `Port ${p.port}: ${p.name} (${p.status || "inactive"}) - ${p.url || `http://localhost:${p.port}`}`)
        .join("\n");
    }
    if (!content) return;
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClearCurrentTab = () => {
    if (selectedTab === "terminal" && activeSessionId) {
      clearTerminal(activeSessionId);
    }
  };

  // Auto-focus active terminal when dock opens or user switches back to "terminal" tab
  useEffect(() => {
    if (isOpen && selectedTab === "terminal") {
      const activeRef = activeSessionId
        ? terminalRefs.current.get(activeSessionId)
        : terminalRefs.current.values().next().value;
      const timer = setTimeout(() => {
        activeRef?.fit?.();   // recompute cols after panel opens/resizes
        activeRef?.focus?.();
        if (activeSessionId) {
          replayMissedLogs(activeSessionId);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, selectedTab, activeSessionId, replayMissedLogs]);

  const hasRunningSession = sessions.some((s) => s.status === "running");

  return (
    <>
      {/* VS Code-style Bottom Docked Terminal Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="w-full z-30 pointer-events-auto flex flex-col font-sans shrink-0"
          >
            <Resizable
              size={{
                width: "100%",
                height: isExpanded ? "90vh" : terminalHeight,
              }}
              onResizeStop={(e, direction, ref, d) => {
                const maxH =
                  typeof window !== "undefined"
                    ? Math.floor(window.innerHeight * 0.9)
                    : 1200;
                setTerminalHeight((prev: number) =>
                  Math.max(140, Math.min(maxH, prev + d.height)),
                );
              }}
              minHeight={140}
              maxHeight="90vh"
              enable={{ top: !isExpanded }}
              handleClasses={{
                top: "h-1 bg-border/50 hover:bg-primary cursor-row-resize transition-colors z-30",
              }}
              className="w-full flex flex-col bg-[#090d13] border-t border-border/50 shadow-2xl overflow-hidden font-sans text-xs relative"
            >
              {/* VS Code Bottom Panel Header */}
              <TerminalPanelHeader
                selectedTab={selectedTab}
                onTabChange={handleTabChange}
                portsCount={activePortsCount}
                sessions={sessions}
                isMaximized={isExpanded}
                onToggleMaximize={() => setIsExpanded(!isExpanded)}
                onToggleOpen={handleClose}
                onCopy={handleCopyCurrentTab}
                copied={copied}
                onClear={handleClearCurrentTab}
                hasProjectId={Boolean(projectId)}
                inElectron={inElectron}
                outputDir={outputDir}
                onPickDirectory={handleFolderClick}
                onDownloadZip={handleDownloadZip}
                downloadingZip={downloadingZip}
                syncStatus={syncStatus}
                lastSyncedAt={lastSyncedAt}
                onForceSync={forceSyncNow}
              />

              {/* Tab View Content - Preserved in DOM to retain active process & terminal buffer */}
              <div className="w-full h-full flex flex-col flex-1 min-h-0 bg-[#090d13] relative overflow-hidden font-mono text-xs select-text">
                <div
                  className={`w-full h-full flex flex-col flex-1 min-h-0 ${
                    selectedTab === "terminal" ? "flex" : "hidden"
                  }`}
                >
                  <TerminalTab
                    projectId={projectId}
                    outputDir={outputDir}
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    terminalRefs={terminalRefs}
                    onTerminalInput={writeToSession}
                    onTerminalResize={resizeSession}
                    onSelectSession={selectTerminal}
                    onCloseSession={closeTerminal}
                    onCreateSession={(type?: TerminalType, shell?: string, title?: string) =>
                      createTerminal({ type, shell, title })
                    }
                    onReplayMissedLogs={replayMissedLogs}
                    formattedLogs={[]}
                  />
                </div>

                <div
                  className={`w-full h-full flex flex-col flex-1 min-h-0 ${
                    selectedTab === "output" ? "flex" : "hidden"
                  }`}
                >
                  <OutputTab outputLogs={outputLogs} />
                </div>

                <div
                  className={`w-full h-full flex flex-col flex-1 min-h-0 ${
                    selectedTab === "problems" ? "flex" : "hidden"
                  }`}
                >
                  <ProblemsTab />
                </div>

                <div
                  className={`w-full h-full flex flex-col flex-1 min-h-0 ${
                    selectedTab === "ports" ? "flex" : "hidden"
                  }`}
                >
                  <PortsTab ports={monitoredPorts} onRefresh={refreshPorts} />
                </div>
              </div>
            </Resizable>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VS Code Docked Bottom Status Strip */}
      <TerminalDockButton
        isOpen={isOpen}
        onToggleOpen={handleToggleOpen}
        sessionCount={sessions.length}
        hasRunningSession={hasRunningSession}
        outputDir={outputDir}
      />
    </>
  );
}
