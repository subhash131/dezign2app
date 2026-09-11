"use client";

import React, { ReactNode, useState } from "react";
import {
  useActiveOrganization,
  useListOrganizations,
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
import { Building2, PlusCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const OrganizationGuard = ({ children }: { children: ReactNode }) => {
  const { data: activeOrg, isPending: isActivePending } = useActiveOrganization();
  const { data: orgs, isPending: isListPending } = useListOrganizations();

  const [orgName, setOrgName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSelectOrg = async (orgId: string) => {
    try {
      await orgActions.setActive({ organizationId: orgId });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("auth:workspace-changed", {
            detail: { organizationId: orgId },
          }),
        );
      }
      toast.success("Organization selected");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to select organization";
      toast.error(message);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setSubmitting(true);
    try {
      const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const created = await orgActions.create({
        name: orgName.trim(),
        slug: `${slug}-${Date.now().toString().slice(-4)}`,
      });

      if (created?.data) {
        await orgActions.setActive({ organizationId: created.data.id });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("auth:workspace-changed", {
              detail: { organizationId: created.data.id },
            }),
          );
        }
        toast.success(`Organization "${orgName}" created!`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create organization";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (isActivePending || isListPending) {
    return (
      <div className="flex min-h-[400px] w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If user has an active organization, or is in personal workspace mode
  if (activeOrg || (orgs && orgs.length > 0)) {
    return <>{children}</>;
  }

  // If user has zero organizations created yet, guide them to create their first organization
  return (
    <div className="flex min-h-[500px] w-full items-center justify-center p-4">
      <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-xl">
        <form onSubmit={handleCreateOrg}>
          <CardHeader className="text-center pb-3">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
              <Building2 className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold">
              Create Your Organization
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Organizations allow you to collaborate on system design diagrams, microservice workflows, and shared API keys.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="first-org-name" className="text-xs font-medium">
                Workspace / Company Name
              </Label>
              <Input
                id="first-org-name"
                placeholder="My Team / Engineering"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="h-9 text-xs"
                autoFocus
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-0">
            <Button
              type="submit"
              className="w-full font-medium"
              disabled={!orgName.trim() || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Setting up workspace...
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Get Started
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
