"use client";

import React from "react";
import { RealtimeConnection } from "@workspace/canvas/types";
import { DerivedRealtimeInfo } from "./types";
import { Radio, AlertCircle, Sparkles, ExternalLink, Trash2, Bot } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

export interface RealtimeConnectionHeaderProps {
  conn: RealtimeConnection;
  pageLabel: string;
  isConnected: boolean;
  isDerived: boolean;
  derivedInfo: DerivedRealtimeInfo | null;
  onEditInPipeline?: () => void;
  onDelete?: () => void;
}

export const RealtimeConnectionHeader: React.FC<RealtimeConnectionHeaderProps> = ({
  conn,
  pageLabel,
  isConnected,
  isDerived,
  derivedInfo,
  onEditInPipeline,
  onDelete,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "p-2 rounded-xl border",
              isConnected
                ? "bg-violet-500/10 text-violet-500 border-violet-500/20"
                : "bg-destructive/10 text-destructive border-destructive/25",
            )}
          >
            {isConnected ? <Radio size={18} /> : <AlertCircle size={18} />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
              <span>{conn.sourceItemName || conn.eventName || "Real-Time Connection"}</span>
              {(conn.sourceStepName || derivedInfo?.step) && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary/80 text-foreground/80 border border-border/70 inline-flex items-center gap-1">
                  {(conn.sourceStepType || derivedInfo?.step?.type) === "langgraph_invoke" ? (
                    <Bot size={11} className="text-muted-foreground shrink-0" />
                  ) : (
                    <Radio size={11} className="text-muted-foreground shrink-0" />
                  )}
                  <span>
                    {(conn.sourceStepIndex || derivedInfo?.stepIndex)
                      ? `Step ${conn.sourceStepIndex || derivedInfo?.stepIndex}: `
                      : ""}
                    {conn.sourceStepName ||
                      derivedInfo?.step?.name ||
                      (derivedInfo?.step?.type === "langgraph_invoke"
                        ? "LangGraph Agent"
                        : "Push to Client")}
                  </span>
                </span>
              )}
              <span className="text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase">
                {conn.protocol}
              </span>
              {conn.sourceItemType ? (
                <span
                  className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase",
                    conn.sourceItemType === "endpoint"
                      ? "bg-blue-500/15 text-blue-500 border border-blue-500/30"
                      : "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                  )}
                >
                  {conn.sourceItemType === "endpoint" ? "API" : "EVENT"}
                </span>
              ) : (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-destructive/15 text-destructive border border-destructive/30">
                  DISCONNECTED
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Listening on WebPage:{" "}
              <span className="font-mono text-foreground font-medium">
                {pageLabel}
              </span>
            </p>
          </div>
        </div>

        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5 font-medium shrink-0"
            onClick={onDelete}
            title="Delete this real-time connection"
          >
            <Trash2 size={13} />
            <span>Delete</span>
          </Button>
        )}
      </div>

      {/* Disconnected / Unlinked Warning Banner */}
      {!isConnected && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 flex flex-col gap-1.5 text-destructive">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AlertCircle size={15} className="shrink-0" />
            <span>Unlinked / Misconfigured Stream</span>
          </div>
          <p className="text-[11px] text-destructive/90 leading-relaxed">
            No backend service endpoint or event listener is currently pushing to this stream. To deliver real-time data to this page, add a <strong className="text-foreground font-semibold">Push to Client</strong> step inside a Service pipeline targeting this WebPage.
          </p>
        </div>
      )}

      {/* Derived Banner */}
      {isDerived && derivedInfo && (
        <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 font-medium">
              <Sparkles size={14} className="shrink-0" />
              <span>Pipeline Pushed Connection</span>
            </div>
            {derivedInfo.sourceNode && onEditInPipeline && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 gap-1 font-semibold"
                onClick={onEditInPipeline}
              >
                <ExternalLink size={11} /> Edit in Pipeline
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This real-time stream is pushed by{" "}
            <strong className="text-foreground">
              {conn.sourceStepIndex ? `Step ${conn.sourceStepIndex}: ` : ""}
              {conn.sourceStepName || derivedInfo.step?.name || (conn.isLangGraph || derivedInfo.step?.type === "langgraph_invoke" ? "LangGraph Agent" : "Push to Client")}
            </strong>{" "}
            ({conn.isLangGraph || derivedInfo.step?.type === "langgraph_invoke" ? "LangGraph Stream" : "Push to Client"}) on{" "}
            <strong className="text-foreground">
              {derivedInfo.sourceNode?.data?.label || derivedInfo.sourceNode?.type || "Service"}
            </strong>.
          </p>
        </div>
      )}
    </div>
  );
};
