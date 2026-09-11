"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Users,
  CreditCard,
  UserPlus,
  Loader2,
  Mail,
  Clock,
  Copy,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { OrgItem, OrgSeatStatus } from "./types";

interface TeamManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeOrg: OrgItem | null;
  seatStatus: OrgSeatStatus | null | undefined;
  onOpenInvite: () => void;
  onOpenBuySeats: () => void;
}

export function TeamManagementDialog({
  open,
  onOpenChange,
  activeOrg,
  seatStatus,
  onOpenInvite,
  onOpenBuySeats,
}: TeamManagementDialogProps) {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const orgMembers = useQuery(
    api.billing.getOrgMembers,
    activeOrg?.id ? { organizationId: activeOrg.id } : "skip",
  );
  const orgInvitations = useQuery(
    api.billing.getOrgInvitations,
    activeOrg?.id ? { organizationId: activeOrg.id } : "skip",
  );
  const revokeInvitation = useMutation(api.billing.revokeInvitation);

  const handleCopyLink = async (link: string, invId: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLinkId(invId);
      toast.success("Invitation link copied to clipboard!");
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleRevoke = async (invitationId: string) => {
    if (!activeOrg?.id) return;
    setRevokingId(invitationId);
    try {
      await revokeInvitation({
        invitationId,
        organizationId: activeOrg.id,
      });
      toast.success("Invitation revoked and seat recovered!");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to revoke invitation";
      toast.error(msg);
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {activeOrg?.name} Team & Seats
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Manage workspace teammates, view pending invitations, and allocate seats.
          </DialogDescription>
        </DialogHeader>

        {/* Seat Status Summary */}
        {seatStatus && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <div className="font-semibold text-foreground">
                {seatStatus.usedSeats} of {seatStatus.totalSeats} seats allocated
              </div>
              <div className="text-[11px] text-muted-foreground">
                {seatStatus.memberCount} active{" "}
                {seatStatus.memberCount === 1 ? "member" : "members"} ·{" "}
                {seatStatus.pendingInviteCount} pending{" "}
                {seatStatus.pendingInviteCount === 1 ? "invite" : "invites"}
              </div>
            </div>

            {seatStatus.isOwner && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onOpenBuySeats();
                }}
                className="h-7 text-xs gap-1.5"
              >
                <CreditCard className="h-3 w-3" />
                Add Seats
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-6 py-2 pr-1">
          {/* Active Members Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Active Members ({orgMembers?.length ?? 0})
              </h4>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border">
              {orgMembers === undefined ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                  Loading team members...
                </div>
              ) : orgMembers.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No active members found.
                </div>
              ) : (
                orgMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-semibold shrink-0 text-xs uppercase">
                        {member.name ? member.name.charAt(0) : "U"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-medium text-foreground truncate">
                            {member.name}
                          </span>
                          {member.isCurrentUser && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1 py-0 font-normal"
                            >
                              You
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate font-mono">
                          {member.email || "No email"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {member.role}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending Invitations Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Pending Invitations ({orgInvitations?.length ?? 0})
              </h4>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border">
              {orgInvitations === undefined ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                  Loading invitations...
                </div>
              ) : orgInvitations.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No pending invitations. All invited teammates have joined!
                </div>
              ) : (
                orgInvitations.map((inv) => {
                  const inviteLink =
                    typeof window !== "undefined"
                      ? `${window.location.origin}/accept-invitation/${inv.id}`
                      : "";
                  const isCopied = copiedLinkId === inv.id;

                  return (
                    <div
                      key={inv.id}
                      className="p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center shrink-0">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate font-mono text-[11px]">
                            {inv.email}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {inv.isExpired
                              ? "Expired"
                              : `Expires in ${Math.max(
                                  1,
                                  Math.ceil(
                                    (inv.expiresAt - Date.now()) /
                                      (1000 * 60 * 60 * 24),
                                  ),
                                )} days`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {inv.role}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Copy Invitation Link"
                          onClick={() => handleCopyLink(inviteLink, inv.id)}
                        >
                          {isCopied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        {(seatStatus?.isOwner || seatStatus?.status === "active") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Revoke Invitation & Recover Seat"
                            disabled={revokingId === inv.id}
                            onClick={() => handleRevoke(inv.id)}
                          >
                            {revokingId === inv.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between items-center sm:justify-between pt-2 border-t border-border">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onOpenInvite();
            }}
            disabled={seatStatus ? !seatStatus.canInvite : false}
            className="gap-1.5 text-xs"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Invite Teammate
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
