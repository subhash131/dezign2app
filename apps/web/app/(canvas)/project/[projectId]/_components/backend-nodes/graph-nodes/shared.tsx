import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plus, X, Trash2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, ConsumedEvent, Endpoint, PublishedEvent } from "@/types/canvas";

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
  const [expanded, setExpanded] = useState(!item.name);

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

  const isEndpointEmpty = () => {
    const currentName = isEditing ? editingName : (item.name || "");
    const hasName = currentName.trim().length > 0;
    const hasHeaders = item.headers?.some((h: any) => h.key.trim() || h.value.trim());
    const hasParams = item.params?.some((p: any) => p.key.trim());
    const hasBody = item.body?.trim().length > 0;
    const hasBusinessLogic = item.businessLogic?.trim().length > 0;
    const hasOutput = item.output?.trim().length > 0;
    return !hasName && !hasHeaders && !hasParams && !hasBody && !hasBusinessLogic && !hasOutput;
  };

  return (
    <div 
      className="flex flex-col border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag"
      onBlur={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (related?.closest('[role="combobox"]')) return;
        if (related?.closest('[role="listbox"]')) return;
        if (related?.closest('[data-radix-popper-content-wrapper]')) return;

        if (!e.currentTarget.contains(related)) {
          if (isEndpointEmpty()) {
            handleDelete(item.id);
            if (isEditing) setEditingId(null);
          } else if (isEditing) {
            handleUpdate(item.id, editingName.trim(), editingType);
            setEditingId(null);
          }
        }
      }}
    >
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

        {expanded && (
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

            <div className="flex flex-col gap-1.5">
               <span className="text-[9px] font-bold text-muted-foreground">Business Logic</span>
               <Textarea 
                 className="min-h-[50px] w-full rounded-md border border-input px-2 py-1 text-[10px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring nodrag"
                 placeholder="Describe business logic here..."
                 value={item.businessLogic || ""}
                 onChange={e => handleUpdateItem(item.id, { businessLogic: e.target.value })}
               />
            </div>
            <div className="flex flex-col gap-1.5">
              <MessagingResourceList
                title="Published Events"
                items={item.publishedEvents || []}
                variant="publish"
                resourceType="topics"
                onChange={(publishedEvents) =>
                  handleUpdateItem(item.id, { publishedEvents })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
               <span className="text-[9px] font-bold text-muted-foreground uppercase">Output</span>
               <Textarea 
                 className="min-h-[50px] w-full rounded-md border border-input px-2 py-1 text-[10px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring nodrag"
                 placeholder="Describe expected output..."
                 value={item.output || ""}
                 onChange={e => handleUpdateItem(item.id, { output: e.target.value })}
               />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export const EndpointList = ({
  nodeId,
  title,
  items = [],
  field,
  updateNode,
  data,
}: {
  nodeId: string;
  title: string;
  items: Endpoint[];
  field: string;
  updateNode: (nodeId: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState("GET");

  const handleAdd = () => {
    const newItems = [...items, { id: generateId(), name: "", type: "GET" }];
    updateNode(nodeId, { data: { ...data, [field]: newItems } });
    setEditingId(newItems[newItems.length - 1]!.id);
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

export const MessagingResourceRow = ({ item, isEditing, setEditingId, setEditingName, handleUpdate, handleDelete, handleUpdateItem, field, handleType, handlePosition, editingName, variant, resourceType }: any) => {
  const [expanded, setExpanded] = useState(!item.name);
  const isPublished = field === "publishedEvents" || variant === "publish";
  const isConsumed = field === "consumedEvents" || variant === "consume";
  const nodes = useBackendCanvasStore(s => s.nodes);
  const messagingNodes = nodes.filter(n => n.type === "queue" || n.type === "pubsub" || n.type === "eventstream" || n.type === "kafka" || n.type === "redis-streams" || n.type === "sqs");
  
  const edges = useBackendCanvasStore(s => s.edges);
  const publisherCount = edges.filter(e => e.targetResourceId === item.id).length;
  const consumerCount = edges.filter(e => e.sourceResourceId === item.id).length;

  const isChannelEmpty = () => {
    const currentName = isEditing ? editingName : (item.name || "");
    const hasName = currentName.trim().length > 0;
    const hasDesc = item.description?.trim().length > 0;
    const hasSchema = item.schema?.trim().length > 0;
    const hasLogic = item.handlerLogic?.trim().length > 0;
    const hasRetry = item.retryPolicy?.trim().length > 0;
    const hasVersion = item.version?.trim().length > 0;
    const hasTarget = item.targetNodeId && item.targetNodeId !== "none";
    return !hasName && !hasDesc && !hasSchema && !hasLogic && !hasRetry && !hasVersion && !hasTarget;
  };

  return (
    <div 
      className="flex flex-col border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag"
      onBlur={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (related?.closest('[role="combobox"]')) return;
        if (related?.closest('[role="listbox"]')) return;
        if (related?.closest('[data-radix-popper-content-wrapper]')) return;

        if (!e.currentTarget.contains(related)) {
          if (isChannelEmpty()) {
            handleDelete(item.id);
            if (isEditing) setEditingId(null);
          } else if (isEditing) {
            handleUpdate(item.id, editingName.trim());
            setEditingId(null);
          }
        }
      }}
    >
      {isPublished && variant !== "definition" && (
        <Handle
          type="source"
          position={Position.Right}
          id={`publishedEvents-out-${item.id}`}
          className="w-2 h-2 -right-1"
          style={{ top: '15px' }}
        />
      )}
      {isConsumed && variant !== "definition" && (
        <Handle
          type="target"
          position={Position.Left}
          id={`consumedEvents-in-${item.id}`}
          className="w-2 h-2 -left-1"
          style={{ top: '15px' }}
        />
      )}
      {variant === "definition" && resourceType && (
        <>
          <Handle
            type="target"
            position={Position.Left}
            id={`${resourceType}:in:${item.id}`}
            className="w-2 h-2 -left-1"
            style={{ top: '15px' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`${resourceType}:out:${item.id}`}
            className="w-2 h-2 -right-1"
            style={{ top: '15px' }}
          />
        </>
      )}
      <div className="flex flex-col px-3 py-1.5 nodrag">

        {isEditing ? (
           <div className="flex items-center gap-1 nodrag">
             <Input 
                value={editingName} 
                onChange={(e) => setEditingName(e.target.value)} 
                className="h-6 text-xs flex-1 nodrag"
                placeholder="e.g. OrderCreated"
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
              />
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => {
                  if (!editingName.trim()) handleDelete(item.id);
                  else handleUpdate(item.id, editingName.trim());
                  setEditingId(null);
              }}>
                 <Check size={14} />
              </Button>
           </div>
        ) : (
          <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { setEditingId(item.id); setEditingName(item.name); }}>
             <div className="flex items-center gap-2 overflow-hidden">
               <span className="font-medium truncate">{item.name}</span>
               {variant === "definition" && item.name && (
                 <span className="text-[9px] bg-secondary/80 text-muted-foreground px-1 py-0.5 rounded font-mono shrink-0">
                   P: {publisherCount} &nbsp; C: {consumerCount}
                 </span>
               )}
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

        {expanded && (
          <div className="flex flex-col gap-3 pt-3 mt-2 border-t cursor-default nodrag" onClick={e => e.stopPropagation()}>
             <div className="flex flex-col gap-1.5">
               <span className="text-[9px] font-bold text-muted-foreground">
                 {isPublished ? "When Published (Trigger)" : "Description"}
               </span>
               <Textarea 
                 className="min-h-[30px] w-full rounded-md border border-input px-2 py-1 text-[10px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring nodrag"
                 placeholder={isPublished ? "e.g. Order successfully created" : "What triggers this message?"}
                 value={item.description || ""}
                 onChange={e => handleUpdateItem(item.id, { description: e.target.value })}
               />
             </div>
             
             <div className="flex flex-col gap-1.5">
               <span className="text-[9px] font-bold text-muted-foreground">
                 {isConsumed ? "Expected Payload" : (isPublished ? "Payload" : "Schema")}
               </span>
               <Textarea 
                 className="min-h-[50px] w-full rounded-md border border-input px-2 py-1 text-[10px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring nodrag font-mono"
                 placeholder="{}"
                 value={item.schema || ""}
                 onChange={e => handleUpdateItem(item.id, { schema: e.target.value })}
               />
             </div>

             {isConsumed && (
               <div className="flex flex-col gap-1.5">
                 <span className="text-[9px] font-bold text-muted-foreground">Handler Logic</span>
                 <Textarea 
                   className="min-h-[50px] w-full rounded-md border border-input px-2 py-1 text-[10px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring nodrag"
                   placeholder="What happens when this event is received?"
                   value={item.handlerLogic || ""}
                   onChange={e => handleUpdateItem(item.id, { handlerLogic: e.target.value })}
                 />
               </div>
             )}

             {!isPublished && variant !== "definition" && (
               <div className="flex items-center justify-between gap-2">
                 <span className="text-[9px] font-bold text-muted-foreground">Retry Policy</span>
                 <Input 
                   className="h-6 text-[10px] w-24 text-right bg-background nodrag" 
                   placeholder="e.g. 3 times" 
                   value={item.retryPolicy || ""}
                   onChange={e => handleUpdateItem(item.id, { retryPolicy: e.target.value })}
                 />
               </div>
             )}

             <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-bold text-muted-foreground">Version</span>
                <Input 
                  className="h-6 text-[10px] w-16 text-right bg-background nodrag" 
                  placeholder="v1" 
                  value={item.version || ""}
                  onChange={e => handleUpdateItem(item.id, { version: e.target.value })}
                />
             </div>

             {(isPublished || isConsumed) && variant !== "definition" && (
               <div className="flex flex-col gap-1.5 border-t border-border/50 pt-2 mt-1">
                 <span className="text-[9px] font-bold text-muted-foreground">
                   {isPublished ? "Publishes To" : "Consumes From"}
                 </span>
                  <Select value={item.targetNodeId || ""} onValueChange={v => handleUpdateItem(item.id, { targetNodeId: v })}>
                    <SelectTrigger className="h-7 text-xs bg-background nodrag">
                      <SelectValue placeholder="Select Messaging Node" />
                    </SelectTrigger>
                    <SelectContent>
                      {messagingNodes.length === 0 && <SelectItem value="none" disabled className="text-xs">No messaging nodes found</SelectItem>}
                      {messagingNodes.map((node: any) => (
                        <SelectItem key={node.id} value={node.id} className="text-xs">
                          {node.data.label || "Untitled Messaging"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
               </div>
             )}
          </div>
        )}
      </div>
    </div>
  )
}


export const MessagingResourceList = ({
  title,
  items = [],
  variant,
  resourceType,
  onChange,
}: {
  title: string;
  items: any[];
  variant: "definition" | "publish" | "consume";
  resourceType: "topics" | "streams" | "queues" | "channels";
  onChange: (items: any[]) => void;
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const getKind = () => {
    switch (resourceType) {
      case "topics":
        return "topic";
      case "streams":
        return "stream";
      case "queues":
        return "queue";
      case "channels":
        return "channel";
      default:
        return "topic";
    }
  };

  const handleAdd = () => {
    const newItems = [
      ...items,
      {
        id: generateId(),
        name: "",
        kind: getKind(),
      },
    ];

    onChange(newItems);

    setEditingId(newItems[newItems.length - 1].id);
    setEditingName("");
  };

  const handleUpdate = (id: string, name: string) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, name } : item
      )
    );
  };

  const handleDelete = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const handleUpdateItem = (id: string, changes: any) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, ...changes } : item
      )
    );
  };

  if (!items.length && !editingId) {
    return (
      <div className="p-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-6 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleAdd}
        >
          <Plus size={12} className="mr-1" />
          Add {title.toLowerCase()}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        {title}
        <div
          className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={handleAdd}
        >
          <Plus size={12} />
        </div>
      </div>

      <div className="flex flex-col">
        {items.map((item) => (
          <MessagingResourceRow
            key={item.id}
            item={item}
            isEditing={editingId === item.id}
            setEditingId={setEditingId}
            editingName={editingName}
            setEditingName={setEditingName}
            handleUpdate={handleUpdate}
            handleDelete={handleDelete}
            handleUpdateItem={handleUpdateItem}
            variant={variant}
            resourceType={resourceType}
          />
        ))}
      </div>
    </>
  );
};

// --- Route Group Components ---

const RouteGroupSection = ({
  group,
  groupIndex,
  nodeId,
  updateNode,
  data,
}: any) => {
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(!group.name);
  const [nameValue, setNameValue] = useState(group.name);
  const [editingBasePath, setEditingBasePath] = useState(false);
  const [basePathValue, setBasePathValue] = useState(group.basePath || "");

  // Endpoint editing state
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(null);
  const [editingEndpointName, setEditingEndpointName] = useState("");
  const [editingEndpointType, setEditingEndpointType] = useState("GET");

  const routeGroups: any[] = data.routeGroups || [];

  const updateGroup = (changes: any) => {
    const newGroups = [...routeGroups];
    newGroups[groupIndex] = { ...newGroups[groupIndex], ...changes };
    updateNode(nodeId, { data: { ...data, routeGroups: newGroups } });
  };

  const deleteGroup = () => {
    const newGroups = routeGroups.filter((_: any, i: number) => i !== groupIndex);
    updateNode(nodeId, { data: { ...data, routeGroups: newGroups } });
  };

  const handleSaveName = () => {
    const trimmed = nameValue.trim();
    if (!trimmed && !group.endpoints?.length) {
      deleteGroup();
      return;
    }
    updateGroup({ name: trimmed || "Untitled Group" });
    setEditingName(false);
  };

  const handleSaveBasePath = () => {
    updateGroup({ basePath: basePathValue.trim() });
    setEditingBasePath(false);
  };

  // Endpoint CRUD within this group
  const endpoints = group.endpoints || [];

  const handleAddEndpoint = () => {
    const newEndpoint = { id: generateId(), name: "", type: "GET" };
    updateGroup({ endpoints: [...endpoints, newEndpoint] });
    setEditingEndpointId(newEndpoint.id);
    setEditingEndpointName("");
    setEditingEndpointType("GET");
  };

  const handleUpdateEndpoint = (id: string, name: string, type: string) => {
    const newEndpoints = endpoints.map((ep: any) =>
      ep.id === id ? { ...ep, name, type } : ep
    );
    updateGroup({ endpoints: newEndpoints });
  };

  const handleDeleteEndpoint = (id: string) => {
    const newEndpoints = endpoints.filter((ep: any) => ep.id !== id);
    updateGroup({ endpoints: newEndpoints });
  };

  const handleUpdateEndpointItem = (id: string, changes: any) => {
    const newEndpoints = endpoints.map((ep: any) =>
      ep.id === id ? { ...ep, ...changes } : ep
    );
    updateGroup({ endpoints: newEndpoints });
  };

  return (
    <div className="border-t">
      {/* Source handle for wiring this group to a DB node */}
      <Handle
        type="source"
        position={Position.Right}
        id={`routeGroup-${group.id}`}
        className="w-2 h-2 -right-1"
        style={{ top: 'auto' }}
      />

      {/* Group Header */}
      <div
        className="px-3 py-1.5 bg-blue-500/5 flex items-center justify-between group/grp cursor-pointer nodrag"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-1.5 flex-1 overflow-hidden">
          <div className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-all shrink-0">
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>

          {editingName ? (
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              className="h-5 text-xs px-1 w-24 nodrag"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") {
                  setNameValue(group.name);
                  setEditingName(false);
                }
              }}
              onBlur={handleSaveName}
            />
          ) : (
            <span
              className="text-xs font-semibold truncate hover:text-primary transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setEditingName(true);
                setNameValue(group.name);
              }}
            >
              {group.name || "Untitled Group"}
            </span>
          )}

          {editingBasePath ? (
            <Input
              value={basePathValue}
              onChange={(e) => setBasePathValue(e.target.value)}
              className="h-5 text-[10px] px-1 w-20 text-muted-foreground nodrag"
              placeholder="/path"
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveBasePath();
                if (e.key === "Escape") {
                  setBasePathValue(group.basePath || "");
                  setEditingBasePath(false);
                }
              }}
              onBlur={handleSaveBasePath}
            />
          ) : (
            <span
              className="text-[10px] text-muted-foreground truncate hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setEditingBasePath(true);
                setBasePathValue(group.basePath || "");
              }}
            >
              {group.basePath || "/..."}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover/grp:opacity-100 transition-all shrink-0">
          <div
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              handleAddEndpoint();
              if (collapsed) setCollapsed(false);
            }}
          >
            <Plus size={12} />
          </div>
          <div
            className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              deleteGroup();
            }}
          >
            <X size={14} />
          </div>
        </div>
      </div>

      {/* Endpoints within this group */}
      {!collapsed && (
        <div className="flex flex-col">
          {endpoints.length === 0 ? (
            <div className="bg-secondary/10 p-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleAddEndpoint}
              >
                <Plus size={12} className="mr-1" /> Add endpoint
              </Button>
            </div>
          ) : (
            endpoints.map((ep: any) => (
              <EndpointRow
                key={ep.id}
                item={ep}
                isEditing={editingEndpointId === ep.id}
                setEditingId={setEditingEndpointId}
                editingName={editingEndpointName}
                setEditingName={setEditingEndpointName}
                editingType={editingEndpointType}
                setEditingType={setEditingEndpointType}
                handleUpdate={handleUpdateEndpoint}
                handleDelete={handleDeleteEndpoint}
                handleUpdateItem={handleUpdateEndpointItem}
                field={`routeGroup-${group.id}-endpoints`}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export const RouteGroupList = ({
  nodeId,
  data,
  updateNode,
}: {
  nodeId: string;
  data: any;
  updateNode: (id: string, changes: any) => void;
}) => {
  const routeGroups: any[] = data.routeGroups || [];
  const ungroupedEndpoints: any[] = data.endpoints || [];

  const handleAddGroup = () => {
    const newGroup = {
      id: generateId(),
      name: "",
      basePath: "",
      endpoints: [],
    };
    const newGroups = [...routeGroups, newGroup];
    updateNode(nodeId, { data: { ...data, routeGroups: newGroups } });
  };

  // Move an ungrouped endpoint into a specific group
  const moveToGroup = (endpointId: string, groupIndex: number) => {
    const ep = ungroupedEndpoints.find((e: any) => e.id === endpointId);
    if (!ep) return;

    const newUngrouped = ungroupedEndpoints.filter((e: any) => e.id !== endpointId);
    const newGroups = [...routeGroups];
    newGroups[groupIndex] = {
      ...newGroups[groupIndex],
      endpoints: [...(newGroups[groupIndex].endpoints || []), ep],
    };

    updateNode(nodeId, {
      data: { ...data, endpoints: newUngrouped, routeGroups: newGroups },
    });
  };

  return (
    <div className="flex flex-col">
      {/* Ungrouped endpoints (backward compat) */}
      {ungroupedEndpoints.length > 0 && (
        <EndpointList
          nodeId={nodeId}
          title="Routes (ungrouped)"
          items={ungroupedEndpoints}
          field="endpoints"
          updateNode={updateNode}
          data={data}
        />
      )}

      {/* Route Groups */}
      {routeGroups.map((group: any, index: number) => (
        <RouteGroupSection
          key={group.id}
          group={group}
          groupIndex={index}
          nodeId={nodeId}
          updateNode={updateNode}
          data={data}
        />
      ))}

      {/* Add route group button */}
      <div className="bg-secondary/20 p-1.5 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-6 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleAddGroup}
        >
          <Plus size={12} className="mr-1" /> Add route group
        </Button>
      </div>
    </div>
  );
};
