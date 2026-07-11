import React, { useState } from "react";
import { NodeProps, Position, Handle } from "@xyflow/react";
import { Globe, Plus, X } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, generateId } from "./shared";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";

const EVENT_OPTIONS = ["pageLoad","click", "hover", "drag", "dblclick", "keydown", "keyup", "submit", "other"];

const WebClientEventList = ({ nodeId, items = [], updateNode, data }: any) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [customEvent, setCustomEvent] = useState("");

  const handleAdd = () => {
    const newItems = [...items, { id: generateId(), name: "" }];
    updateNode(nodeId, { data: { ...data, events: newItems } });
    setEditingId(newItems[newItems.length - 1].id);
    setSelectedEvent("");
    setCustomEvent("");
  };

  const handleUpdate = (id: string, name: string) => {
    const newItems = items.map((item: any) => item.id === id ? { ...item, name } : item);
    updateNode(nodeId, { data: { ...data, events: newItems } });
  };

  const handleDelete = (id: string) => {
    const newItems = items.filter((item: any) => item.id !== id);
    updateNode(nodeId, { data: { ...data, events: newItems } });
  };

  const saveEvent = (id: string) => {
     const finalEvent = selectedEvent === "other" ? customEvent : selectedEvent;
     if (!finalEvent.trim()) {
        handleDelete(id);
     } else {
        handleUpdate(id, finalEvent.trim());
     }
     setEditingId(null);
  };

  if (!items.length && !editingId) {
     return (
       <div className="bg-secondary/20 p-1.5 border-t">
        <Button variant="ghost" size="sm" className="w-full h-6 text-xs text-muted-foreground hover:text-foreground" onClick={handleAdd}>
          <Plus size={12} className="mr-1" /> Add event
        </Button>
      </div>
     )
  }

  return (
    <>
      <div className="px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group">
        Events
        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all" onClick={handleAdd}>
          <Plus size={12} />
        </div>
      </div>
      <div className="flex flex-col">
        {items.map((item: any) => {
          const isEditing = editingId === item.id;
          return (
            <div key={item.id} className="flex flex-col px-3 py-1.5 border-b last:border-b-0 text-xs relative group/row hover:bg-secondary/20 nodrag">
              <Handle 
                type="source" 
                position={Position.Right} 
                id={`events-${item.id}`} 
                className="w-2 h-2 -right-1" 
                style={{ top: '50%' }} 
              />
              {isEditing ? (
                 <div className="flex flex-col gap-1 w-full" onBlur={(e) => {
                    const related = e.relatedTarget as HTMLElement | null;
                    if (related?.closest('[role="combobox"]')) return;
                    if (related?.closest('[role="listbox"]')) return;
                    if (related?.closest('[data-radix-popper-content-wrapper]')) return;

                    // Only trigger blur if focus leaves the container entirely
                    if (!e.currentTarget.contains(related)) {
                       if (selectedEvent === "other") {
                          saveEvent(item.id);
                       } else if (!selectedEvent) {
                          handleDelete(item.id);
                          setEditingId(null);
                       } else {
                          setEditingId(null);
                       }
                    }
                 }}>
                    <Select 
                       value={selectedEvent} 
                       onValueChange={(v) => {
                         setSelectedEvent(v);
                         if (v !== "other") {
                           handleUpdate(item.id, v);
                           setEditingId(null);
                         }
                       }}
                       onOpenChange={(open) => {
                         if (!open && !selectedEvent) {
                            handleDelete(item.id);
                            setEditingId(null);
                         } else if (!open && selectedEvent !== "other") {
                            setEditingId(null);
                         }
                       }}
                    >
                      <SelectTrigger className="h-6 text-xs w-full outline-none focus:ring-0 focus:ring-offset-0 bg-transparent border-input">
                        <SelectValue placeholder="Select event..." />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_OPTIONS.map(opt => (
                           <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {selectedEvent === "other" && (
                       <Input 
                          value={customEvent}
                          onChange={(e) => setCustomEvent(e.target.value)}
                          placeholder="Event name"
                          className="h-6 text-xs mt-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                               saveEvent(item.id);
                            }
                            if (e.key === "Escape") {
                               if (!item.name) handleDelete(item.id);
                               setEditingId(null);
                            }
                          }}
                       />
                    )}
                 </div>
              ) : (
                <div className="flex items-center justify-between w-full cursor-pointer" onClick={() => { 
                    setEditingId(item.id); 
                    const isStandard = EVENT_OPTIONS.includes(item.name);
                    setSelectedEvent(isStandard ? item.name : (item.name ? "other" : "")); 
                    setCustomEvent(isStandard ? "" : item.name);
                }}>
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

export const WebClientNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[200px] max-w-[300px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Globe} title="Web Client(page)" selected={selected} />
      <WebClientEventList nodeId={id} items={data.events} updateNode={updateNode} data={data} />
    </div>
  );
};
