import {
  GlobalStoreField,
  GlobalStoreAction,
  Parameter,
  JsonValue,
} from "@workspace/canvas/types";
import { StoreState, isJsonObject, RuntimeScopeValue } from "./core";

export function formatInitialFieldValue(field: GlobalStoreField): JsonValue {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  switch (field.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    case "string":
    default:
      return "";
  }
}

export interface StateManipulator {
  id: string;
  name: string;
  label: string;
  category: "custom_action" | "standard_action" | "auto_setter" | "builtin";
  targetFieldId?: string;
  targetFieldName?: string;
  parameters?: Parameter[];
  code?: string;
  actionType?: GlobalStoreAction["actionType"] | "prepend" | "stream" | "toggle" | "increment" | "decrement" | "update";
  defaultPayload?: JsonValue | undefined;
  defaultManipulatorType?:
    | "populate"
    | "reset"
    | "setter"
    | "mutate"
    | "append"
    | "pop"
    | "prepend"
    | "remove"
    | "update"
    | "stream"
    | "increment"
    | "decrement"
    | "toggle"
    | (string & {});
  isCustomized?: boolean;
}

/**
 * Normalizes an action name or alias into its canonical action type.
 */
export function toCanonicalStoreAction(action: string): string {
  const norm = action.toLowerCase().trim();
  switch (norm) {
    case "set":
    case "replace":
      return "set";
    case "append":
    case "add":
      return "append";
    case "prepend":
      return "prepend";
    case "pop":
      return "pop";
    case "remove":
    case "filter":
      return "remove";
    case "update":
    case "upsert":
    case "patch":
      return "update";
    case "stream":
    case "append_stream":
    case "chunk":
      return "stream";
    case "reset":
    case "clear":
      return "reset";
    case "increment":
      return "increment";
    case "decrement":
    case "subtract":
      return "decrement";
    case "toggle":
      return "toggle";
    default:
      return norm;
  }
}

/**
 * Fast regex parser extracting action names from reducer JavaScript/TypeScript code.
 */
export function extractActionsFromReducerCode(code?: string): string[] {
  if (!code || typeof code !== "string") return [];
  const actions = new Set<string>();

  // Pattern 1: action === "name" or .action === "name"
  const eqRegex = /(?:action|\.action)\s*===?\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = eqRegex.exec(code)) !== null) {
    const act = match[1]?.trim();
    if (act && act !== "default" && act !== "") {
      actions.add(act);
    }
  }

  // Pattern 2: "name" === action or "name" === next?.action
  const revEqRegex = /["']([^"']+)["']\s*===?\s*(?:action|\.action)/g;
  while ((match = revEqRegex.exec(code)) !== null) {
    const act = match[1]?.trim();
    if (act && act !== "default" && act !== "") {
      actions.add(act);
    }
  }

  // Pattern 3: case "name":
  const caseRegex = /case\s*["']([^"']+)["']\s*:/g;
  while ((match = caseRegex.exec(code)) !== null) {
    const act = match[1]?.trim();
    if (act && act !== "default" && act !== "") {
      actions.add(act);
    }
  }

  // Pattern 4: ["reset", "clear"].includes(action)
  const includesRegex = /\[([^\]]+)\]\.includes\(\s*(?:action|\.action)\s*\)/g;
  while ((match = includesRegex.exec(code)) !== null) {
    const inner = match[1];
    if (!inner) continue;
    const strRegex = /["']([^"']+)["']/g;
    let sm: RegExpExecArray | null;
    while ((sm = strRegex.exec(inner)) !== null) {
      const act = sm[1]?.trim();
      if (act && act !== "default" && act !== "") {
        actions.add(act);
      }
    }
  }

  return Array.from(actions);
}

/**
 * Returns supported action types handled by the single reducer of a state variable.
 */
export function getSupportedActionsForType(type?: string, isArray?: boolean, name?: string): string[] {
  const clean = (type || "string").toLowerCase().trim();
  const isMessage =
    clean.includes("message") ||
    clean.includes("chat") ||
    clean === "messages" ||
    clean === "chatmessage" ||
    Boolean(name && (name.toLowerCase().includes("message") || name.toLowerCase().includes("chat")));

  if (isArray || clean.endsWith("[]") || clean === "array") {
    const base = ["set", "append", "prepend", "pop", "remove", "update", "reset"];
    if (isMessage) return [...base, "stream"];
    return base;
  }
  switch (clean) {
    case "number":
      return ["set", "increment", "decrement", "reset"];
    case "boolean":
      return ["set", "toggle", "reset"];
    case "string":
      return ["set", "append", "prepend", "reset"];
    case "object":
    default:
      return ["set", "update", "reset"];
  }
}

export function getStateManipulators(
  fields: GlobalStoreField[],
  actions: GlobalStoreAction[],
  disabledDefaultManipulators: string[] = [],
  deletedDefaultManipulators: string[] = [],
): StateManipulator[] {
  const list: StateManipulator[] = [];
  const disabledSet = new Set([
    ...(disabledDefaultManipulators || []),
    ...(deletedDefaultManipulators || []),
  ]);

  // 1. Check customized / user declared actions
  actions.forEach((act) => {
    const targetField = fields.find((f) => f.id === act.targetFieldId);
    let defaultPayload: JsonValue | undefined = "";

    if (act.parameters && act.parameters.length > 0) {
      const mockObj: Record<string, JsonValue> = {};
      act.parameters.forEach((p) => {
        if (p.type === "number") mockObj[p.name] = 1;
        else if (p.type === "boolean") mockObj[p.name] = true;
        else if (p.type === "array") mockObj[p.name] = [];
        else if (p.type === "object") mockObj[p.name] = { id: "item_1", name: "Sample Item", price: 29.99 };
        else mockObj[p.name] = `sample_${p.name}`;
      });
      defaultPayload = mockObj;
    } else if (act.actionType === "populate" || act.name.toLowerCase() === "populate" || act.name.toLowerCase() === "load") {
      defaultPayload = fields.reduce<StoreState>(
        (acc, f) => ({ ...acc, [f.name]: formatInitialFieldValue(f) }),
        {},
      );
    } else if (act.actionType === "reset" || act.name.toLowerCase() === "reset") {
      defaultPayload = undefined;
    } else if (targetField) {
      if (targetField.type === "number") defaultPayload = 1;
      else if (targetField.type === "boolean") defaultPayload = true;
      else if (targetField.type === "array") defaultPayload = [{ id: "item_1", title: "New Item", price: 19.99 }];
      else if (targetField.type === "object") defaultPayload = { key: "value" };
      else defaultPayload = "Sample Value";
    }

    const isPopulateOverride =
      act.actionType === "populate" ||
      act.name.toLowerCase() === "populate" ||
      act.name.toLowerCase() === "load" ||
      act.defaultManipulatorType === "populate";

    const isResetOverride =
      act.actionType === "reset" ||
      act.name.toLowerCase() === "reset" ||
      act.defaultManipulatorType === "reset";

    const isSetterOverride =
      act.defaultManipulatorType === "setter" ||
      Boolean(targetField && act.name.toLowerCase() === `set${targetField.name.toLowerCase()}`);

    const isAppendOverride =
      act.defaultManipulatorType === "append" ||
      Boolean(
        targetField &&
          (targetField.isArray || targetField.type === "array" || targetField.type?.endsWith("[]")) &&
          (act.name.toLowerCase() === `append${targetField.name.toLowerCase()}` || act.actionType === "append"),
      );

    const isPopOverride =
      act.defaultManipulatorType === "pop" ||
      Boolean(
        targetField &&
          (targetField.isArray || targetField.type === "array" || targetField.type?.endsWith("[]")) &&
          act.name.toLowerCase() === `pop${targetField.name.toLowerCase()}`,
      );

    const defaultManipulatorType = isPopulateOverride
      ? "populate"
      : isResetOverride
      ? "reset"
      : isSetterOverride
      ? "setter"
      : isAppendOverride
      ? "append"
      : isPopOverride
      ? "pop"
      : undefined;

    // Check if this default manipulator was explicitly disabled
    if (defaultManipulatorType && disabledSet.has(defaultManipulatorType)) {
      return;
    }

    list.push({
      id: act.id,
      name: act.name,
      label: `${act.name}()`,
      category: defaultManipulatorType
        ? defaultManipulatorType === "setter"
          ? "auto_setter"
          : "builtin"
        : act.actionType === "custom"
        ? "custom_action"
        : "standard_action",
      targetFieldId: act.targetFieldId,
      targetFieldName: targetField?.name,
      parameters: act.parameters,
      code: act.code,
      actionType: act.actionType,
      defaultPayload,
      defaultManipulatorType,
      isCustomized: Boolean(defaultManipulatorType),
    });
  });

  // 2. Built-in actions (reset, populate) if not overridden and not disabled
  const hasPopulate = list.some(
    (m) => m.defaultManipulatorType === "populate" || m.name.toLowerCase() === "populate" || m.name.toLowerCase() === "load"
  );
  const hasReset = list.some(
    (m) => m.defaultManipulatorType === "reset" || m.name.toLowerCase() === "reset"
  );

  if (!hasReset && !disabledSet.has("reset")) {
    list.push({
      id: "builtin-reset",
      name: "reset",
      label: "reset()",
      category: "builtin",
      actionType: "reset",
      defaultManipulatorType: "reset",
      defaultPayload: undefined,
      isCustomized: false,
    });
  }

  if (!hasPopulate && !disabledSet.has("populate") && !disabledSet.has("load")) {
    list.push({
      id: "builtin-populate",
      name: "populate",
      label: "populate(data)",
      category: "builtin",
      actionType: "populate",
      defaultManipulatorType: "populate",
      defaultPayload: fields.reduce<StoreState>(
        (acc, f) => ({ ...acc, [f.name]: formatInitialFieldValue(f) }),
        {},
      ),
      isCustomized: false,
    });
  }

  // 3. Field manipulators: Auto-generate full action suites for each state variable
  fields.forEach((f) => {
    const capitalized = f.name.charAt(0).toUpperCase() + f.name.slice(1);
    const isArr = Boolean(f.isArray || f.type === "array" || f.type?.endsWith("[]"));
    const isMsg = Boolean(
      f.type?.toLowerCase().includes("message") ||
      f.type?.toLowerCase().includes("chat") ||
      f.name.toLowerCase().includes("message") ||
      f.name.toLowerCase().includes("chat"),
    );

    const standardActions = getSupportedActionsForType(f.type, isArr, f.name);
    const fromCode = f.customReducerCode ? extractActionsFromReducerCode(f.customReducerCode) : [];
    const declaredActions = f.actions || [];

    const rawCandidates = [...standardActions, ...declaredActions, ...fromCode];
    const availableCanonicals = new Set<string>();
    rawCandidates.forEach((raw) => {
      if (raw && raw !== "default" && raw !== "") {
        availableCanonicals.add(toCanonicalStoreAction(raw));
      }
    });

    // Ensure array variables always have base array operations available
    if (isArr) {
      availableCanonicals.add("set");
      availableCanonicals.add("append");
      availableCanonicals.add("prepend");
      availableCanonicals.add("pop");
      availableCanonicals.add("remove");
      availableCanonicals.add("update");
      availableCanonicals.add("reset");
      if (isMsg) availableCanonicals.add("stream");
    }

    const actionOrder = [
      "set",
      "append",
      "prepend",
      "pop",
      "remove",
      "update",
      "stream",
      "increment",
      "decrement",
      "toggle",
      "reset",
    ];

    const sortedCanonicals: string[] = [];
    actionOrder.forEach((act) => {
      if (availableCanonicals.has(act)) {
        sortedCanonicals.push(act);
        availableCanonicals.delete(act);
      }
    });
    availableCanonicals.forEach((customAct) => {
      sortedCanonicals.push(customAct);
    });

    sortedCanonicals.forEach((act) => {
      let actionName = `${act}${capitalized}`;
      let label = `${actionName}()`;
      let actionType: StateManipulator["actionType"] = "custom";
      let defaultManipulatorType: StateManipulator["defaultManipulatorType"] = act;
      let defaultPayload: JsonValue | undefined = undefined;

      switch (act) {
        case "set": {
          actionName = `set${capitalized}`;
          label = `${actionName}(value)`;
          actionType = "set";
          defaultManipulatorType = "setter";
          if (f.type === "number") defaultPayload = 100;
          else if (f.type === "boolean") defaultPayload = true;
          else if (isArr) {
            defaultPayload = isMsg
              ? [{ id: "msg_1", role: "user", content: "Hello" }]
              : [{ id: "1", title: "Example" }];
          } else if (f.type === "object") defaultPayload = { active: true };
          else defaultPayload = "Updated string";
          break;
        }
        case "append": {
          actionName = `append${capitalized}`;
          label = `${actionName}(item)`;
          actionType = "append";
          defaultManipulatorType = "append";
          if (isMsg) {
            defaultPayload = { id: `msg_${Date.now()}`, role: "user", content: "Hello world" };
          } else if (isArr) {
            defaultPayload = { id: "item_new", title: "New Item" };
          } else if (f.type === "string") {
            defaultPayload = " (appended)";
          } else {
            defaultPayload = "new_item";
          }
          break;
        }
        case "prepend": {
          actionName = `prepend${capitalized}`;
          label = `${actionName}(item)`;
          actionType = "prepend";
          defaultManipulatorType = "prepend";
          if (isMsg) {
            defaultPayload = { id: "msg_0", role: "system", content: "You are a helpful assistant." };
          } else if (isArr) {
            defaultPayload = { id: "item_first", title: "First Item" };
          } else if (f.type === "string") {
            defaultPayload = "[PRE] ";
          } else {
            defaultPayload = "first_item";
          }
          break;
        }
        case "pop": {
          actionName = `pop${capitalized}`;
          label = `${actionName}()`;
          actionType = "remove";
          defaultManipulatorType = "pop";
          defaultPayload = undefined;
          break;
        }
        case "remove": {
          actionName = `remove${capitalized}`;
          label = `${actionName}(idOrIndex)`;
          actionType = "remove";
          defaultManipulatorType = "remove";
          if (isMsg) {
            defaultPayload = { id: "msg_1" };
          } else if (isArr) {
            defaultPayload = { id: "1" };
          } else {
            defaultPayload = 0;
          }
          break;
        }
        case "update": {
          actionName = `update${capitalized}`;
          label = `${actionName}(patch)`;
          actionType = "update";
          defaultManipulatorType = "update";
          if (isMsg) {
            defaultPayload = { id: "msg_1", content: "Updated message content" };
          } else if (isArr) {
            defaultPayload = { id: "1", title: "Updated Item Title" };
          } else if (f.type === "object") {
            defaultPayload = { status: "updated" };
          } else {
            defaultPayload = { value: "updated" };
          }
          break;
        }
        case "stream": {
          actionName = `stream${capitalized}`;
          label = `${actionName}(delta)`;
          actionType = "stream";
          defaultManipulatorType = "stream";
          defaultPayload = { delta: "Hello streaming message chunk!", role: "assistant" };
          break;
        }
        case "increment": {
          actionName = `increment${capitalized}`;
          label = `${actionName}(amount)`;
          actionType = "increment";
          defaultManipulatorType = "increment";
          defaultPayload = { amount: 1 };
          break;
        }
        case "decrement": {
          actionName = `decrement${capitalized}`;
          label = `${actionName}(amount)`;
          actionType = "decrement";
          defaultManipulatorType = "decrement";
          defaultPayload = { amount: 1 };
          break;
        }
        case "toggle": {
          actionName = `toggle${capitalized}`;
          label = `${actionName}()`;
          actionType = "toggle";
          defaultManipulatorType = "toggle";
          defaultPayload = undefined;
          break;
        }
        case "reset": {
          actionName = `reset${capitalized}`;
          label = `${actionName}()`;
          actionType = "reset";
          defaultManipulatorType = "reset";
          defaultPayload = undefined;
          break;
        }
        default: {
          actionName = `${act}${capitalized}`;
          label = `${actionName}(payload)`;
          actionType = "custom";
          defaultManipulatorType = act;
          defaultPayload = { action: act };
          break;
        }
      }

      const isActDisabled =
        disabledSet.has(actionName) ||
        disabledSet.has(`${act}-${f.id}`) ||
        (act === "set" && disabledSet.has(`setter-${f.id}`));

      const isActCustomized = list.some(
        (m) =>
          (m.targetFieldId === f.id &&
            (m.defaultManipulatorType === act || (act === "set" && m.defaultManipulatorType === "setter"))) ||
          m.name.toLowerCase() === actionName.toLowerCase(),
      );

      if (!isActDisabled && !isActCustomized) {
        const isCustomAction =
          act !== "set" &&
          (Boolean(f.customReducerCode && f.customReducerCode.trim()) || fromCode.includes(act));

        list.push({
          id: `${act === "set" ? "setter" : act}-${f.id}`,
          name: actionName,
          label,
          category:
            act === "set"
              ? "auto_setter"
              : isCustomAction
              ? "custom_action"
              : "standard_action",
          targetFieldId: f.id,
          targetFieldName: f.name,
          actionType,
          defaultManipulatorType,
          defaultPayload,
          isCustomized: false,
        });
      }
    });
  });

  return list;
}

export function applyManipulator({
  manipulator,
  payload,
  currentState,
  fields,
}: {
  manipulator: StateManipulator;
  payload: JsonValue | undefined;
  currentState: StoreState;
  fields: GlobalStoreField[];
}): { newState: StoreState; error?: string } {
  try {
    let nextState: StoreState = { ...currentState };

    // Initial state map based on field definitions
    const initialState: StoreState = {};
    fields.forEach((f) => {
      initialState[f.name] = formatInitialFieldValue(f);
    });

    // If custom code is provided on ANY manipulator, execute it directly in a rich runtime scope
    if (manipulator.code && manipulator.code.trim()) {
      let trimmedCode = manipulator.code.trim();

      // If code starts with an action property label e.g. "login: ...", strip the leading "actionName:"
      const labelMatch = trimmedCode.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*([\s\S]+)$/);
      if (labelMatch && labelMatch[1]) {
        trimmedCode = labelMatch[1].trim();
      }

      const setFn = (updater: StoreState | ((prev: StoreState) => StoreState)) => {
        const patch = typeof updater === "function" ? updater(nextState) : updater;
        if (patch && typeof patch === "object") {
          nextState = { ...nextState, ...patch };
        }
      };
      const getFn = () => nextState;

      // Provide standard Zustand scope and helper aliases
      const scopeKeys: string[] = ["set", "get", "payload", "initialState", "state"];
      const scopeValues: RuntimeScopeValue[] = [setFn, getFn, payload, initialState, nextState];

      // Provide aliases for common parameter conventions
      ["item", "value", "data"].forEach((alias) => {
        if (!scopeKeys.includes(alias)) {
          scopeKeys.push(alias);
          scopeValues.push(payload);
        }
      });

      const argValues: (JsonValue | undefined)[] = [];

      // If action has declared parameters (e.g. item, qty, id, name)
      if (manipulator.parameters && manipulator.parameters.length > 0) {
        manipulator.parameters.forEach((param, idx) => {
          let val: JsonValue | undefined = undefined;
          if (isJsonObject(payload) && param.name in payload) {
            val = payload[param.name];
          } else if (Array.isArray(payload) && idx < payload.length) {
            val = payload[idx];
          } else if (manipulator.parameters?.length === 1) {
            val = payload;
          }
          argValues.push(val);

          if (!scopeKeys.includes(param.name)) {
            scopeKeys.push(param.name);
            scopeValues.push(val);
          }
        });
      } else {
        argValues.push(payload);
      }

      // If payload is an object, unpack its top-level keys into scope so code can access them directly
      if (isJsonObject(payload)) {
        Object.entries(payload).forEach(([k, v]) => {
          if (!scopeKeys.includes(k) && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)) {
            scopeKeys.push(k);
            scopeValues.push(v);
          }
        });
      }

      // Detect if code is an arrow function or function expression e.g. (name) => set(...) or function(...)
      const isArrowOrFunc =
        /^(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/.test(trimmedCode) ||
        /^function\s*\(/.test(trimmedCode);

      if (isArrowOrFunc) {
        const fnEvaluator = new Function(...scopeKeys, `return (${trimmedCode})`);
        const fn = fnEvaluator(...scopeValues);
        if (typeof fn === "function") {
          const res = fn(...argValues);
          if (res && typeof res === "object") {
            nextState = { ...nextState, ...res };
          }
        }
      } else {
        const runner = new Function(...scopeKeys, trimmedCode);
        const res = runner(...scopeValues);
        if (typeof res === "function") {
          const fnRes = res(...argValues);
          if (fnRes && typeof fnRes === "object") {
            nextState = { ...nextState, ...fnRes };
          }
        } else if (res && typeof res === "object") {
          nextState = { ...nextState, ...res };
        }
      }

      return { newState: nextState };
    }

    const isStoreWideReset =
      manipulator.actionType === "reset" &&
      (manipulator.category === "builtin" || manipulator.id === "builtin-reset" || !manipulator.targetFieldName);

    if (isStoreWideReset) {
      fields.forEach((f) => {
        nextState[f.name] = formatInitialFieldValue(f);
      });
      return { newState: nextState };
    }

    const isStoreWidePopulate =
      manipulator.actionType === "populate" &&
      (manipulator.category === "builtin" || manipulator.id === "builtin-populate" || !manipulator.targetFieldName);

    if (isStoreWidePopulate) {
      if (isJsonObject(payload)) {
        nextState = { ...nextState, ...payload };
      }
      return { newState: nextState };
    }

    const targetField = fields.find(
      (f) => f.id === manipulator.targetFieldId || f.name === manipulator.targetFieldName,
    ) || (manipulator.targetFieldId ? undefined : fields[0]);
    const targetName = targetField?.name || manipulator.targetFieldName || fields[0]?.name || "value";

    const rawActionType = manipulator.defaultManipulatorType || manipulator.actionType || manipulator.name || "set";
    const actType = toCanonicalStoreAction(typeof rawActionType === "string" ? rawActionType : "set");

    // Build the action payload `nextArg` for custom reducer invocation: (prev, next) => ...
    let nextArg: Record<string, JsonValue | undefined> | JsonValue | undefined;
    if (isJsonObject(payload) && "action" in payload) {
      nextArg = payload;
    } else {
      switch (actType) {
        case "set":
          nextArg = { action: "set", value: payload };
          break;
        case "append":
          nextArg = { action: "append", value: payload };
          break;
        case "prepend":
          nextArg = { action: "prepend", value: payload };
          break;
        case "pop":
          nextArg = { action: "pop" };
          break;
        case "remove":
          if (typeof payload === "number") {
            nextArg = { action: "remove", index: payload };
          } else if (isJsonObject(payload)) {
            nextArg = { action: "remove", ...payload };
          } else {
            nextArg = { action: "remove", id: payload, value: payload };
          }
          break;
        case "update":
          if (isJsonObject(payload)) {
            nextArg = { action: "update", ...payload, value: payload };
          } else {
            nextArg = { action: "update", value: payload };
          }
          break;
        case "stream":
          if (isJsonObject(payload)) {
            nextArg = { action: "stream", ...payload };
          } else if (typeof payload === "string") {
            nextArg = { action: "stream", delta: payload };
          } else {
            nextArg = { action: "stream", delta: String(payload ?? "") };
          }
          break;
        case "increment":
          nextArg = {
            action: "increment",
            amount: typeof payload === "number" ? payload : 1,
            value: payload,
          };
          break;
        case "decrement":
          nextArg = {
            action: "decrement",
            amount: typeof payload === "number" ? payload : 1,
            value: payload,
          };
          break;
        case "toggle":
          nextArg = { action: "toggle" };
          break;
        case "reset":
          nextArg = { action: "reset" };
          break;
        default:
          if (isJsonObject(payload)) {
            nextArg = { action: actType, ...payload };
          } else {
            nextArg = { action: actType, value: payload };
          }
          break;
      }
    }

    // Try executing field custom reducer if present
    let executedCustomReducer = false;
    if (targetField?.customReducerCode && targetField.customReducerCode.trim()) {
      try {
        const prevVal = currentState[targetName];
        let reducerResult: JsonValue | undefined = undefined;
        const codeTrimmed = targetField.customReducerCode.trim();

        const cleanFnCode = codeTrimmed.replace(/;+\s*$/, "");
        if (/^(\([^\)]*\)|[a-zA-Z0-9_$]+)\s*=>/.test(codeTrimmed) || /^function\b/.test(codeTrimmed)) {
          const fn = new Function(`return (${cleanFnCode});`)();
          if (typeof fn === "function") {
            reducerResult = fn(prevVal, nextArg);
          }
        } else {
          const fn = new Function("prev", "next", codeTrimmed);
          reducerResult = fn(prevVal, nextArg);
        }

        if (reducerResult !== undefined) {
          nextState[targetName] = reducerResult;
          executedCustomReducer = true;
        }
      } catch (err) {
        console.warn("Custom reducer execution error in applyManipulator:", err);
      }
    }

    // Fallback standard mutation logic if no custom reducer executed
    if (!executedCustomReducer) {
      switch (actType) {
        case "set": {
          let valToSet = payload !== undefined ? payload : currentState[targetName];
          if (isJsonObject(payload)) {
            if (
              manipulator.parameters &&
              manipulator.parameters.length === 1 &&
              manipulator.parameters[0]?.name &&
              manipulator.parameters[0].name in payload
            ) {
              valToSet = payload[manipulator.parameters[0].name];
            } else if (targetName in payload) {
              valToSet = payload[targetName];
            }
          }
          if (valToSet !== undefined) {
            nextState[targetName] = valToSet;
          }
          break;
        }

        case "append": {
          const currentArr = currentState[targetName];
          const arr = Array.isArray(currentArr) ? currentArr : [];
          let itemToAppend: JsonValue = payload !== undefined ? payload : null;
          if (
            isJsonObject(payload) &&
            manipulator.parameters &&
            manipulator.parameters.length === 1 &&
            manipulator.parameters[0]?.name &&
            manipulator.parameters[0].name in payload
          ) {
            itemToAppend = payload[manipulator.parameters[0].name] ?? null;
          } else if (isJsonObject(payload) && "value" in payload) {
            itemToAppend = payload["value"] ?? null;
          }
          if (typeof currentArr === "string") {
            nextState[targetName] = currentArr + String(itemToAppend ?? "");
          } else {
            nextState[targetName] = [...arr, itemToAppend];
          }
          break;
        }

        case "prepend": {
          const currentArr = currentState[targetName];
          const arr = Array.isArray(currentArr) ? currentArr : [];
          let itemToPrepend: JsonValue = payload !== undefined ? payload : null;
          if (
            isJsonObject(payload) &&
            manipulator.parameters &&
            manipulator.parameters.length === 1 &&
            manipulator.parameters[0]?.name &&
            manipulator.parameters[0].name in payload
          ) {
            itemToPrepend = payload[manipulator.parameters[0].name] ?? null;
          } else if (isJsonObject(payload) && "value" in payload) {
            itemToPrepend = payload["value"] ?? null;
          }
          if (typeof currentArr === "string") {
            nextState[targetName] = String(itemToPrepend ?? "") + currentArr;
          } else {
            nextState[targetName] = [itemToPrepend, ...arr];
          }
          break;
        }

        case "pop": {
          const currentArr = currentState[targetName];
          if (Array.isArray(currentArr)) {
            nextState[targetName] = currentArr.slice(0, -1);
          }
          break;
        }

        case "remove": {
          const currentArr = currentState[targetName];
          if (Array.isArray(currentArr)) {
            if (payload === undefined || manipulator.defaultManipulatorType === "pop") {
              nextState[targetName] = currentArr.slice(0, -1);
              break;
            }
            let removeIdOrIdx: JsonValue | undefined = payload;
            if (isJsonObject(payload)) {
              if (
                manipulator.parameters &&
                manipulator.parameters.length === 1 &&
                manipulator.parameters[0]?.name &&
                manipulator.parameters[0].name in payload
              ) {
                removeIdOrIdx = payload[manipulator.parameters[0].name];
              } else {
                const candidate = payload.id !== undefined ? payload.id : payload.index;
                if (candidate !== undefined) {
                  removeIdOrIdx = candidate;
                }
              }
            }
            nextState[targetName] = currentArr.filter((it, idx) => {
              if (idx === removeIdOrIdx || String(idx) === String(removeIdOrIdx)) return false;
              if (isJsonObject(it)) {
                if (it.id !== undefined && String(it.id) === String(removeIdOrIdx)) return false;
                if (it._id !== undefined && String(it._id) === String(removeIdOrIdx)) return false;
              }
              return true;
            });
          }
          break;
        }

        case "update": {
          const currentVal = currentState[targetName];
          if (Array.isArray(currentVal)) {
            const nestedValue = isJsonObject(payload) && "value" in payload ? payload["value"] : undefined;
            const patch = isJsonObject(nestedValue)
              ? nestedValue
              : isJsonObject(payload)
              ? payload
              : undefined;
            const targetId = isJsonObject(patch) ? (patch["id"] ?? patch["_id"]) : undefined;
            if (isJsonObject(patch) && targetId !== undefined) {
              const idx = currentVal.findIndex(
                (m) => isJsonObject(m) && (m["id"] === targetId || m["_id"] === targetId),
              );
              if (idx === -1) {
                nextState[targetName] = [...currentVal, patch];
              } else {
                nextState[targetName] = currentVal.map((m, j) =>
                  j === idx && isJsonObject(m) ? { ...m, ...patch } : m,
                );
              }
            }
          } else if (isJsonObject(currentVal)) {
            const patch = isJsonObject(payload) ? payload : {};
            nextState[targetName] = { ...currentVal, ...patch };
          } else if (payload !== undefined) {
            nextState[targetName] = payload;
          }
          break;
        }

        case "stream": {
          const currentVal = currentState[targetName];
          const src = isJsonObject(payload) ? payload : {};
          const deltaRaw = src["delta"] ?? src["chunk"] ?? src["text"];
          const delta =
            typeof deltaRaw === "string"
              ? deltaRaw
              : typeof payload === "string"
              ? payload
              : "";
          const roleRaw = src["role"];
          const role = typeof roleRaw === "string" ? roleRaw : "assistant";
          const done = Boolean(src["done"]);
          const streamTargetId = src["id"];

          if (Array.isArray(currentVal)) {
            let i = -1;
            if (streamTargetId !== undefined) {
              i = currentVal.findIndex((m) => isJsonObject(m) && m["id"] === streamTargetId);
            } else {
              const last = currentVal[currentVal.length - 1];
              if (isJsonObject(last) && last["role"] === role && last["streaming"] === true) {
                i = currentVal.length - 1;
              }
            }

            if (done) {
              if (i !== -1 && isJsonObject(currentVal[i])) {
                nextState[targetName] = currentVal.map((m, j) =>
                  j === i && isJsonObject(m) ? { ...m, streaming: false } : m,
                );
              }
            } else if (delta !== "") {
              if (i === -1) {
                nextState[targetName] = [
                  ...currentVal,
                  {
                    id: streamTargetId ?? `msg_${currentVal.length}_${Date.now()}`,
                    role,
                    content: delta,
                    streaming: true,
                  },
                ];
              } else {
                const targetMsg = currentVal[i];
                const prevContent =
                  isJsonObject(targetMsg) && typeof targetMsg["content"] === "string"
                    ? targetMsg["content"]
                    : "";
                nextState[targetName] = currentVal.map((m, j) =>
                  j === i && isJsonObject(m)
                    ? { ...m, content: prevContent + delta, streaming: true }
                    : m,
                );
              }
            }
          } else if (typeof currentVal === "string") {
            nextState[targetName] = currentVal + delta;
          }
          break;
        }

        case "toggle": {
          nextState[targetName] = !Boolean(currentState[targetName]);
          break;
        }

        case "increment": {
          let rawNum: JsonValue | undefined = payload;
          if (isJsonObject(payload)) {
            if (
              manipulator.parameters &&
              manipulator.parameters.length === 1 &&
              manipulator.parameters[0]?.name &&
              manipulator.parameters[0].name in payload
            ) {
              rawNum = payload[manipulator.parameters[0].name];
            } else if ("amount" in payload) {
              rawNum = payload.amount;
            }
          }
          const amt =
            typeof rawNum === "number"
              ? rawNum
              : typeof rawNum === "string" && !isNaN(Number(rawNum)) && rawNum.trim() !== ""
                ? Number(rawNum)
                : 1;
          const currentVal = currentState[targetName];
          nextState[targetName] = typeof currentVal === "number" ? currentVal + amt : amt;
          break;
        }

        case "decrement": {
          let rawNum: JsonValue | undefined = payload;
          if (isJsonObject(payload)) {
            if (
              manipulator.parameters &&
              manipulator.parameters.length === 1 &&
              manipulator.parameters[0]?.name &&
              manipulator.parameters[0].name in payload
            ) {
              rawNum = payload[manipulator.parameters[0].name];
            } else if ("amount" in payload) {
              rawNum = payload.amount;
            }
          }
          const amt =
            typeof rawNum === "number"
              ? rawNum
              : typeof rawNum === "string" && !isNaN(Number(rawNum)) && rawNum.trim() !== ""
                ? Number(rawNum)
                : 1;
          const currentVal = currentState[targetName];
          nextState[targetName] = typeof currentVal === "number" ? currentVal - amt : -amt;
          break;
        }

        case "reset": {
          if (targetField) {
            nextState[targetField.name] = formatInitialFieldValue(targetField);
          } else {
            fields.forEach((f) => {
              nextState[f.name] = formatInitialFieldValue(f);
            });
          }
          break;
        }

        case "populate": {
          if (isJsonObject(payload)) {
            nextState = { ...nextState, ...payload };
          }
          break;
        }

        case "custom":
        default: {
          const valToSet = payload !== undefined ? payload : currentState[targetName];
          if (valToSet !== undefined) {
            nextState[targetName] = valToSet;
          }
          break;
        }
      }
    }

    return { newState: nextState };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { newState: currentState, error: errorMsg };
  }
}
