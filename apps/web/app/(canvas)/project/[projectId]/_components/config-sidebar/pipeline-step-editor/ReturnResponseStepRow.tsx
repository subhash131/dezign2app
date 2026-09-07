"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { Endpoint, BackendNode } from "@workspace/canvas/types";
import { useBufferedInput } from "@/lib/hooks/useBufferedInput";

import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { ChevronDown, ChevronRight, Plus, Trash, Send, Pencil, Check, X, Braces, Sparkles } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { NestedResponseSchemaEditor } from "../NestedResponseSchemaEditor";
import { BindingSourceEditor } from "./BindingSourceEditor";
import { PipelineStepDraft, StepBinding } from "./types";
import { getAvailableSources, HTTP_STATUS_OPTIONS } from "./utils";

export interface ReturnResponseStepRowProps {
  step: PipelineStepDraft;
  priorSteps: PipelineStepDraft[];
  endpoint?: Endpoint;
  allNodes: BackendNode[];
  onChange: (updated: PipelineStepDraft) => void;
  onEndpointChange?: (changes: Partial<Endpoint>) => void;
}

export const ReturnResponseStepRow = ({
  step,
  priorSteps,
  endpoint,
  allNodes,
  onChange,
  onEndpointChange,
}: ReturnResponseStepRowProps) => {
  const [expanded, setExpanded] = useState(true);
  const [responseTab, setResponseTab] = useState<"success" | "error">("success");

  const stepRef = useRef(step);
  stepRef.current = step;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const noteBuffer = useBufferedInput(
    step.name && step.name !== "Return Response"
      ? step.name
      : (step.description ?? ""),
    useCallback((val: string) => {
      onChangeRef.current({
        ...stepRef.current,
        name: val.trim() || "Return Response",
        description: val,
      });
    }, []),
    150,
  );

  // Available sources (request body, params, query, headers, prior steps)
  const availableSources = useMemo(
    () => getAvailableSources(endpoint, priorSteps, allNodes),
    [endpoint, priorSteps, allNodes],
  );

  const statusCode = step.statusCode || (endpoint?.type === "POST" ? 201 : 200);

  // Auto-sync payload bindings into endpoint.responseBody so user never has to configure fields twice
  const syncResponseBody = (bindings: StepBinding[]) => {
    if (onEndpointChange) {
      const fields = bindings
        .filter((b) => Boolean(b.argName?.trim()))
        .map((b, idx) => ({
          id: `res_f_${idx}`,
          name: b.argName.trim(),
          type: "string",
          required: true,
          key: b.argName.trim(),
          value: "",
        }));
      onEndpointChange({
        responseBody: {
          id: endpoint?.responseBody?.id || `res_${endpoint?.id || "ep"}`,
          fields,
          rawJson: endpoint?.responseBody?.rawJson,
        },
      });
    }
  };

  const updateBinding = (bi: number, updated: StepBinding) => {
    const bindings = [...(step.inputBindings || [])];
    bindings[bi] = updated;
    onChange({ ...step, inputBindings: bindings });
    syncResponseBody(bindings);
  };

  const addBinding = () => {
    const newBinding: StepBinding = {
      argName: `field_${(step.inputBindings || []).length + 1}`,
      source: { kind: "req_body", field: "" },
    };
    const next = [...(step.inputBindings || []), newBinding];
    onChange({
      ...step,
      inputBindings: next,
    });
    syncResponseBody(next);
  };

  const removeBinding = (bi: number) => {
    const next = (step.inputBindings || []).filter((_, i) => i !== bi);
    onChange({
      ...step,
      inputBindings: next,
    });
    syncResponseBody(next);
  };

  // Build preview code
  const previewCode = useMemo(() => {
    const bindings = step.inputBindings || [];
    if (bindings.length === 0) {
      return `res.status(${statusCode}).json({ message: "Success" });`;
    }

    const getExprForBinding = (b: StepBinding): string => {
      const source = b.source;

      switch (source.kind) {
        case "inline": {
          const v = source.value;
          if (typeof v === "number" || typeof v === "boolean") return String(v);
          const str = String(v ?? "");
          if (!/\$\{([^}]+)\}/.test(str)) return `"${str}"`;
          return `\`${str.replace(/`/g, "\\`")}\``;
        }
        case "step_output": {
          const found = availableSources.find(
            (s) => s.id === `step:${source.stepId}`,
          );
          const base = found?.variableName || "stepResult";
          const field = source.field ? source.field.trim() : "";
          return field ? `${base}.${field}` : base;
        }
        case "req_body": {
          const field = source.field ? source.field.trim() : "";
          return field ? `req.body.${field}` : "req.body";
        }
        case "req_params": {
          const field = source.field ? source.field.trim() : "";
          return field ? `req.params.${field}` : "req.params";
        }
        case "req_query": {
          const field = source.field ? source.field.trim() : "";
          return field ? `req.query.${field}` : "req.query";
        }
        case "req_headers": {
          const field = source.field ? source.field.trim() : "";
          return field ? `req.headers["${field}"]` : "req.headers";
        }
        default:
          return '""';
      }
    };

    const fields = bindings
      .map((b) => `${b.argName}: ${getExprForBinding(b)}`)
      .join(", ");
    return `res.status(${statusCode}).json({ ${fields} });`;
  }, [step.inputBindings, statusCode, availableSources]);

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/10 shadow-sm transition-all duration-150">
      {/* Header */}
      <div
        className="flex flex-col gap-0.5 px-2.5 py-1.5 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Top Line */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] text-emerald-400 font-mono w-3.5 shrink-0">
            ↩
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 text-emerald-400 bg-emerald-500/10 border-emerald-500/25">
            <Send size={11} />
            Return Response
          </span>
          <span className="text-xs font-medium text-foreground/90 flex-1 truncate">
            HTTP {statusCode}
          </span>
          <span className="text-[10px] font-mono text-emerald-400/60 truncate max-w-[130px]">
            {previewCode}
          </span>
          {expanded ? (
            <ChevronDown size={12} className="text-muted-foreground/50 shrink-0 ml-1" />
          ) : (
            <ChevronRight size={12} className="text-muted-foreground/50 shrink-0 ml-1" />
          )}
        </div>

        {/* Second Line: Description (read-only, no events) */}
        {(() => {
          const displayDesc =
            step.description?.trim() ||
            (step.name && step.name !== "Return Response" ? step.name.trim() : "");
          return displayDesc ? (
            <div className="flex items-center ml-7 mr-6 -mt-0.5 mb-0.5 pointer-events-none min-h-[18px]">
              <span className="text-[11px] font-sans leading-relaxed text-emerald-300/80 line-clamp-2">
                {displayDesc}
              </span>
            </div>
          ) : null;
        })()}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-emerald-500/20 px-3 pt-3 pb-3 flex flex-col gap-3">
          {/* Dual Tabs: Success Response (2xx) and Failure / Error Response (4xx/5xx) */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-secondary/30 border border-border/50">
            <button
              type="button"
              onClick={() => setResponseTab("success")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                responseTab === "success"
                  ? "bg-background text-foreground shadow-xs font-semibold border border-border/60"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>Success Response (2xx)</span>
              {(step.inputBindings || []).length > 0 && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-mono">
                  {(step.inputBindings || []).length} field{(step.inputBindings || []).length !== 1 ? "s" : ""}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setResponseTab("error")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                responseTab === "error"
                  ? "bg-background text-foreground shadow-xs font-semibold border border-border/60"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="w-2 h-2 rounded-full bg-destructive inline-block" />
              <span>Failure / Error Response (4xx/5xx)</span>
              {endpoint?.errorResponseBody?.fields && endpoint.errorResponseBody.fields.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-destructive/15 text-destructive font-mono">
                  {endpoint.errorResponseBody.fields.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab 1: Success Response (2xx) */}
          {responseTab === "success" && (
            <div className="flex flex-col gap-3">
              {/* Status code row */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground font-medium">
                    HTTP Status Code
                  </Label>
                  <Select
                    value={String(statusCode)}
                    onValueChange={(v) => onChange({ ...step, statusCode: Number(v) })}
                  >
                    <SelectTrigger className="h-7 text-xs bg-background/70 border-border/60 font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HTTP_STATUS_OPTIONS.filter(
                        (opt) => opt && opt.code != null && String(opt.code).trim() !== "",
                      ).map((opt) => (
                        <SelectItem
                          key={opt.code}
                          value={String(opt.code)}
                          className="text-xs font-mono"
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground font-medium">
                    Response Action / Note
                  </Label>
                  <Input
                    className="h-7 text-xs bg-background/60 border-border/60"
                    value={noteBuffer.value}
                    onChange={(e) => noteBuffer.onChange(e.target.value)}
                    onBlur={noteBuffer.flush}
                    placeholder="e.g. Return Created Product"
                  />
                </div>
              </div>

              {/* Response payload fields */}
              <div className="flex flex-col gap-2 pt-1 border-t border-border/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                      Success Response Payload
                    </Label>
                    <span className="text-[9px] text-muted-foreground/60">
                      Bind returned fields directly from step results or request data.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                    onClick={addBinding}
                  >
                    <Plus size={10} />
                    Add field
                  </button>
                </div>

                {(step.inputBindings || []).length === 0 ? (
                  <div className="rounded border border-dashed border-border/40 p-2.5 text-center bg-muted/10">
                    <p className="text-[10px] text-muted-foreground/60">
                      Default response envelope will be returned.
                    </p>
                    <p
                      className="text-[9px] text-emerald-400/80 mt-0.5 cursor-pointer hover:underline"
                      onClick={() => {
                        const lastPrior = priorSteps[priorSteps.length - 1];
                        const defaultBinding: StepBinding = lastPrior
                          ? {
                              argName: "data",
                              source: {
                                kind: "step_output",
                                stepId: lastPrior.id,
                                field: "",
                              },
                            }
                          : {
                              argName: "data",
                              source: { kind: "req_body", field: "" },
                            };
                        const next = [defaultBinding];
                        onChange({
                          ...step,
                          inputBindings: next,
                        });
                        syncResponseBody(next);
                      }}
                    >
                      Click here to return the result of the previous step.
                    </p>
                  </div>
                ) : (
                  (step.inputBindings || []).map((binding, bi) => (
                    <div
                      key={bi}
                      className="grid grid-cols-[1fr_auto_2.2fr_auto] gap-1.5 items-center bg-muted/15 p-1.5 rounded border border-border/40"
                    >
                      {/* Key name */}
                      <Input
                        className="h-7 text-xs font-mono bg-background/70 border-border/60"
                        value={binding.argName}
                        onChange={(e) =>
                          updateBinding(bi, { ...binding, argName: e.target.value })
                        }
                        placeholder="data / fieldName"
                      />
                      {/* Arrow */}
                      <span className="text-[10px] text-muted-foreground/50 px-0.5">←</span>
                      {/* Source & Smart Path */}
                      <BindingSourceEditor
                        binding={binding}
                        availableSources={availableSources}
                        onChange={(updated) => updateBinding(bi, updated)}
                      />
                      {/* Delete button */}
                      {(step.inputBindings || []).length > 1 ? (
                        <button
                          type="button"
                          className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10 cursor-pointer"
                          onClick={() => removeBinding(bi)}
                          title="Remove field"
                        >
                          <Trash size={11} />
                        </button>
                      ) : (
                        <div className="w-5" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Failure / Error Response (4xx/5xx) */}
          {responseTab === "error" && endpoint && onEndpointChange && (
            <div className="flex flex-col gap-2.5">
              <NestedResponseSchemaEditor
                title="Failure / Error Response (4xx/5xx)"
                subtitle="Declare the error payload structure returned on failure (validation error, downstream failure, or server error)."
                isExternal={false}
                mode={endpoint.responseMode === "raw_json" ? "raw_json" : "field_builder"}
                onModeChange={(responseMode) => onEndpointChange({ responseMode })}
                schema={
                  endpoint.errorResponseBody || {
                    id: `res_err_${endpoint.id}`,
                    fields: [
                      { id: "err_1", name: "error", type: "string", required: true, key: "error", value: "" },
                      { id: "err_2", name: "message", type: "string", required: true, key: "message", value: "" },
                      { id: "err_3", name: "statusCode", type: "number", required: false, key: "statusCode", value: "" },
                    ],
                  }
                }
                onSchemaChange={(errorResponseBody) => onEndpointChange({ errorResponseBody })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
