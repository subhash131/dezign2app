import { app, shell, session } from "electron";
import path from "path";
import fs from "fs";
import { PROTOCOL_SCHEME, IS_DEV } from "../constants";
import { getMainWindow, getCurrentAppUrl } from "../window";
import { log } from "../logger";

/**
 * Payload structure for authentication deep links (dezign2app://...).
 *
 * CRITICAL ARCHITECTURE RULE - DESKTOP AUTHENTICATION (DO NOT MODIFY / DO NOT BYPASS):
 * NEVER add direct in-app login methods (email/password, social OAuth forms) to the Electron desktop shell.
 * Desktop authentication must strictly use external browser handoff (shell.openExternal -> deep link ticket exchange).
 */
export interface PendingAuthPayload {
  token?: string;
  ticket?: string;
  rawUrl?: string;
}

/**
 * Persisted auth session data stored locally in userData (auth-session.json).
 * This ensures the desktop application remembers authentication state
 * across restarts without requiring external browser ticket handshakes.
 */
export interface StoredAuthSession {
  token: string;
  savedAt: number;
}

function getAuthSessionConfigPath(): string {
  return path.join(app.getPath("userData"), "auth-session.json");
}

/**
 * Retrieves the persisted session token from native desktop storage.
 */
export function getStoredSessionToken(): string | null {
  try {
    const configPath = getAuthSessionConfigPath();
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed: StoredAuthSession = JSON.parse(raw);
    if (parsed && typeof parsed.token === "string" && parsed.token.trim()) {
      return parsed.token.trim();
    }
    return null;
  } catch (err) {
    console.warn("[auth-service] Failed to read auth-session.json:", err);
    return null;
  }
}

/**
 * Persists the authenticated session token to disk in userData/auth-session.json.
 */
export function saveStoredSessionToken(token: string): { success: boolean } {
  try {
    if (!token || typeof token !== "string") return { success: false };
    const configPath = getAuthSessionConfigPath();
    const data: StoredAuthSession = {
      token: token.trim(),
      savedAt: Date.now(),
    };
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
    log("[auth-service] Persisted session token to auth-session.json");
    return { success: true };
  } catch (err) {
    console.warn("[auth-service] Failed to write auth-session.json:", err);
    return { success: false };
  }
}

/**
 * Removes the persisted session token file upon user logout.
 */
export function clearStoredSessionToken(): { success: boolean } {
  try {
    const configPath = getAuthSessionConfigPath();
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      log("[auth-service] Removed auth-session.json");
    }
    return { success: true };
  } catch (err) {
    console.warn("[auth-service] Failed to delete auth-session.json:", err);
    return { success: false };
  }
}

/**
 * Injects stored session token into Chromium session cookies across local dev
 * and production URLs, committing to SQLite disk store.
 */
export async function restoreSessionCookies(targetUrl?: string): Promise<boolean> {
  const token = getStoredSessionToken();
  if (!token) return false;

  try {
    const urlsToSet: string[] = [];
    if (targetUrl) urlsToSet.push(targetUrl);
    try {
      const currentApp = getCurrentAppUrl();
      if (currentApp) urlsToSet.push(currentApp);
    } catch {}
    urlsToSet.push(
      "http://127.0.0.1:46500",
      "http://localhost:46500",
      "https://dezign2app.com",
      "https://www.dezign2app.com"
    );

    const uniqueUrls = Array.from(new Set(urlsToSet));

    for (const u of uniqueUrls) {
      try {
        const isHttps = u.startsWith("https://");
        const isProdDomain = u.includes("dezign2app.com");
        const cookieDomain = isProdDomain ? ".dezign2app.com" : undefined;
        const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

        await session.defaultSession.cookies.set({
          url: u,
          name: "better-auth.session_token",
          value: token,
          path: "/",
          expirationDate: expiry,
          sameSite: "lax",
          secure: isHttps,
          httpOnly: false,
          ...(cookieDomain ? { domain: cookieDomain } : {}),
        });

        if (isHttps) {
          await session.defaultSession.cookies.set({
            url: u,
            name: "__Secure-better-auth.session_token",
            value: token,
            path: "/",
            expirationDate: expiry,
            sameSite: "lax",
            secure: true,
            httpOnly: false,
            ...(cookieDomain ? { domain: cookieDomain } : {}),
          });
        }

        await session.defaultSession.cookies.set({
          url: u,
          name: "is_electron",
          value: "1",
          path: "/",
          expirationDate: expiry,
          sameSite: "lax",
          secure: isHttps,
          httpOnly: false,
          ...(cookieDomain ? { domain: cookieDomain } : {}),
        });
      } catch (e) {
        // Continue setting other URLs
      }
    }

    await session.defaultSession.cookies.flushStore();
    log("[auth-service] Restored session cookies from auth-session.json");
    return true;
  } catch (err) {
    console.warn("[auth-service] Failed to restore session cookies:", err);
    return false;
  }
}

/**
 * Clears stored session token from disk and removes all auth cookies from defaultSession.
 */
export async function clearSessionCookies(): Promise<void> {
  clearStoredSessionToken();
  try {
    const cookies = await session.defaultSession.cookies.get({});
    for (const c of cookies) {
      if (
        c.name.includes("better-auth") ||
        c.name === "is_electron" ||
        c.name.includes("convex")
      ) {
        const domainStr = c.domain
          ? c.domain.startsWith(".")
            ? c.domain.slice(1)
            : c.domain
          : "localhost";
        const url = `${c.secure ? "https://" : "http://"}${domainStr}${c.path || "/"}`;
        await session.defaultSession.cookies.remove(url, c.name).catch(() => {});
      }
    }
    await session.defaultSession.cookies.flushStore();
    log("[auth-service] Cleared session cookies and disk store.");
  } catch (e) {
    console.warn("[auth-service] Failed to clear session cookies:", e);
  }
}

/**
 * In-memory cache for incoming auth credentials received from external browser redirects.
 *
 * Why this is necessary:
 * When an external browser redirects to `dezign2app://auth?ticket=...`, the main process receives
 * the URL and sends an IPC event ("auth:callback") to the renderer. However, if the window was
 * minimized, blurred, or mid-transition, the React renderer may miss the IPC push.
 * By caching `pendingAuthData`, the renderer can proactively pull the ticket upon gaining window focus
 * or mounting via `auth:get-pending-callback`.
 */
let pendingAuthData: PendingAuthPayload | null = null;

/**
 * Returns the currently cached pending auth payload, if any.
 */
export function getPendingAuthData(): PendingAuthPayload | null {
  return pendingAuthData;
}

/**
 * Clears the pending auth payload once successfully consumed by the renderer.
 */
export function clearPendingAuthData(): void {
  pendingAuthData = null;
}

/**
 * Registers the custom protocol client (dezign2app://) with the host operating system.
 *
 * Operating System Registration Nuance:
 * - Packaged App: The OS maps `dezign2app://` directly to the compiled executable (`D2A.exe`).
 * - Development Mode: On Windows, Electron needs the path to the main script (`process.argv[1]`,
 *   e.g. `d:/ai/dezign2app/apps/desktop`) passed alongside `process.execPath` (the `electron.exe` binary)
 *   so that when the OS launches the protocol link, it correctly runs `electron.exe <appPath> <url>`
 *   rather than invoking an empty Electron shell.
 */
export function registerProtocolClient(): void {
  if (!app.isPackaged || IS_DEV) {
    const mainScript = process.argv[1];
    if (mainScript) {
      app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
        path.resolve(mainScript),
      ]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
  }
}

/**
 * Handles incoming auth deep links (dezign2app://...).
 *
 * Responsibilities:
 * 1. Sanitizes the deep link string to strip any trailing slashes or stray OS quote marks
 *    (e.g., Windows protocol clients can sometimes append `/` or `"` to the query string).
 * 2. Parses query parameters (`ticket` and `token`).
 * 3. Stores the credentials in `pendingAuthData` for pull-based fallback.
 * 4. Restores and focuses the primary Electron window so the user is brought back to the desktop app.
 * 5. Dispatches `auth:callback` IPC event immediately and with staggered retries (300ms, 800ms)
 *    to guarantee delivery even during asynchronous window focus or restore transitions.
 */
export function handleAuthUrl(urlStr: string): void {
  if (!urlStr) {
    console.warn("[auth-service] handleAuthUrl called with empty urlStr");
    return;
  }
  log("[auth-service] handleAuthUrl received input:", urlStr);

  const match = urlStr.match(/dezign2app:\/\/[^\s"']+/i);
  if (!match) {
    console.warn("[auth-service] URL did not match dezign2app:// pattern:", urlStr);
    return;
  }

  // Trim trailing slashes or quotes that OS shells / browsers might append to protocol links
  const cleanUrl = match[0].replace(/[\/'"]+$/, "");
  log("[auth-service] Clean auth deep link:", cleanUrl);

  try {
    const urlObj = new URL(cleanUrl);
    let token = urlObj.searchParams.get("token") || undefined;
    let ticket = urlObj.searchParams.get("ticket") || undefined;

    // Clean up any extraneous trailing slash in individual query parameters
    if (token) token = token.replace(/[\/'"]+$/, "").trim();
    if (ticket) ticket = ticket.replace(/[\/'"]+$/, "").trim();

    log("[auth-service] Parsed deep link params:", {
      hasToken: !!token,
      hasTicket: !!ticket,
      ticketPreview: ticket ? `${ticket.substring(0, 15)}...` : undefined,
    });

    const payload: PendingAuthPayload = {
      token,
      ticket,
      rawUrl: cleanUrl,
    };

    // Cache the pending auth data so the renderer can retrieve it on mount or window focus
    pendingAuthData = payload;

    const mainWindow = getMainWindow();
    if (!mainWindow) {
      console.warn(
        "[auth-service] getMainWindow() is null or window not ready yet. Saved to pendingAuthData."
      );
      return;
    }

    // Bring desktop app to front when returning from browser login
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();

    const sendAuthCallback = () => {
      try {
        if (!mainWindow.isDestroyed() && mainWindow.webContents) {
          log("[auth-service] Delivering auth:callback event to renderer webContents...");
          mainWindow.webContents.send("auth:callback", payload);
        }
      } catch (err) {
        console.warn("[auth-service] Error sending auth:callback to renderer:", err);
      }
    };

    // 1. Immediate dispatch
    sendAuthCallback();

    // 2. Additional dispatches with small delays to guarantee receipt if renderer
    //    was in the middle of being restored or gaining window focus
    setTimeout(sendAuthCallback, 300);
    setTimeout(sendAuthCallback, 800);
  } catch (err) {
    console.error("[auth-service] Failed to parse auth deep link URL:", err);
  }
}

/**
 * Checks command line arguments for initial deep link on cold startup.
 * If the user clicked a dezign2app:// link while the app was closed, the URL is passed
 * as a startup argument in process.argv.
 */
export function handleInitialDeepLink(): void {
  const initialDeepLink = process.argv.find((arg) =>
    arg.toLowerCase().includes("dezign2app://")
  );
  if (initialDeepLink) {
    setTimeout(() => handleAuthUrl(initialDeepLink), 1000);
  }
}

/**
 * Opens the external default browser to initiate the Web/OAuth authentication flow.
 *
 * @param customUrl Optional custom login URL to navigate to. Defaults to Next.js /sign-in
 *                  with desktop=true and redirect_url pointing to /auth/desktop.
 */
export async function openBrowserLogin(customUrl?: string): Promise<{ success: boolean }> {
  const authUrl =
    process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (IS_DEV ? "http://127.0.0.1:46500" : "https://dezign2app.com");

  const loginUrl =
    customUrl ||
    `${authUrl}/sign-in?desktop=true&redirect_url=${encodeURIComponent(
      `${authUrl}/auth/desktop`
    )}`;

  log("[auth-service] Opening external browser for authentication:", loginUrl);
  try {
    await shell.openExternal(loginUrl);
    log("[auth-service] shell.openExternal succeeded");
    return { success: true };
  } catch (err) {
    console.error("[auth-service] Failed to open external browser:", err);
    return { success: false };
  }
}
