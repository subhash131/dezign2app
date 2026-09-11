import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Zap, ChevronDown, ChevronUp, AlertTriangle, AlertCircle } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EndpointList } from "../../common";
import { useNodePipelineError } from "@/lib/utils/pipelineValidation";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Input } from "@workspace/ui/components/input";

export const ServerlessNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const hasPipelineError = useNodePipelineError(id);

  return (
    <div
      className={cn(
        "shadow-md rounded-xl bg-card border-2 min-w-[280px] max-w-[380px] flex flex-col transition-all duration-300 relative",
        hasPipelineError
          ? cn(
              "border-destructive/80 ring-1 ring-destructive/30 shadow-destructive/5",
              selected && "ring-2 ring-destructive/60 border-destructive",
            )
          : selected
          ? "border-primary"
          : "border-border",
      )}
    >
      <NodeHeader
        id={id}
        data={data}
        icon={Zap}
        title="Serverless Function"
        colorClass="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
        selected={selected}
        badges={
          hasPipelineError ? (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 text-[9px] font-semibold shrink-0"
              title="Pipeline has unmapped required inputs! Check endpoints."
            >
              <AlertTriangle size={10} className="shrink-0" />
              <span>Pipeline Error</span>
            </div>
          ) : undefined
        }
      />

      {/* Pipeline unmapped error banner */}
      {hasPipelineError && (
        <div className="px-3 py-1.5 bg-destructive/10 border-b border-destructive/25 flex items-center gap-1.5 text-[10px] text-destructive font-medium leading-tight nodrag">
          <AlertCircle size={12} className="shrink-0 text-destructive animate-pulse" />
          <span>Required pipeline field(s) not mapped</span>
        </div>
      )}

      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) =>
            updateNode(id, { data: { ...data, description: e.target.value } })
          }
        />
      </div>

      {/* Trigger type badge */}
      <div className="px-3 py-2 border-b nodrag flex items-center gap-2">
        <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider shrink-0">
          Trigger
        </Label>
        <Select
          value={data.triggerType || "HTTP"}
          onValueChange={(v) =>
            updateNode(id, {
              data: { ...data, triggerType: v as typeof data.triggerType },
            })
          }
        >
          <SelectTrigger className="h-6 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="HTTP" className="text-xs">
              HTTP
            </SelectItem>
            <SelectItem value="Event" className="text-xs">
              Event
            </SelectItem>
            <SelectItem value="CRON" className="text-xs">
              CRON
            </SelectItem>
            <SelectItem value="Queue" className="text-xs">
              Queue
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Endpoints */}
      <EndpointList nodeId={id} title="Endpoints / Functions" />

      {/* Advanced */}
      <div className="p-3 bg-secondary/10 flex flex-col gap-3 rounded-b-xl">
        <div
          className="flex items-center justify-between cursor-pointer group"
          onClick={() => setAdvancedOpen(!advancedOpen)}
        >
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
            Advanced
          </span>
          <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground group-hover:text-foreground transition-all">
            {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>
        {advancedOpen && (
          <div className="flex flex-col gap-2.5 pt-2 border-t border-border/50 nodrag">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">
                Runtime
              </Label>
              <Input
                className="h-6 text-xs w-[160px] bg-background"
                placeholder="nodejs20.x"
                value={data.runtime || ""}
                onChange={(e) =>
                  updateNode(id, { data: { ...data, runtime: e.target.value } })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">
                Memory (MB)
              </Label>
              <Input
                type="number"
                className="h-6 text-xs w-20 text-right bg-background"
                placeholder="128"
                value={data.memoryMb ?? ""}
                onChange={(e) =>
                  updateNode(id, {
                    data: {
                      ...data,
                      memoryMb: parseInt(e.target.value) || undefined,
                    },
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs shrink-0 text-muted-foreground">
                Timeout (sec)
              </Label>
              <Input
                type="number"
                className="h-6 text-xs w-20 text-right bg-background"
                placeholder="30"
                value={data.timeoutSec ?? ""}
                onChange={(e) =>
                  updateNode(id, {
                    data: {
                      ...data,
                      timeoutSec: parseInt(e.target.value) || undefined,
                    },
                  })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
