import React, { useState } from "react";
import { LocalInput } from "../LocalInput";
import { Label } from "@workspace/ui/components/label";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Plus, Trash, Lock, Copy, Check, Info } from "lucide-react";
import { OAuthProviderConfig } from "@workspace/canvas";
import { BackendNodeData } from "@/types/canvas";

interface SocialProvidersConfigCardProps {
  isSocialEnabled: boolean;
  providers: NonNullable<BackendNodeData["providers"]>;
  updateData: (changes: Partial<BackendNodeData>) => void;
}

export const SocialProvidersConfigCard: React.FC<SocialProvidersConfigCardProps> = ({
  isSocialEnabled,
  providers,
  updateData,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCallback = (id: string, providerName: string) => {
    const url = `/api/auth/callback/${providerName}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold">OAuth 2.0 / Social Providers</Label>
        </div>
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            id="enable-social-auth"
            checked={isSocialEnabled}
            onCheckedChange={(checked) => {
              const enabled = Boolean(checked);
              updateData({
                providers: {
                  ...providers,
                  socialEnabled: enabled,
                  oauthEnabled: enabled,
                  oauth: providers.oauth || [],
                },
              });
            }}
          />
          <Label htmlFor="enable-social-auth" className="text-xs font-normal cursor-pointer text-muted-foreground select-none">
            {isSocialEnabled ? "Enabled" : "Disabled"}
          </Label>
        </div>
      </div>

      {isSocialEnabled ? (
        <div className="flex flex-col gap-3 pt-1">
          {/* Better Auth Callback Info Notice */}
          <div className="text-[11px] text-muted-foreground p-2.5 rounded-md bg-muted/40 border border-border/40 flex items-start gap-2 leading-relaxed">
            <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <div>
              <strong>OAuth Callback Routing:</strong> Better Auth handles provider responses at <code className="text-primary font-mono text-[10px] bg-background px-1 py-0.5 rounded border border-border/40">/api/auth/callback/[provider]</code>. Register the specific callback URL below in each provider&apos;s Developer Portal.
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground font-medium">Configured Providers</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs bg-background"
              onClick={() => {
                const availableProviders = ["google", "github", "discord", "apple", "twitter", "microsoft"];
                const existingProviders = new Set((providers.oauth || []).map((o) => o.provider));
                const nextProvider = availableProviders.find((p) => !existingProviders.has(p)) || "google";
                const nextPrefix = nextProvider.toUpperCase();
                const newOauth = [
                  ...(providers.oauth || []),
                  {
                    id: `oa-${Date.now()}`,
                    provider: nextProvider,
                    clientIdEnv: `${nextPrefix}_CLIENT_ID`,
                    clientSecretEnv: `${nextPrefix}_CLIENT_SECRET`,
                  },
                ];
                updateData({
                  providers: {
                    ...providers,
                    socialEnabled: true,
                    oauthEnabled: true,
                    oauth: newOauth,
                  },
                });
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Provider
            </Button>
          </div>

          {providers.oauth && providers.oauth.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {providers.oauth.map((oa: OAuthProviderConfig) => (
                <div
                  key={oa.id}
                  className="flex flex-col gap-2 p-2.5 rounded-lg bg-background border border-border/50 text-xs shadow-xs"
                >
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-3">
                      <Select
                        value={oa.provider}
                        onValueChange={(val) => {
                          const envPrefix = val.toUpperCase();
                          const updated = (providers.oauth || []).map((o) =>
                            o.id === oa.id
                              ? {
                                  ...o,
                                  provider: val,
                                  clientIdEnv: `${envPrefix}_CLIENT_ID`,
                                  clientSecretEnv: `${envPrefix}_CLIENT_SECRET`,
                                }
                              : o,
                          );
                          updateData({ providers: { ...providers, oauth: updated } });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs font-medium capitalize bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["google", "github", "discord", "apple", "twitter", "microsoft"].map((p) => (
                            <SelectItem key={p} value={p} className="text-xs capitalize">
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4 relative flex items-center">
                      <LocalInput
                        className="h-7 text-xs font-mono bg-background pr-6"
                        value={oa.clientIdEnv}
                        placeholder="CLIENT_ID_ENV"
                        onChange={(e) => {
                          const updated = (providers.oauth || []).map((o) =>
                            o.id === oa.id ? { ...o, clientIdEnv: e.target.value } : o,
                          );
                          updateData({ providers: { ...providers, oauth: updated } });
                        }}
                      />
                      <Lock className="w-3 h-3 text-muted-foreground absolute right-2 pointer-events-none" />
                    </div>
                    <div className="col-span-4 relative flex items-center">
                      <LocalInput
                        className="h-7 text-xs font-mono bg-background pr-6"
                        value={oa.clientSecretEnv}
                        placeholder="CLIENT_SECRET_ENV"
                        onChange={(e) => {
                          const updated = (providers.oauth || []).map((o) =>
                            o.id === oa.id ? { ...o, clientSecretEnv: e.target.value } : o,
                          );
                          updateData({ providers: { ...providers, oauth: updated } });
                        }}
                      />
                      <Lock className="w-3 h-3 text-muted-foreground absolute right-2 pointer-events-none" />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        onClick={() => {
                          const updated = (providers.oauth || []).filter((o) => o.id !== oa.id);
                          updateData({ providers: { ...providers, oauth: updated } });
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        title="Remove provider"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Per-Provider Callback URL Badge & Copy Button */}
                  <div className="flex items-center justify-between text-[11px] bg-muted/25 px-2.5 py-1 rounded border border-border/30 font-mono text-muted-foreground">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[10px] text-muted-foreground/70 uppercase font-sans font-semibold shrink-0">Callback:</span>
                      <code className="text-primary truncate">/api/auth/callback/{oa.provider}</code>
                    </div>
                    <button
                      onClick={() => handleCopyCallback(oa.id, oa.provider)}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground shrink-0 ml-2 font-sans bg-background px-2 py-0.5 rounded border border-border/50 transition-colors cursor-pointer"
                      title="Copy path for provider console"
                    >
                      {copiedId === oa.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-500 font-medium">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-muted-foreground" />
                          <span>Copy Path</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground py-2 text-center bg-background/30 rounded border border-dashed border-border/60">
              No social providers added. Click &quot;Add Provider&quot; above to configure one.
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground font-normal">
          Enable social authentication to allow signing in with Google, GitHub, Discord, Apple, etc.
        </p>
      )}
    </div>
  );
};
