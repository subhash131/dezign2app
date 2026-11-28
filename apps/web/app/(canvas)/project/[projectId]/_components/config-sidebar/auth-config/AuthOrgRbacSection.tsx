import React, { useState } from "react";
import { Label } from "@workspace/ui/components/label";
import { LocalInput } from "./LocalInput";
import { Button } from "@workspace/ui/components/button";
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
import { Users, Mail, Shield, Plus } from "lucide-react";
import {
  AUTH_FRAMEWORK_BETTER_AUTH,
  DEFAULT_AUTH_FRAMEWORK,
  DEFAULT_ORG_ROLES,
  DEFAULT_USER_ROLES,
  OrgInvitationsConfig,
  RbacConfig,
} from "@workspace/canvas";
import { AuthConfigSectionProps } from "./types";

/**
 * Normalizes a user-entered role name into a clean lowercase identifier
 * (e.g. "Billing Manager" -> "billing_manager").
 */
function normalizeRoleSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

export const AuthOrgRbacSection: React.FC<AuthConfigSectionProps> = ({
  data,
  updateData,
}) => {
  const isBetterAuth =
    (data.framework || DEFAULT_AUTH_FRAMEWORK) === AUTH_FRAMEWORK_BETTER_AUTH;
  const enabledPlugins = data.plugins || ["bearer", "admin", "organization", "jwt"];

  const rbac: RbacConfig = data.rbac || {};
  const userRoles =
    rbac.roles && rbac.roles.length > 0 ? rbac.roles : [...DEFAULT_USER_ROLES];
  const defaultUserRole = rbac.defaultRole || "user";
  const adminRoles =
    rbac.adminRoles && rbac.adminRoles.length > 0 ? rbac.adminRoles : ["admin"];

  const [newUserRole, setNewUserRole] = useState("");
  const [newOrgRole, setNewOrgRole] = useState("");

  const org = data.organization || {
    enabled: true,
    roles: [...DEFAULT_ORG_ROLES],
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
  const orgRoles =
    org.roles && org.roles.length > 0 ? org.roles : [...DEFAULT_ORG_ROLES];

  const invitationsConfig: OrgInvitationsConfig = org.invitationsConfig || {
    deliveryMethod: "email",
    inviteExpiresInDays: 7,
    defaultRole: "member",
    allowMemberInvites: false,
  };

  const handleAddUserRole = () => {
    const slug = normalizeRoleSlug(newUserRole);
    if (!slug || userRoles.includes(slug)) {
      setNewUserRole("");
      return;
    }
    updateData({
      rbac: {
        ...rbac,
        roles: [...userRoles, slug],
      },
    });
    setNewUserRole("");
  };

  const handleAddOrgRole = () => {
    const slug = normalizeRoleSlug(newOrgRole);
    if (!slug || orgRoles.includes(slug)) {
      setNewOrgRole("");
      return;
    }
    updateData({
      organization: {
        ...org,
        roles: [...orgRoles, slug],
      },
    });
    setNewOrgRole("");
  };

  const toggleAdminRole = (role: string) => {
    const exists = adminRoles.includes(role);
    const next = exists
      ? adminRoles.filter((r) => r !== role)
      : [...adminRoles, role];
    updateData({
      rbac: {
        ...rbac,
        roles: userRoles,
        adminRoles: next.length > 0 ? next : ["admin"],
      },
    });
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
            Roles &amp; RBAC
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
            {userRoles.length} user{isBetterAuth && org.enabled ? ` · ${orgRoles.length} org` : ""}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-1">
        <div className="flex flex-col gap-4 pt-2">
          {/* App / Global User Roles Card (shared across Better Auth admin() & future IdPs) */}
          <div className="flex flex-col gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" /> Global User Roles
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Roles available in endpoint, page, and <code className="font-mono text-[10px]">Verify Auth</code> dropdowns.
                </p>
              </div>
            </div>

            {/* User Roles Pills + Add Input */}
            <div className="flex flex-wrap gap-1.5">
              {userRoles.map((role, idx) => (
                <span
                  key={role}
                  className="px-2 py-1 rounded bg-primary/10 text-primary font-mono text-xs flex items-center gap-1 border border-primary/20"
                >
                  {role}
                  {role !== "user" && role !== "admin" && (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = userRoles.filter((_, i) => i !== idx);
                        updateData({
                          rbac: {
                            ...rbac,
                            roles: updated,
                            defaultRole:
                              defaultUserRole === role ? "user" : defaultUserRole,
                            adminRoles: adminRoles.filter((r) => r !== role),
                          },
                        });
                      }}
                      className="hover:text-destructive cursor-pointer"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <LocalInput
                className="h-7 text-xs font-mono bg-background"
                placeholder="Add user role (e.g. editor, moderator)..."
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddUserRole();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs shrink-0 gap-1"
                onClick={handleAddUserRole}
              >
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>

            {/* Better Auth admin() plugin options */}
            {isBetterAuth && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground font-medium">
                    Default User Role (<code className="font-mono">admin.defaultRole</code>)
                  </Label>
                  <Select
                    value={userRoles.includes(defaultUserRole) ? defaultUserRole : "user"}
                    onValueChange={(val) =>
                      updateData({
                        rbac: { ...rbac, roles: userRoles, defaultRole: val },
                      })
                    }
                  >
                    <SelectTrigger className="h-7 text-xs font-mono bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="font-mono">
                      {userRoles.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs font-mono">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground font-medium">
                    Admin-Privileged Roles (<code className="font-mono">adminRoles</code>)
                  </Label>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {userRoles.map((r) => {
                      const active = adminRoles.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => toggleAdminRole(r)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                            active
                              ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/40 font-semibold"
                              : "bg-background text-muted-foreground border-border/60 hover:text-foreground"
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Better Auth Organization Plugin & Org Roles Card */}
          {isBetterAuth && (
            <div className="flex flex-col gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold">Enable Organization Management</Label>
                  <p className="text-[11px] text-muted-foreground">Multi-tenant workspace memberships &amp; roles.</p>
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
                  {/* Organization Roles List + Add Input */}
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs font-semibold">Organization Roles</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {orgRoles.map((role, idx) => (
                        <span
                          key={role}
                          className="px-2 py-1 rounded bg-primary/10 text-primary font-mono text-xs flex items-center gap-1 border border-primary/20"
                        >
                          {role}
                          {role !== "owner" && role !== "admin" && role !== "member" && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = orgRoles.filter((_, i) => i !== idx);
                                updateData({ organization: { ...org, roles: updated } });
                              }}
                              className="hover:text-destructive cursor-pointer"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <LocalInput
                        className="h-7 text-xs font-mono bg-background"
                        placeholder="Add org role (e.g. billing_manager)..."
                        value={newOrgRole}
                        onChange={(e) => setNewOrgRole(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddOrgRole();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs shrink-0 gap-1"
                        onClick={handleAddOrgRole}
                      >
                        <Plus className="w-3 h-3" /> Add
                      </Button>
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
                          {orgRoles.map((r) => (
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
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
