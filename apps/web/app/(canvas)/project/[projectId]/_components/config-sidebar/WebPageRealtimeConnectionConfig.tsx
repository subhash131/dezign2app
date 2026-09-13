"use client";

import React, { useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, RealtimeConnection, ClientDeliveryProtocol, PipelineStep } from "@workspace/canvas/types";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { Radio, ArrowLeft, ExternalLink, Globe, Sparkles, AlertCircle, Mic, Volume2, Video, Monitor, Tv } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { WEBRTC_CAPABILITIES_DEBOUNCE_MS, isRealtimeProtocol, isWebRtcPeerRole } from "@workspace/canvas/constants";
import { sanitizeEventName, computeMediaMode } from "./pipeline-step-editor/PushToClientStepSection";
import { cn } from "@workspace/ui/lib/utils";

export interface WebPageRealtimeConnectionConfigProps {
  id: string;
  nodeId: string;
}

const PROTOCOL_OPTIONS: { value: ClientDeliveryProtocol | "POLLING"; label: string; desc: string }[] = [
  {
    value: "SSE",
    label: "Server-Sent Events (SSE)",
    desc: "Unidirectional HTTP event stream from server to browser (EventSource).",
  },
  {
    value: "WEBSOCKET",
    label: "WebSocket",
    desc: "Full-duplex real-time bidirectional messaging channel.",
  },
  {
    value: "WEBRTC",
    label: "WebRTC Data Channel",
    desc: "Low-latency peer-to-peer or server-to-peer data channel.",
  },
  {
    value: "POLLING",
    label: "Long Polling / Polling",
    desc: "Periodic HTTP fetch requests at configured intervals.",
  },
  {
    value: "API_PUSH",
    label: "Outbound Webhook (API Push)",
    desc: "Server emits an outbound webhook HTTP request to a client endpoint.",
  },
];

export const WebPageRealtimeConnectionConfig: React.FC<WebPageRealtimeConnectionConfigProps> = ({
  id,
  nodeId,
}) => {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const events = useBackendCanvasStore((s) => s.events);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore((s) => s.setActiveConfigItem);

  const pageNode = nodes.find((n) => n.id === nodeId);
  const connections = pageNode?.data?.realtimeConnections ?? [];
  const manualConn = connections.find((c) => c.id === id);

  // Check if derived from a push_to_client step in any service pipeline
  const derivedInfo = useMemo(() => {
    const findInSteps = (steps: PipelineStep[] | undefined): PipelineStep | null => {
      if (!steps) return null;
      for (const step of steps) {
        if (
          step.id === id ||
          (step.type === "push_to_client" &&
            step.clientDeliveryTargetPageId === nodeId &&
            step.id === id)
        ) {
          return step;
        }
        const found =
          findInSteps(step.thenSteps) ||
          findInSteps(step.elseSteps) ||
          findInSteps(step.trySteps) ||
          findInSteps(step.catchSteps) ||
          findInSteps(step.loopBody);
        if (found) return found;
        if (step.switchCases) {
          for (const sc of step.switchCases) {
            const scFound = findInSteps(sc.steps);
            if (scFound) return scFound;
          }
        }
        if (step.switchDefault) {
          const sdFound = findInSteps(step.switchDefault);
          if (sdFound) return sdFound;
        }
        if (step.parallelBranches) {
          for (const pb of step.parallelBranches) {
            const pbFound = findInSteps(pb.steps);
            if (pbFound) return pbFound;
          }
        }
      }
      return null;
    };

    for (const ev of events) {
      if (ev.pipelineSteps && ev.nodeId) {
        const step = findInSteps(ev.pipelineSteps);
        if (step) {
          return {
            step,
            sourceNode: nodes.find((n) => n.id === ev.nodeId),
            sourceEventId: ev.id,
            sourceEndpointId: null,
          };
        }
      }
    }

    for (const ep of endpoints) {
      if (ep.pipelineSteps && ep.nodeId) {
        const step = findInSteps(ep.pipelineSteps);
        if (step) {
          return {
            step,
            sourceNode: nodes.find((n) => n.id === ep.nodeId),
            sourceEventId: null,
            sourceEndpointId: ep.id,
          };
        }
      }
    }

    return null;
  }, [id, nodeId, events, endpoints, nodes]);

  // Combine manual connection or derived connection data
  const conn: RealtimeConnection = useMemo(() => {
    if (derivedInfo?.step) {
      const s = derivedInfo.step;
      const ev = events.find((e) => e.id === derivedInfo.sourceEventId);
      const ep = endpoints.find((e) => e.id === derivedInfo.sourceEndpointId);
      const sourceItemName = ep ? (ep.name || "Endpoint") : ev ? ev.name : undefined;
      const isRtc = s.clientDeliveryProtocol === "WEBRTC";
      return {
        id,
        protocol: s.clientDeliveryProtocol || "SSE",
        eventName: s.clientDeliveryEventName,
        room: s.clientDeliveryRoom,
        mediaMode: isRtc ? s.clientDeliveryMediaMode : undefined,
        enableDataChannel: isRtc ? s.clientDeliveryEnableDataChannel : undefined,
        enableMic: isRtc ? (s.clientDeliveryEnableMic ?? s.clientDeliveryEnableAudio) : undefined,
        enableSpeaker: isRtc ? s.clientDeliveryEnableSpeaker : undefined,
        enableCamera: isRtc ? (s.clientDeliveryEnableCamera ?? s.clientDeliveryEnableVideo) : undefined,
        enableScreenShare: isRtc ? s.clientDeliveryEnableScreenShare : undefined,
        enableRemoteVideo: isRtc ? s.clientDeliveryEnableRemoteVideo : undefined,
        iceServerUrl: isRtc ? s.clientDeliveryIceServer : undefined,
        description: sourceItemName || s.name,
        sourceServiceNodeId: derivedInfo.sourceNode?.id,
        sourceServiceLabel: derivedInfo.sourceNode?.data?.label || derivedInfo.sourceNode?.type || "Service",
        sourceEventId: derivedInfo.sourceEventId || derivedInfo.sourceEndpointId || undefined,
        sourceItemName,
        sourceItemType: ep ? "endpoint" : ev ? "event" : undefined,
      };
    }
    if (manualConn) return manualConn;
    return {
      id,
      protocol: "SSE",
      eventName: "message",
    };
  }, [manualConn, derivedInfo, id, events, endpoints]);

  const isDerived = Boolean(derivedInfo?.step);
  const isConnected = Boolean(isDerived || (conn.sourceServiceNodeId && nodes.some((n) => n.id === conn.sourceServiceNodeId)));

  const handleUpdateManual = (changes: Partial<RealtimeConnection>) => {
    if (isDerived || !pageNode) return; // derived rows configured from source service pipeline
    const existing = connections.map((c) => (c.id === id ? { ...c, ...changes } : c));
    updateNode(nodeId, {
      data: {
        ...pageNode.data,
        label: pageNode.data.label || "",
        realtimeConnections: existing,
      },
    });
  };

  const selectedProtoMeta = PROTOCOL_OPTIONS.find((p) => p.value === conn.protocol) || PROTOCOL_OPTIONS[0];

  const isDataChannelEnabled = conn.enableDataChannel !== false;
  const isMicEnabled =
    conn.enableMic !== undefined
      ? Boolean(conn.enableMic)
      : conn.enableAudio !== undefined
      ? Boolean(conn.enableAudio)
      : Boolean(conn.mediaMode === "audio" || conn.mediaMode === "audio-video");
  const isSpeakerEnabled =
    conn.enableSpeaker !== undefined
      ? Boolean(conn.enableSpeaker)
      : Boolean(conn.mediaMode === "audio" || conn.mediaMode === "audio-video");
  const isCameraEnabled =
    conn.enableCamera !== undefined
      ? Boolean(conn.enableCamera)
      : conn.enableVideo !== undefined
      ? Boolean(conn.enableVideo)
      : Boolean(conn.mediaMode === "video" || conn.mediaMode === "audio-video");
  const isScreenShareEnabled = Boolean(conn.enableScreenShare);
  const isRemoteVideoEnabled =
    conn.enableRemoteVideo !== undefined
      ? Boolean(conn.enableRemoteVideo)
      : conn.enableVideo !== undefined
      ? Boolean(conn.enableVideo)
      : Boolean(conn.mediaMode === "video" || conn.mediaMode === "audio-video");

  const [localCaps, setLocalCaps] = React.useState({
    enableDataChannel: isDataChannelEnabled,
    enableMic: isMicEnabled,
    enableSpeaker: isSpeakerEnabled,
    enableCamera: isCameraEnabled,
    enableScreenShare: isScreenShareEnabled,
    enableRemoteVideo: isRemoteVideoEnabled,
  });
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const latestLocalCapsRef = React.useRef(localCaps);
  latestLocalCapsRef.current = localCaps;

  React.useEffect(() => {
    if (!timeoutRef.current) {
      setLocalCaps({
        enableDataChannel: isDataChannelEnabled,
        enableMic: isMicEnabled,
        enableSpeaker: isSpeakerEnabled,
        enableCamera: isCameraEnabled,
        enableScreenShare: isScreenShareEnabled,
        enableRemoteVideo: isRemoteVideoEnabled,
      });
    }
  }, [
    isDataChannelEnabled,
    isMicEnabled,
    isSpeakerEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    isRemoteVideoEnabled,
  ]);

  const commitManualCaps = React.useCallback(
    (values: typeof localCaps) => {
      const computedMediaMode = computeMediaMode(values);

      handleUpdateManual({
        enableDataChannel: values.enableDataChannel,
        enableMic: values.enableMic,
        enableSpeaker: values.enableSpeaker,
        enableCamera: values.enableCamera,
        enableScreenShare: values.enableScreenShare,
        enableRemoteVideo: values.enableRemoteVideo,
        enableAudio: values.enableMic,
        enableVideo: values.enableCamera,
        mediaMode: computedMediaMode,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connections, id, isDerived, nodeId, pageNode],
  );

  const handleToggleCapability = (
    capKey: keyof typeof localCaps,
    checked: boolean,
  ) => {
    setLocalCaps((prev) => {
      const next = { ...prev, [capKey]: checked };
      latestLocalCapsRef.current = next;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        commitManualCaps(next);
      }, WEBRTC_CAPABILITIES_DEBOUNCE_MS);
      return next;
    });
  };

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        commitManualCaps(latestLocalCapsRef.current);
      }
    };
  }, [commitManualCaps]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "p-2 rounded-xl border",
              isConnected
                ? "bg-violet-500/10 text-violet-500 border-violet-500/20"
                : "bg-destructive/10 text-destructive border-destructive/25",
            )}
          >
            {isConnected ? <Radio size={18} /> : <AlertCircle size={18} />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span>{conn.sourceItemName || conn.eventName || "Real-Time Connection"}</span>
              <span className="text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase">
                {conn.protocol}
              </span>
              {conn.sourceItemType ? (
                <span
                  className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase",
                    conn.sourceItemType === "endpoint"
                      ? "bg-blue-500/15 text-blue-500 border border-blue-500/30"
                      : "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                  )}
                >
                  {conn.sourceItemType === "endpoint" ? "API" : "EVENT"}
                </span>
              ) : (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase bg-destructive/15 text-destructive border border-destructive/30">
                  DISCONNECTED
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Listening on WebPage:{" "}
              <span className="font-mono text-foreground font-medium">
                {pageNode?.data?.label || "Page"}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Disconnected / Unlinked Warning Banner */}
      {!isConnected && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 flex flex-col gap-1.5 text-destructive">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AlertCircle size={15} className="shrink-0" />
            <span>Unlinked / Misconfigured Stream</span>
          </div>
          <p className="text-[11px] text-destructive/90 leading-relaxed">
            No backend service endpoint or event listener is currently pushing to this stream. To deliver real-time data to this page, add a <strong className="text-foreground font-semibold">Push to Client</strong> step inside a Service pipeline targeting this WebPage.
          </p>
        </div>
      )}

      {/* Derived Banner */}
      {isDerived && derivedInfo && (
        <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 font-medium">
              <Sparkles size={14} className="shrink-0" />
              <span>Pipeline Pushed Connection</span>
            </div>
            {derivedInfo.sourceNode && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 gap-1 font-semibold"
                onClick={() => {
                  if (derivedInfo.sourceEventId) {
                    setActiveConfigItem({
                      type: "event",
                      id: derivedInfo.sourceEventId,
                      nodeId: derivedInfo.sourceNode!.id,
                    });
                  } else if (derivedInfo.sourceEndpointId) {
                    setActiveConfigItem({
                      type: "endpoint",
                      id: derivedInfo.sourceEndpointId,
                      nodeId: derivedInfo.sourceNode!.id,
                    });
                  }
                }}
              >
                <ExternalLink size={11} /> Edit in Pipeline
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This real-time stream is pushed by a <strong className="text-foreground">Push to Client</strong> pipeline step on{" "}
            <strong className="text-foreground">
              {derivedInfo.sourceNode?.data?.label || derivedInfo.sourceNode?.type || "Service"}
            </strong>.
          </p>
        </div>
      )}

      {/* Protocol Configuration Form */}
      <div className="flex flex-col gap-4">
        {/* Protocol Selector */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold">Delivery Protocol</Label>
          <Select
            value={conn.protocol}
            disabled={isDerived}
            onValueChange={(val) => {
              if (!isRealtimeProtocol(val)) return;
              if (val !== "WEBRTC") {
                handleUpdateManual({
                  protocol: val,
                  mediaMode: undefined,
                  enableDataChannel: undefined,
                  enableMic: undefined,
                  enableSpeaker: undefined,
                  enableCamera: undefined,
                  enableScreenShare: undefined,
                  enableRemoteVideo: undefined,
                  iceServerUrl: undefined,
                  peerRole: undefined,
                });
              } else {
                handleUpdateManual({ protocol: val });
              }
            }}
          >
            <SelectTrigger className="text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROTOCOL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">
            {selectedProtoMeta?.desc}
          </span>
        </div>

        {/* Event Name */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold">
            {conn.protocol === "WEBRTC" ? "Data Channel Label" : "Event / Message Name"}
          </Label>
          <Input
            className="text-xs bg-background"
            disabled={isDerived}
            value={conn.eventName || ""}
            onChange={(e) => handleUpdateManual({ eventName: e.target.value })}
            onBlur={(e) => handleUpdateManual({ eventName: sanitizeEventName(e.target.value) })}
            placeholder={
              conn.protocol === "SSE"
                ? "e.g. order.updated"
                : conn.protocol === "WEBSOCKET"
                ? "e.g. chat.message"
                : "e.g. data-channel"
            }
          />
          <span className="text-[10px] text-muted-foreground/70">
            The client-side listener identifier (e.g. <code>eventSource.addEventListener(&quot;{conn.eventName || "event"}&quot;)</code> or WS message type).
          </span>
        </div>

        {/* Broadcast / Signaling Room */}
        {(conn.protocol === "WEBSOCKET" || conn.protocol === "WEBRTC") && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold">
              {conn.protocol === "WEBRTC" ? "Signaling Room / Peer Channel" : "Broadcast Room / Channel"}
            </Label>
            <Input
              className="text-xs bg-background"
              disabled={isDerived}
              value={conn.room || ""}
              onChange={(e) => handleUpdateManual({ room: e.target.value })}
              placeholder={
                conn.protocol === "WEBRTC"
                  ? "e.g. room:conference or lobby"
                  : "e.g. global or user:${userId}"
              }
            />
          </div>
        )}

        {/* WebRTC Specific Configuration */}
        {conn.protocol === "WEBRTC" && (
          <>
            {/* Granular Media & Data Capabilities */}
            <div className="flex flex-col gap-2">
              <div>
                <Label className="text-xs font-semibold">WebRTC Channels &amp; Media Capabilities</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Select which audio, video, and data channels this peer connection establishes.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/20 p-3">
                {/* Data Channel */}
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={`${id}-dc`}
                    checked={localCaps.enableDataChannel}
                    disabled={isDerived}
                    onCheckedChange={(val) => handleToggleCapability("enableDataChannel", Boolean(val))}
                    className="mt-0.5"
                  />
                  <div className="flex flex-col gap-0.5">
                    <label
                      htmlFor={`${id}-dc`}
                      className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
                    >
                      <Radio size={13} className="text-violet-500" />
                      <span>Data Channel (JSON &amp; Events)</span>
                    </label>
                    <span className="text-[10px] text-muted-foreground">
                      Low-latency peer-to-peer data channel for events, state, and structured messaging.
                    </span>
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5" />

                {/* Audio: Mic & Speaker */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground/80">
                    Audio Streaming
                  </span>

                  {/* Microphone (Send) */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`${id}-mic`}
                      checked={localCaps.enableMic}
                      disabled={isDerived}
                      onCheckedChange={(val) => handleToggleCapability("enableMic", Boolean(val))}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <label
                        htmlFor={`${id}-mic`}
                        className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
                      >
                        <Mic size={13} className="text-emerald-500" />
                        <span>Microphone (Send Audio)</span>
                      </label>
                      <span className="text-[10px] text-muted-foreground">
                        Captures user microphone audio stream via getUserMedia and transmits to peer.
                      </span>
                    </div>
                  </div>

                  {/* Speaker (Receive) */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`${id}-speaker`}
                      checked={localCaps.enableSpeaker}
                      disabled={isDerived}
                      onCheckedChange={(val) => handleToggleCapability("enableSpeaker", Boolean(val))}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <label
                        htmlFor={`${id}-speaker`}
                        className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
                      >
                        <Volume2 size={13} className="text-teal-500" />
                        <span>Speaker (Receive Audio)</span>
                      </label>
                      <span className="text-[10px] text-muted-foreground">
                        Receives and plays back incoming peer audio streams via browser audio output.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5" />

                {/* Video: Camera, Screen Share, Remote Video */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground/80">
                    Video Streaming
                  </span>

                  {/* Camera (Send) */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`${id}-camera`}
                      checked={localCaps.enableCamera}
                      disabled={isDerived}
                      onCheckedChange={(val) => handleToggleCapability("enableCamera", Boolean(val))}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <label
                        htmlFor={`${id}-camera`}
                        className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
                      >
                        <Video size={13} className="text-blue-500" />
                        <span>Camera (Send Video)</span>
                      </label>
                      <span className="text-[10px] text-muted-foreground">
                        Captures local webcam video via getUserMedia and streams to remote peers.
                      </span>
                    </div>
                  </div>

                  {/* Screen Share (Send) */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`${id}-screen`}
                      checked={localCaps.enableScreenShare}
                      disabled={isDerived}
                      onCheckedChange={(val) => handleToggleCapability("enableScreenShare", Boolean(val))}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <label
                        htmlFor={`${id}-screen`}
                        className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
                      >
                        <Monitor size={13} className="text-indigo-500" />
                        <span>Screen Share (Send Display)</span>
                      </label>
                      <span className="text-[10px] text-muted-foreground">
                        Prompts user for screen / window capture via getDisplayMedia and streams display.
                      </span>
                    </div>
                  </div>

                  {/* Remote Video (Receive) */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`${id}-remote-vid`}
                      checked={localCaps.enableRemoteVideo}
                      disabled={isDerived}
                      onCheckedChange={(val) => handleToggleCapability("enableRemoteVideo", Boolean(val))}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <label
                        htmlFor={`${id}-remote-vid`}
                        className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
                      >
                        <Tv size={13} className="text-purple-500" />
                        <span>Remote Video (Receive Video)</span>
                      </label>
                      <span className="text-[10px] text-muted-foreground">
                        Renders incoming video streams from remote peers in video playback frame.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* STUN / TURN Server */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">STUN / TURN Server URL (Optional)</Label>
              <Input
                className="text-xs bg-background font-mono"
                disabled={isDerived}
                value={conn.iceServerUrl || ""}
                onChange={(e) => handleUpdateManual({ iceServerUrl: e.target.value })}
                placeholder="stun:stun.l.google.com:19302"
              />
              <span className="text-[10px] text-muted-foreground/70">
                Leave empty to use the default public Google STUN server.
              </span>
            </div>

            {/* Peer Role */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold">Peer Role</Label>
              <Select
                value={conn.peerRole || "peer"}
                disabled={isDerived}
                onValueChange={(val) => {
                  if (isWebRtcPeerRole(val)) {
                    handleUpdateManual({ peerRole: val });
                  }
                }}
              >
                <SelectTrigger className="text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peer" className="text-xs">
                    Bidirectional Peer (Default)
                  </SelectItem>
                  <SelectItem value="initiator" className="text-xs">
                    Initiator (Creates Offer)
                  </SelectItem>
                  <SelectItem value="responder" className="text-xs">
                    Responder (Waits for Offer &amp; Answers)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Polling Interval */}
        {conn.protocol === "POLLING" && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold">Polling Interval (ms)</Label>
            <Input
              type="number"
              className="text-xs bg-background"
              disabled={isDerived}
              value={conn.pollingIntervalMs || 5000}
              onChange={(e) =>
                handleUpdateManual({ pollingIntervalMs: parseInt(e.target.value, 10) || 5000 })
              }
              placeholder="5000"
            />
          </div>
        )}

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold">Description</Label>
          <Textarea
            className="text-xs bg-background min-h-[60px]"
            disabled={isDerived}
            value={conn.description || ""}
            onChange={(e) => handleUpdateManual({ description: e.target.value })}
            placeholder="Explain what real-time data this connection receives and how it updates the UI..."
          />
        </div>
      </div>
    </div>
  );
};
