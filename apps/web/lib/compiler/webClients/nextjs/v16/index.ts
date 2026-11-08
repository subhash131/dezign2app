import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import {
  Endpoint,
  AnyMessagingResource,
  CompiledFile,
  CompiledWebPageResult,
} from "@workspace/canvas/types";
import { generateWebClientE2ETests } from "../../../generators/testGenerator";

import {
  LinkedEndpointInfo,
  LinkedPageRefInfo,
  LinkedRealtimeConnectionInfo,
  PageInfo,
} from "./types";
import { getServicePort, resolveLinkedEndpoint, resolvePageRefLink } from "./endpointResolver";
import { generateProjectConfigFiles } from "./configTemplates";
import { generateEnvFilesForNode } from "@/lib/compiler/generators/generateEnvFile";
import { generateRootLayout, generateRouteGroupLayouts } from "./layoutGenerators";
import { generateLayoutEventsDrawer } from "./page-generators";
import { generateProxy } from "./middlewareTemplate";
import { resolvePagesInfo } from "./pageResolver";
import {
  resolveConnectedAuthNode,
  generateAuthFilesAndDependencies,
  ensureDatabaseDependencies,
} from "./authFileGenerator";
import {
  generatePaymentsFilesAndDependencies,
} from "./paymentsFileGenerator";
import {
  generatePageAndComponentFiles,
  ensureTransformerDependencies,
} from "./pageFileGenerator";
import { generateZustandStores, toPascalCase } from "./storeGenerators";
import { generateBrowserStorageHelper } from "./browserStorageGenerator";
import { resolveAppProviders } from "./providerGenerators";
import { isServiceAssociatedWithWebApp } from "./serviceResolver";
import { generateNextjsRoutes } from "../../../services/nextjs/v16/routeGenerator";
import { GlobalStoreDefinition, NodeDependencyItem } from "@workspace/canvas/types";
import { resolveStoreActionBindings } from "./storeActionResolver";

export type {
  LinkedEndpointInfo,
  LinkedPageRefInfo,
  LinkedRealtimeConnectionInfo,
  PageInfo,
};
export {
  getServicePort,
  resolveLinkedEndpoint,
  resolvePageRefLink,
  resolveStoreActionBindings,
};

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

  // Enrich webClientNodes with storeActionBinding inferred from canvas edges between
  // StateStoreNode handles (populate, mutate, reset, store-action-*) and WebPageNode action handles
  const enrichedWebClientNodes = resolveStoreActionBindings(
    webClientNodes,
    allNodes,
    allEdges,
  );

  const effectiveAppSlug =
    appSlug ||
    webAppNode?.data?.appSlug ||
    (webAppNode?.data?.label
      ? webAppNode.data.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      : undefined) ||
    enrichedWebClientNodes[0]?.data.appSlug ||
    "web-app";

  // 0. Resolve the specific AuthNode connected to THIS WebApp (or its pages)
  const authNode = resolveConnectedAuthNode(
    webAppNode,
    enrichedWebClientNodes,
    allNodes,
    allEdges,
  );

  // 1. Resolve Page Metadata and Routes
  const pagesInfo = resolvePagesInfo(
    enrichedWebClientNodes,
    allNodes,
    allEdges,
    effectiveAppSlug,
    webAppNode,
    authNode,
    endpoints,
    events,
  );

  // 2. Generate Route Group Layouts
  files.push(
    ...generateRouteGroupLayouts(
      pagesInfo,
      Boolean(authNode),
      webAppNode,
      allNodes,
      allEdges,
      authNode,
    ),
  );

  // 2.5 Resolve State Store Nodes, Global Stores (Zustand) & App Providers (Context)
  const appGlobalStores: GlobalStoreDefinition[] = webAppNode?.data?.globalStores || [];
  const pageStores: GlobalStoreDefinition[] = enrichedWebClientNodes.flatMap((p) => p.data?.pageStores || []);

  // Gather state_store nodes associated with this webApp
  const webClientNodeIds = new Set(enrichedWebClientNodes.map((p) => p.id));
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

    // 3.5 Action has storeActionBinding referencing this store
    const hasActionBinding = enrichedWebClientNodes.some((p) =>
      (p.data?.sections || []).some((s) =>
        (s.actions || []).some((a) => a.storeActionBinding?.storeNodeId === n.id)
      ) ||
      (p.data?.events || []).some((a) => a.storeActionBinding?.storeNodeId === n.id)
    );
    if (hasActionBinding) return true;

    // 4. Fallback: If only 1 webApp in graph, include unassigned stores
    const allWebApps = (allNodes || []).filter((node) => node.type === "webApp");
    if (allWebApps.length <= 1) return true;

    return false;
  });

  const localStorePaths: Record<string, string> = {};
  const graphStateStores: GlobalStoreDefinition[] = associatedStateStoreNodes.map((sn) => {
    const d = sn.data || {};
    const storeName = d.storeName || d.label || "App";
    const rawStorage = d.storage;
    const storage: "memory" | "localStorage" | "sessionStorage" =
      rawStorage === "localStorage" || rawStorage === "sessionStorage"
        ? rawStorage
        : "memory";
    const rawScope = d.scope;
    const scope: "global" | "local" = rawScope === "local" ? "local" : "global";

    // If local store, attempt to map to connected or target page
    let targetPage = enrichedWebClientNodes.find((p) => p.id === d.targetPageId);
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
        targetPage = enrichedWebClientNodes.find((p) => p.id === pageId);
      }
    }

    if (scope === "local" && targetPage) {
      const matchedPageInfo = pagesInfo.find((p) => p.nodeId === targetPage?.id);
      const rawPagePath = matchedPageInfo
        ? (matchedPageInfo.isRoot ? "" : matchedPageInfo.slug)
        : (targetPage.data?.label || targetPage.data?.path || "page");
      const pagePath = rawPagePath.replace(/^\//, "").trim();
      const baseName = toPascalCase(storeName);
      const storeCompName = baseName.endsWith("Store") ? baseName : `${baseName}Store`;
      localStorePaths[sn.id] = pagePath ? `app/${pagePath}/_stores/use${storeCompName}.ts` : `app/_stores/use${storeCompName}.ts`;
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
      disabledDefaultManipulators: d.disabledDefaultManipulators,
      deletedDefaultManipulators: d.deletedDefaultManipulators,
    };
  });

  const allStores = [...appGlobalStores, ...pageStores, ...graphStateStores];
  if (allStores.length > 0) {
    files.push(...generateZustandStores(allStores, { localStorePaths }));
  }

  // 2.6 Resolve Browser Storage Nodes (localStorage / sessionStorage)
  const associatedBrowserStorageNodes = (allNodes || []).filter((n) => {
    if (n.type !== "browser_storage") return false;
    const targetWebAppId = n.data?.targetWebAppId;
    if (targetWebAppId && webAppNode?.id && targetWebAppId === webAppNode.id) return true;
    const isDirectlyConnectedToPage = allEdges.some((e) => {
      const isSrc = e.source === n.id && webClientNodeIds.has(e.target);
      const isTgt = e.target === n.id && webClientNodeIds.has(e.source);
      return isSrc || isTgt;
    });
    if (isDirectlyConnectedToPage) return true;
    if (!targetWebAppId) return true;
    return false;
  });

  const hasBrowserStorageStepAnywhere = enrichedWebClientNodes.some((p) =>
    (p.data?.sections || []).some((s) =>
      (s.actions || []).some((a) =>
        (a.actionSteps || []).some((st) => st.type === "browser_storage")
      )
    )
  );

  if (associatedBrowserStorageNodes.length > 0 || hasBrowserStorageStepAnywhere) {
    files.push(generateBrowserStorageHelper(associatedBrowserStorageNodes));
  }

  // 3. Project Configuration Files
  const sectionAndActionLibs = enrichedWebClientNodes.flatMap((p) =>
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
    ...enrichedWebClientNodes.flatMap((p) => (p.data?.customDependencies || []).map((d: NodeDependencyItem) => d.name)),
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

  // Gather Service nodes with techStack: "nextjs" associated with this webApp
  const associatedNextjsServiceNodes = (allNodes || []).filter((n) =>
    isServiceAssociatedWithWebApp(n, webAppNode, allNodes, allEdges, enrichedWebClientNodes),
  );

  const allWebCustomDeps = [
    ...(webAppNode?.data?.customDependencies || []),
    ...enrichedWebClientNodes.flatMap((p) => p.data?.customDependencies || []),
    ...associatedNextjsServiceNodes.flatMap((s) => s.data?.customDependencies || []),
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

  const hasTransformers =
    enrichedWebClientNodes.some((p) => {
      const rawSections = Array.isArray(p.data?.sections) ? p.data.sections : [];
      const rawEvents = Array.isArray(p.data?.events) ? p.data.events : [];
      const allActs = [
        ...rawSections.flatMap((s: any) => s.actions || []),
        ...rawEvents,
      ];
      return allActs.some((a: any) =>
        (a.actionSteps || []).some(
          (s: any) =>
            s.type === "transform" ||
            Boolean(s.transformerName) ||
            Boolean(s.transformerNodeId) ||
            Boolean(s.transformerRefNodeId) ||
            s.functionRef?.importPath === "@workspace/transformers" ||
            s.functionRef?.importPath?.startsWith("@workspace/transformers"),
        ),
      );
    }) ||
    allNodes.some(
      (n) =>
        (n.type === "transformer" || n.type === "transformer_ref") &&
        (enrichedWebClientNodes.some((w) => w.id === n.data?.targetWebPageId) ||
          allEdges.some(
            (e) =>
              enrichedWebClientNodes.some((w) => w.id === e.source || w.id === e.target) &&
              (e.source === n.id || e.target === n.id),
          ) ||
          allNodes.some((w) => w.type === "webApp")),
    ) ||
    deduplicatedCustomDeps.some((d) => d.name === "@workspace/transformers");

  files.push(
    ...generateProjectConfigFiles(
      effectiveAppSlug,
      deduplicatedCustomDeps,
      hasDb,
      dbPackageName,
      dbNodes[0],
      hasTransformers,
    ),
  );

  // Generate canvas-driven .env and .env.example with connected package nodes (Storage, DB, etc.)
  const targetAppNode: BackendNode = webAppNode || {
    id: enrichedWebClientNodes[0]?.id || "web-app",
    type: "webApp",
    position: { x: 0, y: 0 },
    fractionalIndex: "a0",
    data: {
      label: effectiveAppSlug,
      appSlug: effectiveAppSlug,
      envVars: [],
    },
  };

  const { env: compiledEnv, envExample: compiledEnvExample } =
    generateEnvFilesForNode(
      targetAppNode,
      allNodes,
      allEdges,
      enrichedWebClientNodes,
    );

  const envFileIdx = files.findIndex((f) => f.filename === ".env");
  if (envFileIdx !== -1) {
    files[envFileIdx] = {
      filename: ".env",
      language: "dotenv",
      content: compiledEnv,
    };
  } else {
    files.push({
      filename: ".env",
      language: "dotenv",
      content: compiledEnv,
    });
  }

  const envExFileIdx = files.findIndex((f) => f.filename === ".env.example");
  if (envExFileIdx !== -1) {
    files[envExFileIdx] = {
      filename: ".env.example",
      language: "dotenv",
      content: compiledEnvExample,
    };
  } else {
    files.push({
      filename: ".env.example",
      language: "dotenv",
      content: compiledEnvExample,
    });
  }

  // 4. Auth Server, Client SDK, Authorization Helpers & Dependencies (only if authNode connected)
  generateAuthFilesAndDependencies({
    files,
    webClientNodes: enrichedWebClientNodes,
    pagesInfo,
    authNode,
    endpoints,
    events,
    allNodes,
    allEdges,
    testCases,
  });

  // 4.5 Payments (Creem) Client, Checkout & Webhooks (if payments node connected)
  generatePaymentsFilesAndDependencies({
    files,
    webAppNode,
    authNode,
    allNodes,
    allEdges,
    effectiveAppSlug,
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

  const rootLayoutPageInfo = pagesInfo.find(
    (p) => p.isLayout && (p.isRoot || p.routePath === "app/layout.tsx"),
  );
  const rootRealtimeConns = rootLayoutPageInfo?.realtimeConnections || [];
  const hasRootEventsDrawer = rootRealtimeConns.length > 0;

  if (hasRootEventsDrawer) {
    files.push({
      filename: "app/_components/LayoutEventsDrawer.tsx",
      language: "typescript",
      content: generateLayoutEventsDrawer(
        rootRealtimeConns,
        Boolean(authNode),
        "Root",
      ),
    });
  }

  files.push({
    filename: "app/layout.tsx",
    language: "typescript",
    content: generateRootLayout(
      projectName,
      navLinksHtml,
      showNav,
      resolvedProviders.hasProviders,
      hasRootEventsDrawer,
    ),
  });

  files.push({
    filename: "proxy.ts",
    language: "typescript",
    content: generateProxy(pagesInfo, authNode?.data),
  });

  // 7. Pages, Action Event Components, Page Headers & Auth Components
  const { pageFiles, hasTransformers: pageHasTransformers } = generatePageAndComponentFiles({
    webClientNodes: enrichedWebClientNodes,
    pagesInfo,
    endpoints,
    allNodes,
    allEdges,
    authNode,
    files,
  });
  files.push(...pageFiles);

  if (
    hasTransformers ||
    pageHasTransformers ||
    pageFiles.some((f) => f.content.includes("@workspace/transformers"))
  ) {
    ensureTransformerDependencies(files, true);
  }

  // 8. Colocated Next.js Service Route Handlers
  associatedNextjsServiceNodes.forEach((svcNode) => {
    let svcEndpoints = endpoints.filter((ep) => ep.nodeId === svcNode.id);
    if (svcEndpoints.length === 0 && svcNode.data?.endpoints) {
      svcEndpoints = (svcNode.data.endpoints as Endpoint[]).map((ep) => ({
        ...ep,
        nodeId: svcNode.id,
      }));
    }

    if (svcEndpoints.length > 0) {
      const svcRoutes = generateNextjsRoutes({
        serviceName: svcNode.data?.label || "api",
        nodeEndpoints: svcEndpoints,
        serviceNode: svcNode,
        allNodes,
        allEdges,
        hasDb,
      });
      files.push(...svcRoutes);
    }
  });

  // 9. Web page E2E Tests
  files.push(
    ...generateWebClientE2ETests(
      enrichedWebClientNodes,
      endpoints,
      events,
      allNodes,
      allEdges,
      testCases,
    ),
  );

  const webPageName =
    enrichedWebClientNodes.length === 1
      ? enrichedWebClientNodes[0]?.data.label || "web-client"
      : "web-client";
  const webPageId =
    enrichedWebClientNodes.length === 1 && enrichedWebClientNodes[0]
      ? enrichedWebClientNodes[0].id
      : "web-client";

  return {
    webPageId,
    webPageName,
    files,
  };
}
