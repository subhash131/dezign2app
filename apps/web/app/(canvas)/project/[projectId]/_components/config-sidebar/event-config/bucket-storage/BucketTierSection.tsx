import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Layers, HardDrive, ExternalLink } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BucketStorageSectionProps } from "./types";
import { STORAGE_CLASSES } from "./constants";

export const BucketTierSection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const nodes = useBackendCanvasStore((s) => s.nodes);

  const parentNode = item.nodeId
    ? nodes.find((n) => n.id === item.nodeId)
    : null;
  const parentProvider = parentNode?.data?.storageProvider || item.storageType || "s3";
  const parentLabel = parentNode?.data?.label || "Storage Node";

  const handleOpenStorageNode = () => {
    if (item.nodeId) {
      setActiveConfigItem({
        type: "storage",
        id: item.nodeId,
        nodeId: item.nodeId,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-amber-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Bucket Tier & Storage Class
          </span>
        </div>
        {item.nodeId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleOpenStorageNode}
            className="h-6 text-[10px] px-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 gap-1 font-medium"
            title="Configure parent cloud storage provider credentials & endpoint"
          >
            <HardDrive size={11} />
            <span>Node Config</span>
            <ExternalLink size={10} />
          </Button>
        )}
      </div>

      {/* Parent Storage Host Info */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <HardDrive size={13} className="text-amber-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Storage Provider Host
            </span>
            <span className="font-semibold text-foreground truncate">
              {parentLabel} <span className="font-mono text-[10px] text-amber-500 font-normal">({parentProvider.toUpperCase()})</span>
            </span>
          </div>
        </div>
      </div>

      {/* Storage Tier / Class */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-foreground">
            Storage Class / Access Tier
          </label>
          <span className="text-[10px] text-muted-foreground font-mono">
            {item.storageClass || "STANDARD"}
          </span>
        </div>
        <Select
          value={item.storageClass || "STANDARD"}
          onValueChange={(v) => handleUpdate(item.id, { storageClass: v })}
        >
          <SelectTrigger className="w-full bg-background/50 h-8 text-xs">
            <SelectValue placeholder="Select storage class" />
          </SelectTrigger>
          <SelectContent>
            {STORAGE_CLASSES.map((c) => (
              <SelectItem key={c.value} value={c.value} className="text-xs">
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Optimizes storage cost and access latency for objects stored inside this bucket.
        </p>
      </div>
    </div>
  );
};
