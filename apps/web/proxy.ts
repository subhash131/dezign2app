import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";

function createRouteMatcher(patterns: string[]) {
  return (req: NextRequest) => {
    const pathname = req.nextUrl.pathname;
    return patterns.some((pattern) => {
      if (pattern === "/") {
        return pathname === "/";
      }
      const cleanPattern = pattern.replace(/\(\.\*\)/g, "").replace(/\*$/, "");
      if (pattern.includes(".*") || pattern.includes("*")) {
        return pathname === cleanPattern || pathname.startsWith(cleanPattern);
      }
      return pathname === pattern;
    });
  };
}

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing(.*)",
  "/docs(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/terms-and-conditions(.*)",
  "/acceptable-use(.*)",
  "/aup(.*)",
  "/tutorials(.*)",
  "/blog(.*)",
  "/support(.*)",
  "/about(.*)",
  "/careers(.*)",
  "/contact(.*)",
  "/partners(.*)",
  "/changelog(.*)",
  "/integrations(.*)",
  "/auth/desktop(.*)",
  "/preview(.*)",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/api/public(.*)",
  "/api/auth(.*)",
  "/api/packages(.*)",
]);

const isExcludedDesktopRoute = createRouteMatcher([
  "/",
  "/pricing(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/terms-and-conditions(.*)",
  "/acceptable-use(.*)",
  "/aup(.*)",
  "/tutorials(.*)",
  "/blog(.*)",
  "/support(.*)",
  "/about(.*)",
  "/careers(.*)",
  "/contact(.*)",
  "/partners(.*)",
  "/changelog(.*)",
  "/integrations(.*)",
]);

const isAuthRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/auth/desktop(.*)",
]);

const isIgnoredRoute = createRouteMatcher([
  "/api/inngest(.*)",
  "/api/ai(.*)",
  "/api/checkout(.*)",
  "/api/auth(.*)",
]);

export default async function proxy(req: NextRequest) {
  // Skip authentication for ignored routes
  if (isIgnoredRoute(req)) {
    return NextResponse.next();
  }

  const isElectron =
    req.headers.get("x-electron-app") === "1" ||
    req.cookies.get("is_electron")?.value === "1";

  const sessionToken =
    req.cookies.get("better-auth.session_token")?.value ||
    req.cookies.get("__Secure-better-auth.session_token")?.value ||
    req.cookies.get("convex_jwt")?.value;

  const isSignedIn = !!sessionToken;

  log(`[proxy] ${req.method} ${req.nextUrl.pathname} | isElectron=${isElectron} | isSignedIn=${isSignedIn} | tokenPreview=${sessionToken ? `${sessionToken.substring(0, 10)}...` : "none"}`);

  // If in Electron and trying to access marketing/landing/public pages, redirect directly to /projects or /sign-in
  if (isElectron && isExcludedDesktopRoute(req)) {
    if (isSignedIn) {
      log(`[proxy] In Electron accessing marketing route, redirecting to /projects`);
      return NextResponse.redirect(new URL("/projects", req.url));
    } else {
      log(`[proxy] In Electron accessing marketing route, redirecting to /sign-in`);
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
  }

  // Allow auth routes to render without server-side redirect loops
  // Client-side useSession() handles navigation once authenticated
  if (isAuthRoute(req)) {
    return NextResponse.next();
  }

  // 2. Protect non-public routes for unauthenticated users
  if (!isPublicRoute(req) && !isSignedIn) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.nextUrl.pathname + req.nextUrl.search);
    log(`[proxy] Unauthenticated request to protected route ${req.nextUrl.pathname}, redirecting to /sign-in`);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
