import { describe, it, expect } from "vitest";
import { getBuiltInReducerCode } from "../components/ChannelReducerConfig";
import {
  BUILT_IN_REDUCERS,
  REDUCER_CODE_PRESETS,
  getSuggestedReducerCodeForChannelType,
  generateSchemaAwareReducerCode,
  isReducerCodeCompatibleWithType,
} from "../constants";

describe("State Channel Reducer Configuration", () => {
  describe("getBuiltInReducerCode", () => {
    it("returns direct assignment for replace", () => {
      expect(getBuiltInReducerCode("replace")).toBe("(prev, next) => next");
    });

    it("returns chat deduplication and append for add_messages", () => {
      const code = getBuiltInReducerCode("add_messages");
      expect(code).toContain("Array.isArray(prev)");
      expect(code).toContain("Array.isArray(next)");
    });

    it("returns array concat for append and concat_array", () => {
      const appendCode = getBuiltInReducerCode("append");
      const concatCode = getBuiltInReducerCode("concat_array");
      expect(appendCode).toContain("[...(Array.isArray(prev)");
      expect(concatCode).toBe(appendCode);
    });

    it("returns shallow dict merge for merge_object", () => {
      expect(getBuiltInReducerCode("merge_object")).toBe(
        "(prev, next) => ({ ...(prev || {}), ...(next || {}) })",
      );
    });

    it("defaults to replace for unknown reducer name", () => {
      expect(getBuiltInReducerCode("custom_unknown")).toBe("(prev, next) => next");
    });
  });

  describe("getSuggestedReducerCodeForChannelType", () => {
    it("suggests action-aware reducer for number channels with replace, increment, decrement, reset", () => {
      const code = getSuggestedReducerCodeForChannelType("number");
      expect(code).toBe(REDUCER_CODE_PRESETS.number);
      expect(code).toContain("next?.action");
      expect(code).toContain('action === "replace"');
      expect(code).toContain('action === "increment"');
      expect(code).toContain('action === "decrement"');
      expect(code).toContain('action === "reset"');
    });

    it("supports action-based counter reducer preset (increment, decrement, reset, replace)", () => {
      const code = REDUCER_CODE_PRESETS.counterActions;
      expect(code).toContain('action === "replace"');
      expect(code).toContain("increment");
      expect(code).toContain("decrement");
      expect(code).toContain("reset");
    });

    it("suggests append with replace action for array and messages channels", () => {
      const arrayCode = getSuggestedReducerCodeForChannelType("array");
      expect(arrayCode).toBe(REDUCER_CODE_PRESETS.array);
      expect(arrayCode).toContain('action === "replace"');
      expect(arrayCode).toContain("next?.action");

      const chatCode = getSuggestedReducerCodeForChannelType("messages");
      expect(chatCode).toBe(REDUCER_CODE_PRESETS.chat);
      expect(chatCode).toContain('action === "replace"');
    });

    it("suggests object merge with replace action for object and json channels", () => {
      const objCode = getSuggestedReducerCodeForChannelType("object");
      expect(objCode).toBe(REDUCER_CODE_PRESETS.object);
      expect(objCode).toContain('action === "replace"');
      expect(getSuggestedReducerCodeForChannelType("json")).toBe(
        REDUCER_CODE_PRESETS.object,
      );
    });

    it("suggests string concat with replace action for string channels", () => {
      const strCode = getSuggestedReducerCodeForChannelType("string");
      expect(strCode).toBe(REDUCER_CODE_PRESETS.string);
      expect(strCode).toContain('action === "replace"');
      expect(strCode).toContain('action === "prepend"');

      // Test evaluation of the string reducer
      const fn = new Function("return " + strCode)();
      // Default: concats incoming text directly (with optional separator)
      expect(fn("", "first line")).toBe("first line");
      expect(fn("first", " second")).toBe("first second");
      expect(fn("first", { value: "second", separator: " " })).toBe("first second");
      // Prepend
      expect(fn("world", { action: "prepend", value: "hello " })).toBe("hello world");
      // Replace
      expect(fn("old", { action: "replace", value: "new" })).toBe("new");
      // Reset / clear
      expect(fn("old", { action: "clear" })).toBe("");
      expect(fn("old", { action: "reset" })).toBe("");
    });

    it("suggests boolean toggle with replace action for boolean channels", () => {
      const boolCode = getSuggestedReducerCodeForChannelType("boolean");
      expect(boolCode).toBe(REDUCER_CODE_PRESETS.boolean);
      expect(boolCode).toContain('action === "replace"');
      expect(boolCode).toContain('action === "toggle"');
    });
  });

  describe("Built-in Reducers Catalog", () => {
    it("has 5 standard built-in reducers", () => {
      expect(BUILT_IN_REDUCERS).toHaveLength(5);
      const names = BUILT_IN_REDUCERS.map((r) => r.name);
      expect(names).toContain("replace");
      expect(names).toContain("add_messages");
      expect(names).toContain("append");
      expect(names).toContain("concat_array");
      expect(names).toContain("merge_object");
    });
  });

  describe("isReducerCodeCompatibleWithType", () => {
    it("detects string reducer code is incompatible with number channels", () => {
      const stringCode = REDUCER_CODE_PRESETS.string;
      expect(isReducerCodeCompatibleWithType(stringCode, "number")).toBe(false);
    });

    it("detects number reducer code is compatible with number channels", () => {
      const numberCode = REDUCER_CODE_PRESETS.number;
      expect(isReducerCodeCompatibleWithType(numberCode, "number")).toBe(true);
    });

    it("executes number reducer correctly without string coercion", () => {
      // Evaluate the generated number reducer function
      const fn = new Function("return " + REDUCER_CODE_PRESETS.number)();

      // Default set: passes raw number or object value
      expect(fn(0, 5)).toBe(5);
      expect(fn(5, { value: 42 })).toBe(42);

      // Replace / set action
      expect(fn(10, { action: "replace", value: 99 })).toBe(99);
      expect(fn(10, { action: "set", value: 100 })).toBe(100);

      // Increment / add action
      expect(fn(10, { action: "increment", amount: 3 })).toBe(13);
      expect(fn(10, { action: "add", value: 5 })).toBe(15);

      // Decrement / subtract action
      expect(fn(10, { action: "decrement", amount: 2 })).toBe(8);
      expect(fn(10, { action: "subtract", value: 4 })).toBe(6);

      // Reset / clear action
      expect(fn(10, { action: "reset" })).toBe(0);
      expect(fn(10, { action: "clear" })).toBe(0);
    });
  });

  describe("generateSchemaAwareReducerCode", () => {
    it("generates type-safe reducer for interface { id: string; name: string }", () => {
      const customType = {
        id: "type-user-1",
        name: "User",
        kind: "interface" as const,
        fields: [
          { id: "f1", name: "id", type: "string" },
          { id: "f2", name: "name", type: "string" },
        ],
      };

      const code = generateSchemaAwareReducerCode(customType);
      expect(code).toContain('id: ""');
      expect(code).toContain('name: ""');
      expect(code).toContain('action === "reset"');
      expect(code).toContain('action === "replace"');
      expect(code).toContain('shallowEqual');

      // Evaluate the generated reducer
      const fn = new Function("return " + code)();

      // 1. Initial state returns valid typed structure, never raw {}
      expect(fn(undefined, {})).toEqual({ id: "", name: "" });

      // 2. Partial updates merge cleanly
      const step1 = fn(undefined, { name: "Alice" });
      expect(step1).toEqual({ id: "", name: "Alice" });

      const step2 = fn(step1, { id: "user_1" });
      expect(step2).toEqual({ id: "user_1", name: "Alice" });

      // 3. Replace action overwrites and ensures missing fields get initial defaults
      const step3 = fn(step2, { action: "replace", value: { name: "Bob" } });
      expect(step3).toEqual({ id: "", name: "Bob" });

      // 4. Direct action envelope does NOT leak internal action property into the state
      const step4 = fn(step3, { action: "replace", id: "user_2", name: "Charlie" });
      expect(step4).toEqual({ id: "user_2", name: "Charlie" });
      expect((step4 as Record<string, unknown>).action).toBeUndefined();

      // 5. Reset action cleanly restores initial typed fields
      const step5 = fn(step4, { action: "reset" });
      expect(step5).toEqual({ id: "", name: "" });

      // 6. Action aliases (set, update, patch, clear)
      expect(fn(step4, { action: "update", value: { name: "Updated" } })).toEqual({
        id: "user_2",
        name: "Updated",
      });
      expect(fn(step4, { action: "patch", value: { id: "patched_id" } })).toEqual({
        id: "patched_id",
        name: "Charlie",
      });
      expect(fn(step4, { action: "clear" })).toEqual({ id: "", name: "" });
    });

    it("parses fields from raw TypeScript interface code when fields array is empty", () => {
      const rawType = {
        id: "type-user-raw",
        name: "Profile",
        kind: "interface" as const,
        rawCode: `interface Profile {
          id: string;
          name: string;
          score?: number;
        }`,
      };

      const code = generateSchemaAwareReducerCode(rawType);
      expect(code).toContain('id: ""');
      expect(code).toContain('name: ""');
      expect(code).toContain("score: undefined");

      const fn = new Function("return " + code)();
      const res = fn(undefined, { id: "p1", name: "User 1", score: 100 });
      expect(res).toEqual({ id: "p1", name: "User 1", score: 100 });
    });

    it("suggests schema-aware reducer when customTypeSchema is passed to getSuggestedReducerCodeForChannelType", () => {
      const customType = {
        id: "type-user-2",
        name: "User",
        kind: "interface" as const,
        fields: [
          { id: "f1", name: "id", type: "string" },
          { id: "f2", name: "name", type: "string" },
        ],
      };

      const code = getSuggestedReducerCodeForChannelType("object", customType);
      expect(code).toContain('id: ""');
      expect(code).toContain('name: ""');
      expect(code).toContain("Initial shape guaranteed by type schema for User");
      expect(code).not.toEqual(REDUCER_CODE_PRESETS.object);

      // Without customTypeSchema, it falls back to generic object preset
      const genericCode = getSuggestedReducerCodeForChannelType("object");
      expect(genericCode).toEqual(REDUCER_CODE_PRESETS.object);

      // Both schema-aware reducer and generic preset are compatible with object channel type
      expect(
        isReducerCodeCompatibleWithType(REDUCER_CODE_PRESETS.object, "object"),
      ).toBe(true);
      expect(
        isReducerCodeCompatibleWithType(code, "object"),
      ).toBe(true);
    });
  });
});

