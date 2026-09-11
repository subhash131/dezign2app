"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import {
  Archive,
  Copy,
  Check,
  Folder,
  Play,
  Square,
  ExternalLink,
  Laptop,
  Globe,
  Terminal as TerminalIcon,
  Server,
  Layers,
  Sparkles,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { isElectron, getElectronAPI, openExternalUrl } from "@/lib/electron";
import { CompiledFile, CompiledMonorepoResult } from "@/lib/compiler";
import { DockerTerminalMonitor, ServiceEndpointInfo } from "./DockerTerminalMonitor";

export interface DockerRunnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectId: string;
  monorepoResult: CompiledMonorepoResult;
  onDownloadZip?: () => void;
  downloadingZip?: boolean;
}

export function DockerRunnerDialog({
  open,
  onOpenChange,
  projectName,
  projectId,
  monorepoResult,
  onDownloadZip,
  downloadingZip = false,
}: DockerRunnerDialogProps) {
  const inElectron = isElectron();
  const files = monorepoResult.files;

  // Local state
  const [outputDir, setOutputDir] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return (
          localStorage.getItem(`workspace_dir_${projectId}`) ||
          localStorage.getItem(`docker_dir_${projectId}`) ||
          localStorage.getItem("dezign2app_workspace_dir") ||
          ""
        );
      } catch (e) {}
    }
    return "";
  });

  useEffect(() => {
    if (!projectId || typeof window === "undefined") return;
    try {
      const saved =
        localStorage.getItem(`workspace_dir_${projectId}`) ||
        localStorage.getItem(`docker_dir_${projectId}`) ||
        localStorage.getItem("dezign2app_workspace_dir") ||
        "";
      if (saved && saved !== outputDir) {
        setOutputDir(saved);
      }
    } catch (e) {}
  }, [projectId]);

  const saveWorkspaceDir = (dir: string) => {
    setOutputDir(dir);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`workspace_dir_${projectId}`, dir);
        localStorage.setItem(`docker_dir_${projectId}`, dir);
        localStorage.setItem("dezign2app_workspace_dir", dir);
      } catch (e) {}
    }
  };

  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "building" | "running" | "stopped" | "error">("idle");
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Extract service endpoint URLs for direct browser navigation
  const serviceEndpoints: ServiceEndpointInfo[] = useMemo(() => {
    const endpointsList: ServiceEndpointInfo[] = [];
    const webApps = monorepoResult.webClients || [];
    const services = monorepoResult.services || [];

    // Web Applications (Frontend)
    webApps.forEach((w, idx) => {
      const port = idx === 0 ? "3000" : `${3000 + idx}`;
      endpointsList.push({
        name: w.name || "Web Application",
        port,
        url: `http://localhost:${port}`,
        type: "web",
      });
    });

    // Backend Microservices
    services.forEach((s) => {
      const srvEnvFile = files.find((f) => f.filename === `apps/${s.folderName}/.env`);
      let port = "8080";
      if (srvEnvFile) {
        const match = srvEnvFile.content.match(/^PORT=(\d+)/m);
        if (match && match[1]) port = match[1];
      }
      endpointsList.push({
        name: s.name,
        port,
        url: `http://localhost:${port}`,
        healthUrl: `http://localhost:${port}/health`,
        docsUrl: `http://localhost:${port}/docs`,
        type: "service",
      });
    });

    return endpointsList;
  }, [monorepoResult, files]);

  // Hook into Electron Docker logs if in desktop app
  useEffect(() => {
    if (!inElectron || !open) return;
    const api = getElectronAPI();
    if (!api?.docker?.onLog) return;

    const cleanup = api.docker.onLog((line: string) => {
      setLogs((prev) => [...prev, line]);

      if (line.includes("Building") || line.includes("Step ")) {
        setStatus("building");
      } else if (
        line.includes("operational at") ||
        line.includes("Started") ||
        line.includes("running on") ||
        line.includes("Ready on") ||
        line.includes("Application startup complete")
      ) {
        setStatus("running");
      } else if (line.includes("Stopped") || line.includes("exited with code 0")) {
        setStatus("stopped");
      } else if (line.includes("Failed") || line.includes("ERROR") || line.includes("error")) {
        setStatus("error");
      }
    });

    return cleanup;
  }, [inElectron, open]);

  // Electron Directory Picker
  const handlePickDirectory = async () => {
    const api = getElectronAPI();
    if (!api?.fs?.pickDirectory) return;
    try {
      const selected = await api.fs.pickDirectory();
      if (selected) {
        saveWorkspaceDir(selected);
      }
    } catch (err) {
      toast.error("Failed to select directory");
    }
  };

  // Electron Start Docker Runner
  const handleStartDocker = async () => {
    const api = getElectronAPI();
    if (!api?.docker?.up || !api?.fs?.writeProject) return;

    let targetDir = outputDir;
    if (!targetDir && typeof window !== "undefined") {
      try {
        targetDir =
          localStorage.getItem(`workspace_dir_${projectId}`) ||
          localStorage.getItem(`docker_dir_${projectId}`) ||
          localStorage.getItem("dezign2app_workspace_dir") ||
          "";
      } catch (e) {}
    }

    if (!targetDir) {
      targetDir = (await api.fs.pickDirectory()) || "";
      if (!targetDir) {
        toast.error("Please select a target folder to write project files");
        return;
      }
      saveWorkspaceDir(targetDir);
    }

    setIsExporting(true);
    setStatus("building");
    setLogs((prev) => [
      ...prev,
      `📂 Writing ${files.length} project files to ${targetDir}...\n`,
    ]);

    try {
      const exportFiles = files.map((f) => ({
        filename: f.filename,
        content: f.content,
      }));
      await api.fs.writeProject(targetDir, exportFiles);
      setLogs((prev) => [
        ...prev,
        `✅ Project files exported successfully!\n🚀 Running: docker compose up --build\n`,
      ]);
      api.docker.up(targetDir);
      toast.success("Docker containers starting...");
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [
        ...prev,
        `❌ Error exporting files: ${errorMsg}\n`,
      ]);
      setStatus("error");
      toast.error("Failed to start Docker runner");
    } finally {
      setIsExporting(false);
    }
  };

  // Electron Stop Docker Runner
  const handleStopDocker = () => {
    const api = getElectronAPI();
    if (!api?.docker?.down || !outputDir) return;
    api.docker.down(outputDir);
    setStatus("stopped");
    toast.info("Stopping Docker containers...");
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText("docker compose up --build");
    setCopiedCmd(true);
    toast.success("Copied command to clipboard!");
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleClearLogs = () => {
    setLogs([]);
    setStatus("idle");
  };

  // Simulate local log execution for Web preview
  const handleSimulateWebRun = () => {
    const services = monorepoResult.services || [];
    const webClients = monorepoResult.webClients || [];

    setLogs([
      "🚀 [Local Terminal Preview] docker compose up --build\n",
      "🐳 Building service images with BuildKit...\n",
      ...services.map(
        (s) => `[+] Building ${s.folderName} (Dockerfile: apps/${s.folderName}/Dockerfile) [3.2s] DONE\n`,
      ),
      ...webClients.map(
        (w) => `[+] Building ${w.folderName} (Dockerfile: apps/${w.folderName}/Dockerfile) [4.1s] DONE\n`,
      ),
      "📦 Creating network dezign2app-network...\n",
      "📦 Creating container postgres...\n",
      "📦 Creating container redis...\n",
      ...services.map((s) => `📦 Creating container ${s.folderName}...\n`),
      ...webClients.map((w) => `📦 Creating container ${w.folderName}...\n`),
      "✅ Containers healthy and online:\n",
      ...serviceEndpoints.map((ep) => `   ⚡ ${ep.name} -> ${ep.url}\n`),
    ]);
    setStatus("running");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-zinc-950 border-zinc-800 shadow-2xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-zinc-800 text-emerald-400 border border-zinc-700">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold flex items-center gap-2 text-zinc-100">
                  Docker Local Runner
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-400">
                  {inElectron
                    ? "Build and run containerized microservices locally with Docker Compose."
                    : "Container manifests ready. Download the monorepo or run in the Desktop App."}
                </DialogDescription>
              </div>
            </div>

            {inElectron ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                <Laptop className="w-3.5 h-3.5" />
                <span>Native Desktop Mode</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-medium">
                <Globe className="w-3.5 h-3.5" />
                <span>Browser Mode</span>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 p-5 overflow-y-auto space-y-4">
          {/* Electron Desktop Mode UI */}
          {inElectron ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-emerald-400" />
                    Target Workspace Directory:
                  </span>
                  <span className="text-xs font-mono text-zinc-400 truncate">
                    {outputDir || "No directory selected (click Choose Directory)"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePickDirectory}
                    className="h-8 text-xs gap-1.5 bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700 hover:text-white"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Choose Directory</span>
                  </Button>
                  {status === "running" || status === "building" ? (
                    <Button
                      size="sm"
                      onClick={handleStopDocker}
                      className="h-8 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white border-0"
                    >
                      <Square className="w-3 h-3 fill-white" />
                      <span>Stop Docker</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleStartDocker}
                      disabled={isExporting}
                      className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                    >
                      <Play className="w-3 h-3 fill-white" />
                      <span>Start Docker</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Terminal Log View */}
              <div className="h-[340px] w-full">
                <DockerTerminalMonitor
                  logs={logs}
                  status={status}
                  onClearLogs={handleClearLogs}
                  onStart={handleStartDocker}
                  onStop={handleStopDocker}
                  isElectron={true}
                  services={serviceEndpoints}
                  projectDir={outputDir}
                />
              </div>
            </div>
          ) : (
            /* Web Browser Mode UI (Local Docker Guide & Terminal Simulator) */
            <div className="space-y-4">
              {/* Informational Hero Card */}
              <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-sm font-semibold text-zinc-100">
                      Run Microservices Locally with Docker
                    </h4>
                  </div>
                  {onDownloadZip && (
                    <Button
                      size="sm"
                      onClick={onDownloadZip}
                      disabled={downloadingZip}
                      className="h-8 text-xs gap-1.5 bg-zinc-800 text-zinc-200 border border-zinc-700 hover:bg-zinc-700 hover:text-white"
                    >
                      <Archive className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{downloadingZip ? "Zipping..." : "Download Monorepo ZIP"}</span>
                    </Button>
                  )}
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">
                  All production <code className="text-emerald-400 font-mono">Dockerfile</code>s,{" "}
                  <code className="text-emerald-400 font-mono">docker-compose.yml</code>, and startup scripts are included in the generated monorepo.
                  Unzip the repository on your machine and execute:
                </p>

                {/* Command Snippet */}
                <div className="flex items-center justify-between p-2.5 rounded bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-200">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-emerald-400 select-none">$</span>
                    <span className="select-all">docker compose up --build</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyCommand}
                    className="h-6 px-2 text-xs gap-1 text-zinc-300 hover:text-white hover:bg-zinc-800"
                  >
                    {copiedCmd ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{copiedCmd ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
              </div>

              {/* Service Ports Summary */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Configured Service Endpoints:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {serviceEndpoints.map((ep) => (
                    <a
                      key={ep.name}
                      href={ep.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => openExternalUrl(ep.url, e)}
                      className="flex items-center justify-between p-2 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-xs transition-colors group cursor-pointer"
                      title={`Open ${ep.name} (${ep.url}) in browser`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="font-medium text-zinc-200 group-hover:text-white truncate">{ep.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-zinc-400 group-hover:text-zinc-300">{ep.url}</span>
                        <ExternalLink className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Terminal Simulator / Monitor */}
              <div className="h-[260px] w-full">
                <DockerTerminalMonitor
                  logs={logs}
                  status={status}
                  onClearLogs={handleClearLogs}
                  onStart={handleSimulateWebRun}
                  isElectron={false}
                  services={serviceEndpoints}
                />
              </div>

              {/* Notice Banner */}
              <div className="flex items-center gap-2 p-2.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs">
                <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  💡 <strong>Tip</strong>: For 1-click Docker builds without manual CLI execution, use the native <strong>Dezign2App Desktop App</strong>!
                </span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
