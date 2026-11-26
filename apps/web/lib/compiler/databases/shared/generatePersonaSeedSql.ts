import { PersonaSeed } from "../../types/testPersona";
import { isUuid, toTableName, toValidUuid } from "../../utils";

export interface GeneratePersonaSeedOptions {
  knownTableNames?: Set<string>;
  knownTableColumns?:
    | Map<string, Set<string>>
    | Record<string, Array<{ name: string }>>
    | Record<string, Set<string>>;
  /** If true, generates ON CONFLICT ("id") DO UPDATE SET ... for idempotent upsert */
  upsert?: boolean;
}

/**
 * Escapes a literal value safely for SQL injection prevention.
 * Uses ANSI single-quote doubling: 'O''Connor'
 */
export function escapeSqlValue(
  val: string | number | boolean | Date | null | undefined,
  dialect: "sqlite" | "postgres",
): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") {
    return Number.isFinite(val) ? String(val) : "NULL";
  }
  if (typeof val === "boolean") {
    return dialect === "postgres" ? (val ? "TRUE" : "FALSE") : val ? "1" : "0";
  }
  if (val instanceof Date) {
    return `'${val.toISOString()}'`;
  }
  const str = String(val);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Normalizes known column lookup map for schema validation.
 */
function getKnownColumnsForTable(
  tableName: string,
  knownTableColumns?: GeneratePersonaSeedOptions["knownTableColumns"],
): Set<string> | null {
  if (!knownTableColumns) return null;

  const lowerName = tableName.toLowerCase();

  if (knownTableColumns instanceof Map) {
    for (const [tName, cols] of knownTableColumns.entries()) {
      if (tName.toLowerCase() === lowerName) {
        return new Set(Array.from(cols).map((c) => c.toLowerCase()));
      }
    }
    return null;
  }

  // Record<string, ...>
  for (const [tName, colList] of Object.entries(knownTableColumns)) {
    if (tName.toLowerCase() === lowerName) {
      if (colList instanceof Set) {
        return new Set(Array.from(colList).map((c) => c.toLowerCase()));
      }
      if (Array.isArray(colList)) {
        return new Set(
          colList.map((c) => (typeof c === "string" ? c.toLowerCase() : c.name.toLowerCase())),
        );
      }
    }
  }

  return null;
}

/**
 * Generates an array of safe, dialect-aware INSERT statements for persona test records.
 */
export function generatePersonaSeedStatements(
  personas: PersonaSeed[],
  dialect: "sqlite" | "postgres",
  options: GeneratePersonaSeedOptions = {},
): string[] {
  if (!personas || personas.length === 0) return [];

  const statements: string[] = [];
  const knownTableNamesLower = options.knownTableNames
    ? new Set(Array.from(options.knownTableNames).map((t) => t.toLowerCase()))
    : null;

  for (const persona of personas) {
    const effectiveRecords =
      persona.records && persona.records.length > 0
        ? persona.records
        : [
            {
              id: persona.id,
              tableName: "user",
              fields: {
                id: persona.id,
                name: persona.name,
                email: `${persona.name ? persona.name.toLowerCase().replace(/\s+/g, ".") : "user"}@example.com`,
                role: (persona.name || "").toLowerCase().includes("admin") ? "admin" : "user",
              },
            },
          ];

    // Find persona's user record id for session userId linkage
    const userRec = effectiveRecords.find((r) => {
      const l = (r.tableName || "").toLowerCase();
      return l === "user" || l === "users";
    });
    const rawPersonaUserId =
      userRec?.fields?.id ||
      userRec?.id ||
      persona.id;
    const personaUserId =
      dialect === "postgres"
        ? toValidUuid(String(rawPersonaUserId))
        : rawPersonaUserId;

    for (const record of effectiveRecords) {
      const rawTableName = record.tableName || "";
      if (!rawTableName) continue;

      const lowerTable = rawTableName.toLowerCase();
      const normalizedTable = toTableName(rawTableName).toLowerCase();

      // Table validation: if knownTableNames is provided, skip unknown tables
      if (
        knownTableNamesLower &&
        !knownTableNamesLower.has(lowerTable) &&
        !knownTableNamesLower.has(normalizedTable)
      ) {
        continue;
      }

      // Clone fields so we don't mutate the original persona record
      const fields: Record<string, string | number | boolean | null | undefined> = { ...(record.fields || {}) };

      // Ensure primary record ID if omitted
      if (record.id && fields.id === undefined) {
        fields.id = record.id;
      }

      // In Postgres, if ID is provided and is a non-UUID placeholder like "user_783apf", sanitize it
      if (dialect === "postgres" && fields.id !== undefined && fields.id !== null) {
        const idStr = String(fields.id);
        if (
          !isUuid(idStr) &&
          (lowerTable === "user" ||
            lowerTable === "users" ||
            lowerTable === "session" ||
            lowerTable === "sessions" ||
            idStr.startsWith("user_") ||
            idStr.startsWith("sess_"))
        ) {
          fields.id = toValidUuid(idStr);
        }
      }

      // Automatic session token synchronization
      if (lowerTable === "session" || lowerTable === "sessions") {
        if (persona.activeAuthToken) {
          fields.token = persona.activeAuthToken;
        }
        if (!fields.userId && personaUserId) {
          fields.userId = personaUserId;
        } else if (fields.userId && dialect === "postgres") {
          fields.userId = toValidUuid(String(fields.userId));
        }
        if (!fields.expiresAt) {
          fields.expiresAt = "2099-01-01T00:00:00.000Z";
        }
        if (!fields.createdAt) {
          fields.createdAt = "2026-01-01T00:00:00.000Z";
        }
      }

      // Automatic user defaults
      if (lowerTable === "user" || lowerTable === "users") {
        if (!fields.id && personaUserId) {
          fields.id = personaUserId;
        } else if (fields.id && dialect === "postgres") {
          fields.id = toValidUuid(String(fields.id));
        }
        if (!fields.name && persona.name) {
          fields.name = persona.name;
        }
        if (!fields.email) {
          fields.email = `${(persona.name || "user").toLowerCase().replace(/\s+/g, ".")}@example.com`;
        }
        if (!fields.role) {
          fields.role = (persona.name || "").toLowerCase().includes("admin") ? "admin" : "user";
        }
        if (fields.emailVerified === undefined) {
          fields.emailVerified = true;
        }
        if (!fields.createdAt) {
          fields.createdAt = "2026-01-01T00:00:00.000Z";
        }
        if (!fields.updatedAt) {
          fields.updatedAt = "2026-01-01T00:00:00.000Z";
        }
      }

      // For any other record in Postgres, coerce foreign keys like userId/created_by to valid UUID if needed
      if (dialect === "postgres") {
        for (const [colKey, colVal] of Object.entries(fields)) {
          const lCol = colKey.toLowerCase();
          if (
            (lCol === "userid" ||
              lCol === "user_id" ||
              lCol === "sessionid" ||
              lCol === "session_id" ||
              lCol === "created_by" ||
              lCol === "createdby" ||
              lCol === "author_id" ||
              lCol === "authorid") &&
            typeof colVal === "string" &&
            !isUuid(colVal)
          ) {
            fields[colKey] = toValidUuid(colVal);
          }
        }
      }

      // Filter fields by known table columns if column metadata is available
      const allowedCols = getKnownColumnsForTable(rawTableName, options.knownTableColumns);

      const entries = Object.entries(fields).filter(([col, val]) => {
        if (val === undefined) return false;
        if (!allowedCols) return true;
        // Always allow standard base columns
        const lowerCol = col.toLowerCase();
        if (lowerCol === "id" || lowerCol === "createdat" || lowerCol === "updatedat") return true;
        return allowedCols.has(lowerCol);
      });

      if (entries.length === 0) continue;

      const colNames = entries.map(([col]) => `"${col}"`).join(", ");
      const colValues = entries
        .map(([, val]) => escapeSqlValue(val, dialect))
        .join(", ");

      const cleanTableName =
        knownTableNamesLower && !knownTableNamesLower.has(lowerTable) && knownTableNamesLower.has(normalizedTable)
          ? normalizedTable
          : rawTableName.replace(/"/g, "").trim().replace(/\s+/g, "_");

      if (dialect === "sqlite") {
        if (options.upsert) {
          const hasId = entries.some(([col]) => col.toLowerCase() === "id");
          const updateCols = entries
            .filter(([col]) => col.toLowerCase() !== "id")
            .map(([col]) => `"${col}" = EXCLUDED."${col}"`);
          const conflictClause =
            hasId && updateCols.length > 0
              ? `ON CONFLICT ("id") DO UPDATE SET ${updateCols.join(", ")}`
              : `ON CONFLICT DO NOTHING`;
          statements.push(
            `INSERT INTO "${cleanTableName}" (${colNames}) VALUES (${colValues}) ${conflictClause};`,
          );
        } else {
          statements.push(
            `INSERT OR IGNORE INTO "${cleanTableName}" (${colNames}) VALUES (${colValues});`,
          );
        }
      } else {
        // Postgres
        const hasId = entries.some(([col]) => col.toLowerCase() === "id");
        if (options.upsert) {
          const updateCols = entries
            .filter(([col]) => col.toLowerCase() !== "id")
            .map(([col]) => `"${col}" = EXCLUDED."${col}"`);
          const conflictClause =
            hasId && updateCols.length > 0
              ? `ON CONFLICT ("id") DO UPDATE SET ${updateCols.join(", ")}`
              : hasId
              ? `ON CONFLICT ("id") DO NOTHING`
              : `ON CONFLICT DO NOTHING`;
          statements.push(
            `INSERT INTO "${cleanTableName}" (${colNames}) VALUES (${colValues}) ${conflictClause};`,
          );
        } else {
          const conflictClause = hasId ? `ON CONFLICT ("id") DO NOTHING` : `ON CONFLICT DO NOTHING`;
          statements.push(
            `INSERT INTO "${cleanTableName}" (${colNames}) VALUES (${colValues}) ${conflictClause};`,
          );
        }
      }
    }
  }

  return statements;
}

/**
 * Builds a single SQL string containing all seed statements.
 */
export function generatePersonaSeedSql(
  personas: PersonaSeed[],
  dialect: "sqlite" | "postgres",
  options: GeneratePersonaSeedOptions = {},
): string {
  const stmts = generatePersonaSeedStatements(personas, dialect, options);
  return stmts.join("\n");
}
