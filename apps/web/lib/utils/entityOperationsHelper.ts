import { DbOperationFunction, RedisDataStructure } from "@workspace/canvas/types";
import { sqlColumnToTsType, isSqlNumericType } from "@workspace/canvas/constants";
import { toSqlIdentifier, toTableName, toVarName } from "@/lib/compiler/utils";
import type { BackendNode } from "@/types/canvas";

function toPascal(str: string): string {
  if (!str) return "Item";
  const snake = str.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  const clean = toSqlIdentifier(snake, "table");
  return clean
    .split(/[_\-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toCamel(str: string): string {
  const p = toPascal(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

export function toSingular(str: string): string {
  if (!str) return str;
  const lower = str.toLowerCase();

  const irregulars: Record<string, string> = {
    people: "person",
    children: "child",
    men: "man",
    women: "woman",
    data: "data",
    media: "media",
    species: "species",
    series: "series",
  };

  if (irregulars[lower]) {
    const s = irregulars[lower];
    return str.charAt(0) === str.charAt(0).toUpperCase()
      ? s.charAt(0).toUpperCase() + s.slice(1)
      : s;
  }

  if (lower.endsWith("ies") && lower.length > 3) {
    return str.slice(0, -3) + (str.charAt(str.length - 3) === "I" ? "Y" : "y");
  }
  if (
    lower.endsWith("sses") ||
    lower.endsWith("shes") ||
    lower.endsWith("ches") ||
    lower.endsWith("xes") ||
    lower.endsWith("zes")
  ) {
    return str.slice(0, -2);
  }
  if (lower.endsWith("ses") && lower.length > 4) {
    if (
      lower.endsWith("status") ||
      lower.endsWith("statuses") ||
      lower.endsWith("process") ||
      lower.endsWith("processes")
    ) {
      return str.slice(0, -2);
    }
    return str.slice(0, -1);
  }
  if (
    lower.endsWith("s") &&
    !lower.endsWith("ss") &&
    !lower.endsWith("us") &&
    !lower.endsWith("is") &&
    lower.length > 2
  ) {
    return str.slice(0, -1);
  }

  return str;
}

export function toPlural(str: string): string {
  if (!str) return str;
  const lower = str.toLowerCase();

  if (
    lower.endsWith("ies") ||
    lower.endsWith("ses") ||
    (lower.endsWith("s") &&
      !lower.endsWith("ss") &&
      !lower.endsWith("us") &&
      !lower.endsWith("is"))
  ) {
    return str;
  }

  const irregulars: Record<string, string> = {
    person: "people",
    child: "children",
    man: "men",
    woman: "women",
    data: "data",
    media: "media",
    species: "species",
    series: "series",
  };

  if (irregulars[lower]) {
    const p = irregulars[lower];
    return str.charAt(0) === str.charAt(0).toUpperCase()
      ? p.charAt(0).toUpperCase() + p.slice(1)
      : p;
  }

  if (lower.endsWith("y") && !/[aeiou]y$/i.test(str)) {
    return str.slice(0, -1) + (str.charAt(str.length - 1) === "Y" ? "IES" : "ies");
  }
  if (
    lower.endsWith("s") ||
    lower.endsWith("sh") ||
    lower.endsWith("ch") ||
    lower.endsWith("x") ||
    lower.endsWith("z")
  ) {
    return str + (str.charAt(str.length - 1) === str.charAt(str.length - 1).toUpperCase() ? "ES" : "es");
  }

  return str + (str.charAt(str.length - 1) === str.charAt(str.length - 1).toUpperCase() ? "S" : "s");
}

export interface RawTableColumn {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNotNull?: boolean;
  isUnique?: boolean;
  references?: { table: string; column?: string };
}

/**
 * Generates the full suite of default DB operation functions for an entity/table,
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
  const pascal = toPascal(tableName);
  const pascalSingular = toSingular(pascal);
  const pascalPlural = toPlural(pascal);

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
  const isStringPk = pkType === "string";
  const insertColList: RawTableColumn[] = isStringPk ? [pkCol, ...writableCols] : writableCols;
  const insertCols = insertColList.map((c) => c.name).join(", ");
  const insertPlaceholders = insertColList.map(() => "?").join(", ");
  const insertBindArgs = insertColList
    .map((c) => (c.isPrimaryKey ? `_rowId` : `data.${toVarName(c.name)}`))
    .join(", ");

  const rowIdExpr =
    pkType === "number"
      ? `typeof info.lastInsertRowid === "bigint" ? Number(info.lastInsertRowid) : info.lastInsertRowid`
      : `typeof info.lastInsertRowid === "bigint" ? info.lastInsertRowid.toString() : String(info.lastInsertRowid)`;

  const createCode = insertColList.length > 0
    ? `export function create${pascalSingular}(data: Create${pascal}Data): ${pascal}Row {\n${
        isStringPk
          ? `  const _rowId = data.${pkVarName} || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));\n`
          : ""
      }  const info = stmtInsert.run(${insertBindArgs});\n${
        !isStringPk ? `  const _rowId = ${rowIdExpr};\n` : ""
      }  return { ${pkColName}: _rowId, message: "${pascalSingular} created successfully", ...data } as unknown as ${pascal}Row;\n}`
    : `export function create${pascalSingular}(): ${pascal}Row {\n  const info = db.prepare("INSERT INTO ${tableName} DEFAULT VALUES").run();\n  const _rowId = ${rowIdExpr};\n  return { ${pkColName}: _rowId, message: "${pascalSingular} created successfully" } as unknown as ${pascal}Row;\n}`;

  const updateCode = writableCols.length > 0
    ? `export function update${pascalSingular}(${pkVarName}: ${pkType}, data: Update${pascal}Data): ${pascal}Row | undefined {\n  const current = find${pascalSingular}ById(${pkVarName});\n  if (!current) return undefined;\n  const updated = { ...current, ...data };\n  stmtUpdate.run(${writableCols.map((c) => `updated.${toVarName(c.name)}`).join(", ")}, ${pkVarName});\n  const fresh = find${pascalSingular}ById(${pkVarName});\n  return fresh ? ({ ...fresh, message: "${pascalSingular} updated successfully" } as unknown as ${pascal}Row) : undefined;\n}`
    : `export function update${pascalSingular}(${pkVarName}: ${pkType}): ${pascal}Row | undefined {\n  const fresh = find${pascalSingular}ById(${pkVarName});\n  return fresh ? ({ ...fresh, message: "${pascalSingular} updated successfully" } as unknown as ${pascal}Row) : undefined;\n}`;

  const deleteCode = `export function delete${pascalSingular}ById(${pkVarName}: ${pkType}): { success: boolean; message: string } {\n  stmtDelete.run(${pkVarName});\n  return { success: true, message: "${pascalSingular} deleted successfully" };\n};`;

  const ops: DbOperationFunction[] = [
    {
      id: `auto-find-all-${tableName}`,
      name: `findAll${pascalPlural}`,
      kind: "findAll",
      description: `Retrieve all rows from ${tableName}`,
      signature: `findAll${pascalPlural}(limit?: number, offset?: number): ${pascal}Row[]`,
      params: [
        { name: "limit", type: "number", required: false, defaultValue: "20" },
        { name: "offset", type: "number", required: false, defaultValue: "0" },
      ],
      returnType: `${pascal}Row[]`,
      pagination: {
        enabled: true,
        defaultLimit: 20,
        maxLimit: 100,
        mode: "offset",
      },
      logicMode: "natural_language",
      prompt: `Retrieve all records from the ${tableName} table using prepared statements with limit and offset pagination.`,
      code: `export function findAll${pascalPlural}(limit: number = 20, offset: number = 0): ${pascal}Row[] {\n  return stmtFindAll.all(limit, offset) as unknown as ${pascal}Row[];\n}`,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-find-by-id-${tableName}`,
      name: `find${pascalSingular}ById`,
      kind: "findById",
      description: `Find a ${tableName} record by ${pkColName}`,
      signature: `find${pascalSingular}ById(${pkVarName}: ${pkType}): ${pascal}Row | undefined`,
      params: [{ name: pkVarName, type: pkType, required: true }],
      returnType: `${pascal}Row | undefined`,
      logicMode: "natural_language",
      prompt: `Find a single record from the ${tableName} table by primary key (${pkColName}). Returns undefined if not found.`,
      code: `export function find${pascalSingular}ById(${pkVarName}: ${pkType}): ${pascal}Row | undefined {\n  return stmtFindById.get(${pkVarName}) as unknown as ${pascal}Row | undefined;\n}`,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `auto-create-${tableName}`,
      name: `create${pascalSingular}`,
      kind: "create",
      description: `Create a new record in ${tableName}`,
      signature: `create${pascalSingular}(data: Create${pascal}Data): ${pascal}Row`,
      params: [{ name: "data", type: `Create${pascal}Data`, required: true }],
      returnType: `${pascal}Row`,
      logicMode: "natural_language",
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
      signature: `update${pascalSingular}(${pkVarName}: ${pkType}, data: Update${pascal}Data): ${pascal}Row | undefined`,
      params: [
        { name: pkVarName, type: pkType, required: true },
        { name: "data", type: `Update${pascal}Data`, required: true },
      ],
      returnType: `${pascal}Row | undefined`,
      logicMode: "natural_language",
      prompt: `Update an existing record in the ${tableName} table by primary key (${pkColName}) with partial fields data.`,
      code: updateCode,
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
      logicMode: "natural_language",
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

    const targetPrefix = isUnique ? pascalSingular : pascalPlural;
    const fnName =
      cleanName.toLowerCase().startsWith(pascalSingular.toLowerCase()) ||
      cleanName.toLowerCase().startsWith(pascalPlural.toLowerCase())
        ? `findBy${pascalIdxName}`
        : `find${targetPrefix}By${pascalIdxName}`;

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
    const returnType = isUnique ? `${pascal}Row | undefined` : `${pascal}Row[]`;
    const whereClause = colList.map((c) => `${c} = ?`).join(" AND ");
    const argList = colList.map((c) => toVarName(c)).join(", ") + (isUnique ? "" : ", limit, offset");

    const paramTypes = colList.map((colName) => {
      const colObj = columns.find((c) => c.name.toLowerCase() === colName.toLowerCase());
      const colType = sqlColumnToTsType(colObj?.type);
      return `${toVarName(colName)}: ${colType}`;
    }).join(", ");

    const indexCode = isUnique
      ? `const ${stmtVarName} = db.prepare<[${paramTypes}], ${pascal}Row>(\n  "SELECT * FROM ${tableName} WHERE ${whereClause}"\n);\n\nexport function ${fnName}(${paramSig}): ${returnType} {\n  return ${stmtVarName}.get(${argList}) as unknown as ${returnType};\n}`
      : `const ${stmtVarName} = db.prepare<[${paramTypes}, limit?: number, offset?: number], ${pascal}Row>(\n  "SELECT * FROM ${tableName} WHERE ${whereClause} LIMIT ? OFFSET ?"\n);\n\nexport function ${fnName}(${paramSig}): ${returnType} {\n  return ${stmtVarName}.all(${argList}) as unknown as ${returnType};\n}`;

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
      logicMode: "natural_language",
      prompt: `Find records from ${tableName} table matching ${whereClause}.`,
      code: indexCode,
      enabled: true,
      isAutoGenerated: true,
    });
  });

  return ops;
}

/**
 * Generates default Redis helper operation functions based on the Redis data structure.
 */
export function generateRedisOperations(
  label: string,
  data?: BackendNode["data"],
): DbOperationFunction[] {
  const tableName = toTableName(label || "cache");
  const pascal = toPascal(tableName);
  const pascalSingular = toSingular(pascal);
  const pascalPlural = toPlural(pascal);
  const structure: RedisDataStructure = data?.redisDataStructure || "hash";

  if (structure === "hash") {
    return [
      {
        id: `redis-hgetall-${tableName}`,
        name: `getAll${pascalSingular}Fields`,
        kind: "findAll",
        description: `Retrieve all field-value pairs from Redis hash [${label}]`,
        signature: `getAll${pascalSingular}Fields(key: string): Promise<Record<string, string>>`,
        params: [{ name: "key", type: "string", required: true }],
        returnType: "Promise<Record<string, string>>",
        logicMode: "code",
        code: `export async function getAll${pascalSingular}Fields(key: string): Promise<Record<string, string>> {\n  const redis = await getRedisClient();\n  return await redis.hgetall(key);\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
      {
        id: `redis-hget-${tableName}`,
        name: `get${pascalSingular}Field`,
        kind: "findById",
        description: `Get a specific field from Redis hash [${label}]`,
        signature: `get${pascalSingular}Field(key: string, field: string): Promise<string | null>`,
        params: [
          { name: "key", type: "string", required: true },
          { name: "field", type: "string", required: true },
        ],
        returnType: "Promise<string | null>",
        logicMode: "code",
        code: `export async function get${pascalSingular}Field(key: string, field: string): Promise<string | null> {\n  const redis = await getRedisClient();\n  return await redis.hget(key, field);\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
      {
        id: `redis-hset-${tableName}`,
        name: `set${pascalSingular}Fields`,
        kind: "create",
        description: `Set fields in Redis hash [${label}]`,
        signature: `set${pascalSingular}Fields(key: string, fields: Record<string, string | number>): Promise<number>`,
        params: [
          { name: "key", type: "string", required: true },
          { name: "fields", type: "Record<string, string | number>", required: true },
        ],
        returnType: "Promise<number>",
        logicMode: "code",
        code: `export async function set${pascalSingular}Fields(key: string, fields: Record<string, string | number>): Promise<number> {\n  const redis = await getRedisClient();\n  return await redis.hset(key, fields);\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
      {
        id: `redis-hexpire-${tableName}`,
        name: `expire${pascalSingular}Field`,
        kind: "update",
        description: `Set field-level TTL in Redis 7.4+ hash [${label}] using HEXPIRE`,
        signature: `expire${pascalSingular}Field(key: string, field: string, ttlSeconds: number): Promise<number>`,
        params: [
          { name: "key", type: "string", required: true },
          { name: "field", type: "string", required: true },
          { name: "ttlSeconds", type: "number", required: true },
        ],
        returnType: "Promise<number>",
        logicMode: "code",
        code: `export async function expire${pascalSingular}Field(key: string, field: string, ttlSeconds: number): Promise<number> {\n  const redis = await getRedisClient();\n  return (await redis.call("HEXPIRE", key, ttlSeconds, "FIELDS", 1, field)) as number;\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
      {
        id: `redis-del-${tableName}`,
        name: `delete${pascalSingular}`,
        kind: "delete",
        description: `Delete Redis hash [${label}]`,
        signature: `delete${pascalSingular}(key: string): Promise<boolean>`,
        params: [{ name: "key", type: "string", required: true }],
        returnType: "Promise<boolean>",
        logicMode: "code",
        code: `export async function delete${pascalSingular}(key: string): Promise<boolean> {\n  const redis = await getRedisClient();\n  const res = await redis.del(key);\n  return res > 0;\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
    ];
  }

  if (structure === "geo") {
    return [
      {
        id: `redis-geoadd-${tableName}`,
        name: `add${pascalSingular}Location`,
        kind: "create",
        description: `Add geospatial coordinate to [${label}] (GEOADD)`,
        signature: `add${pascalSingular}Location(key: string, longitude: number, latitude: number, member: string): Promise<number>`,
        params: [
          { name: "key", type: "string", required: true },
          { name: "longitude", type: "number", required: true },
          { name: "latitude", type: "number", required: true },
          { name: "member", type: "string", required: true },
        ],
        returnType: "Promise<number>",
        logicMode: "code",
        code: `export async function add${pascalSingular}Location(key: string, longitude: number, latitude: number, member: string): Promise<number> {\n  const redis = await getRedisClient();\n  return await redis.geoadd(key, longitude, latitude, member);\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
      {
        id: `redis-geosearch-${tableName}`,
        name: `searchNearby${pascalPlural}`,
        kind: "findAll",
        description: `Search coordinates within radius (GEOSEARCH)`,
        signature: `searchNearby${pascalPlural}(key: string, longitude: number, latitude: number, radius: number, unit: "km" | "m" | "mi" = "km"): Promise<string[]>`,
        params: [
          { name: "key", type: "string", required: true },
          { name: "longitude", type: "number", required: true },
          { name: "latitude", type: "number", required: true },
          { name: "radius", type: "number", required: true, defaultValue: "10" },
        ],
        returnType: "Promise<string[]>",
        logicMode: "code",
        code: `export async function searchNearby${pascalPlural}(key: string, longitude: number, latitude: number, radius: number = 10, unit: "km" | "m" | "mi" = "km"): Promise<string[]> {\n  const redis = await getRedisClient();\n  return (await redis.call("GEOSEARCH", key, "FROMLONLAT", longitude, latitude, "BYRADIUS", radius, unit)) as string[];\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
    ];
  }

  if (structure === "stream") {
    return [
      {
        id: `redis-xadd-${tableName}`,
        name: `add${pascalSingular}Entry`,
        kind: "create",
        description: `Append entry to Redis Stream [${label}] (XADD)`,
        signature: `add${pascalSingular}Entry(key: string, fields: Record<string, string>): Promise<string>`,
        params: [
          { name: "key", type: "string", required: true },
          { name: "fields", type: "Record<string, string>", required: true },
        ],
        returnType: "Promise<string>",
        logicMode: "code",
        code: `export async function add${pascalSingular}Entry(key: string, fields: Record<string, string>): Promise<string> {\n  const redis = await getRedisClient();\n  const args: string[] = [];\n  Object.entries(fields).forEach(([k, v]) => args.push(k, String(v)));\n  return String(await redis.xadd(key, "*", ...args));\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
      {
        id: `redis-xread-${tableName}`,
        name: `read${pascalSingular}Stream`,
        kind: "findAll",
        description: `Read entries from Redis Stream [${label}] (XREAD)`,
        signature: `read${pascalSingular}Stream(key: string, lastId: string = "0", count: number = 20): Promise<Array<[string, string[]]>>`,
        params: [
          { name: "key", type: "string", required: true },
          { name: "lastId", type: "string", required: false, defaultValue: '"0"' },
          { name: "count", type: "number", required: false, defaultValue: "20" },
        ],
        returnType: "Promise<Array<[string, string[]]>>",
        logicMode: "code",
        code: `export async function read${pascalSingular}Stream(key: string, lastId: string = "0", count: number = 20): Promise<Array<[string, string[]]>> {\n  const redis = await getRedisClient();\n  return (await redis.xread("COUNT", count, "STREAMS", key, lastId)) || [];\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
    ];
  }

  if (structure === "zset") {
    return [
      {
        id: `redis-zadd-${tableName}`,
        name: `add${pascalSingular}Member`,
        kind: "create",
        description: `Add member with numerical score to Sorted Set (ZADD)`,
        signature: `add${pascalSingular}Member(key: string, score: number, member: string): Promise<number>`,
        params: [
          { name: "key", type: "string", required: true },
          { name: "score", type: "number", required: true },
          { name: "member", type: "string", required: true },
        ],
        returnType: "Promise<number>",
        logicMode: "code",
        code: `export async function add${pascalSingular}Member(key: string, score: number, member: string): Promise<number> {\n  const redis = await getRedisClient();\n  return await redis.zadd(key, score, member);\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
      {
        id: `redis-zrange-${tableName}`,
        name: `getTop${pascalPlural}`,
        kind: "findAll",
        description: `Get top ranked members from Sorted Set (ZREVRANGE)`,
        signature: `getTop${pascalPlural}(key: string, count: number = 10): Promise<string[]>`,
        params: [
          { name: "key", type: "string", required: true },
          { name: "count", type: "number", required: false, defaultValue: "10" },
        ],
        returnType: "Promise<string[]>",
        logicMode: "code",
        code: `export async function getTop${pascalPlural}(key: string, count: number = 10): Promise<string[]> {\n  const redis = await getRedisClient();\n  return (await redis.zrevrange(key, 0, count - 1)) || [];\n}`,
        enabled: true,
        isAutoGenerated: true,
      },
    ];
  }

  // Default: String / JSON
  return [
    {
      id: `redis-get-${tableName}`,
      name: `get${pascalSingular}`,
      kind: "findById",
      description: `Retrieve cached value for key from Redis`,
      signature: `get${pascalSingular}<T = Record<string, string | number | boolean | null>>(key: string): Promise<T | null>`,
      params: [{ name: "key", type: "string", required: true }],
      returnType: "Promise<Record<string, string | number | boolean | null> | null>",
      logicMode: "code",
      code: `export async function get${pascalSingular}<T = Record<string, string | number | boolean | null>>(key: string): Promise<T | null> {\n  const redis = await getRedisClient();\n  const data = await redis.get(key);\n  if (!data) return null;\n  try { return JSON.parse(data); } catch { return null; }\n}`,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `redis-set-${tableName}`,
      name: `set${pascalSingular}`,
      kind: "create",
      description: `Cache value in Redis with optional TTL`,
      signature: `set${pascalSingular}<T = Record<string, string | number | boolean | null>>(key: string, value: T, ttlSeconds?: number): Promise<void>`,
      params: [
        { name: "key", type: "string", required: true },
        { name: "value", type: "Record<string, string | number | boolean | null>", required: true },
        { name: "ttlSeconds", type: "number", required: false, defaultValue: "3600" },
      ],
      returnType: "Promise<void>",
      logicMode: "code",
      code: `export async function set${pascalSingular}<T = Record<string, string | number | boolean | null>>(key: string, value: T, ttlSeconds?: number): Promise<void> {\n  const redis = await getRedisClient();\n  const serialized = typeof value === "string" ? value : JSON.stringify(value);\n  if (ttlSeconds && ttlSeconds > 0) {\n    await redis.setex(key, ttlSeconds, serialized);\n  } else {\n    await redis.set(key, serialized);\n  }\n}`,
      enabled: true,
      isAutoGenerated: true,
    },
    {
      id: `redis-del-${tableName}`,
      name: `delete${pascalSingular}`,
      kind: "delete",
      description: `Delete cached key from Redis`,
      signature: `delete${pascalSingular}(key: string): Promise<boolean>`,
      params: [{ name: "key", type: "string", required: true }],
      returnType: "Promise<boolean>",
      logicMode: "code",
      code: `export async function delete${pascalSingular}(key: string): Promise<boolean> {\n  const redis = await getRedisClient();\n  const res = await redis.del(key);\n  return res > 0;\n}`,
      enabled: true,
      isAutoGenerated: true,
    },
  ];
}

/**
 * Helper function to retrieve the active list of DB operation functions for an entity node.
 * If entityNode has dbOperations configured on its data, returns that.
 * Otherwise generates default CRUD, index-based, relational JOIN, or Redis operations.
 */
export function getEntityDbOperations(
  entityNode?: { type?: string; data?: BackendNode["data"] } | null,
  allNodes: BackendNode[] = []
): DbOperationFunction[] {
  if (!entityNode || !entityNode.data) return [];
  const label = entityNode.data.label || "table";
  const columns = entityNode.data.columns || [];
  const indexes = entityNode.data.indexes || [];

  const isRedis =
    entityNode.data.dbType === "redis" ||
    entityNode.type === "redis_schema" ||
    entityNode.type === "redis-cache";

  if (isRedis) {
    if (entityNode.data.dbOperations && entityNode.data.dbOperations.length > 0) {
      return entityNode.data.dbOperations;
    }
    return generateRedisOperations(label, entityNode.data);
  }

  const rawOps =
    entityNode.data.dbOperations && entityNode.data.dbOperations.length > 0
      ? entityNode.data.dbOperations
      : generateDefaultDbOperations(label, columns, indexes, allNodes);

  // Deduplicate operations by name and id
  const seenNames = new Set<string>();
  const deduped: DbOperationFunction[] = [];

  rawOps.forEach((op) => {
    if (!op || !op.name) return;
    if (seenNames.has(op.name)) return;
    seenNames.add(op.name);
    deduped.push(op);
  });

  return deduped;
}



