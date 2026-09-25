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

  it("recognizes StorageBucketRefNode and related types in isBackendNode", async () => {
    const { isBackendNode } = await import("../utils");
    expect(isBackendNode("storage_operation_ref")).toBe(true);
    expect(isBackendNode("storage_ref")).toBe(true);
    expect(isBackendNode("bucket_ref")).toBe(true);
    expect(isBackendNode("storage_bucket_ref")).toBe(true);
    expect(isBackendNode("StorageBucketRefNode")).toBe(true);
    expect(isBackendNode("StorageOperationRefNode")).toBe(true);
  });

  it("validates connections to StorageBucketRefNode / storage reference nodes", () => {
    // 1. Storage bucket -> StorageBucketRefNode header (storage-reference edge)
    const bucketToRef = isValidConnection(
      "storage",
      "buckets:out:b-uploads",
      "StorageBucketRefNode",
      "storage-ref-header",
    );
    expect(bucketToRef.valid).toBe(true);
    if (bucketToRef.valid) {
      expect(bucketToRef.edgeType).toBe("storage-reference");
    }

    // 2. Storage bucket (singular prefix) -> bucket_ref header
    const singularBucketToRef = isValidConnection(
      "storage",
      "bucket:out:b-uploads",
      "bucket_ref",
      "storage-ref-header",
    );
    expect(singularBucketToRef.valid).toBe(true);
    if (singularBucketToRef.valid) {
      expect(singularBucketToRef.edgeType).toBe("storage-reference");
    }

    // 3. Service endpoint -> storage_operation_ref function handle
    const endpointToRefOp = isValidConnection(
      "service",
      "endpoint-out-ep1",
      "storage_operation_ref",
      "func-uploadObject",
    );
    expect(endpointToRefOp.valid).toBe(true);
    if (endpointToRefOp.valid) {
      expect(endpointToRefOp.edgeType).toBe("connection");
    }

    // 4. Service endpoint -> StorageBucketRefNode function handle
    const endpointToBucketRefNode = isValidConnection(
      "service",
      "endpoint-out-ep1",
      "StorageBucketRefNode",
      "func-uploadObject",
    );
    expect(endpointToBucketRefNode.valid).toBe(true);
    if (endpointToBucketRefNode.valid) {
      expect(endpointToBucketRefNode.edgeType).toBe("connection");
    }
  });
});
