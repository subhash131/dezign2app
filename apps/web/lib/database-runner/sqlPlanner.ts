import {
  TestDbOperationPayload,
  SqlCommandPlan,
  JsonObject,
  isJsonObject,
} from "./types";

/**
 * Extracts table name from operation definition (ID, raw SQL query, or function name).
 */
export function extractTableName(op: TestDbOperationPayload["operation"]): string {
  const id = op.id || "";
  const name = op.name || "";
  const code = op.code || "";
  const query = op.query || "";

  // 1. Check auto-generated operation ID, e.g. auto-find-by-id-conversations -> conversations
  const indexMatch = id.match(/^auto-index-([a-zA-Z0-9_]+)-/i);
  if (indexMatch && indexMatch[1]) {
    return indexMatch[1].toLowerCase();
  }

  const idMatch = id.match(
    /^auto-(?:find-all|find-by-id|create|update|upsert|delete)-(?:by-[a-z0-9_]+-)?(.+)$/i,
  );
  if (idMatch && idMatch[1]) {
    return idMatch[1].toLowerCase();
  }

  // 2. Check SQL query or code for FROM / INTO / UPDATE
  const fromMatch = (query + " " + code).match(
    /(?:FROM|INTO|UPDATE)\s+["'`]?([a-zA-Z0-9_]+)["'`]?/i,
  );
  if (fromMatch && fromMatch[1]) {
    return fromMatch[1].toLowerCase();
  }

  // 3. Parse from function name, e.g. findAllConversations / findAllConversationsByCreator / findConversationById
  const clean = name
    .replace(
      /^(findAll|findById|findBy|find|create|update|deleteById|delete|insert|select|remove)/i,
      "",
    )
    .replace(/By[A-Z][a-zA-Z0-9_]*$/i, "")
    .replace(/ById$/i, "")
    .trim();

  if (clean) {
    const lower = clean.toLowerCase();
    return lower.endsWith("s") ? lower : `${lower}s`;
  }

  return "records";
}

function isSqlStatement(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\r\n]*/g, "")
    .replace(/\/\/[^\r\n]*/g, "")
    .trim();
  return /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP|PRAGMA)\b/i.test(stripped);
}

/**
 * Plans a standard SQL command from operation details and arguments.
 */
export function planSqlCommand(
  op: TestDbOperationPayload["operation"],
  args: Record<string, unknown>,
  _engine = "sqlite",
): SqlCommandPlan {
  const name = op.name || "";
  const kind = op.kind || "";
  const query = op.query || "";
  const tableName = extractTableName(op);

  if (
    query &&
    !query.startsWith("Query function for") &&
    !query.startsWith("Auto-generated") &&
    !query.startsWith("//") &&
    isSqlStatement(query)
  ) {
    return { rawSql: query, tableName, kind };
  }

  const code = (op.code || "").trim();
  const queryMatch = code.match(
    /(?:client\.|db\.|await\s+)?query(?:<[^>]+>)?\s*\(\s*(['"`])([\s\S]*?)\1\s*(?:,\s*\[([\s\S]*?)\])?\s*\)/m,
  );
  if (queryMatch && queryMatch[2] && isSqlStatement(queryMatch[2].trim())) {
    let extracted = queryMatch[2].trim();
    if (queryMatch[3]) {
      const explicitArgs = queryMatch[3]
        .split(",")
        .map((s) => s.trim().replace(/^data\./, ""))
        .filter(Boolean);
      explicitArgs.forEach((argName, idx) => {
        const ph = `$${idx + 1}`;
        const snakeArg = argName.replace(/([A-Z])/g, "_$1").toLowerCase();
        const camelArg = argName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const val = args[argName] ?? args[snakeArg] ?? args[camelArg];
        if (val !== undefined) {
          extracted = extracted.replaceAll(
            ph,
            typeof val === "number" ? String(val) : `'${String(val).replace(/'/g, "''")}'`,
          );
        }
      });
    }
    return { rawSql: extracted, tableName, kind: kind || "custom" };
  }

  const idVal = args.id !== undefined ? String(args.id) : "1";
  const isFindAll =
    kind === "findAll" ||
    name.toLowerCase().startsWith("findall") ||
    name.toLowerCase().startsWith("getall") ||
    name.toLowerCase().startsWith("list");
  const isFetchByIndex =
    kind === "fetchByIndex" ||
    (name.toLowerCase().startsWith("find") && name.includes("By"));
  const isFindById =
    kind === "findById" ||
    name.toLowerCase().includes("byid") ||
    (name.toLowerCase().startsWith("find") && args.id !== undefined && !isFetchByIndex);
  const isCreate =
    kind === "create" ||
    name.toLowerCase().startsWith("create") ||
    name.toLowerCase().startsWith("insert");
  const isUpsert =
    kind === "upsert" ||
    name.toLowerCase().startsWith("upsert");
  const isUpdate =
    kind === "update" || name.toLowerCase().startsWith("update");
  const isDelete =
    kind === "delete" ||
    name.toLowerCase().startsWith("delete") ||
    name.toLowerCase().startsWith("remove");

  if (isFetchByIndex) {
    const limit = args.limit !== undefined ? Number(args.limit) : 20;
    const offset = args.offset !== undefined ? Number(args.offset) : 0;
    const filterParams = (op.params || []).filter(
      (p) => p.name !== "limit" && p.name !== "offset" && p.name !== "sort" && p.name !== "order",
    );
    const whereParts: string[] = [];
    for (const p of filterParams) {
      const colName = p.name.replace(/([A-Z])/g, "_$1").toLowerCase();
      const val = args[p.name] ?? args[colName] ?? "";
      if (_engine === "postgres") {
        whereParts.push(`"${colName}" = '${String(val).replace(/'/g, "''")}'`);
      } else {
        whereParts.push(`${colName} = '${String(val).replace(/'/g, "''")}'`);
      }
    }
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")} ` : "";
    if (_engine === "postgres") {
      return {
        rawSql: `SELECT * FROM "${tableName}" ${whereClause}LIMIT ${limit} OFFSET ${offset};`,
        tableName,
        kind: "fetchByIndex",
      };
    }
    return {
      rawSql: `SELECT * FROM ${tableName} ${whereClause}LIMIT ${limit} OFFSET ${offset};`,
      tableName,
      kind: "fetchByIndex",
    };
  }

  if (isFindAll) {
    const limit = args.limit !== undefined ? Number(args.limit) : 20;
    const offset = args.offset !== undefined ? Number(args.offset) : 0;
    if (_engine === "postgres") {
      return {
        rawSql: `SELECT * FROM "${tableName}" ORDER BY "id" LIMIT ${limit} OFFSET ${offset};`,
        tableName,
        kind: "findAll",
      };
    }
    return {
      rawSql: `SELECT * FROM ${tableName} LIMIT ${limit} OFFSET ${offset};`,
      tableName,
      kind: "findAll",
    };
  }

  if (isFindById) {
    if (_engine === "postgres") {
      return {
        rawSql: `SELECT * FROM "${tableName}" WHERE "id" = '${idVal}' LIMIT 1;`,
        tableName,
        kind: "findById",
      };
    }
    return {
      rawSql: `SELECT * FROM ${tableName} WHERE id = '${idVal}' LIMIT 1;`,
      tableName,
      kind: "findById",
    };
  }

  if (isUpsert) {
    let rawPayload: unknown = args.data;
    if (!rawPayload) {
      const destructuredKey = Object.keys(args).find((k) => k.startsWith("{"));
      if (destructuredKey) rawPayload = args[destructuredKey];
    }
    if (!rawPayload) {
      rawPayload = args.record || args.item || args;
    }

    const dataObj: JsonObject = isJsonObject(rawPayload)
      ? (rawPayload as JsonObject)
      : {};

    const keys = Object.keys(dataObj).filter(
      (k) => !k.startsWith("{") && k !== "data" && k !== "record" && dataObj[k] !== undefined,
    );

    if (!keys.some((k) => k.toLowerCase() === "id")) {
      keys.unshift("id");
      dataObj["id"] = dataObj["id"] || `${tableName}_${Date.now().toString(36)}`;
    }

    const nonIdKeys = keys.filter((k) => k.toLowerCase() !== "id");

    if (_engine === "postgres") {
      const cols = keys.map((k) => `"${k}"`).join(", ");
      const vals = keys.map((k) => JSON.stringify(dataObj[k])).join(", ");
      const conflictSet = nonIdKeys.length > 0
        ? `DO UPDATE SET ` + nonIdKeys.map((k) => `"${k}" = EXCLUDED."${k}"`).join(", ")
        : `DO NOTHING`;
      return {
        rawSql: `INSERT INTO "${tableName}" (${cols}) VALUES (${vals}) ON CONFLICT ("id") ${conflictSet} RETURNING *;`,
        tableName,
        kind: "upsert",
      };
    }

    const cols = keys.join(", ");
    const vals = keys.map((k) => JSON.stringify(dataObj[k])).join(", ");
    const conflictSet = nonIdKeys.length > 0
      ? `DO UPDATE SET ` + nonIdKeys.map((k) => `${k} = excluded.${k}`).join(", ")
      : `DO NOTHING`;
    return {
      rawSql: `INSERT INTO ${tableName} (${cols}) VALUES (${vals}) ON CONFLICT(id) ${conflictSet} RETURNING *;`,
      tableName,
      kind: "upsert",
    };
  }

  if (isCreate) {
    let rawPayload: unknown = args.data;
    if (!rawPayload) {
      const destructuredKey = Object.keys(args).find((k) => k.startsWith("{"));
      if (destructuredKey) rawPayload = args[destructuredKey];
    }
    if (!rawPayload) {
      rawPayload = args.record || args.item || args;
    }

    const dataObj: JsonObject = isJsonObject(rawPayload)
      ? (rawPayload as JsonObject)
      : {};

    // Keep all valid column keys (do NOT filter out "id" if id is provided in payload!)
    const keys = Object.keys(dataObj).filter(
      (k) => !k.startsWith("{") && k !== "data" && k !== "record" && dataObj[k] !== undefined,
    );

    if (_engine === "postgres") {
      if (keys.length > 0) {
        const cols = keys.map((k) => `"${k}"`).join(", ");
        const vals = keys.map((k) => JSON.stringify(dataObj[k])).join(", ");
        return {
          rawSql: `INSERT INTO "${tableName}" (${cols}) VALUES (${vals}) RETURNING *;`,
          tableName,
          kind: "create",
        };
      }
      // Never send DEFAULT VALUES on Postgres if id is not nullable without default — supply an explicit id
      const fallbackId = `${tableName}_${Date.now().toString(36)}`;
      return {
        rawSql: `INSERT INTO "${tableName}" ("id") VALUES ('${fallbackId}') RETURNING *;`,
        tableName,
        kind: "create",
      };
    }
    if (keys.length > 0) {
      const cols = keys.join(", ");
      const vals = keys.map((k) => JSON.stringify(dataObj[k])).join(", ");
      return {
        rawSql: `INSERT INTO ${tableName} (${cols}) VALUES (${vals}) RETURNING *;`,
        tableName,
        kind: "create",
      };
    }
    const fallbackId = `${tableName}_${Date.now().toString(36)}`;
    return {
      rawSql: `INSERT INTO ${tableName} (id) VALUES ('${fallbackId}') RETURNING *;`,
      tableName,
      kind: "create",
    };
  }

  if (isUpdate) {
    let rawPayload: unknown = args.data;
    if (!rawPayload) {
      const destructuredKey = Object.keys(args).find((k) => k.startsWith("{"));
      if (destructuredKey) rawPayload = args[destructuredKey];
    }
    if (!rawPayload) {
      rawPayload = args.record || args.item || args;
    }
    const dataObj: JsonObject = isJsonObject(rawPayload)
      ? (rawPayload as JsonObject)
      : {};
    if (_engine === "postgres") {
      const sets = Object.entries(dataObj)
        .filter(([k]) => k !== "id" && !k.startsWith("{") && k !== "data" && k !== "record")
        .map(([k, v]) => `"${k}" = ${JSON.stringify(v)}`);
      const setClause =
        sets.length > 0 ? sets.join(", ") : `"updated_at" = NOW()`;
      return {
        rawSql: `UPDATE "${tableName}" SET ${setClause} WHERE "id" = '${idVal}' RETURNING *;`,
        tableName,
        kind: "update",
      };
    }
    const sets = Object.entries(dataObj)
      .filter(([k]) => k !== "id")
      .map(([k, v]) => `${k} = ${JSON.stringify(v)}`);
    const setClause =
      sets.length > 0 ? sets.join(", ") : "updated_at = CURRENT_TIMESTAMP";
    return {
      rawSql: `UPDATE ${tableName} SET ${setClause} WHERE id = '${idVal}' RETURNING *;`,
      tableName,
      kind: "update",
    };
  }

  if (isDelete) {
    if (_engine === "postgres") {
      return {
        rawSql: `DELETE FROM "${tableName}" WHERE "id" = '${idVal}';`,
        tableName,
        kind: "delete",
      };
    }
    return {
      rawSql: `DELETE FROM ${tableName} WHERE id = '${idVal}';`,
      tableName,
      kind: "delete",
    };
  }

  const argsStr = Object.entries(args)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ");
  return {
    rawSql: `${name}(${argsStr})`,
    tableName,
    kind: kind || "custom",
  };
}

/**
 * Generates sample/simulated SQL query results for mock test executions.
 */
export function executeSqlOperation(
  op: TestDbOperationPayload["operation"],
  args: Record<string, unknown>,
  engine = "sqlite",
): unknown {
  const tableName = extractTableName(op);
  const name = op.name || "";
  const kind = op.kind || "";

  const isFindAll =
    kind === "findAll" ||
    name.toLowerCase().startsWith("findall") ||
    name.toLowerCase().startsWith("getall") ||
    name.toLowerCase().startsWith("list");
  const isFindById =
    kind === "findById" ||
    name.toLowerCase().includes("byid") ||
    (name.toLowerCase().startsWith("find") && args.id !== undefined);
  const isCreate =
    kind === "create" ||
    name.toLowerCase().startsWith("create") ||
    name.toLowerCase().startsWith("insert");
  const isUpsert =
    kind === "upsert" ||
    name.toLowerCase().startsWith("upsert");
  const isUpdate =
    kind === "update" || name.toLowerCase().startsWith("update");
  const isDelete =
    kind === "delete" ||
    name.toLowerCase().startsWith("delete") ||
    name.toLowerCase().startsWith("remove");

  const nowIso = new Date().toISOString();

  const buildSampleRow = (
    index: number,
    idOverride?: string,
  ): Record<string, unknown> => {
    const sampleId = idOverride || `${tableName}_${index}`;
    const base: Record<string, unknown> = {
      id: sampleId,
      created_at: nowIso,
      updated_at: nowIso,
    };

    if (op.params) {
      for (const p of op.params) {
        if (
          p.name !== "limit" &&
          p.name !== "offset" &&
          p.name !== "id" &&
          p.name !== "data"
        ) {
          base[p.name] =
            args[p.name] ??
            (p.type === "number"
              ? 0
              : p.type === "boolean"
                ? true
                : `sample_${p.name}`);
        }
      }
    }

    if (isJsonObject(args.data)) {
      Object.assign(base, args.data);
    }

    return base;
  };

  if (isFindAll) {
    const limit = Math.min(Math.max(1, Number(args.limit) || 20), 5);
    const rows: unknown[] = [];
    for (let i = 1; i <= limit; i++) {
      rows.push(buildSampleRow(i));
    }
    return rows;
  }

  if (isFindById) {
    const idVal = args.id !== undefined ? String(args.id) : `${tableName}_1`;
    return buildSampleRow(1, idVal);
  }

  if (isCreate || isUpsert) {
    const payloadId = args.data && typeof args.data === "object" ? (args.data as Record<string, unknown>).id : undefined;
    const newId = args.id !== undefined ? String(args.id) : payloadId !== undefined ? String(payloadId) : `new_${Date.now()}`;
    return buildSampleRow(1, newId);
  }

  if (isUpdate) {
    const idVal = args.id !== undefined ? String(args.id) : `${tableName}_1`;
    return buildSampleRow(1, idVal);
  }

  if (isDelete) {
    const idVal = args.id !== undefined ? String(args.id) : `${tableName}_1`;
    return {
      success: true,
      message: `Record with id '${idVal}' was deleted from ${tableName}.`,
      deletedCount: 1,
    };
  }

  return {
    success: true,
    operation: op.name,
    result: {
      message: `Executed ${op.name} successfully against ${engine}`,
      params: args,
    },
  };
}
