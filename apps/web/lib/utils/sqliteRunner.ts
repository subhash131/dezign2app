import fs from "fs";
import path from "path";
import { DatabaseSync, SqliteBindValue } from "node:sqlite";
import { CanvasEntityColumn } from "@workspace/canvas/types";
import { executeFunctionCode } from "../database-runner/functionCodeRunner";
import type { CanvasForeignKey, PrerequisiteTableDefinition } from "./postgresRunner";

// Strongly-typed JSON structures avoiding any / unknown
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

export function isJsonObject(val: unknown): val is JsonObject {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Resolve SQLite database file path.
 * If relative, resolves against the monorepo workspace root where dev.db lives.
 */
export function resolveSqlitePath(dbFilePath = "dev.db", projectDir?: string): string {
  if (path.isAbsolute(dbFilePath)) return dbFilePath;

  let searchDir = projectDir || process.cwd();
  while (searchDir && searchDir !== path.dirname(searchDir)) {
    if (
      fs.existsSync(path.join(searchDir, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(searchDir, "turbo.json"))
    ) {
      return path.resolve(searchDir, dbFilePath);
    }
    searchDir = path.dirname(searchDir);
  }
  return path.resolve(process.cwd(), dbFilePath);
}

/**
 * Sanitize SQL identifier against injection.
 */
export function sanitizeIdentifier(identifier: string, fallback = "item"): string {
  const cleaned = identifier.replace(/[^a-zA-Z0-9_]/g, "");
  return cleaned || fallback;
}

/**
 * Map canvas column data type to SQLite storage type.
 */
export function mapColumnTypeToSqlite(type?: string): string {
  if (!type) return "TEXT";
  const t = type.toLowerCase();
  if (t === "number" || t === "int" || t === "integer" || t === "bigint") return "INTEGER";
  if (t === "float" || t === "double" || t === "real" || t === "decimal") return "REAL";
  if (t === "boolean" || t === "bool") return "INTEGER";
  if (t === "blob" || t === "bytea") return "BLOB";
  return "TEXT";
}

/**
 * Convert a raw SQLite row into a clean, strongly-typed JSON object.
 */
export function formatSqliteRow(row: Record<string, SqliteBindValue>): JsonObject {
  const obj: JsonObject = {};
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === "bigint") {
      obj[key] = val.toString();
    } else if (val instanceof Uint8Array) {
      obj[key] = Buffer.from(val).toString("base64");
    } else {
      obj[key] = val;
    }
  }
  return obj;
}

/**
 * Auto-ensure SQLite table and its columns exist in dev.db.
 */
export function ensureSqliteTable(
  db: DatabaseSync,
  tableName: string,
  columns?: CanvasEntityColumn[],
  foreignKeys?: CanvasForeignKey[],
): string {
  const safeTable = sanitizeIdentifier(tableName, "records");

  const checkStmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
  );
  const exists = checkStmt.get(safeTable);

  if (!exists) {
    const colSqlList: string[] = [];
    const constraints: string[] = [];
    const pkColNames: string[] = [];
    const explicitPkCols = (columns || []).filter(
      (c) => c.isPrimaryKey || c.isPrimary || c.primaryKey,
    );

    if (columns && columns.length > 0) {
      for (const col of columns) {
        const colName = sanitizeIdentifier(col.name, "col");
        const colType = mapColumnTypeToSqlite(col.type);
        const isPk =
          explicitPkCols.length > 0
            ? Boolean(col.isPrimaryKey || col.isPrimary || col.primaryKey)
            : colName.toLowerCase() === "id";

        if (isPk) {
          pkColNames.push(colName);
        }

        const notNullClause = isPk || col.isNotNull ? " NOT NULL" : "";

        if (isPk && explicitPkCols.length <= 1) {
          colSqlList.push(`"${colName}" ${colType} PRIMARY KEY`);
        } else {
          colSqlList.push(`"${colName}" ${colType}${notNullClause}`);
        }
      }
    }

    if (pkColNames.length === 0 && !colSqlList.some((c) => c.includes("PRIMARY KEY"))) {
      colSqlList.unshift('"id" TEXT PRIMARY KEY');
    }
    if (!colSqlList.some((c) => c.startsWith('"created_at" '))) {
      colSqlList.push('"created_at" TEXT DEFAULT CURRENT_TIMESTAMP');
    }
    if (!colSqlList.some((c) => c.startsWith('"updated_at" '))) {
      colSqlList.push('"updated_at" TEXT DEFAULT CURRENT_TIMESTAMP');
    }

    if (pkColNames.length > 1) {
      const pkList = pkColNames.map((c) => `"${c}"`).join(", ");
      constraints.push(`PRIMARY KEY (${pkList})`);
    }

    if (foreignKeys && foreignKeys.length > 0) {
      for (const fk of foreignKeys) {
        const fkCol = sanitizeIdentifier(fk.column, "col");
        const fkTarget = sanitizeIdentifier(fk.foreignTable, "records");
        const fkTargetCol = sanitizeIdentifier(fk.foreignColumn, "id");
        const onDelete = (fk.onDelete || "CASCADE").toUpperCase();
        constraints.push(`FOREIGN KEY ("${fkCol}") REFERENCES "${fkTarget}"("${fkTargetCol}") ON DELETE ${onDelete}`);
      }
    }

    db.exec(`CREATE TABLE IF NOT EXISTS "${safeTable}" (${[...colSqlList, ...constraints].join(", ")});`);
  } else if (columns && columns.length > 0) {
    const infoStmt = db.prepare(`PRAGMA table_info("${safeTable}")`);
    const infoRows = infoStmt.all();
    const existing = new Set<string>();
    for (const r of infoRows) {
      const colNameVal = r.name;
      if (typeof colNameVal === "string") {
        existing.add(colNameVal.toLowerCase());
      }
    }
    for (const col of columns) {
      const colName = sanitizeIdentifier(col.name, "col");
      if (!existing.has(colName.toLowerCase())) {
        const colType = mapColumnTypeToSqlite(col.type);
        db.exec(`ALTER TABLE "${safeTable}" ADD COLUMN "${colName}" ${colType};`);
        existing.add(colName.toLowerCase());
      }
    }
  }

  return safeTable;
}

/**
 * Rebuilds a SQLite table with updated column types while preserving existing rows.
 */
export function rebuildSqliteTableWithColumns(
  db: DatabaseSync,
  tableName: string,
  columns: CanvasEntityColumn[],
  foreignKeys?: CanvasForeignKey[],
): void {
  const safeTable = sanitizeIdentifier(tableName, "records");
  const tempTable = `${safeTable}__sync_temp_${Date.now() % 100000}_${Math.floor(Math.random() * 1000)}`;

  // 1. Get existing column names
  const infoStmt = db.prepare(`PRAGMA table_info("${safeTable}")`);
  const existingCols = (infoStmt.all() || []) as Array<{ name: string }>;
  const existingColSet = new Set(existingCols.map((c) => c.name.toLowerCase()));

  // 2. Build column definitions for temp table
  const colSqlList: string[] = [];
  const constraints: string[] = [];
  const pkColNames: string[] = [];
  const explicitPkCols = (columns || []).filter(
    (c) => c.isPrimaryKey || c.isPrimary || c.primaryKey,
  );

  if (columns && columns.length > 0) {
    for (const col of columns) {
      const colName = sanitizeIdentifier(col.name, "col");
      const colType = mapColumnTypeToSqlite(col.type);
      const isPk =
        explicitPkCols.length > 0
          ? Boolean(col.isPrimaryKey || col.isPrimary || col.primaryKey)
          : colName.toLowerCase() === "id";

      if (isPk) {
        pkColNames.push(colName);
      }

      const notNullClause = isPk || col.isNotNull ? " NOT NULL" : "";

      if (isPk && explicitPkCols.length <= 1) {
        colSqlList.push(`"${colName}" ${colType} PRIMARY KEY`);
      } else {
        colSqlList.push(`"${colName}" ${colType}${notNullClause}`);
      }
    }
  }

  if (pkColNames.length === 0 && !colSqlList.some((c) => c.includes("PRIMARY KEY"))) {
    colSqlList.unshift('"id" TEXT PRIMARY KEY');
  }
  if (!colSqlList.some((c) => c.startsWith('"created_at" '))) {
    colSqlList.push('"created_at" TEXT DEFAULT CURRENT_TIMESTAMP');
  }
  if (!colSqlList.some((c) => c.startsWith('"updated_at" '))) {
    colSqlList.push('"updated_at" TEXT DEFAULT CURRENT_TIMESTAMP');
  }

  if (pkColNames.length > 1) {
    const pkList = pkColNames.map((c) => `"${c}"`).join(", ");
    constraints.push(`PRIMARY KEY (${pkList})`);
  }

  if (foreignKeys && foreignKeys.length > 0) {
    for (const fk of foreignKeys) {
      const fkCol = sanitizeIdentifier(fk.column, "col");
      const fkTarget = sanitizeIdentifier(fk.foreignTable, "records");
      const fkTargetCol = sanitizeIdentifier(fk.foreignColumn, "id");
      const onDelete = (fk.onDelete || "CASCADE").toUpperCase();
      constraints.push(`FOREIGN KEY ("${fkCol}") REFERENCES "${fkTarget}"("${fkTargetCol}") ON DELETE ${onDelete}`);
    }
  }

  // Common columns to copy data
  const targetCols = (columns || []).map((c) => sanitizeIdentifier(c.name, "col"));
  if (!targetCols.some((c) => c.toLowerCase() === "id") && existingColSet.has("id")) targetCols.unshift("id");
  if (!targetCols.some((c) => c.toLowerCase() === "created_at") && existingColSet.has("created_at")) targetCols.push("created_at");
  if (!targetCols.some((c) => c.toLowerCase() === "updated_at") && existingColSet.has("updated_at")) targetCols.push("updated_at");

  const commonCols = targetCols.filter((c) => existingColSet.has(c.toLowerCase()));

  db.exec("PRAGMA foreign_keys=OFF;");
  try {
    db.exec(`CREATE TABLE "${tempTable}" (${[...colSqlList, ...constraints].join(", ")});`);
    if (commonCols.length > 0) {
      const colListStr = commonCols.map((c) => `"${c}"`).join(", ");
      db.exec(`INSERT INTO "${tempTable}" (${colListStr}) SELECT ${colListStr} FROM "${safeTable}";`);
    }
    db.exec(`DROP TABLE "${safeTable}";`);
    db.exec(`ALTER TABLE "${tempTable}" RENAME TO "${safeTable}";`);
  } finally {
    db.exec("PRAGMA foreign_keys=ON;");
  }
}

export interface SqliteOperationParams {
  id?: string;
  name: string;
  kind?: string;
  code?: string;
  query?: string;
  signature?: string;
  params?: Array<{ name: string; type: string; defaultValue?: string }>;
}

export interface ExecuteSqliteOptions {
  dbFilePath?: string;
  projectDir?: string;
  tableName: string;
  columns?: CanvasEntityColumn[];
  operation: SqliteOperationParams;
  args: Record<string, unknown>;
}

export interface SqliteExecutionResult {
  success: boolean;
  output: JsonValue;
  rawSql: string;
  durationMs: number;
  error?: string;
  dbInfo: {
    path: string;
    sizeBytes: number;
    table: string;
    exists: boolean;
  };
}

/**
 * Execute a real query against the SQLite database file dev.db.
 */
export async function executeSqliteLiveOperation(
  options: ExecuteSqliteOptions,
): Promise<SqliteExecutionResult> {
  const start = performance.now();
  const resolvedPath = resolveSqlitePath(options.dbFilePath, options.projectDir);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(resolvedPath);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

    const safeTable = ensureSqliteTable(db, options.tableName, options.columns);
    const { operation, args } = options;
    const name = operation.name || "";
    const kind = operation.kind || "";
    const customQuery = operation.query || "";

    const isFindAll =
      kind === "findAll" ||
      name.toLowerCase().startsWith("findall") ||
      name.toLowerCase().startsWith("getall") ||
      name.toLowerCase().startsWith("list");

    const isDelete =
      kind === "delete" ||
      name.toLowerCase().startsWith("delete") ||
      name.toLowerCase().startsWith("remove");

    const isUpdate =
      kind === "update" ||
      name.toLowerCase().startsWith("update");

    const isCreate =
      kind === "create" ||
      name.toLowerCase().startsWith("create") ||
      name.toLowerCase().startsWith("insert");

    const isUpsert =
      kind === "upsert" ||
      name.toLowerCase().startsWith("upsert");

    const isFindById =
      kind === "findById" ||
      name.toLowerCase().startsWith("findbyid") ||
      name.toLowerCase().startsWith("getbyid") ||
      (name.toLowerCase().startsWith("find") && (args.id !== undefined || args.key !== undefined));

    // 0. Custom JavaScript / TypeScript function code execution
    const code = (operation.code || "").trim();
    const hasCustomCode =
      code.length > 0 &&
      (kind === "custom" ||
        code.includes("function") ||
        code.includes("=>") ||
        code.includes("return") ||
        code.includes("stmt") ||
        code.includes("db."));

    if (hasCustomCode && (kind === "custom" || (!isFindAll && !isFindById && !isCreate && !isUpsert && !isUpdate && !isDelete))) {
      const codeRes = await executeFunctionCode({
        code,
        name,
        params: operation.params,
        args,
        db,
        tableName: safeTable,
        safeTable,
      });

      const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;
      return {
        success: codeRes.success,
        output: codeRes.output as JsonValue,
        error: codeRes.error,
        rawSql: codeRes.rawCommand,
        durationMs: codeRes.durationMs,
        dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
      };
    }

    const isSqlStatement = (text: string): boolean => {
      if (!text || typeof text !== "string") return false;
      const stripped = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/--[^\r\n]*/g, "")
        .replace(/\/\/[^\r\n]*/g, "")
        .trim();
      return /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP|PRAGMA)\b/i.test(stripped);
    };

    // 1. Custom raw SQL query
    if (
      customQuery &&
      !customQuery.startsWith("Query function for") &&
      !customQuery.startsWith("Auto-generated") &&
      !customQuery.startsWith("//") &&
      isSqlStatement(customQuery)
    ) {
      const trimmed = customQuery.trim().replace(/^\s*\/\/[^\r\n]*/gm, (match) => match.replace(/^\s*\/\//, "--"));
      if (/^SELECT|^PRAGMA/i.test(trimmed)) {
        const stmt = db.prepare(trimmed);
        const rows = stmt.all();
        const durationMs = Math.round((performance.now() - start) * 100) / 100;
        const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;
        return {
          success: true,
          output: rows.map(formatSqliteRow),
          rawSql: trimmed,
          durationMs: Math.max(0.4, durationMs),
          dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
        };
      } else {
        const stmt = db.prepare(trimmed);
        const res = stmt.run();
        const durationMs = Math.round((performance.now() - start) * 100) / 100;
        const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;
        return {
          success: true,
          output: { success: true, changes: Number(res.changes) },
          rawSql: trimmed,
          durationMs: Math.max(0.4, durationMs),
          dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
        };
      }
    }

    // 2. Find All
    if (isFindAll) {
      const limit = Math.max(1, Number(args.limit) || 20);
      const offset = Math.max(0, Number(args.offset) || 0);
      const rawSql = `SELECT * FROM ${safeTable} LIMIT ${limit} OFFSET ${offset};`;

      const stmt = db.prepare(`SELECT * FROM ${safeTable} LIMIT ? OFFSET ?`);
      const rows = stmt.all(limit, offset);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;

      return {
        success: true,
        output: rows.map(formatSqliteRow),
        rawSql,
        durationMs: Math.max(0.4, durationMs),
        dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
      };
    }

    // 3. Find By ID
    if (isFindById) {
      const idVal = String(args.id ?? args.key ?? "1");
      const rawSql = `SELECT * FROM ${safeTable} WHERE id = '${idVal}' LIMIT 1;`;

      const stmt = db.prepare(`SELECT * FROM ${safeTable} WHERE id = ? LIMIT 1`);
      const row = stmt.get(idVal);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;

      return {
        success: true,
        output: row ? formatSqliteRow(row) : null,
        rawSql,
        durationMs: Math.max(0.4, durationMs),
        dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
      };
    }

    // 4. Create (INSERT ... RETURNING *)
    if (isCreate) {
      const dataObj: JsonObject = isJsonObject(args.data)
        ? args.data
        : isJsonObject(args)
          ? args
          : {};
      const newId = String(args.id ?? dataObj.id ?? `conv_${Date.now()}`);
      const nowIso = new Date().toISOString();

      const entries: [string, SqliteBindValue][] = [];
      entries.push(["id", newId]);
      if (dataObj.created_at === undefined) entries.push(["created_at", nowIso]);
      if (dataObj.updated_at === undefined) entries.push(["updated_at", nowIso]);

      for (const [k, v] of Object.entries(dataObj)) {
        if (
          k === "id" ||
          k === "created_at" ||
          k === "updated_at" ||
          k === "limit" ||
          k === "offset"
        ) {
          continue;
        }
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
          entries.push([sanitizeIdentifier(k), v]);
        }
      }

      // Ensure any extra dynamic fields exist as columns
      const infoRows = db.prepare(`PRAGMA table_info(${safeTable})`).all();
      const existing = new Set<string>();
      for (const r of infoRows) {
        if (typeof r.name === "string") existing.add(r.name.toLowerCase());
      }
      for (const [k] of entries) {
        if (!existing.has(k.toLowerCase())) {
          db.exec(`ALTER TABLE ${safeTable} ADD COLUMN ${k} TEXT;`);
          existing.add(k.toLowerCase());
        }
      }

      const colNames = entries.map(([k]) => k).join(", ");
      const placeholders = entries.map(() => "?").join(", ");
      const bindVals = entries.map(([, v]) => v);
      const rawSql = `INSERT INTO ${safeTable} (${colNames}) VALUES (${bindVals.map((v) => JSON.stringify(v)).join(", ")}) RETURNING *;`;

      const stmt = db.prepare(
        `INSERT INTO ${safeTable} (${colNames}) VALUES (${placeholders}) RETURNING *`,
      );
      const created = stmt.get(...bindVals);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;

      return {
        success: true,
        output: created
          ? formatSqliteRow(created)
          : { id: newId, created_at: nowIso, updated_at: nowIso },
        rawSql,
        durationMs: Math.max(0.4, durationMs),
        dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
      };
    }

    // 4b. Upsert (INSERT ... ON CONFLICT(id) DO UPDATE SET ... RETURNING *)
    if (isUpsert) {
      const dataObj: JsonObject = isJsonObject(args.data)
        ? args.data
        : isJsonObject(args)
          ? args
          : {};
      const newId = String(args.id ?? dataObj.id ?? `conv_${Date.now()}`);
      const nowIso = new Date().toISOString();

      const entries: [string, SqliteBindValue][] = [];
      entries.push(["id", newId]);
      if (dataObj.created_at === undefined) entries.push(["created_at", nowIso]);
      if (dataObj.updated_at === undefined) entries.push(["updated_at", nowIso]);

      for (const [k, v] of Object.entries(dataObj)) {
        if (
          k === "id" ||
          k === "created_at" ||
          k === "updated_at" ||
          k === "limit" ||
          k === "offset"
        ) {
          continue;
        }
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
          entries.push([sanitizeIdentifier(k), v]);
        }
      }

      // Ensure any extra dynamic fields exist as columns
      const infoRows = db.prepare(`PRAGMA table_info(${safeTable})`).all();
      const existing = new Set<string>();
      for (const r of infoRows) {
        if (typeof (r as { name?: string }).name === "string") {
          existing.add((r as { name: string }).name.toLowerCase());
        }
      }
      for (const [k, v] of entries) {
        if (!existing.has(k.toLowerCase())) {
          const colType = typeof v === "number" ? "INTEGER" : "TEXT";
          try {
            db.prepare(`ALTER TABLE ${safeTable} ADD COLUMN ${k} ${colType}`).run();
            existing.add(k.toLowerCase());
          } catch {
            // Ignore if column was already added concurrently
          }
        }
      }

      const colNames = entries.map(([k]) => k).join(", ");
      const placeholders = entries.map(() => "?").join(", ");
      const bindVals = entries.map(([, v]) => v);
      const nonIdEntries = entries.filter(([k]) => k.toLowerCase() !== "id");
      const conflictSetClause = nonIdEntries.length > 0
        ? `DO UPDATE SET ` + nonIdEntries.map(([k]) => `${k} = excluded.${k}`).join(", ")
        : `DO NOTHING`;

      const rawSql = `INSERT INTO ${safeTable} (${colNames}) VALUES (${bindVals.map((v) => JSON.stringify(v)).join(", ")}) ON CONFLICT(id) ${conflictSetClause} RETURNING *;`;

      const stmt = db.prepare(
        `INSERT INTO ${safeTable} (${colNames}) VALUES (${placeholders}) ON CONFLICT(id) ${conflictSetClause} RETURNING *`,
      );
      const upserted = stmt.get(...bindVals);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;

      return {
        success: true,
        output: upserted
          ? formatSqliteRow(upserted)
          : { id: newId, created_at: nowIso, updated_at: nowIso },
        rawSql,
        durationMs: Math.max(0.4, durationMs),
        dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
      };
    }

    // 5. Update (UPDATE ... WHERE id = ? RETURNING *)
    if (isUpdate) {
      const dataObj: JsonObject = isJsonObject(args.data)
        ? args.data
        : isJsonObject(args)
          ? args
          : {};
      const idVal = String(args.id ?? dataObj.id ?? "1");
      const nowIso = new Date().toISOString();

      const updateEntries: [string, SqliteBindValue][] = [];
      for (const [k, v] of Object.entries(dataObj)) {
        if (k === "id" || k === "limit" || k === "offset") continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
          updateEntries.push([sanitizeIdentifier(k), v]);
        }
      }
      if (!updateEntries.some(([k]) => k === "updated_at")) {
        updateEntries.push(["updated_at", nowIso]);
      }

      // Ensure dynamic columns exist
      const infoRows = db.prepare(`PRAGMA table_info(${safeTable})`).all();
      const existing = new Set<string>();
      for (const r of infoRows) {
        if (typeof r.name === "string") existing.add(r.name.toLowerCase());
      }
      for (const [k] of updateEntries) {
        if (!existing.has(k.toLowerCase())) {
          db.exec(`ALTER TABLE ${safeTable} ADD COLUMN ${k} TEXT;`);
          existing.add(k.toLowerCase());
        }
      }

      const setClause = updateEntries.map(([k]) => `${k} = ?`).join(", ");
      const bindVals = [...updateEntries.map(([, v]) => v), idVal];
      const rawSql = `UPDATE ${safeTable} SET ${updateEntries.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ")} WHERE id = '${idVal}' RETURNING *;`;

      const stmt = db.prepare(
        `UPDATE ${safeTable} SET ${setClause} WHERE id = ? RETURNING *`,
      );
      const updated = stmt.get(...bindVals);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;

      return {
        success: true,
        output: updated
          ? formatSqliteRow(updated)
          : { success: false, message: `Record with id '${idVal}' not found in ${safeTable}` },
        rawSql,
        durationMs: Math.max(0.4, durationMs),
        dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
      };
    }

    // 6. Delete (DELETE FROM ... WHERE id = ?)
    if (isDelete) {
      const idVal = String(args.id ?? "1");
      const rawSql = `DELETE FROM ${safeTable} WHERE id = '${idVal}';`;

      const stmt = db.prepare(`DELETE FROM ${safeTable} WHERE id = ?`);
      const res = stmt.run(idVal);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;

      return {
        success: true,
        output: {
          success: true,
          deletedCount: Number(res.changes),
          message: `Record with id '${idVal}' was deleted from ${safeTable}.`,
        },
        rawSql,
        durationMs: Math.max(0.4, durationMs),
        dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
      };
    }

    // Fallback default: SELECT *
    const fallbackSql = `SELECT * FROM ${safeTable} LIMIT 20;`;
    const stmt = db.prepare(fallbackSql);
    const rows = stmt.all();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;

    return {
      success: true,
      output: rows.map(formatSqliteRow),
      rawSql: fallbackSql,
      durationMs: Math.max(0.4, durationMs),
      dbInfo: { path: resolvedPath, sizeBytes, table: safeTable, exists: true },
    };
  } catch (err) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;
    const errMessage = err instanceof Error ? err.message : String(err);

    return {
      success: false,
      output: null,
      rawSql: options.operation.query || `${options.operation.name}()`,
      durationMs: Math.max(0.4, durationMs),
      error: `SQLite execution error: ${errMessage}`,
      dbInfo: {
        path: resolvedPath,
        sizeBytes,
        table: sanitizeIdentifier(options.tableName, "records"),
        exists: fs.existsSync(resolvedPath),
      },
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

/**
 * Check SQLite database connectivity and status.
 */
export function checkSqliteConnection(
  dbFilePath = "dev.db",
  projectDir?: string,
): {
  success: boolean;
  latencyMs: number;
  path: string;
  sizeBytes: number;
  tableCount: number;
  error?: string;
} {
  const start = performance.now();
  const resolvedPath = resolveSqlitePath(dbFilePath, projectDir);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(resolvedPath);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    const countStmt = db.prepare(
      "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    const countRow = countStmt.get();
    let tableCount = 0;
    if (countRow && typeof countRow.count === "number") {
      tableCount = countRow.count;
    } else if (countRow && typeof countRow.count === "bigint") {
      tableCount = Number(countRow.count);
    }
    const latencyMs = Math.round((performance.now() - start) * 10) / 10;
    const sizeBytes = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath).size : 0;
    return {
      success: true,
      latencyMs: Math.max(0.4, latencyMs),
      path: resolvedPath,
      sizeBytes,
      tableCount,
    };
  } catch (err) {
    const latencyMs = Math.round((performance.now() - start) * 10) / 10;
    return {
      success: false,
      latencyMs,
      path: resolvedPath,
      sizeBytes: 0,
      tableCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// SQLite Table Schema Sync & Drift Detection
// ---------------------------------------------------------------------------
// SQLite Table Schema Sync & Drift Detection
// ---------------------------------------------------------------------------

export interface CanvasEntityIndex {
  name: string;
  columns: string;
  isUnique?: boolean;
}

function normalizeIndexColumns(colsStr: string): string[] {
  return (colsStr || "")
    .split(",")
    .map((c) => c.trim().replace(/^["'`]|["'`]$/g, "").toLowerCase())
    .filter(Boolean);
}

export interface AlteredColumnDefinition {
  name: string;
  oldType: string;
  newType: string;
}

export interface SqliteTableSyncResult {
  success: boolean;
  serverReachable: boolean;
  tableExists: boolean;
  inSync: boolean;
  missingColumns: Array<{ name: string; type: string }>;
  alteredColumns?: Array<AlteredColumnDefinition>;
  extraColumns: Array<{ name: string; type: string }>;
  existingColumns: Array<{ name: string; type: string }>;
  missingIndexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
  extraIndexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
  existingIndexes?: Array<{ name: string; columns: string; isUnique?: boolean }>;
  missingForeignKeys?: Array<CanvasForeignKey>;
  extraForeignKeys?: Array<CanvasForeignKey>;
  existingForeignKeys?: Array<CanvasForeignKey>;
  missingPrerequisiteTables?: string[];
  error?: string;
}

export interface SqliteApplySyncResult {
  success: boolean;
  createdTable: boolean;
  appliedColumns: string[];
  alteredColumns?: Array<AlteredColumnDefinition>;
  droppedColumns?: string[];
  appliedIndexes?: string[];
  droppedIndexes?: string[];
  appliedForeignKeys?: string[];
  droppedForeignKeys?: string[];
  appliedPrerequisiteTables?: string[];
  foreignKeyErrors?: string[];
  error?: string;
}

/**
 * Checks if a table, its columns, indexes, and foreign keys exist in the SQLite database file.
 */
export function checkSqliteTableSync(
  dbFilePath = "dev.db",
  tableName: string,
  columns?: CanvasEntityColumn[],
  projectDir?: string,
  indexes?: CanvasEntityIndex[],
  foreignKeys?: CanvasForeignKey[],
): SqliteTableSyncResult {
  let db: DatabaseSync | null = null;
  const canvasCols = (columns || []).map((c) => ({
    name: c.name,
    type: c.type || "TEXT",
  }));
  const validCanvasIndexes = (indexes || [])
    .filter((i) => (i.name || "").trim().length > 0 && (i.columns || "").trim().length > 0)
    .map((i) => ({
      name: i.name.trim(),
      columns: i.columns.trim(),
      isUnique: Boolean(i.isUnique),
    }));

  const validCanvasFks = (foreignKeys || [])
    .filter(
      (fk) =>
        (fk.column || "").trim().length > 0 &&
        (fk.foreignTable || "").trim().length > 0 &&
        (fk.foreignColumn || "").trim().length > 0,
    )
    .map((fk) => ({
      name: (fk.name || "").trim(),
      column: fk.column.trim(),
      foreignTable: fk.foreignTable.trim(),
      foreignColumn: fk.foreignColumn.trim(),
      onDelete: fk.onDelete || "CASCADE",
      onUpdate: fk.onUpdate,
    }));

  try {
    const resolvedPath = resolveSqlitePath(dbFilePath, projectDir);
    if (!fs.existsSync(resolvedPath)) {
      return {
        success: true,
        serverReachable: true,
        tableExists: false,
        inSync: false,
        missingColumns: canvasCols,
        alteredColumns: [],
        extraColumns: [],
        existingColumns: [],
        missingIndexes: validCanvasIndexes,
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: validCanvasFks,
        extraForeignKeys: [],
        existingForeignKeys: [],
        missingPrerequisiteTables: Array.from(new Set(validCanvasFks.map((fk) => fk.foreignTable))),
      };
    }

    db = new DatabaseSync(resolvedPath);
    const safeTable = sanitizeIdentifier(tableName, "records");
    const checkStmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND LOWER(name) = LOWER(?)",
    );
    const exists = checkStmt.get(safeTable);

    const existingTables = new Set(
      (
        (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() || []) as Array<{ name: string }>
      ).map((t) => t.name.toLowerCase()),
    );
    const missingPrerequisiteTables = Array.from(
      new Set(
        validCanvasFks
          .filter((fk) => !existingTables.has(fk.foreignTable.toLowerCase()))
          .map((fk) => fk.foreignTable),
      ),
    );

    if (!exists) {
      return {
        success: true,
        serverReachable: true,
        tableExists: false,
        inSync: false,
        missingColumns: canvasCols,
        alteredColumns: [],
        extraColumns: [],
        existingColumns: [],
        missingIndexes: validCanvasIndexes,
        extraIndexes: [],
        existingIndexes: [],
        missingForeignKeys: validCanvasFks,
        extraForeignKeys: [],
        existingForeignKeys: [],
        missingPrerequisiteTables,
      };
    }

    const infoStmt = db.prepare(`PRAGMA table_info("${safeTable}")`);
    const existingRows = (infoStmt.all() || []) as Array<{ name: string; type: string }>;
    const existingColumns = existingRows.map((r) => ({
      name: r.name,
      type: r.type,
    }));
    const existingColMap = new Map(
      existingRows.map((r) => [r.name.toLowerCase(), r.type]),
    );

    const missingColumns = canvasCols.filter(
      (c) => !existingColMap.has(c.name.toLowerCase()),
    );
    const canvasColNames = new Set(canvasCols.map((c) => c.name.toLowerCase()));
    const extraColumns = existingColumns.filter(
      (c) =>
        !canvasColNames.has(c.name.toLowerCase()) &&
        c.name.toLowerCase() !== "created_at" &&
        c.name.toLowerCase() !== "updated_at",
    );

    // Detect column type drift
    const alteredColumns: AlteredColumnDefinition[] = [];
    for (const col of canvasCols) {
      const colNameLower = col.name.toLowerCase();
      const existingType = existingColMap.get(colNameLower);
      if (!existingType) continue;

      const targetSqliteType = mapColumnTypeToSqlite(col.type);
      const currentSqliteType = mapColumnTypeToSqlite(existingType);
      if (targetSqliteType !== currentSqliteType) {
        alteredColumns.push({
          name: col.name,
          oldType: existingType,
          newType: targetSqliteType,
        });
      }
    }

    // Check indexes from sqlite_master
    const indexRows = (db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND LOWER(tbl_name) = LOWER(?) AND sql IS NOT NULL AND name NOT LIKE 'sqlite_autoindex_%'",
    ).all(safeTable) || []) as Array<{ name: string; sql: string }>;

    let indexListRows: Array<{ name: string; unique: number }> = [];
    try {
      indexListRows = (db.prepare(`PRAGMA index_list("${safeTable}")`).all() || []) as Array<{
        name: string;
        unique: number;
      }>;
    } catch {}
    const uniqueMap = new Map(indexListRows.map((r) => [r.name.toLowerCase(), r.unique === 1]));

    const existingIndexes: Array<{ name: string; columns: string; isUnique?: boolean }> = [];
    for (const row of indexRows) {
      let colNames = "";
      try {
        const idxInfoRows = (db.prepare(`PRAGMA index_info("${row.name}")`).all() || []) as Array<{
          seqno: number;
          cid: number;
          name: string;
        }>;
        colNames = idxInfoRows.map((info) => info.name).join(", ");
      } catch {}
      existingIndexes.push({
        name: row.name,
        columns: colNames,
        isUnique: uniqueMap.get(row.name.toLowerCase()) ?? false,
      });
    }

    const missingIndexes = validCanvasIndexes.filter((cIdx) => {
      const cName = cIdx.name.toLowerCase();
      const cCols = normalizeIndexColumns(cIdx.columns).join(",");
      const fallbackName = `idx_${safeTable.toLowerCase()}_${cName}`;
      return !existingIndexes.some((dbIdx) => {
        const dbName = dbIdx.name.toLowerCase();
        const dbCols = normalizeIndexColumns(dbIdx.columns).join(",");
        const nameMatches =
          dbName === cName ||
          dbName === fallbackName ||
          cName === `idx_${safeTable.toLowerCase()}_${dbName}`;
        return (
          nameMatches &&
          dbCols === cCols &&
          Boolean(dbIdx.isUnique) === Boolean(cIdx.isUnique)
        );
      });
    });

    const extraIndexes = existingIndexes.filter((dbIdx) => {
      const dbName = dbIdx.name.toLowerCase();
      const dbCols = normalizeIndexColumns(dbIdx.columns).join(",");
      return !validCanvasIndexes.some((cIdx) => {
        const cName = cIdx.name.toLowerCase();
        const cCols = normalizeIndexColumns(cIdx.columns).join(",");
        const fallbackName = `idx_${safeTable.toLowerCase()}_${cName}`;
        const nameMatches =
          dbName === cName ||
          dbName === fallbackName ||
          cName === `idx_${safeTable.toLowerCase()}_${dbName}`;
        return (
          nameMatches &&
          dbCols === cCols &&
          Boolean(dbIdx.isUnique) === Boolean(cIdx.isUnique)
        );
      });
    });

    // Query existing foreign keys
    let existingForeignKeys: Array<CanvasForeignKey> = [];
    try {
      const fkRows = (db.prepare(`PRAGMA foreign_key_list("${safeTable}")`).all() || []) as Array<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
      }>;
      existingForeignKeys = fkRows.map((r) => ({
        column: r.from,
        foreignTable: r.table,
        foreignColumn: r.to,
        onDelete: r.on_delete,
        onUpdate: r.on_update,
      }));
    } catch {
      existingForeignKeys = [];
    }

    const missingForeignKeys = validCanvasFks.filter((cFk) => {
      const cCol = cFk.column.toLowerCase();
      const cTargetTable = cFk.foreignTable.toLowerCase();
      const cTargetCol = cFk.foreignColumn.toLowerCase();
      return !existingForeignKeys.some(
        (dbFk) =>
          dbFk.column.toLowerCase() === cCol &&
          dbFk.foreignTable.toLowerCase() === cTargetTable &&
          dbFk.foreignColumn.toLowerCase() === cTargetCol,
      );
    });

    const extraForeignKeys = existingForeignKeys.filter((dbFk) => {
      const dbCol = dbFk.column.toLowerCase();
      const dbTargetTable = dbFk.foreignTable.toLowerCase();
      const dbTargetCol = dbFk.foreignColumn.toLowerCase();
      return !validCanvasFks.some(
        (cFk) =>
          cFk.column.toLowerCase() === dbCol &&
          cFk.foreignTable.toLowerCase() === dbTargetTable &&
          cFk.foreignColumn.toLowerCase() === dbTargetCol,
      );
    });

    const inSync =
      missingColumns.length === 0 &&
      alteredColumns.length === 0 &&
      extraColumns.length === 0 &&
      missingIndexes.length === 0 &&
      extraIndexes.length === 0 &&
      missingForeignKeys.length === 0 &&
      extraForeignKeys.length === 0;

    return {
      success: true,
      serverReachable: true,
      tableExists: true,
      inSync,
      missingColumns,
      alteredColumns,
      extraColumns,
      existingColumns,
      missingIndexes,
      extraIndexes,
      existingIndexes,
      missingForeignKeys,
      extraForeignKeys,
      existingForeignKeys,
      missingPrerequisiteTables,
    };
  } catch (error) {
    return {
      success: false,
      serverReachable: false,
      tableExists: false,
      inSync: false,
      missingColumns: [],
      alteredColumns: [],
      extraColumns: [],
      existingColumns: [],
      missingIndexes: [],
      extraIndexes: [],
      existingIndexes: [],
      missingForeignKeys: [],
      extraForeignKeys: [],
      existingForeignKeys: [],
      missingPrerequisiteTables: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

/**
 * Applies table creation or adds missing columns/indexes to the live SQLite file,
 * auto-creates prerequisite tables if provided, and drops removed columns/indexes.
 */
export function applySqliteTableSync(
  dbFilePath = "dev.db",
  tableName: string,
  columns?: CanvasEntityColumn[],
  projectDir?: string,
  indexes?: CanvasEntityIndex[],
  foreignKeys?: CanvasForeignKey[],
  prerequisiteTables?: PrerequisiteTableDefinition[],
): SqliteApplySyncResult {
  let db: DatabaseSync | null = null;
  const validCanvasIndexes = (indexes || [])
    .filter((i) => (i.name || "").trim().length > 0 && (i.columns || "").trim().length > 0)
    .map((i) => ({
      name: i.name.trim(),
      columns: i.columns.trim(),
      isUnique: Boolean(i.isUnique),
    }));

  const validCanvasFks = (foreignKeys || [])
    .filter(
      (fk) =>
        (fk.column || "").trim().length > 0 &&
        (fk.foreignTable || "").trim().length > 0 &&
        (fk.foreignColumn || "").trim().length > 0,
    )
    .map((fk) => ({
      name: (fk.name || "").trim(),
      column: fk.column.trim(),
      foreignTable: fk.foreignTable.trim(),
      foreignColumn: fk.foreignColumn.trim(),
      onDelete: fk.onDelete || "CASCADE",
      onUpdate: fk.onUpdate,
    }));

  try {
    const resolvedPath = resolveSqlitePath(dbFilePath, projectDir);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new DatabaseSync(resolvedPath);

    // 1. Create prerequisite tables if missing
    const appliedPrerequisiteTables: string[] = [];
    if (prerequisiteTables && prerequisiteTables.length > 0) {
      for (const prereq of prerequisiteTables) {
        const prereqTable = sanitizeIdentifier(prereq.tableName, "records");
        const existsStmt = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND LOWER(name) = LOWER(?)",
        );
        const exists = existsStmt.get(prereqTable);
        if (!exists) {
          const prereqCols: CanvasEntityColumn[] = (prereq.columns || []).map((c) => ({
            name: c.name || "col",
            type: c.type || "TEXT",
            isPrimaryKey: Boolean(c.isPrimaryKey),
            isNotNull: Boolean(c.isNotNull),
            isUnique: Boolean(c.isUnique),
          }));
          ensureSqliteTable(db, prereqTable, prereqCols);
          appliedPrerequisiteTables.push(prereqTable);
        }
      }
    }

    const safeTable = sanitizeIdentifier(tableName, "records");
    const checkStmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND LOWER(name) = LOWER(?)",
    );
    const exists = checkStmt.get(safeTable);

    if (!exists) {
      ensureSqliteTable(db, safeTable, columns, validCanvasFks);
      const appliedIndexes: string[] = [];
      const indexErrors: string[] = [];
      for (const idx of validCanvasIndexes) {
        let safeIdxName = sanitizeIdentifier(idx.name, `idx_${safeTable}`);
        const existingRel = db.prepare(
          "SELECT type, tbl_name FROM sqlite_master WHERE LOWER(name) = LOWER(?)"
        ).get(safeIdxName) as { type: string; tbl_name: string } | undefined;
        if (existingRel && (existingRel.type === "table" || existingRel.tbl_name.toLowerCase() !== safeTable.toLowerCase())) {
          safeIdxName = `idx_${safeTable}_${safeIdxName}`;
        }
        const colList = idx.columns
          .split(",")
          .map((c) => `"${sanitizeIdentifier(c.trim(), "col")}"`)
          .join(", ");
        if (safeIdxName && colList) {
          const uniqueStr = idx.isUnique ? "UNIQUE " : "";
          try {
            db.exec(`CREATE ${uniqueStr}INDEX IF NOT EXISTS "${safeIdxName}" ON "${safeTable}" (${colList});`);
            appliedIndexes.push(safeIdxName);
          } catch (err) {
            const fallbackIdxName = `idx_${safeTable}_${safeIdxName}`;
            if (safeIdxName !== fallbackIdxName) {
              try {
                db.exec(`CREATE ${uniqueStr}INDEX IF NOT EXISTS "${fallbackIdxName}" ON "${safeTable}" (${colList});`);
                appliedIndexes.push(fallbackIdxName);
              } catch (fallbackErr) {
                indexErrors.push(`Index "${safeIdxName}": ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
              }
            } else {
              indexErrors.push(`Index "${safeIdxName}": ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
      }

      return {
        success: true,
        createdTable: true,
        appliedColumns: (columns || []).map((c) => c.name),
        appliedIndexes,
        appliedForeignKeys: validCanvasFks.map((fk) => fk.column),
        appliedPrerequisiteTables,
        ...(indexErrors.length > 0
          ? { error: `Table created, but index error(s): ${indexErrors.join("; ")}` }
          : {}),
      };
    }

    // Inspect existing indexes
    const indexRows = (db.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND LOWER(tbl_name) = LOWER(?) AND sql IS NOT NULL AND name NOT LIKE 'sqlite_autoindex_%'",
    ).all(safeTable) || []) as Array<{ name: string; sql: string }>;

    let indexListRows: Array<{ name: string; unique: number }> = [];
    try {
      indexListRows = (db.prepare(`PRAGMA index_list("${safeTable}")`).all() || []) as Array<{
        name: string;
        unique: number;
      }>;
    } catch {}
    const uniqueMap = new Map(indexListRows.map((r) => [r.name.toLowerCase(), r.unique === 1]));

    const existingIndexes: Array<{ name: string; columns: string; isUnique?: boolean }> = [];
    for (const row of indexRows) {
      let colNames = "";
      try {
        const idxInfoRows = (db.prepare(`PRAGMA index_info("${row.name}")`).all() || []) as Array<{
          seqno: number;
          cid: number;
          name: string;
        }>;
        colNames = idxInfoRows.map((info) => info.name).join(", ");
      } catch {}
      existingIndexes.push({
        name: row.name,
        columns: colNames,
        isUnique: uniqueMap.get(row.name.toLowerCase()) ?? false,
      });
    }

    const missingIndexes = validCanvasIndexes.filter((cIdx) => {
      const cName = cIdx.name.toLowerCase();
      const cCols = normalizeIndexColumns(cIdx.columns).join(",");
      const fallbackName = `idx_${safeTable.toLowerCase()}_${cName}`;
      return !existingIndexes.some((dbIdx) => {
        const dbName = dbIdx.name.toLowerCase();
        const dbCols = normalizeIndexColumns(dbIdx.columns).join(",");
        const nameMatches =
          dbName === cName ||
          dbName === fallbackName ||
          cName === `idx_${safeTable.toLowerCase()}_${dbName}`;
        return (
          nameMatches &&
          dbCols === cCols &&
          Boolean(dbIdx.isUnique) === Boolean(cIdx.isUnique)
        );
      });
    });

    const extraIndexes = existingIndexes.filter((dbIdx) => {
      const dbName = dbIdx.name.toLowerCase();
      const dbCols = normalizeIndexColumns(dbIdx.columns).join(",");
      return !validCanvasIndexes.some((cIdx) => {
        const cName = cIdx.name.toLowerCase();
        const cCols = normalizeIndexColumns(cIdx.columns).join(",");
        const fallbackName = `idx_${safeTable.toLowerCase()}_${cName}`;
        const nameMatches =
          dbName === cName ||
          dbName === fallbackName ||
          cName === `idx_${safeTable.toLowerCase()}_${dbName}`;
        return (
          nameMatches &&
          dbCols === cCols &&
          Boolean(dbIdx.isUnique) === Boolean(cIdx.isUnique)
        );
      });
    });

    const droppedIndexes: string[] = [];
    for (const extraIdx of extraIndexes) {
      const safeIdxName = sanitizeIdentifier(extraIdx.name, "idx");
      try {
        db.exec(`DROP INDEX IF EXISTS "${safeIdxName}";`);
        droppedIndexes.push(extraIdx.name);
      } catch {}
    }

    const infoStmt = db.prepare(`PRAGMA table_info("${safeTable}")`);
    const existingRows = (infoStmt.all() || []) as Array<{ name: string; type: string }>;
    const existingCols = new Set(existingRows.map((r) => r.name.toLowerCase()));
    const existingColMap = new Map(existingRows.map((r) => [r.name.toLowerCase(), r.type]));
    const canvasColNames = new Set((columns || []).map((c) => (c.name || "").toLowerCase()));
    const appliedColumns: string[] = [];
    const alteredColumns: AlteredColumnDefinition[] = [];
    const droppedColumns: string[] = [];

    // Detect if any columns need their type altered
    for (const col of columns || []) {
      const colName = sanitizeIdentifier(col.name, "col");
      const existingType = existingColMap.get(colName.toLowerCase());
      if (!existingType) continue;
      const targetSqliteType = mapColumnTypeToSqlite(col.type);
      const currentSqliteType = mapColumnTypeToSqlite(existingType);
      if (targetSqliteType !== currentSqliteType) {
        alteredColumns.push({
          name: colName,
          oldType: existingType,
          newType: targetSqliteType,
        });
      }
    }

    if (alteredColumns.length > 0) {
      // Rebuild table with new schema, updated types, and preserve existing rows
      rebuildSqliteTableWithColumns(db, safeTable, columns || [], validCanvasFks);
      for (const col of columns || []) {
        const colName = sanitizeIdentifier(col.name, "col");
        if (!existingCols.has(colName.toLowerCase())) {
          appliedColumns.push(colName);
        }
      }
      for (const row of existingRows) {
        const dbColLower = row.name.toLowerCase();
        if (
          !canvasColNames.has(dbColLower) &&
          dbColLower !== "created_at" &&
          dbColLower !== "updated_at"
        ) {
          droppedColumns.push(row.name);
        }
      }
    } else {
      // 1. Add missing columns
      for (const col of columns || []) {
        const colName = sanitizeIdentifier(col.name, "col");
        if (existingCols.has(colName.toLowerCase())) continue;
        const colType = mapColumnTypeToSqlite(col.type);
        db.exec(`ALTER TABLE "${safeTable}" ADD COLUMN "${colName}" ${colType}`);
        appliedColumns.push(colName);
      }

      // 2. Drop columns deleted from canvas
      for (const row of existingRows) {
        const dbColLower = row.name.toLowerCase();
        if (
          !canvasColNames.has(dbColLower) &&
          dbColLower !== "created_at" &&
          dbColLower !== "updated_at"
        ) {
          try {
            db.exec(`ALTER TABLE "${safeTable}" DROP COLUMN "${row.name}"`);
            droppedColumns.push(row.name);
          } catch {
            // Ignore if older SQLite doesn't support DROP COLUMN
          }
        }
      }
    }

    // 3. Create missing indexes
    const appliedIndexes: string[] = [];
    const indexErrors: string[] = [];
    for (const missingIdx of missingIndexes) {
      let safeIdxName = sanitizeIdentifier(missingIdx.name, `idx_${safeTable}`);
      const existingRel = db.prepare(
        "SELECT type, tbl_name FROM sqlite_master WHERE LOWER(name) = LOWER(?)"
      ).get(safeIdxName) as { type: string; tbl_name: string } | undefined;
      if (existingRel && (existingRel.type === "table" || existingRel.tbl_name.toLowerCase() !== safeTable.toLowerCase())) {
        safeIdxName = `idx_${safeTable}_${safeIdxName}`;
      }
      const colList = missingIdx.columns
        .split(",")
        .map((c) => `"${sanitizeIdentifier(c.trim(), "col")}"`)
        .join(", ");
      if (safeIdxName && colList) {
        const uniqueStr = missingIdx.isUnique ? "UNIQUE " : "";
        try {
          db.exec(`CREATE ${uniqueStr}INDEX IF NOT EXISTS "${safeIdxName}" ON "${safeTable}" (${colList});`);
          appliedIndexes.push(safeIdxName);
        } catch (err) {
          const fallbackIdxName = `idx_${safeTable}_${safeIdxName}`;
          if (safeIdxName !== fallbackIdxName) {
            try {
              db.exec(`CREATE ${uniqueStr}INDEX IF NOT EXISTS "${fallbackIdxName}" ON "${safeTable}" (${colList});`);
              appliedIndexes.push(fallbackIdxName);
            } catch (fallbackErr) {
              indexErrors.push(`Index "${safeIdxName}": ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
            }
          } else {
            indexErrors.push(`Index "${safeIdxName}": ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    const hasAnyChanges =
      appliedColumns.length > 0 ||
      alteredColumns.length > 0 ||
      droppedColumns.length > 0 ||
      appliedIndexes.length > 0 ||
      droppedIndexes.length > 0 ||
      appliedPrerequisiteTables.length > 0;

    return {
      success: hasAnyChanges || indexErrors.length === 0,
      createdTable: false,
      appliedColumns,
      alteredColumns,
      droppedColumns,
      appliedIndexes,
      droppedIndexes,
      appliedForeignKeys: [],
      appliedPrerequisiteTables,
      ...(indexErrors.length > 0
        ? {
            error:
              (hasAnyChanges
                ? "Schema updated, but some index(es) could not be created: "
                : "Failed to create index: ") + indexErrors.join("; "),
          }
        : {}),
    };
  } catch (error) {
    return {
      success: false,
      createdTable: false,
      appliedColumns: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

export interface SqliteDropTableResult {
  success: boolean;
  droppedTable: string;
  error?: string;
}

/**
 * Drops a table from the local SQLite database file.
 */
export function dropSqliteTable(
  dbFilePath: string,
  tableName: string,
  projectDir?: string,
): SqliteDropTableResult {
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeTable) {
    return {
      success: false,
      droppedTable: tableName,
      error: "Invalid table name",
    };
  }

  const resolvedPath = resolveSqlitePath(dbFilePath, projectDir);
  if (!fs.existsSync(resolvedPath)) {
    return {
      success: true,
      droppedTable: safeTable,
    };
  }

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(resolvedPath);
    db.exec(`DROP TABLE IF EXISTS "${safeTable}"`);
    return {
      success: true,
      droppedTable: safeTable,
    };
  } catch (error) {
    return {
      success: false,
      droppedTable: safeTable,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

export interface SqliteRenameTableResult {
  success: boolean;
  oldTableName: string;
  newTableName: string;
  error?: string;
}

/**
 * Renames a table in the local SQLite database file.
 */
export function renameSqliteTable(
  dbFilePath: string,
  oldTableName: string,
  newTableName: string,
  projectDir?: string,
): SqliteRenameTableResult {
  const safeOld = oldTableName.replace(/[^a-zA-Z0-9_]/g, "");
  const safeNew = newTableName.replace(/[^a-zA-Z0-9_]/g, "");

  if (!safeOld || !safeNew) {
    return {
      success: false,
      oldTableName,
      newTableName,
      error: "Invalid table name",
    };
  }

  const resolvedPath = resolveSqlitePath(dbFilePath, projectDir);
  if (!fs.existsSync(resolvedPath)) {
    return {
      success: true,
      oldTableName: safeOld,
      newTableName: safeNew,
    };
  }

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(resolvedPath);
    db.exec(`ALTER TABLE "${safeOld}" RENAME TO "${safeNew}"`);
    return {
      success: true,
      oldTableName: safeOld,
      newTableName: safeNew,
    };
  } catch (error) {
    return {
      success: false,
      oldTableName: safeOld,
      newTableName: safeNew,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

export interface SqliteRenameColumnResult {
  success: boolean;
  tableName: string;
  oldColumnName: string;
  newColumnName: string;
  error?: string;
}

/**
 * Renames a column in the local SQLite database file.
 */
export function renameSqliteColumn(
  dbFilePath: string,
  tableName: string,
  oldColumnName: string,
  newColumnName: string,
  projectDir?: string,
): SqliteRenameColumnResult {
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, "");
  const safeOldCol = oldColumnName.replace(/[^a-zA-Z0-9_]/g, "");
  const safeNewCol = newColumnName.replace(/[^a-zA-Z0-9_]/g, "");

  if (!safeTable || !safeOldCol || !safeNewCol) {
    return {
      success: false,
      tableName,
      oldColumnName,
      newColumnName,
      error: "Invalid identifier for table or column",
    };
  }

  const resolvedPath = resolveSqlitePath(dbFilePath, projectDir);
  if (!fs.existsSync(resolvedPath)) {
    return {
      success: true,
      tableName: safeTable,
      oldColumnName: safeOldCol,
      newColumnName: safeNewCol,
    };
  }

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(resolvedPath);
    db.exec(
      `ALTER TABLE "${safeTable}" RENAME COLUMN "${safeOldCol}" TO "${safeNewCol}"`,
    );
    return {
      success: true,
      tableName: safeTable,
      oldColumnName: safeOldCol,
      newColumnName: safeNewCol,
    };
  } catch (error) {
    return {
      success: false,
      tableName: safeTable,
      oldColumnName: safeOldCol,
      newColumnName: safeNewCol,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

