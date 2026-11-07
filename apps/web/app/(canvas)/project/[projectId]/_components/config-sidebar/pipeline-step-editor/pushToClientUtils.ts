import {
  ClientDeliveryProtocol,
  RealtimeConnection,
  WebRtcCapabilities,
  WebRtcMediaMode,
  computeMediaMode,
  resolveWebRtcCapabilitiesFromStep,
} from "@workspace/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { PipelineStepDraft } from "./types";

export { computeMediaMode };

/**
 * Sanitizes an event or message name to dot-notation (no spaces).
 * e.g. "Order Created" -> "order.created"
 */
export function sanitizeEventName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ".")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}

/**
 * Resolves discrete WebRTC capabilities from a step draft, ensuring independent
 * control with backward compatibility for legacy mediaMode configurations.
 */
export const resolveCapabilitiesFromStep = resolveWebRtcCapabilitiesFromStep;

/**
 * Upserts a derived RealtimeConnection on a target WebPage node when pushed by a service pipeline step.
 */
export function upsertDerivedConnection(
  store: ReturnType<typeof useBackendCanvasStore.getState>,
  targetPageId: string,
  step: PipelineStepDraft,
  serviceNodeId?: string,
  sourceItemName?: string,
  sourceItemId?: string,
  sourceItemType?: "endpoint" | "event",
) {
  const page = store.nodes.find((n) => n.id === targetPageId);
  if (!page) return;

  const existing = page.data?.realtimeConnections ?? [];
  const serviceNode = serviceNodeId ? store.nodes.find((n) => n.id === serviceNodeId) : undefined;

  const isLangGraph = step.type === "langgraph_invoke";
  const isRtc = !isLangGraph && step.clientDeliveryProtocol === "WEBRTC";
  const caps = isRtc ? resolveWebRtcCapabilitiesFromStep(step) : undefined;
  const derivedMediaMode = isRtc
    ? (caps ? computeMediaMode(caps) : (step.clientDeliveryMediaMode || "data"))
    : undefined;

  const protocol: ClientDeliveryProtocol = isLangGraph
    ? (step.langGraphStreamingProtocol
        ? (step.langGraphStreamingProtocol === "websocket" ? "WEBSOCKET" : "SSE")
        : (step.clientDeliveryProtocol === "WEBSOCKET" ? "WEBSOCKET" : "SSE"))
    : (step.clientDeliveryProtocol ?? "SSE");

  const eventName =
    step.clientDeliveryEventName ||
    (isLangGraph
      ? (protocol === "WEBSOCKET" ? "agent_stream" : "message")
      : (sourceItemName || "message"));

  const room = step.clientDeliveryRoom || (isLangGraph ? step.langGraphStreamingRoom : undefined);

  // Preserve existing storeActionBinding if this connection was already bound to a store
  const existingConn = existing.find((c) => c.id === step.id);

  const derived: RealtimeConnection = {
    id: step.id,
    protocol,
    eventName,
    room,
    mediaMode: derivedMediaMode,
    enableDataChannel: isRtc ? (caps ? caps.enableDataChannel : (step.clientDeliveryEnableDataChannel !== false)) : undefined,
    enableMic: isRtc ? (caps ? caps.enableMic : false) : undefined,
    enableSpeaker: isRtc ? (caps ? caps.enableSpeaker : false) : undefined,
    enableCamera: isRtc ? (caps ? caps.enableCamera : false) : undefined,
    enableScreenShare: isRtc ? (caps ? caps.enableScreenShare : false) : undefined,
    enableRemoteVideo: isRtc ? (caps ? caps.enableRemoteVideo : false) : undefined,
    iceServerUrl: isRtc ? step.clientDeliveryIceServer : undefined,
    description: sourceItemName || step.name || undefined,
    sourceServiceNodeId: serviceNodeId,
    sourceServiceLabel: serviceNode?.data?.label,
    sourceEventId: sourceItemId,
    sourceItemName,
    sourceItemType,
    storeActionBinding: existingConn?.storeActionBinding,
    isLangGraph,
    langGraphStreamModes: isLangGraph ? step.langGraphStreamModes : undefined,
    langGraphStreamingFields: isLangGraph ? step.langGraphStreamingFields : undefined,
    langGraphStreamIncludeReasoning: isLangGraph ? step.langGraphStreamIncludeReasoning : undefined,
    langGraphTargetNodeId: isLangGraph ? step.langGraphTargetNodeId : undefined,
    pathParamBindings: step.clientDeliveryPathParamBindings,
    queryParamBindings: step.clientDeliveryQueryParamBindings,
  };

  const without = existing.filter(
    (c) => c.id !== step.id && (!sourceItemId || c.sourceEventId !== sourceItemId),
  );

  // If connection already exists with identical properties and no other connections were affected, skip store mutation to prevent render loops
  if (
    existingConn &&
    without.length === existing.length - 1 &&
    isRealtimeConnectionEqual(existingConn, derived)
  ) {
    return;
  }

  store.updateNode(targetPageId, {
    data: {
      ...page.data,
      label: page.data?.label || "",
      realtimeConnections: [...without, derived],
    },
  });
}

function isRealtimeConnectionEqual(a?: RealtimeConnection, b?: RealtimeConnection): boolean {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    a.protocol === b.protocol &&
    a.eventName === b.eventName &&
    a.room === b.room &&
    a.mediaMode === b.mediaMode &&
    a.enableDataChannel === b.enableDataChannel &&
    a.enableMic === b.enableMic &&
    a.enableSpeaker === b.enableSpeaker &&
    a.enableCamera === b.enableCamera &&
    a.enableScreenShare === b.enableScreenShare &&
    a.enableRemoteVideo === b.enableRemoteVideo &&
    a.iceServerUrl === b.iceServerUrl &&
    a.description === b.description &&
    a.sourceServiceNodeId === b.sourceServiceNodeId &&
    a.sourceServiceLabel === b.sourceServiceLabel &&
    a.sourceEventId === b.sourceEventId &&
    a.sourceItemName === b.sourceItemName &&
    a.sourceItemType === b.sourceItemType &&
    a.storeActionBinding === b.storeActionBinding &&
    a.isLangGraph === b.isLangGraph &&
    JSON.stringify(a.langGraphStreamModes) === JSON.stringify(b.langGraphStreamModes) &&
    JSON.stringify(a.langGraphStreamingFields) === JSON.stringify(b.langGraphStreamingFields) &&
    a.langGraphStreamIncludeReasoning === b.langGraphStreamIncludeReasoning &&
    a.langGraphTargetNodeId === b.langGraphTargetNodeId &&
    JSON.stringify(a.pathParamBindings) === JSON.stringify(b.pathParamBindings) &&
    JSON.stringify(a.queryParamBindings) === JSON.stringify(b.queryParamBindings)
  );
}

/**
 * Removes a derived RealtimeConnection from a target WebPage node.
 */
export function removeDerivedConnection(
  store: ReturnType<typeof useBackendCanvasStore.getState>,
  oldTargetPageId: string,
  stepId: string,
) {
  const page = store.nodes.find((n) => n.id === oldTargetPageId);
  if (!page) return;
  const existing = page.data?.realtimeConnections ?? [];
  const nextConnections = existing.filter((c) => c.id !== stepId);
  if (nextConnections.length === existing.length) {
    return;
  }
  store.updateNode(oldTargetPageId, {
    data: {
      ...page.data,
      label: page.data?.label || "",
      realtimeConnections: nextConnections,
    },
  });
}
