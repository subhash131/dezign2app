import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Globe } from "lucide-react";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { BucketStorageSectionProps } from "./types";

export const CdnConfigSection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  return (
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
              onChange={(e) => handleUpdate(item.id, { cdnDomain: e.target.value })}
              onBlur={(e) => handleUpdate(item.id, { cdnDomain: e.target.value })}
              debounceMs={200}
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
  );
};
