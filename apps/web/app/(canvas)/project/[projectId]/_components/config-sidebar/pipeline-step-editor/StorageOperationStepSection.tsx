"use client";

import React, { useMemo } from "react";
import { BackendNode, BackendEdge } from "@workspace/canvas/types";
import {
  getStorageOperations,
  computeStorageOpBindings,
  StorageOperationFunction,
} from "@/lib/utils/storageOperationsHelper";
import { toFolderName, toVarName } from "@/lib/compiler/utils";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { HardDrive, Layers, Code2, Sparkles } from "lucide-react";
import { PipelineStepDraft, ExpectedArg, AvailableSource } from "./types";
import { Badge } from "@workspace/ui/components/badge";

export interface StorageOperationStepSectionProps {
  step: PipelineStepDraft;
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  expectedArgs?: ExpectedArg[];
  availableSources?: AvailableSource[];
  showAdvancedSettings?: boolean;
  onToggleAdvancedSettings?: () => void;
  onChange: (updated: PipelineStepDraft) => void;
  onAutoMapArguments?: () => void;
  children?: React.ReactNode;
}

export const StorageOperationStepSection: React.FC<StorageOperationStepSectionProps> = ({
  step,
  allNodes,
  allEdges: _allEdges,
  expectedArgs: _expectedArgs,
  availableSources: _availableSources,
  onChange,
  onAutoMapArguments,
  children,
}) => {
  const allStorageNodes = useMemo(
    () => allNodes.filter((n) => n.type === "storage"),
    [allNodes],
  );

  const selectedStorageNode = useMemo(() => {
    return (
      allStorageNodes.find(
        (n) => n.id === step.storageNodeId || n.id === step.brokerNodeId,
      ) || allStorageNodes[0]
    );
  }, [allStorageNodes, step.storageNodeId, step.brokerNodeId]);

  const availableBuckets = useMemo(() => {
    return selectedStorageNode?.data?.buckets || [];
  }, [selectedStorageNode]);

  const operations: StorageOperationFunction[] = useMemo(() => {
    return getStorageOperations(selectedStorageNode);
  }, [selectedStorageNode]);

  const selectedOp = useMemo(() => {
    return (
      operations.find(
        (op) =>
          op.name === step.functionRef?.name || op.id === step.operationId,
      ) || operations[0]
    );
  }, [operations, step.functionRef?.name, step.operationId]);

  const selectedBucket = useMemo(() => {
    if (step.bucketId) return step.bucketId;
    return availableBuckets[0]?.name || "default-bucket";
  }, [step.bucketId, availableBuckets]);

  const handleSelectStorageNode = (nodeId: string) => {
    const targetNode = allStorageNodes.find((n) => n.id === nodeId);
    if (!targetNode) return;

    const targetBuckets = targetNode.data?.buckets || [];
    const firstBucketName = targetBuckets[0]?.name || "default-bucket";
    const packageFolder = toFolderName(targetNode.data?.label || "storage") || "storage";

    const nextBindings = computeStorageOpBindings(
      selectedOp,
      step.inputBindings || [],
      firstBucketName,
    );

    onChange({
      ...step,
      storageNodeId: targetNode.id,
      brokerNodeId: targetNode.id,
      bucketId: firstBucketName,
      functionRef: {
        name: selectedOp?.name || "uploadObject",
        importPath: `@workspace/${packageFolder}/operations`,
        signature: selectedOp?.signature,
      },
      inputBindings: nextBindings,
    });
  };

  const handleSelectBucket = (bucketName: string) => {
    const packageFolder =
      toFolderName(selectedStorageNode?.data?.label || "storage") || "storage";

    const nextBindings = computeStorageOpBindings(
      selectedOp,
      step.inputBindings || [],
      bucketName,
    );

    onChange({
      ...step,
      bucketId: bucketName,
      functionRef: {
        name: selectedOp?.name || "uploadObject",
        importPath: `@workspace/${packageFolder}/operations`,
        signature: selectedOp?.signature,
      },
      inputBindings: nextBindings,
    });
  };

  const handleSelectOperation = (opId: string) => {
    const op = operations.find((o) => o.id === opId || o.name === opId);
    if (!op) return;

    const packageFolder =
      toFolderName(selectedStorageNode?.data?.label || "storage") || "storage";

    const nextBindings = computeStorageOpBindings(
      op,
      step.inputBindings || [],
      selectedBucket,
    );

    let defaultVar = step.outputVariable;
    if (!defaultVar || defaultVar.startsWith("step") || defaultVar.startsWith("storageResult")) {
      if (op.kind === "presign_upload") defaultVar = "uploadUrl";
      else if (op.kind === "presign_download") defaultVar = "downloadUrl";
      else if (op.kind === "upload") defaultVar = "uploadedFile";
      else if (op.kind === "download") defaultVar = "fileData";
      else if (op.kind === "delete" || op.kind === "batch_delete") defaultVar = "deleteResult";
      else if (op.kind === "list") defaultVar = "listedObjects";
      else if (op.kind === "exists") defaultVar = "fileExists";
      else if (op.kind === "copy") defaultVar = "copyResult";
    }

    onChange({
      ...step,
      operationId: op.id,
      storageNodeId: selectedStorageNode?.id,
      brokerNodeId: selectedStorageNode?.id,
      bucketId: selectedBucket,
      name: op.label || op.name,
      outputVariable: defaultVar,
      functionRef: {
        name: op.name,
        importPath: `@workspace/${packageFolder}/operations`,
        signature: op.signature,
      },
      inputBindings: nextBindings,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Storage Node & Bucket Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* Storage Node Selector */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <HardDrive size={11} className="text-amber-500" />
            Storage Node
          </Label>
          <Select
            value={selectedStorageNode?.id || "__none__"}
            onValueChange={handleSelectStorageNode}
          >
            <SelectTrigger className="h-7 text-xs bg-background/60 border-border/60">
              <SelectValue placeholder="Select storage node..." />
            </SelectTrigger>
            <SelectContent>
              {allStorageNodes.length === 0 ? (
                <SelectItem value="__none__" disabled className="text-xs">
                  No storage nodes on canvas
                </SelectItem>
              ) : (
                allStorageNodes.map((node) => (
                  <SelectItem key={node.id} value={node.id} className="text-xs">
                    {node.data?.label || "Storage Node"}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Bucket Selector */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Layers size={11} className="text-amber-500" />
            Bucket Resource
          </Label>
          <Select
            value={selectedBucket || "__custom__"}
            onValueChange={handleSelectBucket}
          >
            <SelectTrigger className="h-7 text-xs bg-background/60 border-border/60 font-mono">
              <SelectValue placeholder="Select bucket..." />
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
      </div>

      {/* 2. Operation Picker */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
            <Code2 size={11} className="text-amber-500" />
            Storage Operation
          </Label>
          {onAutoMapArguments && (
            <button
              type="button"
              onClick={onAutoMapArguments}
              className="text-[10px] font-medium text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-colors"
              title="Automatically map input parameters from request context"
            >
              <Sparkles size={11} />
              Auto-Map
            </button>
          )}
        </div>
        <Select
          value={selectedOp?.id || selectedOp?.name || ""}
          onValueChange={handleSelectOperation}
        >
          <SelectTrigger className="h-8 text-xs bg-background/60 border-border/60">
            <SelectValue placeholder="Select storage function..." />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {operations.map((op) => (
              <SelectItem key={op.id} value={op.id} className="text-xs py-1.5">
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex flex-col">
                    <span className="font-mono text-xs font-semibold">{op.name}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-1">
                      {op.description}
                    </span>
                  </div>
                  {op.badge && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[8px] font-bold font-mono px-1 py-0 h-4 border uppercase shrink-0",
                        op.badge.colorClass,
                      )}
                    >
                      {op.badge.label}
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 3. Live Function Signature & Description Box */}
      {selectedOp && (
        <div className="rounded-lg bg-secondary/15 border border-border/50 p-2.5 flex flex-col gap-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Signature
            </span>
            {selectedOp.badge && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[8px] font-bold font-mono px-1.5 py-0 h-4 uppercase",
                  selectedOp.badge.colorClass,
                )}
              >
                {selectedOp.badge.label}
              </Badge>
            )}
          </div>
          <div className="font-mono text-[11px] text-amber-500 dark:text-amber-400 select-text overflow-x-auto whitespace-pre">
            {selectedOp.signature}
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {selectedOp.description}
          </p>
        </div>
      )}

      {/* 4. Argument Bindings Section (Passed as children) */}
      {children}
    </div>
  );
};
