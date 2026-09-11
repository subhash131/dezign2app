"use client";

import React, { useState, useEffect } from "react";
import {
  authClient,
  useActiveOrganization,
  useListOrganizations,
} from "@/lib/auth-client";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
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
  Building2,
  Check,
  ChevronsUpDown,
  PlusCircle,
  UserPlus,
  User,
  Loader2,
  CreditCard,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { OrgItem } from "./org/types";
import { CreateOrgDialog } from "./org/create-org-dialog";
import { InviteMemberDialog } from "./org/invite-member-dialog";
import { TeamManagementDialog } from "./org/team-management-dialog";
import { BuySeatsDialog } from "./org/buy-seats-dialog";

export function OrgSwitcher() {
  const { data: serverActiveOrg } = useActiveOrganization();
  const { data: serverOrganizations, isPending: isListPending, refetch: refetchOrgs } =
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

  // Re-fetch org list on workspace change events (e.g. after accepting an invite)
  useEffect(() => {
    const handleWorkspaceChanged = () => {
      void refetchOrgs();
    };
    window.addEventListener("auth:workspace-changed", handleWorkspaceChanged);
    return () => {
      window.removeEventListener("auth:workspace-changed", handleWorkspaceChanged);
    };
  }, [refetchOrgs]);

  const activeOrg: OrgItem | null =
    optimisticOrg !== null
      ? optimisticOrg.id === null
        ? null
        : { id: optimisticOrg.id, name: optimisticOrg.name }
      : serverActiveOrg
        ? { id: serverActiveOrg.id, name: serverActiveOrg.name }
        : null;

  const organizations: OrgItem[] = serverOrganizations
    ? serverOrganizations.map((org) => ({ id: org.id, name: org.name }))
    : [];

  const seatStatus = useQuery(
    api.billing.getOrgSeatStatus,
    activeOrg?.id ? { organizationId: activeOrg.id } : "skip",
  );

  // Dialog open states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [buySeatsDialogOpen, setBuySeatsDialogOpen] = useState(false);

  const handleSelectOrg = async (orgId: string | null) => {
    const currentId = activeOrg?.id ?? null;
    if (orgId === currentId) return;

    if (typeof window !== "undefined") {
      localStorage.setItem("preferred_workspace", orgId ?? "personal");
    }

    // Instant optimistic switch
    if (orgId === null) {
      setOptimisticOrg({ id: null, name: "Personal Workspace" });
    } else {
      const target = organizations.find((o) => o.id === orgId);
      setOptimisticOrg({ id: orgId, name: target?.name || "Organization" });
    }

    try {
      const res = await authClient.organization.setActive(
        orgId ? { organizationId: orgId } : { organizationId: null },
      );
      if (res?.error) {
        setOptimisticOrg(null);
        toast.error(res.error.message || "Failed to switch workspace");
        return;
      }
      toast.success(
        orgId ? "Switched organization" : "Switched to Personal Workspace",
      );
      // Always refresh org list after a workspace switch so the dropdown
      // reflects the current membership (accounts for stale $listOrg cache).
      void refetchOrgs();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("auth:workspace-changed", {
            detail: { organizationId: orgId },
          }),
        );
      }
    } catch (err) {
      setOptimisticOrg(null);
      const msg =
        err instanceof Error ? err.message : "Failed to switch workspace";
      toast.error(msg);
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
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
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
            <>
              <DropdownMenuItem
                onClick={() => setInviteDialogOpen(true)}
                className="cursor-pointer text-xs justify-between"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Invite Team Member</span>
                </div>
                {seatStatus && (
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                    {seatStatus.usedSeats}/{seatStatus.totalSeats}
                  </span>
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setTeamDialogOpen(true)}
                className="cursor-pointer text-xs justify-between"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Team & Invites</span>
                </div>
                {seatStatus && (
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                    {seatStatus.memberCount} active
                  </span>
                )}
              </DropdownMenuItem>

              {seatStatus?.isOwner && (
                <DropdownMenuItem
                  onClick={() => setBuySeatsDialogOpen(true)}
                  className="cursor-pointer text-xs justify-between"
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>Manage / Add Seats</span>
                  </div>
                </DropdownMenuItem>
              )}
            </>
          )}

          <DropdownMenuItem
            onClick={() => {
              if (organizations.length >= 1) {
                toast.info("Your plan includes 1 Organization workspace.");
                return;
              }
              setCreateDialogOpen(true);
            }}
            disabled={organizations.length >= 1}
            className="cursor-pointer text-xs justify-between"
          >
            <div className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>Create Organization</span>
            </div>
            {organizations.length >= 1 && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                1 Org Limit
              </span>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modular Dialog Components */}
      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        existingOrgsCount={organizations.length}
        onCreated={(newOrg) => {
          setOptimisticOrg(newOrg);
        }}
      />

      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        activeOrg={activeOrg}
        seatStatus={seatStatus}
        onOpenBuySeats={() => setBuySeatsDialogOpen(true)}
      />

      <TeamManagementDialog
        open={teamDialogOpen}
        onOpenChange={setTeamDialogOpen}
        activeOrg={activeOrg}
        seatStatus={seatStatus}
        onOpenInvite={() => setInviteDialogOpen(true)}
        onOpenBuySeats={() => setBuySeatsDialogOpen(true)}
      />

      <BuySeatsDialog
        open={buySeatsDialogOpen}
        onOpenChange={setBuySeatsDialogOpen}
        activeOrg={activeOrg}
        seatStatus={seatStatus}
      />
    </>
  );
}
