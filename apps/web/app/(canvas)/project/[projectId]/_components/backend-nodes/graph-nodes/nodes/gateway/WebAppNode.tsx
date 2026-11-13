import React, { useState, useMemo } from "react";
import { NodeProps, Handle, Position, NodeChange } from "@xyflow/react";
import {
  Globe,
  Lock,
  Settings,
  ShieldCheck,
  Plus,
  Trash,
  LayoutTemplate,
  CornerDownRight,
  CreditCard,
  Layers,
  KeyRound,
} from "lucide-react";
import { BackendNode } from "@/types/canvas";
import { toast } from "sonner";
import { WebAppZone } from "@workspace/canvas/types";
import { normalizePageRoute, parseRouteWithQueryParams } from "@workspace/canvas";
import {
  CANVAS_HANDLE_CLASS,
  CANVAS_HANDLE_LEFT_OFFSET_CLASS,
  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
} from "@workspace/canvas/constants";
import { cn } from "@workspace/ui/lib/utils";
import { Badge } from "@workspace/ui/components/badge";
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
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useShallow } from "zustand/react/shallow";
import { NodeHeader } from "../../common";
import { NodeEnvVarsSection } from "../ai-security/ExternalEnvVarsDrawer";
import { toggleZoneHandLayout } from "./web-page";

const DEFAULT_REDIRECTS = {
  "no-auth": "/login",
  "no-org": "/select-org",
  "wrong-role": "/unauthorized",
  "no-access": "/pricing",
  "wrong-plan": "/pricing",
  default: "/login",
};

const DEFAULT_ZONES: WebAppZone[] = [
  {
    id: "zone-public",
    name: "Public Section",
    handleId: "public-in",
    accessType: "public",
    hasLayout: false,
    layoutDescription: "Public layout with top navigation bar, logo, and auth links",
    rule: {
      id: "rule-public",
      scope: "zone",
      conditions: { kind: "leaf", condition: { type: "auth", op: "signedOut" } },
      redirects: { ...DEFAULT_REDIRECTS },
    },
  },
  {
    id: "zone-private",
    name: "Private Section",
    handleId: "private-in",
    accessType: "protected",
    hasLayout: false,
    layoutDescription: "Protected app layout with sidebar navigation, user profile, and session check",
    rule: {
      id: "rule-private",
      scope: "zone",
      conditions: { kind: "leaf", condition: { type: "auth", op: "signedIn" } },
      redirects: { ...DEFAULT_REDIRECTS },
    },
  },
];

export const WebAppNode = React.memo(({
  id,
  data,
  selected,
}: NodeProps<BackendNode>) => {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const activeConfigItem = useBackendCanvasStore(
    (s) => s.activeConfigItem,
  );
  const setActiveConfigItem = useBackendCanvasStore(
    (s) => s.setActiveConfigItem,
  );
  const deleteEdge = useBackendCanvasStore((s) => s.deleteEdge);
  const addNode = useBackendCanvasStore((s) => s.addNode);
  const addEdge = useBackendCanvasStore((s) => s.addEdge);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const [zoneToDelete, setZoneToDelete] = useState<{ id: string; name: string } | null>(null);
  const [layoutToDelete, setLayoutToDelete] = useState<{ zoneId: string; zoneName: string; nodeId: string } | null>(null);

  const selectThisNode = () => {
    const store = useBackendCanvasStore.getState();
    const selectChanges: NodeChange[] = store.nodes.map((n) => ({
      type: "select",
      id: n.id,
      selected: n.id === id,
    }));
    store.onNodesChange(selectChanges);
  };

  const appSlug =
    data.appSlug ||
    (data.label || "web-app").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const port = data.port || "3000";

  // Narrow subscription: Find connected Auth Node info without subscribing to nodes/edges array mutations
  const { isAuthConnected, authNodeLabel, connectedAuthNodeId } = useBackendCanvasStore(
    useShallow((s) => {
      const authNode =
        (data.authNodeId
          ? s.nodes.find((n) => n.id === data.authNodeId && n.type === "auth")
          : null) ||
        (() => {
          const edge = s.edges.find((e) => {
            if (e.target === id) {
              const srcNode = s.nodes.find((n) => n.id === e.source);
              return (
                srcNode?.type === "auth" ||
                e.targetHandle === "auth-in" ||
                e.sourceHandle === "auth-out"
              );
            }
            if (e.source === id) {
              const tgtNode = s.nodes.find((n) => n.id === e.target);
              return (
                tgtNode?.type === "auth" ||
                e.sourceHandle === "auth-in" ||
                e.targetHandle === "auth-out"
              );
            }
            return false;
          });
          if (!edge) return null;
          const authId = edge.source === id ? edge.target : edge.source;
          return s.nodes.find((n) => n.id === authId && n.type === "auth") || null;
        })() ||
        null;

      return {
        isAuthConnected: Boolean(authNode),
        authNodeLabel: authNode?.data?.label || "Auth",
        connectedAuthNodeId: authNode?.id || null,
      };
    }),
  );

  // User-defined zones or default zones
  const zones: WebAppZone[] = Array.isArray(data.zones) ? data.zones : DEFAULT_ZONES;

  const getDescendantZoneIds = (rootZoneId: string, allZones: WebAppZone[]): string[] => {
    const result: string[] = [rootZoneId];
    const queue: string[] = [rootZoneId];
    while (queue.length > 0) {
      const pId = queue.shift()!;
      const children = allZones.filter((z) => z.parentId === pId);
      for (const child of children) {
        if (!result.includes(child.id)) {
          result.push(child.id);
          queue.push(child.id);
        }
      }
    }
    return result;
  };

  const handleDeleteZone = (zoneId: string) => {
    const idsToDelete = new Set(getDescendantZoneIds(zoneId, zones));
    const updatedZones = zones.filter((z) => !idsToDelete.has(z.id));
    updateNode(id, { data: { ...data, zones: updatedZones } });

    // Clean up connected edges to all deleted zone handles
    const targetZones = zones.filter((z) => idsToDelete.has(z.id));
    const handleIds = new Set(targetZones.map((z) => z.handleId));
    const currentEdges = useBackendCanvasStore.getState().edges;
    const connectedEdges = currentEdges.filter(
      (e) =>
        (e.target === id && handleIds.has(e.targetHandle || "")) ||
        (e.source === id && handleIds.has(e.sourceHandle || "")),
    );
    connectedEdges.forEach((e) => deleteEdge(e.id));

    // Reset active config item if deleted zone was active
    const activeItem = useBackendCanvasStore.getState().activeConfigItem;
    if (activeItem && idsToDelete.has(activeItem.id)) {
      setActiveConfigItem(null);
    }
  };

  const handleAddZone = (parentId?: string) => {
    const newZoneId = `zone-${Date.now()}`;
    const parentZone = parentId ? zones.find((z) => z.id === parentId) : undefined;
    const childCount = parentId
      ? zones.filter((z) => z.parentId === parentId).length + 1
      : zones.length + 1;
    const zoneName = parentZone
      ? `${parentZone.name} Sub ${childCount}`
      : `Custom Zone ${zones.length + 1}`;

    const newZone: WebAppZone = {
      id: newZoneId,
      parentId,
      name: zoneName,
      handleId: `${newZoneId}-in`,
      accessType: "protected",
      hasLayout: false,
      layoutDescription: parentZone
        ? `Nested sub-layout inheriting from ${parentZone.name}`
        : "Custom route group layout",
      rule: {
        id: `rule-${newZoneId}`,
        scope: "zone",
        conditions: { kind: "leaf", condition: { type: "auth", op: "signedIn" } },
        redirects: { ...DEFAULT_REDIRECTS },
      },
    };
    updateNode(id, { data: { ...data, zones: [...zones, newZone] } });
  };

  const buildZoneTree = (allZones: WebAppZone[]) => {
    const result: { zone: WebAppZone; depth: number }[] = [];
    const rootZones = allZones.filter(
      (z) => !z.parentId || !allZones.some((p) => p.id === z.parentId),
    );

    const traverse = (parentId: string, depth: number) => {
      const children = allZones.filter((z) => z.parentId === parentId);
      children.forEach((child) => {
        result.push({ zone: child, depth });
        traverse(child.id, depth + 1);
      });
    };

    rootZones.forEach((root) => {
      result.push({ zone: root, depth: 0 });
      traverse(root.id, 1);
    });

    return result;
  };

  const getZoneIcon = (zone: WebAppZone) => {
    if (zone.accessType === "public") {
      return <Globe className="w-3.5 h-3.5 text-foreground shrink-0" />;
    }
    if (zone.protectionMode === "server-guard") {
      return <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    }
    const condStr = JSON.stringify(zone.rule?.conditions || {});
    if (condStr.includes('"plan"') || condStr.includes('"subscriptionStatus"')) {
      return <CreditCard className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    }
    if (condStr.includes('"orgRole"') || condStr.includes('"role"')) {
      return <ShieldCheck className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    }
    return <Lock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
  };

  // Helper to find connected WebClient page nodes on demand (read from store state without forcing re-renders)
  const getConnectedPagesFromStore = (sectionHandleId: string) => {
    const store = useBackendCanvasStore.getState();
    const incomingEdges = store.edges.filter(
      (e) =>
        (e.target === id && e.targetHandle === sectionHandleId) ||
        (e.source === id && e.sourceHandle === sectionHandleId),
    );
    return incomingEdges
      .map((e) =>
        store.nodes.find((n) => n.id === (e.source === id ? e.target : e.source)),
      )
      .filter((n): n is BackendNode => Boolean(n));
  };

  const createLayoutNodeForZone = (targetZone: WebAppZone) => {
    const store = useBackendCanvasStore.getState();
    const newLayoutId = `webPage-layout-${Date.now()}`;
    const thisNode = store.nodes.find((n) => n.id === id);
    const baseX = thisNode?.position?.x ?? 100;
    const baseY = thisNode?.position?.y ?? 100;

    const connectedPages = getConnectedPagesFromStore(targetZone.handleId);
    let posX = baseX + 420;
    let posY = baseY;

    if (connectedPages.length > 0) {
      const firstPage = connectedPages[0];
      posX = firstPage?.position?.x ?? posX;
      posY = (firstPage?.position?.y ?? baseY) - 90;
    } else {
      const zoneIdx = zones.findIndex((z) => z.id === targetZone.id);
      posY = baseY + (zoneIdx >= 0 ? zoneIdx * 160 : 0);
    }

    const isPublic = targetZone.accessType === "public" || targetZone.id === "zone-public";
    const defaultNavItems = connectedPages
      .filter((p) => !p.data?.isLayout && p.data?.label?.trim().toLowerCase() !== "layout")
      .map((p, idx) => {
        const raw = p.data?.label || p.data?.path || `Page ${idx + 1}`;
        const clean = raw.replace(/^\//, "");
        const name = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Home";
        const link = raw.startsWith("/") ? raw : `/${raw}`;
        const { extractedPathParams, extractedQueryParams } = parseRouteWithQueryParams(link);
        const pathParams = extractedPathParams.map((ep) => ({
          name: ep.name,
          value: "",
          mode: "route_param" as const,
          sourceParamName: ep.name,
        }));
        const queryParams = extractedQueryParams.map((eq) => ({
          id: `q-${eq.name}`,
          key: eq.name,
          value: eq.defaultValue || "",
          mode: "static" as const,
        }));
        return {
          id: `nav-${idx + 1}`,
          name,
          link,
          ...(pathParams.length > 0 ? { pathParams } : {}),
          ...(queryParams.length > 0 ? { queryParams } : {}),
        };
      });
    const sidebarNavItems =
      defaultNavItems.length > 0
        ? defaultNavItems
        : [
            { id: "nav-1", name: "Dashboard", link: "/dashboard" },
            { id: "nav-2", name: "Settings", link: "/settings" },
          ];

    const staticNavItems = defaultNavItems.filter(
      (item) => !(item.pathParams && item.pathParams.length > 0),
    );
    const dynamicNavItems = defaultNavItems.filter(
      (item) => item.pathParams && item.pathParams.length > 0,
    );

    const initialSidebarGroups =
      staticNavItems.length > 0 && dynamicNavItems.length > 0
        ? [
            {
              id: `group-static-${Date.now()}`,
              label: "Main Navigation",
              mode: "static" as const,
              items: staticNavItems,
            },
            {
              id: `group-dynamic-${Date.now() + 1}`,
              label: "Dynamic Routes",
              mode: "static" as const,
              items: dynamicNavItems,
            },
          ]
        : [
            {
              id: `group-main-${Date.now()}`,
              label: "Navigation",
              mode: "static" as const,
              items: sidebarNavItems,
            },
          ];
    const topbarNavItems =
      defaultNavItems.length > 0
        ? defaultNavItems
        : [
            { id: "nav-1", name: "Home", link: "/" },
            { id: "nav-2", name: "Features", link: "/features" },
            { id: "nav-3", name: "Pricing", link: "/pricing" },
            { id: "nav-4", name: "About", link: "/about" },
          ];
    const defaultDesc = isPublic
      ? "Public layout with top navigation bar, logo, and auth links"
      : "Protected app layout with sidebar navigation, user profile, and session check";

    const newLayoutNode: Omit<BackendNode, "fractionalIndex"> = {
      id: newLayoutId,
      type: "webPage",
      position: {
        x: posX,
        y: posY,
      },
      data: {
        label: "layout",
        isLayout: true,
        layoutSidebarInitialized: true,
        layoutTopbarInitialized: true,
        description: targetZone.layoutDescription || defaultDesc,
        useZoneDefault: true,
        zoneId: targetZone.id,
        sections: [
          {
            id: `sec-nav-${Date.now()}`,
            name: isPublic ? "Header Navigation" : "App Sidebar Navigation",
            componentBindings: isPublic
              ? [
                  {
                    id: `comp-topbar-${Date.now()}`,
                    name: "AppTopbar",
                    label: "AppTopbar",
                    componentType: "topbar",
                    variant: "default",
                    propMappings: {
                      topbarTitle: targetZone.name || "Dezign App",
                      topbarNavMode: "static",
                      topbarSticky: true,
                      showAuthButtons: true,
                      signInText: "Sign In",
                      signInLink: "/login",
                      registerText: "Register",
                      registerLink: "/register",
                      topbarStaticItems: topbarNavItems,
                    },
                  },
                ]
              : [
                  {
                    id: `comp-sidebar-${Date.now()}`,
                    name: "AppSidebar",
                    label: "AppSidebar",
                    componentType: "sidebar",
                    variant: "default",
                    propMappings: {
                      sidebarTitle: targetZone.name || "App Navigation",
                      sidebarNavMode: "static",
                      sidebarCollapsible: "icon",
                      sidebarVariant: "sidebar",
                      sidebarStaticItems: sidebarNavItems,
                      sidebarGroups: initialSidebarGroups,
                    },
                  },
                ],
            renderMode: "server",
            loadStrategy: "eager",
            actions: [],
          },
          {
            id: `sec-children-${Date.now()}`,
            name: "Page Content ({children})",
            componentBindings: [],
            renderMode: "server",
            loadStrategy: "eager",
            actions: [],
          },
        ],
      },
    };

    addNode(newLayoutNode);

    const newEdgeId = `edge-${id}-${targetZone.handleId}-${newLayoutId}-page-in`;
    addEdge({
      id: newEdgeId,
      source: id,
      sourceHandle: targetZone.handleId,
      target: newLayoutId,
      targetHandle: "page-in",
      type: "connection",
    });

    const updatedZones = zones.map((z) =>
      z.id === targetZone.id ? { ...z, hasLayout: true } : z,
    );
    updateNode(id, { data: { ...data, zones: updatedZones } });

    toast.success(`Layout node created for ${targetZone.name}`);
  };

  const handleToggleZoneLayout = (zoneId: string, enabled?: boolean) => {
    const targetZone = zones.find((z) => z.id === zoneId);
    if (!targetZone) return;

    const connectedPages = getConnectedPagesFromStore(targetZone.handleId);
    const connectedLayoutNode = connectedPages.find(
      (p) => Boolean(p.data?.isLayout) || p.data?.label?.trim().toLowerCase() === "layout",
    );

    const shouldEnable = typeof enabled === "boolean" ? enabled : !connectedLayoutNode;

    if (shouldEnable) {
      if (connectedLayoutNode) {
        const updatedZones = zones.map((z) => (z.id === zoneId ? { ...z, hasLayout: true } : z));
        updateNode(id, { data: { ...data, zones: updatedZones } });
        return;
      }

      createLayoutNodeForZone(targetZone);
    } else {
      if (connectedLayoutNode) {
        if (connectedLayoutNode.data?.pageSourceCode) {
          setLayoutToDelete({
            zoneId: targetZone.id,
            zoneName: targetZone.name,
            nodeId: connectedLayoutNode.id,
          });
          return;
        }

        deleteNode(connectedLayoutNode.id);
      }

      const updatedZones = zones.map((z) =>
        z.id === targetZone.id ? { ...z, hasLayout: false } : z,
      );
      updateNode(id, { data: { ...data, zones: updatedZones } });
      toast.info(`Layout disabled for ${targetZone.name}`);
    }
  };

  const edges = useBackendCanvasStore((s) => s.edges);
  const webPageNodes = useBackendCanvasStore(
    useShallow((s) => s.nodes.filter((n) => n.type === "webPage")),
  );

  // Memoized zone-to-pages mapping computed during render (cached cleanly for React)
  const zonePagesMap = useMemo(() => {
    const pageEdges = edges.filter((e) => e.source === id || e.target === id);
    const allPages: Array<{ id: string; label: string; isLayout: boolean; handleId: string }> = [];

    for (const e of pageEdges) {
      const otherId = e.source === id ? e.target : e.source;
      const handleId = e.source === id ? (e.sourceHandle || "") : (e.targetHandle || "");
      const otherNode = webPageNodes.find((n) => n.id === otherId);
      if (otherNode && otherNode.type === "webPage") {
        const rawLabel = otherNode.data?.label || otherNode.data?.path || "Page";
        const isLayout = Boolean(otherNode.data?.isLayout) || rawLabel.trim().toLowerCase() === "layout";
        allPages.push({
          id: otherNode.id,
          label: rawLabel,
          isLayout,
          handleId,
        });
      }
    }

    const map: Record<
      string,
      Array<{ id: string; label: string; isLayout: boolean; hasDuplicate: boolean }>
    > = {};

    for (const p of allPages) {
      const norm = normalizePageRoute(p.label);
      const hasDuplicate = !p.isLayout && allPages.some(
        (other) =>
          other.id !== p.id &&
          !other.isLayout &&
          normalizePageRoute(other.label) === norm,
      );
      if (!map[p.handleId]) {
        map[p.handleId] = [];
      }
      map[p.handleId]!.push({
        id: p.id,
        label: p.label,
        isLayout: p.isLayout,
        hasDuplicate,
      });
    }

    return map;
  }, [edges, id, webPageNodes]);

  const isDirectActive = Boolean(
    selected ||
      (activeConfigItem &&
        (activeConfigItem.nodeId === id || activeConfigItem.id === id)),
  );

  return (
    <div
      onClick={() => {
        if (!selected) {
          selectThisNode();
        }
      }}
      style={{
        zIndex: isDirectActive ? 1000 : undefined,
      }}
      className={cn(
        "shadow-xl rounded-xl bg-card border-2 min-w-[310px] max-w-[390px] flex flex-col transition-all duration-300 relative",
        selected ? "border-indigo-500" : "border-border",
      )}
    >
      {/* Main Auth Target Handle (Top Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="auth-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "!bg-indigo-500 rounded-full !border-2 !border-background hover:scale-125 transition-all",
        )}
        style={{ top: "18px" }}
        title="Connect AuthNode to bind backend authentication service"
      />

      {/* Package Types Target Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        id="types-in"
        className={cn(
          CANVAS_HANDLE_CLASS,
          CANVAS_HANDLE_LEFT_OFFSET_CLASS,
          "!bg-indigo-400 rounded-full !border-2 !border-background opacity-0 group-hover:opacity-100 transition-all hover:scale-125",
        )}
        style={{ top: "36px" }}
        title="Package Types / Custom Types Reference"
      />

      {/* Node Header */}
      <NodeHeader
        id={id}
        data={data}
        nodeType="webApp"
        icon={Globe}
        title="Web App"
        selected={selected}
        badges={
          (data.envVars?.length || 0) > 0 ? (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-4 font-mono font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-0.5"
              title={`${data.envVars?.length || 0} environment variable${(data.envVars?.length || 0) === 1 ? "" : "s"} configured`}
            >
              <KeyRound size={8} />
              {(data.envVars?.length || 0)} env
            </Badge>
          ) : undefined
        }
        onSave={(newLabel) => {
          const trimmed = newLabel.trim();
          const newSlug = trimmed
            ? trimmed
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
            : "web-app";
          updateNode(id, {
            data: {
              ...data,
              label: trimmed,
              appSlug: newSlug,
            },
          });
        }}
        rightElement={
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                selectThisNode();
                setActiveConfigItem({
                  type: "webApp",
                  id,
                  nodeId: id,
                });
              }}
              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center text-[10px]"
              title="Configure Web App Settings & Packages"
            >
              <Settings size={13} />
            </button>
          </div>
        }
      />

      {/* App Meta Info Bar */}
      <div className="px-3 py-1.5 bg-muted border-b flex items-center justify-between gap-2 nodrag">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono text-muted-foreground truncate">
            apps/{appSlug}
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono border border-border/50 shrink-0">
            :{port}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              if (connectedAuthNodeId) {
                setActiveConfigItem({
                  type: "auth",
                  id: connectedAuthNodeId,
                  nodeId: connectedAuthNodeId,
                });
              }
            }}
            className={cn(
              "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors",
              isAuthConnected
                ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20 cursor-pointer"
                : "bg-muted text-muted-foreground border-border/40",
            )}
            title={isAuthConnected ? `Wired to ${authNodeLabel}` : "No Auth connected"}
          >
            <ShieldCheck className="w-3 h-3" />
            <span>
              {isAuthConnected ? `🔒 ${authNodeLabel}` : "⚠️ No Auth connected"}
            </span>
          </button>

          <button
            onClick={() =>
              setActiveConfigItem({
                type: "webApp",
                id,
                nodeId: id,
              })
            }
            className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="App Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dynamic Protection Sections Container */}
      <div className="p-2.5 flex flex-col gap-2 bg-muted/60 opacity-100 nodrag">
        {buildZoneTree(zones).map(({ zone, depth }) => {
          const connectedPages = zonePagesMap[zone.handleId] || [];
          const isPublic = zone.accessType === "public";
          const isLayoutEnabled = connectedPages.some((p) => p.isLayout);

          return (
            <div
              key={zone.id}
              style={{
                marginLeft: depth > 0 ? `${Math.min(depth, 3) * 12}px` : undefined,
              }}
              className={cn(
                "flex flex-col gap-1.5 p-2.5 rounded-lg bg-card border border-border/80 opacity-100 relative group transition-all",
                depth > 0 && "border-l-2 border-l-indigo-500/60 bg-card/95 shadow-xs",
              )}
            >
              {/* Dynamic Section Handle (Right) */}
              <Handle
                type="source"
                position={Position.Right}
                id={zone.handleId}
                className={cn(
                  CANVAS_HANDLE_CLASS,
                  CANVAS_HANDLE_RIGHT_OFFSET_CLASS,
                  "rounded-full !border-2 !border-background opacity-100 cursor-pointer hover:scale-125 transition-all",
                  isPublic ? "!bg-muted-foreground" : "!bg-indigo-500",
                )}
                style={{ top: "50%" }}
                title={`Connect WebClient pages to ${zone.name}`}
              />

              {/* Zone Top Row */}
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5 truncate min-w-0">
                  {depth > 0 && (
                    <CornerDownRight className="w-3 h-3 text-indigo-400 shrink-0" />
                  )}
                  {getZoneIcon(zone)}
                  <span className="truncate">{zone.name}</span>
                </span>

                <div className="flex items-center gap-1 shrink-0">
                  {/* Add Sub-section Button (on protected sections) */}
                  {!isPublic && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddZone(zone.id);
                      }}
                      className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-indigo-400 transition-colors cursor-pointer"
                      title={`Add nested sub-section under ${zone.name}`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}

                  {/* Sleek Layout Toggle Switch */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleZoneLayout(zone.id);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-1 py-0.5 rounded text-[10px] font-medium transition-all duration-200 cursor-pointer select-none bg-transparent hover:bg-muted/40",
                      isLayoutEnabled
                        ? "text-indigo-400"
                        : "text-muted-foreground/60 hover:text-muted-foreground",
                    )}
                    title={
                      isLayoutEnabled
                        ? `Layout enabled for ${zone.name}. Click to disable and remove layout node`
                        : `Layout disabled for ${zone.name}. Click to enable and create layout node`
                    }
                  >
                    <LayoutTemplate
                      className={cn(
                        "w-3 h-3 transition-colors",
                        isLayoutEnabled ? "text-indigo-400" : "text-muted-foreground/50",
                      )}
                    />
                    <span className="text-[9px] font-mono leading-none">Layout</span>
                    <span
                      className={cn(
                        "w-5 h-2.5 rounded-full transition-colors duration-200 relative flex items-center px-0.5",
                        isLayoutEnabled ? "bg-indigo-500" : "bg-muted-foreground/30",
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full bg-white transition-transform duration-200 ease-in-out shadow-xs",
                          isLayoutEnabled ? "translate-x-2.5" : "translate-x-0",
                        )}
                      />
                    </span>
                  </button>

                  {/* Hand of Cards Toggle for zones with multiple pages */}
                  {connectedPages.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectThisNode();
                        const store = useBackendCanvasStore.getState();
                        const thisNode = store.nodes.find((n) => n.id === id);
                        if (!thisNode) return;
                        toggleZoneHandLayout({
                          webAppNode: thisNode,
                          zoneId: zone.id,
                          allNodes: store.nodes,
                          allEdges: store.edges,
                          updateNode,
                        });
                      }}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition-all duration-200 cursor-pointer select-none",
                        (() => {
                          const isExp = Array.isArray(data.expandedZones) && data.expandedZones.includes(zone.id);
                          return !isExp
                            ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25"
                            : "bg-muted/40 text-muted-foreground hover:text-foreground border border-border/40";
                        })(),
                      )}
                      title={
                        (() => {
                          const isExp = Array.isArray(data.expandedZones) && data.expandedZones.includes(zone.id);
                          return !isExp
                            ? `Pages are stacked on Z-axis (${connectedPages.length}). Click to Spread`
                            : "Pages are fanned out. Click to stack into hand of cards";
                        })()
                      }
                    >
                      <Layers className="w-3 h-3 text-indigo-400" />
                      <span className="font-mono leading-none">
                        {(() => {
                          const isExp = Array.isArray(data.expandedZones) && data.expandedZones.includes(zone.id);
                          return !isExp ? `Hand (${connectedPages.length})` : "Fanned";
                        })()}
                      </span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      selectThisNode();
                      setActiveConfigItem({
                        type: "zone",
                        id: zone.id,
                        nodeId: id,
                      });
                    }}
                    className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title={`Configure rules & layout for ${zone.name}`}
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                  {!isPublic && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setZoneToDelete({ id: zone.id, name: zone.name });
                      }}
                      className="p-1 hover:bg-destructive/15 rounded text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      title={`Delete ${zone.name}`}
                    >
                      <Trash className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Connected Page Pills */}
              <div className="flex flex-wrap gap-1 mt-1">
                {connectedPages.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground/70 italic">
                    Plug WebClient pages here
                  </span>
                ) : (
                  connectedPages.map((p) => {
                    return (
                      <span
                        key={p.id}
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded font-mono border transition-colors",
                          p.hasDuplicate
                            ? "bg-destructive/15 text-destructive border-destructive/40 font-semibold"
                            : "bg-secondary text-foreground border-border",
                        )}
                        title={
                          p.hasDuplicate
                            ? `Duplicate route conflict: "${p.label}" is used by multiple pages in this Web App!`
                            : `Route: ${p.label}`
                        }
                      >
                        {p.hasDuplicate && "⚠️ "}
                        {p.label}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* Add Custom Section Button */}
        <button
          onClick={() => handleAddZone()}
          className="flex items-center justify-center gap-1.5 p-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground bg-card/60 hover:bg-card border border-dashed border-border/80 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3" /> Add Protected Section
        </button>
      </div>

      {/* Environment Variables (.env) Section */}
      <NodeEnvVarsSection nodeId={id} />

      {/* Delete Zone Confirmation Dialog */}
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
              Are you sure you want to delete this access control section? Any connections from WebClient pages to this section handle will be unlinked.
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
                  handleDeleteZone(zoneToDelete.id);
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

      {/* Delete Layout Confirmation Dialog */}
      <AlertDialog open={!!layoutToDelete} onOpenChange={(open) => !open && setLayoutToDelete(null)}>
        <AlertDialogContent
          onClick={(e) => e.stopPropagation()}
          className="bg-[#111216] border-zinc-800 text-zinc-100 max-w-md shadow-2xl ring-1 ring-white/10"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-100 font-semibold">
              Disable Layout for "{layoutToDelete?.zoneName}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400 text-xs leading-relaxed">
              This layout node contains custom code or sections. Disabling it will remove the layout node from the canvas. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setLayoutToDelete(null)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 hover:text-zinc-100"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (layoutToDelete) {
                  deleteNode(layoutToDelete.nodeId);
                  const updatedZones = zones.map((z) =>
                    z.id === layoutToDelete.zoneId ? { ...z, hasLayout: false } : z,
                  );
                  updateNode(id, { data: { ...data, zones: updatedZones } });
                  toast.info(`Layout disabled for ${layoutToDelete.zoneName}`);
                  setLayoutToDelete(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold"
            >
              Disable Layout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
