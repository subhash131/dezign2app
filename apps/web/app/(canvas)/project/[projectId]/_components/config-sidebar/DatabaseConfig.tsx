import React, { useState, useEffect } from "react";
import { Database, Key, Server, Plus, Table2, Trash, CheckCircle2, DatabaseZap, HardDrive, Radio, AlertTriangle, Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Switch } from "@workspace/ui/components/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { BackendNode, DEFAULT_DATABASE_ENV_VARS, getUniqueNodeLabel, getDefaultNodeEnvVars } from "@workspace/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { DatabaseConnectionCheckCard } from "./database-config/DatabaseConnectionCheckCard";
import { NodeEnvVarsSection } from "./NodeEnvVarsSection";
import type { EnvVarEntry } from "./NodeEnvVarsSection";

interface DatabaseConfigProps {
  id: string;
  nodeId: string;
}

type DatabaseEngine = NonNullable<BackendNode["data"]["dbEngine"]>;
type MaxmemoryPolicy = NonNullable<BackendNode["data"]["maxmemoryPolicy"]>;
type PersistenceMode = NonNullable<BackendNode["data"]["persistenceMode"]>;

function isDatabaseEngine(val: string): val is DatabaseEngine {
  return (
    val === "sqlite" ||
    val === "postgres" ||
    val === "mysql" ||
    val === "mongodb" ||
    val === "pinecone" ||
    val === "qdrant" ||
    val === "convex" ||
    val === "redis"
  );
}

function isMaxmemoryPolicy(val: string): val is MaxmemoryPolicy {
  return (
    val === "noeviction" ||
    val === "allkeys-lru" ||
    val === "volatile-lru" ||
    val === "allkeys-lfu" ||
    val === "volatile-lfu" ||
    val === "volatile-ttl" ||
    val === "allkeys-random" ||
    val === "volatile-random"
  );
}

function isPersistenceMode(val: string): val is PersistenceMode {
  return val === "None" || val === "RDB" || val === "AOF" || val === "RDB+AOF";
}

export function DatabaseConfig({ id, nodeId }: DatabaseConfigProps) {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const addNode = useBackendCanvasStore((s) => s.addNode);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);

  const dbNode = nodes.find((n) => n.id === nodeId);
  if (!dbNode) return null;

  const data = dbNode.data || {};
  const label = data.label || "Primary Database";
  const engine = data.dbEngine || "sqlite";
  const connStringEnv = data.connectionStringEnv || (engine === "redis" ? "REDIS_URL" : DEFAULT_DATABASE_ENV_VARS.connectionStringEnv);
  const dbFilePathEnv = data.dbFilePathEnv || DEFAULT_DATABASE_ENV_VARS.dbFilePathEnv;

  const [showPassword, setShowPassword] = useState(false);

  // Auto-seed default env vars if missing
  useEffect(() => {
    if (data.envVars === undefined) {
      const defaults = getDefaultNodeEnvVars("database", data);
      updateNode(nodeId, {
        data: { ...dbNode.data, envVars: defaults },
      });
    }
  }, [nodeId, data.envVars, dbNode?.data, updateNode]);

  const isRedis = dbNode.type === "redis_instance" || engine === "redis";
  const isSqlite = engine === "sqlite";
  const isPostgres = engine === "postgres";
  const isRelational = isSqlite || isPostgres || engine === "mysql";
  const dbFilePath = data.dbFilePath || "dev.db";

  // Check for other Redis instances on the canvas to identify port conflicts
  const allRedisInstances = nodes.filter(
    (n) =>
      (n.type === "redis_instance" || (n.type === "database" && n.data?.dbEngine === "redis")) &&
      n.id !== nodeId,
  );
  const currentPort = String(data.port ?? (isRedis ? "6379" : "5432"));
  const currentHost = data.host || "localhost";
  const portConflict = allRedisInstances.find((inst) => {
    const instPort = String(inst.data?.port || "6379");
    const instHost = inst.data?.host || "localhost";
    return instPort === currentPort && instHost === currentHost;
  });

  // Check if another database or redis node has the same label
  const duplicateNameConflict = nodes.find(
    (n) =>
      n.id !== nodeId &&
      (n.type === "database" || n.type === "redis_instance") &&
      (n.data?.label || "").trim().toLowerCase() === label.trim().toLowerCase() &&
      label.trim() !== "",
  );

  const attachedEntities = nodes.filter(
    (n) =>
      (n.type === "redis_schema" || n.type === "entity") &&
      n.data?.databaseId === nodeId &&
      (isRedis
        ? n.type === "redis_schema" || n.data?.dbType === "redis"
        : n.type !== "redis_schema" && n.data?.dbType !== "redis"),
  );

  const handleUpdateField = <K extends keyof BackendNode["data"]>(
    field: K,
    value: BackendNode["data"][K],
  ) => {
    updateNode(nodeId, {
      data: {
        ...data,
        [field]: value,
      },
    });
  };

  const handleAddTableToDb = () => {
    const tableId = crypto.randomUUID();
    const dbPos = dbNode.position || { x: 100, y: 100 };

    addNode({
      id: tableId,
      type: "entity",
      position: { x: dbPos.x, y: dbPos.y + 220 },
      data: {
        label: "",
        columns: [{ name: "id", type: "TEXT", isPrimaryKey: true }],
        indexes: [],
        databaseId: nodeId,
      },
    });

    addEdge({
      id: `edge-${nodeId}-${tableId}`,
      source: nodeId,
      target: tableId,
      sourceHandle: "database-source",
      targetHandle: "database-entity-target",
      type: "database-connection",
    });
  };

  const handleAddRedisSchemaToDb = () => {
    const schemaId = crypto.randomUUID();
    const dbPos = dbNode.position || { x: 100, y: 100 };

    addNode({
      id: schemaId,
      type: "redis_schema",
      position: { x: dbPos.x, y: dbPos.y + 220 },
      data: {
        label: "",
        dbType: "redis",
        redisDataStructure: "hash",
        keyTemplate: "",
        columns: [],
        hashConfig: {
          fields: [],
        },
        databaseId: nodeId,
      },
    });

    addEdge({
      id: `edge-${nodeId}-${schemaId}`,
      source: nodeId,
      target: schemaId,
      sourceHandle: "database-source",
      targetHandle: "database-entity-target",
      type: "database-connection",
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border/60">
        <div className={cn(
          "p-2.5 rounded-xl border",
          isRedis
            ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
            : "bg-amber-500/10 text-amber-500 border-amber-500/20"
        )}>
          {isRedis ? <DatabaseZap size={22} /> : <Database size={22} />}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight truncate">
              {label}
            </h2>
            <Badge variant="outline" className={cn(
              "text-[10px] uppercase font-mono",
              isRedis
                ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 font-semibold"
                : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
            )}>
              {engine}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure database connection environment variables, server settings & attached schemas.
          </p>
        </div>
      </div>

      {/* General Settings */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Server size={14} className={isRedis ? "text-red-500" : "text-amber-500"} />
          General Info
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Database Label</Label>
          <Input
            value={label}
            onChange={(e) => handleUpdateField("label", e.target.value)}
            placeholder="e.g. Primary Redis Cache"
            className={cn("h-8 text-xs", duplicateNameConflict && "border-destructive focus-visible:ring-destructive")}
          />
          {duplicateNameConflict && (
            <p className="text-[11px] text-destructive font-medium flex items-center gap-1 mt-1">
              <AlertTriangle size={12} className="shrink-0" />
              Another database or Redis instance already uses &quot;{label}&quot;. Database names must be unique.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Database Engine</Label>
          <Select
            value={engine}
            onValueChange={(val) => {
              if (isDatabaseEngine(val)) {
                if (val === "redis") {
                  updateNode(nodeId, {
                    data: {
                      ...data,
                      dbEngine: val,
                      connectionStringEnv: data.connectionStringEnv || "REDIS_URL",
                      port: data.port || "6379",
                    },
                  });
                } else if (val === "postgres") {
                  updateNode(nodeId, {
                    data: {
                      ...data,
                      dbEngine: val,
                      connectionStringEnv: data.connectionStringEnv || "DATABASE_URL",
                      port: data.port || "5432",
                      database: data.database || "postgres",
                      user: data.user || data.username || "postgres",
                    },
                  });
                } else {
                  handleUpdateField("dbEngine", val);
                }
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sqlite" className="text-xs">
                SQLite 3.x (Relational)
              </SelectItem>
              <SelectItem value="postgres" className="text-xs">
                PostgreSQL (Relational)
              </SelectItem>
              <SelectItem value="mysql" className="text-xs">
                MySQL (Relational)
              </SelectItem>
              <SelectItem value="mongodb" className="text-xs">
                MongoDB (Document)
              </SelectItem>
              <SelectItem value="redis" className="text-xs">
                Redis 7.x (Key-Value / Cache)
              </SelectItem>
              <SelectItem value="pinecone" className="text-xs">
                Pinecone (Vector)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Redis Server Instance-Wide Configurations (maxmemory-policy & persistence) */}
      {isRedis && (
        <div className="space-y-4 pt-2 border-t border-border/40">
          <h3 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <DatabaseZap size={14} />
            Redis Instance Server Configurations (Server-Wide)
          </h3>

          {/* Maxmemory Eviction Policy */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Eviction Policy (maxmemory-policy)</Label>
              <span className="text-[10px] text-muted-foreground font-mono">
                {data.maxmemoryPolicy || "volatile-lru"}
              </span>
            </div>
            <Select
              value={data.maxmemoryPolicy || "volatile-lru"}
              onValueChange={(val) => {
                if (isMaxmemoryPolicy(val)) {
                  handleUpdateField("maxmemoryPolicy", val);
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="volatile-lru" className="text-xs">
                  volatile-lru (Evict keys with TTL using approx. LRU)
                </SelectItem>
                <SelectItem value="allkeys-lru" className="text-xs">
                  allkeys-lru (Evict any key using approx. LRU)
                </SelectItem>
                <SelectItem value="volatile-lfu" className="text-xs">
                  volatile-lfu (Evict keys with TTL using LFU frequency)
                </SelectItem>
                <SelectItem value="allkeys-lfu" className="text-xs">
                  allkeys-lfu (Evict any key using LFU frequency)
                </SelectItem>
                <SelectItem value="volatile-ttl" className="text-xs">
                  volatile-ttl (Evict keys with TTL starting with shortest remaining)
                </SelectItem>
                <SelectItem value="noeviction" className="text-xs">
                  noeviction (Return OOM error on writes when full)
                </SelectItem>
                <SelectItem value="allkeys-random" className="text-xs">
                  allkeys-random (Evict random keys)
                </SelectItem>
                <SelectItem value="volatile-random" className="text-xs">
                  volatile-random (Evict random keys with TTL)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Applied instance-wide across all keys and namespaces on this Redis node.
            </p>
          </div>

          {/* Maxmemory Limit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Max Memory Limit (maxmemory)</Label>
              <Input
                value={data.maxmemory || "2gb"}
                onChange={(e) => handleUpdateField("maxmemory", e.target.value)}
                placeholder="e.g. 2gb or 512mb"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Persistence Mode</Label>
              <Select
                value={data.persistenceMode || "RDB+AOF"}
                onValueChange={(val) => {
                  if (isPersistenceMode(val)) {
                    handleUpdateField("persistenceMode", val);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RDB+AOF" className="text-xs">RDB + AOF (Recommended)</SelectItem>
                  <SelectItem value="AOF" className="text-xs">AOF (Append Only File)</SelectItem>
                  <SelectItem value="RDB" className="text-xs">RDB (Point-in-time snapshots)</SelectItem>
                  <SelectItem value="None" className="text-xs">None (In-Memory Only / Pure Cache)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Redis Cluster Mode Toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 border border-border/40">
            <div className="flex flex-col">
              <span className="text-xs font-semibold">Redis Cluster Mode</span>
              <span className="text-[10px] text-muted-foreground">
                Enables hash-slot sharding across cluster master nodes
              </span>
            </div>
            <Switch
              checked={data.clustering ?? false}
              onCheckedChange={(checked) => handleUpdateField("clustering", checked)}
              className="scale-90"
            />
          </div>
        </div>
      )}

      {/* Network & Host / Port Configuration (or Embedded File Configuration for SQLite) */}
      <div className="space-y-4 pt-2 border-t border-border/40">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            {isSqlite ? (
              <Database size={14} className="text-amber-500" />
            ) : (
              <Radio size={14} className={isRedis ? "text-red-500" : "text-amber-500"} />
            )}
            {isSqlite ? "Embedded Storage (File Database)" : "Network & Connection (Host & Port)"}
          </h3>
          {isRedis ? (
            <Badge
              variant="outline"
              className="text-[10px] font-mono px-1.5 py-0 bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 font-semibold"
            >
              :{currentPort}
            </Badge>
          ) : isSqlite ? (
            <Badge
              variant="outline"
              className="text-[10px] font-mono px-1.5 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-semibold"
            >
              Serverless (File)
            </Badge>
          ) : null}
        </div>

        {isSqlite ? (
          <div className="space-y-2.5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Database File Path</Label>
              <Input
                value={dbFilePath}
                onChange={(e) => handleUpdateField("dbFilePath", e.target.value)}
                placeholder="dev.db"
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Local SQLite database file. No background server daemon or TCP port required.
              </p>
            </div>
            <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground text-[10px] uppercase font-sans font-bold">URI:</span>
              <code className="text-amber-600 dark:text-amber-400 text-xs font-bold truncate">
                sqlite:{dbFilePath}
              </code>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Host & Port */}
            <div className="grid grid-cols-3 gap-3">
              {/* Host */}
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Host / Hostname</Label>
                <Input
                  value={data.host || "localhost"}
                  onChange={(e) => handleUpdateField("host", e.target.value)}
                  placeholder="localhost or 127.0.0.1"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  {isRedis ? "Redis daemon binding host (local or remote)." : "Database host address."}
                </p>
              </div>

              {/* Port */}
              <div className="col-span-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Port</Label>
                  {portConflict && (
                    <span title={`Conflict with ${portConflict.data?.label || "another instance"}`}>
                      <AlertTriangle size={12} className="text-amber-500" />
                    </span>
                  )}
                </div>
                <Input
                  type="number"
                  value={data.port ?? (isRedis ? "6379" : "5432")}
                  onChange={(e) => {
                    const val = e.target.value ? e.target.value : undefined;
                    handleUpdateField("port", val);
                  }}
                  placeholder={isRedis ? "6379" : "5432"}
                  className={cn(
                    "h-8 text-xs font-mono",
                    portConflict && "border-amber-500/70 focus-visible:ring-amber-500/50"
                  )}
                />
                <p className="text-[10px] text-muted-foreground">
                  {isRedis ? "Default: 6379" : "Port"}
                </p>
              </div>
            </div>

            {/* Relational / PostgreSQL Credentials: Database Name, Username, Password */}
            {isRelational && !isSqlite && (
              <div className="space-y-3 pt-2 border-t border-border/40">
                {/* Database Name */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Database Name</Label>
                  <Input
                    value={data.database ?? (isPostgres ? "postgres" : "")}
                    onChange={(e) => handleUpdateField("database", e.target.value)}
                    placeholder={isPostgres ? "postgres" : "my_database"}
                    className="h-8 text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Target database on the server (default: {isPostgres ? "postgres" : "database"}).
                  </p>
                </div>

                {/* Username & Password */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Username</Label>
                    <Input
                      value={data.user ?? data.username ?? (isPostgres ? "postgres" : "root")}
                      onChange={(e) => handleUpdateField("user", e.target.value)}
                      placeholder={isPostgres ? "postgres" : "root"}
                      className="h-8 text-xs font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      User role with read/write access.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={data.password || ""}
                        onChange={(e) => handleUpdateField("password", e.target.value)}
                        placeholder="••••••••"
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
                      User password (leave empty if none).
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Port Conflict Alert */}
        {portConflict && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
            <AlertTriangle size={14} className="shrink-0 text-amber-500" />
            <span className="text-[11px] leading-tight">
              <strong>Port conflict:</strong> &quot;{portConflict.data?.label || "Another Redis Instance"}&quot; is also assigned port <strong>{currentPort}</strong> on <strong>{currentHost}</strong>. Assign unique ports (e.g. 6379, 6380, 6381) to avoid collision when running multiple instances.
            </span>
          </div>
        )}

        {/* Connection URL Live Preview for Redis */}
        {isRedis && (
          <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 flex items-center justify-between text-xs font-mono">
            <span className="text-muted-foreground text-[10px] uppercase font-sans font-bold">URI Preview:</span>
            <code className="text-red-600 dark:text-red-400 text-xs font-bold truncate">
              redis://{currentHost}:{currentPort}
            </code>
          </div>
        )}

        {/* Connection URL Live Preview for PostgreSQL */}
        {isPostgres && (
          <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/40 flex items-center justify-between text-xs font-mono">
            <span className="text-muted-foreground text-[10px] uppercase font-sans font-bold">URI Preview:</span>
            <code
              className="text-blue-600 dark:text-blue-400 text-xs font-bold truncate"
              title={`postgresql://${data.user || data.username || "postgres"}:${data.password ? "••••••••" : ""}@${currentHost}:${currentPort}/${data.database || "postgres"}`}
            >
              postgresql://{data.user || data.username || "postgres"}:{data.password ? "••••••••" : ""}@{currentHost}:{currentPort}/{data.database || "postgres"}
            </code>
          </div>
        )}

        {/* Live Connection Health Check Card */}
        <DatabaseConnectionCheckCard
          nodeId={nodeId}
          engine={engine}
          host={currentHost}
          port={currentPort}
          database={data.database}
          user={data.user || data.username}
          password={data.password}
          connectionStringEnv={connStringEnv}
          dbFilePath={dbFilePath}
          dbFilePathEnv={dbFilePathEnv}
          lastStatus={data.lastConnectionStatus}
          onStatusUpdate={(status) => handleUpdateField("lastConnectionStatus", status)}
        />
      </div>

      {/* Environment Variable Configurations */}
      <div className="space-y-4 pt-2 border-t border-border/40">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Key size={14} className={isRedis ? "text-red-500" : "text-amber-500"} />
          Environment Variables (Predefined & Editable)
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Connection String ENV Key</Label>
          <Input
            value={connStringEnv}
            onChange={(e) => handleUpdateField("connectionStringEnv", e.target.value)}
            placeholder="e.g. REDIS_URL or DATABASE_URL"
            className="h-8 text-xs font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Environment variable holding the connection URI (`process.env.{connStringEnv}`).
          </p>
        </div>

        {engine === "sqlite" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">DB File Path ENV Key</Label>
            <Input
              value={dbFilePathEnv}
              onChange={(e) => handleUpdateField("dbFilePathEnv", e.target.value)}
              placeholder="e.g. DB_FILE_PATH"
              className="h-8 text-xs font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Environment variable for SQLite database file path (`process.env.{dbFilePathEnv}`).
            </p>
          </div>
        )}
      </div>

      {/* Hanging / Attached Schemas & Tables */}
      <div className="space-y-3 pt-2 border-t border-border/40">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            {isRedis ? <DatabaseZap size={14} className="text-red-500" /> : <Table2 size={14} className="text-amber-500" />}
            Attached Schemas ({attachedEntities.length})
          </h3>
          <div className="flex items-center gap-1.5">
            {isRedis ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                onClick={handleAddRedisSchemaToDb}
              >
                <Plus size={12} className="mr-1 text-red-500" />
                Add Redis Schema
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                onClick={handleAddTableToDb}
              >
                <Plus size={12} className="mr-1 text-amber-500" />
                Add Table
              </Button>
            )}
          </div>
        </div>

        {attachedEntities.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
            No schemas currently attached to this database. Click &quot;+ Add&quot; above or connect on the canvas.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {attachedEntities.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/40 border border-border/50 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 size={14} className={isRedis ? "text-red-500 shrink-0" : "text-amber-500 shrink-0"} />
                  <span className="font-semibold truncate">{t.data.label || "Schema"}</span>
                  {t.data.dbType === "redis" && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 uppercase font-mono">
                      {t.data.redisDataStructure || "HASH"}
                    </Badge>
                  )}
                  {t.data.keyTemplate && (
                    <span className="text-[10px] text-muted-foreground font-mono truncate">
                      {t.data.keyTemplate}
                    </span>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  title="Unlink from DB"
                  onClick={() => {
                    updateNode(t.id, {
                      data: { ...t.data, databaseId: undefined },
                    });
                    const store = useBackendCanvasStore.getState();
                    const edge = store.edges.find(
                      (e) => e.source === nodeId && e.target === t.id,
                    );
                    if (edge) store.deleteEdge(edge.id);
                  }}
                >
                  <Trash size={12} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Environment Variables (package mode — injected into connecting apps) */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <NodeEnvVarsSection
          mode="package"
          nodeKindLabel="database"
          envVars={(data.envVars as EnvVarEntry[] | undefined) ?? []}
          defaultEnvVars={getDefaultNodeEnvVars("database", data)}
          onLoadDefaults={() =>
            updateNode(nodeId, {
              data: { ...dbNode.data, envVars: getDefaultNodeEnvVars("database", data) },
            })
          }
          onChange={(updated) =>
            updateNode(nodeId, {
              data: { ...dbNode.data, envVars: updated },
            })
          }
        />
      </div>
    </div>
  );
}

