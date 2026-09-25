import React, { useState } from "react";
import { AnyMessagingResource } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
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
import {
  HardDrive,
  Shield,
  Globe,
  Lock,
  UploadCloud,
  DownloadCloud,
  Sliders,
  Key,
  Bell,
  Check,
  Zap,
  Clock,
  Layers,
  FileCode,
  FolderGit2,
  Cloud,
  Terminal,
  Copy,
} from "lucide-react";
import { LocalInput } from "../../backend-nodes/graph-nodes/shared";
import { ConfigItemData } from "./types";

interface BucketStorageConfigProps {
  item: ConfigItemData;
  handleUpdate: (eventId: string, changes: Partial<AnyMessagingResource>) => void;
}

interface StorageProviderOption {
  readonly value: string;
  readonly label: string;
  readonly icon: string;
}

interface StorageClassOption {
  readonly value: string;
  readonly label: string;
}

interface AccessPolicyOption {
  readonly value: string;
  readonly label: string;
  readonly desc: string;
}

interface OperationOption {
  readonly key: string;
  readonly label: string;
  readonly desc: string;
}

interface PresetExpirationOption {
  readonly label: string;
  readonly value: string;
}

interface EventTriggerOption {
  readonly key: string;
  readonly label: string;
  readonly desc: string;
}

const STORAGE_PROVIDERS: readonly StorageProviderOption[] = [
  { value: "s3", label: "AWS S3", icon: "Amazon S3" },
  // { value: "r2", label: "Cloudflare R2", icon: "Cloudflare R2" },
  // { value: "gcs", label: "Google Cloud Storage (GCS)", icon: "GCS" },
  // { value: "blob", label: "Azure Blob Storage", icon: "Azure Blob" },
  // { value: "minio", label: "MinIO (S3-Compatible)", icon: "MinIO" },
  // { value: "local", label: "Local Disk Storage", icon: "Local Disk" },
  // { value: "custom", label: "Custom / Other", icon: "Custom" },
];

const STORAGE_CLASSES: readonly StorageClassOption[] = [
  { value: "STANDARD", label: "Standard / Hot (Active access)" },
  { value: "STANDARD_IA", label: "Infrequent Access (Standard-IA)" },
  { value: "GLACIER", label: "Glacier / Cold Archive (Low cost)" },
  { value: "DEEP_ARCHIVE", label: "Deep Archive (Long-term retention)" },
  { value: "INTELLIGENT_TIERING", label: "Intelligent-Tiering (Auto-optimizing)" },
];

const ACCESS_POLICIES: readonly AccessPolicyOption[] = [
  {
    value: "private",
    label: "Private (Backend & IAM Only)",
    desc: "Only authorized backend services and roles can read/write. Best for sensitive data.",
  },
  {
    value: "public-read",
    label: "Public Read (CDN & Assets)",
    desc: "Direct anonymous HTTP read access to objects. Ideal for public images and static assets.",
  },
  {
    value: "presigned-only",
    label: "Presigned URLs Only",
    desc: "Clients must obtain temporary cryptographically signed URLs from backend services.",
  },
  {
    value: "authenticated-read",
    label: "Authenticated Users Only",
    desc: "Requires valid session or authentication token to read files.",
  },
];

const OPERATIONS: readonly OperationOption[] = [
  { key: "read", label: "Read / Download", desc: "GetObject & Range reads" },
  { key: "write", label: "Write / Upload", desc: "PutObject & Multipart upload" },
  { key: "delete", label: "Delete", desc: "DeleteObject & Batch purge" },
  { key: "list", label: "List Bucket", desc: "ListObjects & Metadata enumeration" },
];

const CORS_METHODS: readonly string[] = ["GET", "PUT", "POST", "DELETE", "HEAD"];

const PRESET_EXPIRATIONS: readonly PresetExpirationOption[] = [
  { label: "5m", value: "300" },
  { label: "15m", value: "900" },
  { label: "1h", value: "3600" },
  { label: "24h", value: "86400" },
];

const PRESET_FILE_SIZES: readonly string[] = ["10MB", "50MB", "100MB", "500MB", "1GB", "5GB"];

const DATA_TYPES: readonly string[] = [
  "Image",
  "Video",
  "Audio",
  "Document",
  "JSON",
  "Archive",
  "Binary",
  "Other",
];

const EVENT_TRIGGERS: readonly EventTriggerOption[] = [
  { key: "s3:ObjectCreated:*", label: "Object Created (Upload / Put)", desc: "Triggers when a new file is uploaded" },
  { key: "s3:ObjectRemoved:*", label: "Object Removed (Delete)", desc: "Triggers when a file is permanently removed" },
  { key: "s3:ObjectRestore:*", label: "Object Restored", desc: "Triggers when an archive object finishes restoring" },
];

function toVarNameSafe(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
  return clean ? clean.charAt(0).toLowerCase() + clean.slice(1) : "bucket";
}

function toPascalCaseSafe(name: string): string {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return "Bucket";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

export const BucketStorageConfig: React.FC<BucketStorageConfigProps> = ({
  item,
  handleUpdate,
}) => {
  const allowedOps = Array.isArray(item.allowedOperations)
    ? item.allowedOperations
    : ["read", "write"];

  const storedTypes = Array.isArray(item.storedDataTypes)
    ? item.storedDataTypes
    : [];

  const corsMethodsList = Array.isArray(item.corsMethods)
    ? item.corsMethods
    : ["GET", "PUT", "POST", "HEAD"];

  const activeTriggers = Array.isArray(item.eventTriggers)
    ? item.eventTriggers
    : [];

  const toggleOp = (op: string) => {
    const next = allowedOps.includes(op)
      ? allowedOps.filter((o) => o !== op)
      : [...allowedOps, op];
    handleUpdate(item.id, { allowedOperations: next });
  };

  const toggleCorsMethod = (method: string) => {
    const next = corsMethodsList.includes(method)
      ? corsMethodsList.filter((m) => m !== method)
      : [...corsMethodsList, method];
    handleUpdate(item.id, { corsMethods: next });
  };

  const toggleEventTrigger = (key: string) => {
    const next = activeTriggers.includes(key)
      ? activeTriggers.filter((t) => t !== key)
      : [...activeTriggers, key];
    handleUpdate(item.id, { eventTriggers: next });
  };

  const selectedProvider = item.storageType || "s3";
  const accessPolicy = item.accessPolicy || "private";

  type PreviewTab = "code" | "spec" | "env";
  const [activeTab, setActiveTab] = useState<PreviewTab>("code");
  const [copied, setCopied] = useState<boolean>(false);

  const region = item.region || "us-east-1";
  const isCustomEndpoint = Boolean(item.endpointUrl && item.endpointUrl.trim().length > 0);
  const resolvedEndpoint = isCustomEndpoint
    ? item.endpointUrl || ""
    : `https://s3.${region}.amazonaws.com`;

  const bucketName = item.name || "my-bucket";
  const storageClass = item.storageClass || "STANDARD";
  const accessKeyName = item.accessKeyIdEnv || "AWS_ACCESS_KEY_ID";
  const secretKeyName = item.secretAccessKeyEnv || "AWS_SECRET_ACCESS_KEY";
  const encryptionType = item.encryption || "SSE-S3";
  const sseHeader = encryptionType === "SSE-KMS" ? "aws:kms" : encryptionType === "None" ? undefined : "AES256";

  const aclMode = accessPolicy === "public-read"
    ? "public-read"
    : accessPolicy === "authenticated-read"
      ? "authenticated-read"
      : "private";

  const isPresigned = Boolean(item.enablePresignedUrls || accessPolicy === "presigned-only");
  const presignedTtlSeconds = Number(item.presignedUrlTtl) || 900;
  const bucketVar = toVarNameSafe(bucketName);
  const bucketPascal = toPascalCaseSafe(bucketName);

  // 1. Comprehensive SDK Code (Includes all bucket configs: client, spec, upload, presigned, cdn)
  const generatedCodeSnippet = [
    `import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";`,
    ...(isPresigned ? [`import { getSignedUrl } from "@aws-sdk/s3-request-presigner";`] : []),
    ``,
    `// ─── 1. Authenticated S3 Client Init ───`,
    `export const s3 = new S3Client({`,
    `  region: "${region}",`,
    isCustomEndpoint
      ? `  endpoint: "${item.endpointUrl}",`
      : `  // endpoint: auto-resolved to "${resolvedEndpoint}"`,
    `  forcePathStyle: ${Boolean(item.forcePathStyle)},`,
    `  credentials: {`,
    `    accessKeyId: process.env.${accessKeyName}!,`,
    `    secretAccessKey: process.env.${secretKeyName}!,`,
    ...(item.sessionTokenEnv ? [`    sessionToken: process.env.${item.sessionTokenEnv},`] : []),
    `  },`,
    `});`,
    ``,
    `// ─── 2. Complete Bucket Configuration & Policy Spec ───`,
    `export const ${bucketVar}Config = {`,
    `  bucket: "${bucketName}",`,
    `  region: "${region}",`,
    `  storageClass: "${storageClass}",`,
    `  accessPolicy: "${accessPolicy}",`,
    `  allowedOperations: ${JSON.stringify(allowedOps)},`,
    ...(item.maxFileSize ? [`  maxFileSize: "${item.maxFileSize}",`] : []),
    ...(item.allowedExtensions ? [`  allowedExtensions: "${item.allowedExtensions}",`] : []),
    `  encryption: "${encryptionType}",`,
    ...(encryptionType === "SSE-KMS" && item.kmsKeyId ? [`  kmsKeyId: "${item.kmsKeyId}",`] : []),
    `  versioning: "${item.versioning || "Disabled"}",`,
    ...(item.enableCors ? [
      `  cors: {`,
      `    origins: ${JSON.stringify(item.corsOrigins ? item.corsOrigins.split(",").map((s) => s.trim()) : ["*"])},`,
      `    methods: ${JSON.stringify(corsMethodsList)},`,
      ...(item.corsMaxAge ? [`    maxAgeSeconds: ${Number(item.corsMaxAge) || 3600},`] : []),
      `  },`,
    ] : []),
    ...(item.lifecycleExpirationDays || item.lifecycleGlacierDays ? [
      `  lifecycle: {`,
      ...(item.lifecycleGlacierDays ? [`    glacierDays: ${Number(item.lifecycleGlacierDays) || 90},`] : []),
      ...(item.lifecycleExpirationDays ? [`    expirationDays: ${Number(item.lifecycleExpirationDays) || 365},`] : []),
      `  },`,
    ] : []),
    ...(activeTriggers.length > 0 ? [
      `  eventTriggers: ${JSON.stringify(activeTriggers)},`,
      ...(item.eventPrefixFilter ? [`  eventPrefix: "${item.eventPrefixFilter}",`] : []),
      ...(item.eventSuffixFilter ? [`  eventSuffix: "${item.eventSuffixFilter}",`] : []),
    ] : []),
    `};`,
    ``,
    `// ─── 3. Upload Operation with Configured Tier, ACL & Encryption ───`,
    `export async function uploadTo${bucketPascal}(key: string, file: Buffer) {`,
    `  return await s3.send(`,
    `    new PutObjectCommand({`,
    `      Bucket: "${bucketName}",`,
    `      Key: key,`,
    `      Body: file,`,
    `      StorageClass: "${storageClass}",`,
    `      ACL: "${aclMode}",`,
    ...(sseHeader ? [`      ServerSideEncryption: "${sseHeader}",`] : []),
    ...(encryptionType === "SSE-KMS" && item.kmsKeyId ? [`      SSEKMSKeyId: "${item.kmsKeyId}",`] : []),
    `    })`,
    `  );`,
    `}`,
    ...(isPresigned ? [
      ``,
      `// ─── 4. Presigned Direct Upload URL Generator ───`,
      `export async function get${bucketPascal}UploadUrl(key: string) {`,
      `  const command = new PutObjectCommand({ Bucket: "${bucketName}", Key: key });`,
      `  return await getSignedUrl(s3, command, { expiresIn: ${presignedTtlSeconds} });`,
      `}`,
    ] : []),
    ...(item.enableCdn && item.cdnDomain ? [
      ``,
      `// ─── 5. CDN Distribution URL Resolver ───`,
      `export function get${bucketPascal}CdnUrl(key: string) {`,
      `  return "https://${item.cdnDomain.replace(/^https?:\/\//, "")}/${bucketName}/" + key;`,
      `}`,
    ] : []),
  ].join("\n");

  // 2. Structured JSON Config Spec
  const generatedConfigSpec = JSON.stringify(
    {
      bucket: bucketName,
      provider: "s3",
      region,
      endpointUrl: isCustomEndpoint ? item.endpointUrl : resolvedEndpoint,
      endpointType: isCustomEndpoint ? "custom" : "aws-auto",
      forcePathStyle: Boolean(item.forcePathStyle),
      storageClass,
      accessPolicy,
      allowedOperations: allowedOps,
      credentials: {
        accessKeyIdEnv: accessKeyName,
        secretAccessKeyEnv: secretKeyName,
        sessionTokenEnv: item.sessionTokenEnv || null,
        roleArn: item.roleArn || null,
      },
      cors: {
        enabled: Boolean(item.enableCors),
        origins: item.corsOrigins || "*",
        methods: corsMethodsList,
        maxAge: item.corsMaxAge || null,
      },
      presignedUrls: {
        enabled: isPresigned,
        ttlSeconds: presignedTtlSeconds,
      },
      dataConstraints: {
        maxFileSize: item.maxFileSize || null,
        allowedExtensions: item.allowedExtensions || null,
        storedDataTypes: storedTypes,
      },
      cdn: {
        enabled: Boolean(item.enableCdn),
        domain: item.cdnDomain || null,
        cacheControl: item.cdnCacheControl || null,
      },
      security: {
        encryption: encryptionType,
        kmsKeyId: item.kmsKeyId || null,
        versioning: item.versioning || "Disabled",
      },
      lifecycle: {
        glacierDays: item.lifecycleGlacierDays || null,
        expirationDays: item.lifecycleExpirationDays || null,
      },
      events: {
        triggers: activeTriggers,
        prefixFilter: item.eventPrefixFilter || null,
        suffixFilter: item.eventSuffixFilter || null,
      },
    },
    null,
    2
  );

  // 3. Environment Variables (.env)
  const generatedEnvSnippet = [
    `# ─── AWS S3 Connection ───`,
    `STORAGE_REGION=${region}`,
    ...(isCustomEndpoint ? [`STORAGE_ENDPOINT_URL=${item.endpointUrl}`] : []),
    `STORAGE_FORCE_PATH_STYLE=${Boolean(item.forcePathStyle)}`,
    ...(item.enableCdn && item.cdnDomain ? [`STORAGE_CDN_URL=https://${item.cdnDomain.replace(/^https?:\/\//, "")}`] : []),
    ``,
    `# ─── AWS Credentials ───`,
    `${accessKeyName}=AKIAIOSFODNN7EXAMPLE`,
    `${secretKeyName}=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`,
    ...(item.sessionTokenEnv ? [`${item.sessionTokenEnv}=AQoDYXdzEJr1EXAMPLE...`] : []),
    ...(item.roleArn ? [`AWS_ROLE_ARN=${item.roleArn}`] : []),
    ...(item.kmsKeyId ? [`AWS_KMS_KEY_ID=${item.kmsKeyId}`] : []),
  ].join("\n");

  const handleCopy = () => {
    const textToCopy =
      activeTab === "code"
        ? generatedCodeSnippet
        : activeTab === "spec"
          ? generatedConfigSpec
          : generatedEnvSnippet;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-5 mt-2 mb-4 text-xs">
      {/* ─── Status & Quick Capability Bar ─── */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-xs">
          <HardDrive size={14} className="shrink-0" />
          <span>Bucket Configuration</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="bg-background/80 text-[10px] font-mono capitalize">
            {selectedProvider}
          </Badge>
          <Badge
            variant="outline"
            className={
              accessPolicy === "public-read"
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]"
                : accessPolicy === "presigned-only"
                  ? "bg-blue-500/10 text-blue-600 border-blue-500/30 text-[10px]"
                  : "bg-muted text-muted-foreground text-[10px]"
            }
          >
            {accessPolicy}
          </Badge>
          {item.enableCors && (
            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30 text-[10px]">
              CORS
            </Badge>
          )}
          {item.enablePresignedUrls && (
            <Badge variant="outline" className="bg-sky-500/10 text-sky-600 border-sky-500/30 text-[10px]">
              Presigned
            </Badge>
          )}
          {item.encryption && item.encryption !== "None" && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
              Encrypted
            </Badge>
          )}
        </div>
      </div>

      {/* ─── 1. Storage Provider & Class ─── */}
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
              onBlur={(e) =>
                handleUpdate(item.id, { storageTypeOther: e.target.value })
              }
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
              onBlur={(e) => handleUpdate(item.id, { region: e.target.value })}
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
            onBlur={(e) => handleUpdate(item.id, { endpointUrl: e.target.value })}
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
                onBlur={(e) =>
                  handleUpdate(item.id, { accessKeyIdEnv: e.target.value })
                }
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
                onBlur={(e) =>
                  handleUpdate(item.id, { secretAccessKeyEnv: e.target.value })
                }
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
                onBlur={(e) =>
                  handleUpdate(item.id, { sessionTokenEnv: e.target.value })
                }
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
                onBlur={(e) => handleUpdate(item.id, { roleArn: e.target.value })}
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

      {/* ─── 2. Connectability & Access Policy (Core) ─── */}
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
              checked={Boolean(item.enablePresignedUrls || accessPolicy === "presigned-only")}
              onCheckedChange={(checked) =>
                handleUpdate(item.id, { enablePresignedUrls: checked })
              }
            />
          </div>

          {(item.enablePresignedUrls || accessPolicy === "presigned-only") && (
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

      {/* ─── 3. CORS & Web Ingress ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-purple-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              CORS & Web Client Ingress
            </span>
          </div>
          <Switch
            checked={Boolean(item.enableCors)}
            onCheckedChange={(checked) => handleUpdate(item.id, { enableCors: checked })}
          />
        </div>

        {item.enableCors && (
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-foreground">Allowed Origins</label>
              <LocalInput
                className="h-8 bg-background/50 text-xs font-mono"
                placeholder="e.g. * or https://myapp.com, http://localhost:3000"
                value={item.corsOrigins || "*"}
                onBlur={(e) => handleUpdate(item.id, { corsOrigins: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-foreground">Allowed HTTP Methods</label>
              <div className="flex flex-wrap gap-1.5">
                {CORS_METHODS.map((m) => {
                  const active = corsMethodsList.includes(m);
                  return (
                    <Button
                      key={m}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className={`h-6 text-[10px] px-2 font-mono ${
                        active
                          ? "bg-purple-600 hover:bg-purple-700 text-white"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => toggleCorsMethod(m)}
                    >
                      {m}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-foreground">Allowed Headers</label>
                <LocalInput
                  className="h-8 bg-background/50 text-xs font-mono"
                  placeholder="* or Content-Type, Authorization"
                  value={item.corsHeaders || "*"}
                  onBlur={(e) => handleUpdate(item.id, { corsHeaders: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-foreground">Max Age (Seconds)</label>
                <LocalInput
                  className="h-8 bg-background/50 text-xs font-mono"
                  placeholder="3600"
                  value={item.corsMaxAge || "3600"}
                  onBlur={(e) => handleUpdate(item.id, { corsMaxAge: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── 4. Object Constraints & Data Types ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <FileCode size={14} className="text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Object Types & Size Limits
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            Categorize the kinds of objects stored in this bucket
          </span>
          <div className="grid grid-cols-2 gap-2">
            {DATA_TYPES.map((type) => {
              const isChecked = storedTypes.includes(type);
              return (
                <label
                  key={type}
                  className="flex items-center gap-2 cursor-pointer text-xs text-foreground p-1 rounded hover:bg-muted/30"
                >
                  <input
                    type="checkbox"
                    className="rounded border-border bg-background"
                    checked={isChecked}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      const updated = checked
                        ? [...storedTypes, type]
                        : storedTypes.filter((t: string) => t !== type);
                      handleUpdate(item.id, { storedDataTypes: updated });
                    }}
                  />
                  {type}
                </label>
              );
            })}
          </div>
        </div>

        {storedTypes.includes("Other") && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Other Data Types Description
            </span>
            <LocalInput
              className="h-8 bg-background/50 text-xs"
              placeholder="e.g. CAD Files, Parquet, SQLite snapshots"
              value={item.storedDataTypesOther || ""}
              onBlur={(e) =>
                handleUpdate(item.id, { storedDataTypesOther: e.target.value })
              }
            />
          </div>
        )}

        {/* Max File Size Limit */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-foreground">
              Maximum Object / File Size
            </label>
            <div className="flex items-center gap-1">
              {PRESET_FILE_SIZES.map((size) => (
                <Button
                  key={size}
                  type="button"
                  variant={item.maxFileSize === size ? "secondary" : "ghost"}
                  size="sm"
                  className="h-5 px-1.5 text-[9px]"
                  onClick={() => handleUpdate(item.id, { maxFileSize: size })}
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>
          <LocalInput
            className="h-8 bg-background/50 text-xs font-mono"
            placeholder="e.g. 50MB, 500MB, 2GB (leave blank for unlimited)"
            value={item.maxFileSize || ""}
            onBlur={(e) => handleUpdate(item.id, { maxFileSize: e.target.value })}
          />
        </div>

        {/* Allowed MIME types / Extensions filter */}
        <div className="flex flex-col gap-1.5 pt-1">
          <label className="text-[11px] font-medium text-foreground">
            Allowed Extensions / MIME Types Filter
          </label>
          <LocalInput
            className="h-8 bg-background/50 text-xs font-mono"
            placeholder="e.g. .png, .jpg, .jpeg, .pdf, image/*, application/pdf"
            value={item.allowedExtensions || ""}
            onBlur={(e) => handleUpdate(item.id, { allowedExtensions: e.target.value })}
          />
        </div>
      </div>

      {/* ─── 5. Event Notifications & Downstream Connectability ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm border-blue-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-blue-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Bucket Event Notifications
            </span>
          </div>
          <Badge variant="outline" className="text-[10px]">
            Egress Triggers
          </Badge>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Emit event notifications when objects are uploaded, modified, or deleted. Connect the bucket&apos;s right handle on the canvas to downstream worker queues or endpoints to consume these events.
        </p>

        <div className="flex flex-col gap-2 pt-1">
          {EVENT_TRIGGERS.map((trigger) => {
            const active = activeTriggers.includes(trigger.key);
            return (
              <label
                key={trigger.key}
                className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                  active
                    ? "bg-blue-500/10 border-blue-500/30 text-foreground"
                    : "bg-muted/15 border-border/50 text-muted-foreground hover:bg-muted/30"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-border bg-background"
                  checked={active}
                  onChange={() => toggleEventTrigger(trigger.key)}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">{trigger.label}</span>
                  <span className="text-[10px] text-muted-foreground">{trigger.desc}</span>
                  <span className="text-[9px] font-mono text-muted-foreground/70 mt-0.5">
                    {trigger.key}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        {activeTriggers.length > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">
                Prefix Filter
              </label>
              <LocalInput
                className="h-7 text-xs font-mono"
                placeholder="e.g. uploads/ or raw/"
                value={item.eventPrefixFilter || ""}
                onBlur={(e) =>
                  handleUpdate(item.id, { eventPrefixFilter: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">
                Suffix Filter
              </label>
              <LocalInput
                className="h-7 text-xs font-mono"
                placeholder="e.g. .jpg or .mp4"
                value={item.eventSuffixFilter || ""}
                onBlur={(e) =>
                  handleUpdate(item.id, { eventSuffixFilter: e.target.value })
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── 6. CDN & Edge Delivery ─── */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe size={14} className="text-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              CDN & Edge Delivery
            </span>
          </div>
          <Switch
            checked={Boolean(item.enableCdn)}
            onCheckedChange={(checked) => handleUpdate(item.id, { enableCdn: checked })}
          />
        </div>

        {item.enableCdn && (
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-foreground">CDN Distribution Domain</label>
              <LocalInput
                className="h-8 bg-background/50 text-xs font-mono"
                placeholder="e.g. cdn.myapp.com or d1234abcd.cloudfront.net"
                value={item.cdnDomain || ""}
                onBlur={(e) => handleUpdate(item.id, { cdnDomain: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-foreground">Cache-Control Header Strategy</label>
              <Select
                value={item.cdnCacheControl || "public, max-age=31536000, immutable"}
                onValueChange={(v) => handleUpdate(item.id, { cdnCacheControl: v })}
              >
                <SelectTrigger className="w-full bg-background/50 h-8 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public, max-age=31536000, immutable" className="text-xs font-mono">
                    public, max-age=31536000, immutable (Static Media - 1 Year)
                  </SelectItem>
                  <SelectItem value="public, max-age=86400" className="text-xs font-mono">
                    public, max-age=86400 (1 Day)
                  </SelectItem>
                  <SelectItem value="public, max-age=3600" className="text-xs font-mono">
                    public, max-age=3600 (1 Hour)
                  </SelectItem>
                  <SelectItem value="no-cache, no-store, must-revalidate" className="text-xs font-mono">
                    no-cache, no-store (Private / Sensitive)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* ─── 7. Security & Lifecycle Rules ─── */}
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

      {/* ─── Complete Configuration Preview (Live Summary) ─── */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-muted/20 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Terminal size={14} className="text-amber-500" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
              Configuration & SDK Preview
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={activeTab === "code" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setActiveTab("code")}
            >
              SDK Code
            </Button>
            <Button
              type="button"
              variant={activeTab === "spec" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setActiveTab("spec")}
            >
              Config Spec (JSON)
            </Button>
            <Button
              type="button"
              variant={activeTab === "env" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setActiveTab("env")}
            >
              .env File
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 ml-1"
              onClick={handleCopy}
            >
              {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
        </div>

        <pre className="p-3 rounded-lg bg-background/90 border border-border/60 font-mono text-[11px] text-foreground overflow-x-auto leading-relaxed max-h-[320px]">
          {activeTab === "code"
            ? generatedCodeSnippet
            : activeTab === "spec"
              ? generatedConfigSpec
              : generatedEnvSnippet}
        </pre>
      </div>
    </div>
  );
};
