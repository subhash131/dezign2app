"use client";

import React, { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet";
import { Button } from "@workspace/ui/components/button";
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
  ShieldCheck,
  Sparkles,
  Link2,
  RefreshCw,
} from "lucide-react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { seedTestUsers } from "@/lib/services/databaseService";
import { useTestUsersStore } from "./useTestUsersStore";
import { TestUserPersona } from "./types";
import { TestUserPersonaEditor } from "./TestUserPersonaEditor";
import { PersonaRecordsEditor } from "./PersonaRecordsEditor";
import { formatBearerHeader, isRealJwt, inspectJwt } from "./tokenGenerator";
import { toast } from "sonner";
import { cn } from "@workspace/ui/lib/utils";

interface TestUsersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TestUsersSheet({ open, onOpenChange }: TestUsersSheetProps) {
  const personas = useTestUsersStore((s) => s.personas);
  const addPersona = useTestUsersStore((s) => s.addPersona);
  const updatePersona = useTestUsersStore((s) => s.updatePersona);
  const deletePersona = useTestUsersStore((s) => s.deletePersona);
  const allNodes = useBackendCanvasStore((s) => s.nodes);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<TestUserPersona | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [isSeedingDb, setIsSeedingDb] = useState(false);

  const handleSeedTestUsers = async (singlePersona?: TestUserPersona) => {
    const targetPersonas = singlePersona ? [singlePersona] : personas;
    if (targetPersonas.length === 0) {
      toast.error("No test personas available to insert into database");
      return;
    }

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
              : "User and session records have been inserted into the database. Foreign keys and bearer tokens are now active.",
          },
        );
      } else {
        toast.error(`Failed to insert test users: ${res.error || "Unknown database error"}`, {
          id: toastId,
          description: "Please check your database connection and verify its settings on the database node in SchemaView.",
          duration: 9000,
        });
      }
    } catch (err) {
      toast.error(
        `Database insertion error: ${err instanceof Error ? err.message : String(err)}`,
        {
          id: toastId,
          description: "Please check your database connection in SchemaView.",
          duration: 9000,
        },
      );
    } finally {
      setIsSeedingDb(false);
    }
  };

  const handleCreateNew = () => {
    setEditingPersona(null);
    setEditorOpen(true);
  };

  const handleEdit = (persona: TestUserPersona) => {
    setEditingPersona(persona);
    setEditorOpen(true);
  };

  const handleSave = (persona: TestUserPersona) => {
    if (editingPersona) {
      updatePersona(persona.id, persona);
    } else {
      addPersona(persona);
    }
  };

  const handleCopyHeader = (persona: TestUserPersona) => {
    if (!persona.activeAuthToken) {
      toast.error("No active token found for this persona");
      return;
    }
    const headerVal = formatBearerHeader(persona.activeAuthToken);
    navigator.clipboard.writeText(headerVal);
    setCopiedTokenId(persona.id);
    toast.success(`Copied: Authorization: ${headerVal.slice(0, 36)}...`, {
      description: "Paste into Postman or cURL Authorization header",
    });
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl flex flex-col p-0 gap-0 font-sans bg-background border-l border-border/50"
        >
          {/* Header */}
          <SheetHeader className="p-5 border-b border-border/50 bg-secondary/15">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-secondary text-foreground border border-border/60">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <SheetTitle className="text-sm font-semibold flex items-center gap-2">
                    <span>Test Users & Real Bearer Tokens</span>
                    <span className="px-2 py-0.2 rounded-full text-[10px] font-mono font-bold bg-secondary text-muted-foreground border border-border/50">
                      {personas.length} Personas
                    </span>
                  </SheetTitle>
                  <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                    Define mock identities, seed database records, and generate real signed tokens for testing.
                  </SheetDescription>
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* Action Toolbar */}
          <div className="flex items-center justify-between p-3.5 px-5 border-b border-border/40 bg-secondary/5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Configured Personas
            </span>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCreateNew}
                className="h-7 text-xs px-2.5 bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50 gap-1.5 font-medium shadow-none cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Test User</span>
              </Button>
            </div>
          </div>

          {/* List of Personas */}
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5">
            {personas.map((persona) => {
              const isJwt = persona.activeAuthToken && isRealJwt(persona.activeAuthToken);
              return (
                <div
                  key={persona.id}
                  className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-card/40 shadow-sm hover:border-border/80 transition-colors"
                >
                  {/* Persona Top Bar */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-foreground">
                          {persona.name}
                        </span>
                        {isJwt ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            <ShieldCheck className="w-2.5 h-2.5" />
                            <span>HS256 JWT</span>
                          </span>
                        ) : persona.activeAuthToken ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <KeyRound className="w-2.5 h-2.5" />
                            <span>Active Token</span>
                          </span>
                        ) : null}
                      </div>
                      {persona.description && (
                        <span className="text-[11px] text-muted-foreground">
                          {persona.description}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {persona.activeAuthToken && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyHeader(persona)}
                          className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1"
                          title="Copy Authorization: Bearer <token>"
                        >
                          {copiedTokenId === persona.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copy Bearer</span>
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(persona)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
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
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        title="Delete Persona"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Interactive Seeded Table Records Editor (Select DB, Table & edit fields inline) */}
                  <PersonaRecordsEditor persona={persona} />
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Editor Modal */}
      <TestUserPersonaEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initialPersona={editingPersona}
        onSave={handleSave}
      />
    </>
  );
}
