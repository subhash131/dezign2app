import { app } from "electron";
import path from "path";
import fs from "fs";
import net from "net";

// ─────────────────────────────────────────────
//  App Identity & Constants
// ─────────────────────────────────────────────
function getIsDevBuild(): boolean {
  if (!app.isPackaged) return true;
  const name = app.getName() || "";
  return name.toLowerCase().includes("dev") || process.env.APP_ENV === "development";
}

const isDevEnv = getIsDevBuild();

export const APP_NAME = isDevEnv ? "D2A Dev" : "D2A";
export const APP_USER_MODEL_ID = isDevEnv
  ? "com.dezign2app.desktop.dev"
  : "com.dezign2app.desktop";
export const PROTOCOL_SCHEME = "dezign2app";

export const DEV_SERVER_URL =
  process.env.ELECTRON_DEV_URL || "http://127.0.0.1:46500";
export const IS_DEV = !app.isPackaged;
export const DEFAULT_PORT = 46500;

/**
 * Checks if a specific port on 127.0.0.1 is available to be bound.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => {
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Finds the next available open port starting from startPort (default: 46500).
 * Sequentially tests startPort, startPort + 1, startPort + 2, up to maxAttempts.
 */
export async function getAvailablePort(
  startPort: number = DEFAULT_PORT,
  maxAttempts: number = 100
): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    const free = await isPortFree(port);
    if (free) {
      console.log(`[constants] Next available port determined: ${port}`);
      return port;
    }
  }

  // Fallback to random OS ephemeral port if entire range is occupied
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Locates the application icon across common production and dev locations.
 */
export function getAppIcon(): string | undefined {
  const isWin = process.platform === "win32";
  const primaryExt = isWin ? "ico" : "png";
  const fallbackExt = isWin ? "png" : "ico";

  const searchPaths = [
    path.join(__dirname, `../public/icon.${primaryExt}`),
    path.join(__dirname, `../public/icon.${fallbackExt}`),
    path.join(__dirname, `../build/icon.${primaryExt}`),
    path.join(__dirname, `../build/icon.${fallbackExt}`),
    path.join(process.resourcesPath, `public/icon.${primaryExt}`),
    path.join(process.resourcesPath, `app/public/icon.${primaryExt}`),
    path.join(process.resourcesPath, `web/public/favicon.ico`),
    path.join(process.resourcesPath, `web/app/favicon.ico`),
  ];

  for (const p of searchPaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
