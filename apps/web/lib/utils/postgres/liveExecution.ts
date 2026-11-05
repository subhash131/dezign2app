import { sanitizeForConvex } from "@/lib/utils/convexSanitizer";
import { planSqlCommand, extractTableName } from "@/lib/database-runner";
import { JsonObject, JsonValue } from "@workspace/canvas";
import { resolveConnectionString, isSslRequiredForConfig, resolveTableAndSchema, createPostgresClient, enhancePostgresError } from "./connection";
import { ensurePostgresTable } from "./tableSchema";
import { ExecutePostgresOptions, PostgresOperationResult, SqlParamValue, SqlRowRecord } from "./types";

/**
 * Execute a formatted SQL string using pg client.
 */
export async function executeRawSql(
  client: import("pg").Client | import("pg").PoolClient,
  sql: string,
  params: SqlParamValue[],
): Promise<{ rows: JsonObject[]; rowCount: number }> {
  const res = await client.query<JsonObject>(sql, params);
  return {
    rows: res.rows,
    rowCount: res.rowCount ?? 0,
  };
}

/**
 * Main live execution entry point for testing database operations.
 */
export async function executePostgresLiveOperation(
  opts: ExecutePostgresOptions,
): Promise<PostgresOperationResult> {
  const rawTableName = opts.entity?.name || extractTableName(opts.operation);
  const { safeTable, targetSchema: hintedSchema } = resolveTableAndSchema(rawTableName, opts.entity?.schema);
  const tableName = safeTable || "record";
  const start = performance.now();

  const { client, connectionString, isHyperdrive } = await createPostgresClient(opts.connection);

  try {
    await client.connect();

    // 1. Discover the real schema and exact table name casing.
    let resolvedSchema = hintedSchema;
    let actualTableName = safeTable;

    const discoverRes = await client.query<{ table_schema: string; table_name: string }>(
      `SELECT table_schema, table_name FROM information_schema.tables
       WHERE LOWER(table_name) = LOWER($1)
         AND table_schema NOT IN (
           'information_schema','pg_catalog','pg_toast',
           'auth','storage','realtime','supabase_functions','vault','extensions'
         )
       ORDER BY (table_schema = 'public') DESC, table_schema`,
      [safeTable],
    );
    if (discoverRes.rows.length > 0) {
      const publicRow = discoverRes.rows.find((r) => r.table_schema === "public");
      const matched = publicRow ?? discoverRes.rows[0];
      if (matched) {
        resolvedSchema = matched.table_schema || hintedSchema;
        actualTableName = matched.table_name || safeTable;
      }
    }

    const qualifiedTable = `"${resolvedSchema || "public"}"."${actualTableName}"`;

    // 2. Ensure table exists so test always has a target to operate on
    await ensurePostgresTable(client, actualTableName, opts.entity?.columns, resolvedSchema);

    // 3. Determine the SQL to run
    const op = opts.operation;
    const args = opts.args || {};

    let rawSql = "";
    let params: SqlParamValue[] = [];
    let output: JsonValue = null;

    const opCode = (op.code || "").trim();
    const opQuery = (op.query || "").trim();
    const queryMatch = opCode.match(
      /query(?:<[^>]+>)?\s*\(\s*(['"`])([\s\S]*?)\1\s*(?:,\s*\[([\s\S]*?)\])?\s*\)/m,
    );

    if (
      opQuery &&
      !opQuery.startsWith("Query function for") &&
      !opQuery.startsWith("Auto-generated")
    ) {
      rawSql = opQuery;
    } else if (
      opCode &&
      /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP)\b/i.test(opCode)
    ) {
      rawSql = opCode;
    } else if (
      queryMatch &&
      queryMatch[2] &&
      /^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(queryMatch[2].trim())
    ) {
      rawSql = queryMatch[2].trim();
    } else {
      const plan = planSqlCommand(op, args, "postgres");
      rawSql = plan.rawSql.replaceAll(`"${safeTable}"`, qualifiedTable);
    }

    const escapedSchema = (resolvedSchema || "public").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedTable = safeTable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedActual = actualTableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    rawSql = rawSql.replace(
      new RegExp(`"(${escapedSchema}|public)"\\."(${escapedTable}|${escapedActual})"`, "gi"),
      qualifiedTable,
    );
    rawSql = rawSql.replace(
      new RegExp(`"(${escapedTable}|${escapedActual})"`, "gi"),
      qualifiedTable,
    );

    if (rawSql.includes("$1")) {
      const explicitArgs = queryMatch && queryMatch[3]
        ? queryMatch[3]
            .split(",")
            .map((s) => s.trim().replace(/^data\./, ""))
            .filter(Boolean)
        : [];

      const payloadObj: Record<string, SqlParamValue> = {};
      for (const [k, val] of Object.entries(args)) {
        if (typeof val === "object" && val !== null && !Array.isArray(val)) {
          for (const [nestedKey, nestedVal] of Object.entries(val)) {
            if (
              typeof nestedVal === "string" ||
              typeof nestedVal === "number" ||
              typeof nestedVal === "boolean" ||
              nestedVal === null ||
              nestedVal === undefined ||
              nestedVal instanceof Date
            ) {
              payloadObj[nestedKey] = nestedVal;
            }
          }
        } else if (
          typeof val === "string" ||
          typeof val === "number" ||
          typeof val === "boolean" ||
          val === null ||
          val === undefined ||
          val instanceof Date
        ) {
          payloadObj[k] = val;
        }
      }

      const colMatch = rawSql.match(/\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (colMatch && colMatch[1]) {
        const colsInSql = colMatch[1]
          .split(",")
          .map((c) => c.replace(/["`\s]/g, ""));
        params = colsInSql.map((colName): SqlParamValue => {
          if (colName.toLowerCase() === "id") {
            const idVal = payloadObj["id"] ?? payloadObj["_id"];
            if (idVal !== undefined && idVal !== null) {
              return idVal;
            }
            return typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `${tableName}_${Date.now().toString(36)}`;
          }
          return payloadObj[colName] ?? null;
        });
      } else if (explicitArgs.length > 0) {
        params = explicitArgs.map((rawArg): SqlParamValue => {
          const cleanArg = rawArg
            .trim()
            .replace(/^data\./, "")
            .replace(/\s*\?\?.*$/, "")
            .replace(/\s*\|\|.*$/, "")
            .trim();

          if (cleanArg === "_id" || cleanArg === "_rowId" || cleanArg === "id") {
            const idVal = payloadObj["id"] ?? payloadObj["_id"];
            if (idVal !== undefined && idVal !== null) {
              return idVal;
            }
            return typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `${tableName}_${Date.now().toString(36)}`;
          }
          if (cleanArg === "limit") {
            const limitVal = payloadObj["limit"];
            return typeof limitVal === "number" ? limitVal : 20;
          }
          if (cleanArg === "offset") {
            const offsetVal = payloadObj["offset"];
            return typeof offsetVal === "number" ? offsetVal : 0;
          }
          return payloadObj[cleanArg] ?? null;
        });
      } else {
        const opParams = op.params || [];
        params = [];
        for (const p of opParams) {
          if (p.name.startsWith("{") && p.name.endsWith("}")) {
            const inner = p.name
              .slice(1, -1)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            for (const k of inner) {
              params.push(payloadObj[k] ?? null);
            }
          } else {
            params.push(payloadObj[p.name] ?? null);
          }
        }
      }

      const placeholderMatches = rawSql.match(/\$\d+/g) || [];
      const maxPlaceholderIndex = placeholderMatches.reduce((max, ph) => {
        const idx = parseInt(ph.slice(1), 10);
        return Math.max(max, isNaN(idx) ? 0 : idx);
      }, 0);

      while (params.length < maxPlaceholderIndex) {
        const missingIndex = params.length + 1;
        if (rawSql.includes(`LIMIT $${missingIndex}`)) {
          params.push(args.limit !== undefined ? Number(args.limit) : 20);
        } else if (rawSql.includes(`OFFSET $${missingIndex}`)) {
          params.push(args.offset !== undefined ? Number(args.offset) : 0);
        } else {
          params.push(null);
        }
      }
    } else {
      params = [];
    }

    const result = await executeRawSql(client, rawSql, params);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;

    const kind = op.kind || "";
    const name = op.name || "";
    const isFindAllLike =
      kind === "findAll" ||
      kind === "fetchByIndex" ||
      name.toLowerCase().startsWith("findall") ||
      name.toLowerCase().startsWith("getall") ||
      name.toLowerCase().startsWith("list");

    if (kind === "delete") {
      output = { success: true, message: "Record deleted successfully", deletedCount: result.rowCount };
    } else if (result.rows.length === 1 && (kind === "findById" || kind === "create" || kind === "update" || kind === "upsert") && !isFindAllLike) {
      output = result.rows[0] ?? null;
    } else if (isFindAllLike) {
      output = result.rows;
    } else {
      output = result.rows.length > 0 ? result.rows : result.rows;
    }

    return {
      success: true,
      serverActive: true,
      output: sanitizeForConvex(output),
      rawSql,
      durationMs: Math.max(0.5, durationMs),
    };
  } catch (error) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const errMsg = error instanceof Error ? error.message : String(error);

    const isConnectionError =
      errMsg.includes("ECONNREFUSED") ||
      errMsg.includes("connect ETIMEDOUT") ||
      errMsg.includes("Connection refused") ||
      errMsg.includes("could not connect") ||
      errMsg.includes("connection timeout") ||
      errMsg.includes("getaddrinfo ENOTFOUND");

    return {
      success: false,
      serverActive: !isConnectionError,
      error: enhancePostgresError(error, connectionString),
      durationMs: Math.max(0.5, durationMs),
    };
  } finally {
    if (client) {
      await client.end().catch(() => {});
    }
  }
}
