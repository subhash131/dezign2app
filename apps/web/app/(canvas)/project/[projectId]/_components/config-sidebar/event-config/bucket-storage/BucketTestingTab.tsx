import React, { useState, useMemo } from "react";
import {
  Wifi,
  Play,
  FileCode,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  HardDrive,
  Clock,
  Terminal,
  Globe,
  AlertTriangle,
  Server,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { ConfigItemData } from "../types";
import {
  checkStorageConnection,
  executeStorageOperation,
  type CheckStorageConnectionResult,
  type ExecuteStorageOperationResult,
} from "@/lib/services/storageService";
import { STORAGE_OPERATIONS } from "@workspace/canvas/constants";
import type { TestingViewMode, StorageOperationOption, OperationOption } from "@workspace/canvas/types";
import { toVarNameSafe } from "./snippetUtils";

export interface BucketTestingTabProps {
  item: ConfigItemData;
}


export function generateOperationInvocationCode(
  opKey: string,
  bucketName: string,
  params: {
    key: string;
    body?: string;
    contentType?: string;
    ttl?: string;
    metadata?: Record<string, string>;
    prefix?: string;
    maxKeys?: number;
  },
): string {
  switch (opKey) {
    case "uploadObject":
      return `import { uploadObject } from "@workspace/storage/operations";

const result = await uploadObject(
  "${bucketName}",
  "${params.key}",
  Buffer.from("${params.body ? params.body.slice(0, 40) + "..." : "File payload"}"),
  {
    contentType: "${params.contentType || "application/octet-stream"}",
    metadata: ${JSON.stringify(params.metadata || { uploadedBy: "testUser" }, null, 4).replace(/\n/g, "\n  ")},
  }
);
console.log("Upload result:", result);`;

    case "downloadObject":
      return `import { downloadObject } from "@workspace/storage/operations";

const stream = await downloadObject("${bucketName}", "${params.key}");
console.log("Download stream received for ${params.key}");`;

    case "getUploadPresignedUrl":
      return `import { getUploadPresignedUrl } from "@workspace/storage/operations";

const signedPutUrl = await getUploadPresignedUrl(
  "${bucketName}",
  "${params.key}",
  {
    expiresInSeconds: ${params.ttl || 900},
    contentType: "${params.contentType || "image/png"}",
  }
);
console.log("Signed PUT URL:", signedPutUrl);`;

    case "getDownloadPresignedUrl":
      return `import { getDownloadPresignedUrl } from "@workspace/storage/operations";

const signedGetUrl = await getDownloadPresignedUrl(
  "${bucketName}",
  "${params.key}",
  {
    expiresInSeconds: ${params.ttl || 3600},
  }
);
console.log("Signed GET URL:", signedGetUrl);`;

    case "objectExists":
      return `import { objectExists } from "@workspace/storage/operations";

const exists = await objectExists("${bucketName}", "${params.key}");
console.log("Object exists:", exists);`;

    case "deleteObject":
      return `import { deleteObject } from "@workspace/storage/operations";

const response = await deleteObject("${bucketName}", "${params.key}");
console.log("Delete status:", response);`;

    case "listObjects":
      return `import { listObjects } from "@workspace/storage/operations";

const items = await listObjects(
  "${bucketName}",
  "${params.prefix || "uploads/"}",
  ${params.maxKeys || 100}
);
console.log(\`Found \${items.length} objects\`);`;

    case "getPublicObjectUrl":
      return `import { getPublicObjectUrl } from "@workspace/storage/operations";

const publicUrl = getPublicObjectUrl("${bucketName}", "${params.key}");
console.log("Public URL:", publicUrl);`;

    default:
      return `// Operation ${opKey} on ${bucketName}`;
  }
}

export function generateFullVitestSuite(item: ConfigItemData): string {
  const bucketName = item.name || "user-avatars";
  const region = item.region || "us-east-1";

  return `import { describe, it, expect } from "vitest";
import { s3Client } from "../src/client";
import { storageConfig } from "../src/config";
import { getBucketMetadata } from "../src/buckets";
import {
  uploadObject,
  downloadObject,
  getUploadPresignedUrl,
  getDownloadPresignedUrl,
  objectExists,
  deleteObject,
  listObjects,
  getPublicObjectUrl,
} from "../src/operations";

describe("${bucketName} — Generated S3 Client & Operations Suite", () => {
  describe("Client Initialization & Config", () => {
    it("should export initialized s3Client and storageConfig", () => {
      expect(s3Client).toBeDefined();
      expect(storageConfig).toBeDefined();
      expect(storageConfig.region).toBe("${region}");
    });

    it("should resolve bucket metadata for '${bucketName}'", () => {
      const meta = getBucketMetadata("${bucketName}");
      expect(meta).toBeDefined();
      expect(meta?.name).toBe("${bucketName}");
    });
  });

  describe("Generated Operations", () => {
    it("should generate presigned upload URL", async () => {
      const url = await getUploadPresignedUrl("${bucketName}", "test/avatar.png", {
        expiresInSeconds: 900,
        contentType: "image/png",
      });
      expect(url).toContain("https://");
      expect(url).toContain("${bucketName}");
    });

    it("should generate presigned download URL", async () => {
      const url = await getDownloadPresignedUrl("${bucketName}", "test/avatar.png", {
        expiresInSeconds: 3600,
      });
      expect(url).toContain("https://");
      expect(url).toContain("${bucketName}");
    });

    it("should execute objectExists check", async () => {
      const exists = await objectExists("${bucketName}", "test/avatar.png");
      expect(typeof exists).toBe("boolean");
    });

    it("should resolve public object URL correctly", () => {
      const url = getPublicObjectUrl("${bucketName}", "images/banner.jpg");
      expect(url).toContain("images/banner.jpg");
    });
  });
});
`;
}

export const BucketTestingTab: React.FC<BucketTestingTabProps> = ({ item }) => {
  const [viewMode, setViewMode] = useState<TestingViewMode>("operations");
  const [selectedOpKey, setSelectedOpKey] = useState<string>("uploadObject");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  // Endpoint and server configuration overrides
  const [endpointOverride, setEndpointOverride] = useState<string>(item.endpointUrl || "");
  const [accessKeyOverride, setAccessKeyOverride] = useState<string>("");
  const [secretKeyOverride, setSecretKeyOverride] = useState<string>("");

  // Form inputs for operations
  const [keyInput, setKeyInput] = useState<string>("uploads/avatars/user-42.png");
  const [contentTypeInput, setContentTypeInput] = useState<string>("image/png");
  const [bodyInput, setBodyInput] = useState<string>("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
  const [ttlInput, setTtlInput] = useState<string>("900");
  const [prefixInput, setPrefixInput] = useState<string>("uploads/");

  // Metadata key-values (for testing custom metadata)
  const [metadataUser, setMetadataUser] = useState<string>("user-9842");
  const [metadataTags, setMetadataTags] = useState<string>("avatar,profile");

  // Operation execution state (live server execution)
  const [isExecutingOp, setIsExecutingOp] = useState(false);
  const [opResult, setOpResult] = useState<ExecuteStorageOperationResult | null>(null);

  // Connection testing state (live server connection)
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<CheckStorageConnectionResult | null>(null);

  const bucketName = item.name || "default-bucket";
  const region = item.region || "us-east-1";
  const accessPolicy = item.accessPolicy || "private";
  const activeEndpoint = (endpointOverride.trim() || item.endpointUrl || "").trim() || `https://s3.${region}.amazonaws.com`;

  const selectedOp = useMemo(
    () => STORAGE_OPERATIONS.find((o) => o.key === selectedOpKey) || (STORAGE_OPERATIONS[0] as OperationOption),
    [selectedOpKey],
  );

  const activeInvocationCode = useMemo(() => {
    return generateOperationInvocationCode(selectedOpKey, bucketName, {
      key: keyInput,
      body: bodyInput,
      contentType: contentTypeInput,
      ttl: ttlInput,
      prefix: prefixInput,
      metadata: {
        userId: metadataUser,
        tags: metadataTags,
      },
    });
  }, [selectedOpKey, bucketName, keyInput, bodyInput, contentTypeInput, ttlInput, prefixInput, metadataUser, metadataTags]);

  const fullVitestSuite = useMemo(() => {
    return generateFullVitestSuite(item);
  }, [item]);

  // Execute Live Connection Test against the configured server
  const handleRunConnectionTest = async () => {
    setIsTestingConn(true);
    setConnResult(null);

    try {
      const res = await checkStorageConnection({
        endpointUrl: activeEndpoint,
        region,
        bucketName,
        storageType: item.storageType || "s3",
        forcePathStyle: item.forcePathStyle,
        accessKeyId: accessKeyOverride || undefined,
        secretAccessKey: secretKeyOverride || undefined,
        accessKeyIdEnv: item.accessKeyIdEnv,
        secretAccessKeyEnv: item.secretAccessKeyEnv,
      });
      setConnResult(res);
    } catch (err: any) {
      setConnResult({
        success: false,
        serverActive: false,
        status: 0,
        statusText: "Request Error",
        durationMs: 0,
        endpoint: activeEndpoint,
        bucket: bucketName,
        region,
        error: err?.message || String(err),
      });
    } finally {
      setIsTestingConn(false);
    }
  };

  // Execute Live Generated Operation against the configured server
  const handleRunOperation = async () => {
    setIsExecutingOp(true);
    setOpResult(null);

    try {
      const res = await executeStorageOperation({
        connection: {
          endpointUrl: activeEndpoint,
          region,
          bucketName,
          storageType: item.storageType || "s3",
          forcePathStyle: item.forcePathStyle,
          accessKeyId: accessKeyOverride || undefined,
          secretAccessKey: secretKeyOverride || undefined,
          accessKeyIdEnv: item.accessKeyIdEnv,
          secretAccessKeyEnv: item.secretAccessKeyEnv,
          cdnUrl: item.cdnDomain,
        },
        operation: selectedOpKey,
        params: {
          key: keyInput,
          body: bodyInput,
          contentType: contentTypeInput,
          ttl: ttlInput,
          prefix: prefixInput,
          metadata: {
            userId: metadataUser,
            tags: metadataTags,
          },
        },
      });
      setOpResult(res);
    } catch (err: any) {
      setOpResult({
        success: false,
        serverActive: false,
        status: 0,
        statusText: "Execution Failed",
        durationMs: 0,
        endpoint: activeEndpoint,
        method: "FETCH",
        url: activeEndpoint,
        data: null,
        error: err?.message || String(err),
      });
    } finally {
      setIsExecutingOp(false);
    }
  };

  const handleCopy = (text: string, isResult = false) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (isResult) {
        setCopiedResult(true);
        setTimeout(() => setCopiedResult(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* ─── Target Server Live Status Bar ─── */}
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
            <Server size={13} className="shrink-0" />
            <span>Configured Storage Server:</span>
            <code className="text-[11px] font-mono bg-background/80 px-1.5 py-0.5 rounded border border-border/60 text-foreground">
              {activeEndpoint}
            </code>
          </div>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Server Dispatch
          </Badge>
        </div>

        {/* Optional endpoint and credentials quick overrides */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-amber-500/20 text-[11px]">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">Endpoint (MinIO / LocalStack / AWS)</span>
            <Input
              className="h-7 text-xs font-mono bg-background"
              placeholder={item.endpointUrl || `https://s3.${region}.amazonaws.com`}
              value={endpointOverride}
              onChange={(e) => setEndpointOverride(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">Access Key ID (Optional override)</span>
            <Input
              className="h-7 text-xs font-mono bg-background"
              placeholder={item.accessKeyIdEnv ? `env: ${item.accessKeyIdEnv}` : "minioadmin"}
              value={accessKeyOverride}
              onChange={(e) => setAccessKeyOverride(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground">Secret Key (Optional override)</span>
            <Input
              type="password"
              className="h-7 text-xs font-mono bg-background"
              placeholder={item.secretAccessKeyEnv ? `env: ${item.secretAccessKeyEnv}` : "minioadmin"}
              value={secretKeyOverride}
              onChange={(e) => setSecretKeyOverride(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ─── Sub-Tab Navigation Header ─── */}
      <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-card/60 border border-border/80">
        <div className="grid grid-cols-3 w-full gap-1">
          <button
            type="button"
            onClick={() => setViewMode("operations")}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-xs transition-all cursor-pointer ${
              viewMode === "operations"
                ? "bg-amber-500 text-black shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Play size={12} />
            <span>Test Operations</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("connection")}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-xs transition-all cursor-pointer ${
              viewMode === "connection"
                ? "bg-amber-500 text-black shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Wifi size={12} />
            <span>Test Connection</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("suite")}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md font-medium text-xs transition-all cursor-pointer ${
              viewMode === "suite"
                ? "bg-amber-500 text-black shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <FileCode size={12} />
            <span>Vitest Suite</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VIEW 1: TEST GENERATED OPERATIONS (HITS LIVE SERVER)                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {viewMode === "operations" && (
        <div className="flex flex-col gap-4">
          {/* Operation Selector */}
          <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-border/80 bg-card/50">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <Play size={12} /> Generated Storage Operation
              </label>
              <Badge variant="outline" className="text-[10px] font-mono">
                @workspace/storage/operations
              </Badge>
            </div>

            <Select
              value={selectedOpKey}
              onValueChange={(val) => {
                setSelectedOpKey(val);
                const found = STORAGE_OPERATIONS.find((o) => o.key === val);
                if (found) {
                  setKeyInput(found.defaultKey);
                  if (found.defaultContentType) setContentTypeInput(found.defaultContentType);
                  if (found.defaultBody) setBodyInput(found.defaultBody);
                  if (found.defaultTtl) setTtlInput(found.defaultTtl);
                }
                setOpResult(null);
              }}
            >
              <SelectTrigger className="h-8 bg-background/80 text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORAGE_OPERATIONS.map((op) => (
                  <SelectItem key={op.key} value={op.key} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{op.name}()</span>
                      <span className="text-[10px] text-muted-foreground">({op.kind})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="text-[11px] text-muted-foreground">{selectedOp?.desc}</p>
          </div>

          {/* Operation Input Parameters */}
          <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-border/80 bg-card/50">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Request Parameters (Live Server Dispatch)
            </span>

            {/* Target Key */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-foreground">Object Key / Path</label>
              <Input
                className="h-8 text-xs font-mono bg-background"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="e.g. uploads/avatars/user-1.png"
              />
            </div>

            {/* Additional parameters based on operation */}
            {selectedOpKey === "uploadObject" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-foreground">Content-Type</label>
                  <Input
                    className="h-8 text-xs font-mono bg-background"
                    value={contentTypeInput}
                    onChange={(e) => setContentTypeInput(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-foreground">Payload Data to Send</label>
                  <Textarea
                    className="h-16 text-xs font-mono bg-background resize-none"
                    value={bodyInput}
                    onChange={(e) => setBodyInput(e.target.value)}
                  />
                </div>

                {Boolean(item.enableMetadata) && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                      Custom Metadata Schema Attributes (x-amz-meta-*)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">userId</label>
                        <Input
                          className="h-7 text-xs bg-background"
                          value={metadataUser}
                          onChange={(e) => setMetadataUser(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] text-muted-foreground">tags</label>
                        <Input
                          className="h-7 text-xs bg-background"
                          value={metadataTags}
                          onChange={(e) => setMetadataTags(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {(selectedOpKey === "getUploadPresignedUrl" || selectedOpKey === "getDownloadPresignedUrl") && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">Expiration (Seconds)</label>
                <Input
                  className="h-8 text-xs font-mono bg-background"
                  value={ttlInput}
                  onChange={(e) => setTtlInput(e.target.value)}
                />
              </div>
            )}

            {selectedOpKey === "listObjects" && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-foreground">Folder / Prefix Filter</label>
                <Input
                  className="h-8 text-xs font-mono bg-background"
                  value={prefixInput}
                  onChange={(e) => setPrefixInput(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Generated Code Preview (What is being tested) */}
          <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-border/80 bg-black/60 dark:bg-black/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Terminal size={12} /> Generated Code Under Test
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                onClick={() => handleCopy(activeInvocationCode)}
              >
                {copiedCode ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                {copiedCode ? "Copied" : "Copy Code"}
              </Button>
            </div>
            <pre className="text-[11px] font-mono text-emerald-400/90 overflow-x-auto leading-relaxed select-text p-1">
              {activeInvocationCode}
            </pre>
          </div>

          {/* Run Live Operation Button */}
          <Button
            size="sm"
            onClick={handleRunOperation}
            disabled={isExecutingOp}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs h-9 gap-2 shadow-sm"
          >
            <Play size={12} fill="currentColor" />
            {isExecutingOp
              ? `Sending ${selectedOp?.name || "operation"}() to ${activeEndpoint}...`
              : `Run ${selectedOp?.name || "operation"}() Test (Hit Server)`}
          </Button>

          {/* Live Operation Test Results */}
          {opResult && (
            <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-border/80 bg-card/60">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 border ${
                      opResult.success
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-destructive/15 text-destructive border-destructive/30"
                    }`}
                  >
                    {opResult.status > 0 ? `${opResult.status} ${opResult.statusText}` : "Network Error"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                    <Clock size={11} /> {opResult.durationMs}ms
                  </span>
                </div>

                <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground truncate">
                  <span>{opResult.method}</span>
                  <span className="truncate max-w-[200px]">{opResult.url}</span>
                </div>
              </div>

              {opResult.error && (
                <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[11px]">
                  <strong>Server Error:</strong> {opResult.error}
                  {opResult.tip && <p className="text-[10px] text-muted-foreground mt-1">{opResult.tip}</p>}
                </div>
              )}

              {opResult.signedUrl && (
                <div className="flex flex-col gap-1 p-2 rounded bg-background/80 border border-border/60">
                  <span className="text-[10px] font-bold text-amber-500 uppercase">Generated Presigned URL:</span>
                  <span className="text-[10px] font-mono break-all text-muted-foreground select-all">
                    {opResult.signedUrl}
                  </span>
                </div>
              )}

              {opResult.data !== null && opResult.data !== undefined && (
                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Live Server Response:</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => handleCopy(JSON.stringify(opResult.data, null, 2), true)}
                    >
                      {copiedResult ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                      {copiedResult ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <pre className="p-2.5 rounded bg-black/60 dark:bg-black/90 text-[11px] font-mono text-foreground/90 overflow-x-auto whitespace-pre-wrap select-text leading-relaxed">
                    {typeof opResult.data === "object"
                      ? JSON.stringify(opResult.data, null, 2)
                      : String(opResult.data)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VIEW 2: TEST S3 CLIENT CONNECTION (HITS LIVE SERVER)                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {viewMode === "connection" && (
        <div className="flex flex-col gap-4">
          {/* Connection Profile Card */}
          <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-border/80 bg-card/50">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                <Wifi size={12} /> Storage Client Connection Spec
              </span>
              <Badge variant="outline" className="text-[10px] font-mono">
                @workspace/storage/client
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex flex-col gap-0.5 p-2 rounded bg-background/60 border border-border/40">
                <span className="text-[10px] text-muted-foreground">Target Bucket</span>
                <span className="font-mono font-medium text-foreground truncate">{bucketName}</span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded bg-background/60 border border-border/40">
                <span className="text-[10px] text-muted-foreground">Storage Provider</span>
                <span className="font-mono font-medium text-foreground uppercase">{item.storageType || "s3"}</span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded bg-background/60 border border-border/40">
                <span className="text-[10px] text-muted-foreground">Region</span>
                <span className="font-mono font-medium text-foreground">{region}</span>
              </div>
              <div className="flex flex-col gap-0.5 p-2 rounded bg-background/60 border border-border/40">
                <span className="text-[10px] text-muted-foreground">Access Policy</span>
                <span className="font-mono font-medium text-foreground capitalize">{accessPolicy}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1 p-2 rounded bg-background/60 border border-border/40">
              <span className="text-[10px] text-muted-foreground">Target Server Endpoint</span>
              <span className="font-mono text-[10px] text-foreground break-all">{activeEndpoint}</span>
            </div>
          </div>

          {/* Generated Client Initialization Code */}
          <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-border/80 bg-black/60 dark:bg-black/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Terminal size={12} /> Generated Connection Test Code
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                onClick={() =>
                  handleCopy(`import { s3Client } from "@workspace/storage/client";
import { HeadBucketCommand } from "@aws-sdk/client-s3";

// Test connection and bucket reachability against configured server
const cmd = new HeadBucketCommand({ Bucket: "${bucketName}" });
const res = await s3Client.send(cmd);
console.log("Bucket reachable:", res.$metadata.httpStatusCode === 200);`)
                }
              >
                <Copy size={11} /> Copy
              </Button>
            </div>
            <pre className="text-[11px] font-mono text-emerald-400/90 overflow-x-auto leading-relaxed select-text p-1">
{`import { s3Client } from "@workspace/storage/client";
import { HeadBucketCommand } from "@aws-sdk/client-s3";

// 1. Send HeadBucket ping to verify credentials and endpoint reachability
const cmd = new HeadBucketCommand({ Bucket: "${bucketName}" });
const res = await s3Client.send(cmd);`}
            </pre>
          </div>

          {/* Run Connection Test Button */}
          <Button
            size="sm"
            onClick={handleRunConnectionTest}
            disabled={isTestingConn}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs h-9 gap-2 shadow-sm"
          >
            <Wifi size={12} />
            {isTestingConn
              ? `Probing server at ${activeEndpoint}...`
              : "Ping Server & Test S3 Connection"}
          </Button>

          {/* Connection Test Results */}
          {connResult && (
            <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-border/80 bg-card/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 border ${
                      connResult.success
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : connResult.serverActive
                          ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                          : "bg-destructive/15 text-destructive border-destructive/30"
                    }`}
                  >
                    {connResult.status > 0
                      ? `${connResult.status} ${connResult.statusText}`
                      : "Connection Failed"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                    <Clock size={11} /> {connResult.durationMs}ms
                  </span>
                </div>

                <span
                  className={`text-[10px] font-semibold flex items-center gap-1 ${
                    connResult.serverActive ? "text-emerald-400" : "text-destructive"
                  }`}
                >
                  {connResult.serverActive ? (
                    <>
                      <CheckCircle2 size={12} /> Server Active
                    </>
                  ) : (
                    <>
                      <XCircle size={12} /> Server Inactive / Unreachable
                    </>
                  )}
                </span>
              </div>

              {connResult.serverHeader && (
                <div className="text-[10px] font-mono text-muted-foreground">
                  Server Header: <strong className="text-foreground">{connResult.serverHeader}</strong>
                </div>
              )}

              {connResult.error && (
                <div className="p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-[11px]">
                  <strong>Result:</strong> {connResult.error}
                  {connResult.tip && <p className="text-[10px] text-muted-foreground mt-1">{connResult.tip}</p>}
                </div>
              )}

              {connResult.success && (
                <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-medium">
                  <CheckCircle2 size={14} /> Successfully contacted storage server at {connResult.endpoint}!
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* VIEW 3: FULL VITEST SUITE FOR GENERATED CODE                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {viewMode === "suite" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-foreground">Generated Vitest Storage Suite</span>
              <span className="text-[10px] text-muted-foreground">
                Standalone test suite verifying connection and operations for <code>{bucketName}</code>
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => handleCopy(fullVitestSuite)}
            >
              {copiedCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              {copiedCode ? "Copied Suite" : "Copy Test File"}
            </Button>
          </div>

          <pre className="p-3.5 rounded-xl bg-black/60 dark:bg-black/90 border border-border/80 text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed select-text max-h-[380px]">
            {fullVitestSuite}
          </pre>
        </div>
      )}
    </div>
  );
};
