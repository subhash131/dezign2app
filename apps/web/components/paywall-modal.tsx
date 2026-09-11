/**
 * ⚠️🚨 IMPORTANT 🚨⚠️
 *
 * ARCHITECTURE & SECURITY RECOMMENDATION:
 *
 * 1. UX Guard vs. Server-side Enforcement:
 *    This `ROUTE_CONFIG` is a client-side boundary to guide user experience (showing the Paywall
 *    modal and handling friendly redirects).
 *
 * 2. Subscription/paywall checks are native and reactive in Convex. Querying the
 *    `subscriptions` table directly in Convex is ACID-compliant and reactively updates the UI.
 */
"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { SubscriptionAccessContext } from "@/providers/subscription-access-context";
import { useRouter, usePathname } from "next/navigation";
import {
  authClient,
  useSession,
  useActiveOrganization,
  useListOrganizations,
} from "@/lib/auth-client";
import { ReadOnlyBanner } from "./read-only-banner";
import Link from "next/link";
import { isElectron, getElectronAPI } from "@/lib/electron";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Sparkles, ExternalLink, Lock, X, Building2 } from "lucide-react";

/**
 * Access levels defined below:
 *    - free: subscription not needed.
 *    - premium-limited: expired users are allowed to view but not edit. Never-subscribed users are redirected.
 *    - premium-only: subscription required.
 */
const ROUTE_CONFIG: Record<
  string,
  "free" | "premium-limited" | "premium-only"
> = {
  "/pricing": "free",
  "/docs": "free",
  "/sign-in": "free",
  "/sign-up": "free",
  "/auth/desktop": "free",
  "/privacy": "free",
  "/terms": "free",
  "/terms-and-conditions": "free",
  "/acceptable-use": "free",
  "/aup": "free",
  "/tutorials": "free",
  "/blog": "free",
  "/support": "free",
  "/about": "free",
  "/careers": "free",
  "/contact": "free",
  "/partners": "free",
  "/changelog": "free",
  "/integrations": "free",
  "/document": "premium-limited",
  "/projects": "premium-limited",
  "/project": "premium-only",
  "/api-keys": "premium-only",
};

export const PaywallModal = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending: isSessionPending } = useSession();
  const { data: activeOrg } = useActiveOrganization();
  const { data: orgs } = useListOrganizations();

  const isAuthLoaded = !isSessionPending;
  const isSignedIn = !!session?.user;
  const subscriptionStatus = useQuery(
    api.users.getSubscriptionStatus,
    session?.user?.email
      ? {
          email: session.user.email,
          organizationId: activeOrg?.id ?? null,
        }
      : "skip",
  );

  const [isPaywallActive, setIsPaywallActive] = useState(false);
  const [paywallDismissible, setPaywallDismissible] = useState(true);
  const [hasDismissedInitialModal, setHasDismissedInitialModal] =
    useState(false);
  const [inDesktop, setInDesktop] = useState(false);

  useEffect(() => {
    setInDesktop(isElectron());
  }, []);

  // Default access for route
  const matchedRouteKey = Object.keys(ROUTE_CONFIG)
    .sort((a, b) => b.length - a.length)
    .find((route) =>
      route === "/"
        ? pathname === "/"
        : pathname === route || pathname.startsWith(route + "/")
    );

  const currentAccess = matchedRouteKey
    ? ROUTE_CONFIG[matchedRouteKey]
    : pathname === "/"
    ? "free"
    : "free";

  useEffect(() => {
    if (!isAuthLoaded || subscriptionStatus === undefined) return;

    const { status } = subscriptionStatus;

    // Always allow free routes and home
    if (currentAccess === "free" || pathname === "/") {
      setIsPaywallActive(false);
      return;
    }

    // If user is unauthenticated, do not show paywall modal (auth guards / proxy handle sign-in)
    if (!isSignedIn || status === "unauthenticated" || status === "user_not_found") {
      setIsPaywallActive(false);
      return;
    }

    // Handle protected routes for signed-in users
    if (
      currentAccess === "premium-only" ||
      currentAccess === "premium-limited"
    ) {
      // 1. Fully active subscribers: always allowed
      if (status === "active") {
        setIsPaywallActive(false);
        return;
      }

      // 2. Signed-in, but Never-subscribed:
      if (status === "no_subscription") {
        setIsPaywallActive(true);
        setPaywallDismissible(currentAccess === "premium-limited");
        return;
      }

      // 3. Expired/Inactive subscribers:
      if (status === "inactive") {
        if (currentAccess === "premium-only") {
          setIsPaywallActive(true);
          setPaywallDismissible(false);
        } else if (currentAccess === "premium-limited") {
          if (!hasDismissedInitialModal) {
            setIsPaywallActive(true);
            setPaywallDismissible(true);
          } else {
            setIsPaywallActive(false);
          }
        }
      }
    }
  }, [
    subscriptionStatus,
    router,
    pathname,
    currentAccess,
    hasDismissedInitialModal,
    isAuthLoaded,
    isSignedIn,
    inDesktop,
  ]);

  const handleOpenBrowserPricing = () => {
    const webBaseUrl =
      process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:46500";
    const pricingUrl = `${webBaseUrl}/pricing`;
    const api = getElectronAPI();
    if (api?.auth) {
      api.auth.openBrowserLogin(pricingUrl);
    } else {
      window.open(pricingUrl, "_blank");
    }
  };

  // Public/free pages render immediately
  if (currentAccess !== "free" && pathname !== "/") {
    if (!isAuthLoaded || (isSignedIn && subscriptionStatus === undefined)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }
  }

  const isReadOnly =
    currentAccess === "premium-limited" &&
    subscriptionStatus?.status === "inactive";

  const handleSwitchToOrg = async (orgId: string) => {
    try {
      await authClient.organization.setActive({ organizationId: orgId });
      setIsPaywallActive(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("auth:workspace-changed", {
            detail: { organizationId: orgId },
          }),
        );
      }
    } catch (e) {
      console.error("Failed to switch workspace:", e);
    }
  };

  const handleDismiss = () => {
    setIsPaywallActive(false);
    if (!hasDismissedInitialModal) {
      setHasDismissedInitialModal(true);
    }
  };

  const showPaywall = (dismissible = true) => {
    setIsPaywallActive(true);
    setPaywallDismissible(dismissible);
  };

  return (
    <SubscriptionAccessContext.Provider
      value={{
        isReadOnly,
        showPaywall,
      }}
    >
      <div className="relative flex flex-1 flex-col min-h-screen">
        {isReadOnly &&
          hasDismissedInitialModal &&
          currentAccess === "premium-limited" && <ReadOnlyBanner />}
        {children}
      </div>

      {isPaywallActive && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg border-border bg-card text-card-foreground shadow-2xl relative">
            {paywallDismissible && (
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <CardHeader className="text-center pb-4 pt-6">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
                <Lock className="h-7 w-7" />
              </div>

              <div className="flex justify-center mb-1.5">
                <Badge variant="secondary" className="gap-1 px-2.5 py-0.5 text-xs font-normal">
                  <Sparkles className="h-3 w-3 text-primary" /> Premium Subscription
                </Badge>
              </div>

              <CardTitle className="text-2xl font-bold tracking-tight">
                {subscriptionStatus?.status === "inactive"
                  ? "Subscription Expired"
                  : "Active Subscription Required"}
              </CardTitle>
              <CardDescription className="text-muted-foreground text-sm max-w-sm mx-auto">
                {subscriptionStatus?.status === "inactive"
                  ? "Your access to system architecture compiler and AI tools is paused. Renew in your browser to continue."
                  : "An active Dezign2App plan is required to create projects, generate monorepos, and run local compilers."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              {/* Friendly prompt for users who belong to an organization */}
              {(() => {
                if (activeOrg || !orgs || orgs.length === 0) return null;
                const primaryOrg = orgs[0];
                if (!primaryOrg) return null;
                return (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-xs space-y-2 text-left">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                      <Building2 className="h-4 w-4 text-primary shrink-0" />
                      <span>Team Workspace Available</span>
                    </div>
                    <p className="text-muted-foreground leading-relaxed">
                      You are currently in your Personal Workspace. You have access to the{" "}
                      <strong className="text-foreground">{primaryOrg.name}</strong> team workspace where Pro access is active.
                    </p>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleSwitchToOrg(primaryOrg.id)}
                      className="w-full mt-1 font-medium text-xs shadow-sm"
                    >
                      Switch to {primaryOrg.name} Workspace
                    </Button>
                  </div>
                );
              })()}

              <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground block mb-1">
                  🌐 Browser Checkout & Instant Sync
                </span>
                Subscribe securely in your browser. Your desktop app will unlock automatically in real-time as soon as checkout completes.
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-2.5 pt-0">
              {inDesktop ? (
                <Button
                  onClick={handleOpenBrowserPricing}
                  size="lg"
                  className="w-full font-medium shadow-md transition-all gap-2"
                >
                  <span>Upgrade Subscription in Browser</span>
                  <ExternalLink className="h-4 w-4" />
                </Button>
              ) : (
                <Button asChild size="lg" className="w-full font-medium">
                  <Link href="/pricing">View Plans & Upgrade</Link>
                </Button>
              )}

              {paywallDismissible ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Continue in View-Only Mode
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/projects")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Return to Workspace
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      )}
    </SubscriptionAccessContext.Provider>
  );
};
