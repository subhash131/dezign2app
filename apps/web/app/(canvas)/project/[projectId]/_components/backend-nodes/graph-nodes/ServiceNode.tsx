import React, { useState } from "react";
import { NodeProps } from "@xyflow/react";
import { Server, ChevronDown, ChevronUp } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EndpointList, MessagingResourceList } from "./shared";
import { Textarea } from "@workspace/ui/components/textarea";

export const ServiceNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const addEvent = useBackendCanvasStore((s) => s.addEvent);
  const updateEvent = useBackendCanvasStore((s) => s.updateEvent);
  const deleteEvent = useBackendCanvasStore((s) => s.deleteEvent);
  
  const consumedEvents = useBackendCanvasStore((s) => s.events).filter(e => e.nodeId === id && e.variant === 'consume');
  const publishedEvents = useBackendCanvasStore((s) => s.events).filter(e => e.nodeId === id && e.variant === 'publish');

  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[300px] max-w-[400px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Server} title="Service / API" colorClass="bg-blue-500/10 text-blue-700 dark:text-blue-400" selected={selected} />
      
      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>
      <EndpointList
        nodeId={id}
        title="Endpoints / Routes"
      />
      
      <MessagingResourceList
        nodeId={id}
        title="Consume Events (Listeners)"
        items={consumedEvents}
        variant="consume"
        resourceType="topics"
        onAdd={(item) => addEvent(id, 'consume', item)}
        onUpdate={(eventId, name) => updateEvent(eventId, { name })}
        onDelete={(eventId) => deleteEvent(eventId)}
        onUpdateItem={(eventId, changes) => updateEvent(eventId, changes)}
      />

      <MessagingResourceList
        nodeId={id}
        title="Publish Events (Background)"
        items={publishedEvents}
        variant="publish"
        resourceType="topics"
        onAdd={(item) => addEvent(id, 'publish', item)}
        onUpdate={(eventId, name) => updateEvent(eventId, { name })}
        onDelete={(eventId) => deleteEvent(eventId)}
        onUpdateItem={(eventId, changes) => updateEvent(eventId, changes)}
      />

      <div className="p-3 bg-secondary/10 flex flex-col gap-3 rounded-b-xl">
         <div 
           className="flex items-center justify-between cursor-pointer group"
           onClick={() => setConfigOpen(!configOpen)}
         >
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">Server Config</span>
            <div className="p-0.5 rounded hover:bg-secondary text-muted-foreground group-hover:text-foreground transition-all">
               {configOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
         </div>
         
         {configOpen && (
           <div className="flex flex-col gap-2.5 pt-2 border-t border-border/50">
             <div className="flex flex-col gap-1.5">
               <div className="flex items-center justify-between">
                 <Label htmlFor={`cors-${id}`} className="text-xs">Enable CORS</Label>
                 <Switch 
                   id={`cors-${id}`} 
                   className="nodrag"
                   checked={data.cors || false}
                   onCheckedChange={(val) => updateNode(id, { data: { ...data, cors: val } })}
                 />
               </div>
               {data.cors && (
                 <Input 
                   className="h-6 text-xs bg-background" 
                   placeholder="Allowed Origins (e.g. *, https://domain.com)" 
                   value={data.corsOrigins || ""}
                   onChange={(e) => updateNode(id, { data: { ...data, corsOrigins: e.target.value } })}
                 />
               )}
             </div>
             <div className="flex items-center justify-between gap-2">
               <Label className="text-xs shrink-0 text-muted-foreground">Port</Label>
               <Input 
                 className="h-6 text-xs w-24 text-right bg-background" 
                 placeholder="8080" 
                 value={data.port || ""}
                 onChange={(e) => updateNode(id, { data: { ...data, port: e.target.value } })}
               />
             </div>
             <div className="flex items-center justify-between gap-2">
               <Label className="text-xs shrink-0 text-muted-foreground">Rate Limit</Label>
               <Input 
                 className="h-6 text-xs w-24 text-right bg-background" 
                 placeholder="100/m" 
                 value={data.rateLimit || ""}
                 onChange={(e) => updateNode(id, { data: { ...data, rateLimit: e.target.value } })}
               />
             </div>
           </div>
         )}
      </div>
    </div>
  );
};
