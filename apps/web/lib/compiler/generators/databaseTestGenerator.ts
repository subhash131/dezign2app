import { BackendNode } from "@/types/canvas";
import { CompiledFile, CompiledDatabasePackage } from "@workspace/canvas/types";
import { toTableName, toVarName, toSingular, toPlural } from "../utils";

function toPascal(str: string): string {
  if (!str) return "Item";
  return str
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/**
 * Generates an isolated unit test for database connection/client initialization.
 */
export function generateDatabaseConnectionTest(
  engine: string,
  packageName: string = "@workspace/db",
): CompiledFile {
  const normEngine = (engine || "sqlite").toLowerCase();

  let testBody = "";
  if (normEngine.includes("postgres") || normEngine.includes("pg")) {
    testBody = `import { describe, it, expect } from "vitest";
import * as connection from "../connection";

describe("${packageName} — PostgreSQL Connection", () => {
  it("should export query and pool handlers", () => {
    expect(connection).toBeDefined();
    expect(typeof connection.query).toBe("function");
    expect(connection.pool).toBeDefined();
  });
});
`;
  } else if (normEngine.includes("mysql")) {
    testBody = `import { describe, it, expect } from "vitest";
import * as connection from "../connection";

describe("${packageName} — MySQL Connection", () => {
  it("should export query and pool handlers", () => {
    expect(connection).toBeDefined();
    expect(typeof connection.query).toBe("function");
    expect(connection.pool).toBeDefined();
  });
});
`;
  } else if (normEngine.includes("convex")) {
    testBody = `import { describe, it, expect } from "vitest";
import * as convexClient from "../client";

describe("${packageName} — Convex Client & Schema", () => {
  it("should export convex client helpers", () => {
    expect(convexClient).toBeDefined();
  });
});
`;
  } else {
    // Default SQLite raw
    testBody = `import { describe, it, expect } from "vitest";
import { db } from "../connection";

describe("${packageName} — SQLite Connection", () => {
  it("should have an active database instance with prepared statement support", () => {
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe("function");
    expect(typeof db.exec).toBe("function");
  });

  it("should execute a ping query successfully", () => {
    const row = db.prepare("SELECT 1 AS ping").get() as { ping: number } | undefined;
    expect(row).toBeDefined();
    expect(row?.ping).toBe(1);
  });
});
`;
  }

  return {
    filename: "tests/connection.test.ts",
    language: "typescript",
    content: testBody,
  };
}

/**
 * Generates a unit test for a table's CRUD helpers under tests/helpers/<tableVarName>.test.ts.
 */
export function generateTableHelperTest(
  tableNode: BackendNode,
  allNodes: BackendNode[] = [],
  engine: string = "sqlite",
  customVarName?: string,
): CompiledFile {
  const rawLabel =
    (tableNode.type === "db_ref" && tableNode.data?.tableRef
      ? allNodes.find((n) => n.id === tableNode.data.tableRef)?.data?.label
      : undefined) ||
    tableNode.data?.label ||
    "table";

  const tableName = toTableName(rawLabel);
  const normEngine = (engine || "sqlite").toLowerCase();
  const isPostgresOrMysql =
    normEngine.includes("postgres") ||
    normEngine.includes("mysql") ||
    normEngine.includes("pg");
  const varName =
    customVarName ||
    (isPostgresOrMysql ? toVarName(toSingular(tableName)) : toVarName(tableName));
  const Pascal = toPascal(tableName);
  const pascalSingular = toSingular(Pascal);
  const pascalPlural = toPlural(Pascal);
  const isSqlite =
    normEngine.includes("sqlite") ||
    (!isPostgresOrMysql && !normEngine.includes("convex"));

  let content = "";

  if (isSqlite) {
    content = `import { describe, it, expect } from "vitest";
import * as helper from "../../helpers/${varName}";

describe("Table Helper: ${tableName} (${Pascal})", () => {
  it("should export expected CRUD helper functions", () => {
    expect(helper).toBeDefined();

    // Verify common query & mutation helpers exist
    const functions = Object.keys(helper).filter(
      (k) => typeof (helper as Record<string, unknown>)[k] === "function",
    );
    expect(functions.length).toBeGreaterThan(0);
  });

  it("should execute findAll${pascalPlural} without runtime errors", () => {
    if (typeof (helper as Record<string, unknown>).findAll${pascalPlural} === "function") {
      const records = (helper as { findAll${pascalPlural}: (limit?: number) => unknown[] }).findAll${pascalPlural}(5);
      expect(Array.isArray(records)).toBe(true);
    }
  });

  it("should return undefined or null when searching for non-existent ${pascalSingular} ID", () => {
    if (typeof (helper as Record<string, unknown>).find${pascalSingular}ById === "function") {
      const result = (helper as { find${pascalSingular}ById: (id: string) => unknown }).find${pascalSingular}ById("non-existent-id");
      expect(result).toBeFalsy();
    }
  });
});
`;
  } else {
    // Async DB engines (PostgreSQL, MySQL, Convex)
    content = `import { describe, it, expect } from "vitest";
import * as helper from "../../helpers/${varName}";

describe("Table Helper: ${tableName} (${Pascal})", () => {
  it("should export expected CRUD helper functions", () => {
    expect(helper).toBeDefined();

    const functions = Object.keys(helper).filter(
      (k) => typeof (helper as Record<string, unknown>)[k] === "function",
    );
    expect(functions.length).toBeGreaterThan(0);
  });

  it("should define standard CRUD operation exports", () => {
    // Assert expected helper signatures are callable
    const hasFindAll =
      typeof (helper as Record<string, unknown>).findAll${pascalPlural} === "function" ||
      typeof (helper as Record<string, unknown>).list${pascalPlural} === "function";
    const hasFindById =
      typeof (helper as Record<string, unknown>).find${pascalSingular}ById === "function" ||
      typeof (helper as Record<string, unknown>).get${pascalSingular}ById === "function";

    expect(hasFindAll || hasFindById).toBe(true);
  });
});
`;
  }

  return {
    filename: `tests/helpers/${varName}.test.ts`,
    language: "typescript",
    content,
  };
}

/**
 * Generates smoke test for the central @workspace/db package in multi-DB mode.
 */
export function generateCentralDbTest(
  packages: CompiledDatabasePackage[],
  primaryFolder: string,
): CompiledFile {
  const subNamespaces = packages.map((p) => toVarName(p.packageFolder)).filter(Boolean);

  const content = `import { describe, it, expect } from "vitest";
import * as dbPackage from "../index";

describe("@workspace/db — Central Database Package", () => {
  it("should export database connection and helper namespaces", () => {
    expect(dbPackage).toBeDefined();
  });

  ${subNamespaces
    .map(
      (ns) => `it("should re-export isolated database namespace: ${ns}", () => {
    expect((dbPackage as Record<string, unknown>).${ns}).toBeDefined();
  });`,
    )
    .join("\n\n  ")}
});
`;

  return {
    filename: "tests/db.test.ts",
    language: "typescript",
    content,
  };
}
