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
  );

  // 2. Generate Route Group Layouts
  files.push(...generateRouteGroupLayouts(pagesInfo, Boolean(authNode), webAppNode));

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

  const allWebCustomDeps = [
    ...(webAppNode?.data?.customDependencies || []),
    ...webClientNodes.flatMap((p) => p.data?.customDependencies || []),
    ...extraDepsFromSectionsAndActions,
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
    content: generateRootLayout(projectName, navLinksHtml, showNav),
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
