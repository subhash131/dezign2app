"use client";

import React, { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useMutation } from "convex/react";
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
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingOrgsCount: number;
  onCreated: (org: { id: string; name: string }) => void;
}

export function CreateOrgDialog({
  open,
  onOpenChange,
  existingOrgsCount,
  onCreated,
}: CreateOrgDialogProps) {
  const [orgName, setOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ensureOrgBilling = useMutation(api.billing.ensureOrgBilling);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    if (existingOrgsCount >= 1) {
      toast.error(
        "Your plan includes 1 Organization workspace. Multiple organizations require an enterprise plan.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const baseSlug = orgName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const slug = `${baseSlug || "org"}-${Date.now().toString(36)}`;

      const created = await authClient.organization.create({
        name: orgName.trim(),
        slug,
      });

      if (created?.error) {
        toast.error(created.error.message || "Failed to create organization");
        return;
      }

      const createdId =
        typeof created?.data?.id === "string" ? created.data.id : null;

      if (createdId) {
        try {
          await ensureOrgBilling({ organizationId: createdId });
        } catch (billingErr) {
          console.error("Error initializing org billing:", billingErr);
        }

        if (typeof window !== "undefined") {
          localStorage.setItem("preferred_workspace", createdId);
        }

        const trimmedName = orgName.trim();
        toast.success(`Organization "${trimmedName}" created!`);
        setOrgName("");
        onOpenChange(false);
        onCreated({ id: createdId, name: trimmedName });

        await authClient.organization.setActive({ organizationId: createdId });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("auth:workspace-changed", {
              detail: { organizationId: createdId },
            }),
          );
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create organization";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Create Organization
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Create a shared workspace to collaborate with your team on system
              architectures, APIs, and workflows.
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
              onClick={() => onOpenChange(false)}
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
  );
}
