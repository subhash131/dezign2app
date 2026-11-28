"use client";

import React from "react";
import { BackendNode } from "@workspace/canvas/types";
import {
  AUTH_FRAMEWORK_BETTER_AUTH,
  DEFAULT_AUTH_FRAMEWORK,
} from "@workspace/canvas";
import { Label } from "@workspace/ui/components/label";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { ShieldCheck } from "lucide-react";
import { BindingSourceEditor } from "./BindingSourceEditor";
import { RoleMultiSelectDropdown } from "../RoleMultiSelectDropdown";
import { AvailableSource, PipelineStepDraft, StepBinding } from "./types";

export interface AuthVerifyStepSectionProps {
  step: PipelineStepDraft;
  allNodes: BackendNode[];
  availableSources: AvailableSource[];
  serviceNodeId?: string;
  onChange: (updated: PipelineStepDraft) => void;
}

/**
 * Step editor UI for `auth_verify` in Service B (supports both HTTP endpoints and Kafka consumers).
 *
 * Why:
 * - Allows explicit token verification inside Kafka consumer pipelines (where route-level
 *   middleware does not exist) or mid-pipeline in HTTP endpoints.
 * - Gates Better Auth–specific session mode (`better_auth_session`) behind
 *   `framework === "better_auth"` so future IdPs only see provider-agnostic JWKS mode.
 */
export const AuthVerifyStepSection: React.FC<AuthVerifyStepSectionProps> = ({
  step,
  allNodes,
  availableSources,
  serviceNodeId,
  onChange,
}) => {
  const authNodes = allNodes.filter((n) => n.type === "auth");
  const selectedAuthNode =
    authNodes.find((a) => a.id === step.authVerifyAuthNodeId) || authNodes[0];
  const isBetterAuth =
    (selectedAuthNode?.data?.framework || DEFAULT_AUTH_FRAMEWORK) ===
    AUTH_FRAMEWORK_BETTER_AUTH;

  const tokenBinding: StepBinding = step.inputBindings?.[0] || {
    argName: "token",
    source: { kind: "event_headers", field: "authorization" },
  };

  const handleTokenBindingChange = (updatedBinding: StepBinding) => {
    const rest = (step.inputBindings || []).slice(1);
    onChange({
      ...step,
      inputBindings: [{ ...updatedBinding, argName: "token" }, ...rest],
    });
  };

  return (
    <div className="flex flex-col gap-2.5 p-2.5 rounded-lg bg-indigo-500/[0.04] border border-indigo-500/20">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 flex items-center gap-1">
          <ShieldCheck size={11} /> Token Verification Step
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">
          Outputs AuthUser ({step.outputVariable || "verifiedAuth"})
        </span>
      </div>

      {/* 1. Token Source Binding (Kafka header, payload field, or HTTP header) */}
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] text-muted-foreground">
          Token Source (e.g. Kafka <code className="font-mono">headers.authorization</code> or <code className="font-mono">payload.authToken</code>)
        </Label>
        <BindingSourceEditor
          binding={tokenBinding}
          availableSources={availableSources}
          onChange={handleTokenBindingChange}
          serviceNodeId={serviceNodeId}
          placeholder="Bearer token or expression..."
        />
      </div>

      {/* 2. Target Auth Provider & Verification Mode */}
      <div className="grid grid-cols-2 gap-2">
        {authNodes.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] text-muted-foreground">Auth Provider</Label>
            <Select
              value={selectedAuthNode?.id || ""}
              onValueChange={(val) =>
                onChange({ ...step, authVerifyAuthNodeId: val })
              }
            >
              <SelectTrigger className="h-7 text-xs bg-background/70 border-border/60 font-mono">
                <SelectValue placeholder="Select Auth Server..." />
              </SelectTrigger>
              <SelectContent className="font-mono">
                {authNodes.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs font-mono">
                    {a.data?.label || "Auth Server"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Verification Mode</Label>
          <Select
            value={
              !isBetterAuth && step.authVerifyMode === "better_auth_session"
                ? "jwks"
                : step.authVerifyMode || "jwks"
            }
            onValueChange={(val: "auto" | "jwks" | "better_auth_session") =>
              onChange({ ...step, authVerifyMode: val })
            }
          >
            <SelectTrigger className="h-7 text-xs bg-background/70 border-border/60 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="font-mono">
              <SelectItem value="jwks" className="text-xs font-mono">
                JWKS (Stateless Public Key)
              </SelectItem>
              <SelectItem value="auto" className="text-xs font-mono">
                Auto (Service Strategy)
              </SelectItem>
              {isBetterAuth && (
                <SelectItem value="better_auth_session" className="text-xs font-mono">
                  Better Auth Session (DB/HTTP)
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 3. Expiration Policy (especially for async Kafka queues/DLQs) & Required Roles */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Expiration Policy</Label>
          <Select
            value={step.authVerifyExpirationPolicy || "strict"}
            onValueChange={(val: "strict" | "verify_signature_ignore_exp") =>
              onChange({ ...step, authVerifyExpirationPolicy: val })
            }
          >
            <SelectTrigger className="h-7 text-xs bg-background/70 border-border/60 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="font-mono">
              <SelectItem value="strict" className="text-xs font-mono">
                Strict (Reject Expired JWT)
              </SelectItem>
              <SelectItem
                value="verify_signature_ignore_exp"
                className="text-xs font-mono"
              >
                Async Kafka (Verify Sig, Ignore Exp)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">
            Required Roles
          </Label>
          <RoleMultiSelectDropdown
            selectedRoles={step.authVerifyRequiredRoles || []}
            onChange={(roles) =>
              onChange({
                ...step,
                authVerifyRequiredRoles: roles,
              })
            }
            authNode={selectedAuthNode}
            placeholder="Any valid user"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <Checkbox
          id={`auth-verify-revocation-${step.id}`}
          checked={step.authVerifyCheckRedisRevocation ?? false}
          onCheckedChange={(checked) =>
            onChange({
              ...step,
              authVerifyCheckRedisRevocation: Boolean(checked),
            })
          }
        />
        <Label
          htmlFor={`auth-verify-revocation-${step.id}`}
          className="text-[10px] text-muted-foreground font-normal cursor-pointer"
        >
          Check Redis revocation blocklist (recommended with Async Kafka signature verification)
        </Label>
      </div>
    </div>
  );
};
