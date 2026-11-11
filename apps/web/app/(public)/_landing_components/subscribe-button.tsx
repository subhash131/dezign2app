"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { isElectron, getElectronAPI } from "@/lib/electron";

interface SubscribeButtonProps {
  productId: string;
}

export const SubscribeButton = ({ productId }: SubscribeButtonProps) => {
  const { data: session, isPending } = useSession();
  const isSignedIn = !!session?.user;
  const isLoaded = !isPending;
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);

  const handleCheckout = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const response = await fetch("/api/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          toast.error("Please sign in to continue.");
          if (isElectron()) {
            const webBaseUrl =
              process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL ||
              process.env.NEXT_PUBLIC_APP_URL ||
              (typeof window !== "undefined" ? window.location.origin : "");
            const pricingUrl = `${webBaseUrl}/pricing`;
            const api = getElectronAPI();
            if (api?.auth) {
              api.auth.openBrowserLogin(pricingUrl);
              return;
            }
          }
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/pricing?checkout=true")}`);
          return;
        }
        throw new Error("Checkout failed");
      }

      const { checkoutUrl } = await response.json();

      if (checkoutUrl) {
        if (isElectron()) {
          const api = getElectronAPI();
          if (api?.auth) {
            api.auth.openBrowserLogin(checkoutUrl);
            toast.success("Opened checkout in your browser!");
            return;
          }
        }
        window.location.href = checkoutUrl;
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const shouldAutoCheckout = params.get("checkout") === "true";
    if (isSignedIn && shouldAutoCheckout && !loading && !hasAutoTriggered) {
      setHasAutoTriggered(true);
      handleCheckout();
    }
  }, [isSignedIn, loading, hasAutoTriggered]);

  const buttonStyle = `
    w-full mt-4 py-3 rounded-lg text-sm font-semibold transition-colors
    bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed
  `;

  if (!isLoaded) {
    return (
      <button disabled className={buttonStyle}>
        Loading...
      </button>
    );
  }

  if (!isSignedIn) {
    const handleUnauthenticatedClick = () => {
      if (isElectron()) {
        const webBaseUrl =
          process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          (typeof window !== "undefined" ? window.location.origin : "");
        const pricingUrl = `${webBaseUrl}/pricing`;
        const api = getElectronAPI();
        if (api?.auth) {
          api.auth.openBrowserLogin(pricingUrl);
          return;
        }
      }
      const currentUrl =
        typeof window !== "undefined" ? window.location.href : "/pricing";
      const redirectUrl = currentUrl.includes("?")
        ? `${currentUrl}&checkout=true`
        : `${currentUrl}?checkout=true`;

      router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
    };

    return (
      <button
        onClick={handleUnauthenticatedClick}
        className={buttonStyle}
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        Get Started
      </button>
    );
  }

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      className={buttonStyle}
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {loading ? "Processing..." : "Get Started"}
    </button>
  );
};
