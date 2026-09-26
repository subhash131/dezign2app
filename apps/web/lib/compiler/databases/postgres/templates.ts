/**
 * Generates the connection.ts file containing the PostgreSQL pool, query helper,
 * transaction wrapper, health checker, and startup auto-migrations.
 */
export function generateConnectionFile(
  packageName: string,
  connEnvKey: string,
  tableSchemas: Record<string, Array<{ name: string; pgType: string }>>,
): string {
  const tableSchemasJson = JSON.stringify(tableSchemas, null, 2);

  return [
    "/**",
    ` * ${packageName}/connection.ts — PostgreSQL connection pool via 'pg'`,
    " *",
    " * Provides a shared Pool, parameterized query helper, transaction wrapper,",
    " * and automatic schema migration on first connection.",
    " */",
    `import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";`,
    `import { logger } from "@workspace/logger";`,
    "",
    "export type SqlParam = string | number | boolean | null | undefined | Date;",
    "",
    `const connectionString =`,
    `  process.env.${connEnvKey} ||`,
    `  process.env.DATABASE_URL ||`,
    `  "postgresql://postgres:postgres@localhost:5432/postgres";`,
    "",
    "export const pool = new Pool({",
    "  connectionString,",
    "  max: 20,",
    "  idleTimeoutMillis: 30000,",
    "  connectionTimeoutMillis: 5000,",
    "  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,",
    "});",
    "",
    "pool.on('error', (err) => {",
    "  logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });",
    "});",
    "",
    "/**",
    " * Execute a single parameterized SQL query.",
    " */",
    "export async function query<R extends QueryResultRow = Record<string, SqlParam>>(",
    "  text: string,",
    "  params?: SqlParam[]",
    "): Promise<QueryResult<R>> {",
    "  const start = Date.now();",
    "  try {",
    "    const res = await pool.query<R>(text, params);",
    "    const duration = Date.now() - start;",
    "    logger.debug('Executed PostgreSQL query', { text, duration, rows: res.rowCount });",
    "    return res;",
    "  } catch (error) {",
    "    logger.error('PostgreSQL query error', { text, error });",
    "    throw error;",
    "  }",
    "}",
    "",
    "/**",
    " * Execute multiple queries atomically in a single transaction.",
    " *",
    " * @example",
    " * const result = await withTransaction(async (client) => {",
    " *   await client.query('INSERT INTO ...');",
    " *   const res = await client.query('SELECT ...');",
    " *   return res.rows;",
    " * });",
    " */",
    "export async function withTransaction<T>(",
    "  callback: (client: PoolClient) => Promise<T>",
    "): Promise<T> {",
    "  const client = await pool.connect();",
    "  try {",
    "    await client.query('BEGIN');",
    "    const result = await callback(client);",
    "    await client.query('COMMIT');",
    "    return result;",
    "  } catch (error) {",
    "    await client.query('ROLLBACK');",
    "    logger.error('Transaction rolled back', { error });",
    "    throw error;",
    "  } finally {",
    "    client.release();",
    "  }",
    "}",
    "",
    "/**",
    " * Health check — verifies the pool can reach the PostgreSQL server.",
    " */",
    "export async function checkPostgresHealth(): Promise<{",
    "  healthy: boolean;",
    "  latencyMs: number;",
    "  version?: string;",
    "  database?: string;",
    "}> {",
    "  const start = Date.now();",
    "  try {",
    "    const res = await pool.query<{ version: string; current_database: string }>(",
    "      'SELECT version(), current_database()'",
    "    );",
    "    return {",
    "      healthy: true,",
    "      latencyMs: Date.now() - start,",
    "      version: res.rows[0]?.version,",
    "      database: res.rows[0]?.current_database,",
    "    };",
    "  } catch (error) {",
    "    logger.error('PostgreSQL health check failed', { error });",
    "    return { healthy: false, latencyMs: Date.now() - start };",
    "  }",
    "}",
    "",
    "// ── Auto-migration on startup ─────────────────────────────────────────────",
    "// Ensure all declared columns exist on already-created tables.",
    "// This runs once on module load and is safe to call repeatedly.",
    `const _tableSchemas: Record<string, Array<{ name: string; pgType: string }>> = ${tableSchemasJson};`,
    "",
    "(async () => {",
    "  try {",
    "    for (const [tableName, columns] of Object.entries(_tableSchemas)) {",
    "      for (const col of columns) {",
    "        try {",
    "          await pool.query(",
    "            `ALTER TABLE \"${tableName}\" ADD COLUMN IF NOT EXISTS \"${col.name}\" ${col.pgType}`,",
    "          );",
    "        } catch {",
    "          // Column exists or table not yet created — safe to ignore",
    "        }",
    "      }",
    "    }",
    "  } catch {",
    "    // Database may not be ready yet; migrations will retry on next startup",
    "  }",
    "})();",
  ].join("\n");
}

/**
 * Generates the package.json for the compiled PostgreSQL package.
 */
export function generatePackageJson(packageName: string): string {
  return JSON.stringify(
    {
      name: packageName,
      version: "0.0.0",
      private: true,
      description: "Shared PostgreSQL connection pool and typed async CRUD helpers",
      main: "index.ts",
      types: "index.ts",
      exports: {
        ".": "./index.ts",
        "./connection": "./connection.ts",
        "./helpers": "./helpers/index.ts",
        "./helpers/*": "./helpers/*.ts",
      },
      scripts: {
        build: "tsc",
        "check-types": "tsc --noEmit",
        test: "vitest run",
      },
      dependencies: {
        "@workspace/logger": "workspace:*",
        pg: "^8.11.3",
      },
      devDependencies: {
        "@workspace/typescript-config": "workspace:*",
        "@types/pg": "^8.11.0",
        "@types/node": "^20.11.0",
        typescript: "^5.3.3",
        vitest: "^1.6.0",
      },
    },
    null,
    2,
  );
}

/**
 * Generates the tsconfig.json for the compiled PostgreSQL package.
 */
export function generateTsConfig(): string {
  return JSON.stringify(
    {
      extends: "@workspace/typescript-config/base.json",
      compilerOptions: { outDir: "dist" },
      include: ["index.ts", "connection.ts", "helpers/**/*", "tests/**/*"],
    },
    null,
    2,
  );
}

/**
 * Generates the index.ts barrel file for the compiled PostgreSQL package.
 */
export function generateIndexBarrel(packageName: string): string {
  return [
    "/**",
    ` * ${packageName} — Shared PostgreSQL client & CRUD helpers`,
    " *",
    " * Import from this package in services, API routes, and pipeline steps.",
    " */",
    'export * from "./connection";',
    'export * from "./helpers";',
  ].join("\n");
}

/**
 * Generates the helpers/index.ts barrel file exporting all table helpers and types.
 */
export function generateHelpersBarrel(helperBarrel: string[]): string {
  return (
    `/**\n * Barrel export for all PostgreSQL table CRUD helpers.\n */\n` +
    (helperBarrel.length > 0 ? helperBarrel.join("\n") + "\n" : "export {};\n")
  );
}
