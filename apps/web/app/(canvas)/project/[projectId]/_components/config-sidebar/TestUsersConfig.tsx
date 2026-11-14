"use client";

import React, { useState, useMemo } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
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
  Users,
  Plus,
  Pencil,
  Trash,
  Copy,
  Check,
  KeyRound,
  Database,
  Table2,
  Sparkles,
  Link2,
  ShieldCheck,
  RefreshCw,
  Terminal,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { useTestUsersStore } from "../test-users/useTestUsersStore";
import {
  TestUserPersona,
  TableSeedRecord,
  generateRecordId,
  generatePersonaId,
  toValidUuid,
} from "../test-users/types";
import {
  generateRealBearerJwtSync,
  generateRealSessionToken,
  isRealJwt,
  inspectJwt,
  formatBearerHeader,
  formatCurlExample,
  DEFAULT_AUTH_SECRET,
} from "../test-users/tokenGenerator";
import { seedTestUsers } from "@/lib/services/databaseService";
import { PersonaRecordsEditor } from "../test-users/PersonaRecordsEditor";
import { toast } from "sonner";
import { cn } from "@workspace/ui/lib/utils";

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

interface TestUsersConfigProps {
  id?: string;
  nodeId?: string;
}

export function TestUsersConfig({ id, nodeId }: TestUsersConfigProps) {
  const personas = useTestUsersStore((s) => s.personas);
  const addPersona = useTestUsersStore((s) => s.addPersona);
  const updatePersona = useTestUsersStore((s) => s.updatePersona);
  const deletePersona = useTestUsersStore((s) => s.deletePersona);
  const regeneratePersonaToken = useTestUsersStore((s) => s.regeneratePersonaToken);
  const upgradeAllToRealTokens = useTestUsersStore((s) => s.upgradeAllToRealTokens);

  const allNodes = useBackendCanvasStore((s) => s.nodes);

  // Discover Auth node secret key if configured
  const authNode = useMemo(
    () => allNodes.find((n) => n.type === "auth"),
    [allNodes],
  );
  const authSecret =
    typeof authNode?.data?.secretKey === "string"
      ? authNode.data.secretKey
      : DEFAULT_AUTH_SECRET;

  // Check if any personas have legacy placeholder tokens
  const hasLegacyTokens = useMemo(
    () => personas.some((p) => !isRealJwt(p.activeAuthToken || "")),
    [personas],
  );

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

  // Built-in fallback table schemas
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

  // Mode: list vs create/edit
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formActiveToken, setFormActiveToken] = useState("");
  const [formRecords, setFormRecords] = useState<TableSeedRecord[]>([]);

  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [copiedRecordId, setCopiedRecordId] = useState<string | null>(null);
  const [copiedCurlId, setCopiedCurlId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [isSeedingDb, setIsSeedingDb] = useState(false);
  const [selectedDbId, setSelectedDbId] = useState<string>("");

  // Open Edit form
  const handleStartEdit = (persona: TestUserPersona) => {
    setEditingPersonaId(persona.id);
    setIsCreating(false);
    setFormName(persona.name);
    setFormDescription(persona.description || "");
    setFormActiveToken(persona.activeAuthToken || "");
    setFormRecords(persona.records);
  };

  // Open Create form with real HS256 JWT
  const handleStartCreate = () => {
    const userId = generateRecordId("user");
    const sessId = generateRecordId("session");
    const defaultEmail = "test@example.com";
    const defaultRole = "user";

    const realJwt = generateRealBearerJwtSync({
      userId,
      name: "Test Persona",
      email: defaultEmail,
      role: defaultRole,
      sessionId: sessId,
      secret: authSecret,
    });

    setEditingPersonaId(null);
    setIsCreating(true);
    setFormName("");
    setFormDescription("");
    setFormActiveToken(realJwt);
    setFormRecords([
      {
        id: userId,
        databaseName: databaseNodes[0]?.name || "Primary Database (PostgreSQL)",
        tableName: "user",
        fields: {
          id: userId,
          name: "Test Persona",
          email: defaultEmail,
          role: defaultRole,
        },
      },
    ]);
  };

  // Cancel form
  const handleCancelForm = () => {
    setEditingPersonaId(null);
    setIsCreating(false);
  };

  // Generate a fresh Real JWT for the current form
  const handleGenerateFreshJwtForForm = () => {
    const userRec =
      formRecords.find((r) => {
        const l = (r.tableName || "").toLowerCase();
        return l === "user" || l === "users";
      }) || formRecords[0];
    const rawUserId = userRec?.fields?.id ? String(userRec.fields.id) : undefined;
    const userId = toValidUuid(rawUserId);
    const email = userRec?.fields?.email
      ? String(userRec.fields.email)
      : `${(formName || "user").toLowerCase().replace(/\s+/g, ".")}@example.com`;
    const role = userRec?.fields?.role
      ? String(userRec.fields.role)
      : formName.toLowerCase().includes("admin")
      ? "admin"
      : "user";
    const sessRec = formRecords.find((r) => {
      const l = (r.tableName || "").toLowerCase();
      return l === "session" || l === "sessions";
    });
    const rawSessId = sessRec?.fields?.id ? String(sessRec.fields.id) : undefined;
    const sessId = toValidUuid(rawSessId);

    const freshJwt = generateRealBearerJwtSync({
      userId,
      name: formName || "Test Persona",
      email,
      role,
      sessionId: sessId,
      secret: authSecret,
    });

    setFormActiveToken(freshJwt);

    // Sync into session record
    setFormRecords((prev) =>
      prev.map((r) =>
        r.tableName.toLowerCase() === "session"
          ? { ...r, fields: { ...r.fields, token: freshJwt } }
          : r,
      ),
    );

    toast.success("Generated Real HS256 Bearer JWT", {
      description: `Signed with sub: ${userId}, role: ${role}`,
    });
  };

  // Generate a high-entropy session token
  const handleGenerateSessionTokenForForm = () => {
    const sessToken = generateRealSessionToken();
    setFormActiveToken(sessToken);

    setFormRecords((prev) =>
      prev.map((r) =>
        r.tableName.toLowerCase() === "session"
          ? { ...r, fields: { ...r.fields, token: sessToken } }
          : r,
      ),
    );

    toast.success("Generated Better Auth Session Token", {
      description: "64-character cryptographic token linked to session table",
    });
  };

  // Copy bearer header
  const handleCopyHeader = (persona: TestUserPersona) => {
    if (!persona.activeAuthToken) {
      toast.error("No active token found for this persona");
      return;
    }
    const headerVal = formatBearerHeader(persona.activeAuthToken);
    navigator.clipboard.writeText(headerVal);
    setCopiedTokenId(persona.id);
    toast.success(`Copied: Authorization: ${headerVal.slice(0, 36)}...`, {
      description: "Paste into Postman or curl Authorization headers",
    });
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  // Copy raw token only
  const handleCopyRawToken = (token?: string) => {
    if (!token) return;
    const clean = token.replace(/^Bearer\s+/i, "").trim();
    navigator.clipboard.writeText(clean);
    toast.success("Copied token string to clipboard");
  };

  // Copy cURL command example
  const handleCopyCurl = (persona: TestUserPersona) => {
    if (!persona.activeAuthToken) return;
    const curlSnippet = formatCurlExample(
      "GET",
      "http://localhost:8080/api/endpoint",
      persona.activeAuthToken,
    );
    navigator.clipboard.writeText(curlSnippet);
    setCopiedCurlId(persona.id);
    toast.success("Copied cURL command to clipboard", {
      description: "Ready to run in terminal or import into Postman",
    });
    setTimeout(() => setCopiedCurlId(null), 2000);
  };

  // Copy record ID
  const handleCopyRecordId = (recId: string) => {
    navigator.clipboard.writeText(recId);
    setCopiedRecordId(recId);
    toast.success(`Copied record _id: ${recId}`);
    setTimeout(() => setCopiedRecordId(null), 2000);
  };

  // Add another table record
  const handleAddRecordToForm = () => {
    const defaultDb = databaseNodes[0]?.name || "Primary Database (PostgreSQL)";
    const defaultTbl = fallbackTables[0]?.name || "user";
    const newId = generateRecordId(defaultTbl);

    setFormRecords([
      ...formRecords,
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
  const handleRemoveRecordFromForm = (idx: number) => {
    setFormRecords(formRecords.filter((_, i) => i !== idx));
  };

  // Field change
  const handleFieldChange = (
    recIdx: number,
    fieldName: string,
    val: string | number | boolean | null,
  ) => {
    setFormRecords((prev) => {
      const copy = [...prev];
      const rec = { ...copy[recIdx]! };
      rec.fields = { ...rec.fields, [fieldName]: val };

      if (fieldName === "token" && val) {
        setFormActiveToken(String(val));
      }

      copy[recIdx] = rec;
      return copy;
    });
  };

  // Extract live connection config from canvas database nodes
  const getDbNodeConnection = (dbId?: string) => {
    const dbs = allNodes.filter((n) => n.type === "database");
    const targetDb = dbId ? dbs.find((d) => d.id === dbId) : dbs[0];
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

  // Seed / Insert test user fixtures directly into the connected live database
  const handleSeedTestUsers = async (dbId?: string, singlePersona?: TestUserPersona) => {
    const targetPersonas = singlePersona ? [singlePersona] : personas;
    if (targetPersonas.length === 0) {
      toast.error("No test personas available to insert into database");
      return;
    }

    const effectiveDbId = dbId || selectedDbId || databaseNodes[0]?.id;
    const { name: dbName, engine, connection } = getDbNodeConnection(effectiveDbId);

    setIsSeedingDb(true);
    const toastId = toast.loading(`Inserting test user(s) into ${dbName}...`);
    try {
      const res = await seedTestUsers({
        engine,
        connection,
        personas: targetPersonas,
      });

      if (res.success) {
        toast.success(
          `Successfully inserted ${res.insertedRecords} test user record(s) into ${dbName}!`,
          {
            id: toastId,
            description: singlePersona
              ? `User & session fixtures for "${singlePersona.name}" are now in the database.`
              : "User and session records have been inserted into the database. Foreign keys (fk_Conversations_created_by) and bearer tokens are now active.",
          },
        );
      } else {
        toast.error(`Failed to insert test users: ${res.error || "Unknown database error"}`, {
          id: toastId,
          description: "Check that your database is running and reachable.",
        });
      }
    } catch (err) {
      toast.error(
        `Database insertion error: ${err instanceof Error ? err.message : String(err)}`,
        { id: toastId },
      );
    } finally {
      setIsSeedingDb(false);
    }
  };

  // Save Persona (with optional direct DB insertion)
  const handleSaveForm = async (alsoSeedDb: boolean = false) => {
    if (!formName.trim()) {
      toast.error("Please enter a Persona Name");
      return;
    }

    const personaToSave: TestUserPersona = {
      id: editingPersonaId || generatePersonaId(),
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      activeAuthToken: formActiveToken.trim() || undefined,
      records: formRecords.map((r) => ({
        ...r,
        fields: {
          ...r.fields,
          id: r.fields.id || r.id,
          // ensure session table record token always matches activeAuthToken
          ...(r.tableName.toLowerCase() === "session" && formActiveToken.trim()
            ? { token: formActiveToken.trim() }
            : {}),
        },
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (editingPersonaId) {
      updatePersona(editingPersonaId, personaToSave);
      toast.success(`Updated persona: ${personaToSave.name}`);
    } else {
      addPersona(personaToSave);
      toast.success(`Created persona: ${personaToSave.name}`);
    }

    if (alsoSeedDb) {
      await handleSeedTestUsers(undefined, personaToSave);
    }

    handleCancelForm();
  };

  // Available foreign keys
  const availableForeignKeys = useMemo(() => {
    return formRecords.map((r) => ({
      id: r.id,
      tableName: r.tableName,
    }));
  }, [formRecords]);

  const showEditorForm = isCreating || editingPersonaId !== null;

  // Live inspection of form token
  const inspectedFormToken = useMemo(() => {
    return inspectJwt(formActiveToken);
  }, [formActiveToken]);

  return (
    <div className="flex flex-col gap-6 mt-2 pb-12 text-foreground font-sans">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/25">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                Test Users & Real Bearer Tokens
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {personas.length} Personas
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              RFC 7519 signed JWT tokens & Better Auth database fixtures ready for Postman, curl, and endpoint testing.
            </p>
          </div>
        </div>
      </div>

      {/* Upgrade Legacy Tokens Banner if needed */}
      {hasLegacyTokens && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-amber-700 dark:text-amber-300">
              Legacy placeholder tokens detected. Upgrade all personas to real HS256 signed JWTs for Postman compatibility.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              upgradeAllToRealTokens(authSecret);
              toast.success("Upgraded all personas to real HS256 Bearer JWTs!");
            }}
            className="h-7 text-xs px-2.5 shrink-0 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Upgrade to Real JWTs</span>
          </Button>
        </div>
      )}

      {/* Status & Postman Ready Card */}
      <div className="p-4 rounded-xl bg-card border border-border/60 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Postman & External API Testing Ready</span>
          </div>
          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            HS256 JWT + Session DB
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Every persona generates a cryptographically signed Bearer JWT token (<code className="text-[11px] font-mono bg-secondary/80 px-1 py-0.5 rounded">Authorization: Bearer &lt;jwt&gt;</code>) and is seeded into the database (<code className="text-[11px] font-mono bg-secondary/80 px-1 py-0.5 rounded">user</code> & <code className="text-[11px] font-mono bg-secondary/80 px-1 py-0.5 rounded">session</code> tables).
        </p>

        <div className="pt-2 border-t border-border/40 flex items-center justify-between flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="text-[11px] text-indigo-500 hover:text-indigo-400 flex items-center gap-1 font-medium cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{showGuide ? "Hide Postman Instructions" : "How to test on Postman / cURL"}</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {personas[0] && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopyHeader(personas[0]!)}
                className="h-7 text-xs px-2.5 bg-background border-border gap-1.5 font-medium"
              >
                {copiedTokenId === personas[0]!.id ? (
                  <Check className="w-3 h-3 text-emerald-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>Copy {personas[0]!.name} Bearer</span>
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible Quick Guide */}
        {showGuide && (
          <div className="p-3 rounded-lg bg-secondary/40 border border-border/50 text-xs flex flex-col gap-2 font-mono text-[11px]">
            <div className="font-semibold text-foreground flex items-center gap-1.5 font-sans">
              <Terminal className="w-3.5 h-3.5 text-indigo-500" />
              <span>Using Real Bearer Tokens Externally:</span>
            </div>
            <div className="space-y-1.5 text-muted-foreground">
              <div>
                <strong className="text-foreground">Option 1 (Headers):</strong> Add header <code className="text-foreground bg-background px-1 py-0.5 rounded">Authorization</code> with value <code className="text-foreground bg-background px-1 py-0.5 rounded">Bearer eyJhbGci...</code>
              </div>
              <div>
                <strong className="text-foreground">Option 2 (Postman Auth Tab):</strong> Select <span className="text-foreground">Type: Bearer Token</span> and paste the token string.
              </div>
              <div>
                <strong className="text-foreground">FastAPI & Better Auth:</strong> The token validates statelessly via HS256 signature and matches database session records.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions Toolbar */}
      {!showEditorForm && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Configured Personas ({personas.length})
          </span>

          <div className="flex items-center gap-2">
            {databaseNodes.length > 1 && (
              <Select
                value={selectedDbId || databaseNodes[0]?.id}
                onValueChange={setSelectedDbId}
              >
                <SelectTrigger className="h-8 text-xs font-mono bg-background w-[140px]">
                  <SelectValue placeholder="Select Database" />
                </SelectTrigger>
                <SelectContent>
                  {databaseNodes.map((db) => (
                    <SelectItem key={db.id} value={db.id} className="text-xs">
                      {db.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              size="sm"
              variant="secondary"
              onClick={handleStartCreate}
              className="h-8 text-xs px-3 bg-secondary/80 hover:bg-secondary text-foreground border border-border/60 gap-1.5 font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Test User</span>
            </Button>
          </div>
        </div>
      )}

      {/* Editor Form (Create or Edit) */}
      {showEditorForm ? (
        <div className="flex flex-col gap-4 p-4 rounded-xl border border-border/70 bg-card/60 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-semibold text-foreground">
                {isCreating ? "Create Test User Persona" : "Edit Test User Persona"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelForm}
              className="h-7 text-xs text-muted-foreground"
            >
              Cancel
            </Button>
          </div>

          {/* Persona Info */}
          <div className="grid grid-cols-1 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">Persona Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Admin - Acme Tenant"
                className="h-8 text-xs bg-background"
                autoFocus
              />
            </div>

            {/* Active Bearer Token Field with Generators */}
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
                    onClick={handleGenerateFreshJwtForForm}
                    className="h-6 text-[10.5px] px-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 gap-1 font-medium cursor-pointer"
                    title="Generate a signed RFC 7519 HS256 JWT using persona details and auth secret"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    <span>Generate Real JWT</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleGenerateSessionTokenForForm}
                    className="h-6 text-[10.5px] px-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Generate 64-character Better Auth session token"
                  >
                    <span>Session Token</span>
                  </Button>
                </div>
              </div>

              <div className="relative flex items-center">
                <Input
                  value={formActiveToken}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormActiveToken(val);
                    // Sync into session record if present
                    setFormRecords((prev) =>
                      prev.map((r) =>
                        r.tableName.toLowerCase() === "session"
                          ? { ...r, fields: { ...r.fields, token: val } }
                          : r,
                      ),
                    );
                  }}
                  placeholder="Paste or generate real bearer token (eyJ...)"
                  className="h-8 text-xs font-mono bg-background pr-20"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopyRawToken(formActiveToken)}
                  className="absolute right-1 h-6 text-[10.5px] px-2 text-muted-foreground hover:text-foreground gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </Button>
              </div>

              {/* Decoded JWT Claims Inspector Preview */}
              {inspectedFormToken && (
                <div className="p-2.5 rounded bg-secondary/30 border border-border/40 text-[10.5px] font-mono flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Valid HS256 JWT Signature</span>
                    </span>
                    <span>Expires: {inspectedFormToken.expiresAtFormatted}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-border/30">
                    <span className="text-muted-foreground">
                      sub: <strong className="text-foreground">{String(inspectedFormToken.payload.sub || "")}</strong>
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      email: <strong className="text-foreground">{String(inspectedFormToken.payload.email || "")}</strong>
                    </span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      role: <strong className="text-foreground uppercase">{String(inspectedFormToken.payload.role || "user")}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Multi-Table Record Fixtures */}
          <div className="flex flex-col gap-3 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Table Records ({formRecords.length})
                </span>
              </div>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleAddRecordToForm}
                className="h-7 text-xs px-2.5 bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Record</span>
              </Button>
            </div>

            {formRecords.map((rec, recIdx) => {
              const matchedTable = fallbackTables.find(
                (t) => t.name.toLowerCase() === rec.tableName.toLowerCase(),
              );
              const columns = matchedTable?.columns || [
                { name: "name", type: "string" },
                { name: "email", type: "string" },
                { name: "role", type: "string" },
              ];

              return (
                <div
                  key={recIdx}
                  className="flex flex-col gap-3 p-3 rounded-lg border border-border/60 bg-background/60"
                >
                  {/* Record Header: Database -> Table & _id */}
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border/40 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Database Selector */}
                      <div className="flex items-center gap-1">
                        <Database className="w-3.5 h-3.5 text-muted-foreground" />
                        <Select
                          value={rec.databaseName}
                          onValueChange={(val) => {
                            setFormRecords((prev) => {
                              const copy = [...prev];
                              copy[recIdx] = { ...copy[recIdx]!, databaseName: val };
                              return copy;
                            });
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs bg-background w-36 border-border/60">
                            <SelectValue placeholder="Database" />
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

                      {/* Table Selector */}
                      <div className="flex items-center gap-1">
                        <Table2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <Select
                          value={rec.tableName}
                          onValueChange={(val) => {
                            const newId = generateRecordId(val);
                            setFormRecords((prev) => {
                              const copy = [...prev];
                              copy[recIdx] = {
                                ...copy[recIdx]!,
                                id: newId,
                                tableName: val,
                                fields: {
                                  id: newId,
                                  ...(val.toLowerCase() === "session" && formActiveToken
                                    ? { token: formActiveToken }
                                    : {}),
                                },
                              };
                              return copy;
                            });
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs bg-background w-32 font-mono font-medium border-border/60">
                            <SelectValue placeholder="Table" />
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

                      {/* Generated _id Badge */}
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary/80 border border-border/50 text-[11px] font-mono">
                        <span className="text-muted-foreground">_id:</span>
                        <span className="font-bold text-foreground">{rec.id}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyRecordId(rec.id)}
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          title="Copy _id to use as Foreign Key"
                        >
                          {copiedRecordId === rec.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {formRecords.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveRecordFromForm(recIdx)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Dynamic Column Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {columns
                      .filter((c) => c.name !== "id" && c.name !== "_id")
                      .map((col) => {
                        const isForeignKeyField =
                          col.name.toLowerCase().endsWith("id") ||
                          col.name.toLowerCase().includes("user") ||
                          col.name.toLowerCase().includes("org");

                        const val = rec.fields[col.name];

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

                            {isForeignKeyField && availableForeignKeys.some((k) => k.id !== rec.id) ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  value={val === null || val === undefined ? "" : String(val)}
                                  onChange={(e) =>
                                    handleFieldChange(recIdx, col.name, e.target.value)
                                  }
                                  placeholder={col.defaultValue || `value`}
                                  className="h-7 text-xs font-mono bg-background flex-1"
                                />
                                <Select
                                  value=""
                                  onValueChange={(fkVal) =>
                                    handleFieldChange(recIdx, col.name, fkVal)
                                  }
                                >
                                  <SelectTrigger className="h-7 w-7 p-0 bg-secondary/60 border-border/50 text-muted-foreground">
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
                                  handleFieldChange(recIdx, col.name, e.target.value)
                                }
                                placeholder={
                                  col.name === "role"
                                    ? "admin / user / manager"
                                    : col.name === "token"
                                    ? "Bearer token or session token"
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

          {/* Form Submit Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border/50 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelForm}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleSaveForm(false)}
                className="h-8 text-xs px-3 bg-secondary text-foreground font-medium border border-border/60"
              >
                Save Only
              </Button>
              <Button
                size="sm"
                variant="default"
                disabled={isSeedingDb}
                onClick={() => handleSaveForm(true)}
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
          </div>
        </div>
      ) : (
        /* List of Configured Personas */
        <div className="flex flex-col gap-3">
          {personas.map((persona) => {
            const isJwt = persona.activeAuthToken && isRealJwt(persona.activeAuthToken);
            const inspected = persona.activeAuthToken ? inspectJwt(persona.activeAuthToken) : null;
            const userRec = persona.records.find((r) => r.tableName === "user");
            const role =
              userRec?.fields?.role ||
              inspected?.payload?.role ||
              (persona.name.toLowerCase().includes("admin") ? "admin" : "user");

            return (
              <div
                key={persona.id}
                className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card/40 shadow-sm hover:border-border/80 transition-colors"
              >
                {/* Top Bar */}
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-foreground">
                        {persona.name}
                      </span>

                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 uppercase">
                        {String(role)}
                      </span>

                      {isJwt ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <ShieldCheck className="w-2.5 h-2.5" />
                          <span>HS256 JWT</span>
                        </span>
                      ) : persona.activeAuthToken ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          <KeyRound className="w-2.5 h-2.5" />
                          <span>Session Token</span>
                        </span>
                      ) : null}
                    </div>

                    {persona.description && (
                      <span className="text-[11px] text-muted-foreground">
                        {persona.description}
                      </span>
                    )}
                  </div>

                  {/* Actions for this Persona */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {persona.activeAuthToken && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleCopyHeader(persona)}
                          className="h-7 text-[11px] px-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 gap-1.5 font-medium cursor-pointer"
                          title="Copy Authorization: Bearer <token> for Postman or curl"
                        >
                          {copiedTokenId === persona.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copy Bearer</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyCurl(persona)}
                          className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
                          title="Copy complete cURL command example"
                        >
                          {copiedCurlId === persona.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Terminal className="w-3 h-3" />
                          )}
                          <span>cURL</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const fresh = regeneratePersonaToken(persona.id, authSecret);
                            if (fresh) {
                              toast.success(`Regenerated real JWT for ${persona.name}`);
                            }
                          }}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Regenerate Real Bearer JWT with fresh signature"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStartEdit(persona)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Edit Persona"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        deletePersona(persona.id);
                        toast.success(`Deleted persona: ${persona.name}`);
                      }}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Delete Persona"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Token Preview & Decoded Claims */}
                {persona.activeAuthToken && (
                  <div className="p-2.5 rounded-lg bg-background/60 border border-border/40 flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-mono text-muted-foreground flex items-center gap-1.5">
                        <KeyRound className="w-3 h-3 text-indigo-500" />
                        <span>Bearer Token (Postman Ready):</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyRawToken(persona.activeAuthToken)}
                        className="text-[10px] font-mono text-indigo-500 hover:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Copy Raw Token
                      </button>
                    </div>

                    <div className="p-1.5 rounded bg-zinc-950/70 border border-zinc-800 text-zinc-300 font-mono text-[10.5px] truncate select-all">
                      {persona.activeAuthToken}
                    </div>

                    {inspected && (
                      <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-muted-foreground pt-0.5">
                        <span className="bg-secondary/40 px-1.5 py-0.5 rounded">
                          sub: <strong className="text-foreground">{String(inspected.payload.sub || "")}</strong>
                        </span>
                        <span className="bg-secondary/40 px-1.5 py-0.5 rounded">
                          email: <strong className="text-foreground">{String(inspected.payload.email || "")}</strong>
                        </span>
                        <span className="bg-secondary/40 px-1.5 py-0.5 rounded">
                          exp: <strong className="text-foreground">{inspected.expiresAtFormatted}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Interactive Seeded Table Records Editor (Select DB, Table & edit fields inline) */}
                <PersonaRecordsEditor persona={persona} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
