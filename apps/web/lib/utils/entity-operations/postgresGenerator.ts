import { DbOperationFunction } from "@workspace/canvas/types";
import { sqlColumnToTsType } from "@workspace/canvas/constants";
import { toSqlIdentifier, toTableName, toVarName, hasSingularPluralTableCollision } from "@/lib/compiler/utils";
import type { BackendNode } from "@/types/canvas";
import { toPascal, toSingular, toPlural, RawTableColumn } from "./naming";

/**
 * Generates PostgreSQL-flavored async default operations ($1, $2 parameterized queries with RETURNING *).
 */
export function generatePostgresDbOperations(
  label: string,
  rawColumns: RawTableColumn[] = [],
  indexes: { name: string; columns: string; isUnique?: boolean }[] = [],
  _allNodes: BackendNode[] = [],
): DbOperationFunction[] {
  const tableName = toTableName(label || "table");
  const hasCollision = hasSingularPluralTableCollision(tableName, _allNodes);
  const singularName = hasCollision ? tableName : toSingular(tableName);
  const pluralName = hasCollision ? tableName : toPlural(tableName);
  const pascal = toPascal(tableName);
  const pascalSingular = toPascal(singularName);
  const pascalPlural = toPascal(pluralName);

  const columns = rawColumns.map((c) => ({
    ...c,
    name: toSqlIdentifier(c.name || "col", "col"),
  }));

  const pkCol: RawTableColumn =
    columns.find((c) => c.isPrimaryKey) ||
    columns[0] || { name: "id", type: "string", isPrimaryKey: true };
  const pkColName = pkCol.name || "id";
  const pkVarName = toVarName(pkColName);
  const pkType = sqlColumnToTsType(pkCol.type);
  const isStringPk = pkType === "string";
  const isUuidPk =
    (pkCol.type || "").toLowerCase().includes("uuid") ||
    pkCol.type?.toUpperCase() === "UUID";
  const writableCols = columns.filter((c) => !c.isPrimaryKey);
  const isCreatedAt = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === "createdat";
  const isUpdatedAt = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === "updatedat";

  // Build param lists
  const insertColList = isStringPk ? [pkCol, ...writableCols] : writableCols;
  const insertColNames = insertColList.map((c) => `"${c.name}"`).join(", ");
  const insertParams = insertColList.map((_, i) => `$${i + 1}`).join(", ");
  const insertArgVals = insertColList
    .map((c) => {
      if (c.isPrimaryKey) return "_id";
      const colName = c.name;
      if (isCreatedAt(c.name) || isUpdatedAt(c.name)) {
        return `${colName} || new Date().toISOString()`;
      }
      const isColUuid = (c.type || "").toLowerCase().includes("uuid");
      if (isColUuid) {
        return `(${colName} && isUuid(${colName})) ? ${colName} : (${colName} ? toValidUuid(${colName}) : null)`;
      }
      return `${colName} ?? null`;
    })
    .join(", ");

  const destructuredFields =
    insertColList
      .map((c) => (c.isPrimaryKey ? pkVarName : c.name))
      .join(", ") || pkVarName;
  const createDestructuredParam = `{ ${destructuredFields} }`;

  const updateCols = writableCols.filter((c) => !isCreatedAt(c.name));
  const setClauses = updateCols.map((c, i) => `"${c.name}" = $${i + 2}`).join(", ");
  const updateDestructured = updateCols.map((c) => c.name).join(", ");
  const updateArgVals = updateCols
    .map((c) => {
      const colName = c.name;
      if (isUpdatedAt(c.name)) {
        return `${colName} || new Date().toISOString()`;
      }
      const isColUuid = (c.type || "").toLowerCase().includes("uuid");
      if (isColUuid) {
        return `(${colName} && isUuid(${colName})) ? ${colName} : (${colName} ? toValidUuid(${colName}) : null)`;
      }
      return `${colName} ?? null`;
    })
    .join(", ");

  const pgConflictSets = writableCols.length > 0
    ? `DO UPDATE SET ` + writableCols.map((c) => `"${c.name}" = EXCLUDED."${c.name}"`).join(", ")
    : `DO NOTHING`;

  let createCode: string;
  let upsertCode: string;
  if (writableCols.length === 0 && !isStringPk) {
    createCode = `export async function create${pascalSingular}({ ${pkVarName} }: Create${pascal}Data = {}): Promise<${pascal}> {\n  const res = ${pkVarName} !== undefined\n    ? await query<${pascal}>(\n        'INSERT INTO "${tableName}" ("${pkColName}") VALUES ($1) RETURNING *',\n        [${pkVarName}]\n      )\n    : await query<${pascal}>(\n        'INSERT INTO "${tableName}" DEFAULT VALUES RETURNING *',\n        []\n      );\n  const row = res.rows[0];\n  if (!row) {\n    throw new Error("Failed to insert record into ${tableName}");\n  }\n  return row;\n}`;
    upsertCode = `export async function upsert${pascalSingular}({ ${pkVarName} }: Upsert${pascal}Data = {}): Promise<${pascal}> {\n  const res = ${pkVarName} !== undefined\n    ? await query<${pascal}>(\n        'INSERT INTO "${tableName}" ("${pkColName}") VALUES ($1) ON CONFLICT ("${pkColName}") ${pgConflictSets} RETURNING *',\n        [${pkVarName}]\n      )\n    : await query<${pascal}>(\n        'INSERT INTO "${tableName}" DEFAULT VALUES RETURNING *',\n        []\n      );\n  const row = res.rows[0];\n  if (!row) {\n    throw new Error("Failed to upsert record into ${tableName}");\n  }\n  return row;\n}`;
  } else if (isStringPk) {
    const idAssignment = isUuidPk
      ? `  const _id = (${pkVarName} && isUuid(${pkVarName})) ? ${pkVarName} : randomUUID();\n`
      : `  const _id = ${pkVarName} || randomUUID();\n`;
    createCode = `export async function create${pascalSingular}({ ${destructuredFields} }: Create${pascal}Data): Promise<${pascal}> {\n${idAssignment}  const res = await query<${pascal}>(\n    'INSERT INTO "${tableName}" (${insertColNames}) VALUES (${insertParams}) RETURNING *',\n    [${insertArgVals}]\n  );\n  const row = res.rows[0];\n  if (!row) {\n    throw new Error("Failed to insert record into ${tableName}");\n  }\n  return row;\n}`;
    upsertCode = `export async function upsert${pascalSingular}({ ${destructuredFields} }: Upsert${pascal}Data): Promise<${pascal}> {\n${idAssignment}  const res = await query<${pascal}>(\n    'INSERT INTO "${tableName}" (${insertColNames}) VALUES (${insertParams}) ON CONFLICT ("${pkColName}") ${pgConflictSets} RETURNING *',\n    [${insertArgVals}]\n  );\n  const row = res.rows[0];\n  if (!row) {\n    throw new Error("Failed to upsert record into ${tableName}");\n  }\n  return row;\n}`;
  } else {
    createCode = `export async function create${pascalSingular}({ ${destructuredFields} }: Create${pascal}Data): Promise<${pascal}> {\n  const res = await query<${pascal}>(\n    'INSERT INTO "${tableName}" (${insertColNames}) VALUES (${insertParams}) RETURNING *',\n    [${insertArgVals}]\n  );\n  const row = res.rows[0];\n  if (!row) {\n    throw new Error("Failed to insert record into ${tableName}");\n  }\n  return row;\n}`;
    upsertCode = `export async function upsert${pascalSingular}({ ${destructuredFields} }: Upsert${pascal}Data): Promise<${pascal}> {\n  const res = await query<${pascal}>(\n    'INSERT INTO "${tableName}" (${insertColNames}) VALUES (${insertParams}) ON CONFLICT ("${pkColName}") ${pgConflictSets} RETURNING *',\n    [${insertArgVals}]\n  );\n  const row = res.rows[0];\n  if (!row) {\n    throw new Error("Failed to upsert record into ${tableName}");\n  }\n  return row;\n}`;
  }

  const updateCode = updateCols.length > 0
    ? isUuidPk
      ? `export async function update${pascalSingular}(${pkVarName}: ${pkType}, { ${updateDestructured} }: Update${pascal}Data): Promise<${pascal} | null> {\n  if (!isUuid(${pkVarName})) {\n    return null;\n  }\n  const res = await query<${pascal}>(\n    'UPDATE "${tableName}" SET ${setClauses} WHERE "${pkColName}" = $1 RETURNING *',\n    [${pkVarName}, ${updateArgVals}]\n  );\n  return res.rows[0] || null;\n}`
      : `export async function update${pascalSingular}(${pkVarName}: ${pkType}, { ${updateDestructured} }: Update${pascal}Data): Promise<${pascal} | null> {\n  const res = await query<${pascal}>(\n    'UPDATE "${tableName}" SET ${setClauses} WHERE "${pkColName}" = $1 RETURNING *',\n    [${pkVarName}, ${updateArgVals}]\n  );\n  return res.rows[0] || null;\n}`
    : isUuidPk
    ? `export async function update${pascalSingular}(${pkVarName}: ${pkType}): Promise<${pascal} | null> {\n  if (!isUuid(${pkVarName})) {\n    return null;\n  }\n  const res = await query<${pascal}>('SELECT * FROM "${tableName}" WHERE "${pkColName}" = $1 LIMIT 1', [${pkVarName}]);\n  return res.rows[0] || null;\n}`
    : `export async function update${pascalSingular}(${pkVarName}: ${pkType}): Promise<${pascal} | null> {\n  const res = await query<${pascal}>('SELECT * FROM "${tableName}" WHERE "${pkColName}" = $1 LIMIT 1', [${pkVarName}]);\n  return res.rows[0] || null;\n}`;

  const deleteCode = isUuidPk
    ? `export async function delete${pascalSingular}ById(${pkVarName}: ${pkType}): Promise<{ success: boolean; message: string }> {\n  if (!isUuid(${pkVarName})) {\n    return { success: false, message: "Record not found (invalid UUID)" };\n  }\n  await query('DELETE FROM "${tableName}" WHERE "${pkColName}" = $1', [${pkVarName}]);\n  return { success: true, message: "${pascalSingular} deleted successfully" };\n}`
    : `export async function delete${pascalSingular}ById(${pkVarName}: ${pkType}): Promise<{ success: boolean; message: string }> {\n  await query('DELETE FROM "${tableName}" WHERE "${pkColName}" = $1', [${pkVarName}]);\n  return { success: true, message: "${pascalSingular} deleted successfully" };\n}`;

  const findByIdCode = isUuidPk
    ? `export async function find${pascalSingular}ById(${pkVarName}: ${pkType}): Promise<${pascal} | null> {\n  if (!isUuid(${pkVarName})) {\n    return null;\n  }\n  const res = await query<${pascal}>('SELECT * FROM "${tableName}" WHERE "${pkColName}" = $1 LIMIT 1', [${pkVarName}]);\n  return res.rows[0] || null;\n}`
    : `export async function find${pascalSingular}ById(${pkVarName}: ${pkType}): Promise<${pascal} | null> {\n  const res = await query<${pascal}>('SELECT * FROM "${tableName}" WHERE "${pkColName}" = $1 LIMIT 1', [${pkVarName}]);\n  return res.rows[0] || null;\n}`;

  const ops: DbOperationFunction[] = [
    {
      id: `auto-find-all-${tableName}`,
      name: `findAll${pascalPlural}`,
      kind: "findAll",
      description: `Retrieve all rows from ${tableName}`,
      signature: `findAll${pascalPlural}(limit?: number, offset?: number): Promise<${pascal}[]>`,
      params: [
        { name: "limit", type: "number", required: false, defaultValue: "20" },
        { name: "offset", type: "number", required: false, defaultValue: "0" },
      ],
      returnType: `Promise<${pascal}[]>`,
      pagination: { enabled: true, defaultLimit: 20, maxLimit: 100, mode: "offset" },
      logicMode: "code",
      prompt: `Retrieve all records from the ${tableName} table using parameterized PostgreSQL query with limit and offset.`,
      code: `export async function findAll${pascalPlural}(limit = 20, offset = 0): Promise<${pascal}[]> {\n  const res = await query<${pascal}>('SELECT * FROM "${tableName}" ORDER BY "${pkColName}" LIMIT $1 OFFSET $2', [limit, offset]);\n  return res.rows;\n}`,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-find-by-id-${tableName}`,
      name: `find${pascalSingular}ById`,
      kind: "findById",
      description: `Find a ${tableName} record by ${pkColName}`,
      signature: `find${pascalSingular}ById(${pkVarName}: ${pkType}): Promise<${pascal} | null>`,
      params: [{ name: pkVarName, type: pkType, required: true }],
      returnType: `Promise<${pascal} | null>`,
      logicMode: "code",
      prompt: `Find a single record from the ${tableName} table by primary key (${pkColName}).`,
      code: findByIdCode,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-create-${tableName}`,
      name: `create${pascalSingular}`,
      kind: "create",
      description: `Create a new record in ${tableName}`,
      signature: `create${pascalSingular}({ ${destructuredFields} }: Create${pascal}Data): Promise<${pascal}>`,
      params: [{ name: createDestructuredParam, type: `Create${pascal}Data`, required: true }],
      returnType: `Promise<${pascal}>`,
      logicMode: "code",
      prompt: `Insert a new record into the ${tableName} table and return the created row.`,
      code: createCode,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-update-${tableName}`,
      name: `update${pascalSingular}`,
      kind: "update",
      description: `Update a ${tableName} record by ${pkColName}`,
      signature: updateCols.length > 0
        ? `update${pascalSingular}(${pkVarName}: ${pkType}, { ${updateDestructured} }: Update${pascal}Data): Promise<${pascal} | null>`
        : `update${pascalSingular}(${pkVarName}: ${pkType}): Promise<${pascal} | null>`,
      params: [
        { name: pkVarName, type: pkType, required: true },
        {
          name: updateCols.length > 0 ? `{ ${updateDestructured} }` : "data",
          type: `Update${pascal}Data`,
          required: true,
        },
      ],
      returnType: `Promise<${pascal} | null>`,
      logicMode: "code",
      prompt: `Update an existing record in the ${tableName} table by primary key.`,
      code: updateCode,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-upsert-${tableName}`,
      name: `upsert${pascalSingular}`,
      kind: "upsert",
      description: `Insert or update a record in ${tableName}`,
      signature: `upsert${pascalSingular}({ ${destructuredFields} }: Upsert${pascal}Data): Promise<${pascal}>`,
      params: [{ name: createDestructuredParam, type: `Upsert${pascal}Data`, required: true }],
      returnType: `Promise<${pascal}>`,
      logicMode: "code",
      prompt: `Insert or update a record in the ${tableName} table on conflict and return the record.`,
      code: upsertCode,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-delete-${tableName}`,
      name: `delete${pascalSingular}ById`,
      kind: "delete",
      description: `Delete a ${tableName} record by ${pkColName}`,
      signature: `delete${pascalSingular}ById(${pkVarName}: ${pkType}): Promise<{ success: boolean; message: string }>`,
      params: [{ name: pkVarName, type: pkType, required: true }],
      returnType: `Promise<{ success: boolean; message: string }>`,
      logicMode: "code",
      prompt: `Delete a record from the ${tableName} table by primary key.`,
      code: deleteCode,
      enabled: true,
      isAutoGenerated: true,
    },
  ];

  // Index-based fetch operations (PostgreSQL async version)
  const seenIndexCols = new Set<string>();
  const effectiveIndexes: { name: string; columns: string; isUnique?: boolean }[] = [];
  indexes.forEach((idx) => {
    const norm = (idx.columns || "").toLowerCase().replace(/\s+/g, "");
    if (norm && !seenIndexCols.has(norm)) {
      seenIndexCols.add(norm);
      effectiveIndexes.push(idx);
    }
  });

  effectiveIndexes.forEach((idx, i) => {
    const colList = (idx.columns || "").split(",").map((c) => c.trim()).filter(Boolean);
    if (colList.length === 0) return;

    const rawIdxName = idx.name || `idx_${colList.join("_")}`;
    const cleanName = rawIdxName.replace(new RegExp(`^idx_${tableName}_|^idx_|^by_`, "i"), "");
    const pascalIdxName = toPascal(cleanName || colList.map((c) => toPascal(toVarName(c))).join("And"));

    const colIsForeignKey = colList.some((c) =>
      columns.find((col) => col.name.toLowerCase() === c.toLowerCase())?.isForeignKey ||
      c.toLowerCase().endsWith("_id")
    );
    const isUnique = Boolean(idx.isUnique) && !colIsForeignKey;

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

    const paramList: { name: string; type: string; required?: boolean; defaultValue?: string }[] = colList.map((c) => {
      const colObj = columns.find((col) => toSqlIdentifier(col.name, "col") === toSqlIdentifier(c, "col"));
      const colType = colObj ? sqlColumnToTsType(colObj.type) : "string";
      return { name: toVarName(c), type: colType, required: true };
    });

    if (!isUnique) {
      paramList.push(
        { name: "limit", type: "number", required: false, defaultValue: "20" },
        { name: "offset", type: "number", required: false, defaultValue: "0" },
      );
    }

    const returnType = isUnique ? `Promise<${pascal} | null>` : `Promise<${pascal}[]>`;
    const where = colList.map((c, idxNum) => `"${toSqlIdentifier(c, "col")}" = $${idxNum + 1}`).join(" AND ");
    const args = colList.map((c) => toVarName(c)).join(", ");
    const paramSig = paramList
      .map((p) => `${p.name}: ${p.type}${p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ""}`)
      .join(", ");

    const indexCode = isUnique
      ? `export async function ${fnName}(${paramSig}): ${returnType} {\n  const res = await query<${pascal}>('SELECT * FROM "${tableName}" WHERE ${where} LIMIT 1', [${args}]);\n  return res.rows[0] || null;\n}`
      : `export async function ${fnName}(${paramSig}): ${returnType} {\n  const res = await query<${pascal}>('SELECT * FROM "${tableName}" WHERE ${where} LIMIT $${colList.length + 1} OFFSET $${colList.length + 2}', [${args}, limit, offset]);\n  return res.rows;\n}`;

    ops.push({
      id: opId,
      name: fnName,
      kind: "fetchByIndex",
      indexName: rawIdxName,
      description: `Find ${tableName} records by ${colList.join(", ")}`,
      signature: `${fnName}(${paramSig}): ${returnType}`,
      params: paramList,
      returnType,
      code: indexCode,
      enabled: true,
      isAutoGenerated: true,
    });
  });

  return ops;
}
