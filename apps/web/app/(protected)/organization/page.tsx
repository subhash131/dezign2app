"use client";

import React, { useState, useEffect } from "react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Building2, Users, CreditCard, ShieldAlert, Clock, XCircle, Loader2 } from "lucide-react";
import { useMutation } from "convex/react";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";

import { GeneralTab } from "./_components/general-tab";
import { MembersTab } from "./_components/members-tab";
import { BillingTab } from "./_components/billing-tab";
import { DangerTab } from "./_components/danger-tab";

const TABS = [
  { id: "general", label: "General", icon: Building2 },
  { id: "members", label: "Members", icon: Users },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "danger", label: "Danger Zone", icon: ShieldAlert },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function OrganizationPage() {
  const { data: activeOrg, isPending } = useActiveOrganization();
  const [activeTab, setActiveTab] = useState<TabId>("general");

  const seatStatus = useQuery(
    api.billing.getOrgSeatStatus,
    activeOrg?.id ? { organizationId: activeOrg.id } : "skip",
  );

  const isOwner = seatStatus?.isOwner ?? false;
  const visibleTabs = isOwner
    ? TABS
    : TABS.filter((tab) => tab.id === "general");

  useEffect(() => {
    if (!isOwner && activeTab !== "general") {
      setActiveTab("general");
    }
  }, [isOwner, activeTab]);

  const deletionStatus = useQuery(
    api.billing.getOrgDeletionStatus,
    activeOrg?.id ? { organizationId: activeOrg.id } : "skip",
  );

  const cancelOrgDeletion = useMutation(api.billing.cancelOrgDeletion);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelDeletion = async () => {
    if (!activeOrg?.id) return;
    setCancelling(true);
    try {
      await cancelOrgDeletion({ organizationId: activeOrg.id });
      toast.success("Deletion cancelled — your organization is safe");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel deletion");
    } finally {
      setCancelling(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeOrg) {
    return (
      <div className="container max-w-4xl py-16 px-4 text-center space-y-3">
        <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
        <h2 className="text-lg font-semibold text-foreground">No Organization Selected</h2>
        <p className="text-sm text-muted-foreground">
          Select or create an organization from the sidebar to manage its settings.
        </p>
      </div>
    );
  }

  const orgItem = { id: activeOrg.id, name: activeOrg.name, slug: activeOrg.slug };

  return (
    <div className="container max-w-4xl py-8 px-4 space-y-6 animate-in fade-in duration-300">
      {/* Page header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Building2 className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">{activeOrg.name}</h1>
            <p className="text-xs text-muted-foreground">Organization Settings</p>
          </div>
        </div>
      </div>

      {/* Global deletion countdown banner */}
      {isOwner && deletionStatus && activeTab !== "danger" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-center gap-3">
          <Clock className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive flex-1">
            <span className="font-semibold">
              Deletion scheduled — {deletionStatus.daysRemaining} day{deletionStatus.daysRemaining !== 1 ? "s" : ""} remaining.
            </span>{" "}
            Cancel in the{" "}
            <button
              className="underline underline-offset-2 hover:opacity-80"
              onClick={() => setActiveTab("danger")}
            >
              Danger Zone
            </button>{" "}
            tab before{" "}
            {new Date(deletionStatus.deleteAfter).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            .
          </p>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 h-7 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10 gap-1"
            onClick={handleCancelDeletion}
            disabled={cancelling}
          >
            {cancelling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            Cancel
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDanger = tab.id === "danger";
            return (
              <button
                key={tab.id}
                id={`org-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors",
                  isActive
                    ? isDanger
                      ? "border-destructive text-destructive"
                      : "border-primary text-foreground"
                    : isDanger
                      ? "border-transparent text-muted-foreground hover:text-destructive hover:border-destructive/30"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.id === "danger" && deletionStatus && (
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive ml-0.5" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "general" && (
          <GeneralTab
            orgId={activeOrg.id}
            orgName={activeOrg.name}
            orgSlug={activeOrg.slug}
            seatStatus={seatStatus}
            createdAt={activeOrg.createdAt ?? null}
          />
        )}
        {isOwner && activeTab === "members" && (
          <MembersTab activeOrg={orgItem} seatStatus={seatStatus} />
        )}
        {isOwner && activeTab === "billing" && (
          <BillingTab activeOrg={orgItem} seatStatus={seatStatus} />
        )}
        {isOwner && activeTab === "danger" && (
          <DangerTab activeOrg={orgItem} seatStatus={seatStatus} />
        )}
      </div>
    </div>
  );
}
