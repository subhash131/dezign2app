import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  CompiledFile,
  CompiledDatabaseResult,
  ReusableFunction,
  DbOperationFunction,
} from "@workspace/canvas/types";
import { sqlColumnToTsType, isSqlNumericType, isSqlBooleanType } from "@workspace/canvas/constants";
import { toTableName, toVarName, toSqlIdentifier, toSingular, toPlural } from "../../../utils";
import { generateDefaultDbOperations, getEntityDbOperations } from "@/lib/utils/entityOperationsHelper";
import { generateDatabaseConnectionTest, generateTableHelperTest } from "../../../generators/databaseTestGenerator";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toPascal(str: string): string {
  if (!str) return "Item";
  const snake = str.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  const clean = toSqlIdentifier(snake, "table");
  return clean
    .split(/[_\-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

type SqliteColumn = {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  isNotNull?: boolean;
};

function getColumns(tableNode: BackendNode, allNodes: BackendNode[] = []): SqliteColumn[] {
  let targetNode = tableNode;
  if (tableNode.type === "db_ref" && tableNode.data?.tableRef) {
    const master = allNodes.find((n) => n.id === tableNode.data.tableRef);
    if (master) targetNode = master;
  }
  const cols = targetNode.data?.columns || targetNode.data?.fields;
  if (cols && Array.isArray(cols) && cols.length > 0) {
    return cols.map((c) => ({
      ...c,
      isPrimaryKey: Boolean(
        ("isPrimaryKey" in c && c.isPrimaryKey) ||
        ("isPrimary" in c && c.isPrimary) ||
        ("primaryKey" in c && c.primaryKey),
      ),
      name: toSqlIdentifier(c.name || "col", "col"),
    }));
  }
  return [
    { name: "id", type: "string", isPrimaryKey: true },
    { name: "created_at", type: "string" },
  ];
}

const toTsType = sqlColumnToTsType;

// ---------------------------------------------------------------------------
// Per-table CRUD code generator
// ---------------------------------------------------------------------------

function generateTableHelpers(
  tableNode: BackendNode,
  allNodes: BackendNode[] = [],
): {
  code: string;
  fns: ReusableFunction[];
  typeExports: string[];
  valueExports: string[];
} {
  const rawLabel =
    (tableNode.type === "db_ref" && tableNode.data?.tableRef
      ? allNodes.find((n) => n.id === tableNode.data.tableRef)?.data?.label
      : undefined) ||
    tableNode.data?.label ||
    "table";
  const tableName = toTableName(rawLabel);
  const varName = toVarName(tableName);
  const Pascal = toPascal(tableName);
  const pascalSingular = toSingular(Pascal);
  const pascalPlural = toPlural(Pascal);
  const cols = getColumns(tableNode, allNodes);
  const pkCol: SqliteColumn =
    cols.find((c) => c.isPrimaryKey) ||
    cols[0] || {
      name: "id",
      type: "string",
      isPrimaryKey: true,
    };
  const pkColName = pkCol.name || "id";
  const pkVarName = toVarName(pkColName);
  const pkTs = toTsType(pkCol.type || "string");

  const writableCols = cols.filter((c) => !c.isPrimaryKey);
  const isStringPk = pkTs === "string";
  const insertColList: SqliteColumn[] = isStringPk ? [pkCol, ...writableCols] : writableCols;
  const insertCols = insertColList.map((c) => c.name).join(", ");
  const insertPlaceholders = insertColList.map(() => "?").join(", ");

  const recordFields = writableCols
    .map((c) => {
      const nameLower = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const isTimestampCol =
        nameLower === "createdat" ||
        nameLower === "updatedat" ||
        nameLower === "created_at" ||
        nameLower === "updated_at";
      const isOptional = !c.isNotNull || isTimestampCol;
      return `  ${toVarName(c.name)}${isOptional ? "?" : ""}: ${toTsType(c.type)};`;
    })
    .join("\n");
  const createPkField = isStringPk ? `  ${pkVarName}?: ${pkTs};\n` : "";
  const dataType =
    insertColList.length > 0 ? `{\n${createPkField}${recordFields}\n}` : `Record<string, never>`;

  const importPath = `@workspace/db/helpers/${varName}`;

  // ── code template ──────────────────────────────────────────────────────────
  let code = `/**\n`;
  code += ` * Auto-generated raw SQL helpers for table: ${tableName}\n`;
  code += ` *\n`;
  code += ` * ALL queries use prepared statements — safe from SQL injection.\n`;
  code += ` * Never concatenate user-supplied values into query strings.\n`;
  code += ` */\n`;
  code += `import { db } from "../connection";\n`;
  code += `import { createLogger } from "@workspace/logger";\n`;
  if (isStringPk) {
    code += `import { randomUUID } from "node:crypto";\n`;
  }
  code += `\n`;
  code += `const logger = createLogger("db:${tableName}");\n\n`;

  const colVarNames = new Set(cols.map((c) => toVarName(c.name)));

  // Types
  code += `// ── Types ────────────────────────────────────────────────────────────────────\n\n`;
  code += `export interface ${Pascal} {\n`;
  cols.forEach((c) => {
    code += `  ${toVarName(c.name)}: ${toTsType(c.type)};\n`;
  });
  if (!colVarNames.has("message")) {
    code += `  message?: string;\n`;
  }
  if (!colVarNames.has("success")) {
    code += `  success?: boolean;\n`;
  }
  code += `};\n\n`;
  code += `export type Create${Pascal}Data = ${dataType};\n\n`;
  code += `export type Update${Pascal}Data = Partial<Create${Pascal}Data>;\n\n`;

  const declaredTypes = new Set<string>([
    `${Pascal}`,
    `Create${Pascal}Data`,
    `Update${Pascal}Data`,
  ]);

  if (pascalSingular !== Pascal) {
    code += `export type ${pascalSingular} = ${Pascal};\n`;
    code += `export type Create${pascalSingular}Data = Create${Pascal}Data;\n`;
    code += `export type Update${pascalSingular}Data = Update${Pascal}Data;\n\n`;
    declaredTypes.add(pascalSingular);
    declaredTypes.add(`Create${pascalSingular}Data`);
    declaredTypes.add(`Update${pascalSingular}Data`);
  }
  if (pascalPlural !== Pascal && pascalPlural !== pascalSingular) {
    code += `export type ${pascalPlural} = ${Pascal};\n`;
    code += `export type Create${pascalPlural}Data = Create${Pascal}Data;\n`;
    code += `export type Update${pascalPlural}Data = Update${Pascal}Data;\n\n`;
    declaredTypes.add(pascalPlural);
    declaredTypes.add(`Create${pascalPlural}Data`);
    declaredTypes.add(`Update${pascalPlural}Data`);
  }

  // DB operations defined on entity node (or fallback defaults)
  const defaultDbOps = generateDefaultDbOperations(
    tableNode.data.label || "table",
    cols,
    tableNode.data.indexes || [],
    allNodes,
  );

  const dbOps: DbOperationFunction[] = getEntityDbOperations(tableNode, allNodes);

  dbOps.forEach((op) => {
    if (op.enabled === false) return;
    const textToScan = `${op.signature || ""} ${op.returnType || ""} ${op.code || ""}`;
    const matches = textToScan.match(/([A-Z][A-Za-z0-9_]*(?:Row)?)/g);
    if (matches) {
      matches.forEach((typeName) => {
        // Strip any legacy Row suffix from custom-op type references
        const cleanName = typeName.replace(/Row$/, "");
        if (cleanName && !declaredTypes.has(cleanName) && /^[A-Z]/.test(cleanName)) {
          declaredTypes.add(cleanName);
          code += `export type ${cleanName} = ${Pascal} & Record<string, unknown>;\n`;
        }
      });
    }
  });
  code += `\n`;

  const insertBindTypes = insertColList
    .map((c) => {
      const varName = toVarName(c.name);
      if (c.isPrimaryKey) {
        return `${varName}: ${toTsType(c.type)}`;
      }
      const nameLower = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const isTimestampCol =
        nameLower === "createdat" ||
        nameLower === "updatedat" ||
        nameLower === "created_at" ||
        nameLower === "updated_at";
      const isOptional = !c.isNotNull || isTimestampCol;
      return `${varName}: ${toTsType(c.type)}${isOptional ? " | null | undefined" : ""}`;
    })
    .join(", ");

  const updateBindTypes = writableCols
    .map((c) => {
      const varName = toVarName(c.name);
      const nameLower = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const isTimestampCol =
        nameLower === "createdat" ||
        nameLower === "updatedat" ||
        nameLower === "created_at" ||
        nameLower === "updated_at";
      const isOptional = !c.isNotNull || isTimestampCol;
      return `${varName}: ${toTsType(c.type)}${isOptional ? " | null | undefined" : ""}`;
    })
    .join(", ");

  // ── Prepared Statements (created once at module load) ────────────────────────
  code += `// ── Prepared Statements (created once at module load) ────────────────────────\n\n`;
  code += `const stmtFindAll = db.prepare<[limit?: number, offset?: number], ${Pascal}>(\n`;
  code += `  "SELECT * FROM ${tableName} LIMIT ? OFFSET ?"\n`;
  code += `);\n\n`;
  code += `const stmtFindById = db.prepare<[${pkVarName}: ${pkTs}], ${Pascal}>(\n`;
  code += `  "SELECT * FROM ${tableName} WHERE ${pkColName} = ?"\n`;
  code += `);\n\n`;

  if (insertColList.length > 0) {
    code += `const stmtInsert = db.prepare<[${insertBindTypes}]>(\n`;
    code += `  "INSERT INTO ${tableName} (${insertCols}) VALUES (${insertPlaceholders})"\n`;
    code += `);\n\n`;
  }
  if (writableCols.length > 0) {
    code += `const stmtUpdate = db.prepare<[${updateBindTypes}, ${pkVarName}: ${pkTs}]>(\n`;
    code += `  "UPDATE ${tableName} SET ${writableCols.map((c) => `${c.name} = ?`).join(", ")} WHERE ${pkColName} = ?"\n`;
    code += `);\n\n`;
  }

  code += `const stmtDelete = db.prepare<[${pkVarName}: ${pkTs}]>(\n`;
  code += `  "DELETE FROM ${tableName} WHERE ${pkColName} = ?"\n`;
  code += `);\n\n`;

  const fns: ReusableFunction[] = [];
  const exportedValueSymbols: string[] = [];
  const seenFunctionNames = new Set<string>();
  const seenStmtNames = new Set<string>([
    "stmtFindAll",
    "stmtFindById",
    "stmtInsert",
    "stmtUpdate",
    "stmtDelete",
  ]);

  dbOps.forEach((op) => {
    if (op.enabled === false) return;

    const matchingDefault = defaultDbOps.find((d) => d.id === op.id || d.name === op.name || d.kind === op.kind);
    const effectiveName = op.isAutoGenerated && matchingDefault ? matchingDefault.name : op.name;
    if (!effectiveName) return;

    if (seenFunctionNames.has(effectiveName)) return;

    const effectiveSignature =
      (op.isAutoGenerated && matchingDefault
        ? matchingDefault.signature
        : op.signature) || `${effectiveName}(): void`;

    // Detect code that should be regenerated:
    // - Old dynamic SQL patterns (Object.keys / Object.entries) — SQL injection risk
    // - Malformed WHERE without equality
    // - fetchByIndex ops that used .get() instead of .all() (wrong cardinality for N-side FK columns)
    // - Type mismatch where number PK creates string _rowId
    // - Any create or row helper that lacks safe unknown cast
    const opCode = op.code || "";
    const hasUnsafeCast =
      Boolean(op.code) &&
      !opCode.includes("as unknown as") &&
      (/\bas\s+[A-Za-z0-9_]+Row\b/.test(opCode) ||
        opCode.includes(`as ${Pascal}`) ||
        opCode.includes(`as ${pascalSingular}`) ||
        opCode.includes(`as ${pascalPlural}`));

    const isLegacyMissingStringPk =
      isStringPk &&
      op.kind === "create" &&
      Boolean(op.code) &&
      !opCode.includes(`_rowId = data.${pkVarName}`) &&
      !opCode.includes(`randomUUID`);

    const isLegacyMissingMessage =
      !colVarNames.has("message") &&
      (op.kind === "create" || op.kind === "update" || op.kind === "delete") &&
      Boolean(op.code) &&
      !opCode.includes("message:");

    const isLegacyVulnerableCode =
      Boolean(op.code) &&
      (opCode.includes("Object.keys(") ||
        opCode.includes("Object.entries(") ||
        (opCode.includes("WHERE ") && !opCode.includes("=")) ||
        (pkTs === "number" && (opCode.includes("info.lastInsertRowid.toString()") || opCode.includes("String(info.lastInsertRowid)"))) ||
        hasUnsafeCast ||
        isLegacyMissingStringPk ||
        isLegacyMissingMessage ||
        // Cardinality: a fetchByIndex on a FK column must use .all(), never .get()
        (op.kind === "fetchByIndex" &&
          opCode.includes(".get(") &&
          matchingDefault?.code?.includes(".all(")));

    let effectiveCode =
      (op.isAutoGenerated || isLegacyVulnerableCode || op.kind !== "custom" || !op.code || !op.code.trim()) && matchingDefault
        ? matchingDefault.code
        : (op.code || "");

    // Safety transformation: ensure numeric PK uses Number(info.lastInsertRowid)
    if (effectiveCode && pkTs === "number") {
      effectiveCode = effectiveCode
        .replace(
          /typeof info\.lastInsertRowid === "bigint" \? info\.lastInsertRowid\.toString\(\) : String\(info\.lastInsertRowid\)/g,
          `typeof info.lastInsertRowid === "bigint" ? Number(info.lastInsertRowid) : info.lastInsertRowid`,
        )
        .replace(/info\.lastInsertRowid\.toString\(\)/g, "Number(info.lastInsertRowid)")
        .replace(/String\(info\.lastInsertRowid\)/g, "Number(info.lastInsertRowid)");
    }

    // Safety transformation: ensure any direct cast "as ...Row" or "as Pascal" is safe against TS2352
    if (effectiveCode) {
      effectiveCode = effectiveCode.replace(
        new RegExp(`\\bas\\s+(${Pascal}|${pascalSingular}|${pascalPlural}|[A-Za-z0-9_]+Row)(?!\\s*\\|\\s*undefined|\\[\\]|\\s*&)`, "g"),
        "as unknown as $1",
      );
      effectiveCode = effectiveCode.replace(/as\s+unknown\s+as\s+unknown\s+as/g, "as unknown as");
    }

    if (effectiveCode && effectiveCode.trim()) {
      const fnMatches = Array.from(effectiveCode.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g))
        .map((m) => m[1])
        .filter((n): n is string => Boolean(n));
      if (fnMatches.length > 0 && fnMatches.some((fn) => seenFunctionNames.has(fn))) {
        return;
      }
      const stmtMatches = Array.from(effectiveCode.matchAll(/(?:const|let|var)\s+(stmt[A-Za-z0-9_]+)\s*=/g))
        .map((m) => m[1])
        .filter((s): s is string => Boolean(s));
      if (stmtMatches.length > 0 && stmtMatches.some((s) => seenStmtNames.has(s))) {
        return;
      }

      fnMatches.forEach((fn) => seenFunctionNames.add(fn));
      stmtMatches.forEach((s) => seenStmtNames.add(s));
      seenFunctionNames.add(effectiveName);

      if (!exportedValueSymbols.includes(effectiveName)) {
        exportedValueSymbols.push(effectiveName);
      }

      fns.push({
        name: effectiveName,
        importPath,
        signature: effectiveSignature,
        targetName: tableName,
        kind: op.kind === "fetchByIndex" || op.kind === "join" ? "custom" : op.kind,
      });

      code += `/** ${op.description || effectiveName} */\n`;
      code += `${effectiveCode.trim()}\n\n`;
      return;
    }

    seenFunctionNames.add(effectiveName);
    if (!exportedValueSymbols.includes(effectiveName)) {
      exportedValueSymbols.push(effectiveName);
    }
    fns.push({
      name: effectiveName,
      importPath,
      signature: effectiveSignature,
      targetName: tableName,
      kind: op.kind === "fetchByIndex" || op.kind === "join" ? "custom" : op.kind,
    });

    if (op.kind === "findAll") {
      code += `/** ${op.description || `Retrieve all rows from ${tableName}`} */\n`;
      code += `export function ${effectiveName}(limit: number = 20, offset: number = 0): ${Pascal}[] {\n`;
      code += `  logger.debug("findAll query on ${tableName}", { limit, offset });\n`;
      code += `  const rows = stmtFindAll.all(limit, offset) as unknown as ${Pascal}[];\n`;
      code += `  logger.debug("findAll result count", { count: rows.length });\n`;
      code += `  return rows;\n`;
      code += `}\n\n`;
    } else if (op.kind === "findById") {
      code += `/** ${op.description || `Find a ${tableName} row by primary key`} */\n`;
      code += `export function ${effectiveName}(${pkVarName}: ${pkTs}): ${Pascal} | undefined {\n`;
      code += `  logger.debug("findById query on ${tableName}", { ${pkVarName} });\n`;
      code += `  const row = stmtFindById.get(${pkVarName}) as unknown as ${Pascal} | undefined;\n`;
      code += `  logger.debug("findById result", { found: Boolean(row) });\n`;
      code += `  return row;\n`;
      code += `}\n\n`;
    } else if (op.kind === "create" && insertColList.length > 0) {
      code += `/** ${op.description || `Create a new record in ${tableName}`} */\n`;
      code += `export function ${effectiveName}(data: Create${Pascal}Data): ${Pascal} {\n`;
      code += `  logger.info("Inserting record into ${tableName}...", { data });\n`;
      code += `  const now = new Date().toISOString();\n`;
      if (isStringPk) {
        code += `  const _rowId = data.${pkVarName} || randomUUID();\n`;
      }
      const insertRunArgs = insertColList
        .map((c) => {
          if (c.isPrimaryKey) return `_rowId`;
          const varName = toVarName(c.name);
          const nameLower = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (
            nameLower === "createdat" ||
            nameLower === "updatedat" ||
            nameLower === "created_at" ||
            nameLower === "updated_at"
          ) {
            return `data.${varName} ?? now`;
          }
          return `data.${varName} ?? null`;
        })
        .join(", ");
      code += `  const info = stmtInsert.run(${insertRunArgs});\n`;
      if (!isStringPk) {
        const rowIdExpr =
          pkTs === "number"
            ? `typeof info.lastInsertRowid === "bigint" ? Number(info.lastInsertRowid) : info.lastInsertRowid`
            : `typeof info.lastInsertRowid === "bigint" ? info.lastInsertRowid.toString() : String(info.lastInsertRowid)`;
        code += `  const _rowId = ${rowIdExpr};\n`;
      }
      code += `  logger.info("✓ Record created in ${tableName}", { ${pkColName}: _rowId });\n`;
      const operationalCreatedMsg = colVarNames.has("message") ? "" : `message: "${pascalSingular} created successfully", `;
      code += `  return { ${pkColName}: _rowId, ${operationalCreatedMsg}...data, ${writableCols.filter((c) => {
        const nameLower = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        return nameLower === "createdat" || nameLower === "updatedat" || nameLower === "created_at" || nameLower === "updated_at";
      }).map((c) => {
        const varName = toVarName(c.name);
        return `${varName}: data.${varName} ?? now`;
      }).join(", ")} } as unknown as ${Pascal};\n`;
      code += `}\n\n`;
    } else if (op.kind === "create") {
      code += `/** ${op.description || `Create a new record in ${tableName}`} */\n`;
      code += `export function ${effectiveName}(): ${Pascal} {\n`;
      code += `  logger.info("Inserting default record into ${tableName}...");\n`;
      code += `  const info = db.prepare("INSERT INTO ${tableName} DEFAULT VALUES").run();\n`;
      const rowIdExpr =
        pkTs === "number"
          ? `typeof info.lastInsertRowid === "bigint" ? Number(info.lastInsertRowid) : info.lastInsertRowid`
          : `typeof info.lastInsertRowid === "bigint" ? info.lastInsertRowid.toString() : String(info.lastInsertRowid)`;
      code += `  const _rowId = ${rowIdExpr};\n`;
      code += `  logger.info("✓ Record created in ${tableName}", { ${pkColName}: _rowId });\n`;
      const operationalCreatedDefaultMsg = colVarNames.has("message") ? "" : `, message: "${pascalSingular} created successfully"`;
      code += `  return { ${pkColName}: _rowId${operationalCreatedDefaultMsg} } as unknown as ${Pascal};\n`;
      code += `}\n\n`;
    } else if (op.kind === "update" && writableCols.length > 0) {
      code += `/** ${op.description || `Update a ${tableName} row by primary key`} */\n`;
      code += `export function ${effectiveName}(${pkVarName}: ${pkTs}, data: Update${Pascal}Data): ${Pascal} | undefined {\n`;
      code += `  logger.info("Updating record in ${tableName}...", { ${pkVarName}, data });\n`;
      code += `  const current = find${toPascal(tableName)}ById(${pkVarName});\n`;
      code += `  if (!current) {\n`;
      code += `    logger.warn("Update failed: ${tableName} record not found", { ${pkVarName} });\n`;
      code += `    return undefined;\n`;
      code += `  }\n`;
      code += `  const updated = { ...current, ...data };\n`;
      code += `  stmtUpdate.run(${writableCols.map((c) => `updated.${toVarName(c.name)}`).join(", ")}, ${pkVarName});\n`;
      code += `  logger.info("✓ Record updated in ${tableName}", { ${pkVarName} });\n`;
      code += `  const fresh = find${toPascal(tableName)}ById(${pkVarName});\n`;
      const operationalUpdatedMsg = colVarNames.has("message") ? "" : `, message: "${pascalSingular} updated successfully"`;
      code += `  return fresh ? ({ ...fresh${operationalUpdatedMsg} } as unknown as ${Pascal}) : undefined;\n`;
      code += `}\n\n`;
    } else if (op.kind === "delete") {
      code += `/** ${op.description || `Delete a ${tableName} row by primary key`} */\n`;
      code += `export function ${effectiveName}(${pkVarName}: ${pkTs}): { success: boolean; message: string } {\n`;
      code += `  logger.info("Deleting record from ${tableName}...", { ${pkVarName} });\n`;
      code += `  stmtDelete.run(${pkVarName});\n`;
      code += `  logger.info("✓ Record deleted from ${tableName}", { ${pkVarName} });\n`;
      code += `  return { success: true, message: "${pascalSingular} deleted successfully" };\n`;
      code += `}\n\n`;
    }
  });

  return {
    code,
    fns,
    typeExports: Array.from(declaredTypes),
    valueExports: exportedValueSymbols,
  };
}

// ---------------------------------------------------------------------------
// Main compiler export
// ---------------------------------------------------------------------------

/**
 * Compiles database entity nodes into packages/db with:
 *  - index.ts           — raw better-sqlite3 singleton connection + WAL/FK pragmas
 *  - helpers/<table>.ts — per-table CRUD via prepared statements (injection-safe)
 *  - helpers/index.ts   — barrel export
 *  - package.json, tsconfig.json
 *
 * ORM-free by design. No Drizzle, no query builders.
 */
export interface SqliteRawOptions {
  packageName?: string;
  packageFolder?: string;
  connectionEnvVar?: string;
  dbFilePathEnv?: string;
  dbNode?: BackendNode;
}

export function compileRawSqliteDatabase(
  allNodes: BackendNode[],
  _allEdges: BackendEdge[],
  options: SqliteRawOptions = {},
): CompiledDatabaseResult {
  const entityNodes = allNodes.filter(
    (n) => n.type === "entity" || n.type === "db_ref",
  );

  const files: CompiledFile[] = [];
  const allReusableFunctions: ReusableFunction[] = [];

  const seenTableNames = new Set<string>();
  const tables: BackendNode[] = entityNodes.filter((node) => {
    const name = toTableName(node.data.label || node.data.tableRef || "table");
    if (seenTableNames.has(name)) return false;
    seenTableNames.add(name);
    return true;
  });

  const ddlStatements: string[] = [];
  const createdTableNames = new Set<string>();
  const tableSchemas: Record<string, Array<{ name: string; type: string }>> = {};
  const viewsToRefresh: Array<{ view: string; target: string }> = [];

  tables.forEach((tableNode) => {
    const tableName = toTableName(tableNode.data.label || "table");
    createdTableNames.add(tableName.toLowerCase());
    const cols = getColumns(tableNode);

    tableSchemas[tableName] = cols
      .filter((c) => !c.isPrimaryKey)
      .map((c) => {
        let colType = "TEXT";
        const t = (c.type || "").toLowerCase();
        if (isSqlNumericType(t) || isSqlBooleanType(t)) {
          colType = "INTEGER";
        }
        return { name: c.name, type: colType };
      });

    const colDefs = cols.map((c) => {
      let colType = "TEXT";
      const t = (c.type || "").toLowerCase();
      if (isSqlNumericType(t) || isSqlBooleanType(t)) {
        colType = "INTEGER";
      }
      let constraints = "";
      if (c.isPrimaryKey) {
        constraints += colType === "INTEGER" ? " PRIMARY KEY AUTOINCREMENT" : " PRIMARY KEY NOT NULL";
      }
      if (c.isUnique) constraints += " UNIQUE";
      return `    "${c.name}" ${colType}${constraints}`;
    });
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "${tableName}" (\n${colDefs.join(",\n")}\n  );`);

    // Generate table-level indexes defined on the entity node
    const indexes = (tableNode.data?.indexes || []).filter(
      (idx: { name?: string; columns?: string }) => idx && idx.columns,
    );
    indexes.forEach((idx: { name?: string; columns?: string; isUnique?: boolean }) => {
      const colList = (idx.columns || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      if (colList.length === 0) return;
      const idxName = idx.name || `idx_${tableName}_${colList.join("_")}`;
      const uniqueKeyword = idx.isUnique ? "UNIQUE " : "";
      const colSpecs = colList.map((c) => `"${toSqlIdentifier(c, "col")}"`).join(", ");
      ddlStatements.push(`  CREATE ${uniqueKeyword}INDEX IF NOT EXISTS "${toSqlIdentifier(idxName, "idx")}" ON "${tableName}" (${colSpecs});`);
    });

    const singularName = toSingular(tableName);
    const pluralName = toPlural(tableName);
    if (singularName !== tableName && !createdTableNames.has(singularName.toLowerCase())) {
      ddlStatements.push(`  CREATE VIEW IF NOT EXISTS "${singularName}" AS SELECT * FROM "${tableName}";`);
      viewsToRefresh.push({ view: singularName, target: tableName });
      createdTableNames.add(singularName.toLowerCase());
    }
    if (pluralName !== tableName && !createdTableNames.has(pluralName.toLowerCase())) {
      ddlStatements.push(`  CREATE VIEW IF NOT EXISTS "${pluralName}" AS SELECT * FROM "${tableName}";`);
      viewsToRefresh.push({ view: pluralName, target: tableName });
      createdTableNames.add(pluralName.toLowerCase());
    }
  });

  // Ensure core Better Auth tables & views exist if not already created
  if (!createdTableNames.has("user") && !createdTableNames.has("users")) {
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "email" TEXT UNIQUE,
    "emailVerified" INTEGER,
    "image" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT,
    "role" TEXT,
    "banned" INTEGER,
    "banReason" TEXT,
    "banExpires" TEXT,
    "plan" TEXT,
    "creemCustomerId" TEXT
  );`);
    ddlStatements.push(`  CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_email" ON "user" ("email");`);
    ddlStatements.push(`  CREATE VIEW IF NOT EXISTS "users" AS SELECT * FROM "user";`);
    createdTableNames.add("user");
    createdTableNames.add("users");
  } else if (createdTableNames.has("user") && !createdTableNames.has("users")) {
    ddlStatements.push(`  CREATE VIEW IF NOT EXISTS "users" AS SELECT * FROM "user";`);
    createdTableNames.add("users");
  } else if (createdTableNames.has("users") && !createdTableNames.has("user")) {
    ddlStatements.push(`  CREATE VIEW IF NOT EXISTS "user" AS SELECT * FROM "users";`);
    createdTableNames.add("user");
  }

  if (!createdTableNames.has("session") && !createdTableNames.has("sessions")) {
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "session" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "token" TEXT UNIQUE,
    "expiresAt" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT,
    "impersonatedBy" TEXT,
    "activeOrganizationId" TEXT,
    "activeTeamId" TEXT
  );`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_session_userId" ON "session" ("userId");`);
    ddlStatements.push(`  CREATE UNIQUE INDEX IF NOT EXISTS "idx_session_token" ON "session" ("token");`);
    ddlStatements.push(`  CREATE VIEW IF NOT EXISTS "sessions" AS SELECT * FROM "session";`);
    createdTableNames.add("session");
    createdTableNames.add("sessions");
  }

  if (!createdTableNames.has("account") && !createdTableNames.has("accounts")) {
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "account" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "accountId" TEXT,
    "providerId" TEXT,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TEXT,
    "refreshTokenExpiresAt" TEXT,
    "scope" TEXT,
    "idToken" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT
  );`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_account_userId" ON "account" ("userId");`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_account_provider_account" ON "account" ("providerId", "accountId");`);
    ddlStatements.push(`  CREATE VIEW IF NOT EXISTS "accounts" AS SELECT * FROM "account";`);
    createdTableNames.add("account");
    createdTableNames.add("accounts");
  }

  if (!createdTableNames.has("verification") && !createdTableNames.has("verifications")) {
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "verification" (
    "id" TEXT PRIMARY KEY,
    "identifier" TEXT,
    "value" TEXT,
    "expiresAt" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT
  );`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_verification_identifier" ON "verification" ("identifier");`);
    ddlStatements.push(`  CREATE VIEW IF NOT EXISTS "verifications" AS SELECT * FROM "verification";`);
    createdTableNames.add("verification");
    createdTableNames.add("verifications");
  }

  if (!createdTableNames.has("invitation") && !createdTableNames.has("invitations")) {
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "invitation" (
    "id" TEXT PRIMARY KEY,
    "organizationId" TEXT,
    "email" TEXT,
    "role" TEXT,
    "teamId" TEXT,
    "status" TEXT,
    "expiresAt" TEXT,
    "createdAt" TEXT,
    "inviterId" TEXT
  );`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_invitation_organizationId" ON "invitation" ("organizationId");`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_invitation_email" ON "invitation" ("email");`);
    ddlStatements.push(`  CREATE VIEW IF NOT EXISTS "invitations" AS SELECT * FROM "invitation";`);
    createdTableNames.add("invitation");
    createdTableNames.add("invitations");
  }

  if (!createdTableNames.has("jwks")) {
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "jwks" (
    "id" TEXT PRIMARY KEY,
    "publicKey" TEXT,
    "privateKey" TEXT,
    "createdAt" TEXT,
    "expiresAt" TEXT,
    "alg" TEXT,
    "crv" TEXT
  );`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_jwks_expiresAt" ON "jwks" ("expiresAt");`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_jwks_createdAt" ON "jwks" ("createdAt");`);
    createdTableNames.add("jwks");
  }

  if (!createdTableNames.has("passkey")) {
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "passkey" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "publicKey" TEXT,
    "userId" TEXT,
    "credentialID" TEXT UNIQUE,
    "counter" INTEGER,
    "transports" TEXT,
    "createdAt" TEXT
  );`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_passkey_userId" ON "passkey" ("userId");`);
    ddlStatements.push(`  CREATE UNIQUE INDEX IF NOT EXISTS "idx_passkey_credentialID" ON "passkey" ("credentialID");`);
    createdTableNames.add("passkey");
  }

  if (!createdTableNames.has("twoFactor")) {
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "twoFactor" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "secret" TEXT,
    "backupCodes" TEXT
  );`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_twoFactor_userId" ON "twoFactor" ("userId");`);
    createdTableNames.add("twoFactor");
  }

  if (!createdTableNames.has("rateLimit")) {
    ddlStatements.push(`  CREATE TABLE IF NOT EXISTS "rateLimit" (
    "key" TEXT PRIMARY KEY,
    "count" INTEGER,
    "lastRequest" INTEGER
  );`);
    ddlStatements.push(`  CREATE INDEX IF NOT EXISTS "idx_rateLimit_lastRequest" ON "rateLimit" ("lastRequest");`);
    createdTableNames.add("rateLimit");
  }

  // Register fallback auth tables in tableSchemas for automated column migration on existing SQLite files
  const coreAuthSchemas: Record<string, Array<{ name: string; type: string }>> = {
    user: [
      { name: "name", type: "TEXT" },
      { name: "email", type: "TEXT" },
      { name: "emailVerified", type: "INTEGER" },
      { name: "image", type: "TEXT" },
      { name: "createdAt", type: "TEXT" },
      { name: "updatedAt", type: "TEXT" },
      { name: "role", type: "TEXT" },
      { name: "banned", type: "INTEGER" },
      { name: "banReason", type: "TEXT" },
      { name: "banExpires", type: "TEXT" },
      { name: "plan", type: "TEXT" },
      { name: "creemCustomerId", type: "TEXT" },
    ],
    session: [
      { name: "userId", type: "TEXT" },
      { name: "token", type: "TEXT" },
      { name: "expiresAt", type: "TEXT" },
      { name: "ipAddress", type: "TEXT" },
      { name: "userAgent", type: "TEXT" },
      { name: "createdAt", type: "TEXT" },
      { name: "updatedAt", type: "TEXT" },
      { name: "impersonatedBy", type: "TEXT" },
      { name: "activeOrganizationId", type: "TEXT" },
      { name: "activeTeamId", type: "TEXT" },
    ],
    account: [
      { name: "userId", type: "TEXT" },
      { name: "accountId", type: "TEXT" },
      { name: "providerId", type: "TEXT" },
      { name: "password", type: "TEXT" },
      { name: "accessToken", type: "TEXT" },
      { name: "refreshToken", type: "TEXT" },
      { name: "accessTokenExpiresAt", type: "TEXT" },
      { name: "refreshTokenExpiresAt", type: "TEXT" },
      { name: "scope", type: "TEXT" },
      { name: "idToken", type: "TEXT" },
      { name: "createdAt", type: "TEXT" },
      { name: "updatedAt", type: "TEXT" },
    ],
    verification: [
      { name: "identifier", type: "TEXT" },
      { name: "value", type: "TEXT" },
      { name: "expiresAt", type: "TEXT" },
      { name: "createdAt", type: "TEXT" },
      { name: "updatedAt", type: "TEXT" },
    ],
    invitation: [
      { name: "organizationId", type: "TEXT" },
      { name: "email", type: "TEXT" },
      { name: "role", type: "TEXT" },
      { name: "teamId", type: "TEXT" },
      { name: "status", type: "TEXT" },
      { name: "expiresAt", type: "TEXT" },
      { name: "createdAt", type: "TEXT" },
      { name: "inviterId", type: "TEXT" },
    ],
    jwks: [
      { name: "publicKey", type: "TEXT" },
      { name: "privateKey", type: "TEXT" },
      { name: "createdAt", type: "TEXT" },
      { name: "expiresAt", type: "TEXT" },
      { name: "alg", type: "TEXT" },
      { name: "crv", type: "TEXT" },
    ],
    passkey: [
      { name: "name", type: "TEXT" },
      { name: "publicKey", type: "TEXT" },
      { name: "userId", type: "TEXT" },
      { name: "credentialID", type: "TEXT" },
      { name: "counter", type: "INTEGER" },
      { name: "transports", type: "TEXT" },
      { name: "createdAt", type: "TEXT" },
    ],
    twoFactor: [
      { name: "userId", type: "TEXT" },
      { name: "secret", type: "TEXT" },
      { name: "backupCodes", type: "TEXT" },
    ],
    rateLimit: [
      { name: "count", type: "INTEGER" },
      { name: "lastRequest", type: "INTEGER" },
    ],
  };

  for (const [authTable, authCols] of Object.entries(coreAuthSchemas)) {
    if (!tableSchemas[authTable]) {
      tableSchemas[authTable] = authCols;
    } else {
      const existingNames = new Set(tableSchemas[authTable].map((c) => c.name.toLowerCase()));
      for (const ac of authCols) {
        if (!existingNames.has(ac.name.toLowerCase())) {
          tableSchemas[authTable].push(ac);
        }
      }
    }
  }

  // Pre-seed default test users and active sessions for endpoint testing and dev execution
  // Note: omit 'role' from INSERT — it only exists on the auth-managed user table, not on
  // user-defined canvas tables. Role is auth-internal and must not be assumed to exist.
  ddlStatements.push(`  INSERT OR IGNORE INTO "user" ("id", "name", "email", "createdAt") VALUES
    ('fake_admin_1', 'Admin User', 'admin@example.com', '2026-01-01T00:00:00.000Z'),
    ('fake_user_1', 'Standard User', 'user@example.com', '2026-01-01T00:00:00.000Z'),
    ('fake_superadmin_1', 'Super Admin', 'superadmin@example.com', '2026-01-01T00:00:00.000Z');`);

  ddlStatements.push(`  INSERT OR IGNORE INTO "session" ("id", "userId", "token", "expiresAt", "createdAt") VALUES
    ('fake_session_admin', 'fake_admin_1', 'fake_admin_token', '2099-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ('fake_session_user', 'fake_user_1', 'fake_user_token', '2099-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ('fake_session_superadmin', 'fake_superadmin_1', 'fake_superadmin_token', '2099-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');`);

  const sqlStatementsString = JSON.stringify(ddlStatements.join("\n\n"));
  const ddlBlock =
    ddlStatements.length > 0
      ? `\n// Ensure all entity & auth tables exist on database initialization\ndb.exec(${sqlStatementsString});\n`
      : "";

  const helperBarrel: string[] = [];
  const seenExportedSymbols = new Set<string>();

  tables.forEach((tableNode) => {
    const tableName = toTableName(tableNode.data.label || "table");
    const varName = toVarName(tableName);
    const { code, fns, typeExports, valueExports } = generateTableHelpers(tableNode, tables);

    files.push({ filename: `helpers/${varName}.ts`, language: "typescript", content: code });
    allReusableFunctions.push(...fns);

    const uniqueTypeExports = (typeExports || []).filter((sym: string) => {
      if (seenExportedSymbols.has(sym)) return false;
      seenExportedSymbols.add(sym);
      return true;
    });

    const uniqueValueExports = (valueExports || []).filter((sym: string) => {
      if (seenExportedSymbols.has(sym)) return false;
      seenExportedSymbols.add(sym);
      return true;
    });

    if (uniqueTypeExports.length > 0) {
      helperBarrel.push(`export type { ${uniqueTypeExports.join(", ")} } from "./${varName}";`);
    }
    if (uniqueValueExports.length > 0) {
      helperBarrel.push(`export { ${uniqueValueExports.join(", ")} } from "./${varName}";`);
    }

    files.push(generateTableHelperTest(tableNode, tables, "sqlite"));
  });

  files.push(generateDatabaseConnectionTest("sqlite", options.packageName || "@workspace/db"));

  // ── helpers/index.ts ─────────────────────────────────────────────────────
  files.push({
    filename: "helpers/index.ts",
    language: "typescript",
    content:
      `/**\n * Barrel export for all table-level CRUD helpers.\n */\n` +
      helperBarrel.join("\n") +
      "\n",
  });

  const fallbackTypeExports: string[] = [];
  if (!seenExportedSymbols.has("PrimarySQLiteDB")) {
    fallbackTypeExports.push("export type PrimarySQLiteDB = Record<string, unknown>;");
  }
  if (!seenExportedSymbols.has("Entity")) {
    fallbackTypeExports.push("export type Entity = Record<string, unknown>;");
  }

  const connectionContent = [
    "/**",
    " * packages/db/connection.ts — Centralized raw SQLite connection via better-sqlite3",
    " */",
    'import Database from "better-sqlite3";',
    'import path from "path";',
    'import fs from "fs";',
    "",
    "/**",
    " * Resolves the centralized SQLite database file path.",
    " * Ensures all services, web applications, and packages connect to the exact same database instance.",
    " */",
    "export function resolveDatabasePath(): string {",
    '  const envPath = process.env.DATABASE_PATH || process.env.DATABASE_URL;',
    "  if (envPath) {",
    '    const clean = envPath.replace(/^file:/, "");',
    "    if (path.isAbsolute(clean)) {",
    "      return clean;",
    "    }",
    '    return path.resolve(/* turbopackIgnore: true */ process.cwd(), clean);',
    "  }",
    "",
    "  // 1. Try to find monorepo root by traversing upward from process.cwd()",
    "  let searchDir = process.cwd();",
    "  while (searchDir && searchDir !== path.dirname(searchDir)) {",
    '    if (fs.existsSync(path.join(searchDir, "pnpm-workspace.yaml")) || fs.existsSync(path.join(searchDir, "turbo.json"))) {',
    '      const target = path.join(searchDir, "packages", "db", "sqlite.db");',
    "      return target;",
    "    }",
    "    searchDir = path.dirname(searchDir);",
    "  }",
    "",
    "  // 2. Fallback for nested apps/services",
    '  if (process.cwd().includes("apps") || process.cwd().includes("packages")) {',
    '    return path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "..", "packages", "db", "sqlite.db");',
    "  }",
    "",
    '  return path.resolve(/* turbopackIgnore: true */ process.cwd(), "packages", "db", "sqlite.db");',
    "}",
    "",
    "const dbPath = resolveDatabasePath();",
    "const dbDir = path.dirname(dbPath);",
    "if (!fs.existsSync(dbDir)) {",
    "  fs.mkdirSync(dbDir, { recursive: true });",
    "}",
    "",
    "/** Singleton synchronous SQLite connection. */",
    "export const db: Database.Database = new Database(dbPath);",
    "",
    "// Recommended pragmas for correctness and performance",
    'db.pragma("journal_mode = WAL");',
    'db.pragma("foreign_keys = ON");',
    ddlBlock,
    "",
    "// Auto-migrate schema: ensure all defined columns exist on already-created tables",
    `const tableSchemas: Record<string, Array<{ name: string; type: string }>> = ${JSON.stringify(tableSchemas, null, 2)};`,
    "",
    "for (const [tName, columns] of Object.entries(tableSchemas)) {",
    "  try {",
    "    const info = db.pragma(`table_info(\"${tName}\")`) as Array<{ name: string }>;",
    "    if (info && info.length > 0) {",
    "      const existingCols = new Set(info.map((c) => c.name.toLowerCase()));",
    "      for (const col of columns) {",
    "        if (!existingCols.has(col.name.toLowerCase())) {",
    "          try {",
    '            db.exec(`ALTER TABLE "${tName}" ADD COLUMN "${col.name}" ${col.type}`);',
    "          } catch {",
    "            // Column might already exist or table is a view",
    "          }",
    "        }",
    "      }",
    "    }",
    "  } catch {",
    "    // Ignore schema sync error",
    "  }",
    "}",
    ...(viewsToRefresh.length > 0 ? [
      "",
      "// Refresh views to include any newly added columns",
      `const viewsToRefresh: Array<{ view: string; target: string }> = ${JSON.stringify(viewsToRefresh)};`,
      "for (const { view, target } of viewsToRefresh) {",
      "  try {",
      '    db.exec(`DROP VIEW IF EXISTS "${view}"`);',
      '    db.exec(`CREATE VIEW IF NOT EXISTS "${view}" AS SELECT * FROM "${target}"`);',
      "  } catch {",
      "    // Ignore view refresh error",
      "  }",
      "}",
    ] : []),
  ].join("\n");

  files.push({
    filename: "connection.ts",
    language: "typescript",
    content: connectionContent,
  });

  const indexContent = [
    "/**",
    " * packages/db — Raw SQLite connection via better-sqlite3",
    " *",
    " * Use the helpers in ./helpers/ instead of calling db directly.",
    " */",
    'export * from "./connection";',
    'export * from "./helpers";',
    ...(fallbackTypeExports.length > 0 ? ["", ...fallbackTypeExports] : []),
  ].join("\n");

  files.push({
    filename: "index.ts",
    language: "typescript",
    content: indexContent,
  });

  // ── package.json ──────────────────────────────────────────────────────────
  files.push({
    filename: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: options.packageName || "@workspace/db",
        version: "0.0.0",
        private: true,
        description: "Raw SQLite helpers — injection-safe prepared statements, no ORM",
        main: "index.ts",
        types: "index.ts",
        exports: {
          ".": "./index.ts",
          "./connection": "./connection.ts",
          "./helpers": "./helpers/index.ts",
          "./helpers/*": "./helpers/*.ts",
        },
        scripts: { build: "tsc", "check-types": "tsc --noEmit", test: "vitest run" },
        dependencies: {
          "@workspace/logger": "workspace:*",
          "better-sqlite3": "^12.0.0",
        },
        devDependencies: {
          "@workspace/typescript-config": "workspace:*",
          "@types/better-sqlite3": "^7.6.12",
          "@types/node": "^20.11.0",
          typescript: "^5.3.3",
          vitest: "^1.6.0",
        },
      },
      null,
      2,
    ),
  });

  // ── tsconfig.json ─────────────────────────────────────────────────────────
  files.push({
    filename: "tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        extends: "@workspace/typescript-config/base.json",
        compilerOptions: { outDir: "dist" },
        include: ["index.ts", "connection.ts", "helpers/**/*", "tests/**/*"],
      },
      null,
      2,
    ),
  });

  return { files, reusableFunctions: allReusableFunctions };
}