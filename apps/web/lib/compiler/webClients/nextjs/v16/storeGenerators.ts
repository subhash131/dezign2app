import { CompiledFile, GlobalStoreDefinition, GlobalStoreField, StateVariableType } from "@workspace/canvas/types";
import { toSingular, toPlural } from "../../../utils";

function toPascalCase(str: string): string {
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

function formatDefaultValue(field: GlobalStoreField): string {
  if (field.defaultValue !== undefined && field.defaultValue !== null) {
    if (typeof field.defaultValue === "string") {
      return JSON.stringify(field.defaultValue);
    }
    if (typeof field.defaultValue === "number" || typeof field.defaultValue === "boolean") {
      return String(field.defaultValue);
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
  options?: { filePath?: string }
): CompiledFile {
  const baseName = toPascalCase(store.name || "App");
  const storeCompName = baseName.endsWith("Store") ? baseName : `${baseName}Store`;
  const hookName = `use${storeCompName}`;
  const interfaceName = `${storeCompName}State`;

  const fields = store.fields && store.fields.length > 0 ? store.fields : [
    { id: "field-state", name: "value", type: "string" as StateVariableType, defaultValue: "" }
  ];

  // TypeScript fields
  const fieldTypeLines = fields.map((f) => {
    const fName = toCamelCase(f.name);
    const tsType = mapFieldTypeToTs(f.type);
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
    const tsType = mapFieldTypeToTs(f.type);
    return `  set${fPascal}: (value: ${tsType}) => void;`;
  });

  const isArrayField = (f: { type?: string; isArray?: boolean }) =>
    Boolean(f.isArray || f.type === "array" || f.type?.endsWith("[]"));

  const activeAppendFields = fields.filter((f) => {
    if (!isArrayField(f)) return false;
    const fPascal = toPascalCase(f.name);
    const appendName = `append${fPascal}`;
    const isOverridden = actionNames.has(toCamelCase(appendName));
    const isDisabled =
      disabledManipulators.has(appendName) || disabledManipulators.has(`append-${f.id}`);
    return !isOverridden && !isDisabled;
  });

  const appendLines = activeAppendFields.map((f) => {
    const fPascal = toPascalCase(f.name);
    const itemTsType = f.type.endsWith("[]")
      ? f.type.slice(0, -2)
      : f.type === "array"
      ? "unknown"
      : "unknown";
    return `  append${fPascal}: (item: ${itemTsType}) => void;`;
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
          customActionImpls.push(`  ${actName}: (indexOrId) => set((s) => ({ ${targetName}: Array.isArray(s.${targetName}) ? s.${targetName}.filter((it, idx) => idx !== indexOrId && !(typeof it === "object" && it !== null && "id" in it && it.id === indexOrId)) : [] })),`);
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
    return `  append${fPascal}: (item) => set((s) => ({ ${fName}: Array.isArray(s.${fName}) ? [...s.${fName}, item] : [item] })),`;
  });

  const popImpls = activePopFields.map((f) => {
    const fName = toCamelCase(f.name);
    const fPascal = toPascalCase(f.name);
    return `  pop${fPascal}: () => set((s) => ({ ${fName}: Array.isArray(s.${fName}) ? s.${fName}.slice(0, -1) : [] })),`;
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

  const storeCreation = isPersisted
    ? `export const ${hookName} = create<${interfaceName}>()(
  persist(
    (set, get) => ({
      ...initialState,
${setterImpls.map((l) => `    ${l}`).join("\n")}
${appendImpls.length > 0 ? `${appendImpls.map((l) => `    ${l}`).join("\n")}\n` : ""}${popImpls.length > 0 ? `${popImpls.map((l) => `    ${l}`).join("\n")}\n` : ""}${customActionImpls.length > 0 ? `${customActionImpls.map((l) => `    ${l}`).join("\n")}\n` : ""}${builtInImpls.join("\n")}
    }),
    {
      name: "${storageKey}",
      storage: createJSONStorage(() => ${storageMethod}),
    }
  )
);`
    : `export const ${hookName} = create<${interfaceName}>((set, get) => ({
  ...initialState,
${setterImpls.join("\n")}
${appendImpls.length > 0 ? `${appendImpls.join("\n")}\n` : ""}${popImpls.length > 0 ? `${popImpls.join("\n")}\n` : ""}${customActionImpls.length > 0 ? `${customActionImpls.join("\n")}\n` : ""}${builtInImpls.join("\n")}
}));`;

  const STANDARD_TS_TYPES = new Set([
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
${fieldTypeLines.join("\n")}
${setterLines.join("\n")}
${appendLines.length > 0 ? `${appendLines.join("\n")}\n` : ""}${popLines.length > 0 ? `${popLines.join("\n")}\n` : ""}${customActionSignatures.length > 0 ? `${customActionSignatures.join("\n")}\n` : ""}${builtInSignatures.join("\n")}
}

const initialState = {
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
  options?: { localStorePaths?: Record<string, string> }
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

    const file = generateZustandStore(st, { filePath: customPath });
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
