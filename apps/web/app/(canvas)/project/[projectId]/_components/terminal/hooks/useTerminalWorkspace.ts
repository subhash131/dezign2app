"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { getElectronAPI } from "@/lib/electron";

export function useTerminalWorkspace(projectId: string) {
  // Target directory for local output with persistent multi-level fallback
  const [outputDir, setOutputDir] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return (
          localStorage.getItem(`workspace_dir_${projectId}`) ||
          localStorage.getItem(`docker_dir_${projectId}`) ||
          localStorage.getItem("dezign2app_workspace_dir") ||
          ""
        );
      } catch (e) {
        return "";
      }
    }
    return "";
  });

  // Re-sync outputDir if projectId mounts or changes
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
  }, [projectId, outputDir]);

  const saveWorkspaceDir = useCallback(
    (dir: string) => {
      setOutputDir(dir);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`workspace_dir_${projectId}`, dir);
          localStorage.setItem(`docker_dir_${projectId}`, dir);
          localStorage.setItem("dezign2app_workspace_dir", dir);
        } catch (e) {}
      }
    },
    [projectId],
  );

  const handlePickDirectory = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.fs?.pickDirectory) return;
    try {
      const selected = await api.fs.pickDirectory();
      if (selected) {
        saveWorkspaceDir(selected);
        toast.success(`Target folder: ${selected}`);
      }
    } catch (err) {
      toast.error("Failed to select directory");
    }
  }, [saveWorkspaceDir]);

  return {
    outputDir,
    setOutputDir,
    saveWorkspaceDir,
    handlePickDirectory,
  };
}
