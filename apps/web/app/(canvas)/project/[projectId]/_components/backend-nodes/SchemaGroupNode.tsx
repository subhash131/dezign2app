import React, { useState, useRef, useEffect } from "react";
import { NodeProps, NodeResizer } from "@xyflow/react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

export const SchemaGroupNode = ({ id, data, selected, width, height }: NodeProps<BackendNode>) => {
  const addTableNode = useBackendCanvasStore(s => s.addTableNode);
  const updateNode = useBackendCanvasStore(s => s.updateNode);
  const deleteNode = useBackendCanvasStore(s => s.deleteNode);
  const setNodesPendingDeletion = useBackendCanvasStore(s => s.setNodesPendingDeletion);
  const nodes = useBackendCanvasStore(s => s.nodes);

  const [isEditing, setIsEditing] = useState(data.label === "");
  const [editValue, setEditValue] = useState(data.label);
  const [isError, setIsError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleRename = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue === "") {
      const hasChildren = nodes.some(n => n.parentId === id);
      if (!hasChildren) {
        deleteNode(id);
      } else {
        setIsError(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return;
    }
    
    if (trimmedValue !== data.label) {
      const isDuplicate = nodes.some(n => n.type === "group" && n.id !== id && n.data.label === trimmedValue);
      if (isDuplicate) {
        setIsError(true);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      
      updateNode(id, {
        data: {
          ...data,
          label: trimmedValue
        }
      });
      setEditValue(trimmedValue);
    }
    
    setIsError(false);
    setIsEditing(false);
  };

  const handleAddTable = () => {
    addTableNode(id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const hasChildren = nodes.some(n => n.parentId === id);
    if (hasChildren || data.label) {
      const node = nodes.find(n => n.id === id);
      if (node) setNodesPendingDeletion([node]);
    } else {
      deleteNode(id);
    }
  };

  return (
    <>

      <div 
        className={cn(
          "bg-secondary/10 border-2 rounded-xl backdrop-blur-sm relative pointer-events-auto group",
          selected ? "border-primary border-dashed" : "border-border border-dashed"
        )}
        style={{ 
          width: "100%", 
          height: "100%"
        }}
      >
        <div 
          className="absolute top-0 left-0 bg-secondary/80 px-4 py-1.5 rounded-br-lg rounded-tl-lg border-r-2 border-b-2 border-border font-semibold text-sm cursor-text"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
            setEditValue(data.label);
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              value={editValue}
              placeholder="Group Name"
              onChange={(e) => {
                setEditValue(e.target.value);
                if (isError) setIsError(false);
              }}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleRename();
                } else if (e.key === "Escape") {
                  if (data.label === "" && !nodes.some(n => n.parentId === id)) {
                    deleteNode(id);
                  } else {
                    setEditValue(data.label);
                    setIsError(false);
                    setIsEditing(false);
                  }
                }
              }}
              className={cn("bg-transparent border-none outline-none p-0 m-0 w-32 focus:ring-0 text-sm font-semibold placeholder:text-muted-foreground/50", isError && "text-red-500")}
            />
          ) : (
            data.label
          )}
        </div>
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="secondary" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleAddTable}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <NodeResizer 
        color="#3b82f6" 
        isVisible={selected} 
        minWidth={450} 
        minHeight={300} 
      />
    </>
  );
};
