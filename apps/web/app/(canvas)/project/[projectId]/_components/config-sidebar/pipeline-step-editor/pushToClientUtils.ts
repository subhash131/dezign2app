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

  const isRtc = step.clientDeliveryProtocol === "WEBRTC";
  const caps = isRtc ? resolveWebRtcCapabilitiesFromStep(step) : undefined;
  const derivedMediaMode = isRtc
    ? (caps ? computeMediaMode(caps) : (step.clientDeliveryMediaMode || "data"))
    : undefined;

  const derived: RealtimeConnection = {
    id: step.id,
    protocol: step.clientDeliveryProtocol || "SSE",
    eventName: step.clientDeliveryEventName || sourceItemName || "message",
    room: step.clientDeliveryRoom,
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
  };

  const without = existing.filter(
    (c) => c.id !== step.id && (!serviceNodeId || c.sourceServiceNodeId !== serviceNodeId),
  );
  store.updateNode(targetPageId, {
    data: {
      ...page.data,
      label: page.data?.label || "",
      realtimeConnections: [...without, derived],
    },
  });
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
  store.updateNode(oldTargetPageId, {
    data: {
      ...page.data,
      label: page.data?.label || "",
      realtimeConnections: existing.filter((c) => c.id !== stepId),
    },
  });
}
