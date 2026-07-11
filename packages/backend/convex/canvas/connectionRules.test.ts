import { describe, it, expect } from "vitest";
import { CONNECTION_RULES, HandleKind } from "./connectionRules";
import { classifyHandle, isValidConnection, getEdgeType } from "./validateConnection";

describe("Connection Rules Exhaustiveness", () => {
  it("every HandleKind is covered in CONNECTION_RULES", () => {
    // We can't automatically get the HandleKind union at runtime,
    // but we can ensure all keys in CONNECTION_RULES are defined properly.
    const keys = Object.keys(CONNECTION_RULES);
    expect(keys.length).toBeGreaterThan(0);
    
    // Check that known kinds are present
    const expectedKinds = [
      "entity-column-source", "entity-column-target", "entity-top-target", "entity-bottom-source",
      "endpoint-in", "endpoint-out", "event-source", "published-event-out", "consumed-event-in",
      "resource-def-in", "resource-def-out", "database-target", "database-source", "action-target", "unknown"
    ];
    
    for (const kind of expectedKinds) {
      expect(CONNECTION_RULES).toHaveProperty(kind);
    }
  });

  it("every node type resolves to known handle kinds", () => {
    // Test some known node types to ensure classifyHandle doesn't return unknown for valid inputs
    expect(classifyHandle("entity", "source-0", "source")).toBe("entity-column-source");
    expect(classifyHandle("entity", "target-0", "target")).toBe("entity-column-target");
    expect(classifyHandle("entity", undefined, "target")).toBe("entity-top-target");
    expect(classifyHandle("service", "endpoints-in-123", "target")).toBe("endpoint-in");
    expect(classifyHandle("service", "routeEndpoints-in-456", "target")).toBe("endpoint-in");
    expect(classifyHandle("webClient", "events-abc", "source")).toBe("event-source");
    expect(classifyHandle("kafka", "topics:in:def", "target")).toBe("resource-def-in");
    expect(classifyHandle("sqs", "queues:out:ghi", "source")).toBe("resource-def-out");
    expect(classifyHandle("database", null, "target")).toBe("database-target");
    expect(classifyHandle("external", "actions-xyz", "target")).toBe("action-target");
  });

  it("unrecognized handle patterns fail loudly", () => {
    expect(classifyHandle("service", "invalid-handle-pattern", "source")).toBe("unknown");
    expect(classifyHandle("unknownNodeType", "events-123", "source")).toBe("unknown");
    
    const result = isValidConnection("service", "invalid-1", "service", "invalid-2");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("UNKNOWN_SOURCE_KIND");
    }
  });
});

describe("Connection Validation Logic", () => {
  it("edge type derivation", () => {
    expect(getEdgeType("entity-column-source", "entity-column-target")).toBe("foreign-key");
    expect(getEdgeType("published-event-out", "resource-def-in")).toBe("message");
    expect(getEdgeType("event-source", "endpoint-in")).toBe("connection");
  });

  it("self-connections rejected", () => {
    const result = isValidConnection(
      "service", "endpoints-out-1",
      "service", "endpoints-in-1",
      { sourceNodeId: "node-1", targetNodeId: "node-1" }
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("SELF_CONNECTION");
    }
  });

  it("duplicate edges rejected", () => {
    const resultValidHandle = isValidConnection(
      "service", "endpoints-out-1",
      "database", null,
      { 
        sourceNodeId: "node-1", targetNodeId: "node-2", 
        existingEdges: [{
          source: "node-1", target: "node-2",
          sourceHandle: "endpoints-out-1", targetHandle: null
        }]
      }
    );
    expect(resultValidHandle.valid).toBe(false);
    if (!resultValidHandle.valid) {
      expect(resultValidHandle.code).toBe("DUPLICATE_EDGE");
    }
  });
  
  it("valid connections are accepted", () => {
    const result = isValidConnection(
      "service", "endpoints-out-1",
      "database", null,
      { sourceNodeId: "node-1", targetNodeId: "node-2", existingEdges: [] }
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.edgeType).toBe("connection");
    }
  });

  it("invalid connections are rejected", () => {
    const result = isValidConnection(
      "webClient", "events-1",
      "database", null,
      { sourceNodeId: "node-1", targetNodeId: "node-2", existingEdges: [] }
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe("INVALID_KIND_PAIR");
    }
  });
});
