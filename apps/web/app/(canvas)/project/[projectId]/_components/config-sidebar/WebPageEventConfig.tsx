import React, { useState, useEffect } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { BackendNode, UIEventItem, Parameter, Schema, PageSection } from "@/types/canvas";
import { Endpoint, WEB_PAGE_EVENTS, GlobalStoreAction } from "@workspace/canvas";
import {
  TargetEndpointSection,
  EventPropertiesSection,
  EventNavigationSection,
  RequestConfigSection,
} from "./web-page-event-config";
import { RequestBodyMode } from "./RequestBodyEditor";
import { generateId } from "../backend-nodes/graph-nodes/common";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Sparkles, Radio, Wifi, Video, RefreshCw, Database } from "lucide-react";

const EVENT_OPTIONS = [...WEB_PAGE_EVENTS];

const SERVER_NODE_TYPES = [
  "service",
  "gateway",
  "serverless",
  "langgraph",
  "worker",
  "external",
];

/** Collect all endpoints from a node */
function collectEndpoints(
  node: BackendNode,
  storeEndpoints: (Endpoint & { nodeId: string })[],
): Endpoint[] {
  const results: Endpoint[] = [];

  const persisted = storeEndpoints.filter((ep) => ep.nodeId === node.id);
  results.push(...persisted);

  if (node.data.endpoints) {
    for (const ep of node.data.endpoints) {
      if (!results.find((r) => r.id === ep.id)) results.push(ep);
    }
  }

  if (node.data.routeGroups) {
    for (const group of node.data.routeGroups) {
      for (const ep of group.endpoints || []) {
        if (!results.find((r) => r.id === ep.id)) results.push(ep);
      }
    }
  }

  return results;
}

export interface WebPageEventConfigProps {
  id: string; // The action/event ID
  nodeId: string;
}

export const WebPageEventConfig = ({ id, nodeId }: WebPageEventConfigProps) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const updateEndpoint = useBackendCanvasStore((s) => s.updateEndpoint);
  const onConnect = useBackendCanvasStore((s) => s.onConnect);
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);

  const parentNode = nodes.find((n) => n.id === nodeId);
  const sections: PageSection[] = parentNode?.data?.sections || [];
  const item: UIEventItem | undefined = sections
    .flatMap((s) => s.actions || [])
    .find((e) => e.id === id);

  const initialEvent = item?.event || "click";
  const isStandard = EVENT_OPTIONS.some((opt) => opt === initialEvent);

  const [eventName, setEventName] = useState(item?.name || "");
  const [eventType, setEventType] = useState(
    isStandard ? initialEvent : initialEvent ? "other" : "click",
  );
  const [customEvent, setCustomEvent] = useState(
    isStandard ? "" : initialEvent,
  );
  const [navType, setNavType] = useState<"link" | "router">(
    item?.navigationType || "link",
  );
  const [navCond, setNavCond] = useState<
    "direct" | "on_success" | "on_condition" | "on_error"
  >(item?.navigationCondition || "direct");
  const [condCode, setCondCode] = useState(item?.conditionCode || "");

  const [description, setDescription] = useState(item?.description || "");
  const [uiPrompt, setUiPrompt] = useState(item?.uiPrompt || "");

  const [sseConfig, setSseConfig] = useState(item?.sseConfig || {});
  const [wsConfig, setWsConfig] = useState(item?.wsConfig || {});
  const [webRtcConfig, setWebRtcConfig] = useState(item?.webRtcConfig || {});
  const [pollingConfig, setPollingConfig] = useState(item?.pollingConfig || {});

  useEffect(() => {
    if (item) {
      setEventName(item.name || "");
      const evt = item.event || "click";
      const isStd = EVENT_OPTIONS.some((opt) => opt === evt);
      setEventType(isStd ? evt : evt ? "other" : "click");
      setCustomEvent(isStd ? "" : evt);
      setNavType(item.navigationType || "link");
      setNavCond(item.navigationCondition || "direct");
      setCondCode(item.conditionCode || "");
      setDescription(item.description || "");
      setUiPrompt(item.uiPrompt || "");
      setSseConfig(item.sseConfig || {});
      setWsConfig(item.wsConfig || {});
      setWebRtcConfig(item.webRtcConfig || {});
      setPollingConfig(item.pollingConfig || {});
    }
  }, [item]);

  const updateActionInParent = (changes: Partial<UIEventItem>) => {
    if (!parentNode) return;
    const currentSections: PageSection[] = parentNode.data.sections || [];
    const updatedSections = currentSections.map((sec) => ({
      ...sec,
      actions: (sec.actions || []).map((act) =>
        act.id === id ? { ...act, ...changes } : act,
      ),
    }));
    updateNode(nodeId, { data: { ...parentNode.data, sections: updatedSections } });
  };

  const handleUpdateEvent = (
    name: string,
    finalEvent: string,
    extraChanges?: Partial<UIEventItem>,
  ) => {
    if (!parentNode) return;

    updateActionInParent({
      name,
      event: finalEvent,
      navigationType:
        finalEvent === "navigateToPage"
          ? "link"
          : extraChanges?.navigationType ?? navType,
      navigationCondition: extraChanges?.navigationCondition ?? navCond,
      conditionCode: extraChanges?.conditionCode ?? condCode,
      ...extraChanges,
    });

    const store = useBackendCanvasStore.getState();
    const existingEdge = store.edges.find(
      (e) => e.source === nodeId && e.sourceHandle === `events-${id}`,
    );

    if (finalEvent !== "navigateToPage") {
      if (existingEdge) {
        const targetNode = store.nodes.find((n) => n.id === existingEdge.target);
        if (targetNode && targetNode.type === "page_ref") {
          store.deleteEdge(existingEdge.id);
          const remainingEdges = store.edges.filter(
            (e) => e.target === targetNode.id && e.id !== existingEdge.id,
          );
          if (remainingEdges.length === 0) store.deleteNode(targetNode.id);
        }
      }
    } else if (!existingEdge) {
      const currentNode = store.nodes.find((n) => n.id === nodeId);
      const pos = currentNode?.position || { x: 100, y: 100 };
      const newRefId = crypto.randomUUID();
      store.addNode({
        id: newRefId,
        type: "page_ref",
        position: { x: pos.x + 340, y: pos.y + 60 },
        data: { label: "Page Ref", description: "Target page reference" },
      });
      store.addEdge({
        id: `edge-${Date.now()}`,
        source: nodeId,
        target: newRefId,
        sourceHandle: `events-${id}`,
        targetHandle: "page-ref-in",
        type: "connection",
      });
    }
  };

  const updateEventFields = (changes: Partial<UIEventItem>) => {
    updateActionInParent(changes);
  };

  const existingEdge = edges.find(
    (e) =>
      (e.source === nodeId && e.sourceHandle === `events-${id}`) ||
      (e.target === nodeId && e.targetHandle === `events-${id}`),
  );

  const getLinkedEndpoint = () => {
    let targetNodeId: string | undefined;
    let endpointId: string | undefined;

    if (existingEdge) {
      const isSource = existingEdge.source === nodeId;
      targetNodeId = isSource ? existingEdge.target : existingEdge.source;
      const handle = isSource ? existingEdge.targetHandle : existingEdge.sourceHandle;
      if (handle) {
        const parts = handle.split("-in-");
        endpointId = parts[parts.length - 1];
      }
    }

    if (!targetNodeId) return null;
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    if (!targetNode) return null;

    let targetEndpoint: Endpoint | undefined;
    if (endpointId) {
      const storeEndpoints = endpoints.filter((ep) => ep.nodeId === targetNodeId && ep.id === endpointId);
      if (storeEndpoints.length > 0) targetEndpoint = storeEndpoints[0];
      if (!targetEndpoint && targetNode.data.endpoints) targetEndpoint = targetNode.data.endpoints.find((ep: Endpoint) => ep.id === endpointId);
      if (!targetEndpoint && targetNode.data.routeGroups) {
        for (const group of targetNode.data.routeGroups) {
          targetEndpoint = group.endpoints?.find((ep: Endpoint) => ep.id === endpointId);
          if (targetEndpoint) break;
        }
      }
    }

    if (!targetEndpoint) {
      const allTargetEndpoints = collectEndpoints(targetNode, endpoints);
      if (allTargetEndpoints.length > 0) targetEndpoint = allTargetEndpoints[0];
    }

    return { targetNode, endpoint: targetEndpoint };
  };

  const link = getLinkedEndpoint();
  const linkedTargetNode = link?.targetNode;
  const endpoint = link?.endpoint;

  const serviceNodes = nodes.filter((n) => n.id !== nodeId && SERVER_NODE_TYPES.includes(n.type));
  const currentServiceId = linkedTargetNode?.id || "";
  const currentEndpointId = endpoint?.id || "";
  const availableEndpoints = linkedTargetNode ? collectEndpoints(linkedTargetNode, endpoints) : [];

  const handleServiceChange = (serviceId: string) => {
    if (existingEdge) deleteEdge(existingEdge.id);
    if (serviceId === "none" || !serviceId) return;
    const targetService = serviceNodes.find((n) => n.id === serviceId);
    if (!targetService) return;
    const endpointsList = collectEndpoints(targetService, endpoints);
    if (endpointsList.length > 0 && endpointsList[0]) {
      onConnect({
        source: nodeId,
        target: serviceId,
        sourceHandle: `events-${id}`,
        targetHandle: `endpoint-in-${endpointsList[0].id}`,
      });
    }
  };

  const handleEndpointChange = (endpointId: string) => {
    if (!currentServiceId) return;
    if (existingEdge) deleteEdge(existingEdge.id);
    if (endpointId === "none" || !endpointId) return;
    onConnect({
      source: nodeId,
      target: currentServiceId,
      sourceHandle: `events-${id}`,
      targetHandle: `endpoint-in-${endpointId}`,
    });
  };

  if (!item) return <div className="p-4 text-xs text-muted-foreground">Action not found.</div>;

  const isNavigateToPage = eventType === "navigateToPage";
  const isSse = eventType === "sse";
  const isWebsocket = eventType === "websocket";
  const isWebrtc = eventType === "webrtc";
  const isPolling = eventType === "polling";

  const isAuthRequired = Boolean(endpoint ? endpoint.requireAuth !== false : parentNode?.data?.requireAuth !== false);

  const headers: Parameter[] = React.useMemo(() => {
    let baseHeaders = endpoint?.headers?.length ? [...endpoint.headers] : item?.headers?.length ? [...item.headers] : [];
    if (isAuthRequired && !baseHeaders.some((h) => h.name.toLowerCase() === "authorization")) {
      baseHeaders = [{ id: "auth-bearer-header", name: "Authorization", type: "string", required: true, value: "Bearer <token>" }, ...baseHeaders];
    }
    return baseHeaders;
  }, [endpoint?.headers, item?.headers, isAuthRequired]);

  const pathParams: Parameter[] = React.useMemo(() => (endpoint?.pathParams?.length ? endpoint.pathParams : item?.pathParams || []), [endpoint?.pathParams, item?.pathParams]);
  const queryParams: Parameter[] = React.useMemo(() => (endpoint?.queryParams?.length ? endpoint.queryParams : item?.queryParams || []), [endpoint?.queryParams, item?.queryParams]);
  const requestBody: Schema = React.useMemo(() => endpoint?.requestBody || item?.requestBody || { id: generateId(), fields: [] }, [endpoint?.requestBody, item?.requestBody]);
  const requestBodyMode: RequestBodyMode = React.useMemo(() => endpoint?.requestBodyMode || item?.requestBodyMode || "field_builder", [endpoint?.requestBodyMode, item?.requestBodyMode]);

  return (
    <div className="flex flex-col gap-5 font-sans">
      <Accordion
        type="multiple"
        defaultValue={isNavigateToPage ? ["navigation", "settings", "ai_context"] : ["connection", "settings", "request_config", "ai_context", "sse_config", "ws_config", "webrtc_config", "polling_config"]}
        className="w-full flex flex-col gap-3 border-none"
      >
        {!isNavigateToPage && (
          <TargetEndpointSection
            currentServiceId={currentServiceId}
            currentEndpointId={currentEndpointId}
            serviceNodes={serviceNodes}
            availableEndpoints={availableEndpoints}
            linkedTargetNode={linkedTargetNode}
            endpoint={endpoint}
            handleServiceChange={handleServiceChange}
            handleEndpointChange={handleEndpointChange}
          />
        )}

        <EventPropertiesSection
          eventName={eventName}
          eventType={eventType}
          customEvent={customEvent}
          eventOptions={EVENT_OPTIONS}
          isNavigateToPage={isNavigateToPage}
          setEventName={setEventName}
          setEventType={setEventType}
          setCustomEvent={setCustomEvent}
          handleUpdateEvent={handleUpdateEvent}
        />

        <AccordionItem value="ai_context" className="border rounded-lg bg-card overflow-hidden">
          <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between">
            <span className="flex items-center gap-2"><Sparkles size={14} className="text-indigo-400" /> AI Action Prompts</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-1 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Action Description</Label>
              <Textarea value={description} onChange={(e) => { setDescription(e.target.value); updateEventFields({ description: e.target.value }); }} placeholder="Describe what this action does..." className="min-h-[70px] text-xs resize-none" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Trigger UI Prompt</Label>
              <Textarea value={uiPrompt} onChange={(e) => { setUiPrompt(e.target.value); updateEventFields({ uiPrompt: e.target.value }); }} placeholder="Describe how the trigger UI should look..." className="min-h-[70px] text-xs resize-none" />
            </div>
          </AccordionContent>
        </AccordionItem>

        {isSse && (
          <AccordionItem value="sse_config" className="border border-amber-500/30 rounded-lg bg-amber-500/5 overflow-hidden">
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="flex items-center gap-2"><Radio size={14} /> SSE Setup</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Reconnect Strategy</Label>
                <Select value={sseConfig.reconnectStrategy || "exponential"} onValueChange={(val: any) => { const next = { ...sseConfig, reconnectStrategy: val }; setSseConfig(next); updateEventFields({ sseConfig: next }); }}>
                  <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="exponential">Exponential</SelectItem><SelectItem value="linear">Linear</SelectItem><SelectItem value="none">None</SelectItem></SelectContent>
                </Select>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {isWebsocket && (
          <AccordionItem value="ws_config" className="border border-cyan-500/30 rounded-lg bg-cyan-500/5 overflow-hidden">
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-cyan-600 dark:text-cyan-400">
              <span className="flex items-center gap-2"><Wifi size={14} /> WebSocket Setup</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1 space-y-3">
              <div className="space-y-1"><Label className="text-xs">Heartbeat Interval (ms)</Label><Input type="number" value={wsConfig.heartbeatInterval ?? 30000} onChange={(e) => { const next = { ...wsConfig, heartbeatInterval: parseInt(e.target.value, 10) }; setWsConfig(next); updateEventFields({ wsConfig: next }); }} className="h-8 text-xs bg-background" /></div>
            </AccordionContent>
          </AccordionItem>
        )}

        {isWebrtc && (
          <AccordionItem value="webrtc_config" className="border border-purple-500/30 rounded-lg bg-purple-500/5 overflow-hidden">
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-purple-600 dark:text-purple-400">
              <span className="flex items-center gap-2"><Video size={14} /> WebRTC Setup</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1 space-y-3">
              <div className="space-y-1"><Label className="text-xs">Signaling Server URL</Label><Input value={webRtcConfig.signalingServer || ""} onChange={(e) => { const next = { ...webRtcConfig, signalingServer: e.target.value }; setWebRtcConfig(next); updateEventFields({ webRtcConfig: next }); }} className="h-8 text-xs bg-background" /></div>
            </AccordionContent>
          </AccordionItem>
        )}

        {isPolling && (
          <AccordionItem value="polling_config" className="border border-blue-500/30 rounded-lg bg-blue-500/5 overflow-hidden">
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-blue-600 dark:text-blue-400">
              <span className="flex items-center gap-2"><RefreshCw size={14} /> Polling Setup</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1 space-y-3">
              <div className="space-y-1"><Label className="text-xs">Interval (ms)</Label><Input type="number" value={pollingConfig.intervalMs ?? 5000} onChange={(e) => { const next = { ...pollingConfig, intervalMs: parseInt(e.target.value, 10) }; setPollingConfig(next); updateEventFields({ pollingConfig: next }); }} className="h-8 text-xs bg-background" /></div>
            </AccordionContent>
          </AccordionItem>
        )}

        {(() => {
          const stateStoreNodes = nodes.filter((n) => n.type === "state_store");
          const storeBinding = item?.storeActionBinding;
          if (stateStoreNodes.length === 0) return null;

          return (
            <AccordionItem value="store_action_binding" className="border border-indigo-500/30 rounded-lg bg-indigo-500/5 overflow-hidden">
              <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                <span className="flex items-center gap-2">
                  <Database size={14} /> State Store Action Binding
                </span>
                {storeBinding && (
                  <span className="text-[10px] font-mono font-normal bg-indigo-500/15 px-1.5 py-0.5 rounded border border-indigo-500/30">
                    {storeBinding.storeName}.{storeBinding.actionName}()
                  </span>
                )}
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-1 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Target State Store</Label>
                  <Select
                    value={storeBinding?.storeNodeId || "none"}
                    onValueChange={(storeId) => {
                      if (storeId === "none") {
                        updateActionInParent({ storeActionBinding: undefined });
                      } else {
                        const sn = stateStoreNodes.find((s) => s.id === storeId);
                        const storeActions = sn?.data?.actions || [];
                        const firstAction = storeActions[0];
                        updateActionInParent({
                          storeActionBinding: {
                            storeNodeId: storeId,
                            storeName: sn?.data?.storeName || sn?.data?.label || "App",
                            actionId: firstAction?.id,
                            actionName: firstAction?.name,
                            actionType: firstAction?.actionType,
                          },
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Select State Store..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (No store binding)</SelectItem>
                      {stateStoreNodes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.data?.storeName || s.data?.label || "Store"} ({s.data?.scope || "global"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {storeBinding?.storeNodeId && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Store Action to Trigger</Label>
                    <Select
                      value={storeBinding.actionId || "none"}
                      onValueChange={(actId) => {
                        const sn = stateStoreNodes.find((s) => s.id === storeBinding.storeNodeId);
                        const storeActions = sn?.data?.actions || [];
                        const action = storeActions.find((a) => a.id === actId);
                        if (action) {
                          updateActionInParent({
                            storeActionBinding: {
                              ...storeBinding,
                              actionId: action.id,
                              actionName: action.name,
                              actionType: action.actionType,
                            },
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs bg-background font-mono">
                        <SelectValue placeholder="Select Action..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const sn = stateStoreNodes.find((s) => s.id === storeBinding.storeNodeId);
                          const storeActions = sn?.data?.actions || [];
                          if (storeActions.length === 0) {
                            return <SelectItem value="none" disabled>No actions defined on store</SelectItem>;
                          }
                          return storeActions.map((act) => (
                            <SelectItem key={act.id} value={act.id}>
                              {act.name}() [{act.actionType}]
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })()}

        {!isNavigateToPage && (
          <RequestConfigSection
            headers={headers}
            pathParams={pathParams}
            queryParams={queryParams}
            requestBody={requestBody}
            requestBodyMode={requestBodyMode}
            connectedEndpoint={endpoint}
            onHeadersChange={(h) => updateEventFields({ headers: h })}
            onPathParamsChange={(p) => updateEventFields({ pathParams: p })}
            onQueryParamsChange={(q) => updateEventFields({ queryParams: q })}
            onRequestBodyChange={(r) => updateEventFields({ requestBody: r })}
            onRequestBodyModeChange={(m) => updateEventFields({ requestBodyMode: m })}
          />
        )}

        {isNavigateToPage && (
          <EventNavigationSection
            eventId={id}
            nodeId={nodeId}
            eventName={eventName}
            eventType={eventType}
            customEvent={customEvent}
            item={item}
            handleUpdateEvent={handleUpdateEvent}
          />
        )}
      </Accordion>
    </div>
  );
};
