"use client";

import React, { useState } from "react";
import {
  useListOrganizations,
  useActiveOrganization,
  organization as orgActions,
} from "@/lib/auth-client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Building2, Plus, Check, Loader2, User } from "lucide-react";
import { toast } from "sonner";

export const OrgSelectionView = () => {
  const { data: orgs, isPending: isListPending } = useListOrganizations();
  const { data: activeOrg } = useActiveOrganization();
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSelectOrg = async (orgId: string | null) => {
    try {
      const res = await orgActions.setActive({
        organizationId: (orgId ?? null) as string,
      });
      if (res?.error) {
        toast.error(res.error.message || "Failed to select workspace");
        return;
      }
      toast.success(
        orgId ? "Organization selected" : "Switched to Personal Workspace",
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("auth:workspace-changed", {
            detail: { organizationId: orgId },
          }),
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to select workspace";
      toast.error(msg);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    setSubmitting(true);
    try {
      const baseSlug = newOrgName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const slug = `${baseSlug || "org"}-${Date.now().toString(36)}`;

      const created = await orgActions.create({
        name: newOrgName.trim(),
        slug,
      });

      if (created?.error) {
        toast.error(created.error.message || "Failed to create organization");
        return;
      }

      if (created?.data?.id) {
        await orgActions.setActive({ organizationId: created.data.id });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("auth:workspace-changed", {
              detail: { organizationId: created.data.id },
            }),
          );
        }
        toast.success(`Organization "${newOrgName}" created!`);
        setCreating(false);
        setNewOrgName("");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create organization";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-2xl">
      <CardHeader className="text-center pb-3">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
          <Building2 className="h-7 w-7" />
        </div>
        <CardTitle className="text-xl font-bold">
          Select Your Workspace
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Choose an active organization or create a new team workspace.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {isListPending ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            {/* Personal Workspace Button */}
            <button
              onClick={() => handleSelectOrg(null)}
              className={`flex w-full items-center justify-between p-3 rounded-lg border text-left transition-all ${
                !activeOrg
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground font-semibold text-xs">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold text-foreground truncate">
                    Personal Workspace
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Solo projects & private workspace
                  </div>
                </div>
              </div>
              {!activeOrg && (
                <Check className="h-4 w-4 text-primary shrink-0" />
              )}
            </button>

            {orgs &&
              orgs.map((org: { id: string; name: string; slug?: string }) => {
                const isSelected = activeOrg?.id === org.id;
              return (
                <button
                  key={org.id}
                  onClick={() => handleSelectOrg(org.id)}
                  className={`flex w-full items-center justify-between p-3 rounded-lg border text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground font-semibold text-xs uppercase">
                      {org.name.charAt(0)}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {org.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {org.slug}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        {creating ? (
          <form onSubmit={handleCreateOrg} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-org" className="text-xs font-medium">
                Organization Name
              </Label>
              <Input
                id="new-org"
                placeholder="Acme Engineering"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                className="h-9 text-xs"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setCreating(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="flex-1"
                disabled={!newOrgName.trim() || submitting}
              >
                {submitting ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreating(true)}
            className="w-full gap-2 text-xs font-medium mt-2"
          >
            <Plus className="h-4 w-4" />
            Create New Organization
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
