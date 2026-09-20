import { ipcMain, shell } from "electron";
import { getMainWindow } from "../window";
import { openBrowserLogin } from "../services/auth";
import { pickDirectory, writeProject, readProjectFile, CompiledFile, listProjectDirectory, deleteProjectFiles } from "../services/fileWriter";
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
import { isPortOpen } from "../services/network";
import {
  executeDbOperation,
  checkDbConnection,
  TestDbOperationPayload,
  CheckDbConnectionPayload,
} from "../services/dbRunner";
import { checkForUpdatesManual, quitAndInstall } from "../services/updater";

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
  ipcMain.handle("auth:open-browser-login", async (_event, customUrl?: string) => {
    return openBrowserLogin(customUrl);
  });

  // ── File System ────────────────────────────
  ipcMain.handle("fs:pick-directory", async () => {
    return pickDirectory(getMainWindow());
  });

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

  // ── Database Operations ───────────────────
  ipcMain.handle("db:execute-operation", async (_event, payload: TestDbOperationPayload) => {
    return executeDbOperation(payload);
  });

  ipcMain.handle("db:check-connection", async (_event, payload: CheckDbConnectionPayload) => {
    return checkDbConnection(payload);
  });

  // ── App / Platform Info ────────────────────
  ipcMain.handle("app:platform", () => process.platform);
  ipcMain.handle("app:is-electron", () => true);

  // ── Auto-Updater ───────────────────────────
  ipcMain.handle("updater:check", async () => {
    return checkForUpdatesManual();
  });
  ipcMain.handle("updater:quit-and-install", () => {
    quitAndInstall();
  });
}
