import type { RealtimeProtocol, WebSocketAction } from "../types/realtime";

export const REALTIME_PROTOCOLS = {
  SSE: "SSE",
  WEBSOCKET: "WEBSOCKET",
  WEBRTC: "WEBRTC",
  POLLING: "POLLING",
  API_PUSH: "API_PUSH",
} as const satisfies Record<string, RealtimeProtocol>;

export const ALL_REALTIME_PROTOCOLS: readonly RealtimeProtocol[] = [
  REALTIME_PROTOCOLS.SSE,
  REALTIME_PROTOCOLS.WEBSOCKET,
  REALTIME_PROTOCOLS.WEBRTC,
  REALTIME_PROTOCOLS.POLLING,
  REALTIME_PROTOCOLS.API_PUSH,
] as const;

export const DEFAULT_REALTIME_PROTOCOL: RealtimeProtocol = REALTIME_PROTOCOLS.SSE;

export const DEFAULT_WEBSOCKET_PATH = "/ws" as const;
export const DEFAULT_SSE_PATH = "/events" as const;

export const WEBSOCKET_ACTIONS = {
  JOIN: "join",
  LEAVE: "leave",
  PING: "ping",
  PONG: "pong",
  MESSAGE: "message",
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
} as const satisfies Record<string, WebSocketAction>;

export const ALL_WEBSOCKET_ACTIONS: readonly WebSocketAction[] = [
  WEBSOCKET_ACTIONS.JOIN,
  WEBSOCKET_ACTIONS.LEAVE,
  WEBSOCKET_ACTIONS.PING,
  WEBSOCKET_ACTIONS.PONG,
  WEBSOCKET_ACTIONS.MESSAGE,
  WEBSOCKET_ACTIONS.SUBSCRIBE,
  WEBSOCKET_ACTIONS.UNSUBSCRIBE,
] as const;

export const WEBSOCKET_RECONNECT_INTERVAL_MS = 3000 as const;
export const WEBSOCKET_ERROR_RETRY_INTERVAL_MS = 5000 as const;
export const SSE_HEARTBEAT_INTERVAL_MS = 25000 as const;
export const PROTECTED_ROOM_PREFIX = "private:" as const;

export const DEFAULT_WEBRTC_STUN_SERVER = "stun:stun.l.google.com:19302" as const;
export const DEFAULT_WEBRTC_DATA_CHANNEL_LABEL = "data-channel" as const;
export const WEBRTC_RECONNECT_INTERVAL_MS = 3000 as const;
export const WEBRTC_ACTIONS = {
  SIGNAL: "signal",
  WEBRTC_SIGNAL: "webrtc-signal",
  WEBRTC_DATA: "webrtc-data",
} as const;

export const WEBRTC_MEDIA_MODES = {
  DATA: "data",
  AUDIO: "audio",
  VIDEO: "video",
  AUDIO_VIDEO: "audio-video",
} as const;

export const ALL_WEBRTC_MEDIA_MODES = [
  WEBRTC_MEDIA_MODES.DATA,
  WEBRTC_MEDIA_MODES.AUDIO,
  WEBRTC_MEDIA_MODES.VIDEO,
  WEBRTC_MEDIA_MODES.AUDIO_VIDEO,
] as const;

export const WEBRTC_PEER_ROLES = {
  PEER: "peer",
  INITIATOR: "initiator",
  RESPONDER: "responder",
} as const;

export const WEBRTC_MEDIA_CAPABILITIES = [
  { id: "enableDataChannel", label: "Data Channel", desc: "Low-latency JSON & events", default: true },
  { id: "enableMic", label: "Microphone (Send Audio)", desc: "Capture & stream user microphone", default: false },
  { id: "enableSpeaker", label: "Speaker (Receive Audio)", desc: "Receive & playback remote audio", default: false },
  { id: "enableCamera", label: "Camera (Send Video)", desc: "Capture & stream user webcam", default: false },
  { id: "enableScreenShare", label: "Screen Share (Send Display)", desc: "Stream screen or application window", default: false },
  { id: "enableRemoteVideo", label: "Remote Video (Receive Video)", desc: "Display inbound peer video stream", default: false },
] as const;

export const CLIENT_DELIVERY_PROTOCOL_OPTIONS = [
  { value: "SSE", label: "Server-Sent Events (SSE)" },
  { value: "WEBSOCKET", label: "WebSocket" },
  { value: "WEBRTC", label: "WebRTC Data Channel" },
  { value: "API_PUSH", label: "Outbound Webhook" },
] as const satisfies readonly { value: import("../types/messaging").ClientDeliveryProtocol; label: string }[];

export const PROTOCOL_OPTIONS = CLIENT_DELIVERY_PROTOCOL_OPTIONS;

export const CLIENT_DELIVERY_WEBHOOK_METHODS = ["POST", "PUT", "PATCH"] as const;
export type ClientDeliveryWebhookMethod = (typeof CLIENT_DELIVERY_WEBHOOK_METHODS)[number];

export const WEBRTC_CAPABILITIES_DEBOUNCE_MS = 150 as const;

export function isClientDeliveryProtocol(val: string): val is import("../types/messaging").ClientDeliveryProtocol {
  return val === "SSE" || val === "WEBSOCKET" || val === "WEBRTC" || val === "API_PUSH";
}

export function isClientDeliveryWebhookMethod(val: string): val is ClientDeliveryWebhookMethod {
  return val === "POST" || val === "PUT" || val === "PATCH";
}

export function isRealtimeProtocol(val: string): val is import("../types/realtime").RealtimeProtocol {
  return val === "SSE" || val === "WEBSOCKET" || val === "WEBRTC" || val === "POLLING" || val === "API_PUSH";
}

export function isWebRtcPeerRole(val: string): val is "peer" | "initiator" | "responder" {
  return val === "peer" || val === "initiator" || val === "responder";
}



