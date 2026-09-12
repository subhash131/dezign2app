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
