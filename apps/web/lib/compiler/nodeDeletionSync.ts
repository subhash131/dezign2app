import { isElectron, getElectronAPI } from "@/lib/electron";
import { CompiledFile } from "@workspace/canvas/types";
import { NodeDeletionDiffResult } from "./nodeDeletionDiff";
import { useAffectedFilesStore, NodeDeletionEvent } from "../stores/affectedFilesStore";
import { toast } from "sonner";

/**
 * Gets the current project's workspace directory from localStorage if set.
 */
export function getSavedWorkspaceDir(projectId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return (
      localStorage.getItem(`workspace_dir_${projectId}`) ||
      localStorage.getItem(`docker_dir_${projectId}`) ||
      localStorage.getItem("dezign2app_workspace_dir") ||
      ""
    );
  } catch {
    return "";
  }
}

/**
 * Coordinates local filesystem cleanup and UI banner notifications
 * whenever nodes are deleted from the canvas.
 */
export async function handleNodeDeletionSync(
  projectId: string,
  diff: NodeDeletionDiffResult,
): Promise<NodeDeletionEvent | null> {
  if (diff.totalAffectedCount === 0 && diff.deletedNodes.length === 0) {
    return null;
  }

  const outputDir = getSavedWorkspaceDir(projectId);
  const eventId = crypto.randomUUID();

  const event: NodeDeletionEvent = {
    id: eventId,
    timestamp: Date.now(),
    deletedNodes: diff.deletedNodes,
    deletedFiles: diff.deletedFiles,
    modifiedFiles: diff.modifiedFiles,
    addedFiles: diff.addedFiles,
    outputDir: outputDir || null,
    syncedToDisk: false,
  };

  // 1. Immediately trigger the banner in store
  useAffectedFilesStore.getState().showDeletionEvent(event);

  // 2. Perform local disk deletion & modification sync if in Electron
  if (isElectron() && outputDir) {
    const api = getElectronAPI();
    if (api?.fs) {
      try {
        let deletedCount = 0;

        // Delete stale files from disk
        if (diff.deletedFiles.length > 0) {
          if (api.fs.deleteFiles) {
            const delRes = await api.fs.deleteFiles(outputDir, diff.deletedFiles);
            deletedCount = delRes.deletedCount;
          }
        }

        // Rewrite modified files to disk
        if (api.fs.writeProject) {
          await api.fs.writeProject(outputDir, diff.filesAfter, {
            cleanStale: true,
            deletedFiles: diff.deletedFiles,
          });
        }

        useAffectedFilesStore
          .getState()
          .markDiskSynced(eventId, true, deletedCount);

        const nodeNames = diff.deletedNodes.map((n) => n.label).join(", ");
        toast.info(`Deleted files for "${nodeNames}" removed from local disk`, {
          description: `${diff.deletedFiles.length} files removed, ${diff.modifiedFiles.length} updated in ${outputDir}`,
        });
      } catch (err) {
        console.error("[NodeDeletionSync] Failed to sync disk changes:", err);
      }
    }
  }

  return event;
}
