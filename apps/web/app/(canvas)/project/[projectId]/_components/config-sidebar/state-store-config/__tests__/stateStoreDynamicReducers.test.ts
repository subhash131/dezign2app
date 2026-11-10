import { describe, it, expect } from "vitest";
import {
  getSuggestedReducerCodeForChannelType,
  isReducerCodeCompatibleWithType,
  extractActionsFromReducerCode,
  generateSchemaAwareReducerCode,
  generateSchemaAwareArrayReducerCode,
  REDUCER_CODE_PRESETS,
  getAvailableCustomTypes,
  resolveCustomType,
  getDefaultValueForField,
} from "../../../backend-nodes/graph-nodes/langgraph/langgraph-canvas/components/inspector/state-inspector/constants";
import { getSupportedActionsForType } from "../../../backend-nodes/graph-nodes/nodes/frontend/StateStoreNode";
import type { CustomTypeItem } from "@workspace/canvas/types";

describe("StateStore Dynamic Reducer Generation", () => {
  const sampleUserType: CustomTypeItem = {
    id: "type-user",
    name: "User",
    kind: "interface",
    fields: [
      { id: "f1", name: "id", type: "string", required: true },
      { id: "f2", name: "name", type: "string", required: true },
      { id: "f3", name: "email", type: "string", required: true },
      { id: "f4", name: "role", type: "string", required: false, defaultValue: "member" },
    ],
  };

  describe("Dynamic code generation based on configured type", () => {
    it("dynamically generates string reducer with set, append, prepend, reset actions", () => {
      const code = getSuggestedReducerCodeForChannelType("string", null, false);
      expect(code).toBe(REDUCER_CODE_PRESETS.string);
      expect(code).toContain('action === "replace" || action === "set"');
      expect(code).toContain('action === "append"');
      expect(code).toContain('action === "prepend"');
      expect(code).toContain('action === "reset"');

      const actions = extractActionsFromReducerCode(code);
      expect(actions).toContain("set");
      expect(actions).toContain("append");
      expect(actions).toContain("prepend");
      expect(actions).toContain("reset");

      const fn = new Function("return " + code)();
      expect(fn("hello", { action: "append", value: " world" })).toBe("hello world");
      expect(fn("world", { action: "prepend", value: "hello " })).toBe("hello world");
      expect(fn("hello", { action: "set", value: "fresh" })).toBe("fresh");
      expect(fn("hello", { action: "reset" })).toBe("");
    });

    it("dynamically generates number reducer with set, increment, decrement, reset actions", () => {
      const code = getSuggestedReducerCodeForChannelType("number", null, false);
      expect(code).toBe(REDUCER_CODE_PRESETS.number);
      expect(code).toContain("increment");
      expect(code).toContain("decrement");
      expect(code).toContain("reset");

      const actions = extractActionsFromReducerCode(code);
      expect(actions).toContain("set");
      expect(actions).toContain("increment");
      expect(actions).toContain("decrement");
      expect(actions).toContain("reset");

      const fn = new Function("return " + code)();
      expect(fn(10, { action: "increment", amount: 5 })).toBe(15);
      expect(fn(10, { action: "decrement", amount: 3 })).toBe(7);
      expect(fn(10, { action: "set", value: 42 })).toBe(42);
      expect(fn(10, { action: "reset" })).toBe(0);
    });

    it("dynamically generates boolean reducer with set, toggle, reset actions", () => {
      const code = getSuggestedReducerCodeForChannelType("boolean", null, false);
      expect(code).toBe(REDUCER_CODE_PRESETS.boolean);
      expect(code).toContain("toggle");
      expect(code).toContain("reset");

      const actions = extractActionsFromReducerCode(code);
      expect(actions).toContain("toggle");
      expect(actions).toContain("reset");

      const fn = new Function("return " + code)();
      expect(fn(false, { action: "toggle" })).toBe(true);
      expect(fn(true, { action: "toggle" })).toBe(false);
      expect(fn(false, { action: "set", value: true })).toBe(true);
      expect(fn(true, { action: "reset" })).toBe(false);
    });

    it("dynamically generates primitive array reducer when isArray or [] type is configured", () => {
      const code1 = getSuggestedReducerCodeForChannelType("string[]", null, true);
      const code2 = getSuggestedReducerCodeForChannelType("array", null, true);
      const code3 = getSuggestedReducerCodeForChannelType("number", null, true);

      expect(code1).toBe(REDUCER_CODE_PRESETS.array);
      expect(code2).toBe(REDUCER_CODE_PRESETS.array);
      expect(code3).toBe(REDUCER_CODE_PRESETS.array);

      const actions = extractActionsFromReducerCode(code1);
      expect(actions).toContain("set");
      expect(actions).toContain("append");
      expect(actions).toContain("pop");
      expect(actions).toContain("remove");
      expect(actions).toContain("reset");

      const fn = new Function("return " + code1)();
      expect(fn(["a", "b"], { action: "append", value: "c" })).toEqual(["a", "b", "c"]);
      expect(fn(["a", "b"], { action: "pop" })).toEqual(["a"]);
      expect(fn(["a", "b", "c"], { action: "remove", value: "b" })).toEqual(["a", "c"]);
      expect(fn(["a", "b"], { action: "set", value: ["x", "y"] })).toEqual(["x", "y"]);
      expect(fn(["a", "b"], { action: "reset" })).toEqual([]);
    });

    it("dynamically generates schema-aware object reducer for single custom type", () => {
      const code = getSuggestedReducerCodeForChannelType("User", sampleUserType, false);
      expect(code).toContain("Initial shape guaranteed by type schema for User");
      expect(code).toContain("id: \"\"");
      expect(code).toContain("name: \"\"");
      expect(code).toContain("role: \"member\"");

      const fn = new Function("return " + code)();
      const initial = fn(undefined, {});
      expect(initial).toEqual({ id: "", name: "", email: "", role: "member" });

      const updated = fn(initial, { action: "update", value: { name: "Alice" } });
      expect(updated).toEqual({ id: "", name: "Alice", email: "", role: "member" });

      const replaced = fn(updated, { action: "set", value: { id: "u1", name: "Bob", role: "admin" } });
      expect(replaced).toEqual({ id: "u1", name: "Bob", email: "", role: "admin" });

      const reset = fn(replaced, { action: "reset" });
      expect(reset).toEqual({ id: "", name: "", email: "", role: "member" });
    });

    it("dynamically generates schema-aware array reducer for custom type array (User[])", () => {
      const code = getSuggestedReducerCodeForChannelType("User[]", sampleUserType, true);
      expect(code).toContain("Array reducer for User[]");
      expect(code).toContain("action === \"append\"");
      expect(code).toContain("action === \"pop\"");
      expect(code).toContain("action === \"remove\"");
      expect(code).toContain("item.id !== target");

      const fn = new Function("return " + code)();
      const empty = fn(undefined, {});
      expect(empty).toEqual([]);

      const u1 = { id: "1", name: "Alice", email: "alice@test.com", role: "admin" };
      const u2 = { id: "2", name: "Bob", email: "bob@test.com", role: "member" };

      const step1 = fn(empty, { action: "append", value: u1 });
      expect(step1).toEqual([u1]);

      const step2 = fn(step1, { action: "append", value: u2 });
      expect(step2).toEqual([u1, u2]);

      // Pop removes last item
      const step3 = fn(step2, { action: "pop" });
      expect(step3).toEqual([u1]);

      // Append again then remove by id
      const step4 = fn(step3, { action: "append", value: u2 });
      const step5 = fn(step4, { action: "remove", id: "1" });
      expect(step5).toEqual([u2]);

      // Reset empties array
      const step6 = fn(step5, { action: "reset" });
      expect(step6).toEqual([]);
    });
  });

  describe("Compatibility and type-change detection", () => {
    it("detects string code is incompatible with number or array", () => {
      const stringCode = REDUCER_CODE_PRESETS.string;
      expect(isReducerCodeCompatibleWithType(stringCode, "string", false)).toBe(true);
      expect(isReducerCodeCompatibleWithType(stringCode, "number", false)).toBe(false);
      expect(isReducerCodeCompatibleWithType(stringCode, "string[]", true)).toBe(false);
      expect(isReducerCodeCompatibleWithType(stringCode, "array", true)).toBe(false);
    });

    it("detects number code is incompatible with string or array", () => {
      const numberCode = REDUCER_CODE_PRESETS.number;
      expect(isReducerCodeCompatibleWithType(numberCode, "number", false)).toBe(true);
      expect(isReducerCodeCompatibleWithType(numberCode, "string", false)).toBe(false);
      expect(isReducerCodeCompatibleWithType(numberCode, "number[]", true)).toBe(false);
    });

    it("detects array code is incompatible with scalar types", () => {
      const arrayCode = REDUCER_CODE_PRESETS.array;
      expect(isReducerCodeCompatibleWithType(arrayCode, "string[]", true)).toBe(true);
      expect(isReducerCodeCompatibleWithType(arrayCode, "number[]", true)).toBe(true);
      expect(isReducerCodeCompatibleWithType(arrayCode, "number", false)).toBe(false);
      expect(isReducerCodeCompatibleWithType(arrayCode, "string", false)).toBe(false);
      expect(isReducerCodeCompatibleWithType(arrayCode, "boolean", false)).toBe(false);
    });
  });

  describe("getSupportedActionsForType", () => {
    it("returns expected action list for all supported types", () => {
      expect(getSupportedActionsForType("string", false)).toEqual([
        "set",
        "append",
        "prepend",
        "reset",
      ]);
      expect(getSupportedActionsForType("number", false)).toEqual([
        "set",
        "increment",
        "decrement",
        "reset",
      ]);
      expect(getSupportedActionsForType("boolean", false)).toEqual([
        "set",
        "toggle",
        "reset",
      ]);
      expect(getSupportedActionsForType("object", false)).toEqual([
        "set",
        "update",
        "reset",
      ]);
      expect(getSupportedActionsForType("string[]", true)).toEqual([
        "set",
        "append",
        "prepend",
        "pop",
        "remove",
        "update",
        "reset",
      ]);
      expect(getSupportedActionsForType("User[]", true)).toEqual([
        "set",
        "append",
        "prepend",
        "pop",
        "remove",
        "update",
        "reset",
      ]);
    });
  });

  describe("Enum and union field safe defaults", () => {
    it("handles enum fields with enumValues to pick the first valid enum literal", () => {
      const enumField = {
        id: "sender",
        name: "sender",
        type: "enum",
        enumValues: ["AI", "USER", "SYSTEM"],
        required: true,
      };
      expect(getDefaultValueForField(enumField)).toBe('"AI"');
    });

    it("handles union literal types to pick the first literal as safe default", () => {
      const unionField = {
        id: "sender",
        name: "sender",
        type: '"AI" | "USER" | "SYSTEM"',
        required: true,
      };
      expect(getDefaultValueForField(unionField)).toBe('"AI"');
    });
  });

  describe("User Custom Types vs Package Types Prioritization", () => {
    const userMessageType: CustomTypeItem = {
      id: "type-user-message",
      name: "Message",
      kind: "interface",
      fields: [
        { id: "f1", name: "id", type: "string", required: true },
        { id: "f2", name: "sender", type: "enum", enumValues: ["AI", "USER", "SYSTEM"], required: true },
        { id: "f3", name: "content", type: "string", required: true },
      ],
    };

    const packageMessageType: CustomTypeItem = {
      id: "type-pkg-message",
      name: "Message",
      kind: "interface",
      packageSource: "@workspace/langgraph-agent",
      fields: [
        { id: "p1", name: "type", type: "string", required: true },
        { id: "p2", name: "id", type: "string", required: false },
        { id: "p3", name: "name", type: "string", required: false },
        { id: "p4", name: "content", type: "array", required: true },
        { id: "p5", name: "response_metadata", type: "object", required: false },
      ],
    };

    it("prioritizes standalone user custom types over package node types", () => {
      // Simulate canvas nodes where package node is listed before the user types node
      const nodes = [
        {
          id: "node-pkg",
          type: "types",
          data: {
            isPackageNode: true,
            packageName: "@workspace/langgraph-agent",
            types: [packageMessageType],
          },
        },
        {
          id: "node-user-types",
          type: "types",
          data: {
            label: "Custom Types",
            types: [userMessageType],
          },
        },
      ];

      const available = getAvailableCustomTypes(nodes as any);
      expect(available[0]?.id).toBe("type-user-message");
      expect(available[0]?.fields?.map((f) => f.name)).toEqual(["id", "sender", "content"]);

      const resolved = resolveCustomType({ availableTypes: available, typeName: "Message" });
      expect(resolved?.id).toBe("type-user-message");
      expect(resolved?.fields?.map((f) => f.name)).toEqual(["id", "sender", "content"]);
    });

    it("generates correct reducer reflecting user Message type (id, sender, content)", () => {
      const code = getSuggestedReducerCodeForChannelType("Message", userMessageType, false);
      expect(code).toContain("Initial shape guaranteed by type schema for Message");
      expect(code).toContain('id: ""');
      expect(code).toContain('sender: "AI"');
      expect(code).toContain('content: ""');
      expect(code).not.toContain("response_metadata");

      const fn = new Function("return " + code)();
      const initial = fn(undefined, {});
      expect(initial).toEqual({ id: "", sender: "AI", content: "" });

      // Update message content
      const updated = fn(initial, { action: "update", value: { content: "Hello AI!" } });
      expect(updated).toEqual({ id: "", sender: "AI", content: "Hello AI!" });

      // Replace with new message
      const replaced = fn(updated, {
        action: "replace",
        value: { id: "msg_1", sender: "USER", content: "Can you help me?" },
      });
      expect(replaced).toEqual({ id: "msg_1", sender: "USER", content: "Can you help me?" });

      // Reset
      const reset = fn(replaced, { action: "reset" });
      expect(reset).toEqual({ id: "", sender: "AI", content: "" });
    });
  });
});