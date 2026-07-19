import React from "react";
import { WorkerTask, WorkerTaskTrigger, BackendNode } from "@/types/canvas";
import { LocalInput, LocalTextarea, generateId } from "../backend-nodes/graph-nodes/shared";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { SchemaEditor } from "../backend-nodes/graph-nodes/Editors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty, ComboboxGroup, ComboboxLabel } from "@workspace/ui/components/combobox";
import { Plus, Trash } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

const TriggerItemConfig = ({
  trigger,
  index,
  allTriggers,
  triggerNodes,
  onUpdate,
  onDelete
}: {
  trigger: WorkerTaskTrigger;
  index: number;
  allTriggers: any[];
  triggerNodes: BackendNode[];
  onUpdate: (updates: Partial<WorkerTaskTrigger>) => void;
  onDelete: () => void;
}) => {
  const currentTrigger = React.useMemo(() => {
    if (!trigger.value) return null;
    return allTriggers.find(t => (t.name || t.id) === trigger.value || t.id === trigger.value) || null;
  }, [trigger.value, allTriggers]);

  const [selectedServiceId, setSelectedServiceId] = React.useState<string>("");

  React.useEffect(() => {
    if (currentTrigger && currentTrigger.serviceId !== selectedServiceId) {
      setSelectedServiceId(currentTrigger.serviceId);
    }
  }, [currentTrigger?.serviceId]);

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg border bg-background/50 relative group">
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex items-center justify-between pr-8">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Type
        </span>
        <Select
          value={trigger.type}
          onValueChange={(v) => onUpdate({ type: v as "event" | "cron", value: "" })}
        >
          <SelectTrigger className="w-[120px] h-7 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="event" className="text-xs">Event / Endpoint</SelectItem>
            <SelectItem value="cron" className="text-xs">Cron Schedule</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {trigger.type === "event" ? (
        <div className="flex flex-col gap-2 mt-1">
          <Select 
            value={selectedServiceId} 
            onValueChange={(v) => {
              setSelectedServiceId(v);
              onUpdate({ value: "" });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select Service / Node" />
            </SelectTrigger>
            <SelectContent>
              {triggerNodes.length === 0 && <SelectItem value="none" disabled className="text-xs">No services found</SelectItem>}
              {triggerNodes.map(node => (
                <SelectItem key={node.id} value={node.id} className="text-xs">
                  {node.data.label || node.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedServiceId ? (
            <Select
              value={trigger.value || ""}
              onValueChange={(v) => onUpdate({ value: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select Topic / Event" />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const nodeOptions = allTriggers.filter(t => t.serviceId === selectedServiceId);
                  
                  if (nodeOptions.length === 0) return <SelectItem value="none" disabled className="text-xs">No resources found</SelectItem>;
                  
                  return nodeOptions.map(opt => (
                    <SelectItem key={opt.id} value={opt.id} className="text-xs">
                      {opt.name || opt.id}
                    </SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
          ) : (
            <div className="h-8 text-[10px] text-muted-foreground flex items-center px-3 bg-secondary/20 border rounded-md border-dashed">
              Select a service first
            </div>
          )}
        </div>
      ) : (
        <LocalInput
          className="h-8 text-xs bg-background/50 focus-visible:ring-1 mt-1"
          placeholder="e.g. 0 0 * * *"
          value={trigger.value || ""}
          onBlur={(e) => onUpdate({ value: e.target.value })}
        />
      )}
    </div>
  );
};

interface TaskConfigProps {
  id: string;
  nodeId: string;
}

export const TaskConfig = ({ id, nodeId }: TaskConfigProps) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const events = useBackendCanvasStore((s) => s.events);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);

  const messagingResources = React.useMemo(() => {
    return nodes.flatMap(n => {
      const data = n.data || {};
      const res = [
        ...(data.topics?.map(t => ({...t, type: 'topics', brokerId: n.id})) || []),
        ...(data.streams?.map(t => ({...t, type: 'streams', brokerId: n.id})) || []),
        ...(data.queues?.map(t => ({...t, type: 'queues', brokerId: n.id})) || []),
        ...(data.channels?.map(t => ({...t, type: 'channels', brokerId: n.id})) || [])
      ];
      return res.map(r => ({ ...r, nodeName: data.label || n.type }));
    });
  }, [nodes]);

  const allTriggers = React.useMemo(() => {
    return [
      ...events.filter(e => e.variant === 'publish').map(e => ({ ...e, serviceId: e.nodeId, triggerType: 'event' })),
      ...messagingResources.map(r => ({ ...r, serviceId: r.brokerId, triggerType: 'resource' })),
      ...endpoints.map(ep => ({ id: ep.id, name: `${ep.type} ${ep.name}`, serviceId: ep.nodeId, triggerType: 'endpoint' }))
    ];
  }, [events, messagingResources, endpoints]);

  const triggerNodes = React.useMemo(() => {
    const ids = new Set<string>(allTriggers.map(t => t.serviceId));
    return Array.from(ids).flatMap(id => {
      const n = nodes.find(n => n.id === id);
      return n ? [n] : [];
    });
  }, [allTriggers, nodes]);

  const edges = useBackendCanvasStore((s) => s.edges);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);

  const parentNode = nodes.find((n) => n.id === nodeId);
  if (!parentNode) return null;

  const item = parentNode.data.tasks?.find((t) => t.id === id);
  if (!item) return null;

  const triggers = item.triggers || [];

  const syncEdges = (newTriggers: WorkerTaskTrigger[]) => {
    const existingEdges = edges.filter(e => e.target === nodeId && e.targetHandle === `task-in-${id}`);
    const desiredEdges: any[] = [];
    
    newTriggers.forEach(trigger => {
      if (trigger.type === "event" && trigger.value) {
        const ev = events.find(e => (e.name || e.id) === trigger.value || e.id === trigger.value);
        const res = messagingResources.find(r => (r.name || r.id) === trigger.value || r.id === trigger.value);
        const ep = endpoints.find(e => e.id === trigger.value || `${e.type} ${e.name}` === trigger.value);

        let sourceNodeId = "";
        let sourceHandleId = "";

        if (ev) {
          sourceNodeId = ev.nodeId;
          sourceHandleId = `publishedEvents-out-${ev.id}`;
        } else if (res) {
          sourceNodeId = res.brokerId;
          sourceHandleId = `${res.type}:out:${res.id}`;
        } else if (ep) {
          sourceNodeId = ep.nodeId;
          sourceHandleId = `endpoint-out-${ep.id}`;
        }

        if (sourceNodeId && sourceHandleId) {
          desiredEdges.push({ sourceNodeId, sourceHandleId, sourceResourceId: ev?.id || res?.id || ep?.id });
        }
      }
    });

    existingEdges.forEach(ee => {
      const isDesired = desiredEdges.some(de => de.sourceNodeId === ee.source && de.sourceHandleId === ee.sourceHandle);
      if (!isDesired) {
        deleteEdge(ee.id);
      }
    });

    desiredEdges.forEach(de => {
      const exists = existingEdges.some(ee => ee.source === de.sourceNodeId && ee.sourceHandle === de.sourceHandleId);
      if (!exists) {
        addEdge({
          id: generateId(),
          source: de.sourceNodeId,
          target: nodeId,
          sourceHandle: de.sourceHandleId,
          targetHandle: `task-in-${id}`,
          type: "message",
          sourceResourceId: de.sourceResourceId,
          targetResourceId: id,
        });
      }
    });
  };

  const handleUpdate = (changes: Partial<WorkerTask>) => {
    if (changes.triggers) {
      syncEdges(changes.triggers);
    }

    if (parentNode.data.tasks) {
      const updatedList = parentNode.data.tasks.map((t) =>
        t.id === id ? { ...t, ...changes } : t
      );
      updateNode(nodeId, { data: { ...parentNode.data, tasks: updatedList } });
    }
  };

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12">
      <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-blue-500/15 text-blue-500 rounded border border-blue-500/20 shadow-sm">
            TASK
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {item.name}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          Configure worker task properties, trigger conditions, and schemas.
        </span>
      </div>

      <div className="flex flex-col gap-2.5 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Description
        </span>
        <LocalTextarea
          className="min-h-[60px] text-sm resize-none bg-background/50 focus-visible:ring-1"
          placeholder="Describe what this task does..."
          value={item.description || ""}
          onBlur={(e) => handleUpdate({ description: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Triggers
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs px-2"
            onClick={() => {
              const newTriggers = [...triggers, { id: generateId(), type: "event" as const, value: "" }];
              handleUpdate({ triggers: newTriggers });
            }}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Trigger
          </Button>
        </div>
        
        {triggers.length === 0 ? (
          <div className="h-16 flex items-center justify-center text-xs text-muted-foreground bg-secondary/20 border border-dashed rounded-lg">
            No triggers configured
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-2">
            {triggers.map((trigger, i) => (
              <TriggerItemConfig
                key={trigger.id}
                trigger={trigger}
                index={i}
                allTriggers={allTriggers}
                triggerNodes={triggerNodes}
                onUpdate={(updates) => {
                  const newTriggers = [...triggers];
                  if(newTriggers[i])
                    newTriggers[i] = { ...newTriggers[i], ...updates };
                  handleUpdate({ triggers: newTriggers });
                }}
                onDelete={() => {
                  const newTriggers = triggers.filter(t => t.id !== trigger.id);
                  handleUpdate({ triggers: newTriggers });
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <SchemaEditor
          title="Input Schema"
          schema={item.inputSchema}
          onChange={(schema) => handleUpdate({ inputSchema: schema })}
        />
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <SchemaEditor
          title="Output Schema"
          schema={item.outputSchema}
          onChange={(schema) => handleUpdate({ outputSchema: schema })}
        />
      </div>

      <div className="flex flex-col gap-4 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Retry Policy
          </span>
          <Select
            value={item.retryPolicy || "default"}
            onValueChange={(v) => handleUpdate({ retryPolicy: v === "default" ? undefined : v })}
          >
            <SelectTrigger className="w-[180px] text-xs">
              <SelectValue placeholder="Use Default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default" className="text-xs">
                Use Default
              </SelectItem>
              <SelectItem value="NONE" className="text-xs">
                None
              </SelectItem>
              <SelectItem value="EXPONENTIAL_BACKOFF" className="text-xs">
                Exponential Backoff
              </SelectItem>
              <SelectItem value="FIXED_INTERVAL" className="text-xs">
                Fixed Interval
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            Timeout
          </span>
          <LocalInput
            className="w-32 text-xs text-right"
            placeholder="e.g. 30s"
            value={item.timeout || ""}
            onBlur={(e) => handleUpdate({ timeout: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
};
