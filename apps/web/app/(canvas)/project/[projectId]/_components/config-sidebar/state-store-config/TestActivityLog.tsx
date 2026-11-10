"use client";

import React from "react";
import { Label } from "@workspace/ui/components/label";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Terminal, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { TestHistoryEntry } from "./types";
import { cn } from "@workspace/ui/lib/utils";

export interface TestActivityLogProps {
  history: TestHistoryEntry[];
  onClearHistory?: () => void;
}

export const TestActivityLog: React.FC<TestActivityLogProps> = ({
  history,
  onClearHistory,
}) => {
  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Terminal size={12} className="text-foreground" />
          <span>Activity Log &amp; State Diffs ({history.length})</span>
        </Label>

        {history.length > 0 && onClearHistory && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearHistory}
            className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-destructive gap-1 cursor-pointer"
          >
            <Trash2 size={10} />
            <span>Clear Log</span>
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="p-3 text-center text-[10px] text-muted-foreground bg-muted rounded-md border border-dashed border-border">
          No actions dispatched yet. Select an action above and click &quot;Execute&quot; to see real-time state changes and behavior.
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
          {history.map((item) => {
            const hasError = Boolean(item.error);

            return (
              <div
                key={item.id}
                className={cn(
                  "p-2.5 rounded-lg border space-y-1.5 text-[10px] font-mono transition-all",
                  hasError
                    ? "bg-destructive/10 border-destructive text-destructive"
                    : "bg-card border border-border",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {hasError ? (
                      <AlertCircle size={12} className="text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 size={12} className="text-foreground shrink-0" />
                    )}
                    <span className="font-bold text-foreground">{item.manipulatorName}</span>
                    <Badge variant="outline" className="text-[8px] py-0 px-1 font-mono bg-muted text-muted-foreground border-border">
                      {item.category.replace("_", " ")}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground text-[9px]">{item.timestamp}</span>
                </div>

                {/* Error Banner */}
                {hasError && (
                  <div className="p-1.5 rounded bg-destructive/10 text-destructive text-[10px] font-mono break-words border border-destructive">
                    {item.error}
                  </div>
                )}

                {/* Changed Keys Badges */}
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <span className="text-muted-foreground text-[9px]">Mutated:</span>
                  {item.changedKeys.length === 0 ? (
                    <span className="text-muted-foreground italic text-[9px]">
                      {hasError ? "Aborted due to error" : "No state mutation"}
                    </span>
                  ) : (
                    item.changedKeys.map((key) => {
                      const before = JSON.stringify(item.beforeState[key]);
                      const after = JSON.stringify(item.afterState[key]);
                      return (
                        <span
                          key={key}
                          className="px-1.5 py-0.5 rounded bg-muted text-foreground border border-border text-[9px] font-medium"
                        >
                          {key}: {before} → {after}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
