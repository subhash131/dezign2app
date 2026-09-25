import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Key } from "lucide-react";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { BucketStorageSectionProps } from "./types";

export const SecurityLifecycleSection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Key size={14} className="text-amber-500" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Security & Lifecycle
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">Server-Side Encryption</label>
          <Select
            value={item.encryption || "SSE-S3"}
            onValueChange={(v) => handleUpdate(item.id, { encryption: v })}
          >
            <SelectTrigger className="w-full bg-background/50 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SSE-S3" className="text-xs">
                SSE-S3 (Amazon S3 Key)
              </SelectItem>
              <SelectItem value="SSE-KMS" className="text-xs">
                SSE-KMS (AWS KMS Key)
              </SelectItem>
              <SelectItem value="Customer-Managed" className="text-xs">
                Customer-Managed Key
              </SelectItem>
              <SelectItem value="None" className="text-xs">
                None (Unencrypted)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">Object Versioning</label>
          <Select
            value={item.versioning || "Disabled"}
            onValueChange={(v) => handleUpdate(item.id, { versioning: v })}
          >
            <SelectTrigger className="w-full bg-background/50 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Enabled" className="text-xs">
                Enabled (Keep history)
              </SelectItem>
              <SelectItem value="Suspended" className="text-xs">
                Suspended (Paused)
              </SelectItem>
              <SelectItem value="Disabled" className="text-xs">
                Disabled
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {item.encryption === "SSE-KMS" && (
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">
            KMS Key ID or ARN
          </label>
          <LocalInput
            className="h-8 bg-background/50 text-xs font-mono"
            placeholder="arn:aws:kms:us-east-1:123456789012:key/..."
            value={item.kmsKeyId || ""}
            onBlur={(e) => handleUpdate(item.id, { kmsKeyId: e.target.value })}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">
            Auto-Expiration (Days)
          </label>
          <LocalInput
            className="h-8 bg-background/50 text-xs font-mono"
            placeholder="e.g. 30, 90, 365"
            value={item.lifecycleExpirationDays || ""}
            onBlur={(e) =>
              handleUpdate(item.id, { lifecycleExpirationDays: e.target.value })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">
            Transition to Cold Storage (Days)
          </label>
          <LocalInput
            className="h-8 bg-background/50 text-xs font-mono"
            placeholder="e.g. 60, 90, 180"
            value={item.lifecycleGlacierDays || ""}
            onBlur={(e) =>
              handleUpdate(item.id, { lifecycleGlacierDays: e.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
};
