import { describe, it, expect } from "vitest";
import { classifyHandle } from "../utils";
import { isValidConnection } from "../validators";
import { CONNECTION_RULES, EDGE_TYPE_MAP } from "../graph-rules";

describe("StateStore and Section State Handle Taxonomy", () => {
  it("classifies all handles in state subscription workflow", () => {
    // store-field-out
    expect(classifyHandle("state_store", "store-field-out-f123", "source")).toBe("store-out");
    // store-field-in
    expect(classifyHandle("state_store", "store-field-in-f123", "target")).toBe("store-in");
    // section-state-in
    expect(classifyHandle("webPage", "section-state-in-sec1-st1", "target")).toBe("page-section-in");
    // type-out
    expect(classifyHandle("types", "type-out-chat", "source")).toBe("type-out");
  });

  it("verifies graph rules and edge types", () => {
    // store-out can connect to page-section-in
    expect(CONNECTION_RULES["store-out"]).toContain("page-section-in");

    // type-out can connect to store-in and page-section-in
    expect(CONNECTION_RULES["type-out"]).toContain("store-in");
    expect(CONNECTION_RULES["type-out"]).toContain("page-section-in");

    // edge types mapped
    expect(EDGE_TYPE_MAP["store-out→page-section-in"]).toBe("connection");
    expect(EDGE_TYPE_MAP["type-out→page-section-in"]).toBe("type-reference");
    expect(EDGE_TYPE_MAP["type-out→store-in"]).toBe("type-reference");
  });

  it("validates connections through isValidConnection", () => {
    const storeToSection = isValidConnection(
      "state_store",
      "store-field-out-chats",
      "webPage",
      "section-state-in-main-chats",
    );
    expect(storeToSection.valid).toBe(true);

    const typeToSection = isValidConnection(
      "types",
      "type-out-Chat",
      "webPage",
      "section-state-in-main-chats",
    );
    expect(typeToSection.valid).toBe(true);

    const typeToStore = isValidConnection(
      "types",
      "type-out-Chat",
      "state_store",
      "store-field-in-chats",
    );
    expect(typeToStore.valid).toBe(true);
  });

  it("validates entity to types node connections", () => {
    // Both entity-bottom-source and entity-column-source can connect to type-in
    expect(CONNECTION_RULES["entity-bottom-source"]).toContain("type-in");
    expect(CONNECTION_RULES["entity-column-source"]).toContain("type-in");
    expect(EDGE_TYPE_MAP["entity-bottom-source→type-in"]).toBe("type-reference");
    expect(EDGE_TYPE_MAP["entity-column-source→type-in"]).toBe("type-reference");

    // Default handle connection (sourceHandle: undefined, targetHandle: "types-in" or undefined)
    const entityDefaultToTypes = isValidConnection("entity", undefined, "types", "types-in");
    expect(entityDefaultToTypes.valid).toBe(true);
    if (entityDefaultToTypes.valid) {
      expect(entityDefaultToTypes.edgeType).toBe("type-reference");
    }

    const entityDefaultToTypesUndefined = isValidConnection("entity", undefined, "types", undefined);
    expect(entityDefaultToTypesUndefined.valid).toBe(true);
    if (entityDefaultToTypesUndefined.valid) {
      expect(entityDefaultToTypesUndefined.edgeType).toBe("type-reference");
    }

    // Column handle connection
    const entityColToTypes = isValidConnection("entity", "source-0", "types", "types-in");
    expect(entityColToTypes.valid).toBe(true);
    if (entityColToTypes.valid) {
      expect(entityColToTypes.edgeType).toBe("type-reference");
    }
  });
});
