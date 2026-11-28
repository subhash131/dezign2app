import React from "react";
import { ShieldCheck } from "lucide-react";
import { LocalInput } from "../../backend-nodes/graph-nodes/shared";
import { RoleMultiSelectDropdown } from "../RoleMultiSelectDropdown";
import { Label } from "@workspace/ui/components/label";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";

interface WebPageProtectionSectionProps {
  useZoneDefault: boolean;
  accessType: "public" | "private" | "role-gated" | "payment-gated" | "org-gated";
  allowedRoles: string[];
  requiredPlans: string[];
  redirectTo: string;
  isAuthPage: boolean;
  onUpdateUseZoneDefault: (useZoneDefault: boolean) => void;
  onUpdateAccessType: (accessType: "public" | "private" | "role-gated" | "payment-gated" | "org-gated", redirectTo: string) => void;
  onUpdateAllowedRoles: (allowedRoles: string[]) => void;
  onUpdateRequiredPlans: (requiredPlans: string[]) => void;
  onUpdateRedirectTo: (redirectTo: string) => void;
  onUpdateIsAuthPage: (isAuthPage: boolean) => void;
}

export function WebPageProtectionSection({
  useZoneDefault,
  accessType,
  allowedRoles,
  requiredPlans,
  redirectTo,
  isAuthPage,
  onUpdateUseZoneDefault,
  onUpdateAccessType,
  onUpdateAllowedRoles,
  onUpdateRequiredPlans,
  onUpdateRedirectTo,
  onUpdateIsAuthPage,
}: WebPageProtectionSectionProps) {
  const [localIsAuthPage, setLocalIsAuthPage] = React.useState<boolean>(Boolean(isAuthPage));

  React.useEffect(() => {
    setLocalIsAuthPage(Boolean(isAuthPage));
  }, [isAuthPage]);
  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl bg-card border border-border/60 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Protection Rules</span>
        </div>
        <Select
          value={useZoneDefault ? "zone" : "custom"}
          onValueChange={(val) => onUpdateUseZoneDefault(val === "zone")}
        >
          <SelectTrigger className="h-8 text-xs w-[180px] bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zone" className="text-xs">
              Inherit Section Default Rules
            </SelectItem>
            <SelectItem value="custom" className="text-xs">
              Custom Override for This Page
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {useZoneDefault ? (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-indigo-700 dark:text-indigo-300">
          <p className="font-semibold mb-1">Inheriting Section Rules:</p>
          <p className="text-[11px] text-muted-foreground">
            This page automatically inherits all access conditions and failure redirect routes configured on the parent WebApp Section.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pt-2 border-t border-border/40">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Custom Access Type</Label>
            <Select
              value={accessType}
              onValueChange={(
                val: "public" | "private" | "role-gated" | "payment-gated" | "org-gated",
              ) => {
                const defaultRedirect =
                  val === "payment-gated"
                    ? "/pricing"
                    : val === "org-gated"
                    ? "/select-org"
                    : "/login";
                onUpdateAccessType(val, defaultRedirect);
              }}
            >
              <SelectTrigger className="h-9 text-xs font-medium bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public" className="text-xs">
                  🌐 Public (Open to anyone)
                </SelectItem>
                <SelectItem value="private" className="text-xs">
                  🔒 Private (Authenticated user session required)
                </SelectItem>
                <SelectItem value="role-gated" className="text-xs">
                  🛡️ Role-Gated (Specific user roles required)
                </SelectItem>
                <SelectItem value="payment-gated" className="text-xs">
                  💳 Payment-Gated (Active paid plan tier required)
                </SelectItem>
                <SelectItem value="org-gated" className="text-xs">
                  🏢 Organization-Gated (Active Organization required)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {accessType === "role-gated" && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">
                Allowed Roles
              </Label>
              <RoleMultiSelectDropdown
                selectedRoles={allowedRoles}
                onChange={onUpdateAllowedRoles}
                placeholder="Select allowed roles..."
                className="min-h-8 bg-background/50"
              />
            </div>
          )}

          {accessType === "payment-gated" && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">
                Required Plan Tiers (comma-separated)
              </Label>
              <LocalInput
                value={requiredPlans.join(", ")}
                onChange={(e) =>
                  onUpdateRequiredPlans(
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="e.g. pro, enterprise"
                className="h-8 text-xs bg-background/50"
              />
            </div>
          )}

          {accessType !== "public" && (
            <div className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">
                Unauthorized Redirect Target Route
              </Label>
              <LocalInput
                value={redirectTo}
                onChange={(e) => onUpdateRedirectTo(e.target.value)}
                placeholder="e.g. /login, /pricing"
                className="h-8 text-xs font-mono bg-background/50"
              />
            </div>
          )}
        </div>
      )}

      {/* Auth Page Checkbox */}
      <div className="flex items-center gap-2.5 pt-2 border-t border-border/40">
        <Checkbox
          id="isAuthPage"
          checked={localIsAuthPage}
          onCheckedChange={(val) => {
            const nextVal = Boolean(val);
            setLocalIsAuthPage(nextVal);
            onUpdateIsAuthPage(nextVal);
          }}
        />
        <Label htmlFor="isAuthPage" className="text-xs font-normal cursor-pointer">
          This page is the Login / Authentication entry page (unauthenticated target)
        </Label>
      </div>
    </div>
  );
}
