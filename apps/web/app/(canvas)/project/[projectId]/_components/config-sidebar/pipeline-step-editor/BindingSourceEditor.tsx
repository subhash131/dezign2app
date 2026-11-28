"use client";

import React, { useMemo, useState, useRef } from "react";
import { BufferedInput, BufferedTextarea } from "./BufferedInput";
import { StepCombobox, StepComboboxOption } from "./StepCombobox";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@workspace/ui/components/popover";
import { Braces, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import { SmartPathInput } from "./SmartPathInput";
import { EnvVarCombobox } from "../EnvVarCombobox";
import { StepBinding, AvailableSource } from "./types";
import { cn } from "@workspace/ui/lib/utils";

export interface BindingSourceEditorProps {
  binding: StepBinding;
  availableSources: AvailableSource[];
  onChange: (updated: StepBinding) => void;
  serviceNodeId?: string;
  placeholder?: string;
  textareaPlaceholder?: string;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  extraAction?: React.ReactNode;
}

export const BindingSourceEditor = ({
  binding,
  availableSources,
  onChange,
  serviceNodeId,
  placeholder,
  textareaPlaceholder,
  isExpanded: isExpandedProp,
  onToggleExpanded,
  extraAction,
}: BindingSourceEditorProps) => {
  const { source } = binding;
  const [isExpanded, setIsExpanded] = useState(false);
  const [variablePopoverOpen, setVariablePopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const uniqueSources = useMemo(() => {
    const seen = new Set<string>();
    return availableSources.filter((s) => {
      if (!s || !s.id || !s.id.trim() || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [availableSources]);

  const currentSourceOptionId = useMemo(() => {
    if (source.kind === "step_output") {
      return `step:${source.stepId}`;
    }
    const matched = uniqueSources.find(
      (s) => s.id === source.kind || s.kind === source.kind,
    );
    return matched ? matched.id : source.kind;
  }, [source, uniqueSources]);

  const activeSource = uniqueSources.find((s) => s.id === currentSourceOptionId);

  const handleSourceSelect = (selectedId: string) => {
    if (selectedId.startsWith("step:")) {
      const stepId = selectedId.replace("step:", "");
      onChange({
        ...binding,
        source: { kind: "step_output", stepId, field: "" },
      });
    } else {
      const foundSource = uniqueSources.find((s) => s.id === selectedId);
      if (foundSource) {
        if (foundSource.kind === "inline") {
          onChange({ ...binding, source: { kind: "inline", value: "" } });
        } else if (foundSource.kind === "step_output") {
          onChange({
            ...binding,
            source: {
              kind: "step_output",
              stepId: foundSource.stepId || selectedId.replace("step:", ""),
              field: "",
            },
          });
        } else {
          onChange({
            ...binding,
            source: { kind: foundSource.kind, field: "" },
          });
        }
      } else if (selectedId === "inline") {
        onChange({ ...binding, source: { kind: "inline", value: "" } });
      } else if (selectedId === "env") {
        onChange({ ...binding, source: { kind: "env", field: "" } });
      } else if (selectedId === "req_body") {
        onChange({ ...binding, source: { kind: "req_body", field: "" } });
      } else if (selectedId === "req_params") {
        onChange({ ...binding, source: { kind: "req_params", field: "" } });
      } else if (selectedId === "req_query") {
        onChange({ ...binding, source: { kind: "req_query", field: "" } });
      } else if (selectedId === "req_headers") {
        onChange({ ...binding, source: { kind: "req_headers", field: "" } });
      } else if (selectedId === "event_headers") {
        onChange({ ...binding, source: { kind: "event_headers", field: "" } });
      } else if (selectedId === "auth") {
        onChange({ ...binding, source: { kind: "auth", field: "" } });
      }
    }
  };

  // Collect all insertable variables from available sources
  const insertableVariables = useMemo(() => {
    const list: Array<{ label: string; token: string; category: string; type?: string }> = [];

    for (const src of uniqueSources) {
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
          : src.kind === "event_headers"
          ? "headers"
          : src.kind === "auth"
          ? "auth"
          : src.kind === "env"
          ? "process.env"
          : src.variableName || "step");

      // Whole object token (omit for env)
      if (src.paths.length > 0 && src.kind !== "env") {
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

    if (!uniqueSources.some((s) => s.kind === "env" || s.id === "env")) {
      list.push({
        label: "process.env.API_KEY",
        token: "${process.env.API_KEY}",
        category: "Environment Variables",
        type: "string",
      });
    }

    return list;
  }, [uniqueSources]);

  const handleInsertToken = (token: string) => {
    const currentVal = String(source.kind === "inline" ? source.value ?? "" : "");
    const target = showTextarea ? textareaRef.current : inputRef.current;

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
  const effectiveExpanded = isExpandedProp !== undefined ? isExpandedProp : isExpanded;
  const showTextarea = effectiveExpanded || hasNewlines;

  const handleToggleExpanded = () => {
    if (onToggleExpanded) {
      onToggleExpanded();
    } else {
      setIsExpanded((v) => !v);
    }
  };

  const sourceOptions: StepComboboxOption[] = useMemo(() => {
    return uniqueSources
      .filter((s) => Boolean(s && s.id && s.id.trim()))
      .map((s) => ({
        value: s.id,
        label: s.label,
        group:
          s.kind === "step_output"
            ? "Pipeline Steps"
            : s.kind === "state"
            ? "Graph State"
            : "Custom / Context",
      }));
  }, [uniqueSources]);

  return (
    <div className="flex flex-col gap-1.5 w-full min-w-0">
      <div className="flex gap-1.5 items-center w-full">
        {/* Source selector */}
        <StepCombobox
          value={currentSourceOptionId}
          onValueChange={handleSourceSelect}
          options={sourceOptions}
          placeholder="Source..."
          wrapperClassName="w-[180px] shrink-0"
          className="h-7 text-xs bg-background/60 border-border/60"
          contentClassName="w-[240px]"
        />

        {/* Path / Value field editor */}
        {source.kind === "env" ? (
          <div className="flex-1 min-w-0">
            <EnvVarCombobox
              value={source.field ?? ""}
              onValueChange={(field) =>
                onChange({ ...binding, source: { ...source, field } })
              }
              nodeId={serviceNodeId}
              defaultSuggestions={activeSource?.paths.map((p) => p.path) || []}
              placeholder="Select or type .env variable..."
              className="h-7 text-xs font-mono"
              allowRawInput={false}
            />
          </div>
        ) : source.kind !== "inline" ? (
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
              <BufferedInput
                ref={inputRef}
                className="h-7 text-xs font-mono bg-background/60 border-border/60 flex-1 pr-14"
                placeholder={placeholder || "e.g. chat:${body.thread_id}"}
                value={stringVal}
                onCommit={(val) =>
                  onChange({ ...binding, source: { ...source, value: val } })
                }
              />
            ) : null}

            {extraAction}

            {/* Expand / Collapse toggle */}
            <button
              type="button"
              className={cn(
                "p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors shrink-0",
                showTextarea && "bg-muted text-foreground",
              )}
              onClick={handleToggleExpanded}
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
                  <span>Map</span>
                  <span className="text-[9px] text-muted-foreground font-mono">{`\${}`}</span>
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
                        + Insert {item.token}
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
        <div className="w-full flex flex-col gap-1 pl-0 sm:pl-[186px]">
          <BufferedTextarea
            ref={textareaRef}
            rows={4}
            className="text-xs font-mono bg-background/80 border-border/60 w-full resize-y min-h-[80px]"
            placeholder={textareaPlaceholder || 'Instructions: You are an AI assistant.\nQuery: ${body.query}\n\nOr JSON:\n{\n  name: `demo ${body.query}`\n}'}
            value={stringVal}
            onCommit={(val) =>
              onChange({ ...binding, source: { ...source, value: val } })
            }
          />
          <span className="text-[9px] text-muted-foreground/60 font-sans">
            Combine hardcoded text/JSON with dynamic tokens like <code className="font-mono text-primary">{`\${body.query}`}</code> or <code className="font-mono text-primary">{`\${response.content}`}</code>.
          </span>
        </div>
      )}
    </div>
  );
};
