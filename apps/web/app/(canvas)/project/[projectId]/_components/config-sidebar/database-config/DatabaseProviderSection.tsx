import React, { useState } from "react";
import {
  Zap,
  Globe,
  Cloud,
  Server,
  Database,
  Key,
  ShieldCheck,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  ClipboardPaste,
  HelpCircle,
  ExternalLink,
  Lock,
} from "lucide-react";
import { Label } from "@workspace/ui/components/label";
import { LocalInput } from "../../backend-nodes/graph-nodes/common";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { BackendNode } from "@workspace/canvas";

export interface DatabaseProviderConfigProps {
  data: BackendNode["data"];
  onUpdateField: <K extends keyof BackendNode["data"]>(
    field: K,
    value: BackendNode["data"][K],
  ) => void;
  onUpdateMultiple: (fields: Partial<BackendNode["data"]>) => void;
}

export const DB_PROVIDERS = [
  {
    id: "neon",
    name: "Neon DB",
    tagline: "Serverless Postgres",
    badge: "Neon Serverless",
    icon: Zap,
    color: "#00e599",
    borderActive: "border-[#00e599]/60 bg-[#00e599]/5",
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    docsUrl: "https://neon.tech",
  },
  {
    id: "supabase",
    name: "Supabase",
    tagline: "PostgreSQL & Supavisor",
    badge: "Supabase Postgres",
    icon: Globe,
    color: "#3ecf8e",
    borderActive: "border-[#3ecf8e]/60 bg-[#3ecf8e]/5",
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    docsUrl: "https://supabase.com",
  },
  {
    id: "aws_rds",
    name: "AWS RDS",
    tagline: "Aurora / Managed",
    badge: "AWS RDS / Aurora",
    icon: Cloud,
    color: "#f59e0b",
    borderActive: "border-amber-500/60 bg-amber-500/5",
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    docsUrl: "https://aws.amazon.com/rds/",
  },
  {
    id: "local",
    name: "Local / Docker",
    tagline: "Self-hosted :5432",
    badge: "Localhost",
    icon: Server,
    color: "#3b82f6",
    borderActive: "border-blue-500/60 bg-blue-500/5",
    badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  {
    id: "custom",
    name: "Custom URI",
    tagline: "Any PostgreSQL Host",
    badge: "Custom Cloud",
    icon: Database,
    color: "#a855f7",
    borderActive: "border-purple-500/60 bg-purple-500/5",
    badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  },
] as const;

import {
  parsePostgresConnectionString,
  deriveNeonPooledUrl,
  DbProviderId,
} from "@/lib/utils/databaseUrlParser";

export { parsePostgresConnectionString, deriveNeonPooledUrl };
export type { DbProviderId };

export function DatabaseProviderSection({
  data,
  onUpdateField,
  onUpdateMultiple,
}: DatabaseProviderConfigProps) {
  const currentProvider = (data.provider as DbProviderId) || "local";
  const [connectionMode, setConnectionMode] = useState<"uri" | "params">(
    data.dbConnectionType === "connection_string" ||
      currentProvider === "neon" ||
      currentProvider === "supabase" ||
      Boolean(data.connectionString)
      ? "uri"
      : "params",
  );

  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSelectProvider = (providerId: DbProviderId) => {
    const updates: Partial<BackendNode["data"]> = {
      provider: providerId,
    };

    if (providerId === "neon") {
      updates.dbConnectionType = "connection_string";
      updates.sslMode = "require";
      updates.port = "5432";
      setConnectionMode("uri");
    } else if (providerId === "supabase") {
      updates.dbConnectionType = "connection_string";
      updates.sslMode = "require";
      updates.port = "5432";
      setConnectionMode("uri");
    } else if (providerId === "local") {
      updates.host = data.host || "localhost";
      updates.port = data.port || "5432";
      updates.database = data.database || "postgres";
      updates.user = data.user || "postgres";
    }

    onUpdateMultiple(updates);
    const prov = DB_PROVIDERS.find((p) => p.id === providerId);
    toast.success(`Selected ${prov?.name || providerId} provider profile`);
  };

  // Handle pasting connection strings (single or multiline block)
  const handleParseAndApply = (inputText: string) => {
    const { directUrl, pooledUrl, provider: detectedProvider, parsed } =
      parsePostgresConnectionString(inputText);

    if (!directUrl && !pooledUrl && !parsed) {
      toast.error("Could not parse a valid PostgreSQL connection string or credentials.");
      return;
    }

    const updates: Partial<BackendNode["data"]> = {};

    if (directUrl) updates.connectionString = directUrl;
    if (pooledUrl) updates.connectionStringPooled = pooledUrl;

    if (detectedProvider) updates.provider = detectedProvider;
    updates.dbConnectionType = "connection_string";

    if (parsed) {
      if (parsed.host) updates.host = parsed.host;
      if (parsed.port) updates.port = parsed.port;
      if (parsed.user) updates.user = parsed.user;
      if (parsed.password) updates.password = parsed.password;
      if (parsed.database) updates.database = parsed.database;
      if (parsed.sslMode) updates.sslMode = parsed.sslMode;
    }

    onUpdateMultiple(updates);
    setConnectionMode("uri");

    const provName = detectedProvider
      ? DB_PROVIDERS.find((p) => p.id === detectedProvider)?.name
      : "PostgreSQL";
    toast.success(`Successfully configured ${provName} credentials!`);
  };

  const activeProviderMeta =
    DB_PROVIDERS.find((p) => p.id === currentProvider) || DB_PROVIDERS[0];

  return (
    <div className="space-y-4 pt-2 border-t border-border/40">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Cloud size={14} className="text-blue-500" />
          Database Provider & Cloud Presets
        </h3>
        <Badge variant="outline" className={cn("text-[10px] font-mono", activeProviderMeta?.badgeClass)}>
          {activeProviderMeta?.badge}
        </Badge>
      </div>

      {/* Provider Selector Cards */}
      <div className="grid grid-cols-3 gap-2">
        {DB_PROVIDERS.map((provider) => {
          const isSelected = currentProvider === provider.id;
          const Icon = provider.icon;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => handleSelectProvider(provider.id)}
              className={cn(
                "flex flex-col items-start p-2 rounded-lg border text-left transition-all relative overflow-hidden",
                isSelected
                  ? provider.borderActive
                  : "border-border/50 bg-secondary/20 hover:bg-secondary/40",
              )}
            >
              <div className="flex items-center gap-1.5 mb-1 w-full">
                <Icon size={14} style={{ color: provider.color }} className="shrink-0" />
                <span className="text-[11px] font-bold truncate text-foreground">
                  {provider.name}
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground line-clamp-1">
                {provider.tagline}
              </span>
              {isSelected && (
                <div
                  className="absolute bottom-0 right-0 w-2 h-2 rounded-tl-full"
                  style={{ backgroundColor: provider.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Connection Method Mode Toggle */}
      <div className="flex items-center justify-between p-1 bg-muted/40 rounded-lg border border-border/40">
        <button
          type="button"
          onClick={() => {
            setConnectionMode("uri");
            onUpdateField("dbConnectionType", "connection_string");
          }}
          className={cn(
            "flex-1 py-1 px-2 rounded text-[11px] font-medium transition-all text-center",
            connectionMode === "uri"
              ? "bg-background text-foreground shadow-xs font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Connection URI (Neon / Supabase)
        </button>
        <button
          type="button"
          onClick={() => {
            setConnectionMode("params");
            onUpdateField("dbConnectionType", "env_var");
          }}
          className={cn(
            "flex-1 py-1 px-2 rounded text-[11px] font-medium transition-all text-center",
            connectionMode === "params"
              ? "bg-background text-foreground shadow-xs font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Host & Port Parameters
        </button>
      </div>

      {/* Mode A: Connection String / URI Mode */}
      {connectionMode === "uri" ? (
        <div className="space-y-3.5 bg-muted/20 p-3 rounded-xl border border-border/50">
          {/* Quick Paste & Parse helper */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Sparkles size={12} className="text-blue-500" />
                Direct Connection URL (DATABASE_URL)
              </Label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) handleParseAndApply(text);
                  } catch {
                    toast.error("Clipboard permission required to paste directly.");
                  }
                }}
                className="text-[10px] text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center gap-1"
                title="Paste DATABASE_URL and auto-parse credentials"
              >
                <ClipboardPaste size={10} />
                Paste & Auto-Parse
              </button>
            </div>

            <div className="relative">
              <LocalInput
                type={showPassword ? "text" : "password"}
                value={data.connectionString || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdateField("connectionString", val);
                  if (val.includes("postgresql://") || val.includes("postgres://") || val.includes("DATABASE_URL")) {
                    handleParseAndApply(val);
                  }
                }}
                debounceMs={300}
                placeholder="postgresql://user:password@ep-sample.region.neon.tech/neondb?sslmode=require"
                className="h-8 text-xs font-mono pr-8"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Primary direct connection URI used for schema migrations, admin tasks, and direct database access.
            </p>
          </div>

          {/* Pooled Connection String (DATABASE_URL_POOLED) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Label className="text-xs font-semibold">
                  Pooled Connection URL (DATABASE_URL_POOLED)
                </Label>
                <span title="Connection pooler URI for serverless functions (Next.js, Vercel, AWS Lambda) using PgBouncer or Supavisor">
                  <HelpCircle size={11} className="text-muted-foreground" />
                </span>
              </div>
              {data.connectionString && currentProvider === "neon" && !data.connectionStringPooled && (
                <button
                  type="button"
                  onClick={() => {
                    const derived = deriveNeonPooledUrl(data.connectionString || "");
                    if (derived) {
                      onUpdateField("connectionStringPooled", derived);
                      toast.success("Derived Neon pooled connection URL!");
                    }
                  }}
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium hover:underline flex items-center gap-1"
                >
                  <Zap size={10} />
                  Auto-derive Neon pooler
                </button>
              )}
            </div>

            <LocalInput
              type={showPassword ? "text" : "password"}
              value={data.connectionStringPooled || ""}
              onChange={(e) => onUpdateField("connectionStringPooled", e.target.value)}
              debounceMs={300}
              placeholder="postgresql://user:password@ep-sample-pooler.region.neon.tech/neondb?sslmode=require"
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Recommended for serverless & edge routes to prevent connection pooling exhaustion.
            </p>
          </div>

          {/* SSL Mode */}
          <div className="flex items-center justify-between pt-1 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-emerald-500" />
              <span className="text-xs font-medium">SSL Mode</span>
            </div>
            <Select
              value={data.sslMode || "require"}
              onValueChange={(val) => onUpdateField("sslMode", val)}
            >
              <SelectTrigger className="h-7 text-[11px] w-[130px] font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="require" className="text-xs">
                  require (Default)
                </SelectItem>
                <SelectItem value="prefer" className="text-xs">
                  prefer
                </SelectItem>
                <SelectItem value="disable" className="text-xs">
                  disable (Local)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
