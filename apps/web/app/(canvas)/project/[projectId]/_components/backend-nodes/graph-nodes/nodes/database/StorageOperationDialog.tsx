"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs";
import { Switch } from "@workspace/ui/components/switch";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Badge } from "@workspace/ui/components/badge";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  StorageOperationFunction,
  StorageOperationKind,
  getStorageKindBadge,
  generateStorageOperationSnippet,
} from "@/lib/utils/storageOperationsHelper";
import { BackendNodeData } from "@/types/canvas";
import {
  Settings,
  Code2,
  Play,
  Copy,
  Check,
  Trash,
  Plus,
  Layers,
  Shield,
  HardDrive,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

export interface StorageNodeRef {
  id: string;
  data: BackendNodeData;
  type?: string;
}

export interface StorageTestFileItem {
  Key: string;
  Size: number;
  LastModified: string;
}

export interface StorageTestResultData {
  url?: string;
  method?: string;
  expiresInSeconds?: number;
  bucket?: string;
  key?: string;
  $metadata?: { httpStatusCode: number; requestId?: string };
  ETag?: string;
  versionId?: string;
  sizeBytes?: number;
  contentType?: string;
  contentLength?: number;
  lastModified?: string;
  payloadPreview?: string;
  exists?: boolean;
  deleted?: string[];
  status?: string;
  keyCount?: number;
  contents?: StorageTestFileItem[];
  success?: boolean;
  operation?: string;
  executedAt?: string;
}

export interface StorageOperationTestResult {
  status: number;
  statusText: string;
  durationMs: number;
  data: StorageTestResultData;
}

export type StorageDialogTab = "configure" | "preview" | "test";

export interface StorageOperationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  operation?: StorageOperationFunction | null;
  isNew?: boolean;
  storageNode: StorageNodeRef;
  onSave: (op: StorageOperationFunction) => void;
  onDelete?: (opId: string) => void;
}

export const StorageOperationDialog: React.FC<StorageOperationDialogProps> = ({
  isOpen,
  onClose,
  operation,
  isNew = false,
  storageNode,
  onSave,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<StorageDialogTab>("configure");

  // Form state
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<StorageOperationKind>("upload");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [defaultBucket, setDefaultBucket] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [copied, setCopied] = useState(false);

  // Testing tab state
  const [testBucket, setTestBucket] = useState("");
  const [testKey, setTestKey] = useState("uploads/test-file.txt");
  const [testBody, setTestBody] = useState("Hello world from Storage Test!");
  const [testTtl, setTestTtl] = useState("900");
  const [testContentType, setTestContentType] = useState("text/plain");
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<StorageOperationTestResult | null>(null);

  const availableBuckets = storageNode?.data?.buckets || [];
  const defaultBucketName = availableBuckets[0]?.name || "default-bucket";

  useEffect(() => {
    if (operation) {
      setName(operation.name || "");
      setLabel(operation.label || operation.name || "");
      setKind(operation.kind || "upload");
      setDescription(operation.description || "");
      setEnabled(operation.enabled !== false);
      setDefaultBucket(operation.defaultBucket || defaultBucketName);
      setCustomCode(operation.code || "");
      setTestBucket(operation.defaultBucket || defaultBucketName);
      setTestResult(null);
    } else if (isNew) {
      setName("customStorageOp");
      setLabel("Custom Storage Operation");
      setKind("upload");
      setDescription("Custom storage operation");
      setEnabled(true);
      setDefaultBucket(defaultBucketName);
      setCustomCode(
        `// Custom storage operation logic\nexport async function customStorageOp(bucketName: string, key: string) {\n  // Implementation\n}`,
      );
      setTestBucket(defaultBucketName);
      setTestResult(null);
    }
    setActiveTab("configure");
  }, [operation, isNew, defaultBucketName]);

  const handleCopySnippet = () => {
    if (!operation && !isNew) return;
    const currentOp: StorageOperationFunction = {
      ...(operation || {
        id: `storage-custom-${Date.now()}`,
        signature: `${name}(bucketName: string, key: string): Promise<string>`,
        returnType: "Promise<string>",
        params: [],
        badge: getStorageKindBadge(kind),
      }),
      name,
      label,
      kind,
      description,
      defaultBucket,
      code: customCode,
    };
    const snippet = generateStorageOperationSnippet(currentOp, storageNode);
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExecuteTest = () => {
    setTestRunning(true);
    setTimeout(() => {
      setTestRunning(false);
      const simulatedDuration = Math.floor(Math.random() * 25) + 12; // 12 - 37ms
      if (kind === "presign_upload" || kind === "presign_download") {
        const action = kind === "presign_upload" ? "put" : "get";
        setTestResult({
          status: 200,
          statusText: "OK",
          durationMs: simulatedDuration,
          data: {
            url: `https://s3.${storageNode?.data?.defaultRegion || "us-east-1"}.amazonaws.com/${testBucket}/${testKey}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${testTtl}&X-Amz-Signature=mock_sig_${Date.now()}`,
            method: action.toUpperCase(),
            expiresInSeconds: Number(testTtl) || 900,
            bucket: testBucket,
            key: testKey,
          },
        });
      } else if (kind === "upload") {
        setTestResult({
          status: 200,
          statusText: "OK",
          durationMs: simulatedDuration,
          data: {
            $metadata: { httpStatusCode: 200, requestId: `req-${Date.now()}` },
            ETag: `"${Math.random().toString(16).slice(2, 18)}"`,
            versionId: "v1.0",
            bucket: testBucket,
            key: testKey,
            sizeBytes: testBody.length,
            contentType: testContentType,
          },
        });
      } else if (kind === "download") {
        setTestResult({
          status: 200,
          statusText: "OK",
          durationMs: simulatedDuration,
          data: {
            $metadata: { httpStatusCode: 200 },
            contentLength: 1024,
            contentType: testContentType,
            lastModified: new Date().toISOString(),
            payloadPreview: "Buffer<48 65 6c 6c 6f 20 57 6f 72 6c 64>",
          },
        });
      } else if (kind === "exists") {
        setTestResult({
          status: 200,
          statusText: "OK",
          durationMs: simulatedDuration,
          data: {
            exists: true,
            bucket: testBucket,
            key: testKey,
          },
        });
      } else if (kind === "delete" || kind === "batch_delete") {
        setTestResult({
          status: 204,
          statusText: "No Content",
          durationMs: simulatedDuration,
          data: {
            deleted: [testKey],
            status: "Successfully purged",
          },
        });
      } else if (kind === "list") {
        setTestResult({
          status: 200,
          statusText: "OK",
          durationMs: simulatedDuration,
          data: {
            bucket: testBucket,
            keyCount: 3,
            contents: [
              { Key: `${testKey}`, Size: 4096, LastModified: new Date().toISOString() },
              { Key: `uploads/file-2.png`, Size: 24500, LastModified: new Date().toISOString() },
              { Key: `uploads/file-3.pdf`, Size: 104200, LastModified: new Date().toISOString() },
            ],
          },
        });
      } else {
        setTestResult({
          status: 200,
          statusText: "OK",
          durationMs: simulatedDuration,
          data: {
            success: true,
            operation: name,
            executedAt: new Date().toISOString(),
          },
        });
      }
    }, 450);
  };

  const handleSave = () => {
    const isCustomOp = Boolean(isNew || operation?.isCustom);
    const badge = getStorageKindBadge(kind);

    const updatedOp: StorageOperationFunction = {
      id: operation?.id || `storage-custom-${Date.now()}`,
      name: name.trim() || (isNew ? "customStorageOp" : "operation"),
      label: label.trim() || name.trim(),
      kind,
      description: description.trim(),
      signature:
        operation?.signature ||
        `${name.trim()}(bucketName: string, key: string): Promise<string>`,
      returnType: operation?.returnType || "Promise<string>",
      params: operation?.params || [
        { name: "bucketName", type: "string", required: true },
        { name: "key", type: "string", required: true },
      ],
      badge,
      enabled,
      isCustom: isCustomOp,
      code: customCode,
      defaultBucket: defaultBucket || undefined,
    };

    onSave(updatedOp);
    onClose();
  };

  const currentOpForPreview: StorageOperationFunction = {
    ...(operation || {
      id: `storage-${name}`,
      signature: `${name}(bucketName: string, key: string): Promise<string>`,
      returnType: "Promise<string>",
      params: [],
      badge: getStorageKindBadge(kind),
    }),
    name: name || "storageOp",
    kind,
    description,
    defaultBucket,
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-card border-border/80 nodrag">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-border/40 bg-secondary/10 flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/30">
                <HardDrive size={15} />
              </div>
              <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                {isNew ? "New Custom Storage Operation" : operation?.name}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[8px] font-mono px-1 py-0 h-4 border uppercase",
                    getStorageKindBadge(kind).colorClass,
                  )}
                >
                  {getStorageKindBadge(kind).label}
                </Badge>
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure parameters, preview generated SDK snippets, and test execution.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Tabs Bar */}
        <div className="px-4 pt-2 border-b border-border/40 bg-background/50">
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              if (v === "configure" || v === "preview" || v === "test") {
                setActiveTab(v);
              }
            }}
            className="w-full"
          >
            <TabsList className="bg-muted/40 h-8 p-1">
              <TabsTrigger value="configure" className="text-xs gap-1.5">
                <Settings size={12} />
                Configure
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs gap-1.5">
                <Code2 size={12} />
                Preview Code
              </TabsTrigger>
              <TabsTrigger value="test" className="text-xs gap-1.5">
                <Play size={12} />
                Test Runner
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === "configure" && (
            <div className="flex flex-col gap-3.5">
              {/* Enabled Switch */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-secondary/15">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-foreground">
                    Operation Enabled
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    When disabled, this operation is omitted from pipelines and canvas connections.
                  </span>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>

              {/* Function Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Function Name
                  </Label>
                  <Input
                    className="h-8 text-xs font-mono bg-background"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isNew && !operation?.isCustom}
                    placeholder="e.g. uploadUserProfile"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    Operation Category
                  </Label>
                  <Select
                    value={kind}
                    onValueChange={(v) => {
                      if (
                        v === "presign_upload" ||
                        v === "presign_download" ||
                        v === "upload" ||
                        v === "download" ||
                        v === "delete" ||
                        v === "batch_delete" ||
                        v === "list" ||
                        v === "exists" ||
                        v === "copy"
                      ) {
                        setKind(v);
                      }
                    }}
                    disabled={!isNew && !operation?.isCustom}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="presign_upload" className="text-xs">
                        Presigned Upload (PUT)
                      </SelectItem>
                      <SelectItem value="presign_download" className="text-xs">
                        Presigned Download (GET)
                      </SelectItem>
                      <SelectItem value="upload" className="text-xs">
                        Direct Upload / Write
                      </SelectItem>
                      <SelectItem value="download" className="text-xs">
                        Direct Download / Read
                      </SelectItem>
                      <SelectItem value="delete" className="text-xs">
                        Delete Object
                      </SelectItem>
                      <SelectItem value="batch_delete" className="text-xs">
                        Batch Delete
                      </SelectItem>
                      <SelectItem value="list" className="text-xs">
                        List Bucket
                      </SelectItem>
                      <SelectItem value="exists" className="text-xs">
                        Check Exists (HEAD)
                      </SelectItem>
                      <SelectItem value="copy" className="text-xs">
                        Copy / Move
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Default Target Bucket */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Layers size={11} className="text-amber-500" />
                  Default Target Bucket
                </Label>
                <Select value={defaultBucket} onValueChange={setDefaultBucket}>
                  <SelectTrigger className="h-8 text-xs bg-background font-mono">
                    <SelectValue placeholder="Select target bucket..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBuckets.length === 0 ? (
                      <SelectItem value="default-bucket" className="text-xs font-mono">
                        default-bucket
                      </SelectItem>
                    ) : (
                      availableBuckets.map((b) => (
                        <SelectItem key={b.id || b.name} value={b.name} className="text-xs font-mono">
                          {b.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-muted-foreground">
                  Description
                </Label>
                <Textarea
                  className="min-h-[60px] text-xs bg-background resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this storage operation..."
                />
              </div>

              {/* Custom Code (For custom operations) */}
              {(isNew || operation?.isCustom) && (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Code2 size={11} className="text-amber-500" />
                    Custom Implementation (TypeScript)
                  </Label>
                  <Textarea
                    className="min-h-[110px] text-xs font-mono bg-background resize-none leading-relaxed"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                    placeholder="// Custom S3 SDK implementation..."
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === "preview" && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  TypeScript SDK Code Snippet
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopySnippet}
                  className="h-7 text-xs gap-1.5"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? "Copied!" : "Copy Code"}
                </Button>
              </div>
              <pre className="p-3.5 rounded-lg bg-black/60 dark:bg-black/90 border border-border/60 text-[11px] font-mono text-emerald-400 overflow-x-auto leading-relaxed select-text">
                {generateStorageOperationSnippet(currentOpForPreview, storageNode)}
              </pre>
            </div>
          )}

          {activeTab === "test" && (
            <div className="flex flex-col gap-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    Bucket Name
                  </Label>
                  <Input
                    className="h-8 text-xs font-mono bg-background"
                    value={testBucket}
                    onChange={(e) => setTestBucket(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    Object Key / Path
                  </Label>
                  <Input
                    className="h-8 text-xs font-mono bg-background"
                    value={testKey}
                    onChange={(e) => setTestKey(e.target.value)}
                  />
                </div>
              </div>

              {kind === "upload" && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    Upload Body Content
                  </Label>
                  <Textarea
                    className="min-h-[50px] text-xs font-mono bg-background resize-none"
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                  />
                </div>
              )}

              {(kind === "presign_upload" || kind === "presign_download") && (
                <div className="flex flex-col gap-1">
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    Presigned URL Expiry (Seconds)
                  </Label>
                  <Input
                    className="h-8 text-xs font-mono bg-background"
                    value={testTtl}
                    onChange={(e) => setTestTtl(e.target.value)}
                  />
                </div>
              )}

              <Button
                size="sm"
                onClick={handleExecuteTest}
                disabled={testRunning}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs h-8 gap-2"
              >
                <Play size={12} fill="currentColor" />
                {testRunning ? "Executing Request..." : "Run Test"}
              </Button>

              {testResult && (
                <div className="flex flex-col gap-1.5 p-3 rounded-lg border border-border/60 bg-black/40 dark:bg-black/80">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] font-bold font-mono px-1 py-0 h-4 border",
                          testResult.status === 200 || testResult.status === 204
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-destructive/15 text-destructive border-destructive/30",
                        )}
                      >
                        {testResult.status} {testResult.statusText}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {testResult.durationMs}ms
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Cloud Mock Runner
                    </span>
                  </div>
                  <pre className="mt-1 text-[11px] font-mono text-foreground/90 overflow-x-auto whitespace-pre-wrap select-text leading-relaxed">
                    {JSON.stringify(testResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 border-t border-border/40 bg-secondary/10 flex items-center justify-between">
          <div>
            {!isNew && operation?.isCustom && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:bg-destructive/10 h-8 gap-1.5"
                onClick={() => {
                  onDelete(operation.id);
                  onClose();
                }}
              >
                <Trash size={12} />
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs h-8">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="text-xs h-8 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              Save Operation
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
