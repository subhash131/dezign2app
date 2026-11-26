"use client";

import React from "react";
import { Terminal as TerminalIcon, ChevronUp } from "lucide-react";
import { usePathname } from "next/navigation";

interface TerminalDockButtonProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  sessionCount: number;
  hasRunningSession: boolean;
  outputDir?: string;
}

export function TerminalDockButton({
  isOpen,
  onToggleOpen,
  sessionCount,
  hasRunningSession,
  outputDir,
}: TerminalDockButtonProps) {
  const pathname = usePathname();
  const isCompiler = pathname?.includes("/compiler");

  if (isOpen || isCompiler) return null;

  return (
    <div className="h-8 bg-sidebar/95 backdrop-blur-md border-t border-sidebar-border w-full px-4 flex items-center justify-between text-xs font-mono text-sidebar-foreground select-none shadow-md z-30 shrink-0 pointer-events-auto">
      <div
        onClick={onToggleOpen}
        className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity"
      >
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sidebar-accent/80 hover:bg-sidebar-accent border border-sidebar-border text-sidebar-foreground transition-colors shadow-sm">
          <TerminalIcon
            className={`w-3.5 h-3.5 ${
              hasRunningSession ? "text-emerald-400" : "text-sky-400"
            }`}
          />
          <span className="font-semibold text-xs">Terminal</span>
          {sessionCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sidebar text-sidebar-foreground border border-sidebar-border font-mono">
              {sessionCount}
            </span>
          )}
          {hasRunningSession && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {outputDir && (
          <span className="truncate max-w-[260px] text-muted-foreground/70 hidden sm:inline font-mono text-[11px]">
            {outputDir}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleOpen}
          title="Toggle Terminal (Ctrl+J)"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          <span>Toggle Terminal</span>
          <kbd className="hidden sm:inline-flex items-center px-1 py-0.2 text-[10px] font-mono rounded bg-sidebar border border-sidebar-border text-muted-foreground/80">
            Ctrl+J
          </kbd>
        </button>
      </div>
    </div>
  );
}
