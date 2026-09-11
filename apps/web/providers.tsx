"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import {
  Authenticated,
  ConvexReactClient,
  Unauthenticated,
  useMutation,
} from "convex/react";
import { ConvexBetterAuthProvider } from "@/providers/convex-auth-provider";
import { authClient, useSession } from "@/lib/auth-client";
import { api } from "@workspace/backend/_generated/api";
import "@/lib/utils/patchResizeObserver";
import { Toaster } from "@workspace/ui/components/sonner";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in your .env file");
}

const convex = new ConvexReactClient(convexUrl);

// Suppress benign browser ResizeObserver loop notifications from triggering Next.js dev error overlays
if (typeof window !== "undefined") {
  const isResizeObserverError = (msg: unknown) => {
    if (typeof msg !== "string") return false;
    return (
      msg.includes("ResizeObserver loop completed with undelivered notifications") ||
      msg.includes("ResizeObserver loop limit exceeded") ||
      msg.includes("ResizeObserver")
    );
  };

  window.addEventListener(
    "error",
    (e: ErrorEvent) => {
      if (isResizeObserverError(e.message)) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || String(e.reason);
      if (isResizeObserverError(msg)) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );
}

function UserSync() {
  const { data: session } = useSession();
  const ensureUser = useMutation(api.users.ensureAuthUser);
  const syncCurrentUser = useMutation(api.users.syncCurrentUser);

  React.useEffect(() => {
    if (session?.user?.email) {
      const userEmail = session.user.email;
      ensureUser({
        email: userEmail,
        name: session.user.name || userEmail.split("@")[0] || "User",
        authId: session.user.id,
        avatarUrl: session.user.image || undefined,
      }).catch((err) => {
        console.warn("[UserSync] Error in ensureUser:", err);
      });
    } else {
      syncCurrentUser().catch(() => {});
    }
  }, [session, ensureUser, syncCurrentUser]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <UserSync />
        <NuqsAdapter>
          {children}
          <Toaster />
        </NuqsAdapter>
      </ConvexBetterAuthProvider>
    </NextThemesProvider>
  );
}

import { useRouter } from "next/navigation";

export const AuthenticatedProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    console.log("[AuthenticatedProvider] Auth guard evaluation:", {
      isPending,
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: session?.user?.id,
      email: session?.user?.email,
    });
    if (!isPending && !session?.user) {
      console.warn("[AuthenticatedProvider] Unauthenticated access detected (no session user). Redirecting to /sign-in...");
      router.replace("/sign-in");
    }
  }, [session, isPending, router]);

  if (isPending || !session?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return <>{children}</>;
};

export const UnauthenticatedProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return <Unauthenticated>{children}</Unauthenticated>;
};
