import { app, BrowserWindow, dialog, session } from "electron";
import path from "path";
import { APP_NAME, APP_USER_MODEL_ID } from "./constants";
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
import { log } from "./logger";
import { initAutoUpdater } from "./services/updater";

// ─────────────────────────────────────────────
//  App Identity & Storage Directory Setup
// ─────────────────────────────────────────────
app.name = APP_NAME;
app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

/**
 * CRITICAL SINGLE-INSTANCE REQUIREMENT:
 *
 * Electron / Chromium relies on the `userData` directory to coordinate single-instance
 * locking (named pipes on Windows, unix domain sockets on POSIX).
 *
 * If any process isolates its `userData` path (e.g. to temp/d2a-local-<pid>), it runs in
 * a separate Chromium lock domain. Consequently:
 * 1. The secondary instance cannot communicate with the primary instance.
 * 2. `requestSingleInstanceLock()` will return `true` for both processes.
 * 3. A duplicate application window will launch, and the primary window will never receive
 *    the incoming `second-instance` event containing the deep-link authentication ticket.
 *
 * Therefore, ALL instances (both the primary GUI app and any transient OS protocol launches)
 * MUST share `primaryUserData`.
 */
const primaryUserData = path.join(app.getPath("appData"), APP_NAME);
try {
  app.setPath("userData", primaryUserData);
} catch (e) {
  console.warn("[main] Could not set userData path:", e);
}

// ─────────────────────────────────────────────
//  Single Instance Lock & Deep Link Forwarding
// ─────────────────────────────────────────────
/**
 * Request the single-instance lock from Chromium:
 *
 * - PRIMARY PROCESS: Returns `true`. This process continues booting up, creates the main
 *   window, and listens for the `second-instance` event to receive command-line arguments
 *   from future launches.
 *
 * - SECONDARY PROCESS: Returns `false`. This happens when Windows invokes the registered
 *   protocol client (e.g., `dezign2app://auth?ticket=...`) while the desktop app is already
 *   running. Electron automatically forwards this secondary process's `process.argv` to the
 *   primary instance. The secondary process MUST immediately quit and exit so it never creates
 *   a second window or runs redundant background services.
 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log(
    "[main] Another instance is already running. Deep-link arguments forwarded to primary instance. Exiting secondary process."
  );
  app.quit();
  process.exit(0);
} else {
  // ── Primary Instance Execution ───────────────

  // Register custom protocol (dezign2app://) with the OS
  registerProtocolClient();

  /**
   * Listen for arguments forwarded from secondary processes.
   *
   * On Windows, when the browser redirects to `dezign2app://auth?ticket=...`, Windows executes
   * the registered protocol command (e.g. `electron.exe . dezign2app://...`). The secondary
   * process calls `requestSingleInstanceLock()`, fails the lock, and forwards `commandLine`
   * to this listener on the primary instance.
   */
  app.on("second-instance", (_event, commandLine) => {
    log("[main] Primary instance received second-instance event with args:", commandLine);
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const deepLink = commandLine.find((arg) =>
      arg.toLowerCase().includes("dezign2app://")
    );
    if (deepLink) {
      log("[main] Found deepLink in second-instance args:", deepLink);
      handleAuthUrl(deepLink);
    } else {
      console.warn(
        "[main] second-instance fired but no dezign2app:// URL found in args:",
        commandLine
      );
    }
  });

  /**
   * Handle macOS open-url events.
   * On macOS, deep links are forwarded via the 'open-url' event instead of command-line args.
   */
  app.on("open-url", (event, url) => {
    event.preventDefault();
    log("[main] App received open-url event with URL:", url);
    handleAuthUrl(url);
  });

  // ─────────────────────────────────────────────
  //  App Lifecycle (Primary Instance Only)
  // ─────────────────────────────────────────────
  app.whenReady().then(async () => {
    registerIpcHandlers();
    await createMainWindow();
    // Handle deep links if the app was launched directly from cold start via a protocol link
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

  let isQuitting = false;
  app.on("before-quit", async (event) => {
    if (!isQuitting) {
      isQuitting = true;
      event.preventDefault();
      try {
        await session.defaultSession.cookies.flushStore();
        log("[main] Successfully flushed defaultSession cookies to disk.");
      } catch (e) {
        console.warn("[main] Failed to flush cookies on before-quit:", e);
      }
      stopNextServer();
      cleanupAllTerminals();
      stopDockerProcess();
      stopDevProcess();
      app.quit();
    }
  });
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
