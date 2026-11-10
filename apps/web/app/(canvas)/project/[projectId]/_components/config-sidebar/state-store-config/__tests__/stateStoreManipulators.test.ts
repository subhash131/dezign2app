import { describe, it, expect } from "vitest";
import {
  getStateManipulators,
  applyManipulator,
  StateManipulator,
  isManipulatorForField,
  isJsonObject,
  generateActionCodePreview,
  getDefaultTemplateForAction,
  validateStoreAction,
  inferSampleValueForField,
  inferSamplePatchForField,
  formatInitialFieldValue,
} from "../types";
import type {
  GlobalStoreField,
  GlobalStoreAction,
  CustomTypeItem,
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
    expect(names).toContain("set | replace");

    const populate = manipulators.find((m) => m.name === "populate");
    expect(populate?.category).toBe("builtin");
    expect(populate?.isCustomized).toBe(false);

    const reset = manipulators.find((m) => m.name === "reset");
    expect(reset?.category).toBe("builtin");
    expect(reset?.isCustomized).toBe(false);

    const countSetter = manipulators.find((m) => m.targetFieldName === "count" && m.actionType === "set");
    expect(countSetter).toBeDefined();
    expect(countSetter?.name).toBe("set | replace");
    expect(countSetter?.category).toBe("auto_setter");
    expect(countSetter?.code).toBeDefined();
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

    // setUser setter should still appear as default auto_setter
    const userSetter = manipulators.find((m) => m.targetFieldName === "user" && m.actionType === "set");
    expect(userSetter).toBeDefined();
    expect(userSetter?.name).toBe("set | replace");
    expect(userSetter?.isCustomized).toBe(false);
  });

  it("respects disabledDefaultManipulators", () => {
    const manipulators = getStateManipulators(sampleFields, [], ["reset", "setCount", "set"]);

    const names = manipulators.map((m) => m.name);
    expect(names).not.toContain("reset");
    expect(manipulators.some((m) => m.targetFieldName === "count" && m.actionType === "set")).toBe(false);
    expect(names).toContain("populate");
  });

  it("respects deletedDefaultManipulators (omitted completely)", () => {
    const manipulators = getStateManipulators(sampleFields, [], [], ["populate", "reset", "setCount", "set"]);

    const names = manipulators.map((m) => m.name);
    expect(names).not.toContain("populate");
    expect(names).not.toContain("reset");
    expect(manipulators.some((m) => m.targetFieldName === "count" && m.actionType === "set")).toBe(false);
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

  it("does not suppress or replace default setter when a custom action targets that field", () => {
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

    // Both appendConversations AND setter must exist!
    expect(names).toContain("appendConversations");
    const countSetter = manipulators.find((m) => m.targetFieldName === "count" && m.actionType === "set");
    expect(countSetter).toBeDefined();
    expect(countSetter?.name).toBe("set | replace");
    expect(countSetter?.category).toBe("auto_setter");

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
      name: "increment | add",
      label: "increment | add",
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

    it("automatically adds append and pop as default manipulators when a field is an array", () => {
      const fieldsWithArray: GlobalStoreField[] = [
        { id: "f1", name: "count", type: "number", defaultValue: 0 },
        { id: "f2", name: "messages", type: "array", defaultValue: [] },
      ];

      const manipulators = getStateManipulators(fieldsWithArray, []);
      const names = manipulators.map((m) => m.name);

      expect(names).toContain("set | replace");
      expect(names).toContain("append | add");
      expect(names).toContain("pop");

      const appendManipulator = manipulators.find((m) => m.targetFieldName === "messages" && m.actionType === "append");
      expect(appendManipulator?.name).toBe("append | add");
      expect(appendManipulator?.actionType).toBe("append");
      expect(appendManipulator?.defaultManipulatorType).toBe("append");
      expect(appendManipulator?.code).toBeDefined();

      const popManipulator = manipulators.find((m) => m.targetFieldName === "messages" && m.defaultManipulatorType === "pop");
      expect(popManipulator?.name).toBe("pop");
      expect(popManipulator?.actionType).toBe("remove");
      expect(popManipulator?.defaultManipulatorType).toBe("pop");
      expect(popManipulator?.code).toBeDefined();

      // Test execution with applyManipulator
      let state: Record<string, any> = { count: 0, messages: ["hello"] };

      const appendRes = applyManipulator({
        manipulator: appendManipulator!,
        payload: "world",
        currentState: state,
        fields: fieldsWithArray,
      });
      expect(appendRes.newState.messages).toEqual(["hello", "world"]);

      const popRes = applyManipulator({
        manipulator: popManipulator!,
        payload: undefined,
        currentState: appendRes.newState,
        fields: fieldsWithArray,
      });
      expect(popRes.newState.messages).toEqual(["hello"]);
    });

    it("generates full action suite (including stream, prepend, remove, update) for message array and executes custom reducer", () => {
      const userMessageReducer = `(prev, next) => {
  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const list = Array.isArray(prev) ? prev : [];
  const action = Array.isArray(next) ? "set" : (isObj(next) ? next.action : undefined);

  let payload = next;
  if (isObj(next)) {
    if ("value" in next) payload = next.value;
    else if ("action" in next) {
      const { action: _a, index: _i, ...rest } = next;
      payload = rest;
    }
  }

  const toItems = (v) =>
    v == null ? [] :
    Array.isArray(v) ? v :
    isObj(v) && Object.keys(v).length === 0 ? [] :
    [v];

  if (action === "reset" || action === "clear") {
    return list.length === 0 ? list : [];
  }
  if (action === "set" || action === "replace") {
    return toItems(payload);
  }
  if (action === "append" || action === "add") {
    const items = toItems(payload);
    return items.length ? [...list, ...items] : list;
  }
  if (action === "prepend") {
    const items = toItems(payload);
    return items.length ? [...items, ...list] : list;
  }
  if (action === "pop") {
    return list.length ? list.slice(0, -1) : list;
  }
  if (action === "remove" || action === "filter") {
    const target = isObj(next) && "id" in next ? next.id : isObj(payload) && "id" in payload ? payload.id : payload;
    return list.filter((item) => (isObj(item) && "id" in item ? item.id !== target : item !== target));
  }
  if (action === "update" || action === "upsert") {
    const patch = payload;
    const targetId = isObj(patch) ? patch.id : undefined;
    if (!isObj(patch) || targetId === undefined) return list;
    const i = list.findIndex((m) => isObj(m) && m.id === targetId);
    if (i === -1) return [...list, patch];
    return list.map((m, j) => (j === i ? { ...m, ...patch } : m));
  }
  if (action === "stream" || action === "append_stream" || action === "chunk") {
    const src = isObj(next) ? next : {};
    const delta = src.delta ?? src.chunk ?? src.text ?? (typeof src.value === "string" ? src.value : "");
    const role = src.role ?? "assistant";
    let i = -1;
    if (src.id !== undefined) {
      i = list.findIndex((m) => isObj(m) && m.id === src.id);
    } else {
      const last = list[list.length - 1];
      if (isObj(last) && last.role === role && last.streaming === true) i = list.length - 1;
    }
    if (src.done) {
      if (i === -1 || list[i].streaming === false) return list;
      return list.map((m, j) => (j === i ? { ...m, streaming: false } : m));
    }
    if (typeof delta !== "string" || delta === "") return list;
    if (i === -1) {
      return [...list, { id: src.id ?? "msg_1", role, content: delta, streaming: true }];
    }
    const target = list[i];
    return list.map((m, j) => (j === i ? { ...m, content: (m.content || "") + delta, streaming: true } : m));
  }
  return list;
};`;

      const chatStoreFields: GlobalStoreField[] = [
        { id: "f1", name: "user_message", type: "string", defaultValue: "" },
        {
          id: "f2",
          name: "chatHistory",
          type: "Message[]",
          isArray: true,
          defaultValue: [],
          customReducerCode: userMessageReducer,
        },
      ];

      const manipulators = getStateManipulators(chatStoreFields, []);
      const chatActions = manipulators.filter((m) => m.targetFieldName === "chatHistory");
      const chatActionNames = chatActions.map((m) => m.name);

      // Verify that actions represent the reducer branches
      expect(chatActionNames).toContain("set | replace");
      expect(chatActionNames).toContain("append | add");
      expect(chatActionNames).toContain("prepend");
      expect(chatActionNames).toContain("pop");
      expect(chatActionNames).toContain("remove | filter");
      expect(chatActionNames).toContain("update | upsert");
      expect(chatActionNames).toContain("stream | chunk");
      expect(chatActionNames).toContain("reset | clear");

      // Verify each action contains its reducer code block
      const streamManipulator = chatActions.find((m) => m.actionType === "stream");
      expect(streamManipulator).toBeDefined();
      expect(streamManipulator?.name).toBe("stream | chunk");
      expect(streamManipulator?.code).toContain('action === "stream"');

      // Execute stream chunk 1
      let currentState: Record<string, any> = { user_message: "", chatHistory: [] };
      const streamRes1 = applyManipulator({
        manipulator: streamManipulator!,
        payload: { id: "a1", delta: "Hel", role: "assistant" },
        currentState,
        fields: chatStoreFields,
      });
      expect(streamRes1.error).toBeUndefined();
      expect(streamRes1.newState.chatHistory).toEqual([
        { id: "a1", role: "assistant", content: "Hel", streaming: true },
      ]);

      // Execute stream chunk 2
      const streamRes2 = applyManipulator({
        manipulator: streamManipulator!,
        payload: { delta: "lo!" },
        currentState: streamRes1.newState,
        fields: chatStoreFields,
      });
      expect(streamRes2.newState.chatHistory).toEqual([
        { id: "a1", role: "assistant", content: "Hello!", streaming: true },
      ]);

      // Execute stream done
      const streamRes3 = applyManipulator({
        manipulator: streamManipulator!,
        payload: { id: "a1", done: true },
        currentState: streamRes2.newState,
        fields: chatStoreFields,
      });
      expect(streamRes3.newState.chatHistory).toEqual([
        { id: "a1", role: "assistant", content: "Hello!", streaming: false },
      ]);

      // Execute update
      const updateManipulator = manipulators.find((m) => m.targetFieldName === "chatHistory" && m.actionType === "update")!;
      const updateRes = applyManipulator({
        manipulator: updateManipulator,
        payload: { id: "a1", content: "Hello World (Edited)" },
        currentState: streamRes3.newState,
        fields: chatStoreFields,
      });
      expect(updateRes.newState.chatHistory).toEqual([
        { id: "a1", role: "assistant", content: "Hello World (Edited)", streaming: false },
      ]);

      // Execute remove
      const removeManipulator = manipulators.find((m) => m.targetFieldName === "chatHistory" && m.actionType === "remove")!;
      const removeRes = applyManipulator({
        manipulator: removeManipulator,
        payload: { id: "a1" },
        currentState: updateRes.newState,
        fields: chatStoreFields,
      });
      expect(removeRes.newState.chatHistory).toEqual([]);
    });
  });

  describe("isManipulatorForField and state variable filtering", () => {
    const multiFields: GlobalStoreField[] = [
      { id: "f-msg", name: "message", type: "string" },
      { id: "f-status", name: "statusText", type: "string" },
      { id: "f-msgs", name: "messages", type: "ChatMessage[]", isArray: true },
      { id: "f-input", name: "chatInput", type: "string" },
    ];

    it("correctly matches manipulators to their respective state variables without cross-matching", () => {
      const manipulators = getStateManipulators(multiFields, []);

      // Filter actions for 'message'
      const messageField = multiFields.find((f) => f.name === "message")!;
      const messageActions = manipulators.filter((m) => isManipulatorForField(m, messageField));
      const messageActionNames = messageActions.map((m) => m.name);

      expect(messageActionNames).toContain("set | replace");
      expect(messageActionNames).toContain("append | concat");
      expect(messageActionNames).toContain("prepend");
      expect(messageActionNames).toContain("reset | clear");
      // Must NOT contain array-only actions like stream or pop
      expect(messageActionNames).not.toContain("stream | chunk");
      expect(messageActionNames).not.toContain("pop");

      // Filter actions for 'messages' (array)
      const messagesField = multiFields.find((f) => f.name === "messages")!;
      const messagesActions = manipulators.filter((m) => isManipulatorForField(m, messagesField));
      const messagesActionNames = messagesActions.map((m) => m.name);

      expect(messagesActionNames).toContain("set | replace");
      expect(messagesActionNames).toContain("append | add");
      expect(messagesActionNames).toContain("prepend");
      expect(messagesActionNames).toContain("pop");
      expect(messagesActionNames).toContain("remove | filter");
      expect(messagesActionNames).toContain("update | upsert");
      expect(messagesActionNames).toContain("stream | chunk");
      expect(messagesActionNames).toContain("reset | clear");

      // Filter actions for 'chatInput'
      const chatInputField = multiFields.find((f) => f.name === "chatInput")!;
      const chatInputActions = manipulators.filter((m) => isManipulatorForField(m, chatInputField));
      const chatInputActionNames = chatInputActions.map((m) => m.name);

      expect(chatInputActionNames).toContain("set | replace");
      expect(chatInputActionNames).toContain("append | concat");
      expect(chatInputActionNames).toContain("reset | clear");

      // Verify store-wide built-ins (reset, populate) do not falsely attach to any specific variable
      const resetManipulator = manipulators.find((m) => m.name === "reset")!;
      expect(isManipulatorForField(resetManipulator, messageField)).toBe(false);
      expect(isManipulatorForField(resetManipulator, messagesField)).toBe(false);

      const populateManipulator = manipulators.find((m) => m.name === "populate")!;
      expect(isManipulatorForField(populateManipulator, messageField)).toBe(false);
      expect(isManipulatorForField(populateManipulator, messagesField)).toBe(false);
    });

    it("successfully mutates state when setMessages is executed with array payload", () => {
      const manipulators = getStateManipulators(multiFields, []);
      const setMessagesManipulator = manipulators.find((m) => m.targetFieldName === "messages" && m.actionType === "set")!;
      expect(setMessagesManipulator).toBeDefined();

      const payload = [{ id: "msg_1", role: "user", content: "Hello" }];
      const res = applyManipulator({
        manipulator: setMessagesManipulator,
        payload,
        currentState: { message: "", statusText: "", messages: [], chatInput: "" },
        fields: multiFields,
      });

      expect(res.error).toBeUndefined();
      expect(res.newState.messages).toEqual(payload);
      expect(res.newState.messages).toHaveLength(1);
    });

    it("infers default payload structure from custom type fields instead of 'Updated string'", () => {
      const customMessageType: CustomTypeItem = {
        id: "type-msg",
        name: "Message",
        kind: "interface",
        fields: [
          { id: "f-id", name: "id", type: "string" },
          { id: "f-role", name: "role", type: "string", enumValues: ["user", "assistant", "system"] },
          { id: "f-content", name: "content", type: "string" },
        ],
      };

      const messageField: GlobalStoreField = {
        id: "f-msg-single",
        name: "message",
        type: "Message",
        customTypeId: "type-msg",
      };

      const manipulators = getStateManipulators([messageField], [], [], [], [customMessageType]);
      const setMessage = manipulators.find((m) => m.targetFieldName === "message" && m.actionType === "set")!;
      expect(setMessage).toBeDefined();

      // defaultPayload must be an object with the inferred type schema fields
      expect(setMessage.defaultPayload).toBeTypeOf("object");
      expect(setMessage.defaultPayload).not.toBe("Updated string");
      expect(isJsonObject(setMessage.defaultPayload)).toBe(true);
      if (isJsonObject(setMessage.defaultPayload)) {
        expect(setMessage.defaultPayload).toHaveProperty("id");
        expect(setMessage.defaultPayload).toHaveProperty("role");
        expect(setMessage.defaultPayload).toHaveProperty("content");
        expect(setMessage.defaultPayload.role).toBe("user");
      }

      // Verify updateMessage infers patch object
      const updateMessage = manipulators.find((m) => m.targetFieldName === "message" && m.actionType === "update");
      if (updateMessage) {
        expect(updateMessage.defaultPayload).toBeTypeOf("object");
      }

      // Verify execution mutates the variable with the inferred typed payload
      const initialSandbox = formatInitialFieldValue(messageField, [customMessageType]);
      expect(initialSandbox).toEqual({ id: "", role: "user", content: "" });

      const res = applyManipulator({
        manipulator: setMessage,
        payload: setMessage.defaultPayload,
        currentState: { message: initialSandbox },
        fields: [messageField],
      });
      expect(res.error).toBeUndefined();
      expect(res.newState.message).toEqual(setMessage.defaultPayload);
    });

    it("infers sample payload from customReducerCode when availableCustomTypes is not provided", () => {
      const fieldWithReducer: GlobalStoreField = {
        id: "f-custom-item",
        name: "userProfile",
        type: "UserProfile",
        customReducerCode: `(prev, next) => {
          const initial = {
            id: "",
            username: "",
            email: "",
            isActive: false,
          };
          return { ...initial, ...next };
        }`,
      };

      const sample = inferSampleValueForField(fieldWithReducer, [], false);
      expect(isJsonObject(sample)).toBe(true);
      if (isJsonObject(sample)) {
        expect(sample).toHaveProperty("id");
        expect(sample).toHaveProperty("username");
        expect(sample).toHaveProperty("email");
        expect(sample).toHaveProperty("isActive");
        expect(sample.isActive).toBe(true); // sample boolean is true
      }
    });
  });
    it("dynamically removes an action from the testing tab when it is removed from the variable reducer", () => {
      const reducerWithPopAndStream = `(prev, next) => {
        const action = next?.action;
        if (action === "set" || action === "replace") return next.value;
        if (action === "append" || action === "add") return [...prev, next.value];
        if (action === "pop") return prev.slice(0, -1);
        if (action === "stream" || action === "chunk") return prev;
        return prev;
      };`;

      const field: GlobalStoreField = {
        id: "f-dyn",
        name: "messages",
        type: "Message[]",
        isArray: true,
        customReducerCode: reducerWithPopAndStream,
      };

      // 1. Initially has pop and stream
      const initialManipulators = getStateManipulators([field], []);
      const initialNames = initialManipulators.filter((m) => m.targetFieldName === "messages").map((m) => m.name);
      expect(initialNames).toContain("pop");
      expect(initialNames).toContain("stream | chunk");
      expect(initialNames).toContain("set | replace");
      expect(initialNames).toContain("append | add");

      // 2. Remove 'pop' and 'stream' from the reducer code
      const reducerWithoutPopOrStream = `(prev, next) => {
        const action = next?.action;
        if (action === "set" || action === "replace") return next.value;
        if (action === "append" || action === "add") return [...prev, next.value];
        return prev;
      };`;

      const updatedField: GlobalStoreField = {
        ...field,
        customReducerCode: reducerWithoutPopOrStream,
      };

      const updatedManipulators = getStateManipulators([updatedField], []);
      const updatedNames = updatedManipulators.filter((m) => m.targetFieldName === "messages").map((m) => m.name);

      // 'pop' and 'stream | chunk' are IMMEDIATELY GONE from testing tab!
      expect(updatedNames).not.toContain("pop");
      expect(updatedNames).not.toContain("stream | chunk");
      expect(updatedNames).toContain("set | replace");
      expect(updatedNames).toContain("append | add");

      // 3. Add a custom action 'archive | soft_delete' to the reducer
      const reducerWithCustomAction = `(prev, next) => {
        const action = next?.action;
        if (action === "set" || action === "replace") return next.value;
        if (action === "archive" || action === "soft_delete") return [];
        return prev;
      };`;

      const fieldWithCustom: GlobalStoreField = {
        ...field,
        customReducerCode: reducerWithCustomAction,
      };

      const customManipulators = getStateManipulators([fieldWithCustom], []);
      const customNames = customManipulators.filter((m) => m.targetFieldName === "messages").map((m) => m.name);
      expect(customNames).toContain("archive | soft_delete");

      const archiveAction = customManipulators.find((m) => m.name === "archive | soft_delete");
      expect(archiveAction?.code).toContain('action === "archive"');
    });

});

