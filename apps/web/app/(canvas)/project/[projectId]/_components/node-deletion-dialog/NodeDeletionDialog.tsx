"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { AlertDialog, AlertDialogContent } from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Trash, Loader2 } from "lucide-react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { computeNodeDeletionDiff } from "@/lib/compiler/nodeDeletionDiff";
import { computeNodeArchitectureImpact } from "@/lib/compiler/nodeArchitectureImpact";
import { getSavedWorkspaceDir, handleNodeDeletionSync } from "@/lib/compiler/nodeDeletionSync";
import { isElectron } from "@/lib/electron";
import { toast } from "sonner";
import { cn } from "@workspace/ui/lib/utils";

import { BackendNode, SimulationTestCase } from "@/types/canvas";
import { NodeDeletionDialogProps, AffectedItem } from "./types";
import { buildAffectedFileTree, getAllFolderPaths, getNodeLabel } from "./utils";
import { NodeDeletionHeader } from "./NodeDeletionHeader";
import { NodeDeletionTabNav } from "./NodeDeletionTabNav";
import { NodeArchitectureImpactView } from "./NodeArchitectureImpactView";
import { NodeDeletionImpactSummary } from "./NodeDeletionImpactSummary";
import { NodeDeletionFileTree } from "./NodeDeletionFileTree";
import { NodeDeletionResizeHandle } from "./NodeDeletionResizeHandle";
import { NodeDeletionCodePreview } from "./NodeDeletionCodePreview";
import { computeSubItemDeletion } from "./computeSubItemDeletionDiff";

const EMPTY_NODES: BackendNode[] = [];
const EMPTY_TEST_CASES: SimulationTestCase[] = [];
const EMPTY_ARCHITECTURE_IMPACT = {
  targetNodes: [],
  severedConnections: [],
  cascadeElements: [],
  brokenReferences: [],
  totalCanvasImpactCount: 0,
};
const EMPTY_DIFF = {
  deletedNodes: [],
  deletedFiles: [],
  modifiedFiles: [],
  addedFiles: [],
  totalAffectedCount: 0,
  filesBefore: [],
  filesAfter: [],
};
const EMPTY_COMPUTATION_RESULT = {
  architectureImpact: EMPTY_ARCHITECTURE_IMPACT,
  diff: EMPTY_DIFF,
};

function NodeDeletionDialogInner({
  open,
  onOpenChange,
  nodesPendingDeletion = EMPTY_NODES,
  deletionTarget,
  projectId = "",
  projectName = "Dezign2App",
}: NodeDeletionDialogProps): React.JSX.Element {
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);
  const events = useBackendCanvasStore((s) => s.events);
  const edges = useBackendCanvasStore((s) => s.edges);
  const deleteNodes = useBackendCanvasStore((s) => s.deleteNodes);
  const deleteNode = useBackendCanvasStore((s) => s.deleteNode);
  const testCases = useSimulationStore((s) => s.testCases) ?? EMPTY_TEST_CASES;

  const effectiveTarget = useMemo(() => {
    if (deletionTarget) return deletionTarget;
    if (nodesPendingDeletion && nodesPendingDeletion.length > 0) {
      return { type: "nodes" as const, nodes: nodesPendingDeletion };
    }
    return null;
  }, [deletionTarget, nodesPendingDeletion]);

  const outputDir = useMemo(() => {
    return projectId ? getSavedWorkspaceDir(projectId) : null;
  }, [projectId]);

  // Compute computation result (architecture impact and code diff)
  const computationResult = useMemo(() => {
    if (!effectiveTarget) {
      return EMPTY_COMPUTATION_RESULT;
    }

    if (effectiveTarget.type === "nodes") {
      const nodeIdsToDelete = effectiveTarget.nodes.map((n) => n.id);
      const architectureImpact = computeNodeArchitectureImpact(
        nodes,
        edges,
        endpoints,
        events,
        nodeIdsToDelete,
      );

      let diff;
      try {
        diff = computeNodeDeletionDiff(
          nodes,
          endpoints,
          events,
          edges,
          testCases,
          projectName,
          nodeIdsToDelete,
        );
      } catch (e) {
        console.error("[NodeDeletionDialog] Error calculating diff:", e);
        diff = {
          deletedNodes: effectiveTarget.nodes.map((n) => ({
            id: n.id,
            label: getNodeLabel(n),
            type: n.type || "node",
          })),
          deletedFiles: [],
          modifiedFiles: [],
          addedFiles: [],
          totalAffectedCount: 0,
          filesBefore: [],
          filesAfter: [],
        };
      }

      return { architectureImpact, diff };
    }

    // Granular sub-item deletion
    return computeSubItemDeletion(
      nodes,
      endpoints,
      events,
      edges,
      testCases,
      projectName,
      effectiveTarget,
    );
  }, [effectiveTarget, nodes, edges, endpoints, events, testCases, projectName]);

  const { architectureImpact, diff } = computationResult;

  // Active view tab: defaults to "architecture"
  const [activeTab, setActiveTab] = useState<"architecture" | "code">("architecture");

  // Code Diff tab states
  const [filterType, setFilterType] = useState<"all" | "deleted" | "modified">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
    () => diff.deletedFiles[0] || diff.modifiedFiles[0] || null,
  );
  const [previewVersion, setPreviewVersion] = useState<"before" | "after">("before");
  const [sidebarWidth, setSidebarWidth] = useState<number>(310);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const filteredFiles: AffectedItem[] = useMemo(() => {
    const items: AffectedItem[] = [
      ...diff.deletedFiles.map((path) => ({ path, type: "deleted" as const })),
      ...diff.modifiedFiles.map((path) => ({ path, type: "modified" as const })),
      ...diff.addedFiles.map((path) => ({ path, type: "added" as const })),
    ];

    return items.filter((item) => {
      if (filterType === "deleted" && item.type !== "deleted") return false;
      if (filterType === "modified" && item.type !== "modified") return false;
      if (searchQuery.trim()) {
        return item.path.toLowerCase().includes(searchQuery.toLowerCase().trim());
      }
      return true;
    });
  }, [diff, filterType, searchQuery]);

  const fileTree = useMemo(() => {
    return buildAffectedFileTree(filteredFiles);
  }, [filteredFiles]);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(getAllFolderPaths(fileTree)),
  );

  // Expand folders on search query change if searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const allPaths = getAllFolderPaths(fileTree);
      setExpandedFolders(new Set(allPaths));
    }
  }, [searchQuery, fileTree]);

  // Keep selected file in sync if current selected file is no longer available
  useEffect(() => {
    if (!selectedFilePath && (diff.deletedFiles.length > 0 || diff.modifiedFiles.length > 0)) {
      const first = diff.deletedFiles[0] || diff.modifiedFiles[0] || null;
      setSelectedFilePath(first);
      setPreviewVersion("before");
    }
  }, [selectedFilePath, diff.deletedFiles, diff.modifiedFiles]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const activeFileDetails = useMemo(() => {
    if (!selectedFilePath) return null;
    const isDeleted = diff.deletedFiles.includes(selectedFilePath);
    const isModified = diff.modifiedFiles.includes(selectedFilePath);

    const fileBefore = diff.filesBefore.find((f) => f.filename === selectedFilePath);
    const fileAfter = diff.filesAfter.find((f) => f.filename === selectedFilePath);

    const content =
      previewVersion === "after" && fileAfter ? fileAfter.content : fileBefore?.content || "";

    const lines = content ? content.split("\n") : [];

    return {
      path: selectedFilePath,
      isDeleted,
      isModified,
      content,
      lines,
      hasAfterVersion: Boolean(fileAfter),
    };
  }, [selectedFilePath, diff, previewVersion]);

  // Resize drag handle handler for code diff pane
  const handleMouseDownResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingSidebar(true);

      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(220, Math.min(500, startWidth + delta));
        setSidebarWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsDraggingSidebar(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [sidebarWidth],
  );

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
    toast.success("Path copied to clipboard");
  };

  const handleCopyCode = () => {
    if (!activeFileDetails?.content) return;
    navigator.clipboard.writeText(activeFileDetails.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast.success("Code copied to clipboard");
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (effectiveTarget && "onConfirm" in effectiveTarget && typeof effectiveTarget.onConfirm === "function") {
        if (computationResult.diff && (computationResult.diff.deletedFiles.length > 0 || computationResult.diff.totalAffectedCount > 0)) {
          await handleNodeDeletionSync(projectId, computationResult.diff);
        }
        effectiveTarget.onConfirm();
      } else if (effectiveTarget?.type === "nodes") {
        const nodeIdsToDelete = effectiveTarget.nodes.map((n) => n.id);
        if (deleteNodes) {
          deleteNodes(nodeIdsToDelete);
        } else {
          nodeIdsToDelete.forEach((id) => deleteNode(id));
        }
      }
      onOpenChange(false);
    } catch (err) {
      console.error("[NodeDeletionDialog] Deletion failed:", err);
      toast.error("Failed to execute deletion");
    } finally {
      setIsDeleting(false);
    }
  };

  // Header and Metadata Calculation
  const headerMeta = useMemo(() => {
    if (!effectiveTarget) {
      return {
        label: "Item",
        type: "item",
        title: "Delete Item?",
        count: 0,
      };
    }

    if (effectiveTarget.type === "nodes") {
      const count = effectiveTarget.nodes.length;
      const label = count === 1 && effectiveTarget.nodes[0] ? getNodeLabel(effectiveTarget.nodes[0]) : `${count} Nodes`;
      const type = effectiveTarget.nodes[0]?.type || "node";
      return {
        label,
        type,
        title: count === 1 ? `Delete "${label}"?` : `Delete ${count} Selected Nodes?`,
        count,
      };
    }

    if (effectiveTarget.type === "column") {
      const parent = nodes.find((n) => n.id === effectiveTarget.nodeId);
      const table = parent?.data?.label || "Table";
      return {
        label: `${table}.${effectiveTarget.column.name}`,
        type: "column",
        title: `Delete Column "${table}.${effectiveTarget.column.name}"?`,
        count: 1,
      };
    }

    if (effectiveTarget.type === "index") {
      const parent = nodes.find((n) => n.id === effectiveTarget.nodeId);
      const table = parent?.data?.label || "Table";
      return {
        label: `${table} (${effectiveTarget.indexItem.name})`,
        type: "index",
        title: `Delete Index "${effectiveTarget.indexItem.name}"?`,
        count: 1,
      };
    }

    if (effectiveTarget.type === "section") {
      const parent = nodes.find((n) => n.id === effectiveTarget.nodeId);
      const page = parent?.data?.label || "Page";
      const sectionName = effectiveTarget.section.name || effectiveTarget.section.title || "Section";
      return {
        label: `${page} → ${sectionName}`,
        type: "section",
        title: `Delete Section "${sectionName}"?`,
        count: 1,
      };
    }

    if (effectiveTarget.type === "action") {
      const parent = nodes.find((n) => n.id === effectiveTarget.nodeId);
      const page = parent?.data?.label || "Page";
      const actionName = effectiveTarget.action.name || effectiveTarget.action.event || "Action";
      return {
        label: `${page} → ${actionName}`,
        type: "action",
        title: `Delete Action "${actionName}"?`,
        count: 1,
      };
    }

    if (effectiveTarget.type === "zone") {
      const parent = nodes.find((n) => n.id === effectiveTarget.nodeId);
      const app = parent?.data?.label || "WebApp";
      const zoneName = effectiveTarget.zone.name || effectiveTarget.zone.route || "Zone";
      return {
        label: `${app} → ${zoneName}`,
        type: "zone",
        title: `Delete Access Zone "${zoneName}"?`,
        count: 1,
      };
    }

    if (effectiveTarget.type === "endpoint") {
      const parent = nodes.find((n) => n.id === effectiveTarget.nodeId);
      const service = parent?.data?.label || "Service";
      return {
        label: `${service} → ${effectiveTarget.endpoint.type || "GET"} ${effectiveTarget.endpoint.name}`,
        type: "endpoint",
        title: `Delete Endpoint "${effectiveTarget.endpoint.name}"?`,
        count: 1,
      };
    }

    if (effectiveTarget.type === "pageRename") {
      return {
        label: `${effectiveTarget.oldLabel} → ${effectiveTarget.newLabel}`,
        type: "webPage",
        title: `Rename Page "${effectiveTarget.oldLabel}"?`,
        count: 1,
      };
    }

    return {
      label: effectiveTarget.itemLabel || "Item",
      type: effectiveTarget.itemType || "item",
      title: effectiveTarget.title || `Delete "${effectiveTarget.itemLabel || "Item"}"?`,
      count: 1,
    };
  }, [effectiveTarget, nodes]);

  const inDesktop = isElectron();
  const hasFiles = diff.totalAffectedCount > 0;

  const targetNodeList = useMemo(() => {
    if (effectiveTarget?.type === "nodes") return effectiveTarget.nodes;
    return EMPTY_NODES;
  }, [effectiveTarget]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "p-0 overflow-hidden rounded-2xl border border-zinc-800 bg-[#111216] text-zinc-100 shadow-2xl ring-1 ring-white/5 flex flex-col outline-none transition-all duration-200",
          "w-[80vw] h-[80vh] !max-w-[1280px] min-w-[680px] min-h-[520px] max-h-[85vh]",
        )}
      >
        {/* Header Bar */}
        <NodeDeletionHeader
          primaryNodeLabel={headerMeta.label}
          nodeCount={headerMeta.count}
          primaryNodeType={headerMeta.type}
          isDeleting={isDeleting}
          titleOverride={headerMeta.title}
          descriptionOverride={
            effectiveTarget?.type === "pageRename"
              ? "Renaming will delete the previous page files from local disk and generate the updated route structure."
              : undefined
          }
          onClose={() => onOpenChange(false)}
        />

        {/* Content Body */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col gap-3 bg-[#111216]">
          {/* View Tab Switcher: Architecture Impact vs Code & Files Diff */}
          <NodeDeletionTabNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            canvasImpactCount={architectureImpact.totalCanvasImpactCount}
            fileImpactCount={diff.totalAffectedCount}
          />

          {/* TAB 1: Architecture & Node Impact View (Default) */}
          {activeTab === "architecture" && (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <NodeArchitectureImpactView impact={architectureImpact} />
            </div>
          )}

          {/* TAB 2: Generated Code & Files Diff View */}
          {activeTab === "code" && (
            <div className="flex-1 overflow-hidden flex flex-col gap-2.5 min-h-0">
              {/* Impact summary row */}
              <NodeDeletionImpactSummary
                nodesPendingDeletion={targetNodeList}
                deletedCount={diff.deletedFiles.length}
                modifiedCount={diff.modifiedFiles.length}
                inDesktop={inDesktop}
                outputDir={outputDir}
              />

              {/* Main Affected Files & Code Preview Split Container */}
              <div className="flex-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 flex flex-col sm:flex-row min-h-0">
                {/* Left: File Tree Explorer */}
                <NodeDeletionFileTree
                  totalAffectedCount={diff.totalAffectedCount}
                  deletedCount={diff.deletedFiles.length}
                  modifiedCount={diff.modifiedFiles.length}
                  filterType={filterType}
                  onFilterChange={setFilterType}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  fileTree={fileTree}
                  filteredFiles={filteredFiles}
                  selectedFilePath={selectedFilePath}
                  onSelectFile={(path) => {
                    setSelectedFilePath(path);
                    setPreviewVersion("before");
                  }}
                  expandedFolders={expandedFolders}
                  onToggleFolder={toggleFolder}
                  onCopyPath={handleCopyPath}
                  copiedPath={copiedPath}
                  sidebarWidth={sidebarWidth}
                  showCodePreview={true}
                  hasFiles={hasFiles}
                />

                {/* Drag Resize Divider */}
                {hasFiles && (
                  <NodeDeletionResizeHandle
                    onMouseDown={handleMouseDownResize}
                    isDragging={isDraggingSidebar}
                  />
                )}

                {/* Right: Code Content Preview Panel */}
                {hasFiles && (
                  <NodeDeletionCodePreview
                    activeFileDetails={activeFileDetails}
                    previewVersion={previewVersion}
                    onPreviewVersionChange={setPreviewVersion}
                    onCopyCode={handleCopyCode}
                    copiedCode={copiedCode}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 px-4 border-t border-zinc-800/80 bg-zinc-900/30 flex items-center justify-end gap-2 shrink-0">
          <Button
            type="button"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
            variant={"secondary"}
            className="h-8 px-3 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 cursor-pointer"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            variant={"destructive"}
            className="h-8 px-3 text-xs font-medium bg-red-600 hover:bg-red-500 text-white cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                <span>{effectiveTarget?.type === "pageRename" ? "Renaming & Deleting..." : "Deleting..."}</span>
              </>
            ) : (
              <>
                <Trash className="w-3.5 h-3.5 mr-1.5" />
                <span>
                  {effectiveTarget?.type === "pageRename"
                    ? `Confirm & Rename (${diff.deletedFiles.length} files to delete)`
                    : `Confirm & Delete (${architectureImpact.totalCanvasImpactCount > 0 ? `${architectureImpact.totalCanvasImpactCount} affected` : headerMeta.type})`}
                </span>
              </>
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function NodeDeletionDialog(props: NodeDeletionDialogProps): React.JSX.Element | null {
  if (!props.open) {
    return null;
  }
  return <NodeDeletionDialogInner {...props} />;
}
