import { describe, it, expect } from "vitest";
import {
  extractPackageTypesFromNodeModules,
  resolvePackageDirectory,
  parsePackageIdentifier,
} from "../packageTypeExtractor";

describe("LangGraph node_modules Dependency & AST Type Extraction", { timeout: 30000 }, () => {
  it("parses package and subpath correctly", () => {
    expect(parsePackageIdentifier("@langchain/core/messages")).toEqual({
      basePkg: "@langchain/core",
      subpath: "./messages",
    });
    expect(parsePackageIdentifier("@langchain/core")).toEqual({
      basePkg: "@langchain/core",
    });
    expect(parsePackageIdentifier("uuid/v4")).toEqual({
      basePkg: "uuid",
      subpath: "./v4",
    });
  });

  it("extracts rich types from @langchain/core via AST", () => {
    const result = extractPackageTypesFromNodeModules("@langchain/core");
    expect(result.installed).toBe(true);
    expect(result.types.length).toBeGreaterThan(50);

    const baseMessage = result.types.find((t) => t.name === "BaseMessage");
    expect(baseMessage).toBeDefined();
    expect(baseMessage?.kind).toBe("interface");
    expect(baseMessage?.fields?.length).toBeGreaterThan(0);

    // Verify BaseMessage has core message fields
    const fieldNames = baseMessage?.fields?.map((f) => f.name) || [];
    expect(fieldNames).toContain("id");
    expect(fieldNames).toContain("name");
    expect(fieldNames).toContain("content");
    expect(fieldNames).toContain("additional_kwargs");
    expect(fieldNames).toContain("response_metadata");
    expect(fieldNames).toContain("type");

    // Verify it is NOT "any"
    expect(baseMessage?.typeAliasValue).toBeUndefined();
  });

  it("extracts rich types from @langchain/langgraph via AST", () => {
    const result = extractPackageTypesFromNodeModules("@langchain/langgraph");
    expect(result.installed).toBe(true);
    expect(result.types.length).toBeGreaterThan(50);

    const typeNames = result.types.map((t) => t.name);
    expect(typeNames).toContain("StateGraph");
    expect(typeNames).toContain("CompiledStateGraph");
    expect(typeNames).toContain("Command");
  });

  it("extracts rich types from @langchain/langgraph-checkpoint-postgres via AST", () => {
    const result = extractPackageTypesFromNodeModules("@langchain/langgraph-checkpoint-postgres");
    expect(result.installed).toBe(true);
    expect(result.types.length).toBeGreaterThan(0);

    const typeNames = result.types.map((t) => t.name);
    expect(typeNames).toContain("PostgresSaver");
  });

  it("discovers all @langchain dependencies for @workspace/langgraph-agent", () => {
    const result = extractPackageTypesFromNodeModules("@workspace/langgraph-agent");
    expect(result.installed).toBe(true);
    expect(result.types.length).toBeGreaterThan(100);

    const typeNames = result.types.map((t) => t.name);
    expect(typeNames).toContain("BaseMessage");
    expect(typeNames).toContain("HumanMessage");
    expect(typeNames).toContain("AIMessage");
    expect(typeNames).toContain("SystemMessage");
    expect(typeNames).toContain("CompiledStateGraph");
    expect(typeNames).toContain("Command");
    expect(typeNames).toContain("PostgresSaver");

    const baseMessage = result.types.find((t) => t.name === "BaseMessage");
    expect(baseMessage?.kind).toBe("interface");
    expect(baseMessage?.fields?.length).toBeGreaterThanOrEqual(5);
  }, 20000);
});
