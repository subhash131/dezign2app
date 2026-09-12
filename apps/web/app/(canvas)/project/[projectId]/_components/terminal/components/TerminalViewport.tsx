"use client";

import React from "react";
import {
  Terminal as TerminalIcon,
  Plus,
  Monitor,
  Code2,
  Trash,
  ChevronRight,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu";
import { WTermTerminal, WTermTerminalHandle } from "@/components/terminal";
import { isElectron } from "@/lib/electron";
import { TerminalSession, TerminalType } from "../types";
import { getShellPrompt } from "../hooks/useDynamicTerminalSessions";

interface TerminalViewportProps {
  projectId?: string;
  outputDir?: string;
  sessions: TerminalSession[];
  activeSessionId: string | null;
  terminalRefs: React.MutableRefObject<Map<string, WTermTerminalHandle | null>>;
  onTerminalInput: (sessionId: string, data: string) => void;
  onTerminalResize: (sessionId: string, cols: number, rows: number) => void;
  onNewTab: (type?: TerminalType, shell?: string, title?: string) => void;
  onSelectSession?: (sessionId: string) => void;
  onCloseSession?: (sessionId: string) => void;
}

export function TerminalViewport({
  projectId,
  outputDir = "",
  sessions,
  activeSessionId,
  terminalRefs,
  onTerminalInput,
  onTerminalResize,
  onNewTab,
  onSelectSession,
  onCloseSession,
}: TerminalViewportProps) {
  const inElectron = isElectron();
  const isWin =
    typeof navigator !== "undefined" &&
    (navigator.platform?.includes("Win") ||
      navigator.userAgent?.includes("Windows"));

  // Empty State: No active terminals open
  if (sessions.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none relative overflow-hidden bg-[#090d13]">
        <div className="relative z-10 max-w-md flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shadow-xl">
            <TerminalIcon className="w-6 h-6 text-sky-400" />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">
              No Active Terminals
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm">
              Create a terminal session to execute dev scripts, builds, or CLI tools in your workspace directory.
            </p>
          </div>

          {/* Quick Launcher Action Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            <Button
              size="sm"
              onClick={() => onNewTab("shell")}
              className="h-7 px-3 text-xs gap-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-md font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Terminal</span>
            </Button>

            {isWin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNewTab("powershell", "powershell.exe", "PowerShell")}
                  className="h-7 px-2.5 text-xs gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700 rounded-md"
                >
                  <TerminalIcon className="w-3.5 h-3.5 text-sky-400" />
                  <span>PowerShell</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNewTab("cmd", "cmd.exe", "Command Prompt")}
                  className="h-7 px-2.5 text-xs gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700 rounded-md"
                >
                  <Monitor className="w-3.5 h-3.5 text-amber-400" />
                  <span>CMD</span>
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => onNewTab("bash", "bash", "Bash")}
              className="h-7 px-2.5 text-xs gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700 rounded-md"
            >
              <Code2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Bash</span>
            </Button>
          </div>
        </div>

        {/* Subtle background decoration */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.03),transparent_70%)] pointer-events-none" />
      </div>
    );
  }

  // Active Multi-Terminal Viewport with Right-Side Terminal Tabs List
  return (
    <div className="w-full h-full flex flex-row flex-1 min-h-0 bg-[#090d13] relative overflow-hidden">
      {/* Left: Active Terminal Viewports */}
      <div className="flex-1 h-full min-w-0 relative overflow-hidden bg-[#090d13]">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;

          return (
            <div
              key={session.id}
              className={`absolute inset-0 w-full h-full transition-opacity duration-100 ${
                isActive
                  ? "opacity-100 z-10 pointer-events-auto"
                  : "opacity-0 z-0 pointer-events-none"
              }`}
            >
              <WTermTerminal
                ref={(el) => {
                  if (el) {
                    terminalRefs.current.set(session.id, el);
                  } else {
                    terminalRefs.current.delete(session.id);
                  }
                }}
                onReady={() => {
                  if (!inElectron) {
                    const handle = terminalRefs.current.get(session.id);
                    const targetDir = outputDir || `/workspace/${projectId || "dezign2app"}`;
                    const prompt = getShellPrompt(session.shell, targetDir);
                    handle?.write(
                      `\x1b[36mDezign2App Monorepo Terminal: ${session.title || "Main Terminal"} [Web Preview]\x1b[0m\r\n\x1b[90mWorkspace: ${targetDir}\x1b[0m\r\n\x1b[90mType commands like "help", "pnpm dev", "pnpm build", "docker compose", "clear".\x1b[0m\r\n\r\n${prompt}`,
                    );
                  }
                }}
                rawStream={true}
                interactive={true}
                autoScroll={false}
                onData={(data) => onTerminalInput(session.id, data)}
                onResize={(cols, rows) => onTerminalResize(session.id, cols, rows)}
              />
            </div>
          );
        })}
      </div>

      {/* Right: Terminal Sessions List Sidebar & Add Terminal */}
      <div className="w-48 sm:w-56 h-full shrink-0 border-l border-border/40 bg-[#0d1117]/95 flex flex-col font-sans select-none z-20">
        {/* Header of Right Side List */}
        <div className="h-8 px-2.5 flex items-center justify-between border-b border-border/30 text-[11px] text-slate-400 font-medium tracking-wide">
          <span className="flex items-center gap-1.5 uppercase text-[10px] text-slate-400 font-semibold tracking-wider">
            <TerminalIcon className="w-3.5 h-3.5 text-primary" />
            <span>Terminals</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono text-[9px]">
              {sessions.length}
            </span>
          </span>

          {/* + Add Terminal Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-0.5"
                title="New Terminal"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 bg-[#161b22] border-slate-700 text-slate-200 text-xs shadow-xl p-1 z-50"
            >
              <DropdownMenuLabel className="px-2 py-1 text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                New Terminal
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  onNewTab("shell", undefined, `Terminal ${sessions.length + 1}`)
                }
                className="gap-2 cursor-pointer"
              >
                <TerminalIcon className="w-3.5 h-3.5 text-primary" />
                <span>Default Shell</span>
              </DropdownMenuItem>

              {isWin && (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      onNewTab(
                        "powershell",
                        "powershell.exe",
                        `PowerShell ${sessions.length + 1}`,
                      )
                    }
                    className="gap-2 cursor-pointer"
                  >
                    <TerminalIcon className="w-3.5 h-3.5 text-sky-400" />
                    <span>PowerShell</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      onNewTab("cmd", "cmd.exe", `CMD ${sessions.length + 1}`)
                    }
                    className="gap-2 cursor-pointer"
                  >
                    <Monitor className="w-3.5 h-3.5 text-amber-400" />
                    <span>Command Prompt</span>
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuItem
                onClick={() =>
                  onNewTab("bash", "bash", `Bash ${sessions.length + 1}`)
                }
                className="gap-2 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Bash</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Scrollable list of active terminal sessions */}
        <div className="flex-1 overflow-y-auto py-1 space-y-0.5 px-1 font-sans text-xs">
          {sessions.map((s, idx) => {
            const isActive = s.id === activeSessionId;
            const lowerShell = (s.shell || s.type || "").toLowerCase();
            let Icon = TerminalIcon;
            let iconColor = "text-primary";
            if (lowerShell.includes("powershell")) {
              Icon = TerminalIcon;
              iconColor = "text-sky-400";
            } else if (lowerShell.includes("cmd")) {
              Icon = Monitor;
              iconColor = "text-amber-400";
            } else if (lowerShell.includes("bash")) {
              Icon = Code2;
              iconColor = "text-emerald-400";
            }

            return (
              <div
                key={s.id}
                onClick={() => onSelectSession?.(s.id)}
                className={`group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs transition-all ${
                  isActive
                    ? "bg-slate-800 text-white font-medium shadow-sm border border-slate-700/60"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                  <span className="truncate text-[11px] font-mono">
                    {s.title || `Terminal ${idx + 1}`}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      s.status === "error"
                        ? "bg-red-400"
                        : "bg-emerald-400 animate-pulse"
                    }`}
                  />
                  {sessions.length > 1 && onCloseSession && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseSession(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-400 rounded transition-all"
                      title="Close Terminal"
                    >
                      <Trash className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
