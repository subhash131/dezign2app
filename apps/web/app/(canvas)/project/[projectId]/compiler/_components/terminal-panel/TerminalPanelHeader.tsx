"use client";

import React from "react";
import {
  Terminal,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Trash,
  Radio,
  Folder,
  Archive,
  RefreshCw,
  FolderSync,
  AlertTriangle,
  Zap,
  X,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { TerminalPanelTab } from "@workspace/canvas/types";
import { TerminalSession } from "../../../_components/terminal/types";
import { AutoSyncStatus } from "../../../_components/terminal/hooks/useAutoDiskSync";
import { formatDistanceToNow } from "date-fns";

export interface TerminalPanelHeaderProps {
  selectedTab: TerminalPanelTab;
  onTabChange: (tab: TerminalPanelTab) => void;
  portsCount: number;
  sessions: TerminalSession[];
  isMaximized: boolean;
  onToggleMaximize: () => void;
  onToggleOpen: () => void;
  onCopy: () => void;
  copied: boolean;
  onClear: () => void;
  hasProjectId: boolean;
  // Optional desktop / sync props
  inElectron?: boolean;
  outputDir?: string;
  onPickDirectory?: () => void;
  onDownloadZip?: () => void;
  downloadingZip?: boolean;
  syncStatus?: AutoSyncStatus;
  lastSyncedAt?: Date | null;
  onForceSync?: () => void;
}

export function TerminalPanelHeader({
  selectedTab,
  onTabChange,
  portsCount,
  sessions,
  isMaximized,
  onToggleMaximize,
  onToggleOpen,
  onCopy,
  copied,
  onClear,
  hasProjectId,
  inElectron = false,
  outputDir = "",
  onPickDirectory,
  onDownloadZip,
  downloadingZip = false,
  syncStatus = "idle",
  lastSyncedAt,
  onForceSync,
}: TerminalPanelHeaderProps) {
  const isWin =
    typeof navigator !== "undefined" &&
    (navigator.platform?.includes("Win") ||
      navigator.userAgent?.includes("Windows"));

  const getRelativeSyncTime = (date: Date | null | undefined): string => {
    if (!date) return "Synced";
    const diffSeconds = Math.max(
      0,
      Math.floor((Date.now() - date.getTime()) / 1000),
    );
    if (diffSeconds < 15) return "just now";
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const formattedSyncTime = lastSyncedAt
    ? lastSyncedAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <div className="h-8 bg-[#161b22] px-3 border-b border-border/40 flex items-center justify-between shrink-0 font-sans select-none">
      {/* Left: VS Code Tabs */}
      <div className="flex items-center space-x-1 h-full">
        <button
          type="button"
          onClick={() => onTabChange("problems")}
          className={`h-full px-2.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase transition-colors relative ${
            selectedTab === "problems"
              ? "text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>Problems</span>
          <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-slate-800 text-slate-400 font-mono">
            0
          </span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("output")}
          className={`h-full px-2.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase transition-colors relative ${
            selectedTab === "output"
              ? "text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <span>Output</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("terminal")}
          className={`h-full px-2.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase transition-colors relative ${
            selectedTab === "terminal"
              ? "text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-primary" />
          <span>Terminal</span>
          {hasProjectId && sessions.length > 1 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-slate-800 text-slate-400 font-mono">
              {sessions.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onTabChange("ports")}
          className={`h-full px-2.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase transition-colors relative ${
            selectedTab === "ports"
              ? "text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Radio className={`w-3 h-3 ${portsCount > 0 ? "text-emerald-400" : "text-slate-400"}`} />
          <span>Ports</span>
          {portsCount > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-950/80 text-emerald-400 font-mono border border-emerald-800/40">
              {portsCount}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-slate-800 text-slate-400 font-mono">
              0
            </span>
          )}
        </button>
      </div>

      {/* Right: VS Code Panel Actions */}
      <div className="flex items-center gap-1">

        {/* Real-time Auto-Sync Status Badge (Electron only) */}
        {inElectron && outputDir && onForceSync && (
          <button
            type="button"
            onClick={onForceSync}
            className="flex items-center gap-1.5 h-6 px-2 text-[10px] rounded bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 transition-colors"
            title={
              syncStatus === "syncing"
                ? "Syncing canvas changes to disk..."
                : syncStatus === "synced"
                  ? `Live synced to disk at ${formattedSyncTime || "just now"}. Click to force re-sync.`
                  : syncStatus === "error"
                    ? "Sync error occurred. Click to retry."
                    : "Auto-sync active. Click to force sync."
            }
          >
            {syncStatus === "syncing" ? (
              <>
                <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />
                <span className="text-sky-300 font-mono hidden md:inline">
                  Syncing...
                </span>
              </>
            ) : syncStatus === "synced" ? (
              <>
                <FolderSync className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-300 font-mono hidden md:inline">
                  {lastSyncedAt ? `${getRelativeSyncTime(lastSyncedAt)}` : "Synced"}
                </span>
              </>
            ) : syncStatus === "error" ? (
              <>
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span className="text-amber-300 font-mono hidden md:inline">
                  Sync Error
                </span>
              </>
            ) : (
              <>
                <Zap className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400 font-mono hidden md:inline">
                  Auto-Sync
                </span>
              </>
            )}
          </button>
        )}

        {/* Directory Selector in Desktop / ZIP Download in Browser */}
        {inElectron && onPickDirectory ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onPickDirectory}
            className="h-6 px-2 text-[10px] gap-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title={outputDir ? `Workspace: ${outputDir}` : "Choose workspace directory"}
          >
            <Folder className="w-3 h-3 text-slate-400" />
            <span className="max-w-[100px] truncate hidden sm:inline font-mono">
              {outputDir ? outputDir.split(/[\\/]/).pop() : "Folder..."}
            </span>
          </Button>
        ) : onDownloadZip ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onDownloadZip}
            disabled={downloadingZip}
            className="h-6 px-2 text-[10px] gap-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            title="Download complete monorepo ZIP"
          >
            <Archive className="w-3 h-3 text-slate-400" />
            <span className="hidden sm:inline">
              {downloadingZip ? "Zipping..." : "ZIP"}
            </span>
          </Button>
        ) : null}

        {/* Copy Output Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          title="Copy Output"
          className="h-6 px-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </Button>

        {/* Clear Buffer Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          title="Clear Console / Terminal Buffer"
          className="h-6 px-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800"
        >
          <Trash className="w-3.5 h-3.5" />
        </Button>

        {/* Maximize / Minimize Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleMaximize}
          title={isMaximized ? "Restore Panel Size" : "Maximize Panel Size"}
          className="h-6 px-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          {isMaximized ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </Button>

        {/* Close Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleOpen}
          title="Close Panel"
          className="h-6 px-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
