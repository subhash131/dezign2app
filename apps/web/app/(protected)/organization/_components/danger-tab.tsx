"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  AlertTriangle,
  Loader2,
  LogOut,
  Trash2,
  XCircle,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { OrgItem, OrgSeatStatus } from "@/components/auth/org/types";

interface DangerTabProps {
  activeOrg: OrgItem;
  seatStatus: OrgSeatStatus | null | undefined;
}

export function DangerTab({ activeOrg, seatStatus }: DangerTabProps) {
  const router = useRouter();
  const isOwner = seatStatus?.isOwner ?? false;

  // Leave org
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Schedule deletion
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // Cancel deletion
  const [cancelling, setCancelling] = useState(false);

  const deletionStatus = useQuery(
    api.billing.getOrgDeletionStatus,
    activeOrg?.id ? { organizationId: activeOrg.id } : "skip",
  );

  const scheduleOrgDeletion = useMutation(api.billing.scheduleOrgDeletion);
  const cancelOrgDeletion = useMutation(api.billing.cancelOrgDeletion);

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await authClient.organization.leave({ organizationId: activeOrg.id });
      toast.success("You have left the organization");
      router.push("/projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave organization");
    } finally {
      setLeaving(false);
      setLeaveOpen(false);
    }
  };

  const handleScheduleDeletion = async () => {
    if (deleteConfirm !== activeOrg.name) return;
    setScheduling(true);
    try {
      await scheduleOrgDeletion({ organizationId: activeOrg.id });
      toast.success(
        `Deletion scheduled. You have 75 days to cancel before "${activeOrg.name}" is permanently deleted.`,
      );
      setDeleteOpen(false);
      setDeleteConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to schedule deletion");
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelDeletion = async () => {
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

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Pending deletion banner */}
      {deletionStatus && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-destructive">
              Deletion scheduled — {deletionStatus.daysRemaining} day{deletionStatus.daysRemaining !== 1 ? "s" : ""} remaining
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This organization and all its data will be permanently deleted on{" "}
              <span className="font-medium text-foreground">
                {new Date(deletionStatus.deleteAfter).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
              . Cancel below to stop the process.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
            onClick={handleCancelDeletion}
            disabled={cancelling}
          >
            {cancelling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            Cancel Deletion
          </Button>
        </div>
      )}

      {/* Leave Organization */}
      {!isOwner && (
        <div className="rounded-xl border border-border bg-card p-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <LogOut className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">Leave Organization</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Remove yourself from <span className="font-medium">{activeOrg.name}</span>. You will
              lose access to all projects and resources in this workspace.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 gap-1.5 text-xs"
            onClick={() => setLeaveOpen(true)}
          >
            <LogOut className="h-3.5 w-3.5" />
            Leave
          </Button>
        </div>
      )}

      {/* Delete Organization (owner only) */}
      {isOwner && !deletionStatus && (
        <div className="rounded-xl border border-destructive/30 bg-card p-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <h3 className="text-sm font-semibold text-foreground">Delete Organization</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Schedule <span className="font-medium">{activeOrg.name}</span> for deletion. You
              have a <span className="font-semibold text-foreground">75-day grace period</span> to
              cancel before all data is permanently destroyed.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5 text-xs"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Schedule Deletion
          </Button>
        </div>
      )}

      {/* Leave confirmation dialog */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
              Leave Organization
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to leave <strong>{activeOrg.name}</strong>? You will lose
              access to all projects and workflows in this workspace immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLeaveOpen(false)} disabled={leaving}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLeave}
              disabled={leaving}
              className="gap-1.5"
            >
              {leaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              Leave Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule deletion confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Schedule Organization Deletion
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                This will begin a <strong>75-day grace period</strong> before permanently deleting{" "}
                <strong>{activeOrg.name}</strong> and all associated data — projects, workflows,
                API keys, and billing records.
              </span>
              <span className="block text-amber-600 font-medium">
                You can cancel at any time during the grace period.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <p className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{activeOrg.name}</span>{" "}
              to confirm:
            </p>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={activeOrg.name}
              className="h-9 text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); }}
              disabled={scheduling}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleScheduleDeletion}
              disabled={scheduling || deleteConfirm !== activeOrg.name}
              className="gap-1.5"
            >
              {scheduling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Schedule Deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
