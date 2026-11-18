import { ClientDeliveryProtocol, PipelineStep, BackendNode } from "@workspace/canvas/types";

export interface WebPageRealtimeConnectionConfigProps {
  id: string;
  nodeId: string;
}

export interface DerivedRealtimeInfo {
  step: PipelineStep;
  sourceNode: BackendNode | undefined;
  sourceEventId: string | null;
  sourceEndpointId: string | null;
  stepIndex?: number;
}

export interface ProtocolOption {
  value: ClientDeliveryProtocol | "POLLING";
  label: string;
  desc: string;
}

export const PROTOCOL_OPTIONS: ProtocolOption[] = [
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

export function toPascalCase(str: string): string {
  const clean = str.trim();
  if (!clean) return "";
  if (/[\s\-_]/.test(clean)) {
    return clean
      .split(/[\s\-_]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}
