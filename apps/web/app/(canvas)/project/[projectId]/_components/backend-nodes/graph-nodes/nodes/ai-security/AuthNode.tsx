import React from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { ShieldCheck, Settings, Database, Table, Wand2, CheckCircle2, KeyRound, Copy, Check, ExternalLink } from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { NodeHeader } from "../../common";
import { Textarea } from "@workspace/ui/components/textarea";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  AUTH_FRAMEWORK_BETTER_AUTH,
  AUTH_FRAMEWORK_OPTIONS,
  BETTER_AUTH_VERSIONS,
  DEFAULT_AUTH_FRAMEWORK,
  DEFAULT_BETTER_AUTH_VERSION,
  AuthFramework,
  DatabaseEngine,
  BACKEND_NODE_ENTITY,
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
  resolveAuthRoles,
} from "@workspace/canvas";
import { useBetterAuthTableSync } from "../../../../config-sidebar/auth-config/core-entities";
import { useTestUsersStore } from "../../../../test-users/useTestUsersStore";
import { isRealJwt, formatBearerHeader } from "../../../../test-users/tokenGenerator";
import { toast } from "sonner";

function isAuthFramework(val: string): val is AuthFramework {
  return AUTH_FRAMEWORK_OPTIONS.some((o) => o.value === val);
}

export const AuthNode = ({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const edges = useBackendCanvasStore((s) => s.edges);
  const allNodes = useBackendCanvasStore((s) => s.nodes);

  const updateData = (changes: Partial<BackendNode["data"]>) =>
    updateNode(id, { data: { ...data, ...changes } });

  const framework = data.framework || DEFAULT_AUTH_FRAMEWORK;
  // Gate Better Auth–specific node controls (plugins, DB table sync, Redis secondaryStorage, JWKS pills)
  // so future auth providers can render their own provider-native configuration cleanly.
  const isBetterAuth = framework === AUTH_FRAMEWORK_BETTER_AUTH;
  const version = data.version || DEFAULT_BETTER_AUTH_VERSION;
  const databaseNodes = allNodes.filter((n) => n.type === "database");

  // Calculate connected WebApp / service apps
  const connectedAppsCount = edges.filter(
    (e) => e.source === id || e.target === id,
  ).length;

  // Check if Payments node is connected via injects-plugin handle
  const isPaymentsPluginInjected = edges.some(
    (e) => e.target === id && e.targetHandle === "payments-plugin-in",
  );

  const enabledPlugins = data.plugins || ["bearer", "admin", "organization", "jwt"];
  const isJwksEnabled = enabledPlugins.includes("jwt");
  const isRedisSecondaryEnabled = Boolean(data.secondaryStorage?.enabled);
  const { allRoles } = resolveAuthRoles(data);

  const orgConfig = data.organization || { enabled: true };
  const isOrgEnabled = orgConfig.enabled ?? true;
  const selectedDatabaseId = data.databaseId;

  const schemaEntities = React.useMemo(
    () =>
      allNodes.filter(
        (n) =>
          n.type === BACKEND_NODE_ENTITY &&
          (!selectedDatabaseId || n.data?.databaseId === selectedDatabaseId),
      ),
    [allNodes, selectedDatabaseId],
  );

  const {
    mappedCount,
    totalTables,
    autoCreateAllMissingTables,
  } = useBetterAuthTableSync({
    data,
    updateData,
    nodeId: id,
    selectedDatabaseId,
    schemaEntities,
    isOrgEnabled,
  });

  const isAllTablesMapped = mappedCount >= totalTables && totalTables > 0;

  const personas = useTestUsersStore((s) => s.personas);
  const [selectedPersonaId, setSelectedPersonaId] = React.useState<string>(
    personas[0]?.id || "",
  );
  const [copiedToken, setCopiedToken] = React.useState(false);

  React.useEffect(() => {
    if (!selectedPersonaId && personas.length > 0) {
      setSelectedPersonaId(personas[0]?.id || "");
    }
  }, [personas, selectedPersonaId]);

  const activePersona =
    personas.find((p) => p.id === selectedPersonaId) || personas[0];

  const handleCopyBearerToken = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activePersona?.activeAuthToken) {
      toast.error("No active token found for selected persona");
      return;
    }
    const bearer = formatBearerHeader(activePersona.activeAuthToken);
    navigator.clipboard.writeText(bearer);
    setCopiedToken(true);
    toast.success(`Copied: Authorization: ${bearer.slice(0, 32)}...`, {
      description: "Paste into Postman, cURL, or endpoint test headers",
    });
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div
      className={cn(
        "shadow-xl rounded-xl bg-card border-2 min-w-[300px] max-w-[370px] flex flex-col relative transition-all duration-200",
        selected ? "border-indigo-500" : "border-border",
      )}
    >
      {/* Target input handle from Payments node (Plugin injection) */}
      <Handle
        type="target"
        position={Position.Left}
        id="payments-plugin-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "!bg-emerald-500 rounded-full border-2 border-background",
        )}
        style={{ top: "18px" }}
        title="Connect Creem Payments node to inject plugin"
      />

      {/* Target input handle for standard request input */}
      <Handle
        type="target"
        position={Position.Left}
        id="auth-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "!bg-indigo-500 rounded-full border-2 border-background",
        )}
        style={{ top: "54px" }}
        title="Auth Request Input"
      />

      {/* Source output handle to WebApp / Services */}
      <Handle
        type="source"
        position={Position.Right}
        id="auth-out"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
          "!bg-indigo-500 rounded-full border-2 border-background",
        )}
        style={{ top: "50%" }}
        title="Auth Server Handle -> Connect to WebApp"
      />

      <NodeHeader
        id={id}
        data={data}
        icon={ShieldCheck}
        title="Auth Server"
        colorClass="bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
        selected={selected}
      />

      {/* Info bar: Connected Apps & Configured Roles Count */}
      <div className="px-3 py-1.5 bg-muted/60 border-b flex items-center justify-between gap-2 nodrag text-[10px]">
        <span className="text-muted-foreground font-mono">
          {connectedAppsCount} {connectedAppsCount === 1 ? "app" : "apps"} connected
        </span>
        <span
          className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono"
          title={`Configured RBAC roles: ${allRoles.join(", ")}`}
        >
          {allRoles.length} {allRoles.length === 1 ? "role" : "roles"}
        </span>
      </div>

      <div className="px-3 py-2 bg-secondary/5 nodrag">
        <Textarea
          className="min-h-[20px] text-xs bg-transparent border-none shadow-none p-1 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          placeholder="Auth service description..."
          value={data.description || ""}
          onChange={(e) => updateData({ description: e.target.value })}
        />
      </div>

      {/* Better Auth–only Controls: Plugins, Multi-Server Status, DB Selector & Auto-Table Generator */}
      {isBetterAuth ? (
        <>
          {/* Plugin Pills & Injections Bar */}
          <div className="px-3 py-2 border-t border-border/50 flex flex-wrap gap-1 bg-background/50 nodrag">
            {enabledPlugins.slice(0, 5).map((plugin) => (
              <span
                key={plugin}
                className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-medium capitalize"
              >
                {plugin}
              </span>
            ))}
            {isJwksEnabled && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25 font-mono font-medium"
                title="Exposes /api/auth/jwks for stateless multi-server verification"
              >
                JWKS
              </span>
            )}
            {isRedisSecondaryEnabled && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25 font-mono font-medium"
                title="Sessions & rate limits offloaded to Redis secondaryStorage"
              >
                + Redis Store
              </span>
            )}
            {isPaymentsPluginInjected && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-medium">
                + Creem Plugin
              </span>
            )}
          </div>

          {/* Database Node Selector */}
          <div className="px-3 py-1.5 bg-muted/30 border-t border-border/50 flex items-center justify-between gap-2 nodrag">
            <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
              <Database className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-[10.5px] font-medium text-foreground">DB:</span>
            </div>
            <Select
              value={data.databaseId || "none"}
              onValueChange={(val: string) => {
                if (val === "none") {
                  updateData({ databaseId: undefined, dbEngine: undefined });
                } else {
                  const selectedDb = databaseNodes.find((db) => db.id === val);
                  const dbEngine: DatabaseEngine = selectedDb?.data?.dbEngine || "postgres";
                  updateData({
                    databaseId: val,
                    dbEngine,
                    dbAdapter:
                      dbEngine === "postgres"
                        ? "postgres"
                        : dbEngine === "sqlite"
                        ? "sqlite-raw"
                        : dbEngine,
                  });
                }
              }}
            >
              <SelectTrigger className="h-6 text-[11px] font-mono px-2 py-0.5 max-w-[200px] bg-background/80 border border-border nodrag focus:ring-0 shadow-none truncate">
                <SelectValue placeholder="Select Database..." />
              </SelectTrigger>
              <SelectContent className="nodrag font-mono">
                <SelectItem value="none" className="text-xs font-mono text-muted-foreground">
                  All Tables (No DB Filter)
                </SelectItem>
                {databaseNodes.map((db) => (
                  <SelectItem key={db.id} value={db.id} className="text-xs font-mono">
                    {db.data?.label || "Database"} ({db.data?.dbEngine || "postgres"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto Table Generator Bar */}
          <div className="px-3 py-1.5 bg-indigo-500/5 border-t border-border/50 flex items-center justify-between gap-2 nodrag">
            <div className="flex items-center gap-1.5 min-w-0">
              <Table className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10.5px] font-medium leading-none text-foreground">
                  Tables:
                </span>
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded font-medium",
                    isAllTablesMapped
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  )}
                >
                  {mappedCount} / {totalTables}
                </span>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                autoCreateAllMissingTables();
              }}
              className={cn(
                "h-6 px-2 text-[10.5px] font-medium shrink-0 transition-colors gap-1",
                isAllTablesMapped
                  ? "bg-background hover:bg-muted text-muted-foreground hover:text-foreground border-border"
                  : "bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
              )}
              title={
                isAllTablesMapped
                  ? "Re-sync tables, column constraints & indexes"
                  : "Auto-generate missing Better Auth tables and link FK relationships"
              }
            >
              {isAllTablesMapped ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>Sync</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-3 h-3 text-indigo-500" />
                  <span>Auto-Generate</span>
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        /* Provider-agnostic external IdP summary bar when a non-Better-Auth provider is selected */
        <div className="px-3 py-2 border-t border-border/50 flex items-center justify-between gap-2 bg-background/50 nodrag text-[10px]">
          <span className="text-muted-foreground font-mono truncate">
            {data.baseUrl || "External JWKS / OIDC Provider"}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25 font-mono font-medium shrink-0">
            JWKS
          </span>
        </div>
      )}

      {/* Test Personas & Real Bearer Tokens Bar */}
      <div className="px-3 py-2 bg-indigo-500/[0.04] border-t border-border/50 flex flex-col gap-1.5 nodrag">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <KeyRound className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="text-[10.5px] font-semibold text-foreground">
              Test Bearer Tokens
            </span>
            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              {personas.length}
            </span>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setActiveConfigItem({
                type: "testUsers",
                id: "testUsers",
                nodeId: id,
              });
            }}
            className="h-5 px-1.5 text-[10px] text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 font-medium gap-1 cursor-pointer"
            title="Configure test user personas, seed data & tokens"
          >
            <span>Manage</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </Button>
        </div>

        {/* Quick Persona Selector & 1-Click Copy */}
        <div className="flex items-center gap-1.5">
          <Select
            value={activePersona?.id || ""}
            onValueChange={(val: string) => setSelectedPersonaId(val)}
          >
            <SelectTrigger className="h-6 text-[10.5px] font-mono px-2 py-0.5 flex-1 bg-background/80 border border-border nodrag focus:ring-0 shadow-none truncate">
              <SelectValue placeholder="Select Persona..." />
            </SelectTrigger>
            <SelectContent className="nodrag font-mono">
              {personas.map((p) => {
                const userRec = p.records.find((r) => r.tableName === "user");
                const role = userRec?.fields?.role || (p.name.toLowerCase().includes("admin") ? "admin" : "user");
                return (
                  <SelectItem key={p.id} value={p.id} className="text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">
                        ({String(role)})
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleCopyBearerToken}
            className="h-6 px-2 text-[10.5px] font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 gap-1 shrink-0 cursor-pointer"
            title="Copy Authorization: Bearer <token> for Postman or cURL testing"
          >
            {copiedToken ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy Bearer</span>
              </>
            )}
          </Button>
        </div>

        {/* Live Token Status Pill */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1 truncate font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="truncate">
              {activePersona?.activeAuthToken && isRealJwt(activePersona.activeAuthToken)
                ? "HS256 Signed JWT"
                : "Session Token"}
            </span>
          </span>
          <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
            Postman / cURL Ready
          </span>
        </div>
      </div>

      <div className="p-2.5 border-t border-border/50 flex items-center justify-between gap-2 bg-muted/20 nodrag">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Select
            value={framework}
            onValueChange={(val: string) => {
              if (isAuthFramework(val)) {
                const option = AUTH_FRAMEWORK_OPTIONS.find((o) => o.value === val);
                updateData({
                  framework: val,
                  provider: option?.label || "Better Auth",
                });
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs font-medium px-2 py-1 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 nodrag focus:ring-0 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="nodrag">
              {AUTH_FRAMEWORK_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {framework === "better_auth" && (
            <Select
              value={version}
              onValueChange={(val: string) => updateData({ version: val })}
            >
              <SelectTrigger className="h-7 w-[78px] text-[11px] font-mono px-1.5 py-1 bg-background/60 border border-border nodrag focus:ring-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="nodrag font-mono">
                {BETTER_AUTH_VERSIONS.map((ver) => (
                  <SelectItem key={ver.value} value={ver.value} className="text-xs font-mono">
                    {ver.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <button
          onClick={() =>
            setActiveConfigItem({
              type: "auth",
              id,
              nodeId: id,
            })
          }
          className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors nodrag shrink-0"
          title="Configure Auth Details"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
