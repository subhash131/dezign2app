"use client";

import React, { useMemo, useState, useCallback } from "react";
import { Compass, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
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
import { parseRouteWithQueryParams } from "@workspace/canvas";
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
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { PipelineStepDraft, AvailableSource, ExpectedArg } from "./types";
import { ensurePageRefConnection } from "./utils";
import { BindingSourceEditor } from "./BindingSourceEditor";
import {
  stepSourceToAccessor,
  accessorToStepSource,
  getArgBinding,
} from "./langgraph-invoke/utils";
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
import { ensureWsPackageInService } from "@/lib/stores/backendCanvas/packageTypesSync";

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
  availableSources = [],
  onChange,
  children,
}) => {
  const [newQueryKey, setNewQueryKey] = useState("");
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
      patch.clientDeliveryIceServer !== undefined ||
      patch.clientDeliveryPathParamBindings !== undefined ||
      patch.clientDeliveryQueryParamBindings !== undefined;

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
    const seen = new Set<string>();
    const bindings: StepBinding[] = incomingSchemaFields
      .filter((f) => {
        const lower = f.name.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      })
      .map((f) => ({
        argName: f.name,
        source: { kind: "req_body", field: f.name },
      }));
    update({ inputBindings: bindings });
  };

  const selectedTargetPage = useMemo(() => {
    return allWebPageNodes.find((p) => p.id === targetPageId);
  }, [allWebPageNodes, targetPageId]);

  const targetRouteInfo = useMemo(() => {
    if (!selectedTargetPage) {
      return null;
    }

    const rawRoute = selectedTargetPage.data?.label || selectedTargetPage.data?.path || "/";
    const parsed = parseRouteWithQueryParams(rawRoute);
    const seenPath = new Set<string>();
    const pathParams: Array<{ name: string; type?: string }> = [];

    // 1. From node's declared pathParams
    if (Array.isArray(selectedTargetPage.data?.pathParams)) {
      selectedTargetPage.data.pathParams.forEach((p: { name?: string; type?: string }) => {
        if (p.name && !seenPath.has(p.name)) {
          seenPath.add(p.name);
          pathParams.push({ name: p.name, type: p.type || "string" });
        }
      });
    }

    // 2. From route string (e.g. /chat/[id])
    parsed.extractedPathParams.forEach((ep) => {
      if (ep.name && !seenPath.has(ep.name)) {
        seenPath.add(ep.name);
        pathParams.push({ name: ep.name, type: ep.type || "string" });
      }
    });

    const seenQuery = new Set<string>();
    const queryParams: Array<{ name: string; type?: string; defaultValue?: string }> = [];

    // 1. From node's declared queryParams
    if (Array.isArray(selectedTargetPage.data?.queryParams)) {
      selectedTargetPage.data.queryParams.forEach((q: { name?: string; type?: string; defaultValue?: string }) => {
        if (q.name && !seenQuery.has(q.name)) {
          seenQuery.add(q.name);
          queryParams.push({ name: q.name, type: q.type || "string", defaultValue: q.defaultValue });
        }
      });
    }

    // 2. From query in route string
    parsed.extractedQueryParams.forEach((eq) => {
      if (eq.name && !seenQuery.has(eq.name)) {
        seenQuery.add(eq.name);
        queryParams.push({ name: eq.name, type: eq.type || "string", defaultValue: eq.defaultValue });
      }
    });

    // 3. Include any query params already mapped in step.clientDeliveryQueryParamBindings
    if (step.clientDeliveryQueryParamBindings) {
      Object.keys(step.clientDeliveryQueryParamBindings).forEach((k) => {
        if (!seenQuery.has(k)) {
          seenQuery.add(k);
          queryParams.push({ name: k, type: "string" });
        }
      });
    }

    return {
      isDynamic: pathParams.length > 0,
      pathParams,
      queryParams,
      displayRoute: parsed.route || rawRoute,
    };
  }, [selectedTargetPage, step.clientDeliveryQueryParamBindings]);

  const getFallbackPathParamAccessor = useCallback(
    (paramName: string): string => {
      const epPathParams = endpoint?.pathParams || [];
      const match = epPathParams.find((p) => p.name?.toLowerCase() === paramName.toLowerCase());
      if (match) return `params.${match.name}`;

      const paramsSrc = availableSources?.find((s) => s.kind === "req_params");
      if (paramsSrc) {
        const matchingPath = paramsSrc.paths.find((p) => p.path?.toLowerCase() === paramName.toLowerCase());
        if (matchingPath) return `params.${matchingPath.path}`;
        if (paramsSrc.paths.length > 0 && paramsSrc.paths[0]?.path) return `params.${paramsSrc.paths[0].path}`;
      }

      return `params.${paramName}`;
    },
    [endpoint?.pathParams, availableSources],
  );

  const getFallbackQueryParamAccessor = useCallback(
    (key: string, defaultValue?: string): string => {
      const epQueryParams = endpoint?.queryParams || [];
      const match = epQueryParams.find((q) => q.name?.toLowerCase() === key.toLowerCase());
      if (match) return `query.${match.name}`;

      const querySrc = availableSources?.find((s) => s.kind === "req_query");
      if (querySrc) {
        const matchingPath = querySrc.paths.find((p) => p.path?.toLowerCase() === key.toLowerCase());
        if (matchingPath) return `query.${matchingPath.path}`;
      }

      if (defaultValue !== undefined && defaultValue !== "") {
        return defaultValue;
      }

      return `query.${key}`;
    },
    [endpoint?.queryParams, availableSources],
  );

  const getPathParamBinding = useCallback(
    (paramName: string): StepBinding => {
      const explicitAccessor = step.clientDeliveryPathParamBindings?.[paramName];
      const fallback = getFallbackPathParamAccessor(paramName);
      return getArgBinding(
        step,
        availableSources || [],
        `pathParam:${paramName}`,
        explicitAccessor,
        fallback,
      );
    },
    [step, availableSources, getFallbackPathParamAccessor],
  );

  const hasCustomPathParamBinding = useCallback(
    (paramName: string): boolean => {
      return Boolean(
        step.clientDeliveryPathParamBindings?.[paramName] ||
          (step.inputBindings || []).some(
            (b) => b.argName === `pathParam:${paramName}` || b.argName === paramName,
          ),
      );
    },
    [step.clientDeliveryPathParamBindings, step.inputBindings],
  );

  const getQueryParamBinding = useCallback(
    (key: string, defaultValue?: string): StepBinding => {
      const explicitAccessor = step.clientDeliveryQueryParamBindings?.[key];
      const fallback = getFallbackQueryParamAccessor(key, defaultValue);
      return getArgBinding(
        step,
        availableSources || [],
        `queryParam:${key}`,
        explicitAccessor,
        fallback,
      );
    },
    [step, availableSources, getFallbackQueryParamAccessor],
  );

  const hasCustomQueryParamBinding = useCallback(
    (key: string): boolean => {
      return Boolean(
        step.clientDeliveryQueryParamBindings?.[key] ||
          (step.inputBindings || []).some(
            (b) => b.argName === `queryParam:${key}` || b.argName === key,
          ),
      );
    },
    [step.clientDeliveryQueryParamBindings, step.inputBindings],
  );

  const handlePathParamBindingChange = useCallback(
    (paramName: string, updated: StepBinding) => {
      const currentBindings = step.inputBindings || [];
      const argKey = `pathParam:${paramName}`;
      const otherBindings = currentBindings.filter((b) => b.argName !== argKey && b.argName !== paramName);
      const nextBindings: StepBinding[] = [...otherBindings, { argName: argKey, source: updated.source }];
      const accessor = stepSourceToAccessor(updated.source, availableSources || []);
      const nextMap = { ...(step.clientDeliveryPathParamBindings || {}), [paramName]: accessor };
      update({
        inputBindings: nextBindings,
        clientDeliveryPathParamBindings: nextMap,
      });
    },
    [step, availableSources, update],
  );

  const handleResetPathParamBinding = useCallback(
    (paramName: string) => {
      const currentBindings = step.inputBindings || [];
      const argKey = `pathParam:${paramName}`;
      const nextBindings = currentBindings.filter((b) => b.argName !== argKey && b.argName !== paramName);
      const nextMap = { ...(step.clientDeliveryPathParamBindings || {}) };
      delete nextMap[paramName];
      update({
        inputBindings: nextBindings,
        clientDeliveryPathParamBindings: Object.keys(nextMap).length > 0 ? nextMap : undefined,
      });
    },
    [step, update],
  );

  const handleQueryParamBindingChange = useCallback(
    (key: string, updated: StepBinding) => {
      const currentBindings = step.inputBindings || [];
      const argKey = `queryParam:${key}`;
      const otherBindings = currentBindings.filter((b) => b.argName !== argKey && b.argName !== key);
      const nextBindings: StepBinding[] = [...otherBindings, { argName: argKey, source: updated.source }];
      const accessor = stepSourceToAccessor(updated.source, availableSources || []);
      const nextMap = { ...(step.clientDeliveryQueryParamBindings || {}), [key]: accessor };
      update({
        inputBindings: nextBindings,
        clientDeliveryQueryParamBindings: nextMap,
      });
    },
    [step, availableSources, update],
  );

  const handleResetQueryParamBinding = useCallback(
    (key: string) => {
      const currentBindings = step.inputBindings || [];
      const argKey = `queryParam:${key}`;
      const nextBindings = currentBindings.filter((b) => b.argName !== argKey && b.argName !== key);
      const nextMap = { ...(step.clientDeliveryQueryParamBindings || {}) };
      delete nextMap[key];
      update({
        inputBindings: nextBindings,
        clientDeliveryQueryParamBindings: Object.keys(nextMap).length > 0 ? nextMap : undefined,
      });
    },
    [step, update],
  );

  const handleAddCustomQueryParam = useCallback(
    (key: string) => {
      const trimmed = key.trim();
      if (!trimmed) return;
      const currentBindings = step.inputBindings || [];
      const argKey = `queryParam:${trimmed}`;
      const defaultAccessor = getFallbackQueryParamAccessor(trimmed);
      const stepSrc = accessorToStepSource(defaultAccessor, availableSources || []);
      const nextBindings: StepBinding[] = [
        ...currentBindings.filter((b) => b.argName !== argKey && b.argName !== trimmed),
        { argName: argKey, source: stepSrc },
      ];
      const nextMap = { ...(step.clientDeliveryQueryParamBindings || {}), [trimmed]: defaultAccessor };
      update({
        inputBindings: nextBindings,
        clientDeliveryQueryParamBindings: nextMap,
      });
    },
    [step, availableSources, getFallbackQueryParamAccessor, update],
  );

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

        {/* Dynamic Route & Query Parameter Mapping */}
        {Boolean(
          targetRouteInfo &&
            (targetRouteInfo.isDynamic ||
              (targetRouteInfo.queryParams && targetRouteInfo.queryParams.length > 0)),
        ) && (
          <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-background/50 border border-border/40 mt-1">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3 text-indigo-400" />
                <span>Target Route &amp; Query Parameters</span>
              </Label>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                {targetRouteInfo!.displayRoute}
              </span>
            </div>

            <p className="text-[9.5px] text-muted-foreground leading-tight">
              Map dynamic route segments ({targetRouteInfo!.pathParams.map((p) => `:${p.name}`).join(", ") || "parameters"}) and query parameters for this client target from the endpoint request context.
            </p>

            <div className="grid grid-cols-[140px_auto_1fr_auto] gap-2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-1">
              <span>Target Key</span>
              <span></span>
              <span>Source &amp; Field</span>
              <span className="w-6 text-right"></span>
            </div>

            {/* Path Parameters */}
            {targetRouteInfo!.pathParams.map((p) => {
              const binding = getPathParamBinding(p.name);
              const hasCustom = hasCustomPathParamBinding(p.name);
              return (
                <div
                  key={`path-param-${p.name}`}
                  className="grid grid-cols-[140px_auto_1fr_auto] gap-2 items-center text-xs bg-background/60 p-1.5 rounded-lg border border-indigo-500/20"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-indigo-400 text-[11px] truncate bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                      :{p.name}
                    </span>
                    <span className="text-[8.5px] text-purple-400 font-mono shrink-0">path</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 px-0.5 select-none">←</span>
                  <div className="min-w-0">
                    <BindingSourceEditor
                      binding={binding}
                      availableSources={availableSources || []}
                      serviceNodeId={serviceNodeId}
                      onChange={(updated) => handlePathParamBindingChange(p.name, updated)}
                    />
                  </div>
                  <div className="flex justify-end">
                    {hasCustom ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleResetPathParamBinding(p.name)}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title={`Reset :${p.name} to default`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <div className="w-6" />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Query Parameters */}
            {targetRouteInfo!.queryParams.map((q) => {
              const binding = getQueryParamBinding(q.name, q.defaultValue);
              const hasCustom = hasCustomQueryParamBinding(q.name);
              return (
                <div
                  key={`query-param-${q.name}`}
                  className="grid grid-cols-[140px_auto_1fr_auto] gap-2 items-center text-xs bg-background/60 p-1.5 rounded-lg border border-sky-500/20"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-sky-400 text-[11px] truncate bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                      ?{q.name}
                    </span>
                    <span className="text-[8.5px] text-sky-400 font-mono shrink-0">query</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 px-0.5 select-none">←</span>
                  <div className="min-w-0">
                    <BindingSourceEditor
                      binding={binding}
                      availableSources={availableSources || []}
                      serviceNodeId={serviceNodeId}
                      onChange={(updated) => handleQueryParamBindingChange(q.name, updated)}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleResetQueryParamBinding(q.name)}
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title={`Reset ?${q.name} binding`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Add Custom Query Param */}
            <div className="flex items-center gap-1.5 pt-1">
              <LocalInput
                value={newQueryKey}
                onChange={(e) => setNewQueryKey(e.target.value)}
                placeholder="Add query param (e.g. filter, tab)..."
                className="h-6 text-[10px] bg-background/60 border-border/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newQueryKey.trim()) {
                    handleAddCustomQueryParam(newQueryKey);
                    setNewQueryKey("");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!newQueryKey.trim()}
                onClick={() => {
                  if (newQueryKey.trim()) {
                    handleAddCustomQueryParam(newQueryKey);
                    setNewQueryKey("");
                  }
                }}
                className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-foreground shrink-0"
              >
                <Plus className="w-3 h-3" />
                Add Param
              </Button>
            </div>
          </div>
        )}
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
            if (val === "WEBSOCKET" && serviceNodeId) {
              ensureWsPackageInService({ serviceNodeId });
            }
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
