"use client";

import React from "react";
import {
  ShieldCheck,
  Info,
  Sparkles,
  LogOut,
  KeyRound,
  Globe,
  Users,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Switch } from "@workspace/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type { AuthStepProps } from "./types";
import type { FrontendFieldSource } from "@workspace/canvas";
import { SubActionStepList } from "./SubActionStepList";

const AUTH_OPERATIONS = [
  {
    value: "signOut",
    label: "Sign Out / Logout",
    icon: LogOut,
    description: "Terminates active session and clears auth cookies (authClient.signOut())",
  },
  {
    value: "signInSocial",
    label: "Social Sign In (OAuth)",
    icon: Globe,
    description: "Redirects to configured OAuth provider (authClient.signIn.social())",
  },
  {
    value: "signInEmail",
    label: "Sign In with Email",
    icon: KeyRound,
    description: "Authenticates credentials (authClient.signIn.email())",
  },
  {
    value: "signUpEmail",
    label: "Sign Up with Email",
    icon: Sparkles,
    description: "Registers a new user (authClient.signUp.email())",
  },
  {
    value: "setActiveOrg",
    label: "Set Active Organization",
    icon: Users,
    description: "Switches active tenant workspace (authClient.organization.setActive())",
  },
  {
    value: "leaveOrg",
    label: "Leave Organization",
    icon: Users,
    description: "Leaves tenant organization (authClient.organization.leave())",
  },
  {
    value: "getSession",
    label: "Get Session (Hydration)",
    icon: ShieldCheck,
    description: "Fetches active user and session object (authClient.getSession())",
  },
] as const;

const SOCIAL_PROVIDERS = [
  { value: "google", label: "Google" },
  { value: "github", label: "GitHub" },
  { value: "discord", label: "Discord" },
  { value: "apple", label: "Apple" },
  { value: "microsoft", label: "Microsoft" },
  { value: "twitter", label: "Twitter / X" },
] as const;

export const AuthStep: React.FC<AuthStepProps> = ({
  draft,
  allNodes = [],
  serviceNodes = [],
  endpoints = [],
  webPageNodeId,
  actionId,
  actionItem,
  isProtected,
  incomingPaths,
  isItemScoped,
  itemKeyField,
  itemSourceStateName,
  itemPropSuggestions,
  onChange,
}) => {
  const authNodes = allNodes.filter((n) => n.type === "auth" || n.type === "identity_provider");
  const authNode = authNodes[0];
  const authNodeLabel = authNode?.data?.label || "Better Auth";

  const operation = draft.authOperation || "signOut";
  const outputVariable = draft.authOutputVariable || "authResult";

  const handleOperationChange = (op: typeof operation) => {
    const nextDraft = {
      ...draft,
      authOperation: op,
      name:
        op === "signOut"
          ? "Sign Out Session"
          : op === "signInSocial"
          ? "Social Sign In"
          : op === "signInEmail"
          ? "Sign In Email"
          : op === "signUpEmail"
          ? "Sign Up Email"
          : op === "setActiveOrg"
          ? "Set Active Org"
          : op === "leaveOrg"
          ? "Leave Organization"
          : "Get Session",
    };
    onChange(nextDraft);
  };

  return (
    <div className="space-y-3.5 text-xs font-sans">
      {/* Target Auth Node Indicator */}
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-indigo-500/[0.08] border border-indigo-500/25">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
            <ShieldCheck size={12} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground text-[11px]">
              {authNodeLabel}
            </span>
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 font-mono text-indigo-600 dark:text-indigo-400 border-indigo-500/30 bg-indigo-500/10"
            >
              Better Auth SDK
            </Badge>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">
          @/lib/auth-client
        </span>
      </div>

      {/* Operation Selector */}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium text-foreground flex items-center justify-between">
          <span>Auth Operation</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            Client SDK Function
          </span>
        </Label>
        <Select
          value={operation}
          onValueChange={(val: any) => handleOperationChange(val)}
        >
          <SelectTrigger className="h-8 text-xs bg-background">
            <SelectValue placeholder="Select auth function..." />
          </SelectTrigger>
          <SelectContent>
            {AUTH_OPERATIONS.map((op) => {
              const Icon = op.icon;
              return (
                <SelectItem key={op.value} value={op.value}>
                  <div className="flex items-center gap-2">
                    <Icon size={12} className="text-indigo-500 shrink-0" />
                    <span className="font-medium">{op.label}</span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      — {op.description}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Operation Specific Configurations */}
      {operation === "signOut" && (
        <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
          <div className="flex items-center gap-1.5 text-foreground font-medium text-[11px]">
            <LogOut size={12} className="text-indigo-500" />
            <span>Session Termination</span>
          </div>
          <p className="text-[10.5px] text-muted-foreground leading-relaxed">
            Calls <code className="font-mono text-foreground font-semibold">authClient.signOut()</code> to invalidate the server session, clear the <code className="font-mono text-foreground">better-auth.session_token</code> cookie, and clean up local auth state.
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
            <Info size={11} className="text-indigo-500 shrink-0" />
            <span>Recommended: Add a following <strong>Navigate</strong> step to redirect the user to <code className="font-mono font-medium">/login</code>.</span>
          </div>
        </div>
      )}

      {operation === "signInSocial" && (
        <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-muted/20">
          <div className="space-y-1">
            <Label className="text-[10.5px] text-muted-foreground">OAuth Social Provider</Label>
            <Select
              value={draft.authProvider || "google"}
              onValueChange={(provider) => onChange({ ...draft, authProvider: provider })}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOCIAL_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10.5px] text-muted-foreground">Post-Login Callback URL</Label>
            <Input
              value={draft.authCallbackUrl ?? "/dashboard"}
              onChange={(e) => onChange({ ...draft, authCallbackUrl: e.target.value })}
              placeholder="/dashboard"
              className="h-7 text-xs bg-background font-mono"
            />
          </div>
        </div>
      )}

      {(operation === "signInEmail" || operation === "signUpEmail") && (
        <div className="space-y-3 p-3 rounded-lg border border-border/60 bg-muted/20">
          {operation === "signUpEmail" && (
            <div className="space-y-1">
              <Label className="text-[10.5px] text-muted-foreground">User Display Name Field</Label>
              <Input
                value={
                  draft.authNameSource?.kind === "user_input"
                    ? draft.authNameSource.fieldName
                    : "name"
                }
                onChange={(e) =>
                  onChange({
                    ...draft,
                    authNameSource: { kind: "user_input", fieldName: e.target.value },
                  })
                }
                placeholder="name"
                className="h-7 text-xs bg-background font-mono"
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-[10.5px] text-muted-foreground">Email Input Field</Label>
            <Input
              value={
                draft.authEmailSource?.kind === "user_input"
                  ? draft.authEmailSource.fieldName
                  : "email"
              }
              onChange={(e) =>
                onChange({
                  ...draft,
                  authEmailSource: { kind: "user_input", fieldName: e.target.value },
                })
              }
              placeholder="email"
              className="h-7 text-xs bg-background font-mono"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10.5px] text-muted-foreground">Password Input Field</Label>
            <Input
              value={
                draft.authPasswordSource?.kind === "user_input"
                  ? draft.authPasswordSource.fieldName
                  : "password"
              }
              onChange={(e) =>
                onChange({
                  ...draft,
                  authPasswordSource: { kind: "user_input", fieldName: e.target.value },
                })
              }
              placeholder="password"
              type="text"
              className="h-7 text-xs bg-background font-mono"
            />
          </div>
        </div>
      )}

      {(operation === "setActiveOrg" || operation === "leaveOrg") && (
        <div className="space-y-2 p-3 rounded-lg border border-border/60 bg-muted/20">
          <Label className="text-[10.5px] text-muted-foreground">Target Organization ID Field</Label>
          <Input
            value={
              draft.authOrgIdSource?.kind === "user_input"
                ? draft.authOrgIdSource.fieldName
                : "organizationId"
            }
            onChange={(e) =>
              onChange({
                ...draft,
                authOrgIdSource: { kind: "user_input", fieldName: e.target.value },
              })
            }
            placeholder="organizationId"
            className="h-7 text-xs bg-background font-mono"
          />
        </div>
      )}

      {operation === "getSession" && (
        <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1 text-[11px]">
          <div className="font-semibold text-foreground">Session Hydration</div>
          <p className="text-[10.5px] text-muted-foreground">
            Fetches active user data from Better Auth server and exposes session payload in <code className="font-mono text-foreground font-semibold">{outputVariable}</code>.
          </p>
        </div>
      )}

      {/* Output Context Variable */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between">
          <Label className="text-[10.5px] text-muted-foreground">
            Result Variable Name
          </Label>
          <span className="text-[10px] text-muted-foreground/80 font-mono">
            {`{ user, session, error }`}
          </span>
        </div>
        <Input
          value={outputVariable}
          onChange={(e) => onChange({ ...draft, authOutputVariable: e.target.value })}
          placeholder="authResult"
          className="h-7 text-xs bg-background font-mono"
        />
      </div>

      {/* Optional Branching Blocks */}
      <div className="pt-2 border-t border-border/40 space-y-3">
        {/* On Success Block Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/20">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={13} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-foreground">
                    On Success Block
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 font-mono text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  >
                    {!draft.authOutputVariable || draft.authOutputVariable === "authResult"
                      ? "!error"
                      : `!${draft.authOutputVariable}.error`}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Execute child actions when auth operation succeeds
                </span>
              </div>
            </div>
            <Switch
              checked={Boolean(draft.enableOnSuccess)}
              onCheckedChange={(checked) =>
                onChange({
                  ...draft,
                  enableOnSuccess: checked,
                  onSuccessSteps: checked ? draft.onSuccessSteps || [] : draft.onSuccessSteps,
                })
              }
            />
          </div>

          {draft.enableOnSuccess && (
            <div className="pl-2 border-l-2 border-emerald-500/40 ml-1">
              <SubActionStepList
                title="On Success Pipeline"
                variantColor="emerald"
                badgeLabel="on_success"
                parentOutputVariable={outputVariable}
                steps={draft.onSuccessSteps || []}
                onChange={(steps) => onChange({ ...draft, onSuccessSteps: steps })}
                allNodes={allNodes}
                serviceNodes={serviceNodes}
                endpoints={endpoints}
                webPageNodeId={webPageNodeId}
                actionId={actionId}
                actionItem={actionItem}
                isProtected={isProtected}
                incomingPaths={incomingPaths}
                isItemScoped={isItemScoped}
                itemKeyField={itemKeyField}
                itemSourceStateName={itemSourceStateName}
                itemPropSuggestions={itemPropSuggestions}
              />
            </div>
          )}
        </div>

        {/* On Error Block Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 rounded-lg bg-rose-500/[0.04] border border-rose-500/20">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <AlertCircle size={13} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-foreground">
                    On Error Block
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 font-mono text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10"
                  >
                    {!draft.authOutputVariable || draft.authOutputVariable === "authResult"
                      ? "error"
                      : `${draft.authOutputVariable}.error`}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Execute child actions when auth operation fails
                </span>
              </div>
            </div>
            <Switch
              checked={Boolean(draft.enableOnError)}
              onCheckedChange={(checked) =>
                onChange({
                  ...draft,
                  enableOnError: checked,
                  onErrorSteps: checked ? draft.onErrorSteps || [] : draft.onErrorSteps,
                })
              }
            />
          </div>

          {draft.enableOnError && (
            <div className="pl-2 border-l-2 border-rose-500/40 ml-1">
              <SubActionStepList
                title="On Error Pipeline"
                variantColor="rose"
                badgeLabel="on_error"
                parentOutputVariable={outputVariable}
                steps={draft.onErrorSteps || []}
                onChange={(steps) => onChange({ ...draft, onErrorSteps: steps })}
                allNodes={allNodes}
                serviceNodes={serviceNodes}
                endpoints={endpoints}
                webPageNodeId={webPageNodeId}
                actionId={actionId}
                actionItem={actionItem}
                isProtected={isProtected}
                incomingPaths={incomingPaths}
                isItemScoped={isItemScoped}
                itemKeyField={itemKeyField}
                itemSourceStateName={itemSourceStateName}
                itemPropSuggestions={itemPropSuggestions}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

