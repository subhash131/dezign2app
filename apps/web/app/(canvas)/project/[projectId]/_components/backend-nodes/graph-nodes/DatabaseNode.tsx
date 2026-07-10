import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Database, Trash2 } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

export const DatabaseNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const entities = useBackendCanvasStore((s) => s.nodes.filter(n => n.type === "entity"));

  const selectedEntity = entities.find(e => e.id === data.tableRef);

  return (
    <div className={cn("shadow-md rounded-xl bg-card border-2 min-w-[200px] max-w-[300px] flex flex-col", selected ? "border-primary" : "border-border")}>
      <div className={cn("px-3 py-2 border-b flex items-center justify-between group rounded-t-xl bg-orange-500/10 text-orange-700 dark:text-orange-400")}>
        <div className="flex items-center flex-1">
          <Database size={14} className="mr-2 shrink-0" />
          <div className="flex flex-col flex-1">
             <span className="text-[9px] uppercase font-bold tracking-wider opacity-70">Table Reference</span>
          </div>
        </div>
        <div 
          className="opacity-0 group-hover:opacity-100 flex items-center justify-center p-1 rounded hover:bg-black/10 transition-all cursor-pointer ml-2 shrink-0"
          onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
        >
          <Trash2 size={14} />
        </div>
      </div>
      
      <div className="p-2 flex flex-col gap-2">
         <Select 
           value={data.tableRef || ""} 
           onValueChange={(val) => updateNode(id, { data: { ...data, tableRef: val, label: entities.find(e => e.id === val)?.data.label || "Table Ref" } })}
         >
           <SelectTrigger className="h-8 text-xs">
             <SelectValue placeholder="Select a Table..." />
           </SelectTrigger>
           <SelectContent>
             {entities.map(e => (
               <SelectItem key={e.id} value={e.id}>{e.data.label || "Untitled"}</SelectItem>
             ))}
           </SelectContent>
         </Select>

         {selectedEntity && selectedEntity.data.columns && (
           <div className="mt-2 flex flex-col gap-1 px-1 max-h-[150px] overflow-y-auto">
             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Columns</span>
             {selectedEntity.data.columns.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">{c.name}</span>
                  <span className="text-muted-foreground text-[10px]">{c.type}</span>
                </div>
             ))}
           </div>
         )}
      </div>

      <Handle type="target" position={Position.Left} className="w-2 h-2" style={{ top: '20px' }} />
      <Handle type="source" position={Position.Right} className="w-2 h-2" style={{ top: '20px' }} />
    </div>
  );
};
