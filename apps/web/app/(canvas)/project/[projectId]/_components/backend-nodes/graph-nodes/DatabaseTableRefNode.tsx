import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Database, Trash2 } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import { Textarea } from "@workspace/ui/components/textarea";

export const DatabaseTableRefNode = ({ id, data, selected }: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const storeEndpoints = useBackendCanvasStore((s) => s.endpoints);
  
  const entities = useBackendCanvasStore(useShallow((s) => s.nodes.filter(n => n.type === "entity" && n.data.dbType !== "vector")));

  // Derive which service endpoints connect to this database node
  const incomingEdges = edges.filter(e => e.target === id);
  const accessors = incomingEdges.map(edge => {
    const srcNode = nodes.find(n => n.id === edge.source);
    if (!srcNode) return null;

    const serviceName = srcNode.data.label || "Untitled Service";
    let routeName = "";
    let method = "";

    const sourceHandle = edge.sourceHandle || "";

    let epId = "";
    if (sourceHandle.startsWith("endpoint-out-")) {
      epId = sourceHandle.replace("endpoint-out-", "");
    } else if (sourceHandle.startsWith("publishedEvents-out-")) {
      epId = sourceHandle.replace("publishedEvents-out-", "");
    } else if (sourceHandle.startsWith("consumedEvents-in-")) {
      epId = sourceHandle.replace("consumedEvents-in-", "");
    } else {
      epId = sourceHandle;
    }

    let ep: { name?: string; type?: string; path?: string } | undefined;

    if (epId) {
      ep = storeEndpoints.find((e) => e.id === epId);
      if (!ep && srcNode.data.endpoints) {
        ep = srcNode.data.endpoints.find((e) => e.id === epId);
      }
      if (!ep && srcNode.data.routeGroups) {
        for (const group of srcNode.data.routeGroups) {
          ep = group.endpoints?.find((e) => e.id === epId);
          if (ep) break;
        }
      }
    }

    // Fallback: search storeEndpoints for endpoints attached to srcNode
    if (!ep) {
      const srcEndpoints = storeEndpoints.filter((e) => e.nodeId === srcNode.id);
      if (srcEndpoints.length > 0) {
        ep = srcEndpoints[0];
      } else if (srcNode.data.endpoints && srcNode.data.endpoints.length > 0) {
        ep = srcNode.data.endpoints[0];
      }
    }

    if (ep) {
      method = ep.type || "GET";
      routeName = (ep.name && ep.name.trim()) ? ep.name.trim() : (ep.path || `${method} Route`);
    } else {
      routeName = "Route";
    }

    return {
      id: edge.id,
      serviceName,
      routeName,
      method,
    };
  }).filter((x): x is { id: string; serviceName: string; routeName: string; method: string } => x !== null);

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
      
      {/* Description */}
      <div className="px-3 py-2 bg-secondary/5 border-b nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="description"
          value={data.description || ""}
          onChange={(e) => updateNode(id, { data: { ...data, description: e.target.value } })}
        />
      </div>
      
      <div className="p-2 flex flex-col gap-2">
         <Select 
           value={data.tableRef || ""} 
           onValueChange={(val) => {
             const entity = entities.find(e => e.id === val);
             updateNode(id, { 
               data: { 
                 ...data, 
                 tableRef: val, 
                 label: entity?.data.label || "Table Ref",
                 graphPosition: entity?.position
               } 
             });
           }}
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


      </div>

      {/* Accessed By */}
      <div className="flex flex-col border-t bg-secondary/20 nodrag">
        <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Accessed By</div>
        <div className="px-3 pb-2 flex flex-col gap-1.5">
          {accessors.length === 0
            ? <span className="text-[10px] text-muted-foreground italic px-1">No connections</span>
            : accessors.map(acc => (
                <div key={acc.id} className="flex flex-col px-2 py-1 border-l-2 border-orange-500/60 rounded-r gap-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {acc.method && (
                      <span className="px-1 py-0.5 rounded text-[8px] font-bold shrink-0 bg-orange-500/15 text-orange-700 dark:text-orange-400 uppercase leading-none">
                        {acc.method}
                      </span>
                    )}
                    <span className="font-semibold text-xs text-foreground truncate">
                      {acc.routeName}
                    </span>
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground truncate leading-tight">
                    {acc.serviceName}
                  </span>
                </div>
              ))
          }
        </div>
      </div>

      <Handle type="target" position={Position.Left} id="database-target" className="w-2 h-2" style={{ top: '20px' }} />
      <Handle type="source" position={Position.Right} id="database-source" className="w-2 h-2" style={{ top: '20px' }} />
    </div>
  );
};

