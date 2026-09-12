"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Resizable } from "re-resizable";
import { WTermTerminalHandle, cleanTerminalText } from "@/components/terminal";
import { useDynamicTerminalSessions } from "../../_components/terminal/hooks/useDynamicTerminalSessions";
import { usePortMonitor } from "../../_components/terminal/hooks/usePortMonitor";
import { isElectron } from "@/lib/electron";
import {
  TerminalLog,
  TerminalPanelTab,
  ServicePortInfo,
  TerminalPanelProps,
  TerminalPanelHeader,
  ProblemsTab,
  OutputTab,
  PortsTab,
  TerminalTab,
} from "./terminal-panel";

export type { TerminalLog, TerminalPanelTab, ServicePortInfo, TerminalPanelProps };

export function TerminalPanel({
  projectId,
  outputDir = "",
  logs = [],
  onClearLogs,
  isOpen,
  onToggleOpen,
  activeTab,
  onSelectTab,
  ports = [],
  outputLogs = [],
}: TerminalPanelProps) {
  const terminalRefs = useRef<Map<string, WTermTerminalHandle | null>>(new Map());
  const inElectron = isElectron();
  const hasCreatedInitialRef = useRef(false);

  // 1. Persistent Tab Selection
  const [currentTab, setCurrentTab] = useState<TerminalPanelTab>(() => {
    if (typeof window !== "undefined") {
      try {
        const key = projectId ? `compiler_terminal_tab_${projectId}` : "compiler_terminal_tab";
        const saved = localStorage.getItem(key);
        if (saved && ["problems", "output", "terminal", "ports"].includes(saved)) {
          return saved as TerminalPanelTab;
        }
      } catch (e) {}
    }
    return activeTab || "terminal";
  });

  const selectedTab = onSelectTab && activeTab ? activeTab : currentTab;

  const handleTabChange = (tab: TerminalPanelTab) => {
    try {
      const key = projectId ? `compiler_terminal_tab_${projectId}` : "compiler_terminal_tab";
      localStorage.setItem(key, tab);
    } catch (e) {}
    if (onSelectTab) {
      onSelectTab(tab);
    } else {
      setCurrentTab(tab);
    }
  };

  // 2. Persistent Height
  const [terminalHeight, setTerminalHeight] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const key = projectId ? `compiler_terminal_height_${projectId}` : "compiler_terminal_height";
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed >= 100 && parsed <= 700) {
            return parsed;
          }
        }
      } catch (e) {}
    }
    return 240;
  });

  // 3. Persistent Maximized State
  const [isMaximized, setIsMaximized] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const key = projectId ? `compiler_terminal_maximized_${projectId}` : "compiler_terminal_maximized";
        const saved = localStorage.getItem(key);
        if (saved !== null) return saved === "true";
      } catch (e) {}
    }
    return false;
  });

  const handleToggleMaximize = () => {
    setIsMaximized((prev) => {
      const next = !prev;
      try {
        const key = projectId ? `compiler_terminal_maximized_${projectId}` : "compiler_terminal_maximized";
        localStorage.setItem(key, String(next));
      } catch (e) {}
      return next;
    });
  };

  const [copied, setCopied] = useState(false);

  // 4. Dynamic Terminal Sessions (Connected to shared store across pages)
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
    projectId: projectId || "default",
    outputDir,
    terminalRefs,
  });

  // Automatically ensure at least one session exists when projectId is provided
  useEffect(() => {
    if (hasCreatedInitialRef.current) return;
    if (projectId && sessions.length === 0) {
      hasCreatedInitialRef.current = true;
      createTerminal({
        type: inElectron ? "shell" : "bash",
        title: "Main Terminal",
      });
    }
  }, [projectId, sessions.length, createTerminal, inElectron]);

  // Raw combined list of endpoints & detected process ports
  const rawPorts = useMemo(() => {
    const list: ServicePortInfo[] = [...ports];
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
  }, [ports, allDetectedPorts]);

  // Active Real-Time Port Monitoring (TCP sockets in Electron / fetch in Web)
  const { monitoredPorts, activePortsCount, refreshPorts } = usePortMonitor({
    ports: rawPorts,
  });

  // Convert structured logs into ANSI colored terminal output for fallback standalone wterm
  const formattedLogs = useMemo(() => {
    if (logs.length === 0) {
      return [
        "\x1b[90m[system]\x1b[0m \x1b[32m✔ Project monorepo workspace initialized.\x1b[0m\r\n",
        "\x1b[90m[system]\x1b[0m \x1b[36mℹ Ready to compile, simulate, and preview.\x1b[0m\r\n",
      ];
    }
    return logs.map((log) => {
      let typeBadge = "";
      switch (log.type) {
        case "error":
          typeBadge = `\x1b[41;97m ERROR \x1b[0m \x1b[31m${log.text}\x1b[0m`;
          break;
        case "warning":
          typeBadge = `\x1b[43;30m WARN \x1b[0m \x1b[33m${log.text}\x1b[0m`;
          break;
        case "success":
          typeBadge = `\x1b[42;30m SUCCESS \x1b[0m \x1b[32m${log.text}\x1b[0m`;
          break;
        case "system":
          typeBadge = `\x1b[45;97m SYSTEM \x1b[0m \x1b[35m${log.text}\x1b[0m`;
          break;
        case "info":
        default:
          typeBadge = `\x1b[44;97m INFO \x1b[0m \x1b[36m${log.text}\x1b[0m`;
          break;
      }
      return `\x1b[90m[${log.timestamp}]\x1b[0m ${typeBadge}\r\n`;
    });
  }, [logs]);

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
      } else if (logs.length > 0) {
        content = logs
          .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${cleanTerminalText(l.text)}`)
          .join("\n");
      }
    } else if (selectedTab === "ports") {
      content = monitoredPorts
        .map((p) => `Port ${p.port}: ${p.name} (${p.status || "inactive"}) - ${p.url || `http://localhost:${p.port}`}`)
        .join("\n");
    }
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearCurrentTab = () => {
    if (selectedTab === "terminal" && activeSessionId) {
      clearTerminal(activeSessionId);
    }
    if (onClearLogs) {
      onClearLogs();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Resizable
      size={{ width: "100%", height: isMaximized ? "85%" : terminalHeight }}
      onResizeStop={(e, direction, ref, d) => {
        setTerminalHeight((prev) => {
          const next = Math.max(100, Math.min(700, prev + d.height));
          try {
            const key = projectId
              ? `compiler_terminal_height_${projectId}`
              : "compiler_terminal_height";
            localStorage.setItem(key, String(next));
          } catch (err) {}
          return next;
        });
      }}
      minHeight={100}
      maxHeight={700}
      enable={{ top: !isMaximized }}
      handleClasses={{
        top: "h-1 bg-border/50 hover:bg-primary cursor-row-resize transition-colors z-30",
      }}
      className="border-t border-border/50 flex flex-col shrink-0 font-sans text-xs select-none bg-[#090d13] relative overflow-hidden z-20"
    >
      {/* VS Code Bottom Panel Header */}
      <TerminalPanelHeader
        selectedTab={selectedTab}
        onTabChange={handleTabChange}
        portsCount={activePortsCount}
        sessions={sessions}
        isMaximized={isMaximized}
        onToggleMaximize={handleToggleMaximize}
        onToggleOpen={onToggleOpen}
        onCopy={handleCopyCurrentTab}
        copied={copied}
        onClear={handleClearCurrentTab}
        hasProjectId={Boolean(projectId)}
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
            onCreateSession={(type, shell, title) =>
              createTerminal({ type, shell, title })
            }
            formattedLogs={formattedLogs}
          />
        )}

        {selectedTab === "output" && <OutputTab outputLogs={outputLogs} />}

        {selectedTab === "problems" && <ProblemsTab />}

        {selectedTab === "ports" && (
          <PortsTab ports={monitoredPorts} onRefresh={refreshPorts} />
        )}
      </div>
    </Resizable>
  );
}
