import { describe, it, expect } from "vitest";
import { renderPipelineStep } from "../generators/routeGenerator/pipelineRenderer";
import { collectPipelineImports } from "../generators/routeGenerator/pipeline/importCollector";
import { generateConsumers } from "../generators/consumerGenerator";
import { generateLibFiles } from "../generators/configGenerator";
import { PipelineStep } from "@workspace/canvas/types";

describe("compilePushToClientStep", () => {
  it("renders SSE delivery with whole payload binding", () => {
    const step: PipelineStep = {
      id: "step-push-1",
      name: "pushNotification",
      type: "push_to_client",
      enabled: true,
      clientDeliveryProtocol: "SSE",
      clientDeliveryEventName: "message.sent.notification",
      inputBindings: [
        {
          argName: "payload",
          source: { kind: "req_body", field: "" },
        },
      ],
    };

    const lines = renderPipelineStep(step, {
      bodyVar: "payload",
      priorOutputs: new Map(),
    });

    const code = lines.join("\n");
    expect(code).toContain("sseBroadcast(\"message.sent.notification\", payload);");
  });

  it("renders SSE delivery with individual field bindings", () => {
    const step: PipelineStep = {
      id: "step-push-1",
      name: "pushNotification",
      type: "push_to_client",
      enabled: true,
      clientDeliveryProtocol: "SSE",
      clientDeliveryEventName: "message.sent.notification",
      inputBindings: [
        {
          argName: "message",
          source: { kind: "req_body", field: "message" },
        },
        {
          argName: "sender",
          source: { kind: "req_body", field: "sender" },
        },
        {
          argName: "conversation_id",
          source: { kind: "req_body", field: "conversation_id" },
        },
      ],
    };

    const lines = renderPipelineStep(step, {
      bodyVar: "payload",
      priorOutputs: new Map(),
    });

    const code = lines.join("\n");
    expect(code).toContain("sseBroadcast(\"message.sent.notification\", {");
    expect(code).toContain("message: payload.message");
    expect(code).toContain("sender: payload.sender");
    expect(code).toContain("conversation_id: payload.conversation_id");
  });

  it("renders WebSocket delivery with room", () => {
    const step: PipelineStep = {
      id: "step-push-ws",
      name: "wsBroadcast",
      type: "push_to_client",
      enabled: true,
      clientDeliveryProtocol: "WEBSOCKET",
      clientDeliveryEventName: "chat.message",
      clientDeliveryRoom: "room:123",
      inputBindings: [
        {
          argName: "payload",
          source: { kind: "req_body", field: "" },
        },
      ],
    };

    const lines = renderPipelineStep(step, {
      bodyVar: "payload",
      priorOutputs: new Map(),
    });

    const code = lines.join("\n");
    expect(code).toContain("wsBroadcast(\"chat.message\", payload, \"room:123\");");
  });

  it("collects sseBroadcast and wsBroadcast imports from ../lib", () => {
    const sseStep: PipelineStep = {
      id: "step-sse",
      name: "sseDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryProtocol: "SSE",
      clientDeliveryEventName: "notification",
    };

    const wsStep: PipelineStep = {
      id: "step-ws",
      name: "wsDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryProtocol: "WEBSOCKET",
      clientDeliveryEventName: "chat",
    };

    const webrtcStep: PipelineStep = {
      id: "step-webrtc",
      name: "webrtcDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryProtocol: "WEBRTC",
      clientDeliveryEventName: "video.stream",
    };

    const imports = collectPipelineImports([sseStep, wsStep, webrtcStep]);
    const libImports = imports.get("../lib");

    expect(libImports).toBeDefined();
    expect(libImports?.has("sseBroadcast")).toBe(true);
    expect(libImports?.has("wsBroadcast")).toBe(true);
    expect(libImports?.has("webrtcBroadcast")).toBe(true);
  });

  it("renders WebRTC delivery with room", () => {
    const step: PipelineStep = {
      id: "step-push-webrtc",
      name: "webrtcDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryProtocol: "WEBRTC",
      clientDeliveryEventName: "stream.frame",
      clientDeliveryRoom: "room:webrtc",
      inputBindings: [
        {
          argName: "payload",
          source: { kind: "req_body", field: "" },
        },
      ],
    };

    const lines = renderPipelineStep(step, {
      bodyVar: "payload",
      priorOutputs: new Map(),
    });

    const code = lines.join("\n");
    expect(code).toContain('webrtcBroadcast("stream.frame", payload, "room:webrtc");');
  });

  it("generates consumer with sseBroadcast import from ../lib when push_to_client step is configured", () => {
    const consumerEvent = {
      id: "ev-message-sent",
      name: "messageSent",
      nodeId: "node-notif",
      variant: "consume" as const,
      pipelineSteps: [
        {
          id: "step-push-notif",
          name: "pushNotification",
          type: "push_to_client" as const,
          enabled: true,
          clientDeliveryProtocol: "SSE" as const,
          clientDeliveryEventName: "message.sent.notification",
          inputBindings: [
            {
              argName: "payload",
              source: { kind: "req_body" as const, field: "" },
            },
          ],
        },
      ],
    };

    const files = generateConsumers("NotificationService", [consumerEvent]);
    const consumerFile = files.find((f) => f.filename === "src/consumer/messageSent.ts");

    expect(consumerFile).toBeDefined();
    expect(consumerFile?.content).toContain('import { sseBroadcast } from "../lib";');
    expect(consumerFile?.content).toContain('sseBroadcast("message.sent.notification", payload);');
  });

  it("generates src/lib/realtime.ts and re-exports it in src/lib/index.ts", () => {
    const files = generateLibFiles(true);
    const realtimeFile = files.find((f) => f.filename === "src/lib/realtime.ts");
    const indexFile = files.find((f) => f.filename === "src/lib/index.ts");

    expect(realtimeFile).toBeDefined();
    expect(realtimeFile?.content).toContain("export function sseBroadcast(");
    expect(realtimeFile?.content).toContain("export function wsBroadcast(");
    expect(realtimeFile?.content).toContain("export function webrtcBroadcast(");
    expect(realtimeFile?.content).toContain("export function handleSseConnection(");

    expect(indexFile).toBeDefined();
    expect(indexFile?.content).toContain('export * from "./realtime";');
  });
});
