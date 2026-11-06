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
  generateLocalSyncFile,
  generateValidateScript,
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
 * - sync.ts: Programmatic local validation & migration functions matching dbSyncStore (validateTable, validateDatabase, applyTableSync, syncAll)
 * - scripts/validate.ts: Local CLI runner (pnpm db:validate / pnpm db:check)
 * - scripts/sync.ts: Local migration script to run directly on the developer's machine (pnpm db:push / pnpm db:sync)
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

  const compiledTableDefs: Record<string, {
    tableName: string;
    schema: string;
    columns: Array<{
      name: string;
      type: string;
      isPrimaryKey?: boolean;
      isNotNull?: boolean;
      isUnique?: boolean;
      isForeignKey?: boolean;
      references?: { table: string; column: string };
    }>;
    indexes: Array<{
      name: string;
      columns: string;
      isUnique?: boolean;
    }>;
    foreignKeys: Array<{
      name?: string;
      column: string;
      foreignTable: string;
      foreignColumn: string;
      onDelete?: string;
    }>;
  }> = {};

  tables.forEach((tableNode) => {
    const tableName = toTableName(tableNode.data?.label || "table");
    createdTableNames.add(tableName.toLowerCase());
    const cols = getColumns(tableNode);
    const rawIndexes = (tableNode.data?.indexes || []).filter(
      (idx: { name?: string; columns?: string }) => idx && idx.columns,
    );
    const validIndexes = rawIndexes.map((i: { name?: string; columns?: string; isUnique?: boolean }) => ({
      name: i.name || `idx_${tableName}_${(i.columns || "").replace(/[^a-zA-Z0-9_]/g, "_")}`,
      columns: i.columns || "",
      isUnique: Boolean(i.isUnique),
    }));
    const fks = cols
      .filter((c) => c.isForeignKey && c.references?.table && c.references?.column)
      .map((c) => ({
        name: `fk_${tableName}_${c.name}`,
        column: c.name,
        foreignTable: c.references!.table,
        foreignColumn: c.references!.column,
        onDelete: "CASCADE",
      }));

    compiledTableDefs[tableName.toLowerCase()] = {
      tableName,
      schema: tableNode.data?.schema || "public",
      columns: cols.map((c) => ({
        name: c.name,
        type: c.type || "string",
        isPrimaryKey: Boolean(c.isPrimaryKey),
        isNotNull: Boolean(c.isNotNull),
        isUnique: Boolean(c.isUnique),
        isForeignKey: Boolean(c.isForeignKey),
        references: c.references ? { table: c.references.table, column: c.references.column } : undefined,
      })),
      indexes: validIndexes,
      foreignKeys: fks,
    };

    const stmts = buildTableDDL(tableName, cols, rawIndexes, tableSchemas);
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

    if (!compiledTableDefs[t.toLowerCase()]) {
      compiledTableDefs[t.toLowerCase()] = {
        tableName: t,
        schema: "public",
        columns: s.map((col) => ({
          name: col.name,
          type: col.pgType.toLowerCase(),
          isPrimaryKey: col.name.toLowerCase() === "id",
        })),
        indexes: [],
        foreignKeys: [],
      };
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
    if (!compiledTableDefs["subscription"]) {
      compiledTableDefs["subscription"] = {
        tableName: "subscription",
        schema: "public",
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true },
          { name: "userId", type: "text", isNotNull: true },
          { name: "status", type: "text", isNotNull: true },
          { name: "planId", type: "text", isNotNull: true },
          { name: "createdAt", type: "timestamptz" },
          { name: "updatedAt", type: "timestamptz" },
        ],
        indexes: [],
        foreignKeys: [],
      };
    }
  }

  // ── 4. schema.sql ─────────────────────────────────────────────────────────
  const seedSql =
    options.personas && options.personas.length > 0
      ? buildPgSeedSql(options.personas, createdTableNames, BETTERAUTH_PG_SCHEMAS)
      : PG_SEED_SQL;

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

  const tableDefinitionsJson = JSON.stringify(compiledTableDefs, null, 2);

  // ── 5. sync.ts (Programmatic local validation & migration functions) ──────
  files.push({
    filename: "sync.ts",
    language: "typescript",
    content: generateLocalSyncFile(packageName, connEnvKey, tableDefinitionsJson),
  });

  // ── 6. scripts/validate.ts (CLI validation runner: pnpm db:validate) ──────
  files.push({
    filename: "scripts/validate.ts",
    language: "typescript",
    content: generateValidateScript(packageName),
  });

  // ── 7. scripts/sync.ts (CLI migration runner: pnpm db:push) ───────────────
  files.push({
    filename: "scripts/sync.ts",
    language: "typescript",
    content: generateSyncScript(packageName, connEnvKey),
  });

  // ── 8. Per-table helpers ──────────────────────────────────────────────────
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

  // ── 10. helpers/index.ts ──────────────────────────────────────────────────
  files.push({
    filename: "helpers/index.ts",
    language: "typescript",
    content: generateHelpersBarrel(helperBarrel),
  });

  // ── 11. connection.ts ─────────────────────────────────────────────────────
  files.push({
    filename: "connection.ts",
    language: "typescript",
    content: generateConnectionFile(packageName, connEnvKey, tableSchemas),
  });

  // ── 12. index.ts ──────────────────────────────────────────────────────────
  files.push({
    filename: "index.ts",
    language: "typescript",
    content: generateIndexBarrel(packageName),
  });

  // ── 13. package.json ──────────────────────────────────────────────────────
  files.push({
    filename: "package.json",
    language: "json",
    content: generatePackageJson(packageName),
  });

  // ── 14. tsconfig.json ─────────────────────────────────────────────────────
  files.push({
    filename: "tsconfig.json",
    language: "json",
    content: generateTsConfig(),
  });

  return { files, reusableFunctions: allReusableFunctions };
}
