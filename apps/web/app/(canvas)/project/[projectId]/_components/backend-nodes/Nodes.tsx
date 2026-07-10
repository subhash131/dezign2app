import React, { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Server, Database, Container, Table2, User, Globe, Plus, Check } from "lucide-react";
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

// --- Service Node ---
export const ServiceNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-3 shadow-md rounded-xl bg-card border-2 flex items-center min-w-[150px]", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <div className="flex items-center">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-blue-500/20 text-blue-500 mr-3">
        <Server size={16} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Service</span>
        <span className="font-medium text-sm">{data.label}</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// --- Database Node ---
export const DatabaseNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-3 shadow-md rounded-xl bg-card border-2 flex items-center min-w-[150px]", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <div className="flex items-center">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-orange-500/20 text-orange-500 mr-3">
        <Database size={16} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Database</span>
        <span className="font-medium text-sm">{data.label}</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// --- Queue Node ---
export const QueueNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-3 shadow-md rounded-xl bg-card border-2 flex items-center min-w-[150px]", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <div className="flex items-center">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-purple-500/20 text-purple-500 mr-3">
        <Container size={16} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Queue</span>
        <span className="font-medium text-sm">{data.label}</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// --- Entity Node ---
export const EntityNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const [editingCol, setEditingCol] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(data.label);
  const [isEditingName, setIsEditingName] = useState(data.label === "");
  const [nameError, setNameError] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

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
        indexes: [...indexes, { name: "idx_new", columns: "" }]
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
        useBackendCanvasStore.getState().deleteNode(id);
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
    console.log("saveName: updating node", id, "with label", finalName);
    updateNode(id, { data: { ...data, label: finalName } });
    setEditingName(finalName);
    setIsEditingName(false);
  };

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[250px] max-w-[350px] overflow-hidden", selected ? "border-primary" : "border-border")}>
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
              className="font-semibold text-sm cursor-pointer hover:text-primary transition-colors flex-1"
              onClick={() => setIsEditingName(true)}
            >
              {data.label}
            </span>
          )}
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
                    value={col.name} 
                    onChange={(e) => updateColumn(i, { name: e.target.value })} 
                    className="h-6 text-xs w-24"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        let newCols = [...columns];
                        if (newCols[i]?.name.trim() === "") {
                          newCols.splice(i, 1);
                        }
                        newCols = ensureUniqueColumnNames(newCols);
                        updateNode(id, { data: { ...data, columns: newCols } });
                        setEditingCol(null);
                      }
                      if (e.key === "Escape") e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      const related = e.relatedTarget as HTMLElement | null;
                      if (related?.closest('[role="combobox"]')) return;
                      if (related?.closest('[role="listbox"]')) return;
                      
                      let newCols = [...columns];
                      if (newCols[i]?.name.trim() === "") {
                        newCols.splice(i, 1);
                      }
                      newCols = ensureUniqueColumnNames(newCols);
                      updateNode(id, { data: { ...data, columns: newCols } });
                      setEditingCol(null);
                    }}
                  />
                  <Select 
                    value={col.type} 
                    onValueChange={(val) => {
                      if (col.name.trim() === "") {
                        const newCols = [...columns];
                        newCols.splice(i, 1);
                        updateNode(id, { data: { ...data, columns: newCols } });
                      } else {
                        updateColumn(i, { type: val });
                      }
                      setEditingCol(null);
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
                  onClick={() => setEditingCol(i)}
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
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="bg-secondary/20 p-1.5 border-t">
        <Button variant="ghost" size="sm" className="w-full h-6 text-xs text-muted-foreground hover:text-foreground" onClick={addColumn}>
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
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-medium truncate max-w-[120px]">{idxObj.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {idxObj.isUnique && <span className="text-[9px] bg-purple-500/10 text-purple-600 px-1 rounded font-bold">UQ</span>}
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
        <Button variant="ghost" size="sm" className="w-full h-6 text-xs text-muted-foreground hover:text-foreground" onClick={addIndex}>
          <Plus size={12} className="mr-1" /> Add index
        </Button>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </div>
  );
};

// --- External Node ---
export const ExternalNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-3 shadow-md rounded-xl bg-card border-2 border-dashed flex items-center min-w-[150px]", selected ? "border-primary" : "border-border")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <div className="flex items-center">
      <div className="rounded-full w-8 h-8 flex items-center justify-center bg-gray-500/20 text-gray-500 mr-3">
        <Globe size={16} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">External</span>
        <span className="font-medium text-sm">{data.label}</span>
      </div>
    </div>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

// --- Actor Node ---
export const ActorNode = ({ data, selected }: NodeProps<BackendNode>) => (
  <div className={cn("px-4 py-2 flex flex-col items-center", selected ? "text-primary" : "")}>
    <Handle type="target" position={Position.Top} className="w-2 h-2" />
    <User size={32} className="mb-2" />
    <span className="font-medium text-sm text-center">{data.label}</span>
    <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
  </div>
);

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
