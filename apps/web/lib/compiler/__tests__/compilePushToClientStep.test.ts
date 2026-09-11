import { describe, it, expect } from "vitest";
import { renderPipelineStep } from "../generators/routeGenerator/pipelineRenderer";
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
});
