"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Pencil,
  Code2,
  Globe,
  Columns2,
  Terminal,
  FolderSync,
  Play,
  Layers,
  CheckCircle2,
  XCircle,
  Folder,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";

export type PageViewMode = "code" | "preview" | "split";

export interface PageEditorHeaderProps {
  projectId: string;
  projectName: string;
  pageName: string;
  pageRoute: string;
  previewUrl: string;
  hasCustomCode: boolean;
  viewMode: PageViewMode;
  onChangeViewMode: (mode: PageViewMode) => void;
  outputDir: string;
  onPickDirectory?: () => void;
  isServerRunning: boolean | null;
  onStartDevServer: () => void;
  explorerOpen: boolean;
  onToggleExplorer: () => void;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  aiPanelOpen: boolean;
  onToggleAiPanel: () => void;
  onReloadPreview: () => void;
  onReset?: () => void;
}

export function PageEditorHeader({
  projectId,
  projectName,
  pageName,
  pageRoute,
  previewUrl,
  hasCustomCode,
  viewMode,
  onChangeViewMode,
  outputDir,
  onPickDirectory,
  isServerRunning,
  onStartDevServer,
  explorerOpen,
  onToggleExplorer,
  terminalOpen,
  onToggleTerminal,
  aiPanelOpen,
  onToggleAiPanel,
  onReloadPreview,
  onReset,
}: PageEditorHeaderProps) {
  const folderName = outputDir
    ? outputDir.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || outputDir
    : "";

  return (
    <header className="h-12 px-3 border-b border-sidebar-border bg-sidebar/95 backdrop-blur-md flex items-center justify-between shrink-0 z-30 select-none font-sans">
      {/* Left Side: Back button + Explorer Toggle + Breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link href={`/project/${projectId}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to Project Canvas</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={explorerOpen ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={onToggleExplorer}
            >
              <Layers className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{explorerOpen ? "Hide File Explorer" : "Show File Explorer"}</TooltipContent>
        </Tooltip>

        <div className="h-4 w-[1px] bg-sidebar-border mx-1 shrink-0" />

        {/* Breadcrumb Title */}
        <div className="flex items-center gap-2 truncate text-xs">
          <span className="text-muted-foreground truncate hidden sm:inline">{projectName}</span>
          <span className="text-muted-foreground/60 hidden sm:inline">/</span>
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{pageName}</span>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 font-mono text-muted-foreground border-sidebar-border bg-sidebar-accent shrink-0"
          >
            {pageRoute}
          </Badge>

          {hasCustomCode && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-medium text-primary border-primary/30 bg-primary/10 shrink-0 hidden md:inline-flex"
            >
              AI-Customized
            </Badge>
          )}
        </div>
      </div>

      {/* Center: View Mode Segmented Controls + Dev Server Status */}
      <div className="flex items-center gap-2">
        {/* View Mode Toggle: Code | Preview | Split */}
        <div className="flex items-center bg-sidebar-accent/80 border border-sidebar-border rounded-lg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onChangeViewMode("code")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              viewMode === "code"
                ? "bg-sidebar text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Code</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeViewMode("split")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              viewMode === "split"
                ? "bg-sidebar text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeViewMode("preview")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
              viewMode === "preview"
                ? "bg-sidebar text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </button>
        </div>

        {/* Dev Server Status & Quick Run */}
        <div className="hidden lg:flex items-center gap-1.5 pl-2 border-l border-sidebar-border">
          {isServerRunning === true ? (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px]">
              <CheckCircle2 className="w-3 h-3" />
              <span>Dev Server Online</span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onStartDevServer}
              className="h-7 px-2 text-[11px] border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 gap-1.5"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Start Server</span>
            </Button>
          )}

          {/* Quick Preview Reload */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded"
                onClick={onReloadPreview}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload Live Preview</TooltipContent>
          </Tooltip>

          {/* Open Preview External */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded"
                asChild
              >
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Preview in New Tab ({previewUrl})</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Right Side: Folder Indicator, Terminal Toggle, AI Assistant Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Workspace Folder Badge */}
        {outputDir ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onPickDirectory}
                className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-md bg-sidebar-accent/50 border border-sidebar-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              >
                <FolderSync className="w-3 h-3 text-emerald-400" />
                <span className="font-mono max-w-[120px] truncate">{folderName}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Local folder: {outputDir} (Click to change)</TooltipContent>
          </Tooltip>
        ) : onPickDirectory ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onPickDirectory}
                className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors font-medium cursor-pointer"
              >
                <Folder className="w-3 h-3 text-amber-500" />
                <span>Select Folder</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>No project folder selected. Click to select a local folder for this project.</TooltipContent>
          </Tooltip>
        ) : null}

        {/* Terminal Toggle Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={terminalOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-8 text-xs gap-1.5 px-2.5 text-muted-foreground hover:text-foreground"
              onClick={onToggleTerminal}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Terminal</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{terminalOpen ? "Hide Terminal (Ctrl+J)" : "Open Terminal (Run dev server) (Ctrl+J)"}</TooltipContent>
        </Tooltip>

        {/* Full Project Compiler IDE Link */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2.5 hidden lg:flex"
              asChild
            >
              <Link href={`/project/${projectId}/compiler`}>
                <Code2 className="h-3.5 w-3.5" />
                <span>Compiler</span>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open Full Monorepo Compiler IDE</TooltipContent>
        </Tooltip>

        {/* AI Assistant Sidebar Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={aiPanelOpen ? "default" : "outline"}
              size="sm"
              className={`h-8 text-xs gap-1.5 px-2.5 transition-colors ${
                aiPanelOpen
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-sidebar-border bg-sidebar hover:bg-sidebar-accent text-sidebar-foreground"
              }`}
              onClick={onToggleAiPanel}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="font-medium">AI Assistant</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{aiPanelOpen ? "Hide AI Assistant" : "Open AI Assistant & Agent"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
