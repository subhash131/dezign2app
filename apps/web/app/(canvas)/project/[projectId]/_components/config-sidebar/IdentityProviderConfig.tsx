import React from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { IDENTITY_PROVIDER_PRESETS, IdPCapabilities, IdPOutputs } from "@workspace/canvas";
import { LocalTextarea } from "../backend-nodes/graph-nodes/shared";
import { ProviderPresetCombobox, LABEL_TO_KEY } from "../ProviderPresetCombobox";
import { Check } from "lucide-react";

export const IdentityProviderConfig = ({ id, nodeId }: { id: string; nodeId: string }) => {
  const providerConfig = useBackendCanvasStore((s) => s.identityProviders.find((item) => item.id === id));
  const updateIdentityProvider = useBackendCanvasStore((s) => s.updateIdentityProvider);

  if (!providerConfig) return null;

  const updateProvider = (changes: Partial<typeof providerConfig>) => {
    updateIdentityProvider(id, changes);
  };

  const handlePresetSelect = (label: string | null) => {
    if (!label) return;
    const key = LABEL_TO_KEY[label];
    if (!key) return;
    const preset = IDENTITY_PROVIDER_PRESETS[key as keyof typeof IDENTITY_PROVIDER_PRESETS];
    if (preset) {
      updateProvider({
        provider: preset.provider,
        name: preset.provider, // Update label to match provider name visually
        issuerUrl: preset.issuerUrl,
        discoveryUrl: preset.discoveryUrl || "",
        jwksUrl: preset.jwksUrl,
        supportedAlgorithms: [...preset.supportedAlgorithms],
        customCapabilities: { ...preset.capabilities },
        customOutputs: { ...preset.outputs }
      });
    }
  };

  const isCustom = providerConfig.provider === "Custom JWT";
  const actualPresetKey = Object.entries(IDENTITY_PROVIDER_PRESETS).find(([_, v]) => v.provider === providerConfig.provider)?.[0] || "custom";
  const preset = IDENTITY_PROVIDER_PRESETS[actualPresetKey as keyof typeof IDENTITY_PROVIDER_PRESETS];
  
  const currentCapabilities = isCustom ? (providerConfig.customCapabilities || preset?.capabilities) : preset?.capabilities;
  const currentOutputs = isCustom ? (providerConfig.customOutputs || preset?.outputs) : preset?.outputs;

  const updateCustomCapability = (key: keyof IdPCapabilities, checked: boolean) => {
    if (!isCustom) return;
    updateProvider({
      customCapabilities: {
        ...(providerConfig.customCapabilities || preset?.capabilities),
        [key]: checked
      }
    });
  };

  const updateCustomOutput = (key: keyof IdPOutputs, checked: boolean) => {
    if (!isCustom) return;
    updateProvider({
      customOutputs: {
        ...(providerConfig.customOutputs || preset?.outputs),
        [key]: checked
      }
    });
  };

  const renderCheckItem = (label: string, checked: boolean | undefined, onChange: (checked: boolean) => void) => {
    const isChecked = !!checked;
    if (!isCustom) {
      return (
        <div className="flex items-center gap-2 text-sm">
          {isChecked ? <Check className="w-4 h-4 text-primary" /> : <div className="w-4 h-4" />}
          <span className={isChecked ? "text-foreground font-medium" : "text-muted-foreground opacity-50"}>{label}</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2">
        <Checkbox 
          id={`check-${id}-${label.replace(/\s+/g, '-')}`} 
          checked={isChecked} 
          onCheckedChange={(c) => onChange(c as boolean)} 
        />
        <Label htmlFor={`check-${id}-${label.replace(/\s+/g, '-')}`} className="text-sm font-normal cursor-pointer">{label}</Label>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12">
      <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-blue-500/15 text-blue-500 rounded border border-blue-500/20 shadow-sm">IDENTITY PROVIDER</span>
          <span className="text-lg font-semibold tracking-tight text-foreground">{providerConfig.name || "Unnamed provider"}</span>
        </div>
        <span className="text-sm text-muted-foreground">Configure this token issuer as an authentication service.</span>
      </div>

      {/* 1. Provider */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">1. Provider</span>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Provider Preset</Label>
          <ProviderPresetCombobox onValueChange={handlePresetSelect} value={providerConfig.provider || null} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Description</Label>
          <LocalTextarea placeholder="Description" value={providerConfig.description || ""} onChange={(e) => updateProvider({ description: e.target.value })} />
        </div>
      </div>

      {/* 2. Configuration */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">2. Configuration</span>
        </div>
        
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <Label>Client ID</Label>
              <span className="text-[10px] text-muted-foreground">The unique identifier for this application.</span>
            </div>
            <Input placeholder="e.g. 0oa1b2c3d4e5f6g7h8i9" value={providerConfig.clientId || ""} onChange={(e) => updateProvider({ clientId: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <Label>Client Secret</Label>
              <span className="text-[10px] text-muted-foreground">The secret used to authenticate this application.</span>
            </div>
            <Input type="password" placeholder="Client secret" value={providerConfig.clientSecret || ""} onChange={(e) => updateProvider({ clientSecret: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <Label>Issuer URL</Label>
              <span className="text-[10px] text-muted-foreground">The exact URL of the authorization server that issues the tokens.</span>
            </div>
            <Input placeholder="https://<tenant>.auth0.com/" value={providerConfig.issuerUrl || ""} onChange={(e) => updateProvider({ issuerUrl: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <Label>Discovery URL</Label>
              <span className="text-[10px] text-muted-foreground">URL to fetch OpenID configuration automatically.</span>
            </div>
            <Input placeholder="https://<tenant>.auth0.com/.well-known/openid-configuration" value={providerConfig.discoveryUrl || ""} onChange={(e) => updateProvider({ discoveryUrl: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <Label>JWKS URL</Label>
              <span className="text-[10px] text-muted-foreground">URL containing the public keys to verify token signatures.</span>
            </div>
            <Input placeholder="https://<tenant>.auth0.com/.well-known/jwks.json" value={providerConfig.jwksUrl || ""} onChange={(e) => updateProvider({ jwksUrl: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <Label>Scopes (Comma separated)</Label>
              <span className="text-[10px] text-muted-foreground">Permissions requested from the provider (e.g. openid, profile, email).</span>
            </div>
            <Input placeholder="e.g. openid, profile, email" value={providerConfig.scopes?.join(", ") || ""} onChange={(e) => updateProvider({ scopes: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <Label>Audiences (Comma separated)</Label>
              <span className="text-[10px] text-muted-foreground">Valid recipients that tokens can be issued for.</span>
            </div>
            <Input placeholder="e.g. https://api.myapp.com" value={providerConfig.audiences?.join(", ") || ""} onChange={(e) => updateProvider({ audiences: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <Label>Supported Algorithms (Comma separated)</Label>
              <span className="text-[10px] text-muted-foreground">Allowed cryptographic algorithms for signature verification.</span>
            </div>
            <Input placeholder="e.g. RS256, ES256" value={providerConfig.supportedAlgorithms?.join(", ") || ""} onChange={(e) => updateProvider({ supportedAlgorithms: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
          </div>
        </div>
      </div>

      {/* 3. Capabilities */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">3. Capabilities</span>
          {!isCustom && <p className="text-[11px] text-muted-foreground mt-1">Derived from the standard preset.</p>}
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            {renderCheckItem("Authentication", currentCapabilities?.authentication, (c) => updateCustomCapability("authentication", c))}
            {renderCheckItem("User Management", currentCapabilities?.userManagement, (c) => updateCustomCapability("userManagement", c))}
          </div>
          <div className="flex flex-col gap-2">
            {renderCheckItem("Identity", currentCapabilities?.identity, (c) => updateCustomCapability("identity", c))}
            {renderCheckItem("Authorization", currentCapabilities?.authorization, (c) => updateCustomCapability("authorization", c))}
          </div>
        </div>
      </div>

      {/* 4. Outputs */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">4. Outputs</span>
          {!isCustom && <p className="text-[11px] text-muted-foreground mt-1">Derived from the standard preset.</p>}
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            {renderCheckItem("User", currentOutputs?.user, (c) => updateCustomOutput("user", c))}
            {renderCheckItem("Tokens", currentOutputs?.tokens, (c) => updateCustomOutput("tokens", c))}
          </div>
          <div className="flex flex-col gap-2">
            {renderCheckItem("Claims", currentOutputs?.claims, (c) => updateCustomOutput("claims", c))}
          </div>
        </div>
      </div>
    </div>
  );
};
