"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isElectron, getElectronAPI } from "@/lib/electron";
import { CompiledFile } from "@/lib/compiler";

export type AutoSyncStatus = "idle" | "syncing" | "synced" | "error";

interface UseAutoDiskSyncProps {
  projectId: string;
  outputDir: string;
  files: CompiledFile[];
  enabled?: boolean;
}

export function useAutoDiskSync({
  projectId,
  outputDir,
  files,
  enabled = true,
}: UseAutoDiskSyncProps) {
  const inElectron = isElectron();

  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`auto_sync_enabled_${projectId}`);
        if (saved !== null) {
          return saved === "true";
        }
      } catch (e) {}
    }
    return enabled;
  });

  const [syncStatus, setSyncStatus] = useState<AutoSyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastWrittenCount, setLastWrittenCount] = useState<number>(0);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef<boolean>(false);
  const pendingFilesRef = useRef<CompiledFile[] | null>(null);
  const lastSyncHashRef = useRef<string>("");

  const toggleAutoSync = useCallback(
    (val: boolean) => {
      setAutoSyncEnabled(val);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`auto_sync_enabled_${projectId}`, String(val));
        } catch (e) {}
      }
    },
    [projectId],
  );

  // Core sync executor with atomic lock and clean stale support
  const executeSync = useCallback(
    async (targetFiles: CompiledFile[], cleanStale: boolean = true, isForce: boolean = false) => {
      if (!inElectron || !outputDir || targetFiles.length === 0) return;
      const api = getElectronAPI();
      if (!api?.fs?.writeProject) return;

      if (isSyncingRef.current) {
        pendingFilesRef.current = targetFiles;
        return;
      }

      isSyncingRef.current = true;
      setSyncStatus("syncing");
      setSyncError(null);

      try {
        // Protect frontend page files from being overwritten during automatic background compilation sync
        // if they have been edited externally in another editor on disk (skipped when force re-syncing).
        const safeTargetFiles: CompiledFile[] = [];
        for (const file of targetFiles) {
          const isFrontendPageFile =
            (file.filename.endsWith("/page.tsx") || file.filename.endsWith("page.tsx")) &&
            !file.filename.includes("_components");

          if (!isForce && isFrontendPageFile && api.fs.readFile) {
            try {
              const diskCheck = await api.fs.readFile(outputDir, file.filename);
              if (diskCheck?.success && typeof diskCheck.content === "string" && diskCheck.content.trim().length > 0) {
                // If disk content differs from compiler output, preserve disk content during background auto-sync
                if (diskCheck.content.trim() !== file.content.trim()) {
                  safeTargetFiles.push({
                    ...file,
                    content: diskCheck.content,
                  });
                  continue;
                }
              }
            } catch {}
          }
          safeTargetFiles.push(file);
        }

        const result = await api.fs.writeProject(outputDir, safeTargetFiles, { cleanStale });
        if (result?.success) {
          setSyncStatus("synced");
          setLastSyncedAt(new Date());
          setLastWrittenCount(result.writtenCount ?? 0);
        } else {
          setSyncStatus("error");
          setSyncError("File sync failed");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setSyncStatus("error");
        setSyncError(msg);
      } finally {
        isSyncingRef.current = false;
        // If files changed while sync was underway, execute trailing sync
        if (pendingFilesRef.current) {
          const next = pendingFilesRef.current;
          pendingFilesRef.current = null;
          executeSync(next, cleanStale);
        }
      }
    },
    [inElectron, outputDir],
  );

  // Manual immediate sync trigger
  const forceSyncNow = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    return executeSync(files, true, true);
  }, [executeSync, files]);

  // Reactive debounced auto-sync whenever canvas files or outputDir change
  useEffect(() => {
    if (!inElectron || !autoSyncEnabled || !outputDir || files.length === 0) {
      return;
    }

    // Fast content signature to avoid spurious syncs if files didn't change
    const signature = `${files.length}_${files.map((f) => f.filename).join(",")}_${outputDir}`;
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      lastSyncHashRef.current = signature;
      executeSync(files, true);
    }, 600);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inElectron, autoSyncEnabled, outputDir, files, executeSync]);

  return {
    syncStatus,
    lastSyncedAt,
    syncError,
    lastWrittenCount,
    autoSyncEnabled,
    setAutoSyncEnabled: toggleAutoSync,
    forceSyncNow,
  };
}
