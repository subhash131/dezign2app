import { app, BrowserWindow, dialog } from "electron";
import path from "path";
import fs from "fs";
import { APP_NAME, APP_USER_MODEL_ID, IS_LOCAL } from "./constants";
import { createMainWindow, getMainWindow } from "./window";
import { registerIpcHandlers } from "./ipc/register";
import {
  registerProtocolClient,
  handleAuthUrl,
  handleInitialDeepLink,
} from "./services/auth";
import { stopNextServer } from "./services/nextServer";
import { cleanupAllTerminals } from "./services/terminal";
import { stopDockerProcess } from "./services/docker";
import { stopDevProcess } from "./services/devRunner";
import { initAutoUpdater } from "./services/updater";

// ─────────────────────────────────────────────
//  Process Helper Functions (for Local Dev Isolation)
// ─────────────────────────────────────────────
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === "EPERM";
  }
}

function getLocalPrimaryPid(primaryUserData: string): number | null {
  const pidFile = path.join(primaryUserData, "app.pid");
  try {
    if (fs.existsSync(pidFile)) {
      const content = fs.readFileSync(pidFile, "utf8").trim();
      const pid = parseInt(content, 10);
      if (!isNaN(pid) && isProcessAlive(pid)) {
        return pid;
      }
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

function recordLocalPrimaryPid(primaryUserData: string): void {
  const pidFile = path.join(primaryUserData, "app.pid");
  try {
    fs.mkdirSync(primaryUserData, { recursive: true });
    fs.writeFileSync(pidFile, String(process.pid), "utf8");
  } catch (e) {
    console.warn("[main] Failed to record primary PID:", e);
  }
}

function cleanupLocalPrimaryPid(primaryUserData: string): void {
  const pidFile = path.join(primaryUserData, "app.pid");
  try {
    if (fs.existsSync(pidFile)) {
      const content = fs.readFileSync(pidFile, "utf8").trim();
      if (parseInt(content, 10) === process.pid) {
        fs.unlinkSync(pidFile);
      }
    }
  } catch {
    // Ignore cleanup error
  }
}

// ─────────────────────────────────────────────
//  App Identity & Storage Isolation
// ─────────────────────────────────────────────
app.name = APP_NAME;
app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

const primaryUserData = path.join(app.getPath("appData"), APP_NAME);
let isSecondaryLocalInstance = false;

if (IS_LOCAL) {
  const runningPrimaryPid = getLocalPrimaryPid(primaryUserData);
  const isSpawnedInsideParent = Boolean(process.env.D2A_PARENT_PID);

  if (
    (runningPrimaryPid && runningPrimaryPid !== process.pid) ||
    isSpawnedInsideParent
  ) {
    isSecondaryLocalInstance = true;
    const isolatedUserData = path.join(
      app.getPath("temp"),
      `d2a-local-${process.pid}`
    );
    console.log(
      `[main] Active primary local instance detected (PID: ${runningPrimaryPid || process.env.D2A_PARENT_PID}). Starting secondary instance with isolated storage: ${isolatedUserData}`
    );
    try {
      app.setPath("userData", isolatedUserData);
    } catch (e) {
      console.warn("[main] Could not set secondary userData path:", e);
    }
  } else {
    // Primary local instance
    try {
      app.setPath("userData", primaryUserData);
      recordLocalPrimaryPid(primaryUserData);
    } catch (e) {
      console.warn("[main] Could not set primary userData path:", e);
    }

    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      // Fallback: If lock was claimed right before us, isolate rather than crash
      isSecondaryLocalInstance = true;
      const isolatedUserData = path.join(
        app.getPath("temp"),
        `d2a-local-${process.pid}`
      );
      try {
        app.setPath("userData", isolatedUserData);
      } catch (e) {
        console.warn("[main] Could not set fallback isolated userData path:", e);
      }
    }
  }
} else {
  // Packaged Dev or Prod build: strict single-instance behavior
  try {
    app.setPath("userData", primaryUserData);
  } catch (e) {
    console.warn("[main] Could not set userData path:", e);
  }

  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  }
}

// ─────────────────────────────────────────────
//  Global Error Handling
// ─────────────────────────────────────────────
process.on("uncaughtException", (error) => {
  console.error("[main] Uncaught Exception:", error);
  dialog.showErrorBox(
    "Dezign2App Error",
    error?.stack || error?.message || String(error)
  );
});

process.on("unhandledRejection", (reason) => {
  console.error("[main] Unhandled Rejection:", reason);
});

// ─────────────────────────────────────────────
//  Deep Linking & Second Instance
// ─────────────────────────────────────────────
registerProtocolClient();

app.on("second-instance", (_event, commandLine) => {
  console.log("[main] App received second-instance event with args:", commandLine);
  const mainWindow = getMainWindow();
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  const deepLink = commandLine.find((arg) =>
    arg.toLowerCase().includes("dezign2app://")
  );
  if (deepLink) {
    console.log("[main] Found deepLink in second-instance args:", deepLink);
    handleAuthUrl(deepLink);
  } else {
    console.warn("[main] second-instance fired but no dezign2app:// URL found in args:", commandLine);
  }
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  console.log("[main] App received open-url event with URL:", url);
  handleAuthUrl(url);
});

// ─────────────────────────────────────────────
//  App Lifecycle
// ─────────────────────────────────────────────
app.whenReady().then(async () => {
  registerIpcHandlers();
  await createMainWindow();
  handleInitialDeepLink();
  initAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (IS_LOCAL && !isSecondaryLocalInstance) {
    cleanupLocalPrimaryPid(primaryUserData);
  }
  stopNextServer();
  cleanupAllTerminals();
  stopDockerProcess();
  stopDevProcess();
});
