"use client";

import React, { useMemo } from "react";
import {
  Link2,
  Plus,
  Trash2,
  Sparkles,
  Key,
  Globe,
  Radio,
  SlidersHorizontal,
  Code2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Wifi,
  Video,
} from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type {
  BackendNode,
  Endpoint,
  FrontendRequestFieldBinding,
  FrontendFieldSource,
  BindingSlot,
  RealtimeConnection,
} from "@workspace/canvas";
import { ActionFlowCombobox, ComboboxOption } from "../web-page-event-config/action-flow/ActionFlowCombobox";
import { DerivedRealtimeInfo } from "./types";
import { isAuthHeaderName } from "../web-page-event-config/action-flow/utils";
import { WebRtcCapabilitiesSection } from "./WebRtcCapabilitiesSection";
import type { MergedPageRealtimeConnection } from "./useAllPageRealtimeConnections";
import { cn } from "@workspace/ui/lib/utils";

export interface RealtimeSubscriptionMappingSectionProps {
  conn: RealtimeConnection;
  pageNode?: BackendNode;
  allNodes?: BackendNode[];
  endpoints?: Endpoint[];
  derivedInfo?: DerivedRealtimeInfo | null;
  isProtected?: boolean;
  allConnections?: MergedPageRealtimeConnection[];
  onSelectConnection?: (connId: string) => void;
  onDeleteConnection?: () => void;
  onDeleteSpecificConnection?: (connId: string) => void;
  onUpdate?: (changes: Partial<RealtimeConnection>) => void;
  onUpdateBindings?: (bindings: FrontendRequestFieldBinding[]) => void;
}

export interface StateVarComboboxOption extends ComboboxOption {
  storeName?: string;
  storeId?: string;
}

type SourceKindOption =
  | "route_param"
  | "state_var"
  | "query_param"
  | "user_input"
  | "literal"
  | "auth_token";

/**
 * Extracts param names from route string like "/send-message/:id" or "/rooms/[roomId]"
 */
export function extractParamsFromRoute(route?: string): string[] {
  if (!route) return [];
  const params: string[] = [];
  const colonMatches = route.match(/:([a-zA-Z0-9_]+)/g);
  if (colonMatches) {
    colonMatches.forEach((m) => {
      const name = m.replace(/^:/, "");
      if (!params.includes(name)) params.push(name);
    });
  }
  const bracketMatches = route.match(/\[([a-zA-Z0-9_]+)\]/g);
  if (bracketMatches) {
    bracketMatches.forEach((m) => {
      const name = m.replace(/^\[/, "").replace(/\]$/, "");
      if (!params.includes(name)) params.push(name);
    });
  }
  return params;
}

export const RealtimeSubscriptionMappingSection: React.FC<RealtimeSubscriptionMappingSectionProps> = ({
  conn,
  pageNode,
  allNodes = [],
  endpoints = [],
  derivedInfo = null,
  isProtected = false,
  allConnections = [],
  onSelectConnection,
  onDeleteConnection,
  onDeleteSpecificConnection,
  onUpdate,
  onUpdateBindings,
}) => {
  const currentBindings: FrontendRequestFieldBinding[] = useMemo(() => {
    return conn.subscriptionBindings || [];
  }, [conn.subscriptionBindings]);

  // Find linked endpoint definition if derived or matched by name
  const linkedEndpoint = useMemo(() => {
    if (derivedInfo?.sourceEndpointId) {
      return endpoints.find((e) => e.id === derivedInfo.sourceEndpointId);
    }
    if (conn.sourceItemName) {
      return endpoints.find(
        (e) =>
          e.name === conn.sourceItemName ||
          e.name === conn.sourceItemName?.replace(/^\//, "") ||
          `/${e.name}` === conn.sourceItemName,
      );
    }
    return undefined;
  }, [derivedInfo?.sourceEndpointId, conn.sourceItemName, endpoints]);

  // Collect potential path param names from route pattern, endpoint, connection name, or page route
  const detectedPathParamNames = useMemo(() => {
    const set = new Set<string>();
    const routeCandidate =
      linkedEndpoint?.name ||
      conn.sourceItemName ||
      conn.streamUrl ||
      conn.eventName ||
      "";
    extractParamsFromRoute(routeCandidate).forEach((p) => set.add(p));

    if (linkedEndpoint?.pathParams) {
      linkedEndpoint.pathParams.forEach((p) => {
        if (p.name) set.add(p.name);
      });
    }

    // Include path parameters from the web page itself (e.g. /chat/[id])
    if (Array.isArray(pageNode?.data?.pathParams)) {
      pageNode.data.pathParams.forEach((p: { name?: string }) => {
        if (p.name) set.add(p.name);
      });
    }
    const pageRouteCandidate = pageNode?.data?.label || pageNode?.data?.path || "";
    extractParamsFromRoute(pageRouteCandidate).forEach((p) => set.add(p));

    return Array.from(set);
  }, [linkedEndpoint, conn.sourceItemName, conn.streamUrl, conn.eventName, pageNode]);

  // Collect route param suggestions from pageNode
  const routeParamSuggestions = useMemo((): ComboboxOption[] => {
    const list: ComboboxOption[] = [];
    if (pageNode?.data?.pathParams) {
      pageNode.data.pathParams.forEach((p: { name: string; type?: string }) => {
        if (p.name) {
          list.push({
            value: p.name,
            label: p.name,
            type: p.type || "string",
          });
        }
      });
    }
    const pageRoute = pageNode?.data?.route || pageNode?.data?.label || "";
    extractParamsFromRoute(pageRoute).forEach((p) => {
      if (!list.some((existing) => existing.value === p)) {
        list.push({ value: p, label: p, type: "string" });
      }
    });
    return list;
  }, [pageNode]);

  // Collect query param suggestions from pageNode
  const queryParamSuggestions = useMemo((): ComboboxOption[] => {
    const list: ComboboxOption[] = [];
    if (pageNode?.data?.queryParams) {
      pageNode.data.queryParams.forEach((q: { name: string; type?: string }) => {
        if (q.name) {
          list.push({
            value: q.name,
            label: q.name,
            type: q.type || "string",
          });
        }
      });
    }
    return list;
  }, [pageNode]);

  // Collect state store nodes and options
  const stateStores = useMemo(() => {
    return allNodes.filter((n) => n.type === "state_store");
  }, [allNodes]);

  const sectionStateVars = useMemo(() => {
    const sections = pageNode?.data?.sections || [];
    const list: Array<{ name: string; type?: string; storeName?: string; storeId?: string }> = [];
    sections.forEach((sec: { stateObjects?: Array<{ name: string; type?: string; storeName?: string; storeId?: string }>; states?: Array<{ name: string; type?: string }> }) => {
      (sec.stateObjects || []).forEach((st) => {
        if (st.name && !list.some((e) => e.name === st.name)) {
          list.push(st);
        }
      });
      (sec.states || []).forEach((st) => {
        if (st.name && !list.some((e) => e.name === st.name)) {
          list.push({ name: st.name, type: st.type });
        }
      });
    });
    return list;
  }, [pageNode]);

  const stateVarOptions = useMemo((): StateVarComboboxOption[] => {
    return [
      ...stateStores.flatMap((s) =>
        (s.data?.fields || []).map((f: { name: string; type?: string }): StateVarComboboxOption => ({
          value: f.name,
          label: `${s.data?.label || s.data?.storeName || "Store"}.${f.name}`,
          type: f.type || "string",
          storeName: s.data?.label || s.data?.storeName,
          storeId: s.id,
        })),
      ),
      ...sectionStateVars.map((v): StateVarComboboxOption => ({
        value: v.name,
        label: `Local: ${v.name}`,
        type: v.type || "string",
      })),
    ];
  }, [stateStores, sectionStateVars]);

  // Combine effectively active bindings: any detected path params without existing binding are synthesized
  const effectiveBindings = useMemo(() => {
    const result = [...currentBindings];

    // Ensure all detected path parameters have a corresponding binding
    detectedPathParamNames.forEach((paramName) => {
      const exists = result.some(
        (b) => b.slot === "path_param" && b.targetField.toLowerCase() === paramName.toLowerCase(),
      );
      if (!exists) {
        // Auto-match if page route has matching param, or fallback to first route param or state var
        const matchingRouteParam = routeParamSuggestions.find(
          (rp) => rp.value.toLowerCase() === paramName.toLowerCase(),
        );
        const matchingStateVar = stateVarOptions.find(
          (sv) => sv.value.toLowerCase() === paramName.toLowerCase(),
        );

        let defaultSource: FrontendFieldSource;
        if (matchingRouteParam) {
          defaultSource = { kind: "route_param", paramName: matchingRouteParam.value };
        } else if (matchingStateVar) {
          defaultSource = {
            kind: "state_var",
            stateKey: matchingStateVar.value,
            storeName: matchingStateVar.storeName,
            storeNodeId: matchingStateVar.storeId,
          };
        } else if (routeParamSuggestions.length > 0) {
          const firstRoute = routeParamSuggestions[0];
          defaultSource = firstRoute
            ? { kind: "route_param", paramName: firstRoute.value }
            : { kind: "literal", value: "" };
        } else {
          defaultSource = { kind: "literal", value: "" };
        }

        result.push({
          id: `sub-p-${paramName}-${Date.now()}`,
          slot: "path_param",
          targetField: paramName,
          source: defaultSource,
        });
      }
    });

    return result;
  }, [currentBindings, detectedPathParamNames, routeParamSuggestions, stateVarOptions]);

  const saveBindings = (updated: FrontendRequestFieldBinding[]) => {
    if (onUpdateBindings) {
      onUpdateBindings(updated);
    }
    if (onUpdate) {
      onUpdate({ subscriptionBindings: updated });
    }
  };

  // Handlers for modifying bindings
  const handleUpdateSingleBinding = (
    bindingId: string,
    updater: (prev: FrontendRequestFieldBinding) => FrontendRequestFieldBinding,
  ) => {
    const updated = effectiveBindings.map((b) => (b.id === bindingId ? updater(b) : b));
    saveBindings(updated);
  };

  const handleDeleteBinding = (bindingId: string) => {
    const updated = effectiveBindings.filter((b) => b.id !== bindingId);
    saveBindings(updated);
  };

  const handleAddCustomParam = (slot: BindingSlot) => {
    const newBinding: FrontendRequestFieldBinding = {
      id: `sub-${slot.charAt(0)}-${Date.now()}`,
      slot,
      targetField: slot === "header" ? "Authorization" : slot === "query_param" ? "channel" : "id",
      source:
        slot === "header"
          ? { kind: "auth_token", tokenType: "session" }
          : { kind: "literal", value: "" },
    };
    saveBindings([...effectiveBindings, newBinding]);
  };

  const handleAutoMapAll = () => {
    const autoMapped: FrontendRequestFieldBinding[] = effectiveBindings.map((b) => {
      const targetLower = b.targetField.toLowerCase();
      const matchRoute = routeParamSuggestions.find((rp) => rp.value.toLowerCase() === targetLower);
      if (matchRoute) {
        const routeSource: FrontendFieldSource = {
          kind: "route_param",
          paramName: matchRoute.value,
        };
        return {
          ...b,
          source: routeSource,
        };
      }
      const matchState = stateVarOptions.find((sv) => sv.value.toLowerCase() === targetLower);
      if (matchState) {
        const stateSource: FrontendFieldSource = {
          kind: "state_var",
          stateKey: matchState.value,
          storeName: matchState.storeName,
          storeNodeId: matchState.storeId,
        };
        return {
          ...b,
          source: stateSource,
        };
      }
      const matchQuery = queryParamSuggestions.find((qp) => qp.value.toLowerCase() === targetLower);
      if (matchQuery) {
        const querySource: FrontendFieldSource = {
          kind: "query_param",
          paramName: matchQuery.value,
        };
        return {
          ...b,
          source: querySource,
        };
      }
      if (isAuthHeaderName(b.targetField)) {
        const authSource: FrontendFieldSource = {
          kind: "auth_token",
          tokenType: "session",
        };
        return {
          ...b,
          source: authSource,
        };
      }
      return b;
    });
    saveBindings(autoMapped);
  };

  // Generate live subscription preview code
  const subscriptionCodePreview = useMemo(() => {
    const rawRoute =
      linkedEndpoint?.name ||
      conn.sourceItemName ||
      conn.streamUrl ||
      "/events";
    const pathBindings = effectiveBindings.filter((b) => b.slot === "path_param");
    const queryBindings = effectiveBindings.filter((b) => b.slot === "query_param");
    const headerBindings = effectiveBindings.filter((b) => b.slot === "header");

    let routeTemplate = rawRoute.startsWith("/") ? rawRoute : `/${rawRoute}`;
    pathBindings.forEach((pb) => {
      const srcStr =
        pb.source.kind === "route_param"
          ? `\${params?.${pb.source.paramName} || ":${pb.targetField}"}`
          : pb.source.kind === "state_var"
          ? `\${${pb.source.storeName ? `${pb.source.storeName}.` : "state."}${pb.source.stateKey}}`
          : pb.source.kind === "query_param"
          ? `\${searchParams?.get("${pb.source.paramName}") || ""}`
          : pb.source.kind === "literal"
          ? pb.source.value || `:${pb.targetField}`
          : `:${pb.targetField}`;
      routeTemplate = routeTemplate
        .replace(new RegExp(`:${pb.targetField}\\b`, "g"), srcStr)
        .replace(new RegExp(`\\[${pb.targetField}\\]`, "g"), srcStr);
    });

    const queryParts: string[] = [];
    queryBindings.forEach((qb) => {
      const valStr =
        qb.source.kind === "route_param"
          ? `\${params?.${qb.source.paramName}}`
          : qb.source.kind === "state_var"
          ? `\${state.${qb.source.stateKey}}`
          : qb.source.kind === "query_param"
          ? `\${searchParams?.get("${qb.source.paramName}")}`
          : qb.source.kind === "literal"
          ? qb.source.value
          : "";
      if (valStr) queryParts.push(`${qb.targetField}=${valStr}`);
    });

    const fullUrl = queryParts.length > 0 ? `${routeTemplate}?${queryParts.join("&")}` : routeTemplate;

    const activeProto = (conn.protocol || "SSE").toUpperCase();
    const isLangGraphStream =
      conn.isLangGraph ||
      derivedInfo?.step?.type === "langgraph_invoke" ||
      linkedEndpoint?.pipelineSteps?.some((s) => s.type === "langgraph_invoke");

    if (activeProto === "WEBSOCKET") {
      const roomStr = conn.room ? ` (room: "${conn.room}")` : "";
      if (isLangGraphStream) {
        return `const ws = new WebSocket(\`ws://localhost:8086${fullUrl}\`);\nws.onopen = () => {\n  console.log("Subscribed to agent stream${roomStr}");\n};\nws.onmessage = (event) => {\n  const msg = JSON.parse(event.data);\n  if (msg.event === "agent_stream") {\n    // msg.payload.token, msg.payload.node, msg.payload.done\n  }\n};`;
      }
      return `const ws = new WebSocket(\`ws://localhost:8086${fullUrl}\`);\nws.onopen = () => {\n  console.log("Subscribed to ${conn.eventName || "stream"}${roomStr}");\n};`;
    }
    if (activeProto === "WEBRTC") {
      return `const rtc = new RTCPeerConnection();\n// Subscribed to WebRTC stream: ${fullUrl}`;
    }
    // Default SSE
    if (isLangGraphStream) {
      return `const es = new EventSource(\`${fullUrl}\`, { withCredentials: true });\nes.onmessage = (event) => {\n  if (event.data === "[DONE]") {\n    // Stream finished\n    return;\n  }\n  const chunk = JSON.parse(event.data);\n  // chunk.token - live token chunk\n  // chunk.node - active graph node\n};`;
    }
    return `const es = new EventSource(\`${fullUrl}\`, { withCredentials: true });\nes.addEventListener("${conn.eventName || "message"}", (event) => {\n  // message received\n});`;
  }, [linkedEndpoint, conn, effectiveBindings, derivedInfo]);

  const activeProtocol = (conn.protocol || "SSE").toUpperCase() as "SSE" | "WEBSOCKET" | "WEBRTC";

  const handleProtocolChange = (newProto: "SSE" | "WEBSOCKET" | "WEBRTC") => {
    if (newProto === activeProtocol) return;
    onUpdate?.({ protocol: newProto });
  };

  const pathBindings = effectiveBindings.filter((b) => b.slot === "path_param");
  const otherBindings = effectiveBindings.filter((b) => b.slot !== "path_param");

  return (
    <div className="flex flex-col gap-3.5">
      {/* Optional quick switcher if multiple connections exist */}
      {allConnections && allConnections.length > 1 && (
        <div className="flex flex-col gap-1.5 p-2 rounded-lg border border-border/60 bg-muted/20">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground px-0.5">
            <span>Page Connections ({allConnections.length})</span>
          </div>
          <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto pr-0.5">
            {allConnections.map((c) => {
              const isSelected = c.id === conn.id;
              return (
                <div
                  key={c.id}
                  onClick={() => onSelectConnection?.(c.id)}
                  className={cn(
                    "group flex items-center justify-between p-1.5 rounded-md border text-xs cursor-pointer transition-all",
                    isSelected
                      ? "border-violet-500/50 bg-violet-500/10 shadow-xs"
                      : "border-border/50 bg-background/50 hover:bg-muted/50 hover:border-border",
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        c.isDerived ? "bg-amber-500" : "bg-violet-500",
                      )}
                    />
                    <span className="font-mono text-[11px] truncate font-medium text-foreground">
                      {c.eventName || c.id}
                    </span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 uppercase font-mono">
                      {c.protocol}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(onDeleteSpecificConnection || (isSelected && onDeleteConnection)) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDeleteSpecificConnection) {
                            onDeleteSpecificConnection(c.id);
                          } else if (onDeleteConnection) {
                            onDeleteConnection();
                          }
                        }}
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete connection"
                      >
                        <Trash2 size={11} />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Real-time Mode Toggle: SSE | WebSocket | WebRTC */}
      <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-border/80 bg-muted/20">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Radio size={12} className="text-violet-500" />
            <span>Connection Mode</span>
          </Label>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] font-mono uppercase px-1.5 py-0 h-4",
              activeProtocol === "WEBSOCKET"
                ? "border-cyan-500/40 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10"
                : activeProtocol === "WEBRTC"
                ? "border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-500/10"
                : "border-violet-500/40 text-violet-600 dark:text-violet-400 bg-violet-500/10",
            )}
          >
            {activeProtocol}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 bg-background/80 rounded-md border border-border/60">
          <button
            type="button"
            onClick={() => handleProtocolChange("SSE")}
            className={cn(
              "flex flex-col items-center justify-center py-2 px-1 rounded-sm text-xs transition-all cursor-pointer border",
              activeProtocol === "SSE"
                ? "bg-violet-500/15 text-violet-700 dark:text-violet-300 font-semibold border-violet-500/40 shadow-xs"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-1 font-medium">
              <Radio size={12} className={activeProtocol === "SSE" ? "text-violet-500" : "text-muted-foreground"} />
              <span>SSE</span>
            </div>
            <span className="text-[9px] text-muted-foreground mt-0.5 leading-none">EventStream</span>
          </button>

          <button
            type="button"
            onClick={() => handleProtocolChange("WEBSOCKET")}
            className={cn(
              "flex flex-col items-center justify-center py-2 px-1 rounded-sm text-xs transition-all cursor-pointer border",
              activeProtocol === "WEBSOCKET"
                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-semibold border-cyan-500/40 shadow-xs"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-1 font-medium">
              <Wifi size={12} className={activeProtocol === "WEBSOCKET" ? "text-cyan-500" : "text-muted-foreground"} />
              <span>Socket</span>
            </div>
            <span className="text-[9px] text-muted-foreground mt-0.5 leading-none">WebSocket</span>
          </button>

          <button
            type="button"
            onClick={() => handleProtocolChange("WEBRTC")}
            className={cn(
              "flex flex-col items-center justify-center py-2 px-1 rounded-sm text-xs transition-all cursor-pointer border",
              activeProtocol === "WEBRTC"
                ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold border-purple-500/40 shadow-xs"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-1 font-medium">
              <Video size={12} className={activeProtocol === "WEBRTC" ? "text-purple-500" : "text-muted-foreground"} />
              <span>WebRTC</span>
            </div>
            <span className="text-[9px] text-muted-foreground mt-0.5 leading-none">Peer Media</span>
          </button>
        </div>
      </div>

      {/* Route & Stream Info Banner */}
      <div className="flex items-center justify-between p-2.5 rounded-lg border border-violet-500/30 bg-violet-500/5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded bg-violet-500/20 text-violet-600 dark:text-violet-400 shrink-0">
            <Radio size={14} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-semibold text-foreground truncate">
                {linkedEndpoint?.name || conn.sourceItemName || conn.eventName || "Stream Route"}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] px-1 py-0 font-mono",
                  activeProtocol === "WEBSOCKET"
                    ? "text-cyan-600 dark:text-cyan-400 border-cyan-500/30 bg-cyan-500/10"
                    : activeProtocol === "WEBRTC"
                    ? "text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10"
                    : "text-violet-600 dark:text-violet-400 border-violet-500/30 bg-violet-500/10",
                )}
              >
                {activeProtocol}
              </Badge>
              {(conn.isLangGraph || derivedInfo?.step?.type === "langgraph_invoke" || linkedEndpoint?.pipelineSteps?.some((s) => s.type === "langgraph_invoke")) && (
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 font-mono text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10 flex items-center gap-1"
                >
                  <Sparkles size={8} /> LangGraph Stream
                </Badge>
              )}
              {conn.sourceServiceLabel && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  on {conn.sourceServiceLabel}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Client subscription listener mapping. Dynamic parameters are resolved when connecting.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoMapAll}
            className="h-6 text-[10px] px-2 border-violet-500/30 hover:bg-violet-500/10 text-violet-600 dark:text-violet-400 gap-1 shrink-0 font-semibold"
            title="Auto-match parameter names to page route parameters and state variables"
          >
            <Sparkles size={11} /> Auto-map
          </Button>
          {onDeleteConnection && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteConnection}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              title="Delete this connection"
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      </div>

      {/* Broadcast / Signaling Room (WebSocket / WebRTC) */}
      {(activeProtocol === "WEBSOCKET" || activeProtocol === "WEBRTC") && (
        <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Radio size={12} className="text-cyan-500" />
              <span>
                {activeProtocol === "WEBRTC" ? "Signaling Room / Peer Channel" : "Broadcast Room / Channel"}
              </span>
            </Label>
            {conn.room && (
              <Badge variant="outline" className="text-[9px] font-mono border-cyan-500/30 text-cyan-600 dark:text-cyan-400">
                {conn.room}
              </Badge>
            )}
          </div>
          <Input
            className="text-xs bg-background h-8"
            disabled={Boolean(derivedInfo?.step)}
            value={conn.room || ""}
            onChange={(e) => onUpdate?.({ room: e.target.value })}
            placeholder={
              activeProtocol === "WEBRTC"
                ? "e.g. room:conference or lobby"
                : "e.g. global or user:${userId}"
            }
          />
          <span className="text-[10px] text-muted-foreground">
            {Boolean(derivedInfo?.step)
              ? "Configured in backend Push to Client pipeline step. Resolved automatically when connecting."
              : "Room or channel identifier used when subscribing to this stream."}
          </span>
        </div>
      )}

      {/* WebRTC Capabilities Section */}
      {activeProtocol === "WEBRTC" && (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
          <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Radio size={12} className="text-emerald-500" />
            <span>WebRTC Media &amp; Data Capabilities</span>
          </Label>
          <WebRtcCapabilitiesSection
            id={conn.id}
            conn={conn}
            isDerived={Boolean(derivedInfo?.step)}
            onUpdate={(changes) => {
              if (onUpdate) onUpdate(changes);
            }}
          />
        </div>
      )}

      {/* Path Parameters Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <SlidersHorizontal size={12} className="text-violet-500" />
            <span>Path Parameters</span>
            {pathBindings.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-mono">
                {pathBindings.length}
              </Badge>
            )}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAddCustomParam("path_param")}
            className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground gap-1"
          >
            <Plus size={10} /> Add Path Param
          </Button>
        </div>

        {pathBindings.length === 0 ? (
          <div className="p-3 rounded-lg border border-dashed border-border/70 text-center text-xs text-muted-foreground/70 bg-muted/10">
            No dynamic path parameters (e.g. <code>:id</code>) detected in this stream route.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pathBindings.map((binding) => (
              <SubscriptionParamRow
                key={binding.id}
                binding={binding}
                routeParamSuggestions={routeParamSuggestions}
                queryParamSuggestions={queryParamSuggestions}
                stateVarOptions={stateVarOptions}
                onUpdate={(updater) => handleUpdateSingleBinding(binding.id, updater)}
                onDelete={() => handleDeleteBinding(binding.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Query Parameters & Headers Section */}
      <div className="flex flex-col gap-2 pt-1 border-t border-border/40">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
            <Globe size={12} className="text-cyan-500" />
            <span>Query Parameters &amp; Headers</span>
            {otherBindings.length > 0 && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-mono">
                {otherBindings.length}
              </Badge>
            )}
          </Label>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAddCustomParam("query_param")}
              className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground gap-1"
            >
              <Plus size={10} /> Query Param
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleAddCustomParam("header")}
              className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground gap-1"
            >
              <Plus size={10} /> Header / Auth
            </Button>
          </div>
        </div>

        {otherBindings.length > 0 && (
          <div className="flex flex-col gap-2">
            {otherBindings.map((binding) => (
              <SubscriptionParamRow
                key={binding.id}
                binding={binding}
                routeParamSuggestions={routeParamSuggestions}
                queryParamSuggestions={queryParamSuggestions}
                stateVarOptions={stateVarOptions}
                onUpdate={(updater) => handleUpdateSingleBinding(binding.id, updater)}
                onDelete={() => handleDeleteBinding(binding.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Live Client Subscription Code Preview */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-border/40">
        <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Code2 size={12} className="text-violet-500" />
            <span>Generated Subscription Code Preview</span>
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            Client Component Hook
          </span>
        </div>
        <pre className="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-[10px] font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed overflow-x-auto">
          {subscriptionCodePreview}
        </pre>
      </div>
    </div>
  );
};

interface SubscriptionParamRowProps {
  binding: FrontendRequestFieldBinding;
  routeParamSuggestions: ComboboxOption[];
  queryParamSuggestions: ComboboxOption[];
  stateVarOptions: StateVarComboboxOption[];
  onUpdate: (updater: (prev: FrontendRequestFieldBinding) => FrontendRequestFieldBinding) => void;
  onDelete: () => void;
}

const SubscriptionParamRow: React.FC<SubscriptionParamRowProps> = ({
  binding,
  routeParamSuggestions,
  queryParamSuggestions,
  stateVarOptions,
  onUpdate,
  onDelete,
}) => {
  const isPath = binding.slot === "path_param";
  const isQuery = binding.slot === "query_param";
  const isHeader = binding.slot === "header";
  const isAuth = isHeader && isAuthHeaderName(binding.targetField);

  return (
    <div className="p-2.5 rounded-lg border border-border/60 bg-card/60 hover:border-border transition-colors flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge
            variant="outline"
            className={`text-[9px] px-1 py-0 font-mono uppercase ${
              isPath
                ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                : isQuery
                ? "bg-cyan-500/10 text-cyan-500 border-cyan-500/30"
                : "bg-blue-500/10 text-blue-500 border-blue-500/30"
            }`}
          >
            {isPath ? "Path Param" : isQuery ? "Query Param" : "Header"}
          </Badge>
          <span className="font-mono text-xs font-semibold text-foreground truncate">
            {isPath ? `:${binding.targetField}` : binding.targetField || "(unnamed)"}
          </span>
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground/40 hover:text-destructive p-1 rounded transition-colors cursor-pointer"
          title="Remove subscription mapping"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Source Kind Selector */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Source Type</Label>
          <Select
            value={binding.source.kind}
            onValueChange={(val: SourceKindOption) => {
              let nextSource: FrontendFieldSource;
              if (val === "route_param") {
                nextSource = {
                  kind: "route_param",
                  paramName: routeParamSuggestions[0]?.value || binding.targetField,
                };
              } else if (val === "state_var") {
                nextSource = {
                  kind: "state_var",
                  stateKey: stateVarOptions[0]?.value || "",
                  storeName: stateVarOptions[0]?.storeName,
                  storeNodeId: stateVarOptions[0]?.storeId,
                };
              } else if (val === "query_param") {
                nextSource = {
                  kind: "query_param",
                  paramName: queryParamSuggestions[0]?.value || binding.targetField,
                };
              } else if (val === "auth_token") {
                nextSource = { kind: "auth_token", tokenType: "session" };
              } else if (val === "user_input") {
                nextSource = { kind: "user_input", fieldName: binding.targetField };
              } else {
                nextSource = { kind: "literal", value: "" };
              }
              onUpdate((prev) => ({ ...prev, source: nextSource }));
            }}
          >
            <SelectTrigger className="h-7 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="route_param">Page Route Param</SelectItem>
              <SelectItem value="state_var">State Variable</SelectItem>
              <SelectItem value="query_param">Page Query Param</SelectItem>
              <SelectItem value="user_input">User Form Input</SelectItem>
              <SelectItem value="literal">Static Literal</SelectItem>
              <SelectItem value="auth_token">Auth Token</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Source Value Input */}
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] text-muted-foreground">Source Value</Label>
          {binding.source.kind === "route_param" && (
            <ActionFlowCombobox
              value={binding.source.paramName || ""}
              onChange={(val) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "route_param", paramName: val },
                }))
              }
              placeholder="e.g. id, conversationId"
              headerLabel="Page Route Params"
              options={routeParamSuggestions}
            />
          )}

          {binding.source.kind === "state_var" && (
            <ActionFlowCombobox
              value={binding.source.stateKey || ""}
              onChange={(val) => {
                const opt = stateVarOptions.find((o) => o.value === val);
                onUpdate((prev) => ({
                  ...prev,
                  source: {
                    kind: "state_var",
                    stateKey: val,
                    storeName: opt?.storeName,
                    storeNodeId: opt?.storeId,
                  },
                }));
              }}
              placeholder="Select state variable..."
              headerLabel="State Variables"
              options={stateVarOptions}
            />
          )}

          {binding.source.kind === "query_param" && (
            <ActionFlowCombobox
              value={binding.source.paramName || ""}
              onChange={(val) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "query_param", paramName: val },
                }))
              }
              placeholder="e.g. tab, room, id"
              headerLabel="Page Query Params"
              options={queryParamSuggestions}
            />
          )}

          {binding.source.kind === "user_input" && (
            <Input
              value={binding.source.fieldName || ""}
              onChange={(e) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "user_input", fieldName: e.target.value },
                }))
              }
              placeholder="input field name..."
              className="h-7 text-xs bg-background font-mono"
            />
          )}

          {binding.source.kind === "literal" && (
            <Input
              value={binding.source.value || ""}
              onChange={(e) =>
                onUpdate((prev) => ({
                  ...prev,
                  source: { kind: "literal", value: e.target.value },
                }))
              }
              placeholder="literal string value..."
              className="h-7 text-xs bg-background font-mono"
            />
          )}

          {binding.source.kind === "auth_token" && (
            <div className="h-7 px-2 flex items-center bg-muted/40 border border-border/50 rounded text-foreground font-mono text-[11px] truncate">
              Bearer (Session Token)
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
