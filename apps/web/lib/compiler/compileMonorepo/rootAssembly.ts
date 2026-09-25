// ═══════════════════════════════════════════════════════════════════════════
// MODULE:  rootAssembly
// LAYER:   assemblers
// PURPOSE: Steps 7–9 — builds the root tsconfig.json reference list,
//          generates the root README.md, and generates all Docker manifests.
//
// EMITS:
//   tsconfig.json          (root TypeScript project references)
//   README.md              (project overview)
//   docker-compose.yml     (local dev compose)
//   Dockerfile.*           (per-service Dockerfiles)
//   .dockerignore
//   scripts/start-local.*  (local startup helpers)
// ═══════════════════════════════════════════════════════════════════════════

import { BackendNode, BackendEdge } from "@/types/canvas";
import { CompiledFile } from "@workspace/canvas/types";
import { FolderEntry } from "./folderNameResolver";
import { generateRootReadme } from "../generators/readmeGenerator";
import { generateDockerFiles } from "../generators/dockerGenerator";

/** All parameters required by {@link assembleRoot}. */
export interface RootAssemblyParams {
  nodes: BackendNode[];
  edges: BackendEdge[];
  files: CompiledFile[];
  servicesInfo: FolderEntry[];
  webClientsInfo: FolderEntry[];
  entityNodeCount: number;
  webPageNodeCount: number;
  /** All package and app paths that should appear in the root tsconfig references. */
  rawRootPaths: string[];
  projectName: string;
  hasKafka: boolean;
  hasRedis: boolean;
  hasDb: boolean;
  redisFolder: string;
  redisPackageFolder?: string;
  hasStorage?: boolean;
}

/**
 * Generates root-level assembly files (steps 7–9):
 *  - Step 7: `tsconfig.json` with filtered project references
 *  - Step 8: `README.md`
 *  - Step 9: Docker manifests (Dockerfiles, docker-compose.yml, etc.)
 *
 * Returns the assembled files to be merged into the final file list.
 *
 * @debugTag root-assembly-step-7-to-9
 */
export function assembleRoot(params: RootAssemblyParams): CompiledFile[] {
  const {
    nodes,
    edges,
    files,
    servicesInfo,
    webClientsInfo,
    entityNodeCount,
    webPageNodeCount,
    rawRootPaths,
    projectName,
    hasKafka,
    hasRedis,
    hasDb,
    redisFolder,
    redisPackageFolder,
    hasStorage,
  } = params;

  const assembled: CompiledFile[] = [];

  // ── step 7 | root tsconfig.json ──────────────────────────────────────────
  // Filter paths to only those that actually have a tsconfig.json file
  // (avoids adding broken references for packages that didn't emit one).
  const rootReferences = Array.from(new Set(rawRootPaths))
    .filter((p) => files.some((f) => f.filename === `${p}/tsconfig.json`))
    .map((p) => ({ path: p }));

  const rootTsconfig = JSON.stringify(
    {
      // Root tsconfig uses project references only — no direct compilation
      files: [],
      references: rootReferences,
    },
    null,
    2,
  );

  // ✦ step-7 | tsconfig → tsconfig.json
  assembled.push({
    filename: "tsconfig.json",
    language: "json",
    content: rootTsconfig,
  });

  // ── step 8 | README.md ───────────────────────────────────────────────────
  // ✦ step-8 | readme → README.md
  assembled.push(
    generateRootReadme(
      projectName,
      servicesInfo.length,
      webPageNodeCount,
      entityNodeCount,
      servicesInfo,
      webClientsInfo,
      hasKafka,
      hasRedis,
      hasDb,
      redisFolder,
      redisPackageFolder,
      hasStorage,
    ),
  );

  // ── step 9 | Docker manifests ────────────────────────────────────────────
  // ✦ step-9 | docker → Dockerfile.*, docker-compose.yml, .dockerignore, scripts/*
  const dockerFiles = generateDockerFiles({
    nodes,
    edges,
    services: servicesInfo,
    webClients: webClientsInfo,
    projectName,
    hasKafka,
    hasRedis,
  });
  assembled.push(...dockerFiles);

  return assembled;
}
