import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import {
  HardDrive,
  ChevronDown,
  ChevronUp,
  Settings,
  Shield,
  Cloud,
  Globe,
  Lock,
  Layers,
  Key,
} from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  NodeHeader,
  MessagingResourceList,
  useSimulationNodeState,
  getSimulationNodeBorderClass,
} from "../../common";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { LocalInput } from "../../shared";

interface StorageProviderOption {
  readonly value: string;
  readonly label: string;
}

const STORAGE_PROVIDERS: readonly StorageProviderOption[] = [
  { value: "s3", label: "AWS S3" },
  // { value: "r2", label: "Cloudflare R2" },
  // { value: "gcs", label: "Google Cloud Storage" },
  // { value: "blob", label: "Azure Blob Storage" },
  // { value: "minio", label: "MinIO" },
  // { value: "local", label: "Local Disk" },
  // { value: "custom", label: "Custom" },
];

export const StorageNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
  );

  const [showAdvanced, setShowAdvanced] = useState(false);

  const provider = data.storageProvider || "s3";
  const accessPolicy = data.accessPolicy || "private";
  const bucketCount = data.buckets?.length || 0;

  const handleOpenConfig = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (data.buckets && data.buckets.length > 0) {
      setActiveConfigItem({
        type: "event",
        id: data.buckets[0]!.id,
        nodeId: id,
      });
    }
  };

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[290px] max-w-[360px] flex flex-col relative transition-all duration-150 select-none",
        selected ? "border-amber-500 ring-1 ring-amber-500/20" : "border-border",
        borderClass,
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Node-Level Ingress Handle on Left (Writers / Service connect) */}
      <Handle
        type="target"
        position={Position.Left}
        id="storage-target"
        className="w-2.5 h-2.5 -left-1.5 !bg-amber-500 border-2 border-background"
        title="Storage Ingress (Writes & Service Connections)"
        style={{ top: "28px" }}
      />

      {/* Node-Level Egress Handle on Right (Events / Read Notifications) */}
      <Handle
        type="source"
        position={Position.Right}
        id="storage-source"
        className="w-2.5 h-2.5 -right-1.5 !bg-amber-500 border-2 border-background"
        title="Storage Egress (Events & Read Streams)"
        style={{ top: "28px" }}
      />

      <NodeHeader
        id={id}
        data={data}
        nodeType="storage"
        icon={HardDrive}
        title="Storage"
        colorClass="bg-amber-500/10 text-amber-700 dark:text-amber-400"
        selected={selected}
        badges={
          <div className="flex items-center gap-1 flex-wrap">
            <Badge
              variant="outline"
              className="bg-background/80 text-[9px] font-mono capitalize px-1 py-0 h-4 border-amber-500/30"
            >
              {provider}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] px-1 py-0 h-4 capitalize",
                accessPolicy === "public-read"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : accessPolicy === "presigned-only"
                    ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                    : "bg-muted/60 text-muted-foreground",
              )}
            >
              {accessPolicy}
            </Badge>
            <Badge
              variant="secondary"
              className="text-[9px] px-1 py-0 h-4 font-mono"
            >
              {bucketCount} {bucketCount === 1 ? "bucket" : "buckets"}
            </Badge>
          </div>
        }
        rightElement={
          bucketCount > 0 ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground nodrag shrink-0"
              onClick={handleOpenConfig}
              title="Configure Active Bucket in Sidebar"
            >
              <Settings size={13} />
            </Button>
          ) : undefined
        }
      />

      {/* Strategy Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="Describe storage strategy (e.g. S3 for user uploads and media assets)"
          value={data.description || ""}
          onChange={(e) =>
            updateNode(id, { data: { ...data, description: e.target.value } })
          }
        />
      </div>

      {/* Quick Controls Bar: Provider & Access Mode */}
      <div className="px-3 py-2 bg-secondary/10 border-b flex flex-col gap-2 nodrag">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Cloud size={11} className="text-amber-500" />
            Provider
          </span>
          <Select
            value={provider}
            onValueChange={(v) =>
              updateNode(id, { data: { ...data, storageProvider: v } })
            }
          >
            <SelectTrigger className="h-6 text-[11px] w-[140px] bg-background/60">
              <SelectValue />
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

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Shield size={11} className="text-amber-500" />
            Access
          </span>
          <Select
            value={accessPolicy}
            onValueChange={(v) =>
              updateNode(id, { data: { ...data, accessPolicy: v } })
            }
          >
            <SelectTrigger className="h-6 text-[11px] w-[140px] bg-background/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private" className="text-xs">
                Private (Backend & IAM)
              </SelectItem>
              <SelectItem value="public-read" className="text-xs">
                Public Read (CDN)
              </SelectItem>
              <SelectItem value="presigned-only" className="text-xs">
                Presigned URLs Only
              </SelectItem>
              <SelectItem value="authenticated-read" className="text-xs">
                Authenticated Only
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced Storage Configuration Collapsible */}
      <div className="flex flex-col nodrag border-b">
        <div
          className="px-3 py-1.5 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider cursor-pointer hover:bg-secondary/40 transition-colors"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className="flex items-center gap-1">
            <Globe size={11} className="text-muted-foreground" />
            Storage Settings & Network
          </span>
          {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>

        {showAdvanced && (
          <div className="p-3 flex flex-col gap-2.5 bg-secondary/5 border-t">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground">
                AWS Region
              </span>
              <LocalInput
                className="h-6 text-xs w-32 text-right bg-background font-mono"
                placeholder="us-east-1"
                value={data.defaultRegion || ""}
                onBlur={(e) =>
                  updateNode(id, {
                    data: { ...data, defaultRegion: e.target.value },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground">
                Endpoint URL
              </span>
              <LocalInput
                className="h-6 text-xs w-36 text-right bg-background font-mono"
                placeholder="https://s3.amazonaws.com"
                value={data.endpointUrl || ""}
                onBlur={(e) =>
                  updateNode(id, {
                    data: { ...data, endpointUrl: e.target.value },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground">
                CDN / CloudFront
              </span>
              <LocalInput
                className="h-6 text-xs w-36 text-right bg-background font-mono"
                placeholder="cdn.example.com"
                value={data.cdnUrl || ""}
                onBlur={(e) =>
                  updateNode(id, {
                    data: { ...data, cdnUrl: e.target.value },
                  })
                }
              />
            </div>

            <div className="pt-1 border-t border-border/40 flex flex-col gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Key size={10} className="text-amber-500" />
                AWS Credentials (Env Vars)
              </span>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  Access Key ID
                </span>
                <LocalInput
                  className="h-6 text-xs w-36 text-right bg-background font-mono"
                  placeholder="AWS_ACCESS_KEY_ID"
                  value={data.accessKeyIdEnv || ""}
                  onBlur={(e) =>
                    updateNode(id, {
                      data: { ...data, accessKeyIdEnv: e.target.value },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  Secret Key
                </span>
                <LocalInput
                  className="h-6 text-xs w-36 text-right bg-background font-mono"
                  placeholder="AWS_SECRET_ACCESS_KEY"
                  value={data.secretAccessKeyEnv || ""}
                  onBlur={(e) =>
                    updateNode(id, {
                      data: { ...data, secretAccessKeyEnv: e.target.value },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  Session Token
                </span>
                <LocalInput
                  className="h-6 text-xs w-36 text-right bg-background font-mono"
                  placeholder="AWS_SESSION_TOKEN"
                  value={data.sessionTokenEnv || ""}
                  onBlur={(e) =>
                    updateNode(id, {
                      data: { ...data, sessionTokenEnv: e.target.value },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  IAM Role ARN
                </span>
                <LocalInput
                  className="h-6 text-xs w-36 text-right bg-background font-mono"
                  placeholder="arn:aws:iam::..."
                  value={data.roleArn || ""}
                  onBlur={(e) =>
                    updateNode(id, {
                      data: { ...data, roleArn: e.target.value },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  Force Path-Style
                </span>
                <Switch
                  checked={Boolean(data.forcePathStyle)}
                  onCheckedChange={(checked) =>
                    updateNode(id, {
                      data: { ...data, forcePathStyle: checked },
                    })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
              <span className="text-[10px] font-semibold text-muted-foreground">
                Versioning
              </span>
              <Switch
                checked={Boolean(data.versioning)}
                onCheckedChange={(checked) =>
                  updateNode(id, {
                    data: { ...data, versioning: checked },
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-muted-foreground">
                Encryption
              </span>
              <Select
                value={data.encryption || "SSE-S3"}
                onValueChange={(v) =>
                  updateNode(id, {
                    data: { ...data, encryption: v },
                  })
                }
              >
                <SelectTrigger className="h-6 text-[10px] w-28 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SSE-S3" className="text-xs">
                    SSE-S3
                  </SelectItem>
                  <SelectItem value="SSE-KMS" className="text-xs">
                    SSE-KMS
                  </SelectItem>
                  <SelectItem value="None" className="text-xs">
                    None
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {data.encryption === "SSE-KMS" && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  KMS Key ID / ARN
                </span>
                <LocalInput
                  className="h-6 text-xs w-36 text-right bg-background font-mono"
                  placeholder="arn:aws:kms:..."
                  value={data.kmsKeyId || ""}
                  onBlur={(e) =>
                    updateNode(id, {
                      data: { ...data, kmsKeyId: e.target.value },
                    })
                  }
                />
              </div>
            )}

            {/* Live Connection & Credentials Preview Strip */}
            <div className="mt-1 p-2 rounded-lg bg-background/80 border border-border/60 flex flex-col gap-1 text-[10px] font-mono">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-medium">Endpoint:</span>
                <span
                  className="text-foreground font-semibold truncate max-w-[155px]"
                  title={data.endpointUrl || `https://s3.${data.defaultRegion || "us-east-1"}.amazonaws.com`}
                >
                  {data.endpointUrl || `https://s3.${data.defaultRegion || "us-east-1"}.amazonaws.com`}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-medium">Credentials:</span>
                <span className="text-foreground truncate max-w-[155px]">
                  {data.accessKeyIdEnv || "AWS_ACCESS_KEY_ID"}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="font-medium">URL Mode:</span>
                <span className="text-foreground">
                  {data.forcePathStyle ? "Path (/bucket)" : "Virtual-Hosted"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Buckets / Resources List */}
      <MessagingResourceList
        nodeId={id}
        title="Buckets / Resources"
        items={data.buckets || []}
        variant="definition"
        resourceType="buckets"
        onChange={(buckets) =>
          updateNode(id, {
            data: {
              ...data,
              buckets,
            },
          })
        }
      />
    </div>
  );
};
