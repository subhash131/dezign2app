"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { LocalInput, LocalTextarea } from "../../backend-nodes/graph-nodes/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Code2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FlaskConical,
  CornerDownRight,
  Layers,
} from "lucide-react";
import { GlobalStoreAction, GlobalStoreField, Parameter } from "@workspace/canvas/types";
import {
  applyManipulator,
  formatInitialFieldValue,
  isJsonObject,
  StateManipulator,
  StoreState,
} from "./types";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";

export interface InlineActionTesterProps {
  action: GlobalStoreAction;
  fields: GlobalStoreField[];
  className?: string;
}

/**
 * Returns true if the type is an object, array, or custom model/entity (e.g. Conversation, Message, User)
 */
export function isComplexType(type: string | undefined): boolean {
  if (!type) return false;
  const clean = type.trim();
  const lower = clean.toLowerCase();
  return (
    clean.endsWith("[]") ||
    lower === "array" ||
    lower === "object" ||
    /^[A-Z]/.test(clean) ||
    lower === "conversation" ||
    lower === "message" ||
    lower === "user"
  );
}

/**
 * Generates a realistic sample value matching the exact defined type (primitive or custom model)
 */
export function getSampleValueForType(type: string | undefined, name: string): any {
  const cleanType = (type || "").trim();
  const lowerType = cleanType.toLowerCase();

  // If array type: e.g. "Conversation[]", "Message[]", "string[]", "array"
  if (cleanType.endsWith("[]") || lowerType === "array") {
    const itemType = cleanType.endsWith("[]") ? cleanType.slice(0, -2).trim() : "item";
    const sampleItem = getSampleValueForType(itemType, itemType);
    return [sampleItem];
  }

  if (lowerType === "number") return 1;
  if (lowerType === "boolean") return true;

  if (lowerType === "conversation") {
    return {
      id: "conv_1",
      title: "New Conversation",
      messages: [],
      createdAt: new Date().toISOString(),
    };
  }

  if (lowerType === "message") {
    return {
      id: "msg_1",
      content: "Hello, this is a test message.",
      sender: "user",
      timestamp: new Date().toISOString(),
    };
  }

  if (lowerType === "user") {
    return {
      id: "usr_1",
      name: "Guest User",
      email: "guest@example.com",
    };
  }

  // Any custom entity / model type (starts with uppercase e.g. Conversation, Channel, Post, etc.) or "object"
  if (lowerType === "object" || /^[A-Z]/.test(cleanType)) {
    return {
      id: `${name.toLowerCase() || "item"}_1`,
      title: `Sample ${cleanType}`,
    };
  }

  // Primitive string
  if (lowerType === "string") {
    if (name.toLowerCase().includes("id")) return "id_123";
    if (name.toLowerCase().includes("email")) return "user@example.com";
    return `Sample ${name}`;
  }

  return `Sample ${name}`;
}

export const InlineActionTester: React.FC<InlineActionTesterProps> = ({
  action,
  fields,
  className,
}) => {
  // Initialize test state from field defaults
  const getInitialState = (): StoreState => {
    const state: StoreState = {};
    fields.forEach((f) => {
      state[f.name] = formatInitialFieldValue(f);
    });
    return state;
  };

  const [sandboxState, setSandboxState] = useState<StoreState>(getInitialState);
  const [beforeState, setBeforeState] = useState<StoreState | null>(null);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    error?: string;
    changedKeys: string[];
    timestamp: string;
  } | null>(null);

  // Dynamic Parameter input values mapped by param name
  const [paramInputs, setParamInputs] = useState<Record<string, string>>({});
  const [showFullState, setShowFullState] = useState(false);

  // Sync paramInputs whenever action parameters change
  useEffect(() => {
    setParamInputs((prev) => {
      const next: Record<string, string> = { ...prev };
      if (action.parameters && action.parameters.length > 0) {
        action.parameters.forEach((p) => {
          if (!next[p.name]) {
            const sample = getSampleValueForType(p.type, p.name);
            next[p.name] =
              typeof sample === "object" ? JSON.stringify(sample, null, 2) : String(sample);
          }
        });
      } else {
        const targetField = fields.find((f) => f.id === action.targetFieldId);
        if (!next["payload"]) {
          const sample = getSampleValueForType(
            targetField?.type || "string",
            targetField?.name || "payload",
          );
          next["payload"] =
            typeof sample === "object" ? JSON.stringify(sample, null, 2) : String(sample);
        }
      }
      return next;
    });
  }, [action.parameters, action.targetFieldId, fields]);

  // Handle reset to initial defaults
  const handleResetDefaults = () => {
    const initial = getInitialState();
    setSandboxState(initial);
    setBeforeState(null);
    setLastResult(null);
    toast.info("Reset test state to initial defaults");
  };

  // Run the action mutation against sandboxState
  const handleRunTest = () => {
    try {
      const targetField = fields.find((f) => f.id === action.targetFieldId);

      // Parse payload
      let parsedPayload: any;
      if (action.parameters && action.parameters.length > 0) {
        const payloadObj: Record<string, any> = {};
        action.parameters.forEach((p) => {
          const raw = paramInputs[p.name] ?? "";
          if (p.type === "number") {
            payloadObj[p.name] = Number(raw) || 0;
          } else if (p.type === "boolean") {
            payloadObj[p.name] = raw === "true" || raw === "1";
          } else if (isComplexType(p.type)) {
            try {
              payloadObj[p.name] = JSON.parse(raw);
            } catch {
              payloadObj[p.name] = raw;
            }
          } else {
            payloadObj[p.name] = raw;
          }
        });
        parsedPayload = payloadObj;
      } else {
        const raw = paramInputs["payload"] ?? "";
        try {
          parsedPayload = JSON.parse(raw);
        } catch {
          parsedPayload = raw;
        }
      }

      const manipulator: StateManipulator = {
        id: action.id,
        name: action.name || "action",
        label: `${action.name || "action"}()`,
        category: action.actionType === "custom" ? "custom_action" : "standard_action",
        targetFieldId: action.targetFieldId,
        targetFieldName: targetField?.name,
        parameters: action.parameters,
        code: action.code,
        actionType: action.actionType,
      };

      const prevState = { ...sandboxState };
      const res = applyManipulator({
        manipulator,
        payload: parsedPayload,
        currentState: prevState,
        fields,
      });

      if (res.error) {
        setLastResult({
          success: false,
          error: res.error,
          changedKeys: [],
          timestamp: new Date().toLocaleTimeString(),
        });
        toast.error(`Execution error: ${res.error}`);
        return;
      }

      // Compute changed keys
      const changedKeys = fields
        .map((f) => f.name)
        .filter((k) => JSON.stringify(prevState[k]) !== JSON.stringify(res.newState[k]));

      setBeforeState(prevState);
      setSandboxState(res.newState);
      setLastResult({
        success: true,
        changedKeys,
        timestamp: new Date().toLocaleTimeString(),
      });

      if (changedKeys.length > 0) {
        toast.success(`Produced state change: updated ${changedKeys.join(", ")}`);
      } else {
        toast.info("Action executed successfully (no state fields changed)");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLastResult({
        success: false,
        error: msg,
        changedKeys: [],
        timestamp: new Date().toLocaleTimeString(),
      });
      toast.error(`Error running action: ${msg}`);
    }
  };

  const hasParameters = action.parameters && action.parameters.length > 0;
  const isNoInputNeeded =
    !hasParameters &&
    (action.actionType === "toggle" || action.actionType === "reset");

  return (
    <div
      className={cn(
        "rounded-md border border-emerald-500/30 bg-background/80 overflow-hidden text-xs space-y-3 p-3 shadow-xs",
        className,
      )}
    >
      {/* ---------------- TEST HEADER ---------------- */}
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="text-[9px] uppercase tracking-wider font-semibold border-emerald-500/40 text-emerald-500 bg-emerald-500/10 px-1.5 py-0"
          >
            Zone 3: Test
          </Badge>
          <div className="flex items-center gap-1 font-semibold text-foreground text-[11px]">
            <FlaskConical size={12} className="text-emerald-500" />
            <span>Test Action &amp; State Change</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetDefaults}
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
            title="Reset sandbox state back to default field values"
          >
            <RotateCcw size={10} />
            <span>Reset State</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleRunTest}
            className="h-6 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1 cursor-pointer shadow-xs"
          >
            <Play size={11} className="fill-white" />
            <span>Run Action</span>
          </Button>
        </div>
      </div>

      {/* ---------------- 1. INPUT ARGUMENTS ---------------- */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Layers size={11} className="text-indigo-400" />
            <span>Defined Inputs</span>
          </Label>
          <span className="font-mono text-[9px] text-muted-foreground">
            {hasParameters
              ? `${action.parameters?.length} parameter${action.parameters?.length === 1 ? "" : "s"}`
              : isNoInputNeeded
              ? "0 inputs ()"
              : "single payload"}
          </span>
        </div>

        {hasParameters ? (
          <div className="space-y-2">
            {action.parameters?.map((param) => {
              const complex = isComplexType(param.type);
              const val = paramInputs[param.name] ?? "";

              return (
                <div
                  key={param.id}
                  className="p-2 rounded bg-muted/30 border border-border/50 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-medium text-foreground flex items-center gap-1.5">
                      <code>{param.name}</code>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[8px] px-1 py-0 font-mono",
                          complex
                            ? "text-indigo-400 border-indigo-500/30 bg-indigo-500/10"
                            : "text-muted-foreground",
                        )}
                      >
                        {param.type}
                      </Badge>
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        const sample = getSampleValueForType(param.type, param.name);
                        setParamInputs((prev) => ({
                          ...prev,
                          [param.name]:
                            typeof sample === "object"
                              ? JSON.stringify(sample, null, 2)
                              : String(sample),
                        }));
                      }}
                      className="text-[9px] text-emerald-400 hover:text-emerald-300 font-mono cursor-pointer"
                      title="Load realistic sample data for this type"
                    >
                      Sample {param.type}
                    </button>
                  </div>

                  {complex ? (
                    <LocalTextarea
                      value={val}
                      onChange={(e) =>
                        setParamInputs((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      debounceMs={100}
                      placeholder={`Enter ${param.type} JSON object...`}
                      className="min-h-[65px] font-mono text-[10px] bg-background resize-y p-2 leading-relaxed border-border/70"
                    />
                  ) : param.type === "boolean" ? (
                    <Select
                      value={val || "true"}
                      onValueChange={(nextVal) =>
                        setParamInputs((prev) => ({ ...prev, [param.name]: nextVal }))
                      }
                    >
                      <SelectTrigger className="h-6 text-[11px] font-mono bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">true</SelectItem>
                        <SelectItem value="false">false</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <LocalInput
                      value={val}
                      type={param.type === "number" ? "number" : "text"}
                      onChange={(e) =>
                        setParamInputs((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      debounceMs={100}
                      placeholder={`Enter ${param.type}...`}
                      className="h-6 text-[11px] font-mono bg-background"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : isNoInputNeeded ? (
          <div className="p-2 rounded bg-muted/20 border border-border/40 text-[10px] text-muted-foreground italic flex items-center justify-between">
            <span>Action takes no arguments (invoked as <code>{action.name}()</code>).</span>
          </div>
        ) : (
          <div className="space-y-1">
            <LocalInput
              value={paramInputs["payload"] ?? ""}
              onChange={(e) =>
                setParamInputs((prev) => ({ ...prev, payload: e.target.value }))
              }
              debounceMs={100}
              placeholder='Enter payload (string, number, or JSON object)...'
              className="h-7 text-xs font-mono bg-background"
            />
          </div>
        )}
      </div>

      {/* ---------------- 2. EXECUTION ERROR BANNER (IF ANY) ---------------- */}
      {lastResult?.error && (
        <div className="p-2 rounded-md bg-destructive/15 border border-destructive/40 text-destructive text-[11px] space-y-1">
          <div className="flex items-center gap-1 font-semibold">
            <AlertCircle size={13} />
            <span>Execution Failed</span>
          </div>
          <div className="p-1.5 rounded bg-black/40 font-mono text-[10px] text-destructive leading-tight break-all">
            {lastResult.error}
          </div>
        </div>
      )}

      {/* ---------------- 3. OUTPUT: PRODUCED STATE CHANGE ---------------- */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <span>Produced State Output</span>
          </Label>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground font-mono">
              {lastResult ? (
                lastResult.changedKeys.length > 0 ? (
                  <span className="text-emerald-400 font-semibold">
                    {lastResult.changedKeys.length} field{lastResult.changedKeys.length === 1 ? "" : "s"} mutated
                  </span>
                ) : (
                  <span className="text-muted-foreground">0 fields changed</span>
                )
              ) : (
                "Ready to run"
              )}
            </span>
            <button
              type="button"
              onClick={() => setShowFullState(!showFullState)}
              className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 cursor-pointer ml-1"
            >
              <span>{showFullState ? "Diff Only" : "Full Output State"}</span>
              {showFullState ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          </div>
        </div>

        {/* Mutation Diff Card */}
        {beforeState && lastResult?.success ? (
          <div className="space-y-1.5">
            {lastResult.changedKeys.length > 0 ? (
              <div className="space-y-1">
                {lastResult.changedKeys.map((key) => {
                  const beforeVal = beforeState[key];
                  const afterVal = sandboxState[key];
                  return (
                    <div
                      key={key}
                      className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono flex flex-col gap-1 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-emerald-300 flex items-center gap-1">
                          <CornerDownRight size={11} />
                          {key}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[8px] px-1 py-0 border-emerald-500/40 text-emerald-300 font-mono"
                        >
                          MUTATED
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-emerald-500/20 text-[10px]">
                        <div className="bg-black/30 p-1.5 rounded border border-border/30 overflow-hidden">
                          <span className="text-[8px] uppercase tracking-wider text-muted-foreground/70 block mb-0.5 font-sans">
                            Before:
                          </span>
                          <pre className="text-muted-foreground/80 overflow-x-auto whitespace-pre-wrap break-all scrollbar-none max-h-24">
                            {JSON.stringify(beforeVal, null, 2)}
                          </pre>
                        </div>
                        <div className="bg-emerald-950/40 p-1.5 rounded border border-emerald-500/30 overflow-hidden">
                          <span className="text-[8px] uppercase tracking-wider text-emerald-400/80 block mb-0.5 font-sans font-semibold">
                            After (Produced Output):
                          </span>
                          <pre className="text-emerald-200 font-semibold overflow-x-auto whitespace-pre-wrap break-all scrollbar-none max-h-24">
                            {JSON.stringify(afterVal, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-2.5 rounded bg-muted/30 border border-border/40 text-center text-muted-foreground text-[10px]">
                Action executed successfully, but no store fields were changed.
              </div>
            )}
          </div>
        ) : (
          /* Initial output preview before run */
          <div className="p-2 rounded bg-muted/20 border border-border/40 text-[10px] font-mono text-muted-foreground space-y-1">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 block font-sans">
              Current Store State (Click &quot;Run Action&quot; to execute &amp; see output):
            </span>
            <div className="max-h-28 overflow-y-auto space-y-0.5 scrollbar-thin">
              {fields.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-[10px]">
                  <span className="text-foreground/80 font-medium">{f.name}:</span>
                  <span className="text-muted-foreground truncate max-w-[180px]">
                    {JSON.stringify(sandboxState[f.name])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full Output State View */}
        {showFullState && (
          <div className="mt-1.5 p-2 rounded bg-black/50 font-mono text-[10px] text-emerald-300 overflow-x-auto border border-border/40 max-h-36 scrollbar-thin">
            <pre>{JSON.stringify(sandboxState, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
