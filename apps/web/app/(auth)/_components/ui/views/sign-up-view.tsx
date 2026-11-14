"use client";

import React, { useEffect, useState } from "react";
import { isElectron, getElectronAPI } from "@/lib/electron";
import { useSession, signUp, signIn, organization as orgActions } from "@/lib/auth-client";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { SignInView } from "./sign-in-view";

export const SignUpView = () => {
  const [mounted, setMounted] = useState(false);
  const [inDesktop, setInDesktop] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"github" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const isSignedOut = searchParams.get("signed_out") === "true";
  const redirectUrl = searchParams.get("redirect_url") || "/projects";

  const { data: session } = useSession();
  const ensureUser = useMutation(api.users.ensureAuthUser);

  useEffect(() => {
    setMounted(true);
    setInDesktop(isElectron());
  }, []);

  const navigateTo = React.useCallback(
    (url: string) => {
      if (!url) return;
      if (url.startsWith("http://") || url.startsWith("https://")) {
        try {
          const parsed = new URL(url);
          if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
            router.push(parsed.pathname + parsed.search);
            return;
          }
        } catch {}
        window.location.href = url;
      } else {
        router.push(url);
      }
    },
    [router],
  );

  useEffect(() => {
    if (isSignedOut) {
      window.history.replaceState(null, "", "/sign-up");
      return;
    }

    if (session?.user) {
      if (session.user.email) {
        const userEmail = session.user.email;
        ensureUser({
          email: userEmail,
          name: session.user.name || userEmail.split("@")[0] || "User",
          authId: session.user.id,
          avatarUrl: session.user.image || undefined,
        }).catch(() => {});
      }
      navigateTo(redirectUrl);
    }
  }, [session, navigateTo, redirectUrl, ensureUser, isSignedOut]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      if (res.error) {
        setError(res.error.message || "Failed to create account");
        return;
      }

      // If user specified an organization name, create it
      if (orgName.trim()) {
        try {
          const slug = orgName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

          await orgActions.create({
            name: orgName.trim(),
            slug: `${slug}-${Date.now().toString().slice(-4)}`,
          });
        } catch (orgErr) {
          console.warn("Could not create initial org:", orgErr);
        }
      }

      toast.success("Account created successfully!");
      try {
        const api = getElectronAPI();
        if (api?.auth) {
          const tokenMatch = typeof document !== "undefined"
            ? document.cookie.match(/(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/)
            : null;
          const rawToken = (res as any)?.data?.token || tokenMatch?.[1];
          if (rawToken && api.auth.saveSession) {
            await api.auth.saveSession(rawToken);
          }
          if (api.auth.flushCookies) {
            await api.auth.flushCookies();
          }
        }
      } catch (postSignupErr) {
        console.warn("[desktop-auth:signup] Post-signup session persistence error:", postSignupErr);
      }
      navigateTo(redirectUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign up failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignUp = async (provider: "github" | "google") => {
    try {
      setSocialLoading(provider);
      setError(null);
      let targetCallback = redirectUrl;
      if (targetCallback.startsWith("http://") || targetCallback.startsWith("https://")) {
        try {
          const parsed = new URL(targetCallback);
          if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
            targetCallback = parsed.pathname + parsed.search;
          }
        } catch {}
      }
      await signIn.social({
        provider,
        callbackURL: targetCallback,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to sign up with ${provider}`;
      toast.error(message);
      setSocialLoading(null);
    }
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center p-4 min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // CRITICAL: Desktop app MUST NOT provide in-app signup/login forms.
  // Delegate strictly to SignInView which routes through the external system web browser.
  if (inDesktop) {
    return <SignInView />;
  }

  return (
    <div className="flex w-full items-center justify-center p-4">
      <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-2xl">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Create your account
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Start designing multi-tenant system architectures and workflows
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Social Sign Up */}
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSocialSignUp("github")}
              disabled={loading || !!socialLoading}
              className="w-full gap-2 text-xs font-medium"
            >
              {socialLoading === "github" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              )}
              GitHub
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSocialSignUp("google")}
              disabled={loading || !!socialLoading}
              className="w-full gap-2 text-xs font-medium"
            >
              {socialLoading === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              Google
            </Button>
          </div>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Or with email
              </span>
            </div>
          </div>

          <form onSubmit={handleSignUp} className="space-y-3">
            <div className="space-y-1.5 text-left">
              <Label htmlFor="name" className="text-xs font-medium">
                Full Name
              </Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5 text-left">
              <Label htmlFor="email" className="text-xs font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5 text-left">
              <Label htmlFor="password" className="text-xs font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5 text-left">
              <Label htmlFor="orgName" className="text-xs font-medium">
                Workspace / Organization <span className="text-[10px] text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="orgName"
                placeholder="My Team"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full text-xs font-medium"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex justify-center border-t border-border pt-4 text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={`/sign-in${redirectUrl !== "/projects" ? `?redirect_url=${encodeURIComponent(redirectUrl)}` : ""}`}
            className="ml-1 font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
};
