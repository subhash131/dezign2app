import React from "react";
import { Badge } from "@workspace/ui/components/badge";
import { Bell } from "lucide-react";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { BucketStorageSectionProps } from "./types";
import { EVENT_TRIGGERS } from "./constants";

export const EventNotificationsSection: React.FC<BucketStorageSectionProps> = ({
  item,
  handleUpdate,
}) => {
  const activeTriggers = Array.isArray(item.eventTriggers)
    ? item.eventTriggers
    : [];

  const toggleEventTrigger = (key: string) => {
    const next = activeTriggers.includes(key)
      ? activeTriggers.filter((t) => t !== key)
      : [...activeTriggers, key];
    handleUpdate(item.id, { eventTriggers: next });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm border-blue-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-blue-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Bucket Event Notifications
          </span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Egress Triggers
        </Badge>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Emit event notifications when objects are uploaded, modified, or deleted. Connect the bucket&apos;s right handle on the canvas to downstream worker queues or endpoints to consume these events.
      </p>

      <div className="flex flex-col gap-2 pt-1">
        {EVENT_TRIGGERS.map((trigger) => {
          const active = activeTriggers.includes(trigger.key);
          return (
            <label
              key={trigger.key}
              className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                active
                  ? "bg-blue-500/10 border-blue-500/30 text-foreground"
                  : "bg-muted/15 border-border/50 text-muted-foreground hover:bg-muted/30"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 rounded border-border bg-background"
                checked={active}
                onChange={() => toggleEventTrigger(trigger.key)}
              />
              <div className="flex flex-col">
                <span className="text-xs font-semibold">{trigger.label}</span>
                <span className="text-[10px] text-muted-foreground">{trigger.desc}</span>
                <span className="text-[9px] font-mono text-muted-foreground/70 mt-0.5">
                  {trigger.key}
                </span>
              </div>
            </label>
          );
        })}
      </div>

      {activeTriggers.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/50">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">
              Prefix Filter
            </label>
            <LocalInput
              className="h-7 text-xs font-mono"
              placeholder="e.g. uploads/ or raw/"
              value={item.eventPrefixFilter || ""}
              onChange={(e) =>
                handleUpdate(item.id, { eventPrefixFilter: e.target.value })
              }
              onBlur={(e) =>
                handleUpdate(item.id, { eventPrefixFilter: e.target.value })
              }
              debounceMs={200}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">
              Suffix Filter
            </label>
            <LocalInput
              className="h-7 text-xs font-mono"
              placeholder="e.g. .jpg or .mp4"
              value={item.eventSuffixFilter || ""}
              onChange={(e) =>
                handleUpdate(item.id, { eventSuffixFilter: e.target.value })
              }
              onBlur={(e) =>
                handleUpdate(item.id, { eventSuffixFilter: e.target.value })
              }
              debounceMs={200}
            />
          </div>
        </div>
      )}
    </div>
  );
};
