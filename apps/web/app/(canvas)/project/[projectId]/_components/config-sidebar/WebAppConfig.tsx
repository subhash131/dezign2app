import React, { useState } from "react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Globe,
  Lock,
  Layers,
  ShieldCheck,
  Plus,
  Trash,
  Package,
  Settings,
  Database,
} from "lucide-react";
import { WebAppGlobalStoresTab } from "./WebAppGlobalStoresTab";
import {
  BackendNode,
  WEB_CLIENT_TECH_OPTIONS,
  WebClientTechStack,
  WebClientTechVersion,
} from "@/types/canvas";
import { WebAppZone } from "@workspace/canvas";
import { cn } from "@workspace/ui/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { NodePackageManager } from "./NodePackageManager";
import { NodeDependencyItem } from "@workspace/canvas";

function isWebClientTechStack(val: string): val is WebClientTechStack {
  return WEB_CLIENT_TECH_OPTIONS.some((t) => t.value === val);
}

function isWebClientTechVersion(val: string): val is WebClientTechVersion {
  return WEB_CLIENT_TECH_OPTIONS.some((t) => t.versions.some((v) => v.value === val));
}

export const WebAppConfig = ({
  id,
  nodeId,
}: {
  id: string;
  nodeId: string;
}) => {
  const node = useBackendCanvasStore((s) =>
    s.nodes.find((n) => n.id === nodeId),
  );
  const allNodes = useBackendCanvasStore((s) => s.nodes);
  const allEdges = useBackendCanvasStore((s) => s.edges);
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const [activeTab, setActiveTab] = useState<string>("settings");
  const [zoneToDelete, setZoneToDelete] = useState<{ id: string; name: string } | null>(null);

  if (!node) return null;

  const data = node.data;

  const updateData = (changes: Partial<typeof data>) => {
    updateNode(nodeId, { data: { ...data, ...changes } });
  };

  const appSlug =
    data.appSlug ||
    (data.label || "web-app").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const port = data.port || "3000";
  const defaultLoginRoute = data.defaultLoginRoute || "/login";
  const customDependencies: NodeDependencyItem[] = data.customDependencies || [];

  const authNodes = allNodes.filter((n) => n.type === "auth");
  const paymentsNodes = allNodes.filter((n) => n.type === "payments");

  // Determine auto-inferred web app dependencies
  const inferredWebDeps: { name: string; version: string; reason: string }[] = [
    { name: "next", version: "^16.0.0", reason: "Next.js App Router framework" },
    { name: "react", version: "^19.0.0", reason: "React 19 runtime" },
    { name: "react-dom", version: "^19.0.0", reason: "React DOM runtime" },
    { name: "@workspace/ui", version: "workspace:*", reason: "Shared Shadcn component library" },
    { name: "@workspace/types", version: "workspace:*", reason: "Shared API types & schemas" },
    { name: "@workspace/logger", version: "workspace:*", reason: "Structured frontend logger" },
    { name: "lucide-react", version: "^0.475.0", reason: "Standard UI icon set" },
    { name: "zod", version: "^3.24.2", reason: "Client form & schema validation" },
  ];

  const hasDb = allNodes.some((n) => n.type === "entity" || n.type === "database" || n.type === "db_ref");
  if (hasDb) {
    inferredWebDeps.push({ name: "@workspace/db", version: "workspace:*", reason: "Database models & client" });
  }

  const inferredWebDevDeps: { name: string; version: string; reason: string }[] = [
    { name: "@workspace/typescript-config", version: "workspace:*", reason: "Next.js TS configuration" },
    { name: "tailwindcss", version: "^4.0.0", reason: "Tailwind CSS v4 engine" },
    { name: "@tailwindcss/postcss", version: "^4.0.0", reason: "Tailwind PostCSS plugin" },
    { name: "@types/react", version: "^19.0.0", reason: "React TypeScript types" },
    { name: "@types/react-dom", version: "^19.0.0", reason: "React DOM TypeScript types" },
    { name: "@types/node", version: "^20.19.0", reason: "Node.js types" },
    { name: "typescript", version: "^5.7.3", reason: "TypeScript compiler" },
    { name: "vitest", version: "^1.6.0", reason: "Unit testing runner" },
  ];

  const zones: WebAppZone[] = data.zones || [
    {
      id: "zone-public",
      name: "Public Section",
      handleId: "public-in",
      accessType: "public",
      rule: {
        id: "rule-public",
        scope: "zone",
        conditions: { kind: "leaf", condition: { type: "auth", op: "signedOut" } },
        redirects: { default: "/login" },
      },
    },
    {
      id: "zone-private",
      name: "Private Section",
      handleId: "private-in",
      accessType: "protected",
      rule: {
        id: "rule-private",
        scope: "zone",
        conditions: { kind: "leaf", condition: { type: "auth", op: "signedIn" } },
        redirects: { "no-auth": "/login", default: "/login" },
      },
    },
  ];

  const handleAddZone = () => {
    const newZoneId = `zone-${Date.now()}`;
    const newZone: WebAppZone = {
      id: newZoneId,
      name: `Custom Section ${zones.length + 1}`,
      handleId: `${newZoneId}-in`,
      accessType: "protected",
      rule: {
        id: `rule-${newZoneId}`,
        scope: "zone",
        conditions: { kind: "leaf", condition: { type: "auth", op: "signedIn" } },
        redirects: { "no-auth": "/login", default: "/login" },
      },
    };
    updateData({ zones: [...zones, newZone] });
  };

  const handleRemoveZone = (zoneId: string) => {
    const updated = zones.filter((z) => z.id !== zoneId);
    updateData({ zones: updated });
  };

  // Find connected Auth Node (via explicit authNodeId, edge, or handle)
  const connectedAuthNode =
    (data.authNodeId
      ? allNodes.find((n) => n.id === data.authNodeId && n.type === "auth")
      : null) ||
    (() => {
      const edge = allEdges.find((e) => {
        if (e.target === nodeId) {
          const srcNode = allNodes.find((n) => n.id === e.source);
          return (
            srcNode?.type === "auth" ||
            e.targetHandle === "auth-in" ||
            e.sourceHandle === "auth-out"
          );
        }
        if (e.source === nodeId) {
          const tgtNode = allNodes.find((n) => n.id === e.target);
          return (
            tgtNode?.type === "auth" ||
            e.sourceHandle === "auth-in" ||
            e.targetHandle === "auth-out"
          );
        }
        return false;
      });
      if (!edge) return null;
      const authId = edge.source === nodeId ? edge.target : edge.source;
      return allNodes.find((n) => n.id === authId && n.type === "auth") || null;
    })() ||
    null;

  return (
    <div className="flex flex-col gap-6 mt-6 pb-12 text-foreground">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-border/50 pb-6">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-indigo-500/15 text-indigo-500 rounded border border-indigo-500/20 shadow-sm flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" /> WEB APP GATEWAY
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {data.label || "Web Application"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure application monorepo settings, connected backend services, and dynamic protection sections.
        </p>
      </div>

      {/* Tabs: Settings vs Packages vs Global Stores */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-3 p-1 bg-muted/50 rounded-lg mb-4">
          <TabsTrigger value="settings" className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background">
            <Settings className="w-3.5 h-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="packages" className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background">
            <Package className="w-3.5 h-3.5 text-primary" />
            Packages
            {customDependencies.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-primary/20 text-primary font-mono font-bold">
                {customDependencies.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="stores" className="text-xs flex items-center gap-1.5 data-[state=active]:bg-background">
            <Database className="w-3.5 h-3.5 text-indigo-500" />
            Global Stores
            {(data.globalStores?.length || 0) > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 text-indigo-500 font-mono font-bold">
                {data.globalStores!.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Settings */}
        <TabsContent value="settings" className="space-y-6">

      {/* App Identity Section */}
      <div className="flex flex-col gap-4 p-4 rounded-xl bg-card border border-border/60 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>App Identity & Monorepo Configuration</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">App Name</Label>
            <Input
              value={data.label || ""}
              onChange={(e) => {
                const label = e.target.value;
                const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                updateData({ label, appSlug: slug });
              }}
              placeholder="e.g. Customer Portal"
              className="h-8 text-xs bg-background/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Monorepo Slug (apps/...)</Label>
            <Input
              value={appSlug}
              onChange={(e) => updateData({ appSlug: e.target.value })}
              placeholder="e.g. customer-portal"
              className="h-8 text-xs font-mono bg-background/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-1">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Dev Server Port</Label>
            <Input
              value={port}
              onChange={(e) => updateData({ port: e.target.value })}
              placeholder="3000"
              className="h-8 text-xs font-mono bg-background/50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Default Auth Route</Label>
            <Input
              value={defaultLoginRoute}
              onChange={(e) => updateData({ defaultLoginRoute: e.target.value })}
              placeholder="/login"
              className="h-8 text-xs font-mono bg-background/50"
            />
          </div>
        </div>
      </div>

      {/* Authentication Service Section */}
      <div className="flex flex-col gap-4 p-4 rounded-xl bg-card border border-border/60 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className={cn("w-4 h-4", connectedAuthNode ? "text-indigo-400" : "text-muted-foreground")} />
            <span>Authentication Service</span>
          </div>
          {connectedAuthNode && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
              onClick={() =>
                setActiveConfigItem({
                  type: "auth",
                  id: connectedAuthNode.id,
                  nodeId: connectedAuthNode.id,
                })
              }
            >
              <Settings className="w-3.5 h-3.5 mr-1" /> Configure Auth
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs text-muted-foreground">Bound Auth Server Node</Label>
          <Select
            value={connectedAuthNode?.id || "none"}
            onValueChange={(val: string) => {
              updateData({ authNodeId: val === "none" ? undefined : val });
            }}
          >
            <SelectTrigger className="h-8 text-xs font-medium bg-background/50">
              <SelectValue placeholder="Select an Auth Node..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs text-muted-foreground">
                None (No Auth Connected)
              </SelectItem>
              {authNodes
                .filter((a) => Boolean(a && a.id && a.id.trim()))
                .map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    🔒 {a.data?.label || "Auth Server"} ({a.data?.framework || "Better Auth"})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">
            {connectedAuthNode
              ? `Wired to "${connectedAuthNode.data?.label || "Auth"}". Better Auth endpoints and client SDKs will be generated in apps/${appSlug}.`
              : "Connect an Auth Server node on the canvas or select one above to enable authentication."}
          </span>
        </div>
      </div>

      {/* Framework & Version Selection */}
      <div className="flex flex-col gap-4 p-4 rounded-xl bg-card border border-border/60 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Globe className="w-4 h-4 text-indigo-400" />
          <span>Framework & Version</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Framework</Label>
            <Select
              value={data.techStack || "nextjs"}
              onValueChange={(val: string) => {
                if (isWebClientTechStack(val)) {
                  const selectedTech = WEB_CLIENT_TECH_OPTIONS.find((t) => t.value === val);
                  const defaultVer = selectedTech?.defaultVersion;
                  updateData({
                    techStack: val,
                    ...(defaultVer && isWebClientTechVersion(defaultVer)
                      ? { techVersion: defaultVer }
                      : {}),
                  });
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs font-medium bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEB_CLIENT_TECH_OPTIONS
                  .filter((t) => Boolean(t && t.value && t.value.trim()))
                  .map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Version</Label>
            <Select
              value={
                data.techVersion ||
                WEB_CLIENT_TECH_OPTIONS.find(
                  (t) => t.value === (data.techStack || "nextjs"),
                )?.defaultVersion ||
                "16.x"
              }
              onValueChange={(val: string) => {
                if (isWebClientTechVersion(val)) {
                  updateData({ techVersion: val });
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs font-mono bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="font-mono">
                {(
                  WEB_CLIENT_TECH_OPTIONS.find(
                    (t) => t.value === (data.techStack || "nextjs"),
                  )?.versions || [{ value: "16.x", label: "16.x" }]
                )
                  .filter((v) => Boolean(v && v.value && v.value.trim()))
                  .map((v) => (
                    <SelectItem key={v.value} value={v.value} className="text-xs font-mono">
                      {v.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Dynamic Protection Sections Manager */}
      <div className="flex flex-col gap-4 p-4 rounded-xl bg-card border border-border/60 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Protected Sections / Clusters ({zones.length})</span>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs cursor-pointer" onClick={handleAddZone}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs"
            >
              <div className="flex items-center gap-2">
                {zone.accessType === "public" ? (
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-indigo-500" />
                )}
                <span className="font-medium text-foreground">{zone.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono">({zone.handleId})</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setActiveConfigItem({
                      type: "zone",
                      id: zone.id,
                      nodeId,
                    })
                  }
                >
                  <Settings className="w-3.5 h-3.5 mr-1" /> Config Rules
                </Button>
                {zone.id !== "zone-public" && (
                  <button
                    onClick={() => setZoneToDelete({ id: zone.id, name: zone.name })}
                    className="p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                    title={`Delete ${zone.name}`}
                  >
                    <Trash className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </TabsContent>

    {/* Tab 2: Packages & Libraries */}
    <TabsContent value="packages" className="pt-2">
          <NodePackageManager
            nodeId={nodeId}
            nodeType="webApp"
            customDependencies={customDependencies}
            onUpdateDependencies={(deps) => updateData({ customDependencies: deps })}
            inferredDependencies={inferredWebDeps}
            inferredDevDependencies={inferredWebDevDeps}
          />
        </TabsContent>

        {/* Tab 3: Global Stores (Zustand) */}
        <TabsContent value="stores" className="pt-2">
          <WebAppGlobalStoresTab
            stores={data.globalStores || []}
            onUpdateStores={(stores) => updateData({ globalStores: stores })}
          />
        </TabsContent>
      </Tabs>

      {/* Delete Section / Zone Dialog */}
      <AlertDialog open={!!zoneToDelete} onOpenChange={(open) => !open && setZoneToDelete(null)}>
        <AlertDialogContent
          onClick={(e) => e.stopPropagation()}
          className="bg-[#111216] border-zinc-800 text-zinc-100 max-w-md shadow-2xl ring-1 ring-white/10"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100 font-semibold">
              Delete Section "{zoneToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-xs leading-relaxed">
              Are you sure you want to delete this access control section from the Web App container? Connected page links to this section handle will be disconnected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setZoneToDelete(null)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 hover:text-zinc-100"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (zoneToDelete) {
                  handleRemoveZone(zoneToDelete.id);
                  setZoneToDelete(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              Delete Section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
