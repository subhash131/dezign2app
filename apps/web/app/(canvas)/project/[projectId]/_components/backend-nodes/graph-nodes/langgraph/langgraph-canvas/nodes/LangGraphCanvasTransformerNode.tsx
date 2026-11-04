import React, { useState, useEffect } from "react";
import { NodeProps, Handle, Position, useReactFlow } from "@xyflow/react";
import {
  Shuffle,
  Trash,
  Code2,
  Package,
} from "lucide-react";
import type {
  TransformerCanvasNode,
  LangGraphCanvasNode,
} from "@workspace/canvas";
import {
  LANGGRAPH_CANVAS_NODE_TRANSFORMER,
  HANDLE_TRANSFORMER_OUT,
} from "../constants";
import { LocalInput } from "../../../common";
import { toVarName } from "@/lib/compiler/utils";

export const LangGraphCanvasTransformerNode = ({
  id,
  data,
  selected,
}: NodeProps<TransformerCanvasNode>) => {
  const { setNodes, setEdges } = useReactFlow<LangGraphCanvasNode>();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(
    data.label || data.functionName || "Transformer",
  );

  useEffect(() => {
    setNameValue(data.label || data.functionName || "Transformer");
  }, [data.label, data.functionName]);

  const updateTransformerData = (changes: Partial<typeof data>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id && n.type === LANGGRAPH_CANVAS_NODE_TRANSFORMER
          ? { ...n, data: { ...n.data, ...changes } }
          : n,
      ),
    );
  };

  const handleNameSave = () => {
    setIsEditingName(false);
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameValue(toVarName(data.label || data.functionName || "") || "transformer");
      return;
    }
    const formatted = toVarName(trimmed);
    setNameValue(formatted);
    if (formatted !== data.label || formatted !== data.functionName) {
      updateTransformerData({
        label: formatted,
        functionName: formatted,
      });
    }
  };

  const handleDelete = () => {
    if (data.onDeleteTransformer) {
      data.onDeleteTransformer();
    } else {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    }
  };

  const scope = data.scope || "global";
  const codeBody = data.code || "";

  return (
    <div
      className={`rounded-xl bg-card border-2 min-w-[240px] max-w-[320px] flex flex-col transition-all duration-200 shadow-md relative group ${
        selected
          ? "border-purple-500 ring-2 ring-purple-500/20 shadow-purple-500/10"
          : "border-border hover:border-purple-500/40 hover:shadow-purple-500/5"
      }`}
    >
      <Handle
        type="source"
        position={Position.Right}
        id={HANDLE_TRANSFORMER_OUT}
        className="!bg-purple-500 !w-3.5 !h-3.5 !border-2 !border-background hover:!scale-125 transition-transform !-right-[7px] z-10"
        title="Connect to Agent Node or Step (transformer_in)"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border/50 bg-purple-500/10 text-purple-700 dark:text-purple-400 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-1.5 rounded-lg border border-purple-500/30 bg-purple-500/15 text-purple-500 shrink-0">
            <Shuffle className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            {isEditingName ? (
              <div
                className="nodrag nokey nowheel nopan"
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <LocalInput
                  autoFocus
                  className="h-6 text-xs bg-background p-1 font-bold font-mono text-purple-400 flex-1 nodrag nokey nowheel nopan"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" || e.key === "Delete") {
                      e.stopPropagation();
                      e.nativeEvent?.stopImmediatePropagation?.();
                    }
                    if (e.key === "Enter") handleNameSave();
                    if (e.key === "Escape") {
                      setNameValue(data.label || "Transformer");
                      setIsEditingName(false);
                    }
                  }}
                />
              </div>
            ) : (
              <span
                className="font-bold text-sm text-foreground truncate max-w-[130px] font-mono cursor-pointer hover:text-purple-400 transition-colors nodrag flex items-center gap-1 group/title"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingName(true);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setIsEditingName(true);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                title="Click to rename transformer"
              >
                <span className="truncate">{data.label || data.functionName || "Transformer"}</span>
              </span>
            )}
            <span className="text-[9px] font-mono text-muted-foreground truncate opacity-70">
              Transformer Node
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded font-semibold ${
              scope === "global"
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                : "bg-sky-500/15 text-sky-400 border border-sky-500/25"
            }`}
          >
            {scope}
          </span>
          <button
            type="button"
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all opacity-0 group-hover:opacity-100 nodrag cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            title="Delete Transformer Node"
          >
            <Trash className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body preview */}
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1 font-mono">
            <Code2 className="w-3 h-3 text-purple-400" />
            TypeScript Logic
          </span>
          {data.inputSchema && data.inputSchema.length > 0 && (
            <span className="text-[9px] font-mono text-muted-foreground">
              {data.inputSchema.length} inputs
            </span>
          )}
        </div>
        <div className="px-2 py-1.5 rounded-md bg-secondary/30 border border-border/40 font-mono text-[10px] text-muted-foreground truncate leading-relaxed">
          {codeBody.trim() ? (
            codeBody.slice(0, 48).replace(/[\r\n]+/g, " ") + "..."
          ) : (
            "(inputs, state, clone) => transformed"
          )}
        </div>
      </div>
    </div>
  );
};
