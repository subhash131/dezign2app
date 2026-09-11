import { BackendNode, BackendEdge } from "@/types/canvas";
import {
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_TEMPERATURE,
  BROKER_RESOURCE_KEYS,
  DEFAULT_ZONES,
} from "@workspace/canvas/constants";
import { getUniqueNodeLabel } from "@workspace/canvas";
import { applyNodeChanges, NodeChange } from "@xyflow/react";
import { generateKeyBetween } from "fractional-indexing";
import { BackendCanvasState } from "../types";
import { cleanupDeletedNodesState } from "../stateCleanup";
import { getLastIndex } from "../utils";
import { computeNodeDeletionDiff } from "@/lib/compiler/nodeDeletionDiff";
import { handleNodeDeletionSync } from "@/lib/compiler/nodeDeletionSync";
import { useSimulationStore } from "@/lib/stores/simulationStore";
import { useSectionCollapseStore } from "@/lib/stores/sectionCollapseStore";

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
    stepType?: string,
  ) => void;
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  requestDeleteNode: (id: string) => void;
  requestDeleteNodes: (ids: string[]) => void;
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
      const isSchema = currentState.nodes.some(
        (n) =>
          removedIds.includes(n.id) &&
          (n.type === "entity" ||
            n.type === "database" ||
            n.type === "group" ||
            n.type === "redis_instance" ||
            n.type === "redis_schema"),
      );
      get().pushHistorySnapshot(isSchema ? "schema" : "graph");

      // Compute affected file diff and trigger disk sync & notification banner
      try {
        const testCases = useSimulationStore.getState().testCases || [];
        const diff = computeNodeDeletionDiff(
          currentState.nodes,
          currentState.endpoints,
          currentState.events,
          currentState.edges,
          testCases,
          "Dezign2App Monorepo",
          removedIds,
        );
        void handleNodeDeletionSync(currentState.projectId || "", diff);
      } catch (e) {
        console.error("[onNodesChange] Failed to compute deletion diff:", e);
      }
    }

    if (removedIds.length > 0) {
      useSectionCollapseStore.getState().deleteNodeCollapseState(removedIds);
      updates = cleanupDeletedNodesState(currentState, removedIds);
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
    const isSchema =
      nodeWithoutIndex.type === "entity" ||
      nodeWithoutIndex.type === "database" ||
      nodeWithoutIndex.type === "group" ||
      nodeWithoutIndex.type === "redis_instance" ||
      nodeWithoutIndex.type === "redis_schema";
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");
    let finalNode = nodeWithoutIndex;
    if (
      (nodeWithoutIndex.type === "entity" || nodeWithoutIndex.type === "database") &&
      nodeWithoutIndex.data?.label
    ) {
      const uniqueLabel = getUniqueNodeLabel(
        get().nodes,
        nodeWithoutIndex.data.label,
        nodeWithoutIndex.type,
      );
      finalNode = {
        ...finalNode,
        data: {
          ...finalNode.data,
          label: uniqueLabel,
        },
      };
    }
    if (nodeWithoutIndex.type === "service") {
      let nextPort = 8080;
      let nextGrpcPort = 50051;

      if (!nodeWithoutIndex.data?.port) {
        const existingPorts = new Set(
          get()
            .nodes.filter((n) => n.type === "service")
            .map((n) => parseInt(String(n.data?.port || "8080"), 10))
            .filter((p) => !isNaN(p)),
        );
        while (existingPorts.has(nextPort)) {
          nextPort++;
        }
      }

      if (!nodeWithoutIndex.data?.grpcPort) {
        const existingGrpcPorts = new Set(
          get()
            .nodes.filter((n) => n.type === "service")
            .map((n) => parseInt(String(n.data?.grpcPort || "50051"), 10))
            .filter((p) => !isNaN(p)),
        );
        while (existingGrpcPorts.has(nextGrpcPort)) {
          nextGrpcPort++;
        }
      }

      finalNode = {
        ...finalNode,
        data: {
          ...finalNode.data,
          port: nodeWithoutIndex.data?.port || String(nextPort),
          grpcPort: nodeWithoutIndex.data?.grpcPort || String(nextGrpcPort),
        },
      };
    }
    if (nodeWithoutIndex.type === "webApp") {
      let nextPort = 3000;
      if (!nodeWithoutIndex.data?.port) {
        const existingPorts = new Set(
          get()
            .nodes.filter((n) => n.type === "webApp")
            .map((n) => parseInt(String(n.data?.port || "3000"), 10))
            .filter((p) => !isNaN(p)),
        );
        while (existingPorts.has(nextPort)) {
          nextPort++;
        }
      }

      const existingWebApps = get().nodes.filter((n) => n.type === "webApp");
      const count = existingWebApps.length;
      const defaultLabel = count === 0 ? "Web App" : `Web App ${count + 1}`;
      const effectiveLabel = nodeWithoutIndex.data?.label || defaultLabel;
      const effectiveSlug =
        nodeWithoutIndex.data?.appSlug ||
        effectiveLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      finalNode = {
        ...finalNode,
        data: {
          zones: DEFAULT_ZONES,
          ...finalNode.data,
          label: effectiveLabel,
          appSlug: effectiveSlug,
          port: nodeWithoutIndex.data?.port || String(nextPort),
        },
      };
    }
    const lastNodeIndex = getLastIndex(get().nodes);
    const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
    const node: BackendNode = { ...finalNode, fractionalIndex, selected: true };
    let next: BackendNode[] = [
      ...get().nodes.map((n) => ({ ...n, selected: false })),
      node,
    ];
    let nextPendingNodes: BackendNode[] = [
      ...get().pendingNodeUpserts,
      node,
    ];
    let nextEdges: BackendEdge[] = get().edges;
    let nextPendingEdges: BackendEdge[] = get().pendingEdgeUpserts;

    if (node.type === "webApp" && !node.data?.skipDefaultPages) {
      const baseX = node.position?.x ?? 300;
      const baseY = node.position?.y ?? 200;
      const appSlug = node.data?.appSlug || "web-app";

      const rootPageId = crypto.randomUUID();
      const notFoundPageId = crypto.randomUUID();

      let lastIdx = fractionalIndex;
      const rootIndex = generateKeyBetween(lastIdx, null);
      lastIdx = rootIndex;
      const notFoundIndex = generateKeyBetween(lastIdx, null);

      const rootPageNode: BackendNode = {
        id: rootPageId,
        type: "webPage",
        position: { x: baseX + 400, y: baseY },
        fractionalIndex: rootIndex,
        selected: false,
        data: {
          label: "/",
          isRoot: true,
          appSlug,
          description: "Default landing page",
          useZoneDefault: true,
          sections: [
            {
              id: `sec-${Date.now()}-1`,
              name: "Main Section",
              renderMode: "server",
              loadStrategy: "eager",
              actions: [
                {
                  id: `evt-${Date.now()}-1`,
                  name: "pageLoad",
                  event: "pageLoad",
                },
              ],
            },
          ],
        },
      };

      const notFoundPageNode: BackendNode = {
        id: notFoundPageId,
        type: "webPage",
        position: { x: baseX + 400, y: baseY + 200 },
        fractionalIndex: notFoundIndex,
        selected: false,
        data: {
          label: "/not-found",
          appSlug,
          description: "Default 404 not found page",
          useZoneDefault: true,
          sections: [
            {
              id: `sec-${Date.now()}-2`,
              name: "Navigation",
              renderMode: "client",
              loadStrategy: "eager",
              actions: [
                {
                  id: `evt-${Date.now()}-2`,
                  name: "Back to Home",
                  event: "navigateToPage",
                  targetRoute: "/",
                  targetPageId: rootPageId,
                },
              ],
            },
          ],
        },
      };

      let lastEdgeIdx = getLastIndex(nextEdges);
      const edge1Idx = generateKeyBetween(lastEdgeIdx, null);
      lastEdgeIdx = edge1Idx;
      const edge2Idx = generateKeyBetween(lastEdgeIdx, null);

      const edge1: BackendEdge = {
        id: `edge-${node.id}-public-in-${rootPageId}-page-in`,
        source: node.id,
        sourceHandle: "public-in",
        target: rootPageId,
        targetHandle: "page-in",
        type: "connection",
        fractionalIndex: edge1Idx,
      };

      const edge2: BackendEdge = {
        id: `edge-${node.id}-public-in-${notFoundPageId}-page-in`,
        source: node.id,
        sourceHandle: "public-in",
        target: notFoundPageId,
        targetHandle: "page-in",
        type: "connection",
        fractionalIndex: edge2Idx,
      };

      next = [...next, rootPageNode, notFoundPageNode];
      nextPendingNodes = [...nextPendingNodes, rootPageNode, notFoundPageNode];
      nextEdges = [...nextEdges, edge1, edge2];
      nextPendingEdges = [...nextPendingEdges, edge1, edge2];
    }

    let nextEndpoints = get().endpoints;
    let pendingEndpoints = get().pendingEndpointUpserts;
    if (node.type === "service" || node.type === "external") {
      const existingEndpoints = nextEndpoints.filter((e) => e.nodeId === node.id);
      if (existingEndpoints.length === 0) {
        const isExt = node.type === "external";
        const defaultEp = {
          id: crypto.randomUUID(),
          nodeId: node.id,
          name: isExt ? "/v1/resource" : "/health",
          type: isExt ? "POST" : "GET",
          summary: isExt ? "External API action" : "Health check",
          businessLogic: isExt ? "External API call" : "Test the health of the server",
          responseFields: [],
        };
        nextEndpoints = [...nextEndpoints, defaultEp];
        pendingEndpoints = [...pendingEndpoints, defaultEp];
      }
    }

    set({
      nodes: next,
      edges: nextEdges,
      endpoints: nextEndpoints,
      pendingNodeUpserts: nextPendingNodes,
      pendingEdgeUpserts: nextPendingEdges,
      pendingEndpointUpserts: pendingEndpoints,
    });
  },

  addTableNode: (parentId, position) => {
    get().pushHistorySnapshot("schema");
    const lastNodeIndex = getLastIndex(get().nodes);
    const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
    const node: BackendNode = {
      id: crypto.randomUUID(),
      type: "entity",
      position: position || { x: 100, y: 100 },
      parentId,
      fractionalIndex,
      data: {
        label: "",
        columns: [{ name: "id", type: "TEXT", isPrimaryKey: true }],
      },
      selected: true,
    };
    const next = [...get().nodes.map((n) => ({ ...n, selected: false })), node];
    set({
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, node],
    });
  },

  addLangGraphStepNode: (parentId, position, name, stepType) => {
    get().pushHistorySnapshot("graph");
    const existingCount = get().nodes.filter(
      (n) => n.parentId === parentId,
    ).length;
    const defaultPos = position || { x: 40 + existingCount * 220, y: 120 };
    const lastNodeIndex = getLastIndex(get().nodes);
    const fractionalIndex = generateKeyBetween(lastNodeIndex, null);
    const stepId = `step_${Date.now().toString(36).slice(-4)}`;
    const stepName = name || "";
    const node: BackendNode = {
      id: crypto.randomUUID(),
      type: "langgraph_step",
      position: defaultPos,
      parentId,
      fractionalIndex,
      data: {
        label: stepName,
        stepId,
        stepType:
          (stepType as NonNullable<BackendNode["data"]["stepType"]>) ||
          "llm_call",
        modelConfig: {
          provider: DEFAULT_LLM_PROVIDER,
          model: DEFAULT_LLM_MODEL,
          temperature: DEFAULT_LLM_TEMPERATURE,
        },
      },
      selected: true,
    };
    const next = [...get().nodes.map((n) => ({ ...n, selected: false })), node];
    set({
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, node],
    });
  },

  updateNode: (id, changes) => {
    const updatedNode = get().nodes.find((n) => n.id === id);
    if (!updatedNode) return;
    const isSchema =
      updatedNode.type === "entity" ||
      updatedNode.type === "database" ||
      updatedNode.type === "group" ||
      updatedNode.type === "redis_instance" ||
      updatedNode.type === "redis_schema";
    get().pushHistorySnapshot(isSchema ? "schema" : "graph");

    let currentNodes = get().nodes;

    // If entity label changed, sync references.table across other entity nodes
    if (
      updatedNode.type === "entity" &&
      changes.data?.label !== undefined &&
      changes.data.label !== updatedNode.data.label
    ) {
      const oldLabel = updatedNode.data.label;
      const newLabel = changes.data.label;

      if (
        oldLabel &&
        oldLabel.trim() !== "" &&
        newLabel &&
        newLabel.trim() !== ""
      ) {
        currentNodes = currentNodes.map((node) => {
          if (node.id === id || node.type !== "entity" || !node.data.columns) {
            return node;
          }
          let colsChanged = false;
          const newCols = node.data.columns.map((col) => {
            if (col.references?.table === oldLabel) {
              colsChanged = true;
              return {
                ...col,
                references: {
                  ...col.references,
                  table: newLabel,
                },
              };
            }
            return col;
          });
          return colsChanged
            ? { ...node, data: { ...node.data, columns: newCols } }
            : node;
        });
      }
    }

    const next = currentNodes.map((n) =>
      n.id === id ? { ...n, ...changes } : n,
    );
    const updated = next.find((n) => n.id === id)!;
    console.log("backendCanvasStore: adding to pendingNodeUpserts", updated);

    // Bidirectional sync: sync dropdown updates to edges
    let nextEdges = [...get().edges];
    let edgesChanged = false;
    const newPendingEdgeRemovals: string[] = [];
    const newPendingEdgeUpserts: BackendEdge[] = [];

    if (changes.data?.publishedEvents) {
      const existingPublishEdges = nextEdges.filter(
        (e) =>
          e.source === id && e.sourceHandle?.startsWith("publishedEvents-out-"),
      );

      const currentEvents = changes.data.publishedEvents;

      // 1. Remove edges that are no longer referenced or changed targetNodeId
      existingPublishEdges.forEach((edge) => {
        const eventId = edge.sourceHandle?.replace("publishedEvents-out-", "");
        const ev = currentEvents.find((e) => e.id === eventId);
        if (
          !ev ||
          ev.targetNodeId !== edge.target ||
          ev.targetNodeId === "none"
        ) {
          nextEdges = nextEdges.filter((e) => e.id !== edge.id);
          edgesChanged = true;
          newPendingEdgeRemovals.push(edge.id);
        }
      });

      // 2. Add edges for newly selected targetNodeId
      currentEvents.forEach((ev: { id?: string; targetNodeId?: string }) => {
        if (ev.targetNodeId && ev.targetNodeId !== "none") {
          const hasEdge = existingPublishEdges.some(
            (e) =>
              e.sourceHandle === `publishedEvents-out-${ev.id}` &&
              e.target === ev.targetNodeId,
          );
          if (!hasEdge) {
            const lastEdgeIndex = getLastIndex(nextEdges);
            const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
            const newEdge: BackendEdge = {
              id: `edge-${Date.now()}-${ev.id}`,
              source: id,
              target: ev.targetNodeId,
              type: "message",
              sourceHandle: `publishedEvents-out-${ev.id}`,
              targetHandle: null,
              fractionalIndex,
            };
            nextEdges.push(newEdge);
            edgesChanged = true;
            newPendingEdgeUpserts.push(newEdge);
          }
        }
      });
    }

    if (changes.data?.consumedEvents) {
      const existingConsumeEdges = nextEdges.filter(
        (e) =>
          e.target === id && e.targetHandle?.startsWith("consumedEvents-in-"),
      );

      const currentEvents = changes.data.consumedEvents;

      // 1. Remove edges that are no longer referenced or changed
      existingConsumeEdges.forEach((edge) => {
        const eventId = edge.targetHandle?.replace("consumedEvents-in-", "");
        const ev = currentEvents.find((e) => e.id === eventId);
        if (
          !ev ||
          ev.targetNodeId !== edge.source ||
          ev.targetNodeId === "none"
        ) {
          nextEdges = nextEdges.filter((e) => e.id !== edge.id);
          edgesChanged = true;
          newPendingEdgeRemovals.push(edge.id);
        }
      });

      // 2. Add edges for newly selected targetNodeId
      currentEvents.forEach((ev: { id?: string; targetNodeId?: string }) => {
        if (ev.targetNodeId && ev.targetNodeId !== "none") {
          const hasEdge = existingConsumeEdges.some(
            (e) =>
              e.targetHandle === `consumedEvents-in-${ev.id}` &&
              e.source === ev.targetNodeId,
          );
          if (!hasEdge) {
            const lastEdgeIndex = getLastIndex(nextEdges);
            const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
            const newEdge: BackendEdge = {
              id: `edge-${Date.now()}-${ev.id}`,
              source: ev.targetNodeId,
              target: id,
              type: "message",
              sourceHandle: null,
              targetHandle: `consumedEvents-in-${ev.id}`,
              fractionalIndex,
            };
            nextEdges.push(newEdge);
            edgesChanged = true;
            newPendingEdgeUpserts.push(newEdge);
          }
        }
      });
    }

    if (updatedNode.type === "entity" && changes.data?.columns) {
      const currentCols = changes.data.columns;
      const allEntityNodes = next.filter((n) => n.type === "entity");

      // 1. Sync foreign-key edges where node `id` is the TARGET (referencing table)
      currentCols.forEach((col, colIdx) => {
        const existingEdgeIndices: number[] = [];
        nextEdges.forEach((e, idx) => {
          if (
            e.type === "foreign-key" &&
            e.target === id &&
            (e.targetHandle === `target-${colIdx}` ||
              e.targetHandle === `source-${colIdx}`)
          ) {
            existingEdgeIndices.push(idx);
          }
        });

        if (
          col.isForeignKey &&
          col.references?.table &&
          col.references?.column
        ) {
          const refNode = allEntityNodes.find(
            (n) => n.data.label === col.references?.table,
          );
          if (refNode && refNode.data.columns) {
            const refColIdx = refNode.data.columns.findIndex(
              (c) => c.name === col.references?.column,
            );
            if (refColIdx !== -1) {
              const expectedSourceHandle = `source-${refColIdx}`;
              const expectedTargetHandle = `target-${colIdx}`;
              const expectedSourceId = refNode.id;

              if (existingEdgeIndices.length > 0) {
                const primaryEdgeIdx = existingEdgeIndices[0]!;
                const existingEdge = nextEdges[primaryEdgeIdx]!;

                if (
                  existingEdge.source !== expectedSourceId ||
                  existingEdge.target !== id ||
                  existingEdge.sourceHandle !== expectedSourceHandle ||
                  existingEdge.targetHandle !== expectedTargetHandle
                ) {
                  const updatedEdge: BackendEdge = {
                    ...existingEdge,
                    source: expectedSourceId,
                    target: id,
                    sourceHandle: expectedSourceHandle,
                    targetHandle: expectedTargetHandle,
                  };
                  nextEdges[primaryEdgeIdx] = updatedEdge;
                  edgesChanged = true;
                  newPendingEdgeUpserts.push(updatedEdge);
                }

                for (let i = 1; i < existingEdgeIndices.length; i++) {
                  const staleIdx = existingEdgeIndices[i]!;
                  const staleEdge = nextEdges[staleIdx];
                  if (staleEdge) {
                    nextEdges = nextEdges.filter((e) => e.id !== staleEdge.id);
                    newPendingEdgeRemovals.push(staleEdge.id);
                    edgesChanged = true;
                  }
                }
              } else {
                const lastEdgeIndex = getLastIndex(nextEdges);
                const fractionalIndex = generateKeyBetween(lastEdgeIndex, null);
                const newEdge: BackendEdge = {
                  id: `edge-${Date.now()}-${colIdx}`,
                  source: expectedSourceId,
                  target: id,
                  type: "foreign-key",
                  sourceHandle: expectedSourceHandle,
                  targetHandle: expectedTargetHandle,
                  fractionalIndex,
                };
                nextEdges.push(newEdge);
                edgesChanged = true;
                newPendingEdgeUpserts.push(newEdge);
              }
            }
          }
        } else {
          if (existingEdgeIndices.length > 0) {
            existingEdgeIndices.forEach((edgeIdx) => {
              const edgeToRemove = nextEdges[edgeIdx];
              if (edgeToRemove) {
                nextEdges = nextEdges.filter((e) => e.id !== edgeToRemove.id);
                newPendingEdgeRemovals.push(edgeToRemove.id);
              }
            });
            edgesChanged = true;
          }
        }
      });

      // 2. Clean up foreign-key edges where handles point to indices that no longer exist on node `id`
      const maxColIdx = currentCols.length - 1;
      nextEdges.forEach((e) => {
        if (e.type === "foreign-key") {
          if (e.target === id && e.targetHandle) {
            const match = e.targetHandle.match(/^(?:source|target)-(\d+)$/);
            if (match) {
              const idx = parseInt(match[1]!, 10);
              if (idx > maxColIdx) {
                nextEdges = nextEdges.filter((edge) => edge.id !== e.id);
                newPendingEdgeRemovals.push(e.id);
                edgesChanged = true;
              }
            }
          }
          if (e.source === id && e.sourceHandle) {
            const match = e.sourceHandle.match(/^(?:source|target)-(\d+)$/);
            if (match) {
              const idx = parseInt(match[1]!, 10);
              if (idx > maxColIdx) {
                nextEdges = nextEdges.filter((edge) => edge.id !== e.id);
                newPendingEdgeRemovals.push(e.id);
                edgesChanged = true;
              }
            }
          }
        }
      });
    }

    BROKER_RESOURCE_KEYS.forEach((key) => {
      if (changes.data && key in changes.data) {
        const oldData = updatedNode.data as unknown as Record<string, unknown>;
        const newData = changes.data as unknown as Record<string, unknown>;
        const oldList = (Array.isArray(oldData[key]) ? oldData[key] : []) as Array<{ id: string }>;
        const newList = (Array.isArray(newData[key]) ? newData[key] : []) as Array<{ id: string }>;
        const newIds = new Set(newList.map((r) => r.id));
        const removedResourceIds = oldList
          .filter((r) => !newIds.has(r.id))
          .map((r) => r.id);

        if (removedResourceIds.length > 0) {
          removedResourceIds.forEach((resId) => {
            const removedForRes = nextEdges.filter(
              (edge) =>
                edge &&
                (edge.sourceResourceId === resId ||
                  edge.targetResourceId === resId ||
                  edge.sourceHandle?.includes(resId) ||
                  edge.targetHandle?.includes(resId)),
            );
            if (removedForRes.length > 0) {
              const ids = removedForRes.map((e) => e.id);
              nextEdges = nextEdges.filter((e) => !ids.includes(e.id));
              edgesChanged = true;
              newPendingEdgeRemovals.push(...ids);
            }
          });
        }
      }
    });

    const update: Partial<BackendCanvasState> = {
      nodes: next,
      pendingNodeUpserts: [...get().pendingNodeUpserts, updated],
      ...(edgesChanged ? { edges: nextEdges } : {}),
      ...(newPendingEdgeRemovals.length > 0
        ? {
            pendingEdgeRemovals: [
              ...get().pendingEdgeRemovals,
              ...newPendingEdgeRemovals,
            ],
          }
        : {}),
      ...(newPendingEdgeUpserts.length > 0
        ? {
            pendingEdgeUpserts: [
              ...get().pendingEdgeUpserts,
              ...newPendingEdgeUpserts,
            ],
          }
        : {}),
    };
    set(update);
  },

  deleteNode: (id) => {
    useSectionCollapseStore.getState().deleteNodeCollapseState(id);
    const currentState = get();
    const nodeToDelete = currentState.nodes.find((n) => n.id === id);
    const isSchema =
      nodeToDelete?.type === "entity" ||
      nodeToDelete?.type === "database" ||
      nodeToDelete?.type === "group" ||
      nodeToDelete?.type === "redis_instance" ||
      nodeToDelete?.type === "redis_schema";
    currentState.pushHistorySnapshot(isSchema ? "schema" : "graph");

    try {
      const testCases = useSimulationStore.getState().testCases || [];
      const diff = computeNodeDeletionDiff(
        currentState.nodes,
        currentState.endpoints,
        currentState.events,
        currentState.edges,
        testCases,
        "Dezign2App Monorepo",
        [id],
      );
      void handleNodeDeletionSync(currentState.projectId || "", diff);
    } catch (e) {
      console.error("[deleteNode] Failed to compute deletion diff:", e);
    }

    const updates = cleanupDeletedNodesState(currentState, [id]);
    set(updates);
  },

  deleteNodes: (ids) => {
    if (!ids || ids.length === 0) return;
    useSectionCollapseStore.getState().deleteNodeCollapseState(ids);
    const currentState = get();
    const isSchema = currentState.nodes.some(
      (n) =>
        ids.includes(n.id) &&
        (n.type === "entity" ||
          n.type === "database" ||
          n.type === "group" ||
          n.type === "redis_instance" ||
          n.type === "redis_schema"),
    );
    currentState.pushHistorySnapshot(isSchema ? "schema" : "graph");

    try {
      const testCases = useSimulationStore.getState().testCases || [];
      const diff = computeNodeDeletionDiff(
        currentState.nodes,
        currentState.endpoints,
        currentState.events,
        currentState.edges,
        testCases,
        "Dezign2App Monorepo",
        ids,
      );
      void handleNodeDeletionSync(currentState.projectId || "", diff);
    } catch (e) {
      console.error("[deleteNodes] Failed to compute deletion diff:", e);
    }

    const updates = cleanupDeletedNodesState(currentState, ids);
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
});
