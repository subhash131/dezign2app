import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledFile, CompiledMonorepoResult, ReusableFunction } from "@workspace/canvas/types";
import { compileServiceNode } from "./compileServiceNode";
import { compileLangGraphNode } from "./compileLangGraphNode";
import { compileDatabaseNodes } from "./compileDatabaseNodes";
import { compileKafkaNodes } from "./compileKafkaNodes";
import { compileRedisNodes } from "./compileRedisNodes";
import { compileWebClientNodes } from "./compileWebClientNode";
import { compileUiPackage } from "./compileUiPackage";
import { generateLoggerPackage } from "./generators/loggerGenerator";
import { generateTypesPackage } from "./generators/typesGenerator";
import {
  generateRootFiles,
  generateTypescriptConfigPackage,
} from "./generators/rootFilesGenerator";
import { generateRootReadme } from "./generators/readmeGenerator";
import { compileGrpcPackages } from "./grpc";

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
  projectName: string = "Blueprint Monorepo",
): CompiledMonorepoResult {
  const files: CompiledFile[] = [];

  const serviceNodes = nodes.filter((n) => n.type === "service");
  const langGraphNodes = nodes.filter((n) => n.type === "langgraph");
  const entityNodes = nodes.filter(
    (n) => n.type === "entity" || n.type === "db_ref",
  );
  const webClientNodes = nodes.filter(
    (n) => n.type === "webClient" || n.data?.isWebClient,
  );

  const servicesInfo: { id: string; name: string; folderName: string }[] = [];
  const webClientsInfo: { id: string; name: string; folderName: string }[] = [];

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

  // 4. Generate Shared Package: packages/db (@workspace/db)
  const compiledDb = compileDatabaseNodes(nodes, edges);
  compiledDb.files.forEach((f) => {
    files.push({
      filename: `packages/db/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

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
  const compiledTypes = generateTypesPackage(nodes, endpoints, events);
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

  // Collect reusable functions from db + kafka packages for service route generation
  const dbFunctions: ReusableFunction[] = compiledDb.reusableFunctions ?? [];
  const kafkaFunctions: ReusableFunction[] = compiledKafka.reusableFunctions ?? [];

  // 4.8 Generate Shared Package: packages/redis (@workspace/redis)
  const compiledRedis = compileRedisNodes(nodes, edges);
  compiledRedis.files.forEach((f) => {
    files.push({
      filename: `packages/redis/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

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

  // Helper to resolve unique folder name for web clients
  const getUniqueWebClientFolder = (slug: string, defaultName: string) => {
    const base = (slug || defaultName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || defaultName;
    let folderName = base;
    let counter = 1;
    while (webClientsInfo.some((w) => w.folderName === folderName)) {
      counter++;
      folderName = `${base}-${counter}`;
    }
    return folderName;
  };

  // 5. Generate Apps: apps/<sanitizedName> for Service Nodes
  serviceNodes.forEach((srvNode) => {
    const rawName = srvNode.data?.label || "Service";
    const folderName = getUniqueServiceFolder(rawName, "service");
    servicesInfo.push({
      id: srvNode.id,
      name: rawName,
      folderName,
    });

    const srvResult = compileServiceNode(
      srvNode,
      endpoints,
      events,
      nodes,
      edges,
      testCases,
      dbFunctions,
      kafkaFunctions,
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
    const rawName = lgNode.data?.label || "LangGraph Service";
    const folderName = getUniqueServiceFolder(rawName, "langgraph-service");
    servicesInfo.push({
      id: lgNode.id,
      name: rawName,
      folderName,
    });

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

  // 6. Generate Web Apps: apps/<appSlug> for WebApp nodes & connected WebClient pages
  const webAppNodes = nodes.filter((n) => n.type === "webApp");

  if (webAppNodes.length > 0 || webClientNodes.length > 0) {
    const appMap = new Map<string, { appName: string; appSlug: string; webAppNode?: BackendNode; pageNodes: BackendNode[] }>();

    // Process explicit WebApp nodes
    webAppNodes.forEach((appNode) => {
      const appName = appNode.data?.label || "Web Application";
      const appSlug =
        appNode.data?.appSlug ||
        appName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      if (!appMap.has(appSlug)) {
        appMap.set(appSlug, {
          appName,
          appSlug,
          webAppNode: appNode,
          pageNodes: [],
        });
      }
    });

    // Default app slug from first WebApp node or fallback "web-app"
    const defaultAppSlug =
      webAppNodes.length > 0
        ? (webAppNodes[0]!.data?.appSlug ||
           (webAppNodes[0]!.data?.label || "web-app").toLowerCase().replace(/[^a-z0-9]+/g, "-"))
        : "web-app";

    if (webAppNodes.length === 0 && !appMap.has(defaultAppSlug)) {
      appMap.set(defaultAppSlug, {
        appName: "Web Application",
        appSlug: defaultAppSlug,
        pageNodes: [],
      });
    }

    // Process page nodes (WebClient) and trace their section connections to WebApp nodes
    webClientNodes.forEach((pageNode) => {
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
            targetAppNode.data?.appSlug ||
            (targetAppNode.data?.label || "web-app")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-");

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
                .replace(/[^a-z0-9]+/g, "-");
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
            routeGroup = cleanHandle ? cleanHandle.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "public";
          }
        }
      } else if (pageNode.data?.appSlug) {
        targetAppSlug = pageNode.data.appSlug;
        routeGroup =
          pageNode.data.routeGroup ||
          (pageNode.data.accessType && pageNode.data.accessType !== "public" ? "private" : "public");
      } else {
        targetAppSlug = defaultAppSlug;
        routeGroup =
          pageNode.data?.routeGroup ||
          (pageNode.data?.accessType && pageNode.data?.accessType !== "public" ? "private" : "public");
      }

      if (!targetAppSlug) {
        return;
      }

      if (!appMap.has(targetAppSlug)) {
        appMap.set(targetAppSlug, {
          appName: pageNode.data?.appName || targetAppSlug,
          appSlug: targetAppSlug,
          pageNodes: [],
        });
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

    appMap.forEach(({ appName, appSlug, pageNodes }) => {
      const folderName = getUniqueWebClientFolder(appSlug, "web-app");
      webClientsInfo.push({
        id: `web-app-${appSlug}`,
        name: appName,
        folderName,
      });

      const webClientResult = compileWebClientNodes(
        pageNodes,
        endpoints,
        events,
        nodes,
        edges,
        `${projectName} - ${appName}`,
        testCases,
        appSlug,
      );

      webClientResult.files.forEach((f) => {
        files.push({
          filename: `apps/${folderName}/${f.filename}`,
          language: f.language,
          content: f.content,
        });
      });
    });
  }

  // 7. Generate Root tsconfig.json (referencing packages and apps)
  const rawRootPaths = [
    "packages/typescript-config",
    "packages/ui",
    "packages/db",
    "packages/logger",
    "packages/types",
    ...(compiledKafka.files.length > 0 ? [`packages/${compiledKafka.packageFolder}`] : []),
    ...(compiledRedis.files.length > 0 ? ["packages/redis"] : []),
    ...grpcPackageFolders,
    ...servicesInfo.map((s) => `apps/${s.folderName}`),
    ...webClientsInfo.map((w) => `apps/${w.folderName}`),
  ];
  const rootReferences = Array.from(new Set(rawRootPaths)).map((p) => ({ path: p }));

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
      webClientNodes.length,
      entityNodes.length,
      servicesInfo,
      webClientsInfo,
      compiledKafka.files.length > 0,
      compiledRedis.files.length > 0,
    ),
  );

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
