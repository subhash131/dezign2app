import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  CompiledDatabaseResult,
  CompiledDatabasePackage,
  CompiledFile,
  ReusableFunction,
  CanvasDatabaseNodeData,
} from "@workspace/canvas/types";
import {
  BETTER_AUTH_TABLE_DEFINITIONS,
  isBetterAuthTableRequired,
  PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION,
} from "@workspace/canvas";
import { toTableName, toVarName, toSingular, toPlural } from "./utils";
import { compileRawSqliteDatabase } from "./databases/sqlite/raw";
import { compilePostgresDatabase } from "./databases/postgres";
import { compileMysqlDatabase } from "./databases/mysql";
import { compileConvexDatabase } from "./databases/convex";
import { generateCentralDbTest } from "./generators/databaseTestGenerator";

/**
 * Normalizes a database engine string.
 */
function normalizeEngine(engine?: string): string {
  const e = (engine || "").toLowerCase().trim();
  if (e.includes("postgres") || e.includes("pg") || e.includes("cockroach")) {
    return "postgres";
  }
  if (e.includes("mysql") || e.includes("mariadb")) {
    return "mysql";
  }
  if (e.includes("convex")) {
    return "convex";
  }
  if (e.includes("mongo")) {
    return "mongodb";
  }
  if (e.includes("redis")) {
    return "redis";
  }
  return "sqlite";
}

/**
 * Resolves a unique, clean folder name for a database package under packages/db/.
 */
function resolveDbFolderName(dbNode: BackendNode, existingFolders: Set<string>): string {
  const engine = normalizeEngine(
    dbNode.data?.dbEngine ||
    dbNode.data?.provider ||
    dbNode.data?.dbType,
  );
  const label = dbNode.data?.label || dbNode.data?.dbEngine || dbNode.id || "db";
  let base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "db";
  if (base === "db") {
    base = `${engine}-db`;
  }
  let folder = base || "db";
  let counter = 1;
  while (existingFolders.has(folder)) {
    counter++;
    folder = `${base}-${counter}`;
  }
  existingFolders.add(folder);
  return folder;
}

/**
 * Compiles database nodes into modular packages under packages/db/ (or packages/db for single database).
 * Supports database isolation (shared DB, DB-per-service, polyglot persistence with Postgres, MySQL, Convex, SQLite).
 */
export function compileDatabaseNodes(
  allNodes: BackendNode[],
  allEdges: BackendEdge[],
): CompiledDatabaseResult {
  const entityNodes = allNodes.filter(
    (n) => n.type === "entity" || n.type === "db_ref",
  );

  let effectiveNodes = [...allNodes];

  // 1. Find connected Auth nodes
  const connectedAuthNodes = allNodes.filter((n) => {
    if (n.type !== "auth") return false;
    const hasEdge = allEdges.some((e) => {
      if (e.source !== n.id && e.target !== n.id) return false;
      const otherId = e.source === n.id ? e.target : e.source;
      const other = allNodes.find((o) => o.id === otherId);
      return (
        other &&
        (other.type === "webApp" ||
          other.type === "webPage" ||
          other.type === "service" ||
          other.type === "database" ||
          other.type === "entity" ||
          other.type === "db_ref")
      );
    });
    const hasRef = allNodes.some((other) => other.data?.authNodeId === n.id);
    return hasEdge || hasRef;
  });

  const dbNodes = allNodes.filter(
    (n) => n.type === "database" && n.data?.dbEngine !== "redis",
  );

  // 2. Synthesize BetterAuth tables if connected auth nodes exist
  if (connectedAuthNodes.length > 0) {
    const existingEntityNames = new Set<string>();
    entityNodes.forEach((n) => {
      const raw = n.data?.label || n.data?.tableRef || "";
      if (!raw) return;
      const clean = toTableName(raw);
      existingEntityNames.add(clean.toLowerCase());
      existingEntityNames.add(toSingular(clean).toLowerCase());
      existingEntityNames.add(toPlural(clean).toLowerCase());
      existingEntityNames.add(raw.toLowerCase());
    });

    const syntheticEntities: BackendNode[] = [];

    connectedAuthNodes.forEach((authNode) => {
      const enabledPlugins: string[] =
        authNode.data?.plugins || ["bearer", "admin", "organization", "jwt"];
      const isOrgEnabled: boolean =
        authNode.data?.organization?.enabled ?? true;

      const authNodeId = authNode.id || authNode.nodeId;
      // Find if authNode is connected to a specific DB node
      const authDbEdge = allEdges.find(
        (e) =>
          ((e.source === authNode.id || e.source === authNodeId) &&
            dbNodes.some((d) => d.id === e.target || d.nodeId === e.target)) ||
          ((e.target === authNode.id || e.target === authNodeId) &&
            dbNodes.some((d) => d.id === e.source || d.nodeId === e.source)),
      );
      const targetDbId = authDbEdge
        ? authDbEdge.source === authNode.id || authDbEdge.source === authNodeId
          ? authDbEdge.target
          : authDbEdge.source
        : (authNode.data?.databaseId || dbNodes[0]?.id || dbNodes[0]?.nodeId);

      // Backfill missing required columns on pre-existing canvas entities
      BETTER_AUTH_TABLE_DEFINITIONS.forEach((def) => {
        if (
          !isBetterAuthTableRequired(def, {
            isOrgEnabled,
            enabledPlugins,
            providers: authNode.data?.providers,
          })
        ) {
          return;
        }

        const existingEntity = entityNodes.find((n) => {
          const raw = n.data?.label || n.data?.tableRef || "";
          if (!raw) return false;
          const clean = toTableName(raw).toLowerCase();
          const target = def.name.toLowerCase();
          return clean === target || toSingular(clean) === target || toPlural(clean) === target;
        });

        if (existingEntity) {
          const existingCols = existingEntity.data?.columns || [];
          const existingColNames = new Set(
            existingCols.map((c: { name?: string }) => (c.name || "").toLowerCase()),
          );
          const missingCols = def.defaultColumns.filter(
            (dc) => !existingColNames.has((dc.name || "").toLowerCase()),
          );
          const existingIdxs = existingEntity.data?.indexes || [];
          const missingIdxs = (def.defaultIndexes || []).filter(
            (reqIdx) => !existingIdxs.some((idx: { name?: string; columns?: string }) =>
              (idx.name || "").toLowerCase() === reqIdx.name.toLowerCase() ||
              (idx.columns || "").replace(/\s+/g, "").toLowerCase() === reqIdx.columns.replace(/\s+/g, "").toLowerCase()
            )
          );

          if (missingCols.length > 0 || missingIdxs.length > 0) {
            existingEntity.data = {
              ...existingEntity.data,
              columns: missingCols.length > 0 ? [...existingCols, ...missingCols] : existingCols,
              indexes: missingIdxs.length > 0 ? [...existingIdxs, ...missingIdxs] : existingIdxs,
            };
          }
        }
      });

      const neededDefs = BETTER_AUTH_TABLE_DEFINITIONS.filter(
        (def) =>
          isBetterAuthTableRequired(def, {
            isOrgEnabled,
            enabledPlugins,
            providers: authNode.data?.providers,
          }) &&
          !existingEntityNames.has(def.name.toLowerCase()) &&
          !existingEntityNames.has(toSingular(def.name).toLowerCase()) &&
          !existingEntityNames.has(toPlural(def.name).toLowerCase()) &&
          !syntheticEntities.some(
            (s) => s.data?.label?.toLowerCase() === def.name.toLowerCase(),
          ),
      );

      neededDefs.forEach((def) => {
        syntheticEntities.push({
          id: `synthetic-auth-${def.key}`,
          type: "entity",
          fractionalIndex: "a0",
          position: { x: 0, y: 0 },
          data: {
            label: def.name,
            description: def.description,
            columns: def.defaultColumns,
            indexes: def.defaultIndexes ? [...def.defaultIndexes] : [],
            databaseId: targetDbId,
          },
        });
      });
    });

    if (syntheticEntities.length > 0) {
      effectiveNodes = [...effectiveNodes, ...syntheticEntities];
    }
  }

  // 2.5 Synthesize or enrich Subscription and User tables if Payments nodes exist
  const paymentsNodes = allNodes.filter((n) => n.type === "payments");
  const hasPayments = paymentsNodes.length > 0 || connectedAuthNodes.some((a) => Boolean(a.data?.paymentsPlugin));
  if (hasPayments) {
    // Ensure User entity has plan and creemCustomerId columns
    const userEntity = effectiveNodes.find((n) => {
      if (n.type !== "entity" && n.type !== "db_ref") return false;
      const lbl = (n.data?.label || n.data?.tableRef || "").toLowerCase();
      return lbl === "user" || lbl === "users";
    });
    if (userEntity) {
      const existingCols = userEntity.data?.columns || [];
      const existingColNames = new Set(existingCols.map((c: { name?: string }) => (c.name || "").toLowerCase()));
      const paymentUserCols = [
        { name: "plan", type: "string" },
        { name: "creemCustomerId", type: "string" },
      ];
      const missing = paymentUserCols.filter((pc) => !existingColNames.has(pc.name.toLowerCase()));
      if (missing.length > 0) {
        userEntity.data = {
          ...userEntity.data,
          columns: [...existingCols, ...missing],
        };
      }
    }

    const userSubEntity = effectiveNodes.find((n) => {
      if (n.type !== "entity" && n.type !== "db_ref") return false;
      const lbl = (n.data?.label || "").toLowerCase();
      return lbl === "subscription" || lbl === "subscriptions";
    });

    if (userSubEntity) {
      // User placed the entity on canvas: ensure required payment columns and indexes exist while preserving user's custom columns
      const existingCols = userSubEntity.data?.columns || [];
      const existingColNames = new Set(existingCols.map((c: { name?: string }) => (c.name || "").toLowerCase()));
      const missingRequiredCols = PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION.defaultColumns.filter(
        (dc) => !existingColNames.has((dc.name || "").toLowerCase())
      );
      const existingIdxs = userSubEntity.data?.indexes || [];
      const missingIdxs = (PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION.defaultIndexes || []).filter(
        (reqIdx) => !existingIdxs.some((idx: { name?: string; columns?: string }) =>
          (idx.name || "").toLowerCase() === reqIdx.name.toLowerCase() ||
          (idx.columns || "").replace(/\s+/g, "").toLowerCase() === reqIdx.columns.replace(/\s+/g, "").toLowerCase()
        )
      );
      if (missingRequiredCols.length > 0 || missingIdxs.length > 0) {
        userSubEntity.data = {
          ...userSubEntity.data,
          columns: missingRequiredCols.length > 0 ? [...existingCols, ...missingRequiredCols] : existingCols,
          indexes: missingIdxs.length > 0 ? [...existingIdxs, ...missingIdxs] : existingIdxs,
        };
      }
    } else if (paymentsNodes.length > 0) {
      // Synthesize default subscription entity
      const targetDbId = dbNodes[0]?.id || dbNodes[0]?.nodeId;
      const syntheticSubEntity: BackendNode = {
        id: "synthetic-payments-subscription",
        type: "entity",
        fractionalIndex: "a0",
        position: { x: 0, y: 0 },
        data: {
          label: "subscription",
          description: PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION.description,
          columns: PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION.defaultColumns,
          indexes: PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION.defaultIndexes
            ? [...PAYMENTS_SUBSCRIPTION_TABLE_DEFINITION.defaultIndexes]
            : [],
          databaseId: targetDbId,
        },
      };
      effectiveNodes = [...effectiveNodes, syntheticSubEntity];
    }
  }

  const allEntityNodes = effectiveNodes.filter(
    (n) =>
      (n.type === "entity" || n.type === "db_ref") &&
      n.data?.dbType !== "redis",
  );

  // Check if anything DB-related exists
  if (dbNodes.length === 0 && allEntityNodes.length === 0 && connectedAuthNodes.length === 0) {
    return {
      files: [],
      packages: [],
      reusableFunctions: [],
    };
  }

  // -------------------------------------------------------------------------
  // Case A: No explicit database nodes on canvas (Default single SQLite DB)
  // -------------------------------------------------------------------------
  if (dbNodes.length === 0) {
    const singleResult = compileRawSqliteDatabase(effectiveNodes, allEdges, {
      packageName: "@workspace/db",
      packageFolder: "",
    });
    const pkg: CompiledDatabasePackage = {
      packageName: "@workspace/db",
      packageFolder: "",
      dbEngine: "sqlite",
      files: singleResult.files,
      reusableFunctions: singleResult.reusableFunctions,
    };
    return {
      files: singleResult.files,
      packages: [pkg],
      reusableFunctions: singleResult.reusableFunctions,
    };
  }

  // -------------------------------------------------------------------------
  // Case B: Explicit Database Nodes (Database Isolation & Polyglot Persistence)
  // -------------------------------------------------------------------------
  const packages: CompiledDatabasePackage[] = [];
  const mergedFiles: CompiledFile[] = [];
  const mergedReusableFunctions: ReusableFunction[] = [];
  const existingFolders = new Set<string>();

  // Map each entity to its parent database node
  const entitiesByDbId = new Map<string, BackendNode[]>();
  dbNodes.forEach((d) => {
    entitiesByDbId.set(d.id, []);
    const altId = d.nodeId;
    if (altId && altId !== d.id) {
      entitiesByDbId.set(altId, entitiesByDbId.get(d.id)!);
    }
  });

  const primaryDbNode = dbNodes.find((d) => d.data?.isDefault) || dbNodes[0]!;

  allEntityNodes.forEach((ent) => {
    const entId = ent.id || ent.nodeId;
    // 1. Check explicit databaseId
    let targetDbId = ent.data?.databaseId;

    // 2. Check edges connecting DB to Entity
    if (!targetDbId) {
      const dbEdge = allEdges.find(
        (e) =>
          ((e.source === entId || e.source === ent.id) &&
            dbNodes.some((d) => d.id === e.target || d.nodeId === e.target)) ||
          ((e.target === entId || e.target === ent.id) &&
            dbNodes.some((d) => d.id === e.source || d.nodeId === e.source)),
      );
      if (dbEdge) {
        targetDbId =
          dbEdge.source === entId || dbEdge.source === ent.id
            ? dbEdge.target
            : dbEdge.source;
      }
    }

    // 3. Fall back to primary DB
    if (!targetDbId || !entitiesByDbId.has(targetDbId)) {
      targetDbId = primaryDbNode.id;
    }

    const bucket = entitiesByDbId.get(targetDbId);
    if (bucket && !bucket.includes(ent)) {
      bucket.push(ent);
    }
  });

  // Compile each database node in isolation
  dbNodes.forEach((dbNode) => {
    const dbEntities = entitiesByDbId.get(dbNode.id) || [];
    const engine = normalizeEngine(
      dbNode.data?.dbEngine ||
      dbNode.data?.provider ||
      dbNode.data?.dbType,
    );
    const folderName = resolveDbFolderName(dbNode, existingFolders);
    const packageName = `@workspace/db-${folderName}`;

    // Pass only the entities for this DB along with other non-entity nodes (for reference)
    const scopedNodes = [
      ...effectiveNodes.filter((n) => n.type !== "entity" && n.type !== "db_ref"),
      ...dbEntities,
    ];

    let pkgResult: CompiledDatabaseResult;

    switch (engine) {
      case "postgres":
        pkgResult = compilePostgresDatabase(scopedNodes, allEdges, {
          packageName,
          packageFolder: folderName,
          dbNode,
        });
        break;
      case "mysql":
        pkgResult = compileMysqlDatabase(scopedNodes, allEdges, {
          packageName,
          packageFolder: folderName,
          dbNode,
        });
        break;
      case "convex":
        pkgResult = compileConvexDatabase(scopedNodes, allEdges, {
          packageName,
          packageFolder: folderName,
          dbNode,
        });
        break;
      case "sqlite":
      default:
        pkgResult = compileRawSqliteDatabase(scopedNodes, allEdges, {
          packageName,
          packageFolder: folderName,
          dbNode,
        });
        break;
    }

    // Prefix files for top-level files array
    pkgResult.files.forEach((f) => {
      mergedFiles.push({
        filename: folderName ? `packages/db/${folderName}/${f.filename}` : `packages/db/${f.filename}`,
        language: f.language,
        content: f.content,
      });
    });

    packages.push({
      packageName,
      packageFolder: folderName,
      dbEngine: engine,
      databaseNodeId: dbNode.id,
      databaseLabel: dbNode.data?.label || folderName || "db",
      files: pkgResult.files,
      reusableFunctions: pkgResult.reusableFunctions,
    });

    mergedReusableFunctions.push(...pkgResult.reusableFunctions);
  });

  // Generate the unified central @workspace/db package
  // so that all microservices and web clients can seamlessly depend on @workspace/db
  if (dbNodes.length >= 1 && packages.length > 0) {
    const primaryFolder =
      packages.find((p) => p.databaseNodeId === primaryDbNode.id)?.packageFolder ||
      packages[0]!.packageFolder;

    const childPackageDeps: Record<string, string> = {};
    packages.forEach((pkg) => {
      if (pkg.packageName && pkg.packageName !== "@workspace/db") {
        childPackageDeps[pkg.packageName] = "workspace:*";
      }
    });

    const rootPackageJson = JSON.stringify(
      {
        name: "@workspace/db",
        version: "0.0.0",
        private: true,
        description:
          "Central database access package re-exporting primary database and microservice table helpers",
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
          ...childPackageDeps,
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
    );

    const rootTsConfig = JSON.stringify(
      {
        extends: "@workspace/typescript-config/base.json",
        compilerOptions: { outDir: "dist" },
        include: ["index.ts", "connection.ts", "helpers/**/*", "tests/**/*"],
      },
      null,
      2,
    );

    const rootIndex = [
      "/**",
      " * @workspace/db — Central database access package.",
      " * Re-exports primary database connection, clients, and table helpers.",
      " */",
      `export * from "./${primaryFolder}";`,
      "",
      ...packages.map(
        (p) =>
          `export * as ${toVarName(p.packageFolder)} from "./${p.packageFolder}";`,
      ),
    ].join("\n");

    const rootConnection = [
      "/**",
      " * @workspace/db/connection — Central database connection pool & runner.",
      " * Re-exports connection from primary database.",
      " */",
      "/* turbopackIgnore: true */",
      `export * from "./${primaryFolder}/connection";`,
    ].join("\n");

    const rootHelpersIndex = [
      "/**",
      " * Barrel export for all database table helpers across isolated databases.",
      " */",
      ...packages.map((p) => `export * from "../${p.packageFolder}/helpers";`),
    ].join("\n");

    const centralFiles: CompiledFile[] = [
      { filename: "package.json", language: "json", content: rootPackageJson },
      { filename: "tsconfig.json", language: "json", content: rootTsConfig },
      { filename: "index.ts", language: "typescript", content: rootIndex },
      { filename: "connection.ts", language: "typescript", content: rootConnection },
      { filename: "helpers/index.ts", language: "typescript", content: rootHelpersIndex },
      generateCentralDbTest(packages, primaryFolder),
    ];

    // Helper forwarders for every helper file in child packages
    const seenHelperFiles = new Set<string>();
    packages.forEach((p) => {
      p.files.forEach((f) => {
        if (f.filename.startsWith("helpers/") && f.filename !== "helpers/index.ts") {
          const helperSubPath = f.filename.slice("helpers/".length);
          const helperBase = helperSubPath.replace(/\.ts$/, "");
          if (!seenHelperFiles.has(helperBase)) {
            seenHelperFiles.add(helperBase);
            centralFiles.push({
              filename: `helpers/${helperSubPath}`,
              language: "typescript",
              content: `export * from "../${p.packageFolder}/helpers/${helperBase}";\n`,
            });
          }
        }
      });
    });

    // Add central files to mergedFiles
    centralFiles.forEach((f) => {
      mergedFiles.push({
        filename: `packages/db/${f.filename}`,
        language: f.language,
        content: f.content,
      });
    });

    const rootDbPkg: CompiledDatabasePackage = {
      packageName: "@workspace/db",
      packageFolder: "",
      dbEngine: primaryDbNode.data?.dbEngine || "sqlite",
      databaseNodeId: primaryDbNode.id,
      databaseLabel: "db",
      files: centralFiles,
      reusableFunctions: mergedReusableFunctions,
    };

    packages.unshift(rootDbPkg);
  }

  return {
    files: mergedFiles,
    packages,
    reusableFunctions: mergedReusableFunctions,
  };
}
