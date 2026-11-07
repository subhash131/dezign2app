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
    it("preserves previously selected workspace directory", () => {
      localStorage.setItem("dezign2app_workspace_dir", "C:\\my_projects");
      cleanLegacyGlobalWorkspaceDir();
      expect(localStorage.getItem("dezign2app_workspace_dir")).toBe("C:\\my_projects");
    });
  });

  describe("getProjectWorkspaceDir & setProjectWorkspaceDir", () => {
    it("returns previously selected folder path for new projects", () => {
      // Nothing set anywhere initially
      expect(getProjectWorkspaceDir("proj_new")).toBe("");

      // Set for proj_A
      setProjectWorkspaceDir("proj_A", "C:\\projects\\appA", "Project A");
      expect(getProjectWorkspaceDir("proj_A")).toBe("C:\\projects\\appA");

      // proj_B has not set an explicit folder yet -> inherits previously selected folder path locally
      expect(getProjectWorkspaceDir("proj_B")).toBe("C:\\projects\\appA");

      // Set a specific folder for proj_B
      setProjectWorkspaceDir("proj_B", "C:\\projects\\appB", "Project B");
      expect(getProjectWorkspaceDir("proj_B")).toBe("C:\\projects\\appB");
      expect(getProjectWorkspaceDir("proj_A")).toBe("C:\\projects\\appA");
    });

    it("clears project-specific directory when empty string is passed", () => {
      setProjectWorkspaceDir("proj_A", "C:\\projects\\appA", "Project A");
      expect(getProjectWorkspaceDir("proj_A")).toBe("C:\\projects\\appA");

      setProjectWorkspaceDir("proj_A", "");
      // Cleared project-specific mapping
      expect(localStorage.getItem("workspace_dir_proj_A")).toBeNull();
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

      expect(localStorage.getItem("workspace_dir_proj_to_delete")).toBeNull();
      expect(localStorage.getItem("docker_dir_proj_to_delete")).toBeNull();
      expect(localStorage.getItem("workspace_project_name_proj_to_delete")).toBeNull();
      expect(localStorage.getItem("canvas_terminal_tab_proj_to_delete")).toBeNull();
      expect(localStorage.getItem("compiler_terminal_height_proj_to_delete")).toBeNull();
    });
  });

  describe("findProjectFolderConflict & clearProjectFolderConflict", () => {
    it("does not block or delete other projects sharing a workspace folder", () => {
      setProjectWorkspaceDir("proj_A", "C:\\projects\\shared", "Project A");
      expect(findProjectFolderConflict("proj_B", "C:\\projects\\shared")).toBeNull();

      setProjectWorkspaceDir("proj_B", "C:\\projects\\shared", "Project B");
      expect(getProjectWorkspaceDir("proj_A")).toBe("C:\\projects\\shared");
      expect(getProjectWorkspaceDir("proj_B")).toBe("C:\\projects\\shared");
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
      expect(localStorage.getItem("workspace_dir_proj_del")).toBeNull();
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
