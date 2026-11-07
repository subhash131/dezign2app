"use client";

/**
 * Normalizes a folder path for reliable cross-platform comparison (case, slashes, trailing slashes).
 */
export function normalizeFolderPath(dirPath: string): string {
  if (!dirPath) return "";
  return dirPath
    .trim()
    .replace(/[\\/]+$/, "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

export interface FolderConflict {
  projectId: string;
  projectName: string;
  path: string;
}

export const GLOBAL_WORKSPACE_KEY = "dezign2app_workspace_dir";

/**
 * Checks whether the given targetPath is already assigned to another project in localStorage.
 * No longer blocks or forces reassignment conflicts so previously selected folder paths are remembered.
 */
export function findProjectFolderConflict(
  _currentProjectId: string,
  _targetPath: string
): FolderConflict | null {
  return null;
}

/**
 * Clears any other project's assignment to the targetPath in localStorage.
 * Preserves other projects' paths so previously selected folder paths are not wiped out.
 */
export function clearProjectFolderConflict(
  _currentProjectId: string,
  _targetPath: string
): void {
  // No-op: preserves previously selected folder paths across projects
}

/**
 * Deletes the local workspace folder link for a project.
 * Cleans up project-specific localStorage mapping without touching any files on disk.
 */
export function deleteProjectWorkspaceDir(projectId: string): void {
  if (!projectId || typeof window === "undefined") return;
  try {
    localStorage.removeItem(`workspace_dir_${projectId}`);
    localStorage.removeItem(`docker_dir_${projectId}`);
    localStorage.removeItem(`workspace_project_name_${projectId}`);
    localStorage.removeItem(`canvas_terminal_tab_${projectId}`);
    localStorage.removeItem(`compiler_terminal_tab_${projectId}`);
    localStorage.removeItem(`compiler_terminal_height_${projectId}`);
    localStorage.removeItem(`compiler_terminal_maximized_${projectId}`);
  } catch (e) {
    console.warn("[projectWorkspaceUtils] Error deleting project workspace link:", e);
  }
}

/**
 * Legacy clean helper preserved for backwards compatibility.
 * Does not remove the global previously selected folder path.
 */
export function cleanLegacyGlobalWorkspaceDir(): void {
  // No-op: keeps dezign2app_workspace_dir intact
}

/**
 * Retrieves the project workspace directory.
 * If not set specifically for this projectId, falls back to the previously selected folder path locally.
 */
export function getProjectWorkspaceDir(projectId: string): string {
  if (typeof window === "undefined") return "";
  try {
    // 1. Check for project-specific folder path
    if (projectId) {
      const specific =
        localStorage.getItem(`workspace_dir_${projectId}`) ||
        localStorage.getItem(`docker_dir_${projectId}`);
      if (specific) return specific;
    }

    // 2. Fall back to the previously selected folder path locally
    const previousSelected = localStorage.getItem(GLOBAL_WORKSPACE_KEY) || "";
    if (previousSelected) {
      // If we have a projectId, automatically associate it with the previously selected folder path
      if (projectId) {
        localStorage.setItem(`workspace_dir_${projectId}`, previousSelected);
        localStorage.setItem(`docker_dir_${projectId}`, previousSelected);
      }
      return previousSelected;
    }

    return "";
  } catch {
    return "";
  }
}

/**
 * Saves a project workspace directory.
 * Also remembers it locally as the previously selected folder path.
 */
export function setProjectWorkspaceDir(
  projectId: string,
  dir: string,
  projectName?: string
): void {
  if (typeof window === "undefined") return;
  try {
    if (dir) {
      if (projectId) {
        localStorage.setItem(`workspace_dir_${projectId}`, dir);
        localStorage.setItem(`docker_dir_${projectId}`, dir);
        if (projectName) {
          localStorage.setItem(`workspace_project_name_${projectId}`, projectName);
        }
      }
      // Remember previously selected folder path locally
      localStorage.setItem(GLOBAL_WORKSPACE_KEY, dir);
    } else {
      if (projectId) {
        localStorage.removeItem(`workspace_dir_${projectId}`);
        localStorage.removeItem(`docker_dir_${projectId}`);
      }
    }
  } catch (e) {
    console.warn("[projectWorkspaceUtils] Error saving project directory:", e);
  }
}
