import { GlobalStoreField, GlobalStoreAction, Parameter } from "@workspace/canvas/types";

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
