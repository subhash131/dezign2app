import React, { useState, useEffect } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { cn } from "@workspace/ui/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";
import { BackendNode, UIEventItem, PageSection } from "@/types/canvas";
import {
  Endpoint,
  WEB_PAGE_EVENTS,
  PAGE_LIFECYCLE_EVENTS,
  PAGE_EFFECT_EVENTS,
  UI_INTERACTION_EVENTS,
} from "@workspace/canvas";
import {
  EventNavigationSection,
  ActionFlowEditor,
  ActionSimulator,
} from "./web-page-event-config";
import {
  ActionFlowCombobox,
  resolveItemPropsFromState,
  extractBaseTypeName,
} from "./web-page-event-config/action-flow";
import { useWebPageConnectedContext } from "./web-page-config/hooks/useWebPageConnectedContext";
import { ActionStepItem } from "./web-page-event-config/TargetEndpointSection";
import { isStorageRefNode } from "@/lib/stores/backendCanvas/edge/utils";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Badge } from "@workspace/ui/components/badge";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Radio,
  Wifi,
  Video,
  RefreshCw,
  Layers,
  Zap,
  Play,
  Timer,
  Route,
  Sparkles,
  LogOut,
} from "lucide-react";

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
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);

  const parentNode = nodes.find((n) => n.id === nodeId);
  const sections: PageSection[] = parentNode?.data?.sections || [];
  const item: UIEventItem | undefined = sections
    .flatMap((s) => s.actions || [])
    .find((e) => e.id === id);
  const parentSection = sections.find((s) =>
    (s.actions || []).some((act) => act.id === id),
  );

  const { isProtected } = useWebPageConnectedContext({
    nodeId,
    data: parentNode?.data,
    allNodes: nodes,
    allEdges: edges,
    allEndpoints: endpoints,
  });

  const initialEvent = item?.event || "click";
  const normalizedInitialEvent =
    initialEvent === "mount" || initialEvent === "pageLoad"
      ? "onMount"
      : initialEvent;
  const isStandard = EVENT_OPTIONS.some((opt) => opt === normalizedInitialEvent);

  const [eventName, setEventName] = useState(item?.name || "");
  const [eventType, setEventType] = useState(
    isStandard ? normalizedInitialEvent : "click",
  );
  const [navType, setNavType] = useState<"link" | "router">(
    item?.navigationType || "link",
  );
  const [navCond, setNavCond] = useState<
    "direct" | "on_success" | "on_condition" | "on_error"
  >(item?.navigationCondition || "direct");
  const [condCode, setCondCode] = useState(item?.conditionCode || "");

  const [sseConfig, setSseConfig] = useState(item?.sseConfig || {});
  const [wsConfig, setWsConfig] = useState(item?.wsConfig || {});
  const [webRtcConfig, setWebRtcConfig] = useState(item?.webRtcConfig || {});
  const [pollingConfig, setPollingConfig] = useState(item?.pollingConfig || {});
  const [intervalConfig, setIntervalConfig] = useState(
    item?.intervalConfig || { intervalMs: 5000, runImmediately: true },
  );
  const [paramChangeConfig, setParamChangeConfig] = useState(
    item?.paramChangeConfig || { watchPathParams: [], watchQueryParams: [] },
  );
  const [effectConfig, setEffectConfig] = useState(
    item?.effectConfig || { dependencies: [], debounceMs: 0 },
  );
  const [unmountConfig, setUnmountConfig] = useState(
    item?.unmountConfig || { resetStoreNodeIds: [] },
  );
  const [itemKeyField, setItemKeyField] = useState(
    item?.itemContextFields?.[0] || "id",
  );
  const [selectedStateId, setSelectedStateId] = useState<string>(
    item?.itemSourceStateId || "",
  );
  const [customStateName, setCustomStateName] = useState<string>("");

  useEffect(() => {
    if (item) {
      setEventName(item.name || "");
      const evt = item.event || "click";
      const isStd = EVENT_OPTIONS.some((opt) => opt === evt);
      setEventType(isStd ? evt : "click");
      setNavType(item.navigationType || "link");
      setNavCond(item.navigationCondition || "direct");
      setCondCode(item.conditionCode || "");
      setSseConfig(item.sseConfig || {});
      setWsConfig(item.wsConfig || {});
      setWebRtcConfig(item.webRtcConfig || {});
      setPollingConfig(item.pollingConfig || {});
      setIntervalConfig(item.intervalConfig || { intervalMs: 5000, runImmediately: true });
      setParamChangeConfig(item.paramChangeConfig || { watchPathParams: [], watchQueryParams: [] });
      setEffectConfig(item.effectConfig || { dependencies: [], debounceMs: 0 });
      setUnmountConfig(item.unmountConfig || { resetStoreNodeIds: [] });
      setItemKeyField(item.itemContextFields?.[0] || "id");
      setSelectedStateId(item.itemSourceStateId || "");
    }
  }, [item]);

  const updateActionInParent = (changes: Partial<UIEventItem>) => {
    const currentNodes = useBackendCanvasStore.getState().nodes;
    const latestParent = currentNodes.find((n) => n.id === nodeId) || parentNode;
    if (!latestParent) return;
    const currentSections: PageSection[] = latestParent.data.sections || [];
    const updatedSections = currentSections.map((sec) => ({
      ...sec,
      actions: (sec.actions || []).map((act) =>
        act.id === id ? { ...act, ...changes } : act,
      ),
    }));
    updateNode(nodeId, { data: { ...latestParent.data, sections: updatedSections } });
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

  const actionEdges = edges.filter(
    (e) =>
      (e.source === nodeId && e.sourceHandle === `events-${id}`) ||
      (e.target === nodeId && e.targetHandle === `events-${id}`),
  );

  const sortedActionEdges = [...actionEdges].sort((a, b) => {
    const ordA =
      a.data?.sequenceOrder ??
      (a.data?.label ? parseInt(a.data.label, 10) : 99);
    const ordB =
      b.data?.sequenceOrder ??
      (b.data?.label ? parseInt(b.data.label, 10) : 99);
    return ordA - ordB;
  });

  const steps: ActionStepItem[] = sortedActionEdges.map((e, idx) => {
    const isSource = e.source === nodeId;
    const targetNodeId = isSource ? e.target : e.source;
    const handle = isSource ? e.targetHandle : e.sourceHandle;
    const targetNode = nodes.find((n) => n.id === targetNodeId);
    const stepNumber = e.data?.sequenceOrder ?? idx + 1;
    const stepLabel = e.data?.label ?? String(stepNumber);
    const isStorageRef = isStorageRefNode(targetNode?.type);

    if (isStorageRef) {
      const opName =
        handle?.replace(/^func-(?:in-)?/, "") ||
        e.data?.operationName ||
        "uploadObject";
      const bucketName =
        targetNode?.data?.bucketId ||
        targetNode?.data?.bucketName ||
        e.data?.bucketId ||
        "bucket";
      return {
        step: stepNumber,
        label: stepLabel,
        edgeId: e.id,
        targetNodeId,
        targetNode,
        isStorageRef: true,
        operationName: opName,
        bucketName,
        endpoint: {
          id: `storage-op-${opName}`,
          name: `${opName}()`,
          type:
            opName.toLowerCase().includes("presign") ||
            opName.toLowerCase().includes("upload")
              ? "PUT"
              : "STORAGE",
          summary: `Storage bucket operation via ${bucketName}`,
        },
        edge: e,
      };
    }

    let endpointId: string | undefined;
    if (handle) {
      const parts = handle.split("-in-");
      endpointId = parts[parts.length - 1];
    }

    let targetEndpoint: Endpoint | undefined;
    if (endpointId && targetNode) {
      const storeEndpoints = endpoints.filter(
        (ep) => ep.nodeId === targetNodeId && ep.id === endpointId,
      );
      if (storeEndpoints.length > 0) targetEndpoint = storeEndpoints[0];
      if (!targetEndpoint && targetNode.data?.endpoints) {
        targetEndpoint = targetNode.data.endpoints.find(
          (ep: Endpoint) => ep.id === endpointId,
        );
      }
      if (!targetEndpoint && targetNode.data?.routeGroups) {
        for (const group of targetNode.data.routeGroups) {
          targetEndpoint = group.endpoints?.find(
            (ep: Endpoint) => ep.id === endpointId,
          );
          if (targetEndpoint) break;
        }
      }
    }

    if (!targetEndpoint && targetNode) {
      const allTargetEndpoints = collectEndpoints(targetNode, endpoints);
      if (allTargetEndpoints.length > 0) targetEndpoint = allTargetEndpoints[0];
    }

    return {
      step: stepNumber,
      label: stepLabel,
      edgeId: e.id,
      targetNodeId,
      targetNode,
      endpointId,
      endpoint: targetEndpoint,
      edge: e,
    };
  });

  const serviceNodes = nodes.filter(
    (n) => n.id !== nodeId && SERVER_NODE_TYPES.includes(n.type),
  );

  const handleDeleteStep = (edgeId: string) => {
    deleteEdge(edgeId);
  };

  if (!item) return <div className="p-4 text-xs text-muted-foreground">Action not found.</div>;

  const isNavigateToPage = eventType === "navigateToPage";
  const isSse = eventType === "sse";
  const isWebsocket = eventType === "websocket";
  const isWebrtc = eventType === "webrtc";
  const isPolling = eventType === "polling";
  const isMount = eventType === "mount" || eventType === "pageLoad" || eventType === "onMount";
  const isUnmount = eventType === "unmount";
  const isInterval = eventType === "interval";
  const isParamChange = eventType === "paramChange";
  const isEffect = eventType === "effect";
  const isVisibilityChange = eventType === "visibilityChange";
  const isBeforeUnload = eventType === "beforeUnload";
  const sourceState = item?.itemSourceStateId
    ? parentSection?.stateObjects?.find(
        (st) => st.id === item.itemSourceStateId || st.name === item.itemSourceStateId,
      )
    : undefined;

  const isItemScoped = item?.scope === "item";
  const sectionStateObjects = parentSection?.stateObjects || [];
  const arrayStateObjects = sectionStateObjects.filter(
    (st) => st.type === "array" || st.type?.endsWith("[]") || st.type?.includes("[]"),
  );
  const eligibleStates = arrayStateObjects.length > 0 ? arrayStateObjects : sectionStateObjects;

  const activeTargetState = React.useMemo(() => {
    const targetId = selectedStateId || item?.itemSourceStateId;
    if (!targetId) return eligibleStates[0] || undefined;
    return (
      eligibleStates.find((st) => st.id === targetId || st.name === targetId) ||
      sectionStateObjects.find((st) => st.id === targetId || st.name === targetId) ||
      eligibleStates[0]
    );
  }, [selectedStateId, item?.itemSourceStateId, eligibleStates, sectionStateObjects]);

  const itemPropSuggestions = React.useMemo(() => {
    return resolveItemPropsFromState(activeTargetState, nodes, itemKeyField);
  }, [activeTargetState, nodes, itemKeyField]);

  const targetStateTypeName = activeTargetState?.type
    ? extractBaseTypeName(activeTargetState.type)
    : "";

  const handleToggleItemScoped = (checked: boolean) => {
    if (checked) {
      const defaultState = eligibleStates.find((st) => st.id === selectedStateId) || eligibleStates[0];
      const defaultStateId = defaultState?.id || selectedStateId || "";
      setSelectedStateId(defaultStateId);
      const props = resolveItemPropsFromState(defaultState, nodes);
      let nextKey = itemKeyField || "id";
      if (props.length > 0 && (!itemKeyField || !props.some((p) => p.value === itemKeyField))) {
        const idField = props.find((p) => p.value === "id" || p.value === "_id");
        const firstProp = props[0];
        nextKey = idField ? idField.value : firstProp ? firstProp.value : "id";
        setItemKeyField(nextKey);
      }
      updateActionInParent({
        scope: "item",
        itemSourceStateId: defaultStateId,
        itemContextFields: [nextKey],
      });
    } else {
      updateActionInParent({
        scope: "section",
        itemSourceStateId: undefined,
      });
    }
  };

  const handleSelectTargetState = (stateId: string) => {
    setSelectedStateId(stateId);
    const newTarget = eligibleStates.find((st) => st.id === stateId || st.name === stateId);
    const newProps = resolveItemPropsFromState(newTarget, nodes);
    let nextKey = itemKeyField;
    if (newProps.length > 0 && !newProps.some((p) => p.value === itemKeyField)) {
      const idMatch = newProps.find((p) => p.value === "id" || p.value === "_id");
      const firstNewProp = newProps[0];
      nextKey = idMatch ? idMatch.value : firstNewProp ? firstNewProp.value : itemKeyField || "id";
      setItemKeyField(nextKey);
    }
    updateActionInParent({
      itemSourceStateId: stateId,
      itemContextFields: [nextKey || "id"],
    });
  };

  return (
    <div className="flex flex-col gap-5 font-sans">
      {/* Merged Action Header: Event Type & Action Name */}
      <div className="p-4 rounded-xl border border-border/60 bg-gradient-to-b from-card to-card/60 shadow-xs flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary border border-primary/20">
              <Zap size={13} className="fill-primary/20" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Action Event</span>
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 uppercase">
                {isMount ? "onMount" : eventType}
              </Badge>
              {isItemScoped && (
                <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 bg-violet-500/15 text-violet-400 border border-violet-500/30">
                  Item Scoped
                </Badge>
              )}
            </div>
          </div>
          {parentSection?.name ? (
            <Badge variant="secondary" className="text-[10px] font-normal text-muted-foreground px-2 py-0.5">
              {parentSection.name}
            </Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Trigger Event
            </Label>
            <Select
              value={eventType}
              onValueChange={(v) => {
                setEventType(v);
                handleUpdateEvent(eventName, v);
              }}
            >
              <SelectTrigger className="h-8 text-xs bg-background font-mono focus:ring-1 focus:ring-ring focus:ring-offset-0">
                <SelectValue placeholder="Select trigger event" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                    ⚡ Page Lifecycle
                  </SelectLabel>
                  <SelectItem value="onMount" className="text-xs font-mono">
                    onMount
                  </SelectItem>
                  {eventType === "mount" && (
                    <SelectItem value="mount" className="text-xs font-mono">
                      onMount (mount)
                    </SelectItem>
                  )}
                  {eventType === "pageLoad" && (
                    <SelectItem value="pageLoad" className="text-xs font-mono">
                      onMount (pageLoad)
                    </SelectItem>
                  )}
                  <SelectItem value="unmount" className="text-xs font-mono">
                    unmount
                  </SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                    🔄 Reactive Effects
                  </SelectLabel>
                  {PAGE_EFFECT_EVENTS.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs font-mono">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                    👆 User Interactions
                  </SelectLabel>
                  {UI_INTERACTION_EVENTS.filter((e) => e !== "navigateToPage").map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs font-mono">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel className="text-[10px] font-bold text-muted-foreground uppercase px-2 py-1">
                    🧭 Navigation
                  </SelectLabel>
                  <SelectItem value="navigateToPage" className="text-xs font-mono">
                    navigateToPage
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">
              Action Name
            </Label>
            <Input
              className="h-8 text-xs bg-background font-mono"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              onBlur={() => handleUpdateEvent(eventName, eventType)}
              placeholder="e.g. submitOrder, fetchUserProfile"
            />
          </div>
        </div>

        {/* Checkbox for Array Item Action */}
        <div className="pt-2.5 border-t border-border/40 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-item-scoped"
                checked={isItemScoped}
                onCheckedChange={(checked) => {
                  handleToggleItemScoped(Boolean(checked));
                }}
              />
              <label
                htmlFor="is-item-scoped"
                className="text-xs font-medium cursor-pointer select-none text-foreground flex items-center gap-1.5"
              >
                <span>Trigger per Array Item</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  (attach action to individual array items)
                </span>
              </label>
            </div>
            {isItemScoped && (
              <Badge variant="outline" className="text-[9px] font-mono border-violet-500/40 text-violet-300">
                {sourceState?.name ? `${sourceState.name}[]` : "array item"}
              </Badge>
            )}
          </div>

          {isItemScoped && (
            <div className="p-3 rounded-lg border border-violet-500/30 bg-violet-500/[0.04] flex flex-col gap-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] font-medium text-muted-foreground">
                    Target Array State
                  </Label>
                  {eligibleStates.length > 0 ? (
                    <Select
                      value={selectedStateId || eligibleStates[0]?.id || ""}
                      onValueChange={(val) => handleSelectTargetState(val)}
                    >
                      <SelectTrigger className="h-7 text-xs font-mono bg-background">
                        <SelectValue placeholder="Select target state" />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleStates.map((st) => (
                          <SelectItem key={st.id} value={st.id} className="text-xs font-mono">
                            {st.name} ({st.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="h-7 text-xs font-mono bg-background"
                      placeholder="e.g. messages, items"
                      value={customStateName}
                      onChange={(e) => setCustomStateName(e.target.value)}
                      onBlur={() => {
                        const cleaned = customStateName.trim();
                        if (cleaned) {
                          updateActionInParent({ itemSourceStateId: cleaned });
                        }
                      }}
                    />
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-medium text-muted-foreground">
                      Item Context Identifier Key
                    </Label>
                    {targetStateTypeName && (
                      <span className="text-[9px] font-mono text-violet-400 font-normal">
                        Type: {targetStateTypeName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ActionFlowCombobox
                      value={itemKeyField}
                      onChange={(val) => {
                        const cleaned = val.trim() || "id";
                        setItemKeyField(cleaned);
                        updateActionInParent({ itemContextFields: [cleaned] });
                      }}
                      placeholder="e.g. id, uuid, slug"
                      headerLabel={
                        targetStateTypeName
                          ? `Props of ${targetStateTypeName}`
                          : "Item Properties"
                      }
                      options={itemPropSuggestions}
                      className="h-7 text-xs font-mono bg-background"
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap font-mono shrink-0">
                      item.{itemKeyField || "id"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground leading-relaxed">
                Clicking an item in{" "}
                <span className="font-semibold text-foreground font-mono">
                  {activeTargetState?.name || sourceState?.name || "the array"}
                </span>{" "}
                triggers this action and passes{" "}
                <code className="text-violet-400 font-mono">&#123; {itemKeyField || "id"}: item.{itemKeyField || "id"} &#125;</code> into the request.
              </div>
            </div>
          )}
        </div>
      </div>

      <Accordion
        type="multiple"
        defaultValue={
          isNavigateToPage
            ? ["navigation"]
            : [
                "connection",
                "simulator",
                "sse_config",
                "ws_config",
                "webrtc_config",
                "polling_config",
                "interval_config",
                "param_change_config",
                "effect_config",
                "unmount_config",
              ]
        }
        className="w-full flex flex-col gap-3 border-none"
      >
        {!isNavigateToPage && (
          <>
            <AccordionItem
              value="connection"
              className="border rounded-xl overflow-hidden bg-card"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-secondary/20 transition-colors [&>svg]:shrink-0">
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-primary" />
                  <span className="text-xs font-semibold">
                    Pipeline Steps
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[9px] px-1.5 py-0 font-mono"
                  >
                    {(item?.actionSteps?.length || steps.length)} {((item?.actionSteps?.length || steps.length) === 1 ? "step" : "steps")}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-5 pt-2">
                <ActionFlowEditor
                  item={item}
                  canvasSteps={steps}
                  serviceNodes={serviceNodes}
                  allNodes={nodes}
                  endpoints={endpoints}
                  webPageNodeId={nodeId}
                  actionId={id}
                  isProtected={isProtected}
                  isItemScoped={isItemScoped}
                  itemKeyField={itemKeyField}
                  itemSourceStateName={activeTargetState?.name || sourceState?.name}
                  itemPropSuggestions={itemPropSuggestions}
                  onSave={(drafts) =>
                    updateActionInParent({ actionSteps: drafts })
                  }
                  onDeleteStep={handleDeleteStep}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="simulator"
              className="border border-cyan-500/30 rounded-xl overflow-hidden bg-card"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-secondary/20 transition-colors [&>svg]:shrink-0">
                <div className="flex items-center gap-2">
                  <Play size={14} className="text-cyan-500 fill-cyan-500/20" />
                  <span className="text-xs font-semibold">
                    Simulate &amp; Test Action
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 font-mono text-cyan-600 dark:text-cyan-400 border-cyan-500/30"
                  >
                    Interactive
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-5 pt-2">
                <ActionSimulator
                  item={item}
                  steps={item?.actionSteps && item.actionSteps.length > 0 ? item.actionSteps : []}
                  canvasSteps={steps}
                  allNodes={nodes}
                  endpoints={endpoints}
                  webPageNodeId={nodeId}
                  actionId={id}
                  isProtected={isProtected}
                />
              </AccordionContent>
            </AccordionItem>
          </>
        )}

        {isSse && (
          <AccordionItem value="sse_config" className="border border-amber-500/30 rounded-lg bg-amber-500/5 overflow-hidden">
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="flex items-center gap-2"><Radio size={14} /> SSE Setup</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Reconnect Strategy</Label>
                <Select value={sseConfig.reconnectStrategy || "exponential"} onValueChange={(val: "exponential" | "linear" | "none") => { const next = { ...sseConfig, reconnectStrategy: val }; setSseConfig(next); updateEventFields({ sseConfig: next }); }}>
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

        {isInterval && (
          <AccordionItem
            value="interval_config"
            className="border border-amber-500/30 rounded-xl bg-amber-500/5 overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="flex items-center gap-2">
                <Timer size={14} /> Timer Interval Configuration
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1 space-y-3.5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Interval Duration (ms)</Label>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {(intervalConfig.intervalMs ?? 5000) >= 1000
                      ? `${(intervalConfig.intervalMs ?? 5000) / 1000}s`
                      : `${intervalConfig.intervalMs ?? 5000}ms`}
                  </span>
                </div>
                <Input
                  type="number"
                  min={100}
                  step={500}
                  value={intervalConfig.intervalMs ?? 5000}
                  onChange={(e) => {
                    const next = {
                      ...intervalConfig,
                      intervalMs: Math.max(100, parseInt(e.target.value, 10) || 1000),
                    };
                    setIntervalConfig(next);
                    updateEventFields({ intervalConfig: next });
                  }}
                  className="h-8 text-xs bg-background font-mono"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { label: "1s", ms: 1000 },
                  { label: "5s", ms: 5000 },
                  { label: "10s", ms: 10000 },
                  { label: "30s", ms: 30000 },
                  { label: "1m", ms: 60000 },
                ].map((preset) => (
                  <button
                    key={preset.ms}
                    type="button"
                    onClick={() => {
                      const next = { ...intervalConfig, intervalMs: preset.ms };
                      setIntervalConfig(next);
                      updateEventFields({ intervalConfig: next });
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-mono font-medium border transition-colors cursor-pointer",
                      intervalConfig.intervalMs === preset.ms
                        ? "bg-amber-500 text-amber-950 border-amber-500 font-bold"
                        : "bg-background hover:bg-secondary border-border text-muted-foreground",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Run immediately checkbox */}
              <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
                <Checkbox
                  id="interval-run-immediately"
                  checked={intervalConfig.runImmediately ?? true}
                  onCheckedChange={(checked) => {
                    const next = { ...intervalConfig, runImmediately: Boolean(checked) };
                    setIntervalConfig(next);
                    updateEventFields({ intervalConfig: next });
                  }}
                />
                <label
                  htmlFor="interval-run-immediately"
                  className="text-xs font-medium cursor-pointer select-none text-foreground flex flex-col"
                >
                  <span>Execute immediately on mount</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Fires the action immediately when the page loads, then repeatedly every interval.
                  </span>
                </label>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {isParamChange && (
          <AccordionItem
            value="param_change_config"
            className="border border-sky-500/30 rounded-xl bg-sky-500/5 overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-sky-600 dark:text-sky-400">
              <span className="flex items-center gap-2">
                <Route size={14} /> Route &amp; Query Param Watcher
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1 space-y-3">
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Re-executes this action when the selected Next.js App Router dynamic parameters (<code className="text-sky-400 font-mono">useParams()</code>) or query search parameters (<code className="text-sky-400 font-mono">useSearchParams()</code>) update.
              </div>

              {/* Path params checkboxes */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-foreground">
                  Dynamic Route Parameters
                </Label>
                {(parentNode?.data?.pathParams || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(parentNode?.data?.pathParams || []).map((p: any) => {
                      const isChecked = (paramChangeConfig.watchPathParams || []).includes(p.name);
                      return (
                        <label
                          key={p.name}
                          className="flex items-center gap-1.5 px-2 py-1 rounded bg-background border text-xs font-mono cursor-pointer hover:bg-secondary transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const curr = paramChangeConfig.watchPathParams || [];
                              const nextParams = e.target.checked
                                ? [...curr, p.name]
                                : curr.filter((name) => name !== p.name);
                              const next = { ...paramChangeConfig, watchPathParams: nextParams };
                              setParamChangeConfig(next);
                              updateEventFields({ paramChangeConfig: next });
                            }}
                            className="rounded"
                          />
                          <span>:{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground italic">
                    No dynamic path parameters on this page (e.g. [id]).
                  </div>
                )}
              </div>

              {/* Query params checkboxes */}
              <div className="space-y-1.5 pt-2 border-t border-sky-500/20">
                <Label className="text-[11px] font-medium text-foreground">
                  Query Search Parameters
                </Label>
                {(parentNode?.data?.queryParams || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(parentNode?.data?.queryParams || []).map((q: any) => {
                      const keyName = q.key || q.name;
                      const isChecked = (paramChangeConfig.watchQueryParams || []).includes(keyName);
                      return (
                        <label
                          key={keyName}
                          className="flex items-center gap-1.5 px-2 py-1 rounded bg-background border text-xs font-mono cursor-pointer hover:bg-secondary transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const curr = paramChangeConfig.watchQueryParams || [];
                              const nextParams = e.target.checked
                                ? [...curr, keyName]
                                : curr.filter((name) => name !== keyName);
                              const next = { ...paramChangeConfig, watchQueryParams: nextParams };
                              setParamChangeConfig(next);
                              updateEventFields({ paramChangeConfig: next });
                            }}
                            className="rounded"
                          />
                          <span>?{keyName}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground italic">
                    No query parameters configured on this page (e.g. ?page=1).
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {isEffect && (
          <AccordionItem
            value="effect_config"
            className="border border-violet-500/30 rounded-xl bg-violet-500/5 overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-violet-600 dark:text-violet-400">
              <span className="flex items-center gap-2">
                <Sparkles size={14} /> State Watcher Dependencies
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1 space-y-3.5">
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Runs as a React <code className="text-violet-400 font-mono">useEffect()</code> watching the selected state variables in its dependency array.
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-foreground">
                  Watched State Objects
                </Label>
                {sectionStateObjects.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {sectionStateObjects.map((st) => {
                      const keyName = st.name || st.id;
                      const isChecked = (effectConfig.dependencies || []).includes(keyName);
                      return (
                        <label
                          key={st.id}
                          className="flex items-center gap-1.5 px-2 py-1 rounded bg-background border text-xs font-mono cursor-pointer hover:bg-secondary transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const curr = effectConfig.dependencies || [];
                              const nextDeps = e.target.checked
                                ? [...curr, keyName]
                                : curr.filter((name) => name !== keyName);
                              const next = { ...effectConfig, dependencies: nextDeps };
                              setEffectConfig(next);
                              updateEventFields({ effectConfig: next });
                            }}
                            className="rounded"
                          />
                          <span>{keyName}</span>
                          <span className="text-[9px] text-muted-foreground">({st.type})</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground italic">
                    No state variables declared in this section.
                  </div>
                )}
              </div>

              <div className="space-y-1 pt-1 border-t border-violet-500/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Debounce Delay (ms)</Label>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {effectConfig.debounceMs ? `${effectConfig.debounceMs}ms` : "0ms (immediate)"}
                  </span>
                </div>
                <Input
                  type="number"
                  min={0}
                  step={50}
                  value={effectConfig.debounceMs ?? 0}
                  onChange={(e) => {
                    const next = {
                      ...effectConfig,
                      debounceMs: Math.max(0, parseInt(e.target.value, 10) || 0),
                    };
                    setEffectConfig(next);
                    updateEventFields({ effectConfig: next });
                  }}
                  className="h-8 text-xs bg-background font-mono"
                  placeholder="e.g. 300 for debounced search"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {isUnmount && (
          <AccordionItem
            value="unmount_config"
            className="border border-rose-500/30 rounded-xl bg-rose-500/5 overflow-hidden"
          >
            <AccordionTrigger className="px-4 py-3 text-xs font-semibold hover:no-underline flex items-center justify-between text-rose-600 dark:text-rose-400">
              <span className="flex items-center gap-2">
                <LogOut size={14} /> Unmount &amp; Teardown Cleanup
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 pt-1 space-y-3">
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Executes inside the cleanup return function of the page <code className="text-rose-400 font-mono">useEffect()</code> when the user navigates away or the page unmounts.
              </div>
              <div className="p-2.5 rounded-lg border border-rose-500/20 bg-background text-[11px] text-muted-foreground leading-relaxed">
                Connect this action to State Stores to automatically invoke <code className="font-mono text-rose-400">useStore.getState().reset()</code> on unmount.
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {isNavigateToPage && (
          <EventNavigationSection
            eventId={id}
            nodeId={nodeId}
            eventName={eventName}
            eventType={eventType}
            item={item}
            handleUpdateEvent={handleUpdateEvent}
          />
        )}
      </Accordion>
    </div>
  );
};
