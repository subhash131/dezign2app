"use client";

import React, { useState } from "react";
import { Code2, Copy, Check, ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";

export interface ZustandActionPreviewProps {
  snippet: string;
  actionName: string;
  storeName?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export const ZustandActionPreview: React.FC<ZustandActionPreviewProps> = ({
  snippet,
  actionName,
  storeName = "useStore",
  defaultExpanded = true,
  className,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Copied Zustand action to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  return (
    <div
      className={cn(
        "rounded-md border border-indigo-500/20 bg-muted/40 overflow-hidden text-xs",
        className,
      )}
    >
      <div
        className="flex items-center justify-between px-2.5 py-1.5 bg-muted/60 border-b border-border/40 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1.5">
          <Terminal size={12} className="text-indigo-400" />
          <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">
            Zustand Action Preview
          </span>
          <Badge
            variant="outline"
            className="text-[9px] py-0 px-1 font-mono text-indigo-400 border-indigo-500/30 bg-indigo-500/10"
          >
            {actionName || "action"}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
            title="Copy code to clipboard"
          >
            {copied ? (
              <>
                <Check size={11} className="text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy size={11} />
                <span>Copy</span>
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-2.5 bg-black/40 font-mono text-[11px] leading-relaxed text-indigo-100 overflow-x-auto selection:bg-indigo-500/30">
          <pre className="whitespace-pre overflow-x-auto scrollbar-thin">
            <code>{snippet}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
