import { ipcMain, shell, session } from "electron";
import { getMainWindow } from "../window";
import {
  openBrowserLogin,
  getPendingAuthData,
  clearPendingAuthData,
  saveStoredSessionToken,
  getStoredSessionToken,
  clearSessionCookies,
  restoreSessionCookies,
} from "../services/auth";
import {
  pickDirectory,
  writeProject,
  readProjectFile,
  CompiledFile,
  listProjectDirectory,
  deleteProjectFiles,
  getStoredProjectWorkspaceDir,
  setStoredProjectWorkspaceDir,
  deleteStoredProjectWorkspaceDir,
} from "../services/fileWriter";
import {
  runDockerPreflight,
  startDocker,
  stopDocker,
  writeDockerStdin,
} from "../services/docker";
import { startDev, stopDev, writeDevStdin } from "../services/devRunner";
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
} from "../services/terminal";
import { isPortOpen, killProcessOnPort } from "../services/network";
import {
  executeDbOperation,
  checkDbConnection,
  checkDbTableSync,
  applyDbTableSync,
  dropDbTable,
  renameDbTable,
  renameDbColumn,
  TestDbOperationPayload,
  CheckDbConnectionPayload,
  CheckDbTableSyncPayload,
  ApplyDbTableSyncPayload,
  DropDbTablePayload,
  RenameDbTablePayload,
  RenameDbColumnPayload,
} from "../services/dbRunner";
import {
  checkForUpdatesManual,
  quitAndInstall,
  getUpdaterState,
  simulateUpdaterStatus,
  UpdaterState,
} from "../services/updater";

/**
 * Registers all IPC handlers for the Electron main process.
 */
export function registerIpcHandlers(): void {
  // ── Shell / External Links ─────────────────
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    if (
      url &&
      (url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.startsWith("mailto:"))
    ) {
      shell.openExternal(url);
      return { success: true };
    }
    return { success: false };
  });

  // ── Authentication ─────────────────────────
  // Opens the default browser to complete web-based login (Google, GitHub, email)
  ipcMain.handle("auth:open-browser-login", async (_event, customUrl?: string) => {
    return openBrowserLogin(customUrl);
  });

  // Pull-based fallback for renderer to fetch pending auth data on mount or window focus
  ipcMain.handle("auth:get-pending-callback", async () => {
    return getPendingAuthData();
  });

  // Clears cached auth data once consumed by the renderer to prevent duplicate processing
  ipcMain.handle("auth:clear-pending-callback", async () => {
    clearPendingAuthData();
    return { success: true };
  });

  // Flushes Chromium session cookies to SQLite disk storage immediately
  ipcMain.handle("auth:flush-cookies", async () => {
    try {
      await session.defaultSession.cookies.flushStore();
      return { success: true };
    } catch (err) {
      console.warn("[ipc] Failed to flush cookies:", err);
      return { success: false };
    }
  });

  // Saves authenticated session token to persistent userData storage and syncs to session cookies
  ipcMain.handle("auth:save-session", async (_event, token: string) => {
    const res = saveStoredSessionToken(token);
    if (res.success) {
      await restoreSessionCookies();
    }
    return res;
  });

  // Retrieves stored session token from persistent storage
  ipcMain.handle("auth:get-session", async () => {
    return getStoredSessionToken();
  });

  // Clears stored session token and deletes session cookies
  ipcMain.handle("auth:clear-session", async () => {
    await clearSessionCookies();
    return { success: true };
  });

  // ── File System ────────────────────────────
  ipcMain.handle("fs:pick-directory", async () => {
    return pickDirectory(getMainWindow());
  });

  ipcMain.handle(
    "fs:get-project-workspace-dir",
    async (_event, projectId: string) => {
      return getStoredProjectWorkspaceDir(projectId);
    }
  );

  ipcMain.handle(
    "fs:set-project-workspace-dir",
    async (_event, projectId: string, dir: string) => {
      return setStoredProjectWorkspaceDir(projectId, dir);
    }
  );

  ipcMain.handle(
    "fs:delete-project-workspace-dir",
    async (_event, projectId: string) => {
      return deleteStoredProjectWorkspaceDir(projectId);
    }
  );

  ipcMain.handle(
    "fs:write-project",
    async (
      _event,
      outputDir: string,
      files: CompiledFile[],
      options?: { cleanStale?: boolean; deletedFiles?: string[] }
    ) => {
      return writeProject(outputDir, files, options);
    }
  );

  ipcMain.handle(
    "fs:delete-files",
    async (_event, outputDir: string, relativePaths: string[]) => {
      return deleteProjectFiles(outputDir, relativePaths);
    }
  );

  ipcMain.handle(
    "fs:read-file",
    async (_event, outputDir: string, relativePath: string) => {
      return readProjectFile(outputDir, relativePath);
    }
  );

  ipcMain.handle(
    "fs:list-directory",
    async (_event, outputDir: string) => {
      return listProjectDirectory(outputDir);
    }
  );

  // ── Docker Runner ──────────────────────────
  ipcMain.handle("docker:preflight", async () => {
    const send = (line: string) =>
      getMainWindow()?.webContents.send("docker:log", line);
    return runDockerPreflight(send);
  });

  ipcMain.on("docker:up", (_event, projectDir: string) => {
    const send = (line: string) =>
      getMainWindow()?.webContents.send("docker:log", line);
    startDocker(projectDir, send);
  });

  ipcMain.on("docker:down", (_event, projectDir: string) => {
    const send = (line: string) =>
      getMainWindow()?.webContents.send("docker:log", line);
    stopDocker(projectDir, send);
  });

  ipcMain.on("docker:write", (_event, data: string) => {
    writeDockerStdin(data);
  });

  // ── Dev Runner (pnpm dev) ──────────────────
  ipcMain.handle("dev:run", async (_event, projectDir: string) => {
    const send = (line: string) =>
      getMainWindow()?.webContents.send("dev:log", line);
    return startDev(projectDir, send);
  });

  ipcMain.on("dev:stop", (_event, _projectDir: string) => {
    const send = (line: string) =>
      getMainWindow()?.webContents.send("dev:log", line);
    stopDev(send);
  });

  ipcMain.on("dev:write", (_event, data: string) => {
    writeDevStdin(data);
  });

  // ── Terminal Sessions (node-pty) ───────────
  ipcMain.handle(
    "terminal:create",
    async (
      _event,
      id: string,
      cwd: string,
      cols: number,
      rows: number,
      customShell?: string
    ) => {
      const onData = (data: string) => {
        getMainWindow()?.webContents.send(`terminal:data:${id}`, data);
      };
      const onExit = (exitCode: number) => {
        getMainWindow()?.webContents.send(`terminal:exit:${id}`, exitCode);
      };
      return createTerminal(id, cwd, cols, rows, customShell, onData, onExit);
    }
  );

  ipcMain.on("terminal:write", (_event, id: string, data: string) => {
    writeTerminal(id, data);
  });

  ipcMain.on("terminal:resize", (_event, id: string, cols: number, rows: number) => {
    resizeTerminal(id, cols, rows);
  });

  ipcMain.on("terminal:kill", (_event, id: string) => {
    killTerminal(id);
  });

  // ── Network Reachability ───────────────────
  ipcMain.handle("network:isPortOpen", async (_event, port: number) => {
    return isPortOpen(port);
  });

  ipcMain.handle("network:kill-port", async (_event, port: number) => {
    return killProcessOnPort(port);
  });

  // ── Database Operations ───────────────────
  ipcMain.handle("db:execute-operation", async (_event, payload: TestDbOperationPayload) => {
    return executeDbOperation(payload);
  });

  ipcMain.handle("db:check-connection", async (_event, payload: CheckDbConnectionPayload) => {
    return checkDbConnection(payload);
  });

  ipcMain.handle("db:check-table-sync", async (_event, payload: CheckDbTableSyncPayload) => {
    return checkDbTableSync(payload);
  });

  ipcMain.handle("db:apply-table-sync", async (_event, payload: ApplyDbTableSyncPayload) => {
    return applyDbTableSync(payload);
  });

  ipcMain.handle("db:drop-table", async (_event, payload: DropDbTablePayload) => {
    return dropDbTable(payload);
  });

  ipcMain.handle("db:rename-table", async (_event, payload: RenameDbTablePayload) => {
    return renameDbTable(payload);
  });

  ipcMain.handle("db:rename-column", async (_event, payload: RenameDbColumnPayload) => {
    return renameDbColumn(payload);
  });

  // ── App / Platform Info ────────────────────
  ipcMain.handle("app:platform", () => process.platform);
  ipcMain.handle("app:is-electron", () => true);

  // ── Auto-Updater ───────────────────────────
  ipcMain.handle("updater:get-status", () => {
    return getUpdaterState();
  });
  ipcMain.handle("updater:check", async () => {
    return checkForUpdatesManual();
  });
  ipcMain.handle("updater:quit-and-install", () => {
    quitAndInstall();
  });
  ipcMain.handle("updater:simulate-status", (_event, mockState: Partial<UpdaterState>) => {
    simulateUpdaterStatus(mockState);
    return { success: true };
  });
}
