import { BackendNode } from "@/types/canvas";
import {
  toPascalCase,
  toSingular,
  toPlural,
} from "../../utils";

export function generateEntitiesModule(
  nodes: BackendNode[],
  referencedEntityNames?: Set<string>,
): string {
  let code = `/**\n * Shared Data Models & Schemas\n */\n\n`;
  const seenNames = new Set<string>();

  function renderEntityInterface(
    pascal: string,
    rawName: string,
    cols: Array<{
      name?: string;
      type?: string;
      isPrimaryKey?: boolean;
      isPrimary?: boolean;
      primaryKey?: boolean;
      isNotNull?: boolean;
      required?: boolean;
    }>,
  ) {
    const singularPascal = toPascalCase(toSingular(rawName));
    const pluralPascal = toPascalCase(toPlural(rawName));

    if (!cols || cols.length === 0) {
      code += `export interface ${pascal} {\n  id: string;\n  [key: string]: unknown;\n}\n`;
    } else {
      const fieldLines = cols.map((col) => {
        const fieldName = col.name || "field";
        const isReq =
          col.isPrimaryKey ||
          col.isPrimary ||
          col.primaryKey ||
          col.isNotNull ||
          col.required;
        let tsType = "string";
        switch (col.type?.toLowerCase()) {
          case "integer":
          case "int":
          case "number":
          case "float":
          case "double":
          case "real":
            tsType = "number";
            break;
          case "boolean":
          case "bool":
            tsType = "boolean";
            break;
          case "json":
          case "object":
            tsType = "Record<string, unknown>";
            break;
          default:
            tsType = "string";
        }
        return `  ${fieldName}${isReq ? "" : "?"}: ${tsType};`;
      });

      fieldLines.push("  [key: string]: unknown;");
      code += `export interface ${pascal} {\n${fieldLines.join("\n")}\n}\n`;
    }

    // Generate dual singular/plural type aliases so both "Product" and "Products" work seamlessly
    if (singularPascal && singularPascal !== pascal && !seenNames.has(singularPascal)) {
      seenNames.add(singularPascal);
      code += `export type ${singularPascal} = ${pascal};\n`;
    }
    if (pluralPascal && pluralPascal !== pascal && !seenNames.has(pluralPascal)) {
      seenNames.add(pluralPascal);
      code += `export type ${pluralPascal} = ${pascal};\n`;
    }
    code += `\n`;
  }

  // 1. Entity and Ref nodes
  const entityNodes = nodes.filter(
    (n) =>
      n.type === "entity" ||
      n.type === "db_ref" ||
      n.type === "redis_schema" ||
      n.type === "redis-cache",
  );

  entityNodes.forEach((node) => {
    const rawName = node.data?.label || node.data?.tableRef || "Entity";
    const pascal = toPascalCase(rawName);
    if (!pascal || seenNames.has(pascal)) return;
    seenNames.add(pascal);

    const cols = node.data?.columns || [];
    renderEntityInterface(pascal, rawName, cols);
  });

  // 2. Database nodes with embedded tables
  const dbNodes = nodes.filter((n) => n.type === "database");

  dbNodes.forEach((dbNode) => {
    const tables: Array<{
      name?: string;
      label?: string;
      tableRef?: string;
      columns?: Array<{ name?: string; type?: string }>;
      fields?: Array<{ name?: string; type?: string }>;
    }> =
      (
        dbNode.data as unknown as {
          tables?: Array<{
            name?: string;
            label?: string;
            tableRef?: string;
            columns?: Array<{ name?: string; type?: string }>;
            fields?: Array<{ name?: string; type?: string }>;
          }>;
        }
      )?.tables || [];
    tables.forEach((tbl) => {
      const rawName = tbl.name || tbl.label || tbl.tableRef || "Entity";
      const pascal = toPascalCase(rawName);
      if (!pascal || seenNames.has(pascal)) return;
      seenNames.add(pascal);

      const cols = tbl.columns || tbl.fields || [];
      renderEntityInterface(pascal, rawName, cols);
    });
  });

  // 3. Fallback for any entities referenced by endpoints (e.g. Products, Users)
  if (referencedEntityNames) {
    referencedEntityNames.forEach((entName) => {
      const pascal = toPascalCase(entName);
      if (pascal && !seenNames.has(pascal)) {
        seenNames.add(pascal);
        renderEntityInterface(pascal, entName, []);
      }
    });
  }

  if (seenNames.size === 0) {
    code += `export type GenericEntity = Record<string, unknown>;\n`;
  }

  return code;
}
