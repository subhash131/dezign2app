export const DEFAULT_DATABASE_NODE_LABEL = "Primary PostgreSQL DB";
export const DEFAULT_DATABASE_ENGINE = "postgres" as const;

export const DEFAULT_DATABASE_ENV_VARS = {
  connectionStringEnv: "DATABASE_URL",
  dbFilePathEnv: "DB_FILE_PATH",
} as const;

export const DATABASE_CATEGORY_MAP: Record<string, "sql" | "nosql" | "vector" | "key-value"> = {
  sqlite: "sql",
  postgres: "sql",
  mysql: "sql",
  mariadb: "sql",
  cockroachdb: "sql",
  mongodb: "nosql",
  dynamodb: "nosql",
  firestore: "nosql",
  pinecone: "vector",
  qdrant: "vector",
  milvus: "vector",
  weaviate: "vector",
  redis: "key-value",
};

export const DB_COLUMN_TYPES = {
  UUID: "UUID",
  VARCHAR: "VARCHAR",
  TEXT: "TEXT",
  BOOLEAN: "BOOLEAN",
  TIMESTAMPTZ: "TIMESTAMPTZ",
  TIMESTAMP: "TIMESTAMP",
  INTEGER: "INTEGER",
  BIGINT: "BIGINT",
  SMALLINT: "SMALLINT",
  INT: "INT",
  SERIAL: "SERIAL",
  BIGSERIAL: "BIGSERIAL",
  JSON: "JSON",
  JSONB: "JSONB",
  DATE: "DATE",
  TIME: "TIME",
  FLOAT: "FLOAT",
  DECIMAL: "DECIMAL",
  NUMERIC: "NUMERIC",
  REAL: "REAL",
  DOUBLE_PRECISION: "DOUBLE PRECISION",
  BYTEA: "BYTEA",
  VECTOR: "VECTOR",
} as const;

export type DbColumnType = (typeof DB_COLUMN_TYPES)[keyof typeof DB_COLUMN_TYPES];

export const SQL_NUMERIC_COLUMN_TYPES = [
  "int",
  "integer",
  "bigint",
  "number",
  "serial",
  "bigserial",
  "smallint",
  "tinyint",
  "float",
  "real",
  "double",
  "double precision",
  "numeric",
  "decimal",
] as const;

export const SQL_BOOLEAN_COLUMN_TYPES = [
  "boolean",
  "bool",
] as const;

export const SQL_STRING_COLUMN_TYPES = [
  "string",
  "text",
  "varchar",
  "char",
  "uuid",
  "date",
  "time",
  "timestamp",
  "timestamptz",
  "json",
  "jsonb",
  "bytea",
] as const;

export function isSqlNumericType(type?: string): boolean {
  if (!type) return false;
  return (SQL_NUMERIC_COLUMN_TYPES as readonly string[]).includes(type.toLowerCase().trim());
}

export function isSqlBooleanType(type?: string): boolean {
  if (!type) return false;
  return (SQL_BOOLEAN_COLUMN_TYPES as readonly string[]).includes(type.toLowerCase().trim());
}

export function sqlColumnToTsType(type?: string): "number" | "boolean" | "string" {
  const t = (type || "string").toLowerCase().trim();
  if (isSqlNumericType(t)) return "number";
  if (isSqlBooleanType(t)) return "boolean";
  return "string";
}

export const DEFAULT_ENTITY_COLUMNS = [
  { name: "id", type: DB_COLUMN_TYPES.UUID, isPrimaryKey: true },
  { name: "created_at", type: DB_COLUMN_TYPES.TIMESTAMPTZ },
  { name: "updated_at", type: DB_COLUMN_TYPES.TIMESTAMPTZ },
] as const;
