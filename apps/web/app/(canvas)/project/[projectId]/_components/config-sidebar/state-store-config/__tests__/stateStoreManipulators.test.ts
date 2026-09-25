import { describe, it, expect } from "vitest";
import {
  getStateManipulators,
  applyManipulator,
  StateManipulator,
  isJsonObject,
  generateActionCodePreview,
  getDefaultTemplateForAction,
  validateStoreAction,
} from "../types";
import type {
  GlobalStoreField,
  GlobalStoreAction,
} from "@workspace/canvas/types";

describe("stateStoreManipulators", () => {
  const sampleFields: GlobalStoreField[] = [
    { id: "f1", name: "count", type: "number", defaultValue: 0 },
    { id: "f2", name: "user", type: "object", defaultValue: null },
  ];

  it("returns default built-in manipulators when no custom overrides exist", () => {
    const manipulators = getStateManipulators(sampleFields, []);

    const names = manipulators.map((m) => m.name);
    expect(names).toContain("reset");
    expect(names).toContain("populate");
    expect(names).toContain("setCount");
    expect(names).toContain("setUser");

    const populate = manipulators.find((m) => m.name === "populate");
    expect(populate?.category).toBe("builtin");
    expect(populate?.isCustomized).toBe(false);

    const reset = manipulators.find((m) => m.name === "reset");
    expect(reset?.category).toBe("builtin");
    expect(reset?.isCustomized).toBe(false);

    const setCount = manipulators.find((m) => m.name === "setCount");
    expect(setCount?.category).toBe("auto_setter");
    expect(setCount?.isCustomized).toBe(false);
  });

  it("handles customized populate and reset without duplicating them", () => {
    const customActions: GlobalStoreAction[] = [
      {
        id: "act-load",
        name: "loadUserData",
        actionType: "populate",
        code: "set({ count: 99 });",
        defaultManipulatorType: "populate",
      },
      {
        id: "act-reset",
        name: "clearSession",
        actionType: "reset",
        code: "set({ user: null });",
        defaultManipulatorType: "reset",
      },
      {
        id: "act-setter-count",
        name: "setCount",
        targetFieldId: "f1",
        actionType: "set",
        code: "set({ count: Math.max(0, payload) });",
        defaultManipulatorType: "setter",
      },
    ];

    const manipulators = getStateManipulators(sampleFields, customActions);

    // Should include customized names
    expect(manipulators.some((m) => m.name === "loadUserData")).toBe(true);
    expect(manipulators.some((m) => m.name === "clearSession")).toBe(true);

    // Should not duplicate built-in populate or reset
    expect(manipulators.filter((m) => m.name === "populate").length).toBe(0);
    expect(manipulators.filter((m) => m.name === "reset").length).toBe(0);

    // setCount should be customized and appear once
    const setCountManipulators = manipulators.filter((m) => m.name === "setCount");
    expect(setCountManipulators.length).toBe(1);
    expect(setCountManipulators[0]?.isCustomized).toBe(true);

    // setUser should still appear as default auto_setter
    const setUser = manipulators.find((m) => m.name === "setUser");
    expect(setUser).toBeDefined();
    expect(setUser?.isCustomized).toBe(false);
  });

  it("respects disabledDefaultManipulators", () => {
    const manipulators = getStateManipulators(sampleFields, [], ["reset", "setCount"]);

    const names = manipulators.map((m) => m.name);
    expect(names).not.toContain("reset");
    expect(names).not.toContain("setCount");
    expect(names).toContain("populate");
    expect(names).toContain("setUser");
  });

  it("respects deletedDefaultManipulators (omitted completely)", () => {
    const manipulators = getStateManipulators(sampleFields, [], [], ["populate", "reset", "setCount"]);

    const names = manipulators.map((m) => m.name);
    expect(names).not.toContain("populate");
    expect(names).not.toContain("reset");
    expect(names).not.toContain("setCount");
    expect(names).toContain("setUser");
  });

  it("executes custom code in applyManipulator", () => {
    const customManipulator: StateManipulator = {
      id: "m-custom",
      name: "loadData",
      label: "loadData()",
      category: "builtin",
      actionType: "populate",
      code: "set({ count: 42, user: { name: 'Alice' } });",
    };

    const res = applyManipulator({
      manipulator: customManipulator,
      payload: {},
      currentState: { count: 0, user: null },
      fields: sampleFields,
    });

    expect(res.error).toBeUndefined();
    expect(res.newState.count).toBe(42);
    expect(res.newState.user).toEqual({ name: "Alice" });
  });

  it("does not suppress or replace default set<Field> when a custom action targets that field", () => {
    const customActions: GlobalStoreAction[] = [
      {
        id: "act-append-conversations",
        name: "appendConversations",
        targetFieldId: "f1",
        actionType: "append",
      },
    ];

    const manipulators = getStateManipulators(sampleFields, customActions);
    const names = manipulators.map((m) => m.name);

    // Both appendConversations AND setCount must exist!
    expect(names).toContain("appendConversations");
    expect(names).toContain("setCount");

    const setCountManipulator = manipulators.find((m) => m.name === "setCount");
    expect(setCountManipulator?.category).toBe("auto_setter");
    expect(setCountManipulator?.isCustomized).toBe(false);

    const appendManipulator = manipulators.find((m) => m.name === "appendConversations");
    expect(appendManipulator?.category).toBe("standard_action");
  });

  it("executes custom action with state merge and functional updater", () => {
    const customManipulator: StateManipulator = {
      id: "act-custom-merge",
      name: "appendConversations",
      label: "appendConversations()",
      category: "custom_action",
      actionType: "append",
      code: 'set((s) => ({ ...s, ...(payload && typeof payload === "object" ? payload : {}) }));',
    };

    const res = applyManipulator({
      manipulator: customManipulator,
      payload: { count: 88 },
      currentState: { count: 10, user: null },
      fields: sampleFields,
    });

    expect(res.error).toBeUndefined();
    expect(res.newState.count).toBe(88);
  });

  it("executes custom reset code using initialState in scope without error", () => {
    const resetManipulator: StateManipulator = {
      id: "act-reset",
      name: "resetStore",
      label: "resetStore()",
      category: "builtin",
      actionType: "reset",
      code: "set(initialState);",
    };

    const res = applyManipulator({
      manipulator: resetManipulator,
      payload: undefined,
      currentState: { count: 999, user: { name: "Bob" } },
      fields: sampleFields,
    });

    expect(res.error).toBeUndefined();
    expect(res.newState.count).toBe(0);
    expect(res.newState.user).toBeNull();
  });

  it("executes standard append action without custom code on an array field", () => {
    const fieldsWithArray: GlobalStoreField[] = [
      { id: "f1", name: "messages", type: "array", defaultValue: [] },
    ];
    const appendManipulator: StateManipulator = {
      id: "act-append-msg",
      name: "appendMessage",
      label: "appendMessage(item)",
      category: "standard_action",
      actionType: "append",
      targetFieldId: "f1",
      targetFieldName: "messages",
    };

    const res1 = applyManipulator({
      manipulator: appendManipulator,
      payload: "Hello World",
      currentState: { messages: [] },
      fields: fieldsWithArray,
    });

    expect(res1.error).toBeUndefined();
    expect(res1.newState.messages).toEqual(["Hello World"]);

    const res2 = applyManipulator({
      manipulator: appendManipulator,
      payload: "Second Message",
      currentState: res1.newState,
      fields: fieldsWithArray,
    });

    expect(res2.error).toBeUndefined();
    expect(res2.newState.messages).toEqual(["Hello World", "Second Message"]);
  });

  it("executes remove action by id or index typesafely", () => {
    const fieldsWithArray: GlobalStoreField[] = [
      { id: "f1", name: "items", type: "array", defaultValue: [] },
    ];
    const removeManipulator: StateManipulator = {
      id: "act-remove",
      name: "removeItem",
      label: "removeItem(id)",
      category: "standard_action",
      actionType: "remove",
      targetFieldId: "f1",
      targetFieldName: "items",
    };

    const res1 = applyManipulator({
      manipulator: removeManipulator,
      payload: { id: "item-2" },
      currentState: {
        items: [
          { id: "item-1", name: "Item 1" },
          { id: "item-2", name: "Item 2" },
          { id: "item-3", name: "Item 3" },
        ],
      },
      fields: fieldsWithArray,
    });

    expect(res1.error).toBeUndefined();
    expect(res1.newState.items).toEqual([
      { id: "item-1", name: "Item 1" },
      { id: "item-3", name: "Item 3" },
    ]);
  });

  it("executes increment action typesafely", () => {
    const incManipulator: StateManipulator = {
      id: "act-inc",
      name: "incrementCount",
      label: "incrementCount()",
      category: "standard_action",
      actionType: "increment",
      targetFieldId: "f1",
      targetFieldName: "count",
    };

    const res1 = applyManipulator({
      manipulator: incManipulator,
      payload: { amount: 5 },
      currentState: { count: 10 },
      fields: sampleFields,
    });

    expect(res1.error).toBeUndefined();
    expect(res1.newState.count).toBe(15);
  });

  it("isJsonObject properly acts as a type guard", () => {
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject([1, 2, 3])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
    expect(isJsonObject("string")).toBe(false);
    expect(isJsonObject(42)).toBe(false);
    expect(isJsonObject(true)).toBe(false);
  });

  describe("Zustand Action Code Generation & Validation", () => {
    it("generates correct Zustand action preview for set, toggle, increment, and append", () => {
      const setCode = generateActionCodePreview({
        name: "setUsername",
        actionType: "set",
        targetFieldName: "username",
        parameters: [{ id: "p1", name: "name", type: "string", required: true }],
      });
      expect(setCode).toContain("setUsername: (name) => set({ username: name })");

      const toggleCode = generateActionCodePreview({
        name: "toggleTheme",
        actionType: "toggle",
        targetFieldName: "theme",
      });
      expect(toggleCode).toContain("toggleTheme: () => set((state) => ({ theme: !state.theme }))");

      const incCode = generateActionCodePreview({
        name: "incrementPosts",
        actionType: "increment",
        targetFieldName: "posts",
        parameters: [{ id: "p1", name: "count", type: "number", required: true }],
      });
      expect(incCode).toContain("incrementPosts: (count = 1) => set((state) => ({");
      expect(incCode).toContain("posts: (Number(state.posts) || 0) + count");

      const appendCode = generateActionCodePreview({
        name: "appendConversations",
        actionType: "append",
        targetFieldName: "conversations",
        parameters: [{ id: "p1", name: "item", type: "object", required: true }],
      });
      expect(appendCode).toContain("appendConversations: (item) => set((state) => ({");
      expect(appendCode).toContain("conversations: [...(Array.isArray(state.conversations) ? state.conversations : []), item]");
    });

    it("generates default templates accurately", () => {
      const template = getDefaultTemplateForAction({
        actionType: "append",
        targetFieldName: "items",
        parameters: [{ id: "p1", name: "newItem", type: "object", required: true }],
      });
      expect(template).toContain("items: [...(Array.isArray(state.items) ? state.items : []), newItem]");
    });

    it("validates actions and flags duplicate names and reserved words", () => {
      const existing: GlobalStoreAction[] = [
        { id: "a1", name: "login", actionType: "set" },
      ];

      const validRes = validateStoreAction({
        action: { id: "a2", name: "logout", actionType: "reset" },
        allActions: existing,
        fields: sampleFields,
      });
      expect(validRes.errors).toHaveLength(0);

      const dupRes = validateStoreAction({
        action: { id: "a3", name: "login", actionType: "set" },
        allActions: existing,
        fields: sampleFields,
      });
      expect(dupRes.errors.length).toBeGreaterThan(0);
      expect(dupRes.errors[0]).toContain('Action "login" is duplicated');

      const reservedRes = validateStoreAction({
        action: {
          id: "a4",
          name: "customUpdate",
          actionType: "custom",
          parameters: [{ id: "p1", name: "set", type: "any", required: true }],
        },
        allActions: existing,
        fields: sampleFields,
      });
      expect(reservedRes.errors.some((e) => e.includes("conflicts with store scope"))).toBe(true);
    });
  });
});

