"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSidebarStore } from "@/lib/stores/sidebarStore";
import { useBackendSync } from "../../_components/hooks/useBackendSync";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@workspace/ui/components/button";
import { toast } from "sonner";

import { Terminal } from "../../_components/terminal";
import { PageEditorHeader, PageViewMode } from "./_components/PageEditorHeader";
import { PageFileExplorer } from "./_components/PageFileExplorer";
import { PageCodeEditor } from "./_components/PageCodeEditor";
import { PagePreviewViewport } from "./_components/PagePreviewViewport";
import { PageAiPanel } from "./_components/PageAiPanel";

import { useTerminalWorkspace } from "../../_components/terminal/hooks/useTerminalWorkspace";
import { useLocalDirectoryFiles } from "./_hooks/useLocalDirectoryFiles";
import { getParentPaths } from "../../_components/compiler";

import { useDevServerStatus } from "./_hooks/useDevServerStatus";
import { usePageCodeSync } from "./_hooks/usePageCodeSync";
import { usePageConversations } from "./_hooks/usePageConversations";
import { usePageAiEditor } from "./_hooks/usePageAiEditor";

import {
  pageRouteToFolderPath,
  pageRouteToUrl,
  parsePageRoute,
} from "@workspace/canvas";

export default function PageEditorPage({
  params,
}: {
  params: Promise<{ projectId: string; nodeId: string }>;
}) {
  const { projectId, nodeId } = React.use(params);

  // Sync canvas store with Convex
  useBackendSync(projectId, "graph");

  // Fetch project basic info
  const project = useQuery(api.projects.getProjectById, {
    projectId: projectId as Id<"projects">,
  });
  const projectName = project?.name || "Dezign2App";

  // Canvas store selectors
  const node = useBackendCanvasStore((s) => s.nodes.find((n) => n.id === nodeId));
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const patchNodeData = useMutation(api.canvas.patchNodeData);

  // Layout sidebar stores
  const aiPanelOpen = useSidebarStore((s) => s.aiPanelOpen);
  const setAiPanelOpen = useSidebarStore((s) => s.setAiPanelOpen);
  const terminalOpen = useSidebarStore((s) => s.terminalOpen);
  const setTerminalOpen = useSidebarStore((s) => s.setTerminalOpen);

  // Local Page Explorer open state
  const [explorerOpen, setExplorerOpen] = useState(true);

  // View Mode: "code" | "preview" | "split" (Default to split)
  const [viewMode, setViewMode] = useState<PageViewMode>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`page_editor_view_mode_${projectId}`);
        if (saved === "code" || saved === "preview" || saved === "split") {
          return saved;
        }
      } catch (e) {}
    }
    return "split";
  });

  const handleChangeViewMode = (mode: PageViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(`page_editor_view_mode_${projectId}`, mode);
    } catch (e) {}
  };

  // Find connected WebApp node to get port
  const connectedWebAppNode = useMemo(() => {
    const edge = edges.find(
      (e) =>
        (e.target === nodeId || e.source === nodeId) &&
        nodes.some((n) => n.type === "webApp" && (n.id === e.source || n.id === e.target))
    );
    if (!edge) return null;
    return nodes.find(
      (n) => n.type === "webApp" && (n.id === edge.source || n.id === edge.target)
    ) ?? null;
  }, [nodes, edges, nodeId]);

  const port = connectedWebAppNode?.data?.port || "3000";
  const rawLabel = typeof node?.data?.label === "string" ? node.data.label : "";
  const pageRoute = pageRouteToUrl(rawLabel);
  const pageFolderSlug = pageRouteToFolderPath(rawLabel);
  const pageName = parsePageRoute(rawLabel) || nodeId;
  const currentCustomCode = typeof node?.data?.pageSourceCode === "string" ? node.data.pageSourceCode : undefined;
  const previewUrl = `http://localhost:${port}${pageRoute}`;

  // 1. Workspace directory persistence & folder picker
  const { outputDir, handlePickDirectory } = useTerminalWorkspace(projectId);

  // 2. Real local filesystem explorer
  const {
    fileTree,
    totalFiles,
    isLoading: isLoadingLocalFiles,
    refreshFiles,
    readFile,
    writeFile,
  } = useLocalDirectoryFiles({
    outputDir,
    onPickDirectory: handlePickDirectory,
  });

  // Convex URL for backend engine
  const convexUrl =
    typeof window !== "undefined"
      ? (window as Window & { __convexUrl?: string }).__convexUrl ||
        process.env.NEXT_PUBLIC_CONVEX_URL ||
        ""
      : "";

  // 3. Hook: Dev Server status & preview reloading
  const {
    isServerRunning,
    isCheckingServer,
    iframeKey,
    reloadPreview,
    checkServerStatus,
  } = useDevServerStatus({ port });

  // 4. Hook: Page code disk/convex resolution & write
  const {
    resolveCurrentPageCode,
    writeCodeToDisk,
    defaultFilePath,
  } = usePageCodeSync({
    connectedWebAppNode,
    pageFolderSlug,
    outputDir,
    node,
  });

  // 5. Active File, Open Tabs, and Content State
  const [activeFilePath, setActiveFilePath] = useState<string>(defaultFilePath);
  const [openTabs, setOpenTabs] = useState<string[]>([defaultFilePath]);
  const [activeFileContent, setActiveFileContent] = useState<string>("");
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // In-memory edits cache for files
  const fileOverridesRef = useRef<Map<string, string>>(new Map());

  // Check if active file is the current page node's TSX file
  const isCurrentPageNode = useMemo(() => {
    return (
      activeFilePath === defaultFilePath ||
      activeFilePath.endsWith(`/${pageFolderSlug}/page.tsx`) ||
      (pageFolderSlug === "page" && activeFilePath.endsWith("/page.tsx"))
    );
  }, [activeFilePath, defaultFilePath, pageFolderSlug]);

  // Sync active file content when activeFilePath, node.data.pageSourceCode, or outputDir change
  useEffect(() => {
    let isMounted = true;

    async function loadContent() {
      // 1. If user edited this file in-memory
      if (fileOverridesRef.current.has(activeFilePath)) {
        if (isMounted) {
          setActiveFileContent(fileOverridesRef.current.get(activeFilePath) || "");
          setIsDirty(false);
        }
        return;
      }

      // 2. Try reading the real file directly from local disk
      if (outputDir) {
        const diskContent = await readFile(activeFilePath);
        if (isMounted && typeof diskContent === "string") {
          setActiveFileContent(diskContent);
          setIsDirty(false);
          return;
        }
      }

      // 3. If active file is the current page node, check Convex custom code
      if (isCurrentPageNode && currentCustomCode) {
        if (isMounted) {
          setActiveFileContent(currentCustomCode);
          setIsDirty(false);
        }
        return;
      }

      // 4. Fallback resolution for the page
      if (isCurrentPageNode) {
        const resolved = await resolveCurrentPageCode();
        if (isMounted) {
          setActiveFileContent(resolved.code || "");
          setIsDirty(false);
        }
        return;
      }

      if (isMounted) {
        setActiveFileContent("");
        setIsDirty(false);
      }
    }

    loadContent();

    return () => {
      isMounted = false;
    };
  }, [activeFilePath, isCurrentPageNode, currentCustomCode, outputDir, readFile, resolveCurrentPageCode]);

  // Expand parent paths for default file on mount
  useEffect(() => {
    if (defaultFilePath) {
      const parents = getParentPaths(defaultFilePath);
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        parents.forEach((p) => next.add(p));
        return next;
      });
    }
  }, [defaultFilePath]);

  // Handle File selection in Explorer
  const handleSelectFile = async (filePath: string) => {
    setActiveFilePath(filePath);
    if (!openTabs.includes(filePath)) {
      setOpenTabs((prev) => [...prev, filePath]);
    }
    const parents = getParentPaths(filePath);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      parents.forEach((p) => next.add(p));
      return next;
    });

    // Load file from disk
    const content = await readFile(filePath);
    if (typeof content === "string") {
      setActiveFileContent(content);
      setIsDirty(false);
    }
  };

  const handleCloseTab = (tabPath: string) => {
    const nextTabs = openTabs.filter((t) => t !== tabPath);
    setOpenTabs(nextTabs);
    if (activeFilePath === tabPath && nextTabs.length > 0) {
      setActiveFilePath(nextTabs[nextTabs.length - 1] || defaultFilePath);
    }
  };

  const handleToggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        for (const p of Array.from(next)) {
          if (p === path || p.startsWith(`${path}/`)) {
            next.delete(p);
          }
        }
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Handle manual code edits in Monaco Editor
  const handleEditorChange = (newCode: string) => {
    setActiveFileContent(newCode);
    setIsDirty(true);
    fileOverridesRef.current.set(activeFilePath, newCode);
  };

  // Handle manual Save (Ctrl+S or Save Button)
  const handleManualSave = async () => {
    if (!activeFileContent) return;
    setIsSaving(true);

    try {
      // 1. Write file to local disk
      await writeFile(activeFilePath, activeFileContent);

      // 2. If editing current page node, also sync to Convex
      if (isCurrentPageNode && node) {
        updateNode(nodeId, {
          data: {
            ...node.data,
            pageSourceCode: activeFileContent,
          },
        });

        await patchNodeData({
          projectId: projectId as Id<"projects">,
          nodeId,
          patch: {
            pageSourceCode: activeFileContent,
            aiEditing: false,
          },
        });
      }

      setIsDirty(false);
      toast.success(`Saved ${activeFilePath.split("/").pop()} to disk!`);
      setTimeout(reloadPreview, 600);
      refreshFiles();
    } catch (err) {
      console.error("[PageEditor] Save failed:", err);
      toast.error("Failed to save file");
    } finally {
      setIsSaving(false);
    }
  };

  // 6. Hook: Conversation thread history & messages
  const {
    activeConversationId,
    setActiveConversationId,
    convexMessages,
    messages,
    setTransientMessages,
    handleSelectConversation,
    handleNewConversation,
    handleDeleteConversation,
    handleClearHistory,
    updateTitleOnFirstMessage,
  } = usePageConversations({
    projectId,
    nodeId,
    pageName,
  });

  // 7. Hook: AI generation stream, stopping, reset & unlock
  const {
    prompt,
    setPrompt,
    streaming,
    streamingContent,
    streamingStatus,
    isAiEditing,
    handleSend,
    handleStop,
    handleUnlock,
    handleReset,
  } = usePageAiEditor({
    projectId,
    nodeId,
    pageName,
    pageRoute,
    node,
    convexUrl,
    activeConversationId,
    setActiveConversationId,
    convexMessages,
    setTransientMessages,
    updateTitleOnFirstMessage,
    resolveCurrentPageCode,
    writeCodeToDisk,
    onCodeUpdated: () => {
      reloadPreview();
      setIsDirty(false);
      refreshFiles();
    },
  });

  const handleStartDevServer = useCallback(() => {
    setTerminalOpen(true);
    toast.info("Terminal opened — start dev server with 'pnpm dev'");
  }, [setTerminalOpen]);

  if (project === undefined) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/projects" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-background text-foreground select-none flex flex-col font-sans">
      {/* Top Header */}
      <PageEditorHeader
        projectId={projectId}
        projectName={projectName}
        pageName={pageName}
        pageRoute={pageRoute}
        previewUrl={previewUrl}
        hasCustomCode={Boolean(currentCustomCode)}
        viewMode={viewMode}
        onChangeViewMode={handleChangeViewMode}
        outputDir={outputDir}
        onPickDirectory={handlePickDirectory}
        isServerRunning={isServerRunning}
        onStartDevServer={handleStartDevServer}
        explorerOpen={explorerOpen}
        onToggleExplorer={() => setExplorerOpen((prev) => !prev)}
        terminalOpen={terminalOpen}
        onToggleTerminal={() => setTerminalOpen((prev) => !prev)}
        aiPanelOpen={aiPanelOpen}
        onToggleAiPanel={() => setAiPanelOpen(!aiPanelOpen)}
        onReloadPreview={reloadPreview}
        onReset={currentCustomCode ? handleReset : undefined}
      />

      {/* Main Studio Workspace: Left Local File Explorer + Center Viewport (Code/Preview/Split + Terminal) + Right AI Panel */}
      <div className="flex-1 min-h-0 w-full flex overflow-hidden relative">
        {/* Left: Real Local Files Explorer Sidebar */}
        <PageFileExplorer
          isOpen={explorerOpen}
          onToggle={() => setExplorerOpen(false)}
          outputDir={outputDir}
          onPickDirectory={handlePickDirectory}
          fileTree={fileTree}
          activePath={activeFilePath}
          pageDefaultPath={defaultFilePath}
          pageName={pageName}
          expandedPaths={expandedPaths}
          onToggleExpand={handleToggleExpand}
          onSelectFile={handleSelectFile}
          totalFiles={totalFiles}
          onRefreshFiles={refreshFiles}
          isLoading={isLoadingLocalFiles}
        />

        {/* Center: Main Viewport (Split, Code, or Preview) + Docked Bottom Terminal */}
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
          {/* Active Viewport Area */}
          <div className="flex-1 min-h-0 w-full flex overflow-hidden relative">
            {/* View Mode: Split (Code on left + Preview on right) */}
            {viewMode === "split" && (
              <>
                <div className="flex-1 min-w-0 h-full border-r border-sidebar-border overflow-hidden">
                  <PageCodeEditor
                    activeFilePath={activeFilePath}
                    fileContent={activeFileContent}
                    onChange={handleEditorChange}
                    onSave={handleManualSave}
                    isDirty={isDirty}
                    isSaving={isSaving}
                    openTabs={openTabs}
                    onSelectTab={setActiveFilePath}
                    onCloseTab={handleCloseTab}
                    isCurrentPageNode={isCurrentPageNode}
                    hasCustomAiCode={Boolean(currentCustomCode)}
                    onResetToCompiler={currentCustomCode ? handleReset : undefined}
                  />
                </div>
                <div className="flex-1 min-w-0 h-full overflow-hidden">
                  <PagePreviewViewport
                    projectId={projectId}
                    port={port}
                    pageRoute={pageRoute}
                    pageName={pageName}
                    previewUrl={previewUrl}
                    iframeKey={iframeKey}
                    isServerRunning={isServerRunning}
                    isCheckingServer={isCheckingServer}
                    onRetryServerCheck={() => {
                      checkServerStatus();
                      reloadPreview();
                    }}
                    onStartDevServer={handleStartDevServer}
                    onReloadPreview={reloadPreview}
                  />
                </div>
              </>
            )}

            {/* View Mode: Code Only */}
            {viewMode === "code" && (
              <div className="flex-1 min-w-0 h-full overflow-hidden">
                <PageCodeEditor
                  activeFilePath={activeFilePath}
                  fileContent={activeFileContent}
                  onChange={handleEditorChange}
                  onSave={handleManualSave}
                  isDirty={isDirty}
                  isSaving={isSaving}
                  openTabs={openTabs}
                  onSelectTab={setActiveFilePath}
                  onCloseTab={handleCloseTab}
                  isCurrentPageNode={isCurrentPageNode}
                  hasCustomAiCode={Boolean(currentCustomCode)}
                  onResetToCompiler={currentCustomCode ? handleReset : undefined}
                />
              </div>
            )}

            {/* View Mode: Preview Only */}
            {viewMode === "preview" && (
              <div className="flex-1 min-w-0 h-full overflow-hidden">
                <PagePreviewViewport
                  projectId={projectId}
                  port={port}
                  pageRoute={pageRoute}
                  pageName={pageName}
                  previewUrl={previewUrl}
                  iframeKey={iframeKey}
                  isServerRunning={isServerRunning}
                  isCheckingServer={isCheckingServer}
                  onRetryServerCheck={() => {
                    checkServerStatus();
                    reloadPreview();
                  }}
                  onStartDevServer={handleStartDevServer}
                  onReloadPreview={reloadPreview}
                />
              </div>
            )}
          </div>

          {/* Bottom Docked Terminal Panel */}
          <Terminal
            projectId={projectId}
            projectName={projectName}
            isOpen={terminalOpen}
            onToggleOpen={() => setTerminalOpen((prev) => !prev)}
          />
        </div>

        {/* Right: AI Assistant & Code Agent Sidebar */}
        <PageAiPanel
          isOpen={aiPanelOpen}
          onToggle={() => setAiPanelOpen(!aiPanelOpen)}
          messages={messages}
          prompt={prompt}
          setPrompt={setPrompt}
          streaming={streaming}
          streamingContent={streamingContent}
          streamingStatus={streamingStatus}
          isAiEditing={isAiEditing}
          outputDir={outputDir}
          pageName={pageName}
          activeFilePath={activeFilePath}
          onSend={handleSend}
          onStop={handleStop}
          onReset={currentCustomCode ? handleReset : undefined}
          onUnlock={handleUnlock}
          onClearHistory={activeConversationId ? handleClearHistory : undefined}
          hasCustomCode={Boolean(currentCustomCode)}
          projectId={projectId}
          nodeId={nodeId}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
        />
      </div>
    </div>
  );
}
