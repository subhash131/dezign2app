"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { compileMonorepo, CompiledMonorepoResult } from "@/lib/compiler";
import { Loader2, GitBranch, XCircle, AlertTriangle, Radio, CheckCircle2, Terminal, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@workspace/ui/components/button";
import { toast } from "sonner";
import sdk from "@stackblitz/sdk";
import { IdeToolbar } from "./_components/IdeToolbar";
import { AiChatPanel } from "./_components/AiChatPanel";
import { MonacoEditorPane } from "./_components/MonacoEditorPane";
import { FileExplorer } from "./_components/FileExplorer";
import { TerminalPanel, TerminalLog, TerminalPanelTab } from "./_components/TerminalPanel";
import { buildFileTree, getParentPaths } from "../_components/compiler";
import { useBackendSync } from "../_components/hooks/useBackendSync";
import { useTerminalWorkspace } from "../_components/terminal/hooks/useTerminalWorkspace";
import { useStoreHydration } from "./_lib/useStoreHydration";
import { useMonacoEditor } from "./_lib/useMonacoEditor";
import { findEndpointForFile } from "./_lib/editorUtils";

export default function CompilerPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = React.use(params);

  // Flush canvas store changes to DB
  useBackendSync(projectId, "graph");

  // Output directory workspace persistence (for desktop PTY / local sync)
  const { outputDir } = useTerminalWorkspace(projectId);

  // Store selectors
  const storeProjectId = useBackendCanvasStore((s) => s.projectId);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const events = useBackendCanvasStore((s) => s.events);
  const edges = useBackendCanvasStore((s) => s.edges);
  const updateEndpoint = useBackendCanvasStore((s) => s.updateEndpoint);
  const testCases = useSimulationStore((s) => s.testCases);

  // Convex queries
  const project = useQuery(api.projects.getProjectById, {
    projectId: projectId as Id<"projects">,
  });
  const canvasElements = useQuery(api.canvas.getBackendElements, {
    projectId: projectId as Id<"projects">,
  });

  // Hydrate Zustand store from Convex on direct URL open / hard refresh
  useStoreHydration(projectId, canvasElements);

  // Compile the monorepo file tree
  const projectName = project?.name || "Dezign2App";
  const formattedProjectName = useMemo(() => {
    const raw = projectName.trim();
    return raw.toLowerCase().endsWith("monorepo") ? raw : `${raw} Monorepo`;
  }, [projectName]);

  const monorepoResult: CompiledMonorepoResult = useMemo(
    () => compileMonorepo(nodes, endpoints, events, edges, testCases, formattedProjectName),
    [nodes, endpoints, events, edges, testCases, formattedProjectName],
  );

  const files = monorepoResult.files;
  const fileTree = useMemo(() => buildFileTree(files), [files]);

  // UI state
  const [selectedFilename, setSelectedFilename] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(`compiler_page_state_${projectId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.selectedFilename === "string" && parsed.selectedFilename) {
            return parsed.selectedFilename;
          }
        }
      } catch (e) {}
    }
    return "README.md";
  });
  
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(`compiler_page_state_${projectId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed.expandedPaths)) {
            return new Set(parsed.expandedPaths);
          }
        }
      } catch (e) {}
    }
    return new Set();
  });

  const [copied, setCopied] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`compiler_terminal_open_${projectId}`);
        if (saved !== null) return saved === "true";
      } catch (e) {}
    }
    return true;
  });

  const [terminalTab, setTerminalTab] = useState<TerminalPanelTab>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`compiler_terminal_tab_${projectId}`);
        if (saved && ["problems", "output", "terminal", "ports"].includes(saved)) {
          return saved as TerminalPanelTab;
        }
      } catch (e) {}
    }
    return "terminal";
  });

  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`compiler_terminal_logs_${projectId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (e) {}
    }
    return [
      {
        id: "1",
        timestamp: new Date().toLocaleTimeString(),
        type: "info",
        text: `Monorepo workspace loaded (${files.length} files generated)`,
      },
      {
        id: "2",
        timestamp: new Date().toLocaleTimeString(),
        type: "success",
        text: `Compiler ready · Project: ${formattedProjectName}`,
      },
    ];
  });

  const handleSelectTab = (tab: TerminalPanelTab) => {
    setTerminalTab(tab);
    try {
      localStorage.setItem(`compiler_terminal_tab_${projectId}`, tab);
    } catch (e) {}
  };

  const handleToggleTerminal = () => {
    setTerminalOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`compiler_terminal_open_${projectId}`, String(next));
      } catch (e) {}
      return next;
    });
  };

  const handleClearLogs = () => {
    setTerminalLogs([]);
    try {
      localStorage.setItem(`compiler_terminal_logs_${projectId}`, JSON.stringify([]));
    } catch (e) {}
  };

  const detectedPorts = useMemo(() => {
    const list: Array<{ port: number | string; name: string; type?: string; url?: string }> = [];
    nodes.forEach((n) => {
      if (n.type === "webApp" && n.data?.port) {
        list.push({
          port: n.data.port,
          name: n.data.label || "Web Application",
          type: "Next.js App",
          url: `http://localhost:${n.data.port}`,
        });
      } else if (n.type === "service" && (n.data?.port || n.data?.targetServerId)) {
        list.push({
          port: n.data.port || "4000",
          name: n.data.label || "Backend Service",
          type: (n.data.techStack as string) || "Microservice",
          url: `http://localhost:${n.data.port || "4000"}`,
        });
      }
    });
    if (list.length === 0) {
      list.push({
        port: "3000",
        name: "Web Application",
        type: "Next.js App",
        url: "http://localhost:3000",
      });
      list.push({
        port: "3002",
        name: "System Design Engine",
        type: "Express API",
        url: "http://localhost:3002",
      });
    }
    return list;
  }, [nodes]);

  const hasRestoredRef = React.useRef<string | null>(null);

  const savePageState = (filename: string, expanded: Set<string>) => {
    try {
      localStorage.setItem(
        `compiler_page_state_${projectId}`,
        JSON.stringify({ selectedFilename: filename, expandedPaths: Array.from(expanded) }),
      );
    } catch (e) {
      console.error("Failed to save compiler page state", e);
    }
  };

  // Validate selected file & expand parent paths once Convex & store finish hydration
  React.useEffect(() => {
    if (!files || files.length === 0) return;
    if (project === undefined || canvasElements === undefined || storeProjectId !== projectId) return;
    if (hasRestoredRef.current === projectId) return;
    hasRestoredRef.current = projectId;

    const fileExists = selectedFilename && files.some((f) => f.filename === selectedFilename);
    const targetFile = fileExists
      ? selectedFilename
      : files.find((f) => f.filename.toLowerCase() === "readme.md")?.filename ??
        files[0]?.filename ??
        "README.md";

    let changed = false;
    if (targetFile !== selectedFilename) {
      setSelectedFilename(targetFile);
      changed = true;
    }

    const targetParents = getParentPaths(targetFile);
    const nextExpanded = new Set(expandedPaths);
    let expandedChanged = false;
    
    targetParents.forEach(p => {
      if (!nextExpanded.has(p)) {
        nextExpanded.add(p);
        expandedChanged = true;
      }
    });

    if (expandedChanged) {
      setExpandedPaths(nextExpanded);
    }
    
    if (changed || expandedChanged) {
      savePageState(targetFile, nextExpanded);
    }
  }, [projectId, files, project, canvasElements, storeProjectId, selectedFilename, expandedPaths]);

  const handleSelectFile = (filename: string) => {
    setSelectedFilename(filename);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      getParentPaths(filename).forEach((p) => next.add(p));
      savePageState(filename, next);
      return next;
    });
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
      savePageState(selectedFilename, next);
      return next;
    });
  };

  const activeFile = files.find((f) => f.filename === selectedFilename) ?? files[0];

  // Monaco editor state + all bug fixes encapsulated in the hook
  const { editorRef, handleEditorMount, handleEditorChange } = useMonacoEditor({
    activeFile,
    endpoints,
    updateEndpoint,
  });

  // File action handlers
  const handleCopy = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    toast.success(`Copied ${activeFile.filename} to clipboard!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: activeFile.filename.split("/").pop() || activeFile.filename,
    });
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${activeFile.filename}`);
  };

  const handleDownloadZip = async () => {
    if (!files.length) return;
    setDownloadingZip(true);
    toast.info("Compressing project into ZIP...");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.filename, f.content));
      const blob = await zip.generateAsync({ type: "blob" });
      const zipName = `${formattedProjectName.toLowerCase().replace(/[^a-z0-9]/g, "-")}.zip`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: zipName });
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${zipName}!`);
    } catch (err) {
      console.error("Failed to generate ZIP archive:", err);
      toast.error("Failed to generate ZIP archive");
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleRunInCloud = () => {
    if (!files.length) return;
    const fileMap: Record<string, string> = {};
    files.forEach((f) => (fileMap[f.filename] = f.content));
    const openFile =
      files.find((f) => f.filename.endsWith("index.ts") || f.filename.endsWith("index.js"))
        ?.filename ?? files[0]?.filename ?? "README.md";
    sdk.openProject(
      { title: formattedProjectName, description: "Generated project workspace", template: "node", files: fileMap, settings: { compile: { trigger: "auto", clearConsole: false } } },
      { newWindow: true, openFile },
    );
    toast.success("Opening project workspace live in StackBlitz Cloud IDE!");
  };

  // Loading state
  const isHydrating =
    project === undefined ||
    canvasElements === undefined ||
    storeProjectId !== projectId;

  if (project === null) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#0d1117]">
        <p className="text-slate-300 font-mono text-sm">Project not found.</p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700 hover:text-white"
        >
          <Link href="/projects" className="flex items-center gap-2 font-mono text-xs">
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </Link>
        </Button>
      </div>
    );
  }

  if (isHydrating) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d1117] flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-xs text-slate-400 font-mono">
          {canvasElements === undefined ? "Loading project canvas..." : "Compiling monorepo..."}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0d1117]">
      <IdeToolbar
        projectName={projectName}
        projectId={projectId}
        displayTitle={formattedProjectName}
        downloadingZip={downloadingZip}
        onDownloadZip={handleDownloadZip}
        onRunInCloud={handleRunInCloud}
        onRunLocalhost={handleRunInCloud}
        aiChatOpen={aiChatOpen}
        onToggleAiChat={() => setAiChatOpen(!aiChatOpen)}
        terminalOpen={terminalOpen}
        onToggleTerminal={handleToggleTerminal}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <FileExplorer
          fileCount={files.length}
          fileTree={fileTree}
          activePath={activeFile?.filename ?? ""}
          expandedPaths={expandedPaths}
          onToggleExpand={handleToggleExpand}
          onSelectFile={handleSelectFile}
        />

        {/* Center: Editor on top, VS Code-style Terminal Panel docked at bottom */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden relative">
          <MonacoEditorPane
            activeFile={activeFile}
            onMount={handleEditorMount}
            onCopy={handleCopy}
            onDownload={handleDownload}
            copied={copied}
          />

          <TerminalPanel
            projectId={projectId}
            outputDir={outputDir}
            logs={terminalLogs}
            onClearLogs={handleClearLogs}
            isOpen={terminalOpen}
            onToggleOpen={handleToggleTerminal}
            activeTab={terminalTab}
            onSelectTab={handleSelectTab}
            ports={detectedPorts}
            outputLogs={[
              `[Monorepo Compiler] ${formattedProjectName}`,
              `✔ Compiled ${files.length} files across ${nodes.length} architecture nodes`,
              `✔ Monorepo workspaces: apps/*, packages/*, services/*`,
              `✔ TypeScript, Next.js, and Docker build configurations verified`,
              `✔ ${detectedPorts.length} services configured with local ports`,
              `[Ready] Waiting for dev or build triggers in Terminal...`,
            ]}
          />
        </div>

        <AiChatPanel
          isOpen={aiChatOpen}
          onClose={() => setAiChatOpen(false)}
          activeFile={activeFile}
          onApplyCode={(suggestedCode) => {
            const ep = findEndpointForFile(activeFile?.filename ?? "", endpoints);
            if (ep) {
              updateEndpoint(ep.id, { body: suggestedCode, code: suggestedCode });
              toast.success("Applied code to function body & updated canvas!");
            } else {
              toast.info("Could not match active file to a canvas endpoint");
            }
          }}
        />
      </div>

      {/* VS Code Bottom Status Bar */}
      <div className="h-6 bg-[#161b22] border-t border-border/40 px-3 flex items-center justify-between text-[11px] font-sans text-slate-300 shrink-0 select-none z-30">
        {/* Left items */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center gap-1.5 text-slate-200">
            <GitBranch className="w-3 h-3 text-slate-400" />
            <span className="font-mono text-[10px]">main</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setTerminalOpen(true);
              try {
                localStorage.setItem(`compiler_terminal_open_${projectId}`, "true");
              } catch (e) {}
              handleSelectTab("problems");
            }}
            className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors"
          >
            <XCircle className="w-3 h-3 text-emerald-400" />
            <span className="font-mono text-[10px]">0</span>
            <AlertTriangle className="w-3 h-3 text-amber-400 ml-1" />
            <span className="font-mono text-[10px]">0</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleToggleTerminal();
              handleSelectTab("terminal");
            }}
            className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors ${
              terminalOpen
                ? "bg-slate-700/60 text-white"
                : "hover:bg-slate-800 text-slate-300 hover:text-white"
            }`}
          >
            <Terminal className="w-3 h-3 text-primary" />
            <span>Terminal</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTerminalOpen(true);
              try {
                localStorage.setItem(`compiler_terminal_open_${projectId}`, "true");
              } catch (e) {}
              handleSelectTab("ports");
            }}
            className="flex items-center gap-1 text-slate-300 hover:text-white transition-colors"
          >
            <Radio className="w-3 h-3 text-emerald-400" />
            <span className="font-mono text-[10px]">{detectedPorts.length} Ports</span>
          </button>
        </div>

        {/* Right items */}
        <div className="flex items-center space-x-3 text-slate-300">
          <span className="font-mono text-[10px]">Ln 1, Col 1</span>
          <span className="font-mono text-[10px]">Spaces: 2</span>
          <span className="font-mono text-[10px]">UTF-8</span>
          <span className="font-mono text-[10px] uppercase font-medium text-slate-300">
            {activeFile?.filename?.endsWith(".tsx") || activeFile?.filename?.endsWith(".ts")
              ? "TypeScript React"
              : activeFile?.filename?.endsWith(".json")
              ? "JSON"
              : activeFile?.filename?.endsWith(".md")
              ? "Markdown"
              : "Plain Text"}
          </span>
          <div className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            <span className="text-[10px]">Prettier</span>
          </div>
        </div>
      </div>
    </div>
  );
}
