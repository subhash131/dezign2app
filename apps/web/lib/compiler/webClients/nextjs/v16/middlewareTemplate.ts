import { PageInfo } from "./types";
import { BackendNodeData, arePageRoutesEqual } from "@workspace/canvas";

/**
 * Generates Next.js 16 proxy.ts for route protection (replaces deprecated middleware.ts)
 * Implements Tier 1: Lightweight optimistic session cookie redirect using getSessionCookie(request)
 */
export function generateProxy(pagesInfo: PageInfo[], authNodeData?: BackendNodeData): string {
  const protectedPages = pagesInfo.filter(
    (p) => p.accessType && p.accessType !== "public",
  );

  const redirects = authNodeData?.redirects || {};
  const resolveRedirect = (nodeId?: string, fallbackUrl?: string, defaultFallback: string = "/") => {
    if (fallbackUrl) {
      const cleanFallback = fallbackUrl.startsWith("/") ? fallbackUrl : `/${fallbackUrl}`;
      if (nodeId) {
        const matched = pagesInfo.find((p) => p.nodeId === nodeId);
        if (
          matched &&
          (arePageRoutesEqual(matched.routePath, cleanFallback) ||
            arePageRoutesEqual(matched.label, cleanFallback))
        ) {
          return matched.routePath;
        }
      }
      return cleanFallback;
    }
    if (nodeId) {
      const matched = pagesInfo.find((p) => p.nodeId === nodeId);
      if (matched) return matched.routePath;
    }
    return defaultFallback;
  };

  const signInPageUrl = resolveRedirect(redirects.signInPageNodeId, redirects.signInPageUrl, "/login");
  const signUpPageUrl = resolveRedirect(redirects.signUpPageNodeId, redirects.signUpPageUrl, "/register");
  const signInRedirectUrl = resolveRedirect(redirects.signInRedirectNodeId, redirects.signInRedirectUrl, "/");
  const unauthorizedUrl = resolveRedirect(redirects.unauthorizedNodeId, redirects.unauthorizedUrl, "/unauthorized");
  const pricingUrl = resolveRedirect(redirects.pricingNodeId, redirects.pricingUrl, "/pricing");

  if (!authNodeData) {
    return `import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
`;
  }

  const routeRules = protectedPages.map((p) => {
    const route = p.routePath;
    const accessType = p.accessType;
    const redirect =
      p.redirectTo ||
      (accessType === "payment-gated"
        ? pricingUrl
        : accessType === "org-gated"
        ? "/select-org"
        : accessType === "role-gated"
        ? unauthorizedUrl
        : signInPageUrl);
    const roles = JSON.stringify(p.allowedRoles || []);
    const plans = JSON.stringify(p.requiredPlans || []);
    const orgRoles = JSON.stringify(p.allowedOrgRoles || []);

    return `  {
    path: "${route}",
    accessType: "${accessType}",
    redirectTo: "${redirect}",
    allowedRoles: ${roles},
    requiredPlans: ${plans},
    allowedOrgRoles: ${orgRoles},
  }`;
  });

  return `import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

interface RouteRule {
  path: string;
  accessType: "private" | "role-gated" | "payment-gated" | "org-gated";
  redirectTo: string;
  allowedRoles: string[];
  requiredPlans: string[];
  allowedOrgRoles: string[];
}

const PROTECTED_ROUTES: RouteRule[] = [
${routeRules.join(",\n")}
];

const AUTH_PAGES = [${JSON.stringify(signInPageUrl)}, ${JSON.stringify(signUpPageUrl)}];
const DEFAULT_AUTH_REDIRECT = ${JSON.stringify(signInRedirectUrl)};

/**
 * Next.js 16 Proxy / Middleware
 * Tier 1: Lightweight optimistic UX redirect check for session cookie presence
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  // Note: Session DB record verification is handled dynamically by page components and requireSession helper
  // to avoid redirect loops when a session cookie exists but the user record in the DB has been deleted/invalidated.

  const matchedRule = PROTECTED_ROUTES.find((rule) => 
    rule.path === "/" ? pathname === "/" : pathname.startsWith(rule.path)
  );

  if (!matchedRule) {
    return NextResponse.next();
  }

  // Tier 1 Optimistic Check using Better Auth cookie helper
  if (!sessionCookie) {
    const loginUrl = new URL(${JSON.stringify(signInPageUrl)}, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Cookie exists -> pass through to Next.js page for Tier 2 auth server-side validation
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
`;
}

export const generateMiddleware = generateProxy;




