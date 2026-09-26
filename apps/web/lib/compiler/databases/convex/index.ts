import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  CompiledFile,
  CompiledDatabaseResult,
  ReusableFunction,
  CanvasEntityNodeData,
  CanvasDatabaseNodeData,
} from "@workspace/canvas/types";
import { sqlColumnToTsType, isSqlNumericType, isSqlBooleanType } from "@workspace/canvas/constants";
import { toTableName, toVarName, toSqlIdentifier, toSingular, toPlural } from "../../utils";
import { generateDatabaseConnectionTest } from "../../generators/databaseTestGenerator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toPascal(str: string): string {
  if (!str) return "Item";
  const snake = str.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  const clean = toSqlIdentifier(snake, "table");
  return clean
    .split(/[_\-\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

interface ColumnMeta {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  isNotNull?: boolean;
}

function getColumns(tableNode: BackendNode): ColumnMeta[] {
  const cols = tableNode.data?.columns;
  if (cols && Array.isArray(cols) && cols.length > 0) {
    return cols.map((c) => ({
      name: toSqlIdentifier(c.name || "col", "col"),
      type: c.type || "string",
      isPrimaryKey: Boolean(c.isPrimaryKey),
      isUnique: Boolean(c.isUnique),
      isForeignKey: Boolean(c.isForeignKey),
      isNotNull: Boolean(c.isNotNull),
    }));
  }
  return [
    { name: "id", type: "string", isPrimaryKey: true, isNotNull: true },
    { name: "created_at", type: "string" },
  ];
}

function mapToConvexValidator(type: string, isNotNull?: boolean): string {
  const t = (type || "").toLowerCase();
  let baseVal = "v.string()";
  if (isSqlNumericType(t) || t === "number" || t === "float" || t === "int") {
    baseVal = "v.number()";
  } else if (isSqlBooleanType(t) || t === "boolean" || t === "bool") {
    baseVal = "v.boolean()";
  } else if (t === "array" || t.endsWith("[]")) {
    baseVal = "v.array(v.string())";
  }

  if (isNotNull) {
    return baseVal;
  }
  return `v.optional(${baseVal})`;
}

const toTsType = sqlColumnToTsType;

export interface ConvexOptions {
  packageName?: string;
  packageFolder?: string;
  connectionEnvVar?: string;
  dbNode?: BackendNode;
}

// ---------------------------------------------------------------------------
// Main Convex database compiler
// ---------------------------------------------------------------------------

export function compileConvexDatabase(
  allNodes: BackendNode[],
  _allEdges: BackendEdge[],
  options: ConvexOptions = {},
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

  const packageName = options.packageName || "@workspace/db-convex";

  // 1. Generate convex/schema.ts
  const tableDefinitions: string[] = [];
  tables.forEach((tNode) => {
    const rawName = tNode.data?.label || tNode.data?.tableRef || "table";
    const tableName = toTableName(rawName);
    const cols = getColumns(tNode);

    const fieldValidators = cols
      .filter((c) => !c.isPrimaryKey || c.name !== "id") // Convex auto-manages _id
      .map((c) => `    ${c.name}: ${mapToConvexValidator(c.type, c.isNotNull)},`)
      .join("\n");

    tableDefinitions.push(
      `  ${tableName}: defineTable({\n${fieldValidators || "    // default schema\n"}\n  }),`,
    );
  });

  const schemaContent = [
    'import { defineSchema, defineTable } from "convex/server";',
    'import { v } from "convex/values";',
    "",
    "export default defineSchema({",
    tableDefinitions.join("\n\n"),
    "});",
  ].join("\n");

  files.push({
    filename: "convex/schema.ts",
    language: "typescript",
    content: schemaContent,
  });

  // 2. Generate convex/functions.ts & ReusableFunctions
  const functionBlocks: string[] = [
    'import { query, mutation } from "./_generated/server";',
    'import { v } from "convex/values";',
    "",
  ];

  tables.forEach((tNode) => {
    const rawName = tNode.data?.label || tNode.data?.tableRef || "table";
    const tableName = toTableName(rawName);
    const singularName = toSingular(tableName);
    const typeName = toPascal(singularName);
    const cols = getColumns(tNode);

    const insertValidators = cols
      .filter((c) => !c.isPrimaryKey || c.name !== "id")
      .map((c) => `    ${c.name}: ${mapToConvexValidator(c.type, c.isNotNull)},`)
      .join("\n");

    const getFnName = `get${typeName}ById`;
    const listFnName = `list${toPascal(toPlural(tableName))}`;
    const insertFnName = `create${typeName}`;
    const deleteFnName = `delete${typeName}`;

    functionBlocks.push(
      `// --- ${typeName} functions ---`,
      `export const ${getFnName} = query({`,
      `  args: { id: v.id("${tableName}") },`,
      `  handler: async (ctx, args) => {`,
      `    return await ctx.db.get(args.id);`,
      `  },`,
      `});`,
      ``,
      `export const ${listFnName} = query({`,
      `  args: { limit: v.optional(v.number()) },`,
      `  handler: async (ctx, args) => {`,
      `    return await ctx.db.query("${tableName}").take(args.limit ?? 50);`,
      `  },`,
      `});`,
      ``,
      `export const ${insertFnName} = mutation({`,
      `  args: {`,
      insertValidators || `    name: v.optional(v.string()),`,
      `  },`,
      `  handler: async (ctx, args) => {`,
      `    return await ctx.db.insert("${tableName}", args);`,
      `  },`,
      `});`,
      ``,
      `export const ${deleteFnName} = mutation({`,
      `  args: { id: v.id("${tableName}") },`,
      `  handler: async (ctx, args) => {`,
      `    await ctx.db.delete(args.id);`,
      `    return true;`,
      `  },`,
      `});`,
      ``,
    );

    allReusableFunctions.push(
      {
        name: getFnName,
        importPath: `${packageName}/convex/functions`,
        signature: `(id: string) => Promise<${typeName}Doc | null>`,
        targetName: tableName,
        kind: "findById",
      },
      {
        name: listFnName,
        importPath: `${packageName}/convex/functions`,
        signature: `(limit?: number) => Promise<${typeName}Doc[]>`,
        targetName: tableName,
        kind: "findAll",
      },
      {
        name: insertFnName,
        importPath: `${packageName}/convex/functions`,
        signature: `(input: Create${typeName}Input) => Promise<string>`,
        targetName: tableName,
        kind: "create",
      },
      {
        name: deleteFnName,
        importPath: `${packageName}/convex/functions`,
        signature: `(id: string) => Promise<boolean>`,
        targetName: tableName,
        kind: "delete",
      },
    );
  });

  files.push({
    filename: "convex/functions.ts",
    language: "typescript",
    content: functionBlocks.join("\n"),
  });

  // 3. Client configuration
  const clientContent = [
    "/**",
    ` * Convex client configuration for ${packageName}`,
    " */",
    'import { ConvexHttpClient } from "convex/browser";',
    "",
    'const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "https://placeholder.convex.cloud";',
    "",
    "export const convex = new ConvexHttpClient(convexUrl);",
  ].join("\n");

  files.push({
    filename: "client.ts",
    language: "typescript",
    content: clientContent,
  });

  // 4. index.ts
  files.push({
    filename: "index.ts",
    language: "typescript",
    content: [
      "/**",
      ` * ${packageName} — Shared Convex client & schema`,
      " */",
      'export * from "./client";',
    ].join("\n"),
  });

  // 5. tests/connection.test.ts
  files.push(generateDatabaseConnectionTest("convex", packageName));

  // 6. package.json
  files.push({
    filename: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: packageName,
        version: "0.0.0",
        private: true,
        description: "Shared Convex database schemas and serverless functions",
        main: "index.ts",
        types: "index.ts",
        exports: {
          ".": "./index.ts",
          "./client": "./client.ts",
          "./schema": "./convex/schema.ts",
        },
        scripts: {
          dev: "convex dev",
          build: "tsc",
          "check-types": "tsc --noEmit",
          test: "vitest run",
        },
        dependencies: {
          convex: "^1.13.0",
        },
        devDependencies: {
          "@workspace/typescript-config": "workspace:*",
          "@types/node": "^20.11.0",
          typescript: "^5.3.3",
          vitest: "^1.6.0",
        },
      },
      null,
      2,
    ),
  });

  // 7. tsconfig.json
  files.push({
    filename: "tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        extends: "@workspace/typescript-config/base.json",
        compilerOptions: { outDir: "dist" },
        include: ["index.ts", "client.ts", "convex/**/*", "tests/**/*"],
      },
      null,
      2,
    ),
  });

  return { files, reusableFunctions: allReusableFunctions };
}
