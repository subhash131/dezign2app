import React from "react";
import { AlertTriangle, HardDrive, Link, UploadCloud } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type { StoragePutStepProps } from "./types";
import { ResponseFieldPicker } from "./ResponseFieldPicker";
import { ActionFlowCombobox } from "./ActionFlowCombobox";
import { ensureActionStorageConnection, cleanupActionStepEdge } from "./actionStepCanvasSync";

const COMMON_CONTENT_TYPES = [
  "application/octet-stream",
  "image/png",
  "image/jpeg",
  "image/*",
  "application/pdf",
  "text/plain",
  "multipart/form-data",
];

export const StoragePutStep: React.FC<StoragePutStepProps> = ({
  draft,
  canvasStep,
  stepIndex,
  allSteps,
  allCanvasSteps,
  allNodes = [],
  endpoints = [],
  webPageNodeId,
  actionId,
  onChange,
}) => {
  const priorSteps = allSteps.slice(0, stepIndex);

  // Collect all available storage nodes & buckets on the canvas
  const storageNodes = allNodes.filter((n) => n.type === "storage");
  const availableBuckets: { bucketId: string; bucketName: string; storageNodeId: string }[] = [];

  storageNodes.forEach((sn) => {
    const buckets = sn.data?.buckets || [];
    buckets.forEach((b: { id?: string; name?: string }) => {
      const bId = b.id || b.name || "bucket";
      const bName = b.name || b.id || "bucket";
      if (!availableBuckets.some((ab) => ab.bucketId === bId)) {
        availableBuckets.push({
          bucketId: bId,
          bucketName: bName,
          storageNodeId: sn.id,
        });
      }
    });
  });

  // Also include any existing storage bucket ref nodes on canvas
  allNodes
    .filter(
      (n) =>
        n.type === "storage_operation_ref" ||
        n.type === "storage_ref" ||
        n.type === "StorageBucketRefNode",
    )
    .forEach((rn) => {
      const bId = rn.data?.bucketId || rn.data?.bucketName || rn.id;
      if (!availableBuckets.some((ab) => ab.bucketId === bId)) {
        availableBuckets.push({
          bucketId: bId,
          bucketName: rn.data?.bucketName || bId,
          storageNodeId: rn.data?.storageNodeId || rn.id,
        });
      }
    });

  const currentBucketId = draft.bucketId || canvasStep?.bucketName || availableBuckets[0]?.bucketId || "";

  const handleBucketSelect = (selectedBucketId: string) => {
    const bInfo = availableBuckets.find((b) => b.bucketId === selectedBucketId);
    const oldEdgeId =
      draft.edgeId ||
      canvasStep?.edgeId ||
      canvasStep?.edge?.id;

    if (!selectedBucketId) {
      if (oldEdgeId) {
        cleanupActionStepEdge(oldEdgeId);
      }
      onChange({
        ...draft,
        bucketId: "",
        bucketName: "",
        storageRefNodeId: undefined,
        edgeId: undefined,
      });
      return;
    }

    let newEdgeId: string | undefined;
    let newRefNodeId: string | undefined;

    if (webPageNodeId && actionId && selectedBucketId) {
      const res = ensureActionStorageConnection({
        webPageNodeId,
        actionId,
        storageNodeId: bInfo?.storageNodeId,
        bucketId: selectedBucketId,
        stepOrder: stepIndex + 1,
        previousEdgeId: oldEdgeId,
      });
      newEdgeId = res?.edgeId;
      newRefNodeId = res?.refNodeId;
    }

    onChange({
      ...draft,
      bucketId: selectedBucketId,
      bucketName: bInfo?.bucketName || selectedBucketId,
      storageRefNodeId: newRefNodeId || draft.storageRefNodeId,
      edgeId: newEdgeId || oldEdgeId,
    });
  };

  const presignedUrlSource = draft.presignedUrlSource || {
    stepId: priorSteps[0]?.id || "",
    fieldPath: "presignedUrl",
  };

  const fileSource = draft.fileSource || {
    kind: "user_input" as const,
    key: "file",
  };

  const contentType = draft.contentType || "application/octet-stream";

  const selectedPriorStep = priorSteps.find(
    (s) => s.id === presignedUrlSource.stepId,
  );
  const selectedPriorEndpoint = endpoints.find(
    (ep) => ep.id === selectedPriorStep?.endpointId,
  );

  return (
    <div className="space-y-4 pt-1 text-xs">
      {/* Target Storage Bucket Selection */}
      <div className="p-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 space-y-2">
        <div className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400 text-[11px]">
          <HardDrive size={13} />
          <span>Storage Bucket Target (Auto-Draws Canvas Edge)</span>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            Select Bucket
          </Label>
          <Select
            value={currentBucketId}
            onValueChange={handleBucketSelect}
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue placeholder="Choose storage bucket" />
            </SelectTrigger>
            <SelectContent>
              {availableBuckets.length > 0 ? (
                availableBuckets.map((b) => (
                  <SelectItem key={b.bucketId} value={b.bucketId}>
                    🪣 {b.bucketName}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="default-bucket">🪣 default-bucket</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Executes <span className="font-mono font-semibold">PUT &lt;presignedUrl&gt;</span> directly from the browser with the binary file payload.
        </p>
      </div>

      {/* Warning if no prior step exists to provide presigned URL */}
      {priorSteps.length === 0 && (
        <div className="p-2.5 rounded-md border border-destructive/30 bg-destructive/10 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="text-destructive mt-0.5 shrink-0" />
          <p className="text-destructive text-[11px] leading-relaxed">
            Storage uploads require a presigned URL generated by a backend service. Add an API Request step before this storage step (e.g. Step 1: POST /presign, Step 2: Storage Upload).
          </p>
        </div>
      )}

      {/* Section 1: Presigned URL Source */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Link size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Presigned Upload URL Source
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Source Step (Generates URL)
            </Label>
            <Select
              value={presignedUrlSource.stepId}
              onValueChange={(val) => {
                onChange({
                  ...draft,
                  presignedUrlSource: {
                    ...presignedUrlSource,
                    stepId: val,
                  },
                });
              }}
              disabled={priorSteps.length === 0}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue placeholder="Select prior step" />
              </SelectTrigger>
              <SelectContent>
                {priorSteps.map((pStep, pIdx) => (
                  <SelectItem key={pStep.id} value={pStep.id}>
                    Step {pIdx + 1}: {pStep.name || pStep.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Response Field Key / Path
            </Label>
            <ResponseFieldPicker
              value={presignedUrlSource.fieldPath}
              onChange={(val) => {
                onChange({
                  ...draft,
                  presignedUrlSource: {
                    ...presignedUrlSource,
                    fieldPath: val,
                  },
                });
              }}
              step={selectedPriorStep}
              allNodes={allNodes}
              endpoints={endpoints}
              endpoint={selectedPriorEndpoint}
              placeholder="e.g. presignedUrl or data.url"
              disabled={priorSteps.length === 0}
              isStorage={true}
            />
          </div>
        </div>
      </div>

      {/* Section 2: File Source */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <UploadCloud size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Upload File Binary Source
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Source Kind
            </Label>
            <Select
              value={fileSource.kind}
              onValueChange={(val: "user_input" | "state_var") => {
                onChange({
                  ...draft,
                  fileSource: {
                    ...fileSource,
                    kind: val,
                  },
                });
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user_input">User Form Input (File)</SelectItem>
                <SelectItem value="state_var">Page State Variable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Input Name / State Key
            </Label>
            <ActionFlowCombobox
              value={fileSource.key}
              onChange={(keyVal) => {
                onChange({
                  ...draft,
                  fileSource: {
                    ...fileSource,
                    key: keyVal,
                  },
                });
              }}
              placeholder={fileSource.kind === "user_input" ? "e.g. file, avatar" : "e.g. selectedFile"}
              headerLabel={fileSource.kind === "user_input" ? "Suggested File Inputs" : "Suggested State Keys"}
              options={
                fileSource.kind === "user_input"
                  ? [
                      { value: "file", type: "file" },
                      { value: "avatar", type: "file" },
                      { value: "image", type: "file" },
                      { value: "document", type: "file" },
                      { value: "attachment", type: "file" },
                      { value: "file.name", type: "string" },
                      { value: "file.type", type: "string" },
                      { value: "file.size", type: "number" },
                    ]
                  : [
                      { value: "selectedFile", type: "File" },
                      { value: "uploadedFile", type: "File" },
                      { value: "currentFile", type: "File" },
                      { value: "file", type: "File" },
                    ]
              }
            />
          </div>
        </div>
      </div>

      {/* Section 3: Content-Type Header */}
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">
          Request Content-Type Header
        </Label>
        <ActionFlowCombobox
          value={contentType}
          onChange={(val) => {
            onChange({
              ...draft,
              contentType: val,
            });
          }}
          placeholder="application/octet-stream"
          headerLabel="Content-Type Presets"
          options={COMMON_CONTENT_TYPES.map((ct) => ({
            value: ct,
            label: ct,
            type: ct.split("/")[0] || "mime",
          }))}
        />
      </div>
    </div>
  );
};
