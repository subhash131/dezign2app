import React, { useEffect } from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { ShieldCheck } from "lucide-react";
import { RedirectsConfig, arePageRoutesEqual } from "@workspace/canvas";
import { AuthConfigSectionProps } from "./types";
import {
  getConfiguredPages,
  useAuthPageCreation,
  ProtectedRoutesInfoCard,
  AuthPagesQuickSetupBanner,
  AuthPagesCard,
  RedirectRoutingCard,
  TrustedOriginsCard,
} from "./security";

export const AuthSecuritySection: React.FC<AuthConfigSectionProps> = ({
  data,
  updateData,
  allNodes = [],
  edges = [],
  nodeId,
}) => {
  const redirects: RedirectsConfig = data.redirects || {};

  const trustedOrigins: string[] = data.trustedOrigins || [
    "http://localhost:3000",
    "http://localhost:5173",
  ];

  const projectId =
    typeof window !== "undefined"
      ? window.location.pathname.split("/project/")[1]?.split("/")[0] ?? ""
      : "";

  const configuredPages = getConfiguredPages(allNodes);
  const canvasPagesCount = configuredPages.filter((p) => p.isCanvasPage).length;

  const {
    missingPages,
    handleCreateWebPageNode,
    handleCreateAllMissingAuthPages,
  } = useAuthPageCreation({
    allNodes,
    edges,
    nodeId,
    redirects,
    updateData,
  });

  const handleUpdateRedirects = (changes: Partial<RedirectsConfig>) => {
    const nextRedirects = { ...redirects, ...changes };
    for (const key of Object.keys(changes) as (keyof RedirectsConfig)[]) {
      if (changes[key] === undefined) {
        delete nextRedirects[key];
      }
    }
    updateData({
      redirects: nextRedirects,
    });
  };

  // Auto-sync saved path values when linked canvas node paths change (e.g. node label edited)
  useEffect(() => {
    let needsUpdate = false;
    const updatedRedirects = { ...redirects };

    const checkField = (
      nodeIdKey: keyof RedirectsConfig,
      urlKey: keyof RedirectsConfig,
    ) => {
      const nid = redirects[nodeIdKey];
      if (nid) {
        const page = configuredPages.find((p) => p.id === nid);
        if (!page) {
          delete updatedRedirects[nodeIdKey];
          needsUpdate = true;
        } else if (
          redirects[urlKey] &&
          !arePageRoutesEqual(page.path, redirects[urlKey] as string) &&
          !arePageRoutesEqual(page.label, redirects[urlKey] as string)
        ) {
          // Stale node reference: custom URL was selected
          delete updatedRedirects[nodeIdKey];
          needsUpdate = true;
        } else if (page.path !== redirects[urlKey]) {
          updatedRedirects[urlKey] = page.path;
          needsUpdate = true;
        }
      }
    };

    checkField("signInPageNodeId", "signInPageUrl");
    checkField("signUpPageNodeId", "signUpPageUrl");
    checkField("signInRedirectNodeId", "signInRedirectUrl");
    checkField("signUpRedirectNodeId", "signUpRedirectUrl");
    checkField("signOutRedirectNodeId", "signOutRedirectUrl");
    checkField("unauthorizedNodeId", "unauthorizedUrl");
    checkField("pricingNodeId", "pricingUrl");

    if (needsUpdate) {
      updateData({ redirects: updatedRedirects });
    }
  }, [allNodes]);

  return (
    <AccordionItem
      value="security-redirects"
      className="rounded-xl border bg-card/50 shadow-sm backdrop-blur-sm overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2 text-left flex-1">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Auth Pages, Redirects & CORS
          </span>
          <div className="flex items-center gap-1.5 ml-auto mr-2">
            {canvasPagesCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20 font-medium">
                {canvasPagesCount} {canvasPagesCount === 1 ? "Page" : "Pages"}
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
              {trustedOrigins.length} Origins
            </span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-1">
        <div className="flex flex-col gap-4 pt-2">
          {/* Bearer Token & Client Authorization Header Card */}
          <ProtectedRoutesInfoCard />

          {/* Quick Setup Banner if Auth Pages are missing from canvas */}
          <AuthPagesQuickSetupBanner
            missingPages={missingPages}
            onCreateAll={handleCreateAllMissingAuthPages}
          />

          {/* Auth Pages Definition Card (Login & Register) */}
          <AuthPagesCard
            redirects={redirects}
            configuredPages={configuredPages}
            projectId={projectId}
            onUpdateRedirects={handleUpdateRedirects}
            onCreatePageNode={handleCreateWebPageNode}
          />

          {/* Redirect URLs Card (Callbacks & Redirects) */}
          <RedirectRoutingCard
            redirects={redirects}
            configuredPages={configuredPages}
            canvasPagesCount={canvasPagesCount}
            projectId={projectId}
            onUpdateRedirects={handleUpdateRedirects}
            onCreatePageNode={handleCreateWebPageNode}
          />

          {/* Trusted Origins / CORS List Card */}
          <TrustedOriginsCard
            trustedOrigins={trustedOrigins}
            onUpdateOrigins={(updated) => updateData({ trustedOrigins: updated })}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
