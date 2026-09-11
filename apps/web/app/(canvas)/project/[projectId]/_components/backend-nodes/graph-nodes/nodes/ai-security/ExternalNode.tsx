import React, { useState } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import {
  Globe,
  Settings,
  AlertCircle,
  Play,
  Key,
  Code2,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  NodeHeader,
  useSimulationNodeState,
  getSimulationNodeBorderClass,
  LocalInput,
  LocalTextarea,
} from "../../common";
import { ExternalEnvVarsDrawer } from "./ExternalEnvVarsDrawer";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  PATCH: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  DELETE: "bg-destructive/15 text-destructive border-destructive/30",
};

export const ExternalNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const hasPipelineError = useNodePipelineError(id);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );

  const simulation = useSimulationNodeState(id);
  const borderClass = getSimulationNodeBorderClass(
    simulation,
    Boolean(selected),
    "border-border",
  );

  const [configOpen, setConfigOpen] = useState(false);

  const method = (data.method || "POST").toUpperCase();
  const effectiveUrl = data.url || data.baseUrl || "";
  const isUrlMissing = !effectiveUrl.trim();

  const inputVariables = data.inputVariables || [];
  const headerCount = (data.headers || []).filter((h) => h.enabled !== false).length;
  const queryParamCount = (data.queryParams || []).filter((q) => q.enabled !== false).length;
  const hasBody = ["POST", "PUT", "PATCH"].includes(method) && data.bodyType !== "none";
  const authType = data.authType || "none";
  const lastTest = data.lastTestResult;

  const handleOpenConfig = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveConfigItem({
      type: "external",
      id,
      nodeId: id,
    });
  };

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[320px] max-w-[420px] flex flex-col transition-all duration-300 relative",
        borderClass,
        isUrlMissing && !selected && "border-destructive/60",
        hasPipelineError &&
          "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
      )}
      onDoubleClick={handleOpenConfig}
    >
      {/* Target input handle for dynamic calling */}
      <Handle
        type="target"
        position={Position.Left}
        id="input-vars-in"
        className="w-3 h-3 !bg-primary border-2 border-background -left-1.5"
        style={{ top: "42px" }}
        title="Input variables source -> Connect pipeline or service to invoke this tool"
      />

      {/* Target input handle (alias for backwards compatibility) */}
      <Handle
        type="target"
        position={Position.Left}
        id="external-in"
        className="w-2 h-2 !bg-primary/50 border-2 border-background -left-1 opacity-0 pointer-events-none"
        style={{ top: "42px" }}
      />

      {/* Source output handle for response */}
      <Handle
        type="source"
        position={Position.Right}
        id="external-out"
        className="w-3 h-3 !bg-primary border-2 border-background -right-1.5"
        style={{ top: "42px" }}
        title="External API response output"
      />

      {/* Node Header */}
      <NodeHeader
        id={id}
        data={{
          ...data,
          label: data.label || data.functionName || "",
        }}
        nodeType="external"
        icon={Globe}
        title="External API"
        colorClass="bg-secondary/40 text-foreground"
        selected={selected}
        badges={
          hasPipelineError ? (
            <span className="text-[7px] font-medium px-1 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 flex items-center gap-0.5 shrink-0 animate-pulse">
              <AlertCircle size={8} />
              Unmapped
            </span>
          ) : undefined
        }
        rightElement={
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border uppercase",
                METHOD_COLORS[method] || METHOD_COLORS.POST,
              )}
            >
              {method}
            </span>
            <button
              onClick={handleOpenConfig}
              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center text-[10px]"
              title="Configure API Call & Test Runner"
            >
              <Settings size={13} />
            </button>
          </div>
        }
      />

      {hasPipelineError && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 border-b border-destructive/20 text-[11px] text-destructive leading-tight">
          <AlertCircle size={12} className="shrink-0" />
          <span className="font-medium">Missing required input mapping or base URL</span>
        </div>
      )}

      {/* Description */}
      <div className="px-3 py-1.5 bg-secondary/5 border-b nodrag">
        <LocalTextarea
          className="min-h-[18px] text-xs bg-transparent border-none shadow-none p-0.5 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="Describe what this API tool does..."
          value={data.description || ""}
          onBlur={(e) =>
            updateNode(id, { data: { ...data, description: e.target.value } })
          }
        />
      </div>

      {/* Section 1: Dynamic Input Variables (at top) */}
      <div className="px-3 py-2 border-b bg-muted/10">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Code2 size={11} className="text-muted-foreground" />
            Dynamic Inputs ({inputVariables.length})
          </span>
          <button
            onClick={handleOpenConfig}
            className="text-[9px] font-medium text-foreground hover:underline cursor-pointer"
          >
            + Edit Vars
          </button>
        </div>

        {inputVariables.length === 0 ? (
          <div
            onClick={handleOpenConfig}
            className="text-[11px] text-muted-foreground/70 italic bg-background/50 border border-dashed border-border/60 rounded px-2 py-1.5 cursor-pointer hover:border-foreground/30 transition-colors"
          >
            No dynamic variables defined (static call). Click to add inputs like <code className="font-mono text-[10px]">userId</code>, <code className="font-mono text-[10px]">amount</code>.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
            {inputVariables.map((v) => (
              <span
                key={v.id}
                className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border shadow-xs"
                title={v.description || `${v.name}: ${v.type}${v.required ? " (required)" : ""}`}
              >
                <span className="font-semibold text-foreground">{v.name}</span>
                <span className="text-muted-foreground text-[9px]">:{v.type}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Request URL & Method preview */}
      <div
        className={cn(
          "px-3 py-2 border-b nodrag flex flex-col gap-1 transition-colors",
          isUrlMissing ? "bg-destructive/10 border-destructive/30" : "bg-card",
        )}
      >
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Target Endpoint</span>
          {isUrlMissing && (
            <span className="text-[9px] font-bold text-destructive flex items-center gap-1">
              <AlertCircle size={10} /> URL Required
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <LocalInput
            placeholder="https://api.example.com/v1/resource/{{id}}"
            className={cn(
              "h-7 text-xs bg-muted/40 font-mono flex-1 border border-border/60",
              isUrlMissing && "border-destructive text-destructive placeholder:text-destructive/60",
            )}
            value={effectiveUrl}
            onBlur={(e) => {
              const val = e.target.value;
              updateNode(id, {
                data: {
                  ...data,
                  url: val,
                  baseUrl: val,
                },
              });
            }}
          />
        </div>
      </div>

      {/* Badges / Tool Info Bar */}
      <div className="px-3 py-1.5 bg-muted/30 border-b flex items-center justify-between gap-1 text-[10px] flex-wrap">
        <div className="flex items-center gap-1.5">
          {authType !== "none" ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[9px] border border-border">
              <Key size={9} /> {authType}
            </span>
          ) : (
            <span className="text-muted-foreground text-[9px] font-mono">No auth</span>
          )}

          {headerCount > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px]">
              {headerCount} hdr{headerCount !== 1 ? "s" : ""}
            </span>
          )}

          {queryParamCount > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px]">
              {queryParamCount} param{queryParamCount !== 1 ? "s" : ""}
            </span>
          )}

          {hasBody && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[9px]">
              JSON Body
            </span>
          )}
        </div>

        {/* Test status indicator */}
        {lastTest && (
          <div className="flex items-center gap-1 text-[9px] font-mono">
            {lastTest.status && lastTest.status >= 200 && lastTest.status < 300 ? (
              <span className="text-foreground font-medium flex items-center gap-0.5">
                <CheckCircle2 size={10} className="text-primary" /> {lastTest.status}
              </span>
            ) : lastTest.status ? (
              <span className="text-destructive flex items-center gap-0.5">
                <XCircle size={10} /> {lastTest.status}
              </span>
            ) : (
              <span className="text-muted-foreground">Tested</span>
            )}
            {lastTest.timeMs !== undefined && (
              <span className="text-muted-foreground flex items-center gap-0.5">
                <Clock size={9} /> {lastTest.timeMs}ms
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quick Test & Open Studio Button */}
      <div className="px-3 py-2 bg-secondary/10 flex items-center justify-between border-b">
        <button
          onClick={handleOpenConfig}
          className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs shadow-xs transition-colors cursor-pointer"
        >
          <Play size={11} className="fill-current" />
          Test & Configure Call
        </button>
      </div>

      {/* Environment Variables Section */}
      <ExternalEnvVarsDrawer nodeId={id} />

      {/* Collapsible Connection Drawer (Rate limit, Timeout, Docs) */}
      <div className="p-2.5 bg-secondary/10 flex flex-col gap-2 rounded-b-xl border-t border-border/50">
        <div
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => setConfigOpen(!configOpen)}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
            Advanced Settings
          </span>
          <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground group-hover:text-foreground transition-all">
            <ChevronDown
              size={13}
              className={cn(
                "transition-transform duration-300 ease-in-out",
                configOpen && "rotate-180",
              )}
            />
          </div>
        </div>

        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
            configOpen
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2 pt-1 border-t border-border/50 nodrag text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Rate Limit:</span>
                <LocalInput
                  className="h-6 text-xs w-24 text-right bg-background"
                  placeholder="100/m"
                  value={data.rateLimit || ""}
                  onBlur={(e) =>
                    updateNode(id, {
                      data: { ...data, rateLimit: e.target.value },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Timeout (s):</span>
                <LocalInput
                  className="h-6 text-xs w-24 text-right bg-background"
                  placeholder="30"
                  value={data.timeout !== undefined ? String(data.timeout) : ""}
                  onBlur={(e) =>
                    updateNode(id, {
                      data: { ...data, timeout: e.target.value },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
