"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { isElectron, getElectronAPI } from "@/lib/electron";
import { TerminalSession, TerminalType } from "../types";
import {
  useTerminalSessionStore,
  appendToLogBuffer,
  getLogBuffer,
  clearLogBuffer,
} from "../stores/terminalSessionStore";

// Active IPC subscriptions tracker to prevent duplicate listeners across renders
const activeListeners = new Map<
  string,
  { dataCleanup: () => void; exitCleanup: () => void }
>();

// Active terminal instance registry: sessionId -> getter for XTermTerminalHandle
// Ensures long-lived Electron IPC subscriptions always resolve to the currently-mounted XTerm instance
const activeTerminalHandleGetters = new Map<
  string,
  () => XTermTerminalHandle | null | undefined
>();


export function getShellPrompt(
  shell: string | undefined,
  dir: string = "",
  projectName: string = "dezign2app",
): string {
  const normalizedProject = (projectName || "dezign2app")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  const normalizedDir = dir
    ? dir.split(/[\\/]/).pop() || normalizedProject
    : normalizedProject;
  const lower = (shell || "").toLowerCase();

  if (lower.includes("powershell")) {
    return `\x1b[36mPS\x1b[0m \x1b[33mC:\\${normalizedDir}\x1b[0m> `;
  }
  if (lower.includes("cmd")) {
    return `\x1b[33mC:\\${normalizedDir}\x1b[0m> `;
  }
  return `\x1b[32m${normalizedProject}\x1b[0m \x1b[34m❯\x1b[0m `;
}

function simulateCommand(rawCmd: string, targetDir: string): string {
  const cmd = rawCmd.trim();
  const lowerCmd = cmd.toLowerCase();

  if (lowerCmd === "help") {
    return (
      `\x1b[1;36mDezign2App Monorepo CLI — Interactive Web Shell\x1b[0m\r\n\r\n` +
      `  \x1b[32mpnpm dev\x1b[0m         Start all workspace apps (Next.js, Express, APIs) with hot reload\r\n` +
      `  \x1b[32mpnpm build\x1b[0m       Compile monorepo packages, libraries, and applications\r\n` +
      `  \x1b[32mpnpm i / install\x1b[0m Install and link workspace monorepo dependencies\r\n` +
      `  \x1b[32mdocker compose\x1b[0m   Spin up PostgreSQL, Redis, and backend service containers\r\n` +
      `  \x1b[32mls / dir\x1b[0m         List monorepo directory tree and config files\r\n` +
      `  \x1b[32mpwd\x1b[0m              Print current workspace directory\r\n` +
      `  \x1b[32mcat <file>\x1b[0m       Display contents of a monorepo file (e.g. cat package.json)\r\n` +
      `  \x1b[32mnode -v / pnpm -v\x1b[0mDisplay installed runtime versions\r\n` +
      `  \x1b[32mgit status\x1b[0m       Check working tree and git branch status\r\n` +
      `  \x1b[32mclear / cls\x1b[0m      Clear the terminal console buffer\r\n` +
      `  \x1b[32mhelp\x1b[0m             Display this help guide`
    );
  }

  if (
    lowerCmd === "pnpm dev" ||
    lowerCmd === "npm run dev" ||
    lowerCmd === "yarn dev" ||
    lowerCmd === "bun dev"
  ) {
    return (
      `\x1b[90m> dezign2app@0.1.0 dev /workspace/dezign2app\x1b[0m\r\n` +
      `\x1b[90m> turbo run dev\x1b[0m\r\n\r\n` +
      `\x1b[36m• packages:cache\x1b[0m \x1b[32m✔ Up to date (turbo)\x1b[0m\r\n` +
      `\x1b[35m• web:dev\x1b[0m       ▲ Next.js 16.4.6 (Turbopack) ready in 420ms\r\n` +
      `\x1b[35m• web:dev\x1b[0m       - Local:   \x1b[4;34mhttp://localhost:3000\x1b[0m\r\n` +
      `\x1b[35m• web:dev\x1b[0m       - Network: \x1b[4;34mhttp://192.168.1.100:3000\x1b[0m\r\n` +
      `\x1b[33m• api:dev\x1b[0m       ⚡ Express REST API listening on \x1b[4;34mhttp://localhost:4000\x1b[0m\r\n` +
      `\x1b[32m✔ Monorepo services compiled and running in hot-reload mode.\x1b[0m`
    );
  }

  if (
    lowerCmd === "pnpm build" ||
    lowerCmd === "npm run build" ||
    lowerCmd === "turbo build"
  ) {
    return (
      `\x1b[90m> turbo run build\x1b[0m\r\n` +
      `\x1b[36m• packages:types\x1b[0m \x1b[32m✔ Built in 120ms\x1b[0m\r\n` +
      `\x1b[36m• packages:ui\x1b[0m    \x1b[32m✔ Built in 240ms\x1b[0m\r\n` +
      `\x1b[35m• web:build\x1b[0m      \x1b[32m✔ Compiled production bundle (14 routes) in 580ms\x1b[0m\r\n` +
      `\x1b[33m• api:build\x1b[0m      \x1b[32m✔ Compiled microservices in 190ms\x1b[0m\r\n` +
      `\x1b[32m✔ Full monorepo build succeeded without errors (0 warnings).\x1b[0m`
    );
  }

  if (
    lowerCmd === "pnpm i" ||
    lowerCmd === "pnpm install" ||
    lowerCmd.startsWith("pnpm i ") ||
    lowerCmd.startsWith("pnpm install ") ||
    lowerCmd.startsWith("pnpm add ") ||
    lowerCmd === "npm i" ||
    lowerCmd === "npm install"
  ) {
    return (
      `\x1b[90mResolving dependencies from pnpm-lock.yaml...\x1b[0m\r\n` +
      `\x1b[90mPackages: +842\x1b[0m\r\n` +
      `\x1b[32m++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++\x1b[0m\r\n` +
      `\x1b[32m✔ Progress: resolved 842, reused 842, downloaded 0, added 842, done in 480ms\x1b[0m`
    );
  }

  if (
    lowerCmd === "docker compose" ||
    lowerCmd === "docker-compose" ||
    lowerCmd.startsWith("docker compose up") ||
    lowerCmd.startsWith("docker-compose up")
  ) {
    return (
      `\x1b[36m[+] Running 4/4\x1b[0m\r\n` +
      `\x1b[32m ✔ Network dezign2app_default     Created\x1b[0m\r\n` +
      `\x1b[32m ✔ Container dezign2app-postgres  Started (listening on port 5432)\x1b[0m\r\n` +
      `\x1b[32m ✔ Container dezign2app-redis     Started (listening on port 6379)\x1b[0m\r\n` +
      `\x1b[32m ✔ Container dezign2app-api       Started (listening on port 4000)\x1b[0m\r\n` +
      `\x1b[32m✔ Containers healthy & ready.\x1b[0m`
    );
  }

  if (lowerCmd === "ls" || lowerCmd === "dir") {
    return (
      `\x1b[1;34mapps/\x1b[0m              \x1b[1;34mpackages/\x1b[0m          \x1b[32mpackage.json\x1b[0m        README.md\r\n` +
      `\x1b[32mpnpm-workspace.yaml\x1b[0m\x1b[32mtsconfig.json\x1b[0m      \x1b[32mdocker-compose.yml\x1b[0m  .env.example`
    );
  }

  if (lowerCmd === "pwd") {
    return targetDir || "/workspace/dezign2app";
  }

  if (lowerCmd.startsWith("cat ")) {
    const file = cmd.slice(4).trim();
    if (file === "package.json") {
      return `{\r\n  "name": "dezign2app-monorepo",\r\n  "version": "0.1.0",\r\n  "private": true,\r\n  "workspaces": [\r\n    "apps/*",\r\n    "packages/*"\r\n  ]\r\n}`;
    }
    if (file === "README.md" || file === "readme.md") {
      return `# Dezign2App Monorepo\r\nArchitecture diagram compiled into fullstack Next.js and Microservices workspace.`;
    }
    return `[Preview of ${file}]\r\n// Workspace generated file`;
  }

  if (lowerCmd === "node -v" || lowerCmd === "node --version") {
    return "v20.18.0";
  }

  if (lowerCmd === "pnpm -v" || lowerCmd === "pnpm --version") {
    return "9.12.0";
  }

  if (lowerCmd === "git status") {
    return (
      `On branch main\r\n` +
      `Your branch is up to date with 'origin/main'.\r\n` +
      `nothing to commit, working tree clean`
    );
  }

  if (lowerCmd === "whoami") {
    return "developer";
  }

  if (lowerCmd.startsWith("echo ")) {
    return cmd.slice(5);
  }

  return `\x1b[90mExecuted: ${cmd}\x1b[0m\r\n\x1b[32m✔ Process finished with exit code 0\x1b[0m`;
}

import { XTermTerminalHandle } from "@/components/terminal";

interface UseDynamicTerminalSessionsProps {
  projectId: string;
  outputDir: string;
  terminalRefs?: React.RefObject<Map<string, XTermTerminalHandle | null>>;
}

export function useDynamicTerminalSessions({
  projectId,
  outputDir,
  terminalRefs,
}: UseDynamicTerminalSessionsProps) {
  const inElectron = isElectron();
  const store = useTerminalSessionStore();

  const sessions = store.sessionsByProject[projectId] || [];
  const activeSessionId = store.activeSessionIdByProject[projectId] || null;
  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;

  const terminalDimensionsRef = useRef<{ cols: number; rows: number }>({
    cols: 100,
    rows: 24,
  });

  // Per-session buffer for web terminal interactive typing
  const inputBuffersRef = useRef<Map<string, string>>(new Map());
  const commandHistoryRef = useRef<
    Map<string, { list: string[]; index: number }>
  >(new Map());
  const writtenLogCountRef = useRef<Map<string, number>>(new Map());

  // Keep the module-level active terminal handle getter updated with the latest terminalRefs
  useEffect(() => {
    sessions.forEach((s) => {
      activeTerminalHandleGetters.set(s.id, () => terminalRefs?.current?.get(s.id));
    });
    return () => {
      sessions.forEach((s) => {
        if (activeTerminalHandleGetters.get(s.id)?.() === terminalRefs?.current?.get(s.id)) {
          activeTerminalHandleGetters.delete(s.id);
        }
      });
    };
  }, [sessions, terminalRefs]);

  // Attach Electron IPC listeners for a given terminal session
  const attachPtyListeners = useCallback(
    (sessionId: string) => {
      if (!inElectron) return;
      const api = getElectronAPI();
      if (!api?.terminal?.onData) return;

      // Ensure the handle getter is mapped immediately with current terminalRefs
      if (terminalRefs) {
        activeTerminalHandleGetters.set(sessionId, () => terminalRefs?.current?.get(sessionId));
      }

      // If already actively listening, NEVER register duplicate listener!
      if (activeListeners.has(sessionId)) return;

      const dataCleanup = api.terminal.onData(sessionId, (data: string) => {
        // 1. Write directly to the active xterm instance — zero React re-renders
        const handle = activeTerminalHandleGetters.get(sessionId)?.() ?? terminalRefs?.current?.get(sessionId);
        handle?.write(data);
        // 2. Buffer for replay (non-reactive, no Zustand)
        appendToLogBuffer(sessionId, data);
        const currentCount = writtenLogCountRef.current.get(sessionId) || 0;
        writtenLogCountRef.current.set(sessionId, currentCount + 1);
        // 3. Only trigger Zustand for port detection (rare — only when a URL/port is found)
        store.appendDetectedPorts(projectId, sessionId, data);
      });

      const exitCleanup = api.terminal.onExit(sessionId, (exitCode: number) => {
        store.updateSession(projectId, sessionId, { status: "stopped" });
        const handle = activeTerminalHandleGetters.get(sessionId)?.() ?? terminalRefs?.current?.get(sessionId);
        handle?.write(
          `\r\n\x1b[33m[Process exited with code ${exitCode}]\x1b[0m\r\n`,
        );
      });

      activeListeners.set(sessionId, { dataCleanup, exitCleanup });
    },
    [inElectron, projectId, store, terminalRefs],
  );

  // Safely replays any output that was emitted before the terminal DOM component mounted
  const replayMissedLogs = useCallback(
    (sessionId: string, fullReset: boolean = false) => {
      const term = activeTerminalHandleGetters.get(sessionId)?.() ?? terminalRefs?.current?.get(sessionId);
      if (!term) return;

      // Read from the non-reactive module-level log buffer
      const logs = getLogBuffer(sessionId);
      if (!logs.length) return;

      if (fullReset) {
        term.clear?.();
        term.write(logs.join(""));
        writtenLogCountRef.current.set(sessionId, logs.length);
        return;
      }

      const alreadyWritten = writtenLogCountRef.current.get(sessionId) || 0;
      if (alreadyWritten < logs.length) {
        const missed = logs.slice(alreadyWritten);
        term.write(missed.join(""));
        writtenLogCountRef.current.set(sessionId, logs.length);
      }
    },
    // Intentionally stable: only depends on terminalRefs (a persistent ref object)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [terminalRefs],
  );

  // Re-attach IPC listeners on mount for any existing sessions in Electron (keyed on session IDs only)
  const sessionIdsKey = sessions.map((s) => s.id).join(",");
  useEffect(() => {
    if (!inElectron || sessions.length === 0) return;
    sessions.forEach((s) => {
      attachPtyListeners(s.id);
    });
  }, [inElectron, sessionIdsKey, attachPtyListeners]);

  // Create a new dynamic terminal session of user's choice
  const createTerminal = useCallback(
    async (options?: {
      title?: string;
      type?: TerminalType;
      shell?: string;
      initialCommand?: string;
    }) => {
      const type: TerminalType = options?.type || "shell";
      const isWin =
        typeof navigator !== "undefined" &&
        (navigator.platform?.includes("Win") ||
          navigator.userAgent?.includes("Windows"));

      let resolvedShell = options?.shell;
      if (!resolvedShell) {
        if (type === "powershell") resolvedShell = "powershell.exe";
        else if (type === "cmd") resolvedShell = "cmd.exe";
        else if (type === "bash") resolvedShell = "bash";
        else if (type === "zsh") resolvedShell = "zsh";
        else resolvedShell = isWin ? "powershell.exe" : "bash";
      }

      // Resolve workspace target directory strictly for this project
      let targetDir = outputDir;
      if (!targetDir && typeof window !== "undefined") {
        try {
          targetDir =
            localStorage.getItem(`workspace_dir_${projectId}`) ||
            localStorage.getItem(`docker_dir_${projectId}`) ||
            "";
        } catch (e) {}
      }

      const currentSessions = store.getSessions(projectId);
      if (
        options?.title === "Main Terminal" &&
        currentSessions.some((s) => s.title === "Main Terminal")
      ) {
        const existing = currentSessions.find((s) => s.title === "Main Terminal");
        if (existing) {
          store.setActiveSession(projectId, existing.id);
          return existing.id;
        }
      }

      const nextIndex = currentSessions.length + 1;
      const defaultTitle =
        options?.title ||
        (type === "powershell"
          ? `PowerShell ${nextIndex}`
          : type === "cmd"
            ? `CMD ${nextIndex}`
            : type === "bash"
              ? `Bash ${nextIndex}`
              : `Terminal ${nextIndex}`);

      const sessionId = `pty-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const prompt = getShellPrompt(resolvedShell, targetDir);

      const newSession: TerminalSession = {
        id: sessionId,
        title: defaultTitle,
        type,
        shell: resolvedShell,
        status: "running",
        detectedPorts: [],
        createdAt: Date.now(),
      };

      // Add to persistent store and make it active
      store.addSession(projectId, newSession);

      if (inElectron) {
        // 1. MUST attach listener BEFORE creating PTY so initial prompt is captured!
        attachPtyListeners(sessionId);

        const api = getElectronAPI();
        if (api?.terminal?.create) {
          try {
            const { cols, rows } = terminalDimensionsRef.current;
            await api.terminal.create(
              sessionId,
              targetDir || "",
              cols,
              rows,
              resolvedShell,
            );

            if (options?.initialCommand) {
              setTimeout(() => {
                api?.terminal?.write?.(
                  sessionId,
                  `${options.initialCommand}\r`,
                );
              }, 400);
            }
          } catch (err) {
            console.error("Failed to spawn PTY:", err);
            store.updateSession(projectId, sessionId, { status: "error" });
            toast.error("Failed to spawn terminal process");
          }
        }
      }

      return sessionId;
    },
    [inElectron, outputDir, projectId, store, attachPtyListeners],
  );

  // Auto-navigate running sessions when output directory genuinely changes
  const prevOutputDirRef = useRef<string>(outputDir);
  useEffect(() => {
    if (!outputDir || outputDir === prevOutputDirRef.current) return;
    prevOutputDirRef.current = outputDir;

    const currentSessions = store.getSessions(projectId);

    // If no terminal sessions exist yet, automatically spawn one rooted in the chosen directory
    if (currentSessions.length === 0) {
      createTerminal({
        type: inElectron ? "shell" : "bash",
        title: "Main Terminal",
      });
      return;
    }

    // In Browser (non-Electron) mode:
    const cleanDir = outputDir.replace(/[\\/]+$/, "");
    const folderName = cleanDir.split(/[\\/]/).pop() || cleanDir || outputDir;

    if (!inElectron) {
      currentSessions.forEach((s) => {
        const termHandle = terminalRefs?.current?.get(s.id);
        const newPrompt = getShellPrompt(s.shell, cleanDir);
        const msg = `\r\n\x1b[90m[Workspace connected: ${folderName}]\x1b[0m\r\n${newPrompt}`;
        termHandle?.write?.(msg);
        appendToLogBuffer(s.id, msg);
      });
      return;
    }

    // In Electron Desktop mode:
    const api = getElectronAPI();
    const sendCdCommand = (session: TerminalSession) => {
      const shellLower = (session.shell || "").toLowerCase();
      let cdCmd = "";
      if (shellLower.includes("powershell") || shellLower.includes("pwsh")) {
        // -LiteralPath prevents PowerShell wildcard interpretation on brackets [ ]
        cdCmd = `Set-Location -LiteralPath '${cleanDir.replace(/'/g, "''")}'`;
      } else if (shellLower.includes("cmd")) {
        // /d flag ensures drive switch on Windows CMD
        cdCmd = `cd /d "${cleanDir}"`;
      } else {
        // POSIX shells (bash, zsh) require forward slashes
        cdCmd = `cd "${cleanDir.replace(/\\/g, "/")}"`;
      }
      // Send Ctrl+C (\x03) first to clear any current line buffer, then the cd command
      api?.terminal?.write?.(session.id, `\x03\r\n${cdCmd}\r\n`);
    };

    currentSessions.forEach((s) => {
      if (s.status === "running") {
        sendCdCommand(s);
        // If session was recently created, send again after 600ms to ensure prompt was ready
        const age = Date.now() - (s.createdAt || 0);
        if (age < 2500) {
          setTimeout(() => {
            sendCdCommand(s);
          }, 600);
        }
      }
    });
  }, [inElectron, outputDir, projectId, store, createTerminal, terminalRefs]);

  // Close and terminate a specific terminal session
  const closeTerminal = useCallback(
    (sessionId: string) => {
      // Clean up buffers & history
      inputBuffersRef.current.delete(sessionId);
      commandHistoryRef.current.delete(sessionId);
      writtenLogCountRef.current.delete(sessionId);
      clearLogBuffer(sessionId);

      // 1. Clean up IPC listeners and active handle getter
      activeTerminalHandleGetters.delete(sessionId);
      if (activeListeners.has(sessionId)) {
        const listeners = activeListeners.get(sessionId);
        listeners?.dataCleanup();
        listeners?.exitCleanup();
        activeListeners.delete(sessionId);
      }

      // 2. Kill underlying OS PTY process
      if (inElectron) {
        const api = getElectronAPI();
        api?.terminal?.kill?.(sessionId);
      }

      // 3. Remove from Zustand store
      store.removeSession(projectId, sessionId);
    },
    [inElectron, projectId, store],
  );

  /**
   * Terminates all running OS terminal PTY processes and clears active sessions for a project.
   */
  const killAllJobs = useCallback(() => {
    killAllTerminalJobs(projectId, outputDir);
  }, [projectId, outputDir]);

  // Write interactive keystroke data to active/target session
  const writeToSession = useCallback(
    (sessionId: string, data: string) => {
      if (inElectron) {
        const api = getElectronAPI();
        if (api?.terminal?.write) {
          api.terminal.write(sessionId, data);
        }
        return;
      }

      // Web Mode: Fully Interactive Simulated CLI Engine
      const termHandle = activeTerminalHandleGetters.get(sessionId)?.() ?? terminalRefs?.current?.get(sessionId);
      const currentSessions = store.getSessions(projectId);
      const session = currentSessions.find((s) => s.id === sessionId);
      const targetDir = outputDir || `/workspace/${projectId}`;
      const prompt = getShellPrompt(session?.shell, targetDir);

      // 1. Enter Key (\r or \n)
      if (data === "\r" || data === "\n") {
        const rawCmd = inputBuffersRef.current.get(sessionId) || "";
        const cmd = rawCmd.trim();
        inputBuffersRef.current.set(sessionId, "");

        if (cmd) {
          // Record in history
          let hist = commandHistoryRef.current.get(sessionId);
          if (!hist) {
            hist = { list: [], index: -1 };
            commandHistoryRef.current.set(sessionId, hist);
          }
          hist.list.push(cmd);
          hist.index = hist.list.length;

          const lowerCmd = cmd.toLowerCase();
          if (lowerCmd === "clear" || lowerCmd === "cls") {
            termHandle?.clear();
            termHandle?.write(prompt);
            return;
          }

          const output = simulateCommand(cmd, targetDir);
          const response = `\r\n${output}\r\n\r\n${prompt}`;
          termHandle?.write(response);
          appendToLogBuffer(sessionId, response);
          store.appendDetectedPorts(projectId, sessionId, response);
        } else {
          const newlinePrompt = `\r\n${prompt}`;
          termHandle?.write(newlinePrompt);
          appendToLogBuffer(sessionId, newlinePrompt);
        }
        return;
      }

      // 2. Backspace (\x7f or \b)
      if (data === "\x7f" || data === "\b") {
        const curr = inputBuffersRef.current.get(sessionId) || "";
        if (curr.length > 0) {
          inputBuffersRef.current.set(sessionId, curr.slice(0, -1));
          termHandle?.write("\b \b");
        }
        return;
      }

      // 3. Ctrl+C (\x03)
      if (data === "\x03") {
        inputBuffersRef.current.set(sessionId, "");
        termHandle?.write(`^C\r\n${prompt}`);
        return;
      }

      // 4. Ctrl+L (\x0c)
      if (data === "\x0c") {
        inputBuffersRef.current.set(sessionId, "");
        termHandle?.clear();
        termHandle?.write(prompt);
        return;
      }

      // 5. Up Arrow (\x1b[A) - Command History Previous
      if (data === "\x1b[A") {
        const hist = commandHistoryRef.current.get(sessionId);
        if (hist && hist.list.length > 0) {
          const nextIndex = Math.max(0, hist.index - 1);
          hist.index = nextIndex;
          const targetCmd = hist.list[nextIndex] ?? "";
          const curr = inputBuffersRef.current.get(sessionId) || "";
          const eraseStr = "\b \b".repeat(curr.length);
          inputBuffersRef.current.set(sessionId, targetCmd);
          termHandle?.write(eraseStr + targetCmd);
        }
        return;
      }

      // 6. Down Arrow (\x1b[B) - Command History Next
      if (data === "\x1b[B") {
        const hist = commandHistoryRef.current.get(sessionId);
        if (hist && hist.list.length > 0) {
          const nextIndex = Math.min(hist.list.length, hist.index + 1);
          hist.index = nextIndex;
          const targetCmd =
            (nextIndex < hist.list.length ? hist.list[nextIndex] : "") ?? "";
          const curr = inputBuffersRef.current.get(sessionId) || "";
          const eraseStr = "\b \b".repeat(curr.length);
          inputBuffersRef.current.set(sessionId, targetCmd);
          termHandle?.write(eraseStr + targetCmd);
        }
        return;
      }

      // 7. Regular printable characters
      const prev = inputBuffersRef.current.get(sessionId) || "";
      inputBuffersRef.current.set(sessionId, prev + data);
      termHandle?.write(data);
    },
    [inElectron, outputDir, projectId, store, terminalRefs],
  );

  // Resize PTY dimensions on window/viewport resize
  const resizeSession = useCallback(
    (sessionId: string, cols: number, rows: number) => {
      terminalDimensionsRef.current = { cols, rows };
      if (inElectron) {
        const api = getElectronAPI();
        api?.terminal?.resize?.(sessionId, cols, rows);
      }
    },
    [inElectron],
  );

  // Clear logs & reset screen for a session
  const clearTerminal = useCallback(
    (sessionId: string) => {
      inputBuffersRef.current.set(sessionId, "");
      writtenLogCountRef.current.set(sessionId, 0);
      clearLogBuffer(sessionId);
      const termHandle = activeTerminalHandleGetters.get(sessionId)?.() ?? terminalRefs?.current?.get(sessionId);
      if (inElectron) {
        const api = getElectronAPI();
        api?.terminal?.write?.(sessionId, "\x0c");
      } else {
        const currentSessions = store.getSessions(projectId);
        const session = currentSessions.find((s) => s.id === sessionId);
        const targetDir = outputDir || `/workspace/${projectId}`;
        const prompt = getShellPrompt(session?.shell, targetDir);
        termHandle?.clear();
        termHandle?.write(prompt);
      }
    },
    [inElectron, outputDir, projectId, store, terminalRefs],
  );

  // Rename a terminal session
  const renameTerminal = useCallback(
    (sessionId: string, newTitle: string) => {
      store.renameSession(projectId, sessionId, newTitle);
    },
    [projectId, store],
  );

  // Switch active tab
  const selectTerminal = useCallback(
    (sessionId: string) => {
      store.setActiveSession(projectId, sessionId);
    },
    [projectId, store],
  );

  // Gather all dynamically detected ports across active sessions
  const allDetectedPorts = sessions.flatMap((s) => s.detectedPorts || []);

  return {
    sessions,
    activeSessionId,
    activeSession,
    createTerminal,
    closeTerminal,
    selectTerminal,
    renameTerminal,
    clearTerminal,
    writeToSession,
    resizeSession,
    allDetectedPorts,
    replayMissedLogs,
    killAllJobs,
  };
}

/**
 * Terminates all running OS terminal PTY processes and clears active sessions for a project.
 */
export function killAllTerminalJobs(projectId: string, outputDir?: string) {
  const store = useTerminalSessionStore.getState();
  const sessions = store.getSessions(projectId);

  sessions.forEach((session) => {
    // 1. Clean up IPC listeners and active handle getter
    activeTerminalHandleGetters.delete(session.id);
    if (activeListeners.has(session.id)) {
      const listeners = activeListeners.get(session.id);
      try {
        listeners?.dataCleanup?.();
        listeners?.exitCleanup?.();
      } catch (e) {
        console.warn("[Terminal] Listener cleanup error:", e);
      }
      activeListeners.delete(session.id);
    }

    // 2. Kill underlying OS PTY process
    if (isElectron()) {
      try {
        const api = getElectronAPI();
        api?.terminal?.kill?.(session.id);
      } catch (e) {
        console.warn("[Terminal] PTY process kill error:", e);
      }
    }
  });

  if (isElectron() && outputDir) {
    try {
      const api = getElectronAPI();
      api?.dev?.stop?.(outputDir);
    } catch (e) {
      console.warn("[Terminal] Dev stop error:", e);
    }
  }

  // 3. Remove all sessions from store for this project
  store.clearSessions(projectId);
}

