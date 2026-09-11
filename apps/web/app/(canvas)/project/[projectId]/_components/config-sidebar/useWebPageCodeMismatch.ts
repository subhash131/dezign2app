"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { isElectron, getElectronAPI } from "@/lib/electron";
import { toast } from "sonner";
import {
  pageRouteToFolderPath,
  pageRouteToUrl,
  parsePageRoute,
} from "@workspace/canvas";
import { compileWebPageNodes } from "@/lib/compiler/compileWebPageNode";
import {
  DiffSummary,
  computeDiffHunks,
  applySelectedHunks,
} from "./diffMergeUtils";
import type { BackendNode, BackendEdge } from "@/types/canvas";
import type { Endpoint } from "@workspace/canvas/types";

export type MismatchStatus =
  | "checking"
  | "synced"
  | "mismatch"
  | "no_disk_file"
  | "no_workspace";

interface UseWebPageCodeMismatchProps {
  projectId: string;
  nodeId: string;
  outputDir: string;
  node?: BackendNode | null;
  connectedWebAppNode?: BackendNode | null;
  allNodes?: BackendNode[];
  allEdges?: BackendEdge[];
  endpoints?: (Endpoint & { nodeId: string })[];
}

export function useWebPageCodeMismatch({
  projectId,
  nodeId,
  outputDir,
  node,
  connectedWebAppNode,
  allNodes = [],
  allEdges = [],
  endpoints = [],
}: UseWebPageCodeMismatchProps) {
  const updateNode = useBackendCanvasStore((s) => s.updateNode);
  const patchNodeData = useMutation(api.canvas.patchNodeData);

  const [status, setStatus] = useState<MismatchStatus>("checking");
  const [localDiskCode, setLocalDiskCode] = useState<string>("");
  const [detectedDiskPath, setDetectedDiskPath] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  const rawLabel = typeof node?.data?.label === "string" ? node.data.label : "";
  const pageRoute = pageRouteToUrl(rawLabel);
  const pageFolderSlug = pageRouteToFolderPath(rawLabel);
  const pageName = parsePageRoute(rawLabel) || nodeId;

  const isRoot = useMemo(() => {
    return (
      !pageFolderSlug ||
      pageFolderSlug === "/" ||
      pageFolderSlug === "page" ||
      pageFolderSlug === "(public)"
    );
  }, [pageFolderSlug]);

  const webAppSlug = useMemo(() => {
    const rawSlug =
      typeof connectedWebAppNode?.data?.appSlug === "string"
        ? connectedWebAppNode.data.appSlug
        : typeof node?.data?.appSlug === "string"
        ? node.data.appSlug
        : "";
    const rawName =
      typeof connectedWebAppNode?.data?.label === "string"
        ? connectedWebAppNode.data.label
        : "web-app";
    return (rawSlug || rawName).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }, [connectedWebAppNode, node?.data?.appSlug]);

  // Standard candidate relative paths in local project
  const candidatePaths = useMemo<string[]>(() => {
    return [
      isRoot
        ? `apps/${webAppSlug}/app/(public)/page.tsx`
        : `apps/${webAppSlug}/app/(public)/${pageFolderSlug}/page.tsx`,
      isRoot
        ? `apps/${webAppSlug}/app/(${webAppSlug})/page.tsx`
        : `apps/${webAppSlug}/app/(${webAppSlug})/${pageFolderSlug}/page.tsx`,
      isRoot
        ? `apps/${webAppSlug}/app/(${pageFolderSlug})/page.tsx`
        : `apps/${webAppSlug}/app/(${pageFolderSlug})/${pageFolderSlug}/page.tsx`,
      isRoot
        ? `apps/${webAppSlug}/app/page.tsx`
        : `apps/${webAppSlug}/app/${pageFolderSlug}/page.tsx`,
      isRoot
        ? `app/(public)/page.tsx`
        : `app/(public)/${pageFolderSlug}/page.tsx`,
      isRoot
        ? `app/(${webAppSlug})/page.tsx`
        : `app/(${webAppSlug})/${pageFolderSlug}/page.tsx`,
      isRoot ? `app/page.tsx` : `app/${pageFolderSlug}/page.tsx`,
      ...(pageFolderSlug === "not-found"
        ? [
            `apps/${webAppSlug}/app/not-found.tsx`,
            `app/not-found.tsx`,
          ]
        : []),
    ];
  }, [webAppSlug, pageFolderSlug, isRoot]);

  const defaultFilePath = candidatePaths[0] || `apps/${webAppSlug}/app/(public)/page.tsx`;

  // Compute Server Baseline Code
  const serverCode = useMemo<string>(() => {
    if (!node) return "";
    if (typeof node.data?.pageSourceCode === "string" && node.data.pageSourceCode.trim().length > 0) {
      return node.data.pageSourceCode;
    }

    try {
      // Generate default compiler baseline for this page node
      const singlePageNode: BackendNode = {
        ...node,
        data: {
          ...node.data,
          pageSourceCode: undefined, // ensure we generate compiler baseline
        },
      };

      const result = compileWebPageNodes(
        [singlePageNode],
        endpoints,
        [],
        allNodes,
        allEdges,
        "Dezign2App",
        [],
        webAppSlug,
        connectedWebAppNode || undefined,
      );

      const targetFile = result.files.find(
        (f) =>
          f.filename.endsWith("/page.tsx") ||
          f.filename.endsWith("page.tsx") ||
          f.filename.includes(pageFolderSlug),
      );

      return targetFile?.content || "";
    } catch (e) {
      console.warn("[useWebPageCodeMismatch] Failed to compute compiler baseline:", e);
      return "";
    }
  }, [node, endpoints, allNodes, allEdges, webAppSlug, connectedWebAppNode, pageFolderSlug]);

  const hasCustomServerFile = Boolean(
    typeof node?.data?.pageSourceCode === "string" && node.data.pageSourceCode.trim().length > 0,
  );

  // Compute diff summary between serverCode and localDiskCode
  const diffSummary: DiffSummary = useMemo(() => {
    if (!localDiskCode) {
      return {
        hasMismatch: false,
        totalHunks: 0,
        addedLines: 0,
        deletedLines: 0,
        modifiedLines: 0,
        hunks: [],
      };
    }
    return computeDiffHunks(serverCode, localDiskCode);
  }, [serverCode, localDiskCode]);

  // Check local disk file
  const checkDiskStatus = useCallback(async () => {
    if (!outputDir) {
      setStatus("no_workspace");
      setLocalDiskCode("");
      setDetectedDiskPath(defaultFilePath);
      return;
    }

    if (!isElectron()) {
      setStatus("no_workspace");
      return;
    }

    const api = getElectronAPI();
    if (!api?.fs?.readFile) {
      setStatus("no_workspace");
      return;
    }

    let foundContent: string | null = null;
    let foundPath = defaultFilePath;

    for (const relPath of candidatePaths) {
      try {
        const res = await api.fs.readFile(outputDir, relPath);
        if (res?.success && typeof res.content === "string") {
          foundContent = res.content;
          foundPath = relPath;
          break;
        }
      } catch {}
    }

    setLastCheckedAt(new Date());

    if (foundContent === null) {
      setStatus("no_disk_file");
      setLocalDiskCode("");
      setDetectedDiskPath(defaultFilePath);
    } else {
      setLocalDiskCode(foundContent);
      setDetectedDiskPath(foundPath);

      const diff = computeDiffHunks(serverCode, foundContent);
      if (diff.hasMismatch) {
        setStatus("mismatch");
      } else {
        setStatus("synced");
      }
    }
  }, [outputDir, candidatePaths, defaultFilePath, serverCode]);

  // Periodic and reactive check
  useEffect(() => {
    checkDiskStatus();
  }, [checkDiskStatus]);

  // 1. Merge All to Server (push 100% of disk content to Convex server file)
  const mergeAllToServer = useCallback(async () => {
    if (!node || !localDiskCode) return;
    setIsSaving(true);
    try {
      updateNode(nodeId, {
        data: {
          ...node.data,
          pageSourceCode: localDiskCode,
          aiEditing: false,
        },
      });

      await patchNodeData({
        projectId: projectId as Id<"projects">,
        nodeId,
        patch: {
          pageSourceCode: localDiskCode,
          aiEditing: false,
        },
      });

      toast.success("Synced all local changes to server file!");
      setDialogOpen(false);
      await checkDiskStatus();
    } catch (err) {
      console.error("[useWebPageCodeMismatch] Failed to merge all to server:", err);
      toast.error("Failed to sync changes to server");
    } finally {
      setIsSaving(false);
    }
  }, [node, localDiskCode, updateNode, nodeId, patchNodeData, projectId, checkDiskStatus]);

  // 2. Merge Selected Hunks to Server & Disk
  const mergeSelectedToServer = useCallback(
    async (selectedHunkIds: string[]) => {
      if (!node) return;
      setIsSaving(true);
      try {
        const mergedCode = applySelectedHunks(
          serverCode,
          diffSummary.hunks,
          selectedHunkIds,
        );

        // Update Convex backend
        updateNode(nodeId, {
          data: {
            ...node.data,
            pageSourceCode: mergedCode,
            aiEditing: false,
          },
        });

        await patchNodeData({
          projectId: projectId as Id<"projects">,
          nodeId,
          patch: {
            pageSourceCode: mergedCode,
            aiEditing: false,
          },
        });

        // Write merged result back to disk
        if (isElectron() && outputDir) {
          const api = getElectronAPI();
          if (api?.fs?.writeProject) {
            await api.fs.writeProject(
              outputDir,
              [{ filename: detectedDiskPath || defaultFilePath, content: mergedCode }],
              { cleanStale: false },
            );
          }
        }

        toast.success(`Merged ${selectedHunkIds.length} changes to server file and disk!`);
        setDialogOpen(false);
        await checkDiskStatus();
      } catch (err) {
        console.error("[useWebPageCodeMismatch] Failed to merge selected changes:", err);
        toast.error("Failed to merge selected changes");
      } finally {
        setIsSaving(false);
      }
    },
    [
      node,
      serverCode,
      diffSummary.hunks,
      updateNode,
      nodeId,
      patchNodeData,
      projectId,
      outputDir,
      detectedDiskPath,
      defaultFilePath,
      checkDiskStatus,
    ],
  );

  // 3. Overwrite Local Disk with Server File
  const overwriteLocalWithServer = useCallback(async () => {
    if (!isElectron() || !outputDir || !serverCode) return;
    setIsSaving(true);
    try {
      const api = getElectronAPI();
      if (!api?.fs?.writeProject) {
        throw new Error("Electron file system API not available");
      }

      await api.fs.writeProject(
        outputDir,
        [{ filename: detectedDiskPath || defaultFilePath, content: serverCode }],
        { cleanStale: false },
      );

      toast.success("Overwrote local disk file with server file");
      setDialogOpen(false);
      await checkDiskStatus();
    } catch (err) {
      console.error("[useWebPageCodeMismatch] Failed to overwrite local disk:", err);
      toast.error("Failed to overwrite local file");
    } finally {
      setIsSaving(false);
    }
  }, [outputDir, serverCode, detectedDiskPath, defaultFilePath, checkDiskStatus]);

  // 4. Reset Server File to Compiler Baseline
  const resetToCompilerBaseline = useCallback(async () => {
    if (!node) return;
    if (!window.confirm("Reset server file to compiler baseline? This will delete the custom server code.")) return;
    setIsSaving(true);
    try {
      updateNode(nodeId, {
        data: {
          ...node.data,
          pageSourceCode: undefined,
          aiEditing: false,
        },
      });

      await patchNodeData({
        projectId: projectId as Id<"projects">,
        nodeId,
        patch: {
          pageSourceCode: undefined,
          aiEditing: false,
        },
      });

      toast.success("Reset server file to compiler baseline");
      await checkDiskStatus();
    } catch (err) {
      console.error("[useWebPageCodeMismatch] Failed to reset to compiler baseline:", err);
      toast.error("Failed to reset server file");
    } finally {
      setIsSaving(false);
    }
  }, [node, updateNode, nodeId, patchNodeData, projectId, checkDiskStatus]);

  return {
    status,
    serverCode,
    localDiskCode,
    detectedDiskPath,
    defaultFilePath,
    diffSummary,
    hasCustomServerFile,
    isSaving,
    dialogOpen,
    setDialogOpen,
    lastCheckedAt,
    pageName,
    pageRoute,
    checkDiskStatus,
    mergeAllToServer,
    mergeSelectedToServer,
    overwriteLocalWithServer,
    resetToCompilerBaseline,
  };
}
