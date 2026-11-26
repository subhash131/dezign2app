"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Archive,
  Code,
  ExternalLink,
  Play,
  Sparkles,
  Cpu,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";

interface IdeToolbarProps {
  projectName: string;
  projectId: string;
  displayTitle: string;
  downloadingZip: boolean;
  onDownloadZip: () => void;
  onRunInCloud: () => void;
  onRunLocalhost: () => void;
  aiChatOpen: boolean;
  onToggleAiChat: () => void;
  terminalOpen?: boolean;
  onToggleTerminal?: () => void;
}

export function IdeToolbar({
  projectName,
  projectId,
  displayTitle,
  downloadingZip,
  onDownloadZip,
  onRunInCloud,
  onRunLocalhost,
  aiChatOpen,
  onToggleAiChat,
  terminalOpen,
  onToggleTerminal,
}: IdeToolbarProps) {
  return (
    <div className="flex items-center justify-between h-13 px-4 bg-[#161b22] border-b border-border/40 shrink-0 text-slate-200 select-none">
      {/* Left: Navigation & Title */}
      <div className="flex items-center space-x-3">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <Link href={`/project/${projectId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-primary/10 text-primary">
            <Cpu className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-xs text-slate-100">
              {displayTitle}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              IDE & Code Editor
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Primary actions */}
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onRunLocalhost}
          className="h-8 gap-1.5 text-xs bg-emerald-950/40 text-emerald-400 border-emerald-800/50 hover:bg-emerald-900/60 hover:text-emerald-300"
        >
          <Play className="w-3.5 h-3.5 fill-emerald-400" />
          <span>Run in StackBlitz</span>
        </Button>

        {onToggleTerminal && (
          <Button
            variant={terminalOpen ? "secondary" : "outline"}
            size="sm"
            onClick={onToggleTerminal}
            title={terminalOpen ? "Hide Terminal (Ctrl+J)" : "Open Terminal (Ctrl+J)"}
            className={`h-8 gap-1.5 text-xs ${
              terminalOpen
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-slate-800/40 text-slate-300 border-slate-700 hover:bg-slate-800"
            }`}
          >
            <Code className="w-3.5 h-3.5 text-primary" />
            <span>Terminal</span>
          </Button>
        )}

        <Button
          variant={aiChatOpen ? "secondary" : "outline"}
          size="sm"
          onClick={onToggleAiChat}
          className={`h-8 gap-1.5 text-xs ${
            aiChatOpen
              ? "bg-primary/20 text-primary border-primary/40"
              : "bg-slate-800/40 text-slate-300 border-slate-700 hover:bg-slate-800"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>AI Agent</span>
        </Button>
      </div>

      {/* Right: Export */}
      <div className="flex items-center space-x-2">
        <Button
          onClick={onDownloadZip}
          disabled={downloadingZip}
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs bg-slate-800/40 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
        >
          <Archive className="w-3.5 h-3.5 text-primary" />
          {downloadingZip ? "Zipping..." : "Download ZIP"}
        </Button>

        <Button
          onClick={onRunInCloud}
          size="sm"
          className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Code className="w-3.5 h-3.5" />
          <span>StackBlitz IDE</span>
          <ExternalLink className="w-3 h-3 opacity-80" />
        </Button>
      </div>
    </div>
  );
}
