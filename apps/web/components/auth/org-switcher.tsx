"use client";

import React, { useState, useEffect } from "react";
import {
  useActiveOrganization,
  useListOrganizations,
  organization as orgActions,
} from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
  Building2,
  Check,
  ChevronsUpDown,
  PlusCircle,
  UserPlus,
  User,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface OrgItem {
  id: string;
  name: string;
  slug?: string;
}

export function OrgSwitcher() {
  const { data: serverActiveOrg, isPending: isActivePending } =
    useActiveOrganization();
  const { data: serverOrganizations, isPending: isListPending } =
    useListOrganizations();

  // Optimistic tracking for instant local updates
  const [optimisticOrg, setOptimisticOrg] = useState<{
    id: string | null;
    name: string;
  } | null>(null);

  // Sync optimistic state when server state catches up
  useEffect(() => {
    if (serverActiveOrg) {
      if (optimisticOrg && optimisticOrg.id === serverActiveOrg.id) {
        setOptimisticOrg(null);
      }
    } else if (optimisticOrg && optimisticOrg.id === null) {
      setOptimisticOrg(null);
    }
  }, [serverActiveOrg, optimisticOrg]);

  const activeOrg: OrgItem | null =
    optimisticOrg !== null
      ? optimisticOrg.id === null
        ? null
        : { id: optimisticOrg.id, name: optimisticOrg.name }
      : (serverActiveOrg as OrgItem | null);

  const organizations: OrgItem[] = (serverOrganizations as OrgItem[]) || [];

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [submitting, setSubmitting] = useState(false);

  const handleSelectOrg = async (orgId: string | null) => {
    const currentId = activeOrg?.id ?? null;
    if (orgId === currentId) return;

    // Instant optimistic switch
    if (orgId === null) {
      setOptimisticOrg({ id: null, name: "Personal Workspace" });
    } else {
      const target = organizations.find((o) => o.id === orgId);
      setOptimisticOrg({ id: orgId, name: target?.name || "Organization" });
    }

    try {
      const res = await orgActions.setActive({
        organizationId: (orgId ?? null) as string,
      });
      if (res?.error) {
        setOptimisticOrg(null);
        toast.error(res.error.message || "Failed to switch workspace");
        return;
      }
      toast.success(
        orgId ? "Switched organization" : "Switched to Personal Workspace",
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("auth:workspace-changed", {
            detail: { organizationId: orgId },
          }),
        );
      }
    } catch (err: unknown) {
      setOptimisticOrg(null);
      const msg =
        err instanceof Error ? err.message : "Failed to switch workspace";
      toast.error(msg);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setSubmitting(true);
    try {
      const baseSlug = orgName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const slug = `${baseSlug || "org"}-${Date.now().toString(36)}`;

      const created = await orgActions.create({
        name: orgName.trim(),
        slug,
      });

      if (created?.error) {
        toast.error(created.error.message || "Failed to create organization");
        return;
      }

      if (created?.data?.id) {
        // Optimistically activate immediately
        setOptimisticOrg({ id: created.data.id, name: orgName.trim() });
        toast.success(`Organization "${orgName}" created!`);
        setOrgName("");
        setCreateDialogOpen(false);

        await orgActions.setActive({ organizationId: created.data.id });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("auth:workspace-changed", {
              detail: { organizationId: created.data.id },
            }),
          );
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create organization";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !activeOrg?.id) return;

    setSubmitting(true);
    try {
      const res = await orgActions.inviteMember({
        email: inviteEmail.trim(),
        role: inviteRole,
        organizationId: activeOrg.id,
      });

      if (res?.error) {
        toast.error(res.error.message || "Failed to send invitation");
        return;
      }

      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteDialogOpen(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to send invitation";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const currentOrgName = activeOrg?.name || "Personal Workspace";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-sidebar-accent/50 p-2 text-left text-sm transition-colors hover:bg-sidebar-accent focus:outline-none focus:ring-1 focus:ring-primary group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-none">
            <div className="flex items-center gap-2 truncate group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20 font-semibold text-xs uppercase">
                {activeOrg ? (
                  currentOrgName.charAt(0)
                ) : (
                  <User className="h-3.5 w-3.5 text-primary" />
                )}
              </div>
              <div className="flex flex-col truncate group-data-[collapsible=icon]:hidden">
                <span className="truncate text-xs font-semibold text-foreground">
                  {currentOrgName}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {activeOrg ? "Organization" : "Personal"}
                </span>
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-60" align="start" sideOffset={6}>
          <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Personal
          </DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => handleSelectOrg(null)}
              className="flex items-center justify-between cursor-pointer text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate font-medium">Personal Workspace</span>
              </div>
              {!activeOrg && (
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Organizations
          </DropdownMenuLabel>

          <DropdownMenuGroup>
            {isListPending ? (
              <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Loading teams...
              </div>
            ) : organizations && organizations.length > 0 ? (
              organizations.map((org) => {
                const isSelected = activeOrg?.id === org.id;
                return (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => handleSelectOrg(org.id)}
                    className="flex items-center justify-between cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate font-medium">{org.name}</span>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No organizations yet
              </div>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {activeOrg && (
            <DropdownMenuItem
              onClick={() => setInviteDialogOpen(true)}
              className="cursor-pointer text-xs gap-2"
            >
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              Invite Team Member
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => setCreateDialogOpen(true)}
            className="cursor-pointer text-xs gap-2"
          >
            <PlusCircle className="h-4 w-4 text-muted-foreground" />
            Create Organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog: Create Organization */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateOrg}>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Create Organization
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Create a shared workspace to collaborate with your team on system architectures, APIs, and workflows.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="org-name" className="text-xs font-medium">
                  Organization Name
                </Label>
                <Input
                  id="org-name"
                  placeholder="Acme Corp"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="h-9 text-xs"
                  autoFocus
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCreateDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!orgName.trim() || submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Creating...
                  </>
                ) : (
                  "Create Organization"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Invite Member */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleInviteMember}>
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Invite to {activeOrg?.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Send an invitation to a colleague to join this organization.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
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
                  onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
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
                onClick={() => setInviteDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!inviteEmail.trim() || submitting}
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
        </DialogContent>
      </Dialog>
    </>
  );
}
