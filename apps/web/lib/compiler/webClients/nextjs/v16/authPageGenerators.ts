import { PageInfo } from "./types";
import { BackendNodeData, OAuthProviderConfig, arePageRoutesEqual } from "@workspace/canvas";
import {
  isAuthRegisterPage,
  shouldGenerateSocialProviders,
  AuthCompilerNodeData,
} from "../../../compileAuth";
import { resolveOAuthProviders, BetterAuthV16NodeData } from "../../../auth/better-auth/v1.6";

const socialSvgIcons: Record<string, string> = {
  google: `<svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>`,
  github: `<svg className="w-4 h-4 mr-2 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>`,
  discord: `<svg className="w-4 h-4 mr-2 fill-current" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
  apple: `<svg className="w-4 h-4 mr-2 fill-current" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.02c.65-.79 1.1-1.89.97-2.99-.95.04-2.12.64-2.8 1.43-.6.69-1.13 1.81-.99 2.89 1.07.08 2.17-.54 2.82-1.33z"/></svg>`,
  twitter: `<svg className="w-4 h-4 mr-2 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  microsoft: `<svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>`,
  fallback: `<svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 0121 9z"/></svg>`,
};

export function generateAuthFormComponent(
  pageMeta: PageInfo,
  authNodeData?: AuthCompilerNodeData,
  allPages?: PageInfo[],
): string {
  const isRegister = isAuthRegisterPage(pageMeta, authNodeData);
  const showSocial = shouldGenerateSocialProviders(pageMeta, authNodeData);

  const providers = authNodeData?.providers || {};
  const redirects = authNodeData?.redirects || {};

  const resolveRedirect = (nodeId?: string, fallbackUrl?: string, defaultFallback: string = "/") => {
    if (fallbackUrl) {
      const cleanFallback = fallbackUrl.startsWith("/") ? fallbackUrl : `/${fallbackUrl}`;
      if (nodeId && allPages) {
        const matched = allPages.find((p) => p.nodeId === nodeId);
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
    if (nodeId && allPages) {
      const matched = allPages.find((p) => p.nodeId === nodeId);
      if (matched) return matched.routePath;
    }
    return defaultFallback;
  };

  const resolvedSignInRedirect = resolveRedirect(redirects.signInRedirectNodeId, redirects.signInRedirectUrl, "");
  const signInRedirectUrl = resolvedSignInRedirect || (pageMeta.redirectTo && pageMeta.redirectTo !== pageMeta.routePath ? pageMeta.redirectTo : "/");

  const resolvedSignUpRedirect = resolveRedirect(redirects.signUpRedirectNodeId, redirects.signUpRedirectUrl, "");
  const signUpRedirectUrl = resolvedSignUpRedirect || signInRedirectUrl;

  const signInPageUrl = resolveRedirect(redirects.signInPageNodeId, redirects.signInPageUrl, "/login");
  const signUpPageUrl = resolveRedirect(redirects.signUpPageNodeId, redirects.signUpPageUrl, "/register");

  // Resolve OAuth social providers matching Better Auth config
  const oauthList: OAuthProviderConfig[] = showSocial
    ? resolveOAuthProviders((authNodeData || {}) as BetterAuthV16NodeData)
    : [];

  const emailPasswordEnabled = providers.emailPassword?.enabled !== false;

  const baseName = pageMeta.componentName.replace(/Page$/, "");
  const formCompName = baseName.endsWith("Form") ? baseName : `${baseName}Form`;

  const providerDisplayNames: Record<string, string> = {
    github: "GitHub",
    google: "Google",
    discord: "Discord",
    apple: "Apple",
    twitter: "Twitter",
    microsoft: "Microsoft",
  };

  const socialButtonsJsx = oauthList
    .map((oa: OAuthProviderConfig) => {
      const p = (oa.provider || "google").toLowerCase();
      const label = providerDisplayNames[p] || (p.charAt(0).toUpperCase() + p.slice(1));
      const svg = socialSvgIcons[p] || socialSvgIcons.fallback;
      return `            <Button
              variant="outline"
              type="button"
              disabled={loading}
              onClick={(e) => handleSocialSignIn(e, "${p}")}
              className="w-full flex items-center justify-center gap-2 h-10 border-border hover:bg-muted font-medium text-xs cursor-pointer"
            >
              ${svg}
              <span>Continue with ${label}</span>
            </Button>`;
    })
    .join("\n");

  const socialSection = oauthList.length > 0
    ? `<div className="space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center mb-3">
              Social Authentication
            </p>
            <div className="grid ${oauthList.length > 1 ? "grid-cols-2" : "grid-cols-1"} gap-2.5">
${socialButtonsJsx}
            </div>
          </div>`
    : "";

  const divider = (oauthList.length > 0 && emailPasswordEnabled)
    ? `<div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground font-medium">Or continue with email</span>
            </div>
          </div>`
    : "";

  const emailPasswordForm = emailPasswordEnabled
    ? `<form onSubmit={handleEmailAuth} className="space-y-4">
            {isSignUp && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isSignUp}
                  className="h-9 text-xs"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">Email Address</Label>
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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={(e) => e.preventDefault()}
                    className="text-[11px] text-primary hover:underline cursor-pointer bg-transparent border-0 p-0"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-9 text-xs font-mono"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-9 text-xs font-semibold mt-2 cursor-pointer"
            >
              {loading
                ? (isSignUp ? "Creating account..." : "Signing in...")
                : (isSignUp ? "Create Account" : "Sign In with Email")}
            </Button>
          </form>`
    : `<div className="text-xs text-muted-foreground text-center py-2">Email & password sign-in is disabled. Please use one of the social providers above.</div>`;

  const socialHandlerCode = oauthList.length > 0
    ? `\n  const handleSocialSignIn = async (e: React.MouseEvent, provider: string) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const targetRedirect = isSignUp ? effectiveSignUpRedirect : effectiveSignInRedirect;
    try {
      const res = await authClient.signIn.social({
        provider: provider as any,
        callbackURL: targetRedirect,
      });
      if (res?.error) {
        setError(res.error.message || \`Failed to sign in with \${provider}\`);
        setLoading(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : \`Failed to initiate social login with \${provider}\`;
      setError(errorMessage);
      setLoading(false);
    }
  };\n`
    : "";

  const socialBlock = oauthList.length > 0
    ? `\n            ${socialSection}\n\n            ${divider}\n`
    : "";

  return `"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@workspace/ui/components/card";

export function ${formCompName}() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams ? searchParams.get("redirect") : null;
  const effectiveSignInRedirect = redirectParam || "${signInRedirectUrl}";
  const effectiveSignUpRedirect = redirectParam || "${signUpRedirectUrl}";

  const [isSignUp, setIsSignUp] = useState<boolean>(${isRegister ? "true" : "false"});
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    async function checkExistingSession() {
      try {
        const res = await authClient.getSession();
        if (res?.data && res.data.user && res.data.user.id) {
          const targetRedirect = isSignUp ? effectiveSignUpRedirect : effectiveSignInRedirect;
          const cleanRedirect = targetRedirect === window.location.pathname ? "/" : targetRedirect;
          router.push(cleanRedirect);
        }
      } catch (_err) {
        // Stale or missing session token / DB record; stay on login or register page
      }
    }
    checkExistingSession();
  }, [isSignUp, effectiveSignInRedirect, effectiveSignUpRedirect, router]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (isSignUp) {
        const rawRedirect = effectiveSignUpRedirect;
        const targetRedirect = rawRedirect === window.location.pathname ? "/" : rawRedirect;
        const res = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email.split("@")[0] || "User",
        });
        if (res?.error) {
          setError(res.error.message || "Failed to create account");
        } else {
          setSuccessMsg("Account created successfully! Redirecting...");
          setTimeout(() => {
            if (targetRedirect.startsWith("/")) {
              router.push(targetRedirect);
              router.refresh();
            } else {
              window.location.href = targetRedirect;
            }
          }, 800);
        }
      } else {
        const rawRedirect = effectiveSignInRedirect;
        const targetRedirect = rawRedirect === window.location.pathname ? "/" : rawRedirect;
        const res = await authClient.signIn.email({
          email,
          password,
        });
        if (res?.error) {
          setError(res.error.message || "Invalid credentials");
        } else {
          setSuccessMsg("Signed in successfully! Redirecting...");
          setTimeout(() => {
            if (targetRedirect.startsWith("/")) {
              router.push(targetRedirect);
              router.refresh();
            } else {
              window.location.href = targetRedirect;
            }
          }, 800);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };${socialHandlerCode}
  return (
    <Card className="border-border shadow-lg backdrop-blur-sm bg-card/95">
      <CardHeader className="space-y-1 text-center pb-4">
        <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground">
          {isSignUp ? "Create an account" : "Welcome back"}
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          {isSignUp
            ? "Enter your details below to create your account"
            : "Sign in to access your protected dashboard"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2">
            <span>⚠️</span>
            <span className="flex-1">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium flex items-center gap-2">
            <span>✅</span>
            <span className="flex-1">{successMsg}</span>
          </div>
        )}${socialBlock}
        ${emailPasswordForm}
      </CardContent>

      <CardFooter className="flex justify-center border-t border-border pt-4 text-xs text-muted-foreground">
        {isSignUp ? (
          <p>
            Already have an account?{" "}
            <Link
              href="${signInPageUrl}"
              onClick={(e) => {
                e.preventDefault();
                setIsSignUp(false);
                setError(null);
                setSuccessMsg(null);
              }}
              className="text-primary font-semibold hover:underline cursor-pointer"
            >
              Sign In
            </Link>
          </p>
        ) : (
          <p>
            Don&apos;t have an account?{" "}
            <Link
              href="${signUpPageUrl}"
              onClick={(e) => {
                e.preventDefault();
                setIsSignUp(true);
                setError(null);
                setSuccessMsg(null);
              }}
              className="text-primary font-semibold hover:underline cursor-pointer"
            >
              Sign Up
            </Link>
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
`;
}

export function generateAuthPageCode(
  pageMeta: PageInfo,
  _authNodeData?: AuthCompilerNodeData,
): string {
  const baseName = pageMeta.componentName.replace(/Page$/, "");
  const formCompName = baseName.endsWith("Form") ? baseName : `${baseName}Form`;

  return `"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { Badge } from "@workspace/ui/components/badge";
import { Card } from "@workspace/ui/components/card";
import { ${formCompName} } from "./_components/${formCompName}";

export default function ${pageMeta.componentName}() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md space-y-6">
        
        {/* Top Brand / Nav Header */}
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium inline-flex items-center gap-1">
            &larr; Back
          </Link>
        </div>

        <Suspense fallback={
          <Card className="border-border shadow-lg backdrop-blur-sm bg-card/95 p-6 text-center text-xs text-muted-foreground">
            Loading authentication form...
          </Card>
        }>
          <${formCompName} />
        </Suspense>
      </div>
    </main>
  );
}
`;
}
