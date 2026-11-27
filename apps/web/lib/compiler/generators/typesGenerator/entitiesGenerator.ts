import { BackendNode } from "@/types/canvas";
import {
  toPascalCase,
  toSingular,
  toPlural,
  toVarName,
} from "../../utils";

export function generateEntitiesModule(
  nodes: BackendNode[],
  referencedEntityNames?: Set<string>,
  customTypeNames?: Set<string>,
  exportedNamesOut?: Set<string>,
): string {
  let code = `/**\n * Shared Data Models & Schemas\n */\n\n`;
  const seenNames = new Set<string>();

  // Pre-collect all explicit relational entity PascalCase names so singular/plural aliases
  // (e.g. `type Users = User`) never shadow or suppress a distinct `users` table.
  const explicitEntityPascalNames = new Set<string>();
  nodes.forEach((node) => {
    if (node.type === "entity" || node.type === "db_ref") {
      let targetNode = node;
      if (node.type === "db_ref" && node.data?.tableRef) {
        const master = nodes.find((n) => n.id === node.data.tableRef);
        if (master) targetNode = master;
      }
      const rawName = targetNode.data?.label || targetNode.data?.tableName || targetNode.data?.tableRef;
      if (rawName) {
        const p = toPascalCase(rawName);
        if (p) explicitEntityPascalNames.add(p);
      }
    } else if (node.type === "database") {
      const tables = node.data?.tables || [];
      tables.forEach((tbl) => {
        const rawName = tbl.name || tbl.label || tbl.tableRef;
        if (rawName) {
          const p = toPascalCase(rawName);
          if (p) explicitEntityPascalNames.add(p);
        }
      });
    }
  });

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
    isJsonArray = false,
  ) {
    const singularPascal = toPascalCase(toSingular(rawName));
    const pluralPascal = toPascalCase(toPlural(rawName));
    const itemType = isJsonArray ? `${pascal}Item` : pascal;

    if (isJsonArray) {
      seenNames.add(itemType);
    }

    if (!cols || cols.length === 0) {
      if (isJsonArray) {
        code += `export interface ${itemType} {\n  id: string;\n}\n\nexport type ${pascal} = ${itemType};\n`;
      } else {
        code += `export interface ${pascal} {\n  id: string;\n}\n`;
      }
    } else {
      const seenProps = new Set<string>();
      const fieldLines: string[] = [];
      cols.forEach((col) => {
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
            tsType = "Record<string, string | number | boolean | null>";
            break;
          default:
            tsType = "string";
        }
        if (!seenProps.has(fieldName)) {
          fieldLines.push(`  ${fieldName}${isReq ? "" : "?"}: ${tsType};`);
          seenProps.add(fieldName);
        }
      });

      if (isJsonArray) {
        code += `export interface ${itemType} {\n${fieldLines.join("\n")}\n}\n\nexport type ${pascal} = ${itemType};\n`;
      } else {
        code += `export interface ${pascal} {\n${fieldLines.join("\n")}\n}\n`;
      }
    }

    // Generate dual singular/plural type aliases so both "Product" and "Products" work seamlessly,
    // but avoid colliding with explicit user-defined custom types or another distinct entity table
    if (
      singularPascal &&
      singularPascal !== pascal &&
      !seenNames.has(singularPascal) &&
      !explicitEntityPascalNames.has(singularPascal) &&
      !customTypeNames?.has(singularPascal)
    ) {
      seenNames.add(singularPascal);
      code += `export type ${singularPascal} = ${pascal};\n`;
      if (
        isJsonArray &&
        !seenNames.has(`${singularPascal}Item`) &&
        !customTypeNames?.has(`${singularPascal}Item`)
      ) {
        seenNames.add(`${singularPascal}Item`);
        code += `export type ${singularPascal}Item = ${itemType};\n`;
      }
    }
    if (
      pluralPascal &&
      pluralPascal !== pascal &&
      !seenNames.has(pluralPascal) &&
      !explicitEntityPascalNames.has(pluralPascal) &&
      !customTypeNames?.has(pluralPascal)
    ) {
      seenNames.add(pluralPascal);
      code += `export type ${pluralPascal} = ${pascal};\n`;
    }

    const writableCols = cols.filter(
      (c) =>
        !(
          c.isPrimaryKey ||
          c.isPrimary ||
          c.primaryKey ||
          (c.name || "").toLowerCase() === "id"
        ),
    );
    const seenWritableProps = new Set<string>();
    const writableLines: string[] = [];
    writableCols.forEach((c) => {
      const fieldName = c.name || "field";
      const isReq = c.isNotNull || c.required;
      let tsType = "string";
      switch (c.type?.toLowerCase()) {
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
          tsType = "Record<string, string | number | boolean | null>";
          break;
        default:
          tsType = "string";
      }
      if (!seenWritableProps.has(fieldName)) {
        writableLines.push(`  ${fieldName}${isReq ? "" : "?"}: ${tsType};`);
        seenWritableProps.add(fieldName);
      }
    });

    const createFields = [`  id?: string;`, ...writableLines].join("\n");
    code += `\nexport type Create${pascal}Data = {\n${createFields}\n};\n\n`;
    code += `export type Update${pascal}Data = Partial<Create${pascal}Data>;\n\n`;
    code += `export type Upsert${pascal}Data = Create${pascal}Data;\n\n`;
    seenNames.add(`Create${pascal}Data`);
    seenNames.add(`Update${pascal}Data`);
    seenNames.add(`Upsert${pascal}Data`);

    if (
      singularPascal &&
      singularPascal !== pascal &&
      !seenNames.has(`Create${singularPascal}Data`) &&
      !explicitEntityPascalNames.has(singularPascal) &&
      !customTypeNames?.has(`Create${singularPascal}Data`)
    ) {
      seenNames.add(`Create${singularPascal}Data`);
      seenNames.add(`Update${singularPascal}Data`);
      seenNames.add(`Upsert${singularPascal}Data`);
      code += `export type Create${singularPascal}Data = Create${pascal}Data;\n`;
      code += `export type Update${singularPascal}Data = Update${pascal}Data;\n`;
      code += `export type Upsert${singularPascal}Data = Upsert${pascal}Data;\n`;
    }
    if (
      pluralPascal &&
      pluralPascal !== pascal &&
      !seenNames.has(`Create${pluralPascal}Data`) &&
      !explicitEntityPascalNames.has(pluralPascal) &&
      !customTypeNames?.has(`Create${pluralPascal}Data`)
    ) {
      seenNames.add(`Create${pluralPascal}Data`);
      seenNames.add(`Update${pluralPascal}Data`);
      seenNames.add(`Upsert${pluralPascal}Data`);
      code += `export type Create${pluralPascal}Data = Create${pascal}Data;\n`;
      code += `export type Update${pluralPascal}Data = Update${pascal}Data;\n`;
      code += `export type Upsert${pluralPascal}Data = Upsert${pascal}Data;\n`;
    }
    code += `\n`;
  }

  // 1. Relational Entity and DB Ref nodes (Primary persisted domain models)
  const dbEntityNodes = nodes.filter(
    (n) => n.type === "entity" || n.type === "db_ref",
  );

  dbEntityNodes.forEach((node) => {
    let targetNode = node;
    if (node.type === "db_ref" && node.data?.tableRef) {
      const master = nodes.find((n) => n.id === node.data.tableRef);
      if (master) targetNode = master;
    }
    const rawName = targetNode.data?.label || targetNode.data?.tableRef || "Entity";
    const pascal = toPascalCase(rawName);
    if (!pascal || seenNames.has(pascal)) return;
    seenNames.add(pascal);

    const cols = targetNode.data?.columns || targetNode.data?.fields || [];
    renderEntityInterface(pascal, rawName, cols, false);
  });

  // 2. Database nodes with embedded tables
  const dbNodes = nodes.filter((n) => n.type === "database");

  dbNodes.forEach((dbNode) => {
    const tables = dbNode.data?.tables || [];
    tables.forEach((tbl) => {
      const rawName = tbl.name || tbl.label || tbl.tableRef || "Entity";
      const pascal = toPascalCase(rawName);
      if (!pascal || seenNames.has(pascal)) return;
      seenNames.add(pascal);

      const cols = tbl.columns || tbl.fields || [];
      renderEntityInterface(pascal, rawName, cols, false);
    });
  });

  // 3. Redis schema and cache nodes (Secondary cache structures)
  const redisNodes = nodes.filter(
    (n) => n.type === "redis_schema" || n.type === "redis-cache",
  );

  redisNodes.forEach((node) => {
    const rawName = node.data?.label || node.data?.tableRef || "Entity";
    const pascal = toPascalCase(rawName);
    const singularPascal = toPascalCase(toSingular(rawName));
    const pluralPascal = toPascalCase(toPlural(rawName));
    const isJsonArray = node.data?.jsonRootType === "array";
    const itemType = isJsonArray ? `${singularPascal || pascal}Item` : pascal;

    // If an entity with this name was already defined by a relational DB table, don't overwrite it
    if (seenNames.has(pascal) || seenNames.has(singularPascal) || seenNames.has(pluralPascal)) {
      if (isJsonArray && !seenNames.has(itemType)) {
        seenNames.add(itemType);
        code += `export type ${itemType} = ${singularPascal || pascal};\n\n`;
      }
      return;
    }

    seenNames.add(pascal);
    const cols = node.data?.columns || [];
    renderEntityInterface(pascal, rawName, cols, isJsonArray);
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
    code += `export type GenericEntity = Record<string, string | number | boolean | null>;\n`;
  }

  if (exportedNamesOut) {
    seenNames.forEach((n) => exportedNamesOut.add(n));
  }

  return code;
}
