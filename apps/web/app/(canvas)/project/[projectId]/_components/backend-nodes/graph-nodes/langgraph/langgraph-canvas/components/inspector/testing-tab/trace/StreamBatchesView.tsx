import React from "react";
import { Sparkles } from "lucide-react";
import type { StreamBatchItem, BatchFormatMode } from "../types";

export interface StreamBatchesViewProps {
  streamBatches: StreamBatchItem[];
  cleanOutput: unknown;
  activeFormat: BatchFormatMode;
  expandedBatchRaw: Record<string, boolean>;
  stepIdx: number;
  stepLabel: string;
}

export function StreamBatchesView({
  streamBatches,
  cleanOutput,
  activeFormat,
  stepLabel,
}: StreamBatchesViewProps) {
  return (
    <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto p-1.5 bg-muted/20 rounded-md border border-border/40 hide-scrollbar">
      {/* Full Accumulated Stream Preview */}
      <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-black/40 border border-cyan-500/30">
        <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono">
          <span className="font-bold text-cyan-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Complete Streamed Response ({streamBatches.length} tokens streamed)
          </span>
          <span className="text-[8px] text-emerald-400 font-medium">
            Native AI SSE Stream (Unbroken)
          </span>
        </div>
        <div className="text-[10px] font-mono text-cyan-100 whitespace-pre-wrap select-text p-2 rounded bg-background/80 border border-border/40 max-h-[140px] overflow-y-auto hide-scrollbar leading-relaxed">
          {streamBatches[streamBatches.length - 1]?.content ||
            (cleanOutput && typeof cleanOutput === "string" ? cleanOutput : "")}
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] text-muted-foreground px-1 font-mono pt-1">
        <span className="font-semibold uppercase text-muted-foreground">
          Individual Event Chunks ({streamBatches.length})
        </span>
        <span className="text-[8px] italic">
          Sub-word BPE token deltas received from AI socket
        </span>
      </div>

      {streamBatches.map((batch) => {
        const rawUsage = (batch.raw as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } })?.usage;
        const promptTokens = rawUsage?.prompt_tokens ?? Math.max(1, Math.round((batch.content?.length || 1) / 4));
        const completionTokens = rawUsage?.completion_tokens ?? (batch.index + 1);
        const fallbackUsage = {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        };
        const eventData = (batch.formatted && typeof batch.formatted === "object")
          ? {
              ...batch.formatted,
              data: {
                ...(batch.formatted as any).data,
                ...((batch.formatted as any).data?.usage ? {} : { usage: fallbackUsage }),
              },
            }
          : batch.formatted || {
              event: "on_chat_model_stream",
              agent: stepLabel,
              data: {
                delta: batch.delta,
                content: batch.content,
                usage: fallbackUsage,
              },
            };

        return (
          <div
            key={batch.index}
            className="flex flex-col gap-1 p-1.5 rounded bg-background/90 border border-border/50 text-[10px] font-mono hover:border-cyan-500/40 transition-colors"
          >
            <div className="flex items-center justify-between text-[9px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-cyan-600 dark:text-cyan-400">
                  Batch #{batch.index + 1}
                </span>
                {Boolean(batch.delta) && (
                  <span className="text-[8px] text-muted-foreground/80 px-1 py-0 bg-muted rounded">
                    {batch.delta.length} chars
                  </span>
                )}
              </div>
              <span className="font-mono text-[8.5px]">
                {batch.timestamp
                  ? new Date(batch.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      fractionalSecondDigits: 3,
                    })
                  : ""}
              </span>
            </div>

            {activeFormat === "event" ? (
              <pre className="p-1.5 rounded bg-black/60 text-[8.5px] font-mono text-cyan-300 overflow-x-auto max-h-[160px] border border-cyan-500/25 selection:bg-cyan-900">
                {typeof eventData === "string"
                  ? eventData
                  : JSON.stringify(eventData, null, 2)}
              </pre>
            ) : activeFormat === "delta" ? (
              <div className="p-1 rounded bg-muted/40 text-foreground font-mono text-[9.5px] whitespace-pre-wrap break-all border border-border/30">
                {batch.delta || (
                  <span className="text-muted-foreground/60 italic font-sans text-[9px]">
                    (empty delta)
                  </span>
                )}
              </div>
            ) : (
              <pre className="p-1.5 rounded bg-black/40 text-[8.5px] font-mono text-cyan-200 overflow-x-auto max-h-[140px] border border-cyan-500/20">
                {JSON.stringify(batch.raw || batch, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
