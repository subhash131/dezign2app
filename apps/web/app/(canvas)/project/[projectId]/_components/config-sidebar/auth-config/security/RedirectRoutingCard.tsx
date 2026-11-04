import React from "react";
import { Label } from "@workspace/ui/components/label";
import { LocalInput } from "../LocalInput";
import { ArrowRightLeft } from "lucide-react";
import { RedirectRouteSelector } from "./RedirectRouteSelector";
import { RedirectRoutingCardProps } from "./types";

export const RedirectRoutingCard: React.FC<RedirectRoutingCardProps> = ({
  redirects,
  configuredPages,
  canvasPagesCount,
  projectId,
  onUpdateRedirects,
  onCreatePageNode,
}) => {
  return (
    <div className="flex flex-col gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40 text-xs">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <ArrowRightLeft className="w-3.5 h-3.5 text-primary" /> Redirect & Callback Routing
        </Label>
        {canvasPagesCount > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {canvasPagesCount} canvas page{canvasPagesCount === 1 ? "" : "s"} detected
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <RedirectRouteSelector
          label="Sign-In Success Redirect"
          placeholder="/dashboard"
          value={redirects.signInRedirectUrl || ""}
          nodeIdValue={redirects.signInRedirectNodeId}
          configuredPages={configuredPages}
          targetZoneType="protected"
          projectId={projectId}
          onChange={(val, newId) =>
            onUpdateRedirects({
              signInRedirectUrl: val,
              signInRedirectNodeId: newId,
            })
          }
          onCreatePageNode={() =>
            onCreatePageNode(redirects.signInRedirectUrl || "/dashboard", true, "signInRedirect")
          }
        />

        <RedirectRouteSelector
          label="Sign-Up Success Redirect"
          placeholder="/onboarding"
          value={redirects.signUpRedirectUrl || ""}
          nodeIdValue={redirects.signUpRedirectNodeId}
          configuredPages={configuredPages}
          targetZoneType="protected"
          projectId={projectId}
          onChange={(val, newId) =>
            onUpdateRedirects({
              signUpRedirectUrl: val,
              signUpRedirectNodeId: newId,
            })
          }
          onCreatePageNode={() =>
            onCreatePageNode(redirects.signUpRedirectUrl || "/onboarding", true, "signUpRedirect")
          }
        />

        <RedirectRouteSelector
          label="Sign-Out Redirect"
          placeholder="/login"
          value={redirects.signOutRedirectUrl || ""}
          nodeIdValue={redirects.signOutRedirectNodeId}
          configuredPages={configuredPages}
          targetZoneType="public"
          projectId={projectId}
          onChange={(val, newId) =>
            onUpdateRedirects({
              signOutRedirectUrl: val,
              signOutRedirectNodeId: newId,
            })
          }
          onCreatePageNode={() =>
            onCreatePageNode(redirects.signOutRedirectUrl || "/login", false, "signOutRedirect")
          }
        />

        <RedirectRouteSelector
          label="Unauthorized / 403 Redirect"
          placeholder="/unauthorized"
          value={redirects.unauthorizedUrl || ""}
          nodeIdValue={redirects.unauthorizedNodeId}
          configuredPages={configuredPages}
          targetZoneType="public"
          projectId={projectId}
          onChange={(val, newId) =>
            onUpdateRedirects({
              unauthorizedUrl: val,
              unauthorizedNodeId: newId,
            })
          }
          onCreatePageNode={() =>
            onCreatePageNode(redirects.unauthorizedUrl || "/unauthorized", false, "unauthorized")
          }
        />

        <RedirectRouteSelector
          label="Payment-Gated Redirect"
          placeholder="/pricing"
          value={redirects.pricingUrl || ""}
          nodeIdValue={redirects.pricingNodeId}
          configuredPages={configuredPages}
          targetZoneType="public"
          projectId={projectId}
          onChange={(val, newId) =>
            onUpdateRedirects({
              pricingUrl: val,
              pricingNodeId: newId,
            })
          }
          onCreatePageNode={() =>
            onCreatePageNode(redirects.pricingUrl || "/pricing", false, "pricing")
          }
        />

        <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-background/60 border border-border/40">
          <Label className="text-[11px] text-muted-foreground font-medium">
            OAuth Callback Base Route
          </Label>
          <LocalInput
            className="h-7 text-xs font-mono bg-background"
            placeholder="/api/auth/callback"
            value={redirects.callbackUrl || "/api/auth/callback"}
            onChange={(e) =>
              onUpdateRedirects({
                callbackUrl: e.target.value,
              })
            }
          />
          <span className="text-[10px] text-muted-foreground leading-tight px-0.5">
            Backend API route prefix. Better Auth automatically appends{" "}
            <code className="font-mono text-[9px] text-primary">/[provider]</code>.
          </span>
        </div>
      </div>
    </div>
  );
};
