import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";

const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  process.env.CONVEX_URL ||
  "";

const convexSiteUrl =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  process.env.CONVEX_SITE_URL ||
  (convexUrl ? convexUrl.replace(".convex.cloud", ".convex.site") : "");

async function handleProxy(req: NextRequest) {
  const requestUrl = new URL(req.url);
  const path = `${requestUrl.pathname}${requestUrl.search}`;

  // ── proxy init debug (logged once per cold start) ──────────────────────────
  log("[auth proxy] ── request ──────────────────────────────────────────");
  log("[auth proxy]  path              :", path);
  log("[auth proxy]  method            :", req.method);
  log("[auth proxy]  convexSiteUrl     :", convexSiteUrl || "(EMPTY - MISSING ENV VAR)");
  log("[auth proxy]  NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL ?? "(unset)");
  log("[auth proxy]  x-electron-app    :", req.headers.get("x-electron-app") ?? "not set");
  log("[auth proxy]  origin header     :", req.headers.get("origin") ?? "not set");
  log("[auth proxy]  host header       :", req.headers.get("host") ?? "not set");
  log("[auth proxy]  request hostname  :", requestUrl.hostname);

  if (!convexSiteUrl) {
    console.error("[auth proxy] Missing NEXT_PUBLIC_CONVEX_SITE_URL or NEXT_PUBLIC_CONVEX_URL");
    return NextResponse.json(
      { error: "Backend auth service is not configured (missing CONVEX_SITE_URL)" },
      { status: 503 },
    );
  }

  const nextUrl = `${convexSiteUrl}${path}`;
  const headers = new Headers(req.headers);

  // Strip hop-by-hop headers
  headers.delete("transfer-encoding");
  headers.delete("content-length");
  headers.delete("connection");
  headers.set("accept-encoding", "application/json");
  headers.set("host", new URL(convexSiteUrl).host);

  // Extract session token from cookie
  const rawCookie = headers.get("cookie") || "";
  const tokenMatch = rawCookie.match(
    /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/,
  );
  const sessionToken = tokenMatch ? tokenMatch[1] : null;

  log("[auth proxy]  cookie present?   :", rawCookie ? "YES" : "NO");
  log("[auth proxy]  session token?    :", sessionToken ? `YES (${sessionToken.substring(0, 12)}...)` : "NO - this will cause 401/500");

  if (sessionToken) {
    let normalizedCookie = rawCookie;
    if (!normalizedCookie.includes("__Secure-better-auth.session_token=")) {
      normalizedCookie += `; __Secure-better-auth.session_token=${sessionToken}`;
    }
    if (!normalizedCookie.includes("better-auth.session_token=")) {
      normalizedCookie += `; better-auth.session_token=${sessionToken}`;
    }
    headers.set("cookie", normalizedCookie);

    if (!headers.has("authorization")) {
      headers.set("authorization", `Bearer ${sessionToken}`);
    }
  }

  const isLocalHost =
    requestUrl.hostname === "127.0.0.1" ||
    requestUrl.hostname === "localhost";

  // Handle host forwarding for local loopback (Electron desktop)
  const isLoopback =
    isLocalHost ||
    req.headers.get("x-electron-app") === "1";

  log("[auth proxy]  isLoopback?       :", isLoopback);

  if (isLoopback && process.env.NEXT_PUBLIC_APP_URL) {
    try {
      const appUrlObj = new URL(process.env.NEXT_PUBLIC_APP_URL);
      const publicHost = appUrlObj.host;
      const publicProto = appUrlObj.protocol.replace(/:$/, "");
      headers.set("x-forwarded-host", publicHost);
      headers.set("x-forwarded-proto", publicProto);
      headers.set("x-better-auth-forwarded-host", publicHost);
      headers.set("x-better-auth-forwarded-proto", publicProto);
      log("[auth proxy]  x-forwarded-host  :", publicHost, "proto:", publicProto, "(from NEXT_PUBLIC_APP_URL)");
    } catch {
      headers.set("x-forwarded-host", requestUrl.host);
      headers.set("x-forwarded-proto", requestUrl.protocol.replace(/:$/, ""));
      headers.set("x-better-auth-forwarded-host", requestUrl.host);
      headers.set("x-better-auth-forwarded-proto", requestUrl.protocol.replace(/:$/, ""));
      log("[auth proxy]  x-forwarded-host  :", requestUrl.host, "(fallback - NEXT_PUBLIC_APP_URL parse failed)");
    }
  } else {
    headers.set("x-forwarded-host", requestUrl.host);
    headers.set("x-forwarded-proto", requestUrl.protocol.replace(/:$/, ""));
    headers.set("x-better-auth-forwarded-host", requestUrl.host);
    headers.set("x-better-auth-forwarded-proto", requestUrl.protocol.replace(/:$/, ""));
    log("[auth proxy]  x-forwarded-host  :", requestUrl.host, "(not loopback or no APP_URL)");
  }

  log("[auth proxy]  → proxying to    :", nextUrl);

  const init: RequestInit = {
    headers,
    method: req.method,
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  const res = await fetch(nextUrl, init);

  log("[auth proxy]  ← upstream status :", res.status, res.statusText);
  if (res.status >= 400) {
    try {
      const errBody = await res.clone().text();
      console.error("[auth proxy]  ← upstream error body:", errBody.substring(0, 500));
    } catch { /* ignore */ }
  }
  log("[auth proxy] ─────────────────────────────────────────────────────");

  // Clone response headers so we can duplicate un-prefixed cookies for non-HTTPS desktop clients
  const responseHeaders = new Headers(res.headers);

  const response = new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });

  const setCookieHeaders = res.headers.getSetCookie?.() || [];
  if (setCookieHeaders.length > 0) {
    response.headers.delete("set-cookie");
    for (const cookieStr of setCookieHeaders) {
      let cookie = cookieStr;
      if (isLocalHost) {
        // Strip production domain attribute so localhost / 127.0.0.1 accepts the cookie
        cookie = cookie.replace(/;\s*Domain=[^;]+/gi, "");
        // Strip Secure flag on plain HTTP dev so browsers don't reject cookies
        if (requestUrl.protocol === "http:") {
          cookie = cookie.replace(/;\s*Secure/gi, "");
          if (cookie.includes("__Secure-")) {
            cookie = cookie.replace(/__Secure-/g, "");
          }
        }
      }
      response.headers.append("set-cookie", cookie);
      if (cookieStr.includes("__Secure-better-auth.session_token=")) {
        const plainCookie = cookieStr
          .replace("__Secure-better-auth.session_token=", "better-auth.session_token=")
          .replace(/;\s*Secure/i, "");
        response.headers.append("set-cookie", plainCookie);
      }
    }
  }

  return response;
}

export async function GET(req: NextRequest) {
  return handleProxy(req);
}

export async function POST(req: NextRequest) {
  return handleProxy(req);
}
