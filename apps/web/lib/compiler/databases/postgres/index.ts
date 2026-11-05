import type { BackendNode, BackendEdge } from "@/types/canvas";
import type {
  CompiledFile,
  CompiledDatabaseResult,
  ReusableFunction,
} from "@workspace/canvas/types";
import { toTableName, toVarName, toSingular, toPlural } from "../../utils";
import type { PostgresOptions } from "./types";
import { getColumns } from "./utils";
import {
  buildTableDDL,
  BETTERAUTH_PG_DDL,
  BETTERAUTH_PG_SCHEMAS,
  PAYMENTS_PG_DDL,
  PG_SEED_SQL,
  buildPgSeedSql,
  generateSchemaSql,
} from "./ddl";
import { generatePostgresTableHelpers } from "./helpers";
import {
  generateConnectionFile,
  generateSyncScript,
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
 * - scripts/sync.ts: Local migration script to run directly on the developer's machine (pnpm db:push)
 * - helpers/{entity}.ts: Typed async CRUD helpers with $1, $2 parameterized queries and RETURNING *
 * - helpers/index.ts: Re-exports all table helpers and types
 * - index.ts: Root package entry point
 * - package.json: Pre-configured with pg, tsx, and @workspace/logger
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
    "organization",
    "member",
    "team",
    "teammember",
  ];
  if (!createdTableNames.has("user") && !createdTableNames.has("users")) {
    authDdlStatements.push(...BETTERAUTH_PG_DDL);
    authTableNames.forEach((t) => createdTableNames.add(t));
  }

  // Supplement tableSchemas for startup auto-migration for ALL Better Auth tables and plugin columns
  Object.entries(BETTERAUTH_PG_SCHEMAS).forEach(([t, s]) => {
    if (!tableSchemas[t]) {
      tableSchemas[t] = [...s];
    } else {
      const existingColNames = new Set(
        tableSchemas[t]!.map((c) => c.name.toLowerCase()),
      );
      s.forEach((col) => {
        if (!existingColNames.has(col.name.toLowerCase())) {
          tableSchemas[t]!.push(col);
          existingColNames.add(col.name.toLowerCase());
        }
      });
    }
  });

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
  const seedSql =
    options.personas && options.personas.length > 0
      ? buildPgSeedSql(options.personas, createdTableNames, BETTERAUTH_PG_SCHEMAS)
      : "";

  files.push({
    filename: "schema.sql",
    language: "sql",
    content: generateSchemaSql(
      userDdlStatements,
      authDdlStatements,
      paymentsDdlStatements,
      seedSql,
    ),
  });

  // ── 5. scripts/sync.ts (Local execution migration runner) ─────────────────
  files.push({
    filename: "scripts/sync.ts",
    language: "typescript",
    content: generateSyncScript(packageName, connEnvKey),
  });

  // ── 6. Per-table helpers ───────────────────────────────────────────────────
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

    const pluralVarName = toVarName(toPlural(tableName));
    if (pluralVarName !== varName) {
      files.push({
        filename: `helpers/${pluralVarName}.ts`,
        language: "typescript",
        content: `export * from "./${varName}";\n`,
      });
    }

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

  // ── 7. helpers/index.ts ───────────────────────────────────────────────────
  files.push({
    filename: "helpers/index.ts",
    language: "typescript",
    content: generateHelpersBarrel(helperBarrel),
  });

  // ── 8. connection.ts ──────────────────────────────────────────────────────
  files.push({
    filename: "connection.ts",
    language: "typescript",
    content: generateConnectionFile(packageName, connEnvKey, tableSchemas),
  });

  // ── 9. index.ts ───────────────────────────────────────────────────────────
  files.push({
    filename: "index.ts",
    language: "typescript",
    content: generateIndexBarrel(packageName),
  });

  // ── 10. package.json ──────────────────────────────────────────────────────
  files.push({
    filename: "package.json",
    language: "json",
    content: generatePackageJson(packageName),
  });

  // ── 11. tsconfig.json ─────────────────────────────────────────────────────
  files.push({
    filename: "tsconfig.json",
    language: "json",
    content: generateTsConfig(),
  });

  return { files, reusableFunctions: allReusableFunctions };
}
