import React from "react";
import { NodeProps } from "@xyflow/react";
import { Server } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Input } from "@workspace/ui/components/input";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader, EndpointList } from "./shared";

export const ServiceNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[300px] max-w-[400px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <NodeHeader id={id} data={data} icon={Server} title="Service / API" colorClass="bg-blue-500/10 text-blue-700 dark:text-blue-400" selected={selected} />
      
      <div className="p-3 border-b bg-secondary/10 flex flex-col gap-3">
         <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Server Config</span>
         </div>
         <div className="flex flex-col gap-2.5">
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
      </div>

      <EndpointList nodeId={id} title="Endpoints / Routes" items={data.endpoints || []} field="endpoints" updateNode={updateNode} data={data} />
    </div>
  );
};
