"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Resizable } from "re-resizable";
import { motion, AnimatePresence } from "framer-motion";
import { isElectron, getElectronAPI } from "@/lib/electron";
import { downloadMonorepoZip } from "./utils/terminalExportUtils";
import { toast } from "sonner";
import { WTermTerminalHandle, cleanTerminalText } from "@/components/terminal";
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
}: TerminalProps) {
  const inElectron = isElectron();
  const terminalRefs = useRef<Map<string, WTermTerminalHandle | null>>(new Map());

  // Drawer UI state from local store
  const storeTerminalOpen = useSidebarStore((s) => s.terminalOpen);
  const storeToggleTerminal = useSidebarStore((s) => s.toggleTerminal);
  const storeSetTerminalOpen = useSidebarStore((s) => s.setTerminalOpen);
  const terminalHeight = useSidebarStore((s) => s.terminalHeight);
  const setTerminalHeight = useSidebarStore((s) => s.setTerminalHeight);

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : storeTerminalOpen;
  const handleToggleOpen = controlledOnToggleOpen || storeToggleTerminal;
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
  const { outputDir, handlePickDirectory } = useTerminalWorkspace(projectId);

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
    if (sessions.length === 0 && (inElectron || files.length > 0)) {
      createTerminal({
        type: inElectron ? "shell" : "bash",
        title: "Main Terminal",
      });
    }
  }, [files, formattedProjectName]);

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

  const handleCopyCurrentTab = () => {
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
    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearCurrentTab = () => {
    if (selectedTab === "terminal" && activeSessionId) {
      clearTerminal(activeSessionId);
    }
  };

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
                height: isExpanded ? "80vh" : terminalHeight,
              }}
              onResizeStop={(e, direction, ref, d) => {
                setTerminalHeight((prev: number) =>
                  Math.max(140, Math.min(800, prev + d.height)),
                );
              }}
              minHeight={140}
              maxHeight={800}
              enable={{ top: !isExpanded }}
              handleClasses={{
                top: "h-1 bg-border/50 hover:bg-primary cursor-row-resize transition-colors z-30",
              }}
              className="w-full flex flex-col bg-[#090d13] border-t border-border/50 shadow-2xl overflow-hidden font-sans text-xs select-none relative"
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
                onPickDirectory={handlePickDirectory}
                onDownloadZip={handleDownloadZip}
                downloadingZip={downloadingZip}
                syncStatus={syncStatus}
                lastSyncedAt={lastSyncedAt}
                onForceSync={forceSyncNow}
              />

              {/* Tab View Content */}
              <div className="w-full h-full flex flex-col flex-1 min-h-0 bg-[#090d13] relative overflow-hidden font-mono text-xs">
                {selectedTab === "terminal" && (
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
                    formattedLogs={[]}
                  />
                )}

                {selectedTab === "output" && <OutputTab outputLogs={outputLogs} />}

                {selectedTab === "problems" && <ProblemsTab />}

                {selectedTab === "ports" && (
                  <PortsTab ports={monitoredPorts} onRefresh={refreshPorts} />
                )}
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
