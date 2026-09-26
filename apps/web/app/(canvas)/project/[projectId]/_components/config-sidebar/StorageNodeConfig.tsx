import React, { useState } from "react";
import {
  HardDrive,
  Cloud,
  Key,
  Globe,
  Shield,
  Plus,
  Trash,
  Settings,
  ExternalLink,
  Lock,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
} from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { LocalInput, LocalTextarea } from "../backend-nodes/graph-nodes/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, AnyMessagingResource } from "@/types/canvas";
import {
  listStorageBuckets,
  createStorageBucket,
  type ServerBucketInfo,
} from "@/lib/services/storageService";
import { cn } from "@workspace/ui/lib/utils";

export interface StorageNodeConfigProps {
  id: string;
  nodeId: string;
}

interface StorageProviderOption {
  readonly value: string;
  readonly label: string;
}

const STORAGE_PROVIDERS: readonly StorageProviderOption[] = [
  { value: "s3", label: "AWS S3" },
  { value: "r2", label: "Cloudflare R2" },
  { value: "gcs", label: "Google Cloud Storage" },
  { value: "blob", label: "Azure Blob Storage" },
  { value: "minio", label: "MinIO" },
  { value: "local", label: "Local Disk" },
  { value: "custom", label: "Custom S3-Compatible" },
];

export const StorageNodeConfig: React.FC<StorageNodeConfigProps> = ({
  id,
  nodeId,
}) => {
  const targetNodeId = nodeId || id;
  const node = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === targetNodeId),
  );
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const [newBucketName, setNewBucketName] = useState("");
  const [isAddingBucket, setIsAddingBucket] = useState(false);

  // Live Server Buckets Discovery & Creation State
  const [serverBuckets, setServerBuckets] = useState<ServerBucketInfo[] | null>(null);
  const [isScanningServer, setIsScanningServer] = useState(false);
  const [serverScanError, setServerScanError] = useState<string | null>(null);
  const [creatingBucketName, setCreatingBucketName] = useState<string | null>(null);
  const [createdSuccessMap, setCreatedSuccessMap] = useState<Record<string, boolean>>({});
  const [bucketActionErrors, setBucketActionErrors] = useState<Record<string, string>>({});

  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
        <HardDrive size={32} className="mb-2 opacity-50" />
        <p className="text-sm font-medium">Storage node not found</p>
      </div>
    );
  }

  const data = node.data;
  const provider = data.storageProvider || "s3";
  const buckets = data.buckets || [];

  const handleUpdateField = <K extends keyof BackendNode["data"]>(
    key: K,
    value: BackendNode["data"][K],
  ) => {
    if (data[key] === value) return;
    updateNode(node.id, {
      data: {
        ...data,
        [key]: value,
      },
    });
  };

  const handleAddBucket = () => {
    const trimmed = newBucketName.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "-");
    const nameToUse = trimmed || `bucket-${buckets.length + 1}`;
    const newBucketId = `bucket-${Date.now()}`;
    const newBucket: AnyMessagingResource = {
      id: newBucketId,
      name: nameToUse,
      storageType: provider,
      accessPolicy: "private",
      storageClass: "STANDARD",
    };

    const nextBuckets = [...buckets, newBucket];
    updateNode(node.id, {
      data: {
        ...data,
        buckets: nextBuckets,
      },
    });

    setNewBucketName("");
    setIsAddingBucket(false);

    // Immediately open the newly created bucket in BucketConfig
    setActiveConfigItem({
      type: "event",
      id: newBucketId,
      nodeId: node.id,
    });
  };

  const handleDeleteBucket = (bucketId: string) => {
    const nextBuckets = buckets.filter((b) => b.id !== bucketId);
    updateNode(node.id, {
      data: {
        ...data,
        buckets: nextBuckets,
      },
    });
  };

  const handleOpenBucketConfig = (bucketId: string) => {
    setActiveConfigItem({
      type: "event",
      id: bucketId,
      nodeId: node.id,
    });
  };

  const handleScanServerBuckets = async () => {
    setIsScanningServer(true);
    setServerScanError(null);
    try {
      const res = await listStorageBuckets({
        endpointUrl: data.endpointUrl,
        region: data.defaultRegion || "us-east-1",
        bucketName: buckets[0]?.name || "default",
        storageType: provider,
        forcePathStyle: data.forcePathStyle,
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
        accessKeyIdEnv: data.accessKeyIdEnv,
        secretAccessKeyEnv: data.secretAccessKeyEnv,
      });

      if (res.success) {
        setServerBuckets(res.buckets);
      } else {
        setServerScanError(res.error || "Failed to fetch buckets from server");
      }
    } catch (err) {
      setServerScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsScanningServer(false);
    }
  };

  const handleCreateBucketOnServer = async (bucketName: string) => {
    setCreatingBucketName(bucketName);
    try {
      const res = await createStorageBucket(
        {
          endpointUrl: data.endpointUrl,
          region: data.defaultRegion || "us-east-1",
          bucketName,
          storageType: provider,
          forcePathStyle: data.forcePathStyle,
          accessKeyId: data.accessKeyId,
          secretAccessKey: data.secretAccessKey,
          accessKeyIdEnv: data.accessKeyIdEnv,
          secretAccessKeyEnv: data.secretAccessKeyEnv,
        },
        bucketName,
      );

      if (res.success) {
        setCreatedSuccessMap((prev) => ({ ...prev, [bucketName]: true }));
        setBucketActionErrors((prev) => {
          const next = { ...prev };
          delete next[bucketName];
          return next;
        });
        await handleScanServerBuckets();
      } else {
        const errorMsg = res.error || res.message || `Failed to create bucket "${bucketName}"`;
        setBucketActionErrors((prev) => ({ ...prev, [bucketName]: errorMsg }));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to create bucket on server";
      setBucketActionErrors((prev) => ({ ...prev, [bucketName]: errorMsg }));
    } finally {
      setCreatingBucketName(null);
    }
  };

  const handleImportServerBucket = (serverBucketName: string) => {
    if (buckets.some((b) => b.name === serverBucketName)) return;
    const newBucketId = `bucket-${Date.now()}`;
    const newBucket: AnyMessagingResource = {
      id: newBucketId,
      name: serverBucketName,
      storageType: provider,
      accessPolicy: "private",
      storageClass: "STANDARD",
    };
    const nextBuckets = [...buckets, newBucket];
    updateNode(node.id, {
      data: {
        ...data,
        buckets: nextBuckets,
      },
    });
    setCreatedSuccessMap((prev) => ({ ...prev, [serverBucketName]: true }));
  };

  return (
    <div className="flex flex-col gap-6 pb-12 text-xs">
      {/* ─── Header & Status Bar ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4 shadow-sm backdrop-blur-sm border-amber-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <HardDrive size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground">
                {data.label || "Storage Provider"}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Cloud Storage Node Configuration
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-mono capitalize"
            >
              {provider}
            </Badge>
            <Badge variant="secondary" className="text-[10px] font-mono">
              {buckets.length} {buckets.length === 1 ? "bucket" : "buckets"}
            </Badge>
          </div>
        </div>

        {/* Node Label Input */}
        <div className="flex flex-col gap-1.5 pt-1">
          <label className="text-[11px] font-medium text-foreground">
            Storage Node Name
          </label>
          <LocalInput
            className="h-8 bg-background/50 text-xs"
            placeholder="e.g. User Media Storage, Primary Blob Store"
            value={data.label || ""}
            onChange={(e) => handleUpdateField("label", e.target.value)}
            debounceMs={150}
          />
        </div>

        {/* Strategy Description */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">
            Architecture Role & Description
          </label>
          <LocalTextarea
            className="min-h-[50px] text-xs bg-background/50 resize-none"
            placeholder="Describe what data this storage provider manages (e.g. AWS S3 storing user avatars, documents, and backups)"
            value={data.description || ""}
            onChange={(e) => handleUpdateField("description", e.target.value)}
            debounceMs={200}
          />
        </div>
      </div>

      {/* ─── 1. Storage Provider Selection ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Cloud size={14} className="text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Storage Provider & Driver
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">
            Provider Service
          </label>
          <Select
            value={provider}
            onValueChange={(v) => handleUpdateField("storageProvider", v)}
          >
            <SelectTrigger className="w-full bg-background/50 h-8 text-xs">
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
      </div>

      {/* ─── 2. Connection Settings & Network ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Connection & Network
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">
              AWS Region
            </label>
            <LocalInput
              className="h-8 bg-background/50 text-xs font-mono"
              placeholder="us-east-1"
              value={data.defaultRegion || ""}
              onChange={(e) => handleUpdateField("defaultRegion", e.target.value)}
              debounceMs={150}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">
              Endpoint URL (Optional)
            </label>
            <LocalInput
              className="h-8 bg-background/50 text-xs font-mono"
              placeholder="https://s3.amazonaws.com"
              value={data.endpointUrl || ""}
              onChange={(e) => handleUpdateField("endpointUrl", e.target.value)}
              debounceMs={150}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium text-foreground">
            CDN / CloudFront Domain
          </label>
          <LocalInput
            className="h-8 bg-background/50 text-xs font-mono"
            placeholder="cdn.example.com"
            value={data.cdnUrl || ""}
            onChange={(e) => handleUpdateField("cdnUrl", e.target.value)}
            debounceMs={150}
          />
        </div>

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
            checked={Boolean(data.forcePathStyle)}
            onCheckedChange={(checked) => handleUpdateField("forcePathStyle", checked)}
          />
        </div>
      </div>

      {/* ─── 3. Credentials & IAM (Environment Variables) ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Key size={14} className="text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            AWS Credentials & IAM (Environment Variables)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">
              Access Key ID Env
            </label>
            <LocalInput
              className="h-8 bg-background/50 text-xs font-mono"
              placeholder="AWS_ACCESS_KEY_ID"
              value={data.accessKeyIdEnv || ""}
              onChange={(e) => handleUpdateField("accessKeyIdEnv", e.target.value)}
              debounceMs={150}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">
              Secret Key Env
            </label>
            <LocalInput
              className="h-8 bg-background/50 text-xs font-mono"
              placeholder="AWS_SECRET_ACCESS_KEY"
              value={data.secretAccessKeyEnv || ""}
              onChange={(e) => handleUpdateField("secretAccessKeyEnv", e.target.value)}
              debounceMs={150}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">
              Session Token Env (Optional)
            </label>
            <LocalInput
              className="h-8 bg-background/50 text-xs font-mono"
              placeholder="AWS_SESSION_TOKEN"
              value={data.sessionTokenEnv || ""}
              onChange={(e) => handleUpdateField("sessionTokenEnv", e.target.value)}
              debounceMs={150}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">
              IAM Role ARN (Optional)
            </label>
            <LocalInput
              className="h-8 bg-background/50 text-xs font-mono"
              placeholder="arn:aws:iam::..."
              value={data.roleArn || ""}
              onChange={(e) => handleUpdateField("roleArn", e.target.value)}
              debounceMs={150}
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
              <LocalInput
                className="h-8 bg-background/50 text-xs font-mono"
                placeholder="e.g. admin"
                value={data.accessKeyId || ""}
                onChange={(e) => handleUpdateField("accessKeyId", e.target.value)}
                debounceMs={150}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-foreground">
                Secret Access Key
              </label>
              <LocalInput
                type="password"
                className="h-8 bg-background/50 text-xs font-mono"
                placeholder="e.g. change-this-secret"
                value={data.secretAccessKey || ""}
                onChange={(e) => handleUpdateField("secretAccessKey", e.target.value)}
                debounceMs={150}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4. Default Security & Encryption ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Shield size={14} className="text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Default Security & Encryption
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">
              Default Encryption
            </label>
            <Select
              value={data.encryption || "SSE-S3"}
              onValueChange={(v) => handleUpdateField("encryption", v)}
            >
              <SelectTrigger className="w-full bg-background/50 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SSE-S3" className="text-xs">
                  SSE-S3 (AES-256)
                </SelectItem>
                <SelectItem value="SSE-KMS" className="text-xs">
                  SSE-KMS
                </SelectItem>
                <SelectItem value="None" className="text-xs">
                  None (Unencrypted)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-4">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground">
                Default Versioning
              </span>
              <span className="text-[10px] text-muted-foreground">
                Enable versioning by default
              </span>
            </div>
            <Switch
              checked={Boolean(data.versioning)}
              onCheckedChange={(checked) => handleUpdateField("versioning", checked)}
            />
          </div>
        </div>

        {data.encryption === "SSE-KMS" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-foreground">
              KMS Key ID or ARN
            </label>
            <LocalInput
              className="h-8 bg-background/50 text-xs font-mono"
              placeholder="arn:aws:kms:us-east-1:..."
              value={data.kmsKeyId || ""}
              onChange={(e) => handleUpdateField("kmsKeyId", e.target.value)}
              debounceMs={150}
            />
          </div>
        )}
      </div>

      {/* ─── Limitations & Requirements Warning ─── */}
      <div className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5 shadow-sm">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-xs">
          <AlertTriangle size={15} />
          <span>Storage Prerequisites &amp; Limitations</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-foreground leading-relaxed pl-1">
          <li>
            <strong>Canvas vs. Live Server:</strong> Buckets defined here are architecture blueprints. They are <em>not</em> automatically created on AWS or local servers until provisioned.
          </li>
          <li>
            <strong>Local SeaweedFS / MinIO:</strong> When using <code className="font-mono text-[10px] bg-background/80 px-1 py-0.5 rounded border border-border">http://localhost:8333</code>, always enable <strong>Path-Style Addressing</strong>. If SeaweedFS has authentication enabled, set the Access Key (<code className="font-mono text-[10px]">admin</code>) and Secret Key above.
          </li>
          <li>
            <strong>AWS Naming Rules:</strong> S3 bucket names must be 3–63 characters, lowercase, numbers and hyphens only, and globally unique across all AWS accounts.
          </li>
          <li>
            <strong>IAM Permissions:</strong> Code or actions creating buckets require <code className="font-mono text-[10px]">s3:CreateBucket</code> permissions.
          </li>
        </ul>
      </div>

      {/* ─── 5. Managed Buckets Section ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm border-amber-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive size={14} className="text-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
              Buckets in this Storage Provider
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsAddingBucket(true)}
            className="h-6 px-1.5 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 gap-1"
          >
            <Plus size={12} />
            Add Bucket
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Each bucket defines its own access policy, CORS settings, lifecycle rules, and supported operations.
        </p>

        {/* Live Server Discovery & Sync Bar */}
        <div className="flex flex-col gap-2 p-3 rounded-lg border border-border/60 bg-secondary/15">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Database size={13} className="text-amber-500" />
              <span className="text-[11px] font-semibold text-foreground">
                Live Server Discovery &amp; Sync
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={isScanningServer}
              onClick={handleScanServerBuckets}
              className="h-6 px-2 text-[10px] font-medium gap-1 hover:border-amber-500/50"
            >
              <RefreshCw size={11} className={cn(isScanningServer && "animate-spin text-amber-500")} />
              {isScanningServer ? "Checking..." : "Fetch Server Buckets"}
            </Button>
          </div>

          <div className="text-[10px] text-muted-foreground">
            Target Endpoint: <code className="font-mono text-foreground font-semibold">{data.endpointUrl || `https://s3.${data.defaultRegion || "us-east-1"}.amazonaws.com`}</code>
          </div>

          {serverScanError && (
            <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[11px] flex items-start gap-1.5">
              <XCircle size={13} className="shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="font-semibold">Discovery Notice:</span>
                <span>{serverScanError}</span>
              </div>
            </div>
          )}

          {serverBuckets !== null && (
            <div className="flex flex-col gap-2 pt-1 border-t border-border/40">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  Found {serverBuckets.length} {serverBuckets.length === 1 ? "bucket" : "buckets"} on server
                </span>
              </div>

              {serverBuckets.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic">
                  No buckets found on this server. Click &quot;Add Bucket&quot; or create one below.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {serverBuckets.map((sb) => {
                    const alreadyOnCanvas = buckets.some((b) => b.name === sb.name);
                    return (
                      <div
                        key={sb.name}
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border font-mono",
                          alreadyOnCanvas
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : "bg-background border-border hover:border-amber-500/50",
                        )}
                      >
                        <HardDrive size={10} />
                        <span>{sb.name}</span>
                        {alreadyOnCanvas ? (
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-sans font-semibold">
                            (on canvas)
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleImportServerBucket(sb.name)}
                            className="h-4 px-1 text-[9px] text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 font-sans font-medium"
                          >
                            + Add to Canvas
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {isAddingBucket && (
          <div className="flex flex-col gap-2 p-2 rounded-lg bg-background/80 border border-amber-500/30">
            <div className="flex items-center gap-2">
              <Input
                className="h-7 text-xs font-mono flex-1"
                placeholder="e.g. avatars, invoices, raw-uploads"
                value={newBucketName}
                onChange={(e) => setNewBucketName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddBucket();
                  if (e.key === "Escape") setIsAddingBucket(false);
                }}
              />
              <Button
                size="sm"
                onClick={handleAddBucket}
                className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white px-2.5"
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsAddingBucket(false)}
                className="h-7 text-xs px-2 text-muted-foreground"
              >
                Cancel
              </Button>
            </div>

            {/* Quick-pick from Server Buckets if discovered */}
            {serverBuckets && serverBuckets.filter((sb) => !buckets.some((b) => b.name === sb.name)).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border/40 text-[10px]">
                <span className="text-muted-foreground font-sans">Or pick from server:</span>
                {serverBuckets
                  .filter((sb) => !buckets.some((b) => b.name === sb.name))
                  .map((sb) => (
                    <Button
                      key={sb.name}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setNewBucketName(sb.name);
                      }}
                      className="h-5 px-1.5 text-[10px] font-mono hover:border-amber-500/50"
                    >
                      {sb.name}
                    </Button>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/50 bg-background/50 overflow-hidden">
          {buckets.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">
              No buckets configured yet. Click &quot;Add Bucket&quot; above to create one.
            </div>
          ) : (
            buckets.map((b) => {
              const bucketName = b.name || "unnamed";
              const isFoundOnServer =
                Boolean(createdSuccessMap[bucketName]) ||
                Boolean(serverBuckets?.some((sb) => sb.name === bucketName));
              const isCreatingThis = creatingBucketName === bucketName;

              return (
                <div key={b.id} className="flex flex-col">
                  <div className="flex items-center justify-between p-2.5 text-xs hover:bg-secondary/20 transition-colors">
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                      <HardDrive size={13} className="text-amber-500 shrink-0" />
                      <span className="font-mono text-xs font-semibold text-foreground truncate">
                        {bucketName}
                      </span>

                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] px-1 py-0 h-4 capitalize shrink-0",
                          b.accessPolicy === "public-read"
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            : b.accessPolicy === "presigned-only"
                              ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {b.accessPolicy || "private"}
                      </Badge>

                      {/* Server status indicator */}
                      {serverBuckets !== null && (
                        isFoundOnServer ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] font-mono px-1 py-0 h-4 shrink-0 flex items-center gap-0.5"
                          >
                            <CheckCircle2 size={9} />
                            <span>On Server</span>
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[9px] font-mono px-1 py-0 h-4 shrink-0 flex items-center gap-0.5"
                          >
                            <AlertTriangle size={9} />
                            <span>Not on Server</span>
                          </Badge>
                        )
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* If server scanned and bucket not found on server, offer 1-click Create on Server */}
                      {serverBuckets !== null && !isFoundOnServer && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isCreatingThis}
                          onClick={() => handleCreateBucketOnServer(bucketName)}
                          className="h-6 px-1.5 text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/10 gap-1 font-medium"
                          title={`Create bucket "${bucketName}" directly on target server`}
                        >
                          {isCreatingThis ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Plus size={10} />
                          )}
                          <span>Create on Server</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 gap-1 font-medium"
                        onClick={() => handleOpenBucketConfig(b.id)}
                        title="Configure Bucket in Sidebar"
                      >
                        <Settings size={12} />
                        <span>Configure</span>
                        <ExternalLink size={10} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteBucket(b.id)}
                        title="Delete Bucket"
                      >
                        <Trash size={12} />
                      </Button>
                    </div>
                  </div>

                  {bucketActionErrors[bucketName] && (
                    <div className="px-3 py-1.5 text-[10px] text-destructive bg-destructive/10 border-t border-destructive/20 flex items-start gap-1.5 font-mono">
                      <XCircle size={12} className="shrink-0 mt-0.5" />
                      <span className="break-all">{bucketActionErrors[bucketName]}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── 6. Live Environment & SDK Initialization Preview ─── */}
      <div className="flex flex-col gap-2 rounded-xl border bg-secondary/15 p-4 text-xs font-mono">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          S3 Client Initialization Code Preview
        </span>
        <pre className="p-3 rounded-lg bg-background/80 border border-border/60 text-[11px] text-amber-500 dark:text-amber-400 overflow-x-auto whitespace-pre leading-relaxed select-text">
{`import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? "${data.defaultRegion || "us-east-1"}",
  credentials: {
    accessKeyId: process.env.${data.accessKeyIdEnv || "AWS_ACCESS_KEY_ID"} ?? "",
    secretAccessKey: process.env.${data.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY"} ?? "",
  },
${data.endpointUrl ? `  endpoint: "${data.endpointUrl}",\n` : ""}${data.forcePathStyle ? `  forcePathStyle: true,\n` : ""}});`}
        </pre>
      </div>
    </div>
  );
};
