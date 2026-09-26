import React from "react";
import { Globe, Key, HardDrive, ExternalLink } from "lucide-react";
import { Switch } from "@workspace/ui/components/switch";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BucketStorageSectionProps } from "./types";
import { EnvVarCombobox } from "../../EnvVarCombobox";

export const BucketConnectionSection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const parentNode = item.nodeId
    ? nodes.find((n) => n.id === item.nodeId)
    : null;
  const parentData = parentNode?.data;
  const parentLabel = parentData?.label || "Storage Host";
  const parentProvider = parentData?.storageProvider || item.storageType || "s3";

  const handleOpenStorageNode = () => {
    if (item.nodeId) {
      setActiveConfigItem({
        type: "storage",
        id: item.nodeId,
        nodeId: item.nodeId,
      });
    }
  };

  const accessKeyVal = item.accessKeyIdEnv || parentData?.accessKeyIdEnv || "AWS_ACCESS_KEY_ID";
  const secretKeyVal = item.secretAccessKeyEnv || parentData?.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY";
  const sessionTokenVal = item.sessionTokenEnv || parentData?.sessionTokenEnv || "";
  const roleArnVal = item.roleArn || parentData?.roleArn || "";
  const directAccessKeyVal = item.accessKeyId || parentData?.accessKeyId || "";
  const directSecretKeyVal = item.secretAccessKey || parentData?.secretAccessKey || "";

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Connection & Network
          </span>
        </div>
        {item.nodeId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleOpenStorageNode}
            className="h-6 text-[10px] px-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 gap-1 font-medium"
            title="Configure parent cloud storage host node"
          >
            <HardDrive size={11} />
            <span>Host Node</span>
            <ExternalLink size={10} />
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Select environment variables used to authenticate and connect this bucket across services and SDK pipelines.
      </p>

      {/* ─── Credentials (.env Environment Variables) ─── */}
      <div className="flex flex-col gap-3 pt-1 border-t border-border/50">
        <div className="flex items-center gap-1.5">
          <Key size={12} className="text-amber-500" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            AWS / Storage Credentials (.env Variables)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-foreground">
                Access Key ID Env
              </label>
              <code className="text-[9px] font-mono text-primary font-semibold truncate max-w-[100px]">
                process.env.{accessKeyVal}
              </code>
            </div>
            <EnvVarCombobox
              value={accessKeyVal}
              onValueChange={(val) => handleUpdate(item.id, { accessKeyIdEnv: val })}
              nodeId={item.nodeId}
              placeholder="AWS_ACCESS_KEY_ID"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-foreground">
                Secret Key Env
              </label>
              <code className="text-[9px] font-mono text-primary font-semibold truncate max-w-[100px]">
                process.env.{secretKeyVal}
              </code>
            </div>
            <EnvVarCombobox
              value={secretKeyVal}
              onValueChange={(val) => handleUpdate(item.id, { secretAccessKeyEnv: val })}
              nodeId={item.nodeId}
              placeholder="AWS_SECRET_ACCESS_KEY"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-foreground">
                Session Token Env (Optional)
              </label>
              {sessionTokenVal && (
                <code className="text-[9px] font-mono text-primary font-semibold truncate max-w-[100px]">
                  process.env.{sessionTokenVal}
                </code>
              )}
            </div>
            <EnvVarCombobox
              value={sessionTokenVal}
              onValueChange={(val) => handleUpdate(item.id, { sessionTokenEnv: val })}
              nodeId={item.nodeId}
              placeholder="AWS_SESSION_TOKEN"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-foreground">
                IAM Role ARN (Optional)
              </label>
              {roleArnVal && (
                <code className="text-[9px] font-mono text-primary font-semibold truncate max-w-[100px]">
                  {roleArnVal.startsWith("arn:") ? "ARN" : `process.env.${roleArnVal}`}
                </code>
              )}
            </div>
            <EnvVarCombobox
              value={roleArnVal}
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
                value={directAccessKeyVal}
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
                value={directSecretKeyVal}
                onValueChange={(val) => handleUpdate(item.id, { secretAccessKey: val })}
                nodeId={item.nodeId}
                placeholder="e.g. change-this-secret"
                defaultSuggestions={["change-this-secret", "minioadmin", "AWS_SECRET_ACCESS_KEY"]}
                allowRawInput={true}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Region & Endpoint URL ─── */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">
            AWS Region
          </label>
          <EnvVarCombobox
            value={item.region || parentData?.defaultRegion || "us-east-1"}
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

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">
            Endpoint URL (Optional)
          </label>
          <EnvVarCombobox
            value={item.endpointUrl || parentData?.endpointUrl || ""}
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
      </div>

      {/* ─── Force Path-Style URLs ─── */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-foreground">
            Force Path-Style URLs
          </span>
          <span className="text-[10px] text-muted-foreground">
            Use path mode (s3.amazonaws.com/bucket) for MinIO / local emulation
          </span>
        </div>
        <Switch
          checked={
            item.forcePathStyle !== undefined
              ? Boolean(item.forcePathStyle)
              : parentData?.forcePathStyle !== undefined
                ? Boolean(parentData.forcePathStyle)
                : false
          }
          onCheckedChange={(checked) => handleUpdate(item.id, { forcePathStyle: checked })}
        />
      </div>
    </div>
  );
};
