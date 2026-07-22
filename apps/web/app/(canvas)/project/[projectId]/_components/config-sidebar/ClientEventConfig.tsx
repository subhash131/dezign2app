import React, { useState, useEffect } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { generateId, endpointInputParams, getInitialBody } from "../backend-nodes/graph-nodes/shared";
import { JsonPayloadEditor } from "../backend-nodes/graph-nodes/Editors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@workspace/ui/components/accordion";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Parameter, JSONValue, Endpoint, BackendNode, UIEventItem } from "@/types/canvas";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useParams } from "next/navigation";
import { Id } from "@workspace/backend/_generated/dataModel";
import { WEB_CLIENT_EVENTS } from "@workspace/canvas";

const EVENT_OPTIONS = [...WEB_CLIENT_EVENTS];

interface ClientEventConfigProps {
  id: string; // The event ID
  nodeId: string;
}

export const ClientEventConfig = ({ id, nodeId }: ClientEventConfigProps) => {
  const paramsHook = useParams();
  const projectId = paramsHook.projectId as Id<"projects">;
  
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  // Find the event item
  const parentNode = nodes.find((n) => n.id === nodeId);
  const currentEvents = parentNode?.data?.events || [];
  const item: UIEventItem | undefined = currentEvents.find((e) => e.id === id);

  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  
  const initialEvent = item?.event || "click";
  const isStandard = EVENT_OPTIONS.some(opt => opt === initialEvent);

  const [eventName, setEventName] = useState(item?.name || "");
  const [eventType, setEventType] = useState(isStandard ? initialEvent : (initialEvent ? "other" : "click"));
  const [customEvent, setCustomEvent] = useState(isStandard ? "" : initialEvent);
  const [eventSchema, setEventSchema] = useState(item?.schema || "");

  useEffect(() => {
    if (item) {
      setEventName(item.name || "");
      const evt = item.event || "click";
      const isStd = EVENT_OPTIONS.some(opt => opt === evt);
      setEventType(isStd ? evt : (evt ? "other" : "click"));
      setCustomEvent(isStd ? "" : evt);
      setEventSchema(item.schema || "");
    }
  }, [item]);

  const handleUpdateEvent = (name: string, finalEvent: string, schema: string) => {
    if (!parentNode) return;
    const currentNodeEvents = parentNode.data.events || [];
    const newEvents: UIEventItem[] = currentNodeEvents.map(e => e.id === id ? { ...e, name, event: finalEvent, schema } : e);
    updateNode(nodeId, { data: { ...parentNode.data, events: newEvents } });
  };

  // Find linked endpoint
  const getLinkedEndpoint = () => {
    const edge = edges.find((e) => e.source === nodeId && e.sourceHandle === `events-${id}`);
    if (!edge || !edge.targetHandle) return null;
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!targetNode) return null;
    const parts = edge.targetHandle.split("-in-");
    const endpointId = parts[parts.length - 1];
    if (!endpointId) return null;

    let endpoint: Endpoint | undefined = endpoints.find((ep) => ep.nodeId === targetNode.id && ep.id === endpointId);
    if (!endpoint) endpoint = targetNode.data?.endpoints?.find((ep: Endpoint) => ep.id === endpointId);
    if (!endpoint && targetNode.data?.routeGroups) {
      for (const group of targetNode.data.routeGroups) {
        endpoint = group.endpoints?.find((ep: Endpoint) => ep.id === endpointId);
        if (endpoint) break;
      }
    }
    if (!endpoint) return null;
    return { targetNode, endpoint };
  };

  const link = getLinkedEndpoint();
  const endpoint = link?.endpoint;

  const inferSchemaFromEndpoint = () => {
    if (!endpoint) return;
    const inferred: Record<string, string> = {};

    if (endpoint.pathParams) endpoint.pathParams.forEach(p => { if (p.name) inferred[p.name] = p.type || "string"; });
    if (endpoint.queryParams) endpoint.queryParams.forEach(p => { if (p.name) inferred[p.name] = p.type || "string"; });
    if (endpoint.headers) endpoint.headers.forEach(h => { if (h.name) inferred[h.name] = h.type || "string"; });
    
    if (endpoint.requestBody?.rawJson) {
       try {
         const parsed = JSON.parse(endpoint.requestBody.rawJson);
         Object.assign(inferred, parsed);
       } catch {}
    }

    const strVal = JSON.stringify(inferred, null, 2);
    setEventSchema(strVal);
    handleUpdateEvent(eventName, eventType === "other" ? customEvent : eventType, strVal);
    // toast.success("Inferred schema from connected endpoint!");
  };

  if (!item) return null;

  return (
    <div className="flex flex-col gap-6 font-sans">
      <Accordion type="single" collapsible defaultValue="settings" className="w-full">
        <AccordionItem value="settings" className="border-none">
          <AccordionTrigger className="py-0 hover:no-underline">
            <h3 className="text-[10px] py-2 font-bold text-muted-foreground uppercase tracking-wider text-left">Event Settings</h3>
          </AccordionTrigger>
          <AccordionContent className="pt-3 pb-0">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 p-3 bg-secondary/10 border rounded-lg">
          <div className="grid gap-1">
            <Label className="text-xs font-mono text-muted-foreground">Name</Label>
            <Input 
              className="h-8 text-xs bg-background" 
              value={eventName} 
              onChange={e => setEventName(e.target.value)} 
              onBlur={() => handleUpdateEvent(eventName, eventType === "other" ? customEvent : eventType, eventSchema)} 
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs font-mono text-muted-foreground">Type</Label>
            <div className="flex flex-col gap-1">
              <Select 
                 value={eventType} 
                 onValueChange={(v) => {
                   setEventType(v);
                   handleUpdateEvent(eventName, v === "other" ? customEvent : v, eventSchema);
                 }}
              >
                <SelectTrigger className="h-8 text-xs w-full bg-background focus:ring-1 focus:ring-ring focus:ring-offset-0">
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map(opt => (
                     <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {eventType === "other" && (
                 <Input 
                    value={customEvent}
                    onChange={(e) => setCustomEvent(e.target.value)}
                    onBlur={() => handleUpdateEvent(eventName, customEvent, eventSchema)}
                    placeholder="Custom event"
                    className="h-8 text-xs w-full"
                 />
              )}
            </div>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
               <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Input Schema</Label>
               {endpoint && (
                 <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2 shadow-sm" onClick={inferSchemaFromEndpoint}>
                   Fetch from Endpoint
                 </Button>
               )}
            </div>
            <JsonPayloadEditor
              title="Schema"
              value={(() => {
                if (!eventSchema) return undefined;
                try {
                  return JSON.parse(eventSchema);
                } catch {
                  return undefined;
                }
              })()}
              onChange={(val) => {
                const strVal = JSON.stringify(val);
                setEventSchema(strVal);
                handleUpdateEvent(eventName, eventType === "other" ? customEvent : eventType, strVal);
              }}
            />
          </div>
        </div>

        {endpoint ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            Triggers 
            <span className="font-mono bg-secondary/30 border px-1 py-0.5 rounded text-[10px]">
              {endpoint.type || "GET"} {endpoint.name}
            </span>
          </p>
        ) : (
          <p className="text-xs text-amber-500">
            No endpoint connected to this event.
          </p>
        )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
