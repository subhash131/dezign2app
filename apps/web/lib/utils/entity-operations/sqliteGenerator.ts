import { DbOperationFunction } from "@workspace/canvas/types";
import { sqlColumnToTsType } from "@workspace/canvas/constants";
import { toSqlIdentifier, toTableName, toVarName, hasSingularPluralTableCollision } from "@/lib/compiler/utils";
import type { BackendNode } from "@/types/canvas";
import { toPascal, toSingular, toPlural, RawTableColumn } from "./naming";

/**
 * Generates the full suite of default DB operation functions for an entity/table (SQLite prepared statements),
 * including standard CRUD and index-based fetch functions (fetchByIndex).
 * Populates both natural language prompts and executable TypeScript query code.
 */
export function generateDefaultDbOperations(
  label: string,
  rawColumns: RawTableColumn[] = [],
  indexes: { name: string; columns: string; isUnique?: boolean }[] = [],
  _allNodes: BackendNode[] = [],
): DbOperationFunction[] {
  const tableName = toTableName(label || "table");
  const hasCollision = hasSingularPluralTableCollision(tableName, _allNodes);
  const pascal = toPascal(tableName);
  const pascalSingular = hasCollision ? pascal : toSingular(pascal);
  const pascalPlural = hasCollision ? pascal : toPlural(pascal);

  // Sanitize all column names against SQL identifier injections
  const columns = rawColumns.map((c) => ({
    ...c,
    name: toSqlIdentifier(c.name || "col", "col"),
  }));

  const pkCol: RawTableColumn =
    columns.find((c) => c.isPrimaryKey) ||
    columns[0] || {
      name: "id",
      type: "string",
      isPrimaryKey: true,
    };
  const pkColName = pkCol.name || "id";
  const pkVarName = toVarName(pkColName);
  const pkType = sqlColumnToTsType(pkCol.type);

  const writableCols: RawTableColumn[] = columns.filter((c) => !c.isPrimaryKey);
  const isCreatedAt = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === "createdat";
  const isUpdatedAt = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === "updatedat";

  const isStringPk = pkType === "string";
  const insertColList: RawTableColumn[] = isStringPk ? [pkCol, ...writableCols] : writableCols;
  const insertCols = insertColList.map((c) => c.name).join(", ");
  const insertPlaceholders = insertColList.map(() => "?").join(", ");
  const insertBindArgs = insertColList
    .map((c) => {
      if (c.isPrimaryKey) return `_rowId`;
      const v = `data.${toVarName(c.name)}`;
      if (isCreatedAt(c.name) || isUpdatedAt(c.name)) {
        return `(${v} || new Date().toISOString())`;
      }
      return v;
    })
    .join(", ");

  const rowIdExpr =
    pkType === "number"
      ? `typeof info.lastInsertRowid === "bigint" ? Number(info.lastInsertRowid) : info.lastInsertRowid`
      : `typeof info.lastInsertRowid === "bigint" ? info.lastInsertRowid.toString() : String(info.lastInsertRowid)`;

  const hasMessageCol = columns.some((c) => toVarName(c.name || "") === "message");
  const createMsgSnippet = hasMessageCol ? "" : `message: "${pascalSingular} created successfully", `;
  const createDefaultMsgSnippet = hasMessageCol ? "" : `, message: "${pascalSingular} created successfully"`;
  const updateMsgSnippet = hasMessageCol ? "" : `, message: "${pascalSingular} updated successfully"`;

  const createCode = insertColList.length > 0
    ? `export function create${pascalSingular}(data: Create${pascal}Data): ${pascal} {\n${
        isStringPk
          ? `  const _rowId = data.${pkVarName} || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));\n`
          : ""
      }  const info = stmtInsert.run(${insertBindArgs});\n${
        !isStringPk ? `  const _rowId = ${rowIdExpr};\n` : ""
      }  return { ${pkColName}: _rowId, ${createMsgSnippet}...data } as unknown as ${pascal};\n}`
    : `export function create${pascalSingular}(): ${pascal} {\n  const info = db.prepare("INSERT INTO ${tableName} DEFAULT VALUES").run();\n  const _rowId = ${rowIdExpr};\n  return { ${pkColName}: _rowId${createDefaultMsgSnippet} } as unknown as ${pascal};\n}`;

  const updateCols = writableCols.filter((c) => !isCreatedAt(c.name));
  const updateBindArgs = updateCols
    .map((c) => {
      const v = `updated.${toVarName(c.name)}`;
      if (isUpdatedAt(c.name)) {
        return `(${v} || new Date().toISOString())`;
      }
      return v;
    })
    .join(", ");

  const updateCode = updateCols.length > 0
    ? `export function update${pascalSingular}(${pkVarName}: ${pkType}, data: Update${pascal}Data): ${pascal} | undefined {\n  const current = find${pascalSingular}ById(${pkVarName});\n  if (!current) return undefined;\n  const updated = { ...current, ...data };\n  stmtUpdate.run(${updateBindArgs}, ${pkVarName});\n  const fresh = find${pascalSingular}ById(${pkVarName});\n  return fresh ? ({ ...fresh${updateMsgSnippet} } as unknown as ${pascal}) : undefined;\n}`
    : `export function update${pascalSingular}(${pkVarName}: ${pkType}): ${pascal} | undefined {\n  const fresh = find${pascalSingular}ById(${pkVarName});\n  return fresh ? ({ ...fresh${updateMsgSnippet} } as unknown as ${pascal}) : undefined;\n}`;

  const upsertConflictList = writableCols.length > 0
    ? `ON CONFLICT(${pkColName}) DO UPDATE SET ${writableCols.map((c) => `${c.name} = excluded.${c.name}`).join(", ")}`
    : `ON CONFLICT(${pkColName}) DO NOTHING`;

  const upsertCode = insertColList.length > 0
    ? `export function upsert${pascalSingular}(data: Upsert${pascal}Data): ${pascal} {\n${
        isStringPk
          ? `  const _rowId = data.${pkVarName} || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));\n`
          : ""
      }  const info = stmtUpsert.run(${insertBindArgs});\n${
        !isStringPk ? `  const _rowId = data.${pkVarName} !== undefined ? data.${pkVarName} : ${rowIdExpr};\n` : ""
      }  return { ${pkColName}: _rowId, ...data } as unknown as ${pascal};\n}`
    : `export function upsert${pascalSingular}(): ${pascal} {\n  const info = db.prepare("INSERT INTO ${tableName} DEFAULT VALUES").run();\n  const _rowId = ${rowIdExpr};\n  return { ${pkColName}: _rowId${createDefaultMsgSnippet} } as unknown as ${pascal};\n}`;

  const deleteCode = `export function delete${pascalSingular}ById(${pkVarName}: ${pkType}): { success: boolean; message: string } {\n  stmtDelete.run(${pkVarName});\n  return { success: true, message: "${pascalSingular} deleted successfully" };\n};`;

  const ops: DbOperationFunction[] = [
    {
      id: `auto-find-all-${tableName}`,
      name: `findAll${pascalPlural}`,
      kind: "findAll",
      description: `Retrieve all rows from ${tableName}`,
      signature: `findAll${pascalPlural}(limit?: number, offset?: number): ${pascal}[]`,
      params: [
        { name: "limit", type: "number", required: false, defaultValue: "20" },
        { name: "offset", type: "number", required: false, defaultValue: "0" },
      ],
      returnType: `${pascal}[]`,
      pagination: {
        enabled: true,
        defaultLimit: 20,
        maxLimit: 100,
        mode: "offset",
      },
      logicMode: "code",
      prompt: `Retrieve all records from the ${tableName} table using prepared statements with limit and offset pagination.`,
      code: `export function findAll${pascalPlural}(limit: number = 20, offset: number = 0): ${pascal}[] {\n  return stmtFindAll.all(limit, offset) as unknown as ${pascal}[];\n}`,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-find-by-id-${tableName}`,
      name: `find${pascalSingular}ById`,
      kind: "findById",
      description: `Find a ${tableName} record by ${pkColName}`,
      signature: `find${pascalSingular}ById(${pkVarName}: ${pkType}): ${pascal} | undefined`,
      params: [{ name: pkVarName, type: pkType, required: true }],
      returnType: `${pascal} | undefined`,
      logicMode: "code",
      prompt: `Find a single record from the ${tableName} table by primary key (${pkColName}). Returns undefined if not found.`,
      code: `export function find${pascalSingular}ById(${pkVarName}: ${pkType}): ${pascal} | undefined {\n  return stmtFindById.get(${pkVarName}) as unknown as ${pascal} | undefined;\n}`,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-create-${tableName}`,
      name: `create${pascalSingular}`,
      kind: "create",
      description: `Create a new record in ${tableName}`,
      signature: `create${pascalSingular}(data: Create${pascal}Data): ${pascal}`,
      params: [{ name: "data", type: `Create${pascal}Data`, required: true }],
      returnType: `${pascal}`,
      logicMode: "code",
      prompt: `Insert a new record into the ${tableName} table with provided payload fields and return the created record.`,
      code: createCode,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-update-${tableName}`,
      name: `update${pascalSingular}`,
      kind: "update",
      description: `Update a ${tableName} record by ${pkColName}`,
      signature: `update${pascalSingular}(${pkVarName}: ${pkType}, data: Update${pascal}Data): ${pascal} | undefined`,
      params: [
        { name: pkVarName, type: pkType, required: true },
        { name: "data", type: `Update${pascal}Data`, required: true },
      ],
      returnType: `${pascal} | undefined`,
      logicMode: "code",
      prompt: `Update an existing record in the ${tableName} table by primary key (${pkColName}) with partial fields data.`,
      code: updateCode,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-upsert-${tableName}`,
      name: `upsert${pascalSingular}`,
      kind: "upsert",
      description: `Insert or update a record in ${tableName}`,
      signature: `upsert${pascalSingular}(data: Upsert${pascal}Data): ${pascal}`,
      params: [{ name: "data", type: `Upsert${pascal}Data`, required: true }],
      returnType: `${pascal}`,
      logicMode: "code",
      prompt: `Insert or update a record in the ${tableName} table with provided payload fields and return the upserted record.`,
      code: upsertCode,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-delete-${tableName}`,
      name: `delete${pascalSingular}ById`,
      kind: "delete",
      description: `Delete a ${tableName} record by ${pkColName}`,
      signature: `delete${pascalSingular}ById(${pkVarName}: ${pkType}): { success: boolean; message: string }`,
      params: [{ name: pkVarName, type: pkType, required: true }],
      returnType: `{ success: boolean; message: string }`,
      logicMode: "code",
      prompt: `Delete a record from the ${tableName} table by primary key (${pkColName}).`,
      code: deleteCode,
      enabled: true,
      isAutoGenerated: true,
    },
  ];

  // Combine explicit indexes and auto-discovered foreign key / unique column indexes
  const seenIndexCols = new Set<string>();
  const effectiveIndexes: { name: string; columns: string; isUnique?: boolean }[] = [];

  indexes.forEach((idx) => {
    const norm = (idx.columns || "").toLowerCase().replace(/\s+/g, "");
    if (norm && !seenIndexCols.has(norm)) {
      seenIndexCols.add(norm);
      effectiveIndexes.push(idx);
    }
  });

  columns.forEach((col) => {
    if (col.isPrimaryKey) return;
    const cName = col.name.toLowerCase();
    if (col.isForeignKey || cName.endsWith("_id") || cName.endsWith("id")) {
      const norm = col.name.toLowerCase();
      if (!seenIndexCols.has(norm)) {
        seenIndexCols.add(norm);
        effectiveIndexes.push({
          name: `idx_${tableName}_${col.name}`,
          columns: col.name,
          isUnique: false,
        });
      }
    }
  });

  // Index-based fetch functions (fetchByIndex)
  effectiveIndexes.forEach((idx, i) => {
    if (!idx.columns) return;
    const colList = idx.columns
      .split(",")
      .map((c) => toSqlIdentifier(c.trim(), ""))
      .filter(Boolean);

    if (colList.length === 0) return;

    const rawIdxName = idx.name || `idx_${colList.join("_")}`;
    const cleanName = rawIdxName.replace(new RegExp(`^idx_${tableName}_|^idx_|^by_`, "i"), "");
    const pascalIdxName = toPascal(cleanName || colList.join("_"));

    // Cardinality invariant: if the indexed column is a FK column, it is always N-cardinality
    // regardless of how the index was declared. Only truly unique constraints use .get().
    const colIsForeignKey = colList.some((c) =>
      columns.find((col) => col.name.toLowerCase() === c.toLowerCase())?.isForeignKey ||
      c.toLowerCase().endsWith("_id")
    );
    const isUnique = !!idx.isUnique && !colIsForeignKey;

    const fnName =
      cleanName.toLowerCase().startsWith("findall") ||
      cleanName.toLowerCase().startsWith("findby")
        ? cleanName
        : cleanName.toLowerCase().startsWith(pascalSingular.toLowerCase()) ||
          cleanName.toLowerCase().startsWith(pascalPlural.toLowerCase())
        ? `findBy${pascalIdxName}`
        : isUnique
        ? `find${pascalSingular}By${pascalIdxName}`
        : `findAll${pascalPlural}By${pascalIdxName}`;

    const opId = `auto-index-${tableName}-${rawIdxName}-${i}`;
    if (ops.some((o) => o.name === fnName || o.id === opId)) return;

    const stmtVarName = `stmt${fnName.charAt(0).toUpperCase() + fnName.slice(1)}`;

    const paramList: { name: string; type: string; required?: boolean; defaultValue?: string }[] = colList.map((colName) => {
      const colObj = columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
      const colType = sqlColumnToTsType(colObj?.type);
      return { name: toVarName(colName), type: colType, required: true };
    });

    if (!isUnique) {
      paramList.push(
        { name: "limit", type: "number", required: false, defaultValue: "20" },
        { name: "offset", type: "number", required: false, defaultValue: "0" },
      );
    }

    const paramSig = paramList
      .map((p) => `${p.name}: ${p.type}${p.defaultValue ? ` = ${p.defaultValue}` : ""}`)
      .join(", ");
    const returnType = isUnique ? `${pascal} | undefined` : `${pascal}[]`;
    const whereClause = colList.map((c) => `${c} = ?`).join(" AND ");
    const argList = colList.map((c) => toVarName(c)).join(", ") + (isUnique ? "" : ", limit, offset");

    const paramTypes = colList.map((colName) => {
      const colObj = columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
      const colType = sqlColumnToTsType(colObj?.type);
      return `${toVarName(colName)}: ${colType}`;
    }).join(", ");

    const indexCode = isUnique
      ? `const ${stmtVarName} = db.prepare<[${paramTypes}], ${pascal}>(\n  "SELECT * FROM ${tableName} WHERE ${whereClause}"\n);\n\nexport function ${fnName}(${paramSig}): ${returnType} {\n  return ${stmtVarName}.get(${argList}) as unknown as ${returnType};\n}`
      : `const ${stmtVarName} = db.prepare<[${paramTypes}, limit?: number, offset?: number], ${pascal}>(\n  "SELECT * FROM ${tableName} WHERE ${whereClause} LIMIT ? OFFSET ?"\n);\n\nexport function ${fnName}(${paramSig}): ${returnType} {\n  return ${stmtVarName}.all(${argList}) as unknown as ${returnType};\n}`;

    ops.push({
      id: opId,
      name: fnName,
      kind: "fetchByIndex",
      indexName: rawIdxName,
      description: `Find ${tableName} records by ${colList.join(", ")}`,
      signature: `${fnName}(${paramList.map((p) => `${p.name}${p.required === false ? "?" : ""}: ${p.type}`).join(", ")}): ${returnType}`,
      params: paramList,
      returnType: returnType,
      pagination: isUnique
        ? undefined
        : {
            enabled: true,
            defaultLimit: 20,
            maxLimit: 100,
            mode: "offset",
          },
      logicMode: "code",
      prompt: `Find records from ${tableName} table matching ${whereClause}.`,
      code: indexCode,
      enabled: true,
      isAutoGenerated: true,
    });
  });

  return ops;
}
