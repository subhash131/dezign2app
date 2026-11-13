import { app } from "electron";
import path from "path";
import fs from "fs";
import net from "net";
import { log } from "./logger";

// ─────────────────────────────────────────────
//  App Identity & Constants (3 Environments: local, dev, prod)
// ─────────────────────────────────────────────
export type AppEnvironment = "local" | "dev" | "prod";

export function getAppEnvironment(): AppEnvironment {
  if (!app.isPackaged) return "local";
  const name = app.getName() || "";
  if (name.toLowerCase().includes("dev") || process.env.APP_ENV === "development") {
    return "dev";
  }
  return "prod";
}

export const APP_ENV = getAppEnvironment();

export const APP_NAME =
  APP_ENV === "local"
    ? "d2a-beta Local"
    : APP_ENV === "dev"
      ? "d2a-beta Dev"
      : "d2a-beta";

export const APP_USER_MODEL_ID =
  APP_ENV === "local"
    ? "com.dezign2app.desktop.local"
    : APP_ENV === "dev"
      ? "com.dezign2app.desktop.dev"
      : "com.dezign2app.desktop";

export const PROTOCOL_SCHEME = "dezign2app";

export const DEV_SERVER_URL =
  process.env.ELECTRON_DEV_URL || "http://127.0.0.1:46500";
export const PROD_SERVER_URL =
  process.env.ELECTRON_PROD_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://dezign2app.com";
export const IS_LOCAL = APP_ENV === "local";
export const IS_DEV = APP_ENV === "dev" || IS_LOCAL;
export const IS_PROD = APP_ENV === "prod";
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
      log(`[constants] Next available port determined: ${port}`);
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
