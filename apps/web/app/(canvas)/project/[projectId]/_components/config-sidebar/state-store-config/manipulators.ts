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
  actionType?: GlobalStoreAction["actionType"];
  defaultPayload?: JsonValue | undefined;
  defaultManipulatorType?: "populate" | "reset" | "setter" | "mutate" | "append" | "pop";
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

    const isArr = Boolean(f.isArray || f.type === "array" || f.type?.endsWith("[]"));
    if (isArr) {
      const appendName = `append${capitalized}`;
      const isAppendDisabled = disabledSet.has(appendName) || disabledSet.has(`append-${f.id}`);
      const isAppendCustomized = list.some(
        (m) =>
          (m.defaultManipulatorType === "append" && m.targetFieldId === f.id) ||
          m.name.toLowerCase() === appendName.toLowerCase(),
      );
      if (!isAppendDisabled && !isAppendCustomized) {
        list.push({
          id: `append-${f.id}`,
          name: appendName,
          label: `${appendName}(item)`,
          category: "auto_setter",
          targetFieldId: f.id,
          targetFieldName: f.name,
          actionType: "append",
          defaultManipulatorType: "append",
          defaultPayload: { id: "item_new", title: "New Item" },
          isCustomized: false,
        });
      }

      const popName = `pop${capitalized}`;
      const isPopDisabled = disabledSet.has(popName) || disabledSet.has(`pop-${f.id}`);
      const isPopCustomized = list.some(
        (m) =>
          (m.defaultManipulatorType === "pop" && m.targetFieldId === f.id) ||
          m.name.toLowerCase() === popName.toLowerCase(),
      );
      if (!isPopDisabled && !isPopCustomized) {
        list.push({
          id: `pop-${f.id}`,
          name: popName,
          label: `${popName}()`,
          category: "auto_setter",
          targetFieldId: f.id,
          targetFieldName: f.name,
          actionType: "remove",
          defaultManipulatorType: "pop",
          defaultPayload: undefined,
          isCustomized: false,
        });
      }
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
      if (manipulator.actionType === "append") {
        const rawArr = currentState[manipulator.targetFieldName];
        const cur: JsonValue[] = Array.isArray(rawArr) ? (rawArr as JsonValue[]) : [];
        const itemVal: JsonValue = payload !== undefined ? payload : null;
        nextState[manipulator.targetFieldName] = [...cur, itemVal];
        return { newState: nextState };
      }
      if (manipulator.actionType === "remove" || manipulator.defaultManipulatorType === "pop") {
        const rawArr = currentState[manipulator.targetFieldName];
        const cur: JsonValue[] = Array.isArray(rawArr) ? (rawArr as JsonValue[]) : [];
        nextState[manipulator.targetFieldName] = cur.slice(0, -1);
        return { newState: nextState };
      }
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
