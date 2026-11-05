/**
 * Global type augmentation for window.electronAPI.
 * Injected by the Electron preload script when running inside the desktop app.
 * Undefined when running in a regular browser.
 */

export interface ElectronCompiledFile {
  filename: string;
  content: string;
}

export interface ElectronUpdaterState {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "not-available"
    | "error";
  version?: string;
  percent?: number;
  error?: string;
}

export interface ElectronAPI {
  isElectron: true;
  platform(): Promise<NodeJS.Platform>;

  fs: {
    pickDirectory(): Promise<string | null>;
    writeProject(
      outputDir: string,
      files: ElectronCompiledFile[],
      options?: { cleanStale?: boolean; deletedFiles?: string[] }
    ): Promise<{
      success: boolean;
      path: string;
      writtenCount?: number;
      totalCount?: number;
    }>;
    deleteFiles?(
      outputDir: string,
      relativePaths: string[]
    ): Promise<{
      success: boolean;
      deletedCount: number;
      errors: string[];
    }>;
    readFile(
      outputDir: string,
      relativePath: string
    ): Promise<{
      success: boolean;
      content: string | null;
      path: string;
    }>;
    listDirectory?(
      outputDir: string
    ): Promise<{
      success: boolean;
      tree: Array<{ name: string; path: string; isFolder: boolean; children?: Array<any> }>;
      totalFiles: number;
      path: string;
    }>;
  };

  shell?: {
    openExternal(url: string): Promise<{ success: boolean }>;
  };

  auth: {
    /** Opens the default browser to complete web-based authentication */
    openBrowserLogin(url?: string): Promise<void>;
    /** Subscribes to the auth:callback IPC event containing deep-link credentials */
    onAuthCallback(
      cb: (data: { token?: string; ticket?: string; rawUrl?: string }) => void
    ): () => void;
    /** Polls the main process for any unconsumed auth credentials (deep link ticket/token) */
    getPendingAuthCallback?(): Promise<{ token?: string; ticket?: string; rawUrl?: string } | null>;
    /** Clears pending auth cache in the main process once consumed by the renderer */
    clearPendingAuthCallback?(): Promise<{ success: boolean }>;
  };

  docker: {
    up(projectDir: string): void;
    down(projectDir: string): void;
    write(data: string): void;
    onLog(cb: (line: string) => void): () => void;
    preflight(): Promise<{ ok: boolean; reason: string | null }>;
  };

  dev: {
    run(projectDir: string): Promise<{ ok: boolean; reason: string | null }>;
    stop(projectDir: string): void;
    write(data: string): void;
    onLog(cb: (line: string) => void): () => void;
  };

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

  network?: {
    isPortOpen(port: number): Promise<boolean>;
    killPort?(port: number): Promise<{ success: boolean; pids?: number[]; error?: string }>;
  };

  db?: {
    executeOperation(payload: ElectronTestDbOperationPayload): Promise<ElectronTestDbOperationResult>;
    checkConnection(payload: ElectronCheckDbConnectionPayload): Promise<ElectronCheckDbConnectionResult>;
    checkTableSync?(payload: ElectronCheckDbTableSyncPayload): Promise<ElectronCheckDbTableSyncResult>;
    applyTableSync?(payload: ElectronApplyDbTableSyncPayload): Promise<ElectronApplyDbTableSyncResult>;
    dropTable?(payload: ElectronDropDbTablePayload): Promise<ElectronDropDbTableResult>;
    renameTable?(payload: ElectronRenameDbTablePayload): Promise<ElectronRenameDbTableResult>;
    renameColumn?(payload: ElectronRenameDbColumnPayload): Promise<ElectronRenameDbColumnResult>;
  };

  workspace?: {
    setPath?(path: string): void;
    getPath?(): Promise<string | null>;
  };

  updater?: {
    getStatus(): Promise<ElectronUpdaterState>;
    checkForUpdates(): Promise<{ success: boolean; message?: string }>;
    quitAndInstall(): Promise<void>;
    onStatus(cb: (state: ElectronUpdaterState) => void): () => void;
    simulateStatus?(mockState: Partial<ElectronUpdaterState>): Promise<{ success: boolean }>;
  };
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

export interface ElectronTestDbOperationPayload {
  engine?: string;
  connection?: {
    host?: string;
    port?: number | string;
    database?: string;
    user?: string;
    username?: string;
    password?: string;
    connectionString?: string;
    connectionStringEnv?: string;
    dbFilePath?: string;
    dbFilePathEnv?: string;
  };
  entity?: {
    name?: string;
    columns?: Array<{
      name: string;
      type?: string;
      isPrimaryKey?: boolean;
      isPrimary?: boolean;
      primaryKey?: boolean;
      required?: boolean;
      unique?: boolean;
      defaultValue?: string | number | boolean | null;
    }>;
  };
  operation: {
    id?: string;
    name: string;
    kind?: string;
    code?: string;
    query?: string;
    signature?: string;
    params?: Array<{ name: string; type: string; defaultValue?: string }>;
  };
  args: Record<string, unknown>;
  mode?: "live" | "sandbox";
}

export interface ElectronTestDbOperationResult {
  success: boolean;
  output?: JsonValue;
  durationMs?: number;
  rawCommand?: string;
  mode?: "live" | "sandbox";
  connection?: string;
  serverActive?: boolean;
  error?: string;
  tip?: string;
  dbInfo?: {
    path?: string;
    exists?: boolean;
    sizeBytes?: number;
    fileStatus?: string;
    table?: string;
  };
}

export interface ElectronCheckDbConnectionPayload {
  engine?: string;
  connection?: {
    host?: string;
    port?: number | string;
    database?: string;
    user?: string;
    username?: string;
    password?: string;
    connectionString?: string;
    connectionStringEnv?: string;
    dbFilePath?: string;
    dbFilePathEnv?: string;
  };
  projectId?: string;
}

export interface ElectronCheckDbConnectionResult {
  success: boolean;
  engine?: string;
  latencyMs?: number;
  connectionUri?: string;
  host?: string;
  port?: number;
  error?: string;
  info?: {
    version?: string;
    rawVersion?: string;
    mode?: string;
    usedMemory?: string;
    connectedClients?: string;
    os?: string;
    path?: string;
    exists?: boolean;
    sizeBytes?: number;
    tableCount?: number;
    readable?: boolean;
    status?: string;
    reachable?: boolean;
    socket?: string;
  };
}

export interface ElectronCheckDbTableSyncPayload {
  engine?: string;
  connection?: Record<string, string | number | undefined>;
  tableName: string;
  schema?: string;
  columns?: Array<{
    name: string;
    type: string;
    isPrimaryKey?: boolean;
    isNotNull?: boolean;
    isUnique?: boolean;
    isForeignKey?: boolean;
    references?: {
      table: string;
      column: string;
    };
  }>;
  indexes?: Array<{
    name: string;
    columns: string;
    isUnique?: boolean;
  }>;
}

export interface ElectronCheckDbTableSyncResult {
  success: boolean;
  serverReachable: boolean;
  tableExists: boolean;
  inSync: boolean;
  missingColumns: Array<{ name: string; type: string }>;
  alteredColumns?: Array<{ name: string; oldType: string; newType: string }>;
  extraColumns: Array<{ name: string; type: string }>;
  existingColumns: Array<{ name: string; type: string }>;
  missingIndexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
  extraIndexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
  existingIndexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
  error?: string;
}

export interface ElectronApplyDbTableSyncPayload extends ElectronCheckDbTableSyncPayload {}

export interface ElectronApplyDbTableSyncResult {
  success: boolean;
  createdTable: boolean;
  appliedColumns: string[];
  alteredColumns?: Array<{ name: string; oldType: string; newType: string }>;
  droppedColumns?: string[];
  appliedIndexes?: string[];
  droppedIndexes?: string[];
  error?: string;
}

export interface ElectronDropDbTablePayload {
  engine?: string;
  connection?: Record<string, string | number | undefined>;
  tableName: string;
  schema?: string;
}

export interface ElectronDropDbTableResult {
  success: boolean;
  droppedTable: string;
  error?: string;
}

export interface ElectronRenameDbTablePayload {
  engine?: string;
  connection?: Record<string, string | number | undefined>;
  oldTableName: string;
  newTableName: string;
  schema?: string;
}

export interface ElectronRenameDbTableResult {
  success: boolean;
  oldTableName: string;
  newTableName: string;
  error?: string;
}

export interface ElectronRenameDbColumnPayload {
  engine?: string;
  connection?: Record<string, string | number | undefined>;
  tableName: string;
  oldColumnName: string;
  newColumnName: string;
  schema?: string;
}

export interface ElectronRenameDbColumnResult {
  success: boolean;
  tableName: string;
  oldColumnName: string;
  newColumnName: string;
  error?: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
