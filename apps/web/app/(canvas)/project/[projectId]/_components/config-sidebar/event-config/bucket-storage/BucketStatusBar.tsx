import React from "react";
import { Badge } from "@workspace/ui/components/badge";
import { HardDrive } from "lucide-react";
import { ConfigItemData } from "../types";

export interface BucketStatusBarProps {
  item: ConfigItemData;
}

export const BucketStatusBar: React.FC<BucketStatusBarProps> = ({ item }) => {
  const selectedProvider = item.storageType || "s3";
  const accessPolicy = item.accessPolicy || "private";

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-xs">
        <HardDrive size={14} className="shrink-0" />
        <span className="font-mono text-foreground font-bold">{item.name || "Untitled Bucket"}</span>
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
        {Boolean(item.enableMetadata) && (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
            Metadata
          </Badge>
        )}
      </div>
    </div>
  );
};
