import type { CustomTypeItem, CustomTypeField } from "@workspace/canvas";

export interface BuiltInReducer {
  name: string;
  label: string;
  desc: string;
  typeHint: string;
}

export const DEFAULT_BUILT_IN_REDUCER: BuiltInReducer = {
  name: "replace",
  label: "replace (last-value-wins)",
  desc: "Direct assignment, overwriting previous value",
  typeHint: "primitive",
};

export const BUILT_IN_REDUCERS: BuiltInReducer[] = [
  DEFAULT_BUILT_IN_REDUCER,
  {
    name: "add_messages",
    label: "add_messages (LangGraph native: append, dedup & overwrite)",
    desc: "LangGraph's native addMessages with ID deduplication, message coercion, and Overwrite support",
    typeHint: "messages",
  },
  {
    name: "append",
    label: "append (array concat)",
    desc: "Appends incoming updates to the existing array",
    typeHint: "array",
  },
  {
    name: "concat_array",
    label: "concat_array (merge lists)",
    desc: "Concatenates array updates",
    typeHint: "array",
  },
  {
    name: "merge_object",
    label: "merge_object (dict merge)",
    desc: "Shallow dictionary merge: { ...prev, ...next }",
    typeHint: "object",
  },
];

export function getChannelReducerName(key?: string): string {
  const clean = (key || "var").replace(/[^a-zA-Z0-9_$]/g, "");
  if (!clean) return "stateReducer";
  const camel = clean.charAt(0).toLowerCase() + clean.slice(1);
  return `${camel}Reducer`;
}

export const DEFAULT_REDUCER_CODE = `(prev, next) => {
  // Check action sent by node (e.g. { action: "replace", value: ... })
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;

  // 1. Default update: when action is undefined, "", or "default"
  if (!action || action === "" || action === "default") {
    return typeof next === "object" && next !== null && "value" in next && next.value !== undefined ? next.value : (next !== undefined ? next : prev);
  }

  // 2. Action: replace - explicitly replaces current value with incoming value
  // e.g. dispatch { my_var: { action: "replace", value: "new_value" } }
  if (action === "replace") {
    return typeof next === "object" && next !== null && "value" in next && next.value !== undefined ? next.value : next;
  }

  // 3. Action: reset - resets to undefined or initial state
  // e.g. dispatch { my_var: { action: "reset" } }
  if (action === "reset") {
    return undefined;
  }

  return prev;
}`;

export const REDUCER_CODE_PRESETS = {
  chat: `(prev, next) => {
  const action = next?.action;
  const prevArr = Array.isArray(prev) ? prev : [];

  // 1. Default update: when action is undefined, "", or "default" (appends incoming messages)
  // e.g. dispatch { messages: [newMsg] } or { messages: newMsg }
  if (!action || action === "" || action === "default") {
    const incoming = next?.value !== undefined ? next.value : next;
    return [...prevArr, ...(Array.isArray(incoming) ? incoming : (incoming != null ? [incoming] : []))];
  }

  // 2. Action: replace - overwrites entire message history
  // e.g. dispatch { messages: { action: "replace", value: [systemMsg, userMsg] } }
  if (action === "replace") {
    const incoming = next?.value !== undefined ? next.value : next;
    return Array.isArray(incoming) ? incoming : (incoming != null ? [incoming] : []);
  }

  // 3. Action: reset / clear - clears conversation history
  // e.g. dispatch { messages: { action: "reset" } }
  if (action === "reset" || action === "clear") {
    return [];
  }

  return prevArr;
}`,
  array: `(prev, next) => {
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : next?.action;
  const prevArr = Array.isArray(prev) ? prev : [];

  // 1. Action: reset / clear - empties array
  // e.g. dispatch { items: { action: "reset" } }
  if (action === "reset" || action === "clear") {
    return [];
  }

  const rawValue = typeof next === "object" && next !== null && "value" in next && next.value !== undefined ? next.value : next;

  // 2. Action: replace / set - overwrites entire array
  // e.g. dispatch { items: { action: "replace", value: [1, 2, 3] } }
  if (action === "replace" || action === "set") {
    return Array.isArray(rawValue) ? rawValue : (rawValue != null ? [rawValue] : []);
  }

  // 3. Action: append / add - appends items
  // e.g. dispatch { items: { action: "append", value: newItem } }
  if (action === "append" || action === "add") {
    const nextArr = Array.isArray(rawValue) ? rawValue : (rawValue != null ? [rawValue] : []);
    return [...prevArr, ...nextArr];
  }

  // 4. Action: prepend - adds items to front
  // e.g. dispatch { items: { action: "prepend", value: newItem } }
  if (action === "prepend") {
    const nextArr = Array.isArray(rawValue) ? rawValue : (rawValue != null ? [rawValue] : []);
    return [...nextArr, ...prevArr];
  }

  // 5. Action: pop - removes last element
  // e.g. dispatch { items: { action: "pop" } }
  if (action === "pop") {
    return prevArr.slice(0, -1);
  }

  // 6. Action: remove / filter - removes by id or index or value
  // e.g. dispatch { items: { action: "remove", id: "123" } }
  if (action === "remove" || action === "filter") {
    const target = typeof next === "object" && next !== null && "id" in next
      ? next.id
      : (typeof next === "object" && next !== null && "index" in next
        ? next.index
        : rawValue);
    return prevArr.filter((item, idx) => {
      if (typeof item === "object" && item !== null && "id" in item) {
        return item.id !== target;
      }
      return idx !== target && item !== target;
    });
  }

  // 7. Default update: when action is undefined, "", or "default" (appends items or replaces if array)
  // e.g. dispatch { items: [newItem] } or { items: newItem }
  if (!action || action === "" || action === "default") {
    if (Array.isArray(rawValue)) return rawValue;
    const hasItem = rawValue != null && (typeof rawValue !== "object" || Object.keys(rawValue).length > 0);
    return hasItem ? [...prevArr, rawValue] : prevArr;
  }

  return prevArr;
}`,
  object: `(prev, next) => {
  const current = (prev && typeof prev === "object" && !Array.isArray(prev)) ? prev : {};
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;

  // 1. Action: reset / clear - empties object
  // e.g. dispatch { profile: { action: "reset" } }
  if (action === "reset" || action === "clear") {
    return {};
  }

  // Extract payload cleanly (stripping action metadata so it never leaks into state)
  const payload = typeof next === "object" && next !== null && "value" in next && typeof next.value === "object" && next.value !== null
    ? next.value
    : (typeof next === "object" && next !== null ? next : {});

  // 2. Action: replace / set - overwrites entire object
  // e.g. dispatch { profile: { action: "replace", value: { status: "fresh" } } }
  if (action === "replace" || action === "set") {
    return { ...payload };
  }

  // 3. Default update: shallow merges keys (when action is undefined, "", "default", "update", "patch")
  // e.g. dispatch { profile: { status: "active" } }
  if (!action || action === "" || action === "default" || action === "update" || action === "patch") {
    return { ...current, ...payload };
  }

  return current;
}`,
  number: `(prev, next) => {
  const current = typeof prev === "number" && !Number.isNaN(prev) ? prev : 0;
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : next?.action;

  // Extract raw incoming value
  const rawValue = typeof next === "object" && next !== null && "value" in next
    ? next.value
    : next;
  const numValue = Number(rawValue);
  const isValidNum = !Number.isNaN(numValue) && rawValue !== undefined && rawValue !== null;

  // 1. Default update: when action is undefined, "", or "default" (adds delta or sets value)
  // e.g. dispatch { count: 1 } or { count: { value: 1 } }
  if (!action || action === "" || action === "default") {
    return isValidNum ? numValue : current;
  }

  // 2. Action: replace - explicitly replaces current number with new value
  // e.g. dispatch { count: { action: "replace", value: 42 } }
  if (action === "replace" || action === "set") {
    return isValidNum ? numValue : current;
  }

  // 3. Action: increment - adds amount (default 1)
  // e.g. dispatch { count: { action: "increment", amount: 1 } }
  if (action === "increment" || action === "add") {
    const step = isValidNum ? numValue : (typeof next === "object" && next !== null && "amount" in next ? Number(next.amount) || 1 : 1);
    return current + step;
  }

  // 4. Action: decrement - subtracts amount (default 1)
  // e.g. dispatch { count: { action: "decrement", amount: 1 } }
  if (action === "decrement" || action === "subtract") {
    const step = isValidNum ? numValue : (typeof next === "object" && next !== null && "amount" in next ? Number(next.amount) || 1 : 1);
    return current - step;
  }

  // 5. Action: reset - resets counter to 0 or target value
  // e.g. dispatch { count: { action: "reset" } }
  if (action === "reset" || action === "clear") {
    return isValidNum ? numValue : 0;
  }

  return current;
}`,
  counterActions: `(prev, next) => {
  const current = typeof prev === "number" && !Number.isNaN(prev) ? prev : 0;
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;

  const rawValue = typeof next === "object" && next !== null && "value" in next
    ? next.value
    : next;
  const numValue = Number(rawValue);
  const isValidNum = !Number.isNaN(numValue) && rawValue !== undefined && rawValue !== null;

  // 1. Default update: when action is undefined, "", or "default"
  if (!action || action === "" || action === "default") {
    return isValidNum ? numValue : current;
  }

  // 2. Action: replace - explicitly replaces current number
  if (action === "replace" || action === "set") {
    return isValidNum ? numValue : current;
  }

  // 3. Action: increment
  if (action === "increment" || action === "add") {
    const step = isValidNum ? numValue : (typeof next === "object" && next !== null && "amount" in next ? Number(next.amount) || 1 : 1);
    return current + step;
  }

  // 4. Action: decrement
  if (action === "decrement" || action === "subtract") {
    const step = isValidNum ? numValue : (typeof next === "object" && next !== null && "amount" in next ? Number(next.amount) || 1 : 1);
    return current - step;
  }

  // 5. Action: reset
  if (action === "reset" || action === "clear") {
    return isValidNum ? numValue : 0;
  }

  return current;
}`,
  string: `(prev, next) => {
  const current = typeof prev === "string" ? prev : "";
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : next?.action;

  // Extract raw incoming string
  const rawValue = typeof next === "object" && next !== null && "value" in next
    ? next.value
    : next;
  const incoming = rawValue !== undefined && rawValue !== null ? String(rawValue) : "";

  // 1. Action: replace / set - explicitly replaces current string
  // e.g. dispatch { notes: { action: "replace", value: "new text" } }
  if (action === "replace" || action === "set") {
    return incoming;
  }

  // 2. Action: append / concat - appends incoming text (supports optional separator)
  // e.g. dispatch { notes: { action: "append", value: "world" } }
  if (action === "append" || action === "concat") {
    const sep = typeof next === "object" && next !== null && "separator" in next && next.separator !== undefined ? String(next.separator) : "";
    return current ? \`\${current}\${sep}\${incoming}\` : incoming;
  }

  // 3. Action: prepend - adds incoming text before the current string
  // e.g. dispatch { notes: { action: "prepend", value: "[INFO] " } }
  if (action === "prepend") {
    const sep = typeof next === "object" && next !== null && "separator" in next && next.separator !== undefined ? String(next.separator) : "";
    return current ? \`\${incoming}\${sep}\${current}\` : incoming;
  }

  // 4. Action: reset / clear - clears the string
  // e.g. dispatch { notes: { action: "reset" } }
  if (action === "reset" || action === "clear") {
    return "";
  }

  // 5. Default update: concats incoming text directly (with optional separator)
  // e.g. dispatch { message: " second" }
  if (!action || action === "" || action === "default") {
    const sep = typeof next === "object" && next !== null && "separator" in next && next.separator !== undefined ? String(next.separator) : "";
    return current ? \`\${current}\${sep}\${incoming}\` : incoming;
  }

  return current;
}`,
  boolean: `(prev, next) => {
  const current = Boolean(prev);
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : undefined;

  // 1. Default update: when action is undefined, "", or "default"
  // e.g. dispatch { is_active: true }
  if (!action || action === "" || action === "default") {
    const val = typeof next === "object" && next !== null && "value" in next ? next.value : next;
    return val !== undefined ? Boolean(val) : false;
  }

  // 2. Action: replace - explicitly sets boolean value
  // e.g. dispatch { is_active: { action: "replace", value: false } }
  if (action === "replace" || action === "set") {
    const val = typeof next === "object" && next !== null && "value" in next ? next.value : next;
    return val !== undefined ? Boolean(val) : false;
  }

  // 3. Action: toggle - inverts boolean
  // e.g. dispatch { is_active: { action: "toggle" } }
  if (action === "toggle") {
    return !current;
  }

  // 4. Action: reset - resets to false
  // e.g. dispatch { is_active: { action: "reset" } }
  if (action === "reset" || action === "clear") {
    return false;
  }

  return current;
}`,
};

/**
 * Extracts fields from a CustomTypeItem, supporting:
 * 1. Explicit fields array
 * 2. Visual editor custom types
 * 3. Raw TypeScript interface / type code (regex parser)
 */
export function extractFieldsFromCustomType(
  customType?: CustomTypeItem | null,
): CustomTypeField[] {
  if (!customType) return [];

  // 1. Direct fields list from visual editor or package type
  if (Array.isArray(customType.fields) && customType.fields.length > 0) {
    return customType.fields.filter((f) => !f.isOmitted);
  }

  // 2. Parse from rawCode or typeAliasValue (e.g. interface / type definitions)
  const codeToParse = customType.rawCode || customType.typeAliasValue || "";
  if (!codeToParse) return [];

  let targetBlock = codeToParse;
  if (customType.name) {
    const blockRegex = new RegExp(
      `(?:interface|type)\\s+${customType.name}\\b[^{=]*[={]([^}]+)\\}?`,
      "s",
    );
    const blockMatch = blockRegex.exec(codeToParse);
    if (blockMatch && blockMatch[1]) {
      targetBlock = blockMatch[1];
    }
  }

  const fields: CustomTypeField[] = [];
  const fieldRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(\??)\s*:\s*([^;,\n}]+)/g;
  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(targetBlock)) !== null) {
    const fieldName = match[1]?.trim();
    if (
      !fieldName ||
      fieldName === "interface" ||
      fieldName === "type" ||
      fieldName === "export"
    ) {
      continue;
    }
    const isOpt = match[2] === "?";
    const rawType = match[3]?.trim() || "string";
    fields.push({
      id: fieldName,
      name: fieldName,
      type: rawType,
      required: !isOpt,
    });
  }
  return fields;
}

/**
 * Returns a safe default value literal string for a field based on its type.
 */
export function getDefaultValueForField(field: CustomTypeField): string {
  if (field.defaultValue !== undefined && field.defaultValue !== "") {
    const raw = String(field.defaultValue);
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'")) ||
      raw === "true" ||
      raw === "false" ||
      !Number.isNaN(Number(raw)) ||
      raw.startsWith("{") ||
      raw.startsWith("[")
    ) {
      return raw;
    }
    return JSON.stringify(raw);
  }
  if (field.required === false) {
    return "undefined";
  }
  if (Array.isArray(field.enumValues) && field.enumValues.length > 0) {
    return JSON.stringify(field.enumValues[0]);
  }
  const t = (field.type || "string").toLowerCase().trim();
  if (field.isArray || t.endsWith("[]") || t.startsWith("array<") || t === "array") {
    return "[]";
  }
  if (t === "number" || t === "float" || t === "int" || t === "integer") {
    return "0";
  }
  if (t === "boolean" || t === "bool") {
    return "false";
  }
  if (t === "string" || t === "text") {
    return '""';
  }
  if (t === "object" || t.startsWith("{") || t.startsWith("record<")) {
    return "{}";
  }
  if (t === "enum") {
    return '""';
  }
  if (field.type && field.type.includes("|")) {
    const parts = field.type.split("|").map((p) => p.trim());
    const firstLiteral = parts.find(
      (p) => (p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'")),
    );
    if (firstLiteral) {
      return firstLiteral;
    }
  }
  return '""';
}

/**
 * Generates an action-aware, schema-safe reducer for a custom type / interface.
 * Guarantees required properties exist and never outputs raw {} or leaked action metadata.
 */
export function generateSchemaAwareReducerCode(
  customType: CustomTypeItem,
): string {
  const fields = extractFieldsFromCustomType(customType);

  const initialLines = fields.length > 0
    ? fields.map((f) => `    ${f.name}: ${getDefaultValueForField(f)},`).join("\n") + "\n"
    : "";

  const replaceLines = fields.length > 0
    ? fields
        .map(
          (f) =>
            `      ${f.name}: "${f.name}" in payload && payload.${f.name} !== undefined ? payload.${f.name} : initial.${f.name},`,
        )
        .join("\n") + "\n"
    : "";

  const updateLines = fields.length > 0
    ? fields
        .map(
          (f) =>
            `      ${f.name}: "${f.name}" in payload && payload.${f.name} !== undefined ? payload.${f.name} : current.${f.name},`,
        )
        .join("\n") + "\n"
    : "";

  const typeLabel = customType.name ? ` for ${customType.name}` : "";

  return `(prev, next) => {
  // Initial shape guaranteed by type schema${typeLabel}
  const initial = {
${initialLines}  };

  const current = (prev && typeof prev === "object" && !Array.isArray(prev))
    ? { ...initial, ...prev }
    : { ...initial };

  const action = typeof next === "object" && next !== null && "action" in next ? next.action : next?.action;

  // 1. Action: reset / clear - resets back to typed initial values
  // e.g. dispatch { action: "reset" }
  if (action === "reset" || action === "clear") {
    return { ...initial };
  }

  // Extract payload cleanly (stripping action metadata so it never leaks into state)
  const rawPayload = typeof next === "object" && next !== null && "value" in next && typeof next.value === "object" && next.value !== null
    ? next.value
    : (typeof next === "object" && next !== null ? next : {});
  const { action: _unusedAction, ...payload } = rawPayload;

  // 2. Action: replace / set - overwrites with incoming values (defaults missing fields)
  // e.g. dispatch { action: "replace", value: { ... } }
  if (action === "replace" || action === "set") {
    return {
      ...payload,
${replaceLines}    };
  }

  // 3. Default update: shallow merges keys while preserving schema integrity
  // e.g. dispatch { id: "1" } or { action: "update", value: { name: "Alice" } }
  if (!action || action === "" || action === "default" || action === "update" || action === "patch") {
    return {
      ...current,
      ...payload,
${updateLines}    };
  }

  return current;
};`;
}

/**
 * Generates an action-aware, schema-safe array reducer for a custom type / interface.
 * Handles append, prepend, pop, remove by id/index, replace/set, and reset.
 */
export function generateSchemaAwareArrayReducerCode(
  customType: CustomTypeItem,
): string {
  const fields = extractFieldsFromCustomType(customType);
  const typeLabel = customType.name ? ` for ${customType.name}[]` : "";
  const idField = fields.find((f) => f.name === "id" || f.name === "_id")?.name || "id";

  return `(prev, next) => {
  // Array reducer${typeLabel}
  const prevArr = Array.isArray(prev) ? prev : [];
  const action = typeof next === "object" && next !== null && "action" in next ? next.action : next?.action;

  // 1. Action: reset / clear - resets array to empty
  // e.g. dispatch { action: "reset" }
  if (action === "reset" || action === "clear") {
    return [];
  }

  // Extract incoming payload cleanly (stripping action metadata)
  const rawValue = typeof next === "object" && next !== null && "value" in next
    ? next.value
    : next;

  // 2. Action: set / replace - overwrites entire array
  // e.g. dispatch { action: "set", value: [...] }
  if (action === "set" || action === "replace") {
    return Array.isArray(rawValue) ? rawValue : (rawValue != null ? [rawValue] : []);
  }

  // 3. Action: append / add - appends item(s) to array
  // e.g. dispatch { action: "append", value: newItem }
  if (action === "append" || action === "add") {
    const items = Array.isArray(rawValue) ? rawValue : (rawValue != null ? [rawValue] : []);
    return [...prevArr, ...items];
  }

  // 4. Action: prepend - adds item(s) to front of array
  // e.g. dispatch { action: "prepend", value: newItem }
  if (action === "prepend") {
    const items = Array.isArray(rawValue) ? rawValue : (rawValue != null ? [rawValue] : []);
    return [...items, ...prevArr];
  }

  // 5. Action: pop - removes last element
  // e.g. dispatch { action: "pop" }
  if (action === "pop") {
    return prevArr.slice(0, -1);
  }

  // 6. Action: remove / filter - removes item by id or index
  // e.g. dispatch { action: "remove", id: "123" } or { action: "remove", value: 0 }
  if (action === "remove" || action === "filter") {
    const target = typeof next === "object" && next !== null && "id" in next
      ? next.id
      : (typeof next === "object" && next !== null && "index" in next
        ? next.index
        : (typeof rawValue === "object" && rawValue !== null && "${idField}" in rawValue ? rawValue.${idField} : rawValue));
    return prevArr.filter((item, idx) => {
      if (typeof item === "object" && item !== null && "${idField}" in item) {
        return item.${idField} !== target;
      }
      return idx !== target && item !== target;
    });
  }

  // 7. Default update: appends item(s) or replaces if an array is passed directly
  // e.g. dispatch [item1, item2] or dispatch newItem
  if (!action || action === "" || action === "default") {
    if (Array.isArray(rawValue)) return rawValue;
    const hasItem = rawValue != null && (typeof rawValue !== "object" || Object.keys(rawValue).length > 0);
    return hasItem ? [...prevArr, rawValue] : prevArr;
  }

  return prevArr;
};`;
}

export function getSuggestedReducerCodeForChannelType(
  type?: string,
  customTypeSchema?: CustomTypeItem | null,
  isArray?: boolean,
): string {
  const cleanType = (type || "string").trim();
  const isTargetArray = Boolean(
    isArray ||
    cleanType.endsWith("[]") ||
    cleanType.toLowerCase() === "array" ||
    cleanType.toLowerCase().startsWith("array<")
  );

  // 1. Array of custom type schema
  if (isTargetArray && customTypeSchema) {
    return generateSchemaAwareArrayReducerCode(customTypeSchema);
  }

  // 2. Single object of custom type schema
  if (!isTargetArray && customTypeSchema) {
    const schemaCode = generateSchemaAwareReducerCode(customTypeSchema);
    if (schemaCode) return schemaCode;
  }

  // 3. Messages / Chat
  if (
    cleanType === "messages" ||
    cleanType === "BaseMessage" ||
    cleanType === "BaseMessage[]" ||
    cleanType === "HumanMessage" ||
    cleanType === "HumanMessage[]" ||
    cleanType === "AIMessage" ||
    cleanType === "AIMessage[]" ||
    cleanType === "SystemMessage" ||
    cleanType === "SystemMessage[]"
  ) {
    return REDUCER_CODE_PRESETS.chat;
  }

  // 4. Array (generic or primitive[])
  if (isTargetArray) {
    return REDUCER_CODE_PRESETS.array;
  }

  // 5. Primitive number
  if (cleanType === "number") {
    return REDUCER_CODE_PRESETS.number;
  }

  // 6. Primitive object or json
  if (cleanType === "object" || cleanType === "json") {
    return REDUCER_CODE_PRESETS.object;
  }

  // 7. Primitive string
  if (cleanType === "string") {
    return REDUCER_CODE_PRESETS.string;
  }

  // 8. Primitive boolean
  if (cleanType === "boolean") {
    return REDUCER_CODE_PRESETS.boolean;
  }

  return DEFAULT_REDUCER_CODE;
}

/**
 * Checks whether a given custom reducer code is compatible with the channel's type.
 * Used to detect when a channel type changed (e.g. from string to number) so that an
 * incompatible preset (e.g. string multiline concatenation) is automatically refreshed.
 */
export function isReducerCodeCompatibleWithType(
  code?: string,
  type?: string,
  isArray?: boolean,
): boolean {
  if (!code || typeof code !== "string" || !code.trim()) return false;
  if (!type) return true;

  const clean = type.trim();
  const isTargetArray = Boolean(
    isArray ||
    clean.endsWith("[]") ||
    clean.toLowerCase() === "array" ||
    clean.toLowerCase().startsWith("array<")
  );

  if (isTargetArray) {
    if (
      code.includes('typeof prev === "string"') ||
      code.includes('typeof prev === "number"') ||
      code.includes("Boolean(prev)")
    ) {
      return false;
    }
    return true;
  }

  if (clean === "number") {
    // If code has string-specific concatenation or array-specific functions, it's incompatible with number
    if (
      code.includes('typeof prev === "string"') ||
      code.includes("Array.isArray(prev)") ||
      code.includes("${current}\\n") ||
      code.includes("Boolean(prev)")
    ) {
      return false;
    }
    return true;
  }

  if (clean === "string") {
    if (
      code.includes('typeof prev === "number"') ||
      code.includes("Array.isArray(prev)") ||
      code.includes("Boolean(prev)")
    ) {
      return false;
    }
    return true;
  }

  if (clean === "boolean") {
    if (
      code.includes('typeof prev === "string"') ||
      code.includes('typeof prev === "number"') ||
      code.includes("Array.isArray(prev)")
    ) {
      return false;
    }
    return true;
  }

  if (clean === "object" || clean === "json") {
    if (
      code.includes('typeof prev === "string"') ||
      code.includes('typeof prev === "number"') ||
      code.includes("Boolean(prev)")
    ) {
      return false;
    }
    return true;
  }

  return true;
}

export interface ReducerActionMeta {
  action: string;
  label: string;
  description: string;
  requiresValue: boolean;
}

/**
 * Checks if an action is typically valueless (e.g. reset, clear, toggle).
 */
export function isValuelessAction(action?: string): boolean {
  if (!action) return false;
  const lower = action.toLowerCase().trim();
  return (
    lower === "reset" ||
    lower === "clear" ||
    lower === "toggle" ||
    lower === "empty" ||
    lower.startsWith("clear_") ||
    lower.startsWith("reset_")
  );
}

/**
 * Extracts action names from custom reducer JavaScript code.
 * Detects patterns like:
 * - action === "name" or action == "name"
 * - "name" === action
 * - case "name":
 * - ["reset", "clear"].includes(action)
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
 * Returns formatted action metadata for an action name.
 */
export function getActionMetadata(
  action: string,
  _channelType?: string,
): ReducerActionMeta {
  const isValueless = isValuelessAction(action);
  const hint = isValueless ? "(no value)" : "(value)";
  let label = `${action} ${hint}`;
  let desc = `Dispatches { action: "${action}" }`;

  if (action === "default") {
    label = "default (direct)";
    desc = "Standard reducer update passing value directly";
  }

  return {
    action,
    label,
    description: desc,
    requiresValue: !isValueless,
  };
}

/**
 * Returns the list of available actions for a channel.
 * If custom reducer code is present, it returns ONLY the auto-detected actions (plus default).
 */
export function getActionsForReducer(
  channelType?: string,
  reducerName?: string,
  customCode?: string,
): ReducerActionMeta[] {
  const actions: ReducerActionMeta[] = [];
  const seen = new Set<string>();

  const add = (meta: ReducerActionMeta) => {
    if (!seen.has(meta.action)) {
      seen.add(meta.action);
      actions.push(meta);
    }
  };

  // 1. Default update action (always first)
  add({
    action: "default",
    label: "default (direct)",
    description: "Standard reducer update passing value directly",
    requiresValue: true,
  });

  // 2. Extract actions from custom reducer code or preset code for channel type
  // Extracts THOSE ACTIONS ALONE matching ChannelReducerConfig!
  const effectiveCode =
    customCode && typeof customCode === "string" && customCode.trim()
      ? customCode
      : getSuggestedReducerCodeForChannelType(channelType);

  if (effectiveCode) {
    const detected = extractActionsFromReducerCode(effectiveCode);
    if (detected.length > 0) {
      for (const act of detected) {
        add(getActionMetadata(act, channelType));
      }
      return actions;
    }
  }

  // 3. Built-in reducers
  if (reducerName === "replace") {
    add(getActionMetadata("replace", channelType));
    return actions;
  }
  if (reducerName === "add_messages") {
    add(getActionMetadata("append", channelType));
    add(getActionMetadata("replace", channelType));
    add(getActionMetadata("reset", channelType));
    return actions;
  }
  if (reducerName === "append" || reducerName === "concat_array") {
    add(getActionMetadata("append", channelType));
    add(getActionMetadata("replace", channelType));
    add(getActionMetadata("reset", channelType));
    add(getActionMetadata("clear", channelType));
    return actions;
  }
  if (reducerName === "merge_object") {
    add(getActionMetadata("merge", channelType));
    add(getActionMetadata("replace", channelType));
    add(getActionMetadata("reset", channelType));
    add(getActionMetadata("clear", channelType));
    return actions;
  }

  // 4. Fallback type-specific actions ONLY if no specific reducer code was found
  if (channelType === "number") {
    add(getActionMetadata("increment", channelType));
    add(getActionMetadata("decrement", channelType));
    add(getActionMetadata("replace", channelType));
    add(getActionMetadata("reset", channelType));
  } else if (channelType === "boolean") {
    add(getActionMetadata("toggle", channelType));
    add(getActionMetadata("replace", channelType));
    add(getActionMetadata("reset", channelType));
  } else if (channelType === "array" || channelType === "messages") {
    add(getActionMetadata("append", channelType));
    add(getActionMetadata("replace", channelType));
    add(getActionMetadata("reset", channelType));
    add(getActionMetadata("clear", channelType));
  } else if (channelType === "object") {
    add(getActionMetadata("merge", channelType));
    add(getActionMetadata("replace", channelType));
    add(getActionMetadata("reset", channelType));
  } else if (channelType === "string") {
    add(getActionMetadata("replace", channelType));
    add(getActionMetadata("reset", channelType));
    add(getActionMetadata("clear", channelType));
  } else {
    add(getActionMetadata("replace", channelType));
    add(getActionMetadata("reset", channelType));
  }

  return actions;
}

/**
 * Gathers and prioritizes custom types from canvas nodes.
 * User-created types in standalone TypesNode take FIRST priority,
 * followed by Service Types, Database Entity Types, and external Package Types (e.g. @workspace/langgraph-agent).
 */
export function getAvailableCustomTypes(
  nodes: Array<{ type?: string; data?: any; id?: string }>,
): CustomTypeItem[] {
  const userTypes: CustomTypeItem[] = [];
  const serviceTypes: CustomTypeItem[] = [];
  const entityTypes: CustomTypeItem[] = [];
  const packageTypes: CustomTypeItem[] = [];

  nodes.forEach((n) => {
    if (n.type !== "types" || !Array.isArray(n.data?.types)) return;

    const isServiceDerived = Boolean(
      n.data?.isServiceEndpointSchemas ||
        n.data?.sourceServiceId ||
        (typeof n.id === "string" && n.id.startsWith("types-service-")),
    );
    const isEntitySchemas = Boolean(
      n.data?.isEntitySchemas ||
        n.id === "types-entity-schemas" ||
        n.data?.sourceEntityId ||
        n.data?.label === "Entity Types",
    );
    const isPackageNode = Boolean(
      n.data?.isPackageNode ||
        (n.data?.packageSources && n.data.packageSources.length > 0 && !n.data?.isExtended) ||
        n.data?.packageName,
    );

    n.data.types.forEach((t: CustomTypeItem) => {
      if (!t || !t.name) return;
      if (isServiceDerived) {
        if (!serviceTypes.some((ex) => ex.id === t.id)) serviceTypes.push(t);
      } else if (isEntitySchemas) {
        if (!entityTypes.some((ex) => ex.id === t.id)) entityTypes.push(t);
      } else if (isPackageNode) {
        if (!packageTypes.some((ex) => ex.id === t.id)) packageTypes.push(t);
      } else {
        if (!userTypes.some((ex) => ex.id === t.id)) userTypes.push(t);
      }
    });
  });

  // User-created custom types take precedence over package/agent types!
  return [...userTypes, ...serviceTypes, ...entityTypes, ...packageTypes];
}

/**
 * Resolves the matching CustomTypeItem for a field.
 * Prefers exact matching by typeId if present, otherwise finds by type name
 * using the prioritized availableTypes list.
 */
export function resolveCustomType({
  availableTypes,
  typeName,
  typeId,
}: {
  availableTypes: CustomTypeItem[];
  typeName?: string;
  typeId?: string;
}): CustomTypeItem | undefined {
  if (typeId) {
    const byId = availableTypes.find((t) => t.id === typeId);
    if (byId) return byId;
  }
  if (!typeName) return undefined;
  const clean = typeName.replace(/\[\]$/, "").trim();
  return availableTypes.find((t) => t.name === clean);
}

