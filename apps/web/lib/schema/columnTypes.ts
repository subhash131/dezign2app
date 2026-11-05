/**
 * Supported column types for database entities.
 * Includes full PostgreSQL types with fallback support for SQLite.
 */
export const POSTGRES_COLUMN_TYPES = [
  "TEXT",
  "VARCHAR",
  "UUID",
  "TIMESTAMPTZ",
  "TIMESTAMP",
  "INTEGER",
  "BIGINT",
  "SMALLINT",
  "SERIAL",
  "BIGSERIAL",
  "BOOLEAN",
  "DATE",
  "TIME",
  "JSONB",
  "JSON",
  "NUMERIC",
  "DECIMAL",
  "REAL",
  "DOUBLE PRECISION",
  "BYTEA",
] as const;

export const SQLITE_COLUMN_TYPES = [
  "TEXT",
  "INTEGER",
  "REAL",
  "BOOLEAN",
  "BLOB",
] as const;

export const ALL_COLUMN_TYPES = [
  "TEXT",
  "VARCHAR",
  "UUID",
  "TIMESTAMPTZ",
  "TIMESTAMP",
  "INTEGER",
  "BIGINT",
  "SERIAL",
  "BIGSERIAL",
  "BOOLEAN",
  "DATE",
  "TIME",
  "JSONB",
  "JSON",
  "NUMERIC",
  "DECIMAL",
  "REAL",
  "DOUBLE PRECISION",
  "BYTEA",
  "BLOB",
] as const;

export const COLUMN_TYPES = ALL_COLUMN_TYPES;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export function getColumnTypesForEngine(engine?: string): readonly string[] {
  const e = (engine || "postgres").toLowerCase();
  if (e === "sqlite") {
    return SQLITE_COLUMN_TYPES;
  }
  return POSTGRES_COLUMN_TYPES;
}

/**
 * Normalizes an arbitrary column type string to a valid PostgreSQL type.
 */
export function normalizeToPostgresType(type?: string, isPrimaryKey?: boolean): string {
  if (!type) return "TEXT";
  const t = type.toLowerCase().trim();

  if (isPrimaryKey) {
    if (t === "number" || t === "int" || t === "integer" || t === "bigint" || t === "serial" || t === "bigserial") {
      return "BIGSERIAL";
    }
    if (t === "uuid") return "UUID";
    return "TEXT";
  }

  if (t === "number" || t === "int" || t === "integer") return "INTEGER";
  if (t === "smallint") return "SMALLINT";
  if (t === "bigint") return "BIGINT";
  if (t === "serial") return "SERIAL";
  if (t === "bigserial") return "BIGSERIAL";
  if (t === "float" || t === "double" || t === "double precision") return "DOUBLE PRECISION";
  if (t === "real") return "REAL";
  if (t === "numeric" || t === "decimal") return "NUMERIC";
  if (t === "boolean" || t === "bool") return "BOOLEAN";
  if (t === "timestamptz" || t === "timestamp with time zone") return "TIMESTAMPTZ";
  if (t === "timestamp" || t === "datetime" || t === "timestamp without time zone") return "TIMESTAMP";
  if (t === "date") return "DATE";
  if (t === "time") return "TIME";
  if (t === "jsonb") return "JSONB";
  if (t === "json" || t === "object") return "JSONB";
  if (t === "array") return "JSONB";
  if (t === "uuid") return "UUID";
  if (t === "varchar") return "VARCHAR";
  if (t === "bytea") return "BYTEA";
  if (t === "text" || t === "string") return "TEXT";

  const upper = type.toUpperCase().trim();
  if ((POSTGRES_COLUMN_TYPES as readonly string[]).includes(upper)) {
    return upper;
  }
  return "TEXT";
}

/**
 * Normalizes PostgreSQL data_type or udt_name from information_schema.columns to standard canonical type.
 */
export function normalizePostgresDbType(dataType?: string, udtName?: string): string {
  const dt = (dataType || "").toLowerCase().trim();
  const udt = (udtName || "").toLowerCase().trim();

  if (udt === "uuid" || dt === "uuid") return "UUID";
  if (dt === "character varying" || dt === "varchar" || udt === "varchar") return "VARCHAR";
  if (dt === "text" || udt === "text") return "TEXT";
  if (dt === "integer" || udt === "int4") return "INTEGER";
  if (dt === "bigint" || udt === "int8") return "BIGINT";
  if (dt === "smallint" || udt === "int2") return "SMALLINT";
  if (dt === "boolean" || udt === "bool" || dt === "bool" || udt === "boolean") return "BOOLEAN";
  if (dt === "timestamp with time zone" || udt === "timestamptz") return "TIMESTAMPTZ";
  if (dt === "timestamp without time zone" || dt === "timestamp" || udt === "timestamp") return "TIMESTAMP";
  if (dt === "double precision" || udt === "float8") return "DOUBLE PRECISION";
  if (dt === "real" || udt === "float4") return "REAL";
  if (dt === "numeric" || dt === "decimal" || udt === "numeric") return "NUMERIC";
  if (dt === "bytea" || udt === "bytea") return "BYTEA";
  if (dt === "jsonb" || udt === "jsonb") return "JSONB";
  if (dt === "json" || udt === "json") return "JSON";
  if (dt === "date" || udt === "date") return "DATE";
  if (dt.startsWith("time") || udt.startsWith("time")) return "TIME";

  return normalizeToPostgresType(dt || udt);
}

/**
 * Checks if a canvas column type is semantically equivalent to the PostgreSQL live DB column type.
 */
export function arePostgresTypesEquivalent(
  canvasType?: string,
  dbDataType?: string,
  dbUdtName?: string,
  isPrimaryKey?: boolean,
): boolean {
  const normCanvas = normalizeToPostgresType(canvasType, isPrimaryKey);
  const normDb = normalizePostgresDbType(dbDataType, dbUdtName);

  if (normCanvas === normDb) return true;

  // Primary key or integer sequence synonyms
  if ((normCanvas === "BIGSERIAL" || normCanvas === "BIGINT") && normDb === "BIGINT") return true;
  if ((normCanvas === "SERIAL" || normCanvas === "INTEGER") && normDb === "INTEGER") return true;
  if ((normCanvas === "NUMERIC" || normCanvas === "DECIMAL") && normDb === "NUMERIC") return true;

  // Integer compatibility for primary keys or serial equivalents (BIGINT / int8 vs INTEGER / int4)
  if (
    isPrimaryKey &&
    (normCanvas === "INTEGER" || normCanvas === "BIGINT" || normCanvas === "BIGSERIAL" || normCanvas === "SERIAL") &&
    (normDb === "INTEGER" || normDb === "BIGINT")
  ) {
    return true;
  }

  return false;
}
