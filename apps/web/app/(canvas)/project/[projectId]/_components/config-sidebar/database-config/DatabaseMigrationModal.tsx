"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Copy,
  Check,
  Terminal,
  Database,
  FileCode,
  ExternalLink,
  ShieldCheck,
  Laptop,
} from "lucide-react";
import { toast } from "sonner";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { compilePostgresDatabase } from "@/lib/compiler/databases/postgres";

interface DatabaseMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbLabel: string;
  engine?: string;
  provider?: string;
}

export const DatabaseMigrationModal: React.FC<DatabaseMigrationModalProps> = ({
  isOpen,
  onClose,
  dbLabel,
  engine = "postgres",
  provider,
}) => {
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const nodes = useBackendCanvasStore((s) => s.nodes);
  const edges = useBackendCanvasStore((s) => s.edges);

  const { sqlContent, syncScriptContent, tableCount } = useMemo(() => {
    if (!isOpen) {
      return { sqlContent: "", syncScriptContent: "", tableCount: 0 };
    }

    const compiled = compilePostgresDatabase(nodes, edges);
    const sqlFile = compiled.files.find((f) => f.filename === "schema.sql");
    const syncFile = compiled.files.find((f) => f.filename === "scripts/sync.ts");

    const attachedEntityNodes = nodes.filter(
      (n) => n.type === "entity" || n.type === "db_ref",
    );

    return {
      sqlContent: sqlFile?.content || "-- No schema generated yet",
      syncScriptContent: syncFile?.content || "// No sync script generated yet",
      tableCount: attachedEntityNodes.length,
    };
  }, [isOpen, nodes, edges]);

  const handleCopy = (text: string, type: string, successMessage: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    toast.success(successMessage);
    setTimeout(() => {
      setCopiedType(null);
    }, 2000);
  };

  const isSupabase = provider === "supabase";
  const cliCommand = "pnpm db:push";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-card border-border/60">
        <DialogHeader className="p-5 pb-3 border-b border-border/40">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <Laptop size={18} />
              </div>
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  Local Database Migration & SQL
                  <Badge variant="outline" className="text-[10px] font-mono py-0 text-emerald-500 border-emerald-500/30">
                    {tableCount} Table{tableCount === 1 ? "" : "s"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Synchronize <span className="font-semibold text-foreground">{dbLabel}</span> directly on your machine or paste the DDL into your cloud dashboard.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Security and TLS Explanatory Banner */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-foreground flex items-start gap-2.5">
            <ShieldCheck size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Runs securely on your developer machine
              </span>
              <p className="text-[11px] text-muted-foreground">
                Executing migrations from your local terminal bypasses Cloudflare Workers TLS certificate rejections (Supabase private CA) and connects to <code className="font-mono text-foreground">localhost:5432</code>, Docker, and private VPCs with zero network restrictions.
              </p>
            </div>
          </div>

          <Tabs defaultValue="cli" className="w-full">
            <TabsList className="grid grid-cols-3 w-full bg-muted/40">
              <TabsTrigger value="cli" className="text-xs font-semibold gap-1.5">
                <Terminal size={13} />
                Terminal CLI (db:push)
              </TabsTrigger>
              <TabsTrigger value="sql" className="text-xs font-semibold gap-1.5">
                <Database size={13} />
                Raw SQL (schema.sql)
              </TabsTrigger>
              <TabsTrigger value="script" className="text-xs font-semibold gap-1.5">
                <FileCode size={13} />
                TypeScript Runner
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Terminal CLI Execution */}
            <TabsContent value="cli" className="space-y-3 pt-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    1. Execute migration from your project root:
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => handleCopy(cliCommand, "cli", "Copied CLI command to clipboard!")}
                  >
                    {copiedType === "cli" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    {copiedType === "cli" ? "Copied" : "Copy Command"}
                  </Button>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950 font-mono text-xs text-zinc-100 border border-zinc-800 flex items-center justify-between">
                  <code>{cliCommand}</code>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/30 border border-border/40 text-xs space-y-1.5 text-muted-foreground">
                <span className="font-semibold text-foreground">What this does:</span>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>Connects via Node.js on your machine using <code className="font-mono text-foreground">DATABASE_URL</code> from your local <code className="font-mono text-foreground">.env</code>.</li>
                  <li>Applies all canvas entity tables, Better-Auth auth tables, indexes, and column types.</li>
                  <li>Works identically across Supabase, Neon, AWS RDS, Docker, and Localhost.</li>
                </ul>
              </div>
            </TabsContent>

            {/* Tab 2: Raw SQL Schema */}
            <TabsContent value="sql" className="space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Compiled DDL Statements ({tableCount} tables):
                </span>
                <div className="flex items-center gap-2">
                  {isSupabase && (
                    <a
                      href="https://supabase.com/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                    >
                      Supabase SQL Editor <ExternalLink size={10} />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => handleCopy(sqlContent, "sql", "Copied schema.sql to clipboard!")}
                  >
                    {copiedType === "sql" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    {copiedType === "sql" ? "Copied" : "Copy SQL"}
                  </Button>
                </div>
              </div>

              <pre className="p-3.5 rounded-lg bg-zinc-950 text-zinc-200 font-mono text-[11px] max-h-72 overflow-y-auto overflow-x-auto border border-zinc-800 leading-relaxed">
                <code>{sqlContent}</code>
              </pre>
            </TabsContent>

            {/* Tab 3: Generated TypeScript Runner */}
            <TabsContent value="script" className="space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Generated Runner Script (<code className="font-mono text-[11px]">packages/db-postgres/scripts/sync.ts</code>):
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => handleCopy(syncScriptContent, "script", "Copied sync.ts to clipboard!")}
                >
                  {copiedType === "script" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copiedType === "script" ? "Copied" : "Copy Code"}
                </Button>
              </div>

              <pre className="p-3.5 rounded-lg bg-zinc-950 text-zinc-200 font-mono text-[11px] max-h-72 overflow-y-auto overflow-x-auto border border-zinc-800 leading-relaxed">
                <code>{syncScriptContent}</code>
              </pre>
            </TabsContent>
          </Tabs>
        </div>

        <div className="p-3.5 bg-muted/20 border-t border-border/40 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Engine: <span className="font-semibold uppercase text-foreground">{engine}</span>
          </span>
          <Button size="sm" onClick={onClose} className="h-8 text-xs px-4">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

