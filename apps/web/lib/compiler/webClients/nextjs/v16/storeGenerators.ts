import {
  CompiledFile,
  CustomTypeField,
  CustomTypeItem,
  GlobalStoreDefinition,
  GlobalStoreField,
  StateVariableType,
} from "@workspace/canvas/types";
import { toSingular, toPlural } from "../../../utils";

export function toPascalCase(str: string): string {
  const clean = str.trim();
  if (!clean) return "App";
  if (/[\s\-_]/.test(clean)) {
    return clean
      .split(/[\s\-_]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function toCamelCase(str: string): string {
  const clean = str.trim();
  if (!clean) return "app";
  if (/[\s\-_]/.test(clean)) {
    const words = clean.split(/[\s\-_]+/);
    return words[0]!.toLowerCase() + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }
  return clean.charAt(0).toLowerCase() + clean.slice(1);
}

export const STANDARD_TS_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "unknown",
  "any",
  "void",
  "null",
  "undefined",
  "never",
  "Date",
  "object",
  "array",
  "unknown[]",
  "any[]",
  "Record<string, unknown>",
  "Record<string, any>",
]);

function isArrayField(f: { type?: string; isArray?: boolean }): boolean {
  return Boolean(f.isArray || f.type === "array" || f.type?.endsWith("[]"));
}

function isCustomTypeField(f: { type?: string; isArray?: boolean }): boolean {
  if (isArrayField(f)) return false;
  const rawType = (f.type || "string").trim();
  const baseType = rawType.replace(/\[\]$/, "").trim();
  return Boolean(baseType && !STANDARD_TS_TYPES.has(baseType) && !STANDARD_TS_TYPES.has(rawType));
}

function mapFieldTypeToTs(type: StateVariableType | string): string {
  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "unknown[]";
    case "object":
      return "Record<string, unknown>";
    case "any":
      return "any";
    case "unknown":
      return "unknown";
    default:
      return type || "unknown";
  }
}

function extractFieldsFromCustomType(customType?: CustomTypeItem | null): CustomTypeField[] {
  if (!customType) return [];
  if (Array.isArray(customType.fields) && customType.fields.length > 0) {
    return customType.fields.filter((f) => !f.isOmitted);
  }
  const codeToParse = customType.rawCode || customType.typeAliasValue || "";
  if (!codeToParse) return [];
  let targetBlock = codeToParse;
  if (customType.name) {
    const blockRegex = new RegExp(`(?:interface|type)\\s+${customType.name}\\b[^{=]*[={]([^}]+)\\}?`, "s");
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
    if (!fieldName || fieldName === "interface" || fieldName === "type" || fieldName === "export") {
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

function getAllowedEnumValues(field?: CustomTypeField | null): string[] {
  if (!field) return [];
  if (Array.isArray(field.enumValues) && field.enumValues.length > 0) {
    return field.enumValues;
  }
  if (field.type && field.type.includes("|")) {
    const parts = field.type.split("|").map((p) => p.trim());
    const literals = parts
      .map((p) => {
        const match = p.match(/^["']([^"']+)["']$/);
        return match ? match[1] : null;
      })
      .filter((v): v is string => Boolean(v));
    if (literals.length > 0) {
      return literals;
    }
  }
  return [];
}

function isPrimitiveType(type?: string): boolean {
  const clean = (type || "").replace(/\[\]$/, "").toLowerCase().trim();
  return ["string", "number", "boolean", "any", "unknown"].includes(clean);
}

function getDefaultValueForCustomField(field: CustomTypeField): string {
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

function formatDefaultValue(field: GlobalStoreField): string {
  const isArray = isArrayField(field);
  const isCustom = isCustomTypeField(field);

  if (isArray) {
    if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "") {
      try {
        const parsed = typeof field.defaultValue === "string" ? JSON.parse(field.defaultValue) : field.defaultValue;
        if (Array.isArray(parsed)) return JSON.stringify(parsed);
      } catch {}
    }
    return "[]";
  }

  if (isCustom) {
    if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "") {
      try {
        const parsed = typeof field.defaultValue === "string" ? JSON.parse(field.defaultValue) : field.defaultValue;
        if (typeof parsed === "object" && parsed !== null) {
          return JSON.stringify(parsed);
        }
      } catch {}
    }
    return "null";
  }

  if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "") {
    if (field.type === "number") {
      const num = Number(field.defaultValue);
      return !isNaN(num) ? String(num) : "0";
    }
    if (field.type === "boolean") {
      return String(field.defaultValue === true || field.defaultValue === "true");
    }
    if (field.type === "object") {
      try {
        const parsed = typeof field.defaultValue === "string" ? JSON.parse(field.defaultValue) : field.defaultValue;
        if (typeof parsed === "object" && parsed !== null) return JSON.stringify(parsed);
      } catch {}
      return "{}";
    }
    if (field.type === "string") {
      return JSON.stringify(String(field.defaultValue));
    }
    try {
      return JSON.stringify(field.defaultValue);
    } catch {
      // fallback
    }
  }

  switch (field.type) {
    case "string":
      return '""';
    case "number":
      return "0";
    case "boolean":
      return "false";
    case "array":
      return "[]";
    case "object":
      return "{}";
    default:
      return "null";
  }
}

function toKebabCase(str: string): string {
  const clean = str.trim();
  if (!clean) return "app";
  return clean
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

export function generateZustandStore(
  store: GlobalStoreDefinition,
  options?: { filePath?: string; customTypes?: CustomTypeItem[] }
): CompiledFile {
  const baseName = toPascalCase(store.name || "App");
  const storeCompName = baseName.endsWith("Store") ? baseName : `${baseName}Store`;
  const hookName = `use${storeCompName}`;
  const interfaceName = `${storeCompName}State`;

  const fields = store.fields && store.fields.length > 0 ? store.fields : [
    { id: "field-state", name: "value", type: "string" as StateVariableType, defaultValue: "" }
  ];

  const resolveFieldType = (f: GlobalStoreField): string => {
    let rawTs: string;
    if (isArrayField(f)) {
      if (f.type?.endsWith("[]")) {
        rawTs = f.type;
      } else if (f.type === "array") {
        if (
          f.name === "navItems" ||
          (typeof f.defaultValue === "string" && f.defaultValue.includes('"link"') && f.defaultValue.includes('"name"')) ||
          (Array.isArray(f.defaultValue) && f.defaultValue.some((it) => typeof it === "object" && it !== null && ("name" in it || "link" in it)))
        ) {
          rawTs = "{ id?: string; name?: string; link?: string; icon?: string }[]";
        } else {
          rawTs = "unknown[]";
        }
      } else {
        const base = mapFieldTypeToTs(f.type);
        rawTs = base === "unknown" ? "unknown[]" : `${base}[]`;
      }
    } else {
      rawTs = mapFieldTypeToTs(f.type);
    }
    const isCustom = isCustomTypeField(f);
    const isNullable = isCustom || f.required === false;
    return isNullable ? `${rawTs} | null` : rawTs;
  };

  // TypeScript fields
  const fieldTypeLines = fields.map((f) => {
    const fName = toCamelCase(f.name);
    const tsType = resolveFieldType(f);
    return `  ${fName}: ${tsType};`;
  });

  const disabledManipulators = new Set([
    ...(store.disabledDefaultManipulators || []),
    ...(store.deletedDefaultManipulators || []),
  ]);

  const actionNames = new Set((store.actions || []).map((a) => toCamelCase(a.name)));
  const activeSetterFields = fields.filter((f) => {
    const fPascal = toPascalCase(f.name);
    const setterName = `set${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(setterName));
    const isDisabled =
      disabledManipulators.has(setterName) || disabledManipulators.has(`setter-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  // Default setters for fields not overridden or disabled
  const setterLines = activeSetterFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    const tsType = resolveFieldType(f);
    return `  set${fPascal}: (value: ${tsType}) => void;`;
  });

  const isStringField = (f: { type?: string }) => f.type === "string";

  const activeAppendFields = fields.filter((f) => {
    if (!isArrayField(f) && !isStringField(f) && !f.actions?.includes("append")) return false;
    const fPascal = toPascalCase(f.name);
    const appendName = `append${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(appendName));
    const isDisabled =
      disabledManipulators.has(appendName) || disabledManipulators.has(`append-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const appendLines = activeAppendFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    let itemTsType = "string";
    if (isArrayField(f)) {
      if (f.type.endsWith("[]")) {
        itemTsType = f.type.slice(0, -2);
      } else if (
        f.name === "navItems" ||
        (typeof f.defaultValue === "string" && f.defaultValue.includes('"link"') && f.defaultValue.includes('"name"')) ||
        (Array.isArray(f.defaultValue) && f.defaultValue.some((it) => typeof it === "object" && it !== null && ("name" in it || "link" in it)))
      ) {
        itemTsType = "{ id?: string; name?: string; link?: string; icon?: string }";
      } else {
        itemTsType = "unknown";
      }
    } else if (f.type === "string") {
      itemTsType = "string";
    } else {
      itemTsType = mapFieldTypeToTs(f.type);
    }
    return `  append${fPascal}: (item?: ${itemTsType}) => void;`;
  });

  const activePopFields = fields.filter((f) => {
    if (!isArrayField(f)) return false;
    const fPascal = toPascalCase(f.name);
    const popName = `pop${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(popName));
    const isDisabled =
      disabledManipulators.has(popName) || disabledManipulators.has(`pop-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const popLines = activePopFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    return `  pop${fPascal}: () => void;`;
  });

  const activeRemoveFields = fields.filter((f) => {
    if (!isArrayField(f) && !f.actions?.includes("remove")) return false;
    const fPascal = toPascalCase(f.name);
    const removeName = `remove${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(removeName));
    const isDisabled =
      disabledManipulators.has(removeName) || disabledManipulators.has(`remove-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const removeLines = activeRemoveFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    return `  remove${fPascal}: (indexOrId?: string | number) => void;`;
  });

  const isBooleanField = (f: { type?: string }) => f.type === "boolean";
  const activeToggleFields = fields.filter((f) => {
    if (!isBooleanField(f) && !f.actions?.includes("toggle")) return false;
    const fPascal = toPascalCase(f.name);
    const toggleName = `toggle${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(toggleName));
    const isDisabled =
      disabledManipulators.has(toggleName) || disabledManipulators.has(`toggle-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const toggleLines = activeToggleFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    return `  toggle${fPascal}: () => void;`;
  });

  const isNumberField = (f: { type?: string }) => f.type === "number";
  const activeIncrementFields = fields.filter((f) => {
    if (!isNumberField(f) && !f.actions?.includes("increment")) return false;
    const fPascal = toPascalCase(f.name);
    const incName = `increment${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(incName));
    const isDisabled =
      disabledManipulators.has(incName) || disabledManipulators.has(`increment-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const incrementLines = activeIncrementFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    return `  increment${fPascal}: (amount?: number) => void;`;
  });

  const activeDecrementFields = fields.filter((f) => {
    if (!isNumberField(f) && !f.actions?.includes("decrement")) return false;
    const fPascal = toPascalCase(f.name);
    const decName = `decrement${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(decName));
    const isDisabled =
      disabledManipulators.has(decName) || disabledManipulators.has(`decrement-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const decrementLines = activeDecrementFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    return `  decrement${fPascal}: (amount?: number) => void;`;
  });

  const isObjectField = (f: { type?: string; isArray?: boolean }) =>
    f.type === "object" || f.type === "Record<string, unknown>" || isCustomTypeField(f);
  const activePrependFields = fields.filter((f) => {
    if (!isStringField(f) && !isArrayField(f) && !f.actions?.includes("prepend")) return false;
    const fPascal = toPascalCase(f.name);
    const prepName = `prepend${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(prepName));
    const isDisabled =
      disabledManipulators.has(prepName) || disabledManipulators.has(`prepend-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const prependLines = activePrependFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    const itemTsType = isArrayField(f)
      ? (f.type.endsWith("[]")
          ? f.type.slice(0, -2)
          : (f.name === "navItems" ||
             (typeof f.defaultValue === "string" && f.defaultValue.includes('"link"') && f.defaultValue.includes('"name"')) ||
             (Array.isArray(f.defaultValue) && f.defaultValue.some((it) => typeof it === "object" && it !== null && ("name" in it || "link" in it))))
            ? "{ id?: string; name?: string; link?: string; icon?: string }"
            : "unknown")
      : "string";
    return `  prepend${fPascal}: (item?: ${itemTsType}) => void;`;
  });

  const activeUpdateFields = fields.filter((f) => {
    if (isArrayField(f)) {
      if (isPrimitiveType(f.type)) return false;
      if (!f.actions?.includes("update")) return false;
    } else {
      if (!isObjectField(f) && !f.actions?.includes("update")) return false;
    }
    const fPascal = toPascalCase(f.name);
    const updateName = `update${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(updateName));
    const isDisabled =
      disabledManipulators.has(updateName) || disabledManipulators.has(`update-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const updateLines = activeUpdateFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    if (isArrayField(f)) {
      const itemTs = f.type.endsWith("[]") ? f.type.slice(0, -2) : "Record<string, unknown>";
      return `  update${fPascal}: (patch?: Partial<${itemTs}> | Record<string, unknown> | null) => void;`;
    }
    const baseTs = mapFieldTypeToTs(f.type);
    return `  update${fPascal}: (patch?: Partial<${baseTs}> | Record<string, unknown> | null) => void;`;
  });

  const isMessageField = (f: { name: string; type?: string }) =>
    f.name.toLowerCase().includes("message") ||
    f.name.toLowerCase().includes("chat") ||
    (f.type || "").toLowerCase().includes("message");

  const isStreamableField = (f: GlobalStoreField) => {
    const isArr = isArrayField(f);
    if (!isArr) {
      return isStringField(f) && Boolean(f.actions?.includes("stream"));
    }
    const cleanBase = (f.type || "").replace(/\[\]$/, "").trim().toLowerCase();
    if (["string", "number", "boolean", "any", "unknown"].includes(cleanBase)) {
      return false;
    }
    const matchedCustom = (options?.customTypes || store.customTypes || []).find(
      (ct) => ct.id === f.customTypeId || ct.name.toLowerCase() === cleanBase,
    );
    if (matchedCustom) {
      const typeName = (matchedCustom.name || "").toLowerCase();
      const isNamedMsg = typeName.includes("message") || typeName.includes("chat");
      const schemaFields = extractFieldsFromCustomType(matchedCustom);
      const hasContent = schemaFields.some((sf) =>
        ["content", "text", "delta", "chunk", "body"].includes(sf.name.toLowerCase()),
      );
      const hasSenderOrRole = schemaFields.some((sf) =>
        ["sender", "role", "author", "speaker"].includes(sf.name.toLowerCase()),
      );
      const hasStreaming = schemaFields.some((sf) =>
        ["streaming", "isstreaming"].includes(sf.name.toLowerCase()),
      );
      return (isNamedMsg && hasContent) || (hasContent && (hasSenderOrRole || hasStreaming));
    }
    return cleanBase.includes("message") || cleanBase.includes("chat");
  };

  const activeStreamFields = fields.filter((f) => {
    if (!isStreamableField(f)) return false;
    const fPascal = toPascalCase(f.name);
    const streamName = `stream${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(streamName));
    const isDisabled =
      disabledManipulators.has(streamName) || disabledManipulators.has(`stream-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const streamLines = activeStreamFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    return `  stream${fPascal}: (chunkOrDelta?: { delta?: string; chunk?: string; text?: string; done?: boolean; id?: string; role?: string; sender?: string } | string) => void;`;
  });

  const resetFieldLines = fields
    .filter((f) => {
      if (!f.actions?.includes("reset")) return false;
      const fPascal = toPascalCase(f.name);
      const resetName = `reset${fPascal}`;
      return !actionNames.has(toCamelCase(resetName)) && !disabledManipulators.has(resetName);
    })
    .map((f) => `  reset${toPascalCase(f.name)}: () => void;`);

  // Target unwrap field for collection responses (e.g. API returning { data: [...] } into a store field)
  const rawBase = baseName.replace(/Store$/i, "");
  const pluralName = toCamelCase(toPlural(rawBase));
  const storeFieldNames = fields.map((f) => toCamelCase(f.name));
  const hasFieldNamedData = storeFieldNames.includes("data");
  const arrayFields = fields
    .filter((f) => f.type === "array" || f.type.endsWith("[]"))
    .map((f) => toCamelCase(f.name));
  const targetUnwrapField =
    !hasFieldNamedData
      ? storeFieldNames.includes(pluralName)
        ? pluralName
        : arrayFields.length === 1
        ? arrayFields[0]
        : null
      : null;

  // Custom action types
  const customActionSignatures: string[] = [];
  const customActionImpls: string[] = [];

  (store.actions || []).forEach((act) => {
    const actName = toCamelCase(act.name);
    if (!actName) return;

    const targetField = fields.find((f) => f.id === act.targetFieldId) || fields[0]!;
    const targetName = toCamelCase(targetField.name);
    const tsType = mapFieldTypeToTs(targetField.type);

    switch (act.actionType) {
      case "set": {
        const hasParams = Array.isArray(act.parameters) && act.parameters.length > 0;
        const paramSigs = hasParams
          ? act.parameters!
              .map((p) => `${toCamelCase(p.name)}: ${mapFieldTypeToTs(p.type)}${p.required === false ? " | undefined" : ""}`)
              .join(", ")
          : `value: ${tsType}`;
        const paramArgs = hasParams
          ? act.parameters!.map((p) => toCamelCase(p.name)).join(", ")
          : "value";

        customActionSignatures.push(`  ${actName}: (${paramSigs}) => void;`);
        if (act.code && act.code.trim()) {
          const rawCode = act.code.trim();
          const bodyLines = rawCode.split("\n").map((line) => `    ${line}`).join("\n");
          customActionImpls.push(`  ${actName}: (${paramArgs}) => {\n${bodyLines}\n  },`);
        } else {
          customActionImpls.push(`  ${actName}: (${paramArgs}) => set({ ${targetName}: ${paramArgs} }),`);
        }
        break;
      }
      case "append": {
        const itemTsType = targetField.type === "string"
          ? "string"
          : targetField.type === "number"
          ? "number"
          : targetField.type === "boolean"
          ? "boolean"
          : targetField.type.endsWith("[]")
          ? targetField.type.slice(0, -2)
          : targetField.type === "array"
          ? "unknown"
          : mapFieldTypeToTs(targetField.type);
        const hasParams = Array.isArray(act.parameters) && act.parameters.length > 0;
        const paramSigs = hasParams
          ? act.parameters!
              .map((p) => `${toCamelCase(p.name)}: ${mapFieldTypeToTs(p.type)}${p.required === false ? " | undefined" : ""}`)
              .join(", ")
          : `item: ${itemTsType}`;
        const paramArgs = hasParams
          ? act.parameters!.map((p) => toCamelCase(p.name)).join(", ")
          : "item";
        customActionSignatures.push(`  ${actName}: (${paramSigs}) => void;`);
        if (act.code && act.code.trim()) {
          const rawCode = act.code.trim();
          const bodyLines = rawCode.split("\n").map((line) => `    ${line}`).join("\n");
          const payloadAlias = hasParams ? "" : "    const payload = item;\n";
          customActionImpls.push(`  ${actName}: (${paramArgs}) => {\n${payloadAlias}${bodyLines}\n  },`);
        } else {
          customActionImpls.push(`  ${actName}: (item) => set((s) => ({ ${targetName}: Array.isArray(s.${targetName}) ? [...s.${targetName}, item] : [item] })),`);
        }
        break;
      }
      case "remove": {
        const hasParams = Array.isArray(act.parameters) && act.parameters.length > 0;
        const paramSigs = hasParams
          ? act.parameters!
              .map((p) => `${toCamelCase(p.name)}: ${mapFieldTypeToTs(p.type)}${p.required === false ? " | undefined" : ""}`)
              .join(", ")
          : `indexOrId: string | number`;
        const paramArgs = hasParams
          ? act.parameters!.map((p) => toCamelCase(p.name)).join(", ")
          : "indexOrId";
        customActionSignatures.push(`  ${actName}: (${paramSigs}) => void;`);
        if (act.code && act.code.trim()) {
          const rawCode = act.code.trim();
          const bodyLines = rawCode.split("\n").map((line) => `    ${line}`).join("\n");
          const payloadAlias = hasParams ? "" : "    const payload = indexOrId;\n";
          customActionImpls.push(`  ${actName}: (${paramArgs}) => {\n${payloadAlias}${bodyLines}\n  },`);
        } else {
          const targetCleanBase = (targetField.type || "").replace(/\[\]$/, "").trim();
          const isTargetPrimitive = isPrimitiveType(targetCleanBase);
          const removeFilter = isTargetPrimitive
            ? `idx !== indexOrId && it !== indexOrId`
            : `idx !== indexOrId && !(typeof it === "object" && it !== null && "id" in it && it.id === indexOrId)`;
          customActionImpls.push(`  ${actName}: (indexOrId) => set((s) => ({ ${targetName}: Array.isArray(s.${targetName}) ? s.${targetName}.filter((it, idx) => ${removeFilter}) : [] })),`);
        }
        break;
      }
      case "toggle": {
        customActionSignatures.push(`  ${actName}: () => void;`);
        if (act.code && act.code.trim()) {
          const rawCode = act.code.trim();
          const bodyLines = rawCode.split("\n").map((line) => `    ${line}`).join("\n");
          customActionImpls.push(`  ${actName}: () => {\n${bodyLines}\n  },`);
        } else {
          customActionImpls.push(`  ${actName}: () => set((s) => ({ ${targetName}: !s.${targetName} })),`);
        }
        break;
      }
      case "increment": {
        if (act.code && act.code.trim()) {
          let rawCode = act.code.trim();

          // Detect custom code that treats `payload` as an object (Item Map / merge patterns).
          // If the snippet contains `payload.`, `payload?.`, or `...payload`, the developer
          // intended an object payload — not the numeric `amount` the increment type normally uses.
          const usesObjectPayload =
            /\bpayload\s*[?.]/.test(rawCode) || /\.\.\.\s*payload\b/.test(rawCode);

          if (usesObjectPayload) {
            // Derive the element type of the target array field (same logic as "append" case).
            // Using the item type (e.g. `Conversation`) rather than the store-state type
            // keeps the spread result typed as `Conversation`, avoiding TS2345 when the
            // array element type has `id: string` but the state type would widen it to
            // `id: string | number` via intersection.
            const itemTsType = targetField.type.endsWith("[]")
              ? targetField.type.slice(0, -2)
              : targetField.type === "array"
              ? "object"
              : mapFieldTypeToTs(targetField.type);

            // Re-type: replace the hardcoded generic field name "items" with the actual
            // target field, and make all payload property accesses optional-chain safe.
            rawCode = rawCode
              .replace(/\bs\.items\b/g, `s.${targetName}`)
              .replace(/\bitems\s*:/g, `${targetName}:`)
              .replace(/\bpayload\./g, `payload?.`)
              // `payload` is now optional — spreading `undefined` is TS2698.
              // Default to an empty object so the spread stays object-only.
              .replace(/\.\.\.\s*payload\b/g, `...(payload ?? {})`);

            // Payload is the item type (optional). Using `ItemType` (not partial) ensures
            // that `{ ...item, ...(payload ?? {}) }` stays typed as `ItemType`, not a
            // union that widens required properties to optional.
            customActionSignatures.push(
              `  ${actName}: (payload?: ${itemTsType}) => void;`
            );
            const bodyLines = rawCode.split("\n").map((line) => `    ${line}`).join("\n");
            customActionImpls.push(`  ${actName}: (payload) => {\n${bodyLines}\n  },`);
          } else {
            // Standard increment with user-supplied code — keep numeric amount parameter.
            customActionSignatures.push(`  ${actName}: (amount?: number) => void;`);
            const bodyLines = rawCode.split("\n").map((line) => `    ${line}`).join("\n");
            customActionImpls.push(`  ${actName}: (amount = 1) => {\n${bodyLines}\n  },`);
          }
        } else {
          customActionSignatures.push(`  ${actName}: (amount?: number) => void;`);
          customActionImpls.push(
            `  ${actName}: (amount = 1) => set((s) => ({ ${targetName}: typeof s.${targetName} === "number" ? s.${targetName} + amount : amount })),`
          );
        }
        break;
      }
      case "reset": {
        const hasParams = Array.isArray(act.parameters) && act.parameters.length > 0;
        const paramSigs = hasParams
          ? act.parameters!
              .map((p) => `${toCamelCase(p.name)}: ${mapFieldTypeToTs(p.type)}${p.required === false ? " | undefined" : ""}`)
              .join(", ")
          : "";
        const paramArgs = hasParams
          ? act.parameters!.map((p) => toCamelCase(p.name)).join(", ")
          : "";

        customActionSignatures.push(`  ${actName}: (${paramSigs}) => void;`);
        if (act.code && act.code.trim()) {
          const rawCode = act.code.trim();
          const bodyLines = rawCode.split("\n").map((line) => `    ${line}`).join("\n");
          customActionImpls.push(`  ${actName}: (${paramArgs}) => {\n${bodyLines}\n  },`);
        } else {
          customActionImpls.push(`  ${actName}: () => set(initialState),`);
        }
        break;
      }
      case "populate": {
        const hasParams = Array.isArray(act.parameters) && act.parameters.length > 0;
        const unwrapType = " | object";
        const paramSigs = hasParams
          ? act.parameters!
              .map((p) => `${toCamelCase(p.name)}: ${mapFieldTypeToTs(p.type)}${p.required === false ? " | undefined" : ""}`)
              .join(", ")
          : `data?: Partial<${interfaceName}>${unwrapType}`;
        const paramArgs = hasParams
          ? act.parameters!.map((p) => toCamelCase(p.name)).join(", ")
          : "data";

        customActionSignatures.push(`  ${actName}: (${paramSigs}) => void;`);
        const payloadPrep = targetUnwrapField
          ? `    const payload: Record<string, object | string | number | boolean | null | undefined> = ${paramArgs} && typeof ${paramArgs} === "object" ? { ...${paramArgs} } : {};
    if ("data" in payload && payload.${targetUnwrapField} === undefined) {
      payload.${targetUnwrapField} = payload.data;
      delete payload.data;
    }`
          : `    const payload = ${paramArgs};`;

        if (act.code && act.code.trim()) {
          const rawCode = act.code.trim();
          const bodyLines = rawCode.split("\n").map((line) => `    ${line}`).join("\n");
          customActionImpls.push(`  ${actName}: (${paramArgs}) => {\n${payloadPrep}\n${bodyLines}\n  },`);
        } else if (targetUnwrapField) {
          customActionImpls.push(`  ${actName}: (${paramArgs}) => set((s) => {
${payloadPrep}
    return { ...s, ...payload };
  }),`);
        } else {
          customActionImpls.push(`  ${actName}: (${paramArgs}) => set((s) => ({ ...s, ...(${paramArgs} || {}) })),`);
        }
        break;
      }
      case "custom":
      default: {
        const hasParams = Array.isArray(act.parameters) && act.parameters.length > 0;
        const fallbackPayloadType = targetField ? mapFieldTypeToTs(targetField.type) : "Record<string, unknown>";
        const paramSigs = hasParams
          ? act.parameters!
              .map((p) => `${toCamelCase(p.name)}: ${mapFieldTypeToTs(p.type)}${p.required === false ? " | undefined" : ""}`)
              .join(", ")
          : `payload?: ${fallbackPayloadType}`;
        const paramArgs = hasParams
          ? act.parameters!.map((p) => toCamelCase(p.name)).join(", ")
          : "payload";

        customActionSignatures.push(`  ${actName}: (${paramSigs}) => void;`);

        if (act.code && act.code.trim()) {
          const rawCode = act.code.trim();
          const bodyLines = rawCode.split("\n").map((line) => `    ${line}`).join("\n");
          customActionImpls.push(`  ${actName}: (${paramArgs}) => {\n${bodyLines}\n  },`);
        } else {
          customActionImpls.push(`  ${actName}: (${paramArgs}) => set((s) => ({ ...s, ${targetName}: ${paramArgs} !== undefined ? ${paramArgs} : s.${targetName} })),`);
        }
        break;
      }
    }
  });

  // Initial state lines
  const initialStateLines = fields.map((f) => {
    const fName = toCamelCase(f.name);
    const val = formatDefaultValue(f);
    return `  ${fName}: ${val},`;
  });

  // Default setter implementations for non-overridden fields
  const setterImpls = activeSetterFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    return `  set${fPascal}: (value) => set({ ${fName}: value }),`;
  });

  const appendImpls = activeAppendFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    if (isStringField(f)) {
      return `  append${fPascal}: (item = "") => set((s) => ({ ${fName}: (s.${fName} || "") + String(item ?? "") })),`;
    }
    return `  append${fPascal}: (item) => set((s) => ({ ${fName}: Array.isArray(s.${fName}) ? (item !== undefined ? [...s.${fName}, item] : s.${fName}) : (item !== undefined ? [item] : []) })),`;
  });

  const popImpls = activePopFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    return `  pop${fPascal}: () => set((s) => ({ ${fName}: Array.isArray(s.${fName}) ? s.${fName}.slice(0, -1) : [] })),`;
  });

  const removeImpls = activeRemoveFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    if (isArrayField(f)) {
      if (isPrimitiveType(f.type)) {
        return `  remove${fPascal}: (indexOrId) => set((s) => ({ ${fName}: Array.isArray(s.${fName}) ? s.${fName}.filter((it, idx) => idx !== indexOrId && it !== indexOrId) : [] })),`;
      }
      const cleanBase = (f.type || "string").replace(/\[\]$/, "").trim();
      const availableTypes = options?.customTypes || store.customTypes || [];
      const matchedCustom =
        (f.customTypeId ? availableTypes.find((ct) => ct.id === f.customTypeId) : undefined) ||
        availableTypes.find((ct) => ct.name.toLowerCase() === cleanBase.toLowerCase());
      const schemaFields = matchedCustom ? extractFieldsFromCustomType(matchedCustom) : [];
      const idField = schemaFields.find((sf) => ["id", "_id", "key"].includes(sf.name.toLowerCase()));
      const idProp = idField ? idField.name : "id";
      return `  remove${fPascal}: (indexOrId) => set((s) => ({ ${fName}: Array.isArray(s.${fName}) ? s.${fName}.filter((it, idx) => idx !== indexOrId && !(typeof it === "object" && it !== null && "${idProp}" in it && it.${idProp} === indexOrId)) : [] })),`;
    }
    return `  remove${fPascal}: (indexOrId) => set((s) => ({ ${fName}: Array.isArray(s.${fName}) ? s.${fName}.filter((it, idx) => idx !== indexOrId && it !== indexOrId) : [] })),`;
  });

  const toggleImpls = activeToggleFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    return `  toggle${fPascal}: () => set((s) => ({ ${fName}: !s.${fName} })),`;
  });

  const incrementImpls = activeIncrementFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    return `  increment${fPascal}: (amount = 1) => set((s) => ({ ${fName}: (typeof s.${fName} === "number" ? s.${fName} : 0) + amount })),`;
  });

  const decrementImpls = activeDecrementFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    return `  decrement${fPascal}: (amount = 1) => set((s) => ({ ${fName}: (typeof s.${fName} === "number" ? s.${fName} : 0) - amount })),`;
  });

  const prependImpls = activePrependFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    if (isArrayField(f)) {
      return `  prepend${fPascal}: (item) => set((s) => ({ ${fName}: Array.isArray(s.${fName}) ? (item !== undefined ? [item, ...s.${fName}] : s.${fName}) : (item !== undefined ? [item] : []) })),`;
    }
    return `  prepend${fPascal}: (item = "") => set((s) => ({ ${fName}: String(item ?? "") + (s.${fName} || "") })),`;
  });

  const updateImpls = activeUpdateFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    if (isArrayField(f)) {
      const cleanBase = (f.type || "string").replace(/\[\]$/, "").trim();
      const availableTypes = options?.customTypes || store.customTypes || [];
      const matchedCustom =
        (f.customTypeId ? availableTypes.find((ct) => ct.id === f.customTypeId) : undefined) ||
        availableTypes.find((ct) => ct.name.toLowerCase() === cleanBase.toLowerCase());
      const schemaFields = matchedCustom ? extractFieldsFromCustomType(matchedCustom) : [];
      const idField = schemaFields.find((sf) => ["id", "_id", "key"].includes(sf.name.toLowerCase()));
      const idProp = idField ? idField.name : "id";
      return `  update${fPascal}: (patch) => set((s) => ({ ${fName}: (patch && typeof patch === "object" && "${idProp}" in patch && Array.isArray(s.${fName})) ? s.${fName}.map((it) => (typeof it === "object" && it !== null && "${idProp}" in it && it.${idProp} === patch.${idProp} ? { ...it, ...patch } : it)) : s.${fName} })),`;
    }
    return `  update${fPascal}: (patch) => set((s) => ({ ${fName}: (patch && s.${fName} && typeof s.${fName} === "object") ? { ...s.${fName}, ...patch } : s.${fName} })),`;
  });

  const resetFieldImpls = fields
    .filter((f) => {
      if (!f.actions?.includes("reset")) return false;
      const fPascal = toPascalCase(f.name);
      const resetName = `reset${fPascal}`;
      return !actionNames.has(toCamelCase(resetName)) && !disabledManipulators.has(resetName);
    })
    .map((f) => {
      const fName = toCamelCase(f.name);
      const fPascal = toPascalCase(f.name);
      const defVal = formatDefaultValue(f);
      return `  reset${fPascal}: () => set({ ${fName}: ${defVal} }),`;
    });

  const streamImpls = activeStreamFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    if (isArrayField(f)) {
      const cleanBase = (f.type || "string").replace(/\[\]$/, "").trim();
      const availableTypes = options?.customTypes || store.customTypes || [];
      const matchedCustom =
        (f.customTypeId ? availableTypes.find((ct) => ct.id === f.customTypeId) : undefined) ||
        availableTypes.find((ct) => ct.name.toLowerCase() === cleanBase.toLowerCase());
      const schemaFields = matchedCustom ? extractFieldsFromCustomType(matchedCustom) : [];

      const contentField = schemaFields.find((sf) =>
        ["content", "text", "delta", "chunk", "body"].includes(sf.name.toLowerCase()),
      );
      const contentProp = contentField ? contentField.name : "content";

      const idField = schemaFields.find((sf) =>
        ["id", "_id", "key"].includes(sf.name.toLowerCase()),
      );
      const idProp = idField ? idField.name : "id";

      const senderField = schemaFields.find((sf) =>
        ["sender", "author", "speaker"].includes(sf.name.toLowerCase()),
      );
      const roleField = schemaFields.find((sf) => sf.name.toLowerCase() === "role");
      const streamingField = schemaFields.find((sf) =>
        ["streaming", "isstreaming"].includes(sf.name.toLowerCase()),
      );

      const hasSender = Boolean(senderField) || (!roleField && cleanBase === "Message");
      const hasRole = Boolean(roleField) || (!hasSender && (cleanBase === "ChatMessage" || !matchedCustom));
      const hasStreaming = Boolean(streamingField);

      // Algorithmically derive allowed enum / union literals from field type
      const senderEnumValues = getAllowedEnumValues(senderField);
      const userSenderVal =
        senderEnumValues.find((v) => /user|human|client/i.test(v)) ||
        (senderEnumValues.length > 1 ? senderEnumValues[1] : senderEnumValues[0]) ||
        "USER";
      const aiSenderVal =
        senderEnumValues.find((v) => /ai|assistant|bot|model/i.test(v)) ||
        senderEnumValues[0] ||
        "AI";
      const senderPropName = senderField ? senderField.name : "sender";

      let senderExpr = `("role" in src && typeof src.role === "string" && src.role.toLowerCase() === "user" ? ${JSON.stringify(userSenderVal)} : ${JSON.stringify(aiSenderVal)})`;
      if (senderEnumValues.length > 0) {
        const branches = senderEnumValues
          .map((v) => `("${senderPropName}" in src && src.${senderPropName} === ${JSON.stringify(v)}) ? ${JSON.stringify(v)} : `)
          .join("");
        senderExpr = `${branches}${senderExpr}`;
      } else if (cleanBase === "Message" && !senderField) {
        senderExpr = `("${senderPropName}" in src && src.${senderPropName} === "AI") ? "AI" : ("${senderPropName}" in src && src.${senderPropName} === "USER") ? "USER" : ("${senderPropName}" in src && src.${senderPropName} === "SYSTEM") ? "SYSTEM" : ${senderExpr}`;
      } else {
        senderExpr = `("${senderPropName}" in src && typeof src.${senderPropName} === "string") ? src.${senderPropName} : ${senderExpr}`;
      }

      const roleEnumValues = getAllowedEnumValues(roleField);
      const assistantRoleVal =
        roleEnumValues.find((v) => /assistant|ai|bot|model/i.test(v)) ||
        roleEnumValues[0] ||
        "assistant";
      const rolePropName = roleField ? roleField.name : "role";

      let roleExpr = `${JSON.stringify(assistantRoleVal)}`;
      if (roleEnumValues.length > 0) {
        const branches = roleEnumValues
          .map((v) => `("${rolePropName}" in src && src.${rolePropName} === ${JSON.stringify(v)}) ? ${JSON.stringify(v)} : `)
          .join("");
        roleExpr = `${branches}${roleExpr}`;
      } else {
        roleExpr = `("${rolePropName}" in src && typeof src.${rolePropName} === "string") ? src.${rolePropName} : ${roleExpr}`;
      }

      const extraFields = schemaFields.filter(
        (sf) =>
          sf.name !== idProp &&
          (!senderField || sf.name !== senderField.name) &&
          (!roleField || sf.name !== roleField.name) &&
          sf.name !== contentProp &&
          (!streamingField || sf.name !== streamingField.name) &&
          sf.required !== false,
      );

      const extraPropsCode = extraFields
        .map((sf) => `            ${sf.name}: ("${sf.name}" in src && src.${sf.name} !== undefined) ? src.${sf.name} : ${getDefaultValueForCustomField(sf)},`)
        .join("\n");

      const senderCode = hasSender
        ? `            ${senderPropName}: ${senderExpr},\n`
        : "";
      const roleCode = hasRole
        ? `            ${rolePropName}: ${roleExpr},\n`
        : "";
      const streamingCode = hasStreaming ? `            ${streamingField!.name}: true,\n` : "";
      const updateStreamingCode = hasStreaming ? `, ${streamingField!.name}: true` : "";

      const targetFinderCondition = hasRole
        ? `typeof last === "object" && last !== null && "${rolePropName}" in last && last.${rolePropName} === role${hasStreaming ? ` && "${streamingField!.name}" in last && last.${streamingField!.name} === true` : ""}`
        : hasSender
        ? `typeof last === "object" && last !== null && "${senderPropName}" in last && last.${senderPropName} === ("${senderPropName}" in src ? src.${senderPropName} : ${JSON.stringify(aiSenderVal)})${hasStreaming ? ` && "${streamingField!.name}" in last && last.${streamingField!.name} === true` : ""}`
        : `${hasStreaming ? `typeof last === "object" && last !== null && "${streamingField!.name}" in last && last.${streamingField!.name} === true` : `typeof last === "object" && last !== null`}`;

      return `  stream${fPascal}: (chunkOrDelta) => set((s) => {
    const src = typeof chunkOrDelta === "object" && chunkOrDelta !== null ? chunkOrDelta : {};
    const delta = ("delta" in src && typeof src.delta === "string") ? src.delta : ("chunk" in src && typeof src.chunk === "string") ? src.chunk : ("text" in src && typeof src.text === "string") ? src.text : (typeof chunkOrDelta === "string" ? chunkOrDelta : "");
    const role = ("role" in src && typeof src.role === "string") ? src.role : ${JSON.stringify(assistantRoleVal)};
    const done = Boolean("done" in src && src.done);
    const current = Array.isArray(s.${fName}) ? s.${fName} : [];
    let i = -1;
    if ("${idProp}" in src && src.${idProp} !== undefined) {
      i = current.findIndex((m) => typeof m === "object" && m !== null && "${idProp}" in m && m.${idProp} === src.${idProp});
    } else {
      const last = current[current.length - 1];
      if (${targetFinderCondition}) i = current.length - 1;
    }
    if (done) {
      return { ${fName}: i !== -1 ? current.map((m, j) => j === i && typeof m === "object" && m !== null ? { ...m${hasStreaming ? `, ${streamingField!.name}: false` : ""} } : m) : current };
    }
    if (typeof delta !== "string" || !delta) return { ${fName}: current };
    if (i === -1) {
      return {
        ${fName}: [
          ...current,
          {
            ${idProp}: ("${idProp}" in src && typeof src.${idProp} === "string") ? src.${idProp} : "msg_" + current.length + "_" + Date.now(),
${senderCode}${roleCode}            ${contentProp}: delta,
${streamingCode}${extraPropsCode ? extraPropsCode + "\n" : ""}          },
        ],
      };
    }
    return {
      ${fName}: current.map((m, j) =>
        j === i && typeof m === "object" && m !== null
          ? { ...m, ${contentProp}: ("${contentProp}" in m && typeof m.${contentProp} === "string" ? m.${contentProp} : "") + delta${updateStreamingCode} }
          : m
      ),
    };
  }),`;
    }
    return `  stream${fPascal}: (chunkOrDelta) => set((s) => {
    const delta = typeof chunkOrDelta === "object" && chunkOrDelta !== null ? (("delta" in chunkOrDelta && typeof chunkOrDelta.delta === "string") ? chunkOrDelta.delta : ("chunk" in chunkOrDelta && typeof chunkOrDelta.chunk === "string") ? chunkOrDelta.chunk : ("text" in chunkOrDelta && typeof chunkOrDelta.text === "string") ? chunkOrDelta.text : "") : String(chunkOrDelta ?? "");
    return { ${fName}: (s.${fName} || "") + delta };
  }),`;
  });

  const descriptionComment = store.description
    ? `/**\n * ${store.description.replace(/\n/g, "\n * ")}\n */\n`
    : "";

  const isPersisted = store.storage === "localStorage" || store.storage === "sessionStorage";
  const storageMethod = store.storage === "sessionStorage" ? "sessionStorage" : "localStorage";
  const storageKey = `${toKebabCase(store.name || "app")}-storage`;

  const imports = isPersisted
    ? `import { create } from "zustand";\nimport { persist, createJSONStorage } from "zustand/middleware";`
    : `import { create } from "zustand";`;

  const hasPopulate = (store.actions || []).some((a) => a.actionType === "populate" || a.name === "populate");
  const hasReset = (store.actions || []).some((a) => a.actionType === "reset" || a.name === "reset");
  const isPopulateDisabled = disabledManipulators.has("populate") || disabledManipulators.has("load");
  const isResetDisabled = disabledManipulators.has("reset");

  const builtInSignatures: string[] = [];
  const builtInImpls: string[] = [];

  // Generic set method supporting partial updates or updater function
  builtInSignatures.push(`  set: (updater?: Partial<${interfaceName}> | ((state: ${interfaceName}) => Partial<${interfaceName}>)) => void;`);
  builtInImpls.push("      set: (updater) => set(typeof updater === \"function\" ? updater : (updater || {})),");

  if (!hasPopulate && !isPopulateDisabled) {
    builtInSignatures.push(`  populate: (data?: Partial<${interfaceName}> | object) => void;`);
    if (targetUnwrapField) {
      builtInImpls.push(`      populate: (data) => set((s) => {
        const payload: Record<string, object | string | number | boolean | null | undefined> = data && typeof data === "object" ? { ...data } : {};
        if ("data" in payload && payload.${targetUnwrapField} === undefined) {
          payload.${targetUnwrapField} = payload.data;
          delete payload.data;
        }
        return { ...s, ...payload };
      }),`);
    } else {
      builtInImpls.push("      populate: (data) => set((s) => ({ ...s, ...(data || {}) })),");
    }
  }

  if (!hasReset && !isResetDisabled) {
    builtInSignatures.push("  reset: () => void;");
    builtInImpls.push("      reset: () => set(initialState),");
  }

  const allSignatures = [
    ...fieldTypeLines,
    ...setterLines,
    ...toggleLines,
    ...incrementLines,
    ...decrementLines,
    ...prependLines,
    ...appendLines,
    ...updateLines,
    ...streamLines,
    ...popLines,
    ...removeLines,
    ...resetFieldLines,
    ...customActionSignatures,
    ...builtInSignatures,
  ];

  const allImpls = [
    ...setterImpls,
    ...toggleImpls,
    ...incrementImpls,
    ...decrementImpls,
    ...prependImpls,
    ...appendImpls,
    ...updateImpls,
    ...streamImpls,
    ...popImpls,
    ...removeImpls,
    ...resetFieldImpls,
    ...customActionImpls,
    ...builtInImpls,
  ];

  const storeCreation = isPersisted
    ? `export const ${hookName} = create<${interfaceName}>()(
  persist(
    (set, get) => ({
      ...initialState,
${allImpls.map((l) => `    ${l.trim()}`).join("\n")}
    }),
    {
      name: "${storageKey}",
      storage: createJSONStorage(() => ${storageMethod}),
    }
  )
);`
    : `export const ${hookName} = create<${interfaceName}>((set, get) => ({
  ...initialState,
${allImpls.map((l) => `  ${l.trim()}`).join("\n")}
}));`;

  const customImports = new Set<string>();
  fields.forEach((f) => {
    const rawType = (f.type || "string").trim();
    const baseType = rawType.replace(/\[\]$/, "").trim();
    if (baseType && !STANDARD_TS_TYPES.has(baseType) && !STANDARD_TS_TYPES.has(rawType)) {
      customImports.add(baseType);
    }
  });

  const typesImportStmt =
    customImports.size > 0
      ? `\nimport type { ${Array.from(customImports).sort().join(", ")} } from "@workspace/types";`
      : "";

  const content = `"use client";

${imports}${typesImportStmt}

${descriptionComment}export interface ${interfaceName} {
${allSignatures.join("\n")}
}

const initialState: Pick<${interfaceName}, ${fields.map((f) => `"${toCamelCase(f.name)}"`).join(" | ") || "never"}> = {
${initialStateLines.join("\n")}
};

${storeCreation}

export default ${hookName};
`;

  let filename = options?.filePath;
  if (!filename) {
    filename = `lib/stores/${hookName}.ts`;
  }

  return {
    filename,
    language: "typescript",
    content,
  };
}

export function generateZustandStores(
  stores: GlobalStoreDefinition[],
  options?: {
    localStorePaths?: Record<string, string>;
    customTypes?: CustomTypeItem[];
  }
): CompiledFile[] {
  if (!stores || stores.length === 0) return [];

  const files: CompiledFile[] = [];
  const globalExportStatements: string[] = [];

  const seenExportedHookNames = new Set<string>();

  stores.forEach((st) => {
    const isLocal = st.scope === "local";
    const customPath = (isLocal && st.id && options?.localStorePaths?.[st.id])
      ? options.localStorePaths[st.id]
      : undefined;

    const file = generateZustandStore(st, {
      filePath: customPath,
      customTypes: options?.customTypes ?? st.customTypes,
    });
    files.push(file);

    if (!isLocal || !customPath) {
      const baseName = toPascalCase(st.name || "App");
      const storeCompName = baseName.endsWith("Store") ? baseName : `${baseName}Store`;
      const hookName = `use${storeCompName}`;
      seenExportedHookNames.add(hookName);
      globalExportStatements.push(`export * from "./${hookName}";\nexport { default as ${hookName} } from "./${hookName}";`);

      // Also export singular & plural alias variations so UI actions/components referencing
      // either singular or plural (e.g. useConversationStore vs useConversationsStore) resolve cleanly
      const rawBase = baseName.replace(/Store$/i, "");
      const singularRaw = toPascalCase(toSingular(rawBase));
      const pluralRaw = toPascalCase(toPlural(rawBase));

      const singularHook = `use${singularRaw}Store`;
      const pluralHook = `use${pluralRaw}Store`;

      if (singularHook !== hookName && !seenExportedHookNames.has(singularHook)) {
        seenExportedHookNames.add(singularHook);
        globalExportStatements.push(`export { ${hookName} as ${singularHook} } from "./${hookName}";`);
      }
      if (pluralHook !== hookName && pluralHook !== singularHook && !seenExportedHookNames.has(pluralHook)) {
        seenExportedHookNames.add(pluralHook);
        globalExportStatements.push(`export { ${hookName} as ${pluralHook} } from "./${hookName}";`);
      }
    }
  });

  if (globalExportStatements.length > 0) {
    files.push({
      filename: "lib/stores/index.ts",
      language: "typescript",
      content: `${globalExportStatements.join("\n\n")}\n`,
    });
  }

  return files;
}
