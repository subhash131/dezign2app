import { BackendNode, BackendEdge, SimulationTestCase } from "@/types/canvas";
import { Endpoint, AnyMessagingResource, CompiledFile } from "@workspace/canvas/types";
import { compileMonorepo } from "./compileMonorepo";
import { cleanupDeletedNodesState } from "@/lib/stores/backendCanvas/stateCleanup";
import { BackendCanvasState } from "@/lib/stores/backendCanvas/types";

export interface DeletedNodeInfo {
  id: string;
  label: string;
  type: string;
}

export interface NodeDeletionDiffResult {
  deletedNodes: DeletedNodeInfo[];
  deletedFiles: string[];
  modifiedFiles: string[];
  addedFiles: string[];
  totalAffectedCount: number;
  filesBefore: CompiledFile[];
  filesAfter: CompiledFile[];
}

/**
 * Computes the exact file diff (deleted files, modified files, added files)
 * that occurs when one or more nodes are deleted from the canvas architecture.
 */
export function computeNodeDeletionDiff(
  nodes: BackendNode[],
  endpoints: (Endpoint & { nodeId: string })[] = [],
  events: (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[] = [],
  edges: BackendEdge[] = [],
  testCases: SimulationTestCase[] = [],
  projectName: string = "Dezign2App Monorepo",
  nodeIdsToDelete: string[] = [],
): NodeDeletionDiffResult {
  if (!nodeIdsToDelete || nodeIdsToDelete.length === 0) {
    const currentFiles = compileMonorepo(
      nodes,
      endpoints,
      events,
      edges,
      testCases,
      projectName,
    ).files;

    return {
      deletedNodes: [],
      deletedFiles: [],
      modifiedFiles: [],
      addedFiles: [],
      totalAffectedCount: 0,
      filesBefore: currentFiles,
      filesAfter: currentFiles,
    };
  }

  // 1. Resolve all deleted node IDs including nested children
  const getChildrenIds = (parentId: string): string[] => {
    const children = nodes.filter((n) => n && n.parentId === parentId).map((n) => n.id);
    let all: string[] = [...children];
    for (const childId of children) {
      all = [...all, ...getChildrenIds(childId)];
    }
    return all;
  };

  const allDeletedIds = new Set<string>();
  nodeIdsToDelete.forEach((id) => {
    if (id) {
      allDeletedIds.add(id);
      getChildrenIds(id).forEach((cId) => allDeletedIds.add(cId));
    }
  });

  // Extract deleted node info for user facing display
  const deletedNodes: DeletedNodeInfo[] = nodes
    .filter((n) => allDeletedIds.has(n.id))
    .map((n) => {
      const dataObj = ((n.data || {}) as unknown) as Record<string, unknown>;
      return {
        id: n.id,
        label:
          (dataObj.label as string) ||
          (dataObj.name as string) ||
          (dataObj.appSlug as string) ||
          (n.type === "service" ? "Service" : n.type === "webPage" ? "Web Page" : n.id),
        type: n.type || "node",
      };
    });

  // 2. Compile monorepo BEFORE deletion
  const filesBefore = compileMonorepo(
    nodes,
    endpoints,
    events,
    edges,
    testCases,
    projectName,
  ).files;

  // 3. Compute post-deletion canvas state
  const mockCurrentState: BackendCanvasState = {
    projectId: "temp",
    canvasView: "graph",
    nodes,
    edges,
    endpoints,
    events,
    identityProviders: [],
    activeConfigItem: null,
    setActiveConfigItem: () => {},
    graphUndoStack: [],
    graphRedoStack: [],
    schemaUndoStack: [],
    schemaRedoStack: [],
    canUndo: false,
    canRedo: false,
    pushGraphHistorySnapshot: () => {},
    pushSchemaHistorySnapshot: () => {},
    pushHistorySnapshot: () => {},
    undoGraph: () => {},
    undoSchema: () => {},
    undo: () => {},
    redoGraph: () => {},
    redoSchema: () => {},
    redo: () => {},
    clearHistory: () => {},
    pendingNodeUpserts: [],
    pendingNodeRemovals: [],
    pendingEdgeUpserts: [],
    pendingEdgeRemovals: [],
    pendingEndpointUpserts: [],
    pendingEndpointRemovals: [],
    pendingEventUpserts: [],
    pendingEventRemovals: [],
    pendingIdentityProviderUpserts: [],
    pendingIdentityProviderRemovals: [],
    nodesPendingDeletion: [],
    setView: () => {},
    onNodesChange: () => {},
    onEdgesChange: () => {},
    onConnect: () => {},
    addNode: () => {},
    addTableNode: () => {},
    addLangGraphStepNode: () => {},
    updateNode: () => {},
    deleteNode: () => {},
    deleteNodes: () => {},
    requestDeleteNode: () => {},
    requestDeleteNodes: () => {},
    addEdge: () => {},
    updateEdge: () => {},
    deleteEdge: () => {},
    addEndpoint: () => {},
    updateEndpoint: () => {},
    deleteEndpoint: () => {},
    addEvent: () => {},
    updateEvent: () => {},
    deleteEvent: () => {},
    addIdentityProvider: () => {},
    updateIdentityProvider: () => {},
    deleteIdentityProvider: () => {},
    setNodesAndEdges: () => {},
    setNodesPendingDeletion: () => {},
    clearPending: () => {},
    reset: () => {},
  };

  const cleanupUpdates = cleanupDeletedNodesState(
    mockCurrentState,
    nodeIdsToDelete,
  );

  const afterNodes = cleanupUpdates.nodes ?? nodes.filter((n) => !allDeletedIds.has(n.id));
  const afterEndpoints = (cleanupUpdates.endpoints as (Endpoint & { nodeId: string })[]) ??
    endpoints.filter((e) => !allDeletedIds.has(e.nodeId));
  const afterEvents = (cleanupUpdates.events as (AnyMessagingResource & {
    nodeId: string;
    variant: "publish" | "consume";
  })[]) ?? events.filter((e) => !allDeletedIds.has(e.nodeId));
  const afterEdges = cleanupUpdates.edges ??
    edges.filter((e) => !allDeletedIds.has(e.source) && !allDeletedIds.has(e.target));

  // 4. Compile monorepo AFTER deletion
  const filesAfter = compileMonorepo(
    afterNodes,
    afterEndpoints,
    afterEvents,
    afterEdges,
    testCases,
    projectName,
  ).files;

  // 5. Diff files
  const beforeMap = new Map<string, string>();
  filesBefore.forEach((f) => beforeMap.set(f.filename, f.content));

  const afterMap = new Map<string, string>();
  filesAfter.forEach((f) => afterMap.set(f.filename, f.content));

  const deletedFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const addedFiles: string[] = [];

  // Check files removed or modified
  for (const [filename, oldContent] of beforeMap.entries()) {
    if (!afterMap.has(filename)) {
      deletedFiles.push(filename);
    } else {
      const newContent = afterMap.get(filename)!;
      if (oldContent !== newContent) {
        modifiedFiles.push(filename);
      }
    }
  }

  // Check files newly added (if any)
  for (const filename of afterMap.keys()) {
    if (!beforeMap.has(filename)) {
      addedFiles.push(filename);
    }
  }

  // Sort filenames for clean display
  deletedFiles.sort();
  modifiedFiles.sort();
  addedFiles.sort();

  return {
    deletedNodes,
    deletedFiles,
    modifiedFiles,
    addedFiles,
    totalAffectedCount: deletedFiles.length + modifiedFiles.length + addedFiles.length,
    filesBefore,
    filesAfter,
  };
}
