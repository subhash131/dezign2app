import React, { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plus, X, Trash2, Check, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, Endpoint, Schema, AnyMessagingResource } from "@/types/canvas";
import { ParameterEditor, SchemaEditor, ProcessingStepsEditor } from "./Editors";

export const generateId = () => Math.random().toString(36).substring(2, 9);

export const LocalInput = ({ value, onChange, ...props }: React.ComponentProps<typeof Input>) => {
  const [localValue, setLocalValue] = useState(value);
  React.useEffect(() => {
    if (value !== localValue) setLocalValue(value);
  }, [value]);
  return <Input {...props} value={localValue as string | undefined} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    if (onChange) onChange(e);
  }} />;
};

export const LocalTextarea = ({ value, onChange, onKeyDown, ...props }: React.ComponentProps<typeof Textarea>) => {
  const [localValue, setLocalValue] = useState(value);
  React.useEffect(() => {
    if (value !== localValue) setLocalValue(value);
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const currentVal = (localValue as string) || "";
      const newValue = currentVal.substring(0, start) + "  " + currentVal.substring(end);
      
      setLocalValue(newValue);
      
      if (onChange) {
        const syntheticEvent = {
          target: { value: newValue }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        onChange(syntheticEvent);
      }
      
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
    if (onKeyDown) onKeyDown(e);
  };

  return <Textarea {...props} value={localValue as string | undefined} onKeyDown={handleKeyDown} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalValue(e.target.value);
    if (onChange) onChange(e);
  }} />;
};

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
  data 
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
    const newItems = items.map((item) => item.id === id ? { ...item, name } : item);
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
        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all" onClick={handleAdd}>
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((item) => {
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
                 <LocalInput 
                    value={editingName} 
                    onChange={(e) => setEditingName(e.target.value)} 
                    className="h-6 text-xs"
                    autoFocus
                    onKeyDown={(e: React.KeyboardEvent) => {
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
                <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { setEditingId(item.id); setEditingName(item.name || ""); }}>
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

export interface EndpointRowProps {
  nodeId: string;
  item: Endpoint;
  isEditing: boolean;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  setEditingType: (type: string) => void;
  handleUpdate: (id: string, name: string, type: string) => void;
  handleDelete: (id: string) => void;
  handleUpdateItem: (id: string, changes: Partial<Endpoint>) => void;
  handleType?: "source" | "target";
  handlePosition?: "left" | "right" | "top" | "bottom";
  editingName: string;
  editingType: string;
}

export const EndpointRow = ({ nodeId, item, isEditing, setEditingId, setEditingName, setEditingType, handleUpdate, handleDelete, handleUpdateItem, handleType, handlePosition, editingName, editingType }: EndpointRowProps) => {
  const setActiveConfigItem = useBackendCanvasStore(s => s.setActiveConfigItem);

  const isEndpointEmpty = () => {
    const currentName = isEditing ? editingName : (item.name || "");
    const hasName = currentName.trim().length > 0;
    const hasHeaders = item.headers?.some((h) => (h.key || "").trim() || (h.value || "").trim());
    const hasParams = item.params?.some((p) => (p.key || "").trim());
    const hasBody = (item.body?.trim().length || 0) > 0;
    const hasBusinessLogic = (item.businessLogic?.trim().length || 0) > 0;
    const hasOutput = (item.output?.trim().length || 0) > 0;
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
            const wasEmpty = !item.name;
            handleUpdate(item.id, editingName.trim(), editingType);
            if (wasEmpty && editingName.trim()) {
              setActiveConfigItem({ type: 'endpoint', id: item.id, nodeId });
            }
            setEditingId(null);
          }
        }
      }}
    >
      <Handle 
        type="target" 
        position={Position.Left} 
        id={`endpoint-in-${item.id}`} 
        className="w-2 h-2 -left-1" 
        style={{ top: '15px' }} 
      />
      <Handle 
        type="source" 
        position={Position.Right} 
        id={`endpoint-out-${item.id}`} 
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
             <LocalInput 
                value={editingName} 
                onChange={(e) => setEditingName(e.target.value)} 
                className="h-6 text-xs flex-1 nodrag"
                placeholder="e.g. /users"
                autoFocus
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    if (!editingName.trim()) handleDelete(item.id);
                    else {
                      const wasEmpty = !item.name;
                      handleUpdate(item.id, editingName.trim(), editingType);
                      if (wasEmpty) setActiveConfigItem({ type: 'endpoint', id: item.id, nodeId });
                    }
                    setEditingId(null);
                  }
                  if (e.key === "Escape") {
                     if (!item.name) handleDelete(item.id);
                     setEditingId(null);
                  }
                }}
              />
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => {
                  if (!(editingName || "").trim()) handleDelete(item.id);
                  else {
                    const wasEmpty = !item.name;
                    handleUpdate(item.id, (editingName || "").trim(), editingType || "GET");
                    if (wasEmpty) setActiveConfigItem({ type: 'endpoint', id: item.id, nodeId });
                  }
                  setEditingId(null);
              }}>
                 <Check size={14} />
              </Button>
           </div>
        ) : (
          <div className="flex flex-col w-full gap-1.5">
            <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { setEditingId(item.id); setEditingName(item.name || ""); setEditingType(item.type || "GET"); }}>
               <div className="flex items-center gap-2 overflow-hidden">
                 <span className="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 bg-secondary text-secondary-foreground">
                   {item.type || "GET"}
                 </span>
                 <span className="font-medium truncate">{item.name}</span>
               </div>
               <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-all">
                  <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setActiveConfigItem({ type: 'endpoint', id: item.id, nodeId }); }}>
                     <Settings size={14} />
                  </div>
                  <div className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                     <X size={14} />
                  </div>
               </div>
            </div>

            {item.publishedEvents && item.publishedEvents.length > 0 && (
              <div className="flex flex-col gap-1 w-full pl-6 mt-0.5">
                {item.publishedEvents.map(ev => (
                  <div key={ev.id} className="relative flex items-center w-full group/pub cursor-default" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[9px] font-medium text-muted-foreground truncate opacity-70 group-hover/pub:opacity-100 transition-opacity flex items-center gap-1">
                      <span className="text-[8px] opacity-50">↳</span> 
                      <span className="px-1 py-0.5 bg-secondary/50 rounded-sm">pub</span>
                      {ev.name}
                    </span>
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={`publishedEvents-out-${ev.id}`}
                      style={{ top: '50%', right: '-12px' }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const EndpointList = ({
  nodeId,
  title,
}: {
  nodeId: string;
  title: string;
}) => {
  const items = useBackendCanvasStore(s => s.endpoints).filter(e => e.nodeId === nodeId);
  const addEndpoint = useBackendCanvasStore(s => s.addEndpoint);
  const updateEndpoint = useBackendCanvasStore(s => s.updateEndpoint);
  const deleteEndpoint = useBackendCanvasStore(s => s.deleteEndpoint);
  const setActiveConfigItem = useBackendCanvasStore(s => s.setActiveConfigItem);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingType, setEditingType] = useState("GET");

  const handleAdd = () => {
    const newEndpoint = { id: generateId(), name: "", type: "GET" };
    addEndpoint(nodeId, newEndpoint);
    setEditingId(newEndpoint.id);
    setEditingName("");
    setEditingType("GET");
  };

  const handleUpdate = (id: string, name: string, type: string) => {
    updateEndpoint(id, { name, type });
  };

  const handleDelete = (id: string) => {
    deleteEndpoint(id);
  };

  const handleUpdateItem = (id: string, changes: Partial<Endpoint>) => {
    updateEndpoint(id, changes);
  };



  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        {title}
        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all" onClick={handleAdd}>
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((item) => (
          <EndpointRow
            key={item.id}
            nodeId={nodeId}
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
          />
        ))}
      </div>
    </>
  )
}

export interface NodeHeaderProps {
  id: string;
  data: BackendNode["data"];
  icon: React.ElementType;
  title?: string;
  colorClass?: string;
  selected?: boolean;
}

export const NodeHeader = ({ id, data, icon: Icon, title, colorClass, selected }: NodeHeaderProps) => {
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
          <LocalInput 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            className="h-6 text-xs px-1 bg-background/50" 
            autoFocus 
            onKeyDown={(e:React.KeyboardEvent) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setIsEditing(false); }}
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

export interface MessagingResourceRowProps {
  nodeId: string;
  item: AnyMessagingResource;
  isEditing: boolean;
  setEditingId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  handleUpdate: (id: string, name: string) => void;
  handleDelete: (id: string) => void;
  handleUpdateItem: (id: string, changes: Partial<AnyMessagingResource>) => void;
  field?: string;
  handleType?: "source" | "target";
  handlePosition?: "left" | "right" | "top" | "bottom";
  editingName: string;
  variant?: "definition" | "publish" | "consume";
  resourceType: string;
}

export const MessagingResourceRow = ({ nodeId, item, isEditing, setEditingId, setEditingName, handleUpdate, handleDelete, handleUpdateItem, field, handleType, handlePosition, editingName, variant, resourceType }: MessagingResourceRowProps) => {
  const setActiveConfigItem = useBackendCanvasStore(s => s.setActiveConfigItem);
  const isPublished = field === "publishedEvents" || variant === "publish";
  const isConsumed = field === "consumedEvents" || variant === "consume";
  const nodes = useBackendCanvasStore(s => s.nodes);
  const messagingNodes = nodes.filter(n => n.type === "queue" || n.type === "pubsub" || n.type === "eventstream" || n.type === "kafka" || n.type === "redis-streams" || n.type === "sqs" || n.type === "redis-pubsub");
  
  const selectedBroker = messagingNodes.find(n => n.id === item.brokerNodeId);
  const availableResources = selectedBroker ? (
    selectedBroker.data.topics || 
    selectedBroker.data.streams || 
    selectedBroker.data.queues || 
    selectedBroker.data.channels || []
  ) : [];

  const edges = useBackendCanvasStore(s => s.edges);
  const publisherCount = edges.filter(e => e.targetResourceId === item.id).length;
  const consumerCount = edges.filter(e => e.sourceResourceId === item.id).length;

  let pubAbbr = "P";
  let subAbbr = "S";
  if (resourceType === "buckets" || resourceType === "caches") {
    pubAbbr = "W";
    subAbbr = "R";
  } else if (resourceType === "queues" || resourceType === "streams") {
    pubAbbr = "P";
    subAbbr = "C";
  }

  const isChannelEmpty = () => {
    const currentName = isEditing ? editingName : (item.name || "");
    const hasName = currentName.trim().length > 0;
    
    const desc = (item.description as string | undefined) || (item.publishedWhen as string | undefined) || "";
    const hasDesc = desc.trim().length > 0;
    
    const schema = item.payloadSchema as Schema | undefined;
    const fields = schema?.fields;
    const hasSchema = (fields?.length || 0) > 0;
    
    const logic = item.handlerLogic as string | undefined;
    const hasLogic = (logic?.trim().length || 0) > 0;
    
    const hasTarget = item.brokerNodeId && item.brokerNodeId !== "none";
    
    return !hasName && !hasDesc && !hasSchema && !hasLogic && !hasTarget;
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
            const wasEmpty = !item.name;
            handleUpdate(item.id, editingName.trim());
            if (wasEmpty && editingName.trim()) {
              setActiveConfigItem({ type: 'event', id: item.id, nodeId });
            }
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
        <>
          <Handle
            type="target"
            position={Position.Left}
            id={`consumedEvents-in-${item.id}`}
            className="w-2 h-2 -left-1"
            style={{ top: '15px' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id={`consumedEvents-out-${item.id}`}
            className="w-2 h-2 -right-1"
            style={{ top: '15px' }}
          />
        </>
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
             <LocalInput 
                value={editingName} 
                onChange={(e) => setEditingName(e.target.value)} 
                className="h-6 text-xs flex-1 nodrag"
                placeholder="e.g. OrderCreated"
                autoFocus
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    if (!editingName.trim()) handleDelete(item.id);
                    else {
                      const wasEmpty = !item.name;
                      handleUpdate(item.id, editingName.trim());
                      if (wasEmpty) setActiveConfigItem({ type: 'event', id: item.id, nodeId });
                    }
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
                  else {
                    const wasEmpty = !item.name;
                    handleUpdate(item.id, editingName.trim());
                    if (wasEmpty) setActiveConfigItem({ type: 'event', id: item.id, nodeId });
                  }
                  setEditingId(null);
              }}>
                 <Check size={14} />
              </Button>
           </div>
        ) : (
          <div className="flex flex-col w-full">
            <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { setEditingId(item.id); setEditingName(item.name || ""); }}>
               <div className="flex items-center gap-2 overflow-hidden">
                 <span className="font-medium truncate">{item.name || (item._legacyName as string | undefined)}</span>
                 {variant === "definition" && item.name && (
                   <span className="text-[9px] bg-secondary/80 text-muted-foreground px-1 py-0.5 rounded font-mono shrink-0">
                     {pubAbbr}: {publisherCount} &nbsp; {subAbbr}: {consumerCount}
                   </span>
                 )}
               </div>
               <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-all">
                  <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setActiveConfigItem({ type: 'event', id: item.id, nodeId }); }}>
                     <Settings size={14} />
                  </div>
                  <div className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                     <X size={14} />
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


export const MessagingResourceList = <T extends AnyMessagingResource = AnyMessagingResource>({
  nodeId,
  title,
  items = [],
  variant,
  resourceType,
  onChange,
  onAdd,
  onUpdate,
  onDelete,
  onUpdateItem,
  field,
  handleType,
  handlePosition,
  asCard,
}: {
  nodeId: string;
  title: string;
  items?: T[];
  variant?: "definition" | "publish" | "consume";
  resourceType: string;
  onChange?: (items: T[]) => void;
  onAdd?: (item: T) => void;
  onUpdate?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onUpdateItem?: (id: string, changes: Partial<T>) => void;
  field?: string;
  handleType?: "source" | "target";
  handlePosition?: "left" | "right" | "top" | "bottom";
  asCard?: boolean;
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const setActiveConfigItem = useBackendCanvasStore(s => s.setActiveConfigItem);

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
      case "caches":
        return "cache";
      default:
        return "topic";
    }
  };

  const handleAdd = () => {
    const newItem = { id: generateId(), name: "", kind: getKind() } as T;
    if (onAdd) {
      onAdd(newItem);
    } else if (onChange) {
      onChange([...items, newItem]);
    }
    setEditingId(newItem.id);
    setEditingName("");
  };

  const handleUpdate = (id: string, name: string) => {
    if (onUpdate) {
      onUpdate(id, name);
    } else if (onChange) {
      onChange(items.map((item) => (item.id === id ? { ...item, name } : item)) as T[]);
    }
  };

  const handleDelete = (id: string) => {
    if (onDelete) {
      onDelete(id);
    } else if (onChange) {
      onChange(items.filter((item) => item.id !== id));
    }
  };

  const handleUpdateItem = (id: string, changes: Partial<AnyMessagingResource>) => {
    if (onUpdateItem) {
      onUpdateItem(id, changes as Partial<T>);
    } else if (onChange) {
      onChange(items.map((item) =>
        item.id === id ? { ...item, ...changes } : item
      ) as T[]);
    }
  };


  if (asCard) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs bg-secondary/50 hover:bg-secondary border border-border/50" onClick={handleAdd}>
            <Plus size={14} className="mr-1.5 text-muted-foreground" /> Add Event
          </Button>
        </div>
        
        <div className="flex flex-col gap-2">
          {items.map((item, index) => (
            <MessagingResourceRow
              key={item.id || `item-${index}`}
              nodeId={nodeId}
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
        {items.map((item, index) => (
          <MessagingResourceRow
            key={item.id || `item-${index}`}
            nodeId={nodeId}
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

export interface RouteGroupEditorProps {
  group: NonNullable<BackendNode["data"]["routeGroups"]>[0];
  groupIndex: number;
  nodeId: string;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
}

export const RouteGroupEditor = ({
  group,
  groupIndex,
  nodeId,
  updateNode,
  data,
}: RouteGroupEditorProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [editingName, setEditingName] = useState(!group.name);
  const [nameValue, setNameValue] = useState(group.name || "");
  const [editingBasePath, setEditingBasePath] = useState(false);
  const [basePathValue, setBasePathValue] = useState(group.basePath || "");

  // Endpoint editing state
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(null);
  const [editingEndpointName, setEditingEndpointName] = useState("");
  const [editingEndpointType, setEditingEndpointType] = useState("GET");

  const routeGroups = data.routeGroups || [];

  const updateGroup = (changes: Partial<NonNullable<BackendNode["data"]["routeGroups"]>[0]>) => {
    const newGroups = [...routeGroups];
    if (!newGroups[groupIndex]) return;
    newGroups[groupIndex] = { ...newGroups[groupIndex]!, ...changes };
    updateNode(nodeId, { data: { ...data, routeGroups: newGroups } });
  };

  const deleteGroup = () => {
    const newGroups = routeGroups.filter((_, i: number) => i !== groupIndex);
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
    const newEndpoint = { 
      id: generateId(), 
      name: "", 
      type: "GET",
      headers: [],
      pathParams: [],
      queryParams: [],
      requestBody: { id: generateId(), fields: [] },
      responseBody: { id: generateId(), fields: [] },
      processingSteps: [],
      publishedEvents: [],
      isIdempotent: false,
    } as Endpoint;
    updateGroup({ endpoints: [...endpoints, newEndpoint] });
    setEditingEndpointId(newEndpoint.id);
    setEditingEndpointName("");
    setEditingEndpointType("GET");
  };

  const handleUpdateEndpoint = (id: string, name: string, type: string) => {
    const newEndpoints = endpoints.map((ep) =>
      ep.id === id ? { ...ep, name, type } : ep
    );
    updateGroup({ endpoints: newEndpoints });
  };

  const handleDeleteEndpoint = (id: string) => {
    const newEndpoints = endpoints.filter((ep) => ep.id !== id);
    updateGroup({ endpoints: newEndpoints });
  };

  const handleUpdateEndpointItem = (id: string, changes: Partial<Endpoint>) => {
    const newEndpoints = endpoints.map((ep) =>
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
            <LocalInput
              value={nameValue || ""}
              onChange={(e) => setNameValue(e.target.value)}
              className="h-5 text-xs px-1 w-24 nodrag"
              autoFocus
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") {
                  setNameValue(group.name || "");
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
                setNameValue(group.name || "");
              }}
            >
              {group.name || "Untitled Group"}
            </span>
          )}

          {editingBasePath ? (
            <LocalInput
              value={basePathValue}
              onChange={(e) => setBasePathValue(e.target.value)}
              className="h-5 text-[10px] px-1 w-20 text-muted-foreground nodrag"
              placeholder="/path"
              autoFocus
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              onKeyDown={(e: React.KeyboardEvent) => {
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
            endpoints.map((ep) => (
              <EndpointRow
                key={ep.id}
                nodeId={nodeId}
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
  data: BackendNode["data"];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
}) => {
  const routeGroups = data.routeGroups || [];
  const ungroupedEndpoints = data.endpoints || [];

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
    const ep = ungroupedEndpoints.find((e) => e.id === endpointId);
    if (!ep) return;

    const newUngrouped = ungroupedEndpoints.filter((e) => e.id !== endpointId);
    const newGroups = [...routeGroups];
    if (!newGroups[groupIndex]) return;
    
    newGroups[groupIndex] = {
      ...newGroups[groupIndex]!,
      endpoints: [...(newGroups[groupIndex]!.endpoints || []), ep],
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
        />
      )}

      {/* Route Groups */}
      {routeGroups.map((group, index: number) => (
        <RouteGroupEditor
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
