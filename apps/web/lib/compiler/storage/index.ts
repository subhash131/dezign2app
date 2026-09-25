import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  CompiledFile,
  CompiledStorageResult,
  CompiledStoragePackage,
  Endpoint,
  AnyMessagingResource,
} from "@workspace/canvas/types";
import { toStorageFolderName, isStorageNode, isServiceConnectedToStorage } from "./utils";
import {
  generateStoragePackageJson,
  generateStorageTsConfig,
  generateStorageIndexFile,
} from "./generators/packageFiles";
import { generateStorageConfigFile } from "./generators/config";
import { generateStorageClientFile } from "./generators/client";
import { generateStorageBucketsFile } from "./generators/buckets";
import { generateStorageOperationsFile } from "./generators/operations";
import { generateStorageReusableFunctions } from "./generators/reusableFunctions";

export * from "./utils";
export * from "./generators/packageFiles";
export * from "./generators/config";
export * from "./generators/client";
export * from "./generators/buckets";
export * from "./generators/operations";
export * from "./generators/reusableFunctions";

/**
 * Compiles storage nodes into modular package(s) under packages/storage/ (or packages/<folder>).
 */
export function compileStorageNodes(
  allNodes: BackendNode[],
  allEdges: BackendEdge[] = [],
  endpoints: (Endpoint & { nodeId?: string })[] = [],
  events: (AnyMessagingResource & { nodeId?: string })[] = [],
): CompiledStorageResult {
  const storageNodes = allNodes.filter(isStorageNode);

  if (storageNodes.length === 0) {
    return {
      files: [],
      reusableFunctions: [],
      packageFolder: "storage",
      packageName: "@workspace/storage",
    };
  }

  // If there are other service/app nodes present on canvas, verify that storage is actually connected
  const nonStorageAppNodes = allNodes.filter(
    (n) =>
      n.type === "service" ||
      n.type === "webApp" ||
      n.type === "webPage" ||
      n.type === "langgraph",
  );

  if (nonStorageAppNodes.length > 0) {
    const isAnyStorageConnected = nonStorageAppNodes.some((srv) =>
      isServiceConnectedToStorage(srv, allNodes, allEdges, endpoints, events),
    );
    if (!isAnyStorageConnected) {
      const firstLabel = storageNodes[0]?.data?.label || "storage";
      const folder = toStorageFolderName(firstLabel) || "storage";
      return {
        files: [],
        reusableFunctions: [],
        packageFolder: folder,
        packageName: `@workspace/${folder}`,
      };
    }
  }

  // Handle single vs multiple storage nodes
  const isMultiStorage = storageNodes.length > 1;

  if (!isMultiStorage) {
    const node = storageNodes[0]!;
    const label = node.data?.label || "Storage";
    const packageFolder = "storage";
    const packageName = "@workspace/storage";

    const packageFiles: CompiledFile[] = [
      generateStoragePackageJson(packageName, label),
      generateStorageTsConfig(),
      generateStorageConfigFile(node),
      generateStorageClientFile(node),
      generateStorageBucketsFile(node),
      generateStorageOperationsFile(node),
      generateStorageIndexFile(),
    ];

    const reusableFunctions = generateStorageReusableFunctions(
      packageName,
      packageFolder,
    );

    const singlePkg: CompiledStoragePackage = {
      packageName,
      packageFolder,
      storageNodeId: node.id,
      storageLabel: label,
      provider: node.data?.storageProvider || "s3",
      files: packageFiles,
      reusableFunctions,
    };

    return {
      files: packageFiles,
      packages: [singlePkg],
      packageFolder,
      packageName,
      reusableFunctions,
    };
  }

  // Multiple storage nodes: compile each into packages/storage/<folder>
  const compiledPackages: CompiledStoragePackage[] = [];
  const allFiles: CompiledFile[] = [];
  const seenFolders = new Set<string>();

  for (const node of storageNodes) {
    const rawLabel = node.data?.label || "storage";
    let folder = toStorageFolderName(rawLabel);
    if (seenFolders.has(folder)) {
      let c = 2;
      while (seenFolders.has(`${folder}-${c}`)) c++;
      folder = `${folder}-${c}`;
    }
    seenFolders.add(folder);

    const packageName = `@workspace/storage-${folder}`;
    const packageFiles: CompiledFile[] = [
      generateStoragePackageJson(packageName, rawLabel),
      generateStorageTsConfig(),
      generateStorageConfigFile(node),
      generateStorageClientFile(node),
      generateStorageBucketsFile(node),
      generateStorageOperationsFile(node),
      generateStorageIndexFile(),
    ];

    const reusableFunctions = generateStorageReusableFunctions(
      packageName,
      `storage/${folder}`,
    );

    compiledPackages.push({
      packageName,
      packageFolder: `storage/${folder}`,
      storageNodeId: node.id,
      storageLabel: rawLabel,
      provider: node.data?.storageProvider || "s3",
      files: packageFiles,
      reusableFunctions,
    });

    packageFiles.forEach((f) => {
      allFiles.push({
        filename: `storage/${folder}/${f.filename}`,
        language: f.language,
        content: f.content,
      });
    });
  }

  const allReusable = compiledPackages.flatMap((p) => p.reusableFunctions);

  return {
    files: allFiles,
    packages: compiledPackages,
    packageFolder: "storage",
    packageName: "@workspace/storage",
    reusableFunctions: allReusable,
  };
}
