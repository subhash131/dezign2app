import { BackendNode, BackendEdge } from "@/types/canvas";
import { WebAppZone, parseRouteWithQueryParams } from "@workspace/canvas";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

export interface LayoutTargetOption {
  id: string; // The select option value (node.id or create-layout:...)
  nodeId?: string; // Existing canvas node ID if placed
  label: string; // e.g. "(private) Layout" or "Public Section Layout"
  subLabel?: string;
  routePath: string; // e.g. "app/(private)/layout.tsx"
  zoneName?: string;
  zoneSlug?: string;
  webAppName?: string;
  webAppId?: string;
  isRoot?: boolean;
  isExistingNode: boolean;
}

export interface PageTargetOption {
  id: string;
  nodeId: string;
  label: string;
  routePath: string;
  isRoot: boolean;
}

/**
 * Determines whether a given canvas node represents a layout.
 */
export function isLayoutNode(node?: BackendNode | null): boolean {
  if (!node) return false;
  const label = (node.data?.label || "").trim().toLowerCase();
  const path = (node.data?.path || "").trim().toLowerCase();
  const slug = (node.data?.pageSlug || "").trim().toLowerCase();
  return (
    Boolean(node.data?.isLayout) ||
    label === "layout" ||
    path === "layout" ||
    slug === "layout" ||
    path.endsWith("/layout.tsx") ||
    path.endsWith("/layout.js")
  );
}

/**
 * Resolves human-readable and route metadata for a layout node.
 */
export function getLayoutNodeDetails(
  layoutNode: BackendNode,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): {
  displayTitle: string;
  routePath: string;
  zoneSlug: string;
  zoneName: string;
  isRoot: boolean;
  webAppName: string;
} {
  const webAppNodes = allNodes.filter((n) => n?.type === "webApp");
  let zoneName = "";
  let zoneSlug = "";
  let webAppName = "";

  // 1. Try finding zone by connected canvas edge
  const edge = allEdges.find(
    (e) =>
      (e.target === layoutNode.id && Boolean(e.sourceHandle)) ||
      (e.source === layoutNode.id && Boolean(e.targetHandle)),
  );

  if (edge) {
    const webAppId = edge.source === layoutNode.id ? edge.target : edge.source;
    const handleId = edge.source === layoutNode.id ? edge.targetHandle : edge.sourceHandle;
    const webApp = webAppNodes.find((w) => w.id === webAppId);
    if (webApp) {
      webAppName = webApp.data?.label || webApp.data?.appSlug || "WebApp";
      const zones: WebAppZone[] = Array.isArray(webApp.data?.zones) ? webApp.data.zones : [];
      const z = zones.find((z) => z.handleId === handleId || z.id === handleId);
      if (z) {
        zoneName = z.name;
        zoneSlug = z.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
    }
  }

  // 2. Fallback to node.data.zoneId
  if (!zoneName && layoutNode.data?.zoneId) {
    for (const webApp of webAppNodes) {
      const zones: WebAppZone[] = Array.isArray(webApp.data?.zones) ? webApp.data.zones : [];
      const z = zones.find((z) => z.id === layoutNode.data.zoneId);
      if (z) {
        zoneName = z.name;
        zoneSlug = z.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        webAppName = webApp.data?.label || webApp.data?.appSlug || "WebApp";
        break;
      }
    }
  }

  // 3. Fallback to routeGroup
  if (!zoneSlug && layoutNode.data?.routeGroup) {
    zoneSlug = layoutNode.data.routeGroup;
    zoneName = `${zoneSlug} section`;
  }

  const isRoot = Boolean(layoutNode.data?.isRoot) || (!zoneSlug && !zoneName);
  const displayTitle = isRoot
    ? "Root Layout"
    : zoneSlug
      ? `(${zoneSlug}) Layout`
      : zoneName
        ? `${zoneName} Layout`
        : "Layout";

  const routePath = isRoot
    ? "app/layout.tsx"
    : zoneSlug
      ? `app/(${zoneSlug})/layout.tsx`
      : "app/layout.tsx";

  return { displayTitle, routePath, zoneSlug, zoneName, isRoot, webAppName };
}

const DEFAULT_WEBAPP_ZONES: WebAppZone[] = [
  { id: "zone-public", handleId: "public-in", name: "Public Section", accessType: "public" },
  { id: "zone-private", handleId: "private-in", name: "Private Section", accessType: "protected" },
];

/**
 * Returns available page options and layout options for PageRefNode and stream pickers.
 */
export function resolvePageRefTargets(
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): {
  pages: PageTargetOption[];
  layouts: LayoutTargetOption[];
} {
  const webPageNodes = allNodes.filter((n) => n?.type === "webPage");
  const webAppNodes = allNodes.filter((n) => n?.type === "webApp");

  // 1. Separate regular pages
  const pages: PageTargetOption[] = [];
  const existingLayoutNodes: BackendNode[] = [];

  webPageNodes.forEach((node) => {
    if (isLayoutNode(node)) {
      existingLayoutNodes.push(node);
    } else {
      const rawLabel = node.data?.label || "Page";
      const clean = rawLabel.trim().toLowerCase();
      const isRoot = Boolean(node.data?.isRoot) || clean === "/";
      pages.push({
        id: node.id,
        nodeId: node.id,
        label: rawLabel,
        routePath: isRoot ? "/" : rawLabel.startsWith("/") ? rawLabel : `/${rawLabel}`,
        isRoot,
      });
    }
  });

  // 2. Resolve layout options
  const layouts: LayoutTargetOption[] = [];
  const claimedNodeIds = new Set<string>();

  // Check WebApps and their zones
  webAppNodes.forEach((webApp) => {
    const zones: WebAppZone[] =
      Array.isArray(webApp.data?.zones) && webApp.data.zones.length > 0
        ? webApp.data.zones
        : DEFAULT_WEBAPP_ZONES;

    zones.forEach((zone) => {
      const zoneSlug = zone.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Check if a layout node is already connected to this zone
      const existingNode = existingLayoutNodes.find((n) => {
        if (claimedNodeIds.has(n.id)) return false;
        if (n.data?.zoneId === zone.id) return true;
        return allEdges.some(
          (e) =>
            (e.source === webApp.id && e.sourceHandle === zone.handleId && e.target === n.id) ||
            (e.target === webApp.id && e.targetHandle === zone.handleId && e.source === n.id),
        );
      });

      if (existingNode) {
        claimedNodeIds.add(existingNode.id);
        const details = getLayoutNodeDetails(existingNode, allNodes, allEdges);
        layouts.push({
          id: existingNode.id,
          nodeId: existingNode.id,
          label: details.displayTitle,
          routePath: details.routePath,
          zoneName: zone.name,
          zoneSlug,
          webAppName: webApp.data?.label || webApp.data?.appSlug,
          webAppId: webApp.id,
          isRoot: false,
          isExistingNode: true,
        });
      } else {
        layouts.push({
          id: `create-layout:${webApp.id}:${zone.id}`,
          label: `(${zoneSlug}) Layout`,
          routePath: `app/(${zoneSlug})/layout.tsx`,
          zoneName: zone.name,
          zoneSlug,
          webAppName: webApp.data?.label || webApp.data?.appSlug,
          webAppId: webApp.id,
          isRoot: false,
          isExistingNode: false,
        });
      }
    });
  });

  // Include any remaining existing layout nodes on canvas that weren't zone-matched
  existingLayoutNodes.forEach((n) => {
    if (!claimedNodeIds.has(n.id)) {
      claimedNodeIds.add(n.id);
      const details = getLayoutNodeDetails(n, allNodes, allEdges);
      layouts.push({
        id: n.id,
        nodeId: n.id,
        label: details.displayTitle,
        routePath: details.routePath,
        zoneName: details.zoneName,
        zoneSlug: details.zoneSlug,
        webAppName: details.webAppName,
        isRoot: details.isRoot,
        isExistingNode: true,
      });
    }
  });

  // Always ensure a Root Layout option exists if not yet present
  const hasRootLayout = layouts.some((l) => l.isRoot);
  if (!hasRootLayout) {
    const primaryWebApp = webAppNodes[0];
    layouts.unshift({
      id: primaryWebApp
        ? `create-layout:${primaryWebApp.id}:root`
        : `create-layout:default:root`,
      label: "Root Layout",
      routePath: "app/layout.tsx",
      isRoot: true,
      isExistingNode: false,
      webAppId: primaryWebApp?.id,
    });
  }

  return { pages, layouts };
}

/**
 * Ensures an actual layout node exists on canvas when a user selects a layout option.
 * If targetId is already an existing node, returns it directly.
 * If targetId is a virtual creation key ("create-layout:..."), spawns the layout node and connects it.
 */
export function ensureLayoutNodeForTarget(
  targetId: string,
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
): string {
  const store = useBackendCanvasStore.getState();
  const currentNodes = store.nodes.length ? store.nodes : allNodes;
  const currentEdges = store.edges.length ? store.edges : allEdges;

  // 1. Direct existing node match
  const existingNode = currentNodes.find((n) => n.id === targetId);
  if (existingNode) {
    return existingNode.id;
  }

  // 2. Parse creation key: create-layout:${webAppId}:${zoneId}
  if (!targetId.startsWith("create-layout:")) {
    return targetId;
  }

  const parts = targetId.split(":");
  const webAppId = parts[1];
  const zoneId = parts[2];

  const webAppNode = currentNodes.find((n) => n.id === webAppId && n.type === "webApp");
  const zones: WebAppZone[] =
    Array.isArray(webAppNode?.data?.zones) && webAppNode.data.zones.length > 0
      ? webAppNode.data.zones
      : DEFAULT_WEBAPP_ZONES;

  const targetZone = zones.find((z) => z.id === zoneId);
  const isRootLayout = zoneId === "root" || !targetZone;

  // Check again if an existing layout node exists for this zone
  if (targetZone) {
    const alreadyExists = currentNodes.find((n) => {
      if (n.type !== "webPage" || !isLayoutNode(n)) return false;
      if (n.data?.zoneId === targetZone.id) return true;
      return currentEdges.some(
        (e) =>
          (e.source === webAppId && e.sourceHandle === targetZone.handleId && e.target === n.id) ||
          (e.target === webAppId && e.targetHandle === targetZone.handleId && e.source === n.id),
      );
    });
    if (alreadyExists) {
      return alreadyExists.id;
    }
  }

  // 3. Create the layout node on canvas
  const newLayoutId = `webPage-layout-${Date.now()}`;
  const baseX = webAppNode?.position?.x ?? 200;
  const baseY = webAppNode?.position?.y ?? 150;
  const existingLayoutCount = currentNodes.filter((n) => n.type === "webPage" && isLayoutNode(n)).length;

  const isPublic = targetZone?.accessType === "public" || targetZone?.id === "zone-public";
  const defaultDesc = isRootLayout
    ? "Root application layout wrapper"
    : isPublic
      ? "Public layout with top navigation bar and auth links"
      : "Protected app layout with sidebar navigation, user profile, and session check";

  const fallbackSidebarItems = [
    { id: "nav-1", name: "Dashboard", link: "/dashboard" },
    { id: "nav-2", name: "Settings", link: "/settings" },
  ];
  const fallbackTopbarItems = [
    { id: "nav-1", name: "Home", link: "/" },
    { id: "nav-2", name: "Features", link: "/features" },
    { id: "nav-3", name: "Pricing", link: "/pricing" },
  ];

  const newLayoutNode: Omit<BackendNode, "fractionalIndex"> = {
    id: newLayoutId,
    type: "webPage",
    position: {
      x: baseX + 420,
      y: baseY - 90 + existingLayoutCount * 120,
    },
    data: {
      label: "layout",
      isLayout: true,
      isRoot: isRootLayout,
      layoutSidebarInitialized: true,
      layoutTopbarInitialized: true,
      description: targetZone?.layoutDescription || defaultDesc,
      useZoneDefault: true,
      zoneId: targetZone?.id,
      sections: [
        {
          id: `sec-header-${Date.now()}`,
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
                    topbarTitle: targetZone?.name || "Dezign App",
                    topbarNavMode: "static",
                    topbarSticky: true,
                    showAuthButtons: true,
                    signInText: "Sign In",
                    signInLink: "/login",
                    registerText: "Register",
                    registerLink: "/register",
                    topbarStaticItems: fallbackTopbarItems,
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
                    sidebarTitle: targetZone?.name || "App Navigation",
                    sidebarNavMode: "static",
                    sidebarCollapsible: "icon",
                    sidebarVariant: "sidebar",
                    sidebarStaticItems: fallbackSidebarItems,
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

  store.addNode(newLayoutNode);

  if (webAppNode && targetZone?.handleId) {
    const newEdgeId = `edge-${webAppNode.id}-${targetZone.handleId}-${newLayoutId}-page-in`;
    store.addEdge({
      id: newEdgeId,
      source: webAppNode.id,
      sourceHandle: targetZone.handleId,
      target: newLayoutId,
      targetHandle: "page-in",
      type: "connection",
    });
  }

  return newLayoutId;
}

