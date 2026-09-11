"use client";

import React, { useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Users,
  Plus,
  Loader2,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { OrgItem, OrgSeatStatus } from "./types";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeOrg: OrgItem | null;
  seatStatus: OrgSeatStatus | null | undefined;
  onOpenBuySeats: () => void;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  activeOrg,
  seatStatus,
  onOpenBuySeats,
}: InviteMemberDialogProps) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviteStep, setInviteStep] = useState<"form" | "created">("form");
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const resetState = () => {
    setInviteStep("form");
    setInviteEmail("");
    setGeneratedInviteLink(null);
    setCopiedLink(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeOrg?.id) return;

    if (seatStatus && !seatStatus.canInvite) {
      toast.error(
        `All ${seatStatus.totalSeats} seats are in use. Please add more seats to invite teammates.`,
      );
      handleOpenChange(false);
      onOpenBuySeats();
      return;
    }

    setSubmitting(true);
    try {
      const res = await authClient.organization.inviteMember({
        email: inviteEmail.trim(),
        role: inviteRole,
        organizationId: activeOrg.id,
      });

      if (res?.error) {
        toast.error(res.error.message || "Failed to send invitation");
        return;
      }

      const inviteId =
        typeof res?.data?.id === "string" ? res.data.id : null;

      if (inviteId && typeof window !== "undefined") {
        const publicBase =
          process.env.NEXT_PUBLIC_APP_URL &&
          !process.env.NEXT_PUBLIC_APP_URL.includes("127.0.0.1") &&
          !process.env.NEXT_PUBLIC_APP_URL.includes("localhost")
            ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")
            : window.location.origin;
        const link = `${publicBase}/accept-invitation/${inviteId}`;
        setGeneratedInviteLink(link);
        setInviteStep("created");
        toast.success("Invitation dispatched & share link ready!");
      } else {
        toast.success(`Invitation sent to ${inviteEmail}`);
        resetState();
        onOpenChange(false);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to send invitation";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      toast.success("Invitation link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {inviteStep === "form" ? (
          <form onSubmit={handleInvite}>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Invite to {activeOrg?.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Send an email invitation and instantly generate a direct share link.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Seat Quota Status */}
              {seatStatus && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                    !seatStatus.canInvite
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Users className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-center font-medium">
                      <span>Workspace Seat Allocation</span>
                      <span className="font-semibold text-foreground">
                        {seatStatus.usedSeats} / {seatStatus.totalSeats} seats used
                      </span>
                    </div>
                    {!seatStatus.canInvite ? (
                      <div className="space-y-2 pt-1">
                        <p className="text-[11px] leading-tight">
                          All seats are in use. Purchase additional seats to invite more teammates.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            handleOpenChange(false);
                            onOpenBuySeats();
                          }}
                          className="h-7 text-xs gap-1.5 border-amber-500/40 hover:bg-amber-500/20"
                        >
                          <Plus className="h-3 w-3" /> Add More Seats ($20/seat)
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {seatStatus.availableSeats}{" "}
                        {seatStatus.availableSeats === 1 ? "seat" : "seats"}{" "}
                        available for new teammates.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="invite-email" className="text-xs font-medium">
                  Email Address
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="h-9 text-xs"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-role" className="text-xs font-medium">
                  Role
                </Label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "member" || val === "admin") {
                      setInviteRole(val);
                    }
                  }}
                  className="w-full h-9 rounded-md border border-border bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="member">Member (Can edit and view projects)</option>
                  <option value="admin">Admin (Can manage team & billing)</option>
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  !inviteEmail.trim() ||
                  submitting ||
                  (seatStatus ? !seatStatus.canInvite : false)
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Sending Invite...
                  </>
                ) : (
                  "Send Invitation"
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <DialogTitle className="text-lg font-semibold text-center">
                Invitation Dispatched!
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground text-center">
                An email invitation has been dispatched to{" "}
                <strong>{inviteEmail}</strong>. You can also share the direct link below via Slack or chat:
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Shareable Invitation Link
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={generatedInviteLink || ""}
                  className="h-9 text-xs font-mono bg-muted/40 text-muted-foreground select-all"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (generatedInviteLink) {
                      handleCopyLink(generatedInviteLink);
                    }
                  }}
                  className="shrink-0 gap-1.5 h-9 text-xs"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                The recipient must sign in or create an account with{" "}
                <strong>{inviteEmail}</strong> to accept.
              </p>
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetState}
                className="text-xs"
              >
                Invite Another
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleOpenChange(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
