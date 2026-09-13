import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledFile, CompiledMonorepoResult, ReusableFunction } from "@workspace/canvas/types";
import { compileServiceNode } from "./compileServiceNode";
import { compileLangGraphNode } from "./compileLangGraphNode";
import { compileDatabaseNodes } from "./compileDatabaseNodes";
import { compileKafkaNodes } from "./compileKafkaNodes";
import { compileRedisNodes } from "./compileRedisNodes";
import { compileWebPageNodes } from "./compileWebPageNode";
import { compileUiPackage } from "./compileUiPackage";
import { generateLoggerPackage } from "./generators/loggerGenerator";
import { generateTypesPackage } from "./generators/typesGenerator";
import {
  generateRootFiles,
  generateTypescriptConfigPackage,
} from "./generators/rootFilesGenerator";
import { generateRootReadme } from "./generators/readmeGenerator";
import { generateDockerFiles } from "./generators/dockerGenerator";
import { compileGrpcPackages } from "./grpc";
import { compileTransformerHelpers } from "./compileTransformerHelpers";
import { compileFrontendNodes } from "./compileFrontendHelpers";
import { compileExternalNodes } from "./compileExternalNodes";
import { isServiceAssociatedWithAnyWebApp } from "./webClients/nextjs/v16/serviceResolver";

/**
 * Compiles the entire system architecture canvas into a production-ready
 * Turborepo + pnpm monorepo matching standard monorepo structure.
 */
export function compileMonorepo(
  nodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  edges: BackendEdge[] = [],
  testCases: SimulationTestCase[] = [],
  projectName: string = "Dezign2App Monorepo",
): CompiledMonorepoResult {
  const files: CompiledFile[] = [];

  const serviceNodes = nodes.filter((n) => n.type === "service");
  const langGraphNodes = nodes.filter((n) => n.type === "langgraph");
  const entityNodes = nodes.filter(
    (n) => n.type === "entity" || n.type === "db_ref",
  );
  const webPageNodes = nodes.filter(
    (n) => n.type === "webPage",
  );
  const webAppNodes = nodes.filter((n) => n.type === "webApp");

  // Next.js API services that are associated with a WebApp get compiled directly into that WebApp
  // rather than generating a standalone microservice application.
  const standaloneServiceNodes = serviceNodes.filter(
    (srvNode) => !isServiceAssociatedWithAnyWebApp(srvNode, webAppNodes, nodes, edges),
  );

  const servicesInfo: { id: string; name: string; folderName: string }[] = [];
  const webClientsInfo: { id: string; name: string; folderName: string }[] = [];

  // Helper to resolve unique folder name for services
  const getUniqueServiceFolder = (label: string, defaultName: string) => {
    const base = (label || defaultName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || defaultName;
    let folderName = base;
    let counter = 1;
    while (servicesInfo.some((s) => s.folderName === folderName)) {
      counter++;
      folderName = `${base}-${counter}`;
    }
    return folderName;
  };

  // Helper to resolve unique folder name for web apps
  const getUniqueWebAppFolder = (slug: string, defaultName: string) => {
    const base = (slug || defaultName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || defaultName;
    let folderName = base;
    let counter = 1;
    while (webClientsInfo.some((w) => w.folderName === folderName)) {
      counter++;
      folderName = `${base}-${counter}`;
    }
    return folderName;
  };

  // Pre-populate servicesInfo for standalone services so all packages and types are generated with consistent naming
  standaloneServiceNodes.forEach((srvNode) => {
    const rawName = srvNode.data?.label || srvNode.id || "Service";
    const folderName = getUniqueServiceFolder(rawName, "service");
    servicesInfo.push({
      id: srvNode.id,
      name: rawName,
      folderName,
    });
  });

  langGraphNodes.forEach((lgNode) => {
    const rawName = lgNode.data?.label || lgNode.id || "LangGraph Service";
    const folderName = getUniqueServiceFolder(rawName, "langgraph-service");
    servicesInfo.push({
      id: lgNode.id,
      name: rawName,
      folderName,
    });
  });

  // 1. Generate Root Manifest Files (package.json, pnpm-workspace.yaml, turbo.json, .gitignore)
  files.push(...generateRootFiles(projectName));

  // 2. Generate Shared Package: packages/typescript-config (@workspace/typescript-config)
  files.push(...generateTypescriptConfigPackage());

  // 3. Generate Shared Package: packages/ui (@workspace/ui - Shadcn UI)
  const compiledUi = compileUiPackage();
  compiledUi.files.forEach((f) => {
    files.push({
      filename: `packages/ui/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

  // 3.1. Generate Frontend Hooks & Components
  const compiledFrontend = compileFrontendNodes(nodes, edges, endpoints);
  compiledFrontend.globalFiles.forEach((f) => {
    files.push(f);
  });

  // 4. Generate Shared Database Packages under packages/db/* (@workspace/db or @workspace/db-<name>)
  const compiledDb = compileDatabaseNodes(nodes, edges);
  if (compiledDb.packages && compiledDb.packages.length > 0) {
    compiledDb.packages.forEach((pkg) => {
      pkg.files.forEach((f) => {
        const targetPath = !pkg.packageFolder
          ? `packages/db/${f.filename}`
          : `packages/db/${pkg.packageFolder}/${f.filename}`;
        files.push({
          filename: targetPath,
          language: f.language,
          content: f.content,
        });
      });
    });
  } else if (compiledDb.files.length > 0) {
    compiledDb.files.forEach((f) => {
      const targetPath = f.filename.startsWith("packages/")
        ? f.filename
        : `packages/db/${f.filename}`;
      files.push({
        filename: targetPath,
        language: f.language,
        content: f.content,
      });
    });
  }

  // 4.5 Generate Shared Package: packages/logger (@workspace/logger)
  const compiledLogger = generateLoggerPackage();
  compiledLogger.forEach((f) => {
    files.push({
      filename: `packages/logger/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

  // 4.6 Generate Shared Package: packages/types (@workspace/types)
  const compiledTypes = generateTypesPackage(nodes, endpoints, events, servicesInfo);
  compiledTypes.forEach((f) => {
    files.push({
      filename: `packages/types/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

  // 4.7 Generate Shared Package: packages/<kafkaNodeLabel> (@workspace/<kafkaNodeLabel>)
  const compiledKafka = compileKafkaNodes(nodes, edges);
  compiledKafka.files.forEach((f) => {
    files.push({
      filename: `packages/${compiledKafka.packageFolder}/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

  // 4.8 Generate Shared Package(s): packages/<redisFolder> (@workspace/<redisFolder>)
  const compiledRedis = compileRedisNodes(nodes, edges);
  if (compiledRedis.packages && compiledRedis.packages.length > 0) {
    compiledRedis.packages.forEach((pkg) => {
      pkg.files.forEach((f) => {
        files.push({
          filename: `packages/${pkg.packageFolder}/${f.filename}`,
          language: f.language,
          content: f.content,
        });
      });
    });
  } else if (compiledRedis.files.length > 0) {
    const redisFolder = compiledRedis.packageFolder || "redis";
    compiledRedis.files.forEach((f) => {
      files.push({
        filename: `packages/${redisFolder}/${f.filename}`,
        language: f.language,
        content: f.content,
      });
    });
  }

  // Collect reusable functions from db + kafka + redis packages for service route generation
  const dbFunctions: ReusableFunction[] = compiledDb.reusableFunctions ?? [];
  const kafkaFunctions: ReusableFunction[] = compiledKafka.reusableFunctions ?? [];
  const redisFunctions: ReusableFunction[] = compiledRedis.reusableFunctions ?? [];

  // 4.9 Generate Shared Packages: packages/grpc/<service-name>/ for gRPC inter-service calls
  const compiledGrpc = compileGrpcPackages(nodes, edges, endpoints);
  const grpcPackageFolders: string[] = [];
  compiledGrpc.packagesByServiceId.forEach(({ packageFolder, files: grpcFiles }) => {
    grpcFiles.forEach((f) => {
      files.push({
        filename: `packages/${f.filename}`,
        language: f.language,
        content: f.content,
      });
    });
    grpcPackageFolders.push(`packages/${packageFolder}`);
  });

  // 4.10 Generate Shared Transformer Helpers (@workspace/transformers & local helpers)
  const compiledTransformers = compileTransformerHelpers(nodes, edges);
  compiledTransformers.files.forEach((f) => {
    files.push(f);
  });

  // 4.11 Generate Shared External API Calling Tools (@workspace/external-apis)
  const compiledExternal = compileExternalNodes(nodes, edges);
  compiledExternal.files.forEach((f) => {
    files.push(f);
  });
  const externalFunctions: ReusableFunction[] = compiledExternal.reusableFunctions ?? [];

  // 5. Generate Apps: apps/<sanitizedName> for Standalone Service Nodes
  standaloneServiceNodes.forEach((srvNode) => {
    const srvInfo = servicesInfo.find((s) => s.id === srvNode.id);
    const folderName = srvInfo?.folderName || getUniqueServiceFolder(srvNode.data?.label || srvNode.id || "Service", "service");

    const srvResult = compileServiceNode(
      srvNode,
      endpoints,
      events,
      nodes,
      edges,
      testCases,
      [...dbFunctions, ...externalFunctions],
      kafkaFunctions,
      folderName,
      redisFunctions,
    );
    srvResult.files.forEach((f) => {
      files.push({
        filename: `apps/${folderName}/${f.filename}`,
        language: f.language,
        content: f.content,
      });
    });
  });

  // 5.5. Generate Apps: apps/<sanitizedName> for LangGraph Service Nodes
  langGraphNodes.forEach((lgNode) => {
    const lgInfo = servicesInfo.find((s) => s.id === lgNode.id);
    const folderName = lgInfo?.folderName || getUniqueServiceFolder(lgNode.data?.label || lgNode.id || "LangGraph Service", "langgraph-service");

    const lgResult = compileLangGraphNode(lgNode, {
      edges,
      nodes,
      endpoints,
      events,
      testCases,
    });
    lgResult.files.forEach((f) => {
      files.push({
        filename: `apps/${folderName}/${f.filename}`,
        language: f.language,
        content: f.content,
      });
    });
  });

  // 6. Generate Web Apps: apps/<appSlug> for WebApp nodes & connected WebPage nodes
  if (webAppNodes.length > 0 || webPageNodes.length > 0) {
    const appMap = new Map<string, { appName: string; appSlug: string; webAppNode?: BackendNode; pageNodes: BackendNode[] }>();

    // Process explicit WebApp nodes
    webAppNodes.forEach((appNode) => {
      const appName = appNode.data?.label || "Web Application";
      const baseSlug =
        appNode.data?.appSlug?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
        appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
        "web-app";

      let appSlug = baseSlug;
      let counter = 1;
      while (appMap.has(appSlug)) {
        counter++;
        appSlug = `${baseSlug}-${counter}`;
      }

      appMap.set(appSlug, {
        appName,
        appSlug,
        webAppNode: appNode,
        pageNodes: [],
      });
    });

    // Process page nodes (WebPage) and trace their section connections to WebApp nodes
    webPageNodes.forEach((pageNode) => {
      // Find edge connecting this pageNode to a WebAppNode section (in either direction)
      const edgeToApp = edges.find(
        (e) =>
          (e.source === pageNode.id && webAppNodes.some((appNode) => appNode.id === e.target)) ||
          (e.target === pageNode.id && webAppNodes.some((appNode) => appNode.id === e.source)),
      );

      let targetAppSlug: string | undefined = undefined;
      let routeGroup: string = "public";
      let accessTypeOverride: "public" | "private" | "role-gated" | "payment-gated" | "org-gated" | undefined = undefined;

      if (edgeToApp) {
        const targetAppId = edgeToApp.source === pageNode.id ? edgeToApp.target : edgeToApp.source;
        const targetAppNode = webAppNodes.find((n) => n.id === targetAppId);
        if (targetAppNode) {
          targetAppSlug =
            targetAppNode.data?.appSlug?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
            (targetAppNode.data?.label || "web-app")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "") ||
            "web-app";

          const handle = (edgeToApp.source === pageNode.id ? edgeToApp.targetHandle : edgeToApp.sourceHandle) || "";
          const zones = targetAppNode.data?.zones || [];
          const matchedZone = zones.find((z: { handleId: string; name?: string; accessType?: string }) => z.handleId === handle);

          if (matchedZone) {
            if (matchedZone.accessType === "public" || handle.startsWith("public-in") || handle.includes("public")) {
              routeGroup = "public";
              accessTypeOverride = "public";
            } else if (matchedZone.accessType === "protected" || handle.startsWith("private-in") || handle.includes("private")) {
              routeGroup = "private";
              accessTypeOverride = "private";
            } else {
              const zoneSlug = (matchedZone.name || "custom")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
              routeGroup = zoneSlug || "custom";
              accessTypeOverride = "private";
            }
          } else if (handle.startsWith("public-in") || handle.includes("public")) {
            routeGroup = "public";
            accessTypeOverride = "public";
          } else if (handle.startsWith("private-in") || handle.includes("private")) {
            routeGroup = "private";
            accessTypeOverride = "private";
          } else if (handle.startsWith("role-in") || handle.includes("role")) {
            routeGroup = "role-gated";
            accessTypeOverride = "role-gated";
          } else if (handle.startsWith("payment-in") || handle.includes("payment")) {
            routeGroup = "payment-gated";
            accessTypeOverride = "payment-gated";
          } else if (handle.startsWith("org-in") || handle.includes("org")) {
            routeGroup = "org-gated";
            accessTypeOverride = "org-gated";
          } else {
            const cleanHandle = handle.replace(/-(in|out)$/, "").replace(/^zone-/, "");
            routeGroup = cleanHandle ? cleanHandle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "public";
          }
        }
      } else if (webAppNodes.length === 0) {
        const isConnected = edges.some((e) => e.source === pageNode.id || e.target === pageNode.id);
        if (isConnected && pageNode.data?.appSlug) {
          const candidateSlug = pageNode.data.appSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          if (!appMap.has(candidateSlug)) {
            appMap.set(candidateSlug, {
              appName: pageNode.data?.appName || candidateSlug,
              appSlug: candidateSlug,
              pageNodes: [],
            });
          }
          targetAppSlug = candidateSlug;
          routeGroup =
            pageNode.data?.routeGroup ||
            (pageNode.data?.accessType && pageNode.data?.accessType !== "public" ? "private" : "public");
        }
      }

      // If this page is not attached to an existing WebApp node on the canvas, do not compile it
      if (!targetAppSlug || !appMap.has(targetAppSlug)) {
        return;
      }

      const targetAppObj = appMap.get(targetAppSlug)!;
      const appNodeData = targetAppObj.webAppNode?.data;

      // Clone page node data with section access override & app parameters
      const enrichedPageNode: BackendNode = {
        ...pageNode,
        data: {
          ...pageNode.data,
          appSlug: targetAppSlug,
          appName: targetAppObj.appName,
          routeGroup,
          accessType: accessTypeOverride || pageNode.data?.accessType || "public",
          allowedRoles: pageNode.data?.allowedRoles || appNodeData?.allowedRoles,
          requiredPlans: pageNode.data?.requiredPlans || appNodeData?.requiredPlans,
          allowedOrgRoles: pageNode.data?.allowedOrgRoles || appNodeData?.allowedOrgRoles,
          authNodeId: pageNode.data?.authNodeId || appNodeData?.authNodeId,
        },
      };

      targetAppObj.pageNodes.push(enrichedPageNode);
    });

    appMap.forEach(({ appName, appSlug, pageNodes, webAppNode }) => {
      const folderName = getUniqueWebAppFolder(appSlug, "web-app");
      webClientsInfo.push({
        id: `web-app-${appSlug}`,
        name: appName,
        folderName,
      });

      const webClientResult = compileWebPageNodes(
        pageNodes,
        endpoints,
        events,
        nodes,
        edges,
        `${projectName} - ${appName}`,
        testCases,
        folderName,
        webAppNode,
      );

      webClientResult.files.forEach((f) => {
        files.push({
          filename: `apps/${folderName}/${f.filename}`,
          language: f.language,
          content: f.content,
        });
      });

      // Push app-local frontend hooks and components
      const appLocalItems =
        compiledFrontend.appLocalFiles.get(appSlug) ||
        compiledFrontend.appLocalFiles.get(folderName) ||
        [];
      appLocalItems.forEach((f) => {
        files.push({
          filename: `apps/${folderName}/${f.filename}`,
          language: f.language,
          content: f.content,
        });
      });
    });
  }

  // 7. Generate Root tsconfig.json (referencing packages and apps with valid tsconfig.json)
  const dbPackagePaths =
    compiledDb.packages && compiledDb.packages.length > 0
      ? compiledDb.packages.map((p) =>
          p.packageFolder ? `packages/db/${p.packageFolder}` : "packages/db",
        )
      : compiledDb.files.length > 0
        ? ["packages/db"]
        : [];

  const redisPackagePaths =
    compiledRedis.packages && compiledRedis.packages.length > 0
      ? compiledRedis.packages.map((p) => `packages/${p.packageFolder}`)
      : compiledRedis.files.length > 0
        ? [`packages/${compiledRedis.packageFolder || "redis"}`]
        : [];

  const rawRootPaths = [
    "packages/ui",
    ...dbPackagePaths,
    "packages/logger",
    "packages/types",
    ...(compiledKafka.files.length > 0 ? [`packages/${compiledKafka.packageFolder}`] : []),
    ...redisPackagePaths,
    ...grpcPackageFolders,
    ...servicesInfo.map((s) => `apps/${s.folderName}`),
    ...webClientsInfo.map((w) => `apps/${w.folderName}`),
  ];
  const rootReferences = Array.from(new Set(rawRootPaths))
    .filter((p) => files.some((f) => f.filename === `${p}/tsconfig.json`))
    .map((p) => ({ path: p }));

  const rootTsconfig = JSON.stringify(
    {
      files: [],
      references: rootReferences,
    },
    null,
    2,
  );
  files.push({
    filename: "tsconfig.json",
    language: "json",
    content: rootTsconfig,
  });

  // 8. Generate Root README.md
  files.push(
    generateRootReadme(
      projectName,
      servicesInfo.length,
      webPageNodes.length,
      entityNodes.length,
      servicesInfo,
      webClientsInfo,
      compiledKafka.files.length > 0,
      compiledRedis.files.length > 0,
      compiledDb.files.length > 0,
      compiledRedis.packageFolder || "redis",
      compiledRedis.packageFolder && compiledRedis.packageFolder !== "redis"
        ? compiledRedis.packageFolder
        : undefined,
    ),
  );

  // 9. Generate Docker Manifests (Dockerfiles, docker-compose.yml, .dockerignore, local startup scripts)
  const dockerFiles = generateDockerFiles({
    nodes,
    edges,
    services: servicesInfo,
    webClients: webClientsInfo,
    projectName,
    hasKafka: compiledKafka.files.length > 0,
    hasRedis: compiledRedis.files.length > 0,
  });
  files.push(...dockerFiles);

  // Deduplicate files by filename (keeping the latest definition for any duplicated file path)
  const uniqueFilesMap = new Map<string, CompiledFile>();
  files.forEach((file) => {
    uniqueFilesMap.set(file.filename, file);
  });
  const finalFiles = Array.from(uniqueFilesMap.values());

  return {
    projectName,
    files: finalFiles,
    services: servicesInfo,
    webClients: webClientsInfo,
  };
}
