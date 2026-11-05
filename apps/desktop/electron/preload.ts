import { contextBridge, ipcRenderer } from "electron";
import type {
  TestDbOperationPayload,
  TestDbOperationResult,
  CheckDbConnectionPayload,
  CheckDbConnectionResult,
  CheckDbTableSyncPayload,
  CheckDbTableSyncResult,
  ApplyDbTableSyncPayload,
  ApplyDbTableSyncResult,
  DropDbTablePayload,
  DropDbTableResult,
  RenameDbTablePayload,
  RenameDbTableResult,
  RenameDbColumnPayload,
  RenameDbColumnResult,
} from "./services/dbRunner";
import type { UpdaterState } from "./services/updater";
import type { RunScriptResult } from "./services/scriptRunner";

// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────
export interface CompiledFile {
  filename: string;
  content: string;
}

export interface ElectronAPI {
  /** True when running inside Electron */
  isElectron: true;

  /** Native OS platform */
  platform(): Promise<NodeJS.Platform>;

  /** File system */
  fs: {
    pickDirectory(): Promise<string | null>;
    writeProject(
      outputDir: string,
      files: CompiledFile[],
      options?: { cleanStale?: boolean; deletedFiles?: string[] }
    ): Promise<{ success: boolean; path: string; writtenCount?: number; totalCount?: number }>;
    deleteFiles(
      outputDir: string,
      relativePaths: string[]
    ): Promise<{ success: boolean; deletedCount: number; errors: string[] }>;
    readFile(
      outputDir: string,
      relativePath: string
    ): Promise<{ success: boolean; content: string | null; path: string }>;
    listDirectory(
      outputDir: string
    ): Promise<{
      success: boolean;
      tree: Array<{ name: string; path: string; isFolder: boolean; children?: Array<any> }>;
      totalFiles: number;
      path: string;
    }>;
  };

  /** Docker Compose runner */
  docker: {
    up(projectDir: string): void;
    down(projectDir: string): void;
    write(data: string): void;
    onLog(cb: (line: string) => void): () => void;
    preflight(): Promise<{ ok: boolean; reason: string | null }>;
  };

  /** Dev runner (infra + pnpm dev) */
  dev: {
    run(projectDir: string): Promise<{ ok: boolean; reason: string | null }>;
    stop(projectDir: string): void;
    write(data: string): void;
    onLog(cb: (line: string) => void): () => void;
  };

  /** Shell / External links */
  shell: {
    openExternal(url: string): Promise<{ success: boolean }>;
  };

  /** Browser-based Authentication */
  auth: {
    /** Opens the external system browser to complete login flow */
    openBrowserLogin(url?: string): Promise<void>;
    /** Subscribes to the auth:callback IPC event pushed from the main process */
    onAuthCallback(cb: (data: { token?: string; ticket?: string; rawUrl?: string }) => void): () => void;
    /** Retrieves any pending auth ticket cached by the main process (useful on mount/focus) */
    getPendingAuthCallback(): Promise<{ token?: string; ticket?: string; rawUrl?: string } | null>;
    /** Clears the pending auth ticket cache in the main process after consumption */
    clearPendingAuthCallback(): Promise<{ success: boolean }>;
  };

  /** PTY terminal sessions */
  terminal: {
    create(
      id: string,
      cwd: string,
      cols: number,
      rows: number,
      customShell?: string
    ): Promise<{ success: boolean }>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): void;
    onData(id: string, cb: (data: string) => void): () => void;
    onExit(id: string, cb: (code: number) => void): () => void;
  };

  /** Silent OS-level network port reachability */
  network: {
    isPortOpen(port: number): Promise<boolean>;
    killPort(port: number): Promise<{ success: boolean; pids?: number[]; error?: string }>;
  };

  /** Native database execution and connection checks */
  db: {
    executeOperation(payload: TestDbOperationPayload): Promise<TestDbOperationResult>;
    checkConnection(payload: CheckDbConnectionPayload): Promise<CheckDbConnectionResult>;
    checkTableSync(payload: CheckDbTableSyncPayload): Promise<CheckDbTableSyncResult>;
    applyTableSync(payload: ApplyDbTableSyncPayload): Promise<ApplyDbTableSyncResult>;
    dropTable(payload: DropDbTablePayload): Promise<DropDbTableResult>;
    renameTable(payload: RenameDbTablePayload): Promise<RenameDbTableResult>;
    renameColumn(payload: RenameDbColumnPayload): Promise<RenameDbColumnResult>;
  };

  /** Local script execution */
  script: {
    runFile(
      filePath: string,
      args?: string[],
      cwd?: string,
    ): Promise<RunScriptResult>;
  };

  /** Background auto-updater service */
  updater: {
    getStatus(): Promise<UpdaterState>;
    checkForUpdates(): Promise<{ success: boolean; message?: string }>;
    quitAndInstall(): Promise<void>;
    onStatus(cb: (state: UpdaterState) => void): () => void;
    simulateStatus?(mockState: Partial<UpdaterState>): Promise<{ success: boolean }>;
  };
}

// ─────────────────────────────────────────────
//  Helper — event listener with cleanup
// ─────────────────────────────────────────────
function on<T>(channel: string, cb: (data: T) => void) {
  const handler = (_: Electron.IpcRendererEvent, data: T) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

// ─────────────────────────────────────────────
//  Expose API to renderer (window.electronAPI)
// ─────────────────────────────────────────────
contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  platform: () => ipcRenderer.invoke("app:platform"),

  shell: {
    openExternal: (url: string) =>
      ipcRenderer.invoke("shell:open-external", url),
  },

  auth: {
    openBrowserLogin: (url?: string) =>
      ipcRenderer.invoke("auth:open-browser-login", url),
    onAuthCallback: (
      cb: (data: { token?: string; ticket?: string; rawUrl?: string }) => void
    ) => on("auth:callback", cb),
    getPendingAuthCallback: () =>
      ipcRenderer.invoke("auth:get-pending-callback"),
    clearPendingAuthCallback: () =>
      ipcRenderer.invoke("auth:clear-pending-callback"),
  },

  fs: {
    pickDirectory: () => ipcRenderer.invoke("fs:pick-directory"),
    writeProject: (
      outputDir: string,
      files: CompiledFile[],
      options?: { cleanStale?: boolean; deletedFiles?: string[] }
    ) => ipcRenderer.invoke("fs:write-project", outputDir, files, options),
    deleteFiles: (outputDir: string, relativePaths: string[]) =>
      ipcRenderer.invoke("fs:delete-files", outputDir, relativePaths),
    readFile: (outputDir: string, relativePath: string) =>
      ipcRenderer.invoke("fs:read-file", outputDir, relativePath),
    listDirectory: (outputDir: string) =>
      ipcRenderer.invoke("fs:list-directory", outputDir),
  },

  docker: {
    up: (projectDir: string) => ipcRenderer.send("docker:up", projectDir),
    down: (projectDir: string) => ipcRenderer.send("docker:down", projectDir),
    write: (data: string) => ipcRenderer.send("docker:write", data),
    onLog: (cb: (line: string) => void) => on("docker:log", cb),
    preflight: () => ipcRenderer.invoke("docker:preflight"),
  },

  dev: {
    run: (projectDir: string) => ipcRenderer.invoke("dev:run", projectDir),
    stop: (projectDir: string) => ipcRenderer.send("dev:stop", projectDir),
    write: (data: string) => ipcRenderer.send("dev:write", data),
    onLog: (cb: (line: string) => void) => on("dev:log", cb),
  },

  terminal: {
    create: (
      id: string,
      cwd: string,
      cols: number,
      rows: number,
      customShell?: string
    ) => ipcRenderer.invoke("terminal:create", id, cwd, cols, rows, customShell),
    write: (id: string, data: string) =>
      ipcRenderer.send("terminal:write", id, data),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send("terminal:resize", id, cols, rows),
    kill: (id: string) => ipcRenderer.send("terminal:kill", id),
    onData(id: string, cb: (data: string) => void) {
      return on(`terminal:data:${id}`, cb);
    },
    onExit(id: string, cb: (code: number) => void) {
      return on(`terminal:exit:${id}`, cb);
    },
  },

  network: {
    isPortOpen: (port: number) => ipcRenderer.invoke("network:isPortOpen", port),
    killPort: (port: number) => ipcRenderer.invoke("network:kill-port", port),
  },

  db: {
    executeOperation: (payload: TestDbOperationPayload) =>
      ipcRenderer.invoke("db:execute-operation", payload),
    checkConnection: (payload: CheckDbConnectionPayload) =>
      ipcRenderer.invoke("db:check-connection", payload),
    checkTableSync: (payload: CheckDbTableSyncPayload) =>
      ipcRenderer.invoke("db:check-table-sync", payload),
    applyTableSync: (payload: ApplyDbTableSyncPayload) =>
      ipcRenderer.invoke("db:apply-table-sync", payload),
    dropTable: (payload: DropDbTablePayload) =>
      ipcRenderer.invoke("db:drop-table", payload),
    renameTable: (payload: RenameDbTablePayload) =>
      ipcRenderer.invoke("db:rename-table", payload),
    renameColumn: (payload: RenameDbColumnPayload) =>
      ipcRenderer.invoke("db:rename-column", payload),
  },

  script: {
    runFile: (filePath: string, args: string[] = [], cwd?: string) =>
      ipcRenderer.invoke("script:run-file", filePath, args, cwd),
  },

  updater: {
    getStatus: () => ipcRenderer.invoke("updater:get-status"),
    checkForUpdates: () => ipcRenderer.invoke("updater:check"),
    quitAndInstall: () => ipcRenderer.invoke("updater:quit-and-install"),
    onStatus: (cb: (state: UpdaterState) => void) => on("updater:status", cb),
    simulateStatus: (mockState: Partial<UpdaterState>) =>
      ipcRenderer.invoke("updater:simulate-status", mockState),
  },
} satisfies ElectronAPI);
