import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  compileMonorepo,
  CompiledMonorepoResult,
  CompiledFile,
} from "@/lib/compiler";
import {
  Copy,
  Check,
  Download,
  Server,
  FileCode,
  Cpu,
  ExternalLink,
  Code,
  Archive,
  Layers,
} from "lucide-react";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { toast } from "sonner";
import sdk from "@stackblitz/sdk";
import {
  buildFileTree,
  getParentPaths,
  FileTreeExplorer,
} from "./FileTreeExplorer";
import { DockerRunnerDialog } from "./DockerRunnerDialog";

export interface CompiledCodeViewerProps {
  projectName?: string;
  projectId?: string;
  overrideFiles?: CompiledFile[];
  overrideTitle?: string;
  showTopBar?: boolean;
}

export function CompiledCodeViewer({
  projectName,
  projectId,
  overrideFiles,
  overrideTitle,
  showTopBar = true,
}: CompiledCodeViewerProps) {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const events = useBackendCanvasStore((s) => s.events);
  const edges = useBackendCanvasStore((s) => s.edges);
  const testCases = useSimulationStore((s) => s.testCases);

  const [selectedFilename, setSelectedFilename] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const storageKey = projectId ? `compiler_modal_state_${projectId}` : "compiler_modal_state";
        const saved = window.localStorage.getItem(storageKey);
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
        const storageKey = projectId ? `compiler_modal_state_${projectId}` : "compiler_modal_state";
        const saved = window.localStorage.getItem(storageKey);
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
  
  const [copied, setCopied] = useState<boolean>(false);
  const [downloadingZip, setDownloadingZip] = useState<boolean>(false);
  const [dockerDialogOpen, setDockerDialogOpen] = useState<boolean>(false);

  const formattedProjectName = useMemo(() => {
    const raw = (projectName || "Dezign2App").trim();
    if (raw.toLowerCase().endsWith("monorepo")) {
      return raw;
    }
    return `${raw} Monorepo`;
  }, [projectName]);

  const monorepoResult: CompiledMonorepoResult = useMemo(
    () =>
      compileMonorepo(
        nodes,
        endpoints,
        events,
        edges,
        testCases,
        formattedProjectName,
      ),
    [nodes, endpoints, events, edges, testCases, formattedProjectName],
  );

  const files = overrideFiles || monorepoResult.files;
  const displayTitle =
    overrideTitle ||
    (overrideFiles
      ? projectName || "Compiled Code Workspace"
      : "Monorepo Compiler Engine");

  const fileTree = useMemo(() => buildFileTree(files), [files]);

  const hasRestoredRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!files || files.length === 0) return;
    const keyId = projectId || "default";
    if (hasRestoredRef.current === keyId) return;
    hasRestoredRef.current = keyId;

    const fileExists = selectedFilename && files.some((f) => f.filename === selectedFilename);
    let targetFile = fileExists ? selectedFilename : "";

    if (!targetFile) {
      const readme = files.find(
        (f) => f.filename.toLowerCase() === "readme.md",
      );
      targetFile = readme ? readme.filename : files[0]?.filename || "README.md";
    }

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
      try {
        const storageKey = projectId ? `compiler_modal_state_${projectId}` : "compiler_modal_state";
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            selectedFilename: targetFile,
            expandedPaths: Array.from(nextExpanded),
          }),
        );
      } catch (e) {
        console.error("Failed to save compiler viewer state", e);
      }
    }
  }, [projectId, files, selectedFilename, expandedPaths]);

  const handleSelectFile = (filename: string) => {
    setSelectedFilename(filename);
    const parents = getParentPaths(filename);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      parents.forEach((p) => next.add(p));
      try {
        const storageKey = projectId
          ? `compiler_modal_state_${projectId}`
          : "compiler_modal_state";
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            selectedFilename: filename,
            expandedPaths: Array.from(next),
          }),
        );
      } catch (e) {
        console.error("Failed to save compiler viewer state", e);
      }
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
      try {
        const storageKey = projectId
          ? `compiler_modal_state_${projectId}`
          : "compiler_modal_state";
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            selectedFilename,
            expandedPaths: Array.from(next),
          }),
        );
      } catch (e) {
        console.error("Failed to save compiler viewer state", e);
      }
      return next;
    });
  };

  const activeFile =
    files.find((f) => f.filename === selectedFilename) || files[0];

  const handleCopy = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    toast.success(`Copied ${activeFile.filename} to clipboard!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeFile.filename.split("/").pop() || activeFile.filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${activeFile.filename}`);
  };

  const handleDownloadZip = async () => {
    if (files.length === 0) return;
    setDownloadingZip(true);
    toast.info("Compressing project into ZIP...");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      files.forEach((file) => {
        zip.file(file.filename, file.content);
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const zipName = `${displayTitle.toLowerCase().replace(/[^a-z0-9]/g, "-")}.zip`;
      a.download = zipName;
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
    if (files.length === 0) return;

    const fileMap: Record<string, string> = {};
    files.forEach((f) => {
      fileMap[f.filename] = f.content;
    });

    const defaultOpenFile =
      files.find(
        (f) =>
          f.filename.endsWith("index.ts") || f.filename.endsWith("index.js"),
      )?.filename ||
      files[0]?.filename ||
      "README.md";

    sdk.openProject(
      {
        title: displayTitle,
        description: `Generated project workspace`,
        template: "node",
        files: fileMap,
        settings: {
          compile: {
            trigger: "auto",
            clearConsole: false,
          },
        },
      },
      {
        newWindow: true,
        openFile: defaultOpenFile,
      },
    );
    toast.success(`Opening project workspace live in StackBlitz Cloud IDE!`);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-card">
      {showTopBar && (
        <div className="px-6 py-4 border-b border-border/60 bg-muted/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold flex items-center gap-2 text-foreground">
                {displayTitle}
              </h3>
              <p className="text-xs mt-0.5 text-orange-500">
                NOTICE: 🚧 Automated AI Business logic implementation,Testing
                & Deployment is under construction🚧
                <span className="block text-yellow-500">
                  {" "}
                  Now download the repo and continue with your AI Coding
                  Agents..!
                </span>
              </p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setDockerDialogOpen(true)}
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs border-primary/40 text-primary hover:bg-primary/10"
              >
                <Layers className="w-4 h-4 text-primary" />
                <span>Run Docker</span>
              </Button>
              <Button
                onClick={handleDownloadZip}
                disabled={downloadingZip}
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
              >
                <Archive className="w-4 h-4 text-primary" />
                {downloadingZip ? "Zipping..." : "Download ZIP"}
              </Button>
              <Button
                onClick={handleRunInCloud}
                size="sm"
                className="gap-1.5 text-xs"
              >
                <Code className="w-4 h-4" />
                Open IDE
                <ExternalLink className="w-3 h-3 opacity-80" />
              </Button>
            </div>
          )}
        </div>
      )}

      {files.length === 0 ? (
        <div className="p-12 text-center flex flex-col items-center justify-center gap-3 flex-1">
          <Server className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            No Nodes Found
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-sm">
            Add Service, Database Entity, or LangGraph nodes on the canvas to
            generate backend code templates.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* File Explorer Sidebar */}
          <FileTreeExplorer
            fileTree={fileTree}
            activeFilename={activeFile?.filename || ""}
            expandedPaths={expandedPaths}
            totalFiles={files.length}
            onToggleExpand={handleToggleExpand}
            onSelectFile={handleSelectFile}
          />

          {/* Code Viewer */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">
            <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-border/40 text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-300 truncate">
                <FileCode className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">{activeFile?.filename}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 px-2 text-xs gap-1.5 text-slate-300 hover:text-white"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="h-7 px-2 text-xs gap-1.5 text-slate-300 hover:text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </Button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-auto font-mono text-xs leading-relaxed text-slate-200">
              {activeFile ? (
                <pre className="whitespace-pre">
                  <code>{activeFile.content}</code>
                </pre>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <DockerRunnerDialog
        open={dockerDialogOpen}
        onOpenChange={setDockerDialogOpen}
        projectName={projectName || "Dezign2App"}
        projectId={projectId || "default"}
        monorepoResult={monorepoResult}
        onDownloadZip={handleDownloadZip}
        downloadingZip={downloadingZip}
      />
    </div>
  );
}
