import React from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Brain,
  Trash,
  Wrench,
  Code2,
  Database,
  GitBranch,
  Shuffle,
} from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { LocalInput } from "../../common";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  STEP_TYPE_LLM_CALL,
  STEP_TYPE_TOOL_NODE,
  STEP_TYPE_CUSTOM_CODE,
  STEP_TYPE_TRANSFORMER,
  STEP_TYPE_VECTOR_SEARCH,
  STEP_TYPE_ROUTER,
} from "@workspace/canvas/constants";

const DEFAULT_STEP_LABEL = "Graph Step";

interface LangGraphStepHeaderProps {
  id: string;
  data: BackendNode["data"];
  stepType: string;
  isEditingName: boolean;
  setIsEditingName: (editing: boolean) => void;
  nameValue: string;
  setNameValue: (val: string) => void;
  onSaveName: (rawValue?: string) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export const LangGraphStepHeader: React.FC<LangGraphStepHeaderProps> = ({
  id,
  data,
  stepType,
  isEditingName,
  setIsEditingName,
  nameValue,
  setNameValue,
  onSaveName,
  onDelete,
}) => {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2 relative">
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!bg-emerald-400 !w-3 !h-3 !border-2 !border-background hover:!scale-125 transition-transform !-left-[7px]"
        style={{ top: "16px" }}
        title="Incoming connection"
      />
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <div
          className={cn(
            "p-1 rounded border shrink-0",
            stepType === STEP_TYPE_ROUTER
              ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          )}
        >
          {stepType === STEP_TYPE_LLM_CALL && <Brain className="w-3.5 h-3.5" />}
          {stepType === STEP_TYPE_TOOL_NODE && (
            <Wrench className="w-3.5 h-3.5" />
          )}
          {(stepType === STEP_TYPE_TRANSFORMER || stepType === STEP_TYPE_CUSTOM_CODE) && (
            <Shuffle className="w-3.5 h-3.5" />
          )}
          {stepType === STEP_TYPE_VECTOR_SEARCH && (
            <Database className="w-3.5 h-3.5" />
          )}
          {stepType === STEP_TYPE_ROUTER && (
            <GitBranch className="w-3.5 h-3.5" />
          )}
          {stepType !== STEP_TYPE_LLM_CALL &&
            stepType !== STEP_TYPE_TOOL_NODE &&
            stepType !== STEP_TYPE_TRANSFORMER &&
            stepType !== STEP_TYPE_CUSTOM_CODE &&
            stepType !== STEP_TYPE_VECTOR_SEARCH &&
            stepType !== STEP_TYPE_ROUTER && <Brain className="w-3.5 h-3.5" />}
        </div>

        {isEditingName ? (
          <div
            className="nodrag flex-1 min-w-0"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <LocalInput
              autoFocus
              placeholder="Enter step name..."
              className="h-6 text-xs bg-background p-1 font-semibold flex-1 nodrag"
              value={nameValue}
              debounceMs={0}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={(e) => onSaveName(e.currentTarget.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") onSaveName(e.currentTarget.value);
                if (e.key === "Escape") {
                  if (!data.label || data.label.trim() === "") {
                    useBackendCanvasStore.getState().deleteNode(id);
                    return;
                  }
                  setNameValue(data.label);
                  setIsEditingName(false);
                }
              }}
            />
          </div>
        ) : (
          <span
            className="font-bold text-xs truncate cursor-pointer hover:text-emerald-400 transition-colors flex-1 min-w-0 nodrag"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingName(true);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditingName(true);
            }}
            title="Click or double click to rename step"
          >
            {data.label || "Step"}
          </span>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity nodrag"
        onClick={onDelete}
        title="Delete step node"
      >
        <Trash className="w-3 h-3" />
      </Button>
    </div>
  );
};
