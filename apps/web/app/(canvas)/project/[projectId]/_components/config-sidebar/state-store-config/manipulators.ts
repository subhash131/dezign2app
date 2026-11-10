import {
  GlobalStoreField,
  GlobalStoreAction,
  Parameter,
  JsonValue,
  CustomTypeItem,
  CustomTypeField,
} from "@workspace/canvas/types";
import { StoreState, isJsonObject, RuntimeScopeValue } from "./core";
import {
  resolveCustomType,
  extractFieldsFromCustomType,
  getSuggestedReducerCodeForChannelType,
} from "../../backend-nodes/graph-nodes/langgraph/langgraph-canvas/components/inspector/state-inspector/constants";

/**
 * Extracts the `const initial = { ... }` object shape from generated reducer code if present.
 */
export function parseInitialFromReducerCode(code?: string): Record<string, JsonValue> | null {
  if (!code || typeof code !== "string") return null;
  const match = /const\s+initial\s*=\s*\{([^}]+)\}/s.exec(code);
  if (!match || !match[1]) return null;

  const body = match[1];
  const obj: Record<string, JsonValue> = {};
  const lineRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*([^,\n}]+)/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(body)) !== null) {
    const key = m[1]?.trim();
    const rawVal = m[2]?.trim();
    if (!key || !rawVal) continue;
    let parsedVal: JsonValue = rawVal;
    if (rawVal === '""' || rawVal === "''") {
      parsedVal = "";
    } else if (rawVal === "true") {
      parsedVal = true;
    } else if (rawVal === "false") {
      parsedVal = false;
    } else if (rawVal === "0" || !Number.isNaN(Number(rawVal))) {
      parsedVal = Number(rawVal);
    } else if (rawVal === "[]") {
      parsedVal = [];
    } else if (rawVal === "{}") {
      parsedVal = {};
    } else if (
      (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
      (rawVal.startsWith("'") && rawVal.endsWith("'"))
    ) {
      parsedVal = rawVal.slice(1, -1);
    }
    obj[key] = parsedVal;
  }
  return Object.keys(obj).length > 0 ? obj : null;
}

/**
 * Infers the initial default value for a store variable according to its type and schema.
 */
export function inferInitialValueForField(
  field: GlobalStoreField,
  availableCustomTypes: CustomTypeItem[] = [],
): JsonValue {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  const isArr = Boolean(field.isArray || field.type === "array" || field.type?.endsWith("[]"));
  if (isArr) {
    return [];
  }
  const cleanType = (field.type || "string").replace(/\[\]$/, "").trim();
  switch (cleanType.toLowerCase()) {
    case "number":
    case "int":
    case "float":
      return 0;
    case "boolean":
    case "bool":
      return false;
    case "string":
    case "text":
      return "";
    case "object":
      return {};
    default: {
      // 1. Try finding custom type from availableCustomTypes
      const matched = resolveCustomType({
        availableTypes: availableCustomTypes,
        typeId: field.customTypeId,
        typeName: cleanType,
      });
      if (matched) {
        const fields = extractFieldsFromCustomType(matched);
        if (fields.length > 0) {
          const initObj: Record<string, JsonValue> = {};
          fields.forEach((f) => {
            if (f.defaultValue !== undefined && f.defaultValue !== "") {
              initObj[f.name] = f.defaultValue;
            } else if (f.isArray || f.type.endsWith("[]")) {
              initObj[f.name] = [];
            } else if (f.type === "number") {
              initObj[f.name] = 0;
            } else if (f.type === "boolean") {
              initObj[f.name] = false;
            } else if (f.name.toLowerCase() === "role") {
              initObj[f.name] = "user";
            } else {
              initObj[f.name] = "";
            }
          });
          return initObj;
        }
      }

      // 2. Try parsing initial object from reducer code
      const parsedInitial = parseInitialFromReducerCode(field.customReducerCode);
      if (parsedInitial) {
        return parsedInitial;
      }

      // 3. Fallback heuristics for known schema names
      if (cleanType.toLowerCase().includes("message") || field.name.toLowerCase().includes("message")) {
        return { id: "", role: "user", content: "" };
      }

      return "";
    }
  }
}

export function formatInitialFieldValue(
  field: GlobalStoreField,
  availableCustomTypes: CustomTypeItem[] = [],
): JsonValue {
  return inferInitialValueForField(field, availableCustomTypes);
}

function inferSampleSingleItem(
  field: GlobalStoreField,
  cleanType: string,
  availableCustomTypes: CustomTypeItem[] = [],
): JsonValue {
  // 1. Primitive types
  switch (cleanType.toLowerCase()) {
    case "number":
    case "int":
    case "float":
      return 100;
    case "boolean":
    case "bool":
      return true;
    case "string":
    case "text": {
      const n = field.name.toLowerCase();
      if (n.includes("status")) return "active";
      if (n.includes("input") || n.includes("query") || n.includes("search")) return "What is the status?";
      if (n.includes("email")) return "alex@example.com";
      if (n.includes("title")) return "Sample Title";
      if (n.includes("content")) return "Sample message content";
      return `Sample ${field.name}`;
    }
    case "object":
      return { active: true };
  }

  // 2. Custom Type resolution via availableCustomTypes
  const matchedType = resolveCustomType({
    availableTypes: availableCustomTypes,
    typeId: field.customTypeId,
    typeName: cleanType,
  });

  if (matchedType) {
    const fields = extractFieldsFromCustomType(matchedType);
    if (fields.length > 0) {
      const obj: Record<string, JsonValue> = {};
      fields.forEach((f) => {
        const fName = f.name.toLowerCase();
        const fType = (f.type || "string").toLowerCase().trim();

        if (f.defaultValue !== undefined && f.defaultValue !== "") {
          try {
            obj[f.name] =
              typeof f.defaultValue === "string" && (f.defaultValue.startsWith("{") || f.defaultValue.startsWith("["))
                ? JSON.parse(f.defaultValue)
                : f.defaultValue;
            return;
          } catch {
            obj[f.name] = f.defaultValue;
            return;
          }
        }

        if (Array.isArray(f.enumValues) && f.enumValues.length > 0) {
          const firstVal = f.enumValues[0] ?? "";
          if (fName === "role") {
            obj[f.name] = f.enumValues.includes("user") ? "user" : firstVal;
          } else {
            obj[f.name] = firstVal;
          }
          return;
        }

        if (f.isArray || fType.endsWith("[]") || fType === "array") {
          obj[f.name] = [];
          return;
        }

        if (fName === "id" || fName === "_id") {
          if (cleanType.toLowerCase().includes("message") || field.name.toLowerCase().includes("message")) {
            obj[f.name] = "msg_1";
          } else if (cleanType.toLowerCase().includes("user")) {
            obj[f.name] = "usr_1";
          } else {
            obj[f.name] = "1";
          }
        } else if (fName === "role") {
          obj[f.name] = "user";
        } else if (fName === "content" || fName === "text" || fName === "message") {
          obj[f.name] = "Hello";
        } else if (fName === "delta" || fName === "chunk") {
          obj[f.name] = "Hello chunk";
        } else if (fName === "streaming" || fName === "done" || fName === "isstreaming") {
          obj[f.name] = false;
        } else if (fName === "name" || fName === "title") {
          obj[f.name] = "Sample " + f.name.charAt(0).toUpperCase() + f.name.slice(1);
        } else if (fName === "email") {
          obj[f.name] = "user@example.com";
        } else if (fName === "price" || fName === "amount" || fName === "cost") {
          obj[f.name] = 29.99;
        } else if (fName === "status") {
          obj[f.name] = "active";
        } else if (fName === "active" || fName === "enabled" || fName === "success") {
          obj[f.name] = true;
        } else if (fName === "count" || fName === "quantity" || fName === "index") {
          obj[f.name] = 1;
        } else if (fType === "number" || fType === "int" || fType === "float") {
          obj[f.name] = 1;
        } else if (fType === "boolean" || fType === "bool") {
          obj[f.name] = true;
        } else if (fType === "object") {
          obj[f.name] = {};
        } else {
          obj[f.name] = `Sample ${f.name}`;
        }
      });
      return obj;
    }
  }

  // 3. Parse initial from customReducerCode if available
  const parsedInitial = parseInitialFromReducerCode(field.customReducerCode);
  if (parsedInitial) {
    const obj: Record<string, JsonValue> = {};
    for (const [k, initVal] of Object.entries(parsedInitial)) {
      const kLower = k.toLowerCase();
      if (kLower === "id" || kLower === "_id") {
        obj[k] = cleanType.toLowerCase().includes("message") || field.name.toLowerCase().includes("message")
          ? "msg_1"
          : "1";
      } else if (kLower === "role") {
        obj[k] = "user";
      } else if (kLower === "content" || kLower === "text") {
        obj[k] = "Hello";
      } else if (typeof initVal === "string" && initVal === "") {
        obj[k] = `Sample ${k}`;
      } else if (typeof initVal === "number" && initVal === 0) {
        obj[k] = 1;
      } else if (typeof initVal === "boolean" && initVal === false) {
        obj[k] = true;
      } else {
        obj[k] = initVal;
      }
    }
    return obj;
  }

  // 4. Well-known type name heuristics
  if (cleanType.toLowerCase().includes("message") || field.name.toLowerCase().includes("message")) {
    return { id: "msg_1", role: "user", content: "Hello" };
  }
  if (cleanType.toLowerCase().includes("user")) {
    return { id: "usr_1", name: "Alex Doe", email: "alex@example.com", role: "user" };
  }
  if (cleanType.toLowerCase().includes("item") || cleanType.toLowerCase().includes("product")) {
    return { id: "1", title: "Sample Item", price: 29.99 };
  }

  // 5. Generic object fallback
  return { id: "1", [field.name]: `Sample ${field.name}` };
}

/**
 * Infers a realistic sample payload object or value based on the type schema of a state variable.
 */
export function inferSampleValueForField(
  field: GlobalStoreField,
  availableCustomTypes: CustomTypeItem[] = [],
  allowArray = true,
): JsonValue {
  const isArr = Boolean(field.isArray || field.type === "array" || field.type?.endsWith("[]"));
  const cleanType = (field.type || "string").replace(/\[\]$/, "").trim();

  const singleItem = inferSampleSingleItem(field, cleanType, availableCustomTypes);

  if (isArr && allowArray) {
    return [singleItem];
  }
  return singleItem;
}

/**
 * Infers a realistic patch object for update reducer actions.
 */
export function inferSamplePatchForField(
  field: GlobalStoreField,
  availableCustomTypes: CustomTypeItem[] = [],
): Record<string, JsonValue> {
  const isArr = Boolean(field.isArray || field.type === "array" || field.type?.endsWith("[]"));
  const sample = inferSampleSingleItem(
    field,
    (field.type || "string").replace(/\[\]$/, "").trim(),
    availableCustomTypes,
  );

  if (isJsonObject(sample)) {
    const copy: Record<string, JsonValue> = { ...sample };
    if ("content" in copy) {
      copy.content = "Updated message content";
    } else if ("title" in copy) {
      copy.title = "Updated Title";
    } else if ("status" in copy) {
      copy.status = "updated";
    }
    if (isArr && !("id" in copy)) {
      copy.id = "1";
    }
    return copy;
  }

  return { id: "1", value: "updated" };
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
 * Checks whether a state manipulator belongs to a specific state variable/field.
 */
export function isManipulatorForField(
  manipulator: StateManipulator,
  field: GlobalStoreField,
): boolean {
  // If targetFieldId is set, it is the authoritative source of truth
  if (manipulator.targetFieldId) {
    return manipulator.targetFieldId === field.id;
  }
  // If id has the field id suffix (e.g. setter-f1 or stream-f1)
  if (manipulator.id && manipulator.id.endsWith(`-${field.id}`)) {
    return true;
  }
  // If targetFieldName is set
  if (manipulator.targetFieldName) {
    return (
      manipulator.targetFieldName.trim().toLowerCase() === field.name.trim().toLowerCase()
    );
  }
  // Otherwise check if the action name ends with the field name
  const nameLower = manipulator.name.trim().toLowerCase();
  const fieldLower = field.name.trim().toLowerCase();
  return nameLower.endsWith(fieldLower);
}

/**
 * Normalizes an action name or alias into its canonical action type.
 */
export function toCanonicalStoreAction(action: string): string {
  if (!action || typeof action !== "string") return "set";
  const rawFirst = action.includes("|") ? action.split("|")[0]?.trim() || action : action;
  const norm = rawFirst.toLowerCase().trim();
  switch (norm) {
    case "set":
    case "setter":
    case "mutate":
    case "replace":
      return "set";
    case "append":
    case "add":
    case "push":
    case "concat":
      return "append";
    case "prepend":
    case "unshift":
      return "prepend";
    case "pop":
      return "pop";
    case "remove":
    case "delete":
    case "filter":
      return "remove";
    case "update":
    case "upsert":
    case "patch":
    case "modify":
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

export interface ParsedReducerActionBranch {
  displayName: string;
  canonicalAction: string;
  actionAliases: string[];
  code: string;
}

const INTERNAL_SYNONYMS = new Set([
  "setter",
  "mutate",
  "append_stream",
  "default",
]);

export const STANDARD_ACTION_DISPLAY_NAMES: Record<string, string> = {
  set: "set | replace",
  append: "append | add",
  prepend: "prepend",
  pop: "pop",
  remove: "remove | filter",
  update: "update | upsert",
  stream: "stream | chunk",
  reset: "reset | clear",
  increment: "increment | add",
  decrement: "decrement | subtract",
  toggle: "toggle",
};

/**
 * Extracts action branches and their corresponding code blocks directly from reducer code.
 * Formats multiple OR aliases as "ACTION 1 | ACTION 2" (e.g. "set | replace", "append | add").
 */
export function extractActionBranchesFromReducerCode(
  code?: string,
): ParsedReducerActionBranch[] {
  if (!code || typeof code !== "string" || !code.trim()) return [];

  const branches: ParsedReducerActionBranch[] = [];
  const seenCanonical = new Set<string>();

  // Pattern 1: if statements checking action (supports both { ... } and single-statement without braces)
  const ifRegex =
    /(?:((?:[ \t]*\/\/[^\n]*\n)+))?[ \t]*if\s*\(([^)]*(?:action|\.action)[^)]*)\)(\s*\{|\s*[^\n;]+;?)/g;
  let match: RegExpExecArray | null;

  while ((match = ifRegex.exec(code)) !== null) {
    const fullMatchStart = match.index;
    const condition = match[2] || "";
    const bodyStarter = match[3] || "";

    // Ignore property checks like '"action" in next' or pure '!action'
    if (/["']action["']\s+in\s+/i.test(condition)) continue;
    if (/!action\b/.test(condition) && !/===|==|\.includes/i.test(condition)) continue;

    let fullBlock = "";
    if (bodyStarter.trim().startsWith("{")) {
      const openBraceIndex = match.index + match[0].indexOf("{");
      let depth = 1;
      let i = openBraceIndex + 1;
      while (i < code.length && depth > 0) {
        if (code[i] === "{") depth++;
        else if (code[i] === "}") depth--;
        i++;
      }
      fullBlock = code.slice(fullMatchStart, i).trim();
    } else {
      fullBlock = code.slice(fullMatchStart, match.index + match[0].length).trim();
    }

    // Extract string literals from condition
    const strRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    const literals: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = strRegex.exec(condition)) !== null) {
      const act = (sm[1] ?? sm[2] ?? "").trim();
      if (act && act !== "default" && act !== "" && act !== "action" && !literals.includes(act)) {
        literals.push(act);
      }
    }

    if (literals.length > 0) {
      const publicLiterals = literals.filter((l) => !INTERNAL_SYNONYMS.has(l));
      let finalLiterals = publicLiterals.length > 0 ? publicLiterals : literals;

      // Prefer canonical verbs first in alias pairs
      if (finalLiterals.includes("set") && finalLiterals.includes("replace")) {
        const others = finalLiterals.filter((l) => l !== "set" && l !== "replace");
        finalLiterals = ["set", "replace", ...others];
      } else if (finalLiterals.includes("append") && finalLiterals.includes("add")) {
        const others = finalLiterals.filter((l) => l !== "append" && l !== "add");
        finalLiterals = ["append", "add", ...others];
      } else if (finalLiterals.includes("remove") && finalLiterals.includes("filter")) {
        const others = finalLiterals.filter((l) => l !== "remove" && l !== "filter");
        finalLiterals = ["remove", "filter", ...others];
      } else if (finalLiterals.includes("update") && finalLiterals.includes("upsert")) {
        const others = finalLiterals.filter((l) => l !== "update" && l !== "upsert");
        finalLiterals = ["update", "upsert", ...others];
      } else if (finalLiterals.includes("stream") && finalLiterals.includes("chunk")) {
        const others = finalLiterals.filter((l) => l !== "stream" && l !== "chunk");
        finalLiterals = ["stream", "chunk", ...others];
      } else if (finalLiterals.includes("reset") && finalLiterals.includes("clear")) {
        const others = finalLiterals.filter((l) => l !== "reset" && l !== "clear");
        finalLiterals = ["reset", "clear", ...others];
      }

      const displayName = finalLiterals.join(" | ");
      const canonicalAction = toCanonicalStoreAction(finalLiterals[0] || "set");

      branches.push({
        displayName,
        canonicalAction,
        actionAliases: finalLiterals,
        code: fullBlock,
      });
      seenCanonical.add(canonicalAction);
    }
  }

  // Pattern 2: switch (action) statements
  const switchRegex = /switch\s*\([^)]*(?:action|\.action)[^)]*\)\s*\{/g;
  let switchMatch: RegExpExecArray | null;
  while ((switchMatch = switchRegex.exec(code)) !== null) {
    const switchStart = switchMatch.index + switchMatch[0].length;
    let depth = 1;
    let i = switchStart;
    while (i < code.length && depth > 0) {
      if (code[i] === "{") depth++;
      else if (code[i] === "}") depth--;
      i++;
    }
    const switchBody = code.slice(switchStart, i - 1);

    const caseGroupRegex =
      /(?:case\s*["']([^"']+)["']\s*:\s*)+([\s\S]*?)(?=(?:case\s*["']|default\s*:|\}))/g;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = caseGroupRegex.exec(switchBody)) !== null) {
      const fullCaseBlock = cMatch[0].trim();
      const strRegex = /case\s*["']([^"']+)["']/g;
      const caseLiterals: string[] = [];
      let csm: RegExpExecArray | null;
      while ((csm = strRegex.exec(fullCaseBlock)) !== null) {
        const act = csm[1]?.trim();
        if (act && !caseLiterals.includes(act)) {
          caseLiterals.push(act);
        }
      }
      if (caseLiterals.length > 0) {
        const publicLiterals = caseLiterals.filter((l) => !INTERNAL_SYNONYMS.has(l));
        const finalLiterals = publicLiterals.length > 0 ? publicLiterals : caseLiterals;
        const displayName = finalLiterals.join(" | ");
        const canonicalAction = toCanonicalStoreAction(finalLiterals[0] || "set");

        if (!seenCanonical.has(canonicalAction)) {
          branches.push({
            displayName,
            canonicalAction,
            actionAliases: finalLiterals,
            code: fullCaseBlock,
          });
          seenCanonical.add(canonicalAction);
        }
      }
    }
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

  branches.sort((a, b) => {
    const idxA = actionOrder.indexOf(a.canonicalAction);
    const idxB = actionOrder.indexOf(b.canonicalAction);
    const orderA = idxA === -1 ? 999 : idxA;
    const orderB = idxB === -1 ? 999 : idxB;
    return orderA - orderB;
  });

  return branches;
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
  availableCustomTypes: CustomTypeItem[] = [],
): StateManipulator[] {
  const list: StateManipulator[] = [];
  const disabledSet = new Set([
    ...(disabledDefaultManipulators || []),
    ...(deletedDefaultManipulators || []),
  ]);

  // 1. Check customized / user declared actions
  actions.forEach((act) => {
    const targetField = fields.find(
      (f) =>
        f.id === act.targetFieldId ||
        (Boolean(act.targetFieldName) && f.name.toLowerCase() === act.targetFieldName!.toLowerCase()) ||
        (Boolean(act.name) && act.name.toLowerCase().endsWith(f.name.toLowerCase())),
    );
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
        (acc, f) => ({ ...acc, [f.name]: formatInitialFieldValue(f, availableCustomTypes) }),
        {},
      );
    } else if (act.actionType === "reset" || act.name.toLowerCase() === "reset") {
      defaultPayload = undefined;
    } else if (targetField) {
      if (targetField.type === "number") defaultPayload = 1;
      else if (targetField.type === "boolean") defaultPayload = true;
      else if (targetField.type === "array") defaultPayload = [{ id: "item_1", title: "New Item", price: 19.99 }];
      else if (targetField.type === "object") defaultPayload = { key: "value" };
      else {
        defaultPayload = inferSampleValueForField(targetField, availableCustomTypes);
      }
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
      label: act.name,
      category: defaultManipulatorType
        ? defaultManipulatorType === "setter"
          ? "auto_setter"
          : "builtin"
        : act.actionType === "custom"
        ? "custom_action"
        : "standard_action",
      targetFieldId: act.targetFieldId || targetField?.id,
      targetFieldName: targetField?.name || act.targetFieldName,
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
      label: "reset",
      category: "builtin",
      actionType: "reset",
      defaultManipulatorType: "reset",
      code: "set(initialState);",
      defaultPayload: undefined,
      isCustomized: false,
    });
  }

  if (!hasPopulate && !disabledSet.has("populate") && !disabledSet.has("load")) {
    list.push({
      id: "builtin-populate",
      name: "populate",
      label: "populate",
      category: "builtin",
      actionType: "populate",
      defaultManipulatorType: "populate",
      code: "set(payload);",
      defaultPayload: fields.reduce<StoreState>(
        (acc, f) => ({ ...acc, [f.name]: formatInitialFieldValue(f, availableCustomTypes) }),
        {},
      ),
      isCustomized: false,
    });
  }

  // 3. Field manipulators: Directly represent the actions of the reducers and the code within them
  fields.forEach((f) => {
    const isArr = Boolean(f.isArray || f.type === "array" || f.type?.endsWith("[]"));
    const isMsg = Boolean(
      f.type?.toLowerCase().includes("message") ||
      f.type?.toLowerCase().includes("chat") ||
      f.name.toLowerCase().includes("message") ||
      f.name.toLowerCase().includes("chat"),
    );

    const cleanBase = (f.type || "string").replace(/\[\]$/, "").trim();
    const matchedCustom = resolveCustomType({
      availableTypes: availableCustomTypes,
      typeName: cleanBase,
      typeId: f.customTypeId,
    });

    const effectiveCode =
      f.customReducerCode && f.customReducerCode.trim()
        ? f.customReducerCode
        : getSuggestedReducerCodeForChannelType(f.type, matchedCustom, isArr);

    let parsedBranches = extractActionBranchesFromReducerCode(effectiveCode);

    // If no branches were found (e.g. shorthand expression reducer without action branches)
    if (parsedBranches.length === 0) {
      const standardActions = getSupportedActionsForType(f.type, isArr, f.name);
      parsedBranches = standardActions.map((act) => ({
        displayName: STANDARD_ACTION_DISPLAY_NAMES[act] || act,
        canonicalAction: act,
        actionAliases: [act],
        code: effectiveCode,
      }));
    }

    parsedBranches.forEach((branch) => {
      const act = branch.canonicalAction;
      const displayName = branch.displayName;
      let actionType: StateManipulator["actionType"] = "custom";
      let defaultManipulatorType: StateManipulator["defaultManipulatorType"] = act;
      let defaultPayload: JsonValue | undefined = undefined;

      switch (act) {
        case "set": {
          actionType = "set";
          defaultManipulatorType = "setter";
          if (isArr) {
            const single = inferSampleValueForField(f, availableCustomTypes, false);
            defaultPayload = Array.isArray(single) ? single : [single];
          } else {
            defaultPayload = inferSampleValueForField(f, availableCustomTypes, false);
          }
          break;
        }
        case "append": {
          actionType = "append";
          defaultManipulatorType = "append";
          if (isArr) {
            defaultPayload = inferSampleValueForField(f, availableCustomTypes, false);
          } else if (f.type === "string") {
            defaultPayload = " (appended)";
          } else {
            defaultPayload = inferSampleValueForField(f, availableCustomTypes, false);
          }
          break;
        }
        case "prepend": {
          actionType = "prepend";
          defaultManipulatorType = "prepend";
          if (isArr) {
            const item = inferSampleValueForField(f, availableCustomTypes, false);
            if (isMsg && typeof item === "object" && item !== null && !Array.isArray(item)) {
              defaultPayload = { ...item, id: "msg_0", role: "system", content: "You are a helpful assistant." };
            } else {
              defaultPayload = item;
            }
          } else if (f.type === "string") {
            defaultPayload = "[PRE] ";
          } else {
            defaultPayload = inferSampleValueForField(f, availableCustomTypes, false);
          }
          break;
        }
        case "pop": {
          actionType = "remove";
          defaultManipulatorType = "pop";
          defaultPayload = undefined;
          break;
        }
        case "remove": {
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
          actionType = "update";
          defaultManipulatorType = "update";
          defaultPayload = inferSamplePatchForField(f, availableCustomTypes);
          break;
        }
        case "stream": {
          actionType = "stream";
          defaultManipulatorType = "stream";
          defaultPayload = { delta: "Hello streaming message chunk!", role: "assistant" };
          break;
        }
        case "increment": {
          actionType = "increment";
          defaultManipulatorType = "increment";
          defaultPayload = { amount: 1 };
          break;
        }
        case "decrement": {
          actionType = "decrement";
          defaultManipulatorType = "decrement";
          defaultPayload = { amount: 1 };
          break;
        }
        case "toggle": {
          actionType = "toggle";
          defaultManipulatorType = "toggle";
          defaultPayload = undefined;
          break;
        }
        case "reset": {
          actionType = "reset";
          defaultManipulatorType = "reset";
          defaultPayload = undefined;
          break;
        }
        default: {
          actionType = "custom";
          defaultManipulatorType = act;
          defaultPayload = { action: act };
          break;
        }
      }

      const isActDisabled =
        disabledSet.has(act) ||
        disabledSet.has(displayName) ||
        disabledSet.has(`${act}-${f.id}`) ||
        (act === "set" && (disabledSet.has(`setter-${f.id}`) || disabledSet.has(`set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}`)));

      const isActCustomized = list.some(
        (m) =>
          m.targetFieldId === f.id &&
          (m.defaultManipulatorType === act ||
            (act === "set" && m.defaultManipulatorType === "setter") ||
            m.name.toLowerCase() === displayName.toLowerCase()),
      );

      if (!isActDisabled && !isActCustomized) {
        list.push({
          id: `${act === "set" ? "setter" : act}-${f.id}`,
          name: displayName,
          label: displayName,
          category:
            act === "set"
              ? "auto_setter"
              : act === "reset"
              ? "builtin"
              : "standard_action",
          targetFieldId: f.id,
          targetFieldName: f.name,
          code: branch.code,
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

    // If custom code is provided on a store-level action (Zustand action), execute it in Zustand runtime scope
    const manipCode = manipulator.code;
    const isStoreLevelZustandAction =
      !manipulator.targetFieldId &&
      typeof manipCode === "string" &&
      manipCode.trim().length > 0 &&
      (manipCode.includes("set(") || manipCode.includes("get()") || manipulator.category === "custom_action");

    if (isStoreLevelZustandAction && typeof manipCode === "string") {
      let trimmedCode = manipCode.trim();

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

    const rawActionType =
      manipulator.defaultManipulatorType === "pop" || manipulator.name === "pop"
        ? "pop"
        : manipulator.actionType || manipulator.defaultManipulatorType || manipulator.name || "set";
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
        case "increment": {
          const amt =
            typeof payload === "number"
              ? payload
              : isJsonObject(payload) && typeof payload.amount === "number"
              ? payload.amount
              : 1;
          nextArg = {
            action: "increment",
            amount: amt,
            value: amt,
          };
          break;
        }
        case "decrement": {
          const amt =
            typeof payload === "number"
              ? payload
              : isJsonObject(payload) && typeof payload.amount === "number"
              ? payload.amount
              : 1;
          nextArg = {
            action: "decrement",
            amount: amt,
            value: amt,
          };
          break;
        }
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
    const targetCleanType = (targetField?.type || "string").replace(/\[\]$/, "").trim();
    const matchedTargetCustom = resolveCustomType({
      availableTypes: [],
      typeName: targetCleanType,
      typeId: targetField?.customTypeId,
    });
    const isTargetArr = Boolean(
      targetField?.isArray || targetField?.type === "array" || targetField?.type?.endsWith("[]"),
    );
    const codeToRun =
      targetField?.customReducerCode && targetField.customReducerCode.trim()
        ? targetField.customReducerCode
        : targetField
        ? getSuggestedReducerCodeForChannelType(targetField.type, matchedTargetCustom, isTargetArr)
        : undefined;

    if (codeToRun && codeToRun.trim()) {
      try {
        const prevVal = currentState[targetName];
        let reducerResult: JsonValue | undefined = undefined;
        const codeTrimmed = codeToRun.trim();

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
          // If the custom reducer returned the exact same untouched prev reference for a set action with a new payload,
          // ensure the new value is applied
          if (actType === "set" && reducerResult === prevVal && payload !== undefined && prevVal !== payload) {
            nextState[targetName] = payload;
          } else {
            nextState[targetName] = reducerResult;
          }
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
