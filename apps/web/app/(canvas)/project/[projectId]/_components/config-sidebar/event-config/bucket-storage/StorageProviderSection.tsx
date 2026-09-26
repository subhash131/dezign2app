import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Cloud, Key, AlertTriangle } from "lucide-react";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { EnvVarCombobox } from "../../EnvVarCombobox";
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

      {/* Limitations & Prerequisites Notice */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-xs">
          <AlertTriangle size={13} />
          <span>Storage Prerequisites &amp; Limitations</span>
        </div>
        <p className="leading-relaxed">
          Buckets defined in the canvas are architecture blueprints and are not automatically created on AWS or local servers until provisioned. When connecting to local emulators like SeaweedFS (<code className="font-mono text-[10px] bg-background/80 px-1 py-0.5 rounded">http://localhost:8333</code>), enable <strong>Force Path-Style URLs</strong> and configure credentials.
        </p>
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
          <EnvVarCombobox
            value={item.region || "us-east-1"}
            onValueChange={(val) => handleUpdate(item.id, { region: val })}
            nodeId={item.nodeId}
            placeholder="e.g. AWS_REGION or us-east-1"
            defaultSuggestions={[
              "AWS_REGION",
              "AWS_DEFAULT_REGION",
              "us-east-1",
              "us-east-2",
              "us-west-1",
              "us-west-2",
              "eu-west-1",
              "eu-central-1",
              "ap-southeast-1",
            ]}
            allowRawInput={true}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-1">
        <label className="text-[11px] font-medium text-foreground">
          Custom Endpoint URL (Optional)
        </label>
        <EnvVarCombobox
          value={item.endpointUrl || ""}
          onValueChange={(val) => handleUpdate(item.id, { endpointUrl: val })}
          nodeId={item.nodeId}
          placeholder="e.g. S3_ENDPOINT_URL or https://..."
          defaultSuggestions={[
            "S3_ENDPOINT_URL",
            "AWS_ENDPOINT_URL",
            "STORAGE_ENDPOINT_URL",
            "https://s3.amazonaws.com",
            "http://localhost:8333",
            "http://localhost:9000",
          ]}
          allowRawInput={true}
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
            <EnvVarCombobox
              value={item.accessKeyIdEnv || "AWS_ACCESS_KEY_ID"}
              onValueChange={(val) => handleUpdate(item.id, { accessKeyIdEnv: val })}
              nodeId={item.nodeId}
              placeholder="AWS_ACCESS_KEY_ID"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-foreground">
              Secret Access Key Env
            </label>
            <EnvVarCombobox
              value={item.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY"}
              onValueChange={(val) => handleUpdate(item.id, { secretAccessKeyEnv: val })}
              nodeId={item.nodeId}
              placeholder="AWS_SECRET_ACCESS_KEY"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-foreground">
              Session Token Env (Optional)
            </label>
            <EnvVarCombobox
              value={item.sessionTokenEnv || ""}
              onValueChange={(val) => handleUpdate(item.id, { sessionTokenEnv: val })}
              nodeId={item.nodeId}
              placeholder="AWS_SESSION_TOKEN"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-foreground">
              IAM Role ARN (Optional)
            </label>
            <EnvVarCombobox
              value={item.roleArn || ""}
              onValueChange={(val) => handleUpdate(item.id, { roleArn: val })}
              nodeId={item.nodeId}
              placeholder="arn:aws:iam::..."
              defaultSuggestions={[
                "AWS_ROLE_ARN",
                "arn:aws:iam::123456789012:role/StorageRole",
              ]}
              allowRawInput={true}
            />
          </div>
        </div>

        {/* Live / Local Testing Credentials */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Live Testing & Local Emulator Credentials (Direct)
            </span>
            <span className="text-[10px] text-muted-foreground">
              Direct credentials for testing or local SeaweedFS/MinIO emulator (e.g. admin &amp; change-this-secret)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-foreground">
                Access Key ID
              </label>
              <EnvVarCombobox
                value={item.accessKeyId || ""}
                onValueChange={(val) => handleUpdate(item.id, { accessKeyId: val })}
                nodeId={item.nodeId}
                placeholder="e.g. admin"
                defaultSuggestions={["admin", "minioadmin", "root", "AWS_ACCESS_KEY_ID"]}
                allowRawInput={true}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-foreground">
                Secret Access Key
              </label>
              <EnvVarCombobox
                type="password"
                value={item.secretAccessKey || ""}
                onValueChange={(val) => handleUpdate(item.id, { secretAccessKey: val })}
                nodeId={item.nodeId}
                placeholder="e.g. change-this-secret"
                defaultSuggestions={["change-this-secret", "minioadmin", "AWS_SECRET_ACCESS_KEY"]}
                allowRawInput={true}
              />
            </div>
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
