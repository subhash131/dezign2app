"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Database,
  Table2,
  Plus,
  Trash,
  Copy,
  Check,
  RefreshCw,
  Link2,
  Loader2,
  AlertCircle,
  Code2,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import {
  TestUserPersona,
  TableSeedRecord,
  generateRecordId,
} from "./types";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useTestUsersStore } from "./useTestUsersStore";
import { seedTestUsers } from "@/lib/services/databaseService";
import { toast } from "sonner";
import { cn } from "@workspace/ui/lib/utils";

export interface ColumnDef {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isNotNull?: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  defaultValue?: string;
}

export interface TableNodeInfo {
  id: string;
  name: string;
  databaseNodeId: string;
  columns: ColumnDef[];
  isBuiltin?: boolean;
}

interface PersonaRecordsEditorProps {
  persona: TestUserPersona;
  className?: string;
}

/**
 * Generates a commented JSON string showing each field with its data type,
 * Not Null (NN), Unique (UQ), and Primary Key (PK) constraints.
 */
function generateCommentedJson(
  fields: Record<string, string | number | boolean | null | undefined>,
  columns: ColumnDef[] = [],
  tableName: string = "table",
): string {
  const colMap = new Map<string, ColumnDef>();
  for (const c of columns) {
    colMap.set(c.name.toLowerCase(), c);
  }

  const schemaSummary = columns.map((c) => {
    const flags: string[] = [];
    if (c.isPrimaryKey || c.name === "id") flags.push("PK");
    if (c.isNotNull) flags.push("NN");
    if (c.isUnique) flags.push("UQ");
    if (c.isForeignKey) flags.push("FK");
    const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
    return ` *  - ${c.name}: ${c.type}${flagStr}`;
  });

  const header = [
    `/* Table Schema: "${tableName}"`,
    schemaSummary.length > 0
      ? schemaSummary.join("\n")
      : " *  (no schema columns defined)",
    ` */`,
    `{`,
  ];

  const entries = Object.entries(fields);
  const bodyLines = entries.map(([key, val], idx) => {
    const isLast = idx === entries.length - 1;
    const col = colMap.get(key.toLowerCase());
    const flags: string[] = [];
    if (col?.type) flags.push(col.type);
    if (col?.isPrimaryKey || key === "id") flags.push("PK");
    if (col?.isNotNull) flags.push("NN");
    if (col?.isUnique) flags.push("UQ");
    if (col?.isForeignKey) flags.push("FK");

    const comment = flags.length > 0 ? ` /* ${flags.join(", ")} */` : "";
    const comma = isLast ? "" : ",";
    const serialized = JSON.stringify(val);
    return `  "${key}": ${serialized}${comma}${comment}`;
  });

  return [...header, ...bodyLines, `}`].join("\n");
}

/**
 * Safely parses JSON that may contain multi-line /* ... *\/ or single-line // ... comments.
 */
function parseCommentedJson(text: string): Record<string, string | number | boolean | null | undefined> | null {
  try {
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "")
      .trim();
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function PersonaRecordsEditor({ persona, className }: PersonaRecordsEditorProps) {
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const updatePersona = useTestUsersStore((s) => s.updatePersona);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [seedingRecordIndex, setSeedingRecordIndex] = useState<number | null>(null);
  const [recordErrors, setRecordErrors] = useState<Record<number, string | null>>({});

  // View mode per record: "form" | "json"
  const [recordViewMode, setRecordViewMode] = useState<Record<number, "form" | "json">>({});
  const [jsonDrafts, setJsonDrafts] = useState<Record<number, string>>({});
  const [jsonParseErrors, setJsonParseErrors] = useState<Record<number, string | null>>({});

  // Per-record "Add Field" inline state
  const [addingFieldRecordIdx, setAddingFieldRecordIdx] = useState<number | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldValue, setNewFieldValue] = useState("");

  // 1. Discover all databases
  const databaseNodes = useMemo(() => {
    const dbs = allNodes.filter((n) => n.type === "database");
    if (dbs.length === 0) {
      return [
        {
          id: "primary-postgres",
          name: "Primary Database (PostgreSQL)",
          engine: "postgres",
        },
      ];
    }
    return dbs.map((d) => ({
      id: d.id,
      name: d.data?.label || d.data?.name || "Database",
      engine: d.data?.dbEngine || "postgres",
    }));
  }, [allNodes]);

  // 2. Discover all tables (canvas entity nodes + full built-in BetterAuth tables)
  const availableTables = useMemo<TableNodeInfo[]>(() => {
    const builtin: TableNodeInfo[] = [
      {
        id: "builtin-user",
        name: "user",
        databaseNodeId: databaseNodes[0]?.id || "primary-postgres",
        isBuiltin: true,
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true, isNotNull: true, defaultValue: "" },
          { name: "name", type: "text", isNotNull: true, defaultValue: "Test Persona" },
          { name: "email", type: "text", isNotNull: true, isUnique: true, defaultValue: "test@example.com" },
          { name: "emailVerified", type: "boolean", isNotNull: true, defaultValue: "true" },
          { name: "role", type: "text", defaultValue: "admin" },
          { name: "image", type: "text", defaultValue: "" },
          { name: "banned", type: "boolean", defaultValue: "false" },
          { name: "banReason", type: "text", defaultValue: "" },
          { name: "twoFactorEnabled", type: "boolean", defaultValue: "false" },
          { name: "createdAt", type: "timestamptz", defaultValue: "NOW()" },
          { name: "updatedAt", type: "timestamptz", defaultValue: "NOW()" },
        ],
      },
      {
        id: "builtin-session",
        name: "session",
        databaseNodeId: databaseNodes[0]?.id || "primary-postgres",
        isBuiltin: true,
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true, isNotNull: true, defaultValue: "" },
          { name: "userId", type: "uuid", isNotNull: true, isForeignKey: true, defaultValue: "" },
          { name: "token", type: "text", isNotNull: true, isUnique: true, defaultValue: "" },
          { name: "expiresAt", type: "timestamptz", isNotNull: true, defaultValue: "2099-01-01T00:00:00.000Z" },
          { name: "ipAddress", type: "text", defaultValue: "127.0.0.1" },
          { name: "userAgent", type: "text", defaultValue: "PostmanRuntime/7.39.0" },
          { name: "createdAt", type: "timestamptz", defaultValue: "NOW()" },
          { name: "updatedAt", type: "timestamptz", defaultValue: "NOW()" },
        ],
      },
      {
        id: "builtin-account",
        name: "account",
        databaseNodeId: databaseNodes[0]?.id || "primary-postgres",
        isBuiltin: true,
        columns: [
          { name: "id", type: "uuid", isPrimaryKey: true, isNotNull: true, defaultValue: "" },
          { name: "userId", type: "uuid", isNotNull: true, isForeignKey: true, defaultValue: "" },
          { name: "accountId", type: "text", isNotNull: true, defaultValue: "" },
          { name: "providerId", type: "text", isNotNull: true, defaultValue: "credential" },
          { name: "password", type: "text", defaultValue: "" },
          { name: "createdAt", type: "timestamptz", defaultValue: "NOW()" },
          { name: "updatedAt", type: "timestamptz", defaultValue: "NOW()" },
        ],
      },
    ];

    const canvasTables: TableNodeInfo[] = allNodes
      .filter((n) => n.type === "entity")
      .map((t) => {
        const rawCols = t.data?.columns || [];
        const columns: ColumnDef[] = rawCols.map((c) => ({
          name: c.name || "field",
          type: c.type || "string",
          isPrimaryKey: Boolean(c.isPrimaryKey || c.isPrimary || c.primaryKey),
          isNotNull: Boolean(c.isNotNull || c.required),
          isUnique: Boolean(c.isUnique),
          isForeignKey: Boolean(c.isForeignKey || c.references),
          defaultValue: c.defaultValue || "",
        }));

        return {
          id: t.id,
          name: t.data?.label || "entity",
          databaseNodeId: t.data?.databaseId || t.data?.parentId || databaseNodes[0]?.id || "primary-postgres",
          isBuiltin: false,
          columns:
            columns.length > 0
              ? columns
              : [{ name: "id", type: "string", isPrimaryKey: true, isNotNull: true, defaultValue: "" }],
        };
      });

    // Merge: canvas tables first, then built-in tables if not already present
    const map = new Map<string, TableNodeInfo>();
    for (const b of builtin) {
      map.set(b.name.toLowerCase(), b);
    }
    for (const c of canvasTables) {
      map.set(c.name.toLowerCase(), c);
    }
    return Array.from(map.values());
  }, [allNodes, databaseNodes]);

  // Helper to resolve live database connection config
  const getDbConnection = (dbNameOrId?: string) => {
    const dbs = allNodes.filter((n) => n.type === "database");
    let targetDb = dbNameOrId ? dbs.find((d) => d.id === dbNameOrId) : undefined;
    if (!targetDb && dbNameOrId) {
      targetDb = dbs.find(
        (d) =>
          (d.data?.label || "").toLowerCase() ===
          dbNameOrId.toLowerCase(),
      );
    }
    if (!targetDb) {
      targetDb = dbs[0];
    }
    const data = targetDb?.data;
    const engine = (data?.dbEngine || "postgres").toLowerCase();
    const connection = {
      host: data?.host,
      port: data?.port,
      database: data?.database,
      user: data?.user || data?.username,
      password: data?.password,
      connectionString: data?.connectionString || data?.connectionStringPooled,
      connectionStringEnv: data?.connectionStringEnv || "DATABASE_URL",
      connectionStringPooled: data?.connectionStringPooled,
      connectionStringPooledEnv: data?.connectionStringPooledEnv,
      sslMode: data?.sslMode,
      provider: data?.provider,
      dbFilePath: data?.dbFilePath,
      dbFilePathEnv: data?.dbFilePathEnv,
    };
    return {
      name: data?.label || "Primary Database",
      engine,
      connection,
    };
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleDatabaseChange = (recIdx: number, newDbName: string) => {
    setRecordErrors((prev) => ({ ...prev, [recIdx]: null }));
    const updatedRecords = [...persona.records];
    const rec = { ...updatedRecords[recIdx]! };
    rec.databaseName = newDbName;
    updatedRecords[recIdx] = rec;
    updatePersona(persona.id, { records: updatedRecords });
    toast.success(`Updated database to ${newDbName}`);
  };

  // Populate ALL columns of the table into rec.fields
  const handlePopulateAllSchemaFields = (recIdx: number) => {
    setRecordErrors((prev) => ({ ...prev, [recIdx]: null }));
    const rec = persona.records[recIdx];
    if (!rec) return;

    const matchedTable = availableTables.find(
      (t) => t.name.toLowerCase() === rec.tableName.toLowerCase(),
    );
    if (!matchedTable?.columns) return;

    const mergedFields: Record<string, string | number | boolean | null | undefined> = {
      ...rec.fields,
    };

    for (const col of matchedTable.columns) {
      if (!(col.name in mergedFields) || mergedFields[col.name] === undefined) {
        const lowerCol = col.name.toLowerCase();
        if (
          lowerCol === "userid" ||
          lowerCol === "user_id" ||
          lowerCol === "created_by" ||
          lowerCol === "createdby" ||
          lowerCol === "author_id"
        ) {
          const userRec = persona.records.find((r) =>
            ["user", "users"].includes((r.tableName || "").toLowerCase()),
          );
          const uId = userRec?.fields?.id;
          mergedFields[col.name] = uId ? String(uId) : (userRec?.id || persona.id);
        } else if (lowerCol === "token") {
          mergedFields[col.name] = persona.activeAuthToken || "";
        } else if (lowerCol === "emailverified") {
          mergedFields[col.name] = true;
        } else if (lowerCol === "banned" || lowerCol === "twofactorenabled") {
          mergedFields[col.name] = false;
        } else if (lowerCol === "expiresat") {
          mergedFields[col.name] = "2099-01-01T00:00:00.000Z";
        } else if (lowerCol === "createdat" || lowerCol === "updatedat") {
          mergedFields[col.name] = new Date().toISOString();
        } else if (lowerCol === "role") {
          mergedFields[col.name] = persona.name.toLowerCase().includes("admin") ? "admin" : "user";
        } else if (lowerCol === "name") {
          mergedFields[col.name] = persona.name;
        } else if (lowerCol === "email") {
          mergedFields[col.name] = `${persona.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
        } else if (col.defaultValue && col.defaultValue !== "NOW()") {
          mergedFields[col.name] =
            col.defaultValue === "true" ? true : col.defaultValue === "false" ? false : col.defaultValue;
        } else if (col.isNotNull) {
          if (col.type === "boolean") mergedFields[col.name] = true;
          else if (col.type === "number" || col.type === "integer") mergedFields[col.name] = 0;
          else mergedFields[col.name] = "";
        } else {
          mergedFields[col.name] = "";
        }
      }
    }

    const updatedRecords = [...persona.records];
    updatedRecords[recIdx] = { ...rec, fields: mergedFields };
    updatePersona(persona.id, { records: updatedRecords });

    // Update JSON draft if in JSON mode
    setJsonDrafts((prev) => ({
      ...prev,
      [recIdx]: generateCommentedJson(mergedFields, matchedTable.columns, rec.tableName),
    }));

    toast.success(`Populated all ${matchedTable.columns.length} columns for "${rec.tableName}"`);
  };

  const handleTableChange = (recIdx: number, newTableName: string) => {
    setRecordErrors((prev) => ({ ...prev, [recIdx]: null }));
    const updatedRecords = [...persona.records];
    const existingRec = updatedRecords[recIdx]!;
    const matchedTable = availableTables.find(
      (t) => t.name.toLowerCase() === newTableName.toLowerCase(),
    );

    const newId = generateRecordId(newTableName, "postgres");
    const newFields: Record<string, string | number | boolean | null | undefined> = {
      id: newId,
    };

    // Prepopulate all columns from schema
    if (matchedTable?.columns) {
      for (const col of matchedTable.columns) {
        if (col.name === "id" || col.name === "_id") continue;
        const lowerCol = col.name.toLowerCase();

        if (
          lowerCol === "userid" ||
          lowerCol === "user_id" ||
          lowerCol === "created_by" ||
          lowerCol === "createdby" ||
          lowerCol === "author_id"
        ) {
          const userRec = persona.records.find((r) =>
            ["user", "users"].includes((r.tableName || "").toLowerCase()),
          );
          const userIdVal = userRec?.fields?.id;
          newFields[col.name] = userIdVal ? String(userIdVal) : (userRec?.id || persona.id);
        } else if (lowerCol === "token") {
          newFields[col.name] = persona.activeAuthToken || "";
        } else if (lowerCol === "emailverified") {
          newFields[col.name] = true;
        } else if (lowerCol === "banned" || lowerCol === "twofactorenabled") {
          newFields[col.name] = false;
        } else if (lowerCol === "expiresat") {
          newFields[col.name] = "2099-01-01T00:00:00.000Z";
        } else if (lowerCol === "createdat" || lowerCol === "updatedat") {
          newFields[col.name] = new Date().toISOString();
        } else if (lowerCol === "role") {
          newFields[col.name] = persona.name.toLowerCase().includes("admin") ? "admin" : "user";
        } else if (lowerCol === "name") {
          newFields[col.name] = persona.name;
        } else if (lowerCol === "email") {
          newFields[col.name] = `${persona.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
        } else if (col.defaultValue && col.defaultValue !== "NOW()") {
          newFields[col.name] =
            col.defaultValue === "true" ? true : col.defaultValue === "false" ? false : col.defaultValue;
        } else if (col.isNotNull) {
          if (col.type === "boolean") newFields[col.name] = true;
          else if (col.type === "number" || col.type === "integer") newFields[col.name] = 0;
          else newFields[col.name] = "";
        } else {
          newFields[col.name] = "";
        }
      }
    }

    updatedRecords[recIdx] = {
      ...existingRec,
      id: newId,
      tableName: newTableName,
      fields: newFields,
    };

    updatePersona(persona.id, { records: updatedRecords });

    setJsonDrafts((prev) => ({
      ...prev,
      [recIdx]: generateCommentedJson(newFields, matchedTable?.columns || [], newTableName),
    }));

    toast.success(`Updated table to "${newTableName}"`);
  };

  const handleRegenerateRecordId = (recIdx: number) => {
    setRecordErrors((prev) => ({ ...prev, [recIdx]: null }));
    const updatedRecords = [...persona.records];
    const rec = { ...updatedRecords[recIdx]! };
    const newId = generateRecordId(rec.tableName, "postgres");
    const oldId = rec.id;
    rec.id = newId;
    rec.fields = { ...rec.fields, id: newId };
    updatedRecords[recIdx] = rec;

    // If user table, update session userId
    const isUserTable = ["user", "users"].includes(rec.tableName.toLowerCase());
    if (isUserTable) {
      for (let i = 0; i < updatedRecords.length; i++) {
        const r = updatedRecords[i]!;
        if (["session", "sessions", "account"].includes(r.tableName.toLowerCase())) {
          if (r.fields.userId === oldId || !r.fields.userId) {
            updatedRecords[i] = {
              ...r,
              fields: { ...r.fields, userId: newId },
            };
          }
        }
      }
    }

    updatePersona(persona.id, { records: updatedRecords });
    toast.success(`Regenerated ID: ${newId.slice(0, 8)}...`);
  };

  const handleFieldChange = (
    recIdx: number,
    fieldName: string,
    value: string | number | boolean | null,
  ) => {
    setRecordErrors((prev) => ({ ...prev, [recIdx]: null }));
    const updatedRecords = [...persona.records];
    const rec = { ...updatedRecords[recIdx]! };
    const oldVal = rec.fields[fieldName];
    rec.fields = { ...rec.fields, [fieldName]: value };

    // Sync id if field is 'id'
    if (fieldName === "id") {
      rec.id = String(value);
      if (["user", "users"].includes(rec.tableName.toLowerCase())) {
        for (let i = 0; i < updatedRecords.length; i++) {
          const r = updatedRecords[i]!;
          if (["session", "sessions", "account"].includes(r.tableName.toLowerCase())) {
            if (r.fields.userId === oldVal || !r.fields.userId) {
              updatedRecords[i] = {
                ...r,
                fields: { ...r.fields, userId: String(value) },
              };
            }
          }
        }
      }
    }

    // Sync activeAuthToken if editing session token
    let updatedToken = persona.activeAuthToken;
    if (
      fieldName === "token" &&
      ["session", "sessions"].includes(rec.tableName.toLowerCase())
    ) {
      updatedToken = String(value);
    }

    updatedRecords[recIdx] = rec;

    updatePersona(persona.id, {
      records: updatedRecords,
      ...(updatedToken !== persona.activeAuthToken ? { activeAuthToken: updatedToken } : {}),
    });
  };

  const handleRemoveField = (recIdx: number, fieldName: string) => {
    if (fieldName === "id") {
      toast.error("Cannot remove primary key 'id' field");
      return;
    }
    const updatedRecords = [...persona.records];
    const rec = { ...updatedRecords[recIdx]! };
    const fieldsCopy = { ...rec.fields };
    delete fieldsCopy[fieldName];
    rec.fields = fieldsCopy;
    updatedRecords[recIdx] = rec;
    updatePersona(persona.id, { records: updatedRecords });
    toast.success(`Removed field "${fieldName}"`);
  };

  const handleAddField = (recIdx: number) => {
    if (!newFieldName.trim()) {
      toast.error("Please enter a field name");
      return;
    }
    const cleanKey = newFieldName.trim();
    const updatedRecords = [...persona.records];
    const rec = { ...updatedRecords[recIdx]! };
    rec.fields = { ...rec.fields, [cleanKey]: newFieldValue };
    updatedRecords[recIdx] = rec;
    updatePersona(persona.id, { records: updatedRecords });

    setAddingFieldRecordIdx(null);
    setNewFieldName("");
    setNewFieldValue("");
    toast.success(`Added field "${cleanKey}"`);
  };

  // JSON Text change handler
  const handleJsonChange = (recIdx: number, text: string) => {
    setJsonDrafts((prev) => ({ ...prev, [recIdx]: text }));
    const parsed = parseCommentedJson(text);
    if (parsed) {
      setJsonParseErrors((prev) => ({ ...prev, [recIdx]: null }));
      setRecordErrors((prev) => ({ ...prev, [recIdx]: null }));
      const updatedRecords = [...persona.records];
      const rec = { ...updatedRecords[recIdx]! };
      rec.fields = parsed;
      if (parsed.id) {
        rec.id = String(parsed.id);
      }
      updatedRecords[recIdx] = rec;
      updatePersona(persona.id, { records: updatedRecords });
    } else {
      setJsonParseErrors((prev) => ({ ...prev, [recIdx]: "Parsing... (check syntax or commas)" }));
    }
  };

  const handleAddTableRecord = () => {
    const defaultDb = databaseNodes[0]?.name || "Primary Database (PostgreSQL)";
    const existingTableNames = new Set(
      persona.records.map((r) => r.tableName.toLowerCase()),
    );
    const candidateTable =
      availableTables.find((t) => !existingTableNames.has(t.name.toLowerCase())) ||
      availableTables.find((t) => !t.isBuiltin) ||
      availableTables[0];

    const tblName = candidateTable?.name || "Conversations";
    const newId = generateRecordId(tblName, "postgres");
    const fields: Record<string, string | number | boolean | null | undefined> = {
      id: newId,
    };

    if (candidateTable?.columns) {
      for (const col of candidateTable.columns) {
        if (col.name === "id" || col.name === "_id") continue;
        const lowerCol = col.name.toLowerCase();
        if (
          lowerCol === "userid" ||
          lowerCol === "user_id" ||
          lowerCol === "created_by" ||
          lowerCol === "createdby"
        ) {
          const userRec = persona.records.find((r) =>
            ["user", "users"].includes((r.tableName || "").toLowerCase()),
          );
          const userIdVal = userRec?.fields?.id;
          fields[col.name] = userIdVal ? String(userIdVal) : (userRec?.id || persona.id);
        } else if (lowerCol === "emailverified") {
          fields[col.name] = true;
        } else if (lowerCol === "role") {
          fields[col.name] = "user";
        } else if (col.defaultValue && col.defaultValue !== "NOW()") {
          fields[col.name] = col.defaultValue === "true" ? true : col.defaultValue === "false" ? false : col.defaultValue;
        } else if (col.isNotNull) {
          if (col.type === "boolean") fields[col.name] = true;
          else if (col.type === "number" || col.type === "integer") fields[col.name] = 0;
          else fields[col.name] = "";
        } else {
          fields[col.name] = "";
        }
      }
    }

    const newRecord: TableSeedRecord = {
      id: newId,
      databaseName: defaultDb,
      tableName: tblName,
      fields,
    };

    updatePersona(persona.id, {
      records: [...persona.records, newRecord],
    });

    toast.success(`Added record for table "${tblName}"`);
  };

  const handleRemoveRecord = (recIdx: number) => {
    if (persona.records.length <= 1) {
      toast.error("Each persona must have at least one table record");
      return;
    }
    const updatedRecords = persona.records.filter((_, idx) => idx !== recIdx);
    updatePersona(persona.id, { records: updatedRecords });
    toast.success("Removed table record");
  };

  // Seed / Insert SINGLE record into DB
  const handleSeedSingleRecord = async (recIdx: number) => {
    const rec = persona.records[recIdx];
    if (!rec) return;

    setRecordErrors((prev) => ({ ...prev, [recIdx]: null }));
    const { name: dbName, engine, connection } = getDbConnection(rec.databaseName);
    setSeedingRecordIndex(recIdx);
    const toastId = toast.loading(`Inserting record into ${rec.tableName} (${dbName})...`);

    try {
      // Ensure emailVerified default if missing on user table
      const isUserTable = ["user", "users"].includes(rec.tableName.toLowerCase());
      const fieldsToSeed = { ...rec.fields };
      if (isUserTable && fieldsToSeed.emailVerified === undefined) {
        fieldsToSeed.emailVerified = true;
      }

      const singlePersona: TestUserPersona = {
        ...persona,
        records: [
          {
            ...rec,
            fields: fieldsToSeed,
          },
        ],
      };

      const res = await seedTestUsers({
        engine,
        connection,
        personas: [singlePersona],
      });

      if (res.success && res.insertedRecords > 0) {
        setRecordErrors((prev) => ({ ...prev, [recIdx]: null }));
        toast.success(`Inserted ${res.insertedRecords} record into "${rec.tableName}" in ${dbName}!`, {
          id: toastId,
          description: `Key id=${rec.id} is now live in the database.`,
        });
      } else {
        const detail =
          res.error ||
          (res.errors && res.errors.length > 0 ? res.errors.join("; ") : undefined) ||
          (res.insertedRecords === 0
            ? "Database executed the query but 0 rows were inserted (verify table exists and columns match schema constraints)."
            : "Unknown database insertion failure.");

        setRecordErrors((prev) => ({ ...prev, [recIdx]: detail }));
        toast.error(`Failed to insert into ${rec.tableName}:`, {
          id: toastId,
          description: detail,
          duration: 10000,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setRecordErrors((prev) => ({ ...prev, [recIdx]: errMsg }));
      toast.error(`Database error: ${errMsg}`, {
        id: toastId,
        duration: 10000,
      });
    } finally {
      setSeedingRecordIndex(null);
    }
  };

  return (
    <div className={cn("flex flex-col gap-3 pt-3 border-t border-border/50", className)}>
      {/* Section Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Table2 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Seeded Table Records ({persona.records.length})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAddTableRecord}
            className="h-6 text-[10.5px] px-2 bg-secondary/60 hover:bg-secondary text-foreground border-border/60 gap-1 cursor-pointer"
            title="Add another table record to seed for this persona"
          >
            <Plus className="w-3 h-3 text-muted-foreground" />
            <span>Add Table Record</span>
          </Button>
        </div>
      </div>

      {/* Record Cards */}
      <div className="flex flex-col gap-3">
        {persona.records.map((rec, recIdx) => {
          const matchedTable = availableTables.find(
            (t) => t.name.toLowerCase() === rec.tableName.toLowerCase(),
          );
          const tableColumns = matchedTable?.columns || [];
          const colMap = new Map<string, ColumnDef>();
          for (const c of tableColumns) {
            colMap.set(c.name.toLowerCase(), c);
          }

          // Compute merged fields list so ALL schema columns are visible
          const mergedFieldKeys = new Set<string>();
          // 1. Schema columns first
          for (const c of tableColumns) {
            mergedFieldKeys.add(c.name);
          }
          // 2. Any additional custom columns in rec.fields
          for (const k of Object.keys(rec.fields)) {
            mergedFieldKeys.add(k);
          }

          const hasMissingSchemaCols = tableColumns.some((c) => !(c.name in rec.fields));
          const currentMode = recordViewMode[recIdx] || "form";

          // Current commented JSON text
          const currentJsonText =
            jsonDrafts[recIdx] !== undefined
              ? jsonDrafts[recIdx]
              : generateCommentedJson(rec.fields, tableColumns, rec.tableName);

          return (
            <div
              key={recIdx}
              className="p-3 rounded-lg bg-background/70 border border-border/60 flex flex-col gap-2.5 text-xs shadow-xs"
            >
              {/* Top Controls: DB Selector, Table Selector, _id Badge, and Record Actions */}
              <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-border/40">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Database Select */}
                  <div className="flex items-center gap-1">
                    <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <Select
                      value={rec.databaseName}
                      onValueChange={(val) => handleDatabaseChange(recIdx, val)}
                    >
                      <SelectTrigger className="h-7 text-xs bg-background/80 w-36 border-border/60">
                        <SelectValue placeholder="Select Database" />
                      </SelectTrigger>
                      <SelectContent>
                        {databaseNodes.map((db) => (
                          <SelectItem key={db.id} value={db.name} className="text-xs">
                            {db.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Table Select */}
                  <div className="flex items-center gap-1">
                    <Table2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <Select
                      value={rec.tableName}
                      onValueChange={(val) => handleTableChange(recIdx, val)}
                    >
                      <SelectTrigger className="h-7 text-xs font-mono font-medium bg-background/80 w-36 border-border/60">
                        <SelectValue placeholder="Select Table" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTables.map((t) => (
                          <SelectItem
                            key={t.id}
                            value={t.name}
                            className="text-xs font-mono flex items-center justify-between"
                          >
                            <span>{t.name}</span>
                            {!t.isBuiltin && (
                              <span className="ml-2 text-[9px] text-muted-foreground font-mono">
                                (Entity)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Record ID Badge & Regenerate */}
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 border border-border/50 text-[11px] font-mono">
                    <span className="text-muted-foreground">_id:</span>
                    <span className="font-bold text-foreground truncate max-w-[140px]" title={rec.id}>
                      {rec.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(rec.id, `id_${recIdx}`)}
                      className="ml-1 text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Copy _id to clipboard"
                    >
                      {copiedKey === `id_${recIdx}` ? (
                        <Check className="w-3 h-3 text-foreground" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerateRecordId(recIdx)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer ml-0.5"
                      title="Regenerate valid UUID for this record"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Single Record Action Buttons */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={seedingRecordIndex === recIdx}
                    onClick={() => handleSeedSingleRecord(recIdx)}
                    className="h-7 text-[10.5px] px-2.5 bg-secondary/80 hover:bg-secondary text-foreground border-border/60 gap-1.5 cursor-pointer font-medium"
                    title={`Insert only this record into table "${rec.tableName}"`}
                  >
                    {seedingRecordIndex === recIdx ? (
                      <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                    ) : (
                      <Database className="w-3 h-3 text-muted-foreground" />
                    )}
                    <span>Insert Record</span>
                  </Button>

                  {persona.records.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveRecord(recIdx)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Delete this table record"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Sub-Header: Fields vs JSON Mode Switcher & Schema Helpers */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    Fields to insert into "{rec.tableName}":
                  </span>
                  <span className="text-[9.5px] text-muted-foreground/70 font-mono">
                    ({mergedFieldKeys.size} column{mergedFieldKeys.size === 1 ? "" : "s"})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Quick populate button if schema columns are missing */}
                  {hasMissingSchemaCols && (
                    <button
                      type="button"
                      onClick={() => handlePopulateAllSchemaFields(recIdx)}
                      className="text-[10px] text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1 cursor-pointer font-medium transition-colors"
                      title="Fill all table columns with schema default values"
                    >
                      <Sparkles className="w-3 h-3 text-muted-foreground" />
                      <span>Populate All Schema Columns</span>
                    </button>
                  )}

                  {/* Mode Switcher: Form vs JSON */}
                  <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-secondary/60 border border-border/40">
                    <button
                      type="button"
                      onClick={() => setRecordViewMode((prev) => ({ ...prev, [recIdx]: "form" }))}
                      className={cn(
                        "px-2 py-0.5 text-[10px] rounded font-medium transition-colors cursor-pointer flex items-center gap-1",
                        currentMode === "form"
                          ? "bg-background text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <LayoutGrid className="w-3 h-3 text-muted-foreground" />
                      <span>Form</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecordViewMode((prev) => ({ ...prev, [recIdx]: "json" }));
                        setJsonDrafts((prev) => ({
                          ...prev,
                          [recIdx]: generateCommentedJson(rec.fields, tableColumns, rec.tableName),
                        }));
                      }}
                      className={cn(
                        "px-2 py-0.5 text-[10px] rounded font-medium transition-colors cursor-pointer flex items-center gap-1",
                        currentMode === "json"
                          ? "bg-background text-foreground shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Code2 className="w-3 h-3 text-muted-foreground" />
                      <span>JSON (Commented)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── View 1: Form Fields View ── */}
              {currentMode === "form" ? (
                <div className="flex flex-col gap-2 pt-0.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {Array.from(mergedFieldKeys).map((fieldName) => {
                      const colDef = colMap.get(fieldName.toLowerCase());
                      const isId = fieldName === "id" || fieldName === "_id" || colDef?.isPrimaryKey;
                      const isNotNull = Boolean(colDef?.isNotNull);
                      const isUnique = Boolean(colDef?.isUnique);
                      const isForeignKey = Boolean(colDef?.isForeignKey);
                      const colType = colDef?.type || (fieldName === "id" ? "uuid" : "text");

                      // Current value (or default if not yet set in rec.fields)
                      const rawValue = rec.fields[fieldName];
                      const fieldValue =
                        rawValue !== undefined
                          ? rawValue
                          : colDef?.defaultValue && colDef.defaultValue !== "NOW()"
                          ? colDef.defaultValue
                          : isNotNull && colType === "boolean"
                          ? true
                          : "";

                      const isBooleanField =
                        colType.toLowerCase().includes("bool") || typeof rawValue === "boolean";

                      return (
                        <div
                          key={fieldName}
                          className="flex flex-col gap-1 p-2 rounded-md bg-secondary/30 border border-border/40 focus-within:border-zinc-500/60 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-1 text-[10.5px]">
                            {/* Field Name + Badges (PK, NN, UQ, FK, Type) */}
                            <div className="flex items-center gap-1.5 flex-wrap font-mono">
                              <span className="font-semibold text-foreground">{fieldName}</span>

                              {/* Column Type */}
                              <span className="text-[9px] font-mono uppercase text-muted-foreground/80 px-1.5 py-0.5 rounded bg-secondary/70 border border-border/50">
                                {colType}
                              </span>

                              {/* Constraints Badges (Crisp Monochrome) */}
                              {isId && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-zinc-700/80 text-zinc-100 border border-zinc-600/80"
                                  title="Primary Key"
                                >
                                  PK
                                </span>
                              )}
                              {isNotNull && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase bg-zinc-800 text-zinc-300 border border-zinc-700"
                                  title="Not Null (Required)"
                                >
                                  NN
                                </span>
                              )}
                              {isUnique && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase bg-zinc-800 text-zinc-300 border border-zinc-700"
                                  title="Unique constraint"
                                >
                                  UQ
                                </span>
                              )}
                              {isForeignKey && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-0.5"
                                  title="Foreign Key"
                                >
                                  <Link2 className="w-2.5 h-2.5 text-zinc-400" /> FK
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5">
                              {fieldValue !== "" && fieldValue !== null && fieldValue !== undefined && (
                                <button
                                  type="button"
                                  onClick={() => handleCopy(String(fieldValue), `${recIdx}_${fieldName}`)}
                                  className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                                  title={`Copy ${fieldName}`}
                                >
                                  {copiedKey === `${recIdx}_${fieldName}` ? (
                                    <Check className="w-2.5 h-2.5 text-foreground" />
                                  ) : (
                                    <Copy className="w-2.5 h-2.5" />
                                  )}
                                </button>
                              )}

                              {!isId && !isNotNull && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveField(recIdx, fieldName)}
                                  className="text-muted-foreground hover:text-destructive p-0.5 cursor-pointer"
                                  title={`Remove ${fieldName}`}
                                >
                                  <Trash className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Field Input (Checkbox / Toggle for booleans, text input for others) */}
                          {isBooleanField ? (
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
                                onClick={() => handleFieldChange(recIdx, fieldName, true)}
                                className={cn(
                                  "px-2.5 py-1 text-xs font-mono font-medium rounded border cursor-pointer transition-colors",
                                  fieldValue === true || String(fieldValue).toLowerCase() === "true"
                                    ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-200 dark:text-zinc-900 border-zinc-300 dark:border-white font-semibold shadow-xs"
                                    : "bg-background text-muted-foreground border-border/60 hover:text-foreground",
                                )}
                              >
                                true
                              </button>
                              <button
                                type="button"
                                onClick={() => handleFieldChange(recIdx, fieldName, false)}
                                className={cn(
                                  "px-2.5 py-1 text-xs font-mono font-medium rounded border cursor-pointer transition-colors",
                                  fieldValue === false || String(fieldValue).toLowerCase() === "false"
                                    ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-200 dark:text-zinc-900 border-zinc-300 dark:border-white font-semibold shadow-xs"
                                    : "bg-background text-muted-foreground border-border/60 hover:text-foreground",
                                )}
                              >
                                false
                              </button>
                              {isNotNull && (
                                <span className="text-[10px] text-muted-foreground/70 font-mono ml-1">
                                  (required NOT NULL)
                                </span>
                              )}
                            </div>
                          ) : (
                            <Input
                              value={fieldValue === null || fieldValue === undefined ? "" : String(fieldValue)}
                              onChange={(e) => handleFieldChange(recIdx, fieldName, e.target.value)}
                              placeholder={colDef?.defaultValue || `Enter ${fieldName}...`}
                              className={cn(
                                "h-7 text-xs font-mono bg-background/80 border-border/50 focus-visible:ring-1 focus-visible:ring-zinc-400",
                                fieldName === "token" && "truncate pr-2",
                              )}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Custom Field Inline Toolbar */}
                  {addingFieldRecordIdx === recIdx ? (
                    <div className="mt-2 p-2 rounded-md bg-secondary/50 border border-border/60 flex items-center gap-2 flex-wrap">
                      <Input
                        value={newFieldName}
                        onChange={(e) => setNewFieldName(e.target.value)}
                        placeholder="Column name (e.g. status)"
                        className="h-7 text-xs font-mono bg-background w-36 border-border/60"
                      />

                      <Input
                        value={newFieldValue}
                        onChange={(e) => setNewFieldValue(e.target.value)}
                        placeholder="Column value"
                        className="h-7 text-xs font-mono bg-background flex-1 min-w-[120px] border-border/60"
                      />

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddField(recIdx)}
                        className="h-7 text-xs px-2.5 bg-foreground text-background hover:bg-foreground/90 gap-1 font-medium cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAddingFieldRecordIdx(null);
                          setNewFieldName("");
                          setNewFieldValue("");
                        }}
                        className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingFieldRecordIdx(recIdx);
                          setNewFieldName("");
                          setNewFieldValue("");
                        }}
                        className="text-[10.5px] font-mono text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1 cursor-pointer pt-0.5 transition-colors"
                      >
                        <Plus className="w-3 h-3 text-muted-foreground" />
                        <span>Add custom field or column</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* ── View 2: Commented JSON View ── */
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                    <span className="font-mono flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>JSON with Column Types & Constraints (PK, NN, UQ, FK):</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePopulateAllSchemaFields(recIdx)}
                        className="text-[10.5px] text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors"
                        title="Ensure all table columns are in JSON"
                      >
                        Reset with All Schema Columns
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(currentJsonText, `json_${recIdx}`)}
                        className="text-[10.5px] text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 transition-colors"
                      >
                        {copiedKey === `json_${recIdx}` ? (
                          <Check className="w-2.5 h-2.5 text-foreground" />
                        ) : (
                          <Copy className="w-2.5 h-2.5" />
                        )}
                        <span>Copy JSON</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={currentJsonText}
                    onChange={(e) => handleJsonChange(recIdx, e.target.value)}
                    rows={12}
                    className="w-full font-mono text-[11px] leading-relaxed p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 text-zinc-200 focus:border-zinc-500 focus:outline-none resize-y selection:bg-zinc-800"
                    placeholder="Edit JSON..."
                    spellCheck={false}
                  />

                  {jsonParseErrors[recIdx] && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      ⚠️ {jsonParseErrors[recIdx]}
                    </span>
                  )}
                </div>
              )}

              {/* Inline Insertion Error Alert */}
              {recordErrors[recIdx] && (
                <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex flex-col gap-1.5 font-mono">
                  <div className="flex items-center justify-between font-semibold font-sans text-destructive">
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
                      <span>Database Insert Error ("{rec.tableName}"):</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setRecordErrors((prev) => ({ ...prev, [recIdx]: null }))}
                      className="text-[10.5px] text-destructive/80 hover:text-destructive underline cursor-pointer font-sans"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="text-[11px] whitespace-pre-wrap break-all leading-relaxed p-2 rounded bg-background/70 border border-destructive/20 text-destructive font-mono select-all">
                    {recordErrors[recIdx]}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
