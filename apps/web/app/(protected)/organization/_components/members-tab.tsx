"use client";

import React, { useRef, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  UserPlus,
  CreditCard,
  Loader2,
  Mail,
  Clock,
  Copy,
  Trash2,
  Check,
  UserX,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import type { OrgItem, OrgSeatStatus } from "@/components/auth/org/types";
import { InviteMemberDialog } from "@/components/auth/org/invite-member-dialog";
import { BuySeatsDialog } from "@/components/auth/org/buy-seats-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Label } from "@workspace/ui/components/label";

interface MembersTabProps {
  activeOrg: OrgItem;
  seatStatus: OrgSeatStatus | null | undefined;
}

const PAGE_SIZE = 20;

export function MembersTab({ activeOrg, seatStatus }: MembersTabProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [buySeatsOpen, setBuySeatsOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // --- Confirmation & Role edit modals ---
  const [memberToRemove, setMemberToRemove] = useState<{
    id: string;
    name: string;
    email?: string;
  } | null>(null);

  const [roleModalMember, setRoleModalMember] = useState<{
    id: string;
    name: string;
    email?: string;
    currentRole: string;
  } | null>(null);
  const [selectedRole, setSelectedRole] = useState<"member" | "admin" | "owner">("member");
  const [updatingRole, setUpdatingRole] = useState(false);

  // --- Pagination state ---
  const [memberCursor, setMemberCursor] = useState<string | null>(null);
  const [allMembers, setAllMembers] = useState<NonNullable<typeof membersPage>["page"]>([]);
  const [membersDone, setMembersDone] = useState(false);
  const [membersLoadingMore, setMembersLoadingMore] = useState(false);

  const [inviteCursor, setInviteCursor] = useState<string | null>(null);
  const [allInvitations, setAllInvitations] = useState<NonNullable<typeof invitationsPage>["page"]>([]);
  const [invitesDone, setInvitesDone] = useState(false);
  const [invitesLoadingMore, setInvitesLoadingMore] = useState(false);

  const membersSentinelRef = useRef<HTMLDivElement>(null);
  const invitesSentinelRef = useRef<HTMLDivElement>(null);

  const revokeInvitation = useMutation(api.billing.revokeInvitation);
  const removeMember = useMutation(api.billing.removeMember);
  const updateMemberRole = useMutation(api.billing.updateMemberRole);

  // --- Query: members ---
  const membersPage = useQuery(
    api.billing.getOrgMembersPaginated,
    activeOrg.id
      ? { organizationId: activeOrg.id, paginationOpts: { numItems: PAGE_SIZE, cursor: memberCursor } }
      : "skip",
  );

  // --- Query: invitations ---
  const invitationsPage = useQuery(
    api.billing.getOrgInvitationsPaginated,
    activeOrg.id
      ? { organizationId: activeOrg.id, paginationOpts: { numItems: PAGE_SIZE, cursor: inviteCursor } }
      : "skip",
  );

  // Accumulate member pages
  useEffect(() => {
    if (!membersPage) return;
    setAllMembers((prev) => (memberCursor === null ? membersPage.page : [...prev, ...membersPage.page]));
    setMembersDone(membersPage.isDone);
    setMembersLoadingMore(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersPage]);

  // Accumulate invitation pages
  useEffect(() => {
    if (!invitationsPage) return;
    setAllInvitations((prev) => (inviteCursor === null ? invitationsPage.page : [...prev, ...invitationsPage.page]));
    setInvitesDone(invitationsPage.isDone);
    setInvitesLoadingMore(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitationsPage]);

  // IntersectionObserver — members
  useEffect(() => {
    if (membersDone || membersLoadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && membersPage && !membersPage.isDone) {
          setMembersLoadingMore(true);
          setMemberCursor(membersPage.continueCursor || null);
        }
      },
      { threshold: 0.5 },
    );
    if (membersSentinelRef.current) observer.observe(membersSentinelRef.current);
    return () => observer.disconnect();
  }, [membersDone, membersLoadingMore, membersPage]);

  // IntersectionObserver — invitations
  useEffect(() => {
    if (invitesDone || invitesLoadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && invitationsPage && !invitationsPage.isDone) {
          setInvitesLoadingMore(true);
          setInviteCursor(invitationsPage.continueCursor || null);
        }
      },
      { threshold: 0.5 },
    );
    if (invitesSentinelRef.current) observer.observe(invitesSentinelRef.current);
    return () => observer.disconnect();
  }, [invitesDone, invitesLoadingMore, invitationsPage]);

  const handleCopyLink = async (invId: string) => {
    const link = `${window.location.origin}/accept-invitation/${invId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLinkId(invId);
      toast.success("Invitation link copied!");
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setRevokingId(invitationId);
    try {
      await revokeInvitation({ invitationId, organizationId: activeOrg.id });
      toast.success("Invitation revoked — seat recovered");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    setRemovingId(memberId);
    try {
      await removeMember({ memberId, organizationId: activeOrg.id });
      toast.success(`${memberName} removed from the organization`);
      setMemberToRemove(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  };

  const handleUpdateRole = async () => {
    if (!roleModalMember) return;
    if (selectedRole === roleModalMember.currentRole) {
      setRoleModalMember(null);
      return;
    }
    setUpdatingRole(true);
    try {
      await updateMemberRole({
        memberId: roleModalMember.id,
        organizationId: activeOrg.id,
        role: selectedRole,
      });
      toast.success(`Role updated to ${selectedRole} for ${roleModalMember.name}`);
      setRoleModalMember(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update role";
      toast.error(msg);
    } finally {
      setUpdatingRole(false);
    }
  };

  const membersLoading = membersPage === undefined;
  const invitesLoading = invitationsPage === undefined;

  const seatUsePct = seatStatus
    ? Math.min(100, Math.round((seatStatus.usedSeats / seatStatus.totalSeats) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Seat Status Bar */}
      {seatStatus && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {seatStatus.usedSeats} / {seatStatus.totalSeats} seats used
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {seatStatus.memberCount} active · {seatStatus.pendingInviteCount} pending ·{" "}
                {seatStatus.availableSeats} available
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setInviteOpen(true)}
                disabled={!seatStatus.canInvite}
                className="h-8 text-xs gap-1.5"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Invite
              </Button>
              {seatStatus.isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBuySeatsOpen(true)}
                  className="h-8 text-xs gap-1.5"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Add Seats
                </Button>
              )}
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${seatUsePct}%`,
                background:
                  seatUsePct >= 90
                    ? "hsl(var(--destructive))"
                    : seatUsePct >= 70
                      ? "hsl(38 92% 50%)"
                      : "hsl(var(--primary))",
              }}
            />
          </div>
        </div>
      )}

      {/* Members Table */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Active Members ({allMembers.length}{!membersDone ? "+" : ""})
        </h4>
        <div className="rounded-xl border border-border overflow-hidden">
          {membersLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 flex items-center gap-3 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 rounded bg-muted" />
                    <div className="h-2.5 w-48 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : allMembers.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">No active members found.</div>
          ) : (
            <div className="divide-y divide-border">
              {allMembers.map((member) => (
                <div
                  key={member.id}
                  className="p-3 flex items-center justify-between gap-3 text-xs group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-semibold shrink-0 text-xs uppercase">
                      {member.name ? member.name.charAt(0) : "U"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground truncate">{member.name}</span>
                        {member.isCurrentUser && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
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
                    <Badge variant="outline" className="capitalize text-[10px]">{member.role}</Badge>
                    {seatStatus?.isOwner && !member.isCurrentUser && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
                          title="Change member role"
                          onClick={() => {
                            const r: "member" | "admin" | "owner" =
                              member.role === "admin"
                                ? "admin"
                                : member.role === "owner"
                                  ? "owner"
                                  : "member";
                            setSelectedRole(r);
                            setRoleModalMember({
                              id: member.id,
                              name: member.name,
                              email: member.email,
                              currentRole: member.role,
                            });
                          }}
                        >
                          <Shield className="h-3 w-3" />
                          <span>Change Role</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Remove member"
                          disabled={removingId === member.id}
                          onClick={() =>
                            setMemberToRemove({
                              id: member.id,
                              name: member.name,
                              email: member.email,
                            })
                          }
                        >
                          {removingId === member.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserX className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!membersDone && (
                <div ref={membersSentinelRef} className="flex justify-center py-3 min-h-[40px]">
                  {membersLoadingMore && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pending Invitations Table */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Pending Invitations ({allInvitations.length}{!invitesDone ? "+" : ""})
        </h4>
        <div className="rounded-xl border border-border overflow-hidden">
          {invitesLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="p-3 flex items-center gap-3 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 rounded bg-muted" />
                    <div className="h-2.5 w-24 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : allInvitations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No pending invitations.</div>
          ) : (
            <div className="divide-y divide-border">
              {allInvitations.map((inv) => {
                const daysLeft = Math.max(
                  1,
                  Math.ceil((inv.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)),
                );
                const isCopied = copiedLinkId === inv.id;
                return (
                  <div key={inv.id} className="p-3 flex items-center justify-between gap-3 text-xs">
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
                          {inv.isExpired ? "Expired" : `Expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="capitalize text-[10px]">{inv.role}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Copy invitation link"
                        onClick={() => handleCopyLink(inv.id)}
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {seatStatus?.isOwner && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Revoke invitation"
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
              })}
              {!invitesDone && (
                <div ref={invitesSentinelRef} className="flex justify-center py-3 min-h-[40px]">
                  {invitesLoadingMore && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        activeOrg={activeOrg}
        seatStatus={seatStatus ?? null}
        onOpenBuySeats={() => { setInviteOpen(false); setBuySeatsOpen(true); }}
      />
      <BuySeatsDialog
        open={buySeatsOpen}
        onOpenChange={setBuySeatsOpen}
        activeOrg={activeOrg}
        seatStatus={seatStatus ?? null}
      />

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open && removingId === null) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground space-y-1">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {memberToRemove?.name || memberToRemove?.email || "this member"}
              </span>{" "}
              from <span className="font-semibold text-foreground">{activeOrg.name}</span>?
              <br />
              They will immediately lose access to all projects in this workspace. This will free up 1 seat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingId !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
              disabled={removingId !== null}
              onClick={async (e) => {
                e.preventDefault();
                if (!memberToRemove) return;
                await handleRemoveMember(memberToRemove.id, memberToRemove.name);
              }}
            >
              {removingId !== null ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Member"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Role Dialog */}
      <Dialog
        open={roleModalMember !== null}
        onOpenChange={(open) => {
          if (!open && !updatingRole) setRoleModalMember(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Change Member Role
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update workspace permissions for{" "}
              <span className="font-medium text-foreground">
                {roleModalMember?.name || roleModalMember?.email}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Select Role</Label>
              <div className="grid gap-2">
                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedRole === "member"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="member-role"
                    value="member"
                    checked={selectedRole === "member"}
                    onChange={() => setSelectedRole("member")}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">Member</p>
                    <p className="text-[11px] text-muted-foreground">
                      Can view, create, and edit projects. Cannot invite members or manage billing.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedRole === "admin"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="member-role"
                    value="admin"
                    checked={selectedRole === "admin"}
                    onChange={() => setSelectedRole("admin")}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">Admin</p>
                    <p className="text-[11px] text-muted-foreground">
                      Can invite new teammates, remove members, and manage workspace settings.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRoleModalMember(null)}
              disabled={updatingRole}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUpdateRole}
              disabled={updatingRole || selectedRole === roleModalMember?.currentRole}
              className="gap-1.5"
            >
              {updatingRole ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
