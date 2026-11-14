"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
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
  KeyRound,
  Link2,
  Sparkles,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  TestUserPersona,
  TableSeedRecord,
  generateRecordId,
  toValidUuid,
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
  isUnique?: boolean;
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

export function PersonaRecordsEditor({ persona, className }: PersonaRecordsEditorProps) {
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const updatePersona = useTestUsersStore((s) => s.updatePersona);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [seedingRecordIndex, setSeedingRecordIndex] = useState<number | null>(null);

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

  // 2. Discover all tables (canvas entity nodes + built-in auth tables)
  const availableTables = useMemo<TableNodeInfo[]>(() => {
    const builtin: TableNodeInfo[] = [
      {
        id: "builtin-user",
        name: "user",
        databaseNodeId: databaseNodes[0]?.id || "primary-postgres",
        isBuiltin: true,
        columns: [
          { name: "id", type: "string", isPrimaryKey: true, defaultValue: "" },
          { name: "name", type: "string", defaultValue: "" },
          { name: "email", type: "string", defaultValue: "" },
          { name: "role", type: "string", defaultValue: "user" },
        ],
      },
      {
        id: "builtin-session",
        name: "session",
        databaseNodeId: databaseNodes[0]?.id || "primary-postgres",
        isBuiltin: true,
        columns: [
          { name: "id", type: "string", isPrimaryKey: true, defaultValue: "" },
          { name: "userId", type: "string", defaultValue: "" },
          { name: "token", type: "string", defaultValue: "" },
          { name: "expiresAt", type: "string", defaultValue: "2099-01-01T00:00:00.000Z" },
        ],
      },
      {
        id: "builtin-account",
        name: "account",
        databaseNodeId: databaseNodes[0]?.id || "primary-postgres",
        isBuiltin: true,
        columns: [
          { name: "id", type: "string", isPrimaryKey: true, defaultValue: "" },
          { name: "userId", type: "string", defaultValue: "" },
          { name: "providerId", type: "string", defaultValue: "credential" },
          { name: "accountId", type: "string", defaultValue: "" },
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
          isPrimaryKey: Boolean(c.isPrimaryKey),
          isUnique: Boolean(c.isUnique),
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
              : [{ name: "id", type: "string", isPrimaryKey: true, defaultValue: "" }],
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

  // Helper to resolve live database connection config for a given database name or id
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
      connectionStringEnv: data?.connectionStringEnv,
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

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Change database for a record
  const handleDatabaseChange = (recIdx: number, newDbName: string) => {
    const updatedRecords = [...persona.records];
    const rec = { ...updatedRecords[recIdx]! };
    rec.databaseName = newDbName;
    updatedRecords[recIdx] = rec;
    updatePersona(persona.id, { records: updatedRecords });
    toast.success(`Updated database to ${newDbName}`);
  };

  // Change table for a record
  const handleTableChange = (recIdx: number, newTableName: string) => {
    const updatedRecords = [...persona.records];
    const existingRec = updatedRecords[recIdx]!;
    const matchedTable = availableTables.find(
      (t) => t.name.toLowerCase() === newTableName.toLowerCase(),
    );

    const newId = generateRecordId(newTableName, "postgres");
    const newFields: Record<string, string | number | boolean | null | undefined> = {
      id: newId,
    };

    // Prepopulate known columns from schema
    if (matchedTable?.columns) {
      for (const col of matchedTable.columns) {
        if (col.name === "id" || col.name === "_id") continue;
        const lowerCol = col.name.toLowerCase();

        // Smart link user/creator foreign keys
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
        } else if (lowerCol === "expiresat") {
          newFields[col.name] = "2099-01-01T00:00:00.000Z";
        } else if (lowerCol === "role") {
          newFields[col.name] = persona.name.toLowerCase().includes("admin") ? "admin" : "user";
        } else if (lowerCol === "name") {
          newFields[col.name] = persona.name;
        } else if (lowerCol === "email") {
          newFields[col.name] = `${persona.name.toLowerCase().replace(/\s+/g, ".")}@example.com`;
        } else {
          newFields[col.name] = col.defaultValue || "";
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
    toast.success(`Updated table to "${newTableName}"`);
  };

  // Regenerate Record ID
  const handleRegenerateRecordId = (recIdx: number) => {
    const updatedRecords = [...persona.records];
    const rec = { ...updatedRecords[recIdx]! };
    const newId = generateRecordId(rec.tableName, "postgres");
    const oldId = rec.id;
    rec.id = newId;
    rec.fields = { ...rec.fields, id: newId };
    updatedRecords[recIdx] = rec;

    // If user table, update any session.userId that pointed to oldId
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

  // Update a field value
  const handleFieldChange = (
    recIdx: number,
    fieldName: string,
    value: string,
  ) => {
    const updatedRecords = [...persona.records];
    const rec = { ...updatedRecords[recIdx]! };
    const oldVal = rec.fields[fieldName];
    rec.fields = { ...rec.fields, [fieldName]: value };

    // Sync id if field is 'id'
    if (fieldName === "id") {
      rec.id = value;
      // If user table, cascade to session userId
      if (["user", "users"].includes(rec.tableName.toLowerCase())) {
        for (let i = 0; i < updatedRecords.length; i++) {
          const r = updatedRecords[i]!;
          if (["session", "sessions", "account"].includes(r.tableName.toLowerCase())) {
            if (r.fields.userId === oldVal || !r.fields.userId) {
              updatedRecords[i] = {
                ...r,
                fields: { ...r.fields, userId: value },
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
      updatedToken = value;
    }

    updatedRecords[recIdx] = rec;

    updatePersona(persona.id, {
      records: updatedRecords,
      ...(updatedToken !== persona.activeAuthToken ? { activeAuthToken: updatedToken } : {}),
    });
  };

  // Remove a field from record
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

  // Add field to record
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

  // Add a new table record to this persona
  const handleAddTableRecord = () => {
    const defaultDb = databaseNodes[0]?.name || "Primary Database (PostgreSQL)";
    // Pick the first table not yet in this persona, or default to entity or user
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
        } else {
          fields[col.name] = col.defaultValue || "";
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

  // Remove a table record from persona
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

    const { name: dbName, engine, connection } = getDbConnection(rec.databaseName);
    setSeedingRecordIndex(recIdx);
    const toastId = toast.loading(`Inserting record into ${rec.tableName} (${dbName})...`);

    try {
      // Create single-record persona fixture
      const singlePersona: TestUserPersona = {
        ...persona,
        records: [rec],
      };

      const res = await seedTestUsers({
        engine,
        connection,
        personas: [singlePersona],
      });

      if (res.success) {
        toast.success(`Inserted 1 record into "${rec.tableName}" in ${dbName}!`, {
          id: toastId,
          description: `Key id=${rec.id} is now live in the database.`,
        });
      } else {
        toast.error(`Failed to insert into ${rec.tableName}: ${res.error || "DB error"}`, {
          id: toastId,
          description: "Verify that the table exists and DB is reachable.",
        });
      }
    } catch (err) {
      toast.error(`Database error: ${err instanceof Error ? err.message : String(err)}`, {
        id: toastId,
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
          <Table2 className="w-3.5 h-3.5 text-indigo-400" />
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
            <Plus className="w-3 h-3 text-indigo-400" />
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
          const availableUnusedCols = (matchedTable?.columns || []).filter(
            (c) => !(c.name in rec.fields),
          );
          const isUserRecord = ["user", "users"].includes(rec.tableName.toLowerCase());
          const isSessionRecord = ["session", "sessions"].includes(rec.tableName.toLowerCase());

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
                              <span className="ml-2 text-[9px] text-indigo-400 font-sans">
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
                        <Check className="w-3 h-3 text-emerald-500" />
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
                    variant="ghost"
                    disabled={seedingRecordIndex === recIdx}
                    onClick={() => handleSeedSingleRecord(recIdx)}
                    className="h-7 text-[10.5px] px-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/25 gap-1 cursor-pointer font-medium"
                    title={`Insert only this record into table "${rec.tableName}"`}
                  >
                    {seedingRecordIndex === recIdx ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Database className="w-3 h-3" />
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

              {/* Editable Fields Grid */}
              <div className="flex flex-col gap-1.5 pt-0.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  <span>Fields to Insert into "{rec.tableName}":</span>
                  <span className="font-mono text-[9px] lowercase text-muted-foreground/70">
                    {Object.keys(rec.fields).length} field(s) • click to edit value
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  {Object.entries(rec.fields).map(([fieldName, fieldValue]) => {
                    const isId = fieldName === "id" || fieldName === "_id";
                    const isToken = fieldName === "token";
                    const isFk =
                      fieldName.toLowerCase().endsWith("id") ||
                      fieldName.toLowerCase().includes("user") ||
                      fieldName.toLowerCase().includes("created_by");

                    return (
                      <div
                        key={fieldName}
                        className="flex flex-col gap-1 p-1.5 rounded-md bg-secondary/30 border border-border/40 focus-within:border-indigo-500/50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-1 text-[10.5px]">
                          <div className="flex items-center gap-1 font-mono text-muted-foreground">
                            {isId ? (
                              <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                PK
                              </span>
                            ) : isFk ? (
                              <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-indigo-500/15 text-indigo-500 flex items-center gap-0.5">
                                <Link2 className="w-2.5 h-2.5" /> FK
                              </span>
                            ) : null}
                            <span className="font-semibold text-foreground truncate">{fieldName}</span>
                          </div>

                          <div className="flex items-center gap-0.5">
                            {fieldValue && (
                              <button
                                type="button"
                                onClick={() => handleCopy(String(fieldValue), `${recIdx}_${fieldName}`)}
                                className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                                title={`Copy ${fieldName}`}
                              >
                                {copiedKey === `${recIdx}_${fieldName}` ? (
                                  <Check className="w-2.5 h-2.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-2.5 h-2.5" />
                                )}
                              </button>
                            )}

                            {!isId && (
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

                        <Input
                          value={fieldValue === null || fieldValue === undefined ? "" : String(fieldValue)}
                          onChange={(e) => handleFieldChange(recIdx, fieldName, e.target.value)}
                          placeholder={`Enter ${fieldName}...`}
                          className={cn(
                            "h-7 text-xs font-mono bg-background/80 border-border/50 focus-visible:ring-1 focus-visible:ring-indigo-500",
                            isToken && "truncate pr-2",
                          )}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Add Field Toolbar */}
                {addingFieldRecordIdx === recIdx ? (
                  <div className="mt-2 p-2 rounded-md bg-secondary/50 border border-indigo-500/30 flex items-center gap-2 flex-wrap">
                    {/* If there are unused schema columns, offer quick pick dropdown */}
                    {availableUnusedCols.length > 0 ? (
                      <Select
                        value={newFieldName}
                        onValueChange={(val) => {
                          setNewFieldName(val);
                          const colDef = availableUnusedCols.find((c) => c.name === val);
                          if (colDef?.defaultValue) {
                            setNewFieldValue(colDef.defaultValue);
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs bg-background w-32 font-mono">
                          <SelectValue placeholder="Pick column" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableUnusedCols.map((col) => (
                            <SelectItem key={col.name} value={col.name} className="text-xs font-mono">
                              {col.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}

                    <Input
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder="Column name (e.g. status)"
                      className="h-7 text-xs font-mono bg-background w-32"
                    />

                    <Input
                      value={newFieldValue}
                      onChange={(e) => setNewFieldValue(e.target.value)}
                      placeholder="Column value"
                      className="h-7 text-xs font-mono bg-background flex-1 min-w-[120px]"
                    />

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddField(recIdx)}
                      className="h-7 text-xs px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
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
                      className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
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
                        if (availableUnusedCols.length > 0) {
                          setNewFieldName(availableUnusedCols[0]?.name || "");
                          setNewFieldValue(availableUnusedCols[0]?.defaultValue || "");
                        } else {
                          setNewFieldName("");
                          setNewFieldValue("");
                        }
                      }}
                      className="text-[10.5px] font-mono text-indigo-500 hover:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer pt-0.5"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add custom field or column</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

