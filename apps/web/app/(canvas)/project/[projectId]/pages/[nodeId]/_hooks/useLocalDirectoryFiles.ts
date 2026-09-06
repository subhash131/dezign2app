"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { isElectron, getElectronAPI } from "@/lib/electron";
import { FileTreeNode } from "../../../_components/compiler";
import { toast } from "sonner";

interface UseLocalDirectoryFilesOptions {
  outputDir: string;
  onPickDirectory?: () => void;
}

declare global {
  interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | BufferSource | Blob): Promise<void>;
    close(): Promise<void>;
  }

  interface FileSystemFileHandle {
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
  }

  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  }

  interface Window {
    showDirectoryPicker?(options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
    }): Promise<FileSystemDirectoryHandle>;
  }
}

const NEVER_SHOW_DIRS = new Set([
  ".git",
  ".DS_Store",
  "Thumbs.db",
]);

/**
 * Hook that manages reading and writing real files from the user's selected local folder on disk.
 * Supports native Electron filesystem and browser File System Access API.
 */
export function useLocalDirectoryFiles({
  outputDir,
  onPickDirectory,
}: UseLocalDirectoryFilesOptions) {
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [totalFiles, setTotalFiles] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const browserDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Helper to scan directory using browser File System Access API
  const scanBrowserDirectory = useCallback(
    async (
      dirHandle: FileSystemDirectoryHandle,
      subPath = "",
      depth = 0
    ): Promise<{ nodes: FileTreeNode[]; count: number }> => {
      const nodes: FileTreeNode[] = [];
      let count = 0;

      const isHeavy =
        subPath === "node_modules" ||
        subPath.endsWith("/node_modules") ||
        subPath.includes("node_modules/") ||
        subPath === ".pnpm-store" ||
        subPath.includes(".pnpm-store/");

      for await (const entry of dirHandle.values()) {
        if (NEVER_SHOW_DIRS.has(entry.name)) {
          continue;
        }

        const relPath = subPath ? `${subPath}/${entry.name}` : entry.name;

        if (entry.kind === "directory") {
          const sub =
            !isHeavy || depth < 1
              ? await scanBrowserDirectory(
                  entry,
                  relPath,
                  depth + 1
                )
              : { nodes: [], count: 0 };
          count += sub.count;
          nodes.push({
            name: entry.name,
            path: relPath,
            isFolder: true,
            children: sub.nodes,
          });
        } else if (entry.kind === "file") {
          count += 1;
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

      return { nodes, count };
    },
    []
  );

  // Refresh and load files from the local directory
  const refreshFiles = useCallback(async () => {
    if (!outputDir) {
      setFileTree([]);
      setTotalFiles(0);
      return;
    }

    setIsLoading(true);

    try {
      // 1. Electron Desktop Mode: Read directly from native filesystem
      if (isElectron()) {
        const api = getElectronAPI();
        if (api?.fs?.listDirectory) {
          const result = await api.fs.listDirectory(outputDir);
          if (result && result.success) {
            setFileTree(result.tree as FileTreeNode[]);
            setTotalFiles(result.totalFiles);
            return;
          }
        }
      }

      // 2. Browser Mode: Check if we have an active DirectoryHandle
      if (browserDirHandleRef.current) {
        const { nodes, count } = await scanBrowserDirectory(browserDirHandleRef.current);
        setFileTree(nodes);
        setTotalFiles(count);
        return;
      }
    } catch (err) {
      console.warn("[useLocalDirectoryFiles] Failed to scan local directory:", err);
    } finally {
      setIsLoading(false);
    }
  }, [outputDir, scanBrowserDirectory]);

  // Initial load and whenever outputDir changes
  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  // Read a single file's content from local disk
  const readFile = useCallback(
    async (relativePath: string): Promise<string | null> => {
      if (!outputDir || !relativePath) return null;

      // 1. Electron Desktop Mode
      if (isElectron()) {
        const api = getElectronAPI();
        if (api?.fs?.readFile) {
          try {
            const res = await api.fs.readFile(outputDir, relativePath);
            if (res && res.success && typeof res.content === "string") {
              return res.content;
            }
          } catch (err) {
            console.warn(`[useLocalDirectoryFiles] Error reading ${relativePath}:`, err);
          }
        }
      }

      // 2. Browser File System Access API
      if (browserDirHandleRef.current) {
        try {
          const parts = relativePath.split(/[\\/]/);
          let currentHandle: FileSystemDirectoryHandle = browserDirHandleRef.current;

          for (let i = 0; i < parts.length - 1; i++) {
            const dirName = parts[i];
            if (dirName) {
              currentHandle = await currentHandle.getDirectoryHandle(dirName);
            }
          }

          const fileName = parts[parts.length - 1];
          if (fileName) {
            const fileHandle = await currentHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            return await file.text();
          }
        } catch (err) {
          console.warn(`[useLocalDirectoryFiles] Browser error reading ${relativePath}:`, err);
        }
      }

      return null;
    },
    [outputDir]
  );

  // Write a single file's content to local disk
  const writeFile = useCallback(
    async (relativePath: string, content: string): Promise<boolean> => {
      if (!outputDir || !relativePath) return false;

      // 1. Electron Desktop Mode
      if (isElectron()) {
        const api = getElectronAPI();
        if (api?.fs?.writeProject) {
          try {
            const res = await api.fs.writeProject(
              outputDir,
              [{ filename: relativePath, content }],
              { cleanStale: false }
            );
            return Boolean(res?.success);
          } catch (err) {
            console.warn(`[useLocalDirectoryFiles] Error writing ${relativePath}:`, err);
            return false;
          }
        }
      }

      // 2. Browser File System Access API
      if (browserDirHandleRef.current) {
        try {
          const parts = relativePath.split(/[\\/]/);
          let currentHandle: FileSystemDirectoryHandle = browserDirHandleRef.current;

          for (let i = 0; i < parts.length - 1; i++) {
            const dirName = parts[i];
            if (dirName) {
              currentHandle = await currentHandle.getDirectoryHandle(dirName, {
                create: true,
              });
            }
          }

          const fileName = parts[parts.length - 1];
          if (fileName) {
            const fileHandle = await currentHandle.getFileHandle(fileName, {
              create: true,
            });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            return true;
          }
        } catch (err) {
          console.warn(`[useLocalDirectoryFiles] Browser error writing ${relativePath}:`, err);
          return false;
        }
      }

      return false;
    },
    [outputDir]
  );

  // Pick folder in Browser mode if not using Electron
  const pickBrowserFolder = useCallback(async () => {
    if (typeof window === "undefined" || !("showDirectoryPicker" in window) || !window.showDirectoryPicker) {
      if (onPickDirectory) onPickDirectory();
      return;
    }

    try {
      const handle = await window.showDirectoryPicker();
      if (handle) {
        browserDirHandleRef.current = handle;
        const { nodes, count } = await scanBrowserDirectory(handle);
        setFileTree(nodes);
        setTotalFiles(count);
        toast.success(`Connected to local folder: ${handle.name}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        console.warn("[useLocalDirectoryFiles] Failed to pick browser folder:", err);
      }
    }
  }, [onPickDirectory, scanBrowserDirectory]);

  return {
    fileTree,
    totalFiles,
    isLoading,
    refreshFiles,
    readFile,
    writeFile,
    pickBrowserFolder,
  };
}
