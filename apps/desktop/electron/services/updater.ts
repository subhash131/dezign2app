import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { getMainWindow } from "../window";

let isInitialized = false;

/**
 * Initializes the background auto-updater service.
 * Connects to GitHub Releases (via electron-builder configuration in package.json).
 */
export function initAutoUpdater(): void {
  // Never check for updates in unpacked local dev mode
  if (!app.isPackaged || isInitialized) {
    return;
  }

  isInitialized = true;

  // Automatically download updates in the background when available
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Log updater activities
  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] Checking for updates on GitHub Releases...");
    sendUpdaterStatus("checking");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[updater] Update found: v${info.version} (current: v${app.getVersion()})`);
    sendUpdaterStatus("available", { version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] App is up to date.");
    sendUpdaterStatus("not-available");
  });

  autoUpdater.on("error", (err) => {
    // Non-blocking log so an update server check failure never disrupts the user
    console.warn("[updater] Update check error (non-fatal):", err?.message || err);
    sendUpdaterStatus("error", { error: err?.message || String(err) });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`[updater] Downloading update: ${percent}%`);
    sendUpdaterStatus("downloading", { percent });
  });

  autoUpdater.on("update-downloaded", async (info) => {
    console.log(`[updater] Update v${info.version} downloaded successfully!`);
    sendUpdaterStatus("downloaded", { version: info.version });

    const mainWindow = getMainWindow();
    const messageBoxOptions = {
      type: "info" as const,
      title: "Update Ready",
      message: `A new version of D2A (v${info.version}) has been downloaded.`,
      detail: "Would you like to restart now to complete the update, or install it next time you close the app?",
      buttons: ["Restart & Install", "Later"],
      defaultId: 0,
      cancelId: 1,
    };
    const response = mainWindow
      ? await dialog.showMessageBox(mainWindow, messageBoxOptions)
      : await dialog.showMessageBox(messageBoxOptions);

    if (response.response === 0) {
      // User clicked "Restart & Install"
      setImmediate(() => {
        autoUpdater.quitAndInstall(false, true);
      });
    }
  });

  // Initial check after a short 10-second startup delay to keep app launch instant
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => {
      console.warn("[updater] Initial check failed:", e?.message);
    });
  }, 10000);

  // Periodically check for updates every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((e) => {
      console.warn("[updater] Periodic check failed:", e?.message);
    });
  }, 4 * 60 * 60 * 1000);
}

/**
 * Manually checks for updates (can be triggered via IPC / settings menu).
 */
export async function checkForUpdatesManual(): Promise<{ success: boolean; message?: string }> {
  if (!app.isPackaged) {
    return { success: false, message: "Updates cannot be checked in development mode." };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, message: result?.updateInfo?.version };
  } catch (err: any) {
    return { success: false, message: err?.message || String(err) };
  }
}

/**
 * Restarts the app and installs the downloaded update.
 */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}

/**
 * Sends update status events to the renderer window if active.
 */
function sendUpdaterStatus(status: string, payload?: Record<string, unknown>): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", { status, ...payload });
  }
}
