import { PipelineStepInputSource } from "@workspace/canvas/types";

export type VariableTypeCategory =
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "string"
  | "inferred";

const STRICT_NUMBER_REGEX = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Classifies a TypeScript variable type string into a coarse literal category
 * for default value selection, input coercion, and codegen normalization.
 */
export function getVariableTypeCategory(
  dataType?: string,
): VariableTypeCategory {
  const trimmed = (dataType || "").trim();
  const lower = trimmed.toLowerCase();

  if (!lower || lower === "inferred" || lower === "any") {
    return "inferred";
  }
  if (["number", "int", "integer", "float", "double"].includes(lower)) {
    return "number";
  }
  if (["boolean", "bool"].includes(lower)) {
    return "boolean";
  }
  if (
    lower === "array" ||
    trimmed.endsWith("[]") ||
    /^Array<.+>$/i.test(trimmed)
  ) {
    return "array";
  }
  if (
    lower === "object" ||
    /^Record<.+>$/i.test(trimmed) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    return "object";
  }
  if (lower === "string") {
    return "string";
  }
  return "inferred";
}

/**
 * Extracts the element type from an array type annotation (e.g. "number[]" -> "number").
 */
export function getArrayElementType(dataType?: string): string {
  const trimmed = (dataType || "").trim();
  if (trimmed.endsWith("[]")) {
    return trimmed.slice(0, -2).trim();
  }
  const genericMatch = /^Array<(.+)>$/i.exec(trimmed);
  if (genericMatch?.[1]) {
    return genericMatch[1].trim();
  }
  return "";
}

/**
 * Returns the default inline literal value for a variable type.
 */
export function getDefaultInlineValueForType(
  dataType?: string,
): string | number | boolean {
  switch (getVariableTypeCategory(dataType)) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return "[]";
    case "object":
      return "{}";
    case "string":
    case "inferred":
    default:
      return "";
  }
}

/**
 * Coerces an inline value to match the configured variable type when unambiguous
 * (e.g., "0" -> 0 for number, "true" -> true for boolean).
 * Incomplete typing states like "" or "1." or "-" or "${...}" are preserved as strings.
 */
export function coerceInlineValueForType(
  value: string | number | boolean | undefined,
  dataType?: string,
): string | number | boolean {
  const category = getVariableTypeCategory(dataType);

  if (category === "number") {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    const str = String(value ?? "");
    const trimmed = str.trim();
    if (STRICT_NUMBER_REGEX.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return str;
  }

  if (category === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }
    const str = String(value ?? "");
    const lower = str.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    return str;
  }

  if (category === "string") {
    return value === undefined || value === null ? "" : String(value);
  }

  return value ?? "";
}

function isJsonArrayString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return false;
  try {
    return Array.isArray(JSON.parse(trimmed));
  } catch {
    return false;
  }
}

function isJsonObjectString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Adapts an existing inline initial value when a variable's type annotation changes.
 * Empty values or values matching the previous type's default switch cleanly to the new
 * type's default; custom values are preserved if compatible or reset otherwise.
 */
export function adaptInlineValueOnTypeChange(
  currentValue: string | number | boolean | undefined,
  prevType?: string,
  nextType?: string,
): string | number | boolean {
  const prevDefault = getDefaultInlineValueForType(prevType);
  const nextDefault = getDefaultInlineValueForType(nextType);

  const isEmpty = currentValue === undefined || currentValue === "";
  const isPrevDefault =
    currentValue === prevDefault ||
    String(currentValue ?? "").trim() === String(prevDefault);

  if (isEmpty || isPrevDefault) {
    return nextDefault;
  }

  const nextCategory = getVariableTypeCategory(nextType);

  switch (nextCategory) {
    case "number": {
      const coerced = coerceInlineValueForType(currentValue, nextType);
      return typeof coerced === "number" ? coerced : nextDefault;
    }
    case "boolean": {
      const coerced = coerceInlineValueForType(currentValue, nextType);
      return typeof coerced === "boolean" ? coerced : nextDefault;
    }
    case "array": {
      const str = String(currentValue);
      return isJsonArrayString(str) ? str.trim() : nextDefault;
    }
    case "object": {
      const str = String(currentValue);
      return isJsonObjectString(str) ? str.trim() : nextDefault;
    }
    case "string":
      return String(currentValue);
    case "inferred":
    default:
      return currentValue;
  }
}

/**
 * Normalizes an inline PipelineStepInputSource against the variable's declared type
 * before code generation or simulation so numeric/boolean/empty values emit valid TS literals.
 */
export function normalizeInlineSourceForCompiler(
  source: PipelineStepInputSource,
  dataType?: string,
): PipelineStepInputSource {
  if (source.kind !== "inline") {
    return source;
  }

  const category = getVariableTypeCategory(dataType);
  const coerced = coerceInlineValueForType(source.value, dataType);
  const trimmed = String(source.value ?? "").trim();

  if (category === "number" && trimmed === "") {
    return { kind: "inline", value: 0 };
  }
  if (category === "boolean" && trimmed === "") {
    return { kind: "inline", value: false };
  }
  if (category === "array" && trimmed === "") {
    return { kind: "inline", value: "[]" };
  }
  if (category === "object" && trimmed === "") {
    return { kind: "inline", value: "{}" };
  }

  return { kind: "inline", value: coerced };
}

/**
 * Formats an inline value for UI preview badges/code bars so numbers, booleans,
 * and JSON object/array literals match the emitted TypeScript expression.
 */
export function formatInlineValueForPreview(
  value: string | number | boolean | undefined,
  dataType?: string,
): string {
  const coerced = coerceInlineValueForType(value, dataType);
  if (typeof coerced === "number" || typeof coerced === "boolean") {
    return String(coerced);
  }

  const str = String(coerced ?? "");
  const trimmed = str.trim();
  if (trimmed === "") {
    const category = getVariableTypeCategory(dataType);
    if (category === "number") return "0";
    if (category === "boolean") return "false";
    if (category === "array") return "[]";
    if (category === "object") return "{}";
    return '""';
  }

  if (isJsonArrayString(trimmed) || isJsonObjectString(trimmed)) {
    return trimmed;
  }

  return JSON.stringify(str);
}
