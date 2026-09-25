"use client";

import React, { useMemo, useState } from "react";
import {
  HardDrive,
  Layers,
  ExternalLink,
  Code2,
  Play,
  ArrowRight,
  Shield,
  FileText,
  Plus,
  Trash,
} from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import { Textarea } from "@workspace/ui/components/textarea";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@workspace/ui/lib/utils";
import {
  getStorageOperations,
  getStorageKindBadge,
  StorageOperationFunction,
} from "@/lib/utils/storageOperationsHelper";
import { StorageOperationDialog } from "../backend-nodes/graph-nodes/nodes/database/StorageOperationDialog";

export interface StorageOperationRefConfigProps {
  id: string;
  nodeId: string;
}

export function StorageOperationRefConfig({
  id: _id,
  nodeId,
}: StorageOperationRefConfigProps) {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const [dialogOp, setDialogOp] = useState<StorageOperationFunction | null>(
    null,
  );

  const refNode = nodes.find((n) => n.id === nodeId);
  if (!refNode) return null;

  const data = refNode.data || {};

  const storageNodes = nodes.filter((n) => n?.type === "storage");
  const selectedStorageNode = storageNodes.find(
    (n) => n.id === data.storageNodeId,
  );
  const activeStorageNode = selectedStorageNode || storageNodes[0];

  const availableBuckets = activeStorageNode?.data?.buckets || [];
  const selectedBucket =
    data.bucketId ||
    data.bucketName ||
    availableBuckets[0]?.name ||
    "default-bucket";
  const activeBucketObj = availableBuckets.find(
    (b) => b.name === selectedBucket || b.id === selectedBucket,
  );

  const provider =
    activeStorageNode?.data?.storageProvider || data.storageProvider || "s3";

  const operations: StorageOperationFunction[] = useMemo(() => {
    return Array.isArray(data.storageOperations) ? data.storageOperations : [];
  }, [data.storageOperations]);

  const allAvailableOps: StorageOperationFunction[] = useMemo(() => {
    return getStorageOperations(activeStorageNode);
  }, [activeStorageNode]);

  const unaddedOps = useMemo(() => {
    return allAvailableOps.filter(
      (avail) =>
        !operations.some(
          (op) => op.name === avail.name || op.id === avail.id,
        ),
    );
  }, [allAvailableOps, operations]);

  // Find incoming service connections
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  const connectedServiceNodes = nodes.filter(
    (n) =>
      n.type === "service" &&
      incomingEdges.some((e) => e.source === n.id),
  );

  const handleSelectStorage = (val: string) => {
    const targetStorage = storageNodes.find((n) => n.id === val);
    const targetBuckets = targetStorage?.data?.buckets || [];
    const firstBucketName = targetBuckets[0]?.name || "default-bucket";

    updateNode(nodeId, {
      data: {
        ...data,
        storageNodeId: val,
        storageProvider: targetStorage?.data?.storageProvider || "s3",
        bucketId: firstBucketName,
        bucketName: firstBucketName,
        label: `${firstBucketName}`,
      },
    });
  };

  const handleSelectBucket = (val: string) => {
    updateNode(nodeId, {
      data: {
        ...data,
        bucketId: val,
        bucketName: val,
        label: `${val}`,
      },
    });
  };

  const handleAddOp = (opToAdd: StorageOperationFunction) => {
    const nextOps = [...operations, opToAdd];
    updateNode(nodeId, {
      data: {
        ...data,
        storageOperations: nextOps,
      },
    });
  };

  const handleRemoveOp = (opToRemove: StorageOperationFunction) => {
    const nextOps = operations.filter(
      (o) => o.id !== opToRemove.id && o.name !== opToRemove.name,
    );
    updateNode(nodeId, {
      data: {
        ...data,
        storageOperations: nextOps,
      },
    });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header section */}
      <div className="p-4 border-b bg-card/60">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              <HardDrive size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Bucket Reference
                </span>
                {provider && (
                  <Badge
                    variant="outline"
                    className="text-[9px] uppercase font-mono px-1 py-0 h-4 border-amber-500/40"
                  >
                    {provider}
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold text-sm text-foreground">
                {selectedBucket}
              </h3>
            </div>
          </div>

          {activeStorageNode && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              onClick={() => {
                setActiveConfigItem({
                  type: "storage",
                  id: activeStorageNode.id,
                  nodeId: activeStorageNode.id,
                });
              }}
              title="Open Storage Provider Node Config"
            >
              <ExternalLink size={12} />
              Storage Node
            </Button>
          )}
        </div>

        {/* Description */}
        <div className="mt-2">
          <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
            Description
          </Label>
          <Textarea
            className="mt-1 min-h-[50px] text-xs bg-background/50 resize-none"
            placeholder="Reference description..."
            value={data.description || ""}
            onChange={(e) =>
              updateNode(nodeId, {
                data: { ...data, description: e.target.value },
              })
            }
          />
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Storage Node & Bucket selectors */}
        <div className="space-y-3 p-3 rounded-lg border bg-secondary/10">
          <div>
            <Label className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
              <HardDrive size={13} className="text-amber-500" />
              Target Storage Node
            </Label>
            <Select
              value={activeStorageNode?.id || "__none__"}
              onValueChange={handleSelectStorage}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue placeholder="Select storage node..." />
              </SelectTrigger>
              <SelectContent>
                {storageNodes.length === 0 ? (
                  <SelectItem value="__none__" disabled className="text-xs">
                    No storage nodes on canvas
                  </SelectItem>
                ) : (
                  storageNodes.map((sNode) => (
                    <SelectItem key={sNode.id} value={sNode.id} className="text-xs">
                      {sNode.data?.label || "Storage Node"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
              <Layers size={13} className="text-amber-500" />
              Target Bucket
            </Label>
            <Select
              value={selectedBucket || "__none__"}
              onValueChange={handleSelectBucket}
            >
              <SelectTrigger className="h-8 text-xs bg-background font-mono">
                <SelectValue placeholder="Select bucket..." />
              </SelectTrigger>
              <SelectContent>
                {availableBuckets.length === 0 ? (
                  <SelectItem value="__none__" disabled className="text-xs">
                    No buckets defined on this storage node
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

          {activeBucketObj && (
            <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
              <Shield size={12} className="text-amber-500 shrink-0" />
              <span>
                Policy: <strong className="text-foreground capitalize">{activeBucketObj.accessPolicy || "private"}</strong>
              </span>
              <span className="mx-1">•</span>
              <span>
                Versioning: <strong className="text-foreground">{activeBucketObj.versioning ? "Enabled" : "Disabled"}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Connected Services */}
        {connectedServiceNodes.length > 0 && (
          <div className="space-y-2">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Connected Service Endpoints ({incomingEdges.length})
            </Label>
            <div className="space-y-1.5">
              {incomingEdges.map((edge) => {
                const sNode = nodes.find((n) => n.id === edge.source);
                const epId = edge.sourceHandle?.replace("endpoint-out-", "");
                const ep = (sNode?.data?.endpoints || []).find(
                  (p: any) => p.id === epId,
                );
                const fnName = edge.targetHandle?.replace("func-", "");

                return (
                  <div
                    key={edge.id}
                    className="p-2 rounded-md border bg-card/60 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-foreground truncate">
                        {sNode?.data?.label || "Service"}
                      </span>
                      <ArrowRight size={11} className="text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground font-mono text-[11px] truncate">
                        {ep?.name || epId || "endpoint"}
                      </span>
                    </div>

                    {fnName && (
                      <Badge
                        variant="secondary"
                        className="font-mono text-[10px] shrink-0 border-amber-500/30"
                      >
                        {fnName}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bucket Operations List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
              <Code2 size={12} className="text-amber-500" />
              Configured Operations ({operations.length})
            </Label>

            {unaddedOps.length > 0 && (
              <Select
                value=""
                onValueChange={(val) => {
                  const found = unaddedOps.find((o) => o.name === val || o.id === val);
                  if (found) handleAddOp(found);
                }}
              >
                <SelectTrigger className="h-6 text-[10px] px-2 py-0 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20">
                  <Plus size={10} className="mr-1" /> Add Op...
                </SelectTrigger>
                <SelectContent position="popper">
                  {unaddedOps.map((op) => (
                    <SelectItem key={op.id || op.name} value={op.name} className="text-xs">
                      {op.name} ({op.kind})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            {operations.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                No operations added yet. Click &quot;Add Op&quot; above to add one.
              </div>
            ) : (
              operations.map((op) => {
                const isConnected = edges.some(
                  (e) =>
                    e.target === nodeId &&
                    (e.targetHandle === `func-${op.name}` ||
                      e.targetHandle === `func-${op.id}`),
                );

                const badge = op.badge || getStorageKindBadge(op.kind);

                return (
                  <div
                    key={op.id || op.name}
                    className={cn(
                      "p-2.5 rounded-lg border text-xs flex flex-col gap-1.5 transition-colors",
                      isConnected
                        ? "bg-amber-500/10 border-amber-500/40"
                        : "bg-card/60 hover:bg-card/90",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-medium text-foreground truncate">
                          {op.name}
                        </span>
                        {isConnected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Connected" />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase font-mono tracking-wider",
                            badge.colorClass,
                          )}
                        >
                          {badge.label}
                        </span>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-amber-500"
                          onClick={() => setDialogOp(op)}
                          title="Preview / Test Operation"
                        >
                          <Play size={11} />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveOp(op)}
                          title="Remove Operation"
                        >
                          <Trash size={11} />
                        </Button>
                      </div>
                    </div>

                    {op.description && (
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {op.description}
                      </p>
                    )}

                    {op.signature && (
                      <div className="text-[10px] font-mono text-muted-foreground/80 bg-background/80 p-1.5 rounded border truncate">
                        {op.signature}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {dialogOp && activeStorageNode && (
        <StorageOperationDialog
          isOpen={Boolean(dialogOp)}
          onClose={() => setDialogOp(null)}
          operation={dialogOp}
          storageNode={{
            id: activeStorageNode.id,
            data: activeStorageNode.data,
            type: activeStorageNode.type,
          }}
          onSave={() => setDialogOp(null)}
        />
      )}
    </div>
  );
}
