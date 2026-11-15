import { DbOperationFunction, CanvasEntityColumn } from "@workspace/canvas/types";
import { v4 as uuidv4 } from "uuid";

/**
 * Generate sensible default sample value for a single column based on name & type
 */
function sampleValueForColumn(col: CanvasEntityColumn, cleanLabel: string): unknown {
  const colName = (col.name || "").toLowerCase();
  const colType = (col.type || "text").toLowerCase();

  if (col.isPrimaryKey) {
    if (colType.includes("int") || colType.includes("num") || colType.includes("serial")) {
      return 1;
    }
    if (colType.includes("uuid") || col.type?.toUpperCase() === "UUID") {
      return uuidv4();
    }
    return `${cleanLabel}_1`;
  }
  if (colType.includes("uuid") || col.type?.toUpperCase() === "UUID") {
    return uuidv4();
  }
  if (
    colType.includes("int") ||
    colType.includes("float") ||
    colType.includes("double") ||
    colType.includes("numeric") ||
    colType.includes("decimal") ||
    colType.includes("real")
  ) {
    if (colName.includes("price") || colName.includes("amount") || colName.includes("total")) return 99.99;
    if (colName.includes("count") || colName.includes("qty") || colName.includes("quantity")) return 10;
    if (colName.includes("age")) return 25;
    return 1;
  }
  if (colType.includes("bool")) {
    return true;
  }
  if (
    colType.includes("timestamp") ||
    colType.includes("date") ||
    colType.includes("time")
  ) {
    return new Date().toISOString();
  }
  if (colType.includes("json")) {
    return {};
  }
  // String / text variants
  if (colName.includes("email")) return "user@example.com";
  if (colName.includes("phone")) return "+1-555-0100";
  if (colName.includes("status")) return "active";
  if (colName.includes("role")) return "user";
  if (colName.includes("title") || colName.includes("name")) return `Sample ${col.name}`;
  if (colName.includes("url") || colName.includes("link")) return "https://example.com";
  if (colName.includes("desc") || colName.includes("bio") || colName.includes("comment")) return `Sample description for ${cleanLabel}`;
  return `sample_${col.name}`;
}

/**
 * Generate sample object for a table payload (CreateData / UpdateData / etc.)
 */
export function generateSampleDataFromColumns(
  columns: CanvasEntityColumn[] | undefined,
  cleanLabel: string,
  kind?: string,
): Record<string, unknown> {
  if (!columns || columns.length === 0) {
    return { id: `${cleanLabel}_1` };
  }
  const result: Record<string, unknown> = {};
  columns.forEach((c) => {
    // For update operations, typically skip PK unless required
    if (kind === "update" && c.isPrimaryKey) return;
    result[c.name] = sampleValueForColumn(c, cleanLabel);
  });
  return result;
}

/**
 * Generate sensible default parameter values for test case based on operation params and table columns
 */
export function generateDefaultParams(
  op: DbOperationFunction,
  label: string,
  isRedis = false,
  columns?: CanvasEntityColumn[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const cleanLabel = (label || "item").toLowerCase().replace(/[^a-z0-9_]/g, "_");

  (op.params || []).forEach((p) => {
    const name = p.name.toLowerCase();
    const type = (p.type || "string").toLowerCase();

    if (p.defaultValue) {
      try {
        result[p.name] = JSON.parse(p.defaultValue);
        return;
      } catch {
        result[p.name] = p.defaultValue;
        return;
      }
    }

    if (name === "key") {
      result[p.name] = `${cleanLabel}:1001`;
    } else if (name === "id") {
      const isUuidParam =
        type.includes("uuid") ||
        (columns && columns.some((c) => c.isPrimaryKey && (c.type?.toLowerCase().includes("uuid") || c.type?.toUpperCase() === "UUID")));
      result[p.name] = type.includes("number") ? 1 : isUuidParam ? uuidv4() : `${cleanLabel}_1`;
    } else if (
      name === "item" ||
      name === "data" ||
      name === "record" ||
      type.includes("create") ||
      type.includes("update") ||
      type.includes("data") ||
      type.includes("row")
    ) {
      if (columns && columns.length > 0) {
        result[p.name] = generateSampleDataFromColumns(columns, cleanLabel, op.kind);
      } else {
        result[p.name] = { id: `${cleanLabel}_1` };
      }
    } else if (name === "field") {
      result[p.name] = "status";
    } else if (name === "fields") {
      result[p.name] = {
        name: "Alice",
        role: "admin",
      };
    } else if (name === "count" || name === "limit") {
      result[p.name] = 10;
    } else if (name === "offset") {
      result[p.name] = 0;
    } else if (name === "score") {
      result[p.name] = 100;
    } else if (name === "member") {
      result[p.name] = "user_1001";
    } else if (name === "ttlseconds" || name === "ttl") {
      result[p.name] = 3600;
    } else if (type.includes("number")) {
      result[p.name] = 1;
    } else if (type.includes("bool")) {
      result[p.name] = true;
    } else if (type.includes("record") || type.includes("object") || type.includes("{")) {
      if (columns && columns.length > 0) {
        result[p.name] = generateSampleDataFromColumns(columns, cleanLabel, op.kind);
      } else {
        result[p.name] = { sampleKey: "sampleValue" };
      }
    } else {
      result[p.name] = "sample_value";
    }
  });

  // Only fallback to a redis key if this is a Redis operation with no params
  if (isRedis && Object.keys(result).length === 0) {
    result.key = `${cleanLabel}:1001`;
  }

  return result;
}

