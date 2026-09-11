"use client";

import React, { useMemo, useState, useRef } from "react";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@workspace/ui/components/popover";
import { Braces, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import { SmartPathInput } from "./SmartPathInput";
import { StepBinding, AvailableSource } from "./types";
import { cn } from "@workspace/ui/lib/utils";

export interface BindingSourceEditorProps {
  binding: StepBinding;
  availableSources: AvailableSource[];
  onChange: (updated: StepBinding) => void;
}

export const BindingSourceEditor = ({
  binding,
  availableSources,
  onChange,
}: BindingSourceEditorProps) => {
  const { source } = binding;
  const [isExpanded, setIsExpanded] = useState(false);
  const [variablePopoverOpen, setVariablePopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const currentSourceOptionId = useMemo(() => {
    if (source.kind === "step_output") {
      return `step:${source.stepId}`;
    }
    const matched = availableSources.find(
      (s) => s.id === source.kind || s.kind === source.kind,
    );
    return matched ? matched.id : source.kind;
  }, [source, availableSources]);

  const activeSource = availableSources.find((s) => s.id === currentSourceOptionId);

  const handleSourceSelect = (selectedId: string) => {
    if (selectedId.startsWith("step:")) {
      const stepId = selectedId.replace("step:", "");
      onChange({
        ...binding,
        source: { kind: "step_output", stepId, field: "" },
      });
    } else {
      const foundSource = availableSources.find((s) => s.id === selectedId);
      if (foundSource) {
        if (foundSource.kind === "inline") {
          onChange({ ...binding, source: { kind: "inline", value: "" } });
        } else {
          onChange({
            ...binding,
            source: { kind: foundSource.kind as any, field: "" },
          });
        }
      } else if (selectedId === "inline") {
        onChange({ ...binding, source: { kind: "inline", value: "" } });
      } else if (selectedId === "req_body") {
        onChange({ ...binding, source: { kind: "req_body", field: "" } });
      } else if (selectedId === "req_params") {
        onChange({ ...binding, source: { kind: "req_params", field: "" } });
      } else if (selectedId === "req_query") {
        onChange({ ...binding, source: { kind: "req_query", field: "" } });
      } else if (selectedId === "req_headers") {
        onChange({ ...binding, source: { kind: "req_headers", field: "" } });
      }
    }
  };

  // Collect all insertable variables from available sources
  const insertableVariables = useMemo(() => {
    const list: Array<{ label: string; token: string; category: string; type?: string }> = [];

    for (const src of availableSources) {
      if (src.kind === "inline") continue;

      const category = src.label;
      const prefix =
        src.rootVariableName ||
        (src.kind === "req_body"
          ? "body"
          : src.kind === "req_params"
          ? "params"
          : src.kind === "req_query"
          ? "query"
          : src.kind === "req_headers"
          ? "headers"
          : src.variableName || "step");

      // Whole object token
      if (src.paths.length > 0) {
        list.push({
          label: `${prefix} (whole)`,
          token: `\${${prefix}}`,
          category,
          type: "object",
        });
      }

      // Fields
      for (const p of src.paths) {
        list.push({
          label: p.path,
          token: `\${${prefix}.${p.path}}`,
          category,
          type: p.type,
        });
      }
    }

    // Common env vars token
    list.push({
      label: "process.env.API_KEY",
      token: "${process.env.API_KEY}",
      category: "Environment Variables",
      type: "string",
    });

    return list;
  }, [availableSources]);

  const handleInsertToken = (token: string) => {
    const currentVal = String(source.kind === "inline" ? source.value ?? "" : "");
    const target = inputRef.current;

    if (target && typeof target.selectionStart === "number" && typeof target.selectionEnd === "number") {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newVal = currentVal.substring(0, start) + token + currentVal.substring(end);
      onChange({ ...binding, source: { kind: "inline", value: newVal } });

      setTimeout(() => {
        target.focus();
        const cursor = start + token.length;
        target.setSelectionRange(cursor, cursor);
      }, 0);
    } else {
      const newVal = currentVal ? `${currentVal} ${token}` : token;
      onChange({ ...binding, source: { kind: "inline", value: newVal } });
    }
    setVariablePopoverOpen(false);
  };

  const stringVal = String(source.kind === "inline" ? source.value ?? "" : "");
  const hasNewlines = stringVal.includes("\n");
  const showTextarea = isExpanded || hasNewlines;

  return (
    <div className="flex flex-col gap-1.5 w-full min-w-0">
      <div className="flex gap-1.5 items-center w-full">
        {/* Source selector */}
        <Select value={currentSourceOptionId} onValueChange={handleSourceSelect}>
          <SelectTrigger className="h-7 text-xs bg-background/60 border-border/60 w-[140px] shrink-0">
            <SelectValue placeholder="Source..." />
          </SelectTrigger>
          <SelectContent>
            {availableSources
              .filter((s) => Boolean(s && s.id && s.id.trim()))
              .map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {/* Path / Value field editor */}
        {source.kind !== "inline" ? (
          <SmartPathInput
            value={source.field ?? ""}
            onChange={(field) => onChange({ ...binding, source: { ...source, field } })}
            suggestedPaths={activeSource?.paths || []}
            sourceKindLabel={activeSource?.label}
            rootVariableName={activeSource?.rootVariableName}
          />
        ) : (
          <div className="relative flex-1 min-w-0 flex items-center gap-1">
            {!showTextarea ? (
              <Input
                ref={(el) => { inputRef.current = el; }}
                className="h-7 text-xs font-mono bg-background/60 border-border/60 flex-1 pr-14"
                placeholder="e.g. gpt-4o or Prompt: ${body.query}"
                value={stringVal}
                onChange={(e) =>
                  onChange({ ...binding, source: { ...source, value: e.target.value } })
                }
              />
            ) : null}

            {/* Expand / Collapse toggle */}
            <button
              type="button"
              className={cn(
                "p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors shrink-0",
                showTextarea && "bg-muted text-foreground",
              )}
              onClick={() => setIsExpanded((v) => !v)}
              title={showTextarea ? "Collapse to single line" : "Expand to multi-line editor"}
            >
              {showTextarea ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>

            {/* Insert Variable Popover */}
            <Popover open={variablePopoverOpen} onOpenChange={setVariablePopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-7 px-2 text-[10px] font-mono flex items-center gap-1 rounded border border-border/50 bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Insert dynamic variable token ${...}"
                >
                  <Braces size={11} className="text-primary" />
                  <span>{`\${}`}</span>
                </button>
              </PopoverTrigger>

              <PopoverContent
                align="end"
                side="bottom"
                sideOffset={4}
                className="p-1.5 w-72 max-h-64 overflow-y-auto z-[100] bg-popover border border-border rounded-lg shadow-xl"
              >
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40 mb-1 flex items-center gap-1">
                  <Sparkles size={11} className="text-primary" />
                  <span>Insert Variable Token</span>
                </div>

                {insertableVariables.map((item, idx) => (
                  <button
                    key={`${item.token}-${idx}`}
                    type="button"
                    className="w-full text-left px-2 py-1 text-xs font-mono rounded hover:bg-accent text-foreground flex items-center justify-between transition-colors group"
                    onClick={() => handleInsertToken(item.token)}
                  >
                    <div className="flex flex-col min-w-0 pr-1">
                      <span className="truncate text-[11px] font-semibold text-foreground group-hover:text-primary">
                        {item.token}
                      </span>
                      <span className="text-[9px] text-muted-foreground truncate">
                        {item.category}: {item.label}
                      </span>
                    </div>
                    {item.type && (
                      <span className="text-[9px] text-muted-foreground/60 px-1 py-0.2 rounded bg-muted/40 font-sans shrink-0">
                        {item.type}
                      </span>
                    )}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* Expanded Multi-line Textarea */}
      {source.kind === "inline" && showTextarea && (
        <div className="w-full flex flex-col gap-1 pl-[146px]">
          <Textarea
            ref={(el) => { inputRef.current = el; }}
            rows={4}
            className="text-xs font-mono bg-background/80 border-border/60 w-full resize-y min-h-[80px]"
            placeholder={'Instructions: You are an AI assistant.\nQuery: ${body.query}\n\nOr JSON:\n{\n  name: `demo ${body.query}`\n}'}
            value={stringVal}
            onChange={(e) =>
              onChange({ ...binding, source: { ...source, value: e.target.value } })
            }
          />
          <span className="text-[9px] text-muted-foreground/60 font-sans">
            Combine hardcoded text/JSON with dynamic tokens like <code className="font-mono text-primary">{`\${body.query}`}</code> or <code className="font-mono text-primary">{`\${params.id}`}</code>.
          </span>
        </div>
      )}
    </div>
  );
};
