import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import {
  Endpoint,
  AnyMessagingResource,
  CompiledFile,
  CompiledWebPageResult,
} from "@workspace/canvas/types";
import { generateWebClientE2ETests } from "../../../generators/testGenerator";

import { LinkedEndpointInfo, LinkedPageRefInfo } from "./types";
import { getServicePort, resolveLinkedEndpoint, resolvePageRefLink } from "./endpointResolver";
import { generateProjectConfigFiles } from "./configTemplates";
import { generateRootLayout, generateRouteGroupLayouts } from "./layoutGenerators";
import { generateProxy } from "./middlewareTemplate";
import { resolvePagesInfo } from "./pageResolver";
import {
  resolveConnectedAuthNode,
  generateAuthFilesAndDependencies,
  ensureDatabaseDependencies,
} from "./authFileGenerator";
import {
  generatePageAndComponentFiles,
} from "./pageFileGenerator";
import { generateZustandStores } from "./storeGenerators";
import { resolveAppProviders } from "./providerGenerators";
import { GlobalStoreDefinition, NodeDependencyItem } from "@workspace/canvas/types";

export type { LinkedEndpointInfo, LinkedPageRefInfo };
export { getServicePort, resolveLinkedEndpoint, resolvePageRefLink };

/**
 * Compiles WebClient nodes into Next.js App Router (v16.x) project structure
 */
export function compileNextjsV16WebClient(
  webClientNodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  allNodes: BackendNode[] = [],
  allEdges: BackendEdge[] = [],
  projectName: string = "Dezign2App Monorepo",
  testCases: SimulationTestCase[] = [],
  appSlug?: string,
  webAppNode?: BackendNode,
): CompiledWebPageResult {
  const files: CompiledFile[] = [];

  const effectiveAppSlug =
    appSlug ||
    webAppNode?.data?.appSlug ||
    webClientNodes[0]?.data.appSlug ||
    "web-app";

  // 0. Resolve the specific AuthNode connected to THIS WebApp (or its pages)
  const authNode = resolveConnectedAuthNode(
    webAppNode,
    webClientNodes,
    allNodes,
    allEdges,
  );

  // 1. Resolve Page Metadata and Routes
  const pagesInfo = resolvePagesInfo(
    webClientNodes,
    allNodes,
    allEdges,
    effectiveAppSlug,
    webAppNode,
    authNode,
    endpoints,
    events,
  );

  // 2. Generate Route Group Layouts
  files.push(...generateRouteGroupLayouts(pagesInfo, Boolean(authNode), webAppNode));

  // 2.5 Resolve State Store Nodes, Global Stores (Zustand) & App Providers (Context)
  const appGlobalStores: GlobalStoreDefinition[] = webAppNode?.data?.globalStores || [];
  const pageStores: GlobalStoreDefinition[] = webClientNodes.flatMap((p) => p.data?.pageStores || []);

  // Gather state_store nodes associated with this webApp
  const webClientNodeIds = new Set(webClientNodes.map((p) => p.id));
  const associatedStateStoreNodes = (allNodes || []).filter((n) => {
    if (n.type !== "state_store") return false;

    // 1. Direct targetWebAppId matching
    if (n.data?.targetWebAppId) {
      return n.data.targetWebAppId === webAppNode?.id;
    }

    // 2. Direct edge to webAppNode
    const hasWebAppEdge = (allEdges || []).some(
      (e) =>
        (e.source === webAppNode?.id && e.target === n.id) ||
        (e.target === webAppNode?.id && e.source === n.id)
    );
    if (hasWebAppEdge) return true;

    // 3. Edge to any page belonging to this webApp
    const hasPageEdge = (allEdges || []).some(
      (e) =>
        (webClientNodeIds.has(e.source) && e.target === n.id) ||
        (webClientNodeIds.has(e.target) && e.source === n.id)
    );
    if (hasPageEdge) return true;

    // 4. Fallback: If only 1 webApp in graph, include unassigned stores
    const allWebApps = (allNodes || []).filter((node) => node.type === "webApp");
    if (allWebApps.length <= 1) return true;

    return false;
  });

  const localStorePaths: Record<string, string> = {};
  const graphStateStores: GlobalStoreDefinition[] = associatedStateStoreNodes.map((sn) => {
    const d = sn.data || {};
    const storeName = d.storeName || d.label || "App";
    const scope = d.scope || "global";
    const storage = d.storage || "memory";

    // If local store, attempt to map to connected or target page
    let targetPage = webClientNodes.find((p) => p.id === d.targetPageId);
    if (!targetPage) {
      const connectedPageEdge = (allEdges || []).find(
        (e) =>
          (webClientNodeIds.has(e.source) && e.target === sn.id) ||
          (webClientNodeIds.has(e.target) && e.source === sn.id)
      );
      if (connectedPageEdge) {
        const pageId = webClientNodeIds.has(connectedPageEdge.source)
          ? connectedPageEdge.source
          : connectedPageEdge.target;
        targetPage = webClientNodes.find((p) => p.id === pageId);
      }
    }

    if (scope === "local" && targetPage) {
      const pagePath = targetPage.data?.path || targetPage.data?.route || targetPage.data?.pageSlug || "page";
      const cleanPath = pagePath.replace(/^\/+|\/+$/g, "");
      const baseName = storeName.replace(/Store$/i, "");
      const hookName = `use${baseName.charAt(0).toUpperCase() + baseName.slice(1)}Store`;
      localStorePaths[sn.id] = `app/${cleanPath}/_stores/${hookName}.ts`;
    }

    return {
      id: sn.id,
      name: storeName,
      description: d.description,
      fields: d.fields || [],
      actions: d.actions || [],
      storage,
      scope,
      targetPageId: targetPage?.id || d.targetPageId,
    };
  });

  const allStores = [...appGlobalStores, ...pageStores, ...graphStateStores];
  if (allStores.length > 0) {
    files.push(...generateZustandStores(allStores, { localStorePaths }));
  }

  // 3. Project Configuration Files
  const sectionAndActionLibs = webClientNodes.flatMap((p) =>
    (p.data?.sections || []).flatMap((s) => [
      ...(s.libraries || []),
      ...(s.actions || []).flatMap((a) => a.libraries || []),
    ])
  );
  const extraDepsFromSectionsAndActions = sectionAndActionLibs.map((libName: string) => ({
    name: libName,
    version: "latest",
    isDev: false,
    source: "manual" as const,
  }));

  const storeDeps = allStores.length > 0
    ? [{ name: "zustand", version: "^5.0.0", isDev: false, source: "manual" as const }]
    : [];

  const resolvedProviders = resolveAppProviders([
    ...sectionAndActionLibs,
    ...(webAppNode?.data?.customDependencies || []).map((d: NodeDependencyItem) => d.name),
    ...webClientNodes.flatMap((p) => (p.data?.customDependencies || []).map((d: NodeDependencyItem) => d.name)),
  ]);

  if (resolvedProviders.hasProviders && resolvedProviders.file) {
    files.push(resolvedProviders.file);
  }

  const providerDeps = resolvedProviders.requiredPackages.map((pkg) => ({
    name: pkg.name,
    version: pkg.version,
    isDev: false,
    source: "manual" as const,
  }));

  const allWebCustomDeps = [
    ...(webAppNode?.data?.customDependencies || []),
    ...webClientNodes.flatMap((p) => p.data?.customDependencies || []),
    ...extraDepsFromSectionsAndActions,
    ...storeDeps,
    ...providerDeps,
  ];
  const deduplicatedCustomDeps = allWebCustomDeps.filter(
    (dep, index, self) => index === self.findIndex((d) => d.name === dep.name)
  );

  const dbNodes = allNodes.filter(
    (n) => n.type === "database" && n.data?.dbEngine !== "redis",
  );
  const entityNodes = allNodes.filter(
    (n) =>
      (n.type === "entity" || n.type === "db_ref") &&
      n.data?.dbType !== "redis",
  );
  const authNodes = allNodes.filter((n) => n.type === "auth");

  const hasDb =
    dbNodes.length > 0 || entityNodes.length > 0 || authNodes.length > 0;

  const isSingleDb = dbNodes.length <= 1;
  const dbPackageName = isSingleDb
    ? "@workspace/db"
    : `@workspace/db-${(dbNodes[0]?.data?.label || "db").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  files.push(
    ...generateProjectConfigFiles(
      effectiveAppSlug,
      deduplicatedCustomDeps,
      hasDb,
      dbPackageName,
    ),
  );

  // 4. Auth Server, Client SDK, Authorization Helpers & Dependencies (only if authNode connected)
  generateAuthFilesAndDependencies({
    files,
    webClientNodes,
    pagesInfo,
    authNode,
    endpoints,
    events,
    allNodes,
    allEdges,
    testCases,
  });

  // 5. Database Dependencies (if database nodes exist on canvas)
  ensureDatabaseDependencies(files, allNodes);

  // 6. Root Layout (app/layout.tsx) & Middleware Proxy (proxy.ts)
  const showNav = Boolean(webAppNode?.data?.showNav);

  const navLinksHtml = showNav
    ? pagesInfo
        .map((p) => `<Link href="${p.routePath}" className="hover:underline">${p.label}</Link>`)
        .join("\n              ")
    : "";

  files.push({
    filename: "app/layout.tsx",
    language: "typescript",
    content: generateRootLayout(
      projectName,
      navLinksHtml,
      showNav,
      resolvedProviders.hasProviders,
    ),
  });

  files.push({
    filename: "proxy.ts",
    language: "typescript",
    content: generateProxy(pagesInfo, authNode?.data),
  });

  // 7. Pages, Action Event Components, Page Headers & Auth Components
  const { pageFiles } = generatePageAndComponentFiles({
    webClientNodes,
    pagesInfo,
    endpoints,
    allNodes,
    allEdges,
    authNode,
  });
  files.push(...pageFiles);

  // 9. Web page E2E Tests
  files.push(
    ...generateWebClientE2ETests(
      webClientNodes,
      endpoints,
      events,
      allNodes,
      allEdges,
      testCases,
    ),
  );

  const webPageName =
    webClientNodes.length === 1
      ? webClientNodes[0]?.data.label || "web-client"
      : "web-client";
  const webPageId =
    webClientNodes.length === 1 ? webClientNodes[0]!.id : "web-client";

  return {
    webPageId,
    webPageName,
    files,
  };
}
