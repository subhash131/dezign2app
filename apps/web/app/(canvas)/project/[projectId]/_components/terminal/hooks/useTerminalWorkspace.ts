"use client";

import { useEffect, useCallback } from "react";
import { create } from "zustand";
import { toast } from "sonner";
import { getElectronAPI } from "@/lib/electron";
import {
  getProjectWorkspaceDir,
  setProjectWorkspaceDir,
  deleteProjectWorkspaceDir,
  findProjectFolderConflict,
  clearProjectFolderConflict,
  FolderConflict,
} from "./projectWorkspaceUtils";

export type { FolderConflict };

interface ProjectWorkspaceState {
  projectDirs: Record<string, string>;
  getProjectDir: (projectId: string) => string;
  setProjectDir: (projectId: string, dir: string, projectName?: string) => void;
  deleteProjectDir: (projectId: string) => void;
  syncFromStorage: (projectId: string) => string;
}

export const useProjectWorkspaceStore = create<ProjectWorkspaceState>((set, get) => ({
  projectDirs: {},
  getProjectDir: (projectId: string) => {
    if (!projectId) return "";
    const existing = get().projectDirs[projectId];
    if (existing !== undefined) return existing;
    const fromStorage = getProjectWorkspaceDir(projectId);
    if (!fromStorage && typeof window !== "undefined") {
      const api = getElectronAPI();
      if (api?.fs?.getProjectWorkspaceDir) {
        api.fs
          .getProjectWorkspaceDir(projectId)
          .then((fromElectron) => {
            if (fromElectron) {
              setProjectWorkspaceDir(projectId, fromElectron);
              set((state) => ({
                projectDirs: { ...state.projectDirs, [projectId]: fromElectron },
              }));
            }
          })
          .catch(() => {});
      }
    }
    set((state) => ({
      projectDirs: { ...state.projectDirs, [projectId]: fromStorage },
    }));
    return fromStorage;
  },
  setProjectDir: (projectId: string, dir: string, projectName?: string) => {
    if (!projectId) return;
    setProjectWorkspaceDir(projectId, dir, projectName);
    if (typeof window !== "undefined") {
      const api = getElectronAPI();
      if (api?.fs?.setProjectWorkspaceDir) {
        api.fs.setProjectWorkspaceDir(projectId, dir).catch(() => {});
      }
      window.dispatchEvent(
        new CustomEvent("project-workspace-dir-changed", {
          detail: { projectId, dir, projectName },
        })
      );
    }
    set((state) => ({
      projectDirs: { ...state.projectDirs, [projectId]: dir },
    }));
  },
  deleteProjectDir: (projectId: string) => {
    if (!projectId) return;
    deleteProjectWorkspaceDir(projectId);
    if (typeof window !== "undefined") {
      const api = getElectronAPI();
      if (api?.fs?.deleteProjectWorkspaceDir) {
        api.fs.deleteProjectWorkspaceDir(projectId).catch(() => {});
      }
      window.dispatchEvent(
        new CustomEvent("project-workspace-dir-changed", {
          detail: { projectId, dir: "" },
        })
      );
    }
    set((state) => {
      const next = { ...state.projectDirs };
      delete next[projectId];
      return { projectDirs: next };
    });
  },
  syncFromStorage: (projectId: string) => {
    if (!projectId) return "";
    const fromStorage = getProjectWorkspaceDir(projectId);
    if (!fromStorage && typeof window !== "undefined") {
      const api = getElectronAPI();
      if (api?.fs?.getProjectWorkspaceDir) {
        api.fs
          .getProjectWorkspaceDir(projectId)
          .then((fromElectron) => {
            if (fromElectron) {
              setProjectWorkspaceDir(projectId, fromElectron);
              set((state) => ({
                projectDirs: { ...state.projectDirs, [projectId]: fromElectron },
              }));
            }
          })
          .catch(() => {});
      }
    }
    set((state) => ({
      projectDirs: { ...state.projectDirs, [projectId]: fromStorage },
    }));
    return fromStorage;
  },
}));

export function useTerminalWorkspace(projectId: string, projectName?: string) {
  const outputDir = useProjectWorkspaceStore((s) => {
    if (!projectId) return "";
    const stored = s.projectDirs[projectId];
    if (stored !== undefined) return stored;
    return typeof window !== "undefined" ? getProjectWorkspaceDir(projectId) : "";
  });
  const setProjectDir = useProjectWorkspaceStore((s) => s.setProjectDir);
  const syncFromStorage = useProjectWorkspaceStore((s) => s.syncFromStorage);

  // Initialize from storage on mount or whenever projectId changes
  useEffect(() => {
    if (projectId) {
      syncFromStorage(projectId);
    }
  }, [projectId, syncFromStorage]);

  // Sync across windows or custom events
  useEffect(() => {
    if (typeof window === "undefined" || !projectId) return;

    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === `workspace_dir_${projectId}` ||
        e.key === `docker_dir_${projectId}`
      ) {
        syncFromStorage(projectId);
      }
    };

    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && detail.projectId === projectId) {
        syncFromStorage(projectId);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("project-workspace-dir-changed", handleCustomEvent);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        "project-workspace-dir-changed",
        handleCustomEvent
      );
    };
  }, [projectId, syncFromStorage]);

  const setOutputDir = useCallback(
    (dir: string) => {
      if (!projectId) return;
      setProjectDir(projectId, dir, projectName);
    },
    [projectId, projectName, setProjectDir],
  );

  const saveWorkspaceDir = useCallback(
    (dir: string): boolean => {
      if (!projectId) return false;
      const trimmed = dir.trim();
      if (!trimmed) return false;

      // Cleanly clear conflict on the directory before reassigning
      clearProjectFolderConflict(projectId, trimmed);
      setProjectDir(projectId, trimmed, projectName);
      return true;
    },
    [projectId, projectName, setProjectDir],
  );

  const handlePickDirectory = useCallback(async (): Promise<string | null> => {
    // 1. Desktop native Electron folder picker
    const api = getElectronAPI();
    if (api?.fs?.pickDirectory) {
      try {
        const selected = await api.fs.pickDirectory();
        if (selected) {
          return selected;
        }
      } catch (err) {
        toast.error("Failed to select directory");
      }
      return null;
    }

    // 2. Browser File System Access API
    if (
      typeof window !== "undefined" &&
      "showDirectoryPicker" in window &&
      window.showDirectoryPicker
    ) {
      try {
        const handle = await window.showDirectoryPicker();
        if (handle && handle.name) {
          return handle.name;
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          toast.error("Failed to select folder");
        }
      }
      return null;
    }

    // 3. Fallback prompt if no native API is supported
    if (typeof window !== "undefined") {
      const input = window.prompt(
        "Enter the local folder path for this project:",
        outputDir || ""
      );
      if (input && input.trim()) {
        return input.trim();
      }
    }

    return null;
  }, [outputDir]);

  return {
    outputDir,
    setOutputDir,
    saveWorkspaceDir,
    handlePickDirectory,
  };
}

