import type { BackendNode, CustomTypeItem, CustomTypeField } from "@workspace/canvas/types";
import type { PageStateObject, PageSection } from "@/types/canvas";
import type { ComboboxOption } from "./ActionFlowCombobox";
import { toVarName } from "@/lib/compiler/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

/**
 * Normalizes an array type or raw TypeScript type string to its base element type name.
 * Handles:
 * - "ChatMessage[]" -> "ChatMessage"
 * - "Array<ChatMessage>" -> "ChatMessage"
 * - "List<ChatMessage>" -> "ChatMessage"
 * - "ChatMessage[][]" -> "ChatMessage"
 * - "db:entityId:array" -> "entityId"
 * - "db:entityId:single" -> "entityId"
 * - "ChatMessage | null" -> "ChatMessage"
 */
export function extractBaseTypeName(rawType?: string | null): string {
  if (!rawType || typeof rawType !== "string") return "";
  let t = rawType.trim();
  // Strip null / undefined union members (e.g. "ChatMessage[] | null")
  t = t
    .replace(/\s*\|\s*(null|undefined)\b/g, "")
    .replace(/\b(null|undefined)\s*\|\s*/g, "")
    .trim();

  // Strip Promise<...>
  if (t.startsWith("Promise<") && t.endsWith(">")) {
    t = t.slice(8, -1).trim();
  }

  // Strip db: prefix (e.g. "db:table123:array", "db:table123:single", "db:table123")
  if (t.startsWith("db:")) {
    const parts = t.split(":");
    return parts[1] || t;
  }

  // Iteratively strip Array<...> and List<...> wrappers
  while ((t.startsWith("Array<") || t.startsWith("List<")) && t.endsWith(">")) {
    t = t.slice(t.indexOf("<") + 1, -1).trim();
  }

  // Iteratively strip trailing []
  while (t.endsWith("[]")) {
    t = t.slice(0, -2).trim();
  }

  // If wrapped in parentheses (e.g. (ChatMessage))
  if (t.startsWith("(") && t.endsWith(")")) {
    t = t.slice(1, -1).trim();
  }

  return t;
}

/**
 * Parses field definitions from inline raw TypeScript object or interface code.
 */
function parseFieldsFromTypeScript(
  code: string,
  typeName: string,
  seen: Set<string>,
  results: ComboboxOption[],
): void {
  const regex = new RegExp(`(?:interface|type)\\s+${typeName}\\b[^={]*[={]([\\s\\S]*?)\\}`, "i");
  const match = regex.exec(code);
  const block = match ? match[1] : code.includes("{") ? code : "";
  if (block) {
    parseFieldsFromBlock(block, seen, results);
  }
}

function parseFieldsFromBlock(
  block: string,
  seen: Set<string>,
  results: ComboboxOption[],
): void {
  const lineRegex = /(?:^|[;\n])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\??\s*:\s*([^;,\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(block)) !== null) {
    const fieldName = m[1]?.trim();
    const fieldType = m[2]?.trim();
    if (fieldName && !seen.has(fieldName) && fieldName !== "type") {
      seen.add(fieldName);
      results.push({
        value: fieldName,
        label: fieldName,
        type: fieldType || "field",
      });
    }
  }
}

/**
 * Standard known custom types in dezign2app as built-in fallbacks.
 */
const KNOWN_STANDARD_TYPES: Record<
  string,
  Array<{ name: string; type: string; description?: string }>
> = {
  ChatMessage: [
    { name: "id", type: "string", description: "Unique message identifier" },
    { name: "role", type: "enum", description: "Role: 'user' | 'assistant' | 'system'" },
    { name: "content", type: "string", description: "Message textual or markdown content" },
    { name: "createdAt", type: "string", description: "Timestamp when message was created" },
  ],
  Message: [
    { name: "id", type: "string", description: "Unique message identifier" },
    { name: "role", type: "enum", description: "Role: 'user' | 'assistant' | 'system'" },
    { name: "content", type: "string", description: "Message textual or markdown content" },
    { name: "createdAt", type: "string", description: "Timestamp when message was created" },
  ],
  NavItem: [
    { name: "id", type: "string", description: "Unique navigation item identifier" },
    { name: "label", type: "string", description: "Display title / label" },
    { name: "href", type: "string", description: "Route URL or destination" },
    { name: "icon", type: "string", description: "Icon name" },
  ],
};

/**
 * Resolves properties/fields of a type from defined types on canvas (Types nodes,
 * Database entities, State stores, or inline itemSchema).
 */
export function resolveItemPropsFromType(
  rawType?: string | null,
  allNodes?: BackendNode[],
  options?: {
    itemSchema?: Array<{ name: string; type: string }>;
    itemKeyField?: string;
  },
): ComboboxOption[] {
  const results: ComboboxOption[] = [];
  const seen = new Set<string>();

  const addOption = (opt: ComboboxOption) => {
    if (opt.value && !seen.has(opt.value)) {
      seen.add(opt.value);
      results.push(opt);
    }
  };

  // 1. If explicit itemSchema was passed (e.g. from PageStateObject.itemSchema)
  if (Array.isArray(options?.itemSchema) && options.itemSchema.length > 0) {
    options.itemSchema.forEach((col) => {
      if (col.name) {
        addOption({
          value: col.name,
          label: col.name,
          type: col.type || "field",
        });
      }
    });
  }

  const baseTypeName = extractBaseTypeName(rawType);
  if (!baseTypeName) {
    return results;
  }

  // 2. Search canvas Types nodes (node.type === "types")
  const storeNodes =
    typeof window !== "undefined" && typeof useBackendCanvasStore?.getState === "function"
      ? useBackendCanvasStore.getState().nodes || []
      : [];
  const nodes = allNodes && allNodes.length > 0 ? allNodes : storeNodes;

  for (const node of nodes) {
    if (node.type === "types") {
      const typesList: CustomTypeItem[] = Array.isArray(node.data?.types) ? node.data.types : [];
      const matched = typesList.find((t) => {
        if (!t.name) return false;
        return (
          t.name === baseTypeName ||
          t.name.toLowerCase() === baseTypeName.toLowerCase() ||
          toVarName(t.name) === toVarName(baseTypeName)
        );
      });

      if (matched) {
        // Collect fields
        if (Array.isArray(matched.fields) && matched.fields.length > 0) {
          matched.fields.forEach((f: CustomTypeField) => {
            if (f.name) {
              addOption({
                value: f.name,
                label: f.name,
                type: f.type || "field",
                description: f.description,
              });
            }
          });
        }

        // Extended type inheritance
        if (matched.extendedFrom) {
          const baseType = typesList.find(
            (t) => t.name === matched.extendedFrom || t.id === matched.extendedFromTypeId,
          );
          if (baseType && Array.isArray(baseType.fields)) {
            baseType.fields.forEach((bf: CustomTypeField) => {
              if (bf.name) {
                addOption({
                  value: bf.name,
                  label: bf.name,
                  type: bf.type || "field",
                  description: bf.description,
                });
              }
            });
          }
        }

        // Raw code inside custom type item
        if (results.length === 0 && matched.rawCode) {
          parseFieldsFromBlock(matched.rawCode, seen, results);
        }
      }

      // If types array did not match, but rawTypeScript exists on node
      if (results.length === 0 && node.data?.rawTypeScript) {
        parseFieldsFromTypeScript(node.data.rawTypeScript, baseTypeName, seen, results);
      }
    }
  }

  // 3. Search Database Entities (node.type === "entity" or "database")
  for (const node of nodes) {
    if (node.type === "entity" || node.type === "database") {
      const isMatch =
        node.id === baseTypeName ||
        node.data?.label === baseTypeName ||
        node.data?.tableName === baseTypeName ||
        (node.data?.label && node.data.label.toLowerCase() === baseTypeName.toLowerCase()) ||
        (node.data?.tableName && node.data.tableName.toLowerCase() === baseTypeName.toLowerCase());

      if (isMatch) {
        const columns = node.data?.columns || node.data?.fields || [];
        if (Array.isArray(columns)) {
          columns.forEach((col: any) => {
            const colName = col.name || col.columnName;
            if (colName) {
              addOption({
                value: colName,
                label: colName,
                type: col.type || col.columnType || "column",
                description: col.description || (col.isPrimary ? "Primary Key" : undefined),
              });
            }
          });
        }
      }
    }
  }

  // 4. Search State Store nodes (node.type === "state_store")
  for (const node of nodes) {
    if (node.type === "state_store") {
      const isStoreMatch =
        node.id === baseTypeName ||
        node.data?.label === baseTypeName ||
        node.data?.storeName === baseTypeName;
      if (isStoreMatch && Array.isArray(node.data?.fields)) {
        node.data.fields.forEach((sf: any) => {
          if (sf.name) {
            addOption({
              value: sf.name,
              label: sf.name,
              type: sf.type || "store_field",
              description: sf.description,
            });
          }
        });
      }
    }
  }

  // 5. Fallback to known standard types (e.g. ChatMessage, NavItem)
  if (results.length === 0 && KNOWN_STANDARD_TYPES[baseTypeName]) {
    KNOWN_STANDARD_TYPES[baseTypeName].forEach((item) => {
      addOption({
        value: item.name,
        label: item.name,
        type: item.type,
        description: item.description,
      });
    });
  }

  // 6. If explicit key field was passed, make sure it is in the list
  if (options?.itemKeyField && !seen.has(options.itemKeyField)) {
    addOption({
      value: options.itemKeyField,
      label: `${options.itemKeyField} (Key)`,
      type: "identifier",
    });
  }

  return results;
}

/**
 * Resolves item properties for a given PageStateObject by checking its type,
 * itemSchema, store linkages, and canvas defined types.
 */
export function resolveItemPropsFromState(
  targetState?: PageStateObject | null,
  allNodes?: BackendNode[],
  preferredKeyField?: string,
  fallbackStateNameOrId?: string,
): ComboboxOption[] {
  const storeNodes =
    typeof window !== "undefined" && typeof useBackendCanvasStore?.getState === "function"
      ? useBackendCanvasStore.getState().nodes || []
      : [];
  const nodes = allNodes && allNodes.length > 0 ? allNodes : storeNodes;

  let state = targetState;

  // If state was not passed or has no type, search canvas pool by fallbackStateNameOrId
  if (!state && fallbackStateNameOrId) {
    for (const n of nodes) {
      const sections: PageSection[] = n.data?.sections || [];
      for (const s of sections) {
        const found = (s.stateObjects || []).find(
          (st) => st.id === fallbackStateNameOrId || st.name === fallbackStateNameOrId,
        );
        if (found) {
          state = found;
          break;
        }
      }
      if (state) break;
    }
  }

  // Check if targetState has linked store
  let extraStoreFields: ComboboxOption[] = [];
  if (state?.storeNodeId || state?.storeId) {
    const storeNode = nodes.find(
      (n) => n.id === state?.storeNodeId || n.id === state?.storeId,
    );
    if (storeNode && Array.isArray(storeNode.data?.fields)) {
      const match = storeNode.data.fields.find(
        (f: any) => f.id === state?.fieldId || f.name === state?.name,
      );
      if (match && Array.isArray(match.nestedFields)) {
        extraStoreFields = match.nestedFields.map((nf: any) => ({
          value: nf.name,
          label: nf.name,
          type: nf.type || "field",
          description: nf.description,
        }));
      }
    }
  }

  // Determine type string to resolve
  let typeToResolve = state?.type;
  if (!typeToResolve || typeToResolve === "array" || typeToResolve === "object") {
    // If state type is missing or generic array, try state name or fallback identifier
    const candidateName = state?.name || fallbackStateNameOrId;
    if (candidateName) {
      if (candidateName.toLowerCase() === "messages" || candidateName.toLowerCase() === "chat") {
        typeToResolve = "ChatMessage";
      } else {
        typeToResolve = candidateName;
      }
    }
  }

  const resolved = resolveItemPropsFromType(typeToResolve, nodes, {
    itemSchema: state?.itemSchema,
    itemKeyField: preferredKeyField || state?.itemKeyField,
  });

  if (extraStoreFields.length > 0) {
    const seen = new Set(resolved.map((r) => r.value));
    extraStoreFields.forEach((f) => {
      if (!seen.has(f.value)) {
        resolved.push(f);
      }
    });
  }

  // If still empty (e.g. primitive array 'string[]' or generic array), provide common identifier fields
  if (resolved.length === 0) {
    const fallbacks = [
      preferredKeyField || state?.itemKeyField || "id",
      "_id",
      "uuid",
      "name",
      "title",
      "slug",
      "key",
    ];
    const seen = new Set<string>();
    fallbacks.forEach((f) => {
      if (f && !seen.has(f)) {
        seen.add(f);
        resolved.push({ value: f, label: f, type: "field" });
      }
    });
  }

  return resolved;
}
