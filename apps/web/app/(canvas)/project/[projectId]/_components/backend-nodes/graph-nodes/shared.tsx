import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plus, X, Trash2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const EditableNodeList = ({ 
  nodeId, 
  title, 
  items = [], 
  field, 
  handleType, 
  handlePosition, 
  updateNode,
  data 
}: any) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleAdd = () => {
    const newItems = [...items, { id: generateId(), name: "" }];
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
    setEditingId(newItems[newItems.length - 1].id);
    setEditingName("");
  };

  const handleUpdate = (id: string, name: string) => {
    const newItems = items.map((item: any) => item.id === id ? { ...item, name } : item);
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
  };

  const handleDelete = (id: string) => {
    const newItems = items.filter((item: any) => item.id !== id);
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
  };

  if (!items.length && !editingId) {
     return (
       <div className="bg-secondary/20 p-1.5 border-t">
        <Button variant="ghost" size="sm" className="w-full h-6 text-xs text-muted-foreground hover:text-foreground" onClick={handleAdd}>
          <Plus size={12} className="mr-1" /> Add {title.toLowerCase()}
        </Button>
      </div>
     )
  }

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        {title}
        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all" onClick={handleAdd}>
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((item: any) => {
          const isEditing = editingId === item.id;
          return (
            <div key={item.id} className="flex flex-col px-3 py-1.5 border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20">
              {handleType && handlePosition && (
                <Handle 
                  type={handleType} 
                  position={handlePosition} 
                  id={`${field}-${item.id}`} 
                  className={cn("w-2 h-2", handlePosition === Position.Left ? "-left-1" : "-right-1")} 
                  style={{ top: '50%' }} 
                />
              )}
              {isEditing ? (
                 <Input 
                    value={editingName} 
                    onChange={(e) => setEditingName(e.target.value)} 
                    className="h-6 text-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (!editingName.trim()) handleDelete(item.id);
                        else handleUpdate(item.id, editingName.trim());
                        setEditingId(null);
                      }
                      if (e.key === "Escape") {
                         if (!item.name) handleDelete(item.id);
                         setEditingId(null);
                      }
                    }}
                    onBlur={() => {
                        if (!editingName.trim()) handleDelete(item.id);
                        else handleUpdate(item.id, editingName.trim());
                        setEditingId(null);
                    }}
                  />
              ) : (
                <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { setEditingId(item.id); setEditingName(item.name); }}>
                   <span className="font-medium truncate">{item.name}</span>
                   <div className="opacity-0 group-hover/row:opacity-100 flex items-center justify-center p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                      <X size={12} />
                   </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export const EndpointRow = ({ item, isEditing, setEditingId, setEditingName, setEditingType, handleUpdate, handleDelete, handleUpdateItem, field, handleType, handlePosition, editingName, editingType }: any) => {
  const [expanded, setExpanded] = useState(false);

  const addHeader = () => {
     const headers = item.headers || [];
     handleUpdateItem(item.id, { headers: [...headers, { id: generateId(), key: "", value: "" }] });
  };
  const updateHeader = (id: string, key: string, value: string) => {
     handleUpdateItem(item.id, { headers: item.headers.map((h: any) => h.id === id ? { ...h, key, value } : h) });
  };
  const deleteHeader = (id: string) => {
     handleUpdateItem(item.id, { headers: item.headers.filter((h: any) => h.id !== id) });
  };

  const addParam = () => {
     const params = item.params || [];
     handleUpdateItem(item.id, { params: [...params, { id: generateId(), key: "", type: "string" }] });
  };
  const updateParam = (id: string, key: string, type: string) => {
     handleUpdateItem(item.id, { params: item.params.map((p: any) => p.id === id ? { ...p, key, type } : p) });
  };
  const deleteParam = (id: string) => {
     handleUpdateItem(item.id, { params: item.params.filter((p: any) => p.id !== id) });
  };

  return (
    <div className="flex flex-col border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag">
      <Handle 
        type="target" 
        position={Position.Left} 
        id={`${field}-in-${item.id}`} 
        className="w-2 h-2 -left-1" 
        style={{ top: '15px' }} 
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        id={`${field}-out-${item.id}`} 
        className="w-2 h-2 -right-1" 
        style={{ top: '15px' }} 
      />
      <div className="flex flex-col px-3 py-1.5 nodrag">
        {isEditing ? (
           <div className="flex items-center gap-1 nodrag">
             <Select value={editingType} onValueChange={setEditingType}>
               <SelectTrigger className="h-6 w-[70px] text-[10px] px-1.5 py-0"><SelectValue /></SelectTrigger>
               <SelectContent>
                 <SelectItem value="GET" className="text-xs">GET</SelectItem>
                 <SelectItem value="POST" className="text-xs">POST</SelectItem>
                 <SelectItem value="PUT" className="text-xs">PUT</SelectItem>
                 <SelectItem value="PATCH" className="text-xs">PATCH</SelectItem>
                 <SelectItem value="DELETE" className="text-xs">DELETE</SelectItem>
                 <SelectItem value="WS" className="text-xs">WS</SelectItem>
                 <SelectItem value="SSE" className="text-xs">SSE</SelectItem>
                 <SelectItem value="RTC" className="text-xs">WebRTC</SelectItem>
               </SelectContent>
             </Select>
             <Input 
                value={editingName} 
                onChange={(e) => setEditingName(e.target.value)} 
                className="h-6 text-xs flex-1 nodrag"
                placeholder="e.g. /users"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (!editingName.trim()) handleDelete(item.id);
                    else handleUpdate(item.id, editingName.trim(), editingType);
                    setEditingId(null);
                  }
                  if (e.key === "Escape") {
                     if (!item.name) handleDelete(item.id);
                     setEditingId(null);
                  }
                }}
              />
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => {
                  if (!editingName.trim()) handleDelete(item.id);
                  else handleUpdate(item.id, editingName.trim(), editingType);
                  setEditingId(null);
              }}>
                 <Check size={14} />
              </Button>
           </div>
        ) : (
          <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { setEditingId(item.id); setEditingName(item.name); setEditingType(item.type || "GET"); }}>
             <div className="flex items-center gap-2 overflow-hidden">
               <span className="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 bg-secondary text-secondary-foreground">
                 {item.type || "GET"}
               </span>
               <span className="font-medium truncate">{item.name}</span>
             </div>
             <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-all">
                <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
                   {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
                <div className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                   <X size={14} />
                </div>
             </div>
          </div>
        )}

        {expanded && !isEditing && (
          <div className="flex flex-col gap-3 pt-3 mt-2 border-t cursor-default nodrag" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col gap-1.5">
               <div className="flex items-center justify-between">
                 <span className="text-[9px] font-bold text-muted-foreground uppercase">Headers</span>
                 <Plus size={12} className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={addHeader} />
               </div>
               {(item.headers || []).map((h: any) => (
                 <div key={h.id} className="flex items-center gap-1">
                   <Input className="h-6 text-[10px] px-1.5 flex-1 nodrag" placeholder="Key" value={h.key} onChange={e => updateHeader(h.id, e.target.value, h.value)} />
                   <Input className="h-6 text-[10px] px-1.5 flex-1 nodrag" placeholder="Value" value={h.value} onChange={e => updateHeader(h.id, h.key, e.target.value)} />
                   <X size={12} className="cursor-pointer text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteHeader(h.id)} />
                 </div>
               ))}
               {(!item.headers || item.headers.length === 0) && (
                 <span className="text-[10px] text-muted-foreground italic">No headers added</span>
               )}
            </div>

            <div className="flex flex-col gap-1.5">
               <div className="flex items-center justify-between">
                 <span className="text-[9px] font-bold text-muted-foreground uppercase">Params / Query</span>
                 <Plus size={12} className="cursor-pointer text-muted-foreground hover:text-foreground" onClick={addParam} />
               </div>
               {(item.params || []).map((p: any) => (
                 <div key={p.id} className="flex items-center gap-1">
                   <Input className="h-6 text-[10px] px-1.5 flex-1 nodrag" placeholder="Name" value={p.key} onChange={e => updateParam(p.id, e.target.value, p.type)} />
                   <Select value={p.type} onValueChange={v => updateParam(p.id, p.key, v)}>
                     <SelectTrigger className="h-6 w-[70px] text-[10px] px-1.5 py-0 nodrag"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="string" className="text-xs">string</SelectItem>
                       <SelectItem value="number" className="text-xs">number</SelectItem>
                       <SelectItem value="boolean" className="text-xs">boolean</SelectItem>
                     </SelectContent>
                   </Select>
                   <X size={12} className="cursor-pointer text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteParam(p.id)} />
                 </div>
               ))}
               {(!item.params || item.params.length === 0) && (
                 <span className="text-[10px] text-muted-foreground italic">No parameters added</span>
               )}
            </div>

            <div className="flex flex-col gap-1.5">
               <span className="text-[9px] font-bold text-muted-foreground uppercase">Body</span>
               <Textarea 
                 className="min-h-[50px] w-full rounded-md border border-input px-2 py-1 text-[10px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring nodrag"
                 placeholder="{}"
                 value={item.body || ""}
                 onChange={e => handleUpdateItem(item.id, { body: e.target.value })}
               />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export const EndpointList = ({ nodeId, title, items = [], field, handleType, handlePosition, updateNode, data }: any) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState("GET");

  const handleAdd = () => {
    const newItems = [...items, { id: generateId(), name: "", type: "GET" }];
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
    setEditingId(newItems[newItems.length - 1].id);
    setEditingName("");
    setEditingType("GET");
  };

  const handleUpdate = (id: string, name: string, type: string) => {
    const newItems = items.map((item: any) => item.id === id ? { ...item, name, type } : item);
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
  };

  const handleDelete = (id: string) => {
    const newItems = items.filter((item: any) => item.id !== id);
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
  };

  const handleUpdateItem = (id: string, changes: any) => {
    const newItems = items.map((item: any) => item.id === id ? { ...item, ...changes } : item);
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
  };

  if (!items.length && !editingId) {
     return (
       <div className="bg-secondary/20 p-1.5 border-t">
        <Button variant="ghost" size="sm" className="w-full h-6 text-xs text-muted-foreground hover:text-foreground" onClick={handleAdd}>
          <Plus size={12} className="mr-1" /> Add {title.toLowerCase()}
        </Button>
      </div>
     )
  }

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        {title}
        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all" onClick={handleAdd}>
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((item: any) => (
          <EndpointRow
            key={item.id}
            item={item}
            isEditing={editingId === item.id}
            setEditingId={setEditingId}
            editingName={editingName}
            setEditingName={setEditingName}
            editingType={editingType}
            setEditingType={setEditingType}
            handleUpdate={handleUpdate}
            handleDelete={handleDelete}
            handleUpdateItem={handleUpdateItem}
            field={field}
            handleType={handleType}
            handlePosition={handlePosition}
          />
        ))}
      </div>
    </>
  )
}

export const NodeHeader = ({ id, data, icon: Icon, title, colorClass, selected }: any) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const [isEditing, setIsEditing] = useState(data.label === "" || data.label === "Untitled");
  const [name, setName] = useState(data.label);

  const handleSave = () => {
    updateNode(id, { data: { ...data, label: name || "Untitled" } });
    setIsEditing(false);
  };

  return (
    <div className={cn("px-3 py-2 border-b flex items-center justify-between group rounded-t-xl", colorClass)}>
      <div className="flex items-center flex-1">
        <Icon size={14} className="mr-2 shrink-0" />
        {isEditing ? (
          <Input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            className="h-6 text-xs px-1 bg-background/50" 
            autoFocus 
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setIsEditing(false); }}
            onBlur={handleSave}
          />
        ) : (
          <div className="flex flex-col cursor-pointer flex-1" onClick={() => setIsEditing(true)}>
             <span className="text-[9px] uppercase font-bold tracking-wider opacity-70">{title}</span>
             <span className="font-semibold text-sm truncate">{data.label || "Untitled"}</span>
          </div>
        )}
      </div>
      <div 
        className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-black/10 transition-all cursor-pointer ml-2 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          deleteNode(id);
        }}
      >
        <Trash2 size={14} />
      </div>
    </div>
  );
};
