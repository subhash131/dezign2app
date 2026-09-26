import type { BackendNode, BackendEdge } from "@/types/canvas";
import type {
  CompiledFile,
  CompiledDatabaseResult,
  ReusableFunction,
} from "@workspace/canvas/types";
import { toTableName, toVarName, toSingular } from "../../utils";
import type { PostgresOptions } from "./types";
import { getColumns } from "./utils";
import {
  buildTableDDL,
  BETTERAUTH_PG_DDL,
  BETTERAUTH_PG_SCHEMAS,
  PAYMENTS_PG_DDL,
  PG_SEED_SQL,
  generateSchemaSql,
} from "./ddl";
import { generatePostgresTableHelpers } from "./helpers";
import {
  generateConnectionFile,
  generatePackageJson,
  generateTsConfig,
  generateIndexBarrel,
  generateHelpersBarrel,
} from "./templates";
import {
  generateDatabaseConnectionTest,
  generateTableHelperTest,
} from "../../generators/databaseTestGenerator";

// Re-export all modular components for external consumption
export * from "./types";
export * from "./utils";
export * from "./ddl";
export * from "./helpers";
export * from "./templates";

/**
 * Compiles database nodes and canvas entities into a complete, standalone
 * PostgreSQL package under packages/db-postgres (or custom folder).
 *
 * Generated artifacts:
 * - schema.sql: Complete DDL with user tables, BetterAuth, Payments, and test seeds
 * - connection.ts: Connection pool (pg), parameterized query, withTransaction, health check, auto-migrations
 * - helpers/{entity}.ts: Typed async CRUD helpers with $1, $2 parameterized queries and RETURNING *
 * - helpers/index.ts: Re-exports all table helpers and types
 * - index.ts: Root package entry point
 * - package.json: Pre-configured with pg and @workspace/logger
 * - tsconfig.json: Pre-configured TypeScript configuration
 */
export function compilePostgresDatabase(
  allNodes: BackendNode[],
  _allEdges: BackendEdge[],
  options: PostgresOptions = {},
): CompiledDatabaseResult {
  const entityNodes = allNodes.filter(
    (n) => n.type === "entity" || n.type === "db_ref",
  );

  const files: CompiledFile[] = [];
  const allReusableFunctions: ReusableFunction[] = [];

  const seenTableNames = new Set<string>();
  const tables: BackendNode[] = entityNodes.filter((node) => {
    const name = toTableName(node.data?.label || node.data?.tableRef || "table");
    if (seenTableNames.has(name)) return false;
    seenTableNames.add(name);
    return true;
  });

  const packageName = options.packageName || "@workspace/db-postgres";
  const connEnvKey =
    options.connectionEnvVar ||
    options.dbNode?.data?.connectionStringEnv ||
    "DATABASE_URL";

  const helperBarrel: string[] = [];
  const seenExportedSymbols = new Set<string>();
  const tableSchemas: Record<string, Array<{ name: string; pgType: string }>> = {};

  // ── 1. DDL generation from entity nodes ───────────────────────────────────
  const userDdlStatements: string[] = [];
  const createdTableNames = new Set<string>();

  tables.forEach((tableNode) => {
    const tableName = toTableName(tableNode.data?.label || "table");
    createdTableNames.add(tableName.toLowerCase());
    const cols = getColumns(tableNode);
    const indexes = (tableNode.data?.indexes || []).filter(
      (idx: { name?: string; columns?: string }) => idx && idx.columns,
    );
    const stmts = buildTableDDL(tableName, cols, indexes, tableSchemas);
    userDdlStatements.push(...stmts);
  });

  // ── 2. BetterAuth DDL (only tables not already on canvas) ─────────────────
  const authDdlStatements: string[] = [];
  const authTableNames = [
    "user",
    "session",
    "account",
    "verification",
    "invitation",
    "jwks",
    "passkey",
    "twofactor",
    "ratelimit",
  ];
  if (!createdTableNames.has("user") && !createdTableNames.has("users")) {
    authDdlStatements.push(...BETTERAUTH_PG_DDL);
    authTableNames.forEach((t) => createdTableNames.add(t));
    // Supplement tableSchemas for auto-migration
    Object.entries(BETTERAUTH_PG_SCHEMAS).forEach(([t, s]) => {
      if (!tableSchemas[t]) tableSchemas[t] = s;
    });
  }

  // ── 3. Payments DDL ───────────────────────────────────────────────────────
  const paymentsDdlStatements: string[] = [];
  if (
    !createdTableNames.has("subscription") &&
    !createdTableNames.has("subscriptions")
  ) {
    paymentsDdlStatements.push(...PAYMENTS_PG_DDL);
    createdTableNames.add("subscription");
  }

  // ── 4. schema.sql ─────────────────────────────────────────────────────────
  files.push({
    filename: "schema.sql",
    language: "sql",
    content: generateSchemaSql(
      userDdlStatements,
      authDdlStatements,
      paymentsDdlStatements,
      PG_SEED_SQL,
    ),
  });

  // ── 5. Per-table helpers ───────────────────────────────────────────────────
  tables.forEach((tableNode) => {
    const rawName = tableNode.data?.label || tableNode.data?.tableRef || "table";
    const tableName = toTableName(rawName);
    const varName = toVarName(toSingular(tableName));

    const { code, fns, typeExports, valueExports } =
      generatePostgresTableHelpers(tableNode, tables, packageName);

    files.push({
      filename: `helpers/${varName}.ts`,
      language: "typescript",
      content: code,
    });

    allReusableFunctions.push(...fns);

    const uniqueTypeExports = (typeExports || []).filter((sym) => {
      if (seenExportedSymbols.has(sym)) return false;
      seenExportedSymbols.add(sym);
      return true;
    });
    const uniqueValueExports = (valueExports || []).filter((sym) => {
      if (seenExportedSymbols.has(sym)) return false;
      seenExportedSymbols.add(sym);
      return true;
    });

    if (uniqueTypeExports.length > 0) {
      helperBarrel.push(
        `export type { ${uniqueTypeExports.join(", ")} } from "./${varName}";`,
      );
    }
    if (uniqueValueExports.length > 0) {
      helperBarrel.push(
        `export { ${uniqueValueExports.join(", ")} } from "./${varName}";`,
      );
    }

    files.push(generateTableHelperTest(tableNode, tables, "postgres", varName));
  });

  // ── tests/connection.test.ts ──────────────────────────────────────────────
  files.push(generateDatabaseConnectionTest("postgres", packageName));

  // ── 6. helpers/index.ts ───────────────────────────────────────────────────
  files.push({
    filename: "helpers/index.ts",
    language: "typescript",
    content: generateHelpersBarrel(helperBarrel),
  });

  // ── 7. connection.ts ──────────────────────────────────────────────────────
  files.push({
    filename: "connection.ts",
    language: "typescript",
    content: generateConnectionFile(packageName, connEnvKey, tableSchemas),
  });

  // ── 8. index.ts ───────────────────────────────────────────────────────────
  files.push({
    filename: "index.ts",
    language: "typescript",
    content: generateIndexBarrel(packageName),
  });

  // ── 9. package.json ───────────────────────────────────────────────────────
  files.push({
    filename: "package.json",
    language: "json",
    content: generatePackageJson(packageName),
  });

  // ── 10. tsconfig.json ─────────────────────────────────────────────────────
  files.push({
    filename: "tsconfig.json",
    language: "json",
    content: generateTsConfig(),
  });

  return { files, reusableFunctions: allReusableFunctions };
}
