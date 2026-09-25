"use client";

import React, { useState, useMemo } from "react";
import { Code2, Settings, Plus, ShieldAlert } from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import {
  getStorageOperations,
  getOperationAccessRestrictedReason,
  StorageOperationFunction,
} from "@/lib/utils/storageOperationsHelper";
import { StorageOperationDialog } from "../../../backend-nodes/graph-nodes/nodes/database/StorageOperationDialog";
import { BucketStorageSectionProps } from "./types";

export const BucketOperationsSection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  const [selectedOp, setSelectedOp] = useState<StorageOperationFunction | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isNewOp, setIsNewOp] = useState(false);

  const operations = useMemo(() => {
    return getStorageOperations(null, item);
  }, [item]);

  const activeCount = operations.filter((o) => o.enabled !== false).length;

  const handleToggleOp = (op: StorageOperationFunction, enabled: boolean) => {
    const existingOps: StorageOperationFunction[] = item.storageOperations || [];
    const nextOp: StorageOperationFunction = { ...op, enabled };
    const existingIndex = existingOps.findIndex(
      (o) => o.id === op.id || o.name === op.name,
    );
    let nextOps: StorageOperationFunction[];
    if (existingIndex >= 0) {
      nextOps = existingOps.map((o, idx) => (idx === existingIndex ? nextOp : o));
    } else {
      nextOps = [...existingOps, nextOp];
    }

    // Link: If turning an operation ON, ensure its capability is reflected in allowedOperations
    const allowedOps: string[] = Array.isArray(item.allowedOperations)
      ? [...item.allowedOperations]
      : ["read", "write"];
    let nextAllowedOps = allowedOps;
    let nextEnablePresigned = Boolean(item.enablePresignedUrls);

    if (enabled) {
      if ((op.kind === "delete" || op.kind === "batch_delete") && !nextAllowedOps.includes("delete")) {
        nextAllowedOps = [...nextAllowedOps, "delete"];
      }
      if ((op.kind === "upload" || op.kind === "copy") && !nextAllowedOps.includes("write")) {
        nextAllowedOps = [...nextAllowedOps, "write"];
      }
      if ((op.kind === "download" || op.kind === "exists") && !nextAllowedOps.includes("read")) {
        nextAllowedOps = [...nextAllowedOps, "read"];
      }
      if (op.kind === "list" && !nextAllowedOps.includes("list")) {
        nextAllowedOps = [...nextAllowedOps, "list"];
      }
      if (op.kind === "presign_upload" || op.kind === "presign_download") {
        nextEnablePresigned = true;
        if (op.kind === "presign_upload" && !nextAllowedOps.includes("write")) {
          nextAllowedOps = [...nextAllowedOps, "write"];
        }
        if (op.kind === "presign_download" && !nextAllowedOps.includes("read")) {
          nextAllowedOps = [...nextAllowedOps, "read"];
        }
      }
    }

    handleUpdate(item.id, {
      storageOperations: nextOps,
      allowedOperations: nextAllowedOps,
      enablePresignedUrls: nextEnablePresigned,
    });
  };

  const handleOpenConfigure = (op: StorageOperationFunction) => {
    setSelectedOp(op);
    setIsNewOp(false);
    setIsDialogOpen(true);
  };

  const handleOpenNewOp = () => {
    setSelectedOp(null);
    setIsNewOp(true);
    setIsDialogOpen(true);
  };

  const handleSaveOp = (savedOp: StorageOperationFunction) => {
    const existingOps: StorageOperationFunction[] = item.storageOperations || [];
    const existingIndex = existingOps.findIndex(
      (o) => o.id === savedOp.id || o.name === savedOp.name,
    );
    let nextOps: StorageOperationFunction[];
    if (existingIndex >= 0) {
      nextOps = existingOps.map((o, idx) => (idx === existingIndex ? savedOp : o));
    } else {
      nextOps = [...existingOps, savedOp];
    }
    handleUpdate(item.id, { storageOperations: nextOps });
  };

  const handleDeleteOp = (opId: string) => {
    const existingOps: StorageOperationFunction[] = item.storageOperations || [];
    const nextOps = existingOps.filter((o) => o.id !== opId && o.name !== opId);
    handleUpdate(item.id, { storageOperations: nextOps });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm border-amber-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 size={14} className="text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
            Bucket Operations
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-[10px] font-mono px-1.5 py-0 h-4 border-amber-500/30 text-amber-500"
          >
            {activeCount}/{operations.length} enabled
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleOpenNewOp}
            className="h-6 px-1.5 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 gap-1"
            title="Add Custom Operation for this Bucket"
          >
            <Plus size={12} />
            Add Op
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Operations available for <code>{item.name}</code>. Permissions are automatically synchronized with your Connectability & Access Control matrix.
      </p>

      {/* Operations List */}
      <div className="flex flex-col divide-y divide-border/40 rounded-lg border border-border/50 bg-background/50 overflow-hidden">
        {operations.map((op) => {
          const isEnabled = op.enabled !== false;
          const restrictedReason = getOperationAccessRestrictedReason(
            op,
            item.allowedOperations ?? ["read", "write", "delete", "list"],
            item.accessPolicy ?? "private",
            Boolean(item.enablePresignedUrls),
          );

          return (
            <div
              key={op.id || op.name}
              className={cn(
                "flex items-center justify-between p-2.5 text-xs transition-colors group/item",
                !isEnabled
                  ? "opacity-50 bg-muted/10"
                  : "hover:bg-secondary/20",
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                <span
                  className={cn(
                    "text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 font-mono tracking-wider",
                    op.badge?.colorClass || "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {op.badge?.label || "OP"}
                </span>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={cn(
                        "font-mono text-[11px] truncate font-medium text-foreground",
                        !isEnabled && "line-through text-muted-foreground",
                      )}
                      title={op.signature || op.name}
                    >
                      {op.name}
                    </span>
                    {!isEnabled && restrictedReason && (
                      <span className="text-[9px] text-amber-600 dark:text-amber-400 font-mono font-medium flex items-center gap-0.5">
                        <ShieldAlert size={9} />
                        {restrictedReason}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {op.description}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => handleOpenConfigure(op)}
                  title="Configure, Preview, or Test Operation"
                >
                  <Settings size={12} />
                </Button>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => handleToggleOp(op, checked)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Operation Configure, Preview, and Test Dialog */}
      <StorageOperationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        operation={selectedOp}
        isNew={isNewOp}
        storageNode={{
          id: item.nodeId || "storage-node",
          data: {
            label: "Storage",
            buckets: [item],
          },
        }}
        onSave={handleSaveOp}
        onDelete={handleDeleteOp}
      />
    </div>
  );
};
