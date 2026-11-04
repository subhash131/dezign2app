import { normalizePostgresDbType, arePostgresTypesEquivalent, normalizeToPostgresType } from "@/lib/schema/columnTypes";
import { resolveConnectionString, resolveTableAndSchema, isSslRequiredForConfig } from "./connection";
import { AlteredColumnDefinition, CanvasForeignKey, PostgresConnectionConfig, PostgresTableSyncResult } from "./types";

/**
 * Checks whether a canvas table entity exists in the live PostgreSQL database
 * and identifies missing or extra columns/indexes/foreign keys (schema drift).
 */
export async function checkPostgresTableSync(
  connection: PostgresConnectionConfig,
  tableName: string,
  columns?: Array<{ name?: string; type?: string; isPrimaryKey?: boolean; isNotNull?: boolean; isUnique?: boolean }>,
  schema?: string,
  indexes?: Array<{ name: string; columns: string; isUnique?: boolean }>,
  foreignKeys?: Array<CanvasForeignKey>,
): Promise<PostgresTableSyncResult> {
  const { Pool } = await import("pg");
  const connectionString = resolveConnectionString(connection);
  const { safeTable, targetSchema } = resolveTableAndSchema(tableName, schema);

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
      foreignSchema: (fk.foreignSchema || targetSchema).trim(),
      onDelete: fk.onDelete || "CASCADE",
      onUpdate: fk.onUpdate,
    }));

  if (!safeTable) {
    return {
      success: false,
      serverReachable: false,
      tableExists: false,
      inSync: false,
      missingColumns: [],
      alteredColumns: [],
      extraColumns: [],
      existingColumns: [],
      missingIndexes: validCanvasIndexes,
      extraIndexes: [],
      existingIndexes: [],
      missingForeignKeys: validCanvasFks,
      extraForeignKeys: [],
      existingForeignKeys: [],
      missingPrerequisiteTables: [],
      error: "Invalid table name",
    };
  }

  const maskedUri = connectionString.replace(/:([^:@]+)@/, ":••••@");
  console.log(`[checkPostgresTableSync] Validating table "${safeTable}" on schema "${targetSchema}" against: ${maskedUri}`, {
    sslRequired: isSslRequiredForConfig(connection, connectionString),
  });
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    ssl: isSslRequiredForConfig(connection, connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  let client: import("pg").PoolClient | undefined;
  try {
    client = await pool.connect();

    // Check if table exists in the configured schema
    const checkRes = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE LOWER(table_name) = LOWER($1)
          AND table_schema = $2
      ) AS exists`,
      [safeTable, targetSchema],
    );
    const tableExists = Boolean(checkRes.rows[0]?.exists);

    const canvasCols = (columns || []).map((c) => ({
      name: c.name || "col",
      type: c.type || "string",
      isPrimaryKey: Boolean(c.isPrimaryKey),
      isNotNull: Boolean(c.isNotNull),
      isUnique: Boolean(c.isUnique),
    }));

    // Check which prerequisite tables exist in the database
    const allTablesRes = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [targetSchema],
    );
    const existingTableNames = new Set(allTablesRes.rows.map((r) => r.table_name.toLowerCase()));

    const missingPrerequisiteTables = Array.from(
      new Set(
        validCanvasFks
          .filter((fk) => !existingTableNames.has(fk.foreignTable.toLowerCase()))
          .map((fk) => fk.foreignTable),
      ),
    );

    if (!tableExists) {
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

    // Table exists, query existing columns from the configured schema
    const colsRes = await client.query<{ column_name: string; data_type: string; udt_name: string }>(
      `SELECT column_name, data_type, udt_name 
       FROM information_schema.columns 
       WHERE LOWER(table_name) = LOWER($1)
         AND table_schema = $2`,
      [safeTable, targetSchema],
    );

    const existingColumns = colsRes.rows.map((r) => ({
      name: r.column_name,
      type: normalizePostgresDbType(r.data_type, r.udt_name),
    }));
    const existingColMap = new Map(
      colsRes.rows.map((r) => [
        r.column_name.toLowerCase(),
        {
          dataType: r.data_type,
          udtName: r.udt_name,
          normalizedType: normalizePostgresDbType(r.data_type, r.udt_name),
        },
      ]),
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
      const existing = existingColMap.get(colNameLower);
      if (!existing) continue;

      const isPk = Boolean(
        (col as { isPrimaryKey?: boolean }).isPrimaryKey ||
        colNameLower === "id"
      );
      const isEq = arePostgresTypesEquivalent(col.type, existing.dataType, existing.udtName, isPk);
      if (!isEq) {
        const targetType = normalizeToPostgresType(col.type, isPk);
        alteredColumns.push({
          name: col.name,
          oldType: existing.normalizedType,
          newType: targetType,
        });
      }
    }

    // Query existing non-primary standalone indexes
    let existingIndexes: Array<{ name: string; columns: string; isUnique?: boolean }> = [];
    try {
      const idxRes = await client.query<{
        index_name: string;
        is_unique: boolean;
        column_names: string;
      }>(
        `SELECT
           i.relname AS index_name,
           ix.indisunique AS is_unique,
           ARRAY_TO_STRING(
             ARRAY(
               SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
               FROM generate_series(0, ix.indnatts - 1) as k
             ),
             ', '
           ) AS column_names
         FROM pg_class t
         JOIN pg_namespace n ON n.oid = t.relnamespace
         JOIN pg_index ix ON ix.indrelid = t.oid
         JOIN pg_class i ON i.oid = ix.indexrelid
         WHERE LOWER(t.relname) = LOWER($1)
           AND n.nspname = $2
           AND NOT ix.indisprimary
           AND i.oid NOT IN (
             SELECT conindid 
             FROM pg_constraint 
             WHERE conrelid = t.oid AND conindid > 0
           )`,
        [safeTable, targetSchema],
      );

      existingIndexes = (idxRes.rows || []).map((r) => ({
        name: r.index_name,
        columns: r.column_names,
        isUnique: Boolean(r.is_unique),
      }));
    } catch {
      existingIndexes = [];
    }

    const missingIndexes = validCanvasIndexes.filter((cIdx) => {
      const cName = cIdx.name.toLowerCase();
      const cCols = (cIdx.columns || "")
        .split(",")
        .map((c) => c.trim().replace(/^["'`]|["'`]$/g, "").toLowerCase())
        .filter(Boolean)
        .join(",");
      const fallbackName = `idx_${safeTable.toLowerCase()}_${cName}`;
      return !existingIndexes.some((dbIdx) => {
        const dbName = dbIdx.name.toLowerCase();
        const dbCols = (dbIdx.columns || "")
          .split(",")
          .map((c) => c.trim().replace(/^["'`]|["'`]$/g, "").toLowerCase())
          .filter(Boolean)
          .join(",");
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
      const dbCols = (dbIdx.columns || "")
        .split(",")
        .map((c) => c.trim().replace(/^["'`]|["'`]$/g, "").toLowerCase())
        .filter(Boolean)
        .join(",");
      return !validCanvasIndexes.some((cIdx) => {
        const cName = cIdx.name.toLowerCase();
        const cCols = (cIdx.columns || "")
          .split(",")
          .map((c) => c.trim().replace(/^["'`]|["'`]$/g, "").toLowerCase())
          .filter(Boolean)
          .join(",");
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
      const fkRes = await client.query<{
        constraint_name: string;
        column_name: string;
        foreign_table: string;
        foreign_column: string;
        foreign_schema: string;
        delete_rule: string;
        update_rule: string;
      }>(
        `SELECT
           c.conname AS constraint_name,
           att.attname AS column_name,
           cl_ref.relname AS foreign_table,
           att_ref.attname AS foreign_column,
           n_ref.nspname AS foreign_schema,
           c.confdeltype::text AS delete_rule,
           c.confupdtype::text AS update_rule
         FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
         JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = ANY(c.conkey)
         JOIN pg_class cl_ref ON cl_ref.oid = c.confrelid
         JOIN pg_namespace n_ref ON n_ref.oid = cl_ref.relnamespace
         JOIN pg_attribute att_ref ON att_ref.attrelid = c.confrelid AND att_ref.attnum = ANY(c.confkey)
         WHERE c.contype = 'f'
           AND LOWER(cl.relname) = LOWER($1)
           AND n.nspname = $2`,
        [safeTable, targetSchema],
      );

      const ruleMap: Record<string, string> = {
        c: "CASCADE",
        n: "SET NULL",
        d: "SET DEFAULT",
        r: "RESTRICT",
        a: "NO ACTION",
      };

      existingForeignKeys = (fkRes.rows || []).map((r) => ({
        name: r.constraint_name,
        column: r.column_name,
        foreignTable: r.foreign_table,
        foreignColumn: r.foreign_column,
        foreignSchema: r.foreign_schema,
        onDelete: ruleMap[r.delete_rule] || r.delete_rule,
        onUpdate: ruleMap[r.update_rule] || r.update_rule,
      }));
    } catch {
      existingForeignKeys = [];
    }

    // Query which columns in targetSchema form a valid single-column FK target (unique constraint or single-column PK or unique index)
    let candidateKeySet = new Set<string>();
    try {
      const candidateRes = await client.query<{ table_name: string; column_name: string }>(
        `SELECT LOWER(cl.relname) AS table_name, LOWER(att.attname) AS column_name
         FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
         JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = ANY(c.conkey)
         WHERE c.contype IN ('p', 'u')
           AND n.nspname = $1
           AND array_length(c.conkey, 1) = 1
         UNION
         SELECT LOWER(cl.relname) AS table_name, LOWER(att.attname) AS column_name
         FROM pg_index ix
         JOIN pg_class cl ON cl.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
         JOIN pg_attribute att ON att.attrelid = cl.oid AND att.attnum = ANY(ix.indkey)
         WHERE ix.indisunique = true
           AND n.nspname = $1
           AND array_length(ix.indkey, 1) = 1`,
        [targetSchema],
      );
      candidateKeySet = new Set(
        (candidateRes.rows || []).map((r) => `${r.table_name}.${r.column_name}`),
      );
    } catch {
      candidateKeySet = new Set();
    }

    const missingForeignKeys = validCanvasFks.filter((cFk) => {
      const cCol = cFk.column.toLowerCase();
      const cTargetTable = cFk.foreignTable.toLowerCase();
      const cTargetCol = cFk.foreignColumn.toLowerCase();

      // If the target table exists in DB, but the target column is not a candidate key (unique/PK),
      // PostgreSQL cannot support a physical foreign key constraint. Treat as logical canvas relation.
      if (
        existingTableNames.has(cTargetTable) &&
        !candidateKeySet.has(`${cTargetTable}.${cTargetCol}`)
      ) {
        return false;
      }

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
    console.error(`[checkPostgresTableSync] ❌ Database error checking table "${safeTable}":`, {
      message: error instanceof Error ? error.message : String(error),
      code: (error as any)?.code,
      detail: (error as any)?.detail,
      hint: (error as any)?.hint,
      stack: (error as any)?.stack,
    });
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
    if (client) client.release();
    await pool.end().catch(() => {});
  }
}
