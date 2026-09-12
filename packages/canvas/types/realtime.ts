/**
 * JSON-serializable primitives and composite data structures.
 * Used across the compiler and real-time streaming to avoid `any` or `unknown`.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * Supported real-time client delivery protocols.
 */
export type RealtimeProtocol = "SSE" | "WEBSOCKET" | "WEBRTC" | "POLLING" | "API_PUSH";

/**
 * Standard WebSocket client action types for framing bidirectional messages.
 */
export type WebSocketAction =
  | "join"
  | "leave"
  | "ping"
  | "pong"
  | "message"
  | "subscribe"
  | "unsubscribe";

/**
 * Inbound WebSocket client frame structure sent from web clients to backend servers.
 */
export interface WebSocketClientMessage {
  action?: WebSocketAction;
  type?: WebSocketAction;
  room?: string;
  event?: string;
  token?: string;
  data?: JsonValue;
}

/**
 * Outbound WebSocket server event frame broadcasted to connected clients.
 */
export interface WebSocketServerEvent<T = JsonValue> {
  event: string;
  data: T;
  room?: string;
  timestamp: string;
}

/**
 * WebSocket system response frames (join confirmations, error messages, heartbeats).
 */
export interface WebSocketSystemResponse {
  type: "connected" | "joined" | "left" | "pong" | "error";
  clientId?: string;
  room?: string;
  error?: string;
}

/**
 * Server-side session tracking for an active WebSocket client.
 */
export interface WebSocketClientSession {
  id: string;
  rooms: Set<string>;
  token?: string;
  userId?: string;
  roles?: string[];
  connectedAt: string;
}

/**
 * Log entry recorded by the client-side real-time Output Log component.
 */
export interface RealtimeTriggerLog<T = JsonValue> {
  id: string;
  eventName: string;
  eventType: "SSE" | "WebSocket" | "TRIGGER" | "API";
  timestamp: string;
  url: string;
  method: string;
  status?: number;
  payload?: JsonValue;
  data: T;
  error?: string;
}
