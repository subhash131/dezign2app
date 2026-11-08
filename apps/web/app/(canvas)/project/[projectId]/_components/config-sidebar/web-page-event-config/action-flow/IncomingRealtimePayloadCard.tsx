"use client";

import React, { useState, useMemo } from "react";
import {
  Radio,
  Sparkles,
  Code2,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowDownToLine,
  Zap,
  Info,
  Check,
  Copy,
} from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { AvailablePath } from "@workspace/canvas";
import { toPascalCase } from "@/lib/compiler/utils";

export interface IncomingRealtimePayloadCardProps {
  eventName?: string;
  protocol?: string;
  sourceServiceLabel?: string;
  sourceItemName?: string;
  incomingPaths?: AvailablePath[];
  isLangGraph?: boolean;
  langGraphStreamModes?: string[];
  payloadTypeName?: string;
}

interface JsonPayloadMap {
  [key: string]: JsonPayloadMap | string | number | boolean | string[];
}

function isJsonPayloadMap(
  value: JsonPayloadMap | string | number | boolean | string[] | undefined,
): value is JsonPayloadMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const IncomingRealtimePayloadCard: React.FC<IncomingRealtimePayloadCardProps> = ({
  eventName = "message",
  protocol = "SSE",
  sourceServiceLabel,
  sourceItemName,
  incomingPaths = [],
  isLangGraph = false,
  langGraphStreamModes,
  payloadTypeName,
}) => {
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const isLangGraphStream =
    isLangGraph ||
    incomingPaths.some((p) => p.path === "token" || p.path === "reasoning");

  // Show individual field pills by default only for non-LangGraph small schemas
  const [showFields, setShowFields] = useState(() => !isLangGraphStream && incomingPaths.length <= 6);

  const resolvedTypeName = useMemo(() => {
    if (payloadTypeName) return payloadTypeName;
    const service = sourceServiceLabel ? toPascalCase(sourceServiceLabel) : "Conversation";
    const route = sourceItemName
      ? toPascalCase(
          sourceItemName
            .replace(/^\//, "")
            .replace(/:[a-zA-Z0-9_]+/g, "")
            .replace(/[-_/]+/g, " ")
            .trim(),
        )
      : "SendMessage";
    if (isLangGraphStream) {
      return `${service}${route}StreamChunk`;
    }
    return `${service}${route}Response`;
  }, [payloadTypeName, sourceServiceLabel, sourceItemName, isLangGraphStream]);

  // Synthesize realistic sample JSON from incomingPaths
  const sampleJson = useMemo(() => {
    if (isLangGraphStream) {
      const hasReasoning = incomingPaths.some((p) => p.path === "reasoning");
      const hasToken = incomingPaths.some((p) => p.path === "token");
      const hasUpdates = incomingPaths.some(
        (p) => p.path === "mode" || (p.path === "data" && p.type?.includes("Record")),
      );
      return {
        ...(hasToken
          ? { token: "Hello! How can I assist you with your project today?" }
          : {}),
        node: "chatbot",
        ...(hasReasoning
          ? { reasoning: "Analyzing query and active workspace context...", type: "reasoning" }
          : {}),
        ...(hasUpdates ? { mode: "messages" } : {}),
        done: false,
      };
    }

    const obj: JsonPayloadMap = {};
    if (incomingPaths.length === 0) {
      return {
        message: "Hello from real-time stream",
        id: "evt_12345",
        status: "delivered",
        timestamp: new Date().toISOString(),
      };
    }

    incomingPaths.forEach((ip) => {
      const parts = ip.path.split(".");
      let target: JsonPayloadMap = obj;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!p) continue;
        const current = target[p];
        if (isJsonPayloadMap(current)) {
          target = current;
        } else {
          const nextTarget: JsonPayloadMap = {};
          target[p] = nextTarget;
          target = nextTarget;
        }
      }
      const leaf = parts[parts.length - 1];
      if (leaf && !target[leaf]) {
        if (ip.type === "number") target[leaf] = 42;
        else if (ip.type === "boolean") target[leaf] = true;
        else if (ip.type === "array") target[leaf] = ["item_1", "item_2"];
        else if (ip.type === "object") target[leaf] = { nestedKey: "sample" };
        else if (leaf === "id") target[leaf] = "msg_101";
        else if (leaf === "message") target[leaf] = "Hello from realtime stream";
        else if (leaf === "timestamp") target[leaf] = new Date().toISOString();
        else target[leaf] = `sample_${leaf}`;
      }
    });

    return obj;
  }, [incomingPaths, isLangGraphStream]);

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  return (
    <div className="rounded-xl border border-violet-500/35 bg-gradient-to-b from-violet-500/10 via-card to-card p-3 shadow-xs space-y-3">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex items-center justify-center p-1.5 rounded-lg bg-violet-500/20 text-violet-500 border border-violet-500/30">
            {isLangGraphStream ? (
              <Sparkles size={14} className="animate-pulse text-purple-400" />
            ) : (
              <Radio size={14} className="animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-foreground truncate">
                Incoming Real-Time Payload
              </span>
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 font-mono text-violet-600 dark:text-violet-400 border-violet-500/30 bg-violet-500/10"
              >
                {protocol}
              </Badge>
              {isLangGraphStream && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 font-mono text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10 flex items-center gap-1"
                >
                  <Sparkles size={8} /> LangGraph Stream
                </Badge>
              )}
              <Badge
                variant="secondary"
                className="text-[9px] px-1 py-0 font-mono text-muted-foreground"
              >
                Trigger Input
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              Event: <code className="text-foreground font-semibold">{eventName}</code>
              {sourceServiceLabel && ` • Pushed by ${sourceServiceLabel}`}
              {sourceItemName && ` (${sourceItemName})`}
              {langGraphStreamModes && langGraphStreamModes.length > 0 && (
                <span className="text-purple-400/80 font-mono ml-1">
                  • Modes: {langGraphStreamModes.join(", ")}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60">
            incomingData
          </span>
        </div>
      </div>

      {/* Primary Payload Type Contract */}
      <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/25 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-md bg-violet-500/20 text-violet-400 border border-violet-500/30 shrink-0">
            <Code2 size={13} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                Payload Type
              </span>
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 font-mono text-purple-400 border-purple-500/30 bg-purple-500/10"
              >
                Interface
              </Badge>
              {isLangGraphStream && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 font-mono text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                >
                  Stream Contract
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-mono font-bold text-violet-300 truncate" title={resolvedTypeName}>
                {resolvedTypeName}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowFields(!showFields)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground bg-background/60 hover:bg-background/90 px-2 py-1 rounded-md border border-border/50 transition-colors shrink-0 cursor-pointer font-mono"
        >
          <span>{showFields ? "Hide Fields" : `Fields (${incomingPaths.length > 0 ? incomingPaths.length : 4})`}</span>
          {showFields ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {/* Available Payload Fields Pills (Collapsible) */}
      {showFields && (
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <ArrowDownToLine size={10} className="text-violet-500" />
              <span>Available Payload Fields ({incomingPaths.length > 0 ? incomingPaths.length : 4})</span>
            </Label>
            <span className="text-[9px] text-muted-foreground/70">
              Click field to copy path
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-lg bg-background/60 border border-border/50">
            {incomingPaths.length === 0 ? (
              <>
                {["data", "message", "id", "timestamp"].map((field) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => handleCopy(field)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-500/25 transition-colors cursor-pointer"
                    title="Click to copy field path"
                  >
                    <span className="font-semibold">{field}</span>
                    <span className="text-[8px] text-muted-foreground">string</span>
                    {copiedPath === field ? <Check size={8} className="text-emerald-500" /> : <Copy size={8} className="opacity-40" />}
                  </button>
                ))}
              </>
            ) : (
              incomingPaths.map((ip) => (
                <button
                  key={ip.path}
                  type="button"
                  onClick={() => handleCopy(ip.path)}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/10 hover:bg-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-500/25 transition-colors cursor-pointer"
                  title={ip.description || `Click to copy path: incomingData.${ip.path}`}
                >
                  <span className="font-semibold">{ip.path}</span>
                  {ip.type && (
                    <span className="text-[8px] text-muted-foreground/80 bg-background/50 px-0.5 rounded font-mono">
                      {ip.type === "object"
                        ? `${toPascalCase(ip.path.split(".").pop() || "item")}Payload`
                        : ip.type}
                    </span>
                  )}
                  {copiedPath === ip.path ? (
                    <Check size={8} className="text-emerald-500" />
                  ) : (
                    <Copy size={8} className="opacity-40" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Pipeline Modification Hint */}
      <div className="p-2 rounded-lg bg-violet-500/5 border border-violet-500/20 text-[10px] text-muted-foreground flex items-start gap-1.5 leading-relaxed">
        <Sparkles size={12} className="text-violet-500 shrink-0 mt-0.5" />
        <span>
          Use this payload in pipeline steps below: In <strong className="text-foreground font-semibold">Transformer</strong> or <strong className="text-foreground font-semibold">Mutate State</strong>, select <strong className="text-violet-600 dark:text-violet-400 font-semibold">&quot;Incoming Stream Data&quot;</strong> as source to modify, format, or store incoming real-time messages.
        </span>
      </div>

      {/* Collapsible JSON Preview Toggle */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => setShowJsonPreview(!showJsonPreview)}
          className="flex items-center justify-between w-full text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors py-0.5"
        >
          <span className="flex items-center gap-1 font-mono">
            <Code2 size={11} className="text-violet-500" />
            <span>{showJsonPreview ? "Hide" : "Preview"} Sample JSON Structure</span>
          </span>
          {showJsonPreview ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {showJsonPreview && (
          <pre className="mt-1.5 p-2 rounded-lg bg-muted/50 border border-border/50 text-[10px] font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-36">
            {JSON.stringify(sampleJson, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
