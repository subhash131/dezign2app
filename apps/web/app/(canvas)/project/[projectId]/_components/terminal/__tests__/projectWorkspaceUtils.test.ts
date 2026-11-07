import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeFolderPath,
  findProjectFolderConflict,
  clearProjectFolderConflict,
  cleanLegacyGlobalWorkspaceDir,
  getProjectWorkspaceDir,
  setProjectWorkspaceDir,
  deleteProjectWorkspaceDir,
} from "../hooks/projectWorkspaceUtils";
import { useProjectWorkspaceStore } from "../hooks/useTerminalWorkspace";

describe("projectWorkspaceUtils", () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectWorkspaceStore.setState({ projectDirs: {} });
  });

  describe("normalizeFolderPath", () => {
    it("normalizes slashes, trailing slashes, and casing", () => {
      expect(normalizeFolderPath("C:\\Users\\dev\\Project1\\")).toBe(
        "c:/users/dev/project1"
      );
      expect(normalizeFolderPath("/var/www/html///")).toBe("/var/www/html");
      expect(normalizeFolderPath("  D:\\Code\\App  ")).toBe("d:/code/app");
      expect(normalizeFolderPath("")).toBe("");
    });
  });

  describe("cleanLegacyGlobalWorkspaceDir", () => {
    it("removes legacy dezign2app_workspace_dir key from localStorage", () => {
      localStorage.setItem("dezign2app_workspace_dir", "C:\\old_shared_dir");
      cleanLegacyGlobalWorkspaceDir();
      expect(localStorage.getItem("dezign2app_workspace_dir")).toBeNull();
    });
  });

  describe("getProjectWorkspaceDir & setProjectWorkspaceDir", () => {
    it("stores and retrieves directories strictly per projectId", () => {
      setProjectWorkspaceDir("proj_A", "C:\\projects\\appA", "Project A");
      setProjectWorkspaceDir("proj_B", "C:\\projects\\appB", "Project B");

      expect(getProjectWorkspaceDir("proj_A")).toBe("C:\\projects\\appA");
      expect(getProjectWorkspaceDir("proj_B")).toBe("C:\\projects\\appB");
      expect(getProjectWorkspaceDir("proj_C")).toBe("");
    });

    it("clears directory when empty string is passed", () => {
      setProjectWorkspaceDir("proj_A", "C:\\projects\\appA", "Project A");
      expect(getProjectWorkspaceDir("proj_A")).toBe("C:\\projects\\appA");

      setProjectWorkspaceDir("proj_A", "");
      expect(getProjectWorkspaceDir("proj_A")).toBe("");
    });
  });

  describe("deleteProjectWorkspaceDir", () => {
    it("deletes the workspace folder link and metadata for a deleted project", () => {
      setProjectWorkspaceDir("proj_to_delete", "C:\\projects\\myApp", "My App");
      localStorage.setItem("canvas_terminal_tab_proj_to_delete", "terminal");
      localStorage.setItem("compiler_terminal_height_proj_to_delete", "300");

      expect(getProjectWorkspaceDir("proj_to_delete")).toBe("C:\\projects\\myApp");

      // Delete project link (in-app deletion)
      deleteProjectWorkspaceDir("proj_to_delete");

      expect(getProjectWorkspaceDir("proj_to_delete")).toBe("");
      expect(localStorage.getItem("workspace_dir_proj_to_delete")).toBeNull();
      expect(localStorage.getItem("docker_dir_proj_to_delete")).toBeNull();
      expect(localStorage.getItem("workspace_project_name_proj_to_delete")).toBeNull();
      expect(localStorage.getItem("canvas_terminal_tab_proj_to_delete")).toBeNull();
      expect(localStorage.getItem("compiler_terminal_height_proj_to_delete")).toBeNull();
    });
  });

  describe("findProjectFolderConflict & clearProjectFolderConflict", () => {
    it("returns null when directory is not used by any other project", () => {
      setProjectWorkspaceDir("proj_A", "C:\\projects\\appA", "Project A");

      const conflict = findProjectFolderConflict("proj_B", "C:\\projects\\appB");
      expect(conflict).toBeNull();
    });

    it("returns null when current project re-picks its own directory", () => {
      setProjectWorkspaceDir("proj_A", "C:\\projects\\appA", "Project A");

      const conflict = findProjectFolderConflict("proj_A", "C:\\projects\\appA");
      expect(conflict).toBeNull();
    });

    it("detects conflict when another project has already claimed the directory", () => {
      setProjectWorkspaceDir("proj_A", "C:\\projects\\appA", "Project Alpha");

      const conflict = findProjectFolderConflict(
        "proj_B",
        "c:/projects/appa/" // different casing & slash formatting
      );

      expect(conflict).not.toBeNull();
      expect(conflict?.projectId).toBe("proj_A");
      expect(conflict?.projectName).toBe("Project Alpha");
    });

    it("clears conflict cleanly when reassigning folder to a new project", () => {
      setProjectWorkspaceDir("proj_A", "C:\\projects\\shared", "Project A");
      expect(findProjectFolderConflict("proj_B", "C:\\projects\\shared")).not.toBeNull();

      // User confirms reassignment
      clearProjectFolderConflict("proj_B", "C:\\projects\\shared");
      expect(findProjectFolderConflict("proj_B", "C:\\projects\\shared")).toBeNull();
      expect(getProjectWorkspaceDir("proj_A")).toBe("");
    });
  });

  describe("useProjectWorkspaceStore", () => {
    it("updates project directory reactively and syncs to localStorage", () => {
      useProjectWorkspaceStore
        .getState()
        .setProjectDir("proj_1", "D:\\workspace\\project-one", "Project One");

      expect(useProjectWorkspaceStore.getState().getProjectDir("proj_1")).toBe(
        "D:\\workspace\\project-one"
      );
      expect(getProjectWorkspaceDir("proj_1")).toBe("D:\\workspace\\project-one");
    });

    it("syncs from storage when requested", () => {
      setProjectWorkspaceDir("proj_2", "D:\\workspace\\project-two", "Project Two");
      const dir = useProjectWorkspaceStore.getState().syncFromStorage("proj_2");
      expect(dir).toBe("D:\\workspace\\project-two");
      expect(
        useProjectWorkspaceStore.getState().projectDirs["proj_2"]
      ).toBe("D:\\workspace\\project-two");
    });

    it("deletes project directory from store and localStorage via deleteProjectDir", () => {
      useProjectWorkspaceStore
        .getState()
        .setProjectDir("proj_del", "D:\\workspace\\delete-me", "To Delete");

      expect(useProjectWorkspaceStore.getState().getProjectDir("proj_del")).toBe(
        "D:\\workspace\\delete-me"
      );

      useProjectWorkspaceStore.getState().deleteProjectDir("proj_del");

      expect(useProjectWorkspaceStore.getState().projectDirs["proj_del"]).toBeUndefined();
      expect(getProjectWorkspaceDir("proj_del")).toBe("");
    });

    it("syncs from Electron filesystem when localStorage is empty", async () => {
      const mockGetProjectWorkspaceDir = vi.fn().mockResolvedValue("D:\\electron\\workspace-1");
      const mockSetProjectWorkspaceDir = vi.fn().mockResolvedValue({ success: true });
      window.electronAPI = {
        isElectron: true,
        fs: {
          pickDirectory: vi.fn().mockResolvedValue(null),
          writeProject: vi.fn(),
          readFile: vi.fn(),
          getProjectWorkspaceDir: mockGetProjectWorkspaceDir,
          setProjectWorkspaceDir: mockSetProjectWorkspaceDir,
        },
      };

      // Call syncFromStorage for a project not in localStorage
      useProjectWorkspaceStore.getState().syncFromStorage("proj_electron");

      // Give async promise a tick to resolve
      await new Promise((r) => setTimeout(r, 10));

      expect(mockGetProjectWorkspaceDir).toHaveBeenCalledWith("proj_electron");
      expect(getProjectWorkspaceDir("proj_electron")).toBe("D:\\electron\\workspace-1");
      expect(useProjectWorkspaceStore.getState().projectDirs["proj_electron"]).toBe(
        "D:\\electron\\workspace-1"
      );

      // Clean up
      delete window.electronAPI;
    });
  });
});
