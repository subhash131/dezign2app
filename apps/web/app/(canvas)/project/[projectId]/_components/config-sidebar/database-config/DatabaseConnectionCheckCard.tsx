import React, { useState } from "react";
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  Cpu,
  Clock,
  ExternalLink,
  AlertCircle,
  Database,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";
import { checkDatabaseConnection } from "@/lib/services/databaseService";

interface ConnectionStatusData {
  connected: boolean;
  latencyMs?: number;
  checkedAt?: string;
  serverInfo?: Record<string, unknown>;
  error?: string;
}

interface DatabaseConnectionCheckCardProps {
  nodeId: string;
  engine: string;
  host: string;
  port: string | number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  connectionStringEnv?: string;
  connectionStringPooled?: string;
  connectionStringPooledEnv?: string;
  sslMode?: string;
  provider?: string;
  dbFilePath?: string;
  dbFilePathEnv?: string;
  lastStatus?: ConnectionStatusData;
  onStatusUpdate?: (status: ConnectionStatusData) => void;
}

export const DatabaseConnectionCheckCard: React.FC<DatabaseConnectionCheckCardProps> = ({
  nodeId,
  engine,
  host,
  port,
  database,
  user,
  password,
  connectionString,
  connectionStringEnv,
  connectionStringPooled,
  connectionStringPooledEnv,
  sslMode,
  provider,
  dbFilePath,
  dbFilePathEnv,
  lastStatus,
  onStatusUpdate,
}) => {
  const [checking, setChecking] = useState(false);
  const [localStatus, setLocalStatus] = useState<ConnectionStatusData | undefined>(lastStatus);

  const isRedis = engine === "redis";
  const isSqlite = engine === "sqlite";
  const isPostgres = engine === "postgres" || engine === "postgresql" || engine === "pg";
  const status = localStatus || lastStatus;
  const isConnected = status?.connected === true;
  const isFailed = status?.connected === false;

  const currentHost = host || "127.0.0.1";
  const currentPort = port || (isRedis ? 6379 : isSqlite ? undefined : 5432);
  const uri = isRedis
    ? `redis://${currentHost}:${currentPort}`
    : isSqlite
      ? `sqlite:${dbFilePath || "dev.db"}`
      : isPostgres
        ? `postgresql://${user || "postgres"}:${password ? "••••" : ""}@${currentHost}:${currentPort}/${database || "postgres"}`
        : `${currentHost}:${currentPort}`;

  const handleCheckConnection = async () => {
    setChecking(true);
    try {
      console.log("[DatabaseConnectionCheckCard] Testing live connection...", { engine, currentHost, currentPort, provider });
      const data = await checkDatabaseConnection({
        engine,
        connection: {
          host: currentHost,
          port: currentPort,
          database,
          user,
          password,
          connectionString: connectionString || connectionStringPooled,
          connectionStringEnv,
          connectionStringPooled,
          connectionStringPooledEnv,
          sslMode,
          provider,
          dbFilePath,
          dbFilePathEnv,
        },
      });

      const updated: ConnectionStatusData = {
        connected: !!data.success,
        latencyMs: data.latencyMs,
        checkedAt: new Date().toLocaleTimeString(),
        serverInfo: data.info,
        error: data.error,
      };

      setLocalStatus(updated);
      onStatusUpdate?.(updated);
    } catch (err) {
      const updated: ConnectionStatusData = {
        connected: false,
        latencyMs: 0,
        checkedAt: new Date().toLocaleTimeString(),
        error: err instanceof Error ? err.message : "Network error testing connection",
      };
      setLocalStatus(updated);
      onStatusUpdate?.(updated);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 transition-all space-y-3",
        isConnected
          ? "bg-emerald-500/5 border-emerald-500/30 dark:bg-emerald-950/10"
          : isFailed
            ? "bg-destructive/5 border-destructive/30 dark:bg-destructive/10"
            : "bg-muted/30 border-border/50",
      )}
    >
      {/* Top Header: Title & Connection Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "p-1.5 rounded-lg border",
              isConnected
                ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
                : isFailed
                  ? "bg-destructive/20 text-destructive border-destructive/30"
                  : "bg-muted text-muted-foreground border-border/50",
            )}
          >
            {isSqlite ? (
              <Database size={14} className={checking ? "animate-pulse" : ""} />
            ) : (
              <Activity size={14} className={checking ? "animate-pulse" : ""} />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold leading-tight">
              {isSqlite ? "Embedded DB File Test" : "Live Connection Test"}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
              {uri}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {isConnected ? (
            <Badge
              variant="outline"
              className="bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold gap-1 py-0.5 px-2"
            >
              <CheckCircle2 size={11} className="text-emerald-500" />
              {isSqlite ? "Ready" : "Connected"}
              {status.latencyMs !== undefined && (
                <span className="font-mono text-[9px] opacity-80">({status.latencyMs}ms)</span>
              )}
            </Badge>
          ) : isFailed ? (
            <Badge
              variant="outline"
              className="bg-destructive/15 border-destructive/40 text-destructive text-[10px] font-semibold gap-1 py-0.5 px-2"
            >
              <XCircle size={11} />
              Offline
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-muted text-muted-foreground border-border/40 text-[10px] py-0.5 px-2"
            >
              Untested
            </Badge>
          )}
        </div>
      </div>

      {/* Connected Server Metrics */}
      {isConnected && status?.serverInfo && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="p-2 rounded-lg bg-background/80 border border-border/40 flex flex-col">
            <span className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              {isSqlite ? <Database size={10} /> : <Server size={10} />} {isSqlite ? "Engine" : "Version"}
            </span>
            <span className="text-xs font-mono font-semibold truncate text-foreground mt-0.5">
              {String(status.serverInfo.version || status.serverInfo.rawVersion || (isSqlite ? "SQLite 3" : "7.x"))}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-background/80 border border-border/40 flex flex-col">
            <span className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Cpu size={10} /> {isSqlite ? "File Status" : "Memory"}
            </span>
            <span className="text-xs font-mono font-semibold truncate text-foreground mt-0.5">
              {String(status.serverInfo.status || status.serverInfo.usedMemory || (isSqlite ? "Embedded" : "N/A"))}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-background/80 border border-border/40 flex flex-col">
            <span className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Clock size={10} /> Latency
            </span>
            <span className="text-xs font-mono font-semibold text-emerald-500 mt-0.5">
              {status.latencyMs ?? 0} ms
            </span>
          </div>
        </div>
      )}

      {/* Disconnection Warning & Actionable Guidance */}
      {isFailed && (
        <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive space-y-1">
          <div className="flex items-start gap-1.5">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5 leading-relaxed">
              <span className="font-semibold text-[11px]">
                {isSqlite ? "Cannot access database file" : "Cannot reach server"}
              </span>
              <span className="text-[10px] opacity-90">{status?.error}</span>
            </div>
          </div>
          {isRedis ? (
            <div className="mt-1 pt-1 border-t border-destructive/20 text-[10px] text-muted-foreground font-mono">
              💡 Tip: Run <code className="text-foreground bg-muted/60 px-1 py-0.5 rounded">redis-server</code> in your terminal or start your Docker container.
            </div>
          ) : isSqlite ? (
            <div className="mt-1 pt-1 border-t border-destructive/20 text-[10px] text-muted-foreground font-mono">
              💡 Tip: SQLite database file is initialized automatically on first application write, or verify the file path.
            </div>
          ) : null}
        </div>
      )}

      {/* Action Footer: Check Button & Last Checked Timestamp */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-muted-foreground">
          {status?.checkedAt ? `Last verified at ${status.checkedAt}` : "Ping live server to verify connection"}
        </span>

        <Button
          size="sm"
          variant={isConnected ? "outline" : "default"}
          disabled={checking}
          onClick={handleCheckConnection}
          className={cn(
            "h-7 text-xs gap-1.5 cursor-pointer font-medium",
            isConnected && "hover:border-emerald-500/50 hover:text-emerald-500",
          )}
        >
          <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
          {checking ? "Checking..." : isConnected ? "Re-check" : "Check Connection"}
        </Button>
      </div>
    </div>
  );
};
