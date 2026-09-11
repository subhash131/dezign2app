import { describe, it, expect } from "vitest";
import { isBindingSourceConfigured, isStepInputUnconfigured } from "../stepValidation";
import { PipelineStepDraft } from "@/app/(canvas)/project/[projectId]/_components/config-sidebar/pipeline-step-editor/types";

describe("pipeline-validation: isBindingSourceConfigured", () => {
  it("treats whole payload (field: '') as configured for req_body", () => {
    expect(
      isBindingSourceConfigured({
        argName: "payload",
        source: { kind: "req_body", field: "" },
      }),
    ).toBe(true);
  });

  it("treats specific field path as configured for req_body", () => {
    expect(
      isBindingSourceConfigured({
        argName: "message",
        source: { kind: "req_body", field: "message" },
      }),
    ).toBe(true);
  });

  it("treats whole step output (field: '') as configured for step_output", () => {
    expect(
      isBindingSourceConfigured({
        argName: "payload",
        source: { kind: "step_output", stepId: "step-1", field: "" },
      }),
    ).toBe(true);
  });

  it("treats empty stepId as unconfigured for step_output", () => {
    expect(
      isBindingSourceConfigured({
        argName: "payload",
        source: { kind: "step_output", stepId: "", field: "" },
      }),
    ).toBe(false);
  });

  it("treats non-empty inline value as configured", () => {
    expect(
      isBindingSourceConfigured({
        argName: "key",
        source: { kind: "inline", value: "custom-value" },
      }),
    ).toBe(true);
  });

  it("treats empty inline value as unconfigured", () => {
    expect(
      isBindingSourceConfigured({
        argName: "key",
        source: { kind: "inline", value: "" },
      }),
    ).toBe(false);
  });
});

describe("pipeline-validation: isStepInputUnconfigured for push_to_client", () => {
  it("returns false (configured) when bound to whole event payload", () => {
    const step: PipelineStepDraft = {
      id: "step-push-1",
      name: "pushDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryTargetPageId: "webpage-root",
      clientDeliveryProtocol: "SSE",
      clientDeliveryEventName: "message.sent.notification",
      inputBindings: [
        {
          argName: "payload",
          source: { kind: "req_body", field: "" },
        },
      ],
    };

    expect(isStepInputUnconfigured(step, [])).toBe(false);
  });

  it("returns false (configured) when bound to individual schema fields", () => {
    const step: PipelineStepDraft = {
      id: "step-push-1",
      name: "pushDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryTargetPageId: "webpage-root",
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

    expect(isStepInputUnconfigured(step, [])).toBe(false);
  });

  it("returns true (unconfigured) when no input bindings exist", () => {
    const step: PipelineStepDraft = {
      id: "step-push-1",
      name: "pushDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryTargetPageId: "webpage-root",
      clientDeliveryProtocol: "SSE",
      inputBindings: [],
    };

    expect(isStepInputUnconfigured(step, [])).toBe(true);
  });

  it("returns true (unconfigured) when target page is missing", () => {
    const step: PipelineStepDraft = {
      id: "step-push-1",
      name: "pushDelivery",
      type: "push_to_client",
      enabled: true,
      clientDeliveryProtocol: "SSE",
      inputBindings: [
        {
          argName: "payload",
          source: { kind: "req_body", field: "" },
        },
      ],
    };

    expect(isStepInputUnconfigured(step, [])).toBe(true);
  });
});
