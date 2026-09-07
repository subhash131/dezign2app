import { dialog, BrowserWindow } from "electron";
import path from "path";
import fs from "fs";

export interface CompiledFile {
  filename: string;
  content: string;
}

export interface WriteProjectResult {
  success: boolean;
  path: string;
  writtenCount: number;
  totalCount: number;
}

/**
 * Shows directory picker dialog to select project export folder.
 */
export async function pickDirectory(
  window?: BrowserWindow | null
): Promise<string | null> {
  const result = window
    ? await dialog.showOpenDialog(window, {
        title: "Choose output folder for your project",
        properties: ["openDirectory", "createDirectory"],
      })
    : await dialog.showOpenDialog({
        title: "Choose output folder for your project",
        properties: ["openDirectory", "createDirectory"],
      });

  return result.canceled ? null : (result.filePaths[0] ?? null);
}

/**
 * Writes compiled project files to target directory with file diff checking
 * and optional stale folder cleanup.
 */
export interface DeleteFilesResult {
  success: boolean;
  deletedCount: number;
  errors: string[];
}

/**
 * Safely deletes a list of relative or absolute files from outputDir,
 * cleaning up empty parent directories within the workspace.
 */
export async function deleteProjectFiles(
  outputDir: string,
  relativePaths: string[]
): Promise<DeleteFilesResult> {
  if (!outputDir || !fs.existsSync(outputDir) || !relativePaths || relativePaths.length === 0) {
    return { success: true, deletedCount: 0, errors: [] };
  }

  let deletedCount = 0;
  const errors: string[] = [];
  const normalizedOutputDir = path.resolve(outputDir);

  for (const relPath of relativePaths) {
    if (!relPath || typeof relPath !== "string") continue;
    try {
      const fullPath = path.isAbsolute(relPath) ? relPath : path.join(outputDir, relPath);
      const normalizedFullPath = path.resolve(fullPath);

      // Security check: ensure path stays within outputDir
      if (!normalizedFullPath.startsWith(normalizedOutputDir)) {
        continue;
      }

      if (fs.existsSync(normalizedFullPath)) {
        const stat = fs.statSync(normalizedFullPath);
        if (stat.isDirectory()) {
          fs.rmSync(normalizedFullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(normalizedFullPath);

          // Clean up empty parent directories recursively up to outputDir
          let parentDir = path.dirname(normalizedFullPath);
          while (parentDir !== normalizedOutputDir && parentDir.startsWith(normalizedOutputDir)) {
            try {
              const filesInParent = fs.readdirSync(parentDir);
              if (filesInParent.length === 0) {
                fs.rmdirSync(parentDir);
                parentDir = path.dirname(parentDir);
              } else {
                break;
              }
            } catch {
              break;
            }
          }
        }
        deletedCount++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Failed to delete ${relPath}: ${msg}`);
    }
  }

  return {
    success: errors.length === 0,
    deletedCount,
    errors,
  };
}

/**
 * Writes compiled project files to target directory with file diff checking
 * and optional stale folder / deleted files cleanup.
 */
export async function writeProject(
  outputDir: string,
  files: CompiledFile[],
  options?: { cleanStale?: boolean; deletedFiles?: string[] }
): Promise<WriteProjectResult> {
  if (!outputDir) {
    return { success: false, path: outputDir, writtenCount: 0, totalCount: 0 };
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // If explicit deletedFiles are passed, remove them from disk first
  if (options?.deletedFiles && options.deletedFiles.length > 0) {
    await deleteProjectFiles(outputDir, options.deletedFiles);
  }

  let writtenCount = 0;
  const currentFileSet = new Set<string>();

  for (const file of files) {
    const relativePath = file.filename.replace(/\\/g, "/");
    currentFileSet.add(relativePath);

    const fullPath = path.join(outputDir, relativePath);
    const targetDir = path.dirname(fullPath);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Check if file content changed before rewriting to minimize disk I/O and hot-reload watcher churn
    let needsWrite = true;
    if (fs.existsSync(fullPath)) {
      try {
        const existingContent = fs.readFileSync(fullPath, "utf-8");
        if (existingContent === file.content) {
          needsWrite = false;
        }
      } catch (e) {
        needsWrite = true;
      }
    }

    if (needsWrite) {
      fs.writeFileSync(fullPath, file.content, "utf-8");
      writtenCount++;
    }
  }

  // Optional safe cleanup of stale app folders and files if services/routes/consumers were renamed/deleted on canvas
  if (options?.cleanStale) {
    try {
      const cleanStaleDir = (dir: string) => {
        try {
          if (!fs.existsSync(dir)) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullEntryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (["node_modules", ".next", ".git", "dist", "build", ".turbo"].includes(entry.name)) continue;
              cleanStaleDir(fullEntryPath);
              try {
                if (fs.readdirSync(fullEntryPath).length === 0) {
                  fs.rmdirSync(fullEntryPath);
                }
              } catch {}
            } else if (entry.isFile()) {
              const relPath = path.relative(outputDir, fullEntryPath).replace(/\\/g, "/");
              if (!currentFileSet.has(relPath)) {
                try {
                  fs.unlinkSync(fullEntryPath);
                } catch (e) {
                  console.warn(`[fileWriter] Failed to delete stale file ${relPath}:`, e);
                }
              }
            }
          }
        } catch {}
      };

      const appsDir = path.join(outputDir, "apps");
      if (fs.existsSync(appsDir)) {
        const existingAppFolders = fs.readdirSync(appsDir, {
          withFileTypes: true,
        });
        for (const item of existingAppFolders) {
          if (item.isDirectory() && !item.name.startsWith(".")) {
            const appPrefix = `apps/${item.name}/`;
            const hasMatchingFile = Array.from(currentFileSet).some((f) =>
              f.startsWith(appPrefix)
            );
            if (!hasMatchingFile) {
              // Stale app directory that is no longer in canvas project
              const staleFolderPath = path.join(appsDir, item.name);
              fs.rmSync(staleFolderPath, { recursive: true, force: true });
            } else {
              // Clean up orphaned route/consumer/component files inside the app's app/, src/, and tests/ directories
              for (const sub of ["app", "src", "tests"]) {
                const subDir = path.join(appsDir, item.name, sub);
                cleanStaleDir(subDir);
              }
            }
          }
        }
      }

      // Also clean up stale packages if packages were deleted, and clean stale files inside package src/
      const packagesDir = path.join(outputDir, "packages");
      if (fs.existsSync(packagesDir)) {
        const existingPackageFolders = fs.readdirSync(packagesDir, {
          withFileTypes: true,
        });
        for (const item of existingPackageFolders) {
          if (
            item.isDirectory() &&
            !item.name.startsWith(".")
          ) {
            const pkgPrefix = `packages/${item.name}/`;
            const hasMatchingFile = Array.from(currentFileSet).some((f) =>
              f.startsWith(pkgPrefix)
            );
            if (
              !hasMatchingFile &&
              !["ui", "typescript-config", "logger", "types"].includes(item.name)
            ) {
              const stalePkgPath = path.join(packagesDir, item.name);
              fs.rmSync(stalePkgPath, { recursive: true, force: true });
            } else if (hasMatchingFile) {
              for (const sub of ["src", "tests"]) {
                const subDir = path.join(packagesDir, item.name, sub);
                cleanStaleDir(subDir);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("[main] Stale folder cleanup warning:", err);
    }
  }

  return {
    success: true,
    path: outputDir,
    writtenCount,
    totalCount: files.length,
  };
}

export interface ReadFileResult {
  success: boolean;
  content: string | null;
  path: string;
}

/**
 * Reads a single file from the project directory.
 */
export async function readProjectFile(
  outputDir: string,
  relativePath: string
): Promise<ReadFileResult> {
  if (!outputDir || !relativePath) {
    return { success: false, content: null, path: "" };
  }

  const fullPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(outputDir, relativePath);

  try {
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      return { success: true, content, path: fullPath };
    }
  } catch (err) {
    console.warn(`[fileWriter] Failed to read ${fullPath}:`, err);
  }

  return { success: false, content: null, path: fullPath };
}

export interface DiskTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: DiskTreeNode[];
}

export interface ListDirectoryResult {
  success: boolean;
  tree: DiskTreeNode[];
  totalFiles: number;
  path: string;
}

const NEVER_SHOW = new Set([
  ".git",
  ".DS_Store",
  "Thumbs.db",
]);

function scanDirectoryRecursive(
  rootDir: string,
  subDir: string = "",
  depth: number = 0,
  maxDepth: number = 8
): { nodes: DiskTreeNode[]; fileCount: number } {
  if (!rootDir || !fs.existsSync(rootDir) || depth > maxDepth) {
    return { nodes: [], fileCount: 0 };
  }

  const currentDir = subDir ? path.join(rootDir, subDir) : rootDir;
  if (!fs.existsSync(currentDir)) {
    return { nodes: [], fileCount: 0 };
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch (e) {
    return { nodes: [], fileCount: 0 };
  }

  const nodes: DiskTreeNode[] = [];
  let totalFiles = 0;

  // Limit depth inside heavy vendor folders like node_modules so directory scanning is instant
  const isHeavyFolder =
    subDir === "node_modules" ||
    subDir.endsWith("/node_modules") ||
    subDir.includes("node_modules/") ||
    subDir === ".pnpm-store" ||
    subDir.includes(".pnpm-store/");
  const effectiveMaxDepth = isHeavyFolder ? Math.min(maxDepth, depth + 1) : maxDepth;

  for (const entry of entries) {
    if (NEVER_SHOW.has(entry.name)) {
      continue;
    }

    const relPath = subDir
      ? `${subDir}/${entry.name}`.replace(/\\/g, "/")
      : entry.name;

    if (entry.isDirectory()) {
      const sub =
        depth < effectiveMaxDepth
          ? scanDirectoryRecursive(rootDir, relPath, depth + 1, effectiveMaxDepth)
          : { nodes: [], fileCount: 0 };
      totalFiles += sub.fileCount;
      nodes.push({
        name: entry.name,
        path: relPath,
        isFolder: true,
        children: sub.nodes,
      });
    } else {
      totalFiles += 1;
      nodes.push({
        name: entry.name,
        path: relPath,
        isFolder: false,
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  return { nodes, fileCount: totalFiles };
}

/**
 * Scans and returns the tree structure of files directly on the local filesystem.
 */
export async function listProjectDirectory(
  outputDir: string
): Promise<ListDirectoryResult> {
  if (!outputDir || !fs.existsSync(outputDir)) {
    return { success: false, tree: [], totalFiles: 0, path: outputDir || "" };
  }

  try {
    const { nodes, fileCount } = scanDirectoryRecursive(outputDir);
    return {
      success: true,
      tree: nodes,
      totalFiles: fileCount,
      path: outputDir,
    };
  } catch (err) {
    console.warn(`[fileWriter] Failed to list directory ${outputDir}:`, err);
    return { success: false, tree: [], totalFiles: 0, path: outputDir };
  }
}

