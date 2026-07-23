import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/terms-and-conditions(.*)",
  "/tutorials(.*)",
  "/blog(.*)",
  "/support(.*)",
  "/about(.*)",
  "/careers(.*)",
  "/contact(.*)",
  "/partners(.*)",
  "/changelog(.*)",
  "/integrations(.*)",
  "/api/public(.*)",
]);

const isAuthRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const isIgnoredRoute = createRouteMatcher([
  "/api/inngest(.*)",
  "/api/ai(.*)",
  "/api/checkout(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Skip authentication for ignored routes
  if (isIgnoredRoute(req)) {
    return NextResponse.next();
  }

  const session = await auth();

  // 1. If user is signed in and tries to access auth pages, send them home
  if (session.userId && isAuthRoute(req)) {
    return NextResponse.redirect(new URL("/projects", req.url));
  }

  // 2. Protect non-public routes
  if (!isPublicRoute(req) && !isAuthRoute(req) && !session.userId) {
    return session.redirectToSignIn();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};