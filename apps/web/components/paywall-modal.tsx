/**
 * ⚠️🚨 IMPORTANT 🚨⚠️
 * 
 * ARCHITECTURE & SECURITY RECOMMENDATION:
 * 
 * 1. UX Guard vs. Server-side Enforcement:
 *    This `ROUTE_CONFIG` is a client-side boundary to guide user experience (showing the Paywall
 *    modal and handling friendly redirects). Since client-side code can be bypassed, you MUST
 *    enforce subscription rules on the backend inside your Convex mutations and queries (e.g.,
 *    by calling a helper function like `assertPremiumSubscription(ctx)` before writing database records).
 * 
 * 2. Fine-Grained Authorization (OpenFGA) vs. Convex-Native checks:
 *    - OpenFGA (Zanzibar-style ReBAC) is designed for resource-level sharing relationships (e.g.,
 *      "User A has editor rights to Workflow B because they belong to Team C").
 *    - For paywalls, global tier entitlements, and numeric quotas, OpenFGA is overkill. It introduces
 *      external network latency and synchronization complexity (syncing Convex billing records to OpenFGA).
 *    - Recommendation: Keep subscription/paywall checks native and reactive in Convex. Querying the
 *      `subscriptions` table directly in Convex is ACID-compliant, has zero additional network latency,
 *      and reactively updates the UI when the user's subscription status changes.
 * 
 */
"use client";

import React, { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { SubscriptionAccessContext } from "@/providers/subscription-access-context";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ReadOnlyBanner } from "./read-only-banner";
import Link from "next/link";



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
  "/document": "premium-limited",
  "/projects": "premium-limited",
  "/project": "premium-only",
  "/api-keys": "premium-only",
};

export const PaywallModal = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const subscriptionStatus = useQuery(api.users.getSubscriptionStatus);

  const [isPaywallActive, setIsPaywallActive] = useState(false);
  const [paywallDismissible, setPaywallDismissible] = useState(true);
  const [hasDismissedInitialModal, setHasDismissedInitialModal] =
    useState(false);

  // Default to premium-only if no route matched
  const currentAccess =
    Object.entries(ROUTE_CONFIG).find(([route]) =>
      pathname.startsWith(route),
    )?.[1] || "premium-only";

  useEffect(() => {
    // Reset dismissal status on route change ONLY if we leave a readonly route
    // Optional: maybe we don't want to reset it on every route change.
    // Let's keep it simple: dismissal persists until full reload.
  }, [pathname]);

  useEffect(() => {
    // We must wait for Clerk to be fully loaded before making any redirection decisions.
    // If we act when isClerkLoaded is false, isSignedIn defaults to false and we may
    // incorrectly redirect subscribed users to the pricing page.
    if (!isClerkLoaded || subscriptionStatus === undefined) return;

    const { status } = subscriptionStatus;

    // Always allow free routes and home
    if (currentAccess === "free" || pathname === "/") {
      setIsPaywallActive(false);
      return;
    }

    // Handle protected routes
    if (
      currentAccess === "premium-only" ||
      currentAccess === "premium-limited"
    ) {
      // 1. Fully active subscribers: always allowed
      if (status === "active") {
        setIsPaywallActive(false);
        return;
      }

      // 2. Unauthenticated or Never-subscribed:
      if (
        status === "unauthenticated" ||
        status === "no_subscription" ||
        status === "user_not_found"
      ) {
        // --- TRANSIENT AUTH SYNC PROTECTION ---
        // If Clerk says the user is signed in, but Convex is still reported as unauthenticated
        // or the user record hasn't been created yet (synced by webhook), we wait.
        // This prevents the "sign-in -> dashboard -> pricing" bounce.
        if (isSignedIn && (status === "unauthenticated" || status === "user_not_found")) {
          return;
        }

        // Truly unauthenticated or never-subscribed users go to pricing.
        router.push("/pricing");
        return;
      }

      // 3. Expired/Inactive subscribers:
      if (status === "inactive") {
        if (currentAccess === "premium-only") {
          // Forced modal
          setIsPaywallActive(true);
          setPaywallDismissible(false);
        } else if (currentAccess === "premium-limited") {
          // Dismissible modal (Read-only)
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
    isClerkLoaded,
    isSignedIn,
  ]);

  if (!isClerkLoaded || subscriptionStatus === undefined) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#1f1f1f]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  // Handle transient sync states by staying in loader
  if (isSignedIn && (subscriptionStatus.status === "unauthenticated" || subscriptionStatus.status === "user_not_found")) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#1f1f1f]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        <p className="mt-4 text-gray-400">Synchronizing your session...</p>
      </div>
    );
  }

  // Handle immediate redirect states for non-authenticated users
  if (
    (currentAccess === "premium-only" || currentAccess === "premium-limited") &&
    pathname !== "/" &&
    !isSignedIn && // Only redirect if Clerk also says they aren't signed in
    (subscriptionStatus.status === "no_subscription" ||
      subscriptionStatus.status === "user_not_found" ||
      subscriptionStatus.status === "unauthenticated")
  ) {
    return null;
  }

  const isReadOnly =
    currentAccess === "premium-limited" &&
    subscriptionStatus.status === "inactive";

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-sidebar p-8 rounded-2xl shadow-2xl max-w-lg w-full text-center m-4 relative">
            {paywallDismissible && (
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}

            <div className="mb-6 flex justify-center">
              <svg
                className="w-16 h-16 text-yellow-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">
              Subscription Expired
            </h2>
            <p className="text-gray-400 mb-8 text-lg">
              Your access to the architecture design tools has been paused.
              Please resubscribe to continue creating and managing your
              projects.
            </p>

            <Link
              href={`/pricing`}
              className="block w-full py-4 px-6 transition-all rounded-xl font-bold text-white bg-accent text-lg"
            >
              Resubscribe Now
            </Link>

            {paywallDismissible ? (
              <button
                onClick={handleDismiss}
                className="mt-6 text-gray-500 hover:text-white transition-colors underline"
              >
                Continue in View-Only Mode
              </button>
            ) : (
              <button
                onClick={() => router.push("/dashboard")}
                className="mt-6 text-gray-500 hover:text-white transition-colors underline"
              >
                Return to Home
              </button>
            )}
          </div>
        </div>
      )}
    </SubscriptionAccessContext.Provider>
  );
};
