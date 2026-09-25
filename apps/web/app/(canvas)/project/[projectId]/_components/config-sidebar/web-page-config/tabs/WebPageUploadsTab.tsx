"use client";

import React, { useState } from "react";
import { TabsContent } from "@workspace/ui/components/tabs";
import {
  Upload,
  HardDrive,
  Check,
  Copy,
  Plus,
  X,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Sliders,
  FileImage,
  CloudUpload,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useWebPageUploads, DEFAULT_ACCEPTED_MIME_TYPES } from "../hooks/useWebPageUploads";
import { cn } from "@workspace/ui/lib/utils";

const COMMON_MIME_PRESETS = [
  { label: "JPEG", mime: "image/jpeg" },
  { label: "PNG", mime: "image/png" },
  { label: "WebP", mime: "image/webp" },
  { label: "GIF", mime: "image/gif" },
  { label: "SVG", mime: "image/svg+xml" },
  { label: "PDF", mime: "application/pdf" },
];

const SIZE_PRESETS = [5, 10, 25, 50, 100];

export interface WebPageUploadsTabProps {
  nodeId: string;
  data: BackendNode["data"];
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  allEndpoints: (Endpoint & { nodeId?: string })[];
  onUpdateData: (changes: Partial<BackendNode["data"]>) => void;
}

export function WebPageUploadsTab({
  nodeId,
  data,
  allNodes,
  allEdges,
  allEndpoints,
  onUpdateData,
}: WebPageUploadsTabProps) {
  const addNode = useBackendCanvasStore((s) => s.addNode);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  const [customMime, setCustomMime] = useState("");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const {
    allStorageNodes,
    connectedStorageNode,
    availableBuckets,
    selectedBucket,
    acceptedMimeTypes,
    maxFileSizeMb,
    previewMode,
    autoGeneratePresignEndpoint,
    presignEndpoint,
    endpointPath,
    clientUploadSnippet,
    handleSelectStorageNode,
    handleSelectBucket,
    handleToggleMimeType,
    handleAddCustomMimeType,
    handleRemoveMimeType,
    handleUpdateMaxFileSizeMb,
    handleUpdatePreviewMode,
    handleToggleAutoGenerate,
    handleProvisionPresignEndpoint,
  } = useWebPageUploads({
    nodeId,
    data,
    allNodes,
    allEdges,
    allEndpoints,
    updateData: onUpdateData,
  });

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(clientUploadSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleAddStorageNode = () => {
    const newStorageId = `storage-${Date.now()}`;
    addNode({
      id: newStorageId,
      type: "storage",
      position: { x: 450, y: 250 },
      data: {
        label: "Media Storage",
        storageProvider: "s3",
        buckets: [
          {
            id: `bucket-${Date.now()}`,
            name: "user-uploads",
            storageType: "s3",
            accessPolicy: "private",
            enablePresignedUrls: true,
          },
        ],
      },
    });

    onUpdateData({
      connectedStorageNodeId: newStorageId,
      uploadBucketId: "user-uploads",
    });
  };

  const handleOpenStorageConfig = () => {
    if (!connectedStorageNode) return;
    setActiveConfigItem({
      type: "storage",
      id: connectedStorageNode.id,
      nodeId: connectedStorageNode.id,
    });
  };

  const handleOpenEndpointConfig = () => {
    if (!presignEndpoint) return;
    setActiveConfigItem({
      type: "endpoint",
      id: presignEndpoint.id,
      nodeId: presignEndpoint.nodeId || "",
    });
  };

  return (
    <TabsContent value="uploads" className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
      {/* ─── Hero Overview Card ─── */}
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
              <CloudUpload size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                Image & File Uploads
                <Badge
                  variant="outline"
                  className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[9px] font-mono"
                >
                  Presigned URL
                </Badge>
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Stream uploads directly from browser to S3/R2/GCS cloud storage
              </p>
            </div>
          </div>
          {connectedStorageNode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenStorageConfig}
              className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
            >
              <HardDrive size={12} />
              Config Node
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
          <div className="flex items-center gap-1">
            <Check size={11} className="text-emerald-500 shrink-0" />
            <span>Direct S3 Upload</span>
          </div>
          <div className="flex items-center gap-1">
            <Check size={11} className="text-emerald-500 shrink-0" />
            <span>Zero Server Load</span>
          </div>
          <div className="flex items-center gap-1">
            <Check size={11} className="text-emerald-500 shrink-0" />
            <span>Secure Signed URLs</span>
          </div>
        </div>
      </div>

      {/* ─── 1. Storage Target Selection ─── */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <HardDrive size={13} className="text-amber-500" />
            Target Cloud Storage
          </Label>
          {allStorageNodes.length === 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddStorageNode}
              className="h-6 text-[10px] gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            >
              <Plus size={11} />
              Create Storage Node
            </Button>
          )}
        </div>

        {allStorageNodes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 p-4 text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              No storage node found on the canvas yet.
            </p>
            <Button
              size="sm"
              onClick={handleAddStorageNode}
              className="h-7 text-xs bg-amber-500 text-white hover:bg-amber-600 gap-1.5"
            >
              <Plus size={13} />
              Add S3/R2 Storage Node
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Storage Node Selector */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Storage Provider Node</Label>
              <Select
                value={connectedStorageNode?.id || ""}
                onValueChange={handleSelectStorageNode}
              >
                <SelectTrigger className="h-8 text-xs bg-background/50">
                  <SelectValue placeholder="Select storage node" />
                </SelectTrigger>
                <SelectContent>
                  {allStorageNodes.map((sNode) => (
                    <SelectItem key={sNode.id} value={sNode.id} className="text-xs">
                      {sNode.data?.label || "Storage"} ({sNode.data?.storageProvider || "S3"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bucket Selector */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Destination Bucket</Label>
              <Select
                value={selectedBucket?.name || selectedBucket?.id || ""}
                onValueChange={handleSelectBucket}
                disabled={availableBuckets.length === 0}
              >
                <SelectTrigger className="h-8 text-xs bg-background/50">
                  <SelectValue
                    placeholder={
                      availableBuckets.length === 0 ? "No buckets configured" : "Select bucket"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableBuckets.map((bucket) => (
                    <SelectItem key={bucket.id} value={bucket.name || bucket.id} className="text-xs">
                      {bucket.name || bucket.id} ({bucket.accessPolicy || "private"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* ─── 2. Presigned URL API Endpoint Auto-Generator ─── */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-sky-500" />
              Presigned URL API Endpoint
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Endpoint that verifies authentication and returns a temporary signed PUT URL
            </p>
          </div>
          <Switch
            checked={autoGeneratePresignEndpoint || Boolean(presignEndpoint)}
            onCheckedChange={handleToggleAutoGenerate}
          />
        </div>

        {presignEndpoint ? (
          <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30 font-mono text-[10px]"
              >
                {presignEndpoint.type || "POST"}
              </Badge>
              <span className="font-mono text-xs font-medium text-foreground">
                {presignEndpoint.name}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenEndpointConfig}
              className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink size={11} />
              Edit Pipeline
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 p-3 flex items-center justify-between text-muted-foreground">
            <span className="text-[11px]">
              No presign endpoint wired yet. Turn ON toggle or click generate:
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleProvisionPresignEndpoint}
              className="h-6 text-[10px] gap-1 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/10"
            >
              <Sparkles size={11} />
              Generate POST /api/upload/presign
            </Button>
          </div>
        )}
      </div>

      {/* ─── 3. Upload Constraints & Format Settings ─── */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-4">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Sliders size={13} className="text-amber-500" />
          Upload Constraints & Image Settings
        </Label>

        {/* Accepted MIME Types */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">Allowed File Types</Label>
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              {acceptedMimeTypes.length} types selected
            </span>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-1.5">
            {COMMON_MIME_PRESETS.map((p) => {
              const isSelected = acceptedMimeTypes.includes(p.mime);
              return (
                <button
                  key={p.mime}
                  type="button"
                  onClick={() => handleToggleMimeType(p.mime)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer",
                    isSelected
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 font-semibold"
                      : "bg-secondary/40 text-muted-foreground border-border/40 hover:border-border",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Active MIME Tags with remove */}
          <div className="flex flex-wrap gap-1 pt-1">
            {acceptedMimeTypes.map((mime) => (
              <Badge
                key={mime}
                variant="secondary"
                className="text-[10px] font-mono h-5 gap-1 pl-1.5 pr-1 bg-secondary text-foreground"
              >
                <span>{mime}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveMimeType(mime)}
                  className="hover:text-destructive cursor-pointer"
                >
                  <X size={10} />
                </button>
              </Badge>
            ))}
          </div>

          {/* Custom MIME Input */}
          <div className="flex items-center gap-1.5 pt-1">
            <Input
              value={customMime}
              onChange={(e) => setCustomMime(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (customMime) {
                    handleAddCustomMimeType(customMime);
                    setCustomMime("");
                  }
                }
              }}
              placeholder="Add custom MIME (e.g. image/heic, audio/mp3)"
              className="h-7 text-[11px] bg-background/50 flex-1 font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (customMime) {
                  handleAddCustomMimeType(customMime);
                  setCustomMime("");
                }
              }}
              className="h-7 text-[10px] px-2"
            >
              Add
            </Button>
          </div>
        </div>

        {/* Max File Size */}
        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground">Max File Size</Label>
            <span className="text-xs font-mono font-bold text-foreground">
              {maxFileSizeMb} MB
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {SIZE_PRESETS.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => handleUpdateMaxFileSizeMb(sz)}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer",
                  maxFileSizeMb === sz
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 font-semibold"
                    : "bg-secondary/40 text-muted-foreground border-border/40 hover:border-border",
                )}
              >
                {sz}MB
              </button>
            ))}
            <div className="flex items-center gap-1 ml-auto">
              <Input
                type="number"
                min={1}
                max={500}
                value={maxFileSizeMb}
                onChange={(e) => handleUpdateMaxFileSizeMb(Number(e.target.value))}
                className="h-6 w-16 text-center text-[10px] font-mono bg-background/50"
              />
              <span className="text-[10px] text-muted-foreground">MB</span>
            </div>
          </div>
        </div>

        {/* Preview Mode */}
        <div className="space-y-2 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
              <FileImage size={12} />
              Client Preview Mode
            </Label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleUpdatePreviewMode("thumbnail")}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer",
                  previewMode === "thumbnail"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 font-semibold"
                    : "bg-secondary/40 text-muted-foreground border-border/40 hover:border-border",
                )}
              >
                Thumbnail
              </button>
              <button
                type="button"
                onClick={() => handleUpdatePreviewMode("none")}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer",
                  previewMode === "none"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 font-semibold"
                    : "bg-secondary/40 text-muted-foreground border-border/40 hover:border-border",
                )}
              >
                None
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4. Client-Side Code Snippet ─── */}
      <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold flex items-center gap-1.5">
            <Sparkles size={13} className="text-amber-500" />
            Frontend Upload Integration
          </Label>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopySnippet}
            className="h-6 text-[10px] gap-1 border-border/50 text-muted-foreground hover:text-foreground"
          >
            {copiedSnippet ? (
              <>
                <Check size={11} className="text-emerald-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy size={11} />
                Copy Code
              </>
            )}
          </Button>
        </div>

        <pre className="p-3 rounded-lg bg-zinc-950 text-zinc-200 font-mono text-[10px] leading-relaxed overflow-x-auto border border-zinc-800">
          {clientUploadSnippet}
        </pre>

        <p className="text-[10px] text-muted-foreground leading-normal">
          Tip: Call this function inside your Page section or form dropzone. The binary upload streams
          directly to your S3 bucket without bottlenecking your Node.js or Next.js server.
        </p>
      </div>
    </TabsContent>
  );
}
