import React from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import type { AuthRule } from "@/types/canvas";

const authTypes = [
  { label: "JWT", value: "jwt" },
  { label: "OAuth2", value: "oauth2" },
  { label: "API Key", value: "apiKey" },
  { label: "mTLS", value: "mtls" },
  { label: "Basic", value: "basic" },
  { label: "None", value: "none" }
] as const;

export const AuthRuleConfig = ({ id, nodeId }: { id: string; nodeId: string }) => {
  const node = useBackendCanvasStore((s) => s.nodes.find((item) => item.id === nodeId));
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const rule = node?.data.authRules?.find((item) => item.id === id);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const identityProviders = nodes.filter(n => n.type === "identity_provider");

  if (!node || !rule) return null;

  const updateRuleDirect = (newRule: AuthRule) => {
    updateNode(nodeId, {
      data: {
        ...node.data,
        authRules: node.data.authRules?.map((item) => item.id === id ? newRule : item),
      },
    });
  };

  const handleTypeChange = (newType: string) => {
    const base = { id: rule.id, name: rule.name, description: rule.description };
    switch (newType) {
      case "jwt": updateRuleDirect({ ...base, type: "jwt", config: {} }); break;
      case "oauth2": updateRuleDirect({ ...base, type: "oauth2", config: {} }); break;
      case "apiKey": updateRuleDirect({ ...base, type: "apiKey", config: {} }); break;
      case "mtls": updateRuleDirect({ ...base, type: "mtls", config: {} }); break;
      case "basic": updateRuleDirect({ ...base, type: "basic" }); break;
      case "none": updateRuleDirect({ ...base, type: "none" }); break;
    }
  };

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12">
      <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-primary/15 text-primary rounded border border-primary/20 shadow-sm">AUTH RULE</span>
          <span className="text-lg font-semibold tracking-tight text-foreground">{rule.name || "Unnamed rule"}</span>
        </div>
        <span className="text-sm text-muted-foreground">Configure this authentication mechanism.</span>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-2">
          <Label>Name</Label>
          <Input value={rule.name} placeholder="e.g. Employee JWT" onChange={(e) => updateRuleDirect({ ...rule, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Type</Label>
          <Select value={rule.type} onValueChange={handleTypeChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{authTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Description</Label>
          <Textarea className="min-h-[80px] resize-y" placeholder="Describe this rule..." value={rule.description || ""} onChange={(e) => updateRuleDirect({ ...rule, description: e.target.value })} />
        </div>
      </div>

      {(rule.type === "jwt" || rule.type === "oauth2" || rule.type === "apiKey" || rule.type === "mtls") && (
        <div className="flex flex-col gap-4 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configuration</span>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            {(rule.type === "jwt" || rule.type === "oauth2") && (
              <>
                {rule.type === "oauth2" && (
                  <p className="text-xs text-muted-foreground mb-2">OAuth2 here represents JWT verification from an OAuth2/OpenID Connect Identity Provider, not the full OAuth2 authorization flow.</p>
                )}
                <div className="flex flex-col gap-2">
                  <Label>Identity Provider</Label>
                  <Select value={rule.config.providerId || "none"} onValueChange={(v) => {
                    const providerId = v === "none" ? undefined : v;
                    updateRuleDirect({ ...rule, config: { ...rule.config, providerId } });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {identityProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.data.provider || p.data.label || "Unnamed Provider"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Required Algorithms (Comma separated)</Label>
                  <Input placeholder="e.g. RS256, ES256" value={rule.config.algorithms?.join(", ") || ""} onChange={(e) => {
                    const algorithms = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
                    updateRuleDirect({ ...rule, config: { ...rule.config, algorithms: algorithms.length > 0 ? algorithms : undefined } });
                  }} />
                </div>
              </>
            )}

            {rule.type === "apiKey" && (
              <div className="flex flex-col gap-2">
                <Label>Header Name</Label>
                <Input placeholder="X-API-Key" value={rule.config.headerName || ""} onChange={(e) => {
                  updateRuleDirect({ ...rule, config: { ...rule.config, headerName: e.target.value } });
                }} />
              </div>
            )}

            {rule.type === "mtls" && (
              <div className="flex flex-col gap-2">
                <Label>Client CA (Certificate Authority)</Label>
                <Input placeholder="ca.pem" value={rule.config.clientCa || ""} onChange={(e) => {
                  updateRuleDirect({ ...rule, config: { ...rule.config, clientCa: e.target.value } });
                }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
