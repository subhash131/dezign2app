import { BackendNode } from "@/types/canvas";
import { toVarName } from "../../../compiler/utils";
import { applyNodeChanges, NodeChange } from "@xyflow/react";
import { pageRouteToUrl, pageRouteToFolderPath, arePageRoutesEqual } from "@workspace/canvas";
import { BackendCanvasState, SyncServiceTypesSummary } from "../types";
import {
  isSchemaNodeType,
  prepareNodeForAddition,
  createTableNode,
  createLangGraphStepNode,
  syncEntityRenameReferences,
  syncNodeDropdownEdges,
  executeNodeDeletion,
  isNodeDerivedFromService,
  buildServiceTypesNodeAndEdge,
  syncServiceTypesNode,
} from "../node";

export interface NodeSlice {
  nodes: BackendNode[];
  pendingNodeUpserts: BackendNode[];
  pendingNodeRemovals: string[];
  nodesPendingDeletion: BackendNode[];
  setNodesPendingDeletion: (nodes: BackendNode[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  addNode: (node: Omit<BackendNode, "fractionalIndex">) => void;
  addTableNode: (
    parentId?: string,
    position?: { x: number; y: number },
  ) => void;
  addLangGraphStepNode: (
    parentId: string,
    position?: { x: number; y: number },
    name?: string,
    stepType?: BackendNode["data"]["stepType"],
  ) => void;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  requestDeleteNode: (id: string) => void;
  requestDeleteNodes: (ids: string[]) => void;
  syncServiceTypes: (serviceId: string) => SyncServiceTypesSummary;
}

export const createNodeSlice = (
  set: (
    partial:
      | Partial<BackendCanvasState>
      | ((state: BackendCanvasState) => Partial<BackendCanvasState>),
  ) => void,
  get: () => BackendCanvasState,
): NodeSlice => ({
  nodes: [],
  pendingNodeUpserts: [],
  pendingNodeRemovals: [],
  nodesPendingDeletion: [],

  setNodesPendingDeletion: (nodes) => set({ nodesPendingDeletion: nodes }),

  onNodesChange: (changes) => {
    const removedIds: string[] = changes
      .filter((c) => c.type === "remove")
      .map((c) => c.id);

    const nonRemoveChanges = changes.filter((c) => c.type !== "remove");

    let currentState = get();
    let updates: Partial<BackendCanvasState> = {};

    const persistentChangedNodeIds = new Set(
      nonRemoveChanges
        .filter((c) => {
          if (c.type === "add" || c.type === "replace") return true;
          if (c.type === "position" && !c.dragging && c.position) return true;
          return false;
        })
        .map((c) => c.id),
    );

    if (removedIds.length > 0) {
      updates = executeNodeDeletion(currentState, removedIds);
      currentState = { ...currentState, ...updates };
    }

    if (nonRemoveChanges.length > 0) {
      const rawNext = applyNodeChanges<BackendNode>(
        nonRemoveChanges,
        currentState.nodes,
      );
      const next = rawNext.filter((n): n is BackendNode => Boolean(n?.id));
      const upserts = next.filter((n) => persistentChangedNodeIds.has(n.id));

      updates = {
        ...updates,
        nodes: next,
        pendingNodeUpserts: [...get().pendingNodeUpserts, ...upserts],
      };
    }

    if (Object.keys(updates).length > 0) {
      set(updates);
    }
  },

  addNode: (nodeWithoutIndex) => {
    const isSchema = isSchemaNodeType(nodeWithoutIndex.type);
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");

    const prepared = prepareNodeForAddition(nodeWithoutIndex, get());
    set({
      nodes: prepared.nodes,
      edges: prepared.edges,
      endpoints: prepared.endpoints,
      pendingNodeUpserts: prepared.pendingNodes,
      pendingEdgeUpserts: prepared.pendingEdges,
      pendingEndpointUpserts: prepared.pendingEndpoints,
    });
  },

  addTableNode: (parentId, position) => {
    get().pushHistorySnapshot("schema");
    const parentGroup = parentId
      ? get().nodes.find((n) => n.id === parentId)
      : undefined;
    const initialPos =
      position ||
      (parentGroup?.position
        ? { x: parentGroup.position.x + 36, y: parentGroup.position.y + 120 }
        : { x: 100, y: 100 });

    const node: Omit<BackendNode, "fractionalIndex"> = {
      id: crypto.randomUUID(),
      type: "entity",
      position: initialPos,
      data: {
        label: "",
        ...(parentId && {
          groupId: parentId,
          group: parentGroup?.data?.label,
        }),
        columns: [
          { name: "id", type: "TEXT", isPrimaryKey: true },
          { name: "created_at", type: "TIMESTAMPTZ" },
          { name: "updated_at", type: "TIMESTAMPTZ" },
        ],
      },
      selected: true,
    };
    const prepared = prepareNodeForAddition(node, get());
    set({
      nodes: prepared.nodes,
      edges: prepared.edges,
      endpoints: prepared.endpoints,
      pendingNodeUpserts: prepared.pendingNodes,
      pendingEdgeUpserts: prepared.pendingEdges,
      pendingEndpointUpserts: prepared.pendingEndpoints,
    });
  },

  addLangGraphStepNode: (parentId, position, name, stepType) => {
    get().pushHistorySnapshot("graph");
    const { nextNodes, nextPendingNodes } = createLangGraphStepNode(
      parentId,
      position,
      name,
      stepType,
      get(),
    );
    set({
      nodes: nextNodes,
      pendingNodeUpserts: nextPendingNodes,
    });
  },

  updateNode: (id, changes) => {
    const updatedNode = get().nodes.find((n) => n.id === id);
    if (!updatedNode) return;

    const isSchema = isSchemaNodeType(updatedNode.type);
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");

    let effectiveChanges = changes;

    // When updating a transformer node, ensure label and functionName are formatted as camelCase and unique
    if (updatedNode.type === "transformer" && changes.data) {
      const rawName = changes.data.functionName ?? changes.data.label;
      if (rawName && typeof rawName === "string") {
        const formatted = toVarName(rawName);
        const isDuplicate = get().nodes.some(
          (n) =>
            n.id !== id &&
            n.type === "transformer" &&
            toVarName(n.data?.functionName || n.data?.label || "").toLowerCase() ===
              formatted.toLowerCase(),
        );
        if (isDuplicate) {
          // Reject update if name collides with an existing transformer
          return;
        }
        effectiveChanges = {
          ...changes,
          data: {
            ...updatedNode.data,
            ...changes.data,
            label: formatted,
            functionName: formatted,
          },
        };
      }
    }

    // When renaming a WebPage node, keep data.path, data.pageSlug, and data.route in sync
    const isWebPageRename =
      updatedNode.type === "webPage" &&
      changes.data &&
      "label" in changes.data &&
      changes.data.label &&
      changes.data.label !== updatedNode.data?.label;

    let modifiedAuthNodes: BackendNode[] = [];

    if (isWebPageRename) {
      const newLabel = changes.data!.label!;
      const newPath = pageRouteToUrl(newLabel);
      const newSlug = pageRouteToFolderPath(newLabel);
      const oldPath = pageRouteToUrl(updatedNode.data?.label || updatedNode.data?.path || "");

      effectiveChanges = {
        ...changes,
        data: {
          ...updatedNode.data,
          ...changes.data,
          label: newLabel,
          path: newPath,
          pageSlug: newSlug,
          route: newPath,
        },
      };

      // Cascade updated path to all auth nodes that reference this webPage (by nodeId or by oldPath)
      const currentNodes = get().nodes;
      currentNodes.forEach((n) => {
        if (n.type === "auth" && n.data?.redirects) {
          const r = { ...n.data.redirects };
          let changed = false;
          if (r.signInPageNodeId === id || (oldPath && arePageRoutesEqual(r.signInPageUrl || "", oldPath))) {
            r.signInPageUrl = newPath;
            r.signInPageNodeId = id;
            changed = true;
          }
          if (r.signUpPageNodeId === id || (oldPath && arePageRoutesEqual(r.signUpPageUrl || "", oldPath))) {
            r.signUpPageUrl = newPath;
            r.signUpPageNodeId = id;
            changed = true;
          }
          if (r.signInRedirectNodeId === id || (oldPath && arePageRoutesEqual(r.signInRedirectUrl || "", oldPath))) {
            r.signInRedirectUrl = newPath;
            r.signInRedirectNodeId = id;
            changed = true;
          }
          if (r.signUpRedirectNodeId === id || (oldPath && arePageRoutesEqual(r.signUpRedirectUrl || "", oldPath))) {
            r.signUpRedirectUrl = newPath;
            r.signUpRedirectNodeId = id;
            changed = true;
          }
          if (r.signOutRedirectNodeId === id || (oldPath && arePageRoutesEqual(r.signOutRedirectUrl || "", oldPath))) {
            r.signOutRedirectUrl = newPath;
            r.signOutRedirectNodeId = id;
            changed = true;
          }
          if (r.unauthorizedNodeId === id || (oldPath && arePageRoutesEqual(r.unauthorizedUrl || "", oldPath))) {
            r.unauthorizedUrl = newPath;
            r.unauthorizedNodeId = id;
            changed = true;
          }
          if (r.pricingNodeId === id || (oldPath && arePageRoutesEqual(r.pricingUrl || "", oldPath))) {
            r.pricingUrl = newPath;
            r.pricingNodeId = id;
            changed = true;
          }
          if (changed) {
            modifiedAuthNodes.push({
              ...n,
              data: {
                ...n.data,
                redirects: r,
              },
            });
          }
        }
      });
    }

    // 1. Sync entity table rename references across referencing columns
    const currentNodes = syncEntityRenameReferences(
      get().nodes,
      id,
      updatedNode,
      effectiveChanges,
    );

    let nextNodes = currentNodes.map((n) => {
      if (n.id === id) {
        return { ...n, ...effectiveChanges };
      }
      const matchedAuth = modifiedAuthNodes.find((a) => a.id === n.id);
      if (matchedAuth) {
        return matchedAuth;
      }
      return n;
    });

    const updated = nextNodes.find((n) => n.id === id);
    if (!updated) return;

    // 2. Synchronize dropdown updates to canvas edges
    const edgeSync = syncNodeDropdownEdges(
      id,
      updatedNode,
      effectiveChanges,
      get().edges,
      nextNodes,
    );

    const update: Partial<BackendCanvasState> = {
      nodes: nextNodes,
      pendingNodeUpserts: [
        ...get().pendingNodeUpserts,
        updated,
        ...modifiedAuthNodes,
      ],
      ...(edgeSync.edgesChanged ? { edges: edgeSync.nextEdges } : {}),
      ...(edgeSync.newPendingEdgeRemovals.length > 0
        ? {
            pendingEdgeRemovals: [
              ...get().pendingEdgeRemovals,
              ...edgeSync.newPendingEdgeRemovals,
            ],
          }
        : {}),
      ...(edgeSync.newPendingEdgeUpserts.length > 0
        ? {
            pendingEdgeUpserts: [
              ...get().pendingEdgeUpserts,
              ...edgeSync.newPendingEdgeUpserts,
            ],
          }
        : {}),
    };

    // 3. Synchronize service label changes to companion TypesNode
    if (
      updated.type === "service" &&
      effectiveChanges.data &&
      "label" in effectiveChanges.data &&
      effectiveChanges.data.label &&
      effectiveChanges.data.label !== updatedNode.data?.label
    ) {
      const companionNode = nextNodes.find(
        (n) => n.type === "types" && isNodeDerivedFromService(n, id),
      );
      if (companionNode) {
        const serviceEndpoints = get().endpoints.filter((e) => e.nodeId === id);
        const companionRes = buildServiceTypesNodeAndEdge(
          updated,
          serviceEndpoints,
          nextNodes,
          edgeSync.edgesChanged ? edgeSync.nextEdges : get().edges,
        );
        nextNodes = nextNodes.map((n) =>
          n.id === companionRes.typesNode.id ? companionRes.typesNode : n,
        );
        update.nodes = nextNodes;
        update.pendingNodeUpserts = [
          ...(update.pendingNodeUpserts || []),
          companionRes.typesNode,
        ];
      }
    }
    set(update);
  },

  deleteNode: (id) => {
    const updates = executeNodeDeletion(get(), [id]);
    set(updates);
  },

  deleteNodes: (ids) => {
    if (!ids || ids.length === 0) return;
    const updates = executeNodeDeletion(get(), ids);
    set(updates);
  },

  requestDeleteNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (node) {
      set({ nodesPendingDeletion: [node] });
    }
  },

  requestDeleteNodes: (ids) => {
    const nodes = get().nodes.filter((n) => ids.includes(n.id));
    if (nodes.length > 0) {
      set({ nodesPendingDeletion: nodes });
    }
  },

  syncServiceTypes: (serviceId: string): SyncServiceTypesSummary => {
    const state = get();
    const serviceNode = state.nodes.find(
      (n) => n.id === serviceId && n.type === "service",
    );
    if (!serviceNode) {
      return { success: false, typesCount: 0, nodeLabel: "" };
    }

    const syncRes = syncServiceTypesNode(
      serviceId,
      state.nodes,
      state.edges,
      state.endpoints,
    );

    const update: Partial<BackendCanvasState> = {
      nodes: syncRes.nodes,
      edges: syncRes.edges,
    };

    if (syncRes.updatedTypesNode) {
      update.pendingNodeUpserts = [
        ...state.pendingNodeUpserts,
        syncRes.updatedTypesNode,
      ];
    }
    if (syncRes.newEdge) {
      update.pendingEdgeUpserts = [
        ...state.pendingEdgeUpserts,
        syncRes.newEdge,
      ];
    }

    set(update);
    const typesCount = syncRes.updatedTypesNode?.data?.types?.length ?? 0;
    const nodeLabel = serviceNode.data?.label || "Service";

    return {
      success: true,
      typesCount,
      nodeLabel,
    };
  },
});
