import React from "react";
import { Label } from "@workspace/ui/components/label";
import { LocalInput } from "./LocalInput";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Switch } from "@workspace/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { Users, Mail } from "lucide-react";
import { OrgInvitationsConfig } from "@workspace/canvas";
import { AuthConfigSectionProps } from "./types";

export const AuthOrgRbacSection: React.FC<AuthConfigSectionProps> = ({
  data,
  updateData,
}) => {
  const enabledPlugins = data.plugins || ["bearer", "admin", "organization", "jwt"];
  const org = data.organization || {
    enabled: true,
    roles: ["owner", "admin", "member"],
    teams: true,
    multiOrg: true,
    invitations: true,
    invitationsConfig: {
      deliveryMethod: "email",
      inviteExpiresInDays: 7,
      defaultRole: "member",
      allowMemberInvites: false,
    },
  };

  const invitationsConfig: OrgInvitationsConfig = org.invitationsConfig || {
    deliveryMethod: "email",
    inviteExpiresInDays: 7,
    defaultRole: "member",
    allowMemberInvites: false,
  };

  return (
    <AccordionItem
      value="org"
      className="rounded-xl border bg-card/50 shadow-sm backdrop-blur-sm overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2 text-left flex-1">
          <Users className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Organization & RBAC
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
            {org.enabled ? "Active" : "Disabled"}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-1">
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">Enable Organization Management</Label>
                <p className="text-[11px] text-muted-foreground">Multi-tenant workspace memberships & roles.</p>
              </div>
              <Switch
                checked={org.enabled}
                onCheckedChange={(c) => {
                  const isChecked = Boolean(c);
                  const nextPlugins = isChecked
                    ? Array.from(new Set([...enabledPlugins, "organization"]))
                    : enabledPlugins.filter((p) => p !== "organization");
                  updateData({
                    organization: { ...org, enabled: isChecked },
                    plugins: nextPlugins,
                  });
                }}
              />
            </div>

            {org.enabled && (
              <div className="flex flex-col gap-4 pt-3 border-t border-border/40 text-xs">
                {/* Organization Roles List */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold">Organization Roles</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {org.roles?.map((role, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded bg-primary/10 text-primary font-mono text-xs flex items-center gap-1 border border-primary/20"
                      >
                        {role}
                        {role !== "owner" && role !== "admin" && role !== "member" && (
                          <button
                            onClick={() => {
                              const updated = (org.roles || []).filter((_, i) => i !== idx);
                              updateData({ organization: { ...org, roles: updated } });
                            }}
                            className="hover:text-destructive"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="org-teams"
                      checked={org.teams}
                      onCheckedChange={(c) => updateData({ organization: { ...org, teams: Boolean(c) } })}
                    />
                    <Label htmlFor="org-teams" className="text-xs font-normal cursor-pointer">
                      Teams Sub-groups
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="org-multi"
                      checked={org.multiOrg}
                      onCheckedChange={(c) => updateData({ organization: { ...org, multiOrg: Boolean(c) } })}
                    />
                    <Label htmlFor="org-multi" className="text-xs font-normal cursor-pointer">
                      Multi-Org per user
                    </Label>
                  </div>
                </div>

                {/* Member Invitation & Onboarding Flow Card */}
                <div className="flex flex-col gap-3 p-3 rounded bg-background border border-border/40 mt-1">
                  <Label className="text-[11px] font-semibold flex items-center gap-1.5 text-primary">
                    <Mail className="w-3.5 h-3.5" /> Member Invitation & Onboarding Policy
                  </Label>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground font-medium">Delivery Method</span>
                      <Select
                        value={invitationsConfig.deliveryMethod || "email"}
                        onValueChange={(val: string) => {
                          if (val === "email" || val === "link" || val === "both") {
                            updateData({
                              organization: {
                                ...org,
                                invitationsConfig: { ...invitationsConfig, deliveryMethod: val },
                              },
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email" className="text-xs">Email Invite</SelectItem>
                          <SelectItem value="link" className="text-xs">Shareable Link</SelectItem>
                          <SelectItem value="both" className="text-xs">Email & Link</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground font-medium">Invite Expiry</span>
                      <div className="flex items-center gap-1">
                        <LocalInput
                          className="h-7 text-xs font-mono bg-background"
                          type="number"
                          value={invitationsConfig.inviteExpiresInDays ?? 7}
                          onChange={(e) =>
                            updateData({
                              organization: {
                                ...org,
                                invitationsConfig: {
                                  ...invitationsConfig,
                                  inviteExpiresInDays: parseInt(e.target.value, 10) || 7,
                                },
                              },
                            })
                          }
                        />
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">Days</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground font-medium">Default Role</span>
                      <Select
                        value={invitationsConfig.defaultRole || "member"}
                        onValueChange={(val) =>
                          updateData({
                            organization: {
                              ...org,
                              invitationsConfig: { ...invitationsConfig, defaultRole: val },
                            },
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs font-mono bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="font-mono">
                          {(org.roles || ["owner", "admin", "member"]).map((r) => (
                            <SelectItem key={r} value={r} className="text-xs font-mono">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="allow-mem-invites"
                      checked={invitationsConfig.allowMemberInvites ?? false}
                      onCheckedChange={(c) =>
                        updateData({
                          organization: {
                            ...org,
                            invitationsConfig: { ...invitationsConfig, allowMemberInvites: Boolean(c) },
                          },
                        })
                      }
                    />
                    <Label htmlFor="allow-mem-invites" className="text-[11px] font-normal cursor-pointer text-muted-foreground">
                      Allow standard members to send invitations (default: Owners/Admins only)
                    </Label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
