"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { authClient, useSession, signOut } from "@/lib/auth-client";
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
import { Separator } from "@workspace/ui/components/separator";
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserCheck,
  UserX,
  Loader2,
  ArrowRight,
  LogOut,
  Mail,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

interface AcceptInvitationPageProps {
  params: Promise<{ id: string }>;
}

export default function AcceptInvitationPage({
  params,
}: AcceptInvitationPageProps) {
  const { id } = use(params);
  const { data: session, isPending: isSessionLoading } = useSession();
  const [accepting, setAccepting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const invitation = useQuery(api.billing.getInvitationById, {
    invitationId: id,
  });

  const handleAccept = async () => {
    if (!invitation) return;
    setAccepting(true);
    try {
      const res = await authClient.organization.acceptInvitation({
        invitationId: id,
      });

      if (res?.error) {
        toast.error(res.error.message || "Failed to accept invitation");
        return;
      }

      await authClient.organization.setActive({
        organizationId: invitation.organizationId,
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("preferred_workspace", invitation.organizationId);
      }

      toast.success(`Welcome to ${invitation.organizationName}!`);
      // Hard redirect to bust Better Auth's $listOrg nano-store cache.
      // accept-invitation does NOT invalidate $listOrg, so a soft navigation
      // leaves a stale empty org list. A full reload resets all nano-store atoms.
      window.location.href = "/projects";
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to accept invitation";
      toast.error(msg);
    } finally {
      setAccepting(false);
    }
  };

  const handleSwitchAccount = async () => {
    setSigningOut(true);
    try {
      await signOut();
      const targetUrl = `/sign-in?redirect_url=${encodeURIComponent(`/accept-invitation/${id}`)}`;
      window.location.href = targetUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to sign out";
      toast.error(msg);
    } finally {
      setSigningOut(false);
    }
  };

  // Loading State
  if (invitation === undefined || isSessionLoading) {
    return (
      <div className="flex w-full items-center justify-center p-4 min-h-[400px]">
        <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-2xl text-center py-12">
          <CardContent className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">
              Retrieving invitation details...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not Found State
  if (invitation === null) {
    return (
      <div className="flex w-full items-center justify-center p-4 min-h-[400px]">
        <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-2xl text-center">
          <CardHeader className="pt-8 pb-4">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-bold">
              Invitation Not Found
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              This invitation link is invalid or has been revoked by the workspace administrator.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center pb-8">
            <Button asChild size="sm">
              <Link href="/projects">Go to Projects</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Expired or Canceled State
  if (
    invitation.isExpired ||
    invitation.status === "expired" ||
    invitation.status === "canceled"
  ) {
    return (
      <div className="flex w-full items-center justify-center p-4 min-h-[400px]">
        <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-2xl text-center">
          <CardHeader className="pt-8 pb-4">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Clock className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-bold">
              Invitation Expired
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              The invitation to join <strong>{invitation.organizationName}</strong> has expired. Please ask{" "}
              <strong>{invitation.inviterName}</strong> to send you a new invitation.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center pb-8">
            <Button asChild size="sm" variant="outline">
              <Link href="/projects">Return to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Already Accepted State
  if (invitation.status === "accepted") {
    return (
      <div className="flex w-full items-center justify-center p-4 min-h-[400px]">
        <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-2xl text-center">
          <CardHeader className="pt-8 pb-4">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-bold">
              Invitation Already Accepted
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">
              This invitation to join <strong>{invitation.organizationName}</strong> has already been accepted.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center pb-8">
            <Button asChild size="sm">
              <Link href="/projects">Open Workspace</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Active Pending Invitation
  const currentEmail = session?.user?.email?.toLowerCase() ?? "";
  const invitedEmail = invitation.email.toLowerCase();
  const isEmailMatch = Boolean(currentEmail && currentEmail === invitedEmail);
  const isEmailMismatch = Boolean(currentEmail && currentEmail !== invitedEmail);
  const isLoggedOut = !session?.user;

  return (
    <div className="flex w-full items-center justify-center p-4 min-h-[400px]">
      <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-2xl">
        <CardHeader className="text-center pb-4 pt-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
            <Building2 className="h-7 w-7" />
          </div>

          <div className="flex justify-center mb-1.5">
            <Badge variant="secondary" className="gap-1 px-2.5 py-0.5 text-xs font-normal">
              Team Invitation
            </Badge>
          </div>

          <CardTitle className="text-2xl font-bold tracking-tight">
            Join {invitation.organizationName}
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-1">
            <strong>{invitation.inviterName}</strong> has invited you to collaborate as a{" "}
            <span className="font-semibold text-foreground uppercase text-[11px] tracking-wide">
              {invitation.role}
            </span>.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {/* Workspace Benefits / Information Box */}
          <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Invited Email
              </span>
              <span className="font-medium text-foreground font-mono text-[11px]">
                {invitation.email}
              </span>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> Workspace Role
              </span>
              <Badge variant="outline" className="capitalize text-[11px] py-0">
                {invitation.role}
              </Badge>
            </div>
          </div>

          {/* Scenario 1: User is Logged Out */}
          {isLoggedOut && (
            <div className="space-y-3 pt-2">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground flex items-start gap-2.5">
                <UserCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="leading-tight text-[11px]">
                  Sign in or create an account with <strong>{invitation.email}</strong> to join this organization.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <Button asChild size="default" className="w-full text-xs font-medium">
                  <Link
                    href={`/sign-in?redirect_url=${encodeURIComponent(`/accept-invitation/${id}`)}`}
                  >
                    Sign In
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="default"
                  className="w-full text-xs font-medium"
                >
                  <Link
                    href={`/sign-up?redirect_url=${encodeURIComponent(`/accept-invitation/${id}`)}`}
                  >
                    Create Account
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Scenario 2: User is Logged In, but Email Does Not Match */}
          {isEmailMismatch && (
            <div className="space-y-3 pt-2">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <UserX className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-[12px]">Account mismatch</p>
                  <p className="text-[11px] leading-tight opacity-90">
                    You are signed in as <strong>{session?.user?.email}</strong>, but this invitation was sent to <strong>{invitation.email}</strong>.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSwitchAccount}
                disabled={signingOut}
                className="w-full gap-2 text-xs"
              >
                {signingOut ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Switching Account...
                  </>
                ) : (
                  <>
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out & Switch to {invitation.email}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Scenario 3: User is Logged In and Email Matches */}
          {isEmailMatch && (
            <div className="space-y-3 pt-2">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-[11px]">
                  Verified as <strong>{session?.user?.email}</strong>
                </span>
              </div>

              <Button
                type="button"
                size="lg"
                onClick={handleAccept}
                disabled={accepting}
                className="w-full font-semibold gap-2 shadow-md transition-all"
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Joining Workspace...
                  </>
                ) : (
                  <>
                    Accept & Join Organization
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t border-border pt-4 pb-4 text-xs text-muted-foreground">
          Dezign2App Collaborative Workspaces
        </CardFooter>
      </Card>
    </div>
  );
}
