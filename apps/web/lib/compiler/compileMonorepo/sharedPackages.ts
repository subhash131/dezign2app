// ═══════════════════════════════════════════════════════════════════════════
// MODULE:  sharedPackages
// LAYER:   compilers
// PURPOSE: Compiles all shared workspace packages (steps 1–4.11).
//          Each step pushes files into the `files[]` array under the correct
//          packages/<folder>/ path and collects ReusableFunction metadata.
//
// EMITS:
//   packages/              (root files, tsconfig-config, ui)
//   packages/db/**         (database packages)
//   packages/logger/**     (@workspace/logger)
//   packages/types/**      (@workspace/types)
//   packages/<kafka>/**    (kafka package)
//   packages/<redis>/**    (redis package(s))
//   packages/grpc/**       (gRPC packages)
//   packages/transformers/ (@workspace/transformers)
//   packages/external-apis/(@workspace/external-apis)
// ═══════════════════════════════════════════════════════════════════════════

import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  Endpoint,
  AnyMessagingResource,
  CompiledFile,
  ReusableFunction,
} from "@workspace/canvas/types";
import { FolderEntry } from "./folderNameResolver";
import { compileDatabaseNodes } from "../compileDatabaseNodes";
import { compileKafkaNodes } from "../compileKafkaNodes";
import { compileRedisNodes } from "../compileRedisNodes";
import { compileUiPackage } from "../compileUiPackage";
import { generateLoggerPackage } from "../generators/loggerGenerator";
import { generateTypesPackage } from "../generators/typesGenerator";
import {
  generateRootFiles,
  generateTypescriptConfigPackage,
} from "../generators/rootFilesGenerator";
import { compileGrpcPackages } from "../grpc";
import { compileTransformerHelpers } from "../compileTransformerHelpers";
import { compileExternalNodes } from "../compileExternalNodes";
import { compileFrontendNodes } from "../compileFrontendHelpers";
import { compileStorageNodes } from "../compileStorageNodes";

/** Output produced by {@link compileSharedPackages}. */
export interface SharedPackagesResult {
  /** All generated package files, ready to be prefixed with `packages/` paths. */
  files: CompiledFile[];
  /** Reusable DB helper functions for route generators. */
  dbFunctions: ReusableFunction[];
  /** Reusable Kafka publisher functions for route generators. */
  kafkaFunctions: ReusableFunction[];
  /** Reusable Redis helper functions for route generators. */
  redisFunctions: ReusableFunction[];
  /** Reusable external-API calling functions for route generators. */
  externalFunctions: ReusableFunction[];
  /** Reusable storage functions for route generators. */
  storageFunctions: ReusableFunction[];
  /**
   * Compiled frontend hooks / components.
   * - `globalFiles`: shared across all web-app clients
   * - `appLocalFiles`: keyed by appSlug, injected per web-app
   */
  compiledFrontend: ReturnType<typeof compileFrontendNodes>;
  /** gRPC package folder paths for tsconfig references, e.g. ["packages/grpc/my-service"]. */
  grpcPackageFolders: string[];
  /** Storage package folder paths for tsconfig references, e.g. ["packages/storage"]. */
  storagePackageFolders: string[];
}

/**
 * Compiles all shared workspace packages (steps 1 through 4.11) and returns
 * the combined file list plus reusable-function metadata for service compilers.
 *
 * @param nodes        - All canvas nodes.
 * @param edges        - All canvas edges.
 * @param endpoints    - All endpoint definitions.
 * @param events       - All messaging event definitions.
 * @param servicesInfo - Pre-populated service folder registry (read-only here).
 * @param projectName  - Human-readable project name for root files.
 * @returns            - {@link SharedPackagesResult}
 *
 * @debugTag shared-packages-step-1-to-4.11
 */
export function compileSharedPackages(
  nodes: BackendNode[],
  edges: BackendEdge[],
  endpoints: (Endpoint & { nodeId: string })[],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[],
  servicesInfo: FolderEntry[],
  projectName: string,
): SharedPackagesResult {
  const files: CompiledFile[] = [];

  // ── step 1 | root manifest files ─────────────────────────────────────────
  // ✦ emits: package.json, pnpm-workspace.yaml, turbo.json, .gitignore
  files.push(...generateRootFiles(projectName));

  // ── step 2 | @workspace/typescript-config ────────────────────────────────
  // ✦ emits: packages/typescript-config/**
  files.push(...generateTypescriptConfigPackage());

  // ── step 3 | @workspace/ui (Shadcn UI) ───────────────────────────────────
  // ✦ emits: packages/ui/**
  const compiledUi = compileUiPackage();
  compiledUi.files.forEach((f) => {
    files.push({
      filename: `packages/ui/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

  // ── step 3.1 | frontend hooks & components ───────────────────────────────
  // ✦ emits: packages/hooks/**, packages/components/** (global)
  //          and app-local files collected into compiledFrontend.appLocalFiles
  const compiledFrontend = compileFrontendNodes(nodes, edges, endpoints);
  compiledFrontend.globalFiles.forEach((f) => {
    files.push(f);
  });

  // ── step 4 | @workspace/db (database packages) ───────────────────────────
  // ✦ emits: packages/db/** or packages/db/<packageFolder>/**
  const compiledDb = compileDatabaseNodes(nodes, edges);
  if (compiledDb.packages && compiledDb.packages.length > 0) {
    compiledDb.packages.forEach((pkg) => {
      pkg.files.forEach((f) => {
        const targetPath = !pkg.packageFolder
          ? `packages/db/${f.filename}`
          : `packages/db/${pkg.packageFolder}/${f.filename}`;
        // ✦ step-4 | db-package → packages/db/<path>
        files.push({ filename: targetPath, language: f.language, content: f.content });
      });
    });
  } else if (compiledDb.files.length > 0) {
    compiledDb.files.forEach((f) => {
      const targetPath = f.filename.startsWith("packages/")
        ? f.filename
        : `packages/db/${f.filename}`;
      // ✦ step-4 | db-single → packages/db/<path>
      files.push({ filename: targetPath, language: f.language, content: f.content });
    });
  }

  // ── step 4.5 | @workspace/logger ─────────────────────────────────────────
  // ✦ emits: packages/logger/**
  const compiledLogger = generateLoggerPackage();
  compiledLogger.forEach((f) => {
    files.push({
      filename: `packages/logger/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

  // ── step 4.6 | @workspace/types ──────────────────────────────────────────
  // ✦ emits: packages/types/**
  const compiledTypes = generateTypesPackage(nodes, endpoints, events, servicesInfo, edges);
  compiledTypes.forEach((f) => {
    files.push({
      filename: `packages/types/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

  // ── step 4.7 | @workspace/<kafkaFolder> ──────────────────────────────────
  // ✦ emits: packages/<kafkaNodeLabel>/**
  const compiledKafka = compileKafkaNodes(nodes, edges);
  compiledKafka.files.forEach((f) => {
    // ✦ step-4.7 | kafka → packages/<kafkaFolder>/<filename>
    files.push({
      filename: `packages/${compiledKafka.packageFolder}/${f.filename}`,
      language: f.language,
      content: f.content,
    });
  });

  // ── step 4.8 | @workspace/<redisFolder> ──────────────────────────────────
  // ✦ emits: packages/<redisFolder>/** (one or more Redis packages)
  const compiledRedis = compileRedisNodes(nodes, edges);
  if (compiledRedis.packages && compiledRedis.packages.length > 0) {
    compiledRedis.packages.forEach((pkg) => {
      pkg.files.forEach((f) => {
        // ✦ step-4.8 | redis-multi → packages/<pkgFolder>/<filename>
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
      // ✦ step-4.8 | redis-single → packages/<redisFolder>/<filename>
      files.push({
        filename: `packages/${redisFolder}/${f.filename}`,
        language: f.language,
        content: f.content,
      });
    });
  }

  // ── step 4.9 | gRPC packages ──────────────────────────────────────────────
  // ✦ emits: packages/grpc/<service-name>/**
  const compiledGrpc = compileGrpcPackages(nodes, edges, endpoints);
  const grpcPackageFolders: string[] = [];
  compiledGrpc.packagesByServiceId.forEach(({ packageFolder, files: grpcFiles }) => {
    grpcFiles.forEach((f) => {
      // ✦ step-4.9 | grpc → packages/<path>
      files.push({ filename: `packages/${f.filename}`, language: f.language, content: f.content });
    });
    grpcPackageFolders.push(`packages/${packageFolder}`);
  });

  // ── step 4.10 | @workspace/transformers ──────────────────────────────────
  // ✦ emits: packages/transformers/** (global helpers)
  //          apps/<service>/src/transformers/** (local helpers via appCompilers step)
  const compiledTransformers = compileTransformerHelpers(nodes, edges);
  compiledTransformers.files.forEach((f) => {
    files.push(f);
  });

  // ── step 4.11 | @workspace/external-apis ─────────────────────────────────
  // ✦ emits: packages/external-apis/**
  const compiledExternal = compileExternalNodes(nodes, edges);
  compiledExternal.files.forEach((f) => {
    files.push(f);
  });

  // ── step 4.12 | @workspace/storage ──────────────────────────────────────
  // ✦ emits: packages/storage/** or packages/storage/<folder>/**
  const compiledStorage = compileStorageNodes(nodes, edges, endpoints, events);
  const storagePackageFolders: string[] = [];
  if (compiledStorage.packages && compiledStorage.packages.length > 0) {
    compiledStorage.packages.forEach((pkg) => {
      const folderPath = `packages/${pkg.packageFolder}`;
      storagePackageFolders.push(folderPath);
      pkg.files.forEach((f) => {
        files.push({
          filename: `${folderPath}/${f.filename}`,
          language: f.language,
          content: f.content,
        });
      });
    });
  } else if (compiledStorage.files.length > 0) {
    const defaultFolder = compiledStorage.packageFolder || "storage";
    const folderPath = `packages/${defaultFolder}`;
    storagePackageFolders.push(folderPath);
    compiledStorage.files.forEach((f) => {
      const targetPath = f.filename.startsWith("packages/")
        ? f.filename
        : f.filename.startsWith("storage/")
          ? `packages/${f.filename}`
          : `${folderPath}/${f.filename}`;
      files.push({
        filename: targetPath,
        language: f.language,
        content: f.content,
      });
    });
  }

  // ── Collect reusable function metadata for service route generators ───────
  const dbFunctions: ReusableFunction[] = compiledDb.reusableFunctions ?? [];
  const kafkaFunctions: ReusableFunction[] = compiledKafka.reusableFunctions ?? [];
  const redisFunctions: ReusableFunction[] = compiledRedis.reusableFunctions ?? [];
  const externalFunctions: ReusableFunction[] = compiledExternal.reusableFunctions ?? [];
  const storageFunctions: ReusableFunction[] = compiledStorage.reusableFunctions ?? [];

  return {
    files,
    dbFunctions,
    kafkaFunctions,
    redisFunctions,
    externalFunctions,
    storageFunctions,
    compiledFrontend,
    grpcPackageFolders,
    storagePackageFolders,
  };
}
