"use client";

import React, { useState, useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@workspace/ui/components/dialog";
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
  Plus,
  Trash,
  Copy,
  Check,
  Database,
  Table2,
  KeyRound,
  Sparkles,
  Link2,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  TestUserPersona,
  TableSeedRecord,
  generateRecordId,
  generatePersonaId,
  toValidUuid,
} from "./types";
import {
  generateRealBearerJwtSync,
  generateRealSessionToken,
  inspectJwt,
  isRealJwt,
  DEFAULT_AUTH_SECRET,
} from "./tokenGenerator";
import { seedTestUsers } from "@/lib/services/databaseService";
import { toast } from "sonner";
import { cn } from "@workspace/ui/lib/utils";

interface TestUserPersonaEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPersona?: TestUserPersona | null;
  onSave: (persona: TestUserPersona) => void;
}

interface ColumnDef {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
}

interface TableNodeInfo {
  id: string;
  name: string;
  databaseNodeId: string;
  columns: ColumnDef[];
}

export function TestUserPersonaEditor({
  open,
  onOpenChange,
  initialPersona,
  onSave,
}: TestUserPersonaEditorProps) {
  const allNodes = useBackendCanvasStore((s) => s.nodes);

  // 1. Discover all databases in the project
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
      name: d.data?.label || "Database",
      engine: d.data?.dbEngine || "postgres",
    }));
  }, [allNodes]);

  // 2. Discover all table / entity nodes
  const tableNodes = useMemo<TableNodeInfo[]>(() => {
    return allNodes
      .filter((n) => n.type === "entity")
      .map((t) => {
        const rawCols = t.data?.columns || [];
        const columns: ColumnDef[] = rawCols.map((c) => ({
          name: c.name || "field",
          type: c.type || "string",
          isPrimaryKey: Boolean(c.isPrimaryKey),
          isUnique: Boolean(c.isUnique),
          defaultValue: "",
        }));

        // Fallback default columns if empty
        const effectiveColumns: ColumnDef[] =
          columns.length > 0
            ? columns
            : [
                { name: "id", type: "string", isPrimaryKey: true, defaultValue: "" },
                { name: "name", type: "string", defaultValue: "" },
                { name: "email", type: "string", defaultValue: "" },
                { name: "role", type: "string", defaultValue: "" },
              ];

        return {
          id: t.id,
          name: t.data?.label || "table",
          databaseNodeId: t.data?.databaseId || t.data?.parentId || "primary-sqlite",
          columns: effectiveColumns,
        };
      });
  }, [allNodes]);

  // Common built-in table templates if user hasn't defined tables on canvas yet
  const fallbackTables = useMemo<TableNodeInfo[]>(() => {
    if (tableNodes.length > 0) return tableNodes;
    return [
      {
        id: "tbl-user",
        name: "user",
        databaseNodeId: "primary-sqlite",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true, defaultValue: "" },
          { name: "name", type: "string", defaultValue: "" },
          { name: "email", type: "string", defaultValue: "" },
          { name: "role", type: "string", defaultValue: "" },
        ],
      },
      {
        id: "tbl-session",
        name: "session",
        databaseNodeId: "primary-sqlite",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true, defaultValue: "" },
          { name: "userId", type: "string", defaultValue: "" },
          { name: "token", type: "string", defaultValue: "" },
          { name: "expiresAt", type: "string", defaultValue: "2099-01-01T00:00:00.000Z" },
        ],
      },
      {
        id: "tbl-account",
        name: "account",
        databaseNodeId: "primary-sqlite",
        columns: [
          { name: "id", type: "string", isPrimaryKey: true, defaultValue: "" },
          { name: "userId", type: "string", defaultValue: "" },
          { name: "providerId", type: "string", defaultValue: "" },
          { name: "password", type: "string", defaultValue: "" },
        ],
      },
    ];
  }, [tableNodes]);

  // Form State
  const [personaName, setPersonaName] = useState(initialPersona?.name || "");
  const [description, setDescription] = useState(initialPersona?.description || "");
  const [activeAuthToken, setActiveAuthToken] = useState(initialPersona?.activeAuthToken || "");
  const [records, setRecords] = useState<TableSeedRecord[]>(
    initialPersona?.records && initialPersona.records.length > 0
      ? initialPersona.records
      : [
          {
            id: generateRecordId("user"),
            databaseName: "Primary Database (SQLite)",
            tableName: "user",
            fields: {
              name: "Test User",
              email: "testuser@example.com",
              role: "user",
            },
          },
        ],
  );

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync with initialPersona when modal opens
  React.useEffect(() => {
    if (open) {
      if (initialPersona) {
        setPersonaName(initialPersona.name);
        setDescription(initialPersona.description || "");
        setActiveAuthToken(initialPersona.activeAuthToken || "");
        setRecords(initialPersona.records || []);
      } else {
        const userId = generateRecordId("user");
        const sessId = generateRecordId("session");
        const defaultEmail = "alice@company.com";
        const defaultRole = "admin";

        const realJwt = generateRealBearerJwtSync({
          userId,
          name: "Alice Admin",
          email: defaultEmail,
          role: defaultRole,
          sessionId: sessId,
        });

        setPersonaName("");
        setDescription("");
        setActiveAuthToken(realJwt);
        setRecords([
          {
            id: userId,
            databaseName: "Primary Database (PostgreSQL)",
            tableName: "user",
            fields: {
              id: userId,
              name: "Alice Admin",
              email: defaultEmail,
              role: defaultRole,
            },
          },
        ]);
      }
    }
  }, [open, initialPersona]);

  // Helper to copy ID
  const handleCopyId = (idToCopy: string) => {
    navigator.clipboard.writeText(idToCopy);
    setCopiedId(idToCopy);
    toast.success(`Copied record _id: ${idToCopy}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Add new table record
  const handleAddRecord = () => {
    const defaultDb = databaseNodes[0]?.name || "Primary Database (PostgreSQL)";
    const defaultTbl = fallbackTables[0]?.name || "user";
    const newId = generateRecordId(defaultTbl);

    setRecords([
      ...records,
      {
        id: newId,
        databaseName: defaultDb,
        tableName: defaultTbl,
        fields: {
          id: newId,
        },
      },
    ]);
  };

  // Remove table record
  const handleRemoveRecord = (index: number) => {
    setRecords(records.filter((_, i) => i !== index));
  };

  // Update record fields
  const handleRecordFieldChange = (
    recordIndex: number,
    fieldName: string,
    value: string | number | boolean | null,
  ) => {
    setRecords((prev) => {
      const copy = [...prev];
      const rec = { ...copy[recordIndex]! };
      rec.fields = { ...rec.fields, [fieldName]: value };

      // Auto-update auth token if session token field is changed
      if (fieldName === "token" && value) {
        setActiveAuthToken(String(value));
      }

      copy[recordIndex] = rec;
      return copy;
    });
  };

  // Switch Database for record
  const handleDatabaseChange = (recordIndex: number, dbName: string) => {
    setRecords((prev) => {
      const copy = [...prev];
      copy[recordIndex] = {
        ...copy[recordIndex]!,
        databaseName: dbName,
      };
      return copy;
    });
  };

  // Switch Table for record
  const handleTableChange = (recordIndex: number, tableName: string) => {
    setRecords((prev) => {
      const copy = [...prev];
      const newId = generateRecordId(tableName);
      copy[recordIndex] = {
        ...copy[recordIndex]!,
        id: newId,
        tableName,
        fields: {
          id: newId,
        },
      };
      return copy;
    });
  };

  const [isSeedingDb, setIsSeedingDb] = useState(false);

  // Save Persona
  const handleSave = async (alsoSeedDb: boolean = false) => {
    if (!personaName.trim()) {
      toast.error("Please provide a Test User / Persona Name");
      return;
    }

    const persona: TestUserPersona = {
      id: initialPersona?.id || generatePersonaId(),
      name: personaName.trim(),
      description: description.trim() || undefined,
      activeAuthToken: activeAuthToken.trim() || undefined,
      records: records.map((r) => ({
        ...r,
        fields: {
          ...r.fields,
          id: r.fields.id || r.id,
        },
      })),
      createdAt: initialPersona?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(persona);

    if (alsoSeedDb) {
      const dbs = allNodes.filter((n) => n.type === "database");
      const targetDb = dbs[0] || null;
      const dbData = targetDb?.data;

      const engine = (dbData?.dbEngine || "postgres").toLowerCase();
      const connection = {
        host: dbData?.host,
        port: dbData?.port,
        database: dbData?.database,
        user: dbData?.user || dbData?.username,
        password: dbData?.password,
        connectionString: dbData?.connectionString || dbData?.connectionStringPooled,
        connectionStringEnv: dbData?.connectionStringEnv,
        connectionStringPooled: dbData?.connectionStringPooled,
        connectionStringPooledEnv: dbData?.connectionStringPooledEnv,
        sslMode: dbData?.sslMode,
        provider: dbData?.provider,
        dbFilePath: dbData?.dbFilePath,
        dbFilePathEnv: dbData?.dbFilePathEnv,
      };
      const dbName = targetDb?.data?.label || targetDb?.data?.name || "Primary Database";

      setIsSeedingDb(true);
      const toastId = toast.loading(`Inserting ${persona.name} into ${dbName}...`);
      try {
        const res = await seedTestUsers({
          engine,
          connection,
          personas: [persona],
        });
        if (res.success) {
          toast.success(
            `Inserted ${res.insertedRecords} record(s) for "${persona.name}" into ${dbName}!`,
            { id: toastId },
          );
        } else {
          toast.error(`Database seeding error: ${res.error}`, { id: toastId });
        }
      } catch (err) {
        toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          id: toastId,
        });
      } finally {
        setIsSeedingDb(false);
      }
    } else {
      toast.success(`Saved test persona: ${persona.name}`);
    }

    onOpenChange(false);
  };

  // List of all generated record IDs available for Foreign Key referencing
  const availableForeignKeys = useMemo(() => {
    return records.map((r) => ({
      id: r.id,
      tableName: r.tableName,
    }));
  }, [records]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col font-sans p-0 gap-0 overflow-hidden bg-background">
        <DialogHeader className="p-4 border-b border-border/50 bg-secondary/20">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span>{initialPersona ? "Edit Test User Persona" : "Create New Test User Persona"}</span>
          </DialogTitle>
          <span className="text-xs text-muted-foreground">
            Seed multi-table database records and generate linked foreign keys for testing.
          </span>
        </DialogHeader>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Persona Header Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-card/40 border border-border/50">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Persona Name *</Label>
              <Input
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                placeholder="e.g. Admin - Acme Tenant"
                className="h-8 text-xs bg-background"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2 p-3 rounded-lg bg-background/50 border border-border/60">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Active Bearer Token (for Postman & Testing)</span>
                </Label>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const userRec = records.find((r) => {
                        const l = (r.tableName || "").toLowerCase();
                        return l === "user" || l === "users";
                      }) || records[0];
                      const rawUserId = userRec?.fields?.id ? String(userRec.fields.id) : undefined;
                      const userId = toValidUuid(rawUserId);
                      const email = userRec?.fields?.email
                        ? String(userRec.fields.email)
                        : `${(personaName || "user").toLowerCase().replace(/\s+/g, ".")}@example.com`;
                      const role = userRec?.fields?.role
                        ? String(userRec.fields.role)
                        : personaName.toLowerCase().includes("admin")
                        ? "admin"
                        : "user";
                      const sessRec = records.find((r) => {
                        const l = (r.tableName || "").toLowerCase();
                        return l === "session" || l === "sessions";
                      });
                      const rawSessId = sessRec?.fields?.id ? String(sessRec.fields.id) : undefined;
                      const sessId = toValidUuid(rawSessId);

                      const freshJwt = generateRealBearerJwtSync({
                        userId,
                        name: personaName || "Test Persona",
                        email,
                        role,
                        sessionId: sessId,
                      });

                      setActiveAuthToken(freshJwt);
                      setRecords((prev) =>
                        prev.map((r) =>
                          r.tableName.toLowerCase() === "session"
                            ? { ...r, fields: { ...r.fields, token: freshJwt } }
                            : r,
                        ),
                      );
                      toast.success("Generated Real HS256 Bearer JWT");
                    }}
                    className="h-6 text-[10.5px] px-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 gap-1 font-medium cursor-pointer"
                    title="Generate a signed RFC 7519 HS256 JWT using persona details"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    <span>Generate Real JWT</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const sessToken = generateRealSessionToken();
                      setActiveAuthToken(sessToken);
                      setRecords((prev) =>
                        prev.map((r) =>
                          r.tableName.toLowerCase() === "session"
                            ? { ...r, fields: { ...r.fields, token: sessToken } }
                            : r,
                        ),
                      );
                      toast.success("Generated Better Auth Session Token");
                    }}
                    className="h-6 text-[10.5px] px-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <span>Session Token</span>
                  </Button>
                </div>
              </div>

              <div className="relative flex items-center">
                <Input
                  value={activeAuthToken}
                  onChange={(e) => {
                    const val = e.target.value;
                    setActiveAuthToken(val);
                    setRecords((prev) =>
                      prev.map((r) =>
                        r.tableName.toLowerCase() === "session"
                          ? { ...r, fields: { ...r.fields, token: val } }
                          : r,
                      ),
                    );
                  }}
                  placeholder="Paste or generate real bearer token (eyJ...)"
                  className="h-8 text-xs font-mono bg-background"
                />
              </div>

              {/* Decoded Claims Preview */}
              {inspectJwt(activeAuthToken) && (
                <div className="p-2.5 rounded bg-secondary/30 border border-border/40 text-[10.5px] font-mono flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Valid HS256 JWT Signature</span>
                    </span>
                    <span>Expires: {inspectJwt(activeAuthToken)?.expiresAtFormatted}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/30">
                    <span className="text-muted-foreground">
                      sub: <strong className="text-foreground">{String(inspectJwt(activeAuthToken)?.payload.sub || "")}</strong>
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      email: <strong className="text-foreground">{String(inspectJwt(activeAuthToken)?.payload.email || "")}</strong>
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      role: <strong className="text-foreground uppercase">{String(inspectJwt(activeAuthToken)?.payload.role || "user")}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Multi-Table Record Fixtures */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Database Table Records ({records.length})
                </span>
              </div>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleAddRecord}
                className="h-7 text-xs px-2.5 bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Table Record</span>
              </Button>
            </div>

            {records.map((rec, recIndex) => {
              // Get table columns for current record's table
              const matchedTable = fallbackTables.find((t) => t.name.toLowerCase() === rec.tableName.toLowerCase());
              const columns = matchedTable?.columns || [
                { name: "name", type: "string" },
                { name: "email", type: "string" },
                { name: "role", type: "string" },
              ];

              return (
                <div
                  key={recIndex}
                  className="flex flex-col gap-3 p-3.5 rounded-xl border border-border/60 bg-card/40 shadow-sm"
                >
                  {/* Record Header (Database Selector & Table Selector & Generated _id) */}
                  <div className="flex items-center justify-between border-b border-border/40 pb-2.5 gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Step 2.1: Database Selector */}
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5 text-muted-foreground" />
                        <Select
                          value={rec.databaseName}
                          onValueChange={(val) => handleDatabaseChange(recIndex, val)}
                        >
                          <SelectTrigger className="h-7 text-xs bg-background w-44 border-border/60">
                            <SelectValue placeholder="Select Database" />
                          </SelectTrigger>
                          <SelectContent>
                            {databaseNodes
                              .filter((db) => Boolean(db && db.name && db.name.trim()))
                              .map((db) => (
                                <SelectItem key={db.id} value={db.name} className="text-xs">
                                  {db.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Step 2.2: Table Selector (Filtered) */}
                      <div className="flex items-center gap-1.5">
                        <Table2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <Select
                          value={rec.tableName}
                          onValueChange={(val) => handleTableChange(recIndex, val)}
                        >
                          <SelectTrigger className="h-7 text-xs bg-background w-36 font-mono font-medium border-border/60">
                            <SelectValue placeholder="Select Table" />
                          </SelectTrigger>
                          <SelectContent>
                            {fallbackTables
                              .filter((t) => Boolean(t && t.name && t.name.trim()))
                              .map((t) => (
                                <SelectItem key={t.id} value={t.name} className="text-xs font-mono">
                                  {t.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Generated _id Badge with Copy Button */}
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 border border-border/50 text-[11px] font-mono">
                        <span className="text-muted-foreground">_id:</span>
                        <span className="font-bold text-foreground">{rec.id}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyId(rec.id)}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          title="Copy _id to use as Foreign Key in other tables"
                        >
                          {copiedId === rec.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {records.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveRecord(recIndex)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Dynamic Column Inputs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                    {columns
                      .filter((col) => col.name !== "id" && col.name !== "_id")
                      .map((col) => {
                        const isForeignKeyField =
                          col.name.toLowerCase().endsWith("id") ||
                          col.name.toLowerCase().includes("user") ||
                          col.name.toLowerCase().includes("org");

                        const val = rec.fields[col.name] ?? "";

                        return (
                          <div key={col.name} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px] font-mono text-muted-foreground truncate">
                                {col.name}
                              </Label>
                              {isForeignKeyField && availableForeignKeys.length > 1 && (
                                <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                  <Link2 className="w-2.5 h-2.5" /> FK
                                </span>
                              )}
                            </div>

                            {/* If field might be FK, allow picking previous record _id */}
                            {isForeignKeyField && availableForeignKeys.some((k) => k.id !== rec.id) ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={val === null || val === undefined ? "" : String(val)}
                                  onChange={(e) =>
                                    handleRecordFieldChange(recIndex, col.name, e.target.value)
                                  }
                                  placeholder={col.defaultValue || `value`}
                                  className="h-7 text-xs font-mono bg-background flex-1"
                                />
                                <Select
                                  value=""
                                  onValueChange={(fkVal) =>
                                    handleRecordFieldChange(recIndex, col.name, fkVal)
                                  }
                                >
                                  <SelectTrigger className="h-7 w-7 p-0 bg-secondary/60 border-border/50 text-muted-foreground" title="Insert FK from existing record">
                                    <Link2 className="w-3 h-3 mx-auto" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableForeignKeys
                                      .filter((k) => Boolean(k && k.id && k.id.trim() && k.id !== rec.id))
                                      .map((k) => (
                                        <SelectItem key={k.id} value={k.id} className="text-xs font-mono">
                                          {k.tableName}._id ({k.id})
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : (
                              <Input
                                value={val === null || val === undefined ? "" : String(val)}
                                onChange={(e) =>
                                  handleRecordFieldChange(recIndex, col.name, e.target.value)
                                }
                                placeholder={
                                  col.name === "role"
                                    ? "admin / user / manager"
                                    : col.name === "token"
                                    ? "fake_token_value"
                                    : col.defaultValue || `Enter ${col.name}`
                                }
                                className="h-7 text-xs bg-background"
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="p-3.5 border-t border-border/50 bg-secondary/10 flex items-center justify-between gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              Cancel
            </Button>
          </DialogClose>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleSave(false)}
              className="h-8 text-xs px-3 bg-secondary/70 text-foreground border border-border/60"
            >
              Save Only
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              disabled={isSeedingDb}
              onClick={() => handleSave(true)}
              className="h-8 text-xs px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-xs cursor-pointer"
              title="Save persona and immediately insert its fixtures into the live database"
            >
              {isSeedingDb ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              <span>Save & Insert into DB</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
