import React from "react";
import { LocalInput } from "./LocalInput";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
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
import {
  Settings,
  Plus,
  Trash,
  Clock,
  Info,
  ArrowRight,
  Database
} from "lucide-react";
import { SessionClaimConfig, SessionConfig } from "@workspace/canvas";
import { getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";
import { AuthConfigSectionProps } from "./types";

export const AuthSessionSection: React.FC<AuthConfigSectionProps> = ({
  data,
  updateData,
  allNodes,
}) => {
  const sessionConfig: SessionConfig = data.session || {
    claims: [
      { key: "orgRole", source: "orgRole", deliveryMode: "jwt", destination: "jwt" },
      { key: "subscriptionStatus", source: "entityColumn", targetValue: "status", deliveryMode: "session", destination: "session" },
      { key: "planId", source: "entityColumn", targetValue: "plan_id", deliveryMode: "jwt", destination: "jwt" },
    ],
    expiresInSeconds: 604800, // 7 days
    updateAgeSeconds: 86400, // 1 day
    cookieCache: {
      enabled: true,
      maxAgeSeconds: 300, // 5 minutes
    },
    rememberMeDurationDays: 30,
  };

  const claims: SessionClaimConfig[] = sessionConfig.claims || [];
  const cookieCache = sessionConfig.cookieCache || { enabled: true, maxAgeSeconds: 300 };

  const selectedDatabaseId = data.databaseId;
  const schemaEntities = allNodes.filter(
    (n) =>
      n.type === "entity" &&
      (!selectedDatabaseId || n.data?.databaseId === selectedDatabaseId),
  );
  const serviceNodes = allNodes.filter((n) => n.type === "service" || n.type === "webPage");

  const selectedUserSchemaId = data.userEntityId || data.userSchemaId;
  const selectedUserEntity = schemaEntities.find((n) => n.id === selectedUserSchemaId);
  const userColumns = selectedUserEntity?.data.columns || [];

  const subConfig = data.subscription;
  const selectedSubEntity = schemaEntities.find(
    (n) => n.id === (subConfig?.entityId || subConfig?.schemaId),
  );
  const subColumns = selectedSubEntity?.data.columns || [];

  const allDbOps = schemaEntities.flatMap((e) =>
    getEntityDbOperations(e, allNodes)
      .filter((op) => op.enabled !== false)
      .map((op) => ({
        id: op.id,
        name: `${e.data.label}.${op.name}`,
      })),
  );

  const allEndpoints = serviceNodes.flatMap((s) =>
    (s.data.endpoints || []).map((ep) => ({
      id: ep.id,
      name: `${s.data.label}: ${ep.type || "GET"} ${ep.name || ""}`,
    })),
  );

  const getDeliveryMode = (claim: SessionClaimConfig): "jwt" | "session" | "oauthToken" => {
    if (claim.destination === "oauthToken" || claim.deliveryMode === "oauthToken") return "oauthToken";
    if (claim.destination === "session" || claim.deliveryMode === "session" || claim.deliveryMode === "cookie") return "session";
    return "jwt";
  };

  return (
    <AccordionItem
      value="session"
      className="rounded-xl border bg-card/50 shadow-sm backdrop-blur-sm overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline hover:bg-muted/30 transition-colors">
        <div className="flex items-center gap-2 text-left flex-1">
          <Settings className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Session & Token Claims
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
            {claims.length} claims
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-1">
        <div className="flex flex-col gap-4 pt-2">
          {/* Session Lifetime & Cookie Cache Policy Card */}
          <div className="flex flex-col gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40 text-xs">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-primary" /> Session Lifetime & Cookie Cache
              </Label>
              <span className="text-[10px] text-muted-foreground font-mono">Better Auth Core</span>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground font-medium">Expires In</Label>
                <Select
                  value={String(sessionConfig.expiresInSeconds ?? 604800)}
                  onValueChange={(val) =>
                    updateData({
                      session: { ...sessionConfig, expiresInSeconds: parseInt(val, 10) },
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs font-mono bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="font-mono">
                    <SelectItem value="3600" className="text-xs font-mono">1 Hour</SelectItem>
                    <SelectItem value="86400" className="text-xs font-mono">24 Hours</SelectItem>
                    <SelectItem value="604800" className="text-xs font-mono">7 Days</SelectItem>
                    <SelectItem value="2592000" className="text-xs font-mono">30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground font-medium">Update Age</Label>
                <Select
                  value={String(sessionConfig.updateAgeSeconds ?? 86400)}
                  onValueChange={(val) =>
                    updateData({
                      session: { ...sessionConfig, updateAgeSeconds: parseInt(val, 10) },
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-xs font-mono bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="font-mono">
                    <SelectItem value="0" className="text-xs font-mono">Disabled</SelectItem>
                    <SelectItem value="3600" className="text-xs font-mono">1 Hour</SelectItem>
                    <SelectItem value="86400" className="text-xs font-mono">1 Day</SelectItem>
                    <SelectItem value="604800" className="text-xs font-mono">7 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground font-medium">Remember Me</Label>
                <div className="flex items-center gap-1">
                  <LocalInput
                    className="h-7 text-xs font-mono bg-background"
                    type="number"
                    value={sessionConfig.rememberMeDurationDays ?? 30}
                    onChange={(e) =>
                      updateData({
                        session: { ...sessionConfig, rememberMeDurationDays: parseInt(e.target.value, 10) || 30 },
                      })
                    }
                  />
                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono">Days</span>
                </div>
              </div>
            </div>

            {/* Cookie Cache Configuration */}
            <div className="flex items-center justify-between pt-2.5 border-t border-border/40">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cookie-cache"
                  checked={cookieCache.enabled ?? true}
                  onCheckedChange={(c) =>
                    updateData({
                      session: {
                        ...sessionConfig,
                        cookieCache: {
                          ...cookieCache,
                          enabled: Boolean(c),
                        },
                      },
                    })
                  }
                />
                <Label htmlFor="cookie-cache" className="text-[11px] font-normal cursor-pointer flex items-center gap-1">
                  <Database className="w-3 h-3 text-primary shrink-0" /> Enable Cookie Cache (Prevents DB lookup per request)
                </Label>
              </div>

              {cookieCache.enabled !== false && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-mono">Max Age:</span>
                  <LocalInput
                    className="h-6 w-16 text-[11px] font-mono bg-background text-right"
                    type="number"
                    value={cookieCache.maxAgeSeconds ?? 300}
                    onChange={(e) =>
                      updateData({
                        session: {
                          ...sessionConfig,
                          cookieCache: {
                            ...cookieCache,
                            maxAgeSeconds: parseInt(e.target.value, 10) || 300,
                          },
                        },
                      })
                    }
                  />
                  <span className="text-[10px] text-muted-foreground font-mono">s</span>
                </div>
              )}
            </div>
          </div>

          {/* Architecture Banner & Freshness Notice */}
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-xs text-primary dark:text-primary">
            <div className="flex items-center gap-1.5 font-semibold mb-1">
              <Info className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Session vs. JWT & Access Token Delivery:</span>
            </div>
            <ul className="list-disc list-inside gap-1 flex flex-col text-[11px] text-muted-foreground">
              <li>
                <strong className="text-foreground">Cookie Session Delivery</strong>: Native Better Auth session (cookie + DB/cache). Dynamically resolved live or stored in session payload via <code className="font-mono text-[10px] bg-primary/15 px-1 py-0.5 rounded">customSession</code>.
              </li>
              <li>
                <strong className="text-foreground">JWT & OAuth Token Delivery</strong>: Issued via <code className="font-mono text-[10px] bg-primary/15 px-1 py-0.5 rounded">jwt()</code> plugin or OAuth claims. 0 DB roundtrips on Edge middleware, but claims are <em>frozen at issuance</em> until token refresh.
              </li>
            </ul>
          </div>

          {/* Configured Session & Token Claims Table */}
          <div className="flex flex-col gap-3 p-3.5 bg-background/50 rounded-lg border border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <Label className="text-xs font-semibold">Configured Session & Token Claims</Label>
                <span className="text-[11px] text-muted-foreground">
                  Map data sources (User, Org, Sub, DB) to JWT or Session delivery
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs bg-background"
                onClick={() => {
                  const newClaim: SessionClaimConfig = {
                    key: `claim_${claims.length + 1}`,
                    source: "entityColumn",
                    deliveryMode: "jwt",
                    destination: "jwt",
                  };
                  const updated: SessionClaimConfig[] = [...claims, newClaim];
                  updateData({ session: { ...sessionConfig, claims: updated } });
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Claim
              </Button>
            </div>

            <div className="flex flex-col gap-2.5">
              {claims.map((claim, idx) => {
                const delivery = getDeliveryMode(claim);

                // Resolve active entity based on source value
                let activeEntityId = claim.entityId;
                if (claim.source.startsWith("table:")) {
                  activeEntityId = claim.source.replace("table:", "");
                } else if (claim.source === "userColumn") {
                  activeEntityId = selectedUserSchemaId || schemaEntities.find((e) => e.data.label.toLowerCase().includes("user"))?.id || schemaEntities[0]?.id;
                } else if (claim.source === "subscription") {
                  activeEntityId = subConfig?.entityId || schemaEntities.find((e) => e.data.label.toLowerCase().includes("sub"))?.id || schemaEntities[0]?.id;
                }

                const activeEntity = schemaEntities.find((e) => e.id === activeEntityId);
                const isTableSource =
                  claim.source.startsWith("table:") ||
                  claim.source === "userColumn" ||
                  claim.source === "subscription" ||
                  claim.source === "entityColumn" ||
                  claim.source === "customField";

                const activeEntityName = activeEntity?.data.label || (claim.source === "userColumn" ? "User" : claim.source === "subscription" ? "Sub" : "Entity");

                const sourceLabel = isTableSource
                  ? `${activeEntityName}.${claim.targetValue || "field"}`
                  : claim.source === "orgRole"
                  ? "Org.role"
                  : claim.targetValue || claim.source;

                // Other entity nodes not explicitly user/subscription
                const customEntities = schemaEntities.filter(
                  (e) => e.id !== selectedUserSchemaId && e.id !== subConfig?.entityId,
                );

                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 p-2.5 rounded-lg bg-background border border-border/50 text-xs"
                  >
                    {/* Row 1: JWT Token selector + delete */}
                    <div className="flex items-center justify-between gap-2">
                      <Select
                        value={delivery}
                        onValueChange={(val: "jwt" | "session" | "oauthToken") => {
                          const updated = claims.map((c, i) =>
                            i === idx ? { ...c, deliveryMode: val, destination: val } : c,
                          );
                          updateData({ session: { ...sessionConfig, claims: updated } });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs font-mono bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="font-mono">
                          <SelectItem value="jwt" className="text-xs font-mono">
                            JWT Token (Edge)
                          </SelectItem>
                          <SelectItem value="session" className="text-xs font-mono">
                            Cookie Session (DB)
                          </SelectItem>
                          <SelectItem value="oauthToken" className="text-xs font-mono">
                            OAuth Access Token
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <button
                        onClick={() => {
                          const updated = claims.filter((_, i) => i !== idx);
                          updateData({ session: { ...sessionConfig, claims: updated } });
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Row 2: Claim key + Source/Table selector */}
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <LocalInput
                        className="h-7 text-xs font-mono bg-background"
                        value={claim.key}
                        placeholder="claim_name"
                        onChange={(e) => {
                          const updated = claims.map((c, i) =>
                            i === idx ? { ...c, key: e.target.value } : c,
                          );
                          updateData({ session: { ...sessionConfig, claims: updated } });
                        }}
                      />

                      <Select
                        value={claim.source}
                        onValueChange={(val: string) => {
                          let entId = claim.entityId;
                          if (val.startsWith("table:")) {
                            entId = val.replace("table:", "");
                          } else if (val === "userColumn") {
                            entId = selectedUserSchemaId;
                          } else if (val === "subscription") {
                            entId = subConfig?.entityId;
                          }
                          const updated = claims.map((c, i) =>
                            i === idx ? { ...c, source: val, entityId: entId, targetValue: "" } : c,
                          );
                          updateData({ session: { ...sessionConfig, claims: updated } });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {customEntities.map((ent) => (
                            <SelectItem key={ent.id} value={`table:${ent.id}`} className="text-xs font-mono">
                              {ent.data.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Target column selector when a table is selected */}
                    {isTableSource && (
                      <div className="flex items-center gap-2 pl-1 pt-1 border-t border-border/30">
                        <span className="text-[11px] text-muted-foreground shrink-0 font-medium">
                          {activeEntityName} Column:
                        </span>
                        {(() => {
                          const cols = activeEntity?.data.columns || [];

                          return cols.length > 0 ? (
                            <Select
                              value={claim.targetValue || ""}
                              onValueChange={(val) => {
                                const updated = claims.map((c, i) =>
                                  i === idx ? { ...c, targetValue: val } : c,
                                );
                                updateData({ session: { ...sessionConfig, claims: updated } });
                              }}
                            >
                              <SelectTrigger className="h-6 text-[11px] font-mono bg-background/80">
                                <SelectValue placeholder={`Select column`} />
                              </SelectTrigger>
                              <SelectContent className="font-mono">
                                {cols.map((col) => (
                                  <SelectItem key={col.name} value={col.name} className="text-xs font-mono">
                                    {col.name} ({col.type})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <LocalInput
                              className="h-6 text-[11px] font-mono bg-background/80"
                              placeholder={`e.g. role, status, plan_id`}
                              value={claim.targetValue || ""}
                              onChange={(e) => {
                                const updated = claims.map((c, i) =>
                                  i === idx ? { ...c, targetValue: e.target.value } : c,
                                );
                                updateData({ session: { ...sessionConfig, claims: updated } });
                              }}
                            />
                          );
                        })()}
                      </div>
                    )}

                    {claim.source === "dbFunction" && (
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[11px] text-muted-foreground shrink-0 font-medium">DB Operation:</span>
                        {allDbOps.length > 0 ? (
                          <Select
                            value={claim.targetValue || ""}
                            onValueChange={(val) => {
                              const updated = claims.map((c, i) => (i === idx ? { ...c, targetValue: val } : c));
                              updateData({ session: { ...sessionConfig, claims: updated } });
                            }}
                          >
                            <SelectTrigger className="h-6 text-[11px] font-mono bg-background/80">
                              <SelectValue placeholder="Select DB operation..." />
                            </SelectTrigger>
                            <SelectContent className="font-mono">
                              {allDbOps.map((op) => (
                                <SelectItem key={op.id} value={op.name} className="text-xs font-mono">
                                  {op.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <LocalInput
                            className="h-6 text-[11px] font-mono bg-background/80"
                            placeholder="e.g. getUserPermissions, findSubscription"
                            value={claim.targetValue || ""}
                            onChange={(e) => {
                              const updated = claims.map((c, i) => (i === idx ? { ...c, targetValue: e.target.value } : c));
                              updateData({ session: { ...sessionConfig, claims: updated } });
                            }}
                          />
                        )}
                      </div>
                    )}

                    {claim.source === "serviceEndpoint" && (
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[11px] text-muted-foreground shrink-0 font-medium">Endpoint:</span>
                        {allEndpoints.length > 0 ? (
                          <Select
                            value={claim.targetValue || ""}
                            onValueChange={(val) => {
                              const updated = claims.map((c, i) => (i === idx ? { ...c, targetValue: val } : c));
                              updateData({ session: { ...sessionConfig, claims: updated } });
                            }}
                          >
                            <SelectTrigger className="h-6 text-[11px] font-mono bg-background/80">
                              <SelectValue placeholder="Select Service Endpoint..." />
                            </SelectTrigger>
                            <SelectContent className="font-mono">
                              {allEndpoints.map((ep) => (
                                <SelectItem key={ep.id} value={ep.name} className="text-xs font-mono">
                                  {ep.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <LocalInput
                            className="h-6 text-[11px] font-mono bg-background/80"
                            placeholder="e.g. GET /api/v1/user/claims"
                            value={claim.targetValue || ""}
                            onChange={(e) => {
                              const updated = claims.map((c, i) => (i === idx ? { ...c, targetValue: e.target.value } : c));
                              updateData({ session: { ...sessionConfig, claims: updated } });
                            }}
                          />
                        )}
                      </div>
                    )}

                    {claim.source === "customFunction" && (
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-[11px] text-muted-foreground shrink-0 font-medium">Function:</span>
                        <LocalInput
                          className="h-6 text-[11px] font-mono bg-background/80"
                          placeholder="e.g. resolveUserClaims(ctx)"
                          value={claim.targetValue || ""}
                          onChange={(e) => {
                            const updated = claims.map((c, i) => (i === idx ? { ...c, targetValue: e.target.value } : c));
                            updateData({ session: { ...sessionConfig, claims: updated } });
                          }}
                        />
                      </div>
                    )}

                    {/* Flow Preview Badge */}
                    <div className="flex items-center gap-1.5 pt-1 px-1 text-[10px] font-mono text-muted-foreground">
                      <span className="px-1.5 py-0.5 rounded bg-muted font-medium text-foreground">
                        {claim.key || "claim"}
                      </span>
                      <span>:</span>
                      <span className="text-muted-foreground">{sourceLabel}</span>
                      <ArrowRight className="w-3 h-3 text-primary shrink-0" />
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        {delivery === "jwt" ? "JWT Token Payload" : delivery === "oauthToken" ? "OAuth Access Token" : "Cookie Session Payload"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

