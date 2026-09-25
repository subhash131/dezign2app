import { JsonValue, JsonObject } from "@workspace/canvas/types";

export type StoreState = Record<string, JsonValue>;

export function isJsonObject(val: JsonValue | undefined): val is JsonObject {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export type RuntimeScopeValue =
  | ((updater: StoreState | ((prev: StoreState) => StoreState)) => void)
  | (() => StoreState)
  | JsonValue
  | undefined;
