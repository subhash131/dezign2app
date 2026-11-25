import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plus, Trash } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { BackendNode } from "@/types/canvas";
import { generateId } from "./utils";
import { LocalInput } from "./LocalInput";

export interface BaseItem {
  id: string;
  name: string;
}

export interface EditableNodeListProps<T extends BaseItem> {
  nodeId: string;
  title: string;
  items?: T[];
  field: string;
  handleType?: "source" | "target";
  handlePosition?: "left" | "right" | "top" | "bottom";
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
}

export const EditableNodeList = <T extends BaseItem>({
  nodeId,
  title,
  items = [],
  field,
  handleType,
  handlePosition,
  updateNode,
  data,
}: EditableNodeListProps<T>) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleAdd = () => {
    const newItems = [...items, { id: generateId(), name: "" }];
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
    setEditingId(newItems[newItems.length - 1]!.id);
    setEditingName("");
  };

  const handleUpdate = (id: string, name: string) => {
    const newItems = items.map((item) =>
      item.id === id ? { ...item, name } : item,
    );
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
  };

  const handleDelete = (id: string) => {
    const newItems = items.filter((item) => item.id !== id);
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
  };

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        {title}
        <div
          className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all"
          onClick={handleAdd}
        >
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((item) => {
          const isEditing = editingId === item.id;
          return (
            <div
              key={item.id}
              className="flex flex-col px-3 py-1.5 border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20"
            >
              {handleType && handlePosition && (
                <Handle
                  type={handleType}
                  position={handlePosition}
                  id={`${field}-${item.id}`}
                  className={cn(
                    CANVAS_HANDLE_CLASS,
                    "border-2 border-background transition-all hover:scale-125",
                    handlePosition === Position.Left ? CANVAS_HANDLE_LEFT_OFFSET_CLASS : CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
                  )}
                  style={{ top: "50%" }}
                />
              )}
              {isEditing ? (
                <LocalInput
                  value={editingName}
                  debounceMs={0}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="h-6 text-xs"
                  autoFocus
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") {
                      const val = e.currentTarget.value.trim();
                      if (!val) handleDelete(item.id);
                      else handleUpdate(item.id, val);
                      setEditingId(null);
                    }
                    if (e.key === "Escape") {
                      if (!item.name) handleDelete(item.id);
                      setEditingId(null);
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.currentTarget.value.trim();
                    if (!val) handleDelete(item.id);
                    else handleUpdate(item.id, val);
                    setEditingId(null);
                  }}
                />
              ) : (
                <div
                  className="flex items-center justify-between w-full cursor-pointer"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingName(item.name || "");
                  }}
                >
                  <span className="font-medium truncate">{item.name}</span>
                  <div
                    className="opacity-0 group-hover/row:opacity-100 flex items-center justify-center p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                  >
                    <Trash size={12} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};
