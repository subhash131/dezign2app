"use client";

import React, { useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  RealtimeConnection,
  Endpoint,
  UIEventItem,
  ClientDeliveryProtocol,
  PipelineStep,
  PipelineStepDraft,
  ConsumedEventItem,
} from "@workspace/canvas/types";
import { extractPathsFromObject } from "./pipeline-step-editor/sourcePaths";
import { AvailablePath } from "./pipeline-step-editor/types";
import { parseSchemaJson, toPascalCase, deriveRouteFileName } from "@/lib/compiler/utils";
import {
  WebPageRealtimeConnectionConfigProps,
  useDerivedRealtimeInfo,
  RealtimeConnectionHeader,
  RealtimeSubscriptionMappingSection,
  resolveRealtimePayloadPaths,
  useAllPageRealtimeConnections,
  deleteRealtimeConnection,
} from "./web-page-realtime-config";
import { ensureWsPackageInService } from "@/lib/stores/backendCanvas/packageTypesSync";
import { ActionFlowEditor, ActionSimulator } from "./web-page-event-config";
import { useWebPageConnectedContext } from "./web-page-config/hooks/useWebPageConnectedContext";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@workspace/ui/components/accordion";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Layers, Play, Link2, Plus, Radio, Trash2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { isStorageRefNode } from "@/lib/stores/backendCanvas/edge/utils";
import type { ActionStepItem } from "./web-page-event-config/TargetEndpointSection";
import type { FrontendActionStepDraft } from "./web-page-event-config/action-flow/types";

export type { WebPageRealtimeConnectionConfigProps };

export const WebPageRealtimeConnectionConfig: React.FC<WebPageRealtimeConnectionConfigProps> = ({
  id,
  nodeId,
}) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);
  const events = useBackendCanvasStore((s) => s.events);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const updateEndpoint = useBackendCanvasStore((s) => s.updateEndpoint);
  const updateEvent = useBackendCanvasStore((s) => s.updateEvent);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  const pageNode = nodes.find((n) => n.id === nodeId);
  const connections = pageNode?.data?.realtimeConnections ?? [];
  const manualConn = connections.find((c) => c.id === id);

  const derivedInfo = useDerivedRealtimeInfo(id, nodeId, events, endpoints, nodes);

  const conn: RealtimeConnection = useMemo(() => {
    if (derivedInfo?.step) {
      const s = derivedInfo.step;
      const ev = events.find((e) => e.id === derivedInfo.sourceEventId);
      const ep = endpoints.find((e) => e.id === derivedInfo.sourceEndpointId);
      const sourceItemName = ep ? ep.name || "Endpoint" : ev ? ev.name : undefined;
      const isLangGraph = s.type === "langgraph_invoke";
      const isRtc = manualConn?.protocol
        ? manualConn.protocol === "WEBRTC"
        : !isLangGraph && s.clientDeliveryProtocol === "WEBRTC";
      const protocol: RealtimeConnection["protocol"] = manualConn?.protocol || (isLangGraph
        ? (s.langGraphStreamingProtocol === "websocket" || s.clientDeliveryProtocol === "WEBSOCKET"
          ? "WEBSOCKET"
          : "SSE")
        : (s.clientDeliveryProtocol || "SSE"));
      const eventName =
        manualConn?.eventName ||
        s.clientDeliveryEventName ||
        (isLangGraph
          ? (protocol === "WEBSOCKET" ? "agent_stream" : "message")
          : (sourceItemName || "message"));
      const room = manualConn?.room || s.clientDeliveryRoom || (isLangGraph ? s.langGraphStreamingRoom : undefined);

      return {
        id,
        protocol,
        eventName,
        room,
        mediaMode: isRtc ? s.clientDeliveryMediaMode : undefined,
        enableDataChannel: isRtc ? (manualConn?.enableDataChannel ?? s.clientDeliveryEnableDataChannel) : undefined,
        enableMic: isRtc ? (manualConn?.enableMic ?? s.clientDeliveryEnableMic ?? s.clientDeliveryEnableAudio) : undefined,
        enableSpeaker: isRtc ? (manualConn?.enableSpeaker ?? s.clientDeliveryEnableSpeaker) : undefined,
        enableCamera: isRtc ? (manualConn?.enableCamera ?? s.clientDeliveryEnableCamera ?? s.clientDeliveryEnableVideo) : undefined,
        enableScreenShare: isRtc ? (manualConn?.enableScreenShare ?? s.clientDeliveryEnableScreenShare) : undefined,
        enableRemoteVideo: isRtc ? (manualConn?.enableRemoteVideo ?? s.clientDeliveryEnableRemoteVideo) : undefined,
        iceServerUrl: isRtc ? (manualConn?.iceServerUrl || s.clientDeliveryIceServer) : undefined,
        description: sourceItemName || s.name,
        sourceServiceNodeId: derivedInfo.sourceNode?.id,
        sourceServiceLabel: derivedInfo.sourceNode?.data?.label || derivedInfo.sourceNode?.type || "Service",
        sourceEventId: derivedInfo.sourceEventId || derivedInfo.sourceEndpointId || undefined,
        sourceItemName,
        sourceItemType: ep ? "endpoint" : ev ? "event" : undefined,
        storeActionBinding: manualConn?.storeActionBinding,
        storeActionBindings: manualConn?.storeActionBindings,
        actionSteps: manualConn?.actionSteps ?? [],
        subscriptionBindings: manualConn?.subscriptionBindings,
        isLangGraph,
        langGraphStreamModes: isLangGraph ? (s.langGraphStreamModes || manualConn?.langGraphStreamModes) : manualConn?.langGraphStreamModes,
        langGraphStreamingFields: isLangGraph ? (s.langGraphStreamingFields || manualConn?.langGraphStreamingFields) : manualConn?.langGraphStreamingFields,
        langGraphStreamIncludeReasoning: isLangGraph ? (s.langGraphStreamIncludeReasoning ?? manualConn?.langGraphStreamIncludeReasoning) : manualConn?.langGraphStreamIncludeReasoning,
        langGraphTargetNodeId: isLangGraph ? (s.langGraphTargetNodeId || manualConn?.langGraphTargetNodeId) : manualConn?.langGraphTargetNodeId,
      };
    }
    if (manualConn) return { ...manualConn, actionSteps: manualConn.actionSteps ?? [] };
    return {
      id,
      protocol: "SSE",
      eventName: "message",
      actionSteps: [],
    };
  }, [manualConn, derivedInfo, id, events, endpoints]);

  const isDerived = Boolean(derivedInfo?.step);
  const isConnected = Boolean(
    isDerived ||
      (conn.sourceServiceNodeId && nodes.some((n) => n.id === conn.sourceServiceNodeId)),
  );

  const allPageConnections = useAllPageRealtimeConnections({
    nodeId,
    pageNode,
    nodes,
    edges,
    events,
    endpoints,
  });

  const handleAddConnection = (protocol: ClientDeliveryProtocol) => {
    if (!pageNode) return;
    const newId = `rtc-${Math.random().toString(36).substring(2, 9)}`;
    const defaultEventName =
      protocol === "WEBSOCKET"
        ? "chat.message"
        : protocol === "WEBRTC"
        ? "media-channel"
        : "order.updated";
    const newConn: RealtimeConnection = {
      id: newId,
      protocol,
      eventName: defaultEventName,
      description: `${protocol} stream connection`,
      actionSteps: [],
      subscriptionBindings: [],
    };
    const existing = pageNode.data?.realtimeConnections || [];
    updateNode(nodeId, {
      data: {
        ...pageNode.data,
        label: pageNode.data?.label || "",
        realtimeConnections: [...existing, newConn],
      },
    });
    setActiveConfigItem({
      type: "realtimeConnection",
      id: newId,
      nodeId,
    });
  };

  const handleDelete = (connId: string) => {
    deleteRealtimeConnection({
      connId,
      nodeId,
      store: useBackendCanvasStore.getState(),
    });
    const remaining = allPageConnections.filter((c) => c.id !== connId);
    if (remaining.length > 0) {
      setActiveConfigItem({
        type: "realtimeConnection",
        id: remaining[0]?.id || "",
        nodeId,
      });
    } else {
      setActiveConfigItem({
        type: "webPage",
        id: nodeId,
        nodeId,
      });
    }
  };

  const handleUpdateManual = (changes: Partial<RealtimeConnection>) => {
    if (!pageNode) return;
    // Protocol / capabilities / room / bindings can all be toggled or configured
    if (
      isDerived &&
      !changes.protocol &&
      !changes.storeActionBinding &&
      changes.storeActionBinding !== null &&
      !changes.storeActionBindings &&
      !changes.actionSteps &&
      !changes.subscriptionBindings &&
      !changes.room &&
      changes.enableMic === undefined &&
      changes.enableCamera === undefined &&
      changes.enableDataChannel === undefined
    ) {
      return;
    }

    if (changes.protocol) {
      const stepId = derivedInfo?.step?.id || conn.id;
      // 1. Check endpoints
      endpoints.forEach((ep) => {
        if (ep.pipelineSteps) {
          let stepUpdated = false;
          const updateSteps = (steps: PipelineStep[]): PipelineStep[] => {
            return steps.map((s) => {
              let nextStep = { ...s };
              if (s.id === stepId) {
                stepUpdated = true;
                nextStep.clientDeliveryProtocol = changes.protocol as ClientDeliveryProtocol;
              }
              if (nextStep.thenSteps) nextStep.thenSteps = updateSteps(nextStep.thenSteps);
              if (nextStep.elseSteps) nextStep.elseSteps = updateSteps(nextStep.elseSteps);
              if (nextStep.trySteps) nextStep.trySteps = updateSteps(nextStep.trySteps);
              if (nextStep.catchSteps) nextStep.catchSteps = updateSteps(nextStep.catchSteps);
              if (nextStep.loopBody) nextStep.loopBody = updateSteps(nextStep.loopBody);
              return nextStep;
            });
          };
          const newSteps = updateSteps(ep.pipelineSteps);
          if (stepUpdated) updateEndpoint(ep.id, { pipelineSteps: newSteps });
        }
      });
      // 2. Check events
      events.forEach((ev) => {
        if (ev.pipelineSteps) {
          let stepUpdated = false;
          const updateSteps = (steps: PipelineStep[]): PipelineStep[] => {
            return steps.map((s) => {
              let nextStep = { ...s };
              if (s.id === stepId) {
                stepUpdated = true;
                nextStep.clientDeliveryProtocol = changes.protocol as ClientDeliveryProtocol;
              }
              if (nextStep.thenSteps) nextStep.thenSteps = updateSteps(nextStep.thenSteps);
              if (nextStep.elseSteps) nextStep.elseSteps = updateSteps(nextStep.elseSteps);
              if (nextStep.trySteps) nextStep.trySteps = updateSteps(nextStep.trySteps);
              if (nextStep.catchSteps) nextStep.catchSteps = updateSteps(nextStep.catchSteps);
              if (nextStep.loopBody) nextStep.loopBody = updateSteps(nextStep.loopBody);
              return nextStep;
            });
          };
          const newSteps = updateSteps(ev.pipelineSteps);
          if (stepUpdated) updateEvent(ev.id, { pipelineSteps: newSteps });
        }
      });
      // 3. Check services
      nodes.forEach((n) => {
        if (n.type === "service") {
          let svcChanged = false;
          let nextEps = n.data?.endpoints;
          let nextEvs = n.data?.consumedEvents;
          if (Array.isArray(nextEps)) {
            nextEps = nextEps.map((ep: Endpoint): Endpoint => {
              if (!ep.pipelineSteps) return ep;
              let epChanged = false;
              const updateSteps = (steps: PipelineStep[]): PipelineStep[] => {
                return steps.map((s) => {
                  let nextStep = { ...s };
                  if (s.id === stepId) {
                    epChanged = true;
                    svcChanged = true;
                    nextStep.clientDeliveryProtocol = changes.protocol as ClientDeliveryProtocol;
                  }
                  if (nextStep.thenSteps) nextStep.thenSteps = updateSteps(nextStep.thenSteps);
                  if (nextStep.elseSteps) nextStep.elseSteps = updateSteps(nextStep.elseSteps);
                  if (nextStep.trySteps) nextStep.trySteps = updateSteps(nextStep.trySteps);
                  if (nextStep.catchSteps) nextStep.catchSteps = updateSteps(nextStep.catchSteps);
                  if (nextStep.loopBody) nextStep.loopBody = updateSteps(nextStep.loopBody);
                  return nextStep;
                });
              };
              const newSteps = updateSteps(ep.pipelineSteps);
              return epChanged ? { ...ep, pipelineSteps: newSteps } : ep;
            });
          }
          if (Array.isArray(nextEvs)) {
            nextEvs = nextEvs.map((ev: ConsumedEventItem): ConsumedEventItem => {
              if (!ev.pipelineSteps) return ev;
              let evChanged = false;
              const updateSteps = (steps: PipelineStepDraft[]): PipelineStepDraft[] => {
                return steps.map((s) => {
                  let nextStep = { ...s };
                  if (s.id === stepId) {
                    evChanged = true;
                    svcChanged = true;
                    nextStep.clientDeliveryProtocol = changes.protocol as ClientDeliveryProtocol;
                  }
                  if (nextStep.thenSteps) nextStep.thenSteps = updateSteps(nextStep.thenSteps as PipelineStepDraft[]);
                  if (nextStep.elseSteps) nextStep.elseSteps = updateSteps(nextStep.elseSteps as PipelineStepDraft[]);
                  if (nextStep.trySteps) nextStep.trySteps = updateSteps(nextStep.trySteps as PipelineStepDraft[]);
                  if (nextStep.catchSteps) nextStep.catchSteps = updateSteps(nextStep.catchSteps as PipelineStepDraft[]);
                  if (nextStep.loopBody) nextStep.loopBody = updateSteps(nextStep.loopBody as PipelineStepDraft[]);
                  return nextStep;
                });
              };
              const newSteps = updateSteps(ev.pipelineSteps);
              return evChanged ? { ...ev, pipelineSteps: newSteps } : ev;
            });
          }
          if (svcChanged) {
            updateNode(n.id, {
              data: {
                ...n.data,
                endpoints: nextEps,
                consumedEvents: nextEvs,
              },
            });
          }
        }
      });
    }

    const isAlreadyInExisting = connections.some((c) => c.id === id);
    const updatedList = isAlreadyInExisting
      ? connections.map((c) => (c.id === id ? { ...c, ...changes } : c))
      : [...connections, { ...conn, ...changes }];

    updateNode(nodeId, {
      data: {
        ...pageNode.data,
        label: pageNode.data.label || "",
        realtimeConnections: updatedList,
      },
    });
    if (changes.protocol === "WEBSOCKET" && conn.sourceServiceNodeId) {
      ensureWsPackageInService({ serviceNodeId: conn.sourceServiceNodeId });
    }
  };

  const suggestedPaths = useMemo((): AvailablePath[] => {
    return resolveRealtimePayloadPaths({
      conn,
      derivedInfo,
      endpoints,
      events,
      nodes,
      edges,
    });
  }, [conn, derivedInfo, endpoints, events, nodes, edges]);

  const payloadTypeName = useMemo(() => {
    const serviceNodeId = conn.sourceServiceNodeId || derivedInfo?.sourceNode?.id;
    const epId = derivedInfo?.sourceEndpointId;
    const ep = endpoints.find((e) => e.id === epId);
    const serviceLabel = conn.sourceServiceLabel || derivedInfo?.sourceNode?.data?.label || "Conversation";

    if (serviceNodeId) {
      const typesNode = nodes.find(
        (n) =>
          n.type === "types" &&
          (n.data?.sourceServiceId === serviceNodeId ||
            n.id === `types-service-${serviceNodeId}` ||
            n.data?.label?.toLowerCase().includes((serviceLabel || "").toLowerCase())),
      );
      if (typesNode && Array.isArray(typesNode.data?.types)) {
        if (conn.isLangGraph || derivedInfo?.step?.type === "langgraph_invoke") {
          const chunkType = typesNode.data.types.find(
            (t: any) => t.name?.endsWith("StreamChunk") || t.name?.endsWith("StreamResponse"),
          );
          if (chunkType) return chunkType.name;
        }
        const matchingType = typesNode.data.types.find(
          (t: any) =>
            t.id === `type-endpoint-response-${epId}` ||
            (ep && t.name?.toLowerCase().includes(toPascalCase(ep.name || "").toLowerCase())),
        );
        if (matchingType) return matchingType.name;
      }
    }

    const pascalService = toPascalCase(serviceLabel || "Conversation");
    const routeName = ep ? deriveRouteFileName(ep, 0, serviceLabel) : (conn.sourceItemName || "SendMessage");
    const pascalRoute = toPascalCase(routeName);
    if (conn.isLangGraph || derivedInfo?.step?.type === "langgraph_invoke") {
      return `${pascalService}${pascalRoute}StreamChunk`;
    }
    return `${pascalService}${pascalRoute}Response`;
  }, [conn, derivedInfo, endpoints, nodes]);

  const { isProtected } = useWebPageConnectedContext({
    nodeId,
    data: pageNode?.data,
    allNodes: nodes,
    allEdges: edges,
    allEndpoints: endpoints,
  });

  const serviceNodes = useMemo(() => {
    return nodes.filter(
      (n) =>
        n.type === "service" ||
        n.type === "serverless" ||
        n.type === "worker" ||
        Boolean(n.data?.endpoints),
    );
  }, [nodes]);

  const actionEdges = edges.filter(
    (e) =>
      (e.source === nodeId && (e.sourceHandle === `rtc-out-${id}` || e.sourceHandle === `rtc-in-${id}`)) ||
      (e.target === nodeId && (e.targetHandle === `rtc-in-${id}` || e.targetHandle === `rtc-out-${id}`)),
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

  const canvasSteps: ActionStepItem[] = sortedActionEdges.map((e, idx) => {
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

  const handleDeleteStep = (edgeId: string) => {
    useBackendCanvasStore.getState().deleteEdge(edgeId);
  };

  return (
    <div className="flex flex-col gap-5">
      <RealtimeConnectionHeader
        conn={conn}
        pageLabel={pageNode?.data?.label || "Page"}
        isConnected={isConnected}
        isDerived={isDerived}
        derivedInfo={derivedInfo}
        onDelete={() => handleDelete(conn.id)}
        onEditInPipeline={() => {
          if (derivedInfo?.sourceEventId && derivedInfo.sourceNode) {
            setActiveConfigItem({
              type: "event",
              id: derivedInfo.sourceEventId,
              nodeId: derivedInfo.sourceNode.id,
            });
          } else if (derivedInfo?.sourceEndpointId && derivedInfo.sourceNode) {
            setActiveConfigItem({
              type: "endpoint",
              id: derivedInfo.sourceEndpointId,
              nodeId: derivedInfo.sourceNode.id,
            });
          }
        }}
      />



      <div className="flex flex-col gap-4">
        {/* Pipeline Action Steps Accordion (Frontend Action Steps & Connection Mapping) */}
        <Accordion
          type="multiple"
          defaultValue={["connection", "steps", "simulator"]}
          className="w-full flex flex-col gap-3 border-none"
        >
          {/* 1. Connection Mapping (Route, Room, Parameters, Capabilities) */}
          <AccordionItem
            value="connection"
            className="border border-purple-500/30 rounded-xl overflow-hidden bg-card"
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-secondary/20 transition-colors [&>svg]:shrink-0">
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-purple-400" />
                <span className="text-xs font-semibold">
                  Connection Mapping
                </span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1.5 py-0 font-mono text-purple-400 border-purple-500/30 bg-purple-500/10"
                >
                  {(conn.subscriptionBindings?.length || 0)} mapped
                </Badge>
                <Badge
                  variant="secondary"
                  className="text-[9px] px-1.5 py-0 font-mono uppercase"
                >
                  {conn.protocol || "SSE"}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-5 pt-2">
              <RealtimeSubscriptionMappingSection
                conn={conn}
                pageNode={pageNode}
                allNodes={nodes}
                endpoints={endpoints}
                derivedInfo={derivedInfo}
                isProtected={isProtected}
                allConnections={allPageConnections}
                onSelectConnection={(selectedId) =>
                  setActiveConfigItem({
                    type: "realtimeConnection",
                    id: selectedId,
                    nodeId,
                  })
                }
                onDeleteConnection={() => handleDelete(conn.id)}
                onDeleteSpecificConnection={(cId) => handleDelete(cId)}
                onUpdate={handleUpdateManual}
              />
            </AccordionContent>
          </AccordionItem>

          {/* 2. Pipeline Action Steps */}
          <AccordionItem
            value="steps"
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
                  {(conn?.actionSteps?.length || canvasSteps.length)} {((conn?.actionSteps?.length || canvasSteps.length) === 1 ? "step" : "steps")}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-5 pt-2">
              <ActionFlowEditor
                item={{
                  id: conn.id,
                  name: conn.eventName || "message",
                  event: conn.protocol || "SSE",
                  actionSteps: conn.actionSteps,
                }}
                canvasSteps={canvasSteps}
                serviceNodes={serviceNodes}
                allNodes={nodes}
                endpoints={endpoints}
                webPageNodeId={nodeId}
                actionId={id}
                isProtected={isProtected}
                isRealtime={true}
                realtimeEventName={conn.eventName}
                realtimeProtocol={conn.protocol}
                realtimeSourceLabel={conn.sourceServiceLabel || derivedInfo?.sourceNode?.data?.label}
                realtimeSourceItemName={conn.sourceItemName}
                incomingPaths={suggestedPaths}
                isLangGraph={conn.isLangGraph || Boolean(derivedInfo?.step?.type === "langgraph_invoke")}
                langGraphStreamModes={conn.langGraphStreamModes || derivedInfo?.step?.langGraphStreamModes}
                payloadTypeName={payloadTypeName}
                onSave={(drafts: FrontendActionStepDraft[]) =>
                  handleUpdateManual({ actionSteps: drafts })
                }
                onDeleteStep={handleDeleteStep}
              />
            </AccordionContent>
          </AccordionItem>

          {/* 3. Action Simulator */}
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
                item={{
                  id: conn.id,
                  name: conn.eventName || "message",
                  event: conn.protocol || "SSE",
                  actionSteps: conn.actionSteps,
                }}
                steps={conn.actionSteps && conn.actionSteps.length > 0 ? conn.actionSteps : []}
                canvasSteps={canvasSteps}
                allNodes={nodes}
                endpoints={endpoints}
                webPageNodeId={nodeId}
                actionId={id}
                isProtected={isProtected}
                isRealtime={true}
                incomingPaths={suggestedPaths}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};
