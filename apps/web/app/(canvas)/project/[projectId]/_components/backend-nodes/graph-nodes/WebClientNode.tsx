import React, { useState } from "react";
import { NodeProps, Position, Handle } from "@xyflow/react";
import { Globe, Plus, X, Play, Settings, FlaskConical } from "lucide-react";
import { BackendNode, Endpoint, UIEventItem } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, generateId } from "./shared";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { WEB_CLIENT_EVENTS } from "@workspace/canvas";

const EVENT_OPTIONS = [...WEB_CLIENT_EVENTS];




export interface WebClientEventListProps {
  nodeId: string;
  items?: UIEventItem[];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
  onTriggerEvent: (triggerInfo: { event: UIEventItem; targetNode: BackendNode; endpoint: Endpoint }) => void;
  onManageTestCases: (info: { event: UIEventItem; targetNode: BackendNode; endpoint: Endpoint }) => void;
}

const WebClientEventList = ({ nodeId, items = [], updateNode, data, onTriggerEvent, onManageTestCases }: WebClientEventListProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEvent, setEditEvent] = useState("");
  const [customEvent, setCustomEvent] = useState("");

  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);


  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  const getLinkedEndpoint = (eventId: string) => {
    const edge = edges.find((e) => e.source === nodeId && e.sourceHandle === `events-${eventId}`);
    if (!edge || !edge.targetHandle) return null;

    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!targetNode) return null;

    const parts = edge.targetHandle.split("-in-");
    const endpointId = parts[parts.length - 1];
    if (!endpointId) return null;

    // Endpoints are persisted in a separate Convex collection and hydrated
    // into the store, so they may not exist on targetNode.data.
    let endpoint: Endpoint | undefined = endpoints.find((ep) => ep.nodeId === targetNode.id && ep.id === endpointId);

    // Backward compatibility for older node snapshots that embedded endpoints.
    if (!endpoint) endpoint = targetNode.data?.endpoints?.find((ep) => ep.id === endpointId);

    // Search grouped
    if (!endpoint && targetNode.data?.routeGroups) {
      for (const group of targetNode.data.routeGroups) {
        endpoint = group.endpoints?.find((ep) => ep.id === endpointId);
        if (endpoint) break;
      }
    }

    if (!endpoint) return null;

    return { targetNode, endpoint };
  };

  const handleAdd = () => {
    const newItem = {
      id: generateId(), name: "New Action", event: "click"
    };
    const newItems = [...items, newItem];
    updateNode(nodeId, { data: { ...data, events: newItems } });
    setEditingId(newItem.id);
    setEditName("New Action");
    setEditEvent("click");
    setCustomEvent("");
  };

  const handleUpdate = (id: string, name: string, event: string) => {
    const newItems = items.map((item) => item.id === id ? { ...item, name, event } : item);
    updateNode(nodeId, { data: { ...data, events: newItems } });
  };

  const handleDelete = (id: string) => {
    const newItems = items.filter((item) => item.id !== id);
    updateNode(nodeId, { data: { ...data, events: newItems } });
  };

  const saveEvent = (id: string) => {
     const finalEvent = editEvent === "other" ? customEvent : editEvent;
     const finalName = editName.trim() || "Unnamed Action";
     handleUpdate(id, finalName, finalEvent.trim());
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
        {items.map((item) => {
          const isEditing = editingId === item.id;
          const link = getLinkedEndpoint(item.id);
          const displayEvent = (item.event as string) || item.name;

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
                 <div className="flex flex-col gap-1.5 w-full" onBlur={(e) => {
                    const related = e.relatedTarget as HTMLElement | null;
                    if (related?.closest('[role="combobox"]')) return;
                    if (related?.closest('[role="listbox"]')) return;
                    if (related?.closest('[data-radix-popper-content-wrapper]')) return;

                    if (!e.currentTarget.contains(related)) {
                       saveEvent(item.id);
                    }
                 }}>
                    <Input 
                       value={editName}
                       onChange={(e) => setEditName(e.target.value)}
                       placeholder="Action name (e.g. sendMessage)"
                       className="h-6 text-xs"
                       autoFocus
                       onKeyDown={(e) => {
                          if (e.key === "Enter") saveEvent(item.id);
                          if (e.key === "Escape") setEditingId(null);
                       }}
                    />
                    <div className="flex items-center gap-1">
                      <Select 
                         value={editEvent} 
                         onValueChange={(v) => setEditEvent(v)}
                      >
                        <SelectTrigger className="h-6 text-xs w-full bg-background focus:ring-1 focus:ring-ring focus:ring-offset-0">
                          <SelectValue placeholder="Event type" />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_OPTIONS.map(opt => (
                             <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {editEvent === "other" && (
                         <Input 
                            value={customEvent}
                            onChange={(e) => setCustomEvent(e.target.value)}
                            placeholder="Custom event"
                            className="h-6 text-xs w-full"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEvent(item.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                         />
                      )}
                    </div>
                 </div>
              ) : (
                <div 
                  className="flex items-center justify-between w-full cursor-pointer gap-2" 
                  onClick={() => { 
                      setEditingId(item.id); 
                      setEditName(item.name || "");
                      const evt = item.event || item.name || "";
                      const isStandard = (EVENT_OPTIONS as readonly string[]).includes(evt);
                      setEditEvent((isStandard ? evt : (evt ? "other" : "click"))); 
                      setCustomEvent(isStandard ? "" : evt);
                  }}
                >
                   <div className="flex flex-col gap-0.5 overflow-hidden">
                       <span className="font-medium truncate">{item.name}</span>
                       <span className="text-[9px] text-muted-foreground font-mono truncate">{displayEvent}</span>
                   </div>
                   <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                     {link && (
                       <button
                         type="button"
                         className="flex items-center justify-center p-1 rounded hover:bg-green-500/10 text-green-500 transition-all cursor-pointer"
                         onClick={(e) => {
                           e.stopPropagation();
                           onTriggerEvent({ event: item, targetNode: link.targetNode, endpoint: link.endpoint });
                         }}
                         title={`Trigger simulated request: ${link.endpoint.type || "GET"} ${link.endpoint.name}`}
                       >
                         <Play size={10} className="fill-green-600 text-green-600" />
                       </button>
                     )}
                     <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-all">
                       {link && (
                         <div 
                           className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer" 
                           onClick={(e) => { e.stopPropagation(); onManageTestCases({ event: item, targetNode: link.targetNode, endpoint: link.endpoint }); }}
                           title="Manage Test Cases"
                         >
                           <FlaskConical size={12} />
                         </div>
                       )}
                       <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer" onClick={(e) => { e.stopPropagation(); setActiveConfigItem({ type: 'clientEvent', id: item.id, nodeId }); }}>
                          <Settings size={12} />
                       </div>
                       <div className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                          <X size={12} />
                       </div>
                     </div>
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
      
      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>

      <WebClientEventList 
        nodeId={id} 
        items={data.events} 
        updateNode={updateNode} 
        data={data} 
        onTriggerEvent={(triggerInfo) => useBackendCanvasStore.getState().setActiveConfigItem({ type: 'eventTesting', id: triggerInfo.event.id, nodeId: id, targetNodeId: triggerInfo.targetNode.id, endpointId: triggerInfo.endpoint.id, initialTab: 'trigger' })}
        onManageTestCases={(info) => useBackendCanvasStore.getState().setActiveConfigItem({ type: 'eventTesting', id: info.event.id, nodeId: id, targetNodeId: info.targetNode.id, endpointId: info.endpoint.id, initialTab: 'test-cases' })}
      />

    </div>
  );
};
