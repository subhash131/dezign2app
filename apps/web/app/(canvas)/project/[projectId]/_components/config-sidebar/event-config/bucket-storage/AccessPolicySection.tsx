import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Shield, Check, Clock } from "lucide-react";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { BucketStorageSectionProps } from "./types";
import { ACCESS_POLICIES, OPERATIONS, PRESET_EXPIRATIONS } from "./constants";

export const AccessPolicySection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  const allowedOps = Array.isArray(item.allowedOperations)
    ? item.allowedOperations
    : ["read", "write"];

  const toggleOp = (op: string) => {
    const next = allowedOps.includes(op)
      ? allowedOps.filter((o) => o !== op)
      : [...allowedOps, op];
    handleUpdate(item.id, { allowedOperations: next });
  };

  const accessPolicy = item.accessPolicy || "private";
  const isPresignedActive = Boolean(
    item.enablePresignedUrls || accessPolicy === "presigned-only",
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm border-primary/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Connectability & Access Control
          </span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Ingress Rules
        </Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-foreground">Access Policy</label>
        <Select
          value={accessPolicy}
          onValueChange={(v) => handleUpdate(item.id, { accessPolicy: v })}
        >
          <SelectTrigger className="w-full bg-background/50 h-8 text-xs font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCESS_POLICIES.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">
                <div className="flex flex-col text-left">
                  <span className="font-medium">{p.label}</span>
                  <span className="text-[10px] text-muted-foreground">{p.desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Allowed Operations Matrix */}
      <div className="flex flex-col gap-2 pt-1 border-t border-border/50">
        <label className="text-[11px] font-medium text-foreground">
          Allowed Bucket Operations (Connectable Capabilities)
        </label>
        <div className="grid grid-cols-2 gap-2">
          {OPERATIONS.map((op) => {
            const active = allowedOps.includes(op.key);
            return (
              <button
                type="button"
                key={op.key}
                onClick={() => toggleOp(op.key)}
                className={`flex items-start gap-2 p-2 rounded-lg border text-left transition-colors ${
                  active
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "bg-muted/20 border-border/60 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <div
                  className={`mt-0.5 w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-muted-foreground/40 bg-background"
                  }`}
                >
                  {active && <Check size={10} strokeWidth={3} />}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium leading-none">{op.label}</span>
                  <span className="text-[9px] text-muted-foreground mt-0.5 truncate">
                    {op.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Direct Client / WebApp Uploads & Presigned URLs */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-foreground">
              Presigned URLs for Client Uploads
            </span>
            <span className="text-[10px] text-muted-foreground">
              Generate temporary signed URLs for browser direct-to-S3 uploads
            </span>
          </div>
          <Switch
            checked={isPresignedActive}
            onCheckedChange={(checked) =>
              handleUpdate(item.id, { enablePresignedUrls: checked })
            }
          />
        </div>

        {isPresignedActive && (
          <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-background/60 border border-border/60 mt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                <Clock size={12} className="text-muted-foreground" />
                Presigned URL Lifetime (TTL)
              </span>
              <div className="flex items-center gap-1">
                {PRESET_EXPIRATIONS.map((preset) => (
                  <Button
                    key={preset.value}
                    type="button"
                    variant={item.presignedUrlTtl === preset.value ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() =>
                      handleUpdate(item.id, { presignedUrlTtl: preset.value })
                    }
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <LocalInput
              className="h-7 text-xs font-mono"
              placeholder="Expiration in seconds (default 900s)"
              value={item.presignedUrlTtl || "900"}
              onBlur={(e) =>
                handleUpdate(item.id, { presignedUrlTtl: e.target.value })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};
