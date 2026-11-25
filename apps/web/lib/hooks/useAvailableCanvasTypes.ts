import { useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import type { BackendNode } from "@/types/canvas";
import type { CustomTypeItem } from "@workspace/canvas/types";

export interface AvailableTypeItem {
  name: string;
  kind: "primitive" | "interface" | "type" | "enum" | "function" | "database";
  category: "primitive" | "custom" | "package" | "database";
  packageSource?: string;
  sourceLabel?: string;
  isReadOnly?: boolean;
  description?: string;
  enumValues?: string[];
}

export interface UseAvailableCanvasTypesOptions {
  includeDatabaseTables?: boolean;
  excludeTypeName?: string;
  extraTypes?: AvailableTypeItem[];
  /**
   * Controls which built-in type preset is included:
   * - `"schema"` (default): includes schema/DB-oriented pseudo-types (`UUID`, `timestamp`, `enum`, `array`, `Date`) for schema builders.
   * - `"typescript"`: strictly TypeScript-valid variable types (`TS_PRIMITIVE_TYPE_ITEMS`) for code-emitting editors like `VariableStepSection`.
   */
  primitivePreset?: "schema" | "typescript";
}

/**
 * TypeScript-valid primitive & built-in types (`primitivePreset: "typescript"`).
 *
 * Used by:
 * - `VariableStepSection` (via `TypeCombobox` and `useAvailableCanvasTypes`) for pipeline variable declarations.
 *
 * Excludes schema/DB-only pseudo-types (`UUID`, `timestamp`, `enum`, `array`) and `Date`
 * so generated `let`/`const` annotations always compile cleanly in TypeScript; arrays are
 * toggled via the adjacent `[]` button instead of a separate `"array"` item.
 */
export const TS_PRIMITIVE_TYPE_ITEMS: AvailableTypeItem[] = [
  { name: "string", kind: "primitive", category: "primitive", description: "Text string" },
  { name: "number", kind: "primitive", category: "primitive", description: "Numeric value" },
  { name: "boolean", kind: "primitive", category: "primitive", description: "True or false" },
  { name: "object", kind: "primitive", category: "primitive", description: "Object value" },
  { name: "Record<string, string>", kind: "primitive", category: "primitive", description: "String dictionary" },
  { name: "Record<string, number>", kind: "primitive", category: "primitive", description: "Number dictionary" },
  { name: "any", kind: "primitive", category: "primitive", description: "Arbitrary unconstrained type" },
  { name: "unknown", kind: "primitive", category: "primitive", description: "Type-safe unknown value" },
];

/**
 * Schema-oriented primitive & pseudo-types (default `primitivePreset: "schema"`).
 *
 * Used by `TypeCombobox` in field/schema editors where downstream codegen maps schema types
 * to SQL/validation/TypeScript types:
 * - Endpoint & schema editors: `RequestBodyEditor`, `ResponseBodyEditor`, `NestedResponseSchemaEditor`, `ResponseSchemaEditor`, `Editors`
 * - Custom types & functions: `TypesConfig` (`TypePropertyRow`, `FunctionTypeEditor`), `TransformerHelperPanel`, `FunctionParamsSection`
 * - State stores: `StoreFieldsSection`, `StoreActionsSection`, `StoreDefaultManipulatorsSection`, `WebAppGlobalStoresTab`
 */
export const PRIMITIVE_TYPE_ITEMS: AvailableTypeItem[] = [
  { name: "string", kind: "primitive", category: "primitive", description: "Text string" },
  { name: "number", kind: "primitive", category: "primitive", description: "Numeric value" },
  { name: "boolean", kind: "primitive", category: "primitive", description: "True or false" },
  { name: "Date", kind: "primitive", category: "primitive", description: "Date or ISO string" },
  { name: "UUID", kind: "primitive", category: "primitive", description: "Unique identifier" },
  { name: "timestamp", kind: "primitive", category: "primitive", description: "Timestamp string/int" },
  { name: "object", kind: "primitive", category: "primitive", description: "Key-value object" },
  { name: "Record<string, string>", kind: "primitive", category: "primitive", description: "String dictionary" },
  { name: "any", kind: "primitive", category: "primitive", description: "Arbitrary unconstrained type" },
  { name: "unknown", kind: "primitive", category: "primitive", description: "Type-safe unknown value" },
  { name: "enum", kind: "enum", category: "primitive", description: "Inline fixed values" },
  { name: "array", kind: "primitive", category: "primitive", description: "Generic list / array" },
  { name: "() => void", kind: "function", category: "primitive", description: "Void callback function" },
  { name: "Function", kind: "function", category: "primitive", description: "Generic function type" },
];

/**
 * Dynamically scans canvas nodes and extracts all available types:
 * 1. Primitives (including enum, any, unknown, Date, etc.)
 * 2. Custom Types (user-defined models, interfaces, types, enums, and extended types)
 * 3. Package Types (imported models from package types nodes)
 * 4. Database Entities (tables if includeDatabaseTables is true)
 */
export function useAvailableCanvasTypes(
  nodesProp?: BackendNode[],
  options?: UseAvailableCanvasTypesOptions,
) {
  const storeNodes = useBackendCanvasStore((s) => s.nodes);
  const nodes = nodesProp ?? storeNodes;

  return useMemo(() => {
    const customTypes: AvailableTypeItem[] = [];
    const packageTypes: AvailableTypeItem[] = [];
    const databaseTypes: AvailableTypeItem[] = [];
    const seenCustom = new Set<string>();
    const seenPackage = new Set<string>();
    const seenDatabase = new Set<string>();

    nodes.forEach((n) => {
      if (n.type === "types") {
        const isPackageNode = Boolean(
          n.data?.isPackageNode ||
            (n.data?.packageSources && n.data?.packageSources.length > 0 && !n.data?.isExtended),
        );
        const typesList: CustomTypeItem[] = Array.isArray(n.data?.types) ? n.data.types : [];

        typesList.forEach((item) => {
          const name = item.name?.trim();
          if (!name) return;
          if (options?.excludeTypeName && name === options.excludeTypeName) return;

          const isPackageType =
            (isPackageNode || Boolean(item.packageSource) || Boolean(n.data?.packageName)) &&
            !item.extendedFrom;

          if (isPackageType) {
            if (!seenPackage.has(name)) {
              seenPackage.add(name);
              packageTypes.push({
                name,
                kind: item.kind || "interface",
                category: "package",
                packageSource: item.packageSource || n.data?.packageName || n.data?.label || "Package",
                sourceLabel: n.data?.label || n.data?.packageName || "Package Types",
                isReadOnly: item.isReadOnly,
                description: item.description,
                enumValues: item.enumValues,
              });
            }
          } else {
            if (!seenCustom.has(name)) {
              seenCustom.add(name);
              customTypes.push({
                name,
                kind: item.kind || "interface",
                category: "custom",
                sourceLabel: n.data?.label || "Custom Types",
                packageSource: item.packageSource,
                isReadOnly: item.isReadOnly,
                description: item.description,
                enumValues: item.enumValues,
              });
            }
          }
        });
      }

      if (options?.includeDatabaseTables && (n.type === "entity" || n.type === "database")) {
        const tblId = n.id;
        const tblLabel = n.data?.label || n.data?.tableName || "Table";
        const singleKey = `db:${tblId}:single`;
        const arrayKey = `db:${tblId}:array`;
        const partialKey = `db:${tblId}:partial`;

        if (!seenDatabase.has(singleKey)) {
          seenDatabase.add(singleKey);
          databaseTypes.push({
            name: singleKey,
            kind: "database",
            category: "database",
            sourceLabel: `DB: ${tblLabel}`,
            description: `Database entity ${tblLabel}`,
          });
          seenDatabase.add(arrayKey);
          databaseTypes.push({
            name: arrayKey,
            kind: "database",
            category: "database",
            sourceLabel: `DB: ${tblLabel}[]`,
            description: `Array of database entity ${tblLabel}`,
          });
          seenDatabase.add(partialKey);
          databaseTypes.push({
            name: partialKey,
            kind: "database",
            category: "database",
            sourceLabel: `DB: ${tblLabel} (Partial)`,
            description: `Partial fields of database entity ${tblLabel}`,
          });
        }
      }
    });

    const extra = options?.extraTypes || [];
    const basePrimitives =
      options?.primitivePreset === "typescript"
        ? TS_PRIMITIVE_TYPE_ITEMS
        : PRIMITIVE_TYPE_ITEMS;

    const allTypes: AvailableTypeItem[] = [
      ...basePrimitives,
      ...customTypes,
      ...packageTypes,
      ...databaseTypes,
      ...extra,
    ];

    return {
      primitives: basePrimitives,
      customTypes,
      packageTypes,
      databaseTypes,
      allTypes,
    };
  }, [
    nodes,
    options?.includeDatabaseTables,
    options?.excludeTypeName,
    options?.extraTypes,
    options?.primitivePreset,
  ]);
}
