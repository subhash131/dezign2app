import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Cloud, Key } from "lucide-react";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { BucketStorageSectionProps } from "./types";
import { STORAGE_PROVIDERS, STORAGE_CLASSES } from "./constants";

export const StorageProviderSection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  const selectedProvider = item.storageType || "s3";

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Cloud size={14} className="text-amber-500" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Storage Provider & Tier
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-foreground">Storage Provider</label>
        <Select
          value={selectedProvider}
          onValueChange={(v) => handleUpdate(item.id, { storageType: v })}
        >
          <SelectTrigger className="w-full bg-background/50 h-8 text-xs">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {STORAGE_PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedProvider === "custom" && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Custom Provider Name
          </span>
          <LocalInput
            className="h-8 bg-background/50 text-xs"
            placeholder="e.g. MinIO, Cloudflare R2, On-Prem NAS, Ceph"
            value={item.storageTypeOther || ""}
            onChange={(e) =>
              handleUpdate(item.id, { storageTypeOther: e.target.value })
            }
            onBlur={(e) =>
              handleUpdate(item.id, { storageTypeOther: e.target.value })
            }
            debounceMs={200}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">Storage Tier / Class</label>
          <Select
            value={item.storageClass || "STANDARD"}
            onValueChange={(v) => handleUpdate(item.id, { storageClass: v })}
          >
            <SelectTrigger className="w-full bg-background/50 h-8 text-xs">
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              {STORAGE_CLASSES.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">AWS Region</label>
          <LocalInput
            className="h-8 bg-background/50 text-xs font-mono"
            placeholder="e.g. us-east-1"
            value={item.region || ""}
            onChange={(e) => handleUpdate(item.id, { region: e.target.value })}
            onBlur={(e) => handleUpdate(item.id, { region: e.target.value })}
            debounceMs={200}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        <label className="text-[11px] font-medium text-foreground">
          Custom Endpoint URL (Optional)
        </label>
        <LocalInput
          className="h-8 bg-background/50 text-xs font-mono"
          placeholder="e.g. https://s3.amazonaws.com or https://s3.us-east-1.amazonaws.com"
          value={item.endpointUrl || ""}
          onChange={(e) => handleUpdate(item.id, { endpointUrl: e.target.value })}
          onBlur={(e) => handleUpdate(item.id, { endpointUrl: e.target.value })}
          debounceMs={200}
        />
      </div>

      {/* AWS Credentials & IAM Integration */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
        <div className="flex items-center gap-1.5">
          <Key size={12} className="text-amber-500" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            AWS Credentials & IAM (Environment Variables)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-foreground">
              Access Key ID Env
            </label>
            <LocalInput
              className="h-7 bg-background/50 text-xs font-mono"
              placeholder="AWS_ACCESS_KEY_ID"
              value={item.accessKeyIdEnv || ""}
              onChange={(e) =>
                handleUpdate(item.id, { accessKeyIdEnv: e.target.value })
              }
              onBlur={(e) =>
                handleUpdate(item.id, { accessKeyIdEnv: e.target.value })
              }
              debounceMs={200}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-foreground">
              Secret Access Key Env
            </label>
            <LocalInput
              className="h-7 bg-background/50 text-xs font-mono"
              placeholder="AWS_SECRET_ACCESS_KEY"
              value={item.secretAccessKeyEnv || ""}
              onChange={(e) =>
                handleUpdate(item.id, { secretAccessKeyEnv: e.target.value })
              }
              onBlur={(e) =>
                handleUpdate(item.id, { secretAccessKeyEnv: e.target.value })
              }
              debounceMs={200}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-foreground">
              Session Token Env (Optional)
            </label>
            <LocalInput
              className="h-7 bg-background/50 text-xs font-mono"
              placeholder="AWS_SESSION_TOKEN"
              value={item.sessionTokenEnv || ""}
              onChange={(e) =>
                handleUpdate(item.id, { sessionTokenEnv: e.target.value })
              }
              onBlur={(e) =>
                handleUpdate(item.id, { sessionTokenEnv: e.target.value })
              }
              debounceMs={200}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-foreground">
              IAM Role ARN (Optional)
            </label>
            <LocalInput
              className="h-7 bg-background/50 text-xs font-mono"
              placeholder="arn:aws:iam::..."
              value={item.roleArn || ""}
              onChange={(e) => handleUpdate(item.id, { roleArn: e.target.value })}
              onBlur={(e) => handleUpdate(item.id, { roleArn: e.target.value })}
              debounceMs={200}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-foreground">Force Path-Style URLs</span>
            <span className="text-[10px] text-muted-foreground">
              Use path style (s3.amazonaws.com/bucket) instead of virtual-hosted
            </span>
          </div>
          <Switch
            checked={Boolean(item.forcePathStyle)}
            onCheckedChange={(checked) =>
              handleUpdate(item.id, { forcePathStyle: checked })
            }
          />
        </div>
      </div>
    </div>
  );
};
