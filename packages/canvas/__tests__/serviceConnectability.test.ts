import { describe, it, expect } from "vitest";
import { classifyHandle } from "../utils";
import { isValidConnection } from "../validators";
import { CONNECTION_RULES } from "../graph-rules";

describe("Service and Endpoint Connectability Taxonomy", () => {
  it("classifies service handles correctly for endpoint-in and func-in patterns", () => {
    // Canonical endpoint handles
    expect(
      classifyHandle("service", "endpoint-in-488b829c-16ea-4955-ad95-996e4ddbc250", "target"),
    ).toBe("endpoint-in");
    expect(
      classifyHandle("service", "endpoint-out-488b829c-16ea-4955-ad95-996e4ddbc250", "source"),
    ).toBe("endpoint-out");

    // Action step func-in handles targeting service
    expect(
      classifyHandle("service", "func-in-488b829c-16ea-4955-ad95-996e4ddbc250", "target"),
    ).toBe("endpoint-in");
    expect(
      classifyHandle("service", "func-out-488b829c-16ea-4955-ad95-996e4ddbc250", "source"),
    ).toBe("endpoint-out");
    expect(
      classifyHandle("serverless", "func-in-my-func", "target"),
    ).toBe("endpoint-in");
  });

  it("verifies connection rules allow event-source to connect to endpoint-in and transformer-in", () => {
    expect(CONNECTION_RULES["event-source"]).toContain("endpoint-in");
    expect(CONNECTION_RULES["event-source"]).toContain("transformer-in");
  });

  it("validates connections from WebPage action to Service endpoint via isValidConnection", () => {
    // Canonical endpoint handle
    const resEndpointIn = isValidConnection(
      "webPage",
      "events-btn-save",
      "service",
      "endpoint-in-488b829c-16ea-4955-ad95-996e4ddbc250",
    );
    expect(resEndpointIn.valid).toBe(true);
    if (resEndpointIn.valid) {
      expect(resEndpointIn.edgeType).toBe("connection");
    }

    // Compatibility func-in handle
    const resFuncIn = isValidConnection(
      "webPage",
      "events-btn-save",
      "service",
      "func-in-488b829c-16ea-4955-ad95-996e4ddbc250",
    );
    expect(resFuncIn.valid).toBe(true);
    if (resFuncIn.valid) {
      expect(resFuncIn.edgeType).toBe("connection");
    }
  });

  it("validates connections from WebPage action to Transformer via isValidConnection", () => {
    const resTransformerIn = isValidConnection(
      "webPage",
      "events-action-transform",
      "transformer",
      "transformer-in",
    );
    expect(resTransformerIn.valid).toBe(true);
    if (resTransformerIn.valid) {
      expect(resTransformerIn.edgeType).toBe("connection");
    }

    const resTransformerRef = isValidConnection(
      "webPage",
      "events-action-transform",
      "transformer_ref",
      "transformer-in",
    );
    expect(resTransformerRef.valid).toBe(true);
    if (resTransformerRef.valid) {
      expect(resTransformerRef.edgeType).toBe("connection");
    }
  });
});
