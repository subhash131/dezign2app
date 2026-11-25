import React from "react";
import { Bot, Sparkles, Trash } from "lucide-react";
import { LocalInput } from "../../../../common";

interface NodeHeaderProps {
  isEditingName: boolean;
  setIsEditingName: (editing: boolean) => void;
  nameValue: string;
  setNameValue: (val: string) => void;
  handleNameSave: () => void;
  dataName?: string;
  isExpanded?: boolean;
  toggleExpand?: () => void;
  handleDelete: () => void;
}

export const NodeHeader: React.FC<NodeHeaderProps> = ({
  isEditingName,
  setIsEditingName,
  nameValue,
  setNameValue,
  handleNameSave,
  dataName,
  handleDelete,
}) => {
  return (
    <div className="flex items-center justify-between gap-2 p-3 border-b border-border/50 bg-sky-500/10 text-sky-700 dark:text-sky-400 rounded-t-xl">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="p-1 rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-500 shrink-0">
          <Bot className="w-4 h-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          {isEditingName ? (
            <div
              className="nodrag nokey nowheel nopan"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              onDoubleClick={(e: React.MouseEvent) => e.stopPropagation()}
              onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
              onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <LocalInput
                autoFocus
                className="h-6 text-xs bg-background p-1 font-bold font-mono text-sky-500 flex-1 nodrag nokey nowheel nopan"
                value={nameValue}
                debounceMs={0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNameValue(e.target.value)
                }
                onBlur={handleNameSave}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Backspace" || e.key === "Delete") {
                    e.stopPropagation();
                    e.nativeEvent?.stopImmediatePropagation?.();
                  }
                  if (e.key === "Enter") handleNameSave();
                  if (e.key === "Escape") {
                    setNameValue(dataName || "Node");
                    setIsEditingName(false);
                  }
                }}
              />
            </div>
          ) : (
            <span
              className="font-bold text-base text-foreground truncate max-w-[170px] font-mono cursor-pointer hover:text-sky-500 transition-colors nodrag flex items-center gap-1 group/title"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setIsEditingName(true);
              }}
              title="Click to edit Node name"
            >
              {dataName || "Node"}
            </span>
          )}
          <span className="text-[10px] text-sky-500 font-mono font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            LangGraph Node
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0 nodrag"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            handleDelete();
          }}
          title="Delete Node"
        >
          <Trash className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
