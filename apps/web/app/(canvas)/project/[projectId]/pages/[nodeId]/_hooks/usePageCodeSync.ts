"use client";

import { useCallback, useMemo } from "react";
import { isElectron, getElectronAPI } from "@/lib/electron";
import { toast } from "sonner";
import type { BackendNode } from "@workspace/canvas";

interface UsePageCodeSyncOptions {
  connectedWebAppNode: BackendNode | null | undefined;
  pageFolderSlug: string;
  outputDir: string;
  node: BackendNode | null | undefined;
}

export interface ResolvedCodeResult {
  code: string;
  source: "disk" | "convex" | "none";
  filePath: string;
}

export function usePageCodeSync({
  connectedWebAppNode,
  pageFolderSlug,
  outputDir,
  node,
}: UsePageCodeSyncOptions) {
  const webAppSlug = useMemo(() => {
    const rawSlug = typeof connectedWebAppNode?.data?.appSlug === "string" ? connectedWebAppNode.data.appSlug : "";
    const rawLabel = typeof connectedWebAppNode?.data?.label === "string" ? connectedWebAppNode.data.label : "web-app";
    return (rawSlug || rawLabel).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }, [connectedWebAppNode]);

  const isRoot = useMemo(() => {
    return !pageFolderSlug || pageFolderSlug === "/" || pageFolderSlug === "page" || pageFolderSlug === "(public)";
  }, [pageFolderSlug]);

  const candidatePaths = useMemo<string[]>(() => {
    return [
      // Standard Monorepo root paths (used by Dezign2App monorepo exports)
      isRoot ? `apps/${webAppSlug}/app/(public)/page.tsx` : `apps/${webAppSlug}/app/(public)/${pageFolderSlug}/page.tsx`,
      isRoot ? `apps/${webAppSlug}/app/(${webAppSlug})/page.tsx` : `apps/${webAppSlug}/app/(${webAppSlug})/${pageFolderSlug}/page.tsx`,
      isRoot ? `apps/${webAppSlug}/app/(${pageFolderSlug})/page.tsx` : `apps/${webAppSlug}/app/(${pageFolderSlug})/page.tsx`,
      isRoot ? `apps/${webAppSlug}/app/page.tsx` : `apps/${webAppSlug}/app/${pageFolderSlug}/page.tsx`,
      // Direct WebApp folder paths
      isRoot ? `app/(public)/page.tsx` : `app/(public)/${pageFolderSlug}/page.tsx`,
      isRoot ? `app/(${webAppSlug})/page.tsx` : `app/(${webAppSlug})/${pageFolderSlug}/page.tsx`,
      isRoot ? `app/(${pageFolderSlug})/page.tsx` : `app/(${pageFolderSlug})/page.tsx`,
      isRoot ? `app/page.tsx` : `app/${pageFolderSlug}/page.tsx`,
    ];
  }, [webAppSlug, pageFolderSlug, isRoot]);

  const defaultFilePath = useMemo(() => {
    return isRoot
      ? `apps/${webAppSlug}/app/(public)/page.tsx`
      : `apps/${webAppSlug}/app/(public)/${pageFolderSlug}/page.tsx`;
  }, [webAppSlug, pageFolderSlug, isRoot]);

  // Helper to resolve the live code context from disk or Convex
  const resolveCurrentPageCode = useCallback(async (): Promise<ResolvedCodeResult> => {
    // 1. Try reading the live file from disk via Electron
    if (isElectron() && outputDir) {
      const electronApi = getElectronAPI();
      if (electronApi?.fs?.readFile) {
        for (const relPath of candidatePaths) {
          try {
            const res = await electronApi.fs.readFile(outputDir, relPath);
            if (res?.success && typeof res.content === "string" && res.content.trim().length > 0) {
              console.log(`[PageEditor] Loaded live code from disk (${res.path}): ${res.content.length} chars`);
              return { code: res.content, source: "disk", filePath: relPath };
            }
          } catch {}
        }
      }
    }

    // 2. Try Convex stored pageSourceCode
    if (node?.data?.pageSourceCode && typeof node.data.pageSourceCode === "string" && node.data.pageSourceCode.trim().length > 0) {
      console.log(`[PageEditor] Loaded code from Convex node data: ${node.data.pageSourceCode.length} chars`);
      return { code: node.data.pageSourceCode, source: "convex", filePath: defaultFilePath };
    }

    return { code: "", source: "none", filePath: defaultFilePath };
  }, [candidatePaths, outputDir, node, defaultFilePath]);

  // Helper to write generated code to disk
  const writeCodeToDisk = useCallback(async (code: string, targetPath?: string) => {
    if (!isElectron() || !outputDir) return;
    const electronApi = getElectronAPI();
    if (!electronApi?.fs?.writeProject) return;

    const fileToWrite = targetPath || defaultFilePath;
    try {
      await electronApi.fs.writeProject(
        outputDir,
        [{ filename: fileToWrite, content: code }],
        { cleanStale: false }
      );
      toast.success(`Page updated on disk (${fileToWrite}) — HMR reloading`);
    } catch (diskErr) {
      console.warn("[PageEditor] Failed to write to disk:", diskErr);
      toast.error("Could not write to disk — set your workspace folder in the terminal");
    }
  }, [outputDir, defaultFilePath]);

  return {
    resolveCurrentPageCode,
    writeCodeToDisk,
    defaultFilePath,
  };
}
