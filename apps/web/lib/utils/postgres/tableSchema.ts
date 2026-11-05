import type { Client, PoolClient } from "pg";
import { normalizeToPostgresType } from "@/lib/schema/columnTypes";
import { resolveTableAndSchema, enhancePostgresError, createPostgresClient } from "./connection";
import { PostgresConnectionConfig } from "./types";

export interface PostgresDropTableResult {
  success: boolean;
  droppedTable: string;
  error?: string;
}

export interface PostgresRenameTableResult {
  success: boolean;
  oldTableName: string;
  newTableName: string;
  error?: string;
}

export interface PostgresRenameColumnResult {
  success: boolean;
  tableName: string;
  oldColumnName: string;
  newColumnName: string;
  error?: string;
}

/**
 * Ensures table exists in PostgreSQL database, creating it with defaults and adding any missing columns.
 */
export async function ensurePostgresTable(
  client: Client | PoolClient,
  tableName: string,
  columns?: Array<{
    name?: string;
    type?: string;
    isPrimaryKey?: boolean;
    isPrimary?: boolean;
    primaryKey?: boolean;
    isNotNull?: boolean;
  }>,
  schema?: string,
): Promise<void> {
  const { safeTable, targetSchema } = resolveTableAndSchema(tableName, schema);
  if (!safeTable) return;

  const checkRes = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE LOWER(table_name) = LOWER($1)
        AND table_schema = $2
    ) AS exists`,
    [safeTable, targetSchema],
  );
  const exists = checkRes.rows[0]?.exists;

  if (!exists) {
    const colDefs: string[] = [];
    const pkColNames: string[] = [];
    const explicitPkCols = (columns || []).filter(
      (c) => c.isPrimaryKey || c.isPrimary || c.primaryKey,
    );

    if (columns && columns.length > 0) {
      for (const col of columns) {
        const colName = (col.name || "col").replace(/[^a-zA-Z0-9_]/g, "");
        const isPk = explicitPkCols.length > 0
          ? Boolean(col.isPrimaryKey || col.isPrimary || col.primaryKey)
          : colName.toLowerCase() === "id";

        if (isPk) {
          pkColNames.push(colName);
        }

        const isSinglePk = explicitPkCols.length <= 1 && isPk;
        const pgType = normalizeToPostgresType(col.type, isSinglePk);
        const defaultClause = isPk && pgType === "UUID" ? " DEFAULT gen_random_uuid()" : "";
        const notNullClause = isPk || col.isNotNull ? " NOT NULL" : "";

        if (isPk && explicitPkCols.length <= 1) {
          colDefs.push(`"${colName}" ${pgType}${defaultClause} PRIMARY KEY`);
        } else {
          colDefs.push(`"${colName}" ${pgType}${defaultClause}${notNullClause}`);
        }
      }
    }

    if (pkColNames.length === 0 && !colDefs.some((d) => d.includes("PRIMARY KEY"))) {
      colDefs.unshift(`"id" TEXT PRIMARY KEY`);
    }
    if (!colDefs.some((d) => d.startsWith('"created_at"'))) {
      colDefs.push(`"created_at" TIMESTAMPTZ DEFAULT NOW()`);
    }
    if (!colDefs.some((d) => d.startsWith('"updated_at"'))) {
      colDefs.push(`"updated_at" TIMESTAMPTZ DEFAULT NOW()`);
    }
    if (pkColNames.length > 1) {
      const pkList = pkColNames.map((c) => `"${c}"`).join(", ");
      colDefs.push(`PRIMARY KEY (${pkList})`);
    }

    if (targetSchema && targetSchema !== "public") {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${targetSchema}"`);
    }

    await client.query(
      `CREATE TABLE IF NOT EXISTS "${targetSchema}"."${safeTable}" (${colDefs.join(", ")})`,
    );
  } else if (columns && columns.length > 0) {
    // Auto-add missing columns
    const infoRes = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns 
       WHERE LOWER(table_name) = LOWER($1)
         AND table_schema = $2`,
      [safeTable, targetSchema],
    );
    const existingCols = new Set(infoRes.rows.map((r) => r.column_name.toLowerCase()));
    for (const col of columns) {
      const colName = (col.name || "").replace(/[^a-zA-Z0-9_]/g, "");
      if (!colName || existingCols.has(colName.toLowerCase())) continue;
      const pgType = normalizeToPostgresType(col.type);
      try {
        await client.query(
          `ALTER TABLE "${targetSchema}"."${safeTable}" ADD COLUMN IF NOT EXISTS "${colName}" ${pgType}`,
        );
      } catch {
        // Column may already exist in a race condition
      }
    }
  }
}

/**
 * Drops a physical table and dependent foreign keys from the live PostgreSQL database.
 */
export async function dropPostgresTable(
  connection: PostgresConnectionConfig,
  tableName: string,
  schema?: string,
): Promise<PostgresDropTableResult> {
  const { client, connectionString, isHyperdrive } = await createPostgresClient(connection);
  const { safeTable, targetSchema } = resolveTableAndSchema(tableName, schema);

  if (!safeTable) {
    return {
      success: false,
      droppedTable: tableName,
      error: "Invalid table name",
    };
  }

  try {
    await client.connect();
    await client.query(`DROP TABLE IF EXISTS "${targetSchema}"."${safeTable}" CASCADE`);
    return {
      success: true,
      droppedTable: safeTable,
    };
  } catch (error) {
    const errorInstance = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      droppedTable: safeTable,
      error: enhancePostgresError(errorInstance, connectionString, isHyperdrive),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Renames a physical table in the live PostgreSQL database.
 */
export async function renamePostgresTable(
  connection: PostgresConnectionConfig,
  oldTableName: string,
  newTableName: string,
  schema?: string,
): Promise<PostgresRenameTableResult> {
  const { client, connectionString, isHyperdrive } = await createPostgresClient(connection);
  const { safeTable: safeOld, targetSchema } = resolveTableAndSchema(oldTableName, schema);
  const { safeTable: safeNew } = resolveTableAndSchema(newTableName, targetSchema);

  if (!safeOld || !safeNew) {
    return {
      success: false,
      oldTableName,
      newTableName,
      error: "Invalid table name",
    };
  }

  try {
    await client.connect();
    await client.query(`ALTER TABLE "${targetSchema}"."${safeOld}" RENAME TO "${safeNew}"`);
    return {
      success: true,
      oldTableName: safeOld,
      newTableName: safeNew,
    };
  } catch (error) {
    const errorInstance = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      oldTableName: safeOld,
      newTableName: safeNew,
      error: enhancePostgresError(errorInstance, connectionString, isHyperdrive),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Renames a physical column in the live PostgreSQL database.
 */
export async function renamePostgresColumn(
  connection: PostgresConnectionConfig,
  tableName: string,
  oldColumnName: string,
  newColumnName: string,
  schema?: string,
): Promise<PostgresRenameColumnResult> {
  const { client, connectionString, isHyperdrive } = await createPostgresClient(connection);
  const { safeTable, targetSchema } = resolveTableAndSchema(tableName, schema);
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

  try {
    await client.connect();
    await client.query(
      `ALTER TABLE "${targetSchema}"."${safeTable}" RENAME COLUMN "${safeOldCol}" TO "${safeNewCol}"`,
    );
    return {
      success: true,
      tableName: safeTable,
      oldColumnName: safeOldCol,
      newColumnName: safeNewCol,
    };
  } catch (error) {
    const errorInstance = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      tableName: safeTable,
      oldColumnName: safeOldCol,
      newColumnName: safeNewCol,
      error: enhancePostgresError(errorInstance, connectionString, isHyperdrive),
    };
  } finally {
    await client.end().catch(() => {});
  }
}
