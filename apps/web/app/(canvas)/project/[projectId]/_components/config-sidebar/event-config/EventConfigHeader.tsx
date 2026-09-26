import React from "react";
import { ConfigItemData, ResourceArrayName } from "./types";
import { AnyMessagingResource } from "@/types/canvas";
import { LocalInput } from "../../backend-nodes/graph-nodes/shared";
import { cn } from "@workspace/ui/lib/utils";
import { Edit3 } from "lucide-react";

export interface EventConfigHeaderProps {
  item: ConfigItemData;
  resourceArrayName: ResourceArrayName;
  handleUpdate?: (eventId: string, changes: Partial<AnyMessagingResource>) => void;
  debounceMs?: number;
}

export const EventConfigHeader: React.FC<EventConfigHeaderProps> = ({
  item,
  resourceArrayName,
  handleUpdate,
  debounceMs = process.env.NODE_ENV === "test" ? 0 : 200,
}) => {
  const isCache = resourceArrayName === "caches" || item.kind === "cache";
  const isBucket = resourceArrayName === "buckets";
  const isConsumed = item.variant === "consume";
  const isReadOnly = item.variant !== "definition" && !isBucket;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = isBucket
      ? e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, "-")
      : e.target.value;
    if (val !== item.name) {
      handleUpdate?.(item.id, { name: val });
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = isBucket
      ? e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, "-")
      : e.target.value;
    const trimmed = val.trim();
    if (trimmed !== item.name) {
      handleUpdate?.(item.id, { name: trimmed });
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "text-[10px] font-mono font-bold px-2 py-0.5 rounded border shadow-sm shrink-0",
            isBucket
              ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
              : isCache
                ? "bg-purple-500/15 text-purple-500 border-purple-500/20"
                : isConsumed
                  ? "bg-blue-500/15 text-blue-500 border-blue-500/20"
                  : "bg-orange-500/15 text-orange-500 border-orange-500/20",
          )}
        >
          {isBucket ? "BUCKET" : isCache ? "CACHE" : isConsumed ? "CONSUMER" : "EVENT"}
        </span>

        {isBucket || (!isReadOnly && handleUpdate) ? (
          <div className="relative flex-1 group">
            <LocalInput
              className="h-8 text-base font-semibold tracking-tight text-foreground bg-background/60 font-mono pr-7 border-border/60 hover:border-amber-500/50 focus-visible:border-amber-500 focus-visible:ring-1 focus-visible:ring-amber-500/30 transition-colors"
              placeholder={isBucket ? "e.g. avatars, documents" : "Resource name"}
              value={item.name || ""}
              onChange={handleChange}
              onBlur={handleBlur}
              debounceMs={debounceMs}
              title="Edit bucket name (syncs with node bucket label)"
            />
            <Edit3
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none group-hover:text-amber-500 transition-colors"
            />
          </div>
        ) : (
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {item.name || (isConsumed ? "Event Consumer" : "Untitled Event")}
          </span>
        )}
      </div>
      <span className="text-sm text-muted-foreground">
        {isCache
          ? "Configure caching details and schema."
          : isBucket
            ? "Configure bucket policies, access control, CORS, lifecycle, and operations."
            : isConsumed
              ? "Configure broker subscription, topic, and handler logic."
              : "Configure event and messaging details."}
      </span>
    </div>
  );
};
