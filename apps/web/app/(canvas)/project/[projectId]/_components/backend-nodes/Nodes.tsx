import React, { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Server, Database, Container, Table2, User, Globe, Plus, Check, X, Trash2 } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { COLUMN_TYPES } from "@/lib/schema/columnTypes";
import { SchemaGroupNode } from "./SchemaGroupNode";

const ensureUniqueColumnNames = (columns: any[]) => {
  const seen = new Set<string>();
  const result = [];
  for (const col of columns) {
    if (!col.name) {
      result.push(col);
      continue;
    }
    let finalName = col.name;
    let count = 1;
    while (seen.has(finalName.toLowerCase())) {
      finalName = `${col.name}_${count}`;
      count++;
    }
    seen.add(finalName.toLowerCase());
    result.push({ ...col, name: finalName });
  }
  return result;
};

// Graph nodes (Service, Database, Queue, External, Actor) are now imported from GraphNodes.tsx

// --- Entity Node ---
export const EntityNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setNodesPendingDeletion = useBackendCanvasStore((s) => s.setNodesPendingDeletion);
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [editingColName, setEditingColName] = useState("");
  const [colNameError, setColNameError] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(data.label);
  const [isEditingName, setIsEditingName] = useState(data.label === "");
  const [nameError, setNameError] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const nodeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isEditingName) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isEditingName]);

  const columns = data.columns || [];
  const indexes = data.indexes || [];

  const addColumn = () => {
    updateNode(id, {
      data: {
        ...data,
        columns: [...columns, { name: "", type: "VARCHAR" }]
      }
    });
    setEditingCol(columns.length);
    setEditingColName("");
    setColNameError(false);
  };

  const updateColumn = (index: number, changes: any) => {
    const newCols = [...columns];
    newCols[index] = { ...newCols[index], ...changes };
    updateNode(id, { data: { ...data, columns: newCols } });
  };

  const addIndex = () => {
    updateNode(id, {
      data: {
        ...data,
        indexes: [...indexes, { name: "", columns: "" }]
      }
    });
    setEditingIndex(indexes.length);
  };

  const updateIndexObj = (idx: number, changes: any) => {
    const newIndexes = [...indexes];
    newIndexes[idx] = { ...newIndexes[idx], ...changes };
    updateNode(id, { data: { ...data, indexes: newIndexes } });
  };

  const saveName = (e?: React.FocusEvent | React.KeyboardEvent) => {
    let finalName = editingName.trim();
    if (!finalName) {
      if (!data.label) {
        const isBlur = e?.type === "blur";
        if (isBlur) {
          const relatedTarget = (e as React.FocusEvent).relatedTarget as Node | null;
          if (nodeRef.current?.contains(relatedTarget)) {
             const defaultName = "Untitled_Table";
             const latestNode = useBackendCanvasStore.getState().nodes.find(n => n.id === id);
             if (latestNode) {
                 updateNode(id, { data: { ...latestNode.data, label: defaultName } });
             }
             setEditingName(defaultName);
             setNameError(false);
             setIsEditingName(false);
             return;
          }
        }

        const latestNode = useBackendCanvasStore.getState().nodes.find(n => n.id === id);
        if (!latestNode) return;
        
        const latestCols = latestNode.data.columns || [];
        const latestIdxs = latestNode.data.indexes || [];
        
        const isEmpty = latestCols.length === 0 && latestIdxs.length === 0;
        const isInitial = latestCols.length === 1 && latestCols[0]?.name === "_id" && latestIdxs.length === 0;
        
        if (isEmpty || isInitial) {
          useBackendCanvasStore.getState().deleteNode(id);
        } else {
          const defaultName = "Untitled_Table";
          updateNode(id, { data: { ...latestNode.data, label: defaultName } });
          setEditingName(defaultName);
          setNameError(false);
          setIsEditingName(false);
        }
        return;
      }
      finalName = data.label; // revert to original valid name
      setEditingName(finalName);
      setNameError(false);
      setIsEditingName(false);
      return;
    }
    
    // Check global uniqueness for entities
    const allNodes = useBackendCanvasStore.getState().nodes;
    const exists = allNodes.some(n => n.id !== id && n.type === "entity" && n.data.label.toLowerCase() === finalName.toLowerCase());
    
    if (exists) {
      setNameError(true);
      if (e?.type === "blur") {
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return;
    }
    
    setNameError(false);
    const latestNode = useBackendCanvasStore.getState().nodes.find(n => n.id === id);
    if (latestNode) {
        updateNode(id, { data: { ...latestNode.data, label: finalName } });
    } else {
        updateNode(id, { data: { ...data, label: finalName } });
    }
    setEditingName(finalName);
    setIsEditingName(false);
  };

  return (
    <div 
      ref={nodeRef}
      tabIndex={-1}
      className={cn("shadow-md rounded-xl bg-card border-2 min-w-[250px] max-w-[350px] overflow-hidden focus:outline-none", selected ? "border-primary" : "border-border")}
    >
      <Handle type="target" position={Position.Top} className="w-2 h-2" />
      <div className="px-3 py-2 bg-secondary/80 border-b flex items-center justify-between group">
        <div className="flex items-center flex-1">
          <Table2 size={14} className="mr-2 text-muted-foreground shrink-0" />
          {isEditingName ? (
            <div className="flex flex-1 items-center gap-1">
              <Input 
                ref={inputRef}
                value={editingName} 
                onChange={(e) => {
                  setEditingName(e.target.value);
                  if (nameError) setNameError(false);
                }} 
                className={cn("h-6 text-xs px-1", nameError && "border-destructive focus-visible:ring-destructive")} 
                autoFocus 
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName(e);
                  if (e.key === "Escape") {
                    setEditingName(data.label);
                    setNameError(false);
                    setIsEditingName(false);
                  }
                }}
                onBlur={saveName}
              />
            </div>
          ) : (
            <span 
              className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors flex-1 truncate"
              onClick={() => setIsEditingName(true)}
            >
              {data.label}
            </span>
          )}
        </div>
        <div 
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all cursor-pointer ml-2 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            const cols = data.columns || [];
            const idxs = data.indexes || [];
            const isEmpty = cols.length === 0 && idxs.length === 0;
            const isInitial = cols.length === 1 && cols[0]?.name === "_id" && idxs.length === 0;
            
            if (!isEmpty && !isInitial) {
              const node = useBackendCanvasStore.getState().nodes.find(n => n.id === id);
              if (node) setNodesPendingDeletion([node]);
            } else {
              useBackendCanvasStore.getState().deleteNode(id);
            }
          }}
        >
          <Trash2 size={14} />
        </div>
      </div>
      
      <div className="flex flex-col">
        {columns.map((col, i) => {
          const isEditing = editingCol === i;
          return (
            <div key={i} className="flex flex-col px-3 py-1.5 border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20">
              <Handle type="source" position={Position.Right} id={`source-${i}`} className="w-2 h-2 -right-1" style={{ top: '50%' }} />
              <Handle type="target" position={Position.Left} id={`target-${i}`} className="w-2 h-2 -left-1" style={{ top: '50%' }} />
              
              {isEditing ? (
                <div className="flex items-center gap-2 w-full">
                  <Input 
                    value={editingColName} 
                    onChange={(e) => {
                      setEditingColName(e.target.value);
                      if (colNameError) setColNameError(false);
                    }} 
                    className={cn("h-6 text-xs w-24", colNameError && "border-destructive focus-visible:ring-destructive")}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const trimmedName = editingColName.trim();
                        let newCols = [...columns];
                        if (trimmedName === "") {
                          if (newCols[i]?.isPrimaryKey) {
                            newCols[i].name = "_id";
                            updateNode(id, { data: { ...data, columns: newCols } });
                          } else {
                            newCols.splice(i, 1);
                            updateNode(id, { data: { ...data, columns: newCols } });
                          }
                          setEditingCol(null);
                        } else {
                          const isDuplicate = newCols.some((c, idx) => idx !== i && c.name.toLowerCase() === trimmedName.toLowerCase());
                          if (isDuplicate) {
                            setColNameError(true);
                            return;
                          }
                          newCols[i]!.name = trimmedName;
                          newCols.splice(i + 1, 0, { name: "", type: "VARCHAR" });
                          updateNode(id, { data: { ...data, columns: newCols } });
                          setEditingCol(i + 1);
                          setEditingColName("");
                          setColNameError(false);
                        }
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={(e) => {
                      const related = e.relatedTarget as HTMLElement | null;
                      if (related?.closest('[role="combobox"]')) return;
                      if (related?.closest('[role="listbox"]')) return;
                      
                      const trimmedName = editingColName.trim();
                      let newCols = [...columns];
                      if (trimmedName === "") {
                        if (newCols[i]?.isPrimaryKey) {
                          newCols[i].name = "_id";
                          updateNode(id, { data: { ...data, columns: newCols } });
                          setEditingCol(null);
                        } else {
                          newCols.splice(i, 1);
                          updateNode(id, { data: { ...data, columns: newCols } });
                          setEditingCol(null);
                        }
                      } else {
                        const isDuplicate = newCols.some((c, idx) => idx !== i && c.name.toLowerCase() === trimmedName.toLowerCase());
                        if (isDuplicate) {
                          setColNameError(true);
                          setTimeout(() => e.target.focus(), 0);
                          return;
                        }
                        newCols[i]!.name = trimmedName;
                        updateNode(id, { data: { ...data, columns: newCols } });
                        setEditingCol(null);
                      }
                    }}
                  />
                  <Select 
                    value={col.type} 
                    onValueChange={(val) => {
                      const trimmedName = editingColName.trim();
                      let newCols = [...columns];
                      if (trimmedName === "") {
                        if (col.isPrimaryKey && newCols[i]) {
                          newCols[i].name = "_id";
                          newCols[i].type = val;
                        } else {
                          newCols.splice(i, 1);
                        }
                        updateNode(id, { data: { ...data, columns: newCols } });
                        setEditingCol(null);
                      } else {
                        const isDuplicate = newCols.some((c, idx) => idx !== i && c.name.toLowerCase() === trimmedName.toLowerCase());
                        if (isDuplicate) {
                          setColNameError(true);
                          newCols[i]!.type = val;
                          updateNode(id, { data: { ...data, columns: newCols } });
                          return;
                        }
                        newCols[i]!.name = trimmedName;
                        newCols[i]!.type = val;
                        updateNode(id, { data: { ...data, columns: newCols } });
                        setEditingCol(null);
                      }
                    }}
                  >
                    <SelectTrigger className="h-6 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLUMN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div 
                  className="flex items-center justify-between w-full cursor-pointer"
                  onClick={() => {
                    setEditingCol(i);
                    setEditingColName(col.name);
                    setColNameError(false);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    {col.isPrimaryKey && <span className="text-[9px] bg-yellow-500/20 text-yellow-600 px-1 rounded font-bold shrink-0">PK</span>}
                    {col.isForeignKey && <span className="text-[9px] bg-blue-500/20 text-blue-600 px-1 rounded font-bold shrink-0">FK</span>}
                    <span className="font-medium truncate max-w-[100px]">{col.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-muted-foreground">{col.type}</span>
                    {col.isNotNull && <span className="text-[9px] bg-red-500/10 text-red-600 px-1 rounded font-bold">NN</span>}
                    {col.isUnique && <span className="text-[9px] bg-purple-500/10 text-purple-600 px-1 rounded font-bold">UQ</span>}
                    <div 
                      className="opacity-0 group-hover/row:opacity-100 flex items-center justify-center p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        const newCols = [...columns];
                        newCols.splice(i, 1);
                        updateNode(id, { data: { ...data, columns: newCols } });
                      }}
                    >
                      <X size={12} className={`${col.isPrimaryKey && "opacity-0"}`}/>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="bg-secondary/20 p-1.5 border-t">
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full h-6 text-xs text-muted-foreground hover:text-foreground" 
          onClick={addColumn}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Plus size={12} className="mr-1" /> Add column
        </Button>
      </div>

      {/* Indexes Section */}
      {indexes.length > 0 && (
        <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Indexes
        </div>
      )}
      <div className="flex flex-col">
        {indexes.map((idxObj, i) => {
          const isEditing = editingIndex === i;
          return (
            <div key={i} className="flex flex-col px-3 py-1.5 border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20">
              {isEditing ? (
                <div 
                  className="flex flex-col gap-1 w-full"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      const newIdxs = [...indexes];
                      if (newIdxs[i]?.name.trim() === "") {
                        newIdxs.splice(i, 1);
                        updateNode(id, { data: { ...data, indexes: newIdxs } });
                      }
                      setEditingIndex(null);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Input 
                      value={idxObj.name} 
                      onChange={(e) => updateIndexObj(i, { name: e.target.value })} 
                      className="h-6 text-xs flex-1"
                      placeholder="Index name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") {
                          const newIdxs = [...indexes];
                          if (newIdxs[i]?.name.trim() === "") {
                            newIdxs.splice(i, 1);
                            updateNode(id, { data: { ...data, indexes: newIdxs } });
                          }
                          setEditingIndex(null);
                        }
                      }}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                       <input 
                         type="checkbox" 
                         id={`unique-${i}`}
                         checked={!!idxObj.isUnique} 
                         onChange={(e) => updateIndexObj(i, { isUnique: e.target.checked })}
                         className="w-3 h-3"
                       />
                       <label htmlFor={`unique-${i}`} className="text-[10px]">UQ</label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1 max-h-32 overflow-y-auto pr-1">
                    {columns.filter(c => c.name.trim() !== "").map(col => {
                      const selectedCols = (idxObj.columns || "").split(',').map(s => s.trim()).filter(Boolean);
                      const isSelected = selectedCols.includes(col.name);
                      return (
                        <div 
                          key={col.name}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            let newCols = [...selectedCols];
                            if (isSelected) {
                              newCols = newCols.filter(c => c !== col.name);
                            } else {
                              newCols.push(col.name);
                            }
                            updateIndexObj(i, { columns: newCols.join(", ") });
                          }}
                          className={cn(
                            "nodrag px-1.5 py-0.5 rounded text-[10px] cursor-pointer border transition-colors select-none", 
                            isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:border-primary"
                          )}
                        >
                          {col.name}
                        </div>
                      )
                    })}
                    {columns.filter(c => c.name.trim() !== "").length === 0 && (
                      <span className="text-[10px] text-muted-foreground italic px-1">Add columns to table first</span>
                    )}
                  </div>
                </div>
              ) : (
                <div 
                  className="flex flex-col w-full cursor-pointer"
                  onClick={() => setEditingIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-medium truncate max-w-[120px]">{idxObj.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {idxObj.isUnique && <span className="text-[9px] bg-purple-500/10 text-purple-600 px-1 rounded font-bold">UQ</span>}
                      <div 
                        className="opacity-0 group-hover/row:opacity-100 flex items-center justify-center p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newIdxs = [...indexes];
                          newIdxs.splice(i, 1);
                          updateNode(id, { data: { ...data, indexes: newIdxs } });
                        }}
                      >
                        <X size={12} />
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate w-full mt-0.5">
                    ({idxObj.columns || "no columns"})
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="bg-secondary/20 p-1.5 border-t">
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full h-6 text-xs text-muted-foreground hover:text-foreground" 
          onClick={addIndex}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Plus size={12} className="mr-1" /> Add index
        </Button>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </div>
  );
};

// Import Graph Nodes
import { 
  ServiceNode, 
  DatabaseNode, 
  QueueNode, 
  ExternalNode, 
  ActorNode 
} from "./graph-nodes";

// Map for React Flow
export const nodeTypes = {
  service: ServiceNode,
  database: DatabaseNode,
  queue: QueueNode,
  entity: EntityNode,
  external: ExternalNode,
  actor: ActorNode,
  group: SchemaGroupNode,
};
