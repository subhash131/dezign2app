import type { BackendNode } from "@/types/canvas";
import type {
  ReusableFunction,
  DbOperationFunction,
} from "@workspace/canvas/types";
import { toTableName, toVarName, toSingular, toPlural } from "../../utils";
import {
  generateDefaultDbOperationsForEngine,
  getEntityDbOperations,
} from "@/lib/utils/entityOperationsHelper";
import { toPascal, getColumns, toTsType } from "./utils";
import type { InlinePgOpContext, TableHelperResult } from "./types";

/**
 * Inline fallback code generator for standard Postgres operation kinds.
 */
export function generateInlinePostgresOp(
  kind: string,
  ctx: InlinePgOpContext,
): string {
  const {
    tableName,
    pascal,
    pascalSingular,
    pkColName,
    pkVarName,
    pkTsType,
    isStringPk,
    writableCols,
    colVarNames,
    effectiveName,
  } = ctx;

  const msgCreated = colVarNames.has("message")
    ? ""
    : `, message: "${pascalSingular} created successfully"`;
  const msgUpdated = colVarNames.has("message")
    ? ""
    : `, message: "${pascalSingular} updated successfully"`;

  switch (kind) {
    case "findAll":
      return (
        `export async function ${effectiveName}(limit = 20, offset = 0): Promise<${pascal}[]> {\n` +
        `  const res = await query<${pascal}>(\n` +
        `    'SELECT * FROM "${tableName}" ORDER BY "${pkColName}" LIMIT $1 OFFSET $2',\n` +
        `    [limit, offset]\n` +
        `  );\n` +
        `  return res.rows;\n` +
        `}`
      );
    case "findById":
      return (
        `export async function ${effectiveName}(${pkVarName}: ${pkTsType}): Promise<${pascal} | null> {\n` +
        `  const res = await query<${pascal}>(\n` +
        `    'SELECT * FROM "${tableName}" WHERE "${pkColName}" = $1 LIMIT 1',\n` +
        `    [${pkVarName}]\n` +
        `  );\n` +
        `  return res.rows[0] || null;\n` +
        `}`
      );
    case "create": {
      if (writableCols.length === 0 && !isStringPk) {
        return (
          `export async function ${effectiveName}({ ${pkVarName} }: Create${pascal}Data = {}): Promise<${pascal}> {\n` +
          `  const res = ${pkVarName} !== undefined\n` +
          `    ? await query<${pascal}>(\n` +
          `        'INSERT INTO "${tableName}" ("${pkColName}") VALUES ($1) RETURNING *',\n` +
          `        [${pkVarName}]\n` +
          `      )\n` +
          `    : await query<${pascal}>(\n` +
          `        'INSERT INTO "${tableName}" DEFAULT VALUES RETURNING *',\n` +
          `        []\n` +
          `      );\n` +
          `  const row = res.rows[0];\n` +
          `  if (!row) {\n` +
          `    throw new Error("Failed to insert record into ${tableName}");\n` +
          `  }\n` +
          `  return row;\n` +
          `}`
        );
      }
      const insertCols = writableCols.map((c) => `"${c.name}"`).join(", ");
      const insertParams = writableCols
        .map((_, i) => `$${isStringPk ? i + 2 : i + 1}`)
        .join(", ");
      const destructuredFields = [
        ...(isStringPk ? [pkVarName] : []),
        ...writableCols.map((c) => toVarName(c.name)),
      ].join(", ") || pkVarName;
      const insertArgVals = writableCols
        .map((c) => `${toVarName(c.name)} ?? null`)
        .join(", ");
      if (isStringPk) {
        return (
          `export async function ${effectiveName}({ ${destructuredFields} }: Create${pascal}Data): Promise<${pascal}> {\n` +
          `  const _id = ${pkVarName} || randomUUID();\n` +
          `  const res = await query<${pascal}>(\n` +
          `    'INSERT INTO "${tableName}" ("${pkColName}"${insertCols ? `, ${insertCols}` : ""}) VALUES ($1${insertParams ? `, ${insertParams}` : ""}) RETURNING *',\n` +
          `    [_id${insertArgVals ? `, ${insertArgVals}` : ""}]\n` +
          `  );\n` +
          `  const row = res.rows[0];\n` +
          `  if (!row) {\n` +
          `    throw new Error("Failed to insert record into ${tableName}");\n` +
          `  }\n` +
          `  return row;\n` +
          `}`
        );
      }
      return (
        `export async function ${effectiveName}({ ${destructuredFields} }: Create${pascal}Data): Promise<${pascal}> {\n` +
        `  const res = await query<${pascal}>(\n` +
        `    'INSERT INTO "${tableName}" (${insertCols}) VALUES (${insertParams}) RETURNING *',\n` +
        `    [${insertArgVals}]\n` +
        `  );\n` +
        `  const row = res.rows[0];\n` +
        `  if (!row) {\n` +
        `    throw new Error("Failed to insert record into ${tableName}");\n` +
        `  }\n` +
        `  return row;\n` +
        `}`
      );
    }
    case "update": {
      if (writableCols.length > 0) {
        const updateDestructured = writableCols.map((c) => toVarName(c.name)).join(", ");
        const setClauses = writableCols
          .map((c, i) => `"${c.name}" = $${i + 2}`)
          .join(", ");
        const setArgs = writableCols
          .map((c) => `${toVarName(c.name)} ?? null`)
          .join(", ");
        return (
          `export async function ${effectiveName}(${pkVarName}: ${pkTsType}, { ${updateDestructured} }: Update${pascal}Data): Promise<${pascal} | null> {\n` +
          `  const res = await query<${pascal}>(\n` +
          `    'UPDATE "${tableName}" SET ${setClauses} WHERE "${pkColName}" = $1 RETURNING *',\n` +
          `    [${pkVarName}, ${setArgs}]\n` +
          `  );\n` +
          `  return res.rows[0] || null;\n` +
          `}`
        );
      }
      return (
        `export async function ${effectiveName}(${pkVarName}: ${pkTsType}): Promise<${pascal} | null> {\n` +
        `  const res = await query<${pascal}>(\n` +
        `    'SELECT * FROM "${tableName}" WHERE "${pkColName}" = $1 LIMIT 1',\n` +
        `    [${pkVarName}]\n` +
        `  );\n` +
        `  return res.rows[0] || null;\n` +
        `}`
      );
    }
    case "upsert": {
      if (writableCols.length === 0 && !isStringPk) {
        return (
          `export async function ${effectiveName}({ ${pkVarName} }: Upsert${pascal}Data = {}): Promise<${pascal}> {\n` +
          `  const res = ${pkVarName} !== undefined\n` +
          `    ? await query<${pascal}>(\n` +
          `        'INSERT INTO "${tableName}" ("${pkColName}") VALUES ($1) ON CONFLICT ("${pkColName}") DO NOTHING RETURNING *',\n` +
          `        [${pkVarName}]\n` +
          `      )\n` +
          `    : await query<${pascal}>(\n` +
          `        'INSERT INTO "${tableName}" DEFAULT VALUES RETURNING *',\n` +
          `        []\n` +
          `      );\n` +
          `  const row = res.rows[0];\n` +
          `  if (!row) {\n` +
          `    throw new Error("Failed to upsert record into ${tableName}");\n` +
          `  }\n` +
          `  return row;\n` +
          `}`
        );
      }
      const insertCols = writableCols.map((c) => `"${c.name}"`).join(", ");
      const insertParams = writableCols
        .map((_, i) => `$${isStringPk ? i + 2 : i + 1}`)
        .join(", ");
      const destructuredFields = [
        ...(isStringPk ? [pkVarName] : []),
        ...writableCols.map((c) => toVarName(c.name)),
      ].join(", ") || pkVarName;
      const insertArgVals = writableCols
        .map((c) => `${toVarName(c.name)} ?? null`)
        .join(", ");
      const pgConflictSets = writableCols.length > 0
        ? `DO UPDATE SET ` + writableCols.map((c) => `"${c.name}" = EXCLUDED."${c.name}"`).join(", ")
        : `DO NOTHING`;

      if (isStringPk) {
        return (
          `export async function ${effectiveName}({ ${destructuredFields} }: Upsert${pascal}Data): Promise<${pascal}> {\n` +
          `  const _id = ${pkVarName} || randomUUID();\n` +
          `  const res = await query<${pascal}>(\n` +
          `    'INSERT INTO "${tableName}" ("${pkColName}"${insertCols ? `, ${insertCols}` : ""}) VALUES ($1${insertParams ? `, ${insertParams}` : ""}) ON CONFLICT ("${pkColName}") ${pgConflictSets} RETURNING *',\n` +
          `    [_id${insertArgVals ? `, ${insertArgVals}` : ""}]\n` +
          `  );\n` +
          `  const row = res.rows[0];\n` +
          `  if (!row) {\n` +
          `    throw new Error("Failed to upsert record into ${tableName}");\n` +
          `  }\n` +
          `  return row;\n` +
          `}`
        );
      }
      return (
        `export async function ${effectiveName}({ ${destructuredFields} }: Upsert${pascal}Data): Promise<${pascal}> {\n` +
        `  const res = await query<${pascal}>(\n` +
        `    'INSERT INTO "${tableName}" (${insertCols}) VALUES (${insertParams}) ON CONFLICT ("${pkColName}") ${pgConflictSets} RETURNING *',\n` +
        `    [${insertArgVals}]\n` +
        `  );\n` +
        `  const row = res.rows[0];\n` +
        `  if (!row) {\n` +
        `    throw new Error("Failed to upsert record into ${tableName}");\n` +
        `  }\n` +
        `  return row;\n` +
        `}`
      );
    }
    case "delete":
      return (
        `export async function ${effectiveName}(${pkVarName}: ${pkTsType}): Promise<{ success: boolean; message: string }> {\n` +
        `  await query(\n` +
        `    'DELETE FROM "${tableName}" WHERE "${pkColName}" = $1',\n` +
        `    [${pkVarName}]\n` +
        `  );\n` +
        `  return { success: true, message: "${pascalSingular} deleted successfully" };\n` +
        `}`
      );
    default:
      return (
        `export async function ${effectiveName}(): Promise<void> {\n` +
        `  // Custom operation\n` +
        `}`
      );
  }
}

/**
 * Generates per-table typed CRUD helpers and interfaces for a single entity node.
 */
export function generatePostgresTableHelpers(
  tableNode: BackendNode,
  allNodes: BackendNode[] = [],
  packageName: string = "@workspace/db",
): TableHelperResult {
  const rawName = tableNode.data?.label || tableNode.data?.tableRef || "table";
  const tableName = toTableName(rawName);
  const singularName = toSingular(tableName);
  const pluralName = toPlural(tableName);
  const pascal = toPascal(tableName);
  const pascalSingular = toPascal(singularName);
  const pascalPlural = toPascal(pluralName);
  const varName = toVarName(singularName);
  const rawCols = getColumns(tableNode);
  // Deduplicate columns by variable name to prevent TS2300 duplicate identifier errors
  const seenColVars = new Set<string>();
  const cols = rawCols.filter((c) => {
    const vName = toVarName(c.name).toLowerCase();
    if (!vName || seenColVars.has(vName)) return false;
    seenColVars.add(vName);
    return true;
  });
  const pkCol =
    cols.find((c) => c.isPrimaryKey) || cols[0] || { name: "id", type: "string" };
  const pkColName = pkCol.name || "id";
  const pkVarName = toVarName(pkColName);
  const pkTsType = toTsType(pkCol.type);
  const isStringPk = pkTsType === "string";
  const writableCols = cols.filter((c) => !c.isPrimaryKey);
  const colVarNames = new Set(cols.map((c) => toVarName(c.name)));

  const fns: ReusableFunction[] = [];
  const importPath = `${packageName}/helpers/${varName}`;

  // ── Types ─────────────────────────────────────────────────────────────────
  let code = `/**\n * Auto-generated async PostgreSQL helpers for table: "${tableName}"\n *\n * ALL queries use parameterized $1, $2, ... placeholders — safe from SQL injection.\n * Never concatenate user-supplied values into query strings.\n */\n`;
  code += `import { query, withTransaction } from "../connection";\n`;
  if (isStringPk) {
    code += `import { randomUUID } from "node:crypto";\n`;
  }
  code += `\n`;

  // Type declarations
  code += `// ── Types ────────────────────────────────────────────────────────────────────\n\n`;
  code += `export interface ${pascal} {\n`;
  cols.forEach((c) => {
    const tsType = toTsType(c.type);
    const opt = c.isPrimaryKey || c.isNotNull ? "" : "?";
    code += `  ${toVarName(c.name)}${opt}: ${tsType};\n`;
  });
  if (!colVarNames.has("message")) {
    code += `  message?: string;\n`;
  }
  if (!colVarNames.has("success")) {
    code += `  success?: boolean;\n`;
  }
  code += `}\n\n`;

  // Create data type
  const createFields = writableCols
    .map((c) => {
      const opt = c.isNotNull ? "" : "?";
      return `  ${toVarName(c.name)}${opt}: ${toTsType(c.type)};`;
    })
    .join("\n");
  code += `export interface Create${pascal}Data {\n  ${pkVarName}?: ${pkTsType};\n${createFields ? `${createFields}\n` : ""}}\n\n`;

  code += `export type Update${pascal}Data = Partial<Create${pascal}Data>;\n\n`;
  code += `export type Upsert${pascal}Data = Create${pascal}Data;\n\n`;

  const declaredTypes = new Set<string>([
    pascal,
    `Create${pascal}Data`,
    `Update${pascal}Data`,
    `Upsert${pascal}Data`,
  ]);

  if (pascalSingular !== pascal) {
    code += `export type ${pascalSingular} = ${pascal};\n`;
    code += `export type Create${pascalSingular}Data = Create${pascal}Data;\n`;
    code += `export type Update${pascalSingular}Data = Update${pascal}Data;\n`;
    code += `export type Upsert${pascalSingular}Data = Upsert${pascal}Data;\n`;
    declaredTypes.add(pascalSingular);
    declaredTypes.add(`Create${pascalSingular}Data`);
    declaredTypes.add(`Update${pascalSingular}Data`);
    declaredTypes.add(`Upsert${pascalSingular}Data`);
  }
  if (pascalPlural !== pascal && pascalPlural !== pascalSingular) {
    code += `export type ${pascalPlural} = ${pascal};\n`;
    declaredTypes.add(pascalPlural);
  }
  code += `\n`;

  // ── Canvas DB Operations ──────────────────────────────────────────────────
  const dbOps: DbOperationFunction[] = getEntityDbOperations(
    tableNode,
    allNodes,
    "postgres",
  );
  const defaultOps = generateDefaultDbOperationsForEngine(
    tableNode.data?.label || "table",
    cols,
    tableNode.data?.indexes || [],
    allNodes,
    "postgres",
  );

  const exportedValueSymbols: string[] = [];
  const seenFunctionNames = new Set<string>();

  dbOps.forEach((op) => {
    if (op.enabled === false) return;

    const isSingletonKind =
      op.kind === "findAll" ||
      op.kind === "findById" ||
      op.kind === "create" ||
      op.kind === "update" ||
      op.kind === "upsert" ||
      op.kind === "delete";

    const matchingDefault = defaultOps.find(
      (d) =>
        d.id === op.id ||
        d.name === op.name ||
        (isSingletonKind && d.kind === op.kind) ||
        (op.kind === "fetchByIndex" &&
          d.kind === "fetchByIndex" &&
          Boolean(d.indexName && op.indexName && d.indexName.toLowerCase() === op.indexName.toLowerCase())),
    );
    const effectiveName =
      op.isAutoGenerated && matchingDefault ? matchingDefault.name : op.name;
    if (!effectiveName) return;
    if (seenFunctionNames.has(effectiveName)) return;

    const effectiveSignature =
      (op.isAutoGenerated && matchingDefault
        ? matchingDefault.signature
        : op.signature) || `${effectiveName}(): Promise<void>`;

    let effectiveCode =
      (op.isAutoGenerated ||
        op.kind !== "custom" ||
        !op.code ||
        !op.code.trim()) &&
      matchingDefault
        ? matchingDefault.code
        : op.code || "";

    if (!effectiveCode || !effectiveCode.trim()) {
      effectiveCode = generateInlinePostgresOp(op.kind || "custom", {
        tableName,
        pascal,
        pascalSingular,
        pkColName,
        pkVarName,
        pkTsType,
        isStringPk,
        writableCols,
        colVarNames,
        effectiveName,
      });
    }

    if (effectiveCode && effectiveCode.trim()) {
      effectiveCode = effectiveCode
        .replace(/\s+as\s+unknown\s+as\s+[A-Za-z0-9_]+(?:Row)?/g, "")
        .replace(/\s+as\s+[A-Za-z0-9_]+(?:Row)?/g, "")
        .replace(/\s+as\s+unknown\s+as\s+[A-Za-z0-9_]+/g, "")
        .replace(/\s+as\s+any/g, "");

      seenFunctionNames.add(effectiveName);
      if (!exportedValueSymbols.includes(effectiveName)) {
        exportedValueSymbols.push(effectiveName);
      }
      fns.push({
        name: effectiveName,
        importPath,
        signature: effectiveSignature,
        targetName: tableName,
        kind:
          op.kind === "fetchByIndex" || op.kind === "join"
            ? "custom"
            : op.kind,
      });

      code += `/** ${op.description || effectiveName} */\n`;
      code += `${effectiveCode.trim()}\n\n`;
    }
  });

  return {
    code,
    fns,
    typeExports: Array.from(declaredTypes),
    valueExports: exportedValueSymbols,
  };
}
