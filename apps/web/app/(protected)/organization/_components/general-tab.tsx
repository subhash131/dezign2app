"use client";

import React, { useState, useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Building2, Pencil, Save, X, Calendar } from "lucide-react";
import { toast } from "sonner";
import type { OrgSeatStatus } from "@/components/auth/org/types";

interface GeneralTabProps {
  orgId: string;
  orgName: string;
  orgSlug?: string | null;
  seatStatus: OrgSeatStatus | null | undefined;
  createdAt?: Date | string | number | null;
}

function formatCreatedDate(createdAt?: Date | string | number | null): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function GeneralTab({
  orgId,
  orgName,
  orgSlug,
  seatStatus,
  createdAt,
}: GeneralTabProps) {
  const isOwner = seatStatus?.isOwner ?? false;
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(orgName);
  const [saving, setSaving] = useState(false);

  const [editingSlug, setEditingSlug] = useState(false);
  const [slugValue, setSlugValue] = useState(orgSlug ?? "");
  const [savingSlug, setSavingSlug] = useState(false);

  useEffect(() => {
    setNameValue(orgName);
  }, [orgName]);

  useEffect(() => {
    setSlugValue(orgSlug ?? "");
  }, [orgSlug]);

  const handleSave = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      toast.error("Organization name cannot be empty");
      return;
    }
    if (trimmed === orgName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await authClient.organization.update({
        organizationId: orgId,
        data: { name: trimmed },
      });
      if (res?.error) {
        toast.error(res.error.message || "Failed to update organization name");
        return;
      }
      window.dispatchEvent(new Event("auth:workspace-changed"));
      toast.success("Organization name updated");
      setEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNameValue(orgName);
    setEditing(false);
  };

  const handleSaveSlug = async () => {
    const trimmed = slugValue.trim().toLowerCase();
    if (!trimmed) {
      toast.error("Handle cannot be empty");
      return;
    }
    if (trimmed === (orgSlug ?? "")) {
      setEditingSlug(false);
      return;
    }
    if (trimmed.length < 2) {
      toast.error("Handle must be at least 2 characters long");
      return;
    }
    if (trimmed.length > 48) {
      toast.error("Handle cannot exceed 48 characters");
      return;
    }
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugPattern.test(trimmed)) {
      toast.error(
        "Handle must consist of lowercase letters, numbers, and single hyphens (no leading or trailing hyphens)",
      );
      return;
    }

    setSavingSlug(true);
    try {
      const res = await authClient.organization.update({
        organizationId: orgId,
        data: { slug: trimmed },
      });
      if (res?.error) {
        toast.error(res.error.message || "Failed to update handle. It may already be in use.");
        return;
      }
      window.dispatchEvent(new Event("auth:workspace-changed"));
      toast.success("Organization handle updated");
      setEditingSlug(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update handle";
      toast.error(msg);
    } finally {
      setSavingSlug(false);
    }
  };

  const handleCancelSlug = () => {
    setSlugValue(orgSlug ?? "");
    setEditingSlug(false);
  };

  const formattedDate = formatCreatedDate(createdAt);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-6 flex items-start gap-4">
        <div className="h-14 w-14 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Building2 className="h-7 w-7 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground truncate">
            {orgName}
          </h2>
          {orgSlug && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              @{orgSlug}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-[10px] gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              Active
            </Badge>
            {seatStatus && (
              <Badge variant="outline" className="text-[10px]">
                {seatStatus.totalSeats} seat{seatStatus.totalSeats !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Name field */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Organization Details</h3>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Organization Name
          </Label>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                className="h-9 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
              />
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="h-9 gap-1.5 shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancel}
                disabled={saving}
                className="h-9 w-9 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">{orgName}</span>
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Handle
          </Label>
          {editingSlug ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground select-none">
                    @
                  </span>
                  <Input
                    value={slugValue}
                    onChange={(e) => {
                      const clean = e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "")
                        .replace(/--+/g, "-");
                      setSlugValue(clean);
                    }}
                    className="h-9 text-sm font-mono pl-7"
                    placeholder="handle"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSaveSlug();
                      if (e.key === "Escape") handleCancelSlug();
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveSlug}
                  disabled={savingSlug}
                  className="h-9 gap-1.5 shrink-0"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancelSlug}
                  disabled={savingSlug}
                  className="h-9 w-9 shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Handles must be globally unique. Only lowercase letters, numbers, and hyphens allowed.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-foreground">
                {orgSlug ? `@${orgSlug}` : "—"}
              </span>
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSlugValue(orgSlug ?? "");
                    setEditingSlug(true);
                  }}
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Organization ID
          </Label>
          <span className="text-xs font-mono text-muted-foreground break-all">
            {orgId}
          </span>
        </div>

        {formattedDate && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Created
            </Label>
            <div className="flex items-center gap-1.5 text-sm text-foreground">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{formattedDate}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
