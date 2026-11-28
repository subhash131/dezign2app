import React from "react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { Key } from "lucide-react";
import {
  AUTH_FRAMEWORK_BETTER_AUTH,
  DEFAULT_AUTH_FRAMEWORK,
  DEFAULT_BETTER_AUTH_VERSION,
  EmailPasswordConfig,
  AccountLinkingPolicy,
} from "@workspace/canvas";
import { AuthConfigSectionProps } from "./types";
import {
  AuthFrameworkConfig,
  EmailPasswordConfigCard,
  SocialProvidersConfigCard,
  AccountLinkingConfigCard,
} from "./providers";

export const AuthProvidersSection: React.FC<AuthConfigSectionProps> = ({
  data,
  updateData,
}) => {
  const selectedFramework = data.framework || DEFAULT_AUTH_FRAMEWORK;
  const isBetterAuth = selectedFramework === AUTH_FRAMEWORK_BETTER_AUTH;
  const selectedVersion = data.version || DEFAULT_BETTER_AUTH_VERSION;

  const emailPassword: EmailPasswordConfig = {
    enabled: true,
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
    rateLimit: {
      maxAttempts: 5,
      windowSeconds: 60,
      lockoutDurationSeconds: 900,
    },
    ...data.providers?.emailPassword,
    requireVerification: data.providers?.emailPassword?.requireVerification ?? false,
  };

  const accountLinking: AccountLinkingPolicy = data.providers?.accountLinking || {
    policy: "merge",
    trustedProviders: [],
    allowDifferentEmails: false,
  };
  const activePolicy = accountLinking.policy || (accountLinking.enabled === false ? "block" : "merge");

  const providers = data.providers || {
    emailPassword,
    socialEnabled: false,
    oauth: [],
    accountLinking,
    magicLink: true,
    passkey: false,
  };

  const isSocialEnabled =
    providers.socialEnabled ??
    providers.oauthEnabled ??
    Boolean(providers.oauth && providers.oauth.length > 0);

  return (
    <AccordionItem
      value="providers"
      className="rounded-xl border bg-card/50 shadow-sm backdrop-blur-sm overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2 text-left flex-1">
          <Key className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Providers & Password Security
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
            {emailPassword?.enabled ? "Email" : ""}
            {isSocialEnabled && providers.oauth?.length ? ` + ${providers.oauth.length} OAuth` : ""}
            {!emailPassword?.enabled && (!isSocialEnabled || !providers.oauth?.length) ? "None" : ""}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-1">
        <div className="flex flex-col gap-4 pt-2">
          {/* Framework Selection */}
          <AuthFrameworkConfig
            selectedFramework={selectedFramework}
            selectedVersion={selectedVersion}
            updateData={updateData}
          />

          {/* Better Auth–specific provider controls (hidden for external IdPs) */}
          {isBetterAuth && (
            <>
              {/* Email / Password & Security Guardrails */}
              <EmailPasswordConfigCard
                emailPassword={emailPassword}
                providers={providers}
                updateData={updateData}
              />

              {/* OAuth Providers Table with Secret Security Indicators */}
              <SocialProvidersConfigCard
                isSocialEnabled={isSocialEnabled}
                providers={providers}
                updateData={updateData}
              />

              {/* Account Linking Policy (Shown only when OAuth 2.0 / Social Auth is enabled above) */}
              {isSocialEnabled && (
                <AccountLinkingConfigCard
                  accountLinking={accountLinking}
                  activePolicy={activePolicy}
                  providers={providers}
                  updateData={updateData}
                />
              )}
            </>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
