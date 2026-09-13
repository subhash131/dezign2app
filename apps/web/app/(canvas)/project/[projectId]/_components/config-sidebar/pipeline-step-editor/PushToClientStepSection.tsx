"use client";

import React, { useMemo } from "react";
import { Compass, Plus } from "lucide-react";
import {
  BackendNode,
  BackendEdge,
  AnyMessagingResource,
  Endpoint,
  ClientDeliveryProtocol,
  WebRtcCapabilities,
  WebRtcMediaMode,
  StepSchemaField,
  StepBinding,
} from "@workspace/canvas/types";
import {
  CLIENT_DELIVERY_PROTOCOL_OPTIONS,
  PROTOCOL_OPTIONS,
  CLIENT_DELIVERY_WEBHOOK_METHODS,
  ClientDeliveryWebhookMethod,
  isClientDeliveryProtocol,
  isClientDeliveryWebhookMethod,
} from "@workspace/canvas/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { PipelineStepDraft, AvailableSource, ExpectedArg } from "./types";
import { ensurePageRefConnection } from "./utils";
import { LocalInput } from "../../backend-nodes/graph-nodes/common/LocalInput";
import { parseSchemaJson } from "@/lib/compiler/utils";
import {
  sanitizeEventName,
  computeMediaMode,
  resolveCapabilitiesFromStep,
  upsertDerivedConnection,
  removeDerivedConnection,
} from "./pushToClientUtils";
import { WebRtcCapabilitiesEditor } from "./WebRtcCapabilitiesEditor";
import { PushToClientPayloadMapping } from "./PushToClientPayloadMapping";

// Re-export utilities and subcomponents for backward compatibility
export * from "./pushToClientUtils";
export * from "./WebRtcCapabilitiesEditor";
export * from "./PushToClientPayloadMapping";
export { PROTOCOL_OPTIONS, CLIENT_DELIVERY_PROTOCOL_OPTIONS } from "@workspace/canvas/constants";
export type { WebRtcCapabilities, WebRtcMediaMode } from "@workspace/canvas/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PushToClientStepSectionProps {
  step: PipelineStepDraft;
  allNodes: BackendNode[];
  allEdges: BackendEdge[];
  serviceNodeId?: string;
  endpoint?: Endpoint;
  consumedEvent?: AnyMessagingResource;
  expectedArgs?: ExpectedArg[];
  availableSources?: AvailableSource[];
  onChange: (updated: PipelineStepDraft) => void;
  onAutoMapArguments?: () => void;
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PushToClientStepSection: React.FC<PushToClientStepSectionProps> = ({
  step,
  allNodes,
  allEdges,
  serviceNodeId,
  endpoint,
  consumedEvent,
  onChange,
  children,
}) => {
  const fallbackNodes = useBackendCanvasStore((s) => (allNodes.length ? null : s.nodes));
  const fallbackEdges = useBackendCanvasStore((s) => (allEdges.length ? null : s.edges));
  const nodes = allNodes.length ? allNodes : (fallbackNodes || []);
  const edges = allEdges.length ? allEdges : (fallbackEdges || []);

  const webAppNodes = useMemo(() => nodes.filter((n) => n.type === "webApp"), [nodes]);
  const allWebPageNodes = useMemo(() => nodes.filter((n) => n.type === "webPage"), [nodes]);

  const protocol = step.clientDeliveryProtocol || "SSE";
  const selectedWebAppId = step.clientDeliveryTargetWebAppId || "";
  const targetPageId = step.clientDeliveryTargetPageId || "";

  // Filter pages belonging to the selected WebApp
  const filteredWebPageNodes = useMemo(() => {
    if (!selectedWebAppId || selectedWebAppId === "__all__") {
      return allWebPageNodes;
    }
    const webApp = webAppNodes.find((w) => w.id === selectedWebAppId);
    return allWebPageNodes.filter((page) => {
      // 1. Direct edge between WebApp and WebPage
      const isConnected = edges.some(
        (e) =>
          (e.source === selectedWebAppId && e.target === page.id) ||
          (e.target === selectedWebAppId && e.source === page.id),
      );
      if (isConnected) return true;

      // 2. Matching appSlug or appName
      if (webApp?.data?.appSlug && page.data?.appSlug === webApp.data.appSlug) return true;
      if (webApp?.data?.label && page.data?.appName === webApp.data.label) return true;

      return false;
    });
  }, [allWebPageNodes, selectedWebAppId, webAppNodes, edges]);

  const update = (patch: Partial<PipelineStepDraft>) => {
    const updated = { ...step, ...patch };
    onChange(updated);

    const targetPageChanged =
      patch.clientDeliveryTargetPageId !== undefined &&
      patch.clientDeliveryTargetPageId !== step.clientDeliveryTargetPageId;
    const protocolChanged =
      patch.clientDeliveryProtocol !== undefined &&
      patch.clientDeliveryProtocol !== step.clientDeliveryProtocol;
    const capabilitiesChanged =
      patch.clientDeliveryEnableMic !== undefined ||
      patch.clientDeliveryEnableSpeaker !== undefined ||
      patch.clientDeliveryEnableCamera !== undefined ||
      patch.clientDeliveryEnableScreenShare !== undefined ||
      patch.clientDeliveryEnableRemoteVideo !== undefined ||
      patch.clientDeliveryEnableDataChannel !== undefined ||
      patch.clientDeliveryMediaMode !== undefined ||
      patch.clientDeliveryEventName !== undefined ||
      patch.clientDeliveryRoom !== undefined ||
      patch.clientDeliveryIceServer !== undefined;

    const tgtId = patch.clientDeliveryTargetPageId ?? step.clientDeliveryTargetPageId;
    if (tgtId && (targetPageChanged || protocolChanged || capabilitiesChanged)) {
      const store = useBackendCanvasStore.getState();
      if (targetPageChanged && step.clientDeliveryTargetPageId) {
        removeDerivedConnection(store, step.clientDeliveryTargetPageId, step.id);
      }
      const sourceItemName = endpoint
        ? endpoint.name || "Endpoint"
        : consumedEvent
        ? consumedEvent.name
        : undefined;
      const sourceItemId = endpoint ? endpoint.id : consumedEvent ? consumedEvent.id : undefined;
      const sourceItemType = endpoint ? "endpoint" : consumedEvent ? "event" : undefined;
      upsertDerivedConnection(
        store,
        tgtId,
        updated,
        serviceNodeId,
        sourceItemName,
        sourceItemId,
        sourceItemType,
      );

      if (serviceNodeId && (targetPageChanged || protocolChanged)) {
        const conn = ensurePageRefConnection({
          targetPageId: tgtId,
          pageRefNodeId: updated.clientDeliveryPageRefNodeId || step.clientDeliveryPageRefNodeId,
          serviceNodeId,
          endpointId: endpoint?.id,
          consumedEventId: consumedEvent?.id,
          stepId: step.id,
        });
        if (conn?.pageRefNodeId && updated.clientDeliveryPageRefNodeId !== conn.pageRefNodeId) {
          updated.clientDeliveryPageRefNodeId = conn.pageRefNodeId;
          onChange(updated);
        }
      }
    }
  };

  const sourceHandle = endpoint?.id
    ? `endpoint-out-${endpoint.id}`
    : consumedEvent?.id
    ? `consumedEvents-out-${consumedEvent.id}`
    : serviceNodeId
    ? `endpoint-out-${serviceNodeId}`
    : undefined;

  const connectedEdge = edges.find(
    (e) =>
      e.source === serviceNodeId &&
      (sourceHandle ? e.sourceHandle === sourceHandle || !e.sourceHandle : true) &&
      nodes.some((n) => n.id === e.target && n.type === "page_ref"),
  );

  const connectedPageRefNode = connectedEdge
    ? nodes.find((n) => n.id === connectedEdge.target && n.type === "page_ref")
    : step.clientDeliveryPageRefNodeId
    ? nodes.find((n) => n.id === step.clientDeliveryPageRefNodeId && n.type === "page_ref")
    : null;

  const handleSpawnPageRefNode = () => {
    if (!serviceNodeId) return;
    const conn = ensurePageRefConnection({
      targetPageId: targetPageId || undefined,
      pageRefNodeId: step.clientDeliveryPageRefNodeId,
      serviceNodeId,
      endpointId: endpoint?.id,
      consumedEventId: consumedEvent?.id,
      stepId: step.id,
    });
    if (conn?.pageRefNodeId) {
      update({
        clientDeliveryPageRefNodeId: conn.pageRefNodeId,
        ...(conn.targetPageId && !targetPageId ? { clientDeliveryTargetPageId: conn.targetPageId } : {}),
      });
    }
  };

  const incomingSchemaFields = useMemo(() => {
    if (consumedEvent?.payloadSchema) {
      if (
        Array.isArray(consumedEvent.payloadSchema.fields) &&
        consumedEvent.payloadSchema.fields.length > 0
      ) {
        return consumedEvent.payloadSchema.fields
          .filter((f) => f && f.name && f.name.trim())
          .map((f) => ({
            name: f.name!.trim(),
            type: f.type || "string",
          }));
      }
      if (consumedEvent.payloadSchema.rawJson) {
        const parsed = parseSchemaJson(consumedEvent.payloadSchema.rawJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return Object.entries(parsed).map(([k, v]) => ({
            name: k,
            type: typeof v === "object" && v !== null ? "object" : typeof v,
          }));
        }
      }
    }
    if (endpoint?.requestBody) {
      if (
        Array.isArray(endpoint.requestBody.fields) &&
        endpoint.requestBody.fields.length > 0
      ) {
        return endpoint.requestBody.fields
          .filter((f) => f && f.name && f.name.trim())
          .map((f) => ({
            name: f.name!.trim(),
            type: f.type || "string",
          }));
      }
      if (endpoint.requestBody.rawJson) {
        const parsed = parseSchemaJson(endpoint.requestBody.rawJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return Object.entries(parsed).map(([k, v]) => ({
            name: k,
            type: typeof v === "object" && v !== null ? "object" : typeof v,
          }));
        }
      }
    }
    return [];
  }, [consumedEvent, endpoint]);

  const handleForwardWholePayload = () => {
    update({
      inputBindings: [
        {
          argName: "payload",
          source: { kind: "req_body", field: "" },
        },
      ],
    });
  };

  const handleMapAllSchemaFields = () => {
    if (incomingSchemaFields.length === 0) return;
    const bindings: StepBinding[] = incomingSchemaFields.map((f) => ({
      argName: f.name,
      source: { kind: "req_body", field: f.name },
    }));
    update({ inputBindings: bindings });
  };

  return (
    <div className="flex flex-col gap-3 pt-1">
      {/* Target WebApp Selector (Optional filter) */}
      {webAppNodes.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Target Web Application
          </span>
          <Select
            value={selectedWebAppId || "__all__"}
            onValueChange={(val) => {
              const newWebAppId = val === "__all__" ? undefined : val;
              update({
                clientDeliveryTargetWebAppId: newWebAppId,
                ...(newWebAppId &&
                targetPageId &&
                !filteredWebPageNodes.some((p) => p.id === targetPageId)
                  ? { clientDeliveryTargetPageId: undefined }
                  : {}),
              });
            }}
          >
            <SelectTrigger className="h-7 text-xs bg-background nodrag">
              <SelectValue placeholder="All Web Applications" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">
                All Web Applications ({allWebPageNodes.length} pages)
              </SelectItem>
              {webAppNodes
                .filter((w) => Boolean(w && w.id && w.id.trim()))
                .map((w) => (
                  <SelectItem key={w.id} value={w.id} className="text-xs">
                    {w.data?.label || w.data?.appSlug || "WebApp"}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Target Page */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Target Web Page
          </span>
          {connectedPageRefNode ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400">
              <Compass size={10} /> Connected PageRef Node
            </span>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
              onClick={handleSpawnPageRefNode}
              title="Spawn & Connect PageRef node on canvas"
            >
              <Plus size={10} /> Connect PageRef
            </button>
          )}
        </div>
        <Select
          value={targetPageId || "__none__"}
          onValueChange={(val) => {
            if (val === "__none__") return;
            update({ clientDeliveryTargetPageId: val });
          }}
        >
          <SelectTrigger className="h-7 text-xs bg-background nodrag">
            <SelectValue placeholder="Select target web page…" />
          </SelectTrigger>
          <SelectContent>
            {filteredWebPageNodes.length === 0 ? (
              <SelectItem value="__none__" disabled className="text-xs">
                {selectedWebAppId
                  ? "No pages attached to this WebApp"
                  : "No WebPage nodes on canvas"}
              </SelectItem>
            ) : (
              filteredWebPageNodes
                .filter((n) => Boolean(n && n.id && n.id.trim()))
                .map((n) => {
                  const route = n.data?.label
                    ? n.data.label.startsWith("/")
                      ? n.data.label
                      : `/${n.data.label}`
                    : n.id;
                  return (
                    <SelectItem key={n.id} value={n.id} className="text-xs">
                      {route} {n.data?.appName ? `(${n.data.appName})` : ""}
                    </SelectItem>
                  );
                })
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Protocol */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Delivery Protocol
        </span>
        <Select
          value={protocol}
          onValueChange={(val) => {
            if (!isClientDeliveryProtocol(val)) return;
            if (val !== "WEBRTC") {
              update({
                clientDeliveryProtocol: val,
                clientDeliveryMediaMode: undefined,
                clientDeliveryEnableDataChannel: undefined,
                clientDeliveryEnableMic: undefined,
                clientDeliveryEnableSpeaker: undefined,
                clientDeliveryEnableCamera: undefined,
                clientDeliveryEnableScreenShare: undefined,
                clientDeliveryEnableRemoteVideo: undefined,
                clientDeliveryIceServer: undefined,
              });
            } else {
              update({ clientDeliveryProtocol: val });
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs bg-background nodrag">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLIENT_DELIVERY_PROTOCOL_OPTIONS
              .filter((opt) => Boolean(opt && opt.value && opt.value.trim()))
              .map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Event / Message Name (Optional) */}
      {(protocol === "SSE" || protocol === "WEBSOCKET" || protocol === "WEBRTC") && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {protocol === "WEBRTC" ? "Data Channel Label" : "Event / Message Name"}
            </span>
            <span className="text-[9px] text-muted-foreground/60">Optional (defaults to &quot;message&quot;)</span>
          </div>
          <LocalInput
            className="h-7 text-xs bg-background"
            placeholder={
              protocol === "SSE"
                ? "e.g. order.updated (or leave empty for default)"
                : protocol === "WEBSOCKET"
                ? "e.g. chat.message (or leave empty for default)"
                : "e.g. data-channel"
            }
            value={step.clientDeliveryEventName || ""}
            onBlur={(e) => update({ clientDeliveryEventName: sanitizeEventName(e.target.value) })}
          />
          <span className="text-[9px] text-muted-foreground/70">
            {protocol === "SSE"
              ? "Browser listens via eventSource.addEventListener('name'). If empty, uses standard onmessage."
              : protocol === "WEBSOCKET"
              ? "Used as the { type: 'name' } envelope tag in WebSocket JSON packets."
              : "WebRTC data channel identifier label."}
          </span>
        </div>
      )}

      {/* WebSocket / WebRTC room */}
      {(protocol === "WEBSOCKET" || protocol === "WEBRTC") && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {protocol === "WEBRTC" ? "Signaling Room / Peer Channel" : "Broadcast Room / Channel"}
          </span>
          <LocalInput
            className="h-7 text-xs bg-background"
            placeholder={
              protocol === "WEBRTC"
                ? "e.g. room:conference or lobby"
                : "e.g. global or room:${userId}"
            }
            value={step.clientDeliveryRoom || ""}
            onBlur={(e) => update({ clientDeliveryRoom: e.target.value })}
          />
        </div>
      )}

      {/* WebRTC Channels & Media Capabilities */}
      {protocol === "WEBRTC" && (
        <WebRtcCapabilitiesEditor step={step} onCommit={update} />
      )}

      {/* API_PUSH */}
      {protocol === "API_PUSH" && (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Webhook URL
            </span>
            <LocalInput
              className="h-7 text-xs bg-background font-mono"
              placeholder="https://example.com/webhook"
              value={step.clientDeliveryWebhookUrl || ""}
              onBlur={(e) => update({ clientDeliveryWebhookUrl: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              HTTP Method
            </span>
            <Select
              value={step.clientDeliveryWebhookMethod || "POST"}
              onValueChange={(val) => {
                if (isClientDeliveryWebhookMethod(val)) {
                  update({ clientDeliveryWebhookMethod: val });
                }
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-background nodrag">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_DELIVERY_WEBHOOK_METHODS.map((method) => (
                  <SelectItem key={method} value={method} className="text-xs">
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {/* Client Delivery Payload Mapping Guidance */}
      <PushToClientPayloadMapping
        protocol={protocol}
        incomingSchemaFields={incomingSchemaFields}
        onForwardWholePayload={handleForwardWholePayload}
        onMapAllSchemaFields={handleMapAllSchemaFields}
      />

      {/* Payload / Data Input Binding (inherited from prior steps like Transformer, DB, etc.) */}
      {children}
    </div>
  );
};
