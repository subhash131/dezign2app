import {
  GlobalStoreDefinition,
  GlobalStoreField,
  GlobalStoreAction,
  StateStoreTestCase,
  Parameter,
  JsonValue,
  JsonObject,
} from "@workspace/canvas/types";

export type StoreState = Record<string, JsonValue>;

export function isJsonObject(val: JsonValue | undefined): val is JsonObject {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export type RuntimeScopeValue =
  | ((updater: StoreState | ((prev: StoreState) => StoreState)) => void)
  | (() => StoreState)
  | JsonValue
  | undefined;

export interface StorePreset {
  name: string;
  description: string;
  storage: "memory" | "localStorage" | "sessionStorage";
  fields: Array<Omit<GlobalStoreField, "id">>;
  actions: Array<
    Omit<GlobalStoreAction, "id"> & {
      targetFieldName?: string;
    }
  >;
}

export const STORE_PRESETS: StorePreset[] = [
  {
    name: "Cart",
    description: "E-commerce shopping cart with items, quantity, and price calculation",
    storage: "localStorage",
    fields: [
      { name: "items", type: "array", defaultValue: [] },
      { name: "total", type: "number", defaultValue: 0 },
      { name: "itemCount", type: "number", defaultValue: 0 },
      { name: "discountCode", type: "string", defaultValue: "" },
    ],
    actions: [
      {
        name: "addItem",
        actionType: "custom",
        targetFieldName: "items",
        parameters: [
          { id: "p1", name: "item", type: "object", required: true },
          { id: "p2", name: "quantity", type: "number", required: false },
        ],
        code: `// Add item and auto-recalculate total\nconst items = get().items || [];\nconst qty = payload?.quantity || 1;\nconst existing = items.find((i) => i.id === payload?.item?.id);\nlet nextItems;\nif (existing) {\n  nextItems = items.map((i) => i.id === payload?.item?.id ? { ...i, qty: (i.qty || 1) + qty } : i);\n} else {\n  nextItems = [...items, { ...payload?.item, qty }];\n}\nconst newTotal = nextItems.reduce((sum, i) => sum + (Number(i.price) || 0) * (i.qty || 1), 0);\nset({ items: nextItems, total: newTotal, itemCount: nextItems.length });`,
      },
      { name: "setTotal", actionType: "set", targetFieldName: "total" },
      { name: "resetCart", actionType: "reset", targetFieldName: "items" },
    ],
  },
  {
    name: "UserSession",
    description: "User authentication session and preferences",
    storage: "memory",
    fields: [
      { name: "userId", type: "string", defaultValue: "" },
      { name: "isAuthenticated", type: "boolean", defaultValue: false },
      { name: "user", type: "object", defaultValue: null },
      { name: "theme", type: "string", defaultValue: "system" },
    ],
    actions: [
      {
        name: "loginSuccess",
        actionType: "custom",
        targetFieldName: "user",
        parameters: [
          { id: "p1", name: "userData", type: "object", required: true },
        ],
        code: `// Set user and mark authenticated\nconst data = payload?.userData || payload;\nset({\n  user: data,\n  userId: data?.id || data?.userId || "usr_123",\n  isAuthenticated: true,\n});`,
      },
      { name: "logout", actionType: "reset", targetFieldName: "isAuthenticated" },
      { name: "setTheme", actionType: "set", targetFieldName: "theme" },
    ],
  },
  {
    name: "UIState",
    description: "Global modal, sidebar, notifications, and navigation state",
    storage: "memory",
    fields: [
      { name: "isSidebarOpen", type: "boolean", defaultValue: true },
      { name: "activeModal", type: "string", defaultValue: "" },
      { name: "notificationsCount", type: "number", defaultValue: 0 },
      { name: "searchQuery", type: "string", defaultValue: "" },
    ],
    actions: [
      { name: "toggleSidebar", actionType: "toggle", targetFieldName: "isSidebarOpen" },
      { name: "setActiveModal", actionType: "set", targetFieldName: "activeModal" },
      { name: "incrementNotifications", actionType: "increment", targetFieldName: "notificationsCount" },
      { name: "resetUI", actionType: "reset", targetFieldName: "isSidebarOpen" },
    ],
  },
];

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
  actionType?: GlobalStoreAction["actionType"];
  defaultPayload?: JsonValue | undefined;
  defaultManipulatorType?: "populate" | "reset" | "setter";
  isCustomized?: boolean;
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

    const defaultManipulatorType = isPopulateOverride
      ? "populate"
      : isResetOverride
      ? "reset"
      : isSetterOverride
      ? "setter"
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

  // 3. Auto-generated setters (setField) for fields not already customized
  fields.forEach((f) => {
    const capitalized = f.name.charAt(0).toUpperCase() + f.name.slice(1);
    const setterName = `set${capitalized}`;
    const isSetterDisabled = disabledSet.has(setterName) || disabledSet.has(`setter-${f.id}`);
    const isSetterCustomized = list.some(
      (m) =>
        (m.defaultManipulatorType === "setter" && m.targetFieldId === f.id) ||
        m.name.toLowerCase() === setterName.toLowerCase(),
    );

    if (!isSetterDisabled && !isSetterCustomized) {
      let defaultSetterVal: JsonValue = "";
      if (f.type === "number") defaultSetterVal = 100;
      else if (f.type === "boolean") defaultSetterVal = true;
      else if (f.type === "array") defaultSetterVal = [{ id: "1", title: "Example" }];
      else if (f.type === "object") defaultSetterVal = { active: true };
      else defaultSetterVal = "Updated string";

      list.push({
        id: `setter-${f.id}`,
        name: setterName,
        label: `${setterName}(value)`,
        category: "auto_setter",
        targetFieldId: f.id,
        targetFieldName: f.name,
        actionType: "set",
        defaultManipulatorType: "setter",
        defaultPayload: defaultSetterVal,
        isCustomized: false,
      });
    }
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

    if (manipulator.category === "auto_setter" && manipulator.targetFieldName) {
      const fieldVal = payload !== undefined ? payload : currentState[manipulator.targetFieldName];
      if (fieldVal !== undefined) {
        nextState[manipulator.targetFieldName] = fieldVal;
      }
      return { newState: nextState };
    }

    const targetField = fields.find(
      (f) => f.id === manipulator.targetFieldId || f.name === manipulator.targetFieldName,
    ) || (manipulator.targetFieldId ? undefined : fields[0]);
    const targetName = targetField?.name || manipulator.targetFieldName || fields[0]?.name || "value";

    switch (manipulator.actionType) {
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
          const paramName = manipulator.parameters[0].name;
          const paramVal = payload[paramName];
          if (paramVal !== undefined) {
            itemToAppend = paramVal;
          }
        }
        nextState[targetName] = [...arr, itemToAppend];
        break;
      }
      case "remove": {
        const currentArr = currentState[targetName];
        if (Array.isArray(currentArr)) {
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
      case "reset": {
        fields.forEach((f) => {
          nextState[f.name] = formatInitialFieldValue(f);
        });
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

    return { newState: nextState };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { newState: currentState, error: errorMsg };
  }
}

export function generateDefaultTestCases(
  manipulators: StateManipulator[],
): StateStoreTestCase[] {
  return manipulators.map((m, idx) => ({
    id: `tc-${Date.now()}-${idx}`,
    name: `Test ${m.name}() execution`,
    manipulatorName: m.name,
    payload: m.defaultPayload,
    status: "idle",
  }));
}

export interface TestHistoryEntry {
  id: string;
  timestamp: string;
  manipulatorName: string;
  category: string;
  changedKeys: string[];
  beforeState: StoreState;
  afterState: StoreState;
  error?: string;
}

export function generateActionCodePreview({
  name,
  actionType = "set",
  targetFieldName,
  parameters = [],
  code,
  field,
}: {
  name: string;
  actionType?: GlobalStoreAction["actionType"];
  targetFieldName?: string;
  parameters?: Parameter[];
  code?: string;
  field?: GlobalStoreField;
}): string {
  const safeName = (name || "action").trim() || "action";
  const paramsList =
    parameters && parameters.length > 0
      ? parameters.map((p) => p.name.trim() || "arg").join(", ")
      : actionType === "reset" || actionType === "toggle"
      ? ""
      : "payload";

  // If custom code is provided
  if (code && code.trim()) {
    const trimmed = code.trim();
    if (trimmed.startsWith("set(") && !trimmed.includes("\n")) {
      return `${safeName}: (${paramsList}) => ${trimmed}`;
    }
    const indented = trimmed
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n");
    return `${safeName}: (${paramsList}) => {\n${indented}\n}`;
  }

  const target = targetFieldName || field?.name || "value";

  switch (actionType) {
    case "set":
      return `${safeName}: (${paramsList || "value"}) => set({ ${target}: ${paramsList || "value"} })`;
    case "toggle":
      return `${safeName}: () => set((state) => ({ ${target}: !state.${target} }))`;
    case "increment": {
      const arg =
        parameters && parameters.length > 0 && parameters[0]?.name
          ? parameters[0].name
          : "amount";
      return `${safeName}: (${arg} = 1) => set((state) => ({\n  ${target}: (Number(state.${target}) || 0) + ${arg}\n}))`;
    }
    case "append": {
      const arg =
        parameters && parameters.length > 0 && parameters[0]?.name
          ? parameters[0].name
          : "item";
      return `${safeName}: (${arg}) => set((state) => ({\n  ${target}: [...(Array.isArray(state.${target}) ? state.${target} : []), ${arg}]\n}))`;
    }
    case "remove": {
      const arg =
        parameters && parameters.length > 0 && parameters[0]?.name
          ? parameters[0].name
          : "idOrIndex";
      return `${safeName}: (${arg}) => set((state) => ({\n  ${target}: Array.isArray(state.${target})\n    ? state.${target}.filter((item, idx) =>\n        typeof item === "object" && item !== null && "id" in item ? item.id !== ${arg} : idx !== ${arg}\n      )\n    : []\n}))`;
    }
    case "populate":
      return `${safeName}: (${paramsList || "data"}) => set((state) => ({ ...state, ...(${paramsList || "data"} || {}) }))`;
    case "reset":
      return `${safeName}: () => set(initialState)`;
    case "custom":
    default: {
      const firstArg = paramsList ? (paramsList.split(",")[0]?.trim() || "payload") : "payload";
      return `${safeName}: (${paramsList}) => {\n  // Custom mutation logic\n  set({ ${target}: ${firstArg} });\n}`;
    }
  }
}

export function getDefaultTemplateForAction({
  actionType,
  targetFieldName,
  parameters = [],
  field,
}: {
  actionType?: GlobalStoreAction["actionType"];
  targetFieldName?: string;
  parameters?: Parameter[];
  field?: GlobalStoreField;
}): string {
  const target = targetFieldName || field?.name || "field";
  const firstParam =
    parameters && parameters.length > 0 && parameters[0]?.name
      ? parameters[0].name
      : "payload";

  switch (actionType) {
    case "set":
      return `// Set field directly\nset({ ${target}: ${firstParam} });`;
    case "toggle":
      return `// Toggle boolean field\nset((state) => ({ ${target}: !state.${target} }));`;
    case "increment":
      return `// Increment numeric field safely\nset((state) => ({\n  ${target}: (Number(state.${target}) || 0) + (Number(${firstParam}) || 1)\n}));`;
    case "append":
      return `// Append item to array safely\nset((state) => ({\n  ${target}: [...(Array.isArray(state.${target}) ? state.${target} : []), ${firstParam}]\n}));`;
    case "remove":
      return `// Filter out item by id or index\nset((state) => ({\n  ${target}: Array.isArray(state.${target})\n    ? state.${target}.filter((item, idx) =>\n        typeof item === "object" && item !== null && "id" in item\n          ? item.id !== ${firstParam}\n          : idx !== ${firstParam}\n      )\n    : []\n}));`;
    case "populate":
      return `// Bulk-hydrate store state\nif (${firstParam} && typeof ${firstParam} === "object") {\n  set((state) => ({ ...state, ...${firstParam} }));\n}`;
    case "reset":
      return `// Reset store back to initial defaults\nset(initialState);`;
    case "custom":
    default:
      return `// Access state with get(), update with set((state) => ({ ... }))\nconst current = get();\nset((state) => ({\n  ...state,\n  ${target}: ${firstParam}\n}));`;
  }
}

export interface ActionValidation {
  errors: string[];
  warnings: string[];
}

export function validateStoreAction({
  action,
  allActions,
  fields,
}: {
  action: GlobalStoreAction;
  allActions: GlobalStoreAction[];
  fields: GlobalStoreField[];
}): ActionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = action.name?.trim();
  if (!name) {
    errors.push("Action name is required");
  } else {
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      errors.push("Action name must be alphanumeric with no spaces");
    }

    const duplicates = allActions.filter(
      (a) => a.id !== action.id && a.name?.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicates.length > 0) {
      errors.push(`Action "${name}" is duplicated in this store`);
    }

    const lower = name.toLowerCase();
    const isBuiltinCollision = lower === "populate" || lower === "reset" || lower === "load";
    const setterCollision = fields.some(
      (f) => lower === `set${f.name.toLowerCase()}`,
    );
    if (!action.defaultManipulatorType && (isBuiltinCollision || setterCollision)) {
      warnings.push(`"${name}" collides with a default manipulator name.`);
    }
  }

  if (action.parameters && action.parameters.length > 0) {
    const paramNames = new Set<string>();
    const reservedWords = new Set([
      "set",
      "get",
      "initialState",
      "state",
      "function",
      "var",
      "let",
      "const",
      "return",
    ]);
    action.parameters.forEach((p, idx) => {
      const pName = p.name?.trim();
      if (!pName) {
        errors.push(`Arg #${idx + 1} name is empty`);
      } else {
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(pName)) {
          errors.push(`Arg "${pName}" has invalid identifier characters`);
        }
        if (reservedWords.has(pName)) {
          errors.push(`Arg "${pName}" conflicts with store scope reserved word`);
        }
        if (paramNames.has(pName.toLowerCase())) {
          errors.push(`Duplicate argument name "${pName}"`);
        }
        paramNames.add(pName.toLowerCase());
      }
    });
  }

  if (action.actionType === "custom" && (!action.code || !action.code.trim())) {
    warnings.push("Custom action has no implementation code yet");
  }

  return { errors, warnings };
}
