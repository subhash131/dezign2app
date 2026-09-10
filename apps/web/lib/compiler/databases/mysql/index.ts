import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  CompiledFile,
  CompiledDatabaseResult,
  ReusableFunction,
  CanvasEntityNodeData,
  CanvasDatabaseNodeData,
} from "@workspace/canvas/types";
import { sqlColumnToTsType } from "@workspace/canvas/constants";
import { toTableName, toVarName, toSqlIdentifier, toSingular, toPlural } from "../../utils";

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

const toTsType = sqlColumnToTsType;

export interface MysqlOptions {
  packageName?: string;
  packageFolder?: string;
  connectionEnvVar?: string;
  dbNode?: BackendNode;
}

// ---------------------------------------------------------------------------
// Per-table MySQL CRUD code generator
// ---------------------------------------------------------------------------

function generateMysqlTableHelpers(
  tableNode: BackendNode,
  packageName: string = "@workspace/db",
): {
  code: string;
  fns: ReusableFunction[];
  typeExports: string[];
} {
  const rawName = tableNode.data?.label || tableNode.data?.tableRef || "table";
  const tableName = toTableName(rawName);
  const singularName = toSingular(tableName);
  const typeName = toPascal(singularName);
  const varName = toVarName(singularName);
  const cols = getColumns(tableNode);
  const pkCol = cols.find((c) => c.isPrimaryKey) || cols[0] || { name: "id", type: "string" };
  const pkTsType = toTsType(pkCol.type);
  const fns: ReusableFunction[] = [];
  const typeExports: string[] = [];

  const typeFields = cols
    .map((c) => {
      const opt = c.isPrimaryKey || c.isNotNull ? "" : "?";
      return `  ${c.name}${opt}: ${toTsType(c.type)};`;
    })
    .join("\n");

  const createFields = cols
    .filter((c) => !c.isPrimaryKey || toTsType(c.type) === "string")
    .map((c) => {
      const opt = c.isPrimaryKey || !c.isNotNull ? "?" : "";
      return `  ${c.name}${opt}: ${toTsType(c.type)};`;
    })
    .join("\n");

  const updateFields = cols
    .filter((c) => !c.isPrimaryKey)
    .map((c) => `  ${c.name}?: ${toTsType(c.type)};`)
    .join("\n");

  typeExports.push(typeName, `Create${typeName}Input`, `Update${typeName}Input`);

  const codeBlocks: string[] = [
    `/**`,
    ` * MySQL CRUD helpers for \`${tableName}\` table.`,
    ` */`,
    `import { query, SqlParam } from "../connection";`,
    `import { RowDataPacket, ResultSetHeader } from "mysql2/promise";`,
    `import { logger } from "@workspace/logger";`,
    ``,
    `export interface ${typeName} {`,
    typeFields,
    `}`,
    ``,
    `export interface Create${typeName}Input {`,
    createFields || `  id?: string;`,
    `}`,
    ``,
    `export interface Update${typeName}Input {`,
    updateFields || `  id?: string;`,
    `}`,
    ``,
  ];

  // Helper 1: findById
  const findByIdFnName = `find${typeName}ById`;
  codeBlocks.push(
    `export async function ${findByIdFnName}(id: ${pkTsType}): Promise<${typeName} | null> {`,
    `  const rows = await query<(${typeName} & RowDataPacket)[]>(`,
    `    'SELECT * FROM \`${tableName}\` WHERE \`${pkCol.name}\` = ? LIMIT 1',`,
    `    [id]`,
    `  );`,
    `  return rows[0] || null;`,
    `}`,
    ``,
  );
  fns.push({
    name: findByIdFnName,
    importPath: `${packageName}/helpers/${varName}`,
    signature: `(${pkCol.name}: ${pkTsType}) => Promise<${typeName} | null>`,
    targetName: tableName,
    kind: "findById",
  });

  // Helper 2: findAll
  const findAllFnName = `findAll${toPascal(toPlural(tableName))}`;
  codeBlocks.push(
    `export async function ${findAllFnName}(limit = 50, offset = 0): Promise<${typeName}[]> {`,
    `  const rows = await query<(${typeName} & RowDataPacket)[]>(`,
    `    'SELECT * FROM \`${tableName}\` LIMIT ? OFFSET ?',`,
    `    [limit, offset]`,
    `  );`,
    `  return rows;`,
    `}`,
    ``,
  );
  fns.push({
    name: findAllFnName,
    importPath: `${packageName}/helpers/${varName}`,
    signature: `(limit?: number, offset?: number) => Promise<${typeName}[]>`,
    targetName: tableName,
    kind: "findAll",
  });

  // Helper 3: create
  const createFnName = `create${typeName}`;
  const insertCols = cols.filter((c) => !c.isPrimaryKey || toTsType(c.type) === "string");
  const insertColNames = insertCols.map((c) => `\`${c.name}\``).join(", ");
  const insertPlaceholders = insertCols.map(() => `?`).join(", ");
  const insertArgVals = insertCols.map((c) => `input.${c.name} ?? null`).join(", ");

  codeBlocks.push(
    `export async function ${createFnName}(input: Create${typeName}Input): Promise<${typeName}> {`,
    `  const result = await query<ResultSetHeader>(`,
    `    'INSERT INTO \`${tableName}\` (${insertColNames}) VALUES (${insertPlaceholders})',`,
    `    [${insertArgVals}]`,
    `  );`,
    `  const newId = input.${pkCol.name} !== undefined ? input.${pkCol.name} : result.insertId;`,
    `  const created = await ${findByIdFnName}(newId);`,
    `  if (!created) throw new Error("Failed to retrieve created ${typeName}");`,
    `  return created;`,
    `}`,
    ``,
  );
  fns.push({
    name: createFnName,
    importPath: `${packageName}/helpers/${varName}`,
    signature: `(input: Create${typeName}Input) => Promise<${typeName}>`,
    targetName: tableName,
    kind: "create",
  });

  // Helper 4: update
  const updateFnName = `update${typeName}`;
  codeBlocks.push(
    `export async function ${updateFnName}(id: ${pkTsType}, input: Update${typeName}Input): Promise<${typeName} | null> {`,
    `  const entries = Object.entries(input).filter(([, v]) => v !== undefined);`,
    `  if (entries.length === 0) return ${findByIdFnName}(id);`,
    `  const setClauses = entries.map(([k]) => \`\\\`\${k}\\\` = ?\`).join(", ");`,
    `  const values = entries.map(([, v]) => v);`,
    `  await query<ResultSetHeader>(`,
    `    \`UPDATE \\\`${tableName}\\\` SET \${setClauses} WHERE \\\`${pkCol.name}\\\` = ?\`,`,
    `    [...values, id]`,
    `  );`,
    `  return ${findByIdFnName}(id);`,
    `}`,
    ``,
  );
  fns.push({
    name: updateFnName,
    importPath: `${packageName}/helpers/${varName}`,
    signature: `(id: ${pkTsType}, input: Update${typeName}Input) => Promise<${typeName} | null>`,
    targetName: tableName,
    kind: "update",
  });

  // Helper 5: delete
  const deleteFnName = `delete${typeName}`;
  codeBlocks.push(
    `export async function ${deleteFnName}(id: ${pkTsType}): Promise<boolean> {`,
    `  const res = await query<ResultSetHeader>(`,
    `    'DELETE FROM \`${tableName}\` WHERE \`${pkCol.name}\` = ?',`,
    `    [id]`,
    `  );`,
    `  return res.affectedRows > 0;`,
    `}`,
    ``,
  );
  fns.push({
    name: deleteFnName,
    importPath: `${packageName}/helpers/${varName}`,
    signature: `(id: ${pkTsType}) => Promise<boolean>`,
    targetName: tableName,
    kind: "delete",
  });

  return {
    code: codeBlocks.join("\n"),
    fns,
    typeExports,
  };
}

// ---------------------------------------------------------------------------
// Main MySQL compiler
// ---------------------------------------------------------------------------

export function compileMysqlDatabase(
  allNodes: BackendNode[],
  _allEdges: BackendEdge[],
  options: MysqlOptions = {},
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

  const packageName = options.packageName || "@workspace/db-mysql";
  const connEnvKey = options.connectionEnvVar || options.dbNode?.data?.connectionStringEnv || "DATABASE_URL";

  const helperBarrel: string[] = [];
  const seenExportedSymbols = new Set<string>();

  tables.forEach((tableNode) => {
    const rawName = tableNode.data?.label || tableNode.data?.tableRef || "table";
    const tableName = toTableName(rawName);
    const varName = toVarName(toSingular(tableName));

    const { code, fns, typeExports } = generateMysqlTableHelpers(tableNode, packageName);

    files.push({
      filename: `helpers/${varName}.ts`,
      language: "typescript",
      content: code,
    });

    allReusableFunctions.push(...fns);

    const uniqueTypeExports = typeExports.filter((s) => {
      if (seenExportedSymbols.has(s)) return false;
      seenExportedSymbols.add(s);
      return true;
    });

    const uniqueValueExports = fns
      .map((f) => f.name)
      .filter((s) => {
        if (seenExportedSymbols.has(s)) return false;
        seenExportedSymbols.add(s);
        return true;
      });

    if (uniqueTypeExports.length > 0) {
      helperBarrel.push(`export type { ${uniqueTypeExports.join(", ")} } from "./${varName}";`);
    }
    if (uniqueValueExports.length > 0) {
      helperBarrel.push(`export { ${uniqueValueExports.join(", ")} } from "./${varName}";`);
    }
  });

  // helpers/index.ts
  files.push({
    filename: "helpers/index.ts",
    language: "typescript",
    content:
      `/**\n * Barrel export for MySQL table CRUD helpers.\n */\n` +
      (helperBarrel.length > 0 ? helperBarrel.join("\n") + "\n" : "export {};\n"),
  });

  // connection.ts
  const connectionContent = [
    "/**",
    ` * Connection configuration for MySQL via 'mysql2/promise' Pool`,
    " */",
    'import mysql from "mysql2/promise";',
    'import { logger } from "@workspace/logger";',
    "",
    "export type SqlParam = string | number | boolean | null | undefined | Date;",
    "",
    `const connectionUri = process.env.${connEnvKey} || process.env.DATABASE_URL || "mysql://root:root@localhost:3306/dezign2app";`,
    "",
    "export const pool = mysql.createPool({",
    "  uri: connectionUri,",
    "  waitForConnections: true,",
    "  connectionLimit: 20,",
    "  maxIdle: 10,",
    "  idleTimeout: 60000,",
    "  queueLimit: 0,",
    "});",
    "",
    "export async function query<T = mysql.RowDataPacket[]>(sql: string, params?: SqlParam[]): Promise<T> {",
    "  const start = Date.now();",
    "  try {",
    "    const [results] = await pool.query(sql, params);",
    "    const duration = Date.now() - start;",
    "    logger.debug('Executed MySQL query', { sql, duration });",
    "    return results as T;",
    "  } catch (error) {",
    "    logger.error('MySQL query error', { sql, error });",
    "    throw error;",
    "  }",
    "}",
  ].join("\n");

  files.push({
    filename: "connection.ts",
    language: "typescript",
    content: connectionContent,
  });

  // index.ts
  files.push({
    filename: "index.ts",
    language: "typescript",
    content: [
      "/**",
      ` * ${packageName} — Shared MySQL client & helpers`,
      " */",
      'export * from "./connection";',
      'export * from "./helpers";',
    ].join("\n"),
  });

  // package.json
  files.push({
    filename: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: packageName,
        version: "0.0.0",
        private: true,
        description: "Shared MySQL connection pool and query helpers",
        main: "index.ts",
        types: "index.ts",
        exports: {
          ".": "./index.ts",
          "./connection": "./connection.ts",
          "./helpers": "./helpers/index.ts",
          "./helpers/*": "./helpers/*.ts",
        },
        scripts: { build: "tsc", "check-types": "tsc --noEmit" },
        dependencies: {
          "@workspace/logger": "workspace:*",
          mysql2: "^3.9.1",
        },
        devDependencies: {
          "@workspace/typescript-config": "workspace:*",
          "@types/node": "^20.11.0",
          typescript: "^5.3.3",
        },
      },
      null,
      2,
    ),
  });

  // tsconfig.json
  files.push({
    filename: "tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        extends: "@workspace/typescript-config/base.json",
        compilerOptions: { outDir: "dist" },
        include: ["index.ts", "connection.ts", "helpers/**/*"],
      },
      null,
      2,
    ),
  });

  return { files, reusableFunctions: allReusableFunctions };
}
