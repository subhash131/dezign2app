import { describe, it, expect } from "vitest";
import { classifyHandle } from "../utils";
import { isValidConnection } from "../validators";
import { CONNECTION_RULES, EDGE_TYPE_MAP } from "../graph-rules";

describe("Storage and Bucket Connectability Taxonomy", () => {
  it("classifies storage and bucket handles correctly", () => {
    // Bucket handles
    expect(classifyHandle("storage", "buckets:in:b-123", "target")).toBe("resource-def-in");
    expect(classifyHandle("storage", "buckets:out:b-123", "source")).toBe("resource-def-out");

    // Storage node-level handles
    expect(classifyHandle("storage", "storage-target", "target")).toBe("resource-def-in");
    expect(classifyHandle("storage", "storage-source", "source")).toBe("resource-def-out");
    expect(classifyHandle("storage", "storage-in", "target")).toBe("resource-def-in");
    expect(classifyHandle("storage", "storage-out", "source")).toBe("resource-def-out");
  });

  it("verifies connection rules for storage and buckets", () => {
    // Endpoints can connect to storage buckets (writers)
    expect(CONNECTION_RULES["endpoint-out"]).toContain("resource-def-in");

    // Tasks / Workers can connect to storage buckets
    expect(CONNECTION_RULES["task-out"]).toContain("resource-def-in");

    // UI actions and pages can connect to storage buckets
    expect(CONNECTION_RULES["event-source"]).toContain("resource-def-in");
    expect(CONNECTION_RULES["page-out"]).toContain("resource-def-in");

    // Bucket event notifications can trigger consumers, tasks, and endpoints
    expect(CONNECTION_RULES["resource-def-out"]).toContain("consumed-event-in");
    expect(CONNECTION_RULES["resource-def-out"]).toContain("task-in");
    expect(CONNECTION_RULES["resource-def-out"]).toContain("endpoint-in");

    // Edge types
    expect(EDGE_TYPE_MAP["endpoint-out→resource-def-in"]).toBe("message");
    expect(EDGE_TYPE_MAP["event-source→resource-def-in"]).toBe("connection");
    expect(EDGE_TYPE_MAP["page-out→resource-def-in"]).toBe("connection");
    expect(EDGE_TYPE_MAP["resource-def-out→endpoint-in"]).toBe("message");
  });

  it("validates connections to storage buckets through isValidConnection", () => {
    // Endpoint -> Bucket (Writer upload)
    const endpointToBucket = isValidConnection(
      "service",
      "endpoint-out-ep1",
      "storage",
      "buckets:in:b-uploads",
    );
    expect(endpointToBucket.valid).toBe(true);

    // Bucket -> Consumer (Reader / event notification)
    const bucketToConsumer = isValidConnection(
      "storage",
      "buckets:out:b-uploads",
      "service",
      "consumedEvents-in-ev1",
    );
    expect(bucketToConsumer.valid).toBe(true);

    // Page -> Bucket (Direct presigned client upload)
    const pageToBucket = isValidConnection(
      "webPage",
      "page-out-main",
      "storage",
      "buckets:in:b-uploads",
    );
    expect(pageToBucket.valid).toBe(true);
  });
});
