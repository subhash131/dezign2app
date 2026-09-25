// ═══════════════════════════════════════════════════════════════════════════
// MODULE:  compileMonorepo  (thin orchestrator)
// LAYER:   entry point
// PURPOSE: Coordinates the full monorepo compilation pipeline.
//          All heavy logic lives in the compileMonorepo/ sub-modules below.
//
// PIPELINE OVERVIEW:
//   step 0   — classifyNodes        → typed node subsets
//   step 1-4.11 — sharedPackages   → packages/**
//   step 5   — service apps         → apps/<service>/**
//   step 5.5 — langgraph apps       → apps/<langgraph>/**
//   step 6   — web-app clients      → apps/<webapp>/**
//   step 7   — root tsconfig.json
//   step 8   — README.md
//   step 9   — Docker manifests
//   final    — deduplication
// ═══════════════════════════════════════════════════════════════════════════

import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledFile, CompiledMonorepoResult } from "@workspace/canvas/types";

// ── Sub-module imports ────────────────────────────────────────────────────
import { classifyNodes } from "./compileMonorepo/classifyNodes";
import { createFolderNameResolvers } from "./compileMonorepo/folderNameResolver";
import { compileSharedPackages } from "./compileMonorepo/sharedPackages";
import { buildWebAppMap } from "./compileMonorepo/webAppMapper";
import { compileAllApps } from "./compileMonorepo/appCompilers";
import { assembleRoot } from "./compileMonorepo/rootAssembly";
import { compileKafkaNodes } from "./compileKafkaNodes";
import { compileDatabaseNodes } from "./compileDatabaseNodes";
import { compileRedisNodes } from "./compileRedisNodes";

/**
 * Compiles the entire system architecture canvas into a production-ready
 * Turborepo + pnpm monorepo matching standard monorepo structure.
 *
 * Public API is unchanged — all internal logic is delegated to sub-modules
 * in the `compileMonorepo/` directory for easier debugging and testing.
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
  // ── step 0 | classify nodes ───────────────────────────────────────────────
  const {
    langGraphNodes,
    entityNodes,
    webPageNodes,
    webAppNodes,
    standaloneServiceNodes,
  } = classifyNodes(nodes, edges);

  // ── folder-name resolvers (deduplication state) ───────────────────────────
  const {
    getUniqueServiceFolder,
    getUniqueWebAppFolder,
    servicesInfo,
    webClientsInfo,
  } = createFolderNameResolvers();

  // Pre-populate servicesInfo so shared packages (types, grpc, docker) get
  // consistent folder names before any individual service is compiled.
  standaloneServiceNodes.forEach((srvNode) => {
    const rawName = srvNode.data?.label || srvNode.id || "Service";
    const folderName = getUniqueServiceFolder(rawName, "service");
    servicesInfo.push({ id: srvNode.id, name: rawName, folderName });
  });
  langGraphNodes.forEach((lgNode) => {
    const rawName = lgNode.data?.label || lgNode.id || "LangGraph Service";
    const folderName = getUniqueServiceFolder(rawName, "langgraph-service");
    servicesInfo.push({ id: lgNode.id, name: rawName, folderName });
  });

  // ── steps 1–4.11 | shared packages ───────────────────────────────────────
  const sharedResult = compileSharedPackages(
    nodes,
    edges,
    endpoints,
    events,
    servicesInfo,
    projectName,
  );

  // ── step 6 | build webApp → page-nodes mapping ───────────────────────────
  const webAppMap = (webAppNodes.length > 0 || webPageNodes.length > 0)
    ? buildWebAppMap(webAppNodes, webPageNodes, edges)
    : new Map();

  // ── steps 5, 5.5, 6 | compile all apps ───────────────────────────────────
  const appsResult = compileAllApps({
    standaloneServiceNodes,
    langGraphNodes,
    webAppMap,
    servicesInfo,
    webClientsInfo,
    nodes,
    edges,
    endpoints,
    events,
    testCases,
    dbFunctions: sharedResult.dbFunctions,
    kafkaFunctions: sharedResult.kafkaFunctions,
    redisFunctions: sharedResult.redisFunctions,
    externalFunctions: sharedResult.externalFunctions,
    compiledFrontend: sharedResult.compiledFrontend,
    projectName,
    getUniqueLangGraphFolder: getUniqueServiceFolder,
    getUniqueWebAppFolder,
  });

  // ── Gather all files so far for tsconfig reference filtering ─────────────
  const allFilesBeforeRoot: CompiledFile[] = [
    ...sharedResult.files,
    ...appsResult.files,
  ];

  // ── Build the raw path list for root tsconfig references ─────────────────
  const compiledKafka = compileKafkaNodes(nodes, edges);
  const compiledDb = compileDatabaseNodes(nodes, edges);
  const compiledRedis = compileRedisNodes(nodes, edges);

  const dbPackagePaths =
    compiledDb.packages && compiledDb.packages.length > 0
      ? Array.from(
          new Set(
            compiledDb.packages.map((p) =>
              p.packageFolder ? `packages/db/${p.packageFolder}` : "packages/db",
            ),
          ),
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
    ...sharedResult.grpcPackageFolders,
    ...sharedResult.storagePackageFolders,
    ...servicesInfo.map((s) => `apps/${s.folderName}`),
    ...webClientsInfo.map((w) => `apps/${w.folderName}`),
  ];

  // ── steps 7–9 | root tsconfig, README, Docker ────────────────────────────
  const rootFiles = assembleRoot({
    nodes,
    edges,
    files: allFilesBeforeRoot,
    servicesInfo,
    webClientsInfo,
    entityNodeCount: entityNodes.length,
    webPageNodeCount: webPageNodes.length,
    rawRootPaths,
    projectName,
    hasKafka: compiledKafka.files.length > 0,
    hasRedis: compiledRedis.files.length > 0,
    hasDb: compiledDb.files.length > 0,
    redisFolder: compiledRedis.packageFolder || "redis",
    redisPackageFolder:
      compiledRedis.packageFolder && compiledRedis.packageFolder !== "redis"
        ? compiledRedis.packageFolder
        : undefined,
    hasStorage: sharedResult.storagePackageFolders.length > 0,
  });

  // ── final | deduplicate (last write wins for any duplicated file path) ────
  const uniqueFilesMap = new Map<string, CompiledFile>();
  [...allFilesBeforeRoot, ...rootFiles].forEach((file) => {
    uniqueFilesMap.set(file.filename, file);
  });

  return {
    projectName,
    files: Array.from(uniqueFilesMap.values()),
    services: servicesInfo,
    webClients: webClientsInfo,
  };
}

